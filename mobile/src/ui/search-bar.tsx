import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { radius, shadow, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * The search pill. As a button (no onChangeText) it opens the search screen,
 * the way Airbnb's "Where to?" does; as an input it is the field itself.
 */
export function SearchBar({
  placeholder = 'Search members or stocks',
  onPress,
  value,
  onChangeText,
  autoFocus,
}: {
  placeholder?: string;
  onPress?: () => void;
  value?: string;
  onChangeText?: (text: string) => void;
  autoFocus?: boolean;
}) {
  const { c, scheme } = useTheme();
  const box = [
    styles.bar,
    { backgroundColor: c.surface, borderColor: c.border },
    scheme === 'light' ? shadow.card : null,
  ];
  if (!onChangeText) {
    return (
      <Tap onPress={onPress} scaleTo={0.98} feedback="tap" style={box}>
        <Icon name="search" size={19} color={c.text} />
        <Text variant="bodyStrong" tone="muted" style={styles.flex}>
          {placeholder}
        </Text>
      </Tap>
    );
  }
  return (
    <View style={box}>
      <Icon name="search" size={19} color={c.text} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.flex, styles.input, { color: c.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  // The browser's focus ring, on the web preview only; the pill itself is the affordance.
  input: {
    fontSize: 16,
    fontWeight: '500',
    height: 50,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
});
