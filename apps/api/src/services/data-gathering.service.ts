import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile.service';
import {
  PROPERTY_LAST_DATA_GATHERING,
  PROPERTY_LOCKED_DATA_GATHERING
} from '@ghostfolio/common/config';
import { DATE_FORMAT, resetHours } from '@ghostfolio/common/helper';
import { UniqueAsset } from '@ghostfolio/common/interfaces';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from '@prisma/client';
import {
  differenceInHours,
  format,
  getDate,
  getMonth,
  getYear,
  isBefore,
  subDays
} from 'date-fns';

import { DataProviderService } from './data-provider/data-provider.service';
import { DataEnhancerInterface } from './data-provider/interfaces/data-enhancer.interface';
import { ExchangeRateDataService } from './exchange-rate-data.service';
import { IDataGatheringItem } from './interfaces/interfaces';
import { PrismaService } from './prisma.service';

@Injectable()
export class DataGatheringService {
  private dataGatheringProgress: number;

  public constructor(
    @Inject('DataEnhancers')
    private readonly dataEnhancers: DataEnhancerInterface[],
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly prismaService: PrismaService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  public async gather7Days() {
    const isDataGatheringNeeded = await this.isDataGatheringNeeded();

    if (isDataGatheringNeeded) {
      Logger.log('7d data gathering has been started.', 'DataGatheringService');
      console.time('data-gathering-7d');

      await this.prismaService.property.create({
        data: {
          key: PROPERTY_LOCKED_DATA_GATHERING,
          value: new Date().toISOString()
        }
      });

      const symbols = await this.getSymbols7D();

      try {
        await this.gatherSymbols(symbols);

        await this.prismaService.property.upsert({
          create: {
            key: PROPERTY_LAST_DATA_GATHERING,
            value: new Date().toISOString()
          },
          update: { value: new Date().toISOString() },
          where: { key: PROPERTY_LAST_DATA_GATHERING }
        });
      } catch (error) {
        Logger.error(error, 'DataGatheringService');
      }

      await this.prismaService.property.delete({
        where: {
          key: PROPERTY_LOCKED_DATA_GATHERING
        }
      });

      Logger.log(
        '7d data gathering has been completed.',
        'DataGatheringService'
      );
      console.timeEnd('data-gathering-7d');
    }
  }

  public async gatherMax() {
    const isDataGatheringLocked = await this.prismaService.property.findUnique({
      where: { key: PROPERTY_LOCKED_DATA_GATHERING }
    });

    if (!isDataGatheringLocked) {
      Logger.log(
        'Max data gathering has been started.',
        'DataGatheringService'
      );
      console.time('data-gathering-max');

      await this.prismaService.property.create({
        data: {
          key: PROPERTY_LOCKED_DATA_GATHERING,
          value: new Date().toISOString()
        }
      });

      const symbols = await this.getSymbolsMax();

      try {
        await this.gatherSymbols(symbols);

        await this.prismaService.property.upsert({
          create: {
            key: PROPERTY_LAST_DATA_GATHERING,
            value: new Date().toISOString()
          },
          update: { value: new Date().toISOString() },
          where: { key: PROPERTY_LAST_DATA_GATHERING }
        });
      } catch (error) {
        Logger.error(error, 'DataGatheringService');
      }

      await this.prismaService.property.delete({
        where: {
          key: PROPERTY_LOCKED_DATA_GATHERING
        }
      });

      Logger.log(
        'Max data gathering has been completed.',
        'DataGatheringService'
      );
      console.timeEnd('data-gathering-max');
    }
  }

  public async gatherSymbol({ dataSource, symbol }: UniqueAsset) {
    const isDataGatheringLocked = await this.prismaService.property.findUnique({
      where: { key: PROPERTY_LOCKED_DATA_GATHERING }
    });

    if (!isDataGatheringLocked) {
      Logger.log(
        `Symbol data gathering for ${symbol} has been started.`,
        'DataGatheringService'
      );
      console.time('data-gathering-symbol');

      await this.prismaService.property.create({
        data: {
          key: PROPERTY_LOCKED_DATA_GATHERING,
          value: new Date().toISOString()
        }
      });

      const symbols = (await this.getSymbolsMax()).filter(
        (dataGatheringItem) => {
          return (
            dataGatheringItem.dataSource === dataSource &&
            dataGatheringItem.symbol === symbol
          );
        }
      );

      try {
        await this.gatherSymbols(symbols);

        await this.prismaService.property.upsert({
          create: {
            key: PROPERTY_LAST_DATA_GATHERING,
            value: new Date().toISOString()
          },
          update: { value: new Date().toISOString() },
          where: { key: PROPERTY_LAST_DATA_GATHERING }
        });
      } catch (error) {
        Logger.error(error, 'DataGatheringService');
      }

      await this.prismaService.property.delete({
        where: {
          key: PROPERTY_LOCKED_DATA_GATHERING
        }
      });

      Logger.log(
        `Symbol data gathering for ${symbol} has been completed.`,
        'DataGatheringService'
      );
      console.timeEnd('data-gathering-symbol');
    }
  }

  public async gatherSymbolForDate({
    dataSource,
    date,
    symbol
  }: {
    dataSource: DataSource;
    date: Date;
    symbol: string;
  }) {
    try {
      const historicalData = await this.dataProviderService.getHistoricalRaw(
        [{ dataSource, symbol }],
        date,
        date
      );

      const marketPrice =
        historicalData[symbol][format(date, DATE_FORMAT)].marketPrice;

      if (marketPrice) {
        return await this.prismaService.marketData.upsert({
          create: {
            dataSource,
            date,
            marketPrice,
            symbol
          },
          update: { marketPrice },
          where: { date_symbol: { date, symbol } }
        });
      }
    } catch (error) {
      Logger.error(error, 'DataGatheringService');
    } finally {
      return undefined;
    }
  }

  public async gatherProfileData(aDataGatheringItems?: IDataGatheringItem[]) {
    Logger.log(
      'Profile data gathering has been started.',
      'DataGatheringService'
    );
    console.time('data-gathering-profile');

    let dataGatheringItems = aDataGatheringItems?.filter(
      (dataGatheringItem) => {
        return dataGatheringItem.dataSource !== 'MANUAL';
      }
    );

    if (!dataGatheringItems) {
      dataGatheringItems = await this.getSymbolsProfileData();
    }

    const assetProfiles = await this.dataProviderService.getAssetProfiles(
      dataGatheringItems
    );
    const symbolProfiles = await this.symbolProfileService.getSymbolProfiles(
      dataGatheringItems.map(({ symbol }) => {
        return symbol;
      })
    );

    for (const [symbol, assetProfile] of Object.entries(assetProfiles)) {
      const symbolMapping = symbolProfiles.find((symbolProfile) => {
        return symbolProfile.symbol === symbol;
      })?.symbolMapping;

      for (const dataEnhancer of this.dataEnhancers) {
        try {
          assetProfiles[symbol] = await dataEnhancer.enhance({
            response: assetProfile,
            symbol: symbolMapping?.[dataEnhancer.getName()] ?? symbol
          });
        } catch (error) {
          Logger.error(
            `Failed to enhance data for symbol ${symbol} by ${dataEnhancer.getName()}`,
            error,
            'DataGatheringService'
          );
        }
      }

      const {
        assetClass,
        assetSubClass,
        countries,
        currency,
        dataSource,
        name,
        sectors,
        url
      } = assetProfiles[symbol];

      try {
        await this.prismaService.symbolProfile.upsert({
          create: {
            assetClass,
            assetSubClass,
            countries,
            currency,
            dataSource,
            name,
            sectors,
            symbol,
            url
          },
          update: {
            assetClass,
            assetSubClass,
            countries,
            currency,
            name,
            sectors,
            url
          },
          where: {
            dataSource_symbol: {
              dataSource,
              symbol
            }
          }
        });
      } catch (error) {
        Logger.error(
          `${symbol}: ${error?.meta?.cause}`,
          error,
          'DataGatheringService'
        );
      }
    }

    Logger.log(
      'Profile data gathering has been completed.',
      'DataGatheringService'
    );
    console.timeEnd('data-gathering-profile');
  }

  public async gatherSymbols(aSymbolsWithStartDate: IDataGatheringItem[]) {
    let hasError = false;
    let symbolCounter = 0;

    for (const { dataSource, date, symbol } of aSymbolsWithStartDate) {
      if (dataSource === 'MANUAL') {
        continue;
      }

      this.dataGatheringProgress = symbolCounter / aSymbolsWithStartDate.length;

      try {
        const historicalData = await this.dataProviderService.getHistoricalRaw(
          [{ dataSource, symbol }],
          date,
          new Date()
        );

        let currentDate = date;
        let lastMarketPrice: number;

        while (
          isBefore(
            currentDate,
            new Date(
              Date.UTC(
                getYear(new Date()),
                getMonth(new Date()),
                getDate(new Date()),
                0
              )
            )
          )
        ) {
          if (
            historicalData[symbol]?.[format(currentDate, DATE_FORMAT)]
              ?.marketPrice
          ) {
            lastMarketPrice =
              historicalData[symbol]?.[format(currentDate, DATE_FORMAT)]
                ?.marketPrice;
          }

          if (lastMarketPrice) {
            try {
              await this.prismaService.marketData.create({
                data: {
                  dataSource,
                  symbol,
                  date: currentDate,
                  marketPrice: lastMarketPrice
                }
              });
            } catch {}
          } else {
            Logger.warn(
              `Failed to gather data for symbol ${symbol} from ${dataSource} at ${format(
                currentDate,
                DATE_FORMAT
              )}.`,
              'DataGatheringService'
            );
          }

          // Count month one up for iteration
          currentDate = new Date(
            Date.UTC(
              getYear(currentDate),
              getMonth(currentDate),
              getDate(currentDate) + 1,
              0
            )
          );
        }
      } catch (error) {
        hasError = true;
        Logger.error(error, 'DataGatheringService');
      }

      if (symbolCounter > 0 && symbolCounter % 100 === 0) {
        Logger.log(
          `Data gathering progress: ${(
            this.dataGatheringProgress * 100
          ).toFixed(2)}%`,
          'DataGatheringService'
        );
      }

      symbolCounter += 1;
    }

    await this.exchangeRateDataService.initialize();

    if (hasError) {
      throw '';
    }
  }

  public async getDataGatheringProgress() {
    const isInProgress = await this.getIsInProgress();

    if (isInProgress) {
      return this.dataGatheringProgress;
    }

    return undefined;
  }

  public async getIsInProgress() {
    return await this.prismaService.property.findUnique({
      where: { key: PROPERTY_LOCKED_DATA_GATHERING }
    });
  }

  public async getLastDataGathering() {
    const lastDataGathering = await this.prismaService.property.findUnique({
      where: { key: PROPERTY_LAST_DATA_GATHERING }
    });

    if (lastDataGathering?.value) {
      return new Date(lastDataGathering.value);
    }

    return undefined;
  }

  public async getSymbolsMax(): Promise<IDataGatheringItem[]> {
    const startDate =
      (
        await this.prismaService.order.findFirst({
          orderBy: [{ date: 'asc' }]
        })
      )?.date ?? new Date();

    const currencyPairsToGather = this.exchangeRateDataService
      .getCurrencyPairs()
      .map(({ dataSource, symbol }) => {
        return {
          dataSource,
          symbol,
          date: startDate
        };
      });

    const symbolProfilesToGather = (
      await this.prismaService.symbolProfile.findMany({
        orderBy: [{ symbol: 'asc' }],
        select: {
          dataSource: true,
          Order: {
            orderBy: [{ date: 'asc' }],
            select: { date: true },
            take: 1
          },
          scraperConfiguration: true,
          symbol: true
        },
        where: {
          dataSource: {
            not: 'MANUAL'
          }
        }
      })
    ).map((symbolProfile) => {
      return {
        ...symbolProfile,
        date: symbolProfile.Order?.[0]?.date ?? startDate
      };
    });

    return [...currencyPairsToGather, ...symbolProfilesToGather];
  }

  public async reset() {
    Logger.log('Data gathering has been reset.', 'DataGatheringService');

    await this.prismaService.property.deleteMany({
      where: {
        OR: [
          { key: PROPERTY_LAST_DATA_GATHERING },
          { key: PROPERTY_LOCKED_DATA_GATHERING }
        ]
      }
    });
  }

  private async getSymbols7D(): Promise<IDataGatheringItem[]> {
    const startDate = subDays(resetHours(new Date()), 7);

    const symbolProfiles = await this.prismaService.symbolProfile.findMany({
      orderBy: [{ symbol: 'asc' }],
      select: {
        dataSource: true,
        scraperConfiguration: true,
        symbol: true
      },
      where: {
        dataSource: {
          not: 'MANUAL'
        }
      }
    });

    // Only consider symbols with incomplete market data for the last
    // 7 days
    const symbolsNotToGather = (
      await this.prismaService.marketData.groupBy({
        _count: true,
        by: ['symbol'],
        where: {
          date: { gt: startDate }
        }
      })
    )
      .filter((group) => {
        return group._count >= 6;
      })
      .map((group) => {
        return group.symbol;
      });

    const symbolProfilesToGather = symbolProfiles
      .filter(({ symbol }) => {
        return !symbolsNotToGather.includes(symbol);
      })
      .map((symbolProfile) => {
        return {
          ...symbolProfile,
          date: startDate
        };
      });

    const currencyPairsToGather = this.exchangeRateDataService
      .getCurrencyPairs()
      .filter(({ symbol }) => {
        return !symbolsNotToGather.includes(symbol);
      })
      .map(({ dataSource, symbol }) => {
        return {
          dataSource,
          symbol,
          date: startDate
        };
      });

    return [...currencyPairsToGather, ...symbolProfilesToGather];
  }

  private async getSymbolsProfileData(): Promise<IDataGatheringItem[]> {
    const symbolProfiles = await this.prismaService.symbolProfile.findMany({
      orderBy: [{ symbol: 'asc' }]
    });

    return symbolProfiles
      .filter((symbolProfile) => {
        return (
          symbolProfile.dataSource !== DataSource.GHOSTFOLIO &&
          symbolProfile.dataSource !== DataSource.MANUAL &&
          symbolProfile.dataSource !== DataSource.RAKUTEN
        );
      })
      .map((symbolProfile) => {
        return {
          dataSource: symbolProfile.dataSource,
          symbol: symbolProfile.symbol
        };
      });
  }

  private async isDataGatheringNeeded() {
    const lastDataGathering = await this.getLastDataGathering();

    const isDataGatheringLocked = await this.prismaService.property.findUnique({
      where: { key: PROPERTY_LOCKED_DATA_GATHERING }
    });

    const diffInHours = differenceInHours(new Date(), lastDataGathering);

    return (diffInHours >= 1 || !lastDataGathering) && !isDataGatheringLocked;
  }
}
