export async function api(url, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };
  if (config.body && !(config.body instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '请求失败，请稍后再试');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function showToast(message, type = 'success') {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

export function setBusy(button, busy, busyLabel = '处理中…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

export function initials(name = '') {
  const chars = Array.from(name.trim());
  return chars.slice(0, 2).join('').toUpperCase() || '名片';
}

export function createImage(src, alt) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  return img;
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

