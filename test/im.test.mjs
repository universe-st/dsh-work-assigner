import assert from 'node:assert/strict';
import { test } from 'node:test';

import { conversationRoute, deliverToImSession } from '../lib/im.js';

function ctxWith(dshIm) {
  return { get: (name) => (name === 'dshIm' ? dshIm : undefined) };
}

test('conversationRoute restores IM delivery routes from stored chat keys', () => {
  assert.deepEqual(
    conversationRoute('qq', 'c2c:997290E1B94CD1537D99258B3FF51F66'),
    { kind: 'user', route: { userOpenId: '997290E1B94CD1537D99258B3FF51F66' } },
  );
  assert.deepEqual(
    conversationRoute('qq', 'group:GROUP_OPEN_ID'),
    { kind: 'group', route: { groupOpenId: 'GROUP_OPEN_ID' } },
  );
  assert.deepEqual(
    conversationRoute('feishu', 'p2p:ou_abc123'),
    { kind: 'user', route: { openId: 'ou_abc123' } },
  );
  // 飞书只有 ou_ 开头才是私聊目标，其余一律不猜。
  assert.equal(conversationRoute('feishu', 'p2p:abc123'), null);
  assert.deepEqual(
    conversationRoute('feishu', 'group:oc_1'),
    { kind: 'group', route: { chatId: 'oc_1' } },
  );
  assert.deepEqual(
    conversationRoute('weixin', 'p2p:wxid_1'),
    { kind: 'user', route: { toUserId: 'wxid_1' } },
  );
  assert.deepEqual(
    conversationRoute('wecom', 'direct:zhangsan'),
    { kind: 'user', route: { chatId: 'zhangsan' } },
  );
  assert.deepEqual(
    conversationRoute('telegram', 'direct:-100123'),
    { kind: 'chat', route: { chatId: '-100123' } },
  );
  assert.deepEqual(
    conversationRoute('telegram', 'group:-100123:42'),
    { kind: 'topic', route: { chatId: '-100123', messageThreadId: 42 } },
  );
  assert.deepEqual(
    conversationRoute('slack', 'group:C0123:1712345678.123456'),
    { kind: 'thread', route: { channelId: 'C0123', threadTs: '1712345678.123456' } },
  );
  assert.deepEqual(
    conversationRoute('slack', 'direct:C0123'),
    { kind: 'conversation', route: { channelId: 'C0123' } },
  );
  assert.deepEqual(
    conversationRoute('matrix', 'direct:dm:@alice:example.org'),
    { kind: 'dm', route: { userId: '@alice:example.org' } },
  );
  assert.deepEqual(
    conversationRoute('matrix', 'room:!room:example.org$$thread-1'),
    { kind: 'thread', route: { roomId: '!room:example.org', threadId: '$$thread-1' } },
  );
  assert.deepEqual(
    conversationRoute('whatsapp', 'group:123456-789@g.us'),
    { kind: 'group', route: { jid: '123456-789@g.us' } },
  );

  // 未知渠道 / 畸形键一律返回 null：宁可少发，也不把消息投给猜出来的收件人。
  assert.equal(conversationRoute('email', 'p2p:x'), null);
  assert.equal(conversationRoute('qq', 'c2c:'), null);
  assert.equal(conversationRoute('qq', 'nonsense'), null);
  assert.equal(conversationRoute('', 'c2c:x'), null);
  assert.equal(conversationRoute('qq', 42), null);
});

test('deliverToImSession skips quietly without a usable IM service', async () => {
  assert.deepEqual(await deliverToImSession(ctxWith(undefined), 'session-1', 'hi'), {
    delivered: false,
    reason: 'no-im',
  });
  // dsh-im 5.9 之前没有 describeConversation：会话→聊天 的映射拿不到。
  assert.deepEqual(
    await deliverToImSession(ctxWith({ send() {} }), 'session-1', 'hi'),
    { delivered: false, reason: 'im-version' },
  );
  assert.deepEqual(
    await deliverToImSession(
      ctxWith({ describeConversation: async () => null, send() {} }),
      'session-1',
      'hi',
    ),
    { delivered: false, reason: 'unbound' },
  );
  // 会话绑定的聊天键不是已知形状时不发送。
  assert.deepEqual(
    await deliverToImSession(
      ctxWith({
        describeConversation: async () => ({ channel: 'qq', botId: 'bot_1', conversationKey: 'weird' }),
        send() {
          throw new Error('should not send');
        },
      }),
      'session-1',
      'hi',
    ),
    { delivered: false, reason: 'unroutable' },
  );
});

test('deliverToImSession sends to the chat bound to the session', async () => {
  const sent = [];
  const im = {
    async describeConversation(sessionId) {
      assert.equal(sessionId, 'session-manager');
      return { channel: 'qq', botId: 'bot_1', conversationKey: 'c2c:OPENID' };
    },
    async send(botId, target, text, options) {
      sent.push({ botId, target, text, options });
      return { sent: true };
    },
  };
  const result = await deliverToImSession(ctxWith(im), 'session-manager', '【派活 · 经理】\n\n已合并');
  assert.deepEqual(result, { delivered: true, channel: 'qq' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].botId, 'bot_1');
  assert.deepEqual(sent[0].target, { kind: 'user', route: { userOpenId: 'OPENID' } });
  assert.equal(sent[0].text, '【派活 · 经理】\n\n已合并');
  assert.equal(sent[0].options.format, 'markdown');
});
