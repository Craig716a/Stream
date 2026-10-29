name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --no-frozen-lockfile
      - name: Build
        working-directory: artifacts/stream-world
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
          VITE_TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}
        run: pnpm exec vite build --config vite.pages.config.ts
      - name: SPA fallback
        run: cp artifacts/stream-world/dist/public/index.html artifacts/stream-world/dist/public/404.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: artifacts/stream-world/dist/public

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
