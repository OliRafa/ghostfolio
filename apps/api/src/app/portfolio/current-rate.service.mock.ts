import { parseDate, resetHours } from '@ghostfolio/common/helper';
import { addDays, endOfDay, isBefore, isSameDay } from 'date-fns';

import { GetValuesParams } from './interfaces/get-values-params.interface';

function mockGetValue(symbol: string, date: Date) {
  switch (symbol) {
    case 'BALN.SW':
      if (isSameDay(parseDate('2021-11-12'), date)) {
        return { marketPrice: 146 };
      } else if (isSameDay(parseDate('2021-11-22'), date)) {
        return { marketPrice: 142.9 };
      } else if (isSameDay(parseDate('2021-11-26'), date)) {
        return { marketPrice: 139.9 };
      } else if (isSameDay(parseDate('2021-11-30'), date)) {
        return { marketPrice: 136.6 };
      } else if (isSameDay(parseDate('2021-12-18'), date)) {
        return { marketPrice: 148.9 };
      }

      return { marketPrice: 0 };

    default:
      return { marketPrice: 0 };
  }
}

export const CurrentRateServiceMock = {
  getValues: ({ dataGatheringItems, dateQuery }: GetValuesParams) => {
    const result = [];
    if (dateQuery.lt) {
      for (
        let date = resetHours(dateQuery.gte);
        isBefore(date, endOfDay(dateQuery.lt));
        date = addDays(date, 1)
      ) {
        for (const dataGatheringItem of dataGatheringItems) {
          result.push({
            date,
            marketPrice: mockGetValue(dataGatheringItem.symbol, date)
              .marketPrice,
            symbol: dataGatheringItem.symbol
          });
        }
      }
    } else {
      for (const date of dateQuery.in) {
        for (const dataGatheringItem of dataGatheringItems) {
          result.push({
            date,
            marketPrice: mockGetValue(dataGatheringItem.symbol, date)
              .marketPrice,
            symbol: dataGatheringItem.symbol
          });
        }
      }
    }
    return Promise.resolve(result);
  }
};
