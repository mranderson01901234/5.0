/**
 * Image optimization utilities
 * Compresses and resizes images before upload
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  maxSizeBytes?: number; // Target max file size
}

const DEFAULT_OPTIONS: Required<ImageOptimizationOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  maxSizeBytes: 2 * 1024 * 1024, // 2MB target
};

/**
 * Optimize an image file
 * Returns optimized File or original if optimization fails
 */
export async function optimizeImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Only process image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // If already small enough, skip optimization
  if (file.size <= opts.maxSizeBytes) {
    return file;
  }

  try {
    return await compressImage(file, opts);
  } catch (error) {
    console.warn('[optimizeImage] Optimization failed, using original:', error);
    return file;
  }
}

/**
 * Compress and resize image using Canvas API
 */
async function compressImage(
  file: File,
  options: Required<ImageOptimizationOptions>
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions
      let { width, height } = img;
      const aspectRatio = width / height;

      if (width > options.maxWidth) {
        width = options.maxWidth;
        height = width / aspectRatio;
      }
      if (height > options.maxHeight) {
        height = options.maxHeight;
        width = height * aspectRatio;
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with quality settings
      let quality = options.quality;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }

          // If still too large, reduce quality further
          if (blob.size > options.maxSizeBytes && quality > 0.5) {
            quality = Math.max(0.5, quality - 0.1);
            canvas.toBlob(
              (secondBlob) => {
                if (!secondBlob) {
                  resolve(new File([blob], file.name, { type: file.type }));
                  return;
                }
                resolve(new File([secondBlob], file.name, { type: file.type }));
              },
              file.type,
              quality
            );
          } else {
            resolve(new File([blob], file.name, { type: file.type }));
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Check if file is an image that can be optimized
 */
export function canOptimizeImage(file: File): boolean {
  return file.type.startsWith('image/') && 
         (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp');
}

