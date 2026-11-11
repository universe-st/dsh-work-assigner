/**
 * 工程师对话转录：经理用 `paihuo_transcript` 判断工程师此刻在做什么。
 *
 * 两种后端的「当前对话」来源不同：
 * - 会话工程师：DSH 会话事件（`user/message` / `assistant/message` /
 *   `tool/call` / `tool/result`）。优先读本进程里的 Session（`snapshotEvents`），
 *   插件重载后会话不在内存里时退回 `sessionController.inspect()` 读持久化事件。
 * - Codex 工程师：没有 DSH 会话，读插件自己记录的 CLI 转录
 *   （`lib/codexTranscripts.js`，由 `runtime.codexUi` 提供）。
 *
 * 这里只做「事件 → 可读条目」的规范化与取尾；权限判断、渲染与错误提示在
 * `lib/tasks.js`。只取最近若干条、并对每条正文限长：经理要的是进度，不是全文；
 * 完整结果仍应由工程师用 `paihuo_report` / `paihuo_message` 回复。
 */

import { backendOf } from './policy.js';
import { BACKEND_CODEX } from './wire.js';

/** 默认返回条数。一次好几十条会把经理上下文塞满，而进度主要看最近几步。 */
export const TRANSCRIPT_DEFAULT_LIMIT = 12;
/** 单次最多返回条数。 */
export const TRANSCRIPT_MAX_LIMIT = 40;

/** 每条正文的字符上限（超出截断，保留开头）。 */
const USER_CHARS = 500;
const ASSISTANT_CHARS = 1000;
const TOOL_CHARS = 200;
const ERROR_CHARS = 160;

/** 工具参数里最像「进度」的字段，按顺序找第一个非空字符串。 */
const ARGUMENT_KEYS = Object.freeze([
  'command',
  'cmd',
  'path',
  'file_path',
  'pattern',
  'query',
  'url',
  'prompt',
  'summary',
  'description',
  'task',
  'message',
  'name',
]);

function clip(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function oneLine(text, max) {
  return clip(String(text ?? '').replace(/\s+/g, ' ').trim(), max);
}

/** 一条消息里的可见文本（含嵌套 tool-result 的文本），忽略 reasoning/图片等块。 */
export function contentText(content) {
  const parts = [];
  for (const block of Array.isArray(content) ? content : []) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'tool-result') parts.push(contentText(block.content));
  }
  return parts.filter((part) => part !== '').join('\n').trim();
}

/**
 * 工具参数摘要：`tool/call` 事件里 `arguments` 是模型产出的原始 JSON 字符串
 * （未解析），解析后优先取命令、路径、查询等字段，解析失败就直接截断原文。
 */
export function argumentDigest(value) {
  let args = value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (raw === '') return '';
    try {
      args = JSON.parse(raw);
    } catch {
      return oneLine(raw, TOOL_CHARS);
    }
  }
  if (args === null || args === undefined) return '';
  if (typeof args !== 'object') return oneLine(args, TOOL_CHARS);
  for (const key of ARGUMENT_KEYS) {
    const candidate = args[key];
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return oneLine(candidate, TOOL_CHARS);
    }
  }
  try {
    return oneLine(JSON.stringify(args), TOOL_CHARS);
  } catch {
    return '';
  }
}

/** 用户消息的角色前缀：派活任务书 / 经理补充 / 系统注入，其余按用户。 */
function userLabel(text) {
  if (text.startsWith('【派活任务')) return '任务书';
  if (text.startsWith('【经理补充')) return '经理补充';
  if (text.startsWith('【派活系统')) return '派活系统';
  return '用户';
}

/** 工具结果是不是失败：宿主 0.2 把 isError 放在消息上，事件上还可能带 error。 */
function toolResultFailed(data) {
  if (data?.error !== undefined) return true;
  if (data?.message?.isError === true) return true;
  const content = Array.isArray(data?.message?.content) ? data.message.content : [];
  return content.some((block) => block?.type === 'tool-result' && block.isError === true);
}

/**
 * 会话事件 → 转录条目。
 *
 * 只保留能说明「在做什么」的事件：双方发言、工具调用、失败的工具结果。
 * 工具输出全文不进来：它们通常很长，而且经理判断进度只需要「跑了什么」。
 *
 * @param {object[]} events 会话事件（按 seq 升序）。
 * @returns {{kind: string, label: string, text: string}[]} 条目。
 */
export function transcriptEntriesFromEvents(events) {
  const entries = [];
  for (const event of Array.isArray(events) ? events : []) {
    try {
      const data = event?.data;
      if (event?.type === 'user/message') {
        const text = contentText(data?.content);
        if (text === '') continue;
        entries.push({ kind: 'user', label: userLabel(text), text: clip(text, USER_CHARS) });
        continue;
      }
      if (event?.type === 'assistant/message') {
        if (data?.interrupted === true) continue;
        const text = contentText(data?.message?.content);
        if (text === '') continue;
        entries.push({ kind: 'assistant', label: '工程师', text: clip(text, ASSISTANT_CHARS) });
        continue;
      }
      if (event?.type === 'tool/call') {
        const name = typeof data?.name === 'string' && data.name !== '' ? data.name : '工具';
        entries.push({ kind: 'tool', label: name, text: argumentDigest(data?.arguments) });
        continue;
      }
      if (event?.type === 'tool/result') {
        if (!toolResultFailed(data)) continue;
        const text = contentText(data?.message?.content) || data?.error?.name || '工具返回错误';
        entries.push({ kind: 'error', label: '错误', text: clip(text, ERROR_CHARS) });
      }
    } catch {
      /* 单条事件异常不影响整段转录 */
    }
  }
  return entries;
}

