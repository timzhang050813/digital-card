import { createWorker } from 'tesseract.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

let workerPromise;
let recognitionQueue = Promise.resolve();

async function getWorker() {
  if (!workerPromise) {
    const cachePath = path.resolve('.data', 'tessdata');
    await mkdir(cachePath, { recursive: true });
    let lastLogKey = '';
    workerPromise = createWorker('chi_sim', 1, {
      cachePath,
      logger: ({ status, progress }) => {
        const percentage = Math.round((progress || 0) * 100);
        const shouldLog = status !== 'recognizing text' || percentage === 100 || percentage % 25 === 0;
        const logKey = `${status}:${percentage}`;
        if (process.env.NODE_ENV !== 'test' && shouldLog && logKey !== lastLogKey) {
          lastLogKey = logKey;
          console.log(`OCR ${status}: ${percentage}%`);
        }
      },
    });
  }
  return workerPromise;
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match?.[1]?.trim() || match?.[0]?.trim() || '';
}

function cleanPhone(value) {
  return value.replace(/\s+/g, ' ').replace(/[,.，。;；]+$/, '').trim();
}

export function parseBusinessCardText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const parseLines = lines.map((line) =>
    line.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, ''),
  );
  const joined = parseLines.join('\n');

  const email = firstMatch(joined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const websitePattern = /(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]+\.(?:com|cn|net|org|io|co|ai|tech)(?:\/[^\s]*)?/i;
  const websiteLine = parseLines.find((line) => !line.includes('@') && websitePattern.test(line));
  const websiteRaw = websiteLine?.match(websitePattern)?.[0] || '';
  const website = websiteRaw ? (websiteRaw.startsWith('http') ? websiteRaw : `https://${websiteRaw}`) : '';
  const mobile = joined.match(/(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/)?.[0] || '';
  const telephone = joined.match(/(?:\+?86[-\s]?)?0\d{2,3}[-\s]?\d{7,8}/)?.[0] || '';
  const wechat = firstMatch(joined, /(?:微信|微信号|WeChat|Wechat|WX)\s*[:：]?\s*([A-Za-z][\w-]{5,19})/i);
  const addressLine = parseLines.find((line) => /(?:地址|办公地址|Address|Add)\s*[:：]?/i.test(line));
  const address = firstMatch(addressLine || '', /(?:地址|办公地址|Address|Add)\s*[:：]?\s*(.+)$/i);

  const companyLine = parseLines.find((line) =>
    /(?:有限公司|股份公司|公司|集团|工作室|事务所|研究院|研究所|协会|学会|委员会|大学|学院|中心|Technology|Company|Co\.?[, ]?Ltd|Group|Studio)/i.test(line),
  ) || '';
  const company = companyLine.match(/[\u4e00-\u9fa5A-Za-z0-9·（）()]{2,40}(?:有限公司|股份公司|公司|集团|工作室|事务所|研究院|研究所|协会|学会|委员会|大学|学院)/i)?.[0]
    || companyLine;
  const identityText = joined.replace(company, '');
  const department = identityText.match(/[\u4e00-\u9fa5A-Za-z0-9]{1,20}(?:事业部|设计部|产品部|研发部|市场部|销售部|运营部|人力资源部|办公室|中心|Department|Division)/i)?.[0] || '';
  const titleText = identityText.replace(department, '');
  const jobTitle = titleText.match(/(?:联合创始人|创始人|董事长|副总经理|总经理|(?:设计|产品|技术|市场|销售|运营|研发|财务|人力资源)?总监|经理|主管|(?:高级|资深|首席|系统|软件|硬件|算法|光谱)?工程师|设计师|顾问|教授|主任|CEO|CTO|COO|CFO|CMO|Founder|Director|Manager|Engineer|Designer|Consultant)/i)?.[0] || '';

  const excluded = new Set([companyLine, addressLine].filter(Boolean));
  const labeledName = firstMatch(joined, /(?:姓名|Name)\s*[:：]?\s*([\u4e00-\u9fa5·]{2,8}|[A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i);
  const nameLine = labeledName || parseLines.find((line) => {
    if (excluded.has(line) || line.includes('@') || /\d{4,}/.test(line)) return false;
    if (/^(?:电话|手机|邮箱|网址|地址|微信|Tel|Mobile|Email|Web|Address)\s*[:：]/i.test(line)) return false;
    return /^[\u4e00-\u9fa5·]{2,8}$/.test(line) || /^[A-Za-z]+(?:\s+[A-Za-z]+){1,3}$/.test(line);
  }) || '';

  return {
    raw_text: lines.join('\n'),
    suggestions: {
      name: nameLine,
      company_name: company,
      department,
      job_title: jobTitle,
      phone: cleanPhone(mobile),
      telephone: cleanPhone(telephone),
      contact_email: email,
      wechat,
      website,
      address,
    },
  };
}

export function recognizeBusinessCard(imagePath) {
  const task = recognitionQueue.then(async () => {
    const worker = await getWorker();
    const attempts = [
      { options: { rotateAuto: true }, rotation: 0 },
      { options: { rotateRadians: Math.PI / 2 }, rotation: 90 },
      { options: { rotateRadians: -Math.PI / 2 }, rotation: 270 },
    ];
    let best;
    for (const attempt of attempts) {
      const result = await worker.recognize(imagePath, attempt.options);
      const parsed = parseBusinessCardText(result.data.text);
      const usefulFields = Object.values(parsed.suggestions).filter(Boolean).length;
      const score = usefulFields * 30 + Math.max(0, result.data.confidence || 0);
      if (!best || score > best.score) best = { ...parsed, score, rotation: attempt.rotation };
      if (usefulFields >= 5 && score >= 190) break;
    }
    return {
      raw_text: best.raw_text,
      suggestions: best.suggestions,
      rotation_applied: best.rotation,
    };
  });
  recognitionQueue = task.catch(() => {});
  return task;
}

export async function closeOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = undefined;
}
