import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://day2ops.dev',
  output: 'static',
  integrations: [
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'one-dark-pro',
      langs: [],
      wrap: false,
    },
  },
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
  vite: {
    css: {
      preprocessorOptions: {},
    },
  },
});