/** 从运行中的 Session 取事件；拿不到时返回 undefined，交给持久化事件兜底。 */
function liveEvents(runtime, sessionId) {
  let session;
  try {
    session = runtime.ctx.sessions?.get?.(sessionId);
  } catch {
    session = undefined;
  }
  if (session === undefined || session === null) return undefined;
  try {
    if (typeof session.snapshotEvents === 'function') return session.snapshotEvents();
    // 测试 harness 与旧版 Session 直接暴露 events 数组。
    if (Array.isArray(session.events)) return session.events;
  } catch {
    /* 快照失败：退回持久化事件 */
  }
  return undefined;
}

/** 会话已不在内存时，读 sessionController 持久化的会话事件。 */
async function persistedEvents(runtime, sessionId) {
  try {
    const inspection = await runtime.ctx.get('sessionController')?.inspect(sessionId);
    return Array.isArray(inspection?.events) ? inspection.events : undefined;
  } catch {
    return undefined;
  }
}

/** 最后兜底：只有 deriveMessages 可用时，至少给出双方文本。 */
function messageEntries(runtime, sessionId) {
  let session;
  try {
    session = runtime.ctx.sessions?.get?.(sessionId);
  } catch {
    session = undefined;
  }
  if (session === undefined || typeof session.deriveMessages !== 'function') return [];
  let messages;
  try {
    messages = session.deriveMessages();
  } catch {
    return [];
  }
  const entries = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    try {
      const text = contentText(message?.content);
      if (text === '') continue;
      if (message.role === 'user') entries.push({ kind: 'user', label: userLabel(text), text: clip(text, USER_CHARS) });
      else if (message.role === 'assistant') entries.push({ kind: 'assistant', label: '工程师', text: clip(text, ASSISTANT_CHARS) });
    } catch {
      /* 单条消息异常忽略 */
    }
  }
  return entries;
}

/** Codex 工程师：读插件记录的 CLI 转录。 */
function codexEntries(runtime, engineer) {
  let transcript;
  try {
    transcript = runtime.codexUi?.transcript?.(engineer.managerId, engineer.sessionId);
  } catch {
    transcript = undefined;
  }
  const list = Array.isArray(transcript?.entries) ? transcript.entries : [];
  const entries = [];
  for (const entry of list) {
    try {
      const kind = entry?.kind === 'command' ? 'tool' : entry?.kind;
      if (kind === 'tool') {
        const command = oneLine(entry.command ?? entry.text, TOOL_CHARS);
        const exit = typeof entry.exitCode === 'number' ? `（exit ${entry.exitCode}）` : '';
        entries.push({ kind: 'tool', label: '命令', text: `${command}${exit}`.trim() });
        continue;
      }
      const text = String(entry?.text ?? '').trim();
      if (text === '') continue;
      if (kind === 'user') entries.push({ kind: 'user', label: entry.label ?? '用户', text: clip(text, USER_CHARS) });
      else if (kind === 'assistant') entries.push({ kind: 'assistant', label: entry.label ?? 'Codex', text: clip(text, ASSISTANT_CHARS) });
      else if (kind === 'error') entries.push({ kind: 'error', label: '错误', text: clip(text, ERROR_CHARS) });
      else entries.push({ kind: 'note', label: entry.label ?? '备注', text: clip(text, USER_CHARS) });
    } catch {
      /* 单条异常忽略 */
    }
  }
  return entries;
}

/**
 * 把传入的 limit 规整到允许区间。
 *
 * @param {unknown} value 模型传入的值。
 * @returns {number} 实际条数。
 */
export function normalizeTranscriptLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return TRANSCRIPT_DEFAULT_LIMIT;
  return Math.min(Math.floor(number), TRANSCRIPT_MAX_LIMIT);
}

/**
 * 读取一个工程师最近的对话条目。
 *
 * @param {object} runtime 插件运行时。
 * @param {object} engineer 工程师记录（已由调用方校验归属）。
 * @param {{limit?: unknown, includeTools?: boolean}} [options] 取条与过滤选项。
 * @returns {Promise<{entries: object[], total: number}>} 取尾后的条目与总量。
 */
export async function readEngineerTranscript(runtime, engineer, options = {}) {
  const limit = normalizeTranscriptLimit(options.limit);
  const includeTools = options.includeTools !== false;
  let all;
  if (backendOf(engineer) === BACKEND_CODEX) {
    all = codexEntries(runtime, engineer);
  } else {
    const live = liveEvents(runtime, engineer.sessionId);
    if (live !== undefined) {
      all = transcriptEntriesFromEvents(live);
    } else {
      const persisted = await persistedEvents(runtime, engineer.sessionId);
      all = persisted === undefined
        ? messageEntries(runtime, engineer.sessionId)
        : transcriptEntriesFromEvents(persisted);
    }
  }
  const visible = includeTools ? all : all.filter((entry) => entry.kind !== 'tool' && entry.kind !== 'error');
  return { total: visible.length, entries: visible.slice(-limit) };
}
