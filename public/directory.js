import { api, createImage, initials } from './app.js';

const shell = document.querySelector('#directory-shell');
const list = document.querySelector('#directory-contact-list');
const count = document.querySelector('#directory-count');
const search = document.querySelector('#directory-search');
const detail = document.querySelector('#directory-detail-inner');
const selectedName = document.querySelector('#selected-name');
const selectedPublicLink = document.querySelector('#selected-public-link');
const detailScroll = document.querySelector('#directory-detail-scroll');
const slug = new URLSearchParams(window.location.search).get('slug');

const demoProfiles = [
  ['张永祥', '上海卡精智能科技有限公司', '光谱分析师 · 系统工程师', ['太阳模拟', '光谱系统', '上海']],
  ['林知远', '远山产品设计', '产品策略顾问', ['产品定义', '体验设计', '创业']],
  ['陈嘉宁', '澄光精密仪器', '光学系统工程师', ['精密光学', '仪器研发', '交付']],
  ['王启明', '矩阵智能制造', '自动化负责人', ['智能制造', '自动化', '工业软件']],
  ['周予安', '新能源材料研究院', '高级研究员', ['光伏测试', '材料', '研发']],
  ['刘思远', '见山品牌咨询', '品牌策略总监', ['品牌', '内容', '增长']],
  ['沈亦航', '深蓝环境科技', '解决方案架构师', ['环境舱', '系统集成', '工程']],
  ['许安然', '启明检测实验室', '实验室主任', ['检测', '认证', '标准']],
  ['赵一川', '云阶科技', '联合创始人', ['AI 产品', '数据', '平台']],
  ['顾清和', '衡度工业设计', '工业设计师', ['硬件设计', '结构', '量产']],
  ['唐书宁', '青禾新材料', '市场负责人', ['新材料', '市场', '合作']],
  ['苏明哲', '极昼光电', '光源产品经理', ['LED 光源', '光催化', '产品']],
  ['方若岚', '万象科研服务', '商务发展经理', ['科研服务', '高校', '项目']],
  ['陆承宇', '上海智衡系统', '技术总监', ['控制系统', '软件', '定制']],
  ['何语桐', '循光实验设备', '应用工程师', ['实验设备', '培训', '售后']],
  ['程砚秋', '北辰投资咨询', '产业研究员', ['新能源', '产业研究', '投资']],
  ['季闻舟', '精微测试技术', '销售工程师', ['精密测试', '客户方案', '华东']],
  ['宋知行', '知行创新中心', '项目合伙人', ['创新孵化', '产业合作', '上海']],
];

let contacts = [];
let selectedId = '';

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function avatarElement(card, className, palette = 0) {
  const avatar = document.createElement('span');
  avatar.className = `${className} directory-palette-${palette % 5}`;
  if (card.avatar_url) avatar.append(createImage(card.avatar_url, `${card.name}头像`));
  else avatar.textContent = initials(card.name);
  return avatar;
}

function contactItem(label, value, href = '') {
  const item = href ? document.createElement('a') : document.createElement('span');
  item.className = 'contact-item';
  if (href) item.href = href;
  item.append(textElement('span', 'contact-label', label), textElement('span', 'contact-value', value));
  return item;
}

