/**
 * 把经理的回复补发到 IM（可选依赖 dsh-im）。
 *
 * 背景：IM 插件只回传「从聊天里发起的那一轮」。工程师汇报、补充回复是派活插件
 * 用 `sessionController.prompt` 注入的 user 消息，IM 插件会把它们当成 DSH Web
 * 输入，那一轮结束时不会回传聊天——用户在 QQ 里只看到自己说的话，看不到经理的
 * 反应。
 *
 * 这里复用 dsh-im 的同 Host 服务：
 *  1. `describeConversation(sessionId)` 找到该会话绑定的聊天（dsh-im ≥ 5.9）；
 *  2. 用 `conversationRoute` 把会话键还原成主动投递路由；
 *  3. `send(botId, { kind, route }, text)` 主动发送。
 *
 * 路由规则与 dsh-im 的会话键一一对应（见其 `delivery-suggestion` 实现）。这里只
 * 需要还原「已知形状」，遇到不认识的新形状就跳过——宁可少发一条，也不猜收件人。
 */

/** 私聊作用域前缀：只有该前缀才是这个渠道的「一对一聊天」。 */
const PRIVATE_SCOPE = Object.freeze({
  weixin: 'p2p',
  feishu: 'p2p',
  dingtalk: 'p2p',
  wecom: 'direct',
  'wecom-app': 'p2p',
  qq: 'c2c',
  telegram: 'direct',
  slack: 'direct',
  discord: 'direct',
  whatsapp: 'direct',
  imessage: 'direct',
  matrix: 'dm',
});

/** 私聊路由：[kind, route 字段名]。 */
const PRIVATE_ROUTE = Object.freeze({
  weixin: ['user', 'toUserId'],
  feishu: ['user', 'openId'],
  dingtalk: ['user', 'userId'],
  wecom: ['user', 'chatId'],
  'wecom-app': ['user', 'chatId'],
  qq: ['user', 'userOpenId'],
  telegram: ['chat', 'chatId'],
  slack: ['conversation', 'channelId'],
  discord: ['channel', 'channelId'],
  whatsapp: ['user', 'jid'],
  imessage: ['user', 'chatGuid'],
  matrix: ['dm', 'userId'],
});

/** 群聊路由：[kind, route 字段名]；不支持群聊的渠道不列。 */
const GROUP_ROUTE = Object.freeze({
  feishu: ['group', 'chatId'],
  dingtalk: ['group', 'openConversationId'],
  wecom: ['group', 'chatId'],
  qq: ['group', 'groupOpenId'],
  discord: ['channel', 'channelId'],
  whatsapp: ['group', 'jid'],
});

function opaque(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && value.trim() === value
    && !/[\s\u0000-\u001f\u007f]/u.test(value);
}

function splitScope(key) {
  const index = key.indexOf(':');
  if (index <= 0 || index === key.length - 1) return null;
  return { scope: key.slice(0, index), rest: key.slice(index + 1) };
}

function slackRoute(scope, rest) {
  if (scope === 'direct') return { kind: 'conversation', route: { channelId: rest } };
  const match = /^([^:]+):(\d{1,20}(?:\.\d{1,20})?)$/u.exec(rest);
  if (scope !== 'group' || match === null) return null;
  return { kind: 'thread', route: { channelId: match[1], threadTs: match[2] } };
}

function telegramRoute(scope, rest) {
  const match = /^(-?\d+)(?::([1-9]\d*))?$/u.exec(rest);
  if (match === null) return null;
  if (scope === 'direct') {
    return match[2] === undefined ? { kind: 'chat', route: { chatId: match[1] } } : null;
  }
  if (scope !== 'group') return null;
  if (match[2] === undefined) return { kind: 'chat', route: { chatId: match[1] } };
  const messageThreadId = Number(match[2]);
  if (!Number.isSafeInteger(messageThreadId) || messageThreadId <= 0) return null;
  return { kind: 'topic', route: { chatId: match[1], messageThreadId } };
}

