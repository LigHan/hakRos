import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions, type KeyboardEvent, type KeyboardMetrics } from 'react-native';

import { keyboardBottomInset } from '@/lib/keyboard-layout';

/** Overlay panels need to end above the iOS keyboard. Android resizes its window. */
export function useKeyboardInset() {
  const { height } = useWindowDimensions();
  const [frame, setFrame] = useState<KeyboardMetrics | null>(() => Platform.OS === 'ios' ? Keyboard.metrics() ?? null : null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const change = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setFrame(event.endCoordinates);
    };
    const hide = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setFrame(null);
    };
    const subscriptions = [Keyboard.addListener('keyboardWillChangeFrame', change), Keyboard.addListener('keyboardWillHide', hide)];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  return frame ? keyboardBottomInset(height, frame.screenY, frame.height) : 0;
}
