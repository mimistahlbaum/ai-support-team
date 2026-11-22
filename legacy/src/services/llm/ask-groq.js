import { TEXT_MODEL, REQUEST_TIMEOUT_MS, API_RETRIES } from '../../app/constants.js';
import { retryAsync } from '../../utils/retry.js';
import { withTimeout } from '../../utils/timeout.js';
import { groq } from './groq-client.js';

async function askGroq(systemPrompt, userPrompt, options = {}) {
  const { model = TEXT_MODEL, temperature = 0.6, max_tokens = 900 } = options;

  try {
    const response = await retryAsync(
      () => withTimeout(
        () => groq.chat.completions.create({
          model,
          temperature,
          max_tokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        REQUEST_TIMEOUT_MS,
        'groq completion'
      ),
      { retries: API_RETRIES, label: 'askGroq' }
    );

    return response.choices?.[0]?.message?.content || '(no response)';
  } catch (error) {
    console.error('askGroq error:', error?.message || error);
    return `Groq error: ${error?.message || 'unknown error'}`;
  }
}

export { askGroq };
