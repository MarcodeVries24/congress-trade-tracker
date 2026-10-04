import { Image } from 'expo-image';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Cong, the mascot, in one of the moods from the designer's moving library
 * ("CongTrade full moving library"): transparent, looping cut-outs for the
 * moments a person would say something (an empty list, a failed load, a
 * welcome), not decoration for its own sake. Lossless animated WebP, 230 × 260.
 *
 * Decorative: always next to text that says the same thing, so it is hidden
 * from screen readers. With reduce motion on it holds its first frame.
 */
const MOODS = {
  'welcome-back': require('../../assets/images/cong/poses/welcome-back.webp'),
  support: require('../../assets/images/cong/poses/support.webp'),
  'turn-on-alerts': require('../../assets/images/cong/poses/turn-on-alerts.webp'),
  following: require('../../assets/images/cong/poses/following.webp'),
  'all-quiet': require('../../assets/images/cong/poses/all-quiet.webp'),
  'no-results': require('../../assets/images/cong/poses/no-results.webp'),
  oops: require('../../assets/images/cong/poses/oops.webp'),
  offline: require('../../assets/images/cong/poses/offline.webp'),
  'morning-brief': require('../../assets/images/cong/poses/morning-brief.webp'),
  'desk-mode': require('../../assets/images/cong/poses/desk-mode.webp'),
  'reading-filings': require('../../assets/images/cong/poses/reading-filings.webp'),
};

export type CongMood = keyof typeof MOODS;

/** `width` in points; the height follows the artwork's 230 × 260. */
export function Cong({ mood, width = 110 }: { mood: CongMood; width?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <Image
      source={MOODS[mood]}
      autoplay={!reduceMotion}
      contentFit="contain"
      style={{ width, height: (width * 260) / 230 }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}
