import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCatalogQueryParams,
  GetCatalogResponse,
  GetAnimeMalIdResponse,
  GetTodayQueryParams,
  GetProviderCatalogQueryParams,
  GetProviderCatalogResponse,
  GetSeasonDetailsParams,
  GetSeasonDetailsResponse,
  GetTitleDetailsParams,
  GetTitleDetailsResponse,
  GetTitleProvidersParams,
  GetTitleProvidersResponse,
  GetTitleRecommendationsParams,
  GetTitleRecommendationsResponse,
  GetTrendingQueryParams,
  GetTrendingResponse,
  SearchCatalogQueryParams,
  SearchCatalogResponse,
  type MediaType,
} from "@workspace/api-zod";
import { getTmdb, TmdbError } from "../lib/tmdb";

const router: IRouter = Router();
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mediaType(value: unknown, fallback?: MediaType): MediaType {
  if (value === "tv" || fallback === "tv") return "tv";
  return "movie";
}

function mapMedia(value: unknown, fallbackType?: MediaType): JsonRecord {
  const item = record(value);
  const type = mediaType(item.media_type, fallbackType);
  const genreIds = array(item.genre_ids).filter(
    (id): id is number => typeof id === "number" && Number.isFinite(id),
  );

  return {
    id: number(item.id),
    mediaType: type,
    title: string(item.title ?? item.name, "Untitled"),
    overview: string(item.overview),
    posterPath: nullableString(item.poster_path),
    backdropPath: nullableString(item.backdrop_path),
    voteAverage: number(item.vote_average),
    releaseDate: nullableString(item.release_date ?? item.first_air_date),
    genreIds,
    originalLanguage: string(item.original_language, "en"),
  };
}

function mapPage(value: unknown, fallbackType?: MediaType): JsonRecord {
  const page = record(value);
  return {
    page: number(page.page, 1),
    totalPages: number(page.total_pages, 1),
    totalResults: number(page.total_results),
    results: array(page.results)
      .filter((item) => {
        const type = record(item).media_type;
        return type !== "person";
      })
      .map((item) => mapMedia(item, fallbackType)),
  };
}

function mapGenre(value: unknown): JsonRecord {
  const genre = record(value);
  return { id: number(genre.id), name: string(genre.name, "Other") };
}

function mapSeasonSummary(value: unknown): JsonRecord {
  const season = record(value);
  return {
    id: number(season.id),
    seasonNumber: number(season.season_number),
    name: string(season.name, "Season"),
    episodeCount: number(season.episode_count),
    posterPath: nullableString(season.poster_path),
    airDate: nullableString(season.air_date),
  };
}

function mapCast(value: unknown): JsonRecord {
  const member = record(value);
  return {
    id: number(member.id),
    name: string(member.name, "Cast member"),
    character: string(member.character),
    profilePath: nullableString(member.profile_path),
  };
}

function mapTitle(value: unknown, type: MediaType): JsonRecord {
  const title = record(value);
  const videoResults = array(record(title.videos).results).map(record);
  const trailer = videoResults
    .filter((video) => video.site === "YouTube" && typeof video.key === "string")
    .sort((a, b) => {
      const score = (video: JsonRecord) =>
        (video.type === "Trailer" ? 2 : 0) + (video.official === true ? 1 : 0);
      return score(b) - score(a);
    })[0];
  const credits = record(title.credits);
  const lastEpisode = record(title.last_episode_to_air);
  const runtimeValue = title.runtime ?? array(title.episode_run_time)[0];

  return {
    id: number(title.id),
    mediaType: type,
    title: string(title.title ?? title.name, "Untitled"),
    overview: string(title.overview),
    posterPath: nullableString(title.poster_path),
    backdropPath: nullableString(title.backdrop_path),
    voteAverage: number(title.vote_average),
    releaseDate: nullableString(title.release_date ?? title.first_air_date),
    trailerKey: nullableString(trailer?.key),
    trailerName: nullableString(trailer?.name),
    genres: array(title.genres).map(mapGenre),
    runtime: nullableNumber(runtimeValue),
    numberOfSeasons: nullableNumber(title.number_of_seasons),
    numberOfEpisodes: nullableNumber(title.number_of_episodes),
    lastEpisodeNumber: nullableNumber(lastEpisode.episode_number),
    lastEpisodeName: nullableString(lastEpisode.name),
    status: nullableString(title.status),
    seasons: array(title.seasons).map(mapSeasonSummary),
    cast: array(credits.cast).slice(0, 12).map(mapCast),
  };
}

