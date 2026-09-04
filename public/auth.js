import { api, setBusy } from './app.js';

const form = document.querySelector('#auth-form');
const errorElement = document.querySelector('#form-error');
const statusElement = document.querySelector('#form-status');
const submitButton = document.querySelector('#submit-button');
const title = document.querySelector('#auth-title');
const subtitle = document.querySelector('#auth-subtitle');
const mainTabs = [...document.querySelectorAll('.tab')];
const methodTabs = [...document.querySelectorAll('.auth-method-tab')];
const views = [...document.querySelectorAll('[data-auth-view]')];
const methodTabList = document.querySelector('#login-method-tabs');

let mode = new URLSearchParams(window.location.search).get('mode') === 'login' ? 'login' : 'register';
let view = mode === 'register' ? 'register' : 'email-login';

function setRequiredInputs(activeView) {
  views.forEach((panel) => {
    const isActive = panel.dataset.authView === activeView;
    panel.hidden = !isActive;
    panel.querySelectorAll('input').forEach((input) => {
      input.disabled = !isActive;
      input.required = false;
    });
  });

  const requiredIds = {
    'email-login': ['login-email', 'login-password'],
    'phone-login': ['login-phone', 'login-code'],
    register: ['register-email', 'register-password'],
    reset: ['reset-phone', 'reset-code', 'reset-password'],
  }[activeView] || [];
  requiredIds.forEach((id) => { document.querySelector(`#${id}`).required = true; });
}

function render() {
  const registering = view === 'register';
  const resetting = view === 'reset';
  const phoneLogin = view === 'phone-login';
  title.textContent = registering ? '创建你的数码名片' : (resetting ? '重设登录密码' : '欢迎回来');
  subtitle.textContent = registering
    ? '用一个账号，开始整理你的数字身份。'
    : (resetting ? '验证已绑定的手机号后，即可设置新密码。' : '登录后进入名片夹，查看和管理你的联系人。');
  submitButton.textContent = registering ? '注册并创建名片' : (resetting ? '确认重设并登录' : (phoneLogin ? '验证码登录' : '登录'));
  methodTabList.hidden = mode !== 'login' || resetting;
  mainTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)));
  methodTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === view)));
  setRequiredInputs(view);
  errorElement.textContent = '';
  statusElement.textContent = '';
  const query = mode === 'register' ? '?mode=register' : '?mode=login';
  window.history.replaceState({}, '', `/auth.html${query}`);
}

function value(id) {
  return document.querySelector(`#${id}`).value.trim();
}

mainTabs.forEach((tab) => tab.addEventListener('click', () => {
  mode = tab.dataset.mode;
  view = mode === 'register' ? 'register' : 'email-login';
  render();
}));

methodTabs.forEach((tab) => tab.addEventListener('click', () => {
  view = tab.dataset.view;
  render();
}));

document.querySelector('#forgot-password').addEventListener('click', () => {
  mode = 'login';
  view = 'reset';
  render();
});

document.querySelector('#back-to-login').addEventListener('click', () => {
  view = 'email-login';
  render();
});

document.querySelectorAll('[data-send-code]').forEach((button) => {
  button.addEventListener('click', async () => {
    const phone = value(button.dataset.phoneTarget);
    errorElement.textContent = '';
    statusElement.textContent = '';
    setBusy(button, true, '发送中…');
    try {
      const payload = await api('/api/auth/sms-code', {
        method: 'POST',
        body: { phone, purpose: button.dataset.sendCode },
      });
      statusElement.textContent = `演示验证码：${payload.demo_code}（5 分钟内有效）`;
      const codeInput = document.querySelector(button.dataset.sendCode === 'reset' ? '#reset-code' : '#login-code');
      codeInput.focus();
    } catch (error) {
      errorElement.textContent = error.message;
    } finally {
      setBusy(button, false);
    }
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';
  statusElement.textContent = '';
  if (!form.reportValidity()) return;

  const action = {
    'email-login': { url: '/api/auth/login', body: { email: value('login-email'), password: value('login-password') }, busy: '正在登录…', destination: '/directory.html' },
    'phone-login': { url: '/api/auth/login/phone', body: { phone: value('login-phone'), code: value('login-code') }, busy: '正在验证…', destination: '/directory.html' },
    register: { url: '/api/auth/register', body: { email: value('register-email'), phone: value('register-phone'), password: value('register-password') }, busy: '正在创建账号…', destination: '/editor.html' },
    reset: { url: '/api/auth/password/reset', body: { phone: value('reset-phone'), code: value('reset-code'), password: value('reset-password') }, busy: '正在重设…', destination: '/directory.html' },
  }[view];

  setBusy(submitButton, true, action.busy);
  try {
    await api(action.url, { method: 'POST', body: action.body });
    window.location.href = action.destination;
  } catch (error) {
    errorElement.textContent = error.message;
    setBusy(submitButton, false);
  }
});

try {
  await api('/api/auth/me');
  window.location.href = '/directory.html';
} catch {
  render();
}
