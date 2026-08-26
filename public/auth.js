import { api, setBusy } from './app.js';

const form = document.querySelector('#auth-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const errorElement = document.querySelector('#form-error');
const submitButton = document.querySelector('#submit-button');
const title = document.querySelector('#auth-title');
const subtitle = document.querySelector('#auth-subtitle');
const hint = document.querySelector('#password-hint');
const tabs = [...document.querySelectorAll('.tab')];
let mode = new URLSearchParams(window.location.search).get('mode') === 'login' ? 'login' : 'register';

function renderMode() {
  const registering = mode === 'register';
  title.textContent = registering ? '创建你的数码名片' : '欢迎回来';
  subtitle.textContent = registering ? '用一个账号，开始整理你的数字身份。' : '登录后继续编辑和分享你的名片。';
  hint.textContent = registering ? '至少 8 个字符' : '';
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  submitButton.textContent = registering ? '注册并创建名片' : '登录';
  tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)));
  errorElement.textContent = '';
  window.history.replaceState({}, '', `/auth.html?mode=${mode}`);
}

tabs.forEach((tab) => tab.addEventListener('click', () => {
  mode = tab.dataset.mode;
  renderMode();
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';
  if (!form.reportValidity()) return;
  setBusy(submitButton, true, mode === 'register' ? '正在创建账号…' : '正在登录…');
  try {
    await api(`/api/auth/${mode}`, {
      method: 'POST',
      body: { email: emailInput.value, password: passwordInput.value },
    });
    window.location.href = '/editor.html';
  } catch (error) {
    errorElement.textContent = error.message;
    setBusy(submitButton, false);
  }
});

try {
  await api('/api/auth/me');
  window.location.href = '/editor.html';
} catch {
  renderMode();
}

