/**
 * =============================================================================
 * Photo Handling Module
 * =============================================================================
 *
 * This module contains all photo-related functionality including taking photos
 * and storing them.
 *
 * =============================================================================
 */

import { AppSession } from '@mentra/sdk';
import { broadcastPhotoToClients } from '../routes/routes';

interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

/**
 * Take a photo and store it temporarily
 */
export async function takePhoto(
  session: AppSession,
  userId: string,
  logger: any,
  photosMap: Map<string, StoredPhoto>
): Promise<void> {
  try {
    const photo = await session.camera.requestPhoto();
    logger.info(`Photo taken for user ${userId}, timestamp: ${photo.timestamp}`);

    // Store the photo in the map for API access
    const storedPhoto: StoredPhoto = {
      requestId: photo.requestId,
      buffer: photo.buffer,
      timestamp: photo.timestamp,
      userId: userId,
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size
    };

    // Store photo by requestId to support multiple photos per user
    photosMap.set(photo.requestId, storedPhoto);
    logger.info(`Photo stored for user ${userId}, requestId: ${photo.requestId}`);

    // Broadcast to all SSE clients
    broadcastPhotoToClients(storedPhoto);

    // Console log the base64 image
    const base64Data = photo.buffer.toString('base64');
    console.log('\n========================================');
    console.log('📸 BASE64 IMAGE DATA');
    console.log('========================================');
    console.log(`Request ID: ${photo.requestId}`);
    console.log(`MIME Type: ${photo.mimeType}`);
    console.log(`File Size: ${photo.size} bytes`);
    console.log(`Timestamp: ${photo.timestamp}`);
    console.log('\n🖼️  Data URL (use this in <img> tag):');
    console.log(`data:${photo.mimeType};base64,${base64Data.substring(0, 100)}...`);
    console.log('\n📋 Full Base64 String (first 500 chars):');
    console.log(base64Data.substring(0, 500) + '...');
    console.log('\n📋 Full Base64 String (complete):');
    console.log(base64Data);
    console.log('========================================\n');

  } catch (error) {
    logger.error(`Error taking photo: ${error}`);
  }
}
