import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { CreateOrderDto } from '@ghostfolio/api/app/order/create-order.dto';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { Injectable } from '@nestjs/common';
import { isSameDay, parseISO } from 'date-fns';

@Injectable()
export class ImportService {
  public constructor(
    private readonly accountService: AccountService,
    private readonly configurationService: ConfigurationService,
    private readonly dataProviderService: DataProviderService,
    private readonly orderService: OrderService
  ) {}

  public async import({
    orders,
    userId
  }: {
    orders: Partial<CreateOrderDto>[];
    userId: string;
  }): Promise<void> {
    for (const order of orders) {
      if (!order.dataSource) {
        if (order.type === 'ITEM') {
          order.dataSource = 'MANUAL';
        } else {
          order.dataSource = this.dataProviderService.getPrimaryDataSource();
        }
      }
    }

    await this.validateOrders({ orders, userId });

    const accountIds = (await this.accountService.getAccounts(userId)).map(
      (account) => {
        return account.id;
      }
    );

    for (const {
      accountId,
      currency,
      dataSource,
      date,
      fee,
      quantity,
      symbol,
      type,
      unitPrice
    } of orders) {
      await this.orderService.createOrder({
        fee,
        quantity,
        type,
        unitPrice,
        userId,
        accountId: accountIds.includes(accountId) ? accountId : undefined,
        date: parseISO(<string>(<unknown>date)),
        SymbolProfile: {
          connectOrCreate: {
            create: {
              currency,
              dataSource,
              symbol
            },
            where: {
              dataSource_symbol: {
                dataSource,
                symbol
              }
            }
          }
        },
        User: { connect: { id: userId } }
      });
    }
  }

  private async validateOrders({
    orders,
    userId
  }: {
    orders: Partial<CreateOrderDto>[];
    userId: string;
  }) {
    if (
      orders?.length > this.configurationService.get('MAX_ORDERS_TO_IMPORT')
    ) {
      throw new Error(
        `Too many transactions (${this.configurationService.get(
          'MAX_ORDERS_TO_IMPORT'
        )} at most)`
      );
    }

    const existingOrders = await this.orderService.orders({
      include: { SymbolProfile: true },
      orderBy: { date: 'desc' },
      where: { userId }
    });

    for (const [
      index,
      { currency, dataSource, date, fee, quantity, symbol, type, unitPrice }
    ] of orders.entries()) {
      const duplicateOrder = existingOrders.find((order) => {
        return (
          order.SymbolProfile.currency === currency &&
          order.SymbolProfile.dataSource === dataSource &&
          isSameDay(order.date, parseISO(<string>(<unknown>date))) &&
          order.fee === fee &&
          order.quantity === quantity &&
          order.SymbolProfile.symbol === symbol &&
          order.type === type &&
          order.unitPrice === unitPrice
        );
      });

      if (duplicateOrder) {
        throw new Error(`orders.${index} is a duplicate transaction`);
      }

      if (dataSource !== 'MANUAL') {
        const quotes = await this.dataProviderService.getQuotes([
          { dataSource, symbol }
        ]);

        if (quotes[symbol] === undefined) {
          throw new Error(
            `orders.${index}.symbol ("${symbol}") is not valid for the specified data source ("${dataSource}")`
          );
        }

        if (quotes[symbol].currency !== currency) {
          throw new Error(
            `orders.${index}.currency ("${currency}") does not match with "${quotes[symbol].currency}"`
          );
        }
      }
    }
  }
}
