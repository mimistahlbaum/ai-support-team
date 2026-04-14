import { JSON_MODEL, SAFE_JSON_REQUEST_TIMEOUT_MS, API_RETRIES } from '../../app/constants.js';
import { retryAsync } from '../../utils/retry.js';
import { withTimeout } from '../../utils/timeout.js';
import { groq } from './groq-client.js';

async function safeJsonFromGroq(systemPrompt, userPrompt, fallbackObject) {
  try {
    const response = await retryAsync(
      () => withTimeout(
        () => groq.chat.completions.create({
          model: JSON_MODEL,
          temperature: 0.2,
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        SAFE_JSON_REQUEST_TIMEOUT_MS,
        'groq json completion'
      ),
      { retries: API_RETRIES, label: 'safeJsonFromGroq' }
    );

    const raw = response.choices?.[0]?.message?.content || '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : '{}');
  } catch (error) {
    console.error('safeJsonFromGroq error:', error?.message || error);
    return fallbackObject;
  }
}

export { safeJsonFromGroq };
