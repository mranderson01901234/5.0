/**
 * Storage Adapter Interface
 * Abstracts file storage operations for local and cloud backends
 */

export interface StorageAdapter {
  /**
   * Upload a file buffer to storage
   * @param file Buffer containing file data
   * @param path Storage path (e.g., "exports/user123/export-abc.pdf")
   * @returns Storage URL or path
   */
  upload(file: Buffer, path: string): Promise<string>;

  /**
   * Get URL for accessing a stored file
   * @param path Storage path
   * @returns Public URL or presigned URL (may be async for S3)
   */
  getUrl(path: string): string | Promise<string>;
}

