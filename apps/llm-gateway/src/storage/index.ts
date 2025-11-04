/**
 * Storage Factory
 * Creates storage adapter based on environment configuration
 */

import type { StorageAdapter } from './adapter.js';
import { LocalStorageAdapter } from './local.js';
import { S3StorageAdapter } from './s3.js';

export function createStorageAdapter(): StorageAdapter {
  const backend = process.env.STORAGE_BACKEND || 'local';

  switch (backend) {
    case 's3':
      const bucket = process.env.AWS_S3_BUCKET || 'artifacts-prod';
      const region = process.env.AWS_REGION || 'us-east-1';
      return new S3StorageAdapter(bucket, region);
    
    case 'local':
    default:
      const basePath = process.env.EXPORT_STORAGE_PATH || './data/exports';
      return new LocalStorageAdapter(basePath);
  }
}

export type { StorageAdapter } from './adapter.js';
export { LocalStorageAdapter } from './local.js';
export { S3StorageAdapter } from './s3.js';

