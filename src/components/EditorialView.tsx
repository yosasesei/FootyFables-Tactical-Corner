import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BookOpen,
  Clock,
  GitCompare,
  UserCheck,
} from 'lucide-react';
import type { Article, ArticleCategory, Player } from '../types/footy';
import { formatMarketValue } from '../utils/analytics';
import {
  estimateReadingTimeMinutes,
  extractTableOfContents,
  parseArticleShortcodes,
  slugifyHeading,
} from '../utils/shortcodes';
import { PlayerAvatar } from './PlayerAvatar';

interface EditorialViewProps {
  articles: Article[];
  players: Player[];
  onOpenPlayer: (player: Player) => void;
  onOpenCompare: (playerIds: string[]) => void;
  onNavigateTransfers: () => void;
}

const CATEGORIES: Array<'Semua' | ArticleCategory> = [
  'Semua',
  'Bedah Taktik',
  'Analisa Pemain',
  'Market Value',
  'Kecocokan Tim & Pelatih',
];

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return (
        <em key={idx} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    return token;
  });
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul
          key={`${keyPrefix}-list`}
          className="my-4 space-y-2 list-disc pl-5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300"
        >
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`empty-${idx}`);
      return;
    }
    if (line.startsWith('## ')) {
      flushList(`h2-${idx}`);
      const title = line.slice(3).trim();
      elements.push(
        <h2
          key={`h2-${idx}`}
          id={slugifyHeading(title)}
          className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-50 mt-8 mb-3 scroll-mt-24 text-balance"
        >
          {title}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList(`h3-${idx}`);
      const title = line.slice(4).trim();
      elements.push(
        <h3
          key={`h3-${idx}`}
          id={slugifyHeading(title)}
          className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 mt-6 mb-2 scroll-mt-24"
        >
          {title}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      flushList(`quote-${idx}`);
      elements.push(
        <blockquote
          key={`quote-${idx}`}
          className="my-6 py-4 px-2 border-y border-slate-200 dark:border-slate-800 font-display italic text-lg text-slate-700 dark:text-slate-200"
        >
          {renderInlineMarkdown(line.slice(2).trim())}
        </blockquote>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2).trim());
    } else {
      flushList(`p-${idx}`);
      elements.push(
        <p
          key={`p-${idx}`}
          className="my-4 text-[15px] sm:text-base leading-[1.75] text-slate-700 dark:text-slate-300"
        >
          {renderInlineMarkdown(line)}
        </p>
      );
    }
  });

  flushList('end');
  return <>{elements}</>;
}

