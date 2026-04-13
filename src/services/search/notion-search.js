import { REQUEST_TIMEOUT_MS, API_RETRIES } from '../../app/constants.js';
import { retryAsync } from '../../utils/retry.js';
import { withTimeout } from '../../utils/timeout.js';
import { notion } from './notion-client.js';

async function notionSearch(query) {
  try {
    const response = await retryAsync(
      () => withTimeout(
        () => notion.search({ query, page_size: 10 }),
        REQUEST_TIMEOUT_MS,
        'notion search'
      ),
      { retries: API_RETRIES, label: 'notion search' }
    );
    return response.results || [];
  } catch (error) {
    console.error('Notion search failed:', error.message);
    return [];
  }
}

function formatNotionSearchResults(results) {
  if (!results.length) return 'No Notion results found.';
  return results
    .map((item, index) => {
      const title =
        item.object === 'page'
          ? item.properties?.title?.title?.[0]?.plain_text || item.properties?.Name?.title?.[0]?.plain_text || item.url || 'Untitled page'
          : item.url || 'Untitled';

      return `${index + 1}. ${title}\n${item.url || ''}`;
    })
    .join('\n\n');
}

export { notionSearch, formatNotionSearchResults };
