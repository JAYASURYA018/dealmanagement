import { Component, Input, OnInit, inject, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiscountsIncentivesComponent } from '../discounts-incentives/discounts-incentives.component';
import { ToastService } from '../../services/toast.service';
import { QuoteDataService } from '../../services/quote-data.service';
import { ContextService } from '../../services/context.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { LoadingService } from '../../services/loading.service';
import { DiscountIncentiveStateService } from '../../services/discount-incentive-state.service';
import { Observable, of, from } from 'rxjs';
import { switchMap, map, concatMap, toArray } from 'rxjs/operators';

@Component({
  selector: 'app-commit-configuration',
  standalone: true,
  imports: [CommonModule, FormsModule, DiscountsIncentivesComponent],
  templateUrl: './commit-configuration.component.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #f1f5f9;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
  `]
})
export class CommitConfigurationComponent implements OnInit {
  private toastService = inject(ToastService);
  private quoteDataService = inject(QuoteDataService);
  private contextService = inject(ContextService);
  private sfApi = inject(SalesforceApiService);
  private loadingService = inject(LoadingService);
  private discountIncentiveStateService = inject(DiscountIncentiveStateService);

  @ViewChild(DiscountsIncentivesComponent) discountsIncentives?: DiscountsIncentivesComponent;

  @Input() productId: string = '';
  @Input() quoteLineId: string = '';
  @Input() accountName: string = '';
  @Input() quoteId: string = '';
  @Input() remainingQuota: number = 1000;
  
  activeTab: 'details' | 'discounts' = 'details';
  commitmentPeriods: any[] = [{ months: null, amount: null, isCollapsed: false }];
  activeMenuIndex: number | null = null;
  
  opportunityName: string = '';
  startDate: string = new Date().toLocaleDateString('en-CA');
  expirationDate: string = '';
  minDate: string = new Date().toLocaleDateString('en-CA');
  primaryContactName: string = '';
  salesChannel: string = '';

  /** Key is per-product so multiple products don't collide */
  private get sessionKey(): string {
    return `commit_config_${this.productId}`;
  }

  private saveToSession() {
    sessionStorage.setItem(this.sessionKey, JSON.stringify({
      commitmentPeriods: this.commitmentPeriods,
      startDate: this.startDate,
      activeTab: this.activeTab
    }));
  }

  private loadFromSession() {
    try {
      const raw = sessionStorage.getItem(this.sessionKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.commitmentPeriods && saved.commitmentPeriods.length > 0) {
          this.commitmentPeriods = saved.commitmentPeriods;
        }
        if (saved.startDate) this.startDate = saved.startDate;
        if (saved.activeTab) this.activeTab = saved.activeTab;
      }
    } catch { /* ignore */ }
  }

  get totalTerms(): number {
    return this.commitmentPeriods.reduce((acc, curr) => acc + (parseInt(curr.months || '0') || 0), 0);
  }

  get contractEndDate(): string {
    if (!this.startDate || !this.totalTerms) return '';
    const parts = this.startDate.split('-');
    const end = new Date(Number(parts[0]), Number(parts[1]) - 1 + this.totalTerms, Number(parts[2]));
    end.setDate(end.getDate() - 1); // last day of the term
    return this.toIsoDateString(end);
  }

  get totalContractValue(): number {
    return this.commitmentPeriods.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }

  getPreviewData(previewData: any) {
    const commitments = this.buildPreviewCommitments(previewData);
    const productsWithoutDiscounts = this.buildProductsWithoutDiscounts(previewData);
    
    return {
      previewData: previewData,
      previewCommitments: commitments,
      previewProductsWithoutDiscounts: productsWithoutDiscounts,
      commitmentDetailsOnly: this.getCommitmentDetailsOnly(),
      isLookerSubscription: false,
      totalContractValue: this.totalContractValue,
      totalIncentivesValue: this.getTotalIncentivesValue(previewData),
      totalTerms: this.totalTerms,
      startDate: this.startDate,
      expirationDate: this.expirationDate
    };
  }

  private buildPreviewCommitments(previewData: any): any[] {
    const previews: any[] = [];
    if (!previewData?.QuoteLineItems?.records) return [];

    const matchedIds = new Set<string>();

    // 1. Process Discount Periods from child component or state service
    const state = this.discountIncentiveStateService.getCurrentState();
    const discountPeriods = this.discountsIncentives?.discountPeriods || state.discountPeriods || [];
    discountPeriods.forEach((period: any, index: number) => {
        const startDateStr = period.startDate;
        const endDateStr = period.endDate;
        const individualItems: any[] = [];
        const groupItems: any[] = [];

        if (startDateStr) {
            const pStart = new Date(startDateStr).getTime();
            let pEnd: number | null = null;
            if (endDateStr) pEnd = new Date(endDateStr).setHours(23, 59, 59, 999);

            previewData.QuoteLineItems.records.forEach((item: any) => {
                if (item.Id && matchedIds.has(item.Id)) return;
                if (item.Product2Id === this.productId) return; // Skip bundle

                const discount = item.Discount != null ? parseFloat(item.Discount) : 0;
                if (discount === 0) return;

                const itemStartStr = item.StartDate;
                if (itemStartStr) {
                    const itemStart = new Date(itemStartStr).getTime();
                    const dateMatches = pEnd ? (itemStart >= pStart && itemStart <= pEnd) : (itemStart >= pStart);
                    
                    if (dateMatches) {
                        if (item.Id) matchedIds.add(item.Id);
                        if (this.isGroupProduct(item)) {
                            groupItems.push(item);
                        } else {
                            individualItems.push(item);
                        }
                    }
                }
            });
        }

        previews.push({
            type: 'discount',
            name: `Discount Period ${index + 1}`,
            displayName: `Discount Period ${index + 1}`,
            startDate: startDateStr ? this.formatDateForDisplay(startDateStr) : '',
            endDate: endDateStr ? this.formatDateForDisplay(endDateStr) : '',
            months: period.months,
            amount: period.amount,
            bulkIndividualItems: individualItems,
            groupItems,
        });
    });

    // 2. Process Incentive Periods
    const incentivePeriods = this.discountsIncentives?.incentivePeriods || [];
    incentivePeriods.forEach((period: any, index: number) => {
        const startDateStr = period.startDate;
        const endDateStr = period.endDate;
        const individualItems: any[] = [];
        const groupItems: any[] = [];

        if (startDateStr) {
            const pStart = new Date(startDateStr).getTime();
            let pEnd: number | null = null;
            if (endDateStr) pEnd = new Date(endDateStr).setHours(23, 59, 59, 999);

            previewData.QuoteLineItems.records.forEach((item: any) => {
                if (item.Id && matchedIds.has(item.Id)) return;
                const incentive = item.Incentive__c ? parseFloat(item.Incentive__c) : 0;
                if (incentive === 0) return;

                const itemStartStr = item.StartDate;
                if (itemStartStr) {
                    const itemStart = new Date(itemStartStr).getTime();
                    if (itemStart >= pStart && (pEnd ? itemStart <= pEnd : true)) {
                        if (item.Id) matchedIds.add(item.Id);
                        if (this.isGroupProduct(item)) {
                            groupItems.push(item);
                        } else {
                            individualItems.push(item);
                        }
                    }
                }
            });
        }

        previews.push({
            type: 'incentive',
            name: `Incentive Period`,
            displayName: `Incentive Period`,
            startDate: startDateStr ? this.formatDateForDisplay(startDateStr) : '',
            endDate: endDateStr ? this.formatDateForDisplay(endDateStr) : '',
            months: period.months,
            amount: period.amount,
            bulkIndividualItems: individualItems,
            groupItems,
        });
    });

    return previews;
  }

  private buildProductsWithoutDiscounts(previewData: any): any[] {
    const products: any[] = [];
    if (!previewData?.QuoteLineItems?.records) return [];

    const bundle = previewData.QuoteLineItems.records.find((item: any) => item.Product2Id === this.productId);
    if (bundle) {
        products.push({
            ...bundle,
            Product_Name_Display: bundle.Product2?.Name || 'Product',
            Quantity: 1
        });
    }
    return products;
  }

  private getTotalIncentivesValue(previewData: any): number {
    if (!previewData?.QuoteLineItems?.records) return 0;
    return previewData.QuoteLineItems.records.reduce((acc: number, item: any) => acc + (Number(item.Incentive__c) || 0), 0);
  }

  private isGroupProduct(item: any): boolean {
    const family = item.Product2?.Family;
    return family === 'Product Group' || !family || family === 'Compute' || family === 'Storage';
  }

  formatDateForDisplay(dateString: any): string {
    if (!dateString) return '-';
    // Use UTC to avoid off-by-one errors from local timezone
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
  }

  ngOnInit() {
    this.quoteDataService.quoteData$.subscribe(data => {
      if (data.opportunityName) this.opportunityName = data.opportunityName;
      if (data.accountName) this.accountName = data.accountName;
      if (data.quoteId) this.quoteId = data.quoteId;
      if (data.primaryContactName) this.primaryContactName = data.primaryContactName;
      if (data.salesChannel) this.salesChannel = data.salesChannel;
    });

    this.loadFromSession(); // Restore commitment periods and start date
    this.updateExpirationDate();
  }

  switchTab(tab: 'details' | 'discounts') {
    if (tab === 'discounts') {
        const hasValidPeriod = this.commitmentPeriods.some(p => p.months && p.amount);
        if (!hasValidPeriod) {
            this.toastService.show('Please provide at least one valid commitment period (Months and Amount) before proceeding.', 'warning');
            return;
        }
    }
    this.activeTab = tab;
    this.saveToSession();
  }

  addPeriod() {
    if (this.commitmentPeriods.length >= 5) {
      this.toastService.show('Maximum 5 commitment periods allowed.', 'warning');
      return;
    }
    const lastPeriod = this.commitmentPeriods[this.commitmentPeriods.length - 1];
    if (lastPeriod && (!lastPeriod.months || !lastPeriod.amount)) {
      this.toastService.show('Please fill the current commitment period details before adding a new one.', 'warning');
      return;
    }
    this.commitmentPeriods.push({ months: null, amount: null, isCollapsed: false });
    this.saveToSession();
  }

  removePeriod() {
    if (this.commitmentPeriods.length <= 1) return;
    this.commitmentPeriods.pop();
    this.saveToSession();
  }

  toggleEdit(index: number) {
    this.commitmentPeriods[index].isCollapsed = !this.commitmentPeriods[index].isCollapsed;
  }

  toggleMenu(index: number, event: Event) {
    event.stopPropagation();
    this.activeMenuIndex = this.activeMenuIndex === index ? null : index;
  }

  duplicatePeriod(index: number) {
    if (this.commitmentPeriods.length >= 5) return;
    const period = { ...this.commitmentPeriods[index], isCollapsed: true, isDuplicated: true };
    this.commitmentPeriods.splice(index + 1, 0, period);
    this.activeMenuIndex = null;
    this.saveToSession();
  }

  deletePeriod(index: number) {
    if (this.commitmentPeriods.length <= 1) return;
    this.commitmentPeriods.splice(index, 1);
    this.activeMenuIndex = null;
    this.saveToSession();
  }

  @HostListener('document:click')
  closeMenu() {
    this.activeMenuIndex = null;
  }

  getCommitmentDetailsOnly(): any[] {
    const details: any[] = [];
    const quoteStartDateStr = this.startDate || new Date().toISOString().split('T')[0];
    
    // Robust date parsing (handles YYYY-MM-DD or MM/DD/YYYY)
    let currentStartDate: Date;
    if (quoteStartDateStr.includes('-')) {
        const parts = quoteStartDateStr.split('-');
        currentStartDate = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    } else if (quoteStartDateStr.includes('/')) {
        const parts = quoteStartDateStr.split('/');
        // Assuming MM/DD/YYYY if it starts with a small number, else YYYY/MM/DD
        if (parseInt(parts[0]) <= 12) {
            currentStartDate = new Date(Date.UTC(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
        } else {
            currentStartDate = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        }
    } else {
        currentStartDate = new Date(quoteStartDateStr);
    }

    if (isNaN(currentStartDate.getTime())) {
        currentStartDate = new Date();
        currentStartDate.setUTCHours(0, 0, 0, 0);
    }

    this.commitmentPeriods.forEach((period, index) => {
        const months = parseInt(String(period.months || '0')) || 0;
        const amount = Number(period.amount || 0) || 0;

        if (months > 0) {
            const endDate = new Date(currentStartDate);
            endDate.setUTCMonth(endDate.getUTCMonth() + months);
            endDate.setUTCDate(endDate.getUTCDate() - 1);

            details.push({
                name: `Period ${index + 1}`,
                startDate: this.formatUTCDateForDisplay(currentStartDate),
                endDate: this.formatUTCDateForDisplay(endDate),
                months: months,
                amount: amount
            });

            currentStartDate = new Date(endDate);
            currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1);
        }
    });
    return details;
  }

  private formatUTCDateForDisplay(date: Date): string {
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
  }

  restrictNumeric(event: KeyboardEvent) {
    const allowedKeys = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'End', 'Home'];
    if (allowedKeys.includes(event.key)) return;

    const isDigit = /[0-9]/.test(event.key);
    const isDot = event.key === '.';
    const isShorthand = /[kmbKMB]/.test(event.key);

    if (!isDigit && !isDot && !isShorthand) {
      event.preventDefault();
    }

    if (isDot && (event.target as HTMLInputElement).value.includes('.')) {
      event.preventDefault();
    }

    // Only allow one shorthand character
    if (isShorthand && /[kmbKMB]/.test((event.target as HTMLInputElement).value)) {
      event.preventDefault();
    }
  }

  onMonthFocus(index: number, input: HTMLInputElement) {
    if (this.commitmentPeriods[index].months) {
      input.value = this.commitmentPeriods[index].months.toString();
    }
  }

  onMonthBlur(index: number, input: HTMLInputElement) {
    const val = input.value;
    this.commitmentPeriods[index].months = val.replace(/[^0-9]/g, '');
    this.updateExpirationDate();
    this.saveToSession();
  }

  onMonthInput(index: number, val: string) { }

  onAmountBlur(index: number, val: string) {
    this.commitmentPeriods[index].amount = this.parseShorthandValue(val);
    this.saveToSession();
  }

  parseShorthandValue(val: string): number {
    if (!val) return 0;

    let cleaned = val.toLowerCase().replace(/[^0-9.kmb]/g, '');
    if (!cleaned) return 0;

    let multiplier = 1;
    if (cleaned.includes('k')) {
      multiplier = 1000;
      cleaned = cleaned.replace('k', '');
    } else if (cleaned.includes('m')) {
      multiplier = 1000000;
      cleaned = cleaned.replace('m', '');
    } else if (cleaned.includes('b')) {
      multiplier = 1000000000;
      cleaned = cleaned.replace('b', '');
    }

    const numValue = parseFloat(cleaned);
    return isNaN(numValue) ? 0 : numValue * multiplier;
  }

  handleInputEnter(index: number, field: string, event: Event, ...others: any[]) {
    const val = (event.target as HTMLInputElement).value;
    if (field === 'amount') {
      this.commitmentPeriods[index].amount = this.parseShorthandValue(val);
    } else if (field === 'months') {
      this.commitmentPeriods[index].months = val.replace(/[^0-9]/g, '');
      this.updateExpirationDate();
    }

    (event.target as HTMLElement).blur();
  }

  checkCollapse(index: number, event: any) {
    setTimeout(() => {
        const activeElem = document.activeElement;
        const container = event.currentTarget as HTMLElement;
        if (!container.contains(activeElem)) {
            if (this.commitmentPeriods[index].months && this.commitmentPeriods[index].amount) {
                this.commitmentPeriods[index].isCollapsed = true;
            }
        }
    }, 100);
  }

  updateExpirationDate() {
    if (this.startDate) {
      const date = new Date(this.startDate);
      date.setDate(date.getDate() + 45);
      this.expirationDate = this.toIsoDateString(date);
    }
  }

  toIsoDateString(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  onSkipAndSave() {
    this.onSave();
  }

  onSave(onSuccess?: () => void) {
    const fullQuoteId = this.quoteId || this.contextService.currentContext?.quoteId;
    if (!fullQuoteId) {
      this.toastService.show('Quote ID not found', 'error');
      return;
    }

    this.loadingService.show();

    this.sfApi.getQuoteLineItems(fullQuoteId).pipe(
      switchMap((lineItemsResponse: any) => {
        const quoteLineItems: any[] = [];
        if (lineItemsResponse.records && lineItemsResponse.records.length > 0) {
          const matchingLine = lineItemsResponse.records.find((r: any) => r.Product2Id === this.productId);
          const lineItemId = this.quoteLineId || (matchingLine ? matchingLine.Id : lineItemsResponse.records[0].Id);
          
          quoteLineItems.push({
            id: lineItemId,
            commitmentAmount: this.totalContractValue
          });
          
          return this.sfApi.updateQuoteDates(
            fullQuoteId,
            this.startDate,
            this.expirationDate,
            this.totalTerms,
            this.totalContractValue,
            quoteLineItems
          ).pipe(map(() => lineItemsResponse));
        } else {
          throw new Error('No QuoteLineItems found');
        }
      }),
      switchMap((lineItemsResponse: any) => {
        const matchingLine = lineItemsResponse.records.find((r: any) => r.Product2Id === this.productId);
        const targetLineId = this.quoteLineId || (matchingLine ? matchingLine.Id : lineItemsResponse.records[0].Id);
        const commitmentRecords = this.buildCommitmentRecords(fullQuoteId, targetLineId);

        if (commitmentRecords.length > 0) {
          return this.sfApi.createQuoteLineCommitments(commitmentRecords);
        } else {
          return of({ success: true, message: 'No commitments to create' });
        }
      }),
      switchMap(() => {
        // Execute pending discounts, incentives, and bulk uploads sequentially
        const pendingTransactions = this.discountIncentiveStateService.getPendingTransactions(fullQuoteId);
        if (pendingTransactions.length > 0) {
          return from(pendingTransactions).pipe(
            concatMap(payload => this.sfApi.placeSalesTransaction(payload)),
            toArray()
          );
        } else {
          return of([]);
        }
      })
    ).subscribe({
      next: (res: any) => {
        // Clear queue upon success
        this.discountIncentiveStateService.clearPendingTransactions(fullQuoteId);
        this.loadingService.hide();
        this.toastService.show('Quote Data Saved Successfully!', 'success');
        if (onSuccess) onSuccess();
      },
      error: (err) => {
        this.loadingService.hide();
        console.error('[CommitConfiguration] Save Error:', err);
        this.toastService.show(err.message || 'Failed to save configuration data.', 'error');
      }
    });
  }

  private buildCommitmentRecords(quoteId: string, qliId: string): any[] {
    if (!this.startDate) return [];

    const records: any[] = [];
    const parts = this.startDate.split('-');
    let currentStart = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));

    this.commitmentPeriods.forEach((period, index) => {
      const months = parseInt(period.months) || 0;
      const amount = Number(period.amount) || 0;

      if (months > 0) {
        const endDate = new Date(currentStart);
        endDate.setUTCMonth(endDate.getUTCMonth() + months);
        endDate.setUTCDate(endDate.getUTCDate() - 1);

        records.push({
          attributes: { type: 'Commitment_Details__c', referenceId: `ref${index + 1}` },
          Name: `CommitPeriod${index + 1}`,
          Periods_Months__c: months.toString(),
          Quote__c: quoteId,
          Quote_Line_Item__c: qliId,
          Start_Date__c: this.formatDateForSalesforce(currentStart),
          End_Date__c: this.formatDateForSalesforce(endDate),
          Commit_Amount__c: amount.toString()
        });
        currentStart = new Date(endDate);
        currentStart.setUTCDate(currentStart.getUTCDate() + 1);
      }
    });
    return records;
  }

  formatDateForSalesforce(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatCurrency(value: any): string {
    if (value === null || value === undefined || value === '') return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
  }
}
