import { parentPort, workerData } from 'node:worker_threads';
import { getDocument, OPS, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Parsing runs off the HTTP thread with a time and memory limit set by the caller.
const task = getDocument({
  data: workerData as Uint8Array,
  stopAtErrors: true,
  useSystemFonts: false,
  verbosity: VerbosityLevel.ERRORS,
});
try {
  const pdf = await task.promise;
  if (pdf.numPages > 1000) {
    parentPort?.postMessage({ error: 'too-long' });
  } else if ((await pdf.getJSActions())?.size || (await pdf.getAttachments())?.size) {
    parentPort?.postMessage({ error: 'active-content' });
  } else {
    const pages: string[] = [];
    let hasContent = false;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      if ((await page.getJSActions())?.size) {
        parentPort?.postMessage({ error: 'active-content' });
        await task.destroy();
        process.exit(0);
      }
      const text = await page.getTextContent();
      // Image-only pages are valid: the AI receives the original PDF for vision.
      const writing = text.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => item.str)
        .join(' ')
        .slice(0, 20000);
      pages.push(writing);
      if (writing.trim()) hasContent = true;
      else {
        const operators = await page.getOperatorList();
        const drawing = new Set<number>([
          OPS.paintImageXObject,
          OPS.paintInlineImageXObject,
          OPS.paintImageMaskXObject,
          OPS.stroke,
          OPS.fill,
          OPS.eoFill,
          OPS.fillStroke,
          OPS.eoFillStroke,
          OPS.shadingFill,
        ]);
        if (operators.fnArray.some((operator) => drawing.has(operator))) hasContent = true;
      }
      page.cleanup();
    }
    parentPort?.postMessage(hasContent ? { pages } : { error: 'empty' });
  }
} catch (error) {
  parentPort?.postMessage({
    error: (error as Error).name === 'PasswordException' ? 'password' : 'invalid',
  });
} finally {
  await task.destroy();
}
