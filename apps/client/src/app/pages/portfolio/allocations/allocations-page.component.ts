import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { PositionDetailDialog } from '@ghostfolio/client/components/position/position-detail-dialog/position-detail-dialog.component';
import { DataService } from '@ghostfolio/client/services/data.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { UNKNOWN_KEY } from '@ghostfolio/common/config';
import { prettifySymbol } from '@ghostfolio/common/helper';
import {
  PortfolioDetails,
  PortfolioPosition,
  UniqueAsset,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { ToggleOption } from '@ghostfolio/common/types';
import { Account, AssetClass, DataSource } from '@prisma/client';
import { DeviceDetectorService } from 'ngx-device-detector';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  host: { class: 'page' },
  selector: 'gf-allocations-page',
  styleUrls: ['./allocations-page.scss'],
  templateUrl: './allocations-page.html'
})
export class AllocationsPageComponent implements OnDestroy, OnInit {
  public accounts: {
    [id: string]: Pick<Account, 'name'> & {
      id: string;
      value: number;
    };
  };
  public continents: {
    [code: string]: { name: string; value: number };
  };
  public countries: {
    [code: string]: { name: string; value: number };
  };
  public deviceType: string;
  public hasImpersonationId: boolean;
  public hasPermissionToCreateOrder: boolean;
  public period = 'current';
  public periodOptions: ToggleOption[] = [
    { label: 'Initial', value: 'original' },
    { label: 'Current', value: 'current' }
  ];
  public portfolioDetails: PortfolioDetails;
  public positions: {
    [symbol: string]: Pick<
      PortfolioPosition,
      | 'assetClass'
      | 'assetSubClass'
      | 'currency'
      | 'exchange'
      | 'name'
      | 'value'
    >;
  };
  public positionsArray: PortfolioPosition[];
  public routeQueryParams: Subscription;
  public sectors: {
    [name: string]: { name: string; value: number };
  };
  public symbols: {
    [name: string]: {
      dataSource?: DataSource;
      name: string;
      symbol: string;
      value: number;
    };
  };

  public user: User;

  private unsubscribeSubject = new Subject<void>();

  /**
   * @constructor
   */
  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private deviceService: DeviceDetectorService,
    private dialog: MatDialog,
    private impersonationStorageService: ImpersonationStorageService,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {
    this.routeQueryParams = route.queryParams
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((params) => {
        if (
          params['dataSource'] &&
          params['positionDetailDialog'] &&
          params['symbol']
        ) {
          this.openPositionDialog({
            dataSource: params['dataSource'],
            symbol: params['symbol']
          });
        }
      });
  }

