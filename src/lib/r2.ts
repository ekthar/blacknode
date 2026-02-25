import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
});

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export function buildObjectKey(userId: string, filename: string): string {
  const safeName = sanitizeFilename(filename);
  return `${userId}/${Date.now()}-${safeName}`;
}

export async function createSignedUploadUrl(objectKey: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.r2BucketName,
    Key: objectKey,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 120 });
}

export async function createSignedDownloadUrl(objectKey: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.r2BucketName,
    Key: objectKey,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 120 });
}

export async function uploadObjectToR2(
  objectKey: string,
  contentType: string,
  body: Uint8Array,
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: env.r2BucketName,
    Key: objectKey,
    ContentType: contentType,
    Body: body,
  });

  await r2Client.send(command);
}

export async function deleteObjectFromR2(objectKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: env.r2BucketName,
    Key: objectKey,
  });

  await r2Client.send(command);
}
