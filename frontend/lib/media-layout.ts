/** Keep a measured media view inside the horizontal bounds of the device window. */
export function clampMediaWidth(measuredWidth: number, windowX: number, windowWidth: number): number {
  if (![measuredWidth, windowX, windowWidth].every(Number.isFinite) || measuredWidth <= 0 || windowWidth <= 0) return 0;
  return Math.max(0, Math.min(measuredWidth, windowWidth - Math.max(0, windowX)));
}

/** Preserve the media ratio while keeping tall videos within the visible screen. */
export function videoFrameHeight(width: number, aspect: number, windowHeight: number): number {
  if (![width, aspect, windowHeight].every(Number.isFinite) || width <= 0 || aspect <= 0 || windowHeight <= 0) return 0;
  return Math.min(width / aspect, windowHeight * 0.62);
}
