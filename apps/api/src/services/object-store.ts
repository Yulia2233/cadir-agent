import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const allowedPrefixes = ['uploads/', 'revisions/', 'candidates/', 'public-cases/'] as const;

export type StoredObject = {
  key: string;
  size: number;
  checksum: string;
  contentType: string;
};

export class ObjectStore {
  readonly #client: S3Client;

  public constructor(
    private readonly bucket: string,
    config: { endpoint?: string; region: string; accessKeyId?: string; secretAccessKey?: string },
  ) {
    this.#client = new S3Client({
      region: config.region,
      forcePathStyle: config.endpoint !== undefined,
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    assertObjectKey(key);
    const checksum = createHash('sha256').update(body).digest('hex');
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ChecksumSHA256: createHash('sha256').update(body).digest('base64'),
        Metadata: { sha256: checksum },
      }),
    );
    return { key, size: body.byteLength, checksum, contentType };
  }

  async head(key: string): Promise<StoredObject> {
    assertObjectKey(key);
    const result = await this.#client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      key,
      size: result.ContentLength ?? 0,
      checksum: result.Metadata?.sha256 ?? '',
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }

  async getBytes(key: string, maxBytes: number): Promise<Uint8Array> {
    assertObjectKey(key);
    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!(result.Body instanceof Readable))
      throw new Error('Object response is not a readable stream');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of result.Body) {
      const buffer = Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > maxBytes) throw new Error('Object exceeds the read limit');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    assertObjectKey(sourceKey);
    assertObjectKey(destinationKey);
    await this.#client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey).replaceAll('%2F', '/')}`,
        Key: destinationKey,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    assertObjectKey(key);
    return getSignedUrl(this.#client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async ready(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}

export function assertObjectKey(value: string): void {
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').includes('..') ||
    !allowedPrefixes.some((prefix) => value.startsWith(prefix))
  ) {
    throw new Error('Object key is outside an allowed namespace');
  }
}
