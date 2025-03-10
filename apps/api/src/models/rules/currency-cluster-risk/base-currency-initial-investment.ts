import { CurrentPositions } from '@ghostfolio/api/app/portfolio/interfaces/current-positions.interface';
import { RuleSettings } from '@ghostfolio/api/models/interfaces/rule-settings.interface';
import { UserSettings } from '@ghostfolio/api/models/interfaces/user-settings.interface';
import { ExchangeRateDataService } from 'apps/api/src/services/exchange-rate-data.service';

import { Rule } from '../../rule';

export class CurrencyClusterRiskBaseCurrencyInitialInvestment extends Rule<Settings> {
  public constructor(
    protected exchangeRateDataService: ExchangeRateDataService,
    private currentPositions: CurrentPositions
  ) {
    super(exchangeRateDataService, {
      name: 'Initial Investment: Base Currency'
    });
  }

  public evaluate(ruleSettings: Settings) {
    const positionsGroupedByCurrency = this.groupCurrentPositionsByAttribute(
      this.currentPositions.positions,
      'currency',
      ruleSettings.baseCurrency
    );

    let maxItem = positionsGroupedByCurrency[0];
    let totalInvestment = 0;

    positionsGroupedByCurrency.forEach((groupItem) => {
      // Calculate total investment
      totalInvestment += groupItem.investment;

      // Find maximum
      if (groupItem.investment > maxItem.investment) {
        maxItem = groupItem;
      }
    });

    const baseCurrencyItem = positionsGroupedByCurrency.find((item) => {
      return item.groupKey === ruleSettings.baseCurrency;
    });

    const baseCurrencyInvestmentRatio =
      baseCurrencyItem?.investment / totalInvestment || 0;

    if (maxItem.groupKey !== ruleSettings.baseCurrency) {
      return {
        evaluation: `The major part of your initial investment is not in your base currency (${(
          baseCurrencyInvestmentRatio * 100
        ).toPrecision(3)}% in ${ruleSettings.baseCurrency})`,
        value: false
      };
    }

    return {
      evaluation: `The major part of your initial investment is in your base currency (${(
        baseCurrencyInvestmentRatio * 100
      ).toPrecision(3)}% in ${ruleSettings.baseCurrency})`,
      value: true
    };
  }

  public getSettings(aUserSettings: UserSettings): Settings {
    return {
      baseCurrency: aUserSettings.baseCurrency,
      isActive: true
    };
  }
}

interface Settings extends RuleSettings {
  baseCurrency: string;
}
