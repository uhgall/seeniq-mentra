import { AppSession } from '@mentra/sdk';

/**
 * Get the user's theme preference from Simple Storage
 * @param session - The active MentraOS session
 * @param userId - The user ID
 * @returns The theme preference ('dark' or 'light'), defaults to 'dark'
 */
export async function getThemePreference(
  session: AppSession,
  userId: string
): Promise<'dark' | 'light'> {
  try {
    const theme = await session.simpleStorage.get('theme');

    if (theme === 'dark' || theme === 'light') {
      console.log(`[Simple Storage] Retrieved theme preference for user ${userId}: ${theme}`);
      return theme;
    }

    // Default to dark if not set or invalid value
    console.log(`[Simple Storage] No theme preference found for user ${userId}, defaulting to dark`);
    return 'dark';
  } catch (error) {
    console.error(`[Simple Storage] Error getting theme preference for user ${userId}:`, error);
    return 'dark'; // Fallback to dark on error
  }
}

/**
 * Set the user's theme preference in Simple Storage
 * @param session - The active MentraOS session
 * @param userId - The user ID
 * @param theme - The theme preference to save ('dark' or 'light')
 */
export async function setThemePreference(
  session: AppSession,
  userId: string,
  theme: 'dark' | 'light'
): Promise<void> {
  try {
    await session.simpleStorage.set('theme', theme);
    console.log(`[Simple Storage] Saved theme preference for user ${userId}: ${theme}`);
  } catch (error) {
    console.error(`[Simple Storage] Error setting theme preference for user ${userId}:`, error);
    throw error; // Re-throw to let caller handle error response
  }
}
