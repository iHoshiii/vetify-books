export type UploadTarget = { url: string; method: string; fields?: Record<string, string> };
export function transferPdf(target: UploadTarget, file: File, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(target.method, target.url);
    request.withCredentials = false;
    request.timeout = 120000;
    let body: File | FormData = file;
    if (target.fields) {
      body = new FormData();
      Object.entries(target.fields).forEach(([key, value]) => (body as FormData).append(key, value));
      body.append('file', file);
    } else request.setRequestHeader('Content-Type', 'application/pdf');
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total) progress(Math.min(99, Math.floor(event.loaded / event.total * 100)));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { progress(100); resolve(); }
      else reject(new Error('The PDF could not be uploaded. Please try again.'));
    };
    request.onerror = () => reject(new Error('The connection was lost. Please try again.'));
    request.ontimeout = () => reject(new Error('The upload took too long. Please try again.'));
    request.onabort = () => reject(new Error('The upload was cancelled.'));
    request.send(body);
  });
}
