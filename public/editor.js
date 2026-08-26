import { api, createImage, initials, logout, setBusy, showToast } from './app.js';

const form = document.querySelector('#card-form');
const loading = document.querySelector('#editor-loading');
const cardError = document.querySelector('#card-error');
const saveButton = document.querySelector('#save-card');
const productForm = document.querySelector('#product-form');
const productError = document.querySelector('#product-error');
const addProductButton = document.querySelector('#add-product');
const importProductsButton = document.querySelector('#import-products');
const importProductsStatus = document.querySelector('#product-import-status');
const productGrid = document.querySelector('#product-grid');
const scanForm = document.querySelector('#scan-form');
const scanInput = document.querySelector('#business-card-image');
const scanButton = document.querySelector('#scan-button');
const scanError = document.querySelector('#scan-error');
const scanResult = document.querySelector('#scan-result');
const avatarInput = document.querySelector('#avatar');
const avatarPreview = document.querySelector('#avatar-preview');
const miniAvatar = document.querySelector('#mini-avatar');
const qrInput = document.querySelector('#wechat-qr');
const qrPreview = document.querySelector('#qr-preview');
const miniQr = document.querySelector('#mini-qr');
const removeQrButton = document.querySelector('#remove-qr');
const removeQrInput = document.querySelector('#remove-wechat-qr');
const nameInput = document.querySelector('#name');
const taglineInput = document.querySelector('#tagline');
const regionInput = document.querySelector('#region');
const companyInput = document.querySelector('#company_name');
const departmentInput = document.querySelector('#department');
const jobTitleInput = document.querySelector('#job_title');
const expertiseInput = document.querySelector('#expertise');
const businessInput = document.querySelector('#main_business');
const bioInput = document.querySelector('#bio');
const viewLinks = [document.querySelector('#view-card'), document.querySelector('#view-card-top')];
let card = null;
let products = [];
let objectUrl = '';
let qrObjectUrl = '';

const scanFieldLabels = {
  name: '姓名 / 主名称',
  company_name: '公司 / 组织',
  department: '部门',
  job_title: '职务 / 身份',
  phone: '手机号',
  telephone: '座机',
  contact_email: '联系邮箱',
  wechat: '微信号',
  website: '官网 / 个人主页',
  address: '详细地址',
};

function setAvatar(container, src, name) {
  container.replaceChildren();
  if (src) container.append(createImage(src, `${name || '名片'}头像`));
  else container.textContent = initials(name);
}

function setQrPreview(src) {
  qrPreview.replaceChildren();
  miniQr.replaceChildren();
  if (src) {
    qrPreview.append(createImage(src, '微信二维码'));
    miniQr.append(createImage(src, '微信二维码'));
    miniQr.hidden = false;
    removeQrButton.hidden = false;
  } else {
    qrPreview.textContent = '二维码';
    miniQr.hidden = true;
    removeQrButton.hidden = true;
  }
}

function updatePreview() {
  const name = nameInput.value.trim() || '你的名称';
  document.querySelector('#mini-name').textContent = name;
  const identity = [companyInput.value, departmentInput.value, jobTitleInput.value]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' · ');
  document.querySelector('#mini-identity').textContent = identity || '公司 · 部门 · 职务';
  document.querySelector('#mini-tagline').textContent = taglineInput.value.trim() || '一句话介绍你自己';
  document.querySelector('#mini-region').textContent = regionInput.value.trim() || '所在地区';
  const role = expertiseInput.value.trim() || businessInput.value.trim();
  document.querySelector('#mini-role').textContent = role || '专业领域或主营业务';
  if (!objectUrl) setAvatar(miniAvatar, card?.avatar_url || '', name);
  if (!objectUrl) setAvatar(avatarPreview, card?.avatar_url || '', name);
  bioInput.nextElementSibling.textContent = `${bioInput.value.length} / 200`;
}