  /**
   * Initializes the controller
   */
  public ngOnInit() {
    this.deviceType = this.deviceService.getDeviceInfo().deviceType;

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((aId) => {
        this.hasImpersonationId = !!aId;
      });

    this.dataService
      .fetchPortfolioDetails({})
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((portfolioDetails) => {
        this.portfolioDetails = portfolioDetails;

        this.initializeAnalysisData(this.period);

        this.changeDetectorRef.markForCheck();
      });

    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.hasPermissionToCreateOrder = hasPermission(
            this.user.permissions,
            permissions.createOrder
          );

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public initializeAnalysisData(aPeriod: string) {
    this.accounts = {};
    this.continents = {
      [UNKNOWN_KEY]: {
        name: UNKNOWN_KEY,
        value: 0
      }
    };
    this.countries = {
      [UNKNOWN_KEY]: {
        name: UNKNOWN_KEY,
        value: 0
      }
    };
    this.positions = {};
    this.positionsArray = [];
    this.sectors = {
      [UNKNOWN_KEY]: {
        name: UNKNOWN_KEY,
        value: 0
      }
    };
    this.symbols = {
      [UNKNOWN_KEY]: {
        name: UNKNOWN_KEY,
        symbol: UNKNOWN_KEY,
        value: 0
      }
    };

    for (const [id, { current, name, original }] of Object.entries(
      this.portfolioDetails.accounts
    )) {
      this.accounts[id] = {
        id,
        name,
        value: aPeriod === 'original' ? original : current
      };
    }

    for (const [symbol, position] of Object.entries(
      this.portfolioDetails.holdings
    )) {
      let value = 0;

      if (aPeriod === 'original') {
        if (this.hasImpersonationId) {
          value = position.allocationInvestment;
        } else {
          value = position.investment;
        }
      } else {
        if (this.hasImpersonationId) {
          value = position.allocationCurrent;
        } else {
          value = position.value;
        }
      }

      this.positions[symbol] = {
        value,
        assetClass: position.assetClass,
        assetSubClass: position.assetSubClass,
        currency: position.currency,
        exchange: position.exchange,
        name: position.name
      };
      this.positionsArray.push(position);

      if (position.assetClass !== AssetClass.CASH) {
        // Prepare analysis data by continents, countries and sectors except for cash

        if (position.countries.length > 0) {
          for (const country of position.countries) {
            const { code, continent, name, weight } = country;

            if (this.continents[continent]?.value) {
              this.continents[continent].value += weight * position.value;
            } else {
              this.continents[continent] = {
                name: continent,
                value:
                  weight *
                  (aPeriod === 'original'
                    ? this.portfolioDetails.holdings[symbol].investment
                    : this.portfolioDetails.holdings[symbol].value)
              };
            }

            if (this.countries[code]?.value) {
              this.countries[code].value += weight * position.value;
            } else {
              this.countries[code] = {
                name,
                value:
                  weight *
                  (aPeriod === 'original'
                    ? this.portfolioDetails.holdings[symbol].investment
                    : this.portfolioDetails.holdings[symbol].value)
              };
            }
          }
        } else {
          this.continents[UNKNOWN_KEY].value +=
            aPeriod === 'original'
              ? this.portfolioDetails.holdings[symbol].investment
              : this.portfolioDetails.holdings[symbol].value;

          this.countries[UNKNOWN_KEY].value +=
            aPeriod === 'original'
              ? this.portfolioDetails.holdings[symbol].investment
              : this.portfolioDetails.holdings[symbol].value;
        }

        if (position.sectors.length > 0) {
          for (const sector of position.sectors) {
            const { name, weight } = sector;

            if (this.sectors[name]?.value) {
              this.sectors[name].value += weight * position.value;
            } else {
              this.sectors[name] = {
                name,
                value:
                  weight *
                  (aPeriod === 'original'
                    ? this.portfolioDetails.holdings[symbol].investment
                    : this.portfolioDetails.holdings[symbol].value)
              };
            }
          }
        } else {
          this.sectors[UNKNOWN_KEY].value +=
            aPeriod === 'original'
              ? this.portfolioDetails.holdings[symbol].investment
              : this.portfolioDetails.holdings[symbol].value;
        }
      }

      if (position.assetClass === AssetClass.EQUITY) {
        this.symbols[prettifySymbol(symbol)] = {
          dataSource: position.dataSource,
          name: position.name,
          symbol: prettifySymbol(symbol),
          value: aPeriod === 'original' ? position.investment : position.value
        };
      }
    }
  }

  public onChangePeriod(aValue: string) {
    this.period = aValue;

    this.initializeAnalysisData(this.period);
  }

  public onProportionChartClicked({ dataSource, symbol }: UniqueAsset) {
    if (dataSource && symbol) {
      this.router.navigate([], {
        queryParams: { dataSource, symbol, positionDetailDialog: true }
      });
    }
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private openPositionDialog({
    dataSource,
    symbol
  }: {
    dataSource: DataSource;
    symbol: string;
  }) {
    this.userService
      .get()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((user) => {
        this.user = user;

        const dialogRef = this.dialog.open(PositionDetailDialog, {
          autoFocus: false,
          data: {
            dataSource,
            symbol,
            baseCurrency: this.user?.settings?.baseCurrency,
            deviceType: this.deviceType,
            hasImpersonationId: this.hasImpersonationId,
            locale: this.user?.settings?.locale
          },
          height: this.deviceType === 'mobile' ? '97.5vh' : '80vh',
          width: this.deviceType === 'mobile' ? '100vw' : '50rem'
        });

        dialogRef
          .afterClosed()
          .pipe(takeUntil(this.unsubscribeSubject))
          .subscribe(() => {
            this.router.navigate(['.'], { relativeTo: this.route });
          });
      });
  }
}
