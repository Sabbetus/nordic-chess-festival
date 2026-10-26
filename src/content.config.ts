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
      rating: z.number().int().optional(),
      photo: image().optional(),
      photoAlt: localized.optional(),
      photoCredit: z.string().optional(),
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

export const collections = { guests, news, faq, sideEvents };
