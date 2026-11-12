import { Platform } from 'react-native';

/** React Native Web forwards dataSet to DOM data attributes. */
export function webData(attributes: Record<string, string>) {
  return Platform.OS === 'web' ? { dataSet: attributes } : {};
}
