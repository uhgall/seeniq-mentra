/**
 * =============================================================================
 * Button Event Handlers
 * =============================================================================
 *
 * This file contains all the logic for handling button presses and touch
 * events on the MentraOS glasses.
 *
 * =============================================================================
 */

import { AppSession } from '@mentra/sdk';
import piexif from 'piexifjs';
import { sendPhotoToSeeniq } from '../modules/photo';

/**
 * Set up all button and touch event handlers for a session
 */
export function setupButtonHandler(
  session: AppSession,
  userId: string,
  logger: any,
  takePhotoCallback: (session: AppSession, userId: string) => Promise<{ base64Data: string; mimeType: string } | undefined>
): void {

  // Handle swipe events on the glasses touchpad
  // Valid gestures: "forward_swipe", "backward_swipe", "up_swipe", "down_swipe"
//   session.events.onTouchEvent("forward_swipe", () => {
//     console.log("Forward swipe detected!");
//   });

//   session.events.onTouchEvent("backward_swipe", () => {
//     console.log("Backward swipe detected!");
//   });



  // Handle physical button presses
  session.events.onButtonPress(async (button) => {
    logger.info(`Button pressed: ${button.buttonId}, type: ${button.pressType}`);
    console.log("button pressed!");
    // session.events.onTouchEvent("single_tap", () => {
    //   console.log("Tap detected!");
    // });
    // Long press = toggle video streaming mode
    if (button.pressType === 'long') {
      console.log("Long press detected - toggling streaming mode");
      // TODO: Implement streaming mode toggle
      return;
    }

    // Quick press = take a single photo
    console.log("Quick press detected - taking photo");
    const result = await takePhotoCallback(session, userId);

    if (!result?.base64Data) {
      logger.warn('Photo capture did not return image data; skipping upload.');
      return;
    }

    const base64WithGps = await addGpsExifIfAvailable(
      session,
      result.base64Data,
      result.mimeType,
      logger
    );

    await sendPhotoToSeeniq({
      base64Photo: base64WithGps,
      userId,
      logger,
    });
  });
}

async function addGpsExifIfAvailable(
  session: AppSession,
  base64Photo: string,
  mimeType: string,
  logger: any
): Promise<string> {
  if (!base64Photo) {
    return base64Photo;
  }

  const normalizedMime = (mimeType ?? '').toLowerCase();
  const isJpeg = normalizedMime.includes('jpeg') || normalizedMime.includes('jpg');

  if (!isJpeg) {
    logger.info(`Skipping GPS embedding for non-JPEG mime type: ${mimeType}`);
    return base64Photo;
  }

  if (!session?.location?.getLatestLocation) {
    logger.warn('Location API not available on session; skipping GPS embedding.');
    return base64Photo;
  }

  let location: any;

  try {
    location = await session.location.getLatestLocation({ accuracy: 'high' });
  } catch (error: any) {
    logger.warn(`Failed to obtain location: ${error?.message ?? error}`);
    return base64Photo;
  }

  if (
    !location ||
    typeof location.latitude !== 'number' ||
    typeof location.longitude !== 'number'
  ) {
    logger.warn('Location API returned invalid data; skipping GPS embedding.');
    return base64Photo;
  }

  try {
    const buffer = Buffer.from(base64Photo, 'base64');
    const binary = buffer.toString('binary');
    const exif = piexif.load(binary);

    exif.GPS = exif.GPS ?? {};
    exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = location.latitude >= 0 ? 'N' : 'S';
    exif.GPS[piexif.GPSIFD.GPSLatitude] = decimalDegreesToDmsRational(Math.abs(location.latitude));
    exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = location.longitude >= 0 ? 'E' : 'W';
    exif.GPS[piexif.GPSIFD.GPSLongitude] = decimalDegreesToDmsRational(Math.abs(location.longitude));

    if (typeof location.altitude === 'number') {
      exif.GPS[piexif.GPSIFD.GPSAltitudeRef] = location.altitude < 0 ? 1 : 0;
      exif.GPS[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(location.altitude) * 100), 100];
    }

    if (typeof location.accuracy === 'number') {
      exif.GPS[piexif.GPSIFD.GPSHPositioningError] = [
        Math.round(Math.abs(location.accuracy) * 100),
        100,
      ];
    }

    const exifBytes = piexif.dump(exif);
    const updatedBinary = piexif.insert(exifBytes, binary);
    const updatedBase64 = Buffer.from(updatedBinary, 'binary').toString('base64');

    logger.info(
      `Embedded GPS into photo: lat=${location.latitude}, lon=${location.longitude}, accuracy=${location.accuracy ?? 'n/a'}`
    );

    return updatedBase64;
  } catch (error: any) {
    logger.error(`Failed to embed GPS metadata: ${error?.message ?? error}`);
    return base64Photo;
  }
}

function decimalDegreesToDmsRational(value: number): Array<[number, number]> {
  const degrees = Math.floor(value);
  const minutesFloat = (value - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;

  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 1000), 1000],
  ];
}
