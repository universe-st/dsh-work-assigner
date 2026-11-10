/**
 * 用户图片 → 工程师。
 *
 * DSH 把用户上传的图片规范化后存进附件库（`~/.dsh/attachments/v1/objects`），
 * 用户消息里留下的是 `{ type: 'image', attachment: ImageAttachmentRef }` 引用。
 * 派活工具原本只把文本任务书发给工程师，图片引用就留在经理会话里：
 * 工程师看不到用户在聊天里贴的截图，也就无从「按图改」。
 *
 * 这里负责把图片接上，两种后端各走一条路：
 * - 会话工程师：把同一份附件引用放进工程师的任务消息（DSH 原生图片块，视觉模型直接看）；
 * - Codex 工程师：附件对象按内容寻址、没有扩展名，先落成带扩展名的临时文件，
 *   再用 `codex exec -i/--image` 附在任务 prompt 上。
 */

import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `images: "auto"` 的取图窗口：允许的最大回合差。
 *
 * 值是 2 = 本轮 + 之前两轮用户消息。用户经常先发图、再回答经理一两个追问之后
 * 才派发，窗口太窄会丢图；太长又可能把早已无关的旧图重复塞给工程师。
 * 派发时也可以用 `images: "none"` 关掉、用 `images: "latest"` 显式取回旧图。
 */
export const IMAGE_FORWARD_TURNS = 2;

/** 附件引用里出现过的图片格式 → Codex 需要的文件扩展名。 */
const IMAGE_EXTENSIONS = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
});

function now() {
  return Date.now();
}

/**
 * 一条消息里的图片引用（按附件 id 去重，保持出现顺序）。
 *
 * @param {object} message 用户消息（`event.data` 或会话里的消息对象）。
 * @returns {object[]} 规范化附件引用。
 */
export function imageRefsOf(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  const refs = [];
  const seen = new Set();
  for (const block of content) {
    if (block === null || typeof block !== 'object' || block.type !== 'image') continue;
    const ref = block.attachment;
    if (ref === null || typeof ref !== 'object') continue;
    const id = typeof ref.attachmentId === 'string' ? ref.attachmentId : '';
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    refs.push(ref);
  }
  return refs;
}

/**
 * 记录会话最近一条带图用户消息。
 *
 * 插件注入的回报/提醒消息都是纯文本，不会覆盖这里的记录；`turn` 用来在派发时
 * 判断图片是否还够新（`user/message` 事件本身不带回合号，取当前 `turn/start`）。
 *
 * @param {object} runtime 插件运行时。
 * @param {object} session 会话。
 * @param {object} event 会话事件。
 */
export function trackUserImages(runtime, session, event) {
  if (session === undefined || session === null) return;
  if (event?.type !== 'user/message') return;
  const images = imageRefsOf(event.data);
  if (images.length === 0) return;
  const map = runtime.userImages ?? (runtime.userImages = new Map());
  const turn = runtime.currentTurn?.get(session.id);
  map.set(session.id, {
    images,
    at: now(),
    ...(Number.isInteger(turn) ? { turn } : {}),
  });
}

/**
 * 派发时选出要转发给工程师的图片。
 *
 * @param {object} runtime 插件运行时。
 * @param {string} sessionId 经理会话 id。
 * @param {'auto'|'latest'|'none'} [mode] `none` 不转；`latest` 忽略轮次窗口，
 *   取最近一条带图用户消息（经理确认相关的旧图时用）。
 * @returns {object[]} 规范化附件引用；没有可转的图片时为空数组。
 */
export function selectForwardImages(runtime, sessionId, mode) {
  if (mode === 'none') return [];
  const entry = runtime.userImages?.get(sessionId);
  if (entry === undefined || !Array.isArray(entry.images) || entry.images.length === 0) return [];
  if (mode === 'latest') return [...entry.images];
  const current = runtime.currentTurn?.get(sessionId);
  if (Number.isInteger(current) && Number.isInteger(entry.turn) && current - entry.turn > IMAGE_FORWARD_TURNS) {
    return [];
  }
  return [...entry.images];
}

/**
 * 是否有「太旧、这次没转发」的用户图片。
 *
 * 派发回执用它提醒经理：确实需要那张图时，用 `images: "latest"` 重新派发。
 *
 * @param {object} runtime 插件运行时。
 * @param {string} sessionId 经理会话 id。
 * @returns {number} 被窗口挡掉的图片数量；没有则为 0。
 */
