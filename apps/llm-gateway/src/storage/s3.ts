/**
 * S3 Storage Adapter
 * Stores files in AWS S3 (for production)
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageAdapter } from './adapter.js';

export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private presignedUrlExpiry: number; // seconds

  constructor(
    bucket: string,
    region: string = 'us-east-1',
    presignedUrlExpiry: number = 3600 // 1 hour default
  ) {
    this.bucket = bucket;
    this.region = region;
    this.presignedUrlExpiry = presignedUrlExpiry;

    this.client = new S3Client({
      region: this.region,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    });
  }

  async upload(file: Buffer, path: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: file,
      ContentType: this.getContentType(path),
    });

    await this.client.send(command);

    // Return the S3 key
    return path;
  }

  async getUrl(path: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    });

    // Generate presigned URL
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.presignedUrlExpiry,
    });

    return url;
  }

  private getContentType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return contentTypes[ext || ''] || 'application/octet-stream';
  }
}

