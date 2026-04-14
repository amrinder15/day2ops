# Day2Ops

Day2Ops is an Astro-based blog focused on Kubernetes, GitOps, SRE, observability, and the operational work that starts after launch day.

## Stack

- Astro
- MD / MDX content collections
- Tailwind CSS

## Local development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run dev
npm run build
npm run preview
```

## Project structure

- `src/content/posts/`: blog posts that are published through the `posts` content collection
- `src/pages/blog/`: blog listing and individual post routes
- `public/images/`: images referenced by posts and site content
- `src/components/`, `src/layouts/`, `src/styles/`: UI building blocks and styling

## How to add a new blog post

Create a new Markdown or MDX file in `src/content/posts/`.

Example:

```text
src/content/posts/my-new-post.md
```

Use frontmatter that matches the content schema:

```md
---
title: "My New Post"
description: "A short summary used for cards and SEO."
date: 2026-04-14
updatedDate: 2026-04-14
tags: ["kubernetes", "gitops", "sre"]
heroImage: "/images/my-post-hero.png"
heroImageAlt: "Describe the image for accessibility"
draft: false
featured: false
author: "Amrinder Rattanpal"
readingTime: 8
---

Write your post here.
```

Required fields:

- `title`
- `description`
- `date`

Common optional fields:

- `updatedDate`
- `tags`
- `heroImage`
- `heroImageAlt`
- `draft`
- `featured`
- `author`
- `readingTime`

Publishing notes:

- Posts with `draft: true` are excluded from the generated blog pages.
- The post URL is generated from the file name, so `src/content/posts/my-new-post.md` becomes `/blog/my-new-post`.
- Store post images in `public/images/` and reference them with paths like `/images/example.png`.
- Use `.md` for regular posts and `.mdx` if you need embedded components or richer content.

## Build

To verify the site builds correctly:

```bash
npm run build
```