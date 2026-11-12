export const floatingNavigationInset = 12;
export const floatingNavigationRowHeight = 66;
export const floatingNavigationBorder = 1;

export function floatingNavigationBottomPadding(safeBottom: number) {
  return Math.max(safeBottom, 12);
}

export function floatingNavigationHeight(safeBottom: number) {
  return floatingNavigationRowHeight + floatingNavigationBorder + floatingNavigationBottomPadding(safeBottom);
}
