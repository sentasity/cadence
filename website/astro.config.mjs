import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { sidebar } from './sidebar.config.mjs';

// sidebar is the single source of truth; it lives in sidebar.config.mjs so
// scripts/check-sidebar.mjs can import it without loading Astro/Starlight
// (Starlight 0.39+ exposes .ts entry points that Node cannot evaluate directly).
export { sidebar };

// https://astro.build/config
export default defineConfig({
  site: 'https://sentasity.github.io',
  base: '/cadence/',
  integrations: [
    starlight({
      title: 'Cadence',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/sentasity/cadence',
        },
      ],
      sidebar,
    }),
  ],
});