function businessCard(card, palette) {
  const article = document.createElement('article');
  article.className = 'public-card directory-business-card';
  article.setAttribute('aria-label', `${card.name}的数码名片`);

  const side = document.createElement('div');
  side.className = 'public-card-side';
  side.append(textElement('span', 'card-side-mark', 'D'));
  side.append(avatarElement(card, 'public-avatar', palette));
  side.append(textElement('span', 'card-type-label', 'DIGITAL IDENTITY'));

  const body = document.createElement('div');
  body.className = 'public-card-body';
  const primary = document.createElement('div');
  primary.className = 'public-card-primary';
  primary.append(textElement('p', 'public-card-kicker', '数码名片 · DIGITAL CARD'));
  primary.append(textElement('h1', '', card.name));
  const identity = [card.company_name, card.department, card.job_title || card.occupation].filter(Boolean).join(' · ');
  if (identity) primary.append(textElement('p', 'public-identity', identity));
  if (card.tagline) primary.append(textElement('p', 'public-tagline', card.tagline));
  if (card.bio) primary.append(textElement('p', 'public-bio', card.bio));
  const details = document.createElement('div');
  details.className = 'public-details';
  [card.region, card.expertise, card.main_business].filter(Boolean).forEach((value) => details.append(textElement('span', 'detail-pill', value)));
  if (details.childElementCount) primary.append(details);

  const contactsArea = document.createElement('div');
  contactsArea.className = 'contact-list';
  if (card.phone) contactsArea.append(contactItem('手机', card.phone, `tel:${card.phone}`));
  if (card.contact_email) contactsArea.append(contactItem('邮箱', card.contact_email, `mailto:${card.contact_email}`));
  if (card.website) contactsArea.append(contactItem('网站', card.website.replace(/^https?:\/\//, ''), card.website));
  if (card.address) contactsArea.append(contactItem('地址', card.address));

  const contactRow = document.createElement('div');
  contactRow.className = 'public-contact-row';
  contactRow.append(contactsArea);
  if (card.wechat_qr_url) {
    const qr = document.createElement('figure');
    qr.className = 'public-wechat-qr';
    qr.append(createImage(card.wechat_qr_url, `${card.name}的微信二维码`));
    qr.append(textElement('figcaption', '', '扫码添加微信'));
    contactRow.append(qr);
  }
  body.append(primary, contactRow);
  article.append(side, body);
  return article;
}

function productList(products) {
  const section = document.createElement('section');
  section.className = 'public-products directory-products';
  const heading = document.createElement('div');
  heading.className = 'section-heading';
  const titleGroup = document.createElement('div');
  titleGroup.append(textElement('p', 'directory-section-kicker', 'PRODUCTS & WORKS'));
  titleGroup.append(textElement('h2', '', '产品与作品'));
  heading.append(titleGroup, textElement('p', '', `共 ${products.length} 项`));
  const grid = document.createElement('div');
  grid.className = 'public-product-grid';

  if (!products.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const content = document.createElement('div');
    content.append(textElement('div', 'empty-icon', '图'));
    content.append(textElement('h3', '', '暂时还没有产品'));
    content.append(textElement('p', '', '这位联系人尚未添加产品或作品。'));
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
        thumb.setAttribute('aria-label', `查看产品：${product.name}`);
      }
      if (product.image_url) thumb.append(createImage(product.image_url, product.name));
      else thumb.append(textElement('span', 'public-product-placeholder', 'PRODUCT'));
      const content = document.createElement('div');
      content.className = 'public-product-content';
      const meta = document.createElement('div');
      meta.className = 'public-product-meta';
      meta.append(textElement('span', '', String(index + 1).padStart(2, '0')), textElement('span', '', '产品 / 作品'));
      content.append(meta, textElement('h3', '', product.name));
      content.append(textElement('p', '', product.description || '点击缩略图查看产品详情与完整参数。'));
      if (product.external_url) {
        const link = textElement('a', 'public-product-link', '查看产品详情');
        link.href = product.external_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.append(textElement('span', '', '↗'));
        content.append(link);
      }
      item.append(thumb, content);
      grid.append(item);
    });
  }
  section.append(heading, grid);
  return section;
}

