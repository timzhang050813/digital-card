const fieldLimits = {
  name: 80,
  company_name: 120,
  department: 100,
  job_title: 100,
  tagline: 120,
  expertise: 200,
  main_business: 200,
  founded_at: 30,
  team_size: 50,
  phone: 30,
  telephone: 30,
  contact_email: 254,
  wechat: 80,
  website: 300,
  region: 100,
  address: 200,
  bio: 200,
};

const boundaryLabels = [
  '姓名', '名字', '联系人', '公司', '单位', '组织', '部门', '职务', '职位', '身份',
  '一句话简介', '个人标签', '简介', '个人介绍', '公司介绍', '擅长', '专长', '专业领域',
  '主营业务', '业务范围', '成立时间', '成立于', '团队规模', '人数', '手机号', '手机',
  '电话', '座机', '邮箱', '电子邮箱', '微信', '微信号', '网站', '网址', '官网',
  '所在地区', '地区', '城市', '地址', '办公地址',
].join('|');

function clean(value, limit = 200) {
  return String(value || '')
    .replace(/^[\s：:，,。；;是为]+/, '')
    .replace(/[\s，,。；;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function captureLabeled(text, labels, limit = 200) {
  const expression = new RegExp(
    `(?:^|[\\n；;。]|[，,]\\s*)(?:${labels.join('|')})\\s*(?:是|为|[:：])?\\s*([\\s\\S]{1,${limit}}?)(?=$|[\\n；;。]|[，,]\\s*(?:${boundaryLabels})\\s*(?:是|为|[:：])?)`,
    'i',
  );
  return clean(text.match(expression)?.[1], limit);
}

function firstMatch(text, pattern, group = 0) {
  return clean(text.match(pattern)?.[group] || '', 300);
}

function normalizePhone(value) {
  return clean(value, 30).replace(/\s+/g, ' ');
}

function normalizeWebsite(value) {
  const website = clean(value, 300);
  if (!website) return '';
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export function parseCardText(rawText) {
  const text = String(rawText || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!text) return {};

  const email = firstMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const websiteRaw = firstMatch(
    text.replace(email, ''),
    /(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]+\.(?:com|cn|net|org|io|co|ai|tech)(?:\/[^\s，,；;。]*)?/i,
  );
  const mobile = firstMatch(text, /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/);
  const telephone = firstMatch(text, /(?:\+?86[-\s]?)?0\d{2,3}[-\s]?\d{7,8}/);

  const labeledName = captureLabeled(text, ['姓名', '名字', '联系人'], fieldLimits.name);
  const conversationalName = firstMatch(text, /(?:我叫|我是|本人是)\s*([\u4e00-\u9fa5·]{2,8}|[A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i, 1);
  const labeledCompany = captureLabeled(text, ['公司(?:名称)?', '单位', '组织', '就职于', '来自'], fieldLimits.company_name);
  const companyFallback = firstMatch(
    text,
    /[\u4e00-\u9fa5A-Za-z0-9·（）()]{2,60}(?:有限公司|股份公司|公司|集团|工作室|事务所|研究院|研究所|协会|学会|委员会|大学|学院|中心)/i,
  ).replace(/^(?:我叫|我是|本人是|就职于|来自)/, '');

  const jobTitleLabeled = captureLabeled(text, ['职务', '职位', '身份', '担任'], fieldLimits.job_title);
  const jobTitleFallback = firstMatch(
    text,
    /(?:联合创始人|创始人|董事长|副总经理|总经理|(?:设计|产品|技术|市场|销售|运营|研发|财务|人力资源)?总监|经理|主管|(?:高级|资深|首席|系统|软件|硬件|算法|光谱)?工程师|设计师|顾问|教授|主任|CEO|CTO|COO|CFO|CMO|Founder|Director|Manager|Engineer|Designer|Consultant)/i,
  );

  const suggestions = {
    name: labeledName || conversationalName,
    company_name: labeledCompany || companyFallback,
    department: captureLabeled(text, ['部门', '事业部', '办公室'], fieldLimits.department),
    job_title: jobTitleLabeled || jobTitleFallback,
    tagline: captureLabeled(text, ['一句话简介', '个人标签', '一句话介绍'], fieldLimits.tagline),
    expertise: captureLabeled(text, ['擅长(?:领域)?', '专长', '专业领域'], fieldLimits.expertise),
    main_business: captureLabeled(text, ['主营业务', '业务范围', '主要服务', '提供服务'], fieldLimits.main_business),
    founded_at: captureLabeled(text, ['成立时间', '成立于'], fieldLimits.founded_at),
    team_size: captureLabeled(text, ['团队规模', '团队人数', '人数'], fieldLimits.team_size),
    phone: normalizePhone(mobile || captureLabeled(text, ['手机号', '手机'], fieldLimits.phone)),
    telephone: normalizePhone(telephone || captureLabeled(text, ['座机', '电话'], fieldLimits.telephone)),
    contact_email: email || captureLabeled(text, ['电子邮箱', '联系邮箱', '邮箱'], fieldLimits.contact_email),
    wechat: captureLabeled(text, ['微信号', '微信', 'WeChat'], fieldLimits.wechat),
    website: normalizeWebsite(websiteRaw || captureLabeled(text, ['官网', '网站', '网址'], fieldLimits.website)),
    region: captureLabeled(text, ['所在地区', '地区', '城市'], fieldLimits.region),
    address: captureLabeled(text, ['办公地址', '联系地址', '地址'], fieldLimits.address),
    bio: captureLabeled(text, ['个人介绍', '公司介绍', '简介'], fieldLimits.bio),
  };

  return Object.fromEntries(Object.entries(suggestions).filter(([, value]) => Boolean(value)));
}
