async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const createScan = (url, lang) => request('/api/scans', { method: 'POST', body: JSON.stringify({ url, lang }) });
export const getScan = (id) => request(`/api/scans/${encodeURIComponent(id)}`);
export const requestExplanation = (id, lang) =>
  request(`/api/scans/${encodeURIComponent(id)}/explain`, { method: 'POST', body: JSON.stringify({ lang }) });
export const getDashboard = () => request('/api/dashboard');
export const createSms = (text, lang) => request('/api/sms', { method: 'POST', body: JSON.stringify({ text, lang }) });
export const getSms = (group) => request(`/api/sms/${encodeURIComponent(group)}`);

// Optional accounts (cookies are sent automatically; nothing is stored in the browser).
export const getMe = () => request('/api/auth/me');
export const signup = (email, password, name) =>
  request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
export const login = (email, password) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const logout = () => request('/api/auth/logout', { method: 'POST', body: '{}' });
export const getHistory = () => request('/api/me/history');

// Small status light for the AI service.
export const getAiStatus = () => request('/api/ai/status');

// PDF downloads (plain links, the browser saves the file).
export const scanPdfUrl = (id) => `/api/scans/${encodeURIComponent(id)}/pdf`;
export const smsPdfUrl = (group) => `/api/sms/${encodeURIComponent(group)}/pdf`;
