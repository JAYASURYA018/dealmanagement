import { Component, HostListener, OnInit, OnChanges, inject, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuoteRefreshService } from '../../services/quote-refresh.service';
import { CartService } from '../../services/cart.service';
import { ContextService } from '../../services/context.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { QuoteDataService } from '../../services/quote-data.service';
import { of, forkJoin } from 'rxjs';
import { Router } from '@angular/router';
import { LoadingService } from '../../services/loading.service';
import { ToastService } from '../../services/toast.service';
import { FormsModule } from '@angular/forms';
import { SubscriptionPeriodsModalComponent } from '../subscription-periods-modal/subscription-periods-modal';
import { SubscriptionPeriodItemComponent, SubscriptionPeriod, ProductItem } from '../subscription-period-item/subscription-period-item';

@Component({
  selector: 'app-subscription-configuration',
  standalone: true,
  imports: [CommonModule, FormsModule, SubscriptionPeriodsModalComponent, SubscriptionPeriodItemComponent],
  templateUrl: './subscription-configuration.component.html',
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
export class SubscriptionConfigurationComponent implements OnInit, OnChanges {
  
  public lastSavedLookerState: string | null = null; // State tracking
  static lastInitTime = 0;
  
  private router = inject(Router);
  private sfApi = inject(SalesforceApiService);
  private contextService = inject(ContextService);
  private cartService = inject(CartService);
  private loadingService = inject(LoadingService);
  private quoteDataService = inject(QuoteDataService);
  private toastService = inject(ToastService);
  private quoteRefreshService = inject(QuoteRefreshService);

  isSaving: boolean = false;
  isLoading: boolean = true;
  showSuccessPopup: boolean = false;
  
  activeTab: 'details' | 'plans' = 'details';

  // Quote Data Properties
  opportunityName: string = '';
  @Input() accountName: string = '';
  @Input() quoteId: string = '';
  @Input() remainingQuota: number = 1000;
  primaryContactName: string = '';
  salesChannel: string = '';
  get totalContractValue(): number {
    let total = 0;
    if (!this.subscriptionPeriods) return total;
    
    this.subscriptionPeriods.forEach((period: any) => {
      const term = this.calculateSubscriptionTerm(period.startDate, period.endDate);
      
      if (period.productName) {
         const pTotal = ((period.unitPrice || 0) * term) * (1 - (period.discount || 0) / 100);
         total += pTotal;
      }
      
      if (period.userRows && period.userRows.length > 0) {
         period.userRows.forEach((row: any) => {
             const qty = row.quantity || 0;
             if (qty > 0) {
                 let price = row.price || 0;
                 if (row.type === 'Non-prod' && period.nonProdPrice) {
                     price = period.nonProdPrice;
                 }
                 const rowTotal = (price * qty * term) * (1 - (row.discount || 0) / 100);
                 total += rowTotal;
             }
         });
      }
    });
    return total;
  }

  getPreviewData(previewData: any) {
    const commitments = this.buildSubscriptionPreview();
    const productsWithoutDiscounts = this.buildProductsWithoutDiscounts(previewData);
    
    return {
      previewData: previewData,
      previewCommitments: commitments,
      previewProductsWithoutDiscounts: productsWithoutDiscounts,
      isLookerSubscription: true,
      totalContractValue: this.totalContractValue,
      totalIncentivesValue: 0,
      totalTerms: this.calculateSubscriptionTerm(this.termStartInput, this.termEndDate),
      startDate: this.termStartInput,
      expirationDate: this.termEndDate
    };
  }

  private buildSubscriptionPreview(): any[] {
    const previews: any[] = [];
    this.subscriptionPeriods.forEach((period: any, index: number) => {
        const items: any[] = [];
        if (period.productName) {
            const term = this.calculateSubscriptionTerm(period.startDate, period.endDate);
            const total = (period.unitPrice * term) * (1 - (period.discount || 0) / 100);

            items.push({
                name: period.productName,
                operationType: this.operationType || 'New',
                quantity: 1,
                startDate: this.formatDateForDisplay(period.startDate),
                endDate: period.endDate ? this.formatDateForDisplay(period.endDate) : '-',
                orderTerm: this.formatTermDisplay(period.startDate, period.endDate),
                listPrice: period.unitPrice,
                discount: period.discount || 0,
                total: total
            });
        }

        period.userRows.forEach((userRow: any) => {
            const qty = userRow.quantity || 0;
            if (qty > 0) {
                const term = this.calculateSubscriptionTerm(period.startDate, period.endDate);
                let price = userRow.price || 0;
                if (userRow.type === 'Non-prod' && period.nonProdPrice) price = period.nonProdPrice;
                
                const total = (price * qty * term) * (1 - (userRow.discount || 0) / 100);
                const baseName = userRow.name || period.productName || 'Looker';
                const displayName = baseName.includes(userRow.type) ? baseName : `${baseName} ${userRow.type}`;

                items.push({
                    name: displayName,
                    operationType: this.operationType || 'New',
                    quantity: qty,
                    startDate: this.formatDateForDisplay(period.startDate),
                    endDate: period.endDate ? this.formatDateForDisplay(period.endDate) : '-',
                    orderTerm: this.formatTermDisplay(period.startDate, period.endDate),
                    listPrice: price,
                    discount: userRow.discount || 0,
                    total: total
                });
            }
        });

        const periodTotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
        if (items.length > 0) {
            previews.push({
                name: `Year ${index + 1}`,
                startDate: this.formatDateForDisplay(period.startDate),
                endDate: this.formatDateForDisplay(period.endDate),
                months: this.calculateSubscriptionTerm(period.startDate, period.endDate),
                amount: periodTotal,
                items
            });
        }
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
            Product_Name_Display: bundle.Product2?.Name || this.productName || 'Looker',
            Quantity: 1
        });
    }
    return products;
  }

  formatDateForDisplay(dateString: any): string {
    if (!dateString) return '-';
    // Use UTC to avoid off-by-one errors from local timezone
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
  }

  @Input() productName: string = 'No Products';
  @Input() productId: string | null = null;
  @Input() bundleQuoteLineId: string | null = null;
  bundlePricebookEntryId: string | null = null;
  website: string | null = null;
  @Input() categoryId: string | null = null;
  productRelationshipTypeId: string | null = null;

  // Dates
  startDate: string = '';
  expirationDate: string = '';
  minDate: string = new Date().toLocaleDateString('en-CA');

  // Term Date Inputs
  termStartInput: string = '';
  termEndDate: string = '';
  private lastValidTermStart: string = '';
  private lastValidTermEnd: string = '';

  // Subscription State
  operationType: string = '';
  billingFrequency: string = '';
  termStartsOn: string = '';
  
  isSubscriptionModalOpen: boolean = false;
  currentFrequency: string = 'Yearly';
  subscriptionPeriods: SubscriptionPeriod[] = [];
  productOptions: ProductItem[] = [];
  lookerRegionOptions: string[] = [];
  operationTypeOptions: string[] = [];
  billingFrequencyOptions: string[] = [];
  termStartsOnOptions: string[] = [];
  
  operationTypeOpen: boolean = false;
  billingFrequencyOpen: boolean = false;
  termStartsOnOpen: boolean = false;

  // Default User Product Prices/Metadata
  developerUserPrice: number = 100;
  standardUserPrice: number = 200;
  viewerUserPrice: number = 50;
  private developerUserProductId: string = '';
  private developerUserPBEId: string = '';
  private developerUserName: string = '';
  private standardUserProductId: string = '';
  private standardUserPBEId: string = '';
  private standardUserName: string = '';
  private viewerUserProductId: string = '';
  private viewerUserPBEId: string = '';
  private viewerUserName: string = '';

  private lookerDataInitialized: boolean = false;

  get termStartDate(): string { return this.termStartInput; }
  set termStartDate(value: string) { this.termStartInput = value; }

  ngOnInit() {
    this.startDate = this.toIsoDateString(new Date());
    this.checkAndDefaultExpirationDate();
    
    SubscriptionConfigurationComponent.lastInitTime = Date.now();

    this.quoteDataService.quoteData$.subscribe(quoteData => {
      if (quoteData.opportunityName) this.opportunityName = quoteData.opportunityName;
      if (quoteData.accountName) this.accountName = quoteData.accountName;
      if (quoteData.quoteId) this.quoteId = quoteData.quoteId;
    });

    this.contextService.context$.subscribe(ctx => {
      if (ctx.quoteId && (!this.quoteId || this.quoteId.startsWith('0Q0'))) {
        this.quoteId = ctx.quoteId;
      }
    });

    setTimeout(() => {
      this.initializeLookerDataIfNeeded();
      this.isLoading = false;
    }, 100);
  }

  ngOnChanges(changes: any) {
    if (changes.productName || changes.productId) {
      if (this.isLookerSubscription) {
        this.lookerDataInitialized = false; // Reset to allow re-initialization for different Looker products
        this.initializeLookerDataIfNeeded();
      }
    }
  }

  private initializeLookerDataIfNeeded() {
    if (this.isLookerSubscription && !this.lookerDataInitialized) {
      this.lookerDataInitialized = true;
      this.loadAllPicklists();
    }
  }

  switchTab(tab: 'details' | 'plans') {
    if (tab === 'plans') {
      if (!this.termStartInput || !this.termEndDate) {
        this.toastService.show('Please provide Term Start Date and End Date before proceeding.', 'warning');
        return;
      }
    }
    this.activeTab = tab;
  }

  loadBundleDetails() {
    let bundleId = this.productId || '01tDz00000Ea17zIAB';
    this.loadingService.show();

    this.sfApi.getBundleDetails(bundleId).subscribe({
      next: (data) => {
        const result = data.result || data;
        if (result && result.productComponentGroups) {
          const groups = result.productComponentGroups;
          
          if (result.prices?.length > 0) {
            const monthlyPrice = result.prices.find((p: any) => p.pricingModel?.frequency === 'Months');
            this.bundlePricebookEntryId = monthlyPrice ? monthlyPrice.priceBookEntryId : result.prices[0].priceBookEntryId;
          }

          const platformGroup = groups.find((g: any) => g.name === 'Platform');
          const nonProdGroup = groups.find((g: any) => g.name === 'Non-production' || g.name === 'Non-Production');

          if (platformGroup) {
            this.productOptions = platformGroup.components.map((c: any) => {
              const priceObj = c.prices?.find((p: any) => p.pricingModel?.frequency === 'Months');
              let nonProdMatch = null;
              if (nonProdGroup) {
                const name = c.name.toLowerCase();
                nonProdMatch = nonProdGroup.components.find((npc: any) => {
                  const npcName = npc.name.toLowerCase();
                  if (name.includes('standard') && npcName.includes('standard')) return true;
                  if (name.includes('enterprise') && npcName.includes('enterprise')) return true;
                  if (name.includes('embed') && npcName.includes('embed')) return true;
                  return false;
                });
              }
              const npPriceObj = nonProdMatch?.prices?.find((p: any) => p.pricingModel?.frequency === 'Months');

              return {
                category: 'Platform',
                name: c.name,
                price: priceObj ? priceObj.price : 0,
                nonProdPrice: npPriceObj ? npPriceObj.price : 0,
                frequency: 'Months',
                productId: c.id,
                pricebookEntryId: priceObj?.priceBookEntryId,
                nonProdProductId: nonProdMatch?.id,
                nonProdPricebookEntryId: npPriceObj?.priceBookEntryId,
                nonProdProductName: nonProdMatch?.name
              };
            });
          }

          const userGroup = groups.find((g: any) => g.name === 'Users');
          if (userGroup) {
            userGroup.components.forEach((c: any) => {
              const priceObj = c.prices?.find((p: any) => p.pricingModel?.frequency === 'Months');
              const price = priceObj ? priceObj.price : 0;
              const pid = c.productId || c.id;
              const pbe = priceObj?.priceBookEntryId;

              const nameLower = (c.name || '').toLowerCase();
              if (nameLower.includes('developer')) {
                this.developerUserPrice = price; this.developerUserProductId = pid; this.developerUserPBEId = pbe; this.developerUserName = c.name;
              } else if (nameLower.includes('standard')) {
                this.standardUserPrice = price; this.standardUserProductId = pid; this.standardUserPBEId = pbe; this.standardUserName = c.name;
              } else if (nameLower.includes('viewer')) {
                this.viewerUserPrice = price; this.viewerUserProductId = pid; this.viewerUserPBEId = pbe; this.viewerUserName = c.name;
              }
            });
            this.syncAllPeriodUserProducts();
          }
        }
        this.loadingService.hide();
      },
      error: () => this.loadingService.hide()
    });
  }

  onSubscriptionPeriodsCreated(frequency: string) {
    this.currentFrequency = frequency;
    this.loadBundleDetails();

    const effectiveStart = this.termStartInput;
    if (!effectiveStart || !this.termEndDate) {
      this.toastService.show('Please select both Subscription Start Date and End Date.', 'error');
      return;
    }

    const totalStart = this.parseDate(effectiveStart);
    const totalEnd = this.parseDate(this.termEndDate);

    if (totalStart > totalEnd) {
      this.addOnePeriod(effectiveStart, this.termEndDate);
      this.isSubscriptionModalOpen = false;
      return;
    }

    if (this.currentFrequency === 'Yearly' && !this.isValidYearlyDuration(effectiveStart, this.termEndDate)) {
      this.toastService.show('Subscription duration should be exactly in years for yearly periods', 'error');
      return;
    }

    this.lastValidTermStart = this.termStartInput;
    this.lastValidTermEnd = this.termEndDate;

    this.subscriptionPeriods = [];
    let currentStart = new Date(totalStart);
    let pIndex = 1;

    while (currentStart <= totalEnd) {
      let nextStart = new Date(currentStart);
      nextStart.setFullYear(nextStart.getFullYear() + 1);

      let periodEnd = new Date(nextStart);
      periodEnd.setDate(periodEnd.getDate() - 1);

      if (periodEnd > totalEnd) {
        periodEnd = new Date(totalEnd);
      }

      this.addPeriodItem(pIndex++, currentStart, periodEnd, false);

      currentStart = nextStart;
      if (currentStart > totalEnd) break;
      if (pIndex > 50) break;
    }

    this.subscriptionPeriods.forEach(p => {
      if (!p.durationDays && p.startDate && p.endDate) {
        const s = this.parseDate(p.startDate);
        const e = this.parseDate(p.endDate);
        const diffTime = Math.abs(e.getTime() - s.getTime());
        p.durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }
    });

    this.isSubscriptionModalOpen = false;
  }

  addOnePeriod(start: string, end: string) {
    const startDate = start ? this.parseDate(start) : null;
    const endDate = end ? this.parseDate(end) : null;
    this.addPeriodItem(this.subscriptionPeriods.length + 1, startDate, endDate, true);
  }

  addSubscriptionPeriodDirectly() {
    if (this.subscriptionPeriods.length === 0) {
      const effectiveStart = this.termStartInput;
      if (effectiveStart && this.termEndDate) {
        if (this.currentFrequency === 'Custom') {
          this.addOnePeriod('', '');
        } else {
          this.addOnePeriod(effectiveStart, this.termEndDate);
        }
        this.onSubscriptionProductChanged();
      } else {
        this.isSubscriptionModalOpen = true;
      }
      return;
    }
    const last = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];
    if (!last.startDate || !last.endDate) {
      this.toastService.show('Please fill the current period dates before adding a new one.', 'warning');
      return;
    }

    if (this.currentFrequency === 'Custom') {
      this.addOnePeriod('', '');
      return;
    }

    const nextStart = this.parseDate(last.endDate);
    nextStart.setDate(nextStart.getDate() + 1);

    // Default to 1 year
    const nextEnd = new Date(nextStart);
    nextEnd.setFullYear(nextEnd.getFullYear() + 1);
    nextEnd.setDate(nextEnd.getDate() - 1);

    const nextStartIso = this.toIsoDateString(nextStart);
    const nextEndIso = this.toIsoDateString(nextEnd);

    if (this.currentFrequency === 'Yearly') {
      this.termEndDate = nextEndIso;
    }

    const totalEnd = this.termEndDate ? this.parseDate(this.termEndDate) : null;
    let finalEnd = nextEnd;
    if (this.currentFrequency !== 'Yearly' && totalEnd && nextEnd > totalEnd) {
      finalEnd = totalEnd;
    }

    this.addOnePeriod(nextStartIso, this.toIsoDateString(finalEnd));
    this.onSubscriptionProductChanged();
  }

  addPeriodItem(index: number, start: Date | null, end: Date | null, isManual: boolean = true) {
    const startDateIso = start ? this.toIsoDateString(start) : '';
    const endDateIso = end ? this.toIsoDateString(end) : '';

    let durationDays = 0;
    if (start && end) {
      const diffTime = Math.abs(end.getTime() - start.getTime());
      durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    this.subscriptionPeriods.push({
      id: Math.random().toString(36).substr(2, 9),
      name: `Period ${index}`,
      productCategory: 'Platform',
      productName: '',
      startDate: startDateIso,
      endDate: endDateIso,
      discount: null,
      unitPrice: null,
      nonProdPrice: null,
      isExpanded: true,
      userRows: this.getDefaultUserRows(),
      durationDays: durationDays,
      isManual: isManual
    });
  }

  private getDefaultUserRows() {
    return [
      { type: 'Viewer', price: this.viewerUserPrice, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: this.viewerUserProductId, pricebookEntryId: this.viewerUserPBEId, name: this.viewerUserName },
      { type: 'Standard', price: this.standardUserPrice, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: this.standardUserProductId, pricebookEntryId: this.standardUserPBEId, name: this.standardUserName },
      { type: 'Developer', price: this.developerUserPrice, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: this.developerUserProductId, pricebookEntryId: this.developerUserPBEId, name: this.developerUserName },
      { type: 'Non-prod', price: 0, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null }
    ];
  }

  onSubscriptionProductChanged() {
    for (let i = 0; i < this.subscriptionPeriods.length; i++) {
      const current = this.subscriptionPeriods[i];
      if (i > 0) {
        const prev = this.subscriptionPeriods[i - 1];
        if (prev.endDate) {
          const nextStart = this.parseDate(prev.endDate);
          nextStart.setDate(nextStart.getDate() + 1);
          const nextStartIso = this.toIsoDateString(nextStart);
          if (current.startDate !== nextStartIso) {
            current.startDate = nextStartIso;
          }
        }
      } else {
        if (this.termStartInput && current.startDate !== this.termStartInput) {
          current.startDate = this.termStartInput;
        }
      }

      if (current.startDate) {
        const currentStartObj = this.parseDate(current.startDate);

        if (this.currentFrequency !== 'Custom') {
          const standardEnd = new Date(currentStartObj);
          standardEnd.setFullYear(standardEnd.getFullYear() + 1);
          standardEnd.setDate(standardEnd.getDate() - 1);

          const targetEndIso = this.toIsoDateString(standardEnd);
          if (current.endDate !== targetEndIso) {
            current.endDate = targetEndIso;
          }
        }

        if (current.startDate && current.endDate) {
          const s = this.parseDate(current.startDate);
          const e = this.parseDate(current.endDate);
          if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
            if (e < s) {
              current.endDate = current.startDate;
            } else {
              const diffTime = Math.abs(e.getTime() - s.getTime());
              current.durationDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
            }
          }
        }
      }
      current.name = `Period ${i + 1}`;
    }

    const headerStartChangedByUser = (this.termStartInput !== this.lastValidTermStart);
    const headerEndChangedByUser = (this.termEndDate !== this.lastValidTermEnd);

    const lastPeriod = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];
    if (lastPeriod && lastPeriod.endDate) {
      let shouldSyncEnd = false;
      if (this.currentFrequency === 'Yearly') {
        shouldSyncEnd = !headerEndChangedByUser && this.termEndDate !== lastPeriod.endDate;
      } else {
        shouldSyncEnd = !headerEndChangedByUser && !headerStartChangedByUser && this.termEndDate !== lastPeriod.endDate;
      }

      if (shouldSyncEnd) {
        this.termEndDate = lastPeriod.endDate;
      }
    }

    if (this.termStartInput && this.termEndDate) {
      const fractionalMonths = this.calculateSubscriptionTerm(this.termStartInput, this.termEndDate);
      // Optional: sync to commitment periods if they exist in this component structure
    }

    this.lastValidTermStart = this.termStartInput;
    this.lastValidTermEnd = this.termEndDate;
  }

  isTermStartDateDisabled(): boolean {
    if (!this.termStartsOn) return false;
    const val = this.termStartsOn.toLowerCase().replace(/\s/g, '');
    return val === 'uponprovisioning' || val === 'customersignaturedate';
  }

  onSkipAndSave() {
    this.onSave();
  }

  onSave(onSuccess?: () => void, skipFeedback: boolean = false) {
    if (this.isSaving) return;
    this.syncAllPeriodUserProducts();
    if (!this.validateLookerDates()) return;

    this.isSaving = true;
    this.loadingService.show();

    const targetQuoteId = this.quoteId || this.contextService.currentContext?.quoteId;
    if (!targetQuoteId) {
        this.toastService.show('Quote ID not found.', 'error');
        this.isSaving = false;
        this.loadingService.hide();
        return;
    }

    const relType$ = this.productRelationshipTypeId
        ? of({ recentItems: [{ Id: this.productRelationshipTypeId, Name: 'Bundle to Bundle Component Relationship' }] })
        : this.sfApi.getProductRelationshipType();

    forkJoin({
        lineItemRes: this.sfApi.getQuoteLineItems(targetQuoteId),
        relTypeRes: relType$
    }).subscribe({
        next: (data) => {
            const lineItems = data.lineItemRes.records || [];
            this.extractRelationshipId(data.relTypeRes);
            const relationshipTypeId = this.productRelationshipTypeId || '0yoKf0000010wFiIAI';

            const bundleProductId = this.productId;
            const bundleLine = lineItems.find((item: any) => item.Product2Id === bundleProductId);
            const bundlePBEId = bundleLine ? bundleLine.PricebookEntryId : this.bundlePricebookEntryId;
            const mainLineId = this.bundleQuoteLineId || bundleLine?.Id || (lineItems.length > 0 ? lineItems[0].Id : null);

            const records: any[] = [];

            // 1. Quote Update
            const startToUse = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : (this.startDate || this.toIsoDateString(new Date()));
            const quoteRec: any = {
                "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId },
                "StartDate": startToUse
            };
            if (this.expirationDate) quoteRec["ExpirationDate"] = this.expirationDate;

            records.push({
                "referenceId": "refQuote",
                "record": quoteRec
            });

            if (this.subscriptionPeriods.length === 0) {
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Error: No subscription periods found to sync.', 'error');
                return;
            }

            // --- Year 1 Implementation ---
            const firstPeriod = this.subscriptionPeriods[0];
            const isRamped = this.subscriptionPeriods.length > 1;
            const year1GroupRef = "refGroup1";

            if (isRamped) {
                records.push({
                    "referenceId": year1GroupRef,
                    "record": {
                        "attributes": { "type": "QuoteLineGroup", "method": "POST" },
                        "SortOrder": 1,
                        "Name": "Year 1",
                        "QuoteId": targetQuoteId,
                        "IsRamped": true,
                        "SegmentType": "Yearly",
                        "StartDate": firstPeriod.startDate,
                        "EndDate": firstPeriod.endDate
                    }
                });
            }

            lineItems.forEach((item: any, index: number) => {
                const startToUse = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : this.startDate;
                const subTerm = this.calculateSubscriptionTerm(startToUse, firstPeriod.endDate as string);

                const lineUpdate: any = {
                    "attributes": { "type": "QuoteLineItem", "method": "PATCH", "id": item.Id },
                    "SortOrder": 1,
                    "Term_Starts_On__c": this.termStartsOn,
                    "Operation_Type__c": this.operationType,
                    "Billing_Frequency__c": this.billingFrequency,
                    "SubscriptionTerm": subTerm,
                    "SubscriptionTermUnit": "Months",
                    "PeriodBoundary": "Anniversary"
                };

                if (isRamped) {
                    lineUpdate["QuoteLineGroupId"] = `@{${year1GroupRef}.id}`;
                }

                if (this.isLookerSubscription && this.termStartInput) {
                    lineUpdate["StartDate"] = this.termStartInput;
                } else if (this.startDate) {
                    lineUpdate["StartDate"] = this.startDate;
                }

                if (firstPeriod.endDate) {
                    lineUpdate["EndDate"] = firstPeriod.endDate;
                }

                records.push({
                    "referenceId": `refLineUpdate_${index}`,
                    "record": lineUpdate
                });
            });

            if (mainLineId) {
                let childIdx = 1;
                const selectedPlatform = this.productOptions.find((p: any) => p.name === firstPeriod.productName);
                const groupId = isRamped ? `@{${year1GroupRef}.id}` : null;

                if (selectedPlatform && selectedPlatform.productId) {
                    this.addGraphRecords(records, childIdx++, selectedPlatform, firstPeriod, mainLineId, 1, targetQuoteId, 'NotIncludedInBundlePrice', firstPeriod.discount || 0, '_P1', groupId, relationshipTypeId);
                }
                firstPeriod.userRows.forEach(row => {
                    if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                        this.addGraphRecords(records, childIdx++, row, firstPeriod, mainLineId, row.quantity || 0, targetQuoteId, 'NotIncludedInBundlePrice', row.discount || 0, '_P1', groupId, relationshipTypeId);
                    }
                });
                const nonProdRow = firstPeriod.userRows.find(r => r.type === 'Non-prod');
                if (nonProdRow && (nonProdRow.quantity || 0) > 0 && selectedPlatform?.nonProdProductId) {
                    const matchingItem = {
                        ...nonProdRow,
                        productId: selectedPlatform.nonProdProductId,
                        pricebookEntryId: (selectedPlatform as any).nonProdPricebookEntryId
                    };
                    this.addGraphRecords(records, childIdx++, matchingItem, firstPeriod, mainLineId, nonProdRow.quantity || 0, targetQuoteId, 'NotIncludedInBundlePrice', nonProdRow.discount || 0, '_P1', groupId, relationshipTypeId);
                }
            }

            // --- Ramp Periods (Years 2+) ---
            if (this.subscriptionPeriods.length > 1) {
                this.subscriptionPeriods.slice(1).forEach((period, idx) => {
                    const periodNum = idx + 2;
                    const groupRef = `refRampGroup_P${periodNum}`;
                    const bundleParentRef = `refBundleParent_P${periodNum}`;

                    records.push({
                        "referenceId": groupRef,
                        "record": {
                            "attributes": { "type": "QuoteLineGroup", "method": "POST" },
                            "SortOrder": periodNum,
                            "QuoteId": targetQuoteId,
                            "Name": period.name.replace('Period', 'Year'),
                            "IsRamped": true,
                            "SegmentType": "Yearly",
                            "StartDate": period.startDate,
                            "EndDate": period.endDate
                        }
                    });

                    const subTerm = this.calculateSubscriptionTerm(period.startDate as string, period.endDate as string);
                    const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';
                    records.push({
                        "referenceId": bundleParentRef,
                        "record": {
                            "attributes": { "type": "QuoteLineItem", "method": "POST" },
                            "SortOrder": 1,
                            "QuoteId": targetQuoteId,
                            "Product2Id": bundleProductId,
                            "PricebookEntryId": bundlePBEId,
                            "Quantity": 1,
                            "BillingFrequency": standardFreq,
                            "Billing_Frequency__c": this.billingFrequency,
                            "Operation_Type__c": this.operationType,
                            "Term_Starts_On__c": this.termStartsOn,
                            "SubscriptionTerm": subTerm,
                            "SubscriptionTermUnit": "Months",
                            "PeriodBoundary": "Anniversary",
                            "StartDate": period.startDate,
                            "EndDate": period.endDate,
                            "QuoteLineGroupId": `@{${groupRef}.id}`
                        }
                    });

                    let childIdx = 1;
                    const selectedPlatform = this.productOptions.find((p: any) => p.name === period.productName);
                    if (selectedPlatform && selectedPlatform.productId) {
                        this.addGraphRecords(records, childIdx++, selectedPlatform, period, `@{${bundleParentRef}.id}`, 1, targetQuoteId, "NotIncludedInBundlePrice", period.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                    }
                    period.userRows.forEach(row => {
                        if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                            this.addGraphRecords(records, childIdx++, row, period, `@{${bundleParentRef}.id}`, row.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", row.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                        }
                    });

                    const nonProdRow = period.userRows.find(r => r.type === 'Non-prod');
                    if (nonProdRow && (nonProdRow.quantity || 0) > 0 && selectedPlatform?.nonProdProductId) {
                        const matchingItem = {
                            ...nonProdRow,
                            productId: selectedPlatform.nonProdProductId,
                            pricebookEntryId: (selectedPlatform as any).nonProdPricebookEntryId
                        };
                        this.addGraphRecords(records, childIdx++, matchingItem, period, `@{${bundleParentRef}.id}`, nonProdRow.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", nonProdRow.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                    }
                });
            }

            const finalPayload = {
                "pricingPref": "System",
                "catalogRatesPref": "Skip",
                "configurationPref": {
                    "configurationMethod": "Skip",
                    "configurationOptions": {
                        "validateProductCatalog": true,
                        "validateAmendRenewCancel": true,
                        "executeConfigurationRules": true,
                        "addDefaultConfiguration": false
                    }
                },
                "taxPref": "Skip",
                "contextDetails": {},
                "graph": {
                    "graphId": "updateQuote",
                    "records": records
                }
            };

            console.log('📦 Consolidated Graph Payload:', JSON.stringify(finalPayload, null, 2));

            this.sfApi.placeGraphRequest(finalPayload).subscribe({
                next: (res) => {
                    this.isSaving = false;
                    this.loadingService.hide();

                    this.lastSavedLookerState = JSON.stringify({
                        periods: this.subscriptionPeriods,
                        startDate: this.startDate,
                        expirationDate: this.expirationDate,
                        termStartInput: this.termStartInput,
                        termEndDate: this.termEndDate
                    });

                    if (!skipFeedback) {
                        this.toastService.show('Quote Data Saved Successfully!', 'success');
                        this.showSuccessPopup = true;
                    }
                    if (onSuccess) onSuccess();
                },

                error: (err) => {
                    console.error('❌ Consolidated Sync error:', err);
                    this.isSaving = false;
                    this.loadingService.hide();
                    this.toastService.show('Failed to save quote data.', 'error');
                }
            });
        },
        error: (err) => {
            console.error('❌ Error fetching requirements:', err);
            this.isSaving = false;
            this.loadingService.hide();
            this.toastService.show('Failed to fetch quote details.', 'error');
        }
    });
  }

  addGraphRecords(records: any[], index: number, item: any, period: SubscriptionPeriod, parentId: string, quantity: number, quoteId: string, pricing: string, discount: number = 0, suffix: string = '', groupId: string | null = null, productRelationshipTypeId: string | null = null) {
      const refIdStr = index === 1 ? '' : `-${index}`;
      const refId = `refChildQuoteLineItem${suffix}${refIdStr}`;

      const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';

      const subTerm = this.calculateSubscriptionTerm(period.startDate as string, period.endDate as string);
      const record: any = {
          "referenceId": refId,
          "record": {
              "attributes": { "type": "QuoteLineItem", "method": "POST" },
              "SortOrder": index + 1,
              "QuoteId": quoteId,
              "Product2Id": item.productId,
              "PricebookEntryId": item.pricebookEntryId || this.bundlePricebookEntryId,
              "Quantity": quantity,
              "SubscriptionTerm": subTerm,
              "SubscriptionTermUnit": "Months",
              "PeriodBoundary": "Anniversary",
              "BillingFrequency": standardFreq,
              "Billing_Frequency__c": this.billingFrequency,
              "Operation_Type__c": this.operationType,
              "Term_Starts_On__c": this.termStartsOn,
              "StartDate": period.startDate,
              "EndDate": period.endDate
          }
      };

      if (groupId) {
          record.record["QuoteLineGroupId"] = groupId;
      }

      if (discount > 0) {
          record.record["Discount"] = discount;
      }

      if (item.lookerInstanceId) {
            record.record["Looker_Instance_Id__c"] = item.lookerInstanceId;
        }

        if (item.gcpProjectId) {
            record.record["GCP_Project_Id__c"] = item.gcpProjectId;
        }

        if (item.region) {
            record.record["Looker_Region__c"] = item.region;
        }

      records.push(record);

      if (parentId && productRelationshipTypeId) {
          records.push({
              "referenceId": `refRel${suffix}_${index}`,
              "record": {
                  "attributes": { "type": "QuoteLineRelationship", "method": "POST" },
                  "MainQuoteLineId": parentId,
                  "AssociatedQuoteLineId": `@{${refId}.id}`,
                  "ProductRelationshipTypeId": productRelationshipTypeId,
                  "AssociatedQuoteLinePricing": pricing
              }
          });
      }
  }

  calculateSubscriptionTerm(startDate: string, endDate: string): number {
      if (!startDate || !endDate) return 1;
      const start = this.parseDate(startDate);
      const end = this.parseDate(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;

      const endAdjusted = new Date(end);
      endAdjusted.setDate(endAdjusted.getDate() + 1);

      let months = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());
      const temp = new Date(start);
      temp.setMonth(temp.getMonth() + months);

      if (temp > endAdjusted) {
          months--;
          temp.setTime(start.getTime());
          temp.setMonth(temp.getMonth() + months);
      }

      const diffTime = endAdjusted.getTime() - temp.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return months;

      const daysInMonth = new Date(temp.getFullYear(), temp.getMonth() + 1, 0).getDate();
      return (months + (diffDays / daysInMonth));
  }

  formatTermDisplay(startDate: string, endDate: string): string {
    if (!startDate || !endDate) return '-';
    const totalMonths = this.calculateSubscriptionTerm(startDate, endDate);
    const wholeMonths = Math.floor(totalMonths);
    const years = Math.floor(wholeMonths / 12);
    const months = wholeMonths % 12;
    
    // Calculate remaining days
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-';

    const endAdjusted = new Date(end);
    endAdjusted.setDate(endAdjusted.getDate() + 1);
    
    const temp = new Date(start);
    temp.setMonth(temp.getMonth() + wholeMonths);
    const diffTime = endAdjusted.getTime() - temp.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let result = "";
    if (years > 0) result += `${years} year${years > 1 ? 's' : ''}`;
    if (months > 0) {
        if (result) result += " ";
        result += `${months} month${months > 1 ? 's' : ''}`;
    }
    if (diffDays > 0) {
        if (result) result += " ";
        result += `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    }

    return result || "0 days";
  }

  private extractRelationshipId(response: any) {
      if (!response) return;
      const relTypes = response.records || response.recentItems || [];
      const bundleRelType = relTypes.find((r: any) => r.Name === 'Bundle to Bundle Component Relationship');

      if (bundleRelType) {
          this.productRelationshipTypeId = bundleRelType.Id;
      } else if (relTypes.length > 0) {
          this.productRelationshipTypeId = relTypes[0].Id;
      }
  }

  private validateLookerDates(): boolean {
    if (this.subscriptionPeriods.length === 0) return true;
    const last = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];
    if (last.endDate !== this.termEndDate) {
      this.toastService.show('The last period end date must match the overall subscription end date.', 'error');
      return false;
    }
    return true;
  }

  private syncAllPeriodUserProducts() {
    this.subscriptionPeriods.forEach(p => {
      p.userRows.forEach(r => {
        if (r.type === 'Viewer') { 
          r.productId = this.viewerUserProductId; 
          r.pricebookEntryId = this.viewerUserPBEId;
          r.name = this.viewerUserName;
        }
        else if (r.type === 'Standard') { 
          r.productId = this.standardUserProductId; 
          r.pricebookEntryId = this.standardUserPBEId;
          r.name = this.standardUserName;
        }
        else if (r.type === 'Developer') { 
          r.productId = this.developerUserProductId; 
          r.pricebookEntryId = this.developerUserPBEId;
          r.name = this.developerUserName;
        }
      });
    });
  }

  loadAllPicklists() {
    const recordTypeId = '012000000000000AAA';
    this.sfApi.getAllPicklistValues('QuoteLineItem', recordTypeId).subscribe({
      next: (res) => {
        const picklists = res.picklistFieldValues;
        this.loadLookerRegion(picklists);
        this.loadOperationType(picklists);
        this.loadBillingFrequency(picklists);
        this.loadTermStartsOn(picklists);
      },
      error: (err) => console.error('Error loading picklists:', err)
    });
  }

  loadLookerRegion(picklists: any) {
    const data = picklists.Looker_Region__c;
    if (data?.values) {
      this.lookerRegionOptions = data.values.map((v: any) => v.label);
    }
  }

  loadOperationType(picklists: any) {
    const data = picklists.Operation_Type__c;
    if (data?.values) {
      this.operationTypeOptions = data.values.map((v: any) => v.label);
      if (!this.operationType && data.defaultValue) {
        this.operationType = data.defaultValue.label;
      } else if (!this.operationType && this.operationTypeOptions.length > 0) {
        this.operationType = this.operationTypeOptions[0];
      }
    }
  }

  loadBillingFrequency(picklists: any) {
    const data = picklists.Billing_Frequency__c;
    if (data?.values) {
      this.billingFrequencyOptions = data.values.map((v: any) => v.label);
      if (data.defaultValue?.label) {
        this.billingFrequency = data.defaultValue.label;
      } else if (this.billingFrequencyOptions.length > 0) {
        this.billingFrequency = this.billingFrequencyOptions[0];
      }
    }
  }

  loadTermStartsOn(picklists: any) {
    const data = picklists.Term_Starts_On__c;
    if (data?.values) {
      this.termStartsOnOptions = data.values.map((v: any) => v.label);
      if (data.defaultValue?.label) {
        this.termStartsOn = data.defaultValue.label;
      } else if (this.termStartsOnOptions.length > 0) {
        this.termStartsOn = this.termStartsOnOptions[0];
      }
    }
  }

  private parseDate(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  private toIsoDateString(date: Date): string {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  private isValidYearlyDuration(s: string, e: string) {
    const start = this.parseDate(s); const end = this.parseDate(e);
    const test = new Date(start); test.setFullYear(test.getFullYear() + 1); test.setDate(test.getDate() - 1);
    return test.getTime() <= end.getTime();
  }

  private checkAndDefaultExpirationDate() {
    const d = new Date(); d.setDate(d.getDate() + 45);
    this.expirationDate = this.toIsoDateString(d);
  }

  @HostListener('document:click') closeAllDropdowns() { 
    this.operationTypeOpen = this.billingFrequencyOpen = this.termStartsOnOpen = false; 
  }

  toggleOperationType() { 
    const wasOpen = this.operationTypeOpen;
    this.closeAllDropdowns();
    this.operationTypeOpen = !wasOpen; 
  }

  toggleBillingFrequency() { 
    const wasOpen = this.billingFrequencyOpen;
    this.closeAllDropdowns();
    this.billingFrequencyOpen = !wasOpen; 
  }

  toggleTermStartsOn() { 
    const wasOpen = this.termStartsOnOpen;
    this.closeAllDropdowns();
    this.termStartsOnOpen = !wasOpen; 
  }
  selectOperationType(v: string) { this.operationType = v; this.operationTypeOpen = false; }
  selectBillingFrequency(v: string) { this.billingFrequency = v; this.billingFrequencyOpen = false; }
  selectTermStartsOn(v: string) { this.termStartsOn = v; this.termStartsOnOpen = false; }
  formatDate(s: string) { if (!s) return ''; return new Date(s).toLocaleDateString(); }
  updateTermFromDates() { this.onSubscriptionProductChanged(); }
  updateExpirationDate() { this.updateTermFromDates(); }
  openSubscriptionModal() { this.isSubscriptionModalOpen = true; }
  closeSubscriptionModal() { this.isSubscriptionModalOpen = false; }
  removeSubscriptionPeriod(i: number) { this.subscriptionPeriods.splice(i, 1); this.onSubscriptionProductChanged(); }
  get isLookerSubscription() { return true; }
  get totalTermLabel() { return this.subscriptionPeriods.length + ' periods'; }
  closeSuccessPopup() { this.showSuccessPopup = false; }
}
