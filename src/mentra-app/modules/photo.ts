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
import piexif from 'piexifjs';

const SEENIQ_API_BASE_URL =
  process.env.SEENIQ_API_BASE_URL ?? 'http://localhost:3000/api';

const SEENIQ_API_KEY = process.env.SEENIQ_API_KEY;

const SEENIQ_PERSONA_VERSION_ID =
  process.env.SEENIQ_PERSONA_VERSION_ID;

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
  buffer: Buffer;
  requestId: string;
}

interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  timestamp: Date;
  correlationId?: string;
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
      buffer: photo.buffer,
      requestId: photo.requestId,
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
}: SendPhotoParams): Promise<string | null | undefined> {
  if (!SEENIQ_API_KEY) {
    logger.warn('SEENIQ_API_KEY is not set. Skipping Seeniq upload.');
    return null;
  }

  if (!base64Photo) {
    logger.warn('Empty photo provided to Seeniq upload.');
    return null;
  }

  logger.info(`Sending photo to Seeniq for user ${userId} (photo size: ${base64Photo.length} base64 chars)`);

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
        persona_version_id: Number(SEENIQ_PERSONA_VERSION_ID),
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
      return null;
    }

    const explanation = extractExplanationText(payload);

    if (explanation) {
      const message = `Seeniq explanation: ${explanation}`;
      logger.info(message);
      broadcastTranscriptionToClients(message, true, userId);
      return explanation;
    } 

    return null;
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

/**
 * Add GPS location data to photo EXIF
 */
export function addLocationToExif(
  photoBuffer: Buffer,
  location: LocationUpdate,
  logger: any
): { buffer: Buffer; base64Data: string } | null {
  try {
    // Convert buffer to base64 data URL format
    const base64Image = photoBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    // Load existing EXIF or create new
    let exifObj: any;
    try {
      exifObj = piexif.load(dataUrl);
    } catch (error) {
      // If no EXIF exists, create a new object
      exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, 'thumbnail': null };
    }

    // Set GPS latitude
    const latRef = location.latitude >= 0 ? 'N' : 'S';
    const latDeg = Math.floor(Math.abs(location.latitude));
    const latMin = Math.floor((Math.abs(location.latitude) - latDeg) * 60);
    const latSec = (Math.abs(location.latitude) - latDeg - latMin / 60) * 3600;
    exifObj['GPS'][piexif.GPSIFD.GPSLatitude] = [
      [latDeg, 1],
      [latMin, 1],
      [Math.floor(latSec * 100), 100]
    ];
    exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef] = latRef;

    // Set GPS longitude
    const lonRef = location.longitude >= 0 ? 'E' : 'W';
    const lonDeg = Math.floor(Math.abs(location.longitude));
    const lonMin = Math.floor((Math.abs(location.longitude) - lonDeg) * 60);
    const lonSec = (Math.abs(location.longitude) - lonDeg - lonMin / 60) * 3600;
    exifObj['GPS'][piexif.GPSIFD.GPSLongitude] = [
      [lonDeg, 1],
      [lonMin, 1],
      [Math.floor(lonSec * 100), 100]
    ];
    exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lonRef;

    // Set altitude if available (stored as rational number in meters)
    if (location.altitude !== undefined) {
      // Convert to rational number with 2 decimal precision
      const altitudeMeters = Math.abs(location.altitude);
      exifObj['GPS'][piexif.GPSIFD.GPSAltitude] = [Math.round(altitudeMeters * 100), 100];
      exifObj['GPS'][piexif.GPSIFD.GPSAltitudeRef] = location.altitude >= 0 ? 0 : 1;
    }

    // Convert EXIF object to string
    const exifStr = piexif.dump(exifObj);

    // Insert EXIF into image
    const newDataUrl = piexif.insert(exifStr, dataUrl);

    // Extract base64 data from data URL
    const base64Match = newDataUrl.match(/base64,(.+)$/);
    if (!base64Match) {
      logger.error('Failed to extract base64 data from EXIF-modified image');
      return null;
    }

    const newBase64Data = base64Match[1];
    const newBuffer = Buffer.from(newBase64Data, 'base64');

    logger.info(`Location added to EXIF: ${location.latitude}, ${location.longitude}`);
    return {
      buffer: newBuffer,
      base64Data: newBase64Data,
    };
  } catch (error: any) {
    logger.error(`Error adding location to EXIF: ${error?.message ?? error}`);
    return null;
  }
}