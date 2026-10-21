import { useEffect, useState, type RefObject } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
export function usePdf(url: string | undefined, page: number, canvas: RefObject<HTMLCanvasElement>, zoom = 1) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setDocument(undefined); setError(''); setLoading(true);
    if (!url) return;
    let active = true;
    const task = getDocument({ url, withCredentials: false, disableRange: true, disableStream: true, enableXfa: false });
    void task.promise.then(pdf => { if (active) setDocument(pdf); }).catch(() => {
      if (active) { setError('The preview could not be opened. Close it and try again.'); setLoading(false); }
    });
    return () => { active = false; void task.destroy().catch(() => {}); };
  }, [url]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    setLoading(true);
    void document.getPage(page).then(async pdfPage => {
      if (!active || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const width = Math.max(240, Math.min(window.innerWidth - 96, 840));
      const viewport = pdfPage.getViewport({ scale: Math.min(width / base.width, 1400 / base.height) * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8000000 / (viewport.width * viewport.height)));
      canvas.current.width = Math.ceil(viewport.width * ratio);
      canvas.current.height = Math.ceil(viewport.height * ratio);
      canvas.current.style.width = `${viewport.width}px`;
      render = pdfPage.render({ canvas: canvas.current, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (active) setLoading(false);
    }).catch(failure => {
      if (active && failure?.name !== 'RenderingCancelledException') {
        setError('This page could not be shown. Close the preview and try again.'); setLoading(false);
      }
    });
    return () => { active = false; render?.cancel(); };
  }, [document, page, canvas, zoom]);
  return { pages: document?.numPages ?? 0, loading, error };
}