function renderDetail(contact) {
  selectedId = contact.id;
  selectedName.textContent = contact.card.name;
  selectedPublicLink.href = contact.isOriginal ? `/card.html?slug=${encodeURIComponent(contact.card.slug)}` : '#';
  selectedPublicLink.classList.toggle('is-disabled', !contact.isOriginal);
  selectedPublicLink.setAttribute('aria-disabled', String(!contact.isOriginal));
  detail.replaceChildren();
  const summary = document.createElement('div');
  summary.className = 'directory-selected-summary';
  summary.append(textElement('p', 'directory-section-kicker', contact.isOriginal ? '已发布名片' : '模拟名片'));
  summary.append(textElement('h3', '', contact.card.name));
  const tags = document.createElement('div');
  tags.className = 'directory-selected-tags';
  contact.keywords.forEach((keyword) => tags.append(textElement('span', '', keyword)));
  summary.append(tags);
  detail.append(summary, businessCard(contact.card, contact.palette), productList(contact.products));
  detailScroll.scrollTop = 0;
  document.querySelectorAll('.directory-contact-button').forEach((button) => {
    const active = button.dataset.id === contact.id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderList(query = '') {
  const normalized = query.trim().toLowerCase();
  const visible = contacts.filter((contact) => [
    contact.card.name,
    contact.card.company_name,
    contact.card.job_title,
    ...contact.keywords,
  ].join(' ').toLowerCase().includes(normalized));
  count.textContent = `${visible.length}`;
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'directory-list-empty';
    empty.append(textElement('div', 'empty-icon', '名'));
    empty.append(textElement('h3', '', '没有匹配的名片'));
    empty.append(textElement('p', '', '换一个姓名、公司或关键词试试。'));
    list.append(empty);
    return;
  }
  visible.forEach((contact) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'directory-contact-button';
    button.dataset.id = contact.id;
    button.setAttribute('aria-pressed', String(contact.id === selectedId));
    if (contact.id === selectedId) button.classList.add('is-active');
    button.append(avatarElement(contact.card, 'directory-list-avatar', contact.palette));
    const copy = document.createElement('span');
    copy.className = 'directory-contact-copy';
    const top = document.createElement('span');
    top.className = 'directory-contact-name-row';
    top.append(textElement('strong', '', contact.card.name));
    top.append(textElement('small', '', String(contact.products.length).padStart(2, '0')));
    copy.append(top, textElement('span', 'directory-contact-company', contact.card.company_name));
    copy.append(textElement('span', 'directory-contact-keywords', contact.keywords.slice(0, 3).join(' · ')));
    button.append(copy);
    button.addEventListener('click', () => {
      renderDetail(contact);
      renderList(search.value);
      shell.classList.add('is-detail-open');
    });
    list.append(button);
  });
}

function buildContacts(baseCard, products) {
  return demoProfiles.map(([name, company, title, keywords], index) => {
    const isOriginal = index === 0;
    const rotatedProducts = products.length
      ? [...products.slice(index % products.length), ...products.slice(0, index % products.length)].slice(0, isOriginal ? products.length : 3 + (index % 5))
      : [];
    const card = {
      ...baseCard,
      name,
      company_name: company,
      job_title: title,
      department: isOriginal ? baseCard.department : '',
      tagline: isOriginal ? baseCard.tagline : `${keywords[0]} · 让专业能力更容易被看见`,
      expertise: keywords.slice(0, 2).join('、'),
      main_business: keywords[2] || '',
      avatar_url: isOriginal || index % 6 === 0 ? baseCard.avatar_url : '',
      wechat_qr_url: isOriginal ? baseCard.wechat_qr_url : '',
      phone: isOriginal ? baseCard.phone : `138 0000 ${String(2600 + index).padStart(4, '0')}`,
      contact_email: isOriginal ? baseCard.contact_email : `contact${index + 1}@example.cn`,
      website: isOriginal ? baseCard.website : '',
      address: isOriginal ? baseCard.address : `${baseCard.region || '上海'} · 演示联系人`,
    };
    return { id: `contact-${index}`, card, products: rotatedProducts, keywords, palette: index, isOriginal };
  });
}

search.addEventListener('input', () => renderList(search.value));
document.querySelector('#directory-back').addEventListener('click', () => shell.classList.remove('is-detail-open'));

try {
  let data;
  if (slug) data = await api(`/api/cards/${encodeURIComponent(slug)}`);
  else {
    data = await api('/api/card');
    if (!data.card) throw new Error('请先创建一张名片');
  }
  contacts = buildContacts(data.card, data.products || []);
  renderList();
  renderDetail(contacts[0]);
} catch (error) {
  list.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'directory-list-empty';
  empty.append(textElement('div', 'empty-icon', '名'));
  empty.append(textElement('h3', '', '名片夹加载失败'));
  empty.append(textElement('p', '', error.message));
  list.append(empty);
}
