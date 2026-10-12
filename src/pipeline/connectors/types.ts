// A connector wraps one external system behind a small, typed interface. Jobs talk to
// connectors only, so each system's quirks (rate limits, paging, retries) live in one place.

export type Health = { connector: string; ok: boolean; latencyMs: number; detail?: string };

export interface Connector {
  readonly name: string;
  /** Cheap round trip proving the system is reachable with the configured credentials. */
  health(): Promise<Health>;
}

export async function probe(name: string, check: () => Promise<string | undefined>): Promise<Health> {
  const t = Date.now();
  try {
    const detail = await check();
    return { connector: name, ok: true, latencyMs: Date.now() - t, detail };
  } catch (e) {
    return { connector: name, ok: false, latencyMs: Date.now() - t, detail: (e as Error).message.slice(0, 200) };
  }
}
