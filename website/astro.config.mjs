import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
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
    // astro-mermaid MUST come before starlight: it registers the rehype plugin
    // that turns ```mermaid code blocks into client-rendered diagrams, and that
    // plugin has to run before Starlight's markdown processing. autoTheme wires
    // the diagram theme to Starlight's data-theme attribute (light/dark), so
    // diagrams follow the site's "Paper & Cobalt" light/dark toggle.
    mermaid({
      theme: 'default',
      autoTheme: true,
      mermaidConfig: {
        flowchart: { curve: 'basis' },
      },
    }),
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