export function EditorialView({
  articles,
  players,
  onOpenPlayer,
  onOpenCompare,
  onNavigateTransfers,
}: EditorialViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | ArticleCategory>('Semua');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'Semua') return articles;
    return articles.filter((a) => a.category === selectedCategory);
  }, [articles, selectedCategory]);

  const activeArticle = useMemo(
    () => articles.find((a) => a.id === activeArticleId) ?? null,
    [articles, activeArticleId]
  );

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) {
      map.set(p.fotmobId, p);
    }
    return map;
  }, [players]);

  if (activeArticle) {
    const toc = extractTableOfContents(activeArticle.content);
    const segments = parseArticleShortcodes(activeArticle.content);
    const readMinutes = estimateReadingTimeMinutes(activeArticle.content);

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button
          type="button"
          onClick={() => setActiveArticleId(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Indeks Editorial
        </button>

        <article className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Main Article Column */}
          <div className="lg:col-span-8">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
              <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                {activeArticle.category}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeArticle.publishedAt}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono-num">
                <Clock className="w-3.5 h-3.5" />
                {readMinutes} menit baca
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeArticle.formationTag}</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-semibold leading-[1.15] text-slate-900 dark:text-slate-50 text-balance">
              {activeArticle.title}
            </h1>

            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
              {activeArticle.subtitle}
            </p>

            <div className="mt-5 pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335] flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span>Ditulis oleh {activeArticle.author}</span>
              <span>{activeArticle.tags.join(' · ')}</span>
            </div>

            {activeArticle.coverImage && (
              <figure className="my-7 overflow-hidden rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-slate-100 dark:bg-slate-900">
                <img
                  src={activeArticle.coverImage}
                  alt={activeArticle.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-64 sm:h-80 object-cover"
                />
              </figure>
            )}

            <div className="max-w-prose">
              {segments.map((seg, index) => {
                if (seg.type === 'markdown') {
                  return <MarkdownBlock key={index} markdown={seg.content} />;
                }

                if (seg.type === 'player') {
                  const player = playerMap.get(seg.fotmobId);
                  if (!player) {
                    return (
                      <div
                        key={index}
                        className="my-6 p-4 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] text-sm text-slate-500"
                      >
                        Profil pemain ID {seg.fotmobId} belum tersedia di cache lokal.
                      </div>
                    );
                  }

                  return (
                    <div
                      key={index}
                      className="my-7 p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <PlayerAvatar fotmobId={player.fotmobId} name={player.name} size="lg" />
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {player.club} · {player.primaryPosition} · {player.age} thn
                          </div>
                          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                            {player.name}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            {player.roleTag}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 sm:text-right">
                        <div>
                          <div className="text-[11px] text-slate-500">FotMob Rating</div>
                          <div className="font-mono-num text-lg font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                            {player.stats.rating.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Market Value</div>
                          <div className="font-mono-num text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {formatMarketValue(player.marketValueEur)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenPlayer(player)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors whitespace-nowrap shrink-0"
                        >
                          Buka Profil
                        </button>
                      </div>
                    </div>
                  );
                }

                // Compare Shortcode
                const p1 = playerMap.get(seg.id1);
                const p2 = playerMap.get(seg.id2);
                if (!p1 || !p2) return null;

                return (
                  <div
                    key={index}
                    className="my-7 p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]"
                  >
                    <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#DCE8E6] dark:border-[#1B3335]">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <GitCompare className="w-4 h-4 text-emerald-500" />
                        Perbandingan Head-to-Head
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenCompare([p1.fotmobId, p2.fotmobId])}
                        className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] hover:underline whitespace-nowrap"
                      >
                        Buka di Comparison Lab →
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                      {[p1, p2].map((pl, idx) => (
                        <div
                          key={pl.fotmobId}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar fotmobId={pl.fotmobId} name={pl.name} size="md" />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenPlayer(pl)}
                                className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 truncate block text-left"
                              >
                                {pl.name}
                              </button>
                              <div className="text-xs text-slate-500 truncate">
                                {pl.club} · {pl.primaryPosition}
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono-num shrink-0">
                            <div
                              className={`text-sm font-semibold ${
                                idx === 0
                                  ? 'text-[#136F73] dark:text-[#2DD4BF]'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {pl.stats.rating.toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {pl.stats.goals}G · {pl.stats.assists}A
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <div>
                        <div className="text-slate-500 mb-1">Key Passes / 90</div>
                        <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                          {p1.stats.keyPassesPer90.toFixed(2)} vs {p2.stats.keyPassesPer90.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Prog. Carries / 90</div>
                        <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                          {p1.stats.progressiveCarriesPer90.toFixed(2)} vs{' '}
                          {p2.stats.progressiveCarriesPer90.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Market Value</div>
                        <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                          {formatMarketValue(p1.marketValueEur)} vs{' '}
                          {formatMarketValue(p2.marketValueEur)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Margin Sidebar: TOC + Context */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="lg:sticky lg:top-24 space-y-6">
              {toc.length > 0 && (
                <div className="p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100 mb-3">
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    Daftar Isi Artikel
                  </div>
                  <nav aria-label="Daftar isi" className="space-y-2">
                    {toc.map((heading) => (
                      <a
                        key={heading.id}
                        href={`#${heading.id}`}
                        className={`block text-xs hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors ${
                          heading.level === 3
                            ? 'pl-3 text-slate-500 dark:text-slate-400'
                            : 'font-medium text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {heading.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              <div className="p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Bacaan Terkait
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {articles
                    .filter((a) => a.id !== activeArticle.id)
                    .slice(0, 3)
                    .map((rel) => (
                      <button
                        key={rel.id}
                        type="button"
                        onClick={() => setActiveArticleId(rel.id)}
                        className="w-full py-3 text-left group"
                      >
                        <div className="text-[11px] text-slate-500">{rel.category}</div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 mt-0.5">
                          {rel.title}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </aside>
        </article>
      </div>
    );
  }

  const leadArticle = filteredArticles.find((a) => a.featured) || filteredArticles[0];
  const secondaryArticles = filteredArticles.filter((a) => a.id !== leadArticle?.id);

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Editorial Header + Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <div>
          <p className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] mb-2">
            Publikasi Analitik &amp; Riset Sepak Bola
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-50 text-balance">
            Bedah Taktik, Data Performa, dan Valuasi Pasar Global
          </h1>
        </div>

        <button
          type="button"
          onClick={onNavigateTransfers}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1E20] text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500" />
          Buka Live Transfer Market Ticker
        </button>
      </div>

      {/* Interactive Category Segmented Filter */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#E4EFED] dark:bg-[#0D1A1C] border border-[#D4E3E0] dark:border-[#1B3335] w-fit">
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#136F73] text-white shadow-sm'
                  : 'text-[#486563] dark:text-[#8FB3B0] hover:text-[#132928] dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Lead Story (2-column balanced split) */}
      {leadArticle && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] overflow-hidden">
          <div className="lg:col-span-7 min-h-[260px] lg:min-h-[380px] bg-slate-900 relative overflow-hidden">
            <img
              src={leadArticle.coverImage}
              alt={leadArticle.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                  {leadArticle.category}
                </span>
                <span aria-hidden="true">·</span>
                <span>{leadArticle.publishedAt}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">
                  {estimateReadingTimeMinutes(leadArticle.content)} min
                </span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-snug text-slate-900 dark:text-slate-50 text-balance">
                {leadArticle.title}
              </h2>

              <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                {leadArticle.subtitle}
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {leadArticle.formationTag}
              </span>
              <button
                type="button"
                onClick={() => setActiveArticleId(leadArticle.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors whitespace-nowrap shrink-0"
              >
                Baca Analisis
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Secondary Editorial Grid */}
      {secondaryArticles.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {secondaryArticles.map((art) => (
            <article
              key={art.id}
              className="rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="h-44 bg-slate-900 overflow-hidden">
                  <img
                    src={art.coverImage}
                    alt={art.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                      {art.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">
                      {estimateReadingTimeMinutes(art.content)} min
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{art.publishedAt}</span>
                  </div>
                  <h3 className="font-display text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
                    {art.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                    {art.subtitle}
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 truncate">{art.author}</span>
                <button
                  type="button"
                  onClick={() => setActiveArticleId(art.id)}
                  className="text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF] hover:underline whitespace-nowrap shrink-0"
                >
                  Baca Selengkapnya →
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Spotlight Player Bar below editorial grid */}
      <section className="pt-4 border-t border-[#DCE8E6] dark:border-[#1B3335]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            Radar Pemain Unggulan Minggu Ini
          </h2>
          <span className="text-xs text-slate-500">Klik kartu untuk membuka Deep Profile</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {players.slice(0, 4).map((p) => (
            <button
              key={p.fotmobId}
              type="button"
              onClick={() => onOpenPlayer(p)}
              className="p-4 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] hover:border-emerald-500/60 transition-colors text-left flex items-center gap-3.5"
            >
              <PlayerAvatar fotmobId={p.fotmobId} name={p.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {p.name}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {p.club} · {p.primaryPosition}
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono-num text-xs">
                  <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                    {p.stats.rating.toFixed(2)}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatMarketValue(p.marketValueEur)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
