import { safeJsonFromGroq } from '../services/llm/safe-json.js';
import { buildUserProfileContext } from './context-builders.js';

function isLikelyTrivialMessage(content) {
  const text = String(content || '').trim();
  if (!text) return true;
  if (text.length <= 2) return true;

  const lower = text.toLowerCase();
  const trivial = new Set([
    'ok',
    'okay',
    'thanks',
    'thank you',
    'thx',
    '了解',
    'ありがとう',
    'いいね',
    'yes',
    'no',
    'k',
  ]);
  if (trivial.has(lower)) return true;

  const emojiOnly = /^[\p{Emoji}\p{Extended_Pictographic}\s]+$/u.test(text);
  if (emojiOnly) return true;

  const urlOnly = /^(https?:\/\/\S+\s*)+$/i.test(text);
  if (urlOnly) return true;

  if (/^(lol|lmao|w+|草)+$/i.test(lower)) return true;
  return false;
}

export async function shouldAutoRespond(message) {
  const content = message.content?.trim();
  if (!content) return { shouldRespond: false, reason: 'empty', isNewTask: false };

  const channelName = message.channel?.name || '';

  if (channelName.startsWith('task-')) {
    const commandLike =
      content === '!run' ||
      content === '!continue' ||
      content.startsWith('!run ') ||
      content.startsWith('!continue ');
    return {
      shouldRespond: commandLike,
      reason: commandLike ? 'task command message' : 'task channel requires !run/!continue',
      isNewTask: false,
    };
  }

  if (isLikelyTrivialMessage(content)) {
    return { shouldRespond: false, reason: 'trivial prefilter', isNewTask: false };
  }

  const systemPrompt = `
あなたは Discord Auto Router です。
役割は、このメッセージが「botチームに依頼して処理すべき内容」か判断することです。

ルール:
- 雑談、独り言、短い相槌、感想なら shouldRespond = false
- 相談、依頼、質問、作業、整理、情報収集、計画、文章作成なら shouldRespond = true
- 新しい task チャンネルを作る必要がありそうなら isNewTask = true
- 必ず JSON だけ返す

形式:
{
  "shouldRespond": true,
  "reason": "short reason",
  "isNewTask": true
}
`;

  const userPrompt = `
channel:
${channelName}

message:
${content}

userProfile:
${buildUserProfileContext()}
`;

  const parsed = await safeJsonFromGroq(systemPrompt, userPrompt, {
    shouldRespond: false,
    reason: 'fallback ignore',
    isNewTask: false,
  });

  return {
    shouldRespond: Boolean(parsed.shouldRespond),
    reason: parsed.reason || 'No reason',
    isNewTask: Boolean(parsed.isNewTask),
  };
}

export async function classifyTaskType(messageContent) {
  const systemPrompt = `
あなたは Task Type Router です。
役割は、ユーザーの依頼を最も適切な taskType に分類することです。

選べる taskType:
- research
- grant
- website
- marketing
- admin
- general

必ず JSON だけ返してください。
`;

  const userPrompt = `
message:
${messageContent}

userProfile:
${buildUserProfileContext()}
`;

  const parsed = await safeJsonFromGroq(systemPrompt, userPrompt, {
    taskType: 'general',
    reason: 'fallback general',
  });

  const allowed = ['research', 'grant', 'website', 'marketing', 'admin', 'general'];
  return {
    taskType: allowed.includes(parsed.taskType) ? parsed.taskType : 'general',
    reason: parsed.reason || 'No reason',
  };
}
