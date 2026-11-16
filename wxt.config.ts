import { defineConfig } from 'wxt';

// See PROJECT.md §6 — keep permissions minimal: no host permissions at all.
export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  manifest: {
    name: 'WEBRAID',
    description: 'Every website is a boss fight. Turn the current webpage into a game.',
    permissions: ['activeTab', 'scripting', 'storage'],
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
    action: {
      default_title: 'Start WEBRAID (Alt+R)',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
    },
    commands: {
      'start-raid': {
        suggested_key: { default: 'Alt+R' },
        description: 'Start WEBRAID',
      },
    },
  },
});
