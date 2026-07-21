import crypto from 'node:crypto';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { env } from '../env.js';

if (env.NODE_ENV === 'production') sharp.concurrency(1);

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
let bucketReady: Promise<void> | null = null;

function ensureBucket() {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      return;
    } catch (error) {
      if (!env.S3_AUTO_CREATE_BUCKET) {
        throw new Error(`Хранилище ${env.S3_BUCKET} недоступно. Создайте bucket и проверьте S3-переменные.`, { cause: error });
      }
    }

    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    if (env.S3_SET_PUBLIC_POLICY) {
      await s3.send(new PutBucketPolicyCommand({
        Bucket: env.S3_BUCKET,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${env.S3_BUCKET}/*`],
          }],
        }),
      }));
    }
  })().catch((error) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

export async function processAndUpload(buffer: Buffer, mime: string, userId: string) {
  if (!allowed.has(mime)) throw new Error('Поддерживаются JPEG, PNG, WebP и HEIC');
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error('Файл больше 15 МБ');
  await ensureBucket();

  const key = `${userId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  const base = sharp(buffer, { failOn: 'warning' }).rotate();
  const meta = await base.metadata();
  const variants = [
    await base.clone().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer(),
    await base.clone().resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    await base.clone().resize({ width: 320, height: 320, fit: 'cover' }).webp({ quality: 76 }).toBuffer(),
  ];
  const names = ['large.webp', 'medium.webp', 'thumb.webp'];

  await Promise.all(variants.map((body, index) => s3.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: `${key}/${names[index]}`,
    Body: body,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }))));

  const publicBase = env.S3_PUBLIC_URL.replace(/\/$/, '');
  const urls = names.map((name) => `${publicBase}/${key}/${name}`);
  return {
    storageKey: key,
    originalUrl: urls[0]!,
    largeUrl: urls[0]!,
    mediumUrl: urls[1]!,
    thumbnailUrl: urls[2]!,
    mimeType: 'image/webp',
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    sizeBytes: buffer.byteLength,
  };
}
