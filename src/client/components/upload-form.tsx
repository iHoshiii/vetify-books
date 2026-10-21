import { useState, type FormEvent } from 'react';
import { BOOK_MAX_BYTES, BOOK_TOPICS } from '../../shared/books';
import { write } from '../api';
import { transferPdf, type UploadTarget } from '../upload-transfer';

export function UploadForm({ csrf, onClose, onComplete }: { csrf: string; onClose: () => void; onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Preparing PDF');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fileInput = event.currentTarget.elements.namedItem('pdf');
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : values.get('pdf');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf') || file.size === 0 || file.size > BOOK_MAX_BYTES) {
      setError('Choose a PDF document of up to 10 MB.'); return;
    }
    setBusy(true);
    setStage('Preparing PDF'); setProgress(0);
    setError('');
    try {
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
      const result = await write<{ book: { id: string }; upload: UploadTarget }>(
        '/books/uploads', csrf, { title: String(values.get('title')), description: String(values.get('description')),
          topic: String(values.get('topic')), veterinaryOnly: values.get('veterinaryOnly') === 'on', size: file.size, sha256 });
      setStage('Uploading PDF');
      await transferPdf(result.upload, file, setProgress);
      setStage('Finishing upload');
      await write(`/books/${result.book.id}/complete`, csrf);
      onComplete();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }
  return <section className="upload-panel" id="book-upload" aria-label="Upload document">
    <div className="panel-title"><div><h2>Upload book</h2><p>Add a PDF for review.</p></div>
      <button aria-label="Close upload" className="text-button" disabled={busy} onClick={onClose}>Cancel</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
      <div className="form-grid"><label>Title<input name="title" required minLength={3} maxLength={150} placeholder="Document title" /></label>
        <label>Topic<select name="topic" required>{BOOK_TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label></div>
      <label>Description<textarea name="description" required minLength={10} maxLength={1000} rows={3} placeholder="What will readers learn?" /></label>
      <label className="file-label">PDF document<input name="pdf" type="file" accept=".pdf,application/pdf" required /><span>PDF only, up to 10 MB.</span></label>
      <label className="consent"><input name="veterinaryOnly" type="checkbox" required />
        <span>I have permission to share this document. Its main purpose is veterinary education, animal health, welfare, or practice.</span></label>
      <p className="form-note">Your book stays private until approved. Review does not confirm medical accuracy or sharing rights.</p>
      </fieldset>
      {error && <p role="alert" className="notice error">{error}</p>}
      {busy && <div className="upload-progress"><p role="status">{stage}{stage === 'Uploading PDF' ? ` ${progress}%` : '...'}</p>
        <progress aria-label="Upload progress" max={100} value={stage === 'Uploading PDF' ? progress : undefined} /></div>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Uploading...' : 'Upload for review'}</button>
    </form>
  </section>;
}
