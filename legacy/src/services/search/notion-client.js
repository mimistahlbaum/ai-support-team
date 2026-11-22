import { Client as NotionClient } from '@notionhq/client';
import { NOTION_KEY } from '../../app/env.js';

const notion = new NotionClient({ auth: NOTION_KEY });

export { notion };
