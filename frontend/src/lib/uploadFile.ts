// Standalone multipart upload helper for POST /api/upload.
//
// Deliberately NOT part of `lib/api.ts` (protected file) — that wrapper
// always JSON.stringifies `body` and forces `Content-Type: application/json`,
// which breaks multipart/form-data (the browser must set its own boundary).
// This duplicates just the two things a mutating call needs from api.ts
// (CSRF header + credentials) rather than extending the protected file.
import { API_URL, COOKIE_PREFIX } from './constants';
import { ApiError } from './api';

const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf`;

function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_COOKIE_NAME);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export interface UploadedFile {
  id: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['x-csrf-token'] = csrfToken;

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    body: form,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(res.status, (body.message as string) || `Error ${res.status}`, {
      error: body.code,
      ...body,
    });
  }

  return res.json() as Promise<UploadedFile>;
}
