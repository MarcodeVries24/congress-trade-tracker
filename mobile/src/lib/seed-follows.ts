import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { fetchPoliticians } from '@/lib/api';
import { useFollows } from '@/lib/follows';
import { memberDisplayNameFromFiledName } from '@/lib/format';
import { useOnboarding } from '@/lib/onboarding';

const SEEDED = 'congtrade.follows.seeded';

/**
 * Turns the members picked during onboarding into follows, once.
 *
 * Onboarding stores filed names (what an alert filter matches on); following
 * needs the person's page. The politician directory maps one to the other by
 * display name, the same rule every other surface uses to name a member.
 */
export function useSeedFollowsFromOnboarding() {
  const { loaded: answersLoaded, done, answers } = useOnboarding();
  const follows = useFollows();
  const { loaded, addMembers } = follows;

  useEffect(() => {
    if (!answersLoaded || !done || !loaded || answers.members.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        if ((await AsyncStorage.getItem(SEEDED)) === 'true') return;
        const wanted = new Set(answers.members.map(memberDisplayNameFromFiledName));
        const pages = await Promise.all([1, 2].map((page) => fetchPoliticians({ page, limit: 200 })));
        const matches = pages
          .flatMap((p) => p.data)
          .filter((row) => wanted.has(memberDisplayNameFromFiledName(row.member_name)))
          .map((row) => ({
            slug: row.slug,
            name: memberDisplayNameFromFiledName(row.member_name),
            photo_url: row.photo_url,
            party: row.party,
            subtitle: [
              row.chamber === 'senate' ? row.member_state : row.state_district,
              row.chamber === 'senate' ? 'Senate' : 'House',
            ]
              .filter(Boolean)
              .join(' · '),
          }));
        if (cancelled) return;
        addMembers(matches);
        await AsyncStorage.setItem(SEEDED, 'true');
      } catch {
        // Tried again on the next launch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [answersLoaded, done, loaded, answers.members, addMembers]);
}
