import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { screenBook } from '../src/server/services/book-screening.service.js';

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('<'))
  throw new Error('Set a Books-only GEMINI_API_KEY before explicitly running this live evaluation.');
const { screeningCases: cases } = await import('./screening-cases.js');
const selected = process.argv.slice(2);
const results = [];
for (const item of cases.filter((row) => !selected.length || selected.includes(row.name))) {
  const verdict = await screenBook(item.pdf);
  const passed = item.allowed.includes(verdict.outcome);
  results.push({ name: item.name, expected: item.allowed, passed, ...verdict, checkedAt: new Date().toISOString() });
  console.log(`${item.name}: ${verdict.outcome}, ${passed ? 'passed' : 'failed'}`);
}
await mkdir('.data/evaluations', { recursive: true });
await writeFile(`.data/evaluations/${Date.now()}.json`, JSON.stringify(results, null, 2));
if (!results.length || results.some((row) => !row.passed)) process.exitCode = 1;
