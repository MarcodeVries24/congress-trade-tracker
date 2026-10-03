import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { mirrorPhotoUrl } from '@/lib/member-photo';
import { brand, partyTone, useTheme } from '@/theme';
import { Text } from '@/ui/text';

function initials(name: string): string {
  const parts = name
    .replace(/[^A-Za-z\s-]/g, ' ')
    .trim()
    .split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * A member's face, or their initials on their party's colour when there is no
 * photo or it fails to load. A Bioguide portrait that fails is tried once more
 * from the mirror before falling back (see member-photo.ts). With `ring`, an Instagram-style gradient ring:
 * used where a row of faces is the way into their activity.
 */
export function Avatar({
  uri,
  name,
  party,
  size = 44,
  ring = false,
  dim = false,
}: {
  uri?: string | null;
  name: string;
  party?: string | null;
  size?: number;
  ring?: boolean;
  dim?: boolean;
}) {
  const { c } = useTheme();
  // URLs that failed to load, rather than one flag, so a recycled row given a
  // new member starts over with that member's photo.
  const [failed, setFailed] = useState<string[]>([]);
  const tone = partyTone(party);
  const src = (uri ? [uri, mirrorPhotoUrl(uri)] : []).find((u): u is string => !!u && !failed.includes(u));
  const face = src ? (
    <Image
      source={{ uri: src }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceMuted }}
      contentFit="cover"
      contentPosition="top"
      transition={200}
      onError={() => setFailed((f) => [...f, src])}
    />
  ) : (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone }]}>
      <Text variant="bodyStrong" color="#FFFFFF" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>
        {initials(name)}
      </Text>
    </View>
  );

  if (!ring) return face;
  const outer = size + 8;
  return (
    <LinearGradient
      colors={dim ? [c.borderStrong, c.borderStrong] : [...brand.ring]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{ width: outer, height: outer, borderRadius: outer / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size + 4,
          height: size + 4,
          borderRadius: (size + 4) / 2,
          backgroundColor: c.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {face}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

/**
 * The signed-in person's own picture, or Cong's face when they have not set
 * one. Clerk always gives an imageUrl, a generated placeholder when there is no
 * photo, so `hasImage` is what tells the two apart.
 */
export function UserAvatar({
  user,
  size,
}: {
  user: { hasImage: boolean; imageUrl: string; fullName: string | null } | null | undefined;
  size: number;
}) {
  if (user?.hasImage) return <Avatar uri={user.imageUrl} name={user.fullName ?? ''} size={size} />;
  return (
    <Image
      source={require('../../assets/images/cong/avatar.png')}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityLabel="Cong, the CongTrade monkey"
    />
  );
}
