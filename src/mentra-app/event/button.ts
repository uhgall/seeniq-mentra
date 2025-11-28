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


/**
 * Set up all button and touch event handlers for a session
 */
export function setupButtonHandler(
  session: AppSession,
  userId: string,
  logger: any,
  takePhotoCallback: (session: AppSession, userId: string) => Promise<void>
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
    await takePhotoCallback(session, userId);
  });
}
