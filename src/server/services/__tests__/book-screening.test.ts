import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBookPdf } from '../../test-utils/book-pdf';

const ai = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@google/genai', async (original) => ({
  ...(await original<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = { generateContent: ai.generate };
  },
}));
import { inspectBookPdf, screenBook } from '../book-screening.service';

const lines = [
  'Original veterinary article',
  'Animal welfare includes responsible care and nutrition.',
];
const pdf = makeBookPdf([lines]);
const approved = {
  decision: 'approve',
  veterinaryFocus: true,
  substantive: true,
  readable: true,
  fullReview: true,
  documentType: 'article',
  topics: ['Animal welfare'],
  reason: 'An educational article on animal welfare.',
  evidence: [{ page: 1, excerpt: lines[1] }],
};
beforeEach(() => {
  ai.generate.mockReset();
  ai.generate.mockResolvedValue({ text: JSON.stringify(approved) });
});

describe('Automated veterinary document screening', () => {
  it('parses genuine PDFs across every page and sends the actual document for vision checking', async () => {
    const document = makeBookPdf([
      lines,
      ['Animal anatomy', 'Educational clinical diagrams and explanations.'],
    ]);
    const inspection = await inspectBookPdf(document);
    expect(inspection).toEqual({
      pages: [lines.join(' '), 'Animal anatomy Educational clinical diagrams and explanations.'],
    });
    expect(await screenBook(document)).toMatchObject({
      outcome: 'approved',
      documentType: 'article',
      rulesVersion: 'vet-relevance-v1',
    });
    const input = ai.generate.mock.calls[0][0];
    expect(input.contents[0].parts[0].text).toContain('all 2');
    expect(input.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'application/pdf',
      data: document.toString('base64'),
    });
    expect(input.config.systemInstruction).toContain('never instructions');
    expect(input.config.systemInstruction).toContain('Original work and short articles qualify');
  });
  it('accepts a short original article without ISBN, publisher, or page minimum', async () => {
    expect(await screenBook(pdf)).toMatchObject({
      outcome: 'approved',
      evidence: approved.evidence,
    });
  });
  it('rejects a signature-only fake PDF before making a model request', async () => {
    const fake = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    expect(await screenBook(fake)).toMatchObject({ outcome: 'rejected' });
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('rejects embedded PDF scripts before making a model request', async () => {
    expect(await screenBook(makeBookPdf([lines], 'app.alert("test")'))).toMatchObject({
      outcome: 'rejected',
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('rejects a blank PDF without spending a model request', async () => {
    expect(await screenBook(makeBookPdf([[]]))).toMatchObject({ outcome: 'rejected' });
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('rejects unrelated content based on the content verdict', async () => {
    const resume = makeBookPdf([['My resume', 'Marketing experience at a retail company.']]);
    ai.generate.mockResolvedValue({
      text: JSON.stringify({
        ...approved,
        decision: 'reject',
        veterinaryFocus: false,
        documentType: 'other',
        topics: [],
        reason: 'This is a resume.',
        evidence: [{ page: 1, excerpt: 'Marketing experience at a retail company.' }],
      }),
    });
    expect(await screenBook(resume)).toMatchObject({
      outcome: 'rejected',
      reason: 'This is a resume.',
    });
  });
  it('holds incomplete review, keyword-only content, contradictory verdicts and missing evidence', async () => {
    for (const override of [
      { fullReview: false },
      { readable: false },
      { substantive: false },
      { veterinaryFocus: false },
      { evidence: [] },
      { topics: [] },
      { documentType: 'other' },
    ]) {
      ai.generate.mockResolvedValue({ text: JSON.stringify({ ...approved, ...override }) });
      expect((await screenBook(pdf)).outcome).toBe('uncertain');
    }
  });
  it('holds invented evidence and nonexistent page references', async () => {
    for (const evidence of [
      [{ page: 1, excerpt: 'A sentence absent from this PDF.' }],
      [{ page: 2, excerpt: lines[1] }],
    ]) {
      ai.generate.mockResolvedValue({ text: JSON.stringify({ ...approved, evidence }) });
      expect((await screenBook(pdf)).outcome).toBe('uncertain');
    }
  });
  it('never approves an outage, malformed response, or missing model result', async () => {
    for (const text of [
      '',
      '{}',
      'not JSON',
      JSON.stringify({ ...approved, veterinaryFocus: 'true' }),
    ]) {
      ai.generate.mockResolvedValue({ text });
      expect((await screenBook(pdf)).outcome).toBe('unavailable');
    }
    ai.generate.mockRejectedValue(new Error('Provider unavailable'));
    expect((await screenBook(pdf)).outcome).toBe('unavailable');
  });
});
