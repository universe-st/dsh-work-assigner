/**
 * 直接调用本机 Codex CLI。
 *
 * 使用 `codex exec --json` 执行一轮，使用 `codex exec resume <thread_id>`
 * 续接同一会话；stdout 是 JSONL，插件在这里解析出 thread id、最终回答、
 * 命令执行摘要与错误。所有任务文本都走 stdin，不拼进命令行。
 */

import { spawn, spawnSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const MAX_LINE_CHARS = 2 * 1024 * 1024;
const MAX_STDERR_CHARS = 16 * 1024;
const CLI_CHECK_TIMEOUT_MS = 20_000;
const CANCEL_FALLBACK_MS = 5_000;
const DEFAULT_COMPLETION_GRACE_MS = 120_000;

function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? '未知错误');
}

function commandSpec(runtime) {
  const config = runtime.config ?? {};
  const command = typeof config.codexCommand === 'string' && config.codexCommand.trim() !== ''
    ? config.codexCommand.trim()
    : 'codex';
  const args = Array.isArray(config.codexCommandArgs)
    ? config.codexCommandArgs.map((entry) => String(entry))
    : [];
  return { command, args };
}

function quoteWindows(value) {
  const text = String(value);
  if (text === '') return '""';
  if (!/[ \t"&|<>^]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function needsWindowsShell(command) {
  return process.platform === 'win32' && !/\.exe$/i.test(command);
}

function spawnCli(command, args, options) {
  if (needsWindowsShell(command)) {
    const line = [command, ...args].map(quoteWindows).join(' ');
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', line], {
      ...options,
      windowsHide: true,
    });
  }
  return spawn(command, args, { ...options, windowsHide: true });
}

function spawnCliSync(command, args, options) {
  if (needsWindowsShell(command)) {
    const line = [command, ...args].map(quoteWindows).join(' ');
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', line], {
      ...options,
      windowsHide: true,
    });
  }
  return spawnSync(command, args, { ...options, windowsHide: true });
}

/** 只读探测 CLI 是否存在、版本，以及是否支持 `exec resume`。 */
export function checkCodexCli(runtime) {
  const { command, args } = commandSpec(runtime);
  const common = {
    encoding: 'utf8',
    timeout: CLI_CHECK_TIMEOUT_MS,
    env: process.env,
  };
  try {
    const version = spawnCliSync(command, [...args, '--version'], common);
    if (version.error !== undefined && version.error !== null) {
      return {
        ok: false,
        command,
        version: null,
        canResume: false,
        error: `无法执行 ${command} --version：${describeError(version.error)}`,
      };
    }
    const versionText = String(version.stdout ?? '').trim();
    if (version.status !== 0) {
      const detail = (String(version.stderr ?? '').trim() || `退出码 ${version.status}`).slice(0, 800);
      return { ok: false, command, version: versionText || null, canResume: false, error: detail };
    }
    const resume = spawnCliSync(command, [...args, 'exec', 'resume', '--help'], common);
    if (resume.error !== undefined && resume.error !== null) {
      return {
        ok: false,
        command,
        version: versionText || null,
        canResume: false,
        error: `无法读取 codex exec resume 帮助：${describeError(resume.error)}`,
      };
    }
    const resumeText = `${resume.stdout ?? ''}${resume.stderr ?? ''}`;
    const canResume = resume.status === 0 && /resume/i.test(resumeText);
    return {
      ok: true,
      command,
      version: versionText || null,
      canResume,
      error: canResume ? null : 'Codex CLI 版本不支持 codex exec resume；请升级 Codex CLI。',
    };
  } catch (error) {
    return { ok: false, command, version: null, canResume: false, error: describeError(error) };
  }
}

