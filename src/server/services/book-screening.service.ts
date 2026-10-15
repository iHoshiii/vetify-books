import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { inspectBookPdf } from './pdf-inspection.js';
import { PROMPT, answerSchema, responseSchema, BOOK_SCREENING_RULES_VERSION } from './screening-policy.js';
export { inspectBookPdf, BOOK_SCREENING_RULES_VERSION };
const model = process.env.GEMINI_BOOK_MODEL ?? 'gemini-3.5-flash';

export type BookScreenResult = {
  outcome: 'approved' | 'rejected' | 'uncertain' | 'unavailable';
  reason: string;
  model: string;
  rulesVersion: string;
  evidence: { page: number; excerpt: string }[];
  topics: string[];
  documentType: string;
};

function result(outcome: BookScreenResult['outcome'], reason: string): BookScreenResult {
  return {
    outcome,
    reason,
    model,
    rulesVersion: BOOK_SCREENING_RULES_VERSION,
    evidence: [],
    topics: [],
    documentType: 'other',
  };
}
function normalized(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function screenBook(pdf: Buffer): Promise<BookScreenResult> {
  const inspection = await inspectBookPdf(pdf);
  if ('error' in inspection) {
    if (inspection.error === 'empty')
      return result(
        'rejected',
        'The PDF has no readable content. Upload a veterinary book or article.'
      );
    if (inspection.error === 'invalid')
      return result('rejected', 'The PDF is damaged or invalid. Upload a readable PDF.');
    if (inspection.error === 'active-content')
      return result('rejected', 'Upload a PDF without embedded files or scripts.');
    if (inspection.error === 'password')
      return result('uncertain', 'Remove the PDF password so its content can be checked.');
    if (inspection.error === 'too-long')
      return result(
        'uncertain',
        'This PDF exceeds the 1,000-page checking limit. Upload a shorter document.'
      );
    return result(
      'uncertain',
      'The PDF could not be read completely. Upload a clearer or smaller copy.'
    );
  }
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('<')) return result('unavailable', 'Checking is temporarily unavailable.');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Inspect all ${inspection.pages.length} physical PDF pages using the veterinary library policy.`,
            },
            { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
          ],
        },
      ],
      config: {
        systemInstruction: PROMPT,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema,
        abortSignal: AbortSignal.timeout(60_000),
      },
    });
    const answer = answerSchema.parse(JSON.parse(response.text ?? ''));
    if (!answer.readable || !answer.fullReview) {
      return result(
        'uncertain',
        'The whole document could not be verified. Upload a clearer copy or try checking again.'
      );
    }
    const evidenceValid = answer.evidence.every((item) => {
      const text = inspection.pages[item.page - 1];
      // Scans have no text to match; vision evidence still needs a real page number.
      return (
        text !== undefined && (!text.trim() || normalized(text).includes(normalized(item.excerpt)))
      );
    });
    if (
      !evidenceValid ||
      (answer.decision === 'approve' &&
        (!answer.veterinaryFocus ||
          !answer.substantive ||
          answer.documentType === 'other' ||
          answer.evidence.length === 0 ||
          answer.topics.length === 0))
    ) {
      return result(
        'uncertain',
        'The veterinary relevance could not be established from the document. Try checking again.'
      );
    }
    return {
      ...result(
        answer.decision === 'approve'
          ? 'approved'
          : answer.decision === 'reject'
          ? 'rejected'
          : 'uncertain',
        answer.reason
      ),
      evidence: answer.evidence,
      topics: answer.topics,
      documentType: answer.documentType,
    };
  } catch (error) {
    // Missing/malformed verdicts, safety blocks, rate limits, and outages never publish.
    const cause =
      error instanceof z.ZodError
        ? `invalid verdict fields: ${error.issues.map((issue) => issue.path.join('.')).join(', ')}`
        : `provider status ${
            (error as { status?: number }).status ?? (error as Error).name ?? 'unknown'
          }`;
    console.warn(`[books] automatic check unavailable (${cause})`);
    return result(
      'unavailable',
      'Checking is temporarily unavailable. We will try again automatically.'
    );
  }
}
