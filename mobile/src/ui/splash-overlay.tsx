import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * The hand-off from the native splash: the same icon, the same size, on the
 * same colour, held for a beat and faded out, so the app appears rather than
 * snaps in.
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
        <Image source={require('@/assets/images/splash-icon.png')} style={styles.icon} contentFit="contain" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  // Matches imageWidth in the expo-splash-screen plugin config.
  icon: { width: 112, height: 112 },
});
