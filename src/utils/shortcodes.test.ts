import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateReadingTimeMinutes,
  extractTableOfContents,
  parseArticleShortcodes,
  slugifyHeading,
} from './shortcodes';

test('parseArticleShortcodes parses player and compare shortcodes in order', () => {
  const md = `
## Pembuka Taktik

Teks awal artikel.

{{player:675088}}

Analisis tengah.

{{compare:1467236, 934235}}

Penutup.
  `.trim();

  const segments = parseArticleShortcodes(md);
  assert.equal(segments.length, 5);
  assert.equal(segments[0].type, 'markdown');
  assert.deepEqual(segments[1], { type: 'player', fotmobId: '675088' });
  assert.equal(segments[2].type, 'markdown');
  assert.deepEqual(segments[3], { type: 'compare', id1: '1467236', id2: '934235' });
  assert.equal(segments[4].type, 'markdown');
});

test('extractTableOfContents captures h2 and h3 headings with clean slugs', () => {
  const md = `
## Fase Build-Up 3-2-4-1
Paragraf satu.
### Peran Inverted Fullback
Detail.
## Transisi Bertahan
`;
  const toc = extractTableOfContents(md);
  assert.equal(toc.length, 3);
  assert.deepEqual(toc[0], {
    id: 'fase-build-up-3-2-4-1',
    text: 'Fase Build-Up 3-2-4-1',
    level: 2,
  });
  assert.deepEqual(toc[1], {
    id: 'peran-inverted-fullback',
    text: 'Peran Inverted Fullback',
    level: 3,
  });
  assert.equal(slugifyHeading('High Press & Rest Defense!'), 'high-press-rest-defense');
});

test('estimateReadingTimeMinutes ignores shortcode syntax and returns >= 1', () => {
  const shortText = '{{player:675088}}';
  assert.equal(estimateReadingTimeMinutes(shortText), 1);

  const longWords = Array.from({ length: 400 }, () => 'taktik').join(' ');
  assert.equal(estimateReadingTimeMinutes(longWords), 3);
});
