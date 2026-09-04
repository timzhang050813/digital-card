import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { initDatabase, query, closeDatabase } from './db.js';
import { clearAuthCookie, issueAuthCookie, requireAuth } from './auth.js';
import { upload } from './upload.js';
import { closeOcrWorker, recognizeBusinessCard } from './ocr.js';
import { cacheRemoteImage, discoverWebsiteProducts } from './site-import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');
const publicDirectory = path.join(rootDirectory, 'public');
const uploadDirectory = path.join(rootDirectory, 'uploads');
const app = express();
const port = Number(process.env.PORT || 3000);
const virtualSmsCodes = new Map();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: ["'self'"],
      // The current test deployment is served over plain HTTP on an IP address.
      // Disable Helmet's default upgrade directive so browsers do not rewrite
      // CSS, JavaScript, and image requests to unavailable HTTPS URLs.
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDirectory, { fallthrough: false, maxAge: '1d' }));
app.use(express.static(publicDirectory));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '尝试次数过多，请稍后再试' },
});

const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '名片识别次数较多，请稍后再试' },
});

const siteImportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '官网抓取次数较多，请稍后再试' },
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^1\d{10}$/.test(digits)) return digits;
  return '';
}

function createVirtualSmsCode(phone, purpose) {
  const key = `${purpose}:${phone}`;
  const previous = virtualSmsCodes.get(key);
  const now = Date.now();
  if (previous && previous.sentAt > now - 30_000) {
    const waitSeconds = Math.ceil((previous.sentAt + 30_000 - now) / 1000);
    return { error: `请在 ${waitSeconds} 秒后再获取验证码` };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  virtualSmsCodes.set(key, { code, sentAt: now, expiresAt: now + 5 * 60_000 });
  return { code };
}

function consumeVirtualSmsCode(phone, purpose, code) {
  const key = `${purpose}:${phone}`;
  const record = virtualSmsCodes.get(key);
  virtualSmsCodes.delete(key);
  if (!record || record.expiresAt < Date.now() || record.code !== String(code || '').trim()) {
    return false;
  }
  return true;
}

function validExternalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function removeUploadedFile(url) {
  if (!url?.startsWith('/uploads/')) return;
  const filename = path.basename(url);
  await fs.unlink(path.join(uploadDirectory, filename)).catch(() => {});
}

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const phone = req.body.phone ? normalizePhone(req.body.phone) : null;
    const password = String(req.body.password || '');
    if (!validEmail(email)) return res.status(400).json({ error: '请输入有效的邮箱地址' });
    if (req.body.phone && !phone) return res.status(400).json({ error: '请输入有效的 11 位手机号' });
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: '密码需为 8–72 个字符' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (email, phone, password_hash) VALUES ($1, $2, $3) RETURNING id, email, phone',
      [email, phone, passwordHash],
    );
    issueAuthCookie(res, result.rows[0]);
    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: '该邮箱或手机号已注册' });
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const result = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '邮箱或密码不正确' });
    }
    issueAuthCookie(res, user);
    return res.json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/sms-code', authLimiter, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const purpose = req.body.purpose === 'reset' ? 'reset' : 'login';
    if (!phone) return res.status(400).json({ error: '请输入有效的 11 位手机号' });

    const result = await query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (!result.rows[0]) return res.status(404).json({ error: '该手机号尚未绑定数码名片账号' });

    const sent = createVirtualSmsCode(phone, purpose);
    if (sent.error) return res.status(429).json({ error: sent.error });
    return res.json({
      message: '虚拟短信验证码已生成，有效期 5 分钟。',
      demo_code: sent.code,
      expires_in: 300,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login/phone', authLimiter, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: '请输入有效的 11 位手机号' });
    if (!consumeVirtualSmsCode(phone, 'login', req.body.code)) {
      return res.status(401).json({ error: '验证码错误或已过期，请重新获取' });
    }

    const result = await query('SELECT id, email, phone FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: '该手机号尚未绑定数码名片账号' });
    issueAuthCookie(res, user);
    return res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/password/reset', authLimiter, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || '');
    if (!phone) return res.status(400).json({ error: '请输入有效的 11 位手机号' });
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: '新密码需为 8–72 个字符' });
    }
    if (!consumeVirtualSmsCode(phone, 'reset', req.body.code)) {
      return res.status(401).json({ error: '验证码错误或已过期，请重新获取' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'UPDATE users SET password_hash = $1 WHERE phone = $2 RETURNING id, email, phone',
      [passwordHash, phone],
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: '该手机号尚未绑定数码名片账号' });
    issueAuthCookie(res, user);
    return res.json({ user, message: '密码已重设，已为你登录。' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const result = await query('SELECT id, email FROM users WHERE id = $1', [req.user.sub]);
    if (!result.rows[0]) return res.status(401).json({ error: '账号不存在' });
    return res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/card', requireAuth, async (req, res, next) => {
  try {
    const cardResult = await query('SELECT * FROM cards WHERE user_id = $1', [req.user.sub]);
    const card = cardResult.rows[0] || null;
    let products = [];
    if (card) {
      const productResult = await query(
        'SELECT * FROM products WHERE card_id = $1 ORDER BY sort_order ASC, created_at DESC',
        [card.id],
      );
      products = productResult.rows;
    }
    res.json({ card, products });
  } catch (error) {
    next(error);
  }
});

app.post('/api/card/scan', requireAuth, scanLimiter, upload.single('business_card'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: '请选择纸质名片照片' });
  const imagePath = path.join(uploadDirectory, req.file.filename);
  try {
    const result = await recognizeBusinessCard(imagePath);
    if (!result.raw_text) {
      return res.status(422).json({ error: '没有识别到清晰文字，请换一张更清楚的照片' });
    }
    return res.json(result);
  } catch (error) {
    next(error);
  } finally {
    await removeUploadedFile(`/uploads/${req.file.filename}`);
  }
});

