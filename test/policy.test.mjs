import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canDispatchTo,
  canStartTask,
  canSupervise,
  engineerTitle,
  isInside,
  isSubagentSession,
  managerTitle,
  orderQueued,
  roleFromTitle,
  runningByProject,
  runningMainWorkspaceTask,
  sandboxRank,
  stripRolePrefix,
  workspaceModeOf,
} from '../lib/policy.js';

const root = 'C:\\work\\demo';
const child = 'C:\\work\\demo\\packages\\app';
const sibling = 'C:\\work\\other';

test('sandboxRank orders confinement levels', () => {
  assert.ok(sandboxRank('read-only') < sandboxRank('workspace-write'));
  assert.ok(sandboxRank('workspace-write') < sandboxRank('danger-full-access'));
  assert.equal(sandboxRank('nope'), -1);
});

test('isInside treats equality and descendants as inside', () => {
  assert.equal(isInside(root, root), true);
  assert.equal(isInside(root, child), true);
  assert.equal(isInside(root, sibling), false);
  assert.equal(isInside(root, 'C:\\work\\demo2'), false);
});

test('canDispatchTo follows the permission rule', () => {
  assert.equal(canDispatchTo('danger-full-access', root, 'D:\\elsewhere'), true);
  assert.equal(canDispatchTo('workspace-write', root, child), true);
  assert.equal(canDispatchTo('workspace-write', root, sibling), false);
  assert.equal(canDispatchTo('read-only', root, sibling), false);
});

test('canSupervise refuses a higher engineer permission', () => {
  assert.equal(canSupervise('danger-full-access', 'workspace-write'), true);
  assert.equal(canSupervise('workspace-write', 'workspace-write'), true);
  assert.equal(canSupervise('workspace-write', 'danger-full-access'), false);
});

test('canStartTask enforces project, total and resource limits', () => {
  const tasks = {
    a: { status: 'running', projectKey: 'p', resources: ['browser'] },
    b: { status: 'running', projectKey: 'q', resources: [] },
  };
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'p', resources: [], workstationsPerProject: 1, totalWorkstations: 4 }),
    { ok: false, reason: 'project-workstations-full' },
  );
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'p', resources: [], workstationsPerProject: 3, totalWorkstations: 2 }),
    { ok: false, reason: 'total-workstations-full' },
  );
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'p', resources: ['browser'], workstationsPerProject: 3, totalWorkstations: 4 }),
    { ok: false, reason: 'resource-busy:browser' },
  );
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'p', resources: ['db'], workstationsPerProject: 3, totalWorkstations: 4 }),
    { ok: true },
  );
  assert.equal(runningByProject(tasks, 'q'), 1);
});

test('canStartTask serializes main-workspace tasks per project', () => {
  const tasks = {
    a: { taskId: 'a', status: 'running', projectKey: 'p', resources: [], useWorktree: false },
    b: { taskId: 'b', status: 'running', projectKey: 'q', resources: [], useWorktree: false },
    c: { taskId: 'c', status: 'running', projectKey: 'p', resources: [], useWorktree: true },
  };
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'p', resources: [], workstationsPerProject: 3, totalWorkstations: 4, workspaceMode: 'main' }),
    { ok: false, reason: 'main-workspace-busy' },
  );
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'p', resources: [], workstationsPerProject: 3, totalWorkstations: 4, workspaceMode: 'worktree' }),
    { ok: true },
  );
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'q', resources: [], workstationsPerProject: 3, totalWorkstations: 4, workspaceMode: 'main' }),
    { ok: false, reason: 'main-workspace-busy' },
  );
  assert.deepEqual(
    canStartTask({ tasks, projectKey: 'r', resources: [], workstationsPerProject: 3, totalWorkstations: 4, workspaceMode: 'main' }),
    { ok: true },
  );
  assert.equal(runningMainWorkspaceTask(tasks, 'p')?.taskId, 'a');
  assert.equal(runningMainWorkspaceTask(tasks, 'r'), undefined);
});

test('workspaceModeOf falls back for legacy tasks', () => {
  assert.equal(workspaceModeOf({ useWorktree: false }), 'main');
  assert.equal(workspaceModeOf({ useWorktree: true }), 'worktree');
  assert.equal(workspaceModeOf({ useWorktree: true, workspaceMode: 'main' }), 'main');
  assert.equal(workspaceModeOf({ useWorktree: false, workspaceMode: 'worktree' }), 'worktree');
});

test('orderQueued puts urgent first and keeps creation order', () => {
  const tasks = {
    a: { taskId: 'a', status: 'queued', priority: 'normal', createdAt: 2 },
    b: { taskId: 'b', status: 'queued', priority: 'urgent', createdAt: 3 },
    c: { taskId: 'c', status: 'queued', priority: 'normal', createdAt: 1 },
    d: { taskId: 'd', status: 'running', priority: 'urgent', createdAt: 0 },
  };
  assert.deepEqual(orderQueued(tasks).map((task) => task.taskId), ['b', 'c', 'a']);
});

test('titles carry the role prefix without duplicating it', () => {
  assert.equal(managerTitle('重构登录'), '👔 经理 · 重构登录');
  assert.equal(managerTitle('👔 经理 · 重构登录'), '👔 经理 · 重构登录');
  assert.equal(stripRolePrefix('👔 经理 · 重构登录'), '重构登录');
  assert.equal(engineerTitle('修登录页', 'myapp'), '👷 修登录页 · myapp');
  assert.equal(roleFromTitle('👔 经理 · x'), 'manager');
  assert.equal(roleFromTitle('👷 x'), 'engineer');
  assert.equal(roleFromTitle('普通'), 'none');
});

test('isSubagentSession protects the mode from subagents', () => {
  assert.equal(isSubagentSession({ origin: 'subagent' }), true);
  assert.equal(isSubagentSession({ parentSession: 'session-1' }), true);
  assert.equal(isSubagentSession({}), false);
  assert.equal(isSubagentSession(undefined), false);
});
