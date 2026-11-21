// @ts-check
// Docusaurus configuration for Stellar Tipz documentation site
// https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
export const config = {
  title: 'Stellar Tipz',
  tagline: 'Empowering creators through decentralized, instant, and fair tipping',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://docs.stellartipz.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'mariam-farrukh',
  projectName: 'Stellar-Tipz',
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw', // Fail build on broken links
  onBrokenMarkdownLinks: 'throw',
  onDuplicateRoutes: 'throw',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/mariam-farrukh/Stellar-Tipz/tree/main/docs',
          remarkPlugins: [
            [require('remark-docusaurus-tabs'), {}],
          ],
          versions: {
            current: {
              label: 'Latest (v1.0)',
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    {
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      navbar: {
        title: 'Stellar Tipz',
        logo: {
          alt: 'Stellar Tipz Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            label: 'API Reference',
            to: 'docs/api-reference',
            position: 'left',
          },
          {
            label: 'Contract ABI',
            to: 'docs/contract-abi',
            position: 'left',
          },
          {
            label: 'Versions',
            to: 'docs/versions',
            position: 'right',
          },
          {
            href: 'https://github.com/mariam-farrukh/Stellar-Tipz',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Getting Started',
                to: 'docs/getting-started',
              },
              {
                label: 'Integration Guide',
                to: 'docs/integration',
              },
              {
                label: 'Architecture',
                to: 'docs/architecture',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub Issues',
                href: 'https://github.com/mariam-farrukh/Stellar-Tipz/issues',
              },
              {
                label: 'Discussions',
                href: 'https://github.com/mariam-farrukh/Stellar-Tipz/discussions',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Security',
                to: 'docs/security',
              },
              {
                label: 'Contributing',
                to: 'docs/contributing',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Stellar Tipz. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['rust', 'toml'],
      },
      algolia: {
        // Algolia application ID (optional, stored in .env.production.local)
        appId: process.env.ALGOLIA_APP_ID || '',
        // Public API key (optional, stored in .env)
        apiKey: process.env.ALGOLIA_SEARCH_API_KEY || '',
        // Index name
        indexName: 'stellar-tipz-docs',
        contextualSearch: true,
      },
    },

  plugins: [
    [
      '@docusaurus/plugin-ideal-image',
      {
        quality: 70,
        max: 1030,
        min: 640,
        steps: 2,
        disableInDev: false,
      },
    ],
  ],
};

export default config;
