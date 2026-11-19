import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  FileText,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Users,
  X,
} from 'lucide-react';
import {
  forceRefreshPlayerCache,
  getAdminPin,
  getGasApiUrl,
  saveArticle,
  saveManager,
  setAdminPin,
  setGasApiUrl,
} from '../services/gasApi';
import {
  clearExternalSourcesCache,
  getExternalSourcesConfig,
  setExternalSourcesConfig,
  testTmScraperConnection,
} from '../services/externalSources';
import type {
  Article,
  ArticleCategory,
  Player,
  TeamManagerProfile,
} from '../types/footy';
import { formatMarketValue } from '../utils/analytics';

interface AdminStudioModalProps {
  open: boolean;
  onClose: () => void;
  articles: Article[];
  managers: TeamManagerProfile[];
  players: Player[];
  onArticlesUpdated: (next: Article[]) => void;
  onManagersUpdated: (next: TeamManagerProfile[]) => void;
  onPlayersRefreshed: () => void;
}

export function AdminStudioModal({
  open,
  onClose,
  articles,
  managers,
  players,
  onArticlesUpdated,
  onManagersUpdated,
  onPlayersRefreshed,
}: AdminStudioModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [activeTab, setActiveTab] = useState<'articles' | 'managers' | 'settings'>('articles');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Tab 1: Article Composer State
  const [editingArticleId, setEditingArticleId] = useState<string>('new');
  const [artTitle, setArtTitle] = useState('');
  const [artSubtitle, setArtSubtitle] = useState('');
  const [artCategory, setArtCategory] = useState<ArticleCategory>('Bedah Taktik');
  const [artFormation, setArtFormation] = useState('4-3-3 Holding');
  const [artTags, setArtTags] = useState('Taktik, Progresi, Analisis');
  const [artContent, setArtContent] = useState(
    '## Analisis Struktur Utama\n\nTuliskan bedah taktik mendalam Anda di sini.\n\n'
  );
  const [shortcodeSearch, setShortcodeSearch] = useState('');
  const [showShortcodePicker, setShowShortcodePicker] = useState(false);
  const [comparePickIds, setComparePickIds] = useState<string[]>([]);

  // Tab 2: Manager Editor State
  const [selectedMgrId, setSelectedMgrId] = useState<string>(managers[0]?.id || 'new');
  const [mgrName, setMgrName] = useState(managers[0]?.managerName || '');
  const [mgrClub, setMgrClub] = useState(managers[0]?.clubName || '');
  const [mgrLeague, setMgrLeague] = useState(managers[0]?.league || 'Premier League');
  const [mgrFormation, setMgrFormation] = useState(managers[0]?.primaryFormation || '4-3-3');
  const [mgrPressing, setMgrPressing] = useState(managers[0]?.pressingIntensity ?? 82);
  const [mgrPossession, setMgrPossession] = useState(managers[0]?.possessionFocus ?? 80);
  const [mgrTransition, setMgrTransition] = useState(managers[0]?.transitionSpeed ?? 75);
  const [mgrBuildUp, setMgrBuildUp] = useState(managers[0]?.buildUpStyle ?? 80);
  const [mgrDefLine, setMgrDefLine] = useState(managers[0]?.defensiveLine ?? 78);
  const [mgrAerial, setMgrAerial] = useState(managers[0]?.aerialPhysicality ?? 70);
  const [mgrSummary, setMgrSummary] = useState(managers[0]?.tacticalSummary || '');

  // Tab 3: API & Cache Settings
  const initialExtCfg = getExternalSourcesConfig();
  const [gasUrlInput, setGasUrlInput] = useState(() => getGasApiUrl());
  const [tmScraperUrlInput, setTmScraperUrlInput] = useState(() => initialExtCfg.tmScraperUrl);
  const [enableOptaInput, setEnableOptaInput] = useState(() => initialExtCfg.enableOptaFeed);
  const [enableSalimtInput, setEnableSalimtInput] = useState(() => initialExtCfg.enableSalimtDataset);
  const [testingScraper, setTestingScraper] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredShortcodePlayers = useMemo(() => {
    const q = shortcodeSearch.trim().toLowerCase();
    return players.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.club.toLowerCase().includes(q) ||
        p.primaryPosition.toLowerCase().includes(q)
    );
  }, [players, shortcodeSearch]);

  if (!open) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === getAdminPin()) {
      setUnlocked(true);
      setPinError('');
    } else {
      setPinError('PIN Admin tidak valid. Default PIN awal adalah 2026.');
    }
  };

  const handleSelectArticleToEdit = (id: string) => {
    setEditingArticleId(id);
    if (id === 'new') {
      setArtTitle('');
      setArtSubtitle('');
      setArtCategory('Bedah Taktik');
      setArtFormation('4-3-3 Holding');
      setArtTags('Taktik, Analisis');
      setArtContent('## Pendahuluan\n\n');
      return;
    }
    const found = articles.find((a) => a.id === id);
    if (found) {
      setArtTitle(found.title);
      setArtSubtitle(found.subtitle);
      setArtCategory(found.category);
      setArtFormation(found.formationTag);
      setArtTags(found.tags.join(', '));
      setArtContent(found.content);
    }
  };

  const handleInsertPlayerShortcode = (player: Player) => {
    setArtContent((prev) => `${prev.trimEnd()}\n\n{{player:${player.fotmobId}}}\n\n`);
    setShowShortcodePicker(false);
    setShortcodeSearch('');
  };

  const handleToggleComparePick = (fotmobId: string) => {
    if (comparePickIds.includes(fotmobId)) {
      setComparePickIds((prev) => prev.filter((id) => id !== fotmobId));
      return;
    }
    const next = [...comparePickIds, fotmobId];
    if (next.length === 2) {
      setArtContent((prev) => `${prev.trimEnd()}\n\n{{compare:${next[0]},${next[1]}}}\n\n`);
      setComparePickIds([]);
      setShowShortcodePicker(false);
    } else {
      setComparePickIds(next);
    }
  };

  const handlePublishArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artTitle.trim() || !artContent.trim()) {
      setStatusNotice('Judul dan isi artikel Markdown wajib diisi.');
      return;
    }

    const article: Article = {
      id: editingArticleId === 'new' ? `art-${Date.now()}` : editingArticleId,
      slug: artTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-'),
      title: artTitle.trim(),
      subtitle:
        artSubtitle.trim() || 'Analisis taktik terbaru dari ruang redaksi FootyFables.',
      category: artCategory,
      author: 'Studio Admin FootyFables',
      publishedAt: new Date().toISOString().slice(0, 10),
      coverImage: '/src/assets/images/hero_tactical_pitch_1795072887296.jpg',
      formationTag: artFormation.trim() || '4-3-3',
      tags: artTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      content: artContent,
    };

    const res = await saveArticle(article);
    onArticlesUpdated(res.articles);
    setEditingArticleId(article.id);
    setStatusNotice(
      res.syncedToSheets
        ? 'Artikel dipublikasikan dan disinkronkan ke Google Sheets.'
        : 'Artikel tersimpan di aplikasi (hubungankan GAS_API_URL untuk sinkronisasi Google Sheets).'
    );
  };

  const handleLoadManager = (id: string) => {
    setSelectedMgrId(id);
    if (id === 'new') {
      setMgrName('');
      setMgrClub('');
      setMgrLeague('Premier League');
      setMgrFormation('4-3-3');
      setMgrPressing(80);
      setMgrPossession(75);
      setMgrTransition(75);
      setMgrBuildUp(78);
      setMgrDefLine(75);
      setMgrAerial(70);
      setMgrSummary('');
      return;
    }
    const found = managers.find((m) => m.id === id);
    if (found) {
      setMgrName(found.managerName);
      setMgrClub(found.clubName);
      setMgrLeague(found.league);
      setMgrFormation(found.primaryFormation);
      setMgrPressing(found.pressingIntensity);
      setMgrPossession(found.possessionFocus);
      setMgrTransition(found.transitionSpeed);
      setMgrBuildUp(found.buildUpStyle);
      setMgrDefLine(found.defensiveLine);
      setMgrAerial(found.aerialPhysicality);
      setMgrSummary(found.tacticalSummary);
    }
  };

  const handleSaveManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgrName.trim() || !mgrClub.trim()) {
      setStatusNotice('Nama pelatih dan klub wajib diisi.');
      return;
    }

    const mgr: TeamManagerProfile = {
      id: selectedMgrId === 'new' ? `mgr-${Date.now()}` : selectedMgrId,
      managerName: mgrName.trim(),
      clubName: mgrClub.trim(),
      league: mgrLeague.trim() || 'Top League',
      primaryFormation: mgrFormation.trim() || '4-3-3',
      pressingIntensity: Number(mgrPressing),
      possessionFocus: Number(mgrPossession),
      transitionSpeed: Number(mgrTransition),
      buildUpStyle: Number(mgrBuildUp),
      defensiveLine: Number(mgrDefLine),
      aerialPhysicality: Number(mgrAerial),
      tacticalSummary: mgrSummary.trim() || 'Profil filosofi taktik terstruktur.',
    };

    const res = await saveManager(mgr);
    onManagersUpdated(res.managers);
    setSelectedMgrId(mgr.id);
    setStatusNotice(
      res.syncedToSheets
        ? 'Profil Teams_Managers disimpan ke Google Sheets.'
        : 'Profil pelatih diperbarui di penyimpanan lokal.'
    );
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setGasApiUrl(gasUrlInput);
    setExternalSourcesConfig({
      tmScraperUrl: tmScraperUrlInput,
      enableOptaFeed: enableOptaInput,
      enableSalimtDataset: enableSalimtInput,
    });
    clearExternalSourcesCache();
    if (newPinInput.trim().length >= 4) {
      setAdminPin(newPinInput.trim());
      setNewPinInput('');
    }
    setStatusNotice(
      'Konfigurasi GAS_API_URL, Transfermarkt Scraper, Opta Feed, dan salimt/football-datasets disimpan.'
    );
  };

  const handleTestTmScraper = async () => {
    setTestingScraper(true);
    const res = await testTmScraperConnection(tmScraperUrlInput);
    setTestingScraper(false);
    setStatusNotice(res.message);
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    const res = await forceRefreshPlayerCache();
    onPlayersRefreshed();
    setRefreshing(false);
    setStatusNotice(
      `Cache pemain diperbarui (${res.refreshedCount} pemain). ${
        res.syncedToSheets ? 'Sinkronisasi Sheets aktif.' : 'Mode cache lokal aktif.'
      }`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Studio Admin dan CMS FootyFables"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Bar */}
        <div className="px-6 py-4 border-b border-[#DCE8E6] dark:border-[#1B3335] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-emerald-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Studio Admin &amp; CMS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Studio Admin"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!unlocked ? (
          <form onSubmit={handleUnlock} className="p-8 max-w-md mx-auto w-full space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-50">
                Autentikasi PIN Admin
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Masukkan PIN untuk mengakses editor artikel, database pelatih, dan pengaturan
                GAS_API_URL. (Default: 2026)
              </p>
            </div>

            <div>
              <label
                htmlFor="admin-pin-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                PIN Akses
              </label>
              <input
                id="admin-pin-input"
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono-num text-center tracking-widest focus:outline-none focus:border-emerald-500"
              />
            </div>

            {pinError && (
              <p className="text-xs text-rose-500 text-center" role="alert">
                {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors"
            >
              Buka Studio Admin
            </button>
          </form>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Tabs */}
            <div className="px-6 pt-3 border-b border-[#DCE8E6] dark:border-[#1B3335] flex flex-wrap gap-2">
              {[
                { id: 'articles', label: 'Tulis / Edit Artikel', icon: FileText },
                { id: 'managers', label: 'Profil Tim & Pelatih', icon: Users },
                { id: 'settings', label: 'Pengaturan API & Cache', icon: Settings },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id as typeof activeTab);
                      setStatusNotice(null);
                    }}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      active
                        ? 'border-emerald-500 text-[#136F73] dark:text-[#2DD4BF]'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {statusNotice && (
              <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusNotice}</span>
              </div>
            )}

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {activeTab === 'articles' && (
                <form onSubmit={handlePublishArticle} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <select
                      aria-label="Pilih Artikel"
                      value={editingArticleId}
                      onChange={(e) => handleSelectArticleToEdit(e.target.value)}
                      className="px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      <option value="new">+ Buat Artikel Baru</option>
                      {articles.map((a) => (
                        <option key={a.id} value={a.id}>
                          Edit: {a.title}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowShortcodePicker((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-500/40 text-[#136F73] dark:text-[#2DD4BF] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Sisipkan Kartu Pemain / Komparasi
                      </button>
                    </div>
                  </div>

                  {showShortcodePicker && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-[#DCE8E6] dark:border-[#1B3335] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <input
                          type="text"
                          value={shortcodeSearch}
                          onChange={(e) => setShortcodeSearch(e.target.value)}
                          placeholder="Cari pemain global untuk disisipkan..."
                          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md text-xs bg-white dark:bg-[#0F1E20] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                        {comparePickIds.length > 0 && (
                          <span className="text-xs text-amber-500 font-medium">
                            Pilih 1 pemain lagi untuk shortcode komparasi
                          </span>
                        )}
                      </div>
                      <div className="max-h-44 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredShortcodePlayers.map((p) => (
                          <div
                            key={p.fotmobId}
                            className="py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {p.name}
                              </span>{' '}
                              <span className="text-slate-500">
                                ({p.club} · {formatMarketValue(p.marketValueEur)})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleInsertPlayerShortcode(p)}
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                              >
                                + Kartu
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleComparePick(p.fotmobId)}
                                className={`px-2.5 py-1 rounded border ${
                                  comparePickIds.includes(p.fotmobId)
                                    ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {comparePickIds.includes(p.fotmobId) ? 'Terpilih' : '+ Compare'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Judul Artikel
                      </label>
                      <input
                        type="text"
                        value={artTitle}
                        onChange={(e) => setArtTitle(e.target.value)}
                        placeholder="Contoh: Mengapa Box Midfield Mematikan Transisi Lawan"
                        className="w-full px-3.5 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Ringkasan / Deck
                      </label>
                      <input
                        type="text"
                        value={artSubtitle}
                        onChange={(e) => setArtSubtitle(e.target.value)}
                        placeholder="Ringkasan editorial 1-2 kalimat..."
                        className="w-full px-3.5 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Kategori
                      </label>
                      <select
                        value={artCategory}
                        onChange={(e) => setArtCategory(e.target.value as ArticleCategory)}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value="Bedah Taktik">Bedah Taktik</option>
                        <option value="Analisa Pemain">Analisa Pemain</option>
                        <option value="Market Value">Market Value</option>
                        <option value="Kecocokan Tim & Pelatih">Kecocokan Tim &amp; Pelatih</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Formasi Taktik &amp; Tags
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={artFormation}
                          onChange={(e) => setArtFormation(e.target.value)}
                          placeholder="3-2-4-1"
                          className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                        <input
                          type="text"
                          value={artTags}
                          onChange={(e) => setArtTags(e.target.value)}
                          placeholder="Tag1, Tag2"
                          className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Konten Markdown (mendukung {'{{player:ID}}'} dan {'{{compare:ID1,ID2}}'})
                    </label>
                    <textarea
                      rows={8}
                      value={artContent}
                      onChange={(e) => setArtContent(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Publikasikan ke Google Sheets
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'managers' && (
                <form onSubmit={handleSaveManager} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <select
                      aria-label="Pilih Profil Pelatih untuk Diedit"
                      value={selectedMgrId}
                      onChange={(e) => handleLoadManager(e.target.value)}
                      className="px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      <option value="new">+ Tambah Pelatih Baru</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.managerName} ({m.clubName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Nama Pelatih
                      </label>
                      <input
                        type="text"
                        value={mgrName}
                        onChange={(e) => setMgrName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Klub / Tim
                      </label>
                      <input
                        type="text"
                        value={mgrClub}
                        onChange={(e) => setMgrClub(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Liga
                      </label>
                      <input
                        type="text"
                        value={mgrLeague}
                        onChange={(e) => setMgrLeague(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Primary Formation
                      </label>
                      <input
                        type="text"
                        value={mgrFormation}
                        onChange={(e) => setMgrFormation(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'pressing_intensity', val: mgrPressing, set: setMgrPressing },
                      { label: 'possession_focus', val: mgrPossession, set: setMgrPossession },
                      { label: 'transition_speed', val: mgrTransition, set: setMgrTransition },
                      { label: 'build_up_style', val: mgrBuildUp, set: setMgrBuildUp },
                      { label: 'defensive_line', val: mgrDefLine, set: setMgrDefLine },
                      { label: 'aerial_physicality', val: mgrAerial, set: setMgrAerial },
                    ].map((field) => (
                      <div key={field.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-mono text-slate-600 dark:text-slate-300">
                            {field.label}
                          </span>
                          <span className="font-mono-num font-semibold text-emerald-500">
                            {field.val}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={99}
                          value={field.val}
                          onChange={(e) => field.set(Number(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Ringkasan Filosofi Taktik
                    </label>
                    <textarea
                      rows={3}
                      value={mgrSummary}
                      onChange={(e) => setMgrSummary(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Simpan ke Teams_Managers
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <form onSubmit={handleSaveSettings} className="space-y-4">
                    <div>
                      <label
                        htmlFor="gas-url-input"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                      >
                        Google Apps Script Web App URL (GAS_API_URL)
                      </label>
                      <input
                        id="gas-url-input"
                        type="url"
                        value={gasUrlInput}
                        onChange={(e) => setGasUrlInput(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full px-3.5 py-2.5 rounded-lg text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Disimpan di localStorage untuk menimpa VITE_GAS_API_URL secara dinamis tanpa
                        rebuild saat berpindah domain.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="tm-scraper-url-input"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                      >
                        Transfermarkt Scraper API URL (github.com/topics/transfermarkt-scraper)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id="tm-scraper-url-input"
                          type="url"
                          value={tmScraperUrlInput}
                          onChange={(e) => setTmScraperUrlInput(e.target.value)}
                          placeholder="https://transfermarkt-api-anda.domain.com (opsional)"
                          className="flex-1 px-3.5 py-2.5 rounded-lg text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={handleTestTmScraper}
                          disabled={testingScraper || !tmScraperUrlInput.trim()}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-500 disabled:opacity-50 whitespace-nowrap"
                        >
                          {testingScraper ? 'Menguji...' : 'Uji Koneksi'}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Mendukung REST API kompatibel felipeall/transfermarkt-api (/players/&#123;id&#125;/profile, /market_value, /transfers).
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableOptaInput}
                          onChange={(e) => setEnableOptaInput(e.target.checked)}
                          className="mt-0.5 accent-emerald-600"
                        />
                        <span className="text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-100 block">
                            Opta Live Telemetry Feed
                          </span>
                          <span className="text-slate-500">
                            Sinkronkan xG, xA, Top Speed, &amp; Line-Breaking Passes langsung dari CDN liga aktif.
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableSalimtInput}
                          onChange={(e) => setEnableSalimtInput(e.target.checked)}
                          className="mt-0.5 accent-emerald-600"
                        />
                        <span className="text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-100 block">
                            salimt/football-datasets Datalake
                          </span>
                          <span className="text-slate-500">
                            Enrich profil, kontrak, market value, &amp; log cedera 2026 dari repositori terbuka GitHub.
                          </span>
                        </span>
                      </label>
                    </div>

                    <div>
                      <label
                        htmlFor="new-pin-input"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                      >
                        Ganti PIN Admin (Opsional, minimal 4 karakter)
                      </label>
                      <input
                        id="new-pin-input"
                        type="password"
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        placeholder="Kosongkan jika tidak ingin mengubah PIN"
                        className="w-full px-3.5 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Simpan Pengaturan API
                    </button>
                  </form>

                  <div className="pt-5 border-t border-[#DCE8E6] dark:border-[#1B3335] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-500" />
                        Sinkronisasi &amp; Cache Pemain
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Memaksa pembaruan ulang data cache FotMob &amp; Transfermarkt di aplikasi.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleForceRefresh}
                      disabled={refreshing}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      Force Refresh Cache Pemain
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
