import { api, createImage, createInitials } from './app.js';

const root = document.querySelector('#card-root');
const slug = new URLSearchParams(window.location.search).get('slug');
const directoryLink = document.querySelector('#directory-link');
if (slug && directoryLink) directoryLink.href = `/directory.html?slug=${encodeURIComponent(slug)}`;

function appendText(parent, className, text) {
  if (!text) return;
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  parent.append(element);
}

function renderError(message) {
  root.replaceChildren();
  const state = document.createElement('section');
  state.className = 'message-state panel';
  const content = document.createElement('div');
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '名';
  const heading = document.createElement('h1');
  heading.textContent = '没有找到这张名片';
  const copy = document.createElement('p');
  copy.textContent = message;
  const link = document.createElement('a');
  link.className = 'button';
  link.href = '/';
  link.textContent = '返回首页';
  content.append(icon, heading, copy, link);
  state.append(content);
  root.append(state);
}

function contactItem(label, value, href = '') {
  const element = href ? document.createElement('a') : document.createElement('span');
  element.className = 'contact-item';
  if (href) element.href = href;
  const labelElement = document.createElement('span');
  labelElement.className = 'contact-label';
  labelElement.textContent = label || '联系';
  const text = document.createElement('span');
  text.className = 'contact-value';
  text.textContent = value;
  element.append(labelElement, text);
  return element;
}