function setPublicLinks(slug) {
  viewLinks.forEach((link) => {
    if (slug) {
      link.href = `/card.html?slug=${encodeURIComponent(slug)}`;
      link.classList.remove('is-disabled');
      link.removeAttribute('aria-disabled');
    } else {
      link.href = '#';
      link.classList.add('is-disabled');
      link.setAttribute('aria-disabled', 'true');
    }
  });
  const status = document.querySelector('#publish-status');
  status.textContent = slug ? '已发布' : '未发布';
  status.classList.toggle('is-published', Boolean(slug));
  const directoryLink = document.querySelector('#directory-nav-link');
  if (directoryLink && slug) directoryLink.href = `/directory.html?slug=${encodeURIComponent(slug)}`;
}

function fillForm(data) {
  if (!data) {
    updatePreview();
    return;
  }
  for (const [key, value] of Object.entries(data)) {
    const input = form.elements[key];
    if (input && key !== 'avatar') input.value = value || '';
  }
  if (!data.job_title && data.occupation) form.elements.job_title.value = data.occupation;
  setQrPreview(data.wechat_qr_url || '');
  removeQrInput.value = '0';
  setPublicLinks(data.slug);
  updatePreview();
}

function emptyProducts() {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const content = document.createElement('div');
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '图';
  const heading = document.createElement('h3');
  heading.textContent = '还没有产品';
  const copy = document.createElement('p');
  copy.textContent = '上传第一张图片，让名片更完整。';
  content.append(icon, heading, copy);
  empty.append(content);
  return empty;
}

function renderProducts() {
  productGrid.replaceChildren();
  if (!products.length) {
    productGrid.append(emptyProducts());
    return;
  }
  products.forEach((product) => {
    const item = document.createElement('article');
    item.className = 'product-item';
    const thumb = document.createElement(product.external_url ? 'a' : 'div');
    thumb.className = 'product-thumb';
    if (product.external_url) {
      thumb.href = product.external_url;
      thumb.target = '_blank';
      thumb.rel = 'noopener noreferrer';
      thumb.setAttribute('aria-label', `打开产品页面：${product.name}`);
    }
    if (product.image_url) thumb.append(createImage(product.image_url, product.name));
    else {
      const placeholder = document.createElement('span');
      placeholder.className = 'product-thumb-placeholder';
      placeholder.textContent = '产品';
      thumb.append(placeholder);
    }
    const info = document.createElement('div');
    info.className = 'product-info';
    const content = document.createElement('div');
    content.className = 'product-info-copy';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'product-source';
    eyebrow.textContent = product.source_type === 'website' ? '官网导入' : '手动添加';
    const name = document.createElement('strong');
    name.textContent = product.name;
    const description = document.createElement('p');
    description.textContent = product.description || '暂未填写产品简介。';
    content.append(eyebrow, name, description);
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-button';
    removeButton.setAttribute('aria-label', `删除产品：${product.name}`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => removeProduct(product, removeButton));
    info.append(content, removeButton);
    item.append(thumb, info);
    productGrid.append(item);
  });
}

importProductsButton.addEventListener('click', async () => {
  importProductsStatus.textContent = '';
  setBusy(importProductsButton, true, '正在读取官网…');
  try {
    const result = await api('/api/products/import-site', { method: 'POST' });
    products = result.products;
    renderProducts();
    const changes = [];
    if (result.imported_count) changes.push(`新增 ${result.imported_count} 项`);
    if (result.updated_count) changes.push(`同步 ${result.updated_count} 项`);
    importProductsStatus.textContent = changes.length
      ? `已${changes.join('、')}，名称、简介、图片和链接均可继续调整。`
      : '没有发现新的产品链接，现有目录已是最新。';
    showToast(changes.length ? `官网产品已更新：${changes.join('，')}` : '官网产品已是最新');
  } catch (error) {
    importProductsStatus.textContent = error.message;
    showToast(error.message, 'error');
  } finally {
    setBusy(importProductsButton, false);
  }
});

