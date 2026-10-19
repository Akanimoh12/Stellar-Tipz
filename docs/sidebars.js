/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a ToC (table of contents) for each doc entry
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

module.exports = {
  tutorialSidebar: [
    {
      label: 'Getting Started',
      items: [
        'README',
        'quick-start',
        'setup',
      ],
    },
    {
      label: 'Architecture',
      items: [
        'architecture',
        {
          label: 'Architecture Decisions',
          items: [
            'adr/ADR-001-stellar-wallet-auth-flow',
            'adr/ADR-002-design-system',
            'adr/ADR-003-credit-score',
            'adr/ADR-004-storage-strategy',
            'adr/ADR-005-frontend-state',
            'adr/ADR-006-fee-structure',
            'adr/ADR-007-profile-boundary',
            'adr/ADR-008-scheduled-signing',
            'adr/ADR-009-soft-delete',
          ],
        },
      ],
    },
    {
      label: 'Contract',
      items: [
        'contract-spec',
        'contract-abi',
        'credit-score',
      ],
    },
    {
      label: 'API & Integration',
      items: [
        'api-reference',
        'sdk-generation',
        'webhooks',
        {
          label: 'Backend Docs',
          items: [
            'backend/data-model',
            'backend/database-pool',
            'backend/indexer',
            'backend/realtime',
            'backend/caching',
          ],
        },
      ],
    },
    {
      label: 'Frontend',
      items: [
        'frontend-guide',
        'bundle-optimization',
      ],
    },
    {
      label: 'Operations',
      items: [
        'deployment',
        'testnet-deploy',
        'troubleshooting',
        'slo',
        'incident-response',
        {
          label: 'Runbooks',
          items: [
            'runbooks/api-slo-burn',
            'runbooks/indexer-freshness',
            'runbooks/slo-telemetry',
          ],
        },
      ],
    },
    {
      label: 'Development',
      items: [
        'contributing',
        'backend-contributing',
        'mutation-testing',
        'failure-injection',
        'performance',
      ],
    },
    {
      label: 'Reference',
      items: [
        'security',
        'units',
        'troubleshooting',
      ],
    },
  ],
};
