import { StyleSheet, View } from 'react-native';

import { palette, useAppearance } from '@/lib/app-appearance';

/** One slightly irregular outline that does not intercept taps. */
export function SketchFrame() {
  const { mode } = useAppearance();
  if (mode !== 'sketch') return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame} />;
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute', top: 1, bottom: 1, left: 1, right: 1,
    borderColor: palette.forest, borderWidth: 1.6,
    borderTopLeftRadius: 26, borderTopRightRadius: 18,
    borderBottomRightRadius: 25, borderBottomLeftRadius: 16,
    // Asymmetric corners keep the hand-drawn character without a rotated
    // outline spilling outside narrow or tall cards.
  },
});
