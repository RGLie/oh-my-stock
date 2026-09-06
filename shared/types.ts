export type Holding = {
  id: string;
  symbol: string;
  name: string;
  currency: "USD" | "KRW";
  quantity: string;
  averageCost: string;
  price: string | null;
  priceAt: string | null;
  source: "manual" | "toss";
  account: string;
  sector: string;
  assetType: string;
  thesis: string;
  targetWeight: string | null;
  updatedAt: string;
};
export type ValuedHolding = Holding & {
  value: string | null;
  cost: string;
  pnl: string | null;
  returnPct: string | null;
  weight: string | null;
  stale: boolean;
};
export type Evidence = {
  id: string;
  title: string;
  url: string;
  body: string;
  category: string;
  symbols: string[];
  publishedAt: string | null;
  retrievedAt: string;
  coverage: "full" | "headline" | "user";
  hash: string;
};
export type Policy = {
  horizon: string;
  principles: string;
  maxPosition: string;
  cashFloor: string;
  monthlyContribution: string;
};
export type InvestorProfile = {
  riskTolerance:
    "unspecified" | "conservative" | "balanced" | "growth" | "aggressive";
  experience: "unspecified" | "beginner" | "intermediate" | "experienced";
  goal: string;
  targetAmount: string;
  targetCurrency: "USD" | "KRW";
  targetDate: string;
  maxDrawdown: string;
  liquidityNeeds: string;
  restrictions: string;
};
export type BriefWindow = {
  date: string;
  timezone: "Asia/Seoul";
  asOf: string;
  dayStartAt: string;
  dayEndAt: string;
  lookaheadEndAt: string;
};
export type DailyBrief = {
  date: string;
  marketStatus: string;
  indices: {
    name: string;
    value: string;
    change: string;
    asOf: string;
    evidenceIds: string[];
  }[];
  events: {
    title: string;
    scheduledAt: string | null;
    timing: string;
    category: "economic" | "earnings" | "market" | "other";
    status: "confirmed" | "tentative";
    symbols: string[];
    portfolioImpact: string;
    evidenceIds: string[];
  }[];
  priorities: string[];
};
export type RunPhase =
  "connecting" | "researching" | "composing" | "validating";
export type RunEvent = { at: string; kind: string; message: string };
export type ProviderProgress = {
  stage: string;
  toolCount: number;
  phase?: RunPhase;
  actualModel?: string;
  lastEventAt?: string;
  event?: RunEvent;
};
export type AnalysisTrace = {
  jobId: string;
  provider: string;
  startedAt: string;
  finishedAt: string | null;
  dispatchedAt: string | null;
  request: {
    prompt: string;
    commonInstructions: string;
    template: string;
    userQuestion: string;
    model: string;
    effort: string;
    autoResearch: boolean;
    outputSchema: unknown;
    snapshot: unknown;
    evidence: Evidence[];
    parentJobId?: string;
  };
  responseText: string | null;
  responseReceivedAt: string | null;
  events: RunEvent[];
  droppedEvents: number;
  error: string | null;
};
export type HistoryItem = Pick<
  AnalysisJob,
  | "id"
  | "title"
  | "skill"
  | "prompt"
  | "status"
  | "createdAt"
  | "target"
  | "autoResearch"
  | "parentJobId"
  | "briefWindow"
> & {
  runs: Pick<
    AnalysisRun,
    | "provider"
    | "model"
    | "actualModel"
    | "effort"
    | "status"
    | "startedAt"
    | "finishedAt"
  >[];
};
export type Provider = {
  id: "codex" | "claude";
  name: string;
  available: boolean;
  authenticated: boolean | null;
  version: string | null;
  message: string;
  models: string[];
  modelEfforts?: Record<string, string[]>;
};
export type AnalysisResult = {
  dailyBrief?: DailyBrief | null;
  summary: string;
  facts: { statement: string; evidenceIds: string[] }[];
  impacts: string[];
  counterarguments: string[];
  actions: string[];
  unknowns: string[];
  reviewConditions: string[];
  headline?: string;
  highlights?: string[];
  metrics?: {
    label: string;
    value: string;
    context: string;
    evidenceIds: string[];
  }[];
  sources?: {
    id: string;
    title: string;
    url: string;
    publishedAt: string;
    coverage: string;
  }[];
};
export type AnalysisRun = {
  phase?: RunPhase;
  heartbeatAt?: string;
  lastEventAt?: string;
  provider: string;
  model: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result: AnalysisResult | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  validation: string[];
  effort?: string;
  actualModel?: string;
  stage?: string;
  toolCount?: number;
};
export type AnalysisJob = {
  commonInstructions?: string;
  briefWindow?: BriefWindow;
  id: string;
  title: string;
  skill: string;
  prompt: string;
  status: string;
  createdAt: string;
  snapshotId: string;
  evidenceIds: string[];
  evidence: Evidence[];
  snapshot: unknown;
  runs: AnalysisRun[];
  inputHash: string;
  autoResearch?: boolean;
  target?: string;
  template?: string;
  parentJobId?: string;
};
export type JournalEntry = {
  id: string;
  title: string;
  body: string;
  symbol: string;
  decision: string;
  reviewDate: string;
  createdAt: string;
  jobId?: string;
};
export type Snapshot = {
  id: string;
  at: string;
  usd: string | null;
  krw: string | null;
  complete: boolean;
  composition: string;
};
export type Summary = {
  usd: string | null;
  krw: string | null;
  costUsd: string | null;
  pnlUsd: string | null;
  returnPct: string | null;
  complete: boolean;
  cashKnown: boolean;
  cashUsd: string;
  cashKrw: string;
  holdings: ValuedHolding[];
  fxRate?: string | null;
};
export type AppState = {
  serverNow?: string;
  profile: InvestorProfile;
  holdings: Holding[];
  summary: Summary;
  snapshots: Snapshot[];
  evidence: Evidence[];
  jobs: AnalysisJob[];
  journal: JournalEntry[];
  policy: Policy;
  settings: {
    cashUsd: string;
    cashKrw: string;
    cashKnown: boolean;
    models: { codex: string; claude: string };
    efforts?: { codex: string; claude: string };
    accountSeq: string;
  };
  connection: {
    configured: boolean;
    status: string;
    lastSync: string | null;
    message: string;
    accounts: { id: string; label: string }[];
  };
  fx: { rate: string; at: string } | null;
  providers: Provider[];
  csrf: string;
  templates?: Record<string, string>;
  stream?: { status: string; lastMessage: string | null };
};
