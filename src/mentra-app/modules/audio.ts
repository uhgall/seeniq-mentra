// Import necessary types and utilities from the Mentra SDK
// AppSession: Represents an active session with the Mentra platform
// logger: Used for logging errors and debug information
import { AppSession, logger } from "@mentra/sdk";

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
  try {
    // Try to play the audio using Mentra's audio API
    await session.audio.playAudio({
      audioUrl: url,
    });
  } catch (error) {
    // If something goes wrong (bad URL, network error, etc.), log the error
    // This prevents the app from crashing
    logger.error(`Error playing audio: ${error}`);
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
  try {
    // Use Mentra's built-in text-to-speech to convert text to audio and play it
    await session.audio.speak(text);
  } catch (error) {
    // If TTS fails (bad text, API error, etc.), log the error instead of crashing
    logger.error(`Error playing audio: ${error}`);
  }
}
