import { StyleSheet, TextInput, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** The search box the directory tabs share. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType="search"
      style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
    />
  );
}

const styles = StyleSheet.create({
  input: { marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
});
