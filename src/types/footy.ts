export type ArticleCategory =
  | 'Bedah Taktik'
  | 'Analisa Pemain'
  | 'Market Value'
  | 'Kecocokan Tim & Pelatih';

export type PreferredFoot = 'Right' | 'Left' | 'Both';

export interface PlayerSeasonStats {
  rating: number;
  minutes: number;
  appearances: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  keyPassesPer90: number;
  progressiveCarriesPer90: number;
  tacklesInterceptionsPer90: number;
  passAccuracy: number;
}

export interface PlayerRadarPercentiles {
  attacking: number;
  creativity: number;
  progression: number;
  defending: number;
  workrate: number;
  efficiency: number;
}

export interface MarketValuePoint {
  date: string;
  valueEur: number;
  club: string;
}

export interface TransferRecord {
  date: string;
  season: string;
  fromClub: string;
  toClub: string;
  feeEur: number | null;
  feeLabel: string;
  type: 'Permanent' | 'Loan' | 'Free' | 'Youth Promotion';
}

export interface Player {
  fotmobId: string;
  tmId: string;
  name: string;
  nationality: string;
  age: number;
  heightCm: number;
  preferredFoot: PreferredFoot;
  primaryPosition: string;
  secondaryPositions: string[];
  roleTag: string;
  club: string;
  clubId: string;
  league: string;
  contractUntil: string;
  marketValueEur: number;
  marketValueChangePct: number;
  highestMarketValueEur: number;
  highestMarketValueDate: string;
  syncedToSheets: boolean;
  stats: PlayerSeasonStats;
  radar: PlayerRadarPercentiles;
  marketValueHistory: MarketValuePoint[];
  transferHistory: TransferRecord[];
  recentMatches?: MatchRatingPoint[];
}

export interface MatchRatingPoint {
  id: string;
  date: string;
  competition: string;
  opponent: string;
  homeAway: 'H' | 'A';
  score: string;
  rating: number;
  minutes: number;
  goals: number;
  assists: number;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: ArticleCategory;
  author: string;
  publishedAt: string;
  coverImage: string;
  formationTag: string;
  tags: string[];
  featured?: boolean;
  content: string;
}

export interface TacticalParameters {
  pressingIntensity: number; // 0-100
  possessionFocus: number; // 0-100
  transitionSpeed: number; // 0-100
  buildUpStyle: number; // 0-100 (0 = direct long, 100 = short patient)
  defensiveLine: number; // 0-100 (0 = deep block, 100 = ultra high line)
  aerialPhysicality: number; // 0-100
}

export interface TeamManagerProfile extends TacticalParameters {
  id: string;
  managerName: string;
  clubName: string;
  league: string;
  primaryFormation: string;
  tacticalSummary: string;
}

export interface LeagueClub {
  id: string;
  name: string;
  shortName: string;
  leagueId: string;
  position: number;
  points: number;
  manager: string;
  formation: string;
  squadPlayerIds: string[];
}

export interface LeagueInfo {
  id: string;
  name: string;
  country: string;
  tier: string;
  clubs: LeagueClub[];
}

export interface TransferTickerItem {
  id: string;
  playerFotmobId: string;
  playerName: string;
  position: string;
  age: number;
  fromClub: string;
  toClub: string;
  feeLabel: string;
  status: 'Confirmed' | 'Advanced Talks' | 'Rumor';
  reliability: string;
  updatedAt: string;
}

export interface FormationSlot {
  slotId: string;
  label: string;
  roleTitle: string;
  positionGroup: 'GK' | 'DEF' | 'MID' | 'FWD';
  inPossession: { x: number; y: number };
  outOfPossession: { x: number; y: number };
}

export interface TacticalFormation {
  id: string;
  name: string;
  description: string;
  slots: FormationSlot[];
}

export interface TacticalFitResult {
  overallScore: number;
  subScores: {
    systemFit: number;
    roleCompatibility: number;
    physicalPressingDemand: number;
    marketValueROI: number;
  };
  strengths: string[];
  risks: string[];
  similarPlayers: Array<{
    player: Player;
    similarityScore: number;
    reason: string;
  }>;
}

export interface SquadBalanceReport {
  filledCount: number;
  averageAge: number;
  totalMarketValueEur: number;
  balanceScore: number;
  lineRatings: {
    attack: number;
    midfield: number;
    defense: number;
  };
  pressingReadiness: number;
  warnings: string[];
}

export interface GlobalSearchResult {
  players: Player[];
  clubs: Array<{
    id: string;
    name: string;
    leagueId: string;
    leagueName: string;
    manager: string;
  }>;
  source: 'hybrid-sheets-proxy' | 'local-cache';
}

export type MatchMentality = 'Balanced' | 'High Press' | 'Counter Block';

export interface WorldMatch {
  id: string;
  leagueId: string;
  leagueName: string;
  country: string;
  round: string;
  kickoffIso: string;
  kickoffDisplay: string;
  status: 'Upcoming' | 'Live' | 'Finished';
  venue: string;
  scoreDisplay?: string;
  homeClubId: string;
  homeClubName: string;
  homeShortName: string;
  homeFormation: string;
  awayClubId: string;
  awayClubName: string;
  awayShortName: string;
  awayFormation: string;
}

export interface MatchPredictionResult {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  projectedHomeXg: number;
  projectedAwayXg: number;
  predictedScore: {
    home: number;
    away: number;
  };
  homeStrength: number;
  awayStrength: number;
  tacticalEdges: Array<{
    label: string;
    homeVal: number;
    awayVal: number;
    winner: 'home' | 'away' | 'even';
  }>;
  keyInsight: string;
}

