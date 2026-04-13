import { DISCORD_SAFE_LIMIT } from '../app/constants.js';

function clip(text, max = 500) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)} ...` : text;
}

function splitLongText(text, maxLength = DISCORD_SAFE_LIMIT) {
  if (!text) return ['(no response)'];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLength);
    if (splitAt < 500) splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < 300) splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt < 100) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export { clip, splitLongText };
