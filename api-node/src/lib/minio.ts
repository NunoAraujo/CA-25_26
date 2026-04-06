import { Client } from "minio";

const minioEndpoint = process.env.MINIO_ENDPOINT ?? "http://minio:9000";
const endpointUrl = new URL(minioEndpoint);
const bucket = process.env.MINIO_BUCKET ?? "journals";

const client = new Client({
  endPoint: endpointUrl.hostname,
  port: Number(
    endpointUrl.port || (endpointUrl.protocol === "https:" ? 443 : 80),
  ),
  useSSL: endpointUrl.protocol === "https:",
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
});

let bucketReadyPromise: Promise<void> | null = null;

export async function ensureBucketExists() {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket, "us-east-1");
      }
    })();
  }

  await bucketReadyPromise;
}

export async function uploadAudioObject(
  objectKey: string,
  buffer: Buffer,
  mimeType: string,
) {
  await ensureBucketExists();
  await client.putObject(bucket, objectKey, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
}

export function buildInternalObjectUrl(objectKey: string) {
  return `${minioEndpoint}/${bucket}/${objectKey}`;
}

export function buildPublicObjectUrl(objectKey: string) {
  const publicBase =
    process.env.MINIO_PUBLIC_ENDPOINT ?? "http://localhost:9000";
  return `${publicBase}/${bucket}/${objectKey}`;
}

export { bucket as minioBucket, client as minioClient };
