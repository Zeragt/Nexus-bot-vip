/** طلبات الخادم. كل المسارات نسبية حتى تعمل عبر وكيل Discord (discordsays.com). */
let session = null;
export const setSession = (s) => (session = s);
export const getSession = () => session;

export async function api(path, body, method) {
  const res = await fetch(`/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `خطأ ${res.status}`), { status: res.status });
  return data;
}
