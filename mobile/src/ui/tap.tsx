import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A pressable that gives way under the finger: a small spring scale on press,
 * and optionally a haptic tick. What makes a list of cards feel like objects
 * rather than like a web page.
 */
export function Tap({
  children,
  style,
  onPress,
  scaleTo = 0.97,
  feedback = 'none',
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  feedback?: 'none' | 'tap' | 'select' | 'commit';
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { damping: 18, stiffness: 400 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback !== 'none') haptic[feedback]();
        onPress?.(e);
      }}
      style={[style, animated, disabled ? { opacity: 0.5 } : null]}>
      {children}
    </AnimatedPressable>
  );
}