async function removeProduct(product, button) {
  button.disabled = true;
  try {
    await api(`/api/products/${product.id}`, { method: 'DELETE' });
    products = products.filter((item) => String(item.id) !== String(product.id));
    renderProducts();
    showToast('产品已删除');
  } catch (error) {
    button.disabled = false;
    showToast(error.message, 'error');
  }
}

form.addEventListener('input', updatePreview);

scanInput.addEventListener('change', () => {
  const filename = scanInput.files[0]?.name;
  document.querySelector('#scan-file-name').textContent = filename || 'JPG、PNG、WebP 或 GIF，最大 5MB';
  scanError.textContent = '';
});

scanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  scanError.textContent = '';
  scanResult.hidden = true;
  if (!scanForm.reportValidity()) return;
  setBusy(scanButton, true, '正在识别，请稍候…');
  try {
    const result = await api('/api/card/scan', { method: 'POST', body: new FormData(scanForm) });
    const applied = [];
    for (const [fieldName, value] of Object.entries(result.suggestions || {})) {
      const input = form.elements[fieldName];
      if (input && value && !input.value.trim()) {
        input.value = value;
        applied.push(scanFieldLabels[fieldName] || fieldName);
      }
    }
    document.querySelector('#scan-result-title').textContent = applied.length
      ? `已自动填写 ${applied.length} 项：${applied.join('、')}`
      : '已识别文字；现有内容未被覆盖';
    document.querySelector('#scan-raw-text').textContent = result.raw_text;
    scanResult.hidden = false;
    updatePreview();
    showToast(applied.length ? '名片信息已识别，请核对后保存' : '识别完成，请核对原始文字');
  } catch (error) {
    scanError.textContent = error.message;
  } finally {
    setBusy(scanButton, false);
  }
});

avatarInput.addEventListener('change', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = avatarInput.files[0] ? URL.createObjectURL(avatarInput.files[0]) : '';
  setAvatar(avatarPreview, objectUrl || card?.avatar_url || '', nameInput.value);
  setAvatar(miniAvatar, objectUrl || card?.avatar_url || '', nameInput.value);
});

qrInput.addEventListener('change', () => {
  if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
  qrObjectUrl = qrInput.files[0] ? URL.createObjectURL(qrInput.files[0]) : '';
  removeQrInput.value = '0';
  setQrPreview(qrObjectUrl || card?.wechat_qr_url || '');
});

removeQrButton.addEventListener('click', () => {
  if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
  qrObjectUrl = '';
  qrInput.value = '';
  removeQrInput.value = '1';
  setQrPreview('');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  cardError.textContent = '';
  if (!form.reportValidity()) return;
  setBusy(saveButton, true, '正在保存…');
  try {
    const result = await api('/api/card', { method: 'PUT', body: new FormData(form) });
    card = result.card;
    avatarInput.value = '';
    qrInput.value = '';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
    objectUrl = '';
    qrObjectUrl = '';
    fillForm(card);
    showToast('名片已保存并发布');
  } catch (error) {
    cardError.textContent = error.message;
  } finally {
    setBusy(saveButton, false);
  }
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  productError.textContent = '';
  if (!productForm.reportValidity()) return;
  setBusy(addProductButton, true, '正在上传…');
  try {
    const result = await api('/api/products', { method: 'POST', body: new FormData(productForm) });
    products.unshift(result.product);
    productForm.reset();
    renderProducts();
    showToast('产品已添加');
  } catch (error) {
    productError.textContent = error.message;
  } finally {
    setBusy(addProductButton, false);
  }
});

document.querySelector('#logout-button').addEventListener('click', logout);

try {
  const [me, data] = await Promise.all([api('/api/auth/me'), api('/api/card')]);
  document.querySelector('#user-email').textContent = me.user.email;
  card = data.card;
  products = data.products;
  fillForm(card);
  renderProducts();
  loading.hidden = true;
  form.hidden = false;
} catch (error) {
  if (error.status === 401) window.location.href = '/auth.html?mode=login';
  else {
    loading.innerHTML = '<p class="form-error">名片加载失败，请刷新页面重试。</p>';
    showToast(error.message, 'error');
  }
}
