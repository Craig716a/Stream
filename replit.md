# Stream World

A worldwide movie and series discovery app inspired by the user's streaming-app screenshots.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `TMDB_API_KEY` — TMDb v3 API key, server-side only
- Required env: `DATABASE_URL` — Postgres connection string (workspace template)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/stream-world` — user-facing discovery app
- `artifacts/api-server/src/routes/tmdb.ts` — server-side TMDb API
- `lib/api-spec/openapi.yaml` — API contract and generated client source

## Architecture decisions

- TMDb requests stay server-side; `TMDB_API_KEY` must only be stored in Replit Secrets.
- The catalog is global and has no hardcoded country filter; provider availability is shown by region because TMDb reports it that way.
- TMDb provides metadata and trailer references, not full episode streams; the player must label previews clearly and never claim full-episode playback.
- Favorites, history, and language preferences are local to the current browser until account sync is requested.

## Product

- Browse worldwide movies and series by home recommendations, trending lists, genre, year, and sort order.
- Open title details with seasons, exact numbered episodes, cast, favorites, and “More Like This” recommendations.
- Keep “You may also like” items in the requested two-column layout.
- Show streaming provider availability by country, with a worldwide view available by default.
- Navigate through Home, Streaming, Categories, Sharing, and Me.

## User preferences

- Follow the supplied reference screenshots closely; the player itself may use a different design.
- Keep the catalog worldwide, not restricted to one region.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- Provider availability is inherently region-specific even though catalog discovery is worldwide.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
