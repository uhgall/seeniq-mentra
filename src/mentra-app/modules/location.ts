/**
 * =============================================================================
 * Location Handling Module
 * =============================================================================
 *
 * This module contains all location-related functionality including getting
 * GPS location data and reverse geocoding coordinates to city/district names.
 *
 * =============================================================================
 */

import { AppSession } from '@mentra/sdk';
const NodeGeocoder = require('node-geocoder');

/**
 * Location cache with 30 second TTL
 */
interface CachedLocation {
  location: LocationUpdate;
  timestamp: number;
}

const locationCache = new Map<string, CachedLocation>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Get cached location if available and not expired
 */
function getCachedLocation(userId: string): LocationUpdate | null {
  const cached = locationCache.get(userId);
  if (!cached) {
    return null;
  }
  
  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL_MS) {
    locationCache.delete(userId);
    return null;
  }
  
  return cached.location;
}

/**
 * Cache location for a user
 */
function cacheLocation(userId: string, location: LocationUpdate): void {
  locationCache.set(userId, {
    location,
    timestamp: Date.now(),
  });
}

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

interface GeocodedLocation {
    city?: string;
    district?: string;
    neighborhood?: string;
    state?: string;
    country?: string;
    formattedAddress?: string;
  }


export async function getLocation(
  session: AppSession,
  userId: string,
  logger: any,
  useCache: boolean = true
): Promise<LocationUpdate | undefined> {
  try {
    // Check cache first if enabled
    if (useCache) {
      const cached = getCachedLocation(userId);
      if (cached) {
        logger.info(`Using cached location for user ${userId} (age: ${Date.now() - (locationCache.get(userId)?.timestamp || 0)}ms)`);
        return cached;
      }
    }
    
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

    // Cache the location
    cacheLocation(userId, result);

    return result;

  } catch (error) {
    logger.error(`Error getting location: ${error}`);
    console.error('Error getting location:', error);
  }
}

/**
 * Reverse geocode coordinates to get city and district information
 * Uses OpenStreetMap (free, no API key required)
 */
export async function geocodeLocation(
  latitude: number,
  longitude: number,
  logger: any
): Promise<GeocodedLocation | undefined> {
  try {
    // Initialize geocoder with OpenStreetMap provider (free, no API key needed)
    // Must include a custom user agent per OSM Nominatim usage policy
    const geocoder = NodeGeocoder({
      provider: 'openstreetmap',
      httpAdapter: 'https',
      formatter: null,
      // Custom user agent required by OSM Nominatim usage policy
      // Pass headers directly - they will be merged with default headers
      headers: {
        'user-agent': 'MentraOS-Tour-App/1.0 (contact: pscholtens2001@gmail.com)',
      },
    });

    const results = await geocoder.reverse({ lat: latitude, lon: longitude });

    if (!results || results.length === 0) {
      logger.warn(`No geocoding results found for coordinates: ${latitude}, ${longitude}`);
      return undefined;
    }

    const result = results[0];
    
    // Extract city, district, and other location information
    const geocoded: GeocodedLocation = {
      city: result.city || result.administrativeLevels?.level2long || result.administrativeLevels?.level1long,
      district: result.administrativeLevels?.level3long || result.extra?.neighborhood || result.extra?.suburb,
      neighborhood: result.extra?.neighborhood || result.extra?.suburb,
      state: result.administrativeLevels?.level1long || result.state,
      country: result.country,
      formattedAddress: result.formattedAddress,
    };

    logger.info(`Geocoded location: ${geocoded.city || 'Unknown'}, ${geocoded.district || geocoded.neighborhood || 'Unknown district'}`);
    console.log('\n========================================');
    console.log('🌍 GEOCODED LOCATION');
    console.log('========================================');
    console.log(`City: ${geocoded.city || 'N/A'}`);
    console.log(`District: ${geocoded.district || geocoded.neighborhood || 'N/A'}`);
    console.log(`State: ${geocoded.state || 'N/A'}`);
    console.log(`Country: ${geocoded.country || 'N/A'}`);
    console.log(`Formatted Address: ${geocoded.formattedAddress || 'N/A'}`);
    console.log('========================================\n');

    return geocoded;
  } catch (error) {
    logger.error(`Error geocoding location: ${error}`);
    console.error('Error geocoding location:', error);
    return undefined;
  }
}

/**
 * Get location and geocode it to city/district in one call
 */
export async function getLocationAndGeocode(
  session: AppSession,
  userId: string,
  logger: any
): Promise<{ location: LocationUpdate; geocoded: GeocodedLocation } | undefined> {
  const location = await getLocation(session, userId, logger);
  
  if (!location) {
    return undefined;
  }

  const geocoded = await geocodeLocation(location.latitude, location.longitude, logger);
  
  if (!geocoded) {
    logger.warn('Location retrieved but geocoding failed');
    return { location, geocoded: {} };
  }

  return { location, geocoded };
}

