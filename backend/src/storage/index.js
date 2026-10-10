import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

// Report files. Without S3_BUCKET, screenshots are written to ./data/screenshots.
// With S3_BUCKET, screenshots and the full report JSON go to Amazon S3.

let s3Promise;
async function s3() {
  s3Promise ||= (async () => {
    const sdk = await import('@aws-sdk/client-s3');
    return { sdk, client: new sdk.S3Client({ region: config.s3Region }) };
  })();
  return s3Promise;
}

export async function saveScreenshot(scanId, buffer) {
  if (config.s3Bucket) {
    const { sdk, client } = await s3();
    const key = `screenshots/${scanId}.jpg`;
    await client.send(
      new sdk.PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: buffer, ContentType: 'image/jpeg' }),
    );
    return { kind: 's3', key };
  }
  await fs.mkdir(config.localScreenshotDir, { recursive: true });
  const key = `${scanId}.jpg`;
  await fs.writeFile(path.join(config.localScreenshotDir, key), buffer);
  return { kind: 'local', key };
}

export async function screenshotUrl(ref) {
  if (!ref) return null;
  if (ref.kind === 'local') return `/screenshots/${ref.key}`;
  if (ref.kind === 's3' && config.s3Bucket) {
    const { sdk, client } = await s3();
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(client, new sdk.GetObjectCommand({ Bucket: config.s3Bucket, Key: ref.key }), {
      expiresIn: 3600,
    });
  }
  return null;
}

/** Keeps a full copy of the finished report in S3 (no-op when S3 is not configured). */
export async function saveReportJson(scanId, report) {
  if (!config.s3Bucket) return;
  const { sdk, client } = await s3();
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: `reports/${scanId}.json`,
      Body: JSON.stringify(report),
      ContentType: 'application/json',
    }),
  );
}

/** The screenshot as bytes (for the PDF report). Returns null when there is none or it cannot be read. */
export async function screenshotBuffer(ref) {
  try {
    if (!ref) return null;
    if (ref.kind === 'local') return await fs.readFile(path.join(config.localScreenshotDir, path.basename(ref.key)));
    if (ref.kind === 's3' && config.s3Bucket) {
      const { sdk, client } = await s3();
      const out = await client.send(new sdk.GetObjectCommand({ Bucket: config.s3Bucket, Key: ref.key }));
      return Buffer.from(await out.Body.transformToByteArray());
    }
  } catch {
    // the PDF is still produced, just without the picture
  }
  return null;
}
