/**
 * =============================================================================
 * Web Routes Module
 * =============================================================================
 *
 * This module contains all API endpoints for the camera application.
 *
 * Routes included:
 * - GET /api/photo-stream - SSE endpoint for real-time photo updates
 * - GET /api/transcription-stream - SSE endpoint for real-time transcriptions
 * - POST /api/play-audio - Play audio to MentraOS glasses
 * - POST /api/speak - Text-to-speech to MentraOS glasses
 * - POST /api/stop-audio - Stop audio playback
 * - GET /api/theme-preference - Get user's theme preference from Simple Storage
 * - POST /api/theme-preference - Set user's theme preference in Simple Storage
 * - GET /api/latest-photo - Get metadata for the latest photo
 * - GET /api/photo/:requestId - Get the actual photo image data
 * - GET /api/photo-base64/:requestId - Get photo as base64 JSON
 *
 * Note: The React frontend is served from the root route by index.ts
 *
 * =============================================================================
 */

import { Express, Response } from 'express';
import { getThemePreference, setThemePreference } from '../modules/simple-storage';

// Store SSE clients with userId mapping
interface SSEClient {
  response: Response;
  userId: string;
}

const sseClients: Set<SSEClient> = new Set();
const transcriptionClients: Set<SSEClient> = new Set();

// Store active sessions for audio playback
const activeSessions: Map<string, any> = new Map();


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
 * Helper function to broadcast photo to specific user's SSE clients
 */
export function broadcastPhotoToClients(photo: StoredPhoto): void {
  const base64Data = photo.buffer.toString('base64');
  const photoData = {
    requestId: photo.requestId,
    timestamp: photo.timestamp.getTime(),
    mimeType: photo.mimeType,
    filename: photo.filename,
    size: photo.size,
    userId: photo.userId,
    base64: base64Data,
    dataUrl: `data:${photo.mimeType};base64,${base64Data}`
  };

  const message = `data: ${JSON.stringify(photoData)}\n\n`;

  sseClients.forEach(client => {
    // Only send to clients belonging to this user
    if (client.userId === photo.userId) {
      try {
        client.response.write(message);
      } catch (error) {
        // Remove dead clients
        sseClients.delete(client);
      }
    }
  });
}

/**
 * Helper function to broadcast transcription to specific user's SSE clients
 */
export function broadcastTranscriptionToClients(text: string, isFinal: boolean, userId: string): void {
  const transcriptionData = {
    text,
    isFinal,
    timestamp: Date.now(),
    userId
  };

  const message = `data: ${JSON.stringify(transcriptionData)}\n\n`;

  transcriptionClients.forEach(client => {
    // Only send to clients belonging to this user
    if (client.userId === userId) {
      try {
        client.response.write(message);
      } catch (error) {
        // Remove dead clients
        transcriptionClients.delete(client);
      }
    }
  });
}

/**
 * Register an active session for audio playback
 */
export function registerSession(userId: string, session: any): void {
  activeSessions.set(userId, session);
}

/**
 * Unregister a session
 */
export function unregisterSession(userId: string): void {
  activeSessions.delete(userId);
}

/**
 * Set up all web routes for the application
 */
