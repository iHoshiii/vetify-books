import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const opaque = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function seal(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function unseal(value: string, key: string) {
  const data = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
}
