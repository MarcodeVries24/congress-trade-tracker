import { StyleSheet } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/** Follow / Following. Solid while it is an invitation, quiet once accepted. */
export function FollowButton({
  following,
  onPress,
  compact,
}: {
  following: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Tap
      onPress={onPress}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
      style={[
        styles.button,
        compact && styles.compact,
        following
          ? { backgroundColor: c.surface, borderColor: c.borderStrong }
          : { backgroundColor: c.primary, borderColor: c.primary },
      ]}>
      <Icon
        name={following ? 'checkmark' : 'add'}
        size={compact ? 16 : 18}
        color={following ? c.text : c.primaryText}
      />
      <Text variant="callout" color={following ? c.text : c.primaryText} style={styles.label}>
        {following ? 'Following' : 'Follow'}
      </Text>
    </Tap>
  );
}

/** A star in a circle, for cards where a labelled button would crowd the layout. */
export function FollowStar({ following, onPress }: { following: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tap
      onPress={onPress}
      scaleTo={0.85}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
      style={[styles.star, { backgroundColor: following ? c.accentSoft : c.surfaceMuted }]}>
      <Icon name={following ? 'star' : 'star-outline'} size={18} color={following ? c.accent : c.textMuted} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  compact: { height: 34, paddingHorizontal: 14 },
  label: { fontWeight: '700' },
  star: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
