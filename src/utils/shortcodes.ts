export type ContentSegment =
  | { type: 'markdown'; content: string }
  | { type: 'player'; fotmobId: string }
  | { type: 'compare'; id1: string; id2: string };

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const SHORTCODE_REGEX = /\{\{(player|compare):([^}]+)\}\}/g;

export function parseArticleShortcodes(markdown: string): ContentSegment[] {
  if (!markdown) return [];

  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(SHORTCODE_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = markdown.slice(lastIndex, match.index).trim();
      if (textChunk) {
        segments.push({ type: 'markdown', content: textChunk });
      }
    }

    const kind = match[1];
    const payload = match[2].trim();

    if (kind === 'player' && payload) {
      segments.push({ type: 'player', fotmobId: payload });
    } else if (kind === 'compare') {
      const parts = payload
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        segments.push({ type: 'compare', id1: parts[0], id2: parts[1] });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    const tail = markdown.slice(lastIndex).trim();
    if (tail) {
      segments.push({ type: 'markdown', content: tail });
    }
  }

  return segments;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractTableOfContents(markdown: string): TocHeading[] {
  if (!markdown) return [];
  const headings: TocHeading[] = [];
  const lines = markdown.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('### ')) {
      const text = line.slice(4).trim();
      if (text) {
        headings.push({ id: slugifyHeading(text), text, level: 3 });
      }
    } else if (line.startsWith('## ')) {
      const text = line.slice(3).trim();
      if (text) {
        headings.push({ id: slugifyHeading(text), text, level: 2 });
      }
    }
  }

  return headings;
}

export function estimateReadingTimeMinutes(markdown: string): number {
  if (!markdown) return 1;
  const cleaned = markdown.replace(SHORTCODE_REGEX, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}