export function staleForwardImageCount(runtime, sessionId) {
  const entry = runtime.userImages?.get(sessionId);
  if (entry === undefined || !Array.isArray(entry.images) || entry.images.length === 0) return 0;
  const current = runtime.currentTurn?.get(sessionId);
  if (!Number.isInteger(current) || !Number.isInteger(entry.turn)) return 0;
  return current - entry.turn > IMAGE_FORWARD_TURNS ? entry.images.length : 0;
}

/**
 * 会话工程师的任务消息内容：文本任务书 + 原生图片块。
 *
 * `encodedBytes` 让附件服务按原上传体积计入单条消息的图片配额；
 * 引用本身由 `admitPromptContent` 原样透传，不会再次落盘。
 *
 * @param {string} text 任务全文。
 * @param {object[]} images 规范化附件引用。
 * @returns {object[]} 提示消息 content 数组。
 */
export function promptContentWithImages(text, images) {
  const content = [{ type: 'text', text: String(text ?? '') }];
  for (const ref of images ?? []) {
    content.push({
      type: 'image',
      attachment: ref,
      encodedBytes: typeof ref?.bytes === 'number' && Number.isFinite(ref.bytes) ? ref.bytes : 0,
    });
  }
  return content;
}

/**
 * 图片没能送达时补进任务书的说明。
 *
 * 宁可让工程师知道「有图但没看到」，也不要它凭空想象图片内容然后报成功。
 *
 * @param {string} text 任务全文。
 * @param {number} count 未能送达的图片数量。
 * @returns {string} 追加了图片说明的任务全文。
 */
export function appendImageFallbackNote(text, count) {
  return [
    text,
    '',
    '## 图片',
    `- 用户随任务发了 ${count} 张图片，但当前工程师模型不接受图片输入，图片没有送达。`,
    '- 如果任务依赖图片里的内容，请在报告里写明需要支持图片输入的模型，或请经理把关键信息补成文字。',
  ].join('\n');
}

/**
 * 判断失败是不是「图片不被接受」。
 *
 * 只有这种情况才值得退回纯文本重发：会话忙、权限、项目不存在等失败重发也没用。
 *
 * @param {unknown} error 捕获到的错误。
 * @returns {boolean} 是否属于图片准入失败。
 */
export function isImageAdmissionFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'session/attachment-invalid' || code === 'session/attachment-unsupported') return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  // 只有带图片投递时才会问这个问题；消息里提到图片/附件就按图片准入失败处理。
  return /attachment|image/i.test(message);
}

/**
 * 为 Codex 工程师准备图片文件。
 *
 * 附件对象没有扩展名，而 Codex CLI 需要按图片格式读文件；复制到系统临时目录并
 * 补上扩展名，任务轮次结束后统一清理。任何一张失败都只跳过它，不拖垮任务。
 *
 * @param {object} runtime 插件运行时。
 * @param {object[]} refs 规范化附件引用。
 * @returns {Promise<{paths: string[], skipped: number, cleanup: () => Promise<void>}>} 临时文件与清理函数。
 */
export async function prepareCodexImages(runtime, refs) {
  const list = Array.isArray(refs) ? refs : [];
  const noop = async () => {};
  if (list.length === 0) return { paths: [], skipped: 0, cleanup: noop };
  const attachments = runtime.ctx?.get?.('attachments') ?? runtime.ctx?.attachments;
  if (attachments === undefined || attachments === null) {
    return { paths: [], skipped: list.length, cleanup: noop };
  }
  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), 'paihuo-images-'));
  } catch {
    return { paths: [], skipped: list.length, cleanup: noop };
  }
  const paths = [];
  let skipped = 0;
  for (const [index, ref] of list.entries()) {
    const mediaType = typeof ref?.mediaType === 'string' ? ref.mediaType : '';
    const extension = IMAGE_EXTENSIONS[mediaType];
    if (extension === undefined) {
      skipped += 1;
      continue;
    }
    const destination = join(dir, `image-${index + 1}${extension}`);
    try {
      const hostPath = typeof attachments.imageHostPath === 'function'
        ? attachments.imageHostPath(ref)
        : undefined;
      if (typeof hostPath === 'string' && hostPath !== '') {
        await copyFile(hostPath, destination);
      } else if (typeof attachments.readImage === 'function') {
        const stored = await attachments.readImage(ref);
        await writeFile(destination, Buffer.from(stored?.data ?? []));
      } else {
        throw new Error('附件服务无法读取图片');
      }
      paths.push(destination);
    } catch {
      skipped += 1;
    }
  }
  return {
    paths,
    skipped,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
