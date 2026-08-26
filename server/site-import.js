import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadBuffer } from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(__dirname, '..', 'uploads');
const userAgent = 'DigitalCardProductImporter/1.0 (+local business card owner import)';
const htmlLimit = 3 * 1024 * 1024;
const imageLimit = 5 * 1024 * 1024;

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10
      || a === 127
      || a === 0
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

async function assertPublicUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('官网链接必须使用 http 或 https');
  if (url.username || url.password) throw new Error('官网链接不能包含账号信息');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('不能抓取本机或内网地址');
  }
}

async function fetchLimited(input, maxBytes, acceptedType) {
  let current = new URL(input);
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': userAgent, accept: acceptedType },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('官网返回了无效跳转');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`官网访问失败（${response.status}）`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error('官网返回内容过大，已停止抓取');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('官网返回内容过大，已停止抓取');
    return { buffer, contentType: response.headers.get('content-type') || '', url: current };
  }
  throw new Error('官网跳转次数过多');
}

function normalizeText(value, maxLength = 500) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[|·•\-–—\s]+|[|·•\-–—\s]+$/g, '')
    .trim()
    .slice(0, maxLength);
}

function summarize(value) {
  const text = normalizeText(value, 1200)
    .replace(/如需(?:购买|了解)[\s\S]*$/u, '')
    .replace(/(?:欢迎|敬请).*$/u, '');
  if (!text) return '';
  const parts = text.split(/[。！？；;，,]/u).map((part) => normalizeText(part)).filter(Boolean);
  const selected = [];
  for (const part of parts) {
    if (selected.length >= 3) break;
    const parentheticalCount = (part.match(/[（(]/gu) || []).length;
    if (selected.length >= 2 && parentheticalCount >= 2) break;
    if (selected.length >= 2 && selected.join('；').length + part.length > 175) break;
    selected.push(part);
  }
  const summary = selected.join('；').replace(/[（(][^）)]*$/u, '').replace(/[,，.。;；\s]+$/u, '');
  if (summary.length <= 210) return summary;
  const shortened = summary.slice(0, 200);
  const breakAt = Math.max(
    shortened.lastIndexOf('；'),
    shortened.lastIndexOf('，'),
    shortened.lastIndexOf(','),
  );
  return `${shortened.slice(0, breakAt > 110 ? breakAt : 200)}…`;
}

function absoluteUrl(value, baseUrl) {
  if (!value || /^(?:data:|javascript:|mailto:|tel:|#)/i.test(value)) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return '';
  }
}

function sameWebsite(url, websiteUrl) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const websiteHost = new URL(websiteUrl).hostname.replace(/^www\./, '');
    return host === websiteHost;
  } catch {
    return false;
  }
}

function findListingUrls($, pageUrl) {
  const candidates = new Map([[pageUrl.href, 1]]);
  $('a[href]').each((_index, anchor) => {
    const element = $(anchor);
    const href = absoluteUrl(element.attr('href'), pageUrl);
    if (!href || !sameWebsite(href, pageUrl)) return;
    const text = normalizeText(element.text(), 80);
    const pathText = `${new URL(href).pathname} ${text}`.toLowerCase();
    if (!/(产品|作品|案例|product|products|portfolio|solution|goods)/i.test(pathText)) return;
    if (/(item|detail|详情)/i.test(pathText)) return;
    const score = /(产品中心|products?|作品|portfolio)/i.test(text) ? 5 : 2;
    candidates.set(href, Math.max(candidates.get(href) || 0, score));
  });
  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([url]) => url);
}

