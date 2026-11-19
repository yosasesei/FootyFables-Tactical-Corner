import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { FALLBACK_LEAGUES, TACTICAL_FORMATIONS } from '../data/fallbackData';
import { WORLD_MANAGERS } from '../data/worldManagers';
import { getTeam, getWorldMatches, searchGlobal } from '../services/gasApi';
import type {
  FormationSlot,
  MatchMentality,
  Player,
  TeamManagerProfile,
  WorldMatch,
} from '../types/footy';
import { findClubManager, formatMarketValue, getPositionGroup } from '../utils/analytics';
import { evaluateSlotFit, predictMatchFromLineups } from '../utils/matchPredictor';
import { PlayerAvatar } from './PlayerAvatar';

interface WorldMatchesViewProps {
  players: Player[];
  managers?: TeamManagerProfile[];
  onOpenPlayer: (player: Player) => void;
}

const MENTALITIES: MatchMentality[] = ['Balanced', 'High Press', 'Counter Block'];

type DragPayload =
  | { type: 'pool'; playerId: string }
  | { type: 'slot'; side: 'home' | 'away'; slotId: string; playerId: string };

interface SavedUserPrediction {
  homeScore: number;
  awayScore: number;
  lockedAt: string;
}

function loadSavedPredictions(): Record<string, SavedUserPrediction> {
  try {
    const raw = localStorage.getItem('footyfables_match_predictions');
    return raw ? (JSON.parse(raw) as Record<string, SavedUserPrediction>) : {};
  } catch {
    return {};
  }
}

function normalizePlayerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function deduplicateByName(list: Player[]): Player[] {
  const byName = new Map<string, Player>();
  for (const p of list) {
    const key = normalizePlayerKey(p.name);
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, p);
      continue;
    }
    // Prefer richer live telemetry record
    const prevScore =
      (prev.stats.xG > 0 ? 2 : 0) +
      (prev.stats.passAccuracy > 0 ? 2 : 0) +
      (prev.marketValueEur > 0 ? 1 : 0);
    const currScore =
      (p.stats.xG > 0 ? 2 : 0) +
      (p.stats.passAccuracy > 0 ? 2 : 0) +
      (p.marketValueEur > 0 ? 1 : 0);
    if (currScore >= prevScore) {
      byName.set(key, p);
    }
  }
  return Array.from(byName.values());
}

function buildAutoLineup(
  slots: FormationSlot[],
  clubId: string,
  clubName: string,
  opponentClubId: string,
  opponentClubName: string,
  allPlayers: Player[],
  offsetSeed: number
): Record<string, string> {
  const dedupedAll = deduplicateByName(allPlayers);
  const clubPlayers = dedupedAll
    .filter(
      (p) =>
        (clubId && p.clubId === clubId) ||
        p.club.toLowerCase() === clubName.toLowerCase()
    )
    .sort((a, b) => (b.stats.rating || 0) - (a.stats.rating || 0));

  const nonOpponentPlayers = dedupedAll.filter(
    (p) =>
      (!opponentClubId || p.clubId !== opponentClubId) &&
      p.club.toLowerCase() !== opponentClubName.toLowerCase()
  );
  const fallbackPool = nonOpponentPlayers.length >= slots.length ? nonOpponentPlayers : dedupedAll;
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  const out: Record<string, string> = {};

  const markUsed = (p: Player): Player => {
    usedIds.add(p.fotmobId);
    usedNames.add(normalizePlayerKey(p.name));
    return p;
  };

  const isAvailable = (p: Player) =>
    !usedIds.has(p.fotmobId) && !usedNames.has(normalizePlayerKey(p.name));

  const pickForGroup = (group: FormationSlot['positionGroup'], fallbackOffset: number): Player | undefined => {
    // 1. Exact primary position in club
    const clubExact = clubPlayers.find(
      (p) => isAvailable(p) && getPositionGroup(p.primaryPosition) === group
    );
    if (clubExact) return markUsed(clubExact);

    // 2. Secondary position match in club
    const clubSecondary = clubPlayers.find(
      (p) =>
        isAvailable(p) &&
        p.secondaryPositions.some((sp) => getPositionGroup(sp) === group)
    );
    if (clubSecondary) return markUsed(clubSecondary);

    // 3. Adjacent outfield position in club (never put a GK in an outfield slot)
    if (group !== 'GK') {
      const clubAdjacent = clubPlayers.find(
        (p) =>
          isAvailable(p) &&
          getPositionGroup(p.primaryPosition) !== 'GK' &&
          evaluateSlotFit(p.primaryPosition, group) === 'adjacent'
      );
      if (clubAdjacent) return markUsed(clubAdjacent);

      if (clubPlayers.length >= 11) {
        const clubOutfield = clubPlayers.find(
          (p) => isAvailable(p) && getPositionGroup(p.primaryPosition) !== 'GK'
        );
        if (clubOutfield) return markUsed(clubOutfield);
      }
    }

    // 4. Global natural match
    const globalMatches = fallbackPool.filter(
      (p) => isAvailable(p) && getPositionGroup(p.primaryPosition) === group
    );
    if (globalMatches.length > 0) {
      return markUsed(globalMatches[fallbackOffset % globalMatches.length]);
    }

    // 5. Remaining non-GK outfield fallback
    const remaining = fallbackPool.find(
      (p) =>
        isAvailable(p) &&
        (group === 'GK' ? true : getPositionGroup(p.primaryPosition) !== 'GK')
    );
    if (remaining) return markUsed(remaining);
    return undefined;
  };

  // Fill GK first, then DEF, MID, FWD so goalkeepers are never placed in outfield slots
  const priorityOrder: Record<FormationSlot['positionGroup'], number> = {
    GK: 0,
    DEF: 1,
    MID: 2,
    FWD: 3,
  };
  const orderedSlots = slots
    .map((slot, idx) => ({ slot, idx }))
    .sort((a, b) => priorityOrder[a.slot.positionGroup] - priorityOrder[b.slot.positionGroup]);

  for (const { slot, idx } of orderedSlots) {
    const picked = pickForGroup(slot.positionGroup, offsetSeed + idx);
    if (picked) {
      out[slot.slotId] = picked.fotmobId;
    }
  }

  return out;
}

