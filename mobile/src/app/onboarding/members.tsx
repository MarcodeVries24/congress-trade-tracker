import { memberDisplayName } from '@congtrade/shared/memberDisplay';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { SearchBar } from '@/ui/search-bar';
import { Text } from '@/ui/text';
import { fetchMemberOptions, type MemberOption } from '@/lib/api';
import { useOnboarding } from '@/lib/onboarding';

const SHOWN = 40;

/**
 * The question that does the most work.
 *
 * Whoever is picked here becomes the member filter on the alert saved at the
 * end, so this is the step that turns the flow into a working product rather
 * than a questionnaire. Skippable on purpose: someone with nobody in mind
 * should not be made to invent an answer, and an empty member filter is a
 * perfectly good alert.
 */
export default function MembersScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();

  const [options, setOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchMemberOptions({ signal: controller.signal })
      .then(setOptions)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? options.filter((o) => memberDisplayName(o).toLowerCase().includes(q)) : options;
    return matches.slice(0, SHOWN);
  }, [options, query]);

  // One option can stand for several filed spellings of the same person, so
  // picking one stores all of them: the alert matches member_name exactly.
  const toggle = (option: MemberOption) => {
    const already = option.names.every((n) => answers.members.includes(n));
    set({
      members: already
        ? answers.members.filter((n) => !option.names.includes(n))
        : [...answers.members, ...option.names.filter((n) => !answers.members.includes(n))],
    });
  };

  const picked = options.filter((o) => o.names.some((n) => answers.members.includes(n))).length;

  return (
    <OnboardingStep
      step={3}
      title="Anyone in particular?"
      subtitle="Pick as many as you like, or none. This becomes your first alert."
      continueLabel={picked ? `Continue with ${picked}` : 'Continue'}
      onContinue={() => nav.go('/onboarding/notify')}
      skip={() => {
        set({ members: [] });
        nav.go('/onboarding/notify');
      }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search members" />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : shown.length === 0 ? (
        <Text variant="callout" tone="muted" style={styles.empty}>
          No member matches “{query.trim()}”.
        </Text>
      ) : (
        shown.map((o) => (
          <Choice
            key={o.bioguide_id ?? o.member_name}
            label={memberDisplayName(o)}
            hint={`${o.trade_count.toLocaleString()} disclosed trades`}
            selected={o.names.some((n) => answers.members.includes(n))}
            onPress={() => toggle(o)}
          />
        ))
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 32, alignItems: 'center' },
  empty: { paddingVertical: 24, textAlign: 'center' },
});