type AnimeMalIdCacheEntry = {
  expiresAt: number;
  malId: number | null;
};

const animeMalIdCache = new Map<string, AnimeMalIdCacheEntry>();

async function resolveAnimeMalId(tmdbId: number): Promise<number | null> {
  const cacheKey = String(tmdbId);
  const cached = animeMalIdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.malId;

  try {
    const query = `SELECT DISTINCT ?malId WHERE {
      ?series wdt:P4983 "${tmdbId}" ;
        wdt:P4086 ?malId .
    } LIMIT 10`;
    const url = new URL("https://query.wikidata.org/sparql");
    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");
    const response = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "StreamWorld/1.0 (TMDb to MyAnimeList ID mapping)",
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`);

    const payload = record(await response.json());
    const results = array(record(payload.results).bindings).map(record);
    const malIds = [...new Set(results
      .map((binding) => Number(record(binding.malId).value))
      .filter((value) => Number.isSafeInteger(value) && value > 0))];
    const malId = malIds.length === 1 ? malIds[0] : null;

    animeMalIdCache.set(cacheKey, {
      malId,
      expiresAt: Date.now() + (malId ? 24 * 60 * 60_000 : 60 * 60_000),
    });
    return malId;
  } catch (error) {
    animeMalIdCache.set(cacheKey, { malId: null, expiresAt: Date.now() + 60_000 });
    throw error;
  }
}

function mapEpisode(value: unknown): JsonRecord {
  const episode = record(value);
  return {
    id: number(episode.id),
    episodeNumber: number(episode.episode_number),
    name: string(episode.name, "Episode"),
    overview: string(episode.overview),
    stillPath: nullableString(episode.still_path),
    airDate: nullableString(episode.air_date),
    runtime: nullableNumber(episode.runtime),
    voteAverage: number(episode.vote_average),
  };
}

function mapSeason(value: unknown): JsonRecord {
  const season = record(value);
  const episodes = array(season.episodes)
    .map(mapEpisode)
    .sort((a, b) => number(a.episodeNumber) - number(b.episodeNumber));

  return {
    id: number(season.id),
    seasonNumber: number(season.season_number),
    name: string(season.name, "Season"),
    overview: string(season.overview),
    posterPath: nullableString(season.poster_path),
    airDate: nullableString(season.air_date),
    episodeCount: episodes.length || number(season.episode_count),
    episodes,
  };
}

function mapProvider(value: unknown): JsonRecord {
  const provider = record(value);
  return {
    providerId: number(provider.provider_id),
    name: string(provider.provider_name, "Streaming service"),
    logoPath: nullableString(provider.logo_path),
    displayPriority: number(provider.display_priority, 999),
  };
}

function mapProviderRegionOption(value: unknown): JsonRecord {
  const region = record(value);
  return {
    iso3166_1: string(region.iso_3166_1),
    englishName: string(region.english_name),
    nativeName: string(region.native_name),
  };
}

function mapProviderRegion(iso: string, value: unknown): JsonRecord {
  const region = record(value);
  return {
    iso3166_1: iso,
    link: nullableString(region.link),
    flatrate: array(region.flatrate).map(mapProvider),
    rent: array(region.rent).map(mapProvider),
    buy: array(region.buy).map(mapProvider),
  };
}

function sendTmdbError(req: Request, res: Response, error: unknown): void {
  const status = error instanceof TmdbError ? error.status : 502;
  req.log.warn({ status }, "TMDb request failed");

  if (status === 404) {
    res.status(404).json({ error: "Title or season not found." });
    return;
  }

  if (status === 503) {
    res.status(503).json({ error: "TMDb API key is not configured." });
    return;
  }

  res.status(502).json({ error: "TMDb is temporarily unavailable." });
}

router.get("/tmdb/discover", async (req, res): Promise<void> => {
  const parsed = GetCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = parsed.data;
  const sortBy =
    query.mediaType === "tv" && query.sortBy === "release_date.desc"
      ? "first_air_date.desc"
      : query.sortBy;

  try {
    const raw = await getTmdb(`/discover/${query.mediaType}`, {
      sort_by: sortBy,
      page: query.page,
      with_genres: query.genreId,
      with_original_language: query.originalLanguage,
      primary_release_year: query.mediaType === "movie" ? query.year : undefined,
      first_air_date_year: query.mediaType === "tv" ? query.year : undefined,
      "primary_release_date.lte":
        query.mediaType === "movie" ? query.releaseDateLte : undefined,
      "first_air_date.lte":
        query.mediaType === "tv" ? query.releaseDateLte : undefined,
      with_watch_providers: query.watchProviderId,
      watch_region: query.watchRegion,
      include_adult: "false",
    });
    res.json(GetCatalogResponse.parse(mapPage(raw, query.mediaType)));
  } catch (error) {
    sendTmdbError(req, res, error);
  }
});

router.get("/tmdb/today", async (req, res): Promise<void> => {
  const parsed = GetTodayQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = parsed.data;
  const sharedParams = {
    page: 1,
    with_genres: query.genreId,
    with_original_language: query.originalLanguage,
    include_adult: "false",
  };
  const requests: Promise<unknown>[] = [];

  if (query.mediaType === "all" || query.mediaType === "movie") {
    requests.push(
      getTmdb("/discover/movie", {
        ...sharedParams,
        "primary_release_date.gte": query.date,
        "primary_release_date.lte": query.date,
        sort_by: "popularity.desc",
      }),
    );
  }
  if (query.mediaType === "all" || query.mediaType === "tv") {
    requests.push(
      getTmdb("/discover/tv", {
        ...sharedParams,
        "air_date.gte": query.date,
        "air_date.lte": query.date,
        sort_by: "popularity.desc",
      }),
    );
  }

  try {
    const pages = await Promise.all(requests);
    const types: MediaType[] =
      query.mediaType === "all" ? ["movie", "tv"] : [query.mediaType];
    const results = pages
      .flatMap((page, index) =>
        array(record(page).results).map((item) => mapMedia(item, types[index])),
      )
      .sort((a, b) => number(record(b).voteAverage) - number(record(a).voteAverage));

    res.json(
      GetCatalogResponse.parse({
        page: 1,
        totalPages: 1,
        totalResults: results.length,
        results,
      }),
    );
  } catch (error) {
    sendTmdbError(req, res, error);
  }
});

router.get("/tmdb/trending", async (req, res): Promise<void> => {
  const parsed = GetTrendingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = parsed.data;
  try {
    const raw = await getTmdb(
      `/trending/${query.mediaType}/${query.timeWindow}`,
      { page: query.page },
    );
    res.json(GetTrendingResponse.parse(mapPage(raw)));
  } catch (error) {
    sendTmdbError(req, res, error);
  }
});

router.get("/tmdb/search", async (req, res): Promise<void> => {
  const parsed = SearchCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data;
  if (!query.query.trim()) {
    res.status(400).json({ error: "Enter a title to search." });
    return;
  }

  try {
    const raw = await getTmdb("/search/multi", {
      query: query.query.trim(),
      page: query.page,
      include_adult: "false",
    });
    res.json(SearchCatalogResponse.parse(mapPage(raw)));
  } catch (error) {
    sendTmdbError(req, res, error);
  }
});

router.get("/tmdb/providers", async (req, res): Promise<void> => {
  const parsed = GetProviderCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const raw = record(
      await getTmdb(`/watch/providers/${parsed.data.mediaType}`, {
        language: "en-US",
        watch_region: parsed.data.watchRegion,
      }),
    );
    const providers = array(raw.results)
      .map(mapProvider)
      .sort(
        (a, b) =>
          number(a.displayPriority) - number(b.displayPriority),
      );
    res.json(GetProviderCatalogResponse.parse(providers));
  } catch (error) {
    sendTmdbError(req, res, error);
  }
});

router.get("/tmdb/provider-regions", async (req, res): Promise<void> => {
  try {
    const raw = record(
      await getTmdb("/watch/providers/regions", { language: "en-US" }),
    );
    const regions = array(raw.results)
      .map(mapProviderRegionOption)
      .filter((region) => string(region.iso3166_1).length === 2)
      .sort((a, b) =>
        string(a.englishName).localeCompare(string(b.englishName)),
      );
    res.json(regions);
  } catch (error) {
    sendTmdbError(req, res, error);
  }
});

router.get(
  "/tmdb/title/:mediaType/:id/anime-mal-id",
  async (req, res): Promise<void> => {
    const parsed = GetTitleDetailsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, mediaType: type } = parsed.data;

    try {
      if (type !== "tv") {
        res.json(GetAnimeMalIdResponse.parse({ malId: null }));
        return;
      }

      const raw = record(await getTmdb(`/tv/${id}`));
      const isAnimated = array(raw.genres).some(
        (genre) => number(record(genre).id) === 16,
      );
      if (!isAnimated) {
        res.json(GetAnimeMalIdResponse.parse({ malId: null }));
        return;
      }

      let malId: number | null = null;
      try {
        malId = await resolveAnimeMalId(
          id,
        );
      } catch (error) {
        req.log.warn(
          { id, error: error instanceof Error ? error.message : String(error) },
          "Wikidata MAL ID lookup unavailable",
        );
      }
      res.json(GetAnimeMalIdResponse.parse({ malId }));
    } catch (error) {
      sendTmdbError(req, res, error);
    }
  },
);

router.get(
  "/tmdb/title/:mediaType/:id/season/:seasonNumber",
  async (req, res): Promise<void> => {
    const parsed = GetSeasonDetailsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, seasonNumber } = parsed.data;

    try {
      const raw = await getTmdb(`/tv/${id}/season/${seasonNumber}`);
      res.json(GetSeasonDetailsResponse.parse(mapSeason(raw)));
    } catch (error) {
      sendTmdbError(req, res, error);
    }
  },
);

router.get(
  "/tmdb/title/:mediaType/:id/providers",
  async (req, res): Promise<void> => {
    const parsed = GetTitleProvidersParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, mediaType: type } = parsed.data;

    try {
      const raw = record(
        await getTmdb(`/${type}/${id}/watch/providers`),
      );
      const regions = Object.entries(record(raw.results))
        .map(([iso, region]) => mapProviderRegion(iso, region))
        .filter((region) => {
          const item = record(region);
          return (
            array(item.flatrate).length > 0 ||
            array(item.rent).length > 0 ||
            array(item.buy).length > 0
          );
        });
      res.json(GetTitleProvidersResponse.parse(regions));
    } catch (error) {
      sendTmdbError(req, res, error);
    }
  },
);

router.get(
  "/tmdb/title/:mediaType/:id/recommendations",
  async (req, res): Promise<void> => {
    const parsed = GetTitleRecommendationsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, mediaType: type } = parsed.data;

    try {
      const raw = await getTmdb(`/${type}/${id}/recommendations`);
      res.json(
        GetTitleRecommendationsResponse.parse(mapPage(raw, type)),
      );
    } catch (error) {
      sendTmdbError(req, res, error);
    }
  },
);

router.get(
  "/tmdb/title/:mediaType/:id",
  async (req, res): Promise<void> => {
    const parsed = GetTitleDetailsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { id, mediaType: type } = parsed.data;

    try {
      const raw = await getTmdb(`/${type}/${id}`, {
        append_to_response: "credits,videos",
      });
      res.json(GetTitleDetailsResponse.parse(mapTitle(raw, type)));
    } catch (error) {
      sendTmdbError(req, res, error);
    }
  },
);

export default router;