export function WorldMatchesView({
  players,
  managers = WORLD_MANAGERS,
  onOpenPlayer,
}: WorldMatchesViewProps) {
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'All' | WorldMatch['status']>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<WorldMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [hydratingSquads, setHydratingSquads] = useState(false);

  const [homeFormationId, setHomeFormationId] = useState<string>(TACTICAL_FORMATIONS[0].id);
  const [awayFormationId, setAwayFormationId] = useState<string>(TACTICAL_FORMATIONS[2].id);
  const [homeMentality, setHomeMentality] = useState<MatchMentality>('High Press');
  const [awayMentality, setAwayMentality] = useState<MatchMentality>('Balanced');
  const [homeManagerId, setHomeManagerId] = useState<string>(managers[0]?.id || '');
  const [awayManagerId, setAwayManagerId] = useState<string>(managers[1]?.id || managers[0]?.id || '');

  const [homeAssignments, setHomeAssignments] = useState<Record<string, string>>({});
  const [awayAssignments, setAwayAssignments] = useState<Record<string, string>>({});
  const userEditedLineupRef = useRef<boolean>(false);
  const userEditedManagersRef = useRef<boolean>(false);

  // Draggable Player Pool controls
  const [poolScope, setPoolScope] = useState<'all' | 'home' | 'away'>('all');
  const [poolPosFilter, setPoolPosFilter] = useState<'ALL' | 'FWD' | 'MID' | 'DEF' | 'GK'>('ALL');
  const [poolSearch, setPoolSearch] = useState('');
  const [remotePoolResults, setRemotePoolResults] = useState<Player[]>([]);

  // Active drag state
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    side: 'home' | 'away';
    slotId: string;
  } | null>(null);

  // Summon Modal state for placing global players into Home or Away XI (click fallback)
  const [summoningTarget, setSummoningTarget] = useState<{
    side: 'home' | 'away';
    slot: FormationSlot;
  } | null>(null);
  const [summonQuery, setSummonQuery] = useState('');
  const [remoteSummonResults, setRemoteSummonResults] = useState<Player[]>([]);
  const [extraPlayers, setExtraPlayers] = useState<Record<string, Player>>({});

  // User Score Guess persistence
  const [savedPredictions, setSavedPredictions] = useState<Record<string, SavedUserPrediction>>(() =>
    loadSavedPredictions()
  );
  const [userHomeGuess, setUserHomeGuess] = useState<number>(2);
  const [userAwayGuess, setUserAwayGuess] = useState<number>(1);

  useEffect(() => {
    let active = true;
    setLoadingMatches(true);
    getWorldMatches(leagueFilter).then((res) => {
      if (!active) return;
      setMatches(res);
      setLoadingMatches(false);
      if (res.length > 0 && !res.some((m) => m.id === selectedMatchId)) {
        setSelectedMatchId(res[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [leagueFilter]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (statusFilter !== 'All' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.homeClubName.toLowerCase().includes(q) ||
        m.awayClubName.toLowerCase().includes(q) ||
        m.leagueName.toLowerCase().includes(q) ||
        m.venue.toLowerCase().includes(q)
      );
    });
  }, [matches, statusFilter, searchQuery]);

  const selectedMatch = useMemo(() => {
    return (
      filteredMatches.find((m) => m.id === selectedMatchId) ||
      matches.find((m) => m.id === selectedMatchId) ||
      filteredMatches[0] ||
      matches[0] ||
      null
    );
  }, [filteredMatches, matches, selectedMatchId]);

  const homeFormation = useMemo(
    () => TACTICAL_FORMATIONS.find((f) => f.id === homeFormationId) || TACTICAL_FORMATIONS[0],
    [homeFormationId]
  );

  const awayFormation = useMemo(
    () => TACTICAL_FORMATIONS.find((f) => f.id === awayFormationId) || TACTICAL_FORMATIONS[2],
    [awayFormationId]
  );

  // Auto-populate Home & Away XI + auto-select Club Managers + hydrate real club squads
  useEffect(() => {
    if (!selectedMatch) return;
    let active = true;
    userEditedLineupRef.current = false;
    userEditedManagersRef.current = false;

    const matchedHomeMgr = findClubManager(selectedMatch.homeClubName, managers);
    const matchedAwayMgr = findClubManager(selectedMatch.awayClubName, managers);
    if (matchedHomeMgr) setHomeManagerId(matchedHomeMgr.id);
    if (matchedAwayMgr) setAwayManagerId(matchedAwayMgr.id);

    const hf =
      TACTICAL_FORMATIONS.find((f) => f.id === selectedMatch.homeFormation) ||
      TACTICAL_FORMATIONS[0];
    const af =
      TACTICAL_FORMATIONS.find((f) => f.id === selectedMatch.awayFormation) ||
      TACTICAL_FORMATIONS[2];
    setHomeFormationId(hf.id);
    setAwayFormationId(af.id);

    const poolSnapshot = [...players, ...Object.values(extraPlayers)];
    setHomeAssignments(
      buildAutoLineup(
        hf.slots,
        selectedMatch.homeClubId,
        selectedMatch.homeClubName,
        selectedMatch.awayClubId,
        selectedMatch.awayClubName,
        poolSnapshot,
        0
      )
    );
    setAwayAssignments(
      buildAutoLineup(
        af.slots,
        selectedMatch.awayClubId,
        selectedMatch.awayClubName,
        selectedMatch.homeClubId,
        selectedMatch.homeClubName,
        poolSnapshot,
        3
      )
    );

    const existingGuess = savedPredictions[selectedMatch.id];
    if (existingGuess) {
      setUserHomeGuess(existingGuess.homeScore);
      setUserAwayGuess(existingGuess.awayScore);
    }

    const homeCount = poolSnapshot.filter(
      (p) =>
        (selectedMatch.homeClubId && p.clubId === selectedMatch.homeClubId) ||
        p.club.toLowerCase() === selectedMatch.homeClubName.toLowerCase()
    ).length;
    const awayCount = poolSnapshot.filter(
      (p) =>
        (selectedMatch.awayClubId && p.clubId === selectedMatch.awayClubId) ||
        p.club.toLowerCase() === selectedMatch.awayClubName.toLowerCase()
    ).length;

    if (
      (homeCount < 11 && selectedMatch.homeClubId) ||
      (awayCount < 11 && selectedMatch.awayClubId)
    ) {
      setHydratingSquads(true);
      Promise.allSettled([
        homeCount < 11 && selectedMatch.homeClubId
          ? getTeam(selectedMatch.homeClubId)
          : Promise.resolve(null),
        awayCount < 11 && selectedMatch.awayClubId
          ? getTeam(selectedMatch.awayClubId)
          : Promise.resolve(null),
      ]).then((results) => {
        if (!active) return;
        setHydratingSquads(false);
        const incoming: Player[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value?.players) {
            incoming.push(...r.value.players);
          }
        }
        if (incoming.length > 0) {
          setExtraPlayers((prev) => {
            const next = { ...prev };
            for (const p of incoming) next[p.fotmobId] = p;
            return next;
          });
          if (!userEditedLineupRef.current) {
            const enrichedPool = [...poolSnapshot, ...incoming];
            setHomeAssignments(
              buildAutoLineup(
                hf.slots,
                selectedMatch.homeClubId,
                selectedMatch.homeClubName,
                selectedMatch.awayClubId,
                selectedMatch.awayClubName,
                enrichedPool,
                0
              )
            );
            setAwayAssignments(
              buildAutoLineup(
                af.slots,
                selectedMatch.awayClubId,
                selectedMatch.awayClubName,
                selectedMatch.homeClubId,
                selectedMatch.homeClubName,
                enrichedPool,
                3
              )
            );
          }
        }
      });
    }

    return () => {
      active = false;
    };
  }, [selectedMatch?.id]);

  // Debounced global search inside Draggable Player Pool
  useEffect(() => {
    const clean = poolSearch.trim();
    if (clean.length < 2) {
      setRemotePoolResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchGlobal(clean).then((res) => {
        setRemotePoolResults(res.players);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [poolSearch]);

  // Debounced global search inside Summon modal
  useEffect(() => {
    if (!summoningTarget) return;
    const clean = summonQuery.trim();
    if (clean.length < 2) {
      setRemoteSummonResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchGlobal(clean).then((res) => {
        setRemoteSummonResults(res.players);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [summonQuery, summoningTarget]);

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) map.set(p.fotmobId, p);
    for (const p of Object.values(extraPlayers)) map.set(p.fotmobId, p);
    return map;
  }, [players, extraPlayers]);

  const homeAssignedBySlot = useMemo(() => {
    const out: Record<string, Player | undefined> = {};
    for (const slot of homeFormation.slots) {
      const pid = homeAssignments[slot.slotId];
      out[slot.slotId] = pid ? playerMap.get(pid) : undefined;
    }
    return out;
  }, [homeFormation, homeAssignments, playerMap]);

  const awayAssignedBySlot = useMemo(() => {
    const out: Record<string, Player | undefined> = {};
    for (const slot of awayFormation.slots) {
      const pid = awayAssignments[slot.slotId];
      out[slot.slotId] = pid ? playerMap.get(pid) : undefined;
    }
    return out;
  }, [awayFormation, awayAssignments, playerMap]);

  const homeManager = useMemo(
    () =>
      managers.find((m) => m.id === homeManagerId) ||
      (selectedMatch ? findClubManager(selectedMatch.homeClubName, managers) : undefined) ||
      managers[0],
    [managers, homeManagerId, selectedMatch]
  );

  const awayManager = useMemo(
    () =>
      managers.find((m) => m.id === awayManagerId) ||
      (selectedMatch ? findClubManager(selectedMatch.awayClubName, managers) : undefined) ||
      managers[1] ||
      managers[0],
    [managers, awayManagerId, selectedMatch]
  );

  // Sync live-discovered managers when managers array expands after getTeam
  useEffect(() => {
    if (!selectedMatch || userEditedManagersRef.current) return;
    const h = findClubManager(selectedMatch.homeClubName, managers);
    const a = findClubManager(selectedMatch.awayClubName, managers);
    if (h) setHomeManagerId(h.id);
    if (a) setAwayManagerId(a.id);
  }, [managers, selectedMatch?.id]);

  const prediction = useMemo(
    () =>
      predictMatchFromLineups({
        homeSlots: homeFormation.slots,
        homeAssignments: homeAssignedBySlot,
        homeMentality,
        homeFormationName: homeFormation.name,
        homeManager,
        awaySlots: awayFormation.slots,
        awayAssignments: awayAssignedBySlot,
        awayMentality,
        awayFormationName: awayFormation.name,
        awayManager,
      }),
    [
      homeFormation.slots,
      homeFormation.name,
      homeAssignedBySlot,
      homeMentality,
      homeManager,
      awayFormation.slots,
      awayFormation.name,
      awayAssignedBySlot,
      awayMentality,
      awayManager,
    ]
  );

  // Sync default user guess if not previously locked for this match
  useEffect(() => {
    if (!selectedMatch) return;
    if (!savedPredictions[selectedMatch.id]) {
      setUserHomeGuess(prediction.predictedScore.home);
      setUserAwayGuess(prediction.predictedScore.away);
    }
  }, [selectedMatch?.id, prediction.predictedScore.home, prediction.predictedScore.away]);

  const draggablePoolPlayers = useMemo(() => {
    const q = poolSearch.trim().toLowerCase();
    const allKnown = deduplicateByName(Array.from(playerMap.values()));
    const combined = [...allKnown];
    for (const rp of remotePoolResults) {
      const rpName = normalizePlayerKey(rp.name);
      if (!combined.some((p) => p.fotmobId === rp.fotmobId || normalizePlayerKey(p.name) === rpName)) {
        combined.push(rp);
      }
    }

    return combined
      .filter((p) => {
        if (poolScope === 'home' && selectedMatch) {
          const isHome =
            (selectedMatch.homeClubId && p.clubId === selectedMatch.homeClubId) ||
            p.club.toLowerCase() === selectedMatch.homeClubName.toLowerCase();
          if (!isHome) return false;
        } else if (poolScope === 'away' && selectedMatch) {
          const isAway =
            (selectedMatch.awayClubId && p.clubId === selectedMatch.awayClubId) ||
            p.club.toLowerCase() === selectedMatch.awayClubName.toLowerCase();
          if (!isAway) return false;
        }
        if (poolPosFilter !== 'ALL' && getPositionGroup(p.primaryPosition) !== poolPosFilter) {
          return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          p.primaryPosition.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.stats.rating || 0) - (a.stats.rating || 0))
      .slice(0, 24);
  }, [playerMap, remotePoolResults, poolScope, poolPosFilter, poolSearch, selectedMatch]);

  const summonPool = useMemo(() => {
    const q = summonQuery.trim().toLowerCase();
    const allKnown = Array.from(playerMap.values());
    const localFiltered = allKnown.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.club.toLowerCase().includes(q) ||
        p.primaryPosition.toLowerCase().includes(q)
    );
    const combined = [...localFiltered];
    for (const rp of remoteSummonResults) {
      if (!combined.some((p) => p.fotmobId === rp.fotmobId)) {
        combined.push(rp);
      }
    }
    return combined;
  }, [playerMap, remoteSummonResults, summonQuery]);

  const assignPlayerToSlot = (side: 'home' | 'away', slotId: string, player: Player) => {
    userEditedLineupRef.current = true;
    setExtraPlayers((prev) => ({ ...prev, [player.fotmobId]: player }));
    const updater = (prev: Record<string, string>) => {
      const next = { ...prev };
      // Prevent duplicate player in another slot on the same pitch
      for (const [k, v] of Object.entries(next)) {
        if (v === player.fotmobId && k !== slotId) {
          delete next[k];
        }
      }
      next[slotId] = player.fotmobId;
      return next;
    };
    if (side === 'home') {
      setHomeAssignments(updater);
    } else {
      setAwayAssignments(updater);
    }
  };

  const handlePlacePlayer = (player: Player) => {
    if (!summoningTarget) return;
    assignPlayerToSlot(summoningTarget.side, summoningTarget.slot.slotId, player);
    setSummoningTarget(null);
    setSummonQuery('');
  };

  const handleDropOnSlot = (
    e: React.DragEvent,
    targetSide: 'home' | 'away',
    targetSlotId: string
  ) => {
    e.preventDefault();
    setDragOverTarget(null);

    let payload: DragPayload | null = activeDrag;
    try {
      const rawJson = e.dataTransfer?.getData('application/json');
      if (rawJson) {
        payload = JSON.parse(rawJson) as DragPayload;
      } else if (!payload) {
        const plainId = e.dataTransfer?.getData('text/plain');
        if (plainId) {
          payload = { type: 'pool', playerId: plainId };
        }
      }
    } catch {
      // fall back to state activeDrag
    }
    setActiveDrag(null);
    if (!payload) return;

    userEditedLineupRef.current = true;

    if (payload.type === 'pool') {
      const draggedPlayer =
        playerMap.get(payload.playerId) ||
        remotePoolResults.find((p) => p.fotmobId === payload.playerId);
      if (draggedPlayer) {
        assignPlayerToSlot(targetSide, targetSlotId, draggedPlayer);
      }
      return;
    }

    // Slot-to-slot swap within the same XI or transfer across pitches
    if (payload.side === targetSide) {
      if (payload.slotId === targetSlotId) return;
      const swapper = (prev: Record<string, string>) => {
        const next = { ...prev };
        const sourceId = next[payload.slotId];
        const targetId = next[targetSlotId];
        if (sourceId) next[targetSlotId] = sourceId;
        if (targetId) {
          next[payload.slotId] = targetId;
        } else {
          delete next[payload.slotId];
        }
        return next;
      };
      if (targetSide === 'home') setHomeAssignments(swapper);
      else setAwayAssignments(swapper);
    } else {
      const draggedPlayer = playerMap.get(payload.playerId);
      if (draggedPlayer) {
        assignPlayerToSlot(targetSide, targetSlotId, draggedPlayer);
      }
    }
  };

  const handleLockPrediction = () => {
    if (!selectedMatch) return;
    const next = {
      ...savedPredictions,
      [selectedMatch.id]: {
        homeScore: userHomeGuess,
        awayScore: userAwayGuess,
        lockedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
    };
    setSavedPredictions(next);
    try {
      localStorage.setItem('footyfables_match_predictions', JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleResetMatchLineups = () => {
    if (!selectedMatch) return;
    userEditedLineupRef.current = false;
    const poolSnapshot = Array.from(playerMap.values());
    setHomeAssignments(
      buildAutoLineup(
        homeFormation.slots,
        selectedMatch.homeClubId,
        selectedMatch.homeClubName,
        selectedMatch.awayClubId,
        selectedMatch.awayClubName,
        poolSnapshot,
        0
      )
    );
    setAwayAssignments(
      buildAutoLineup(
        awayFormation.slots,
        selectedMatch.awayClubId,
        selectedMatch.awayClubName,
        selectedMatch.homeClubId,
        selectedMatch.homeClubName,
        poolSnapshot,
        3
      )
    );
  };

  const lockedEntry = selectedMatch ? savedPredictions[selectedMatch.id] : undefined;

  const favoredLabel =
    prediction.favoredSide === 'home'
      ? `${selectedMatch?.homeClubName || 'Home'} Win`
      : prediction.favoredSide === 'away'
      ? `${selectedMatch?.awayClubName || 'Away'} Win`
      : 'Draw Balanced';

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <div>
          <p className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] mb-1 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            World Matches Hub &amp; Tactical Predictor
          </p>
          <h1 className="font-display text-3xl font-semibold text-slate-900 dark:text-slate-50">
            Jadwal Pertandingan Dunia &amp; Prediksi Penempatan XI
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Seret &amp; lepas (drag-and-drop) pemain ke formasi Home atau Away XI untuk menghitung{' '}
            <strong className="text-[#136F73] dark:text-[#2DD4BF]">
              Estimated Match Win Probability
            </strong>{' '}
            dan proyeksi xG secara real-time.
          </p>
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari klub, liga, stadion..."
            aria-label="Cari pertandingan dunia"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#136F73] dark:focus:border-[#2DD4BF]"
          />
        </div>
      </div>

      {/* League & Status Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLeagueFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              leagueFilter === 'all'
                ? 'bg-[#136F73] text-white'
                : 'bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] text-slate-600 dark:text-slate-300 hover:border-[#136F73]'
            }`}
          >
            Semua Liga
          </button>
          {FALLBACK_LEAGUES.map((lg) => (
            <button
              key={lg.id}
              type="button"
              onClick={() => setLeagueFilter(lg.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                leagueFilter === lg.id
                  ? 'bg-[#136F73] text-white'
                  : 'bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] text-slate-600 dark:text-slate-300 hover:border-[#136F73]'
              }`}
            >
              {lg.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setLoadingMatches(true);
              getWorldMatches(leagueFilter).then((res) => {
                setMatches(res);
                setLoadingMatches(false);
                if (res.length > 0 && !res.some((m) => m.id === selectedMatchId)) {
                  setSelectedMatchId(res[0].id);
                }
              });
            }}
            disabled={loadingMatches}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] text-slate-700 dark:text-slate-200 hover:border-[#136F73] transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMatches ? 'animate-spin' : ''}`} />
            Segarkan
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#E4EFED] dark:bg-[#0D1A1C] border border-[#D4E3E0] dark:border-[#1B3335] w-fit shrink-0">
            {(['All', 'Upcoming', 'Live', 'Finished'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-[#136F73] text-white'
                    : 'text-[#486563] dark:text-[#8FB3B0] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st === 'All' ? 'Semua' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Matches Directory Grid */}
      {loadingMatches ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white/60 dark:bg-[#0F1E20]/60"
            />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-[#DCE8E6] dark:border-[#1B3335] text-center text-sm text-slate-500">
          Tidak ada pertandingan yang cocok dengan filter saat ini.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMatches.map((m) => {
            const active = selectedMatch?.id === m.id;
            const userLocked = savedPredictions[m.id];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMatchId(m.id)}
                aria-pressed={active}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  active
                    ? 'border-[#136F73] dark:border-[#2DD4BF] bg-[#EBF5F4] dark:bg-[#112A2C] shadow-sm'
                    : 'border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] hover:border-[#136F73]/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF] truncate">
                    {m.leagueName} · {m.round}
                  </span>
                  <span
                    className={`font-mono-num font-semibold shrink-0 ${
                      m.status === 'Live'
                        ? 'text-rose-600 dark:text-rose-400'
                        : m.status === 'Finished'
                        ? 'text-slate-500'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {m.kickoffDisplay}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {m.homeClubName}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-1">
                      {m.awayClubName}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {m.scoreDisplay ? (
                      <div className="font-mono-num text-base font-bold text-slate-900 dark:text-slate-50 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                        {m.scoreDisplay}
                      </div>
                    ) : (
                      <div className="font-mono-num text-xs font-semibold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                        VS
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate">{m.venue}</span>
                  {userLocked ? (
                    <span className="font-mono-num font-semibold text-[#136F73] dark:text-[#2DD4BF] shrink-0">
                      Tebakan: {userLocked.homeScore}-{userLocked.awayScore}
                    </span>
                  ) : (
                    <span className="text-[#136F73] dark:text-[#2DD4BF] font-medium shrink-0">
                      Buka Simulasi →
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Match Tactical Predictor + Draggable Player Pool + Pitches */}
      {selectedMatch && (
        <div className="space-y-6 pt-2">
          {/* Prediction Telemetry Banner */}
          <section
            data-testid="match-prediction-summary"
            className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-6"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Simulasi Prediksi Berbasis Penempatan Pemain (Drag &amp; Drop XI)
                </div>
                <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1">
                  {selectedMatch.homeClubName} vs {selectedMatch.awayClubName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>
                    {selectedMatch.leagueName} · {selectedMatch.venue} · {selectedMatch.kickoffDisplay}
                  </span>
                  {hydratingSquads && (
                    <span className="inline-flex items-center gap-1 text-[#136F73] dark:text-[#2DD4BF] font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Menyinkronkan skuad klub live...
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Estimated Match Win Probability Score Hero */}
                <div
                  data-testid="estimated-win-probability"
                  className="px-4 py-2 rounded-xl bg-[#EBF5F4] dark:bg-[#112A2C] border border-[#CFE4E2] dark:border-[#1D4446] flex items-center gap-3"
                >
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#136F73] dark:text-[#2DD4BF]">
                      Estimated Match Win Probability
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                      {favoredLabel}
                    </div>
                  </div>
                  <div className="font-mono-num text-2xl font-bold text-[#136F73] dark:text-[#2DD4BF]">
                    {prediction.estimatedWinProbabilityPct}%
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetMatchLineups}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset XI Default
                </button>
              </div>
            </div>

            {/* Probabilities & Projected Score Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span data-testid="home-win-pct" className="text-[#136F73] dark:text-[#2DD4BF]">
                    {selectedMatch.homeShortName} Menang {prediction.homeWinPct}%
                  </span>
                  <span data-testid="draw-pct" className="text-slate-500">
                    Seri {prediction.drawPct}%
                  </span>
                  <span data-testid="away-win-pct" className="text-amber-600 dark:text-amber-400">
                    {selectedMatch.awayShortName} Menang {prediction.awayWinPct}%
                  </span>
                </div>

                {/* Segmented Probability Bar */}
                <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-[#136F73] dark:bg-[#2DD4BF] transition-all duration-300"
                    style={{ width: `${prediction.homeWinPct}%` }}
                  />
                  <div
                    className="h-full bg-slate-400 dark:bg-slate-600 transition-all duration-300"
                    style={{ width: `${prediction.drawPct}%` }}
                  />
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${prediction.awayWinPct}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono-num">
                  <span>
                    xG: <strong className="text-slate-900 dark:text-white">{prediction.projectedHomeXg.toFixed(2)}</strong>
                    {' · '}XI Value: <strong>{formatMarketValue(prediction.homeSquadMarketValueEur)}</strong>
                  </span>
                  <span>
                    Power: <strong className="text-[#136F73] dark:text-[#2DD4BF]">{prediction.homeStrength}</strong> vs{' '}
                    <strong className="text-amber-600 dark:text-amber-400">{prediction.awayStrength}</strong>
                  </span>
                  <span>
                    xG: <strong className="text-slate-900 dark:text-white">{prediction.projectedAwayXg.toFixed(2)}</strong>
                    {' · '}XI Value: <strong>{formatMarketValue(prediction.awaySquadMarketValueEur)}</strong>
                  </span>
                </div>
              </div>

              {/* Algorithmic Predicted Score + User Score Lock */}
              <div className="lg:col-span-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Proyeksi Skor Model</div>
                  <div
                    data-testid="predicted-scoreline"
                    className="font-mono-num text-3xl font-bold text-slate-900 dark:text-slate-50 mt-0.5"
                  >
                    {prediction.predictedScore.home} - {prediction.predictedScore.away}
                  </div>
                </div>

                <div className="text-right space-y-1.5">
                  <div className="text-[11px] text-slate-500">Prediksi Skor Anda</div>
                  <div className="flex items-center justify-end gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      aria-label="Prediksi gol tuan rumah"
                      value={userHomeGuess}
                      onChange={(e) => setUserHomeGuess(Math.max(0, Number(e.target.value)))}
                      className="w-11 px-1.5 py-1 text-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1718] font-mono-num text-sm font-semibold"
                    />
                    <span className="font-mono-num text-slate-400">:</span>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      aria-label="Prediksi gol tim tamu"
                      value={userAwayGuess}
                      onChange={(e) => setUserAwayGuess(Math.max(0, Number(e.target.value)))}
                      className="w-11 px-1.5 py-1 text-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1718] font-mono-num text-sm font-semibold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleLockPrediction}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors"
                  >
                    {lockedEntry ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Terkunci ({lockedEntry.homeScore}-{lockedEntry.awayScore})
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" />
                        Kunci Prediksi
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Key Tactical Insight */}
              <div className="lg:col-span-3 p-4 rounded-xl bg-[#EBF5F4] dark:bg-[#112A2C] border border-[#CFE4E2] dark:border-[#1D4446]">
                <div className="text-[11px] font-semibold text-[#136F73] dark:text-[#2DD4BF] flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" />
                  Analisa Kunci Pertandingan
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed mt-1.5">
                  {prediction.keyInsight}
                </p>
              </div>
            </div>

            {/* 5 Tactical Edge Meters (including Sinergi Pelatih) */}
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${
                prediction.tacticalEdges.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
              } gap-4 pt-2 border-t border-slate-100 dark:border-slate-800`}
            >
              {prediction.tacticalEdges.map((edge) => (
                <div key={edge.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono-num font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                      {edge.homeVal}
                    </span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {edge.label}
                    </span>
                    <span className="font-mono-num font-semibold text-amber-600 dark:text-amber-400">
                      {edge.awayVal}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden">
                    <div
                      className="h-full bg-[#136F73] dark:bg-[#2DD4BF] transition-all duration-300"
                      style={{
                        width: `${Math.round((edge.homeVal / Math.max(1, edge.homeVal + edge.awayVal)) * 100)}%`,
                      }}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{
                        width: `${Math.round((edge.awayVal / Math.max(1, edge.homeVal + edge.awayVal)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Draggable Global Player Pool Strip */}
          <section
            data-testid="draggable-player-pool"
            className="p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-4"
          >
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-[#136F73] dark:text-[#2DD4BF]" />
                  Draggable Player Pool · Tarik Pemain ke Slot Formasi
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Seret kartu pemain di bawah ke lingkaran posisi mana saja di Home XI atau Away XI, atau seret antar-posisi di lapangan untuk bertukar tempat.
                </p>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
                {/* Club scope tabs */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#E4EFED] dark:bg-[#0D1A1C] border border-[#D4E3E0] dark:border-[#1B3335]">
                  {[
                    { id: 'all' as const, label: 'Semua' },
                    { id: 'home' as const, label: selectedMatch.homeShortName },
                    { id: 'away' as const, label: selectedMatch.awayShortName },
                  ].map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setPoolScope(sc.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                        poolScope === sc.id
                          ? 'bg-[#136F73] text-white'
                          : 'text-[#486563] dark:text-[#8FB3B0]'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>

                {/* Position filter */}
                <select
                  aria-label="Filter posisi pool pemain"
                  value={poolPosFilter}
                  onChange={(e) => setPoolPosFilter(e.target.value as typeof poolPosFilter)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-[#0B1718] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="ALL">Semua Posisi</option>
                  <option value="FWD">Penyerang (FWD)</option>
                  <option value="MID">Gelandang (MID)</option>
                  <option value="DEF">Bek (DEF)</option>
                  <option value="GK">Kiper (GK)</option>
                </select>

                {/* Pool Search */}
                <div className="relative w-48 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    placeholder="Cari pemain..."
                    aria-label="Cari pemain untuk drag and drop"
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0B1718] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#136F73]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-2">
              {draggablePoolPlayers.map((p) => (
                <div
                  key={p.fotmobId}
                  data-testid={`pool-player-${p.fotmobId}`}
                  draggable
                  onDragStart={(e) => {
                    const payload: DragPayload = { type: 'pool', playerId: p.fotmobId };
                    setActiveDrag(payload);
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                    e.dataTransfer.setData('text/plain', p.fotmobId);
                  }}
                  onDragEnd={() => {
                    setActiveDrag(null);
                    setDragOverTarget(null);
                  }}
                  title={`Seret ${p.name} ke papan formasi`}
                  className="shrink-0 w-56 p-2.5 rounded-xl border border-[#DCE8E6] dark:border-[#1B3335] bg-[#F7FBFA] dark:bg-[#132628] hover:border-[#136F73] dark:hover:border-[#2DD4BF] cursor-grab active:cursor-grabbing transition-all flex items-center gap-2.5 select-none"
                >
                  <PlayerAvatar fotmobId={p.fotmobId} name={p.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {p.primaryPosition} · {p.club}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono-num mt-0.5">
                      <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                        {formatMarketValue(p.marketValueEur)}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300">
                        ★ {p.stats.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Dual Tactical Placement Pitches (Home XI vs Away XI) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {([
              {
                side: 'home' as const,
                title: selectedMatch.homeClubName,
                tag: 'Tuan Rumah (Home XI)',
                formation: homeFormation,
                formationId: homeFormationId,
                setFormationId: setHomeFormationId,
                mentality: homeMentality,
                setMentality: setHomeMentality,
                manager: homeManager,
                managerId: homeManagerId,
                setManagerId: (id: string) => {
                  userEditedManagersRef.current = true;
                  setHomeManagerId(id);
                },
                synergyPct: prediction.homeManagerSynergyPct,
                assigned: homeAssignedBySlot,
                outOfPositionCount: prediction.homeOutOfPositionCount,
                ringColor: 'bg-teal-500/90',
                badgeColor: 'text-teal-300 border-teal-500/40',
                accentText: 'text-[#136F73] dark:text-[#2DD4BF]',
              },
              {
                side: 'away' as const,
                title: selectedMatch.awayClubName,
                tag: 'Tim Tamu (Away XI)',
                formation: awayFormation,
                formationId: awayFormationId,
                setFormationId: setAwayFormationId,
                mentality: awayMentality,
                setMentality: setAwayMentality,
                manager: awayManager,
                managerId: awayManagerId,
                setManagerId: (id: string) => {
                  userEditedManagersRef.current = true;
                  setAwayManagerId(id);
                },
                synergyPct: prediction.awayManagerSynergyPct,
                assigned: awayAssignedBySlot,
                outOfPositionCount: prediction.awayOutOfPositionCount,
                ringColor: 'bg-amber-500/90',
                badgeColor: 'text-amber-300 border-amber-500/40',
                accentText: 'text-amber-600 dark:text-amber-400',
              },
            ]).map((team) => (
              <section
                key={team.side}
                data-testid={`match-pitch-${team.side}`}
                className="p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className={`text-[11px] font-semibold flex items-center gap-1.5 ${team.accentText}`}>
                      <Swords className="w-3.5 h-3.5" />
                      {team.tag}
                      {team.outOfPositionCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-500 font-medium ml-1">
                          <AlertTriangle className="w-3 h-3" />
                          {team.outOfPositionCount} OOP
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {team.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Formasi ${team.title}`}
                      value={team.formationId}
                      onChange={(e) => team.setFormationId(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-[#0B1718] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    >
                      {TACTICAL_FORMATIONS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label={`Mentalitas taktik ${team.title}`}
                      value={team.mentality}
                      onChange={(e) => team.setMentality(e.target.value as MatchMentality)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-[#0B1718] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    >
                      {MENTALITIES.map((mt) => (
                        <option key={mt} value={mt}>
                          {mt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Manager Parameter Selector + Synergy Telemetry */}
                {managers.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B1718] border border-slate-200/80 dark:border-slate-800">
                    <select
                      aria-label={`Pelatih ${team.title}`}
                      value={team.manager?.id || team.managerId}
                      onChange={(e) => team.setManagerId(e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#0F1E20] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    >
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.managerName} · {m.clubName} ({m.primaryFormation})
                        </option>
                      ))}
                    </select>
                    {team.manager && (
                      <div className="flex items-center gap-2.5 text-[11px] font-mono-num shrink-0 px-1">
                        <span className="text-slate-500">
                          PPG {(team.manager.pointsPerGame ?? 1.8).toFixed(2)}
                        </span>
                        <span className="text-slate-500">
                          Win {(team.manager.winRatePct ?? 54).toFixed(0)}%
                        </span>
                        {team.synergyPct !== undefined && (
                          <span className={`font-bold ${team.accentText}`}>
                            XI Synergy {team.synergyPct}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2D Interactive Dropzone Pitch for Team XI */}
                <div className="relative w-full aspect-[4/4.6] sm:aspect-[16/14] rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-[#0F2A1D] select-none shadow-inner">
                  <svg
                    viewBox="0 0 100 115"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
                  >
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <rect
                        key={idx}
                        x="0"
                        y={idx * 11.5}
                        width="100"
                        height="11.5"
                        fill={idx % 2 === 0 ? '#133524' : '#0E281B'}
                      />
                    ))}
                    <rect
                      x="4"
                      y="4"
                      width="92"
                      height="107"
                      fill="none"
                      stroke="#A7F3D0"
                      strokeWidth="0.45"
                    />
                    <line x1="4" y1="57.5" x2="96" y2="57.5" stroke="#A7F3D0" strokeWidth="0.4" />
                    <circle cx="50" cy="57.5" r="10.5" fill="none" stroke="#A7F3D0" strokeWidth="0.4" />
                    <rect x="24" y="4" width="52" height="17" fill="none" stroke="#A7F3D0" strokeWidth="0.4" />
                    <rect x="24" y="94" width="52" height="17" fill="none" stroke="#A7F3D0" strokeWidth="0.4" />
                  </svg>

                  {team.formation.slots.map((slot) => {
                    const coords =
                      team.mentality === 'High Press' ? slot.outOfPossession : slot.inPossession;
                    const player = team.assigned[slot.slotId];
                    const isOver =
                      dragOverTarget?.side === team.side && dragOverTarget?.slotId === slot.slotId;
                    const fitQuality = player
                      ? evaluateSlotFit(player.primaryPosition, slot.positionGroup)
                      : 'natural';

                    return (
                      <button
                        key={`${team.side}-${slot.slotId}`}
                        type="button"
                        data-testid={`pitch-slot-${team.side}-${slot.slotId}`}
                        draggable={Boolean(player)}
                        onDragStart={(e) => {
                          if (!player) return;
                          const payload: DragPayload = {
                            type: 'slot',
                            side: team.side,
                            slotId: slot.slotId,
                            playerId: player.fotmobId,
                          };
                          setActiveDrag(payload);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('application/json', JSON.stringify(payload));
                        }}
                        onDragEnd={() => {
                          setActiveDrag(null);
                          setDragOverTarget(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setDragOverTarget({ side: team.side, slotId: slot.slotId });
                        }}
                        onDragLeave={() => {
                          setDragOverTarget((curr) =>
                            curr?.side === team.side && curr?.slotId === slot.slotId ? null : curr
                          );
                        }}
                        onDrop={(e) => handleDropOnSlot(e, team.side, slot.slotId)}
                        onClick={() => setSummoningTarget({ side: team.side, slot })}
                        aria-label={`Tempatkan pemain ${team.side === 'home' ? 'Home' : 'Away'} ${slot.label}${
                          player ? ` saat ini ${player.name}` : ' kosong'
                        }`}
                        style={{
                          left: `${coords.x}%`,
                          top: `${coords.y}%`,
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 group flex flex-col items-center focus:outline-none z-10 ${
                          isOver ? 'scale-125 z-20' : ''
                        }`}
                      >
                        {player ? (
                          <div className="relative scale-90 sm:scale-95 pointer-events-none">
                            <div
                              className={`p-0.5 rounded-full ${
                                isOver
                                  ? 'ring-4 ring-white bg-[#2DD4BF]'
                                  : fitQuality === 'outOfPosition'
                                  ? 'bg-rose-500'
                                  : team.ringColor
                              } group-hover:scale-110 transition-transform shadow-md`}
                            >
                              <PlayerAvatar fotmobId={player.fotmobId} name={player.name} size="sm" />
                            </div>
                            <span
                              className={`absolute -top-1.5 -right-2 px-1 py-0.5 rounded bg-slate-950/90 text-[9px] font-mono-num font-semibold border ${
                                fitQuality === 'outOfPosition'
                                  ? 'text-rose-300 border-rose-500/60'
                                  : team.badgeColor
                              }`}
                            >
                              {player.stats.rating.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <div
                            className={`w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center transition-colors pointer-events-none ${
                              isOver
                                ? 'border-white bg-[#136F73] text-white scale-110'
                                : 'border-teal-300/70 bg-slate-950/60 text-teal-200'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <div className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/85 border border-white/10 text-center max-w-[76px] sm:max-w-[96px] pointer-events-none">
                          <div className="text-[10px] font-semibold text-white truncate">
                            {player ? player.name.split(' ').slice(-1)[0] : slot.label}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Compact Clickable Lineup List */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                  {team.formation.slots.map((slot) => {
                    const p = team.assigned[slot.slotId];
                    return (
                      <div
                        key={`list-${team.side}-${slot.slotId}`}
                        className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() => p && onOpenPlayer(p)}
                          className="truncate text-left font-medium text-slate-800 dark:text-slate-200 hover:text-[#136F73] dark:hover:text-[#2DD4BF]"
                        >
                          <span className="font-mono-num text-slate-400 mr-1">{slot.label}</span>
                          {p ? p.name.split(' ').slice(-1)[0] : '—'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSummoningTarget({ side: team.side, slot })}
                          className={`font-semibold shrink-0 hover:underline ${team.accentText}`}
                        >
                          Ganti
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Summon Global Player Modal for Match Predictor */}
      {summoningTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setSummoningTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Tempatkan pemain untuk slot ${summoningTarget.slot.roleTitle}`}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#DCE8E6] dark:border-[#1B3335] flex items-center justify-between">
              <div>
                <div className="text-xs text-[#136F73] dark:text-[#2DD4BF] font-semibold">
                  Penempatan Pemain · {summoningTarget.side === 'home' ? 'Home XI' : 'Away XI'}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Slot {summoningTarget.slot.label} · {summoningTarget.slot.roleTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSummoningTarget(null)}
                aria-label="Tutup modal penempatan pemain"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={summonQuery}
                onChange={(e) => setSummonQuery(e.target.value)}
                placeholder="Cari pemain dunia (misal: Mbappé, Rodri, Saka)..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {summonPool.map((p) => (
                <button
                  key={p.fotmobId}
                  type="button"
                  onClick={() => handlePlacePlayer(p)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar fotmobId={p.fotmobId} name={p.name} size="sm" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.club} · {p.primaryPosition} · {p.roleTag}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-xs shrink-0">
                    <div className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                      {p.stats.rating.toFixed(2)}
                    </div>
                    <div className="text-slate-500">{formatMarketValue(p.marketValueEur)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
