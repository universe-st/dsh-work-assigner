import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  IMAGE_FORWARD_TURNS,
  appendImageFallbackNote,
  imageRefsOf,
  isImageAdmissionFailure,
  prepareCodexImages,
  promptContentWithImages,
  selectForwardImages,
  staleForwardImageCount,
  trackUserImages,
} from '../lib/images.js';

/** 一张 1x1 PNG 的字节：够真实附件校验认格式。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const ref = (id, mediaType = 'image/png') => ({
  attachmentId: `sha256:${id}`,
  mediaType,
  bytes: PNG.byteLength,
  width: 1,
  height: 1,
});

test('imageRefsOf collects image refs in order and skips duplicates', () => {
  const first = ref('a'.repeat(64), 'image/png');
  const second = ref('b'.repeat(64), 'image/jpeg');
  const message = {
    content: [
      { type: 'text', text: '按这张图改' },
      { type: 'image', attachment: first },
      { type: 'image', attachment: { ...first } },
      { type: 'image', attachment: second },
      { type: 'image' },
      { type: 'file', attachment: { attachmentId: 'sha256:file' } },
      null,
    ],
  };
  assert.deepEqual(imageRefsOf(message), [first, second]);
  assert.deepEqual(imageRefsOf(undefined), []);
  assert.deepEqual(imageRefsOf({ content: 'nope' }), []);
});

test('trackUserImages remembers the latest image-bearing user message per session', () => {
  const runtime = { currentTurn: new Map([['manager', 3]]) };
  const session = { id: 'manager' };
  trackUserImages(runtime, session, { type: 'turn/start', data: { turn: 3 } });
  trackUserImages(runtime, session, {
    type: 'user/message',
    data: { content: [{ type: 'image', attachment: ref('c'.repeat(64)) }] },
  });
  assert.equal(runtime.userImages.get('manager').images.length, 1);
  assert.equal(runtime.userImages.get('manager').turn, 3);

  // 纯文本用户消息（包括插件注入的汇报）不覆盖已记住的图片。
  trackUserImages(runtime, session, {
    type: 'user/message',
    data: { content: [{ type: 'text', text: '【派活系统回报】任务完成。' }] },
  });
  assert.equal(runtime.userImages.get('manager').images.length, 1);
});

test('selectForwardImages forwards recent images and respects the opt-out', () => {
  const image = ref('d'.repeat(64));
  const runtime = {
    currentTurn: new Map([['manager', 5]]),
    userImages: new Map([['manager', { turn: 3, at: 0, images: [image] }]]),
  };

  // 本轮 / 窗口内：转发。
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'auto'), [image]);
  runtime.currentTurn.set('manager', 3 + IMAGE_FORWARD_TURNS);
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'auto'), [image]);

  // 超出窗口：不转发。
  runtime.currentTurn.set('manager', 4 + IMAGE_FORWARD_TURNS);
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'auto'), []);

  // 经理显式关掉。
  runtime.currentTurn.set('manager', 5);
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'none'), []);

  // 没有图片记录。
  assert.deepEqual(selectForwardImages({}, 'manager', 'auto'), []);
});

test('selectForwardImages forwards when the turn number is unknown', () => {
  const image = ref('e'.repeat(64));
  const runtime = { userImages: new Map([['manager', { at: 0, images: [image] }]]) };
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'auto'), [image]);
});

test('selectForwardImages supports explicit older-image forwarding', () => {
  const image = ref('9'.repeat(64));
  const runtime = {
    currentTurn: new Map([['manager', 20]]),
    userImages: new Map([['manager', { turn: 2, at: 0, images: [image] }]]),
  };
  // auto 会因窗口丢掉旧图，latest 由经理显式取回。
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'auto'), []);
  assert.deepEqual(selectForwardImages(runtime, 'manager', 'latest'), [image]);
  assert.equal(staleForwardImageCount(runtime, 'manager'), 1);
  runtime.currentTurn.set('manager', 2);
  assert.equal(staleForwardImageCount(runtime, 'manager'), 0);
});

test('promptContentWithImages builds native image blocks after the task text', () => {
  const image = { ...ref('f'.repeat(64)), bytes: 1234 };
  const content = promptContentWithImages('任务书', [image]);
  assert.equal(content.length, 2);
  assert.deepEqual(content[0], { type: 'text', text: '任务书' });
  assert.equal(content[1].type, 'image');
  assert.equal(content[1].attachment, image);
  assert.equal(content[1].encodedBytes, 1234);
});

test('appendImageFallbackNote tells the engineer the images were dropped', () => {
  const text = appendImageFallbackNote('任务书', 2);
  assert.match(text, /任务书/);
  assert.match(text, /2 张图片/);
  assert.match(text, /没有送达/);
});

test('isImageAdmissionFailure only claims image-specific failures', () => {
  const withCode = new Error('Model "x" does not support image input.');
  withCode.code = 'session/attachment-invalid';
  assert.equal(isImageAdmissionFailure(withCode), true);
  assert.equal(isImageAdmissionFailure(new Error('session/agent-busy prompt rejected')), false);
  assert.equal(isImageAdmissionFailure(new Error('Image batch exceeds the configured image-count limit.')), true);
  assert.equal(isImageAdmissionFailure(undefined), false);
});

test('prepareCodexImages copies attachments into extension-bearing temp files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paihuo-images-src-'));
  try {
    const image = ref('1'.repeat(64));
    writeFileSync(join(root, '1'.repeat(64)), PNG);
    const runtime = {
      ctx: {
        get: (name) => (name === 'attachments'
          ? { imageHostPath: (entry) => join(root, String(entry.attachmentId).replace('sha256:', '')) }
          : undefined),
      },
    };
    const prepared = await prepareCodexImages(runtime, [image, ref('2'.repeat(64), 'image/svg+xml')]);
    assert.equal(prepared.paths.length, 1, 'unsupported media types are skipped');
    assert.equal(prepared.skipped, 1);
    assert.match(prepared.paths[0], /image-1\.png$/);
    assert.deepEqual(readFileSync(prepared.paths[0]), PNG);
    const directory = join(prepared.paths[0], '..');
    await prepared.cleanup();
    assert.equal(existsSync(directory), false, 'cleanup removes the temp directory');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepareCodexImages reports missing attachment service instead of throwing', async () => {
  const prepared = await prepareCodexImages({ ctx: { get: () => undefined } }, [ref('3'.repeat(64))]);
  assert.deepEqual(prepared.paths, []);
  assert.equal(prepared.skipped, 1);
  await prepared.cleanup();
});
