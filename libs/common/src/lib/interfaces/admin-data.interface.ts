export interface AdminData {
  dataGatheringProgress?: number;
  exchangeRates: { label1: string; label2: string; value: number }[];
  lastDataGathering?: Date | 'IN_PROGRESS';
  settings: { [key: string]: boolean | object | string | string[] };
  transactionCount: number;
  userCount: number;
  users: {
    accountCount: number;
    alias: string;
    createdAt: Date;
    engagement: number;
    id: string;
    lastActivity: Date;
    transactionCount: number;
  }[];
}
