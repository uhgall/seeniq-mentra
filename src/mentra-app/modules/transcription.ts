/**
 * =============================================================================
 * Transcription Module
 * =============================================================================
 *
 * This module contains all transcription-related functionality including
 * speech-to-text and handling transcription events.
 *
 * =============================================================================
 */

import { AppSession, TranscriptionData } from "@mentra/sdk";


/**
 * Set up transcription listener for speech-to-text
 * @param session - The app session
 * @param onFinalTranscription - Callback for final transcription results
 * @param onPartialTranscription - Optional callback for partial/interim results
 * @returns Cleanup function to stop receiving transcription events
 */
export function setupTranscription(
  session: AppSession,
  onFinalTranscription: (text: string) => void,
  onPartialTranscription?: (text: string) => void
): () => void {
  const unsubscribe = session.events.onTranscription((data: TranscriptionData) => {
    console.log(`Transcription: ${data.text}, Final: ${data.isFinal}`);

    if (data.isFinal) {
      // Process the final transcription
      onFinalTranscription(data.text);
    } else if (onPartialTranscription) {
      // Process partial/interim transcription
      onPartialTranscription(data.text);
    }
  });

  return unsubscribe;
}