function renderCard(card, products) {
  document.title = `${card.name}｜数码名片`;
  const meta = document.querySelector('meta[name="description"]');
  meta.content = card.tagline || card.bio || `${card.name}的数码名片`;
  root.replaceChildren();

  const cardElement = document.createElement('article');
  cardElement.className = 'public-card';
  const side = document.createElement('div');
  side.className = 'public-card-side';
  const sideMark = document.createElement('span');
  sideMark.className = 'card-side-mark';
  sideMark.setAttribute('aria-hidden', 'true');
  sideMark.textContent = 'D';
  const avatar = document.createElement('div');
  avatar.className = 'public-avatar';
  if (card.avatar_url) avatar.append(createImage(card.avatar_url, `${card.name}头像`));
  else avatar.append(createInitials(card.name));
  const type = document.createElement('span');
  type.className = 'card-type-label';
  type.textContent = 'DIGITAL IDENTITY';
  side.append(sideMark, avatar, type);

  const body = document.createElement('div');
  body.className = 'public-card-body';
  const primary = document.createElement('div');
  primary.className = 'public-card-primary';
  const kicker = document.createElement('p');
  kicker.className = 'public-card-kicker';
  kicker.textContent = '数码名片 · DIGITAL CARD';
  const heading = document.createElement('h1');
  heading.textContent = card.name;
  primary.append(kicker, heading);
  const identityText = [card.company_name, card.department, card.job_title || card.occupation]
    .filter(Boolean)
    .join(' · ');
  if (identityText) {
    const identity = document.createElement('p');
    identity.className = 'public-identity';
    identity.textContent = identityText;
    primary.append(identity);
  }
  if (card.tagline) {
    const tagline = document.createElement('p');
    tagline.className = 'public-tagline';
    tagline.textContent = card.tagline;
    primary.append(tagline);
  }
  if (card.bio) {
    const bio = document.createElement('p');
    bio.className = 'public-bio';
    bio.textContent = card.bio;
    primary.append(bio);
  }

  const details = document.createElement('div');
  details.className = 'public-details';
  appendText(details, 'detail-pill', card.region);
  appendText(details, 'detail-pill', card.expertise);
  appendText(details, 'detail-pill', card.main_business);
  appendText(details, 'detail-pill', card.founded_at ? `成立于 ${card.founded_at}` : '');
  appendText(details, 'detail-pill', card.team_size ? `团队 ${card.team_size}` : '');
  if (details.childElementCount) primary.append(details);

  const contacts = document.createElement('div');
  contacts.className = 'contact-list';
  if (card.phone) contacts.append(contactItem('手机', card.phone, `tel:${card.phone}`));
  if (card.telephone) contacts.append(contactItem('座机', card.telephone, `tel:${card.telephone}`));
  if (card.contact_email) contacts.append(contactItem('邮箱', card.contact_email, `mailto:${card.contact_email}`));
  if (!card.wechat_qr_url && card.wechat) contacts.append(contactItem('微信', card.wechat));
  if (card.website) contacts.append(contactItem('网站', card.website.replace(/^https?:\/\//, ''), card.website));
  if (card.address) contacts.append(contactItem('地址', card.address));
  if (!contacts.childElementCount) contacts.append(contactItem('', '暂未公开联系方式'));

  const contactRow = document.createElement('div');
  contactRow.className = 'public-contact-row';
  contactRow.append(contacts);
  if (card.wechat_qr_url) {
    const qr = document.createElement('figure');
    qr.className = 'public-wechat-qr';
    qr.append(createImage(card.wechat_qr_url, `${card.name}的微信二维码`));
    const caption = document.createElement('figcaption');
    caption.textContent = '扫码添加微信';
    qr.append(caption);
    contactRow.append(qr);
  }
  body.append(primary, contactRow);
  cardElement.append(side, body);
  root.append(cardElement);

  const productSection = document.createElement('section');
  productSection.className = 'public-products';
  productSection.setAttribute('aria-labelledby', 'products-title');
  const sectionHeading = document.createElement('div');
  sectionHeading.className = 'section-heading';
  const productsTitle = document.createElement('h2');
  productsTitle.id = 'products-title';
  productsTitle.textContent = '产品与作品';
  const productsCopy = document.createElement('p');
  productsCopy.textContent = products.length ? `共 ${products.length} 项` : '名片的另一面';
  sectionHeading.append(productsTitle, productsCopy);
  const grid = document.createElement('div');
  grid.className = 'public-product-grid';

  if (!products.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const content = document.createElement('div');
    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '图';
    const emptyTitle = document.createElement('h3');
    emptyTitle.textContent = '暂时还没有产品';
    const copy = document.createElement('p');
    copy.textContent = '稍后再来看看吧。';
    content.append(icon, emptyTitle, copy);
    empty.append(content);
    grid.append(empty);
  } else {
    products.forEach((product, index) => {
      const item = document.createElement('article');
      item.className = 'public-product';
      const thumb = document.createElement(product.external_url ? 'a' : 'div');
      thumb.className = 'public-product-thumb';
      if (product.external_url) {
        thumb.href = product.external_url;
        thumb.target = '_blank';
        thumb.rel = 'noopener noreferrer';
        thumb.setAttribute('aria-label', `查看产品：${product.name}（在新窗口打开）`);
      }
      if (product.image_url) thumb.append(createImage(product.image_url, product.name));
      else {
        const placeholder = document.createElement('span');
        placeholder.className = 'public-product-placeholder';
        placeholder.textContent = 'PRODUCT';
        thumb.append(placeholder);
      }
      const content = document.createElement('div');
      content.className = 'public-product-content';
      const meta = document.createElement('div');
      meta.className = 'public-product-meta';
      const indexLabel = document.createElement('span');
      indexLabel.textContent = String(index + 1).padStart(2, '0');
      const sourceLabel = document.createElement('span');
      sourceLabel.textContent = product.source_type === 'website' ? '官网产品' : '产品 / 作品';
      meta.append(indexLabel, sourceLabel);
      const name = document.createElement('h3');
      name.textContent = product.name;
      const description = document.createElement('p');
      description.textContent = product.description || '点击缩略图查看产品详情与完整参数。';
      content.append(meta, name, description);
      if (product.external_url) {
        const link = document.createElement('a');
        link.className = 'public-product-link';
        link.href = product.external_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '查看产品详情';
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↗';
        link.append(arrow);
        content.append(link);
      }
      item.append(thumb, content);
      grid.append(item);
    });
  }
  productSection.append(sectionHeading, grid);
  root.append(productSection);
}

if (!slug) {
  renderError('链接中缺少名片标识。');
} else {
  try {
    const data = await api(`/api/cards/${encodeURIComponent(slug)}`);
    renderCard(data.card, data.products);
  } catch (error) {
    renderError(error.message);
  }
}
