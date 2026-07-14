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
  // Astro 6 stopped defaulting markdown.gfm in the resolved config (it is now
  // supplied by the core processor when absent), but @astrojs/mdx 5.x still
  // reads config.markdown.gfm and treats "absent" as off — so every .mdx page
  // silently lost GFM tables/strikethrough/autolinks. Set it explicitly until
  // Starlight moves to an @astrojs/mdx that handles the new default (the
  // build prints a one-line deprecation warning for this key; that's expected).
  markdown: {
    gfm: true,
  },
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
        // Set the diagram font in Mermaid's config (not CSS) so Mermaid
        // measures label boxes with the mono font during layout. Overriding
        // font-family in CSS after layout would make labels wider than their
        // pre-sized foreignObjects and clip the text. JetBrains Mono ties the
        // diagrams to the CLI / `/c-*` identity; theme.css loads the face.
        fontFamily: '"JetBrains Mono", monospace',
        themeVariables: {
          fontSize: '14px',
          // Mermaid otherwise paints a light edge-label background via an
          // ID-scoped !important rule that a class selector can't override.
          // Make it transparent so mermaid.css can render its own token-based
          // chip that auto-swaps light/dark.
          edgeLabelBackground: 'transparent',
        },
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
      // Footer override adds a small "Built by Sentasity" credit under the
      // default footer content on every page.
      components: {
        Footer: './src/components/Footer.astro',
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
        // Mermaid diagram branding. After theme.css so it can read the
        // accent tokens defined there.
        './src/styles/mermaid.css',
      ],
      sidebar,
    }),
  ],
});
