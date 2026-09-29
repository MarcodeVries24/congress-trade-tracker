import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/** A settings-style row: icon, label, optional detail, chevron. */
export function ListRow({
  icon,
  label,
  detail,
  onPress,
  right,
  destructive,
  last,
  chevron = true,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  last?: boolean;
  chevron?: boolean;
}) {
  const { c } = useTheme();
  const color = destructive ? c.loss : c.text;
  return (
    <Tap onPress={onPress} disabled={!onPress && !right} scaleTo={0.99} style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: destructive ? c.lossSoft : c.surfaceMuted }]}>
          <Icon name={icon} size={19} color={color} />
        </View>
      ) : null}
      <View
        style={[styles.body, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={styles.text}>
          <Text variant="bodyStrong" color={color}>
            {label}
          </Text>
          {detail ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        {right}
        {onPress && chevron && !right ? <Icon name="chevron-forward" size={18} color={c.textFaint} /> : null}
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15, paddingRight: 16 },
  text: { flex: 1, gap: 2 },
});
