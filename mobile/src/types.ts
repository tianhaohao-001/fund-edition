export type Language = 'zh-CN' | 'en-US';

export interface Member {
  id: string;
  name: string;
  role: string;
  duty: string;
  desk: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  name?: string;
  source?: string;
  responseId?: string;
  model?: string;
  language?: Language;
}

export interface Portfolio {
  cash: number;
  equity: number;
  returnPercent?: number;
  positions: Array<{ symbol: string; quantity: number; marketValue: number }>;
}

export interface Run {
  id: string;
  provider: string;
  decision: { action: string; symbol: string; targetWeightPercent: number; summary: string; reconsider: string };
  execution: { status: string; reason: string; quantity: number; price: number | null };
  reviews: Array<{ id: string; name: string; role: string; summary: string; source?: string }>;
  evidence: Array<{ id: string; label: string; value: string; source: string }>;
  policy: { checks: Array<{ id: string; label: string; status: string; detail: string }> };
  portfolio: Portfolio;
}

export interface Fund {
  id: string;
  name: string;
  mandate: string;
  maxWeightPercent: number;
  scenarioId: string;
  team: Member[];
  chat: Message[];
  runs: Run[];
  portfolio: Portfolio;
  permissions: { allowBuy: boolean; allowSell: boolean; allowedSymbols: string[] };
}

export interface Blueprint {
  id: string;
  name: string;
  summary: string;
  authorizationSummary: string;
  maxWeightPercent: number;
  roster: Array<{ id: string; duty: string }>;
}

export interface CatalogEntry {
  id: string;
  section: 'market' | 'persona';
  name: string;
  reference: string;
  ticker?: string;
  category: string;
  summary: string;
  limitations: string;
  approach: string[];
  team: Array<{ role: string; name: string; duty: string }>;
  sources: Array<{ title: string; url: string }>;
  localized?: Partial<Record<Language, Partial<CatalogEntry>>>;
}

export interface Workspace {
  contractVersion: string;
  provider: { enabled: boolean; chatEnabled?: boolean; committeeEnabled?: boolean; model: string | null };
  fund: Fund;
  funds: Fund[];
  selectedFundId: string;
  guide: { phase: string; draft: Blueprint | null; fundId: string | null; messages: Message[] };
  catalog: CatalogEntry[];
  catalogChats: Record<string, Message[]>;
  catalogAccounts: Record<string, { cash: number; cashCents: number; unitsMicros: number; history: Array<{ side: string; amount: number }> }>;
  catalogBacktests: Record<string, unknown>;
  scenarios: Array<{ id: string; title: string; symbol: string; summary: string }>;
}

export interface MobileAction {
  action: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface ScreenProps {
  workspace: Workspace;
  language: Language;
  busy: boolean;
  act: (action: MobileAction) => Promise<Workspace>;
  refresh: () => Promise<void>;
  transcribe: (uri: string, mimeType: string) => Promise<string>;
  speak: (text: string) => void;
}
