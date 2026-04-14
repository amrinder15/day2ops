// src/lib/utils.ts

/** Format a date as "Nov 14, 2024" */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Format as ISO date string YYYY-MM-DD */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calculate approximate read time (words / 200 wpm) */
export function calcReadTime(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** Sort posts newest-first, exclude drafts */
export function sortedPosts<T extends { data: { date: Date; draft?: boolean } }>(
  posts: T[],
  includeDrafts = false,
): T[] {
  return posts
    .filter(p => includeDrafts || !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Collect unique tags with counts */
export function allTags<T extends { data: { tags: string[] } }>(
  posts: T[],
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  posts.forEach(p => p.data.tags.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** Slugify a heading for TOC anchors */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
