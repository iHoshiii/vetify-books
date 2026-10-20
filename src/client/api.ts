export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const base = import.meta.env.VITE_API_URL ?? '/api/v1';
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: 'include', headers: {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers,
  } });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Books is temporarily unavailable.');
  return data as T;
}
export function write<T>(path: string, csrf: string, body?: object, headers?: Record<string, string>) {
  return api<T>(path, { method: 'POST', headers: { 'X-CSRF-Token': csrf, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
