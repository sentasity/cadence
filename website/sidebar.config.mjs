// Sidebar configuration: single source of truth.
// Imported by both astro.config.mjs (Starlight integration) and
// scripts/check-sidebar.mjs (consistency checker). Kept in a separate file so
// the checker can import the sidebar without loading Astro/Starlight (which
// exposes TypeScript source files that Node cannot evaluate directly).
export const sidebar = [
  {
    // Get Started: ordered by the 01-..05- filename prefixes
    label: 'Get Started',
    items: [{ autogenerate: { directory: 'get-started' } }],
  },
  {
    // Deep dives: 6 core-flow stages in order, then combined diagnostics (explicit, not prefixed)
    label: 'Deep dives',
    items: [
      { label: 'Brainstorm', link: '/brainstorm/' },
      { label: 'Design', link: '/design/' },
      { label: 'Plan', link: '/plan/' },
      { label: 'Execute', link: '/execute/' },
      { label: 'Audit', link: '/audit/' },
      { label: 'Validate', link: '/validate/' },
      { label: 'Diagnostics', link: '/diagnostics/' },
    ],
  },
  {
    // Cross-cutting topics, ordered by each page's sidebar.order frontmatter.
    label: 'Concepts',
    items: [{ autogenerate: { directory: 'concepts' } }],
  },
  {
    label: 'Reference',
    items: [{ autogenerate: { directory: 'reference' } }],
  },
];
