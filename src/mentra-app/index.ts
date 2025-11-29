/**
 * =============================================================================
 * MentraOS Camera App - Beginner-Friendly Template
 * =============================================================================
 *
 * This app allows users to take photos using their MentraOS glasses.
 *
 * QUICK START:
 * 1. Make sure your .env file has PACKAGE_NAME and MENTRAOS_API_KEY set
 * 2. Run: bun run dev
 * 3. Visit the MentraOS Developer Console: https://console.mentra.glass/
 *
 * HOW IT WORKS:
 * - When a user presses the button on their glasses, it takes a photo
 * - When they hold the button, it toggles video streaming mode
 * - Photos are stored temporarily and can be viewed in a web interface
 *
 * =============================================================================
 */

import { AppServer, AppSession } from "@mentra/sdk";
import { setupButtonHandler } from "./event/button";
import { takePhoto, addLocationToExif, addLocationToExifAsync, sendPhotoToSeeniq } from "./modules/photo";
import { setupWebviewRoutes, broadcastTranscriptionToClients, registerSession, unregisterSession } from "./routes/routes";
import { playAudio, speak, updateLastAudioFinishTime, getLastAudioFinishTime, clearAudioFinishTime } from "./modules/audio";
import { setupTranscription } from "./modules/transcription";
import * as path from "path";
import { getLocation, getLocationAndGeocode } from "./modules/location";
import { getCityDescription, getNearbyPlaces } from "./modules/chatgpt";

interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

// CONFIGURATION - Load settings from .env file

const PACKAGE_NAME =
  process.env.PACKAGE_NAME ??
  (() => {
    throw new Error("PACKAGE_NAME is not set in .env file");
  })();

const MENTRAOS_API_KEY =
  process.env.MENTRAOS_API_KEY ??
  (() => {
    throw new Error("MENTRAOS_API_KEY is not set in .env file");
  })();

const PORT = parseInt(process.env.PORT || "3000");


// MAIN APP CLASS

class ExampleMentraOSApp extends AppServer {
  private photosMap: Map<string, StoredPhoto> = new Map();
  private idleCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private hasQueriedNearbyPlaces: Map<string, boolean> = new Map();
  private mentionedPlaces: Map<string, string[]> = new Map();
  private previousResponses: Map<string, string[]> = new Map();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    // Ensure JSON body parser is enabled
    const express = require("express");
    const { createProxyMiddleware } = require('http-proxy-middleware');
    this.getExpressApp().use(express.json());

    // Serve static files (audio, images, etc.) from the public directory
    const publicPath = path.join(process.cwd(), "src", "public");
    this.getExpressApp().use("/assets", express.static(publicPath + "/assets"));

    // Set up all web routes (pass our photos map)
    setupWebviewRoutes(this.getExpressApp(), this.photosMap);

    // Check if we should use Vite dev server or serve built files
    const frontendDistPath = path.join(process.cwd(), "src", "frontend", "dist");
    const useViteDevServer = process.env.NODE_ENV !== 'production' && process.env.USE_VITE_DEV === 'true';

