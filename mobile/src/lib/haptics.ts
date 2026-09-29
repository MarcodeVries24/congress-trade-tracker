import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Taps that confirm themselves. Light for selection, medium for a commitment
 * (following someone, saving), success for a completed action. Nothing on web,
 * where the call would only throw.
 */
export const haptic = {
  select() {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
  },
  tap() {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  commit() {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
