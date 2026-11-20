/**
 * Photo backups from a laptop (Node): the AWS SDK pieces the shared code
 * (supabase/functions/_shared/photo-backup.ts) is handed, and the version
 * listing a restore needs. Nothing here prints a key or a secret.
 */
import { createHash } from "node:crypto";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectVersion, S3Kit } from "../../supabase/functions/_shared/photo-backup";

/**
 * The backup bucket's client. BACKUP_S3_ENDPOINT is only for rehearsing
 * against a local S3 (the local Supabase's S3 endpoint); AWS needs none.
 */
export function backupS3(env: Record<string, string | undefined>, accessKeyId: string, secretAccessKey: string) {
  return new S3Client({
    region: env.BACKUP_S3_REGION || "ap-southeast-1",
    endpoint: env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.BACKUP_S3_ENDPOINT),
    credentials: { accessKeyId, secretAccessKey },
    // Checksums only where S3 requires them; uploads carry their own
    // Content-MD5, which AWS verifies and S3-compatible stores understand.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 5,
  });
}

export function s3Kit(s3: S3Client): S3Kit {
  return {
    send: (command) => s3.send(command as never),
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    md5Base64: (body) => createHash("md5").update(body).digest("base64"),
  };
}

/** Every version and delete marker under `prefix` (a versioned bucket). */
export async function listVersions(s3: S3Client, bucket: string, prefix: string): Promise<ObjectVersion[]> {
  const out: ObjectVersion[] = [];
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  for (;;) {
    const page = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionMarker,
      })
    );
    for (const v of page.Versions ?? []) {
      if (!v.Key) continue;
      out.push({
        key: v.Key,
        versionId: v.VersionId ?? "null",
        lastModified: v.LastModified ?? new Date(0),
        deleteMarker: false,
        size: v.Size ?? 0,
      });
    }
    for (const m of page.DeleteMarkers ?? []) {
      if (!m.Key) continue;
      out.push({
        key: m.Key,
        versionId: m.VersionId ?? "null",
        lastModified: m.LastModified ?? new Date(0),
        deleteMarker: true,
        size: 0,
      });
    }
    if (!page.IsTruncated) break;
    keyMarker = page.NextKeyMarker;
    versionMarker = page.NextVersionIdMarker;
  }
  return out;
}

export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
