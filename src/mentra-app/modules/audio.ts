// Import necessary types and utilities from the Mentra SDK
// AppSession: Represents an active session with the Mentra platform
// logger: Used for logging errors and debug information
import { AppSession, logger } from "@mentra/sdk";

/**
 * Track when audio starts playing per user (not when it finishes)
 */
const lastAudioStartTime = new Map<string, number>();

/**
 * Get the timestamp when audio last started for a user
 */
export function getLastAudioFinishTime(userId: string): number | undefined {
  return lastAudioStartTime.get(userId);
}

/**
 * Update the timestamp when audio starts for a user
 */
export function updateLastAudioFinishTime(userId: string): void {
  lastAudioStartTime.set(userId, Date.now());
}

/**
 * Clear audio start time tracking for a user (e.g., when session ends)
 */
export function clearAudioFinishTime(userId: string): void {
  lastAudioStartTime.delete(userId);
}

/**
 * Plays an audio file from a given URL
 *
 * This function is useful when you want to play pre-recorded audio files
 * (like sound effects, music, or pre-recorded messages).
 *
 * @param url - The URL/link to the audio file you want to play
 * @param session - The current app session (connection to Mentra)
 * @param userId - The ID of the user who should hear the audio
 * @param logger - Logger object for tracking errors
 * @returns A Promise that resolves when the audio finishes playing
 *
 * Example usage:
 *   await playAudio("https://example.com/sound.mp3", session, "user123", logger);
 */
export async function playAudio(
  url: string,
  session: AppSession,
  userId: string,
  logger: any
): Promise<void> {
  // Track when audio STARTS playing (before async call)
  updateLastAudioFinishTime(userId);
  logger.info(`[Audio] Starting audio playback for user ${userId}: ${url}`);
  logger.info(`[Audio] Updated audio start time for user ${userId}`);
  
  try {
    // Try to play the audio using Mentra's audio API
    await session.audio.playAudio({
      audioUrl: url,
    });
    logger.info(`[Audio] ✅ Audio finished playing for user ${userId}`);
  } catch (error) {
    // If something goes wrong (bad URL, network error, etc.), log the error
    // This prevents the app from crashing
    logger.error(`[Audio] ❌ Error playing audio: ${error}`);
  }
}

/**
 * Converts text to speech and plays it
 *
 * This function uses Text-to-Speech (TTS) to convert any text string into
 * spoken audio. Great for giving voice feedback to users!
 *
 * @param text - The text you want to convert to speech (e.g., "Hello, welcome!")
 * @param session - The current app session (connection to Mentra)
 * @param userId - The ID of the user who should hear the speech
 * @param logger - Logger object for tracking errors
 * @returns A Promise that resolves when the speech finishes playing
 *
 * Example usage:
 *   await speak("Hello, how can I help you?", session, "user123", logger);
 */
export async function speak(
  text: string,
  session: AppSession,
  userId: string,
  logger: any
): Promise<void> {
  // Track when audio STARTS playing (before async call)
  updateLastAudioFinishTime(userId);
  logger.info(`[Audio] Starting TTS for user ${userId}: ${text.substring(0, 50)}...`);
  logger.info(`[Audio] Updated audio start time for user ${userId}`);
  
  try {
    // Use Mentra's built-in text-to-speech to convert text to audio and play it
    await session.audio.speak(text);
    logger.info(`[Audio] ✅ TTS finished for user ${userId}`);
  } catch (error) {
    // If TTS fails (bad text, API error, etc.), log the error instead of crashing
    logger.error(`[Audio] ❌ Error playing audio: ${error}`);
  }
}
