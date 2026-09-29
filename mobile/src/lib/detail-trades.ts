import type { IssuerDetail, PoliticianDetail, Trade } from '@/lib/api';

/**
 * The member and company pages return a slimmer trade than the feed, because
 * the page already says whose trades or which company they are. The trade
 * detail screen wants the full shape, so the missing half is filled in from
 * the page it came from.
 *
 * Fields neither side knows (the filing's doc id, the notification date) stay
 * empty, and the detail screen already treats both as optional.
 */
export function tradesFromPolitician(detail: PoliticianDetail): Trade[] {
  const p = detail.profile;
  return detail.trades.map((t) => ({
    ...t,
    doc_id: '',
    member_name: p.display,
    bioguide_id: null,
    member_slug: p.slug,
    state_district: p.state_district,
    notification_date: null,
    photo_url: p.photo_url,
    party: p.party,
    chamber: p.chamber ?? 'house',
    member_state: p.state,
    parse_status: 'ok',
    market_cap: null,
  }));
}

export function tradesFromIssuer(detail: IssuerDetail): Trade[] {
  return detail.trades.map((t) => ({
    ...t,
    doc_id: '',
    state_district: null,
    notification_date: null,
    member_state: null,
    parse_status: 'ok',
    market_cap: detail.issuer.market_cap,
  }));
}
