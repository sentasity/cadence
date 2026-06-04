import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Exported as a named const so website/scripts/check-sidebar.mjs can
// `import { sidebar } from '../astro.config.mjs'` without re-running the
// Starlight integration. This is the single source of truth for the sidebar.
export const sidebar = [
  {
    label: 'Course',
    items: [
      // Quickstart: ordered by the 01-..04- filename prefixes
      { label: 'Quickstart', autogenerate: { directory: 'course/quickstart' } },
      // Deep dives: 6 core-flow phases in order, then combined diagnostics (explicit, not prefixed)
      {
        label: 'Deep dives',
        items: [
          { label: 'Brainstorm', link: '/course/brainstorm/' },
          { label: 'Design', link: '/course/design/' },
          { label: 'Plan', link: '/course/plan/' },
          { label: 'Execute', link: '/course/execute/' },
          { label: 'Audit', link: '/course/audit/' },
          { label: 'Validate', link: '/course/validate/' },
          { label: 'Diagnostics', link: '/course/diagnostics/' },
        ],
      },
    ],
  },
  {
    label: 'Reference',
    autogenerate: { directory: 'reference' },
  },
];

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
