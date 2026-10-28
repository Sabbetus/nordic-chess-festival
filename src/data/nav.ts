import type { Messages } from '../i18n/en';

export type NavKey = keyof Messages['nav'];
export interface NavItem {
  key: NavKey;
  path: string;
}

/** Shown in the header (the entry fees page is the header call to action). */
export const headerNav: NavItem[] = [
  { key: 'mainEvent', path: '/main-event/' },
  { key: 'players', path: '/players/' },
  { key: 'guests', path: '/guests/' },
  { key: 'prizes', path: '/prizes/' },
  { key: 'sideEvents', path: '/side-events/' },
  { key: 'travel', path: '/travel/' },
  { key: 'news', path: '/news/' },
];

export const registerItem: NavItem = { key: 'register', path: '/register/' };

/** Footer link groups. */
export const footerGroups: { title: 'mainEvent' | 'info'; items: NavItem[] }[] = [
  {
    title: 'mainEvent',
    items: [
      { key: 'mainEvent', path: '/main-event/' },
      { key: 'register', path: '/register/#fees' },
      { key: 'players', path: '/players/' },
      { key: 'guests', path: '/guests/' },
      { key: 'prizes', path: '/prizes/' },
      { key: 'sideEvents', path: '/side-events/' },
    ],
  },
  {
    title: 'info',
    items: [
      { key: 'travel', path: '/travel/' },
      { key: 'news', path: '/news/' },
      { key: 'faq', path: '/faq/' },
      { key: 'live', path: '/live/' },
      { key: 'contact', path: '/contact/' },
      { key: 'privacy', path: '/privacy/' },
    ],
  },
];
