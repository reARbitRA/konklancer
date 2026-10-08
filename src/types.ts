export type PlatformKey = 'all' | 'ponisha' | 'karlancer' | 'parskoders' | 'global';

export type CategoryKey = 'all' | 'scraping' | 'telegram' | 'data' | 'api' | 'automation';

export interface FreelanceJob {
  id: string;
  platform: string;
  platformKey: 'ponisha' | 'karlancer' | 'parskoders' | 'global';
  title: string;
  clientName: string;
  clientRating: number;
  clientReviews: number;
  budget: number;
  budgetFormatted: string;
  deadline: string;
  postedTime: string;
  category: string;
  categoryKey: CategoryKey;
  tags: string[];
  description: string;
  proposalsCount: number;
  avgBid: number;
  status: 'new' | 'bidded' | 'in_progress' | 'ready' | 'completed';
  aiAnalysis?: AIAnalysis;
  proposal?: string;
  proposedPrice?: number;
  generatedFiles?: Record<string, string>;
  repoUrl?: string;
}

export interface AIAnalysis {
  automatabilityScore: number;
  recommendedBid: number;
  recommendedBidFormatted: string;
  suggestedDuration: string;
  technicalStack: string[];
  feasibilityReason: string;
  riskLevel: 'low' | 'medium' | 'high';
  winProbability: string;
  suggestedKicker: string;
}

export interface ProposalResult {
  proposal: string;
  proposedPrice: number;
  proposedPriceFormatted: string;
  deliveryTime: string;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'scan' | 'bid' | 'code' | 'github' | 'payment';
  message: string;
  meta?: string;
}

export interface UserSettings {
  githubToken: string;
  defaultDiscountRate: number; // e.g. 15 (%)
  autoBidThreshold: number; // e.g. 85 (%)
  cyborgMode: boolean;
  preferredTone: 'friendly_expert' | 'direct_urgent' | 'technical_detailed';
  dailyEarningsGoal: number; // Toman
}