app.put('/api/card', requireAuth, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'wechat_qr', maxCount: 1 },
]), async (req, res, next) => {
  const avatarFile = req.files?.avatar?.[0];
  const wechatQrFile = req.files?.wechat_qr?.[0];
  const removeNewUploads = async () => {
    await Promise.all([
      avatarFile && removeUploadedFile(`/uploads/${avatarFile.filename}`),
      wechatQrFile && removeUploadedFile(`/uploads/${wechatQrFile.filename}`),
    ]);
  };
  try {
    const name = clean(req.body.name, 80);
    if (!name) {
      await removeNewUploads();
      return res.status(400).json({ error: '请填写姓名或名片主名称' });
    }

    const existingResult = await query('SELECT * FROM cards WHERE user_id = $1', [req.user.sub]);
    const existing = existingResult.rows[0];
    const avatarUrl = avatarFile ? `/uploads/${avatarFile.filename}` : (existing?.avatar_url || '');
    const removeWechatQr = req.body.remove_wechat_qr === '1';
    const wechatQrUrl = wechatQrFile
      ? `/uploads/${wechatQrFile.filename}`
      : (removeWechatQr ? '' : (existing?.wechat_qr_url || ''));
    const jobTitle = clean(req.body.job_title, 100);
    const contactEmail = clean(req.body.contact_email, 254);
    const website = clean(req.body.website, 300);
    if (contactEmail && !validEmail(contactEmail)) {
      await removeNewUploads();
      return res.status(400).json({ error: '请输入有效的联系邮箱' });
    }
    if (website && !validExternalUrl(website)) {
      await removeNewUploads();
      return res.status(400).json({ error: '官网链接必须以 http:// 或 https:// 开头' });
    }
    const fields = [
      name,
      clean(req.body.company_name, 120),
      clean(req.body.department, 100),
      jobTitle,
      clean(req.body.tagline, 120),
      clean(req.body.phone, 30),
      clean(req.body.telephone, 30),
      contactEmail,
      clean(req.body.wechat, 80),
      wechatQrUrl,
      website,
      clean(req.body.address, 200),
      clean(req.body.region, 100),
      avatarUrl,
      clean(req.body.bio, 200),
      clean(req.body.expertise, 200),
      clean(req.body.main_business, 200),
      clean(req.body.founded_at, 30),
      clean(req.body.team_size, 50),
    ];

    let result;
    if (existing) {
      result = await query(
        `UPDATE cards SET
          name=$1, company_name=$2, department=$3, job_title=$4, occupation=$4,
          tagline=$5, phone=$6, telephone=$7, contact_email=$8, wechat=$9,
          wechat_qr_url=$10, website=$11, address=$12, region=$13, avatar_url=$14, bio=$15,
          expertise=$16, main_business=$17, founded_at=$18, team_size=$19,
          updated_at=NOW()
        WHERE user_id=$20 RETURNING *`,
        [...fields, req.user.sub],
      );
      if (avatarFile && existing.avatar_url) await removeUploadedFile(existing.avatar_url);
      if ((wechatQrFile || removeWechatQr) && existing.wechat_qr_url) {
        await removeUploadedFile(existing.wechat_qr_url);
      }
    } else {
      result = await query(
        `INSERT INTO cards
          (user_id, slug, card_type, name, company_name, department, job_title,
           tagline, phone, telephone, contact_email, wechat, wechat_qr_url, website, address,
           region, avatar_url, bio, expertise, main_business, founded_at, team_size, occupation)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        RETURNING *`,
        [req.user.sub, randomUUID(), 'personal', ...fields, jobTitle],
      );
    }
    res.json({ card: result.rows[0] });
  } catch (error) {
    await removeNewUploads();
    next(error);
  }
});

