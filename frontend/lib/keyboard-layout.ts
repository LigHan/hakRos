/** Distance from the bottom of the window to the keyboard's upper edge. */
export function keyboardBottomInset(windowHeight: number, keyboardY: number, keyboardHeight: number): number {
  if (![windowHeight, keyboardY, keyboardHeight].every(Number.isFinite) || windowHeight <= 0 || keyboardHeight <= 0) return 0;
  // Some iOS accessibility transitions report a zero Y coordinate.
  if (keyboardY <= 0) return Math.min(windowHeight, keyboardHeight);
  return Math.max(0, Math.min(windowHeight, windowHeight - keyboardY));
}

/** How far a scroll view needs to move a focused input above an obstruction. */
export function keyboardScrollDelta(inputBottom: number, viewportBottom: number, keyboardTop: number, gap = 12): number {
  if (![inputBottom, viewportBottom, keyboardTop, gap].every(Number.isFinite)) return 0;
  return Math.max(0, inputBottom + Math.max(0, gap) - Math.min(viewportBottom, keyboardTop));
}
