import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookSummary } from '../../shared/books';
import { write } from '../api';
import { usePdf } from './use-pdf';
import { LoadingScreen } from './loading-screen';

export default function PdfPreview({ book, csrf, busy, downloadError, onClose, onDownload }: {
  book: BookSummary; csrf: string; busy: boolean; downloadError?: string; onClose: () => void; onDownload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const grant = useQuery({ queryKey: ['preview', book.id],
    queryFn: () => write<{ url: string }>(`/books/${book.id}/preview`, csrf), retry: false,
    gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const pdf = usePdf(grant.data?.url, page, canvas, zoom);
  const error = grant.error?.message || pdf.error;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog ref={dialog} className="pdf-preview" aria-labelledby="preview-title" onCancel={event => {
    event.preventDefault(); onClose();
  }}>
    <header className="preview-header"><h2 id="preview-title">{book.title}</h2>
      <button className="text-button" onClick={onClose} autoFocus>Close</button></header>
    <div className="preview-content">
      {error ? <p className="notice error" role="alert">{error}</p> : (grant.isPending || pdf.loading) && <LoadingScreen />}
      <canvas ref={canvas} hidden={!!error || pdf.loading} style={{ maxWidth: zoom > 1 ? 'none' : '100%' }} aria-label={`Page ${page} of ${pdf.pages}`} />
    </div>
    <footer className="preview-controls"><div className="preview-pages">
      <button className="button secondary small" disabled={page <= 1 || pdf.loading || !!error} onClick={() => setPage(page - 1)}>Previous</button>
      <span>{pdf.pages ? `Page ${page} of ${pdf.pages}` : 'Preview'}</span>
      <button className="button secondary small" disabled={page >= pdf.pages || pdf.loading || !!error} onClick={() => setPage(page + 1)}>Next</button>
    </div><button className="button small" disabled={busy} onClick={onDownload}>{busy ? 'Preparing...' : 'Download'}</button>
      <div className="preview-zoom"><button className="button secondary small" disabled={zoom <= .75 || pdf.loading || !!error}
        onClick={() => setZoom(Math.max(.75, zoom - .25))}>Zoom out</button><span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className="button secondary small" disabled={zoom >= 3 || pdf.loading || !!error}
          onClick={() => setZoom(Math.min(3, zoom + .25))}>Zoom in</button></div>
      {downloadError && <p className="notice error preview-error" role="alert">{downloadError}</p>}</footer>
  </dialog>;
}
