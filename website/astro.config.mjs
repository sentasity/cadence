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
      // Brand mark shown beside the title in the header (Starlight requires the
      // asset under src/assets, not public/). replacesTitle defaults to false,
      // so the "Cadence" wordmark text stays next to the icon.
      logo: {
        src: './src/assets/cadence-icon.svg',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/sentasity/cadence',
        },
      ],
      customCss: [
        // Fontsource font faces (loaded via customCss per Starlight guidance).
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/sora/600.css',
        '@fontsource/sora/700.css',
        '@fontsource/jetbrains-mono/400.css',
        '@fontsource/jetbrains-mono/500.css',
        // Theme tokens (accent + font assignments). Listed last so its
        // --sl-font/--sl-color-* overrides win.
        './src/styles/theme.css',
      ],
      sidebar,
    }),
  ],
});
