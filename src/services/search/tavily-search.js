import { TAVILY_API_KEY } from '../../app/env.js';
import { REQUEST_TIMEOUT_MS, API_RETRIES } from '../../app/constants.js';
import { clip } from '../../utils/text.js';
import { retryAsync } from '../../utils/retry.js';
import { withTimeout } from '../../utils/timeout.js';

async function searchTavily(query) {
  try {
    const res = await retryAsync(
      () => withTimeout(
        () => fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query,
            topic: 'general',
            search_depth: 'advanced',
            max_results: 5,
            include_answer: true,
          }),
        }),
        REQUEST_TIMEOUT_MS,
        'tavily search'
      ),
      { retries: API_RETRIES, label: 'tavily search' }
    );

    if (!res.ok) return `Scout error: ${res.status} ${await res.text()}`;

    const data = await res.json();
    const answer = data.answer ? `Summary:\n${data.answer}\n\n` : '';
    const results = Array.isArray(data.results) ? data.results : [];

    if (!results.length) return `${answer}No useful results found.`;

    return answer + results
      .map((r, i) => `${i + 1}. ${r.title || 'Untitled'}\n${r.url || ''}\n${clip(r.content || '', 300)}`)
      .join('\n\n');
  } catch (error) {
    return `Scout error: ${error.message}`;
  }
}

export { searchTavily };
