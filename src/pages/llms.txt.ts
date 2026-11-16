// /llms.txt: a short, plain-text summary of the site for AI assistants and crawlers (see https://llmstxt.org).
// Everything is generated from the same data the pages use, so prices, dates and guests cannot go out of date.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { bands, busTransfer, festival, rules, formatEuro } from '../data/fees';
import { schedule, venue } from '../data/schedule';
import { site } from '../data/site';
import { localePath, messages, type Locale } from '../i18n/utils';
import { titleLabel } from '../lib/titles';

const en = messages.en;
const url = (lang: Locale, path: string) => new URL(localePath(lang, path), site.url).href;
const fee = (n: number) => (n === 0 ? 'free' : formatEuro(n));

const pages: { path: string; title: string; about: string }[] = [
  { path: '/main-event/', title: en.nav.mainEvent, about: 'Format, schedule, time control and the full competition regulations.' },
  { path: '/register/', title: en.nav.register, about: 'Online registration and payment, and the entry fee table.' },
  { path: '/players/', title: en.nav.players, about: en.meta.pages.players },
  { path: '/guests/', title: en.nav.guests, about: en.meta.pages.guests },
  { path: '/prizes/', title: en.nav.prizes, about: en.prizes.lead },
  { path: '/side-events/', title: en.nav.sideEvents, about: en.meta.pages.sideEvents },
  { path: '/travel/', title: en.nav.travel, about: en.travel.lead },
  { path: '/news/', title: en.nav.news, about: en.meta.pages.news },
  { path: '/faq/', title: en.nav.faq, about: en.meta.pages.faq },
  { path: '/broadcast/', title: en.nav.broadcast, about: en.meta.pages.broadcast },
  { path: '/contact/', title: en.nav.contact, about: en.contact.lead },
  { path: '/privacy/', title: en.nav.privacy, about: en.meta.pages.privacy },
];

export const GET: APIRoute = async () => {
  const guests = (await getCollection('guests'))
    .filter((g) => !g.data.placeholder)
    .sort((a, b) => a.data.order - b.data.order);
  const rounds = schedule.filter((i) => i.kind === 'round');
  const paying = bands.filter((b) => b.regular > 0);

  const lines = [
    `# ${festival.name} ${festival.year}`,
    '',
    `> ${en.meta.description}`,
    '',
    `The ${festival.name} is an international open chess tournament and festival in ${venue.city}, ${venue.country}, from 12 to 20 June ${festival.year}. It is organised by ${site.organiser}. The site is available in English and Finnish (the Finnish pages are under /fi/).`,
    '',
    '## Key facts',
    '',
    `- Dates: 12–20 June ${festival.year} (${festival.rounds} rounds, one per day; round 1 on ${rounds[0].date} at ${rounds[0].time}, round ${rounds.length} on ${rounds[rounds.length - 1].date} at ${rounds[rounds.length - 1].time}, local Finnish time)`,
    `- Venue: ${venue.name}, ${venue.street}, ${venue.city}, ${venue.country}`,
    `- Format: ${en.mainEvent.values.format}`,
    `- Time control: ${en.mainEvent.values.timeControl}`,
    `- Pairings: ${en.mainEvent.values.pairings}`,
    `- Prize pool: ${en.mainEvent.values.prizePool}`,
    `- Contact: ${site.email}`,
    '',
    '## Entry fees (euros)',
    '',
    `Entry fees depend on the player's FIDE rating on the day of payment. The discounted fee (20 % off, rounded down to 5 €) applies to everyone who pays by ${rules.earlyBirdDeadline} (early bird), and to juniors (born ${rules.juniorBornFrom} or later) and seniors (born ${rules.seniorBornUntil} or earlier). Discounts do not stack. Grandmasters (GM, WGM) play free.`,
    '',
    ...paying.map((b) => `- ${b.label}: regular ${fee(b.regular)}, discounted ${fee(b.discounted)}`),
    '- GM / WGM: free',
    `- Optional daily bus transfer between central Tampere and the venue, return trips included: ${formatEuro(busTransfer.price)}`,
    `- Withdrawals up to ${rules.refundDaysBefore} days before the start (until ${rules.refundDeadline}) are refunded ${rules.refundPercent} %.`,
    '',
    '## Pages',
    '',
    ...pages.map((p) => `- [${p.title}](${url('en', p.path)}): ${p.about}`),
    '',
    '## Guests',
    '',
    ...guests.map((g) => `- [${g.data.title ? titleLabel('en', g.data.title) + ' ' : ''}${g.data.name}](${url('en', `/guests/${g.id}/`)})${g.data.tagline ? `: ${g.data.tagline.en}` : ''}`),
    '',
    '## Finnish',
    '',
    `- [Etusivu (suomeksi)](${url('fi', '/')}): the same site in Finnish. Every page has a Finnish version at the same address with /fi/ in front.`,
    '',
    '## Optional',
    '',
    `- [Sitemap](${new URL('/sitemap-index.xml', site.url).href})`,
    '',
  ];

  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
