import { MarketState } from '@ghostfolio/api/services/interfaces/interfaces';
import { AssetClass, DataSource } from '@prisma/client';

export interface Position {
  assetClass: AssetClass;
  averagePrice: number;
  currency: string;
  dataSource: DataSource;
  firstBuyDate: string;
  grossPerformance?: number;
  grossPerformancePercentage?: number;
  investment: number;
  investmentInOriginalCurrency?: number;
  marketPrice?: number;
  marketState?: MarketState;
  name?: string;
  netPerformance?: number;
  netPerformancePercentage?: number;
  quantity: number;
  symbol: string;
  transactionCount: number;
  url?: string;
}