function findProductLinks($, pageUrl) {
  const products = new Map();
  $('a[href]').each((_index, anchor) => {
    const element = $(anchor);
    const href = absoluteUrl(element.attr('href'), pageUrl);
    if (!href || !sameWebsite(href, pageUrl) || href === pageUrl.href) return;
    const parsed = new URL(href);
    const pathText = parsed.pathname.toLowerCase();
    const image = element.find('img').first();
    const container = element.closest('article, li, [class*="product"], [class*="item"], [class*="listEveryOne"], div').first();
    const title = normalizeText(
      element.find('.name, h1, h2, h3, h4, [class*="title"]').first().text()
      || image.attr('alt')
      || image.attr('title')
      || element.text(),
      100,
    );
    if (!title || title.length < 3 || /^(查看详情|更多|more|详情)$/i.test(title)) return;
    let score = 0;
    if (/(product|goods|case|portfolio)[-_\/]?(item|detail)/i.test(pathText)) score += 8;
    if (/(product-item|product_detail|product-detail|goods_detail|case-item)/i.test(pathText)) score += 8;
    if (image.length) score += 3;
    if (/(产品|设备|系统|模拟器|光源|仪|机|器|product)/i.test(title)) score += 2;
    if (score < 5) return;
    const description = normalizeText(
      container.find('p, [class*="desc"], [class*="intro"]').not('.name, [class*="title"]').first().text(),
      500,
    );
    const imageUrl = absoluteUrl(image.attr('data-src') || image.attr('data-original') || image.attr('src'), pageUrl);
    const previous = products.get(href);
    if (!previous || score > previous.score) products.set(href, { href, title, description, imageUrl, score });
  });
  return [...products.values()].sort((a, b) => b.score - a.score).slice(0, 20);
}

function detailData(buffer, pageUrl, fallback) {
  const $ = loadBuffer(buffer);
  const meta = (selector) => normalizeText($(selector).first().attr('content'), 1200);
  const rawTitle = meta('meta[property="og:title"]')
    || normalizeText($('main h1, article h1, h1').first().text(), 150)
    || fallback.title;
  const title = normalizeText(rawTitle.split(/[-_|｜]\s*(?:上海|官网|首页)/u)[0], 100) || fallback.title;
  const description = summarize(
    meta('meta[name="description"]')
    || meta('meta[property="og:description"]')
    || fallback.description,
  );
  const imageUrl = absoluteUrl(
    meta('meta[property="og:image"]')
    || fallback.imageUrl
    || $('main img, article img, [class*="product"] img').first().attr('src'),
    pageUrl,
  );
  return { name: title, description, external_url: pageUrl.href, remote_image_url: imageUrl };
}

export async function discoverWebsiteProducts(website) {
  const startUrl = new URL(website);
  const homeResponse = await fetchLimited(startUrl, htmlLimit, 'text/html,application/xhtml+xml');
  const homeDocument = loadBuffer(homeResponse.buffer);
  const listingUrls = findListingUrls(homeDocument, homeResponse.url);
  const candidates = new Map();

  for (const listingUrl of listingUrls) {
    try {
      const response = listingUrl === homeResponse.url.href
        ? homeResponse
        : await fetchLimited(listingUrl, htmlLimit, 'text/html,application/xhtml+xml');
      const document = loadBuffer(response.buffer);
      findProductLinks(document, response.url).forEach((product) => {
        if (!candidates.has(product.href)) candidates.set(product.href, product);
      });
    } catch {
      // A broken secondary listing should not prevent importing other valid pages.
    }
  }

  const candidateList = [...candidates.values()].slice(0, 16);
  if (!candidateList.length) throw new Error('官网中暂未识别到带详情链接的产品');
  const results = [];
  for (let index = 0; index < candidateList.length; index += 4) {
    const batch = candidateList.slice(index, index + 4);
    const details = await Promise.all(batch.map(async (candidate) => {
      try {
        const response = await fetchLimited(candidate.href, htmlLimit, 'text/html,application/xhtml+xml');
        return detailData(response.buffer, response.url, candidate);
      } catch {
        return {
          name: candidate.title,
          description: summarize(candidate.description),
          external_url: candidate.href,
          remote_image_url: candidate.imageUrl,
        };
      }
    }));
    results.push(...details);
  }
  return results.filter((product) => product.name && product.external_url);
}

export async function cacheRemoteImage(imageUrl) {
  if (!imageUrl) return '';
  const response = await fetchLimited(imageUrl, imageLimit, 'image/avif,image/webp,image/png,image/jpeg,image/gif');
  const type = response.contentType.split(';')[0].toLowerCase();
  const extensions = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['image/avif', '.avif'],
  ]);
  const extension = extensions.get(type);
  if (!extension) throw new Error('官网产品图片格式不受支持');
  await fs.mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  await fs.writeFile(path.join(uploadDirectory, filename), response.buffer);
  return `/uploads/${filename}`;
}
