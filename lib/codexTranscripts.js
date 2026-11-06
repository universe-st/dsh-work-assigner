/**
 * Codex 会话转录：把 CLI 的 JSONL 事件整理成可读的用户/助手/命令/错误条目，
 * 供经理会话右上角的「Codex 子代理」菜单通过只读 Remote 查看。
 *
 * 转录按 engineerId 存在 storageDomain 的 `codex` 表里；内存里保留一份，
 * 写入节流，避免每条命令事件都做一次持久化。
 */

import { backendOf } from './policy.js';
import { CodexTranscriptSchema } from './state.js';

const MAX_ENTRIES = 200;
const MAX_ENTRY_CHARS = 4000;
const MAX_OUTPUT_CHARS = 2000;
const MAX_TOTAL_CHARS = 64_000;
const SAVE_DELAY_MS = 500;

function clip(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1))}…`;
}

function now() {
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createCodexTranscripts(runtime) {
  const records = new Map();
  const dirty = new Set();
  const timers = new Map();
  let store = null;
  let sequence = 0;

  const logWarn = (message) => {
    try {
      runtime.logger?.warn?.(`[paihuo] ${message}`);
    } catch {
      /* 日志失败不影响 UI */
    }
  };

  const nextId = () => {
    sequence += 1;
    return `ce${now().toString(36)}-${sequence}`;
  };

  const ensure = (engineer) => {
    let record = records.get(engineer.sessionId);
    if (record === undefined) {
      record = {
        engineerId: engineer.sessionId,
        sessionId: engineer.codexSessionId ?? null,
        model: engineer.codexModel ?? null,
        updatedAt: now(),
        entries: [],
      };
      records.set(engineer.sessionId, record);
    }
    if (engineer.codexSessionId !== undefined) record.sessionId = engineer.codexSessionId;
    if (engineer.codexModel !== undefined) record.model = engineer.codexModel;
    return record;
  };

  const trim = (record) => {
    let truncated = record.truncated === true;
    while (record.entries.length > MAX_ENTRIES) {
      record.entries.shift();
      truncated = true;
    }
    let total = 0;
    for (const entry of record.entries) {
      total += entry.text.length + (entry.label?.length ?? 0) + (entry.command?.length ?? 0) + (entry.output?.length ?? 0);
    }
    while (total > MAX_TOTAL_CHARS && record.entries.length > 1) {
      const removed = record.entries.shift();
      total -= removed.text.length + (removed.label?.length ?? 0) + (removed.command?.length ?? 0) + (removed.output?.length ?? 0);
      truncated = true;
    }
    if (truncated) record.truncated = true;
  };

  const persist = (engineerId) => {
    timers.delete(engineerId);
    if (store === null || !dirty.has(engineerId)) return;
    const record = records.get(engineerId);
    dirty.delete(engineerId);
    if (record === undefined) return;
    try {
      Promise.resolve(store.put(engineerId, clone(record))).catch((error) => {
        logWarn(`Codex 转录写入失败：${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      logWarn(`Codex 转录写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const schedule = (engineerId) => {
    dirty.add(engineerId);
    if (timers.has(engineerId)) return;
    const timer = setTimeout(() => persist(engineerId), SAVE_DELAY_MS);
    if (typeof timer.unref === 'function') timer.unref();
    timers.set(engineerId, timer);
  };

  const append = (engineer, entry) => {
    const record = ensure(engineer);
    const normalized = {
      id: entry.id ?? nextId(),
      kind: entry.kind,
      ...(entry.label === undefined ? {} : { label: clip(entry.label, 120) }),
      text: clip(entry.text ?? '', MAX_ENTRY_CHARS),
      ...(entry.command === undefined ? {} : { command: clip(entry.command, 1200) }),
      ...(entry.output === undefined ? {} : { output: clip(entry.output, MAX_OUTPUT_CHARS) }),
      ...(entry.exitCode === undefined ? {} : { exitCode: entry.exitCode }),
      at: entry.at ?? now(),
    };
    record.entries.push(normalized);
    record.updatedAt = now();
    trim(record);
    schedule(engineer.sessionId);
    return normalized.id;
  };

  const findByEngineer = (engineerId) => records.get(engineerId);

  const ui = {
    /** 从 storageDomain 表加载已有转录（key 为 engineerId）。 */
    load(table) {
      store = table;
      try {
        for (const [engineerId, value] of table.entries()) {
          const parsed = CodexTranscriptSchema.safeParse(value);
          if (parsed.success) {
            if (!records.has(engineerId)) records.set(engineerId, parsed.data);
          } else {
            logWarn(`忽略损坏的 Codex 转录：${engineerId}`);
          }
        }
      } catch (error) {
        logWarn(`读取 Codex 转录失败：${error instanceof Error ? error.message : String(error)}`);
      }
    },

    recordUser(engineer, text, label) {
      return append(engineer, { kind: 'user', label, text });
    },

    recordAssistant(engineer, text) {
      return append(engineer, { kind: 'assistant', label: 'Codex', text });
    },

    recordError(engineer, text) {
      return append(engineer, { kind: 'error', text });
    },

    recordNote(engineer, text) {
      return append(engineer, { kind: 'note', text });
    },

    startCommand(engineer, command) {
      return append(engineer, {
        kind: 'command',
        label: '命令',
        text: command,
        command,
        exitCode: null,
      });
    },

    finishCommand(engineer, entryId, { output, exitCode, status } = {}) {
      const record = findByEngineer(engineer.sessionId);
      if (record === undefined) return;
      const entry = record.entries.find((item) => item.id === entryId);
      if (entry === undefined) return;
      if (runtime.config?.codexTranscriptOutput !== false && typeof output === 'string' && output !== '') {
        entry.output = clip(output, MAX_OUTPUT_CHARS);
      }
      if (typeof exitCode === 'number') entry.exitCode = exitCode;
      if (typeof status === 'string' && status !== 'completed') {
        entry.text = `${entry.command ?? entry.text}（${status}）`;
      }
      record.updatedAt = now();
      trim(record);
      schedule(engineer.sessionId);
    },

    delete(engineerId) {
      const timer = timers.get(engineerId);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(engineerId);
      }
      records.delete(engineerId);
      dirty.delete(engineerId);
      if (store === null) return;
      try {
        Promise.resolve(store.delete(engineerId)).catch(() => {});
      } catch {
        /* 存储已关闭 */
      }
    },

    /** 尽力把未落盘的转录写完。 */
    async flush() {
      for (const [engineerId, timer] of timers) {
        clearTimeout(timer);
        timers.delete(engineerId);
      }
      const ids = [...dirty];
      dirty.clear();
      if (store === null || ids.length === 0) return;
      await Promise.all(ids.map(async (engineerId) => {
        const record = records.get(engineerId);
        if (record === undefined) return;
        try {
          await store.put(engineerId, clone(record));
        } catch (error) {
          logWarn(`Codex 转录 flush 失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }));
    },

    /** 会话摘要列表（只包含当前经理名下的 Codex 工程师）。 */
    sessions(managerId) {
      const state = runtime.store.get();
      const engineers = Object.values(state.engineers).filter((engineer) => (
        engineer.managerId === managerId && backendOf(engineer) === 'codex'
      ));
      const rows = engineers.map((engineer) => {
        const record = records.get(engineer.sessionId);
        const active = engineer.activeTaskId === undefined ? undefined : state.tasks[engineer.activeTaskId];
        const last = record?.entries.length > 0 ? record.entries[record.entries.length - 1] : undefined;
        return {
          engineerId: engineer.sessionId,
          sessionId: engineer.codexSessionId ?? record?.sessionId ?? null,
          model: engineer.codexModel ?? runtime.config?.codexModel ?? null,
          status: engineer.status,
          activeTaskId: active?.taskId ?? null,
          activeTaskTitle: active?.title ?? null,
          projectPath: engineer.projectPath,
          worktreeBranch: engineer.worktree?.branch ?? null,
          updatedAt: record?.updatedAt ?? engineer.createdAt,
          entryCount: record?.entries.length ?? 0,
          lastText: clip(last?.text ?? '', 200),
        };
      });
      rows.sort((left, right) => {
        if (left.status !== right.status) return left.status === 'running' ? -1 : 1;
        return right.updatedAt - left.updatedAt;
      });
      return {
        enabled: runtime.config?.engineerBackend === 'codex' || rows.length > 0,
        sessions: rows,
      };
    },

    /** 单个工程师的转录；跨经理或非 Codex 工程师返回空。 */
    transcript(managerId, engineerId) {
      const state = runtime.store.get();
      const engineer = state.engineers[engineerId];
      if (engineer === undefined || engineer.managerId !== managerId || backendOf(engineer) !== 'codex') {
        return { session: null, entries: [], truncated: false };
      }
      const record = records.get(engineerId);
      const sessions = ui.sessions(managerId).sessions;
      const session = sessions.find((entry) => entry.engineerId === engineerId) ?? null;
      return {
        session,
        entries: record?.entries ?? [],
        truncated: record?.truncated === true,
      };
    },
  };
  return ui;
}
