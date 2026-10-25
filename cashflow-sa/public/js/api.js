export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const err = new Error(data?.error ?? 'Something went wrong. Please try again.');
    err.status = res.status;
    err.field = data?.field;
    throw err;
  }
  return data;
}