/** Codex 模式的前置检查；结果按 runtime 缓存，配置刷新时清空。 */
export function assertCodexCli(runtime) {
  const cached = runtime.codexCli;
  if (cached !== undefined && cached !== null) {
    if (cached.ok !== true) {
      throw new Error(`Codex CLI 不可用（${cached.command}）：${cached.error ?? '未知错误'}`);
    }
    if (cached.canResume !== true) {
      throw new Error(`${cached.error ?? 'Codex CLI 版本不支持 resume'}（${cached.command}）`);
    }
    return cached;
  }
  const checked = checkCodexCli(runtime);
  if (checked.ok !== true) {
    runtime.codexCli = undefined;
    throw new Error(`Codex CLI 不可用（${checked.command}）：${checked.error ?? '未知错误'}`);
  }
  if (checked.canResume !== true) {
    runtime.codexCli = undefined;
    throw new Error(`${checked.error ?? 'Codex CLI 版本不支持 resume'}（${checked.command}）`);
  }
  runtime.codexCli = checked;
  return checked;
}

/** 缓存失效：配置变化后重新探测。 */
export function invalidateCodexCli(runtime) {
  runtime.codexCli = undefined;
  runtime.codexModelCatalog = undefined;
}

function normalizeModelEntry(entry) {
  if (entry === null || typeof entry !== 'object') return undefined;
  const id = typeof entry.slug === 'string'
    ? entry.slug.trim()
    : (typeof entry.id === 'string' ? entry.id.trim() : '');
  if (id === '') return undefined;
  if (entry.visibility === 'hide') return undefined;
  const name = typeof entry.display_name === 'string' && entry.display_name.trim() !== ''
    ? entry.display_name.trim()
    : (typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : id);
  const description = typeof entry.description === 'string'
    ? entry.description.trim().slice(0, 400)
    : '';
  const reasoningLevels = Array.isArray(entry.supported_reasoning_levels)
    ? entry.supported_reasoning_levels
      .filter((level) => level !== null
        && typeof level === 'object'
        && typeof level.effort === 'string'
        && level.effort.trim() !== '')
      .map((level) => ({
        effort: level.effort.trim(),
        description: typeof level.description === 'string' ? level.description.trim().slice(0, 300) : '',
      }))
    : [];
  const defaultReasoningLevel = typeof entry.default_reasoning_level === 'string'
    && entry.default_reasoning_level.trim() !== ''
    ? entry.default_reasoning_level.trim()
    : null;
  const inputModalities = Array.isArray(entry.input_modalities)
    ? entry.input_modalities.filter((value) => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim())
    : [];
  return { id, name, description, reasoningLevels, defaultReasoningLevel, inputModalities };
}

