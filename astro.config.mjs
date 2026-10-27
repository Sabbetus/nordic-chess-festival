import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nordicchess.fi',
  trailingSlash: 'always',
  // The page used to be called /tournament/.
  redirects: { '/tournament/': '/main-event/', '/fi/tournament/': '/fi/main-event/' },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fi'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en', fi: 'fi' } },
      // Placeholder content is marked noindex, so keep it out of the sitemap too.
      filter: (page) => !page.includes('placeholder-') && !page.includes('/admin/') && !page.includes('/register/thanks/'),
    }),
  ],
});
