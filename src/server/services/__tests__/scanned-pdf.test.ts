import { createCanvas } from '@napi-rs/canvas';
import { it, expect, vi } from 'vitest';
import { makeScannedBookPdf } from '../../test-utils/book-pdf.js';

const ai = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@google/genai', async (original) => ({
  ...(await original<typeof import('@google/genai')>()),
  GoogleGenAI: class { models = { generateContent: ai.generate }; },
}));
import { inspectBookPdf, screenBook } from '../book-screening.service.js';

it('preserves image-only PDFs and sends their actual bytes for whole-document vision', async () => {
  const canvas = createCanvas(600, 400);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 600, 400);
  context.fillStyle = 'black'; context.font = '24px Arial';
  context.fillText('Veterinary animal welfare education', 20, 80);
  const pdf = makeScannedBookPdf(canvas.toBuffer('image/jpeg'), 600, 400);
  expect(await inspectBookPdf(pdf)).toEqual({ pages: [''] });
  ai.generate.mockResolvedValue({ text: JSON.stringify({ decision: 'approve', veterinaryFocus: true, substantive: true,
    readable: true, fullReview: true, documentType: 'article', topics: ['Animal welfare'],
    reason: 'Readable veterinary education.', evidence: [{ page: 1, excerpt: 'Animal welfare education in the page image.' }] }) });
  expect((await screenBook(pdf)).outcome).toBe('approved');
  expect(ai.generate.mock.calls[0][0].contents[0].parts[1].inlineData.data).toBe(pdf.toString('base64'));
});
