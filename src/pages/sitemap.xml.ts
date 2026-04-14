import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

const DEFAULT_SITE_URL = 'https://day2ops.dev';

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const createUrlEntry = (site: URL, pathname: string, lastModified?: Date) => {
  const url = new URL(pathname, site).href;
  const lastmod = lastModified ? `<lastmod>${lastModified.toISOString()}</lastmod>` : '';

  return `<url><loc>${escapeXml(url)}</loc>${lastmod}</url>`;
};

export async function GET(context: APIContext) {
  const site = context.site ?? new URL(DEFAULT_SITE_URL);
  const posts = await getCollection('posts', (entry) => !entry.data.draft);
  const sortedPosts = posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  const tags = [...new Set(sortedPosts.flatMap((post) => post.data.tags))].sort();
  const latestPostDate = sortedPosts[0]?.data.date;

  const staticEntries = [
    createUrlEntry(site, '/', latestPostDate),
    createUrlEntry(site, '/blog/', latestPostDate),
    createUrlEntry(site, '/tags/', latestPostDate),
  ];

  const postEntries = sortedPosts.map((post) =>
    createUrlEntry(site, `/blog/${post.slug}/`, post.data.date)
  );

  const tagEntries = tags.map((tag) => {
    const tagPosts = sortedPosts.filter((post) => post.data.tags.includes(tag));
    return createUrlEntry(site, `/tags/${tag}/`, tagPosts[0]?.data.date);
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...postEntries, ...tagEntries].join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}