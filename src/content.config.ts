import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/** A string per site language. Add a key here when a language is added. */
const localized = z.object({ en: z.string(), fi: z.string() });

// Invited key players and streamers. One YAML file per person in src/content/guests/.
const guests = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/guests' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      kind: z.enum(['gm', 'streamer']),
      /** FIDE title, shown before the name, e.g. "GM". */
      title: z.string().optional(),
      federation: z.string().length(3).optional(),
      fideId: z.number().int().optional(),
      /** Current FIDE standard rating and the rating list month it comes from, e.g. { value: 2594, month: '2026-10' }. */
      rating: z.object({ value: z.number().int(), month: z.string().regex(/^\d{4}-\d{2}$/) }).optional(),
      /** Highest FIDE rating ever reached (does not go stale, unlike the current rating). */
      peakRating: z.number().int().optional(),
      photo: image().optional(),
      photoAlt: localized.optional(),
      /** Author and licence, e.g. "Jane Doe, CC BY-SA 4.0". Required by most Commons licences. */
      photoCredit: z.string().optional(),
      /** Page the photo came from (Wikimedia Commons file page). */
      photoSourceUrl: z.url().optional(),
      /** CSS object-position for cropping portraits, e.g. "50% 20%". */
      photoPosition: z.string().optional(),
      tagline: localized.optional(),
      bio: localized,
      links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
      /** Lower numbers are shown first. */
      order: z.number().default(100),
      /** True for dummy entries that must be replaced before launch. */
      placeholder: z.boolean().default(false),
    }),
});

// News articles: src/content/news/<lang>/<slug>.md. The same slug in each language links them.
const news = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    placeholder: z.boolean().default(false),
  }),
});

const faq = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/faq' }),
  schema: z.object({
    question: localized,
    answer: localized,
    order: z.number().default(100),
  }),
});

const sideEvents = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/side-events' }),
  schema: z.object({
    title: localized,
    description: localized,
    when: localized.optional(),
    entryFee: localized.optional(),
    order: z.number().default(100),
    placeholder: z.boolean().default(false),
  }),
});

// Competition regulations: one Markdown file per language (en.md, fi.md).
const regulations = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/regulations' }),
  schema: z.object({ title: z.string(), preliminary: z.boolean().default(false) }),
});

// Privacy policy: one Markdown file per language (en.md, fi.md).
const privacy = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/privacy' }),
  schema: z.object({ title: z.string(), updated: z.string(), draft: z.boolean().default(true) }),
});

export const collections = { guests, news, faq, sideEvents, regulations, privacy };
