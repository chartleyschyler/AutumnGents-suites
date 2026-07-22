// ---------------------------------------------------------------------
// Global config
// ---------------------------------------------------------------------
const API_BASE = (() => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:5000/api`;
  }
  return 'http://localhost:5000/api';
})();

// ---------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------
const Auth = {
  getAccessToken: () => localStorage.getItem('ags_access_token'),
  getRefreshToken: () => localStorage.getItem('ags_refresh_token'),
  getUser: () => JSON.parse(localStorage.getItem('ags_user') || 'null'),
  setSession: ({ accessToken, refreshToken, user }) => {
    if (accessToken) localStorage.setItem('ags_access_token', accessToken);
    if (refreshToken) localStorage.setItem('ags_refresh_token', refreshToken);
    if (user) localStorage.setItem('ags_user', JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem('ags_access_token');
    localStorage.removeItem('ags_refresh_token');
    localStorage.removeItem('ags_user');
  },
  requireRole(role) {
    const user = this.getUser();
    if (!user || user.role !== role || !this.getAccessToken()) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  },
};

// ---------------------------------------------------------------------
// Fetch wrapper - attaches JWT, auto-refreshes on 401
// ---------------------------------------------------------------------
async function api(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth && Auth.getAccessToken()) headers['Authorization'] = `Bearer ${Auth.getAccessToken()}`;

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && auth && Auth.getRefreshToken()) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: Auth.getRefreshToken() }),
    });
    if (refreshRes.ok) {
      const { accessToken } = await refreshRes.json();
      Auth.setSession({ accessToken });
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await doFetch();
    } else {
      Auth.clearSession();
      window.location.href = 'login.html';
      return null;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function formatMoney(amount, currency = 'KES') {
  return `${currency} ${Number(amount).toLocaleString()}`;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr + 'Z')) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
