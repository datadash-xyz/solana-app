// Upserts shared by the indexer scripts.
import { sql, ts } from "./db";
import { usd, type HistoryItem, type JEvent } from "./jupiter";

// Map each provider's category names onto Datadash's categories.
const CATEGORY: Record<string, string> = {
  politics: "Politics", elections: "Politics", world: "Politics",
  sports: "Sports", esports: "Esports", crypto: "Crypto",
  finance: "Finance", financials: "Finance", companies: "Finance", economics: "Economics",
  tech: "Tech", "science and technology": "Tech", science: "Tech",
  culture: "Culture", entertainment: "Culture", health: "Health", climate: "Weather", weather: "Weather",
};
export const normCategory = (c: string | null | undefined) =>
  !c ? "Other" : CATEGORY[c.toLowerCase()] ?? c.charAt(0).toUpperCase() + c.slice(1);

const price = (micro: number | null | undefined) => (micro === null || micro === undefined ? null : micro / 1e6);

export async function saveEvents(events: JEvent[], provider?: string) {
  if (!events.length) return 0;
  events = [...new Map(events.map((e) => [e.eventId, e])).values()];
  const evRows = events.map((e) => ({
    event_id: e.eventId,
    provider: provider ?? e.markets?.[0]?.provider ?? null,
    category: normCategory(e.category), category_raw: e.category, subcategory: e.subcategory,
    title: e.metadata?.title ?? null, slug: e.metadata?.slug ?? null, image_url: e.metadata?.imageUrl ?? null,
    close_time: e.metadata?.closeTime ? new Date(e.metadata.closeTime) : null,
    volume_usd: usd(e.volumeUsd), is_active: e.isActive, tags: e.tags ?? [],
  }));
  for (let i = 0; i < evRows.length; i += 500) {
    await sql`insert into events ${sql(evRows.slice(i, i + 500))}
      on conflict (event_id) do update set provider = excluded.provider, category = excluded.category, category_raw = excluded.category_raw,
        subcategory = excluded.subcategory, title = excluded.title, slug = excluded.slug, image_url = excluded.image_url,
        close_time = excluded.close_time, volume_usd = excluded.volume_usd, is_active = excluded.is_active,
        tags = excluded.tags, updated_at = now()`;
  }
  const mkRows = events.flatMap((e) =>
    (e.markets ?? []).map((m) => ({
      market_id: m.marketId, event_id: e.eventId, provider: m.provider, title: m.title, status: m.status,
      result: m.result, buy_yes: price(m.pricing?.buyYesPriceUsd), buy_no: price(m.pricing?.buyNoPriceUsd),
      close_time: ts(m.closeTime),
    })),
  );
  // A market can appear twice in one page; keep the last copy so the upsert doesn't conflict with itself.
  const uniq = [...new Map(mkRows.map((r) => [r.market_id, r])).values()];
  for (let i = 0; i < uniq.length; i += 500) {
    await sql`insert into markets ${sql(uniq.slice(i, i + 500))}
      on conflict (market_id) do update set event_id = excluded.event_id, title = excluded.title, status = excluded.status,
        result = excluded.result, buy_yes = excluded.buy_yes, buy_no = excluded.buy_no, close_time = excluded.close_time, updated_at = now()`;
  }
  return uniq.length;
}

// Stores event/market metadata that arrives embedded in history rows. Only fills gaps:
// rows already loaded from /events (with volume and live pricing) are left untouched.
export async function saveMetaFromHistory(items: HistoryItem[]) {
  const ev = new Map<string, Record<string, unknown>>();
  const mk = new Map<string, Record<string, unknown>>();
  for (const h of items) {
    const e = h.eventMetadata;
    const eventId = e?.eventId ?? h.eventId;
    if (e && eventId && !ev.has(eventId)) {
      const close = e.closeTime === undefined || e.closeTime === null || e.closeTime === "" ? null
        : typeof e.closeTime === "number" || /^\d+$/.test(String(e.closeTime)) ? ts(e.closeTime) : new Date(String(e.closeTime));
      ev.set(eventId, {
        event_id: eventId, provider: h.marketMetadata?.provider ?? null,
        category: normCategory(e.category), category_raw: e.category ?? null, subcategory: e.subcategory ?? null,
        title: e.title ?? null, slug: null, image_url: e.imageUrl ?? null, close_time: close,
        volume_usd: null, is_active: null, tags: e.tags ?? [],
      });
    }
    const m = h.marketMetadata;
    const marketId = m?.marketId ?? h.marketId;
    if (m && marketId && !mk.has(marketId)) {
      mk.set(marketId, {
        market_id: marketId, event_id: m.eventId ?? eventId ?? null, provider: m.provider ?? null, title: m.title ?? null,
        status: m.status ?? null, result: m.result ?? null, buy_yes: null, buy_no: null, close_time: ts(m.closeTime ?? null),
      });
    }
  }
  const evRows = [...ev.values()], mkRows = [...mk.values()];
  for (let i = 0; i < evRows.length; i += 500) await sql`insert into events ${sql(evRows.slice(i, i + 500))} on conflict (event_id) do nothing`;
  for (let i = 0; i < mkRows.length; i += 500) await sql`insert into markets ${sql(mkRows.slice(i, i + 500))} on conflict (market_id) do update
    set status = excluded.status, result = excluded.result`;
  return { events: evRows.length, markets: mkRows.length };
}