app.post('/api/products/import-site', requireAuth, siteImportLimiter, async (req, res, next) => {
  try {
    const cardResult = await query('SELECT id, website FROM cards WHERE user_id = $1', [req.user.sub]);
    const card = cardResult.rows[0];
    if (!card) return res.status(400).json({ error: '请先保存名片，再从官网抓取产品' });
    if (!card.website) return res.status(400).json({ error: '请先在名片中填写并保存公司官网' });

    let discovered;
    try {
      discovered = await discoverWebsiteProducts(card.website);
    } catch (error) {
      return res.status(400).json({ error: error.message || '暂时无法读取公司官网' });
    }

    const existingResult = await query(
      `SELECT id, name, description, image_url, external_url, source_type
       FROM products WHERE card_id = $1 AND external_url <> $2`,
      [card.id, ''],
    );
    const existingProducts = new Map(existingResult.rows.map((row) => [row.external_url, row]));
    const countResult = await query('SELECT COUNT(*)::int AS count FROM products WHERE card_id = $1', [card.id]);
    let sortOrder = Number(countResult.rows[0]?.count || 0);
    let importedCount = 0;
    let updatedCount = 0;

    for (const item of discovered) {
      const existingProduct = existingProducts.get(item.external_url);
      if (existingProduct) {
        if (existingProduct.source_type === 'website') {
          let imageUrl = existingProduct.image_url;
          if (!imageUrl && item.remote_image_url) {
            try {
              imageUrl = await cacheRemoteImage(item.remote_image_url);
            } catch {
              // A text-only synced product remains useful when the source image is unavailable.
            }
          }
          await query(
            `UPDATE products SET name = $1, description = $2, image_url = $3
             WHERE id = $4 AND card_id = $5`,
            [clean(item.name, 100), clean(item.description, 320), imageUrl, existingProduct.id, card.id],
          );
          updatedCount += 1;
        }
        continue;
      }
      let imageUrl = '';
      try {
        imageUrl = await cacheRemoteImage(item.remote_image_url);
      } catch {
        // Keep the product and show a designed placeholder when its remote image cannot be cached.
      }
      try {
        await query(
          `INSERT INTO products
            (card_id, name, description, image_url, external_url, source_type, sort_order)
           VALUES ($1, $2, $3, $4, $5, 'website', $6)`,
          [
            card.id,
            clean(item.name, 100),
            clean(item.description, 320),
            imageUrl,
            clean(item.external_url, 1000),
            sortOrder,
          ],
        );
        existingProducts.set(item.external_url, { external_url: item.external_url });
        importedCount += 1;
        sortOrder += 1;
      } catch (error) {
        if (imageUrl) await removeUploadedFile(imageUrl);
        throw error;
      }
    }

    const productsResult = await query(
      'SELECT * FROM products WHERE card_id = $1 ORDER BY sort_order ASC, created_at DESC',
      [card.id],
    );
    res.json({ imported_count: importedCount, updated_count: updatedCount, products: productsResult.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/products', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择产品图片' });
    const cardResult = await query('SELECT id FROM cards WHERE user_id = $1', [req.user.sub]);
    const card = cardResult.rows[0];
    if (!card) {
      await removeUploadedFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: '请先保存名片，再添加产品' });
    }
    const name = clean(req.body.name, 100);
    const description = clean(req.body.description, 320);
    const externalUrl = clean(req.body.external_url, 1000);
    if (!name) {
      await removeUploadedFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: '请填写产品名称' });
    }
    if (!validExternalUrl(externalUrl)) {
      await removeUploadedFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: '产品链接必须以 http:// 或 https:// 开头' });
    }
    const result = await query(
      `INSERT INTO products (card_id, name, description, image_url, external_url, source_type)
       VALUES ($1, $2, $3, $4, $5, 'manual') RETURNING *`,
      [card.id, name, description, `/uploads/${req.file.filename}`, externalUrl],
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    if (req.file) await removeUploadedFile(`/uploads/${req.file.filename}`);
    next(error);
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM products
       WHERE id = $1 AND card_id IN (SELECT id FROM cards WHERE user_id = $2)
       RETURNING image_url`,
      [req.params.id, req.user.sub],
    );
    if (!result.rows[0]) return res.status(404).json({ error: '产品不存在' });
    await removeUploadedFile(result.rows[0].image_url);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/cards/:slug', async (req, res, next) => {
  try {
    const cardResult = await query('SELECT * FROM cards WHERE slug = $1', [req.params.slug]);
    const card = cardResult.rows[0];
    if (!card) return res.status(404).json({ error: '这张名片不存在或尚未发布' });
    const productResult = await query(
      `SELECT id, name, description, image_url, external_url, source_type
       FROM products WHERE card_id = $1 ORDER BY sort_order ASC, created_at DESC`,
      [card.id],
    );
    res.json({ card, products: productResult.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '图片不能超过 5MB' });
  if (error.message?.startsWith('仅支持')) return res.status(400).json({ error: error.message });
  res.status(500).json({ error: '服务器暂时遇到问题，请稍后再试' });
});

const engine = await initDatabase();
const server = app.listen(port, () => {
  console.log(`数码名片已启动：http://localhost:${port}`);
  console.log(`数据库：${engine}`);
});

async function shutdown() {
  server.close(async () => {
    await closeOcrWorker();
    await closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
