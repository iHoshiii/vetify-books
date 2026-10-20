import { Worker } from 'node:worker_threads';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

type PdfInspection = { pages: string[] } | { error: string };
export function inspectBookPdf(pdf: Buffer): Promise<PdfInspection> {
  return new Promise((resolve) => {
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
    const workerUrl = process.env.VERCEL === '1'
      ? pathToFileURL(resolvePath('dist/server/server/services/book-pdf.worker.js'))
      : new URL(`./book-pdf.worker.${extension}`, import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: new Uint8Array(pdf),
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let settled = false;
    const finish = (result: PdfInspection) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ error: 'unreadable' }), 30_000);
    worker.once('message', (result: PdfInspection) => finish(result));
    worker.once('error', () => finish({ error: 'unreadable' }));
    worker.once('exit', () => finish({ error: 'unreadable' }));
  });
}

