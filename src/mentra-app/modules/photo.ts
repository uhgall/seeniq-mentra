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
import { broadcastPhotoToClients, broadcastTranscriptionToClients } from '../routes/routes';

const SEENIQ_API_BASE_URL =
  process.env.SEENIQ_API_BASE_URL ?? 'http://localhost:3000/api';

const SEENIQ_API_KEY = process.env.SEENIQ_API_KEY;

const SEENIQ_PERSONA_VERSION_ID =
  process.env.SEENIQ_PERSONA_VERSION_ID ?? '43';

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
interface TakePhotoResult {
  base64Data: string;
  mimeType: string;
}

export async function takePhoto(
  session: AppSession,
  userId: string,
  logger: any,
  photosMap: Map<string, StoredPhoto>
): Promise<TakePhotoResult | undefined> {
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

    return {
      base64Data,
      mimeType: photo.mimeType,
    };

  } catch (error) {
    logger.error(`Error taking photo: ${error}`);
  }
}

interface SendPhotoParams {
  base64Photo: string;
  userId: string;
  logger: any;
}

export async function sendPhotoToSeeniq({
  base64Photo,
  userId,
  logger,
}: SendPhotoParams): Promise<void> {
  if (!SEENIQ_API_KEY) {
    logger.warn('SEENIQ_API_KEY is not set. Skipping Seeniq upload.');
    return;
  }

  if (!base64Photo) {
    logger.warn('Empty photo provided to Seeniq upload.');
    return;
  }



  

  const url = `${SEENIQ_API_BASE_URL.replace(/\/$/, '')}/discoveries/create_and_send_explanation_text`;

  // Test GET request to persona_versions endpoint
  try {
    const personaVersionsUrl = `${SEENIQ_API_BASE_URL.replace(/\/$/, '')}/persona_versions`;
    const personaVersionsResponse = await fetch(personaVersionsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SEENIQ_API_KEY}`,
      },
    });

    const personaVersionsData = personaVersionsResponse.ok
      ? await personaVersionsResponse.json()
      : { error: `Failed with status ${personaVersionsResponse.status}`, text: await personaVersionsResponse.text() };
    
    console.log('SEENIQRESULTS', personaVersionsData);
  } catch (error: any) {
    console.log('SEENIQRESULTS', { error: error?.message ?? error });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SEENIQ_API_KEY}`,
      },
      body: JSON.stringify({
        photo: base64Photo,
        persona_version_id: Number(SEENIQ_PERSONA_VERSION_ID) || 43,
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      logger.error(
        `Seeniq API request failed (${response.status}): ${
          typeof payload === 'string' ? payload : JSON.stringify(payload)
        }`,
      );
      return;
    }

    const explanation = extractExplanationText(payload);

    if (explanation) {
      const message = `Seeniq explanation: ${explanation}`;
      logger.info(message);
      broadcastTranscriptionToClients(message, true, userId);
    } else {
      logger.warn(
        `Seeniq API response did not include recognizable explanation text: ${
          typeof payload === 'string' ? payload : JSON.stringify(payload)
        }`,
      );
    }
  } catch (error: any) {
    logger.error(`Error calling Seeniq API: ${error?.message ?? error}`);
  }
}

function extractExplanationText(payload: any): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload.trim() || null;
  }

  const candidateKeys = [
    'explanation',
    'explanation_text',
    'explanationText',
    'text',
    'message',
    'summary',
  ];

  for (const key of candidateKeys) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  if (typeof payload?.data === 'object' && payload.data) {
    return extractExplanationText(payload.data);
  }

  return null;
}
