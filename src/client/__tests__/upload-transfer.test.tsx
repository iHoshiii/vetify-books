import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { transferPdf } from '../upload-transfer';

let requests: FakeRequest[];
class FakeRequest {
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  withCredentials = true;
  timeout = 0;
  status = 200;
  headers: Record<string, string> = {};
  method = ''; url = ''; body?: Document | XMLHttpRequestBodyInit | null;
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void;
  constructor() { requests.push(this); }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(key: string, value: string) { this.headers[key] = value; }
  send(body: Document | XMLHttpRequestBodyInit | null) { this.body = body; }
}
beforeEach(() => { requests = []; vi.stubGlobal('XMLHttpRequest', FakeRequest); });
afterEach(() => vi.unstubAllGlobals());
const file = new File(['%PDF-synthetic'], 'book.pdf', { type: 'application/pdf' });
const target = { url: 'https://storage.invalid/signed', method: 'PUT' };
it('reports actual transferred bytes and waits for storage success before reaching 100 percent', async () => {
  const progress = vi.fn();
  const done = transferPdf(target, file, progress);
  const request = requests[0];
  expect(request.withCredentials).toBe(false);
  expect(request.body).toBe(file);
  expect(request.headers).toEqual({ 'Content-Type': 'application/pdf' });
  request.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith(25);
  request.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith(99);
  request.onload?.(); await done;
  expect(progress).toHaveBeenLastCalledWith(100);
});
it('uses browser multipart boundaries for POST fields and never adds application credentials', async () => {
  const done = transferPdf({ ...target, method: 'POST', fields: { key: 'incoming/book.pdf' } }, file, vi.fn());
  const request = requests[0];
  expect(request.method).toBe('POST');
  expect(request.headers).toEqual({});
  expect((request.body as FormData).get('key')).toBe('incoming/book.pdf');
  expect((request.body as FormData).get('file')).toBe(file);
  request.status = 204; request.onload?.(); await done;
});
it.each(['network', 'timeout', 'abort', 'status'])('surfaces a %s failure without reporting success', async reason => {
  const progress = vi.fn();
  const done = transferPdf(target, file, progress);
  const rejected = expect(done).rejects.toThrow();
  const request = requests[0];
  if (reason === 'network') request.onerror?.();
  if (reason === 'timeout') request.ontimeout?.();
  if (reason === 'abort') request.onabort?.();
  if (reason === 'status') { request.status = 403; request.onload?.(); }
  await rejected;
  expect(progress).not.toHaveBeenCalledWith(100);
});
