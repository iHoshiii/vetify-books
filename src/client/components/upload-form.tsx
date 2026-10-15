import { useState, type FormEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { BOOK_MAX_BYTES, BOOK_TOPICS } from '../../shared/books';
import { write } from '../api';

export function UploadForm({ csrf, onClose, onComplete }: { csrf: string; onClose: () => void; onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fileInput = event.currentTarget.elements.namedItem('pdf');
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : values.get('pdf');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf') || file.size === 0 || file.size > BOOK_MAX_BYTES) {
      setError('Choose a PDF document of up to 10 MB.'); return;
    }
    setBusy(true);
    setError('');
    try {
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
      const result = await write<{ book: { id: string }; upload: { url: string; method: string; fields?: Record<string, string> } }>(
        '/books/uploads', csrf, { title: String(values.get('title')), description: String(values.get('description')),
          topic: String(values.get('topic')), veterinaryOnly: values.get('veterinaryOnly') === 'on', size: file.size, sha256 });
      let body: BodyInit = file;
      const headers: Record<string, string> = {};
      if (result.upload.fields) {
        const form = new FormData();
        Object.entries(result.upload.fields).forEach(([key, value]) => form.append(key, value));
        form.append('file', file);
        body = form;
      } else headers['Content-Type'] = 'application/pdf';
      const upload = await fetch(result.upload.url, { method: result.upload.method, headers, body, credentials: 'omit' });
      if (!upload.ok) throw new Error('PDF transfer failed. Start a new submission.');
      await write(`/books/${result.book.id}/complete`, csrf);
      onComplete();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }
  return <section className="upload-panel" id="book-upload" aria-label="Upload document">
    <div className="panel-title"><div><h2>Share a veterinary resource</h2><p>Books, articles, research, case studies, and educational guides.</p></div>
      <button aria-label="Close upload" className="icon-button" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <form onSubmit={submit}>
      <div className="form-grid"><label>Title<input name="title" required minLength={3} maxLength={150} placeholder="Document title" /></label>
        <label>Topic<select name="topic" required>{BOOK_TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label></div>
      <label>Description<textarea name="description" required minLength={10} maxLength={1000} rows={3} placeholder="What will readers learn?" /></label>
      <label className="file-label">PDF document<input name="pdf" type="file" accept=".pdf,application/pdf" required /><span>PDF only, up to 10 MB.</span></label>
      <label className="consent"><input name="veterinaryOnly" type="checkbox" required />
        <span>I have permission to share this document. Its main purpose is veterinary education, animal health, welfare, or practice.</span></label>
      <p className="form-note">Documents stay private until screening approves their veterinary relevance. Approval does not certify clinical accuracy or sharing rights.</p>
      {error && <p role="alert" className="notice error">{error}</p>}
      <button className="button" type="submit" disabled={busy}><Upload size={16} />{busy ? 'Uploading...' : 'Upload for checking'}</button>
    </form>
  </section>;
}
