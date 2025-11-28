/**
 * =============================================================================
 * Location Handling Module
 * =============================================================================
 *
 * This module contains all location-related functionality including getting
 * GPS location data.
 *
 * =============================================================================
 */

import { AppSession } from '@mentra/sdk';

/**
 * Get the latest location (one-time poll) with high accuracy
 */
interface LocationUpdate {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number;
    timestamp: Date;
    correlationId?: string;
  }


export async function getLocation(
  session: AppSession,
  userId: string,
  logger: any
): Promise<LocationUpdate | undefined> {
  try {
    const location = await session.location.getLatestLocation({ accuracy: "high" });

    // Debug: Log the entire location object to see its structure
    console.log('\n========================================');
    console.log('📍 RAW LOCATION OBJECT');
    console.log('========================================');
    console.log(JSON.stringify(location, null, 2));
    console.log('========================================\n');

    // Access location properties - handle both possible structures
    const locationData = location as any;
    
    // Try to get latitude/longitude - they might be in different property names
    const latitude = locationData.latitude ?? locationData.lat ?? locationData.coords?.latitude;
    const longitude = locationData.longitude ?? locationData.lng ?? locationData.lon ?? locationData.coords?.longitude;
    const accuracy = locationData.accuracy ?? locationData.coords?.accuracy;
    const altitude = locationData.altitude ?? locationData.coords?.altitude;
    const timestamp = locationData.timestamp;
    const correlationId = locationData.correlationId;

    if (latitude === undefined || longitude === undefined) {
      logger.warn(`Location data missing coordinates. Full object: ${JSON.stringify(locationData)}`);
      console.warn('⚠️  Location data missing latitude/longitude. Full object:', locationData);
    }

    logger.info(`Location retrieved for user ${userId}, timestamp: ${timestamp}`);
    logger.info(`Location: ${latitude}, ${longitude}, accuracy: ${accuracy}m`);

    // Console log the location data
    console.log('\n========================================');
    console.log('📍 LOCATION DATA');
    console.log('========================================');
    console.log(`User ID: ${userId}`);
    console.log(`Latitude: ${latitude}`);
    console.log(`Longitude: ${longitude}`);
    console.log(`Accuracy: ${accuracy}m`);
    if (altitude !== undefined) {
      console.log(`Altitude: ${altitude}m`);
    }
    console.log(`Timestamp: ${timestamp}`);
    if (correlationId) {
      console.log(`Correlation ID: ${correlationId}`);
    }
    console.log('========================================\n');

    // Only return if we have valid coordinates
    if (latitude === undefined || longitude === undefined || accuracy === undefined || !timestamp) {
      logger.error('Invalid location data: missing required fields');
      return undefined;
    }

    const result: LocationUpdate = {
      latitude,
      longitude,
      accuracy,
      timestamp,
    };

    if (altitude !== undefined) {
      result.altitude = altitude;
    }

    if (correlationId) {
      result.correlationId = correlationId;
    }

    return result;

  } catch (error) {
    logger.error(`Error getting location: ${error}`);
    console.error('Error getting location:', error);
  }
}

