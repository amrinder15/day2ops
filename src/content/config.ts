import { defineCollection, z } from 'astro:content';
import { SITE_OWNER } from '../lib/site';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    author: z.string().default(SITE_OWNER.name),
    readingTime: z.number().optional(),
  }),
});

export const collections = { posts };
