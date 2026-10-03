import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { SITE, openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { UserAvatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ListRow } from '@/ui/list-row';
import { Group } from '@/ui/section';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/** Clerk's API errors carry a readable sentence; anything else gets a plain one. */
function messageFrom(err: unknown, fallback: string): string {
  const errors = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  return errors?.[0]?.longMessage ?? errors?.[0]?.message ?? fallback;
}

/**
 * Who is signed in, and the parts of it they can change here: their name and
 * their photo. Email and password open the website's profile page, because
 * changing either needs a verification step that Clerk's own editor already
 * does properly there.
 */
export function ProfileEditor() {
  const { c } = useTheme();
  const { user } = useUser();
  const [editingName, setEditingName] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState<'name' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress;
  const name = user.fullName || email || 'Your account';

  const startEditingName = () => {
    haptic.select();
    setError(null);
    setFirst(user.firstName ?? '');
    setLast(user.lastName ?? '');
    setEditingName(true);
  };

  const saveName = async () => {
    setError(null);
    setBusy('name');
    try {
      await user.update({ firstName: first.trim(), lastName: last.trim() });
      haptic.success();
      setEditingName(false);
    } catch (err) {
      setError(messageFrom(err, 'Could not save your name. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const choosePhoto = async () => {
    setError(null);
    // Choosing from the library needs no permission prompt; the square crop
    // is what every avatar in the app shows anyway.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.base64) return;
    setBusy('photo');
    try {
      await user.setProfileImage({ file: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` });
      await user.reload();
      haptic.success();
    } catch (err) {
      setError(messageFrom(err, 'Could not upload that photo. Please try another.'));
    } finally {
      setBusy(null);
    }
  };

  const removePhoto = async () => {
    setError(null);
    setBusy('photo');
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      haptic.success();
    } catch (err) {
      setError(messageFrom(err, 'Could not remove your photo. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];

  return (
    <View style={styles.wrap}>
      <View style={styles.identity}>
        <Tap onPress={choosePhoto} disabled={busy !== null} accessibilityLabel="Change photo">
          <UserAvatar user={user} size={84} />
          <View style={[styles.camera, { backgroundColor: c.primary, borderColor: c.background }]}>
            {busy === 'photo' ? (
              <ActivityIndicator size="small" color={c.primaryText} />
            ) : (
              <Icon name="camera" size={15} color={c.primaryText} />
            )}
          </View>
        </Tap>
        <Text variant="title" style={styles.center}>
          {name}
        </Text>
        {user.fullName && email ? (
          <Text variant="callout" tone="muted">
            {email}
          </Text>
        ) : null}
      </View>

      {editingName ? (
        <View style={[styles.editor, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text variant="subhead">Your name</Text>
          <TextInput
            value={first}
            onChangeText={setFirst}
            placeholder="First name"
            placeholderTextColor={c.textFaint}
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            autoFocus
            style={inputStyle}
          />
          <TextInput
            value={last}
            onChangeText={setLast}
            placeholder="Last name"
            placeholderTextColor={c.textFaint}
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="done"
            onSubmitEditing={saveName}
            style={inputStyle}
          />
          <Button label="Save" loading={busy === 'name'} disabled={!first.trim()} onPress={saveName} />
          <Button label="Cancel" kind="ghost" disabled={busy === 'name'} onPress={() => setEditingName(false)} />
        </View>
      ) : (
        <Group>
          <ListRow
            icon="person-outline"
            label="Name"
            detail={user.fullName || 'Add your name'}
            onPress={startEditingName}
          />
          <ListRow
            icon="image-outline"
            label={user.hasImage ? 'Change photo' : 'Add a photo'}
            onPress={busy ? undefined : choosePhoto}
            last={!user.hasImage}
          />
          {user.hasImage ? (
            <ListRow
              icon="trash-outline"
              label="Remove photo"
              chevron={false}
              onPress={busy ? undefined : removePhoto}
              last
            />
          ) : null}
        </Group>
      )}

      <Group>
        <ListRow
          icon="mail-outline"
          label="Email and password"
          detail="On congtrade.com"
          onPress={() => openPage(`${SITE}/account/profile`)}
          last
        />
      </Group>

      {error ? (
        <Text variant="caption" tone="loss" style={styles.center}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  identity: { alignItems: 'center', gap: 6 },
  center: { textAlign: 'center' },
  camera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editor: { gap: 10, padding: 16, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
});
