import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Logo } from '@/ui/logo';

/**
 * The hand-off from the native splash: the same mark on the same colour, held
 * for a beat and faded out, so the app appears rather than snaps in.
 */
export function SplashOverlay() {
  const { c } = useTheme();
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(350)}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.background }]}>
      <View
        onLayout={() => {
          SplashScreen.hideAsync()
            .catch(() => {})
            .finally(() => setTimeout(() => setVisible(false), 450));
        }}>
        <Logo size={34} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
});
