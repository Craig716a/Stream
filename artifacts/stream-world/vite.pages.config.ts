import path from 'path';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import base from './vite.config';

const here = import.meta.dirname;

// Loads the in-browser API before the app starts.
const injectApi: Plugin = {
  name: 'pages-api',
  transformIndexHtml: {
    order: 'pre',
    handler() {
      return [{ tag: 'script', attrs: { type: 'module', src: '/src/pages-api/install.ts' }, injectTo: 'head-prepend' }];
    },
  },
};

export default mergeConfig(
  base,
  defineConfig({
    plugins: [injectApi],
    resolve: {
      alias: [
        { find: /^express$/, replacement: path.resolve(here, 'src/pages-api/express-shim.ts') },
        { find: /^\.\.\/lib\/tmdb$/, replacement: path.resolve(here, 'src/pages-api/tmdb-browser.ts') },
      ],
    },
  }),
);