/** 解析 `codex debug models` 的 JSON，只保留可选模型与图片输入能力。 */
function parseModelCatalog(raw) {
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  const entries = Array.isArray(parsed?.models) ? parsed.models : [];
  const models = [];
  const seen = new Set();
  for (const entry of entries) {
    const model = normalizeModelEntry(entry);
    if (model === undefined || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  return { models, error: null };
}

/**
 * 异步读取 Codex 模型目录。
 *
 * 派发路径用：`codex debug models` 在本机要跑 1–2 秒，同步版会卡住 Host 事件循环。
 * 失败同样缓存成 `{ models: [], error }`，避免每次派发都重试。
 *
 * @param {object} runtime 插件运行时。
 * @param {boolean} [force] 忽略缓存。
 * @returns {Promise<{models: object[], error: string|null}>} 模型目录；失败时 `error` 有值。
 */
export async function readCodexModelCatalog(runtime, force = false) {
  if (!force && runtime.codexModelCatalog !== undefined) return runtime.codexModelCatalog;
  const { command, args } = commandSpec(runtime);
  let output;
  try {
    output = await collectCli(command, [...args, 'debug', 'models'], 20_000);
  } catch (error) {
    const value = { models: [], error: `无法读取 Codex 模型目录：${describeError(error)}` };
    runtime.codexModelCatalog = value;
    return value;
  }
  if (output.error !== null) {
    const value = { models: [], error: `无法读取 Codex 模型目录：${describeError(output.error)}` };
    runtime.codexModelCatalog = value;
    return value;
  }
  if (output.status !== 0) {
    const detail = (output.stderr.trim() || `退出码 ${output.status ?? '未知'}`).slice(0, 800);
    const value = { models: [], error: `无法读取 Codex 模型目录：${detail}` };
    runtime.codexModelCatalog = value;
    return value;
  }
  try {
    const value = parseModelCatalog(output.stdout);
    runtime.codexModelCatalog = value;
    return value;
  } catch (error) {
    const value = { models: [], error: `无法解析 Codex 模型目录：${describeError(error)}` };
    runtime.codexModelCatalog = value;
    return value;
  }
}

/** 异步执行一次 CLI 并收集 stdout/stderr（不阻塞事件循环）。 */
function collectCli(command, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const child = spawnCli(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolvePromise(result);
    };
    timer = setTimeout(() => {
      killProcessTree(child);
      finish({
        status: null,
        stdout: `${stdout}${stdoutDecoder.end()}`,
        stderr: `${stderr}${stderrDecoder.end()}`,
        error: new Error('读取 Codex 模型目录超时'),
      });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.stdout?.on('data', (chunk) => {
      stdout += stdoutDecoder.write(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += stderrDecoder.write(chunk);
    });
    child.on('error', (error) => {
      finish({ status: null, stdout, stderr, error });
    });
    child.on('close', (status) => {
      finish({ status, stdout: `${stdout}${stdoutDecoder.end()}`, stderr: `${stderr}${stderrDecoder.end()}`, error: null });
    });
  });
}

/**
 * Codex 模型是否接受图片输入。
 *
 * 目录里有 `input_modalities` 时才判断；取不到目录/模型时返回 `undefined`，
 * 调用方按「未知」处理，照常附图片，失败由 Codex 自己报错。
 *
 * @param {object} runtime 插件运行时。
 * @param {string|null} modelId Codex 模型 id。
 * @returns {Promise<boolean|undefined>} false = 明确不支持图片。
 */
export async function codexModelSupportsImages(runtime, modelId) {
  if (typeof modelId !== 'string' || modelId.trim() === '') return undefined;
  const catalog = runtime.codexModelCatalog ?? await readCodexModelCatalog(runtime);
  if (catalog === null || catalog === undefined || catalog.error !== null) return undefined;
  const entry = catalog.models.find((model) => model.id === modelId.trim());
  if (entry === undefined || entry.inputModalities.length === 0) return undefined;
  return entry.inputModalities.includes('image');
}

/**
 * 读取 Codex 当前模型目录。优先用 `codex debug models` 的 JSON；
 * 失败时返回 error，让配置页退回手动输入。
 *
 * @param {object} runtime 插件运行时。
 * @param {boolean} [force] 忽略缓存。
 * @returns {{models: object[], error: string|null}}
 */
export function listCodexModels(runtime, force = false) {
  if (!force && runtime.codexModelCatalog !== undefined) return runtime.codexModelCatalog;
  const { command, args } = commandSpec(runtime);
  let result;
  try {
    result = spawnCliSync(command, [...args, 'debug', 'models'], {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
  } catch (error) {
    const value = { models: [], error: `无法读取 Codex 模型目录：${describeError(error)}` };
    runtime.codexModelCatalog = value;
    return value;
  }
  if (result.error !== undefined && result.error !== null) {
    const value = { models: [], error: `无法读取 Codex 模型目录：${describeError(result.error)}` };
    runtime.codexModelCatalog = value;
    return value;
  }
  if (result.status !== 0) {
    const detail = (String(result.stderr ?? '').trim() || `退出码 ${result.status}`).slice(0, 800);
    const value = { models: [], error: `无法读取 Codex 模型目录：${detail}` };
    runtime.codexModelCatalog = value;
    return value;
  }
  try {
    const value = parseModelCatalog(result.stdout);
    runtime.codexModelCatalog = value;
    return value;
  } catch (error) {
    const value = { models: [], error: `无法解析 Codex 模型目录：${describeError(error)}` };
    runtime.codexModelCatalog = value;
    return value;
  }
}

function codexArguments(runtime, options) {
  const { command, args } = commandSpec(runtime);
  const config = runtime.config ?? {};
  const argv = [...args];
  if (typeof options.sessionId === 'string' && options.sessionId !== '') {
    argv.push('exec', 'resume', options.sessionId, '--json');
  } else {
    argv.push('exec', '--json', '--color', 'never');
  }
  if (config.codexSkipGitRepoCheck !== false) argv.push('--skip-git-repo-check');
  if (config.codexBypassApprovals === true) {
    argv.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (typeof options.sessionId !== 'string' || options.sessionId === '') {
    argv.push('--sandbox', config.codexSandbox ?? 'workspace-write');
  }
  const model = typeof options.model === 'string' && options.model !== ''
    ? options.model
    : (typeof config.codexModel === 'string' && config.codexModel !== '' ? config.codexModel : null);
  if (model !== null) argv.push('-m', model);
  const effort = typeof options.reasoningEffort === 'string' && options.reasoningEffort !== ''
    ? options.reasoningEffort
    : (typeof config.codexReasoningEffort === 'string' && config.codexReasoningEffort !== ''
      ? config.codexReasoningEffort
      : null);
  if (effort !== null) argv.push('-c', `model_reasoning_effort=${effort}`);
  // 用户随任务发的图片：`exec` 与 `exec resume` 都支持 -i/--image <FILE>。
  const images = Array.isArray(options.images) ? options.images : [];
  for (const image of images) {
    if (typeof image === 'string' && image !== '') argv.push('-i', image);
  }
  argv.push('-');
  return { command, args: argv };
}

/** `turn.completed` 之后等进程退出的宽限毫秒数；0 = 关闭。 */
export function completionGraceMs(runtime) {
  const value = runtime?.config?.codexCompletionGraceMs;
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_COMPLETION_GRACE_MS;
}

function killProcessTree(child) {
  if (child === undefined || child === null) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    try {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', () => {});
    } catch {
      /* 回退到 child.kill */
    }
    try {
      child.kill();
    } catch {
      /* 已退出 */
    }
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    /* 已退出 */
  }
  const timer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* 已退出 */
    }
  }, 1500);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * 启动一轮 Codex。
 *
 * @param {object} runtime 插件运行时。
 * @param {object} options
 * @param {string} options.cwd 工作目录。
 * @param {string} options.prompt 任务/补充消息。
 * @param {string} [options.sessionId] 有值则 resume。
 * @param {string} [options.model] Codex 模型 id。
 * @param {string[]} [options.images] 随本轮附上的图片文件路径（`-i`）。
 * @param {(event: object) => void} [options.onEvent] JSONL 事件回调。
 * @returns {{promise: Promise<object>, cancel: () => void, child: object}}
 */
export function startCodexTurn(runtime, options) {
  const { command, args } = codexArguments(runtime, options);
  const child = spawnCli(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let threadId = typeof options.sessionId === 'string' ? options.sessionId : null;
  let finalText = '';
  let usage = null;
  let turnCompleted = false;
  let turnFailed = false;
  let failureMessage = '';
  let lastError = '';
  let cancelled = false;
  let settled = false;
  let exitCode = null;
  let stdoutBuffer = '';
  let stderrText = '';
  let fallbackTimer = null;
  let graceTimer = null;
  let resolvePromise;
  const stdoutDecoder = new StringDecoder('utf8');
  const stderrDecoder = new StringDecoder('utf8');

  const promise = new Promise((resolvePromiseValue) => {
    resolvePromise = resolvePromiseValue;
  });

  const emit = (event) => {
    try {
      options.onEvent?.(event);
    } catch (error) {
      try {
        runtime.logger?.warn?.(`[paihuo] Codex 转录事件处理失败：${describeError(error)}`);
      } catch {
        /* 日志失败不影响执行 */
      }
    }
  };

  const finish = (payload) => {
    if (settled) return;
    settled = true;
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    if (graceTimer !== null) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
    resolvePromise(payload);
  };

  const failWith = (message) => {
    failureMessage = failureMessage === '' ? message : failureMessage;
  };

  /**
   * `turn.completed` 之后进程不一定马上退出：Codex 留下的常驻子进程
   * （构建守护进程、watcher、本地 server 等）会继承 stdout 管道句柄，
   * 管道收不到 EOF，Node 就永远不会发 `close`，任务会一直挂在 running。
   * 宽限到点就杀掉进程树，用手里的最终回答结算。
   */
  const armCompletionGrace = () => {
    const graceMs = completionGraceMs(runtime);
    if (graceMs <= 0 || graceTimer !== null) return;
    graceTimer = setTimeout(() => {
      graceTimer = null;
      // 已取消的任务交给 cancel 自己的兜底结算，这里不能抢先报 completed。
      if (settled || cancelled) return;
      const trimmed = finalText.trim();
      const seconds = Math.max(1, Math.round(graceMs / 1000));
      const succeeded = trimmed !== '' && !turnFailed && (turnCompleted || exitCode === 0);
      emit({
        type: 'note',
        text: turnCompleted
          ? `Codex 已回报本轮结束，但 CLI 进程在 ${seconds} 秒内没有退出（stdio 未关闭），已强制收尾。`
          : `Codex 进程已经退出，但 stdio 在 ${seconds} 秒内仍未关闭，已强制收尾。`,
      });
      killProcessTree(child);
      finish({
        stopReason: succeeded ? 'completed' : 'failed',
        sessionId: threadId,
        finalText,
        diagnostic: succeeded
          ? ''
          : (failureMessage !== ''
            ? failureMessage
            : (trimmed === ''
              ? 'Codex 回报本轮结束后进程未退出，且没有最终回答。'
              : `Codex CLI 退出码 ${exitCode ?? '未知'}，但没有回报 turn.completed。`)),
        exitCode,
        usage,
        graceTimeout: true,
      });
    }, graceMs);
    if (typeof graceTimer.unref === 'function') graceTimer.unref();
  };

  const handleLine = (line) => {
    const text = line.trim();
    if (text === '') return;
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      return;
    }
    if (event === null || typeof event !== 'object' || typeof event.type !== 'string') return;
    switch (event.type) {
      case 'thread.started': {
        if (typeof event.thread_id === 'string' && event.thread_id !== '') threadId = event.thread_id;
        emit({ type: 'thread', threadId });
        return;
      }
      case 'item.started':
      case 'item.completed': {
        const item = event.item;
        if (item === null || typeof item !== 'object' || typeof item.type !== 'string') return;
        if (item.type === 'agent_message') {
          if (event.type === 'item.completed' && typeof item.text === 'string') {
            finalText = item.text;
            emit({ type: 'message', text: item.text });
          }
          return;
        }
        if (item.type === 'command_execution') {
          const commandText = typeof item.command === 'string' ? item.command : '';
          const itemId = typeof item.id === 'string' ? item.id : '';
          if (event.type === 'item.started') {
            emit({ type: 'command-start', itemId, command: commandText });
          } else {
            const output = typeof item.aggregated_output === 'string' ? item.aggregated_output : '';
            emit({
              type: 'command-end',
              itemId,
              command: commandText,
              output,
              exitCode: typeof item.exit_code === 'number' ? item.exit_code : null,
              status: typeof item.status === 'string' ? item.status : 'completed',
            });
          }
          return;
        }
        if (item.type === 'file_change' && event.type === 'item.completed') {
          emit({ type: 'file-change', item });
          return;
        }
        if (item.type === 'error' && typeof item.message === 'string') {
          lastError = item.message;
          emit({ type: 'error', message: item.message });
        }
        return;
      }
      case 'error': {
        if (typeof event.message === 'string') {
          lastError = event.message;
          emit({ type: 'error', message: event.message });
        }
        return;
      }
      case 'turn.completed': {
        turnCompleted = true;
        usage = event.usage ?? null;
        emit({ type: 'turn-completed', usage });
        armCompletionGrace();
        return;
      }
      case 'turn.failed': {
        turnFailed = true;
        const message = event.error !== null && typeof event.error === 'object' && typeof event.error.message === 'string'
          ? event.error.message
          : 'Codex 轮次失败';
        failWith(message);
        emit({ type: 'error', message });
        return;
      }
      default:
        return;
    }
  };

  const pushStdout = (chunk) => {
    stdoutBuffer += stdoutDecoder.write(chunk);
    let index = stdoutBuffer.indexOf('\n');
    while (index >= 0) {
      const line = stdoutBuffer.slice(0, index);
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (line.length <= MAX_LINE_CHARS) handleLine(line);
      index = stdoutBuffer.indexOf('\n');
    }
    if (stdoutBuffer.length > MAX_LINE_CHARS) stdoutBuffer = '';
  };

  child.stdout?.on('data', pushStdout);
  child.stdout?.on('error', () => {});
  child.stdin?.on('error', () => {});
  child.stderr?.on('error', () => {});
  child.stderr?.on('data', (chunk) => {
    const text = stderrDecoder.write(chunk);
    if (stderrText.length < MAX_STDERR_CHARS) {
      stderrText += text.slice(0, MAX_STDERR_CHARS - stderrText.length);
    }
  });
  child.on('error', (error) => {
    failWith(`无法启动 Codex CLI（${command}）：${describeError(error)}`);
    finish({
      stopReason: 'failed',
      sessionId: threadId,
      finalText,
      diagnostic: failureMessage,
      exitCode: null,
      usage,
    });
  });
  child.on('exit', (code) => {
    if (typeof code === 'number') exitCode = code;
    // 进程退了但 stdio 还没关（孙子进程攥着管道）时，别无限等 close。
    armCompletionGrace();
  });
  child.on('close', (code) => {
    exitCode = typeof code === 'number' ? code : null;
    if (stdoutBuffer.trim() !== '') handleLine(stdoutBuffer);
    stdoutBuffer = '';
    if (cancelled) {
      finish({
        stopReason: 'aborted',
        sessionId: threadId,
        finalText,
        diagnostic: 'Codex 轮次被取消。',
        exitCode,
        usage,
      });
      return;
    }
    const trimmed = finalText.trim();
    let stopReason;
    if (turnFailed || (!turnCompleted && exitCode !== 0) || (exitCode !== null && exitCode !== 0)) {
      stopReason = 'failed';
    } else if (trimmed === '') {
      stopReason = 'failed';
      failWith('Codex 结束了本轮，但没有返回最终回答。');
    } else {
      stopReason = 'completed';
    }
    let diagnostic = failureMessage || lastError;
    if (diagnostic === '' && stopReason !== 'completed') {
      diagnostic = exitCode === null
        ? 'Codex CLI 异常退出。'
        : `Codex CLI 退出码 ${exitCode}。`;
    }
    if (diagnostic === '' && stopReason !== 'completed' && stderrText.trim() !== '') {
      diagnostic = stderrText.trim();
    }
    const clipped = diagnostic.length > 1200 ? `${diagnostic.slice(0, 1199)}…` : diagnostic;
    finish({
      stopReason,
      sessionId: threadId,
      finalText,
      diagnostic: clipped,
      exitCode,
      usage,
    });
  });

  const cancel = () => {
    if (cancelled || settled) return;
    cancelled = true;
    if (graceTimer !== null) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
    try {
      child.stdin?.end();
    } catch {
      /* 忽略 */
    }
    killProcessTree(child);
    if (fallbackTimer === null) {
      fallbackTimer = setTimeout(() => {
        finish({
          stopReason: 'aborted',
          sessionId: threadId,
          finalText,
          diagnostic: 'Codex 轮次被取消，CLI 未在超时前退出。',
          exitCode,
          usage,
        });
      }, CANCEL_FALLBACK_MS);
      if (typeof fallbackTimer.unref === 'function') fallbackTimer.unref();
    }
  };

  try {
    child.stdin?.write(String(options.prompt ?? ''));
    child.stdin?.end();
  } catch (error) {
    failWith(`写入 Codex 任务失败：${describeError(error)}`);
    cancel();
  }

  return { promise, cancel, child };
}

export { commandSpec as codexCommandSpec };
