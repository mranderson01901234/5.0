/**
 * Local Storage Adapter
 * Stores files in local filesystem (for development)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { StorageAdapter } from './adapter.js';

export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath: string = './data/exports') {
    this.basePath = basePath;
    // Ensure base directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(file: Buffer, path: string): Promise<string> {
    const fullPath = join(this.basePath, path);
    const dir = dirname(fullPath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write file
    writeFileSync(fullPath, file);

    // Return relative path (will be converted to URL by getUrl)
    return path;
  }

  getUrl(path: string): string {
    // For local storage, return a path that can be served by the API
    // In production, this would be a full URL like http://localhost:8787/api/exports/...
    const baseUrl = process.env.EXPORT_BASE_URL || 'http://localhost:8787';
    return `${baseUrl}/api/exports/${path}`;
  }
}