function matrixRoute(key) {
  const normalized = key.replace(/^direct:dm:/u, 'dm:');
  const parsed = splitScope(normalized);
  if (parsed === null) return null;
  if (parsed.scope === 'dm') return { kind: 'dm', route: { userId: parsed.rest } };
  if (parsed.scope !== 'room' || !parsed.rest.startsWith('!')) return null;
  // 话题键是 `room:<roomId>$<threadId>`；投递接口要求 threadId 以 `$` 开头，
  // 所以这里保留 `$` 开头的那一段（兼容 `$$<id>` 的旧写法）。
  const separator = parsed.rest.indexOf('$');
  if (separator === -1) return { kind: 'room', route: { roomId: parsed.rest } };
  const roomId = parsed.rest.slice(0, separator);
  const threadId = parsed.rest.slice(separator);
  if (roomId === '' || threadId === '$') return null;
  return { kind: 'thread', route: { roomId, threadId } };
}

/**
 * 把 dsh-im 的会话键还原成主动投递路由。
 *
 * @param {string} channel 渠道 id（qq / feishu / telegram …）。
 * @param {string} key 该渠道持久化的会话键，例如 `c2c:<openid>`。
 * @returns {{kind: string, route: Record<string, string|number>}|null} 不认识时返回 null。
 */
export function conversationRoute(channel, key) {
  if (!opaque(channel) || !opaque(key)) return null;
  if (channel === 'matrix') return matrixRoute(key);
  const parsed = splitScope(key);
  if (parsed === null) return null;
  const { scope, rest } = parsed;

  if (scope === PRIVATE_SCOPE[channel] && PRIVATE_ROUTE[channel] !== undefined) {
    // 与 dsh-im 一致：飞书只有 ou_ 开头的 open_id 才是私聊目标。
    if (channel === 'feishu' && !rest.startsWith('ou_')) return null;
    const [kind, field] = PRIVATE_ROUTE[channel];
    return { kind, route: { [field]: rest } };
  }
  if (channel === 'slack') return slackRoute(scope, rest);
  if (channel === 'telegram') return telegramRoute(scope, rest);
  if (scope !== 'group') return null;
  const rule = GROUP_ROUTE[channel];
  if (rule === undefined) return null;
  return { kind: rule[0], route: { [rule[1]]: rest } };
}

/**
 * 把一个会话的回复补发到它绑定的 IM 聊天。
 *
 * @param {{get: Function}} ctx 插件上下文（用 `ctx.get('dshIm')` 取同 Host 服务）。
 * @param {string} sessionId 目标会话。
 * @param {string} text 要发送的文本。
 * @returns {Promise<{delivered: boolean, reason?: string, channel?: string}>} 结果；
 *   `no-im` / `unbound` 属于正常情况（没装 IM、会话不是 IM 会话），调用方不必报错。
 */
export async function deliverToImSession(ctx, sessionId, text) {
  const im = ctx?.get?.('dshIm');
  if (im === undefined || im === null) return { delivered: false, reason: 'no-im' };
  if (typeof im.describeConversation !== 'function' || typeof im.send !== 'function') {
    // dsh-im 5.9 之前没有 describeConversation：会话→聊天 的映射拿不到。
    return { delivered: false, reason: 'im-version' };
  }
  let described;
  try {
    described = await im.describeConversation(sessionId);
  } catch {
    return { delivered: false, reason: 'lookup-failed' };
  }
  if (described === null || described === undefined || typeof described.botId !== 'string') {
    return { delivered: false, reason: 'unbound' };
  }
  const route = conversationRoute(described.channel, described.conversationKey);
  if (route === null) return { delivered: false, reason: 'unroutable' };
  await im.send(described.botId, route, text, { format: 'markdown' });
  return { delivered: true, channel: described.channel };
}
