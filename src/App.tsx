import { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  BookOpen,
  CalendarDays,
  Compass,
  Database,
  GitCompare,
  Globe2,
  Layers,
  Lock,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { AdminStudioModal } from './components/AdminStudioModal';
import { CompareLabView } from './components/CompareLabView';
import { EditorialView } from './components/EditorialView';
import { FootyFablesLogo, FootyFablesMark } from './components/FootyFablesLogo';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { PlayerProfileView } from './components/PlayerProfileView';
import { SquadBuilderView } from './components/SquadBuilderView';
import { TacticalFitView } from './components/TacticalFitView';
import { TransferTickerView } from './components/TransferTickerView';
import { WorldExplorerView } from './components/WorldExplorerView';
import { WorldMatchesView } from './components/WorldMatchesView';
import {
  fetchArticles,
  fetchManagers,
  getCachedArticles,
  getCachedManagers,
  getCachedPlayers,
  getGasApiUrl,
  getPlayer,
  PLAYERS_UPDATED_EVENT,
} from './services/gasApi';
import type { Article, Player, TeamManagerProfile } from './types/footy';

type ActiveSection =
  | 'editorial'
  | 'explorer'
  | 'matches'
  | 'compare'
  | 'squads'
  | 'fit'
  | 'transfers'
  | 'profile';

const NAV_ITEMS: Array<{
  id: Exclude<ActiveSection, 'profile'>;
  label: string;
  subtitle: string;
  icon: typeof BookOpen;
}> = [
  { id: 'editorial', label: 'Editorial', subtitle: 'Riset Taktik & Artikel', icon: BookOpen },
  { id: 'explorer', label: 'World Explorer', subtitle: 'Liga & Skuad Dunia', icon: Globe2 },
  { id: 'matches', label: 'World Matches', subtitle: 'Jadwal & Prediksi XI', icon: CalendarDays },
  { id: 'compare', label: 'Compare Lab', subtitle: 'Komparasi 2–4 Pemain', icon: GitCompare },
  { id: 'squads', label: 'Squad Builder', subtitle: 'Papan Taktik 2D', icon: Layers },
  { id: 'fit', label: 'Fit Engine', subtitle: 'Kecocokan Sistem', icon: Compass },
  { id: 'transfers', label: 'Transfer Ticker', subtitle: 'Bursa & Valuasi', icon: ArrowRightLeft },
];

export default function App() {
  const [section, setSection] = useState<ActiveSection>('editorial');
  const [previousSection, setPreviousSection] = useState<ActiveSection>('editorial');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('footyfables_theme') !== 'light';
    } catch {
      return true;
    }
  });

  const [players, setPlayers] = useState<Player[]>(() => getCachedPlayers());
  const [articles, setArticles] = useState<Article[]>(() => getCachedArticles());
  const [managers, setManagers] = useState<TeamManagerProfile[]>(() => getCachedManagers());

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>(['1467236', '934235']);
  const [fitPlayerId, setFitPlayerId] = useState<string | undefined>(undefined);
  const [explorerTarget, setExplorerTarget] = useState<{
    leagueId?: string;
    clubId?: string;
  }>({});

  const [searchOpen, setSearchOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('footyfables_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('footyfables_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('footyfables_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('footyfables_theme', 'light');
    }
  }, [darkMode]);

  // Initial hybrid sync when GAS_API_URL is configured
  useEffect(() => {
    fetchArticles().then(setArticles);
    fetchManagers().then(setManagers);
  }, []);

  // Global Ctrl+K / Cmd+K Omnisearch shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Listen for background squad/telemetry hydration broadcasts
  useEffect(() => {
    const handlePlayersUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<Player[]>).detail;
      if (Array.isArray(detail) && detail.length > 0) {
        setPlayers(detail);
        setActivePlayer((curr) =>
          curr ? detail.find((p) => p.fotmobId === curr.fotmobId) || curr : curr
        );
      } else {
        setPlayers(getCachedPlayers());
      }
    };
    window.addEventListener(PLAYERS_UPDATED_EVENT, handlePlayersUpdated);
    return () => window.removeEventListener(PLAYERS_UPDATED_EVENT, handlePlayersUpdated);
  }, []);

  const openPlayerProfile = (player: Player) => {
    setPlayers((prev) => {
      const exists = prev.some((p) => p.fotmobId === player.fotmobId);
      return exists
        ? prev.map((p) => (p.fotmobId === player.fotmobId ? player : p))
        : [player, ...prev];
    });
    if (section !== 'profile') {
      setPreviousSection(section);
    }
    setActivePlayer(player);
    setSection('profile');
    window.scrollTo(0, 0);

    // Silently auto-hydrate sparse profiles (e.g. opened from search preview)
    const isSparse =
      player.stats.xG === 0 && player.stats.xA === 0 && player.stats.passAccuracy === 0;
    if (isSparse) {
      getPlayer({
        fotmobId: player.fotmobId,
        tmId: player.tmId,
        name: player.name,
        clubId: player.clubId,
      }).then((hydrated) => {
        if (hydrated) {
          setActivePlayer((curr) =>
            curr && curr.fotmobId === hydrated.fotmobId ? hydrated : curr
          );
        }
      });
    }
  };

  const handleOpenCompare = (ids: string[]) => {
    setCompareIds(ids.slice(0, 4));
    setSection('compare');
    window.scrollTo(0, 0);
  };

  const handleAddToCompare = (fotmobId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(fotmobId)) return prev;
      if (prev.length >= 4) return [...prev.slice(0, 3), fotmobId];
      return [...prev, fotmobId];
    });
    setSection('compare');
    window.scrollTo(0, 0);
  };

  const handleOpenFitEngine = (fotmobId: string) => {
    setFitPlayerId(fotmobId);
    setSection('fit');
    window.scrollTo(0, 0);
  };

  const handleNavigateClub = (clubId: string, leagueId: string) => {
    setExplorerTarget({ clubId, leagueId });
    setSection('explorer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateSection = (target: ActiveSection) => {
    setSection(target);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeGasUrl = getGasApiUrl();
  const currentNavMeta = NAV_ITEMS.find((item) => item.id === section);

  return (
    <div className="min-h-screen flex bg-[#F3F7F6] text-[#172B2A] dark:bg-[#081314] dark:text-[#E6F1EF] transition-colors duration-200">
      {/* AeuxGlobal-Inspired Deep Forest-Teal Desktop Sidebar (Collapsible to Icon Rail) */}
      <aside
        data-testid="desktop-sidebar"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 z-40 bg-[#0B2524] text-white border-r border-[#153B39] transition-all duration-200 ${
          sidebarCollapsed ? 'md:w-[76px]' : 'md:w-64'
        }`}
      >
        {/* Sidebar Logo Area */}
        <div
          className={`pt-6 pb-5 border-b border-[#153B39] flex items-center ${
            sidebarCollapsed ? 'px-3 justify-center flex-col gap-3' : 'px-5 justify-between'
          }`}
        >
          <button
            type="button"
            onClick={() => navigateSection('editorial')}
            aria-label="FootyFables Beranda"
            className="block focus-visible:outline-2 focus-visible:outline-[#2DD4BF] rounded"
          >
            {sidebarCollapsed ? (
              <FootyFablesMark variant="white" height={24} />
            ) : (
              <FootyFablesLogo variant="white" height={26} />
            )}
          </button>

          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Perluas Menu Samping' : 'Sembunyikan ke Ikon'}
            title={sidebarCollapsed ? 'Perluas Menu Samping' : 'Sembunyikan ke Ikon'}
            className="p-1.5 rounded-lg text-[#8AB0AD] hover:text-white hover:bg-[#123332] transition-colors shrink-0"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {!sidebarCollapsed && (
          <p className="px-6 pt-3 text-[11px] font-medium text-[#7EA7A4] tracking-wide">
            Tactical Analytics &amp; Valuation
          </p>
        )}

        {/* Navigation Links */}
        <div className={`flex-1 py-4 overflow-y-auto ${sidebarCollapsed ? 'px-2.5' : 'px-4'}`}>
          {!sidebarCollapsed && (
            <div className="px-3 mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6A9491]">
              Navigation
            </div>
          )}
          <nav aria-label="Navigasi Utama" className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                section === item.id ||
                (section === 'profile' && previousSection === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateSection(item.id)}
                  title={item.label}
                  aria-label={item.label}
                  className={`w-full flex items-center rounded-xl transition-all ${
                    sidebarCollapsed
                      ? 'justify-center px-2 py-2.5'
                      : 'gap-3 px-3.5 py-2.5 text-left'
                  } ${
                    active
                      ? 'bg-gradient-to-r from-[#136F73] to-[#1A8D91] text-white shadow-md shadow-black/20'
                      : 'text-[#A6C4C2] hover:bg-[#123332] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      active ? 'bg-white/15 text-white' : 'bg-[#10302F] text-[#66B2AE]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  {!sidebarCollapsed && (
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-tight truncate">
                        {item.label}
                      </div>
                      <div
                        className={`text-[10px] truncate mt-0.5 ${
                          active ? 'text-teal-100/80' : 'text-[#6A9491]'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom Utility Dock */}
        <div
          className={`border-t border-[#153B39] space-y-2.5 ${
            sidebarCollapsed ? 'p-2.5' : 'p-4'
          }`}
        >
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              title={`${activeGasUrl ? 'Sheets Live Proxy' : 'Local Cache Mode'} (${players.length} pemain)`}
              aria-label="Status Data Proxy"
              className="w-full flex items-center justify-center p-2.5 rounded-xl bg-[#0F3130] border border-[#1B4947] text-[#2DD4BF] hover:bg-[#123534]"
            >
              <Database className="w-4 h-4" />
            </button>
          ) : (
            <div className="px-3.5 py-3 rounded-xl bg-[#0F3130] border border-[#1B4947]">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Database className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
                <span className="truncate">
                  {activeGasUrl ? 'Sheets Live Proxy' : 'Local Cache Mode'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#8AB0AD] leading-snug font-mono-num">
                {players.length} pemain · {articles.length} riset
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAdminOpen(true)}
            title="Studio Admin & GAS"
            aria-label="Studio Admin & GAS"
            className={`w-full flex items-center rounded-xl text-xs font-semibold bg-[#123534] hover:bg-[#174442] text-[#D7ECEA] border border-[#1E4F4C] transition-colors ${
              sidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2.5'
            }`}
          >
            <span className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#2DD4BF]" />
              {!sidebarCollapsed && <span>Studio Admin &amp; GAS</span>}
            </span>
            {!sidebarCollapsed && (
              <span className="text-[10px] font-mono-num text-[#7EA7A4]">CMS</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          sidebarCollapsed ? 'md:pl-[76px]' : 'md:pl-64'
        }`}
      >
        {/* Clean Top Utility Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-[#DCE8E6] dark:border-[#15292B] bg-white/90 dark:bg-[#0B1718]/90 backdrop-blur-md">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4">
            {/* Hamburger Toggle + Brand + Active Route Context */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Desktop Hamburger Collapse Toggle */}
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                aria-label={sidebarCollapsed ? 'Perluas Menu Navigasi' : 'Sembunyikan Menu Navigasi'}
                aria-expanded={!sidebarCollapsed}
                className="hidden md:inline-flex p-2 rounded-lg text-[#355352] dark:text-[#A6C4C2] hover:bg-[#E7F0EE] dark:hover:bg-[#142A2C] transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Mobile Hamburger Drawer Toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label="Toggle Menu Navigasi"
                aria-expanded={mobileMenuOpen}
                className="md:hidden p-2 rounded-lg text-[#355352] dark:text-[#A6C4C2] hover:bg-[#E7F0EE] dark:hover:bg-[#142A2C]"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() => navigateSection('editorial')}
                aria-label="FootyFables"
                className="md:hidden shrink-0"
              >
                <FootyFablesLogo variant="auto" height={22} />
              </button>

              <div className="hidden md:flex items-center gap-2.5 min-w-0">
                <span className="text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                  FootyFables
                </span>
                <span className="text-[#9AB4B2] dark:text-[#35595B]" aria-hidden="true">
                  /
                </span>
                <span className="text-sm font-semibold text-[#172B2A] dark:text-white truncate">
                  {section === 'profile' && activePlayer
                    ? activePlayer.name
                    : currentNavMeta?.label || 'Editorial'}
                </span>
              </div>
            </div>

            {/* Right Controls: Global Omnisearch + Theme + Admin */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Buka Pencarian Global"
                className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#F3F7F6] dark:bg-[#102224] border border-[#D4E3E0] dark:border-[#1D393B] text-[#355352] dark:text-[#B9D4D1] hover:border-[#136F73] dark:hover:border-[#2DD4BF] transition-colors whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5 text-[#136F73] dark:text-[#2DD4BF]" />
                <span className="hidden sm:inline">Cari Pemain &amp; Klub</span>
                <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] font-mono-num bg-white dark:bg-[#0B1718] border border-[#D4E3E0] dark:border-[#1D393B] rounded">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                aria-label={darkMode ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
                className="p-2 rounded-xl border border-[#D4E3E0] dark:border-[#1D393B] bg-white dark:bg-[#102224] text-[#355352] dark:text-[#B9D4D1] hover:border-[#136F73] dark:hover:border-[#2DD4BF] transition-colors shrink-0"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                aria-label="Studio Admin"
                className="md:hidden p-2 rounded-xl border border-[#D4E3E0] dark:border-[#1D393B] bg-white dark:bg-[#102224] text-[#355352] dark:text-[#B9D4D1]"
              >
                <Lock className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden border-b border-[#DCE8E6] dark:border-[#1B3335] bg-[#0B2524] text-white px-4 py-3 space-y-1.5 shadow-xl">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${
                      active
                        ? 'bg-gradient-to-r from-[#136F73] to-[#1A8D91] text-white'
                        : 'text-[#A6C4C2] hover:bg-[#123332]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {/* Main Workspace */}
        <main className="flex-1 min-w-0">
          {section === 'editorial' && (
            <EditorialView
              articles={articles}
              players={players}
              onOpenPlayer={openPlayerProfile}
              onOpenCompare={handleOpenCompare}
              onNavigateTransfers={() => navigateSection('transfers')}
            />
          )}

          {section === 'explorer' && (
            <WorldExplorerView
              initialLeagueId={explorerTarget.leagueId}
              initialClubId={explorerTarget.clubId}
              onHydratePlayer={openPlayerProfile}
              onAddToCompare={handleAddToCompare}
            />
          )}

          {section === 'matches' && (
            <WorldMatchesView players={players} onOpenPlayer={openPlayerProfile} />
          )}

          {section === 'compare' && (
            <CompareLabView
              players={players}
              selectedIds={compareIds}
              onChangeSelectedIds={setCompareIds}
              onOpenPlayer={openPlayerProfile}
            />
          )}

          {section === 'squads' && (
            <SquadBuilderView players={players} onOpenPlayer={openPlayerProfile} />
          )}

          {section === 'fit' && (
            <TacticalFitView
              players={players}
              managers={managers}
              initialPlayerId={fitPlayerId}
              onOpenPlayer={openPlayerProfile}
            />
          )}

          {section === 'transfers' && (
            <TransferTickerView players={players} onOpenPlayer={openPlayerProfile} />
          )}

          {section === 'profile' && activePlayer && (
            <PlayerProfileView
              player={activePlayer}
              onBack={() => setSection(previousSection)}
              onAddToCompare={handleAddToCompare}
              onOpenFitEngine={handleOpenFitEngine}
              onPlayerUpdated={(updated) => setActivePlayer(updated)}
            />
          )}
        </main>

        {/* Clean Footer */}
        <footer className="border-t border-[#DCE8E6] dark:border-[#15292B] mt-12 py-6 px-4 sm:px-8">
          <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#54716F] dark:text-[#7EA7A4]">
            <div className="flex flex-wrap items-center gap-2.5">
              <FootyFablesLogo variant="auto" height={18} />
              <span aria-hidden="true">·</span>
              <span>Analitik Taktik &amp; Valuasi Sepak Bola</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeGasUrl ? 'Google Sheets Proxy Aktif' : 'Mode Dataset Lokal'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => navigateSection('transfers')}
                className="hover:text-[#136F73] dark:hover:text-[#2DD4BF] transition-colors"
              >
                Transfer Ticker
              </button>
              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                className="hover:text-[#136F73] dark:hover:text-[#2DD4BF] transition-colors"
              >
                Pengaturan GAS API
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectPlayer={openPlayerProfile}
        onSelectClub={handleNavigateClub}
      />

      <AdminStudioModal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        articles={articles}
        managers={managers}
        players={players}
        onArticlesUpdated={setArticles}
        onManagersUpdated={setManagers}
        onPlayersRefreshed={() => setPlayers(getCachedPlayers())}
      />
    </div>
  );
}
