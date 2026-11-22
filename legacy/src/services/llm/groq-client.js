import OpenAI from 'openai';
import { GROQ_API_KEY } from '../../app/env.js';

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export { groq };
