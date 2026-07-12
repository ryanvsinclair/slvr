/**
 * Projector room entry mode.
 *
 * - `true`  — scroll into the room section to expand the black container, then enter
 * - `false` — click the room section or button to enter (original behavior)
 */
export const SCROLL_ROOM_ENTRY = true;

/**
 * Expansion begins when the room section's top edge crosses this fraction
 * of the viewport height (0 = top, 1 = bottom).
 */
export const SCROLL_ROOM_COUPLE_LINE = 0.96;

/**
 * Earlier coupling on narrow / touch viewports so fast flick-scroll
 * doesn't overshoot before the anchor is captured.
 */
export const SCROLL_ROOM_COUPLE_LINE_MOBILE = 0.88;

/**
 * Pixels to scroll after the black overlay is full-screen (rect.top ≤ 0)
 * before committing room entry.
 */
export const SCROLL_ROOM_ENTRY_OVERSCROLL = 36;
