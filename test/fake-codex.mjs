#!/usr/bin/env node
/**
 * 测试用假 Codex CLI：模拟 `--version`、`exec resume --help` 和
 * `exec` / `exec resume` 的 JSONL 输出。测试通过环境变量控制行为：
 * - PAIHUO_FAKE_CODEX_LOG：每次执行的 JSON 日志路径。
 * - PAIHUO_FAKE_CODEX_THREAD：新会话线程 id（默认固定值）。
 *
 * Prompt 里的标记：
 * - PAIHUO_FAKE_FAIL：输出 turn.failed 并以 1 退出。
 * - PAIHUO_FAKE_HANG：不返回，直到被测试取消。
 * - PAIHUO_FAKE_DELAY_MS=<n>：延迟 n 毫秒后返回。
 * - PAIHUO_FAKE_LINGER=<n>：回报 turn.completed 后继续存活 n 毫秒（模拟
 *   常驻子进程攥住 stdio、父进程已经报完却收不到 close 的情形）。
 * - PAIHUO_FAKE_ORPHAN=<n>：回报 turn.completed 后派生一个存活 n 毫秒的
 *   孙子进程（stdio 继承），自己立刻退出，复现「进程已退、stdio 未关」。
 */

import { appendFileSync, existsSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const logPath = process.env.PAIHUO_FAKE_CODEX_LOG;

function log(value) {
  if (typeof logPath !== 'string' || logPath === '') return;
  try {
    appendFileSync(logPath, `${JSON.stringify(value)}\n`);
  } catch {
    /* 测试日志失败不影响假 CLI */
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      text += chunk;
    });
    process.stdin.on('end', () => resolve(text));
  });
}

if (args.includes('--version')) {
  process.stdout.write('codex-cli 0.167.0\n');
  process.exit(0);
}

if (args.includes('exec') && args.includes('resume') && args.includes('--help')) {
  process.stdout.write('Usage: codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]\n');
  process.exit(0);
}

if (args.includes('debug') && args.includes('models')) {
  process.stdout.write(`${JSON.stringify({
    models: [
      {
        slug: 'gpt-test-codex',
        display_name: 'GPT Test Codex',
        description: 'test model',
        visibility: 'list',
        default_reasoning_level: 'medium',
        supported_reasoning_levels: [
          { effort: 'low', description: 'fast' },
          { effort: 'medium', description: 'balanced' },
          { effort: 'high', description: 'deep' },
        ],
        input_modalities: ['text', 'image'],
      },
      {
        slug: 'gpt-text-only',
        display_name: 'GPT Text Only',
        description: 'test model without image input',
        visibility: 'list',
        input_modalities: ['text'],
      },
      { slug: 'gpt-hidden', display_name: 'Hidden', description: 'hidden model', visibility: 'hide' },
    ],
  })}\n`);
  process.exit(0);
}

const resumeIndex = args.indexOf('resume');
const isResume = args.includes('exec') && resumeIndex >= 0 && !args.includes('--help');
const sessionId = isResume && typeof args[resumeIndex + 1] === 'string'
  ? args[resumeIndex + 1]
  : (process.env.PAIHUO_FAKE_CODEX_THREAD ?? 'fake-thread-1');
const prompt = await readStdin();
// `-i/--image` 附带的图片文件：记录路径是否真的存在，供测试断言。
const imagePaths = [];
for (const [index, arg] of args.entries()) {
  if (arg !== '-i' && arg !== '--image') continue;
  const value = args[index + 1];
  if (typeof value === 'string') imagePaths.push(value);
}
log({
  kind: 'run',
  resume: isResume,
  sessionId,
  args,
  cwd: process.cwd(),
  prompt,
  images: imagePaths.map((path) => ({
    path,
    exists: existsSync(path),
    bytes: existsSync(path) ? statSync(path).size : 0,
  })),
});

const delayMatch = /PAIHUO_FAKE_DELAY_MS=(\d+)/.exec(prompt);
const delay = delayMatch === null ? 0 : Number(delayMatch[1]);
if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

if (prompt.includes('PAIHUO_FAKE_HANG')) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: sessionId })}\n`);
if (prompt.includes('PAIHUO_FAKE_FAIL')) {
  process.stdout.write(`${JSON.stringify({
    type: 'turn.failed',
    error: { message: 'fake codex failure (PAIHUO_FAKE_FAIL)' },
  })}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ type: 'turn.started' })}\n`);
process.stdout.write(`${JSON.stringify({
  type: 'item.completed',
  item: { id: 'item_1', type: 'command_execution', command: 'echo fake', aggregated_output: 'fake output\n', exit_code: 0, status: 'completed' },
})}\n`);
const text = isResume
  ? `FAKE_CODEX_RESUMED ${prompt.slice(0, 120)}`
  : `FAKE_CODEX_OK ${prompt.slice(0, 120)}`;
process.stdout.write(`${JSON.stringify({
  type: 'item.completed',
  item: { id: 'item_2', type: 'agent_message', text },
})}\n`);
process.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })}\n`);

const lingerMatch = /PAIHUO_FAKE_LINGER=(\d+)/.exec(prompt);
const linger = lingerMatch === null ? 0 : Number(lingerMatch[1]);
if (linger > 0) await new Promise((resolve) => setTimeout(resolve, linger));

const orphanMatch = /PAIHUO_FAKE_ORPHAN=(\d+)/.exec(prompt);
const orphan = orphanMatch === null ? 0 : Number(orphanMatch[1]);
if (orphan > 0) {
  const { spawn } = await import('node:child_process');
  // 模拟 Codex 留下的守护进程：继承 stdio 后自己活很久，父进程照常退出。
  const keeper = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${orphan})`], {
    stdio: 'inherit',
    detached: true,
    windowsHide: true,
  });
  keeper.unref();
}

process.exit(0);
