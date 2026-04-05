import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://b2ornot2b.github.io',
  base: '/pnxt',
  integrations: [
    starlight({
      title: 'pnxt',
      description:
        'Agent-Native Programming Paradigm — a net-new programming paradigm built exclusively for LLMs and AI agents.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      social: {
        github: 'https://github.com/b2ornot2b/pnxt',
      },
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://b2ornot2b.github.io/pnxt/og-image.png',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:card',
            content: 'summary_large_image',
          },
        },
      ],
      sidebar: [
        {
          label: 'Welcome',
          items: [
            { label: 'Introduction', slug: 'introduction' },
            { label: 'Quick Start', slug: 'quickstart' },
            { label: 'Project Status', slug: 'status' },
          ],
        },
        {
          label: 'Core Concepts',
          items: [
            { label: 'Three Pillars of ANP', slug: 'concepts/pillars' },
            {
              label: 'Theoretical Foundations',
              slug: 'concepts/foundations',
            },
          ],
        },
        {
          label: 'Research',
          items: [
            { label: 'Overview', slug: 'research/overview' },
            {
              label: 'Agent-Computer Interface',
              slug: 'research/phase-3/agent-computer-interface',
            },
            {
              label: 'Semantic Memory',
              slug: 'research/phase-3/semantic-memory',
            },
            {
              label: 'Multi-Agent Coordination',
              slug: 'research/phase-3/multi-agent-coordination',
            },
            {
              label: 'Trust, Safety & Governance',
              slug: 'research/phase-3/trust-safety-governance',
            },
            {
              label: 'Comparative Analysis',
              slug: 'research/phase-3/comparative-analysis',
            },
            {
              label: 'Reference Architecture',
              slug: 'research/phase-3/reference-architecture',
            },
          ],
        },
        {
          label: 'Roadmap',
          items: [
            { label: 'Phase 4 Implementation', slug: 'roadmap/phase-4' },
            { label: 'Future Vision', slug: 'roadmap/future' },
          ],
        },
        {
          label: 'Contributing',
          items: [{ label: 'Guidelines', slug: 'contributing/guidelines' }],
        },
      ],
    }),
  ],
});
