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
    position: 'absolute', top: 3, bottom: 3, left: 3, right: 3,
    borderColor: palette.forest, borderWidth: 1.6,
    borderTopLeftRadius: 26, borderTopRightRadius: 18,
    borderBottomRightRadius: 25, borderBottomLeftRadius: 16,
    transform: [{ rotate: '-0.35deg' }, { skewX: '0.25deg' }],
  },
});
