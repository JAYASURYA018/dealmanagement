import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { LoadingService } from '../../services/loading.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-quote-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quote-preview.component.html',
  styles: [`
        .slim-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .slim-scrollbar::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
        }
        .slim-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        .slim-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
    `]
})
export class QuotePreviewComponent {
  @Input() showPreviewPopup: boolean = false;
  @Input() previewData: any = null;
  @Input() previewCommitments: any[] = [];
  @Input() commitmentDetailsOnly: any[] = [];
  @Input() previewProductsWithoutDiscounts: any[] = [];
  @Input() accountName: string = '';
  @Input() opportunityName: string = '';
  @Input() isLookerSubscription: boolean = false;
  @Input() startDate: string = '';
  @Input() expirationDate: string = '';
  @Input() totalContractValue: number = 0;
  @Input() totalIncentivesValue: number = 0;
  @Input() totalTerms: number = 0;

  isCapturingScreenshot: boolean = false;

  @Output() close = new EventEmitter<void>();

  closePreview() {
    this.close.emit();
  }

  formatCurrency(value: any): string {
    if (value === null || value === undefined || value === '') return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
  }

  formatDateForDisplay(dateString: any): string {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    } catch {
        return dateString;
    }
  }

  get totalTermLabel(): string {
    if (this.isLookerSubscription && this.totalTerms > 0) {
      const years = Math.floor(this.totalTerms / 12);
      const remainingMonths = Math.round(this.totalTerms % 12);

      if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? ` ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
      }
      return `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
    }
    return `${this.totalTerms} months`;
  }
}
