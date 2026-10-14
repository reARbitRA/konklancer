// SPEC-003 R5. Tab-scoped credentials, sent only to this app's API.
const KEY = 'konklancer_api_token';
export const AUTH_EXPIRED = 'konklancer:auth-expired';
export const getApiToken = () => sessionStorage.getItem(KEY) || '';
export function setApiToken(token: string) {
  if (token) sessionStorage.setItem(KEY, token);
  else sessionStorage.removeItem(KEY);
}
export function logout() {
  setApiToken('');
  window.dispatchEvent(new Event(AUTH_EXPIRED));
}
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('Personal credentials may only be sent to same-origin API routes.');
  }
  const headers = new Headers(init.headers);
  const token = getApiToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await window.fetch(input, { ...init, headers });
  if (response.status === 401) logout();
  return response;
}