export function setupWebviewRoutes(
  app: Express,
  photosMap: Map<string, StoredPhoto>
): void {

  // SSE Route: Real-time photo stream
  app.get('/api/photo-stream', (req: any, res: any) => {
    // Get userId from query parameter
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    console.log(`[SSE Photo] Client connected for user: ${userId}`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Create client object
    const client: SSEClient = { response: res, userId };

    // Add this client to the set
    sseClients.add(client);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

    // Send existing photos for this user
    photosMap.forEach((photo) => {
      if (photo.userId === userId) {
        const base64Data = photo.buffer.toString('base64');
        const photoData = {
          requestId: photo.requestId,
          timestamp: photo.timestamp.getTime(),
          mimeType: photo.mimeType,
          filename: photo.filename,
          size: photo.size,
          userId: photo.userId,
          base64: base64Data,
          dataUrl: `data:${photo.mimeType};base64,${base64Data}`
        };
        res.write(`data: ${JSON.stringify(photoData)}\n\n`);
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[SSE Photo] Client disconnected for user: ${userId}`);
      sseClients.delete(client);
    });
  });

  // SSE Route: Real-time transcription stream
  app.get('/api/transcription-stream', (req: any, res: any) => {
    // Get userId from query parameter
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    console.log(`[SSE Transcription] Client connected for user: ${userId}`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Create client object
    const client: SSEClient = { response: res, userId };

    // Add this client to the set
    transcriptionClients.add(client);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[SSE Transcription] Client disconnected for user: ${userId}`);
      transcriptionClients.delete(client);
    });
  });

  // Route: Play audio from URL
  app.post('/api/play-audio', async (req: any, res: any) => {
    try {
      const { audioUrl, userId } = req.body;

      if (!audioUrl) {
        res.status(400).json({ error: 'audioUrl is required' });
        return;
      }

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Audio] Playing audio for user: ${userId}`);
      console.log(`[Audio] Audio URL: ${audioUrl}`);

      // Play the audio
      const result = await session.audio.playAudio({ audioUrl });
      console.log(`[Audio] Play audio result:`, result);

      res.json({ success: true, message: 'Audio playback started', userId, audioUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Text-to-speech
  app.post('/api/speak', async (req: any, res: any) => {
    try {
      const { text, userId } = req.body;

      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Speak] Speaking text for user: ${userId}`);

      // Speak the text
      await session.audio.speak(text);

      res.json({ success: true, message: 'Text-to-speech started', userId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Stop audio
  app.post('/api/stop-audio', async (req: any, res: any) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Audio] Stopping audio for user: ${userId}`);

      // Stop the audio
      await session.audio.stopAudio();

      res.json({ success: true, message: 'Audio stopped', userId });
    } catch (error: any) {
      console.error('Error stopping audio:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Get theme preference from Simple Storage
  app.get('/api/theme-preference', async (req: any, res: any) => {
    try {
      const userId = req.query.userId as string;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Theme] Getting theme preference for user: ${userId}`);

      // Get theme preference from Simple Storage
      const theme = await getThemePreference(session, userId);

      res.json({ theme, userId });
    } catch (error: any) {
      console.error('Error getting theme preference:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Set theme preference in Simple Storage
  app.post('/api/theme-preference', async (req: any, res: any) => {
    try {
      const { userId, theme } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      if (!theme || (theme !== 'dark' && theme !== 'light')) {
        res.status(400).json({ error: 'theme must be "dark" or "light"' });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Theme] Setting theme preference for user ${userId}: ${theme}`);

      // Set theme preference in Simple Storage
      await setThemePreference(session, userId, theme);

      res.json({ success: true, theme, userId });
    } catch (error: any) {
      console.error('Error setting theme preference:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route 1: Get the latest photo metadata for a specific user
  app.get('/api/latest-photo', (req: any, res: any) => {
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Find the most recent photo for this user
    const userPhotos = Array.from(photosMap.values())
      .filter(photo => photo.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (userPhotos.length === 0) {
      res.status(404).json({ error: 'No photos available for this user' });
      return;
    }

    const latestPhoto = userPhotos[0];

    res.json({
      requestId: latestPhoto.requestId,
      timestamp: latestPhoto.timestamp.getTime(),
      userId: latestPhoto.userId,
      hasPhoto: true
    });
  });



  // Route 2: Get the actual photo image data
  app.get('/api/photo/:requestId', (req: any, res: any) => {
    const requestId = req.params.requestId;
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const photo = photosMap.get(requestId);

    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    // Verify this photo belongs to the requesting user
    if (photo.userId !== userId) {
      res.status(403).json({ error: 'Access denied: photo belongs to different user' });
      return;
    }

    res.set({
      'Content-Type': photo.mimeType,
      'Cache-Control': 'no-cache'
    });

    res.send(photo.buffer);
  });


  // Route 3: Get photo as base64 JSON
  app.get('/api/photo-base64/:requestId', (req: any, res: any) => {
    const requestId = req.params.requestId;
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const photo = photosMap.get(requestId);

    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    // Verify this photo belongs to the requesting user
    if (photo.userId !== userId) {
      res.status(403).json({ error: 'Access denied: photo belongs to different user' });
      return;
    }

    const base64Data = photo.buffer.toString('base64');

    res.json({
      requestId: photo.requestId,
      timestamp: photo.timestamp.getTime(),
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size,
      userId: photo.userId,
      base64: base64Data,
      dataUrl: `data:${photo.mimeType};base64,${base64Data}`
    });
  });

  // Note: The /webview EJS route has been removed.
  // The React frontend is now served from the root route (/) by the SPA fallback in index.ts
}
