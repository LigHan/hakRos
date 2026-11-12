import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import {
  Dimensions, findNodeHandle, Keyboard, Platform, ScrollView, UIManager,
  type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type TargetedEvent,
} from 'react-native';

import { keyboardBottomInset, keyboardScrollDelta } from '@/lib/keyboard-layout';

function keyboardTopFromFrame(frame: { screenY: number; height: number }) {
  const height = Dimensions.get('window').height;
  return height - keyboardBottomInset(height, frame.screenY, frame.height);
}

/** Keep the focused input visible, including when focus changes while the keyboard is open. */
export function KeyboardAwareScrollView({ onFocusCapture, onBlurCapture, onScroll, scrollEventThrottle, automaticallyAdjustKeyboardInsets, keyboardShouldPersistTaps, ...props }: ScrollViewProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const focused = useRef<number | null>(null);
  const offset = useRef(0);
  const metrics = Platform.OS === 'web' ? null : Keyboard.metrics();
  const keyboardTop = useRef<number | null>(metrics ? keyboardTopFromFrame(metrics) : null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const revealFocused = useCallback(() => {
    const target = focused.current;
    const viewport = scroll.current && findNodeHandle(scroll.current);
    const top = keyboardTop.current;
    if (target == null || viewport == null || top == null) return;
    UIManager.measureInWindow(target, (_x, inputY, _width, inputHeight) => {
      UIManager.measureInWindow(viewport, (_left, viewportY, _width, viewportHeight) => {
        if (focused.current !== target || keyboardTop.current == null) return;
        const delta = keyboardScrollDelta(inputY + inputHeight, viewportY + viewportHeight, keyboardTop.current);
        if (delta > 1) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
      });
    });
  }, []);

  const scheduleReveal = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(revealFocused, 80), setTimeout(revealFocused, 350)];
  }, [revealFocused]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const change = (event: KeyboardEvent) => { keyboardTop.current = keyboardTopFromFrame(event.endCoordinates); scheduleReveal(); };
    const hide = () => { keyboardTop.current = null; timers.current.forEach(clearTimeout); timers.current = []; };
    const subscriptions = Platform.OS === 'ios'
      ? [Keyboard.addListener('keyboardWillChangeFrame', change), Keyboard.addListener('keyboardWillHide', hide)]
      : [Keyboard.addListener('keyboardDidShow', change), Keyboard.addListener('keyboardDidHide', hide)];
    return () => { subscriptions.forEach(subscription => subscription.remove()); timers.current.forEach(clearTimeout); };
  }, [scheduleReveal]);

  const focus = (event: NativeSyntheticEvent<TargetedEvent>) => {
    onFocusCapture?.(event);
    if (Platform.OS === 'web') return;
    focused.current = event.nativeEvent.target;
    scheduleReveal();
  };
  const blur = (event: NativeSyntheticEvent<TargetedEvent>) => {
    onBlurCapture?.(event);
    if (focused.current === event.nativeEvent.target) focused.current = null;
  };
  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  return <ScrollView {...props} ref={scroll} automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets ?? Platform.OS === 'ios'}
    keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'} onFocusCapture={focus} onBlurCapture={blur}
    onScroll={trackScroll} scrollEventThrottle={scrollEventThrottle ?? 16} />;
}