    if (useViteDevServer) {
      // Development mode: proxy /webview to Vite dev server
      console.log('Using Vite dev server for /webview');
      this.getExpressApp().use('/webview', createProxyMiddleware({
        target: 'http://localhost:5173/webview',
        changeOrigin: true,
        // Bun's HTTP server does not expose Node's upgrade handler; disable ws proxying to avoid runtime errors.
        ws: false,
        pathRewrite: {
          '^/webview': '' // Remove /webview prefix when proxying
        },
        onError: (err: any, _req: any, res: any) => {
          console.error('Proxy error:', err);
          res.status(500).send('Frontend dev server not running. Please start it with: npm run dev:frontend');
        }
      }));
    } else {
      // Production mode: serve the built React frontend at /webview
      console.log('Serving built frontend from', frontendDistPath);
      this.getExpressApp().use('/webview', express.static(frontendDistPath));

      // SPA fallback for /webview routes in production
      this.getExpressApp().get('/webview/*', (_req: any, res: any) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'), (err: any) => {
          if (err) {
            console.error('Error serving index.html:', err);
            res.status(500).send('Frontend build not found. Please run: npm run build:frontend');
          }
        });
      });
    }
  }

  // Session Lifecycle - Called when a user opens/closes the app

  /**
   * Check if user has been idle (no audio) for 30 seconds and trigger nearby places query
   */
  private async checkIdleAndQueryNearbyPlaces(
    session: AppSession,
    userId: string
  ): Promise<void> {
    const lastFinishTime = getLastAudioFinishTime(userId);
    
    this.logger.info(`[Idle Check] Running idle check for user ${userId}`);
    this.logger.info(`[Idle Check] Last audio start time: ${lastFinishTime ? new Date(lastFinishTime).toISOString() : 'never'}`);
    
    // If no audio has played yet, don't check
    if (!lastFinishTime) {
      this.logger.info(`[Idle Check] No audio has started yet for user ${userId}, skipping check`);
      return;
    }

    const timeSinceLastAudio = Date.now() - lastFinishTime;
    const IDLE_THRESHOLD_MS = 30 * 1000; // 30 seconds

    this.logger.info(`[Idle Check] Time since last audio started: ${Math.round(timeSinceLastAudio / 1000)} seconds (threshold: ${IDLE_THRESHOLD_MS / 1000}s)`);
    this.logger.info(`[Idle Check] Has queried nearby places: ${this.hasQueriedNearbyPlaces.get(userId) || false}`);

    if (timeSinceLastAudio >= IDLE_THRESHOLD_MS) {
      // Check if we've already queried for this idle period
      if (this.hasQueriedNearbyPlaces.get(userId)) {
        this.logger.info(`[Idle Check] Already queried nearby places for this idle period, skipping`);
        return; // Already queried, wait for next audio to reset
      }

      this.logger.info(`[Idle Check] ✅ User ${userId} has been idle for ${Math.round(timeSinceLastAudio / 1000)} seconds. Starting nearby places query.`);
      
      // Mark that we're querying to prevent duplicate queries
      this.hasQueriedNearbyPlaces.set(userId, true);
      
      try {
        // Get location and geocode
        this.logger.info(`[Nearby Places] Getting location and geocoding for user ${userId}`);
        const locationResult = await getLocationAndGeocode(session, userId, this.logger);
        
        if (locationResult && locationResult.geocoded) {
          const { city, country, formattedAddress } = locationResult.geocoded;
          
          this.logger.info(`[Nearby Places] Location retrieved - City: ${city}, Country: ${country}, Address: ${formattedAddress}`);
          
          // Extract street from formatted address or use a default
          const street = formattedAddress?.split(',')[0] || 'Unknown';
          
          this.logger.info(`[Nearby Places] Extracted street: ${street}`);
          
          if (city && country) {
            // Get previously mentioned places and responses for this user
            const previouslyMentioned = this.mentionedPlaces.get(userId) || [];
            const previousResponses = this.previousResponses.get(userId) || [];
            this.logger.info(`[Nearby Places] Previously mentioned places: ${previouslyMentioned.length > 0 ? previouslyMentioned.join(', ') : 'None'}`);
            this.logger.info(`[Nearby Places] Previous responses count: ${previousResponses.length}`);
            
            // Query ChatGPT for nearby places
            this.logger.info(`[Nearby Places] Querying ChatGPT with: street=${street}, city=${city}, country=${country}`);
            const nearbyPlaces = await getNearbyPlaces(
              street,
              city,
              country,
              previouslyMentioned,
              previousResponses,
              this.logger
            );
            
            if (nearbyPlaces) {
              this.logger.info(`[Nearby Places] ✅ Received response from ChatGPT: ${nearbyPlaces.substring(0, 100)}...`);
              
              // Store the full response for future reference
              const currentResponses = this.previousResponses.get(userId) || [];
              const updatedResponses = [...currentResponses, nearbyPlaces];
              // Keep only the last 5 responses to avoid prompt getting too long
              this.previousResponses.set(userId, updatedResponses.slice(-5));
              this.logger.info(`[Nearby Places] Stored response. Total stored responses: ${updatedResponses.slice(-5).length}`);
              
              // Extract place names from the response and store them (for logging/debugging)
              const extractedPlaces = this.extractPlaceNames(nearbyPlaces);
              if (extractedPlaces.length > 0) {
                const currentMentioned = this.mentionedPlaces.get(userId) || [];
                const updatedMentioned = [...currentMentioned, ...extractedPlaces];
                // Keep only unique places
                const uniqueMentioned = Array.from(new Set(updatedMentioned));
                this.mentionedPlaces.set(userId, uniqueMentioned);
                this.logger.info(`[Nearby Places] Extracted ${extractedPlaces.length} place names. Total unique places: ${uniqueMentioned.length}`);
              }
              
            // Play the nearby places description
            try {
              // Track when audio STARTS playing (before async call)
              updateLastAudioFinishTime(userId);
              this.logger.info(`[Nearby Places] Speaking nearby places description`);
              this.logger.info(`[Nearby Places] Updated audio start time for user ${userId}`);
              await session.audio.speak(nearbyPlaces);
              this.logger.info(`[Nearby Places] ✅ Successfully spoke nearby places`);
              // Reset the flag so we can query again after next idle period
              this.resetNearbyPlacesFlag(userId);
            } catch (error) {
              this.logger.error(`[Nearby Places] ❌ Failed to speak nearby places: ${error}`);
              // Reset flag on error so we can retry
              this.resetNearbyPlacesFlag(userId);
            }
            } else {
              this.logger.warn(`[Nearby Places] ❌ ChatGPT returned empty response`);
              // Reset flag if query failed
              this.resetNearbyPlacesFlag(userId);
            }
          } else {
            this.logger.warn(`[Nearby Places] ❌ Cannot query nearby places: missing city (${city}) or country (${country})`);
            // Reset flag
            this.resetNearbyPlacesFlag(userId);
          }
        } else {
          this.logger.warn(`[Nearby Places] ❌ Cannot query nearby places: location not available. Result: ${JSON.stringify(locationResult)}`);
          // Reset flag
          this.resetNearbyPlacesFlag(userId);
        }
      } catch (error) {
        this.logger.error(`[Nearby Places] ❌ Error in nearby places query: ${error}`);
        // Reset flag on error
        this.resetNearbyPlacesFlag(userId);
      }
    } else {
      // If audio has played recently (within 30 seconds), reset the flag
      // This allows us to query again after the next idle period
      if (this.hasQueriedNearbyPlaces.get(userId)) {
        this.logger.info(`[Idle Check] Audio played recently, resetting nearby places flag`);
        this.resetNearbyPlacesFlag(userId);
      }
    }
  }

  /**
   * Reset the nearby places query flag (call when audio finishes)
   */
  private resetNearbyPlacesFlag(userId: string): void {
    this.hasQueriedNearbyPlaces.set(userId, false);
  }

  /**
   * Extract place names from ChatGPT response
   * This is a simple heuristic - tries to identify place names from the natural language response
   */
  private extractPlaceNames(response: string): string[] {
    const places: string[] = [];
    
    // Common patterns for place names in natural language:
    // - "the [Place Name]" 
    // - "[Place Name] is..."
    // - "near [Place Name]"
    // - "[Place Name], which..."
    
    // Split by common sentence separators
    const sentences = response.split(/[.!?]\s+/);
    
    for (const sentence of sentences) {
      // Look for patterns like "the [Name]", "[Name] is", "[Name],", etc.
      // This is a heuristic and may not catch all cases, but should work reasonably well
      const patterns = [
        /(?:the|near|at|by)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:is|was|has|which|that|,|\.|!|\?|$))/g,
        /([A-Z][A-Za-z\s]+?)(?:\s+(?:is|was|has|which|that|,|\.|!|\?|$))/g,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(sentence)) !== null) {
          const place = match[1].trim();
          // Filter out common words that aren't place names
          if (place.length > 3 && 
              !place.toLowerCase().match(/^(the|and|or|but|if|when|where|what|how|why|this|that|these|those|here|there)$/) &&
              !places.includes(place)) {
            places.push(place);
          }
        }
      }
    }
    
    // Limit to reasonable number (should be around 3 places per response)
    return places.slice(0, 5);
  }

  /**
   * Start periodic idle check for a user
   */
  private startIdleCheck(session: AppSession, userId: string): void {
    // Clear any existing interval
    this.stopIdleCheck(userId);
    
    this.logger.info(`[Idle Check] Starting idle check for user ${userId} (checking every 10 seconds, threshold: 30 seconds)`);
    
    // Check every 10 seconds if user has been idle for 30 seconds
    const interval = setInterval(() => {
      this.checkIdleAndQueryNearbyPlaces(session, userId).catch((error) => {
        this.logger.error(`[Idle Check] Error in idle check: ${error}`);
      });
    }, 10000); // Check every 10 seconds
    
    this.idleCheckIntervals.set(userId, interval);
  }

  /**
   * Stop periodic idle check for a user
   */
  private stopIdleCheck(userId: string): void {
    const interval = this.idleCheckIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.idleCheckIntervals.delete(userId);
    }
  }

  /**
   * Called when a user launches the app on their glasses
   */
  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    this.logger.info(`Session started for user ${userId}`);

    // Register this session for audio playback from the frontend
    registerSession(userId, session);
    
    // Start idle check for this user
    this.startIdleCheck(session, userId);

    // Register handler for all touch events
    session.events.onTouchEvent((event) => {
      console.log(`wTouch event: ${event.gesture_name}`);
    });

    // Listen for button presses on the glasses - set up FIRST so it can interrupt audio
    setupButtonHandler(session, userId, this.logger, async (s, u) => {
      // Do NOT stop audio when button is pressed - let city description continue playing
      // Audio will be stopped only when Seeniq response arrives

      // Take photo first
      const photoResult = await takePhoto(s, u, this.logger, this.photosMap);
      if (!photoResult) {
        return;
      }
      
      console.log('Photo taken successfully');

      // Start location fetch immediately (in parallel) - wait for it before sending to Seeniq
      // Use cache if available (within 30 seconds)
      const locationPromise = getLocation(s, u, this.logger, true);
      
      // Wait for location (required before sending to Seeniq)
      const locationResult = await locationPromise;
      if (!locationResult) {
        this.logger.warn('Location not available, cannot send photo to Seeniq');
        return;
      }
      
      console.log('Location result:', locationResult);

      // Add location to EXIF data (async, but we wait for it)
      const exifResult = await addLocationToExifAsync(
        photoResult.buffer,
        locationResult,
        this.logger
      );

      if (exifResult) {
        // Update the stored photo with the new buffer containing EXIF data
        const storedPhoto = this.photosMap.get(photoResult.requestId);
        if (storedPhoto) {
          storedPhoto.buffer = exifResult.buffer;
          storedPhoto.size = exifResult.buffer.length;
          this.photosMap.set(photoResult.requestId, storedPhoto);
          this.logger.info(`Updated photo ${photoResult.requestId} with location EXIF data`);
        }

        // Send photo with EXIF location data to Seeniq (wait for location as required)
        const seeniqResult = await sendPhotoToSeeniq({
          base64Photo: exifResult.base64Data,
          userId: userId,
          logger: this.logger,
        });

        // When Seeniq response arrives, stop any currently playing audio (e.g., city description)
        // Then play the Seeniq response
        if (seeniqResult) {
          try {
            // Stop any currently playing audio (city description, etc.)
            await s.audio.stopAudio();
            this.logger.info('Stopped city description audio to play Seeniq response');
          } catch (error) {
            // Ignore errors if no audio is playing
            this.logger.debug(`No audio to stop or error stopping: ${error}`);
          }
          
          // Play Seeniq response
          // Track when audio STARTS playing (before async call)
          updateLastAudioFinishTime(userId);
          this.logger.info(`[Audio] Starting Seeniq response playback for user ${userId}`);
          this.logger.info(`[Audio] Updated audio start time for user ${userId}`);
          session.audio.speak(seeniqResult).then(() => {
            this.logger.info(`[Audio] ✅ Seeniq response finished playing for user ${userId}`);
            // Reset nearby places flag so we can query again after next idle period
            this.resetNearbyPlacesFlag(userId);
          }).catch((error) => {
            this.logger.warn(`[Audio] ❌ Failed to play Seeniq response: ${error}`);
          });
        }
      } else {
        this.logger.warn('Failed to add location to EXIF, but photo and location were captured');
        // Send original photo without EXIF location data (still wait for location)
        const seeniqResult = await sendPhotoToSeeniq({
          base64Photo: photoResult.base64Data,
          userId: userId,
          logger: this.logger,
        });

        // When Seeniq response arrives, stop any currently playing audio (e.g., city description)
        // Then play the Seeniq response
        if (seeniqResult) {
          try {
            // Stop any currently playing audio (city description, etc.)
            await s.audio.stopAudio();
            this.logger.info('Stopped city description audio to play Seeniq response');
          } catch (error) {
            // Ignore errors if no audio is playing
            this.logger.debug(`No audio to stop or error stopping: ${error}`);
          }
          
          // Play Seeniq response
          // Track when audio STARTS playing (before async call)
          updateLastAudioFinishTime(userId);
          this.logger.info(`[Audio] Starting Seeniq response playback for user ${userId}`);
          this.logger.info(`[Audio] Updated audio start time for user ${userId}`);
          session.audio.speak(seeniqResult).then(() => {
            this.logger.info(`[Audio] ✅ Seeniq response finished playing for user ${userId}`);
            // Reset nearby places flag so we can query again after next idle period
            this.resetNearbyPlacesFlag(userId);
          }).catch((error) => {
            this.logger.warn(`[Audio] ❌ Failed to play Seeniq response: ${error}`);
          });
        }
      }
    });

    // Get location and geocode it to city/district (non-blocking)
    getLocationAndGeocode(session, userId, this.logger).then((result) => {
      if (result && result.geocoded) {
        const { city, district, neighborhood } = result.geocoded;
        const locationText = district || neighborhood || city || '';
        
        // First, speak the welcome message with location immediately (non-blocking)
        setTimeout(() => {
          let welcomeMessage = 'Welcome to your tour';
          if (locationText) {
            welcomeMessage += ` in ${locationText}`;
          }
          
          // Track when audio STARTS playing (before async call)
          updateLastAudioFinishTime(userId);
          this.logger.info(`[Audio] Starting welcome message playback for user ${userId}`);
          this.logger.info(`[Audio] Updated audio start time for user ${userId}`);
          session.audio.speak(welcomeMessage).then(() => {
            this.logger.info(`[Audio] ✅ Welcome message finished playing for user ${userId}`);
            // Reset nearby places flag so we can query again after next idle period
            this.resetNearbyPlacesFlag(userId);
          }).catch((error) => {
            this.logger.warn(`[Audio] ❌ Failed to play welcome message: ${error}`);
          });
        }, 1000); // Wait 1 second for session to be fully connected
        
        // Then, get city description from ChatGPT and speak it separately (non-blocking)
        if (city) {
          getCityDescription(city, this.logger).then((cityDescription) => {
            if (cityDescription) {
              // Speak the city description after a short delay to let the welcome message finish (non-blocking)
              setTimeout(() => {
                // Track when audio STARTS playing (before async call)
                updateLastAudioFinishTime(userId);
                this.logger.info(`[Audio] Starting city description playback for user ${userId}`);
                this.logger.info(`[Audio] Updated audio start time for user ${userId}`);
                session.audio.speak(cityDescription).then(() => {
                  this.logger.info(`[Audio] ✅ City description finished playing for user ${userId}`);
                  // Reset nearby places flag so we can query again after next idle period
                  this.resetNearbyPlacesFlag(userId);
                }).catch((error) => {
                  this.logger.warn(`[Audio] ❌ Failed to play city description: ${error}`);
                });
              }, 3000); // Wait 3 seconds to let the welcome message play first
            }
          }).catch((error) => {
            this.logger.warn(`Failed to get city description: ${error}`);
          });
        }
      } else {
        // Fallback welcome message if location is not available
        setTimeout(() => {
          // Track when audio STARTS playing (before async call)
          updateLastAudioFinishTime(userId);
          this.logger.info(`[Audio] Starting fallback welcome message playback for user ${userId}`);
          this.logger.info(`[Audio] Updated audio start time for user ${userId}`);
          session.audio.speak('Welcome to your tour').then(() => {
            this.logger.info(`[Audio] ✅ Fallback welcome message finished playing for user ${userId}`);
            // Reset nearby places flag so we can query again after next idle period
            this.resetNearbyPlacesFlag(userId);
          }).catch((error) => {
            this.logger.warn(`[Audio] ❌ Failed to play fallback welcome message: ${error}`);
          });
        }, 1000);
      }
    }).catch((error) => {
      this.logger.warn(`Failed to get location for welcome message: ${error}`);
      // Fallback welcome message if location fails
      setTimeout(() => {
        session.audio.speak('Welcome to your tour').catch((error) => {
          this.logger.warn(`Failed to play welcome message: ${error}`);
        });
      }, 1000);
    });

  }

  /**
   * Called when a user closes the app or disconnects
   */
  protected async onStop(
    sessionId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    this.logger.info(`Session stopped for user ${userId}, reason: ${reason}`);

    // Stop idle check for this user
    this.stopIdleCheck(userId);
    
    // Clear audio finish time tracking
    clearAudioFinishTime(userId);
    
    // Clear nearby places query flag
    this.hasQueriedNearbyPlaces.delete(userId);
    
    // Clear mentioned places and responses for this user (optional - you might want to persist across sessions)
    // this.mentionedPlaces.delete(userId);
    // this.previousResponses.delete(userId);

    // Unregister the session
    unregisterSession(userId);
  }
}

// START THE SERVER

const app = new ExampleMentraOSApp();

app.start().catch(console.error);
