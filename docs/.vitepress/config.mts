import { defineConfig } from 'vitepress'

const repo = 'https://github.com/savkelita/tea-effect'

export default defineConfig({
  title: 'tea-effect',
  description: 'The Elm Architecture for TypeScript with Effect',

  // GitHub Pages project site: https://savkelita.github.io/tea-effect/
  base: '/tea-effect/',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/why', activeMatch: '/guide/' },
      { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Why tea-effect', link: '/guide/why' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'The mental model', link: '/guide/mental-model' }
          ]
        },
        {
          text: 'Guides',
          items: [
            { text: 'HTTP', link: '/guide/http' },
            { text: 'Routing', link: '/guide/routing' },
            { text: 'Dependency injection', link: '/guide/dependency-injection' },
            { text: 'Composition', link: '/guide/composition' },
            { text: 'Testing', link: '/guide/testing' }
          ]
        },
        {
          text: 'Reference',
          items: [{ text: 'Gotchas', link: '/guide/gotchas' }]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: repo }],

    search: { provider: 'local' },

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Marko Savic'
    }
  }
})
