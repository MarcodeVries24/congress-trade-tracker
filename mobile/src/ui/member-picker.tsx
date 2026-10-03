import { memberDisplayName } from '@congtrade/shared/memberDisplay';
import { useEffect, useMemo, useState } from 'react';

import { fetchMemberOptions, type MemberOption } from '@/lib/api';
import { memberPhotoUrl } from '@/lib/member-photo';
import { Avatar } from '@/ui/avatar';
import { PickList, type PickOption } from '@/ui/pick-list';

/**
 * Picks members from a searchable list, most active first. The value is filed
 * names, because that is what the trade and alert filters match on exactly,
 * and one person can be filed under several spellings: ticking them adds all
 * of those, unticking removes all.
 */
export function MemberPicker({ value, onChange }: { value: string[]; onChange: (names: string[]) => void }) {
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchMemberOptions({ signal: controller.signal })
      .then(setOptions)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const keyOf = (o: MemberOption) => o.bioguide_id ?? o.member_name;
  const byKey = useMemo(() => new Map(options.map((o) => [keyOf(o), o])), [options]);

  const rows = useMemo<PickOption[]>(
    () =>
      options.map((o) => {
        const name = memberDisplayName(o);
        return {
          key: keyOf(o),
          label: name,
          detail: `${o.trade_count.toLocaleString()} trades`,
          search: name.toLowerCase(),
          leading: <Avatar uri={o.bioguide_id ? memberPhotoUrl(o.bioguide_id) : null} name={name} size={36} />,
        };
      }),
    [options]
  );

  return (
    <PickList
      options={rows}
      loading={loading}
      placeholder="Search members"
      isPicked={(key) => Boolean(byKey.get(key)?.names.some((n) => value.includes(n)))}
      onToggle={(key) => {
        const o = byKey.get(key);
        if (!o) return;
        const picked = o.names.some((n) => value.includes(n));
        onChange(
          picked ? value.filter((n) => !o.names.includes(n)) : [...value, ...o.names.filter((n) => !value.includes(n))]
        );
      }}
    />
  );
}
