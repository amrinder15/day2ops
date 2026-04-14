import { defineCollection, z } from 'astro:content';

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
    heroImageFit: z.enum(['cover', 'contain']).optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    author: z.string().default('Day2Ops'),
    readingTime: z.number().optional(),
  }),
});

export const collections = { posts };
