const TMDB_API_BASE = "https://api.themoviedb.org/3";
const CACHE_TTL_MS = 2 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export class TmdbError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

const cache = new Map<string, CacheEntry>();

export async function getTmdb(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const token = process.env.TMDB_API_KEY;
  if (!token) {
    throw new TmdbError("TMDb is not configured.", 503);
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const cacheKey = `${path}?${query.toString()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set("api_key", token);
  query.forEach((value, key) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new TmdbError("TMDb request failed.", response.status);
  }

  const value: unknown = await response.json();
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
