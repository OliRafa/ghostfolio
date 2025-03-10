import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output
} from '@angular/core';
import { PortfolioSummary } from '@ghostfolio/common/interfaces';
import { formatDistanceToNow } from 'date-fns';

@Component({
  selector: 'gf-portfolio-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './portfolio-summary.component.html',
  styleUrls: ['./portfolio-summary.component.scss']
})
export class PortfolioSummaryComponent implements OnChanges, OnInit {
  @Input() baseCurrency: string;
  @Input() hasPermissionToUpdateUserSettings: boolean;
  @Input() isLoading: boolean;
  @Input() locale: string;
  @Input() summary: PortfolioSummary;

  @Output() emergencyFundChanged = new EventEmitter<number>();

  public timeInMarket: string;

  public constructor() {}

  public ngOnInit() {}

  public ngOnChanges() {
    if (this.summary) {
      if (this.summary.firstOrderDate) {
        this.timeInMarket = formatDistanceToNow(this.summary.firstOrderDate);
      } else {
        this.timeInMarket = '-';
      }
    } else {
      this.timeInMarket = undefined;
    }
  }

  public onEditEmergencyFund() {
    const emergencyFundInput = prompt(
      'Please enter the amount of your emergency fund:',
      this.summary.emergencyFund.toString()
    );
    const emergencyFund = parseFloat(emergencyFundInput?.trim());

    if (emergencyFund >= 0) {
      this.emergencyFundChanged.emit(emergencyFund);
    }
  }
}
