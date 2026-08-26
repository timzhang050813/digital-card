import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

const uploadDirectory = path.resolve('uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const originalExtension = path.extname(file.originalname || '').toLowerCase();
    const normalizedExtension = originalExtension === '.jpeg' ? '.jpg' : originalExtension;
    const safeExtension = ['.jpg', '.png', '.webp', '.gif'].includes(normalizedExtension)
      ? normalizedExtension
      : '.img';
    callback(null, `${randomUUID()}${allowedTypes.get(file.mimetype) || safeExtension}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedExtension = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension);
    if (!allowedTypes.has(file.mimetype) && !allowedExtension) {
      return callback(new Error('仅支持 JPG、PNG、WebP 或 GIF 图片'));
    }
    if (!allowedTypes.has(file.mimetype)) {
      file.mimetype = extension === '.jpeg' ? 'image/jpeg' : `image/${extension.slice(1)}`;
    }
    callback(null, true);
  },
});
