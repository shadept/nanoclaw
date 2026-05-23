/**
 * Image processing for vision support.
 * Resizes images with sharp and encodes as base64 for Claude's multimodal API.
 */
import fs from 'fs';
import sharp from 'sharp';

import { logger } from './logger.js';

export interface ImageAttachment {
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64-encoded
}

// Claude vision accepts up to 1568px on the longest side
const MAX_DIMENSION = 1568;

/**
 * Resize an image to fit within MAX_DIMENSION and encode as base64 JPEG.
 * Returns null if processing fails.
 */
export async function processImage(
  filePath: string,
): Promise<ImageAttachment | null> {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn({ filePath }, 'Image file not found');
      return null;
    }

    const buffer = await sharp(filePath)
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    const data = buffer.toString('base64');

    logger.info(
      { filePath, size: buffer.length },
      'Image processed for vision',
    );

    return { media_type: 'image/jpeg', data };
  } catch (err) {
    logger.error({ filePath, err }, 'Image processing failed');
    return null;
  }
}
