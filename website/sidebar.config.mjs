// Sidebar configuration — single source of truth.
// Imported by both astro.config.mjs (Starlight integration) and
// scripts/check-sidebar.mjs (consistency checker). Kept in a separate file so
// the checker can import the sidebar without loading Astro/Starlight (which
// exposes TypeScript source files that Node cannot evaluate directly).
export const sidebar = [
  {
    label: 'Course',
    items: [
      // Quickstart: ordered by the 01-..04- filename prefixes
      { label: 'Quickstart', items: [{ autogenerate: { directory: 'course/quickstart' } }] },
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
    items: [{ autogenerate: { directory: 'reference' } }],
  },
];
