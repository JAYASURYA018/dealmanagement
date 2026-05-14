import { Component, HostListener, OnInit, OnChanges, inject, ViewChild, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuoteRefreshService } from '../../services/quote-refresh.service';
import { CartService } from '../../services/cart.service';
import { ContextService } from '../../services/context.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { QuoteDataService } from '../../services/quote-data.service';
import { of, forkJoin } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
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

  // Validation messages from configurator rules
  validationErrors: { message: string; messageType: string; category: string }[] = [];
  hasValidationErrors: boolean = false;
  periodErrors: Map<number, { message: string; messageType: string; category?: string }[]> = new Map();
  private saveAttemptedWithWarnings: boolean = false;
  // Maps ref_child_XXX IDs to period indices for error mapping
  private childRefToPeriodMap: Map<string, number> = new Map();
  private childRefToProductNameMap: Map<string, string> = new Map();

  @Output() validationMessagesReceived = new EventEmitter<{ productId: string; productName: string; messages: any[] }>();

  activeTab: 'details' | 'plans' = 'details';

  // Quote Data Properties
  opportunityName: string = '';
  @Input() accountId: string = '';
  @Input() startingSortOrder: number = 1;
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

  getPreviewData(response: any) {
    const transaction = response?.transaction?.SalesTransaction?.[0];
    if (!transaction) return null;

    const items = transaction.SalesTransactionItem || [];
    
    // Fallback: If SalesTransactionGroup is missing/empty, synthesize groups from Looker items
    let groups = [...(transaction.SalesTransactionGroup || [])];
    if (groups.length === 0) {
      const lookerItems = items.filter((item: any) => item.PeriodBoundary === 'Anniversary');
      const periodMap = new Map<string, any>();
      
      lookerItems.forEach((item: any) => {
        const key = `${item.StartDate}_${item.EndDate}`;
        if (!periodMap.has(key)) {
          periodMap.set(key, {
            id: item.SalesTransactionItemGroup || `synthetic_${key}`,
            GroupStartDate__std: item.StartDate,
            GroupEndDate__std: item.EndDate,
            isSynthetic: true
          });
        }
      });
      groups = Array.from(periodMap.values());
    }

    // Sort groups by start date to ensure Years are in chronological order
    groups.sort((a, b) => {
      const dateA = new Date(a.GroupStartDate__std).getTime();
      const dateB = new Date(b.GroupStartDate__std).getTime();
      return dateA - dateB;
    });

    // Map groups to previewCommitments (Years)
    const previewCommitments = groups.map((group: any, idx: number) => {
      // Filter items for this group
      // Fallback: Match by date range if SalesTransactionItemGroup is missing
      const groupItems = items.filter((item: any) => {
        const matchesGroup = item.SalesTransactionItemGroup === group.id || 
                            (item.PeriodBoundary === 'Anniversary' && 
                             item.StartDate === group.GroupStartDate__std && 
                             item.EndDate === group.GroupEndDate__std);
        
        return matchesGroup && 
               item.ProductCode !== 'LookerBundleNewRCA' && 
               item.Product !== this.productId;
      });
      
      return {
        name: `Year ${idx + 1}`,
        startDate: this.formatDateForDisplay(group.GroupStartDate__std),
        endDate: this.formatDateForDisplay(group.GroupEndDate__std),
        amount: group.GroupTotalAmount || groupItems.reduce((sum: number, i: any) => sum + (Number(i.TotalPrice) || 0), 0),
        items: groupItems.map((item: any) => ({
          name: item.ProductName || item.ProductCode,
          operationType: item.Operation_Type__c || 'New',
          quantity: item.Quantity,
          startDate: this.formatDateForDisplay(item.StartDate),
          orderTerm: item.SubscriptionTerm,
          listPrice: item.ListPrice || item.UnitPrice,
          discount: item.Discount || 0,
          total: item.TotalPrice
        }))
      };
    });

    // Deduplicate top-level Looker items (only show the bundle once in "Product Details")
    const bundleItem = items.find((item: any) => 
       item.ProductCode === 'LookerBundleNewRCA' || 
       item.Product === this.productId ||
       item.PeriodBoundary === 'Anniversary'
    );
    
    const topLevelLookerItems = bundleItem ? [{
      ...bundleItem,
      Product_Name_Display: 'Looker New RCA',
      Quantity: 1,
      ListPrice: bundleItem.ListPrice || bundleItem.UnitPrice || 0,
      TotalPrice: transaction.GrandTotal__std || transaction.TotalAmount || 0
    }] : [];

    return {
      previewCommitments: previewCommitments,
      commitmentDetailsOnly: [],
      previewProductsWithoutDiscounts: topLevelLookerItems,
      isLookerSubscription: true,
      totalContractValue: transaction.GrandTotal__std || transaction.TotalAmount,
      totalIncentivesValue: 0,
      totalTerms: previewCommitments.length * 12,
      startDate: transaction.StartDate,
      expirationDate: transaction.ExpirationDate__c
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
  bundlePsmId: string | null = null;
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
  private developerUserPSMId: string = '';
  private developerUserRelCompId: string = '';
  private developerUserName: string = '';
  private standardUserProductId: string = '';
  private standardUserPBEId: string = '';
  private standardUserPSMId: string = '';
  private standardUserRelCompId: string = '';
  private standardUserName: string = '';
  private viewerUserProductId: string = '';
  private viewerUserPBEId: string = '';
  private viewerUserPSMId: string = '';
  private viewerUserRelCompId: string = '';
  private viewerUserName: string = '';

  private lookerDataInitialized: boolean = false;

  get termStartDate(): string { return this.termStartInput; }
  set termStartDate(value: string) { this.termStartInput = value; }

  ngOnInit() {
    this.checkAndDefaultExpirationDate();

    SubscriptionConfigurationComponent.lastInitTime = Date.now();

    this.quoteDataService.quoteData$.subscribe(quoteData => {
      if (quoteData.opportunityName) this.opportunityName = quoteData.opportunityName;
      if (quoteData.accountName) this.accountName = quoteData.accountName;
      if (quoteData.quoteId) {
        this.quoteId = quoteData.quoteId;
        this.loadStateFromSession();
      }
    });

    this.contextService.context$.subscribe(ctx => {
      if (ctx.quoteId && (!this.quoteId || this.quoteId.startsWith('0Q0'))) {
        this.quoteId = ctx.quoteId;
        this.loadStateFromSession();
      }
    });

    this.loadStateFromSession();

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
      this.loadBundleDetails();
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
    this.saveStateToSession();
  }

  loadBundleDetails() {
    let bundleId = this.productId || '01tDz00000Ea17zIAB';
    this.loadingService.show();

    this.sfApi.getBundleDetails(bundleId).subscribe({
      next: (data) => {
        console.log('[loadBundleDetails] Raw Response:', data);
        const result = data.result || data;
        if (result) {
          console.log('[loadBundleDetails] Result Object:', result);
          const groups = result.productComponentGroups || result.groups || [];
          console.log('[loadBundleDetails] Found Groups:', groups);

          if (result.prices?.length > 0) {
            const monthlyPrice = result.prices.find((p: any) => p.pricingModel?.frequency === 'Months');
            this.bundlePricebookEntryId = monthlyPrice ? monthlyPrice.priceBookEntryId : result.prices[0].priceBookEntryId;
            this.bundlePsmId = monthlyPrice?.pricingModel?.id ||
              result.productSellingModelOptions?.find((o: any) => (o.productSellingModel?.name || '').toLowerCase().includes('monthly'))?.productSellingModelId;
          }
          const platformGroup = groups.find((g: any) => {
            const name = (g.name || '').toLowerCase();
            return name.includes('platform');
          });
          const userGroupMatch = groups.find((g: any) => {
            const name = (g.name || '').toLowerCase();
            return name.includes('user');
          });
          const nonProdGroup = groups.find((g: any) => {
            const name = (g.name || '').toLowerCase();
            return name.includes('non-prod') || name.includes('non prod');
          });

          if (platformGroup) {
            this.productOptions = platformGroup.components.map((c: any) => {
              const priceObj = c.prices?.find((p: any) => {
                const freq = (p.pricingModel?.frequency || '').toLowerCase();
                return freq === 'months' || freq === 'monthly' || freq.includes('monthly in advance');
              });
              if (!priceObj && c.prices?.length > 0) {
                console.warn(`[loadBundleDetails] No monthly price match for ${c.name}. Available frequencies:`, c.prices.map((p: any) => p.pricingModel?.frequency));
              }

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
              const npPriceObj = nonProdMatch?.prices?.find((p: any) => {
                const freq = (p.pricingModel?.frequency || '').toLowerCase();
                return freq === 'months' || freq === 'monthly' || freq.includes('monthly in advance');
              });

              return {
                category: 'Platform',
                name: c.name,
                price: priceObj ? priceObj.price : 0,
                nonProdPrice: npPriceObj ? npPriceObj.price : 0,
                frequency: 'Months',
                productId: c.productId || c.id,
                pricebookEntryId: priceObj?.priceBookEntryId,
                psmId: priceObj?.pricingModel?.productSellingModelId ||
                  c.productSellingModelOptions?.find((o: any) => o.productSellingModel?.id === priceObj?.pricingModel?.id)?.productSellingModelId ||
                  c.productSellingModelOptions?.find((o: any) => (o.productSellingModel?.name || '').toLowerCase().includes('monthly'))?.productSellingModelId,
                relComponentId: c.productRelatedComponent?.id,
                nonProdProductId: nonProdMatch?.productId || nonProdMatch?.id,
                nonProdPricebookEntryId: npPriceObj?.priceBookEntryId,
                nonProdPsmId: npPriceObj?.pricingModel?.productSellingModelId ||
                  nonProdMatch?.productSellingModelOptions?.find((o: any) => o.productSellingModel?.id === npPriceObj?.pricingModel?.id)?.productSellingModelId ||
                  nonProdMatch?.productSellingModelOptions?.find((o: any) => (o.productSellingModel?.name || '').toLowerCase().includes('monthly'))?.productSellingModelId,
                nonProdRelComponentId: nonProdMatch?.productRelatedComponent?.id,
                nonProdProductName: nonProdMatch?.name
              };
            });
          }

          if (userGroupMatch) {
            userGroupMatch.components.forEach((c: any) => {
              const priceObj = c.prices?.find((p: any) => {
                const freq = (p.pricingModel?.frequency || '').toLowerCase();
                return freq === 'months' || freq === 'monthly' || freq.includes('monthly in advance');
              });
              if (!priceObj && c.prices?.length > 0) {
                console.warn(`[loadBundleDetails] No monthly price match for User Product ${c.name}. Available frequencies:`, c.prices.map((p: any) => p.pricingModel?.frequency));
              }
              const price = priceObj ? priceObj.price : 0;
              const pid = c.productId || c.id;
              const pbe = priceObj?.priceBookEntryId;
              const psm = priceObj?.pricingModel?.productSellingModelId ||
                c.productSellingModelOptions?.find((o: any) => o.productSellingModel?.id === priceObj?.pricingModel?.id)?.productSellingModelId ||
                c.productSellingModelOptions?.find((o: any) => (o.productSellingModel?.name || '').toLowerCase().includes('monthly'))?.productSellingModelId;
              const relCompId = c.productRelatedComponent?.id;

              const nameLower = (c.name || '').toLowerCase();
              if (nameLower.includes('developer')) {
                this.developerUserPrice = price; this.developerUserProductId = pid; this.developerUserPBEId = pbe; this.developerUserPSMId = psm; this.developerUserRelCompId = relCompId; this.developerUserName = c.name;
              } else if (nameLower.includes('standard')) {
                this.standardUserPrice = price; this.standardUserProductId = pid; this.standardUserPBEId = pbe; this.standardUserPSMId = psm; this.standardUserRelCompId = relCompId; this.standardUserName = c.name;
              } else if (nameLower.includes('viewer')) {
                this.viewerUserPrice = price; this.viewerUserProductId = pid; this.viewerUserPBEId = pbe; this.viewerUserPSMId = psm; this.viewerUserRelCompId = relCompId; this.viewerUserName = c.name;
              }
            });
          }
          this.syncAllPeriodUserProducts();
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
      { type: 'Viewer', price: this.viewerUserPrice, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: this.viewerUserProductId, pricebookEntryId: this.viewerUserPBEId, psmId: this.viewerUserPSMId, relComponentId: this.viewerUserRelCompId, name: this.viewerUserName },
      { type: 'Standard', price: this.standardUserPrice, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: this.standardUserProductId, pricebookEntryId: this.standardUserPBEId, psmId: this.standardUserPSMId, relComponentId: this.standardUserRelCompId, name: this.standardUserName },
      { type: 'Developer', price: this.developerUserPrice, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: this.developerUserProductId, pricebookEntryId: this.developerUserPBEId, psmId: this.developerUserPSMId, relComponentId: this.developerUserRelCompId, name: this.developerUserName },
      { type: 'Non-prod', price: 0, frequency: 'Months', quantity: null, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null, productId: '', pricebookEntryId: '', psmId: '', relComponentId: '', name: '' }
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

    this.saveStateToSession();
  }

  isTermStartDateDisabled(): boolean {
    if (!this.termStartsOn) return false;
    const val = this.termStartsOn.toLowerCase().replace(/\s/g, '');
    return val === 'uponprovisioning' || val === 'customersignaturedate';
  }

  onSkipAndSave() {
    this.onSave();
  }

  clearValidationErrors() {
    this.validationErrors = [];
    this.hasValidationErrors = false;
    this.periodErrors.clear();
    this.childRefToPeriodMap.clear();
  }

  private parseConfiguratorMessages(response: any): { errors: any[]; warnings: any[]; infos: any[]; all: any[]; hasMessages: boolean; hasConfigurationRules: boolean; hasErrors: boolean; hasConfigurationRuleErrors: boolean } {
    const errors: any[] = [];
    const warnings: any[] = [];
    const infos: any[] = [];
    const all: any[] = [];
    let hasConfigurationRules = false;
    let hasErrors = false;
    let hasConfigurationRuleErrors = false;

    const messages = response?.configuratorMessages;
    if (!messages || typeof messages !== 'object') {
      return { errors, warnings, infos, all, hasMessages: false, hasConfigurationRules: false, hasErrors: false, hasConfigurationRuleErrors: false };
    }

    // Iterate through all keys in configuratorMessages
    Object.keys(messages).forEach(key => {
      const msgArray = messages[key];
      if (!Array.isArray(msgArray)) return;

      const resolvedProductName = this.resolveProductNameForNode(key);

      msgArray.forEach((msg: any) => {
        const entry = {
          message: msg.message,
          messageType: msg.messageType || 'info',
          category: msg.category,
          primaryRecordId: msg.primaryRecordId,
          relatedRecordId: msg.relatedRecordId || key,
          productName: resolvedProductName || this.productName
        };

        if (msg.messageType === 'error') {
          hasErrors = true;
        }

        if (msg.category === 'configurationrules') {
          hasConfigurationRules = true;
          if (msg.messageType === 'error') {
            hasConfigurationRuleErrors = true;
          }
          
          // Only show configurationrules on the UI as per user request
          all.push(entry);

          if (msg.messageType === 'error') {
            errors.push(entry);
          } else if (msg.messageType === 'warning') {
            warnings.push(entry);
          } else {
            infos.push(entry);
          }
        }
      });
    });

    return { errors, warnings, infos, all, hasMessages: all.length > 0, hasConfigurationRules, hasErrors, hasConfigurationRuleErrors };
  }

  onSave(onSuccess?: (previewData?: any) => void, skipFeedback: boolean = false) {
    if (this.isSaving) return;
    this.syncAllPeriodUserProducts();
    if (!this.validateLookerConfig()) return;

    // Clear previous validation errors before saving
    this.clearValidationErrors();

    this.isSaving = true;
    this.loadingService.show();

    const targetQuoteId = this.quoteId || this.contextService.currentContext?.quoteId;
    const mappingId = this.contextService.quoteEntitiesMappingId;

    if (!targetQuoteId) {
      this.toastService.show('Quote ID not found.', 'error');
      this.isSaving = false;
      this.loadingService.hide();
      return;
    }

    if (!mappingId) {
      this.toastService.show('Context Mapping ID not found. Please reload the page.', 'error');
      this.isSaving = false;
      this.loadingService.hide();
      return;
    }

    // 1. Set Instance
    this.sfApi.setInstance(mappingId, targetQuoteId).pipe(
      switchMap((setRes: any) => {
        const contextId = setRes.contextId;
        if (!contextId) throw new Error('Failed to initialize configurator instance');

        // 2. Build Looker Nodes
        const addedNodes = this.buildLookerNodes(targetQuoteId);

        // 3. Add Nodes
        return this.sfApi.addNodes(contextId, addedNodes).pipe(
          switchMap((addNodesRes: any) => {
            // 3.5. Check for configuratorMessages in the response
            const parsed = this.parseConfiguratorMessages(addNodesRes);
            console.log('[Looker Save] Configurator messages parsed:', parsed);

            // Block logic: Only configurationrules category matters
            // 1st save: block if any configurationrules messages exist
            // 2nd save: block only if configurationrules messages with error type exist
            const shouldBlock = parsed.hasConfigurationRuleErrors || (parsed.hasConfigurationRules && !this.saveAttemptedWithWarnings);

            if (shouldBlock) {
              if (parsed.hasConfigurationRules && !parsed.hasConfigurationRuleErrors) {
                this.saveAttemptedWithWarnings = true;
              }
              
              this.validationErrors = parsed.all.map(e => ({
                message: e.message,
                messageType: e.messageType,
                category: e.category
              }));
              this.hasValidationErrors = true;

              // Group errors by period
              this.groupErrorsByPeriod(parsed.all);

              // Emit to parent for sidebar highlighting
              this.validationMessagesReceived.emit({
                productId: this.productId || '',
                productName: this.getActualProductNames(targetQuoteId),
                messages: parsed.all
              });

              const blockMsg = parsed.hasConfigurationRuleErrors ? 
                'Configuration rule errors found. Fix issues and try again.' : 
                'Review configuration rules and click Save again to proceed.';
              
              throw { isValidationError: true, message: blockMsg };
            }
            
            // If we reach here, either clean or user clicked second time with only non-error rules
            this.saveAttemptedWithWarnings = false;
            
            // 4. Save Instance
            return this.sfApi.saveInstance(contextId).pipe(
              switchMap(() => {
                // New Place Action Call after Save and before Load
                const placePayload = {
                  "pricingPref": "force",
                  "graph": {
                    "graphId": "updateQuote",
                    "records": [
                      {
                        "referenceId": targetQuoteId,
                        "record": {
                          "attributes": {
                            "type": "Quote",
                            "method": "PATCH",
                            "id": targetQuoteId
                          },
                          "StartDate": this.termStartInput,
                          "ExpirationDate": this.termEndDate
                        }
                      }
                    ]
                  }
                };
                return this.sfApi.placeSalesTransaction(placePayload);
              }),
              switchMap(() => this.sfApi.loadConfiguratorInstance(targetQuoteId)),
              switchMap((loadRes: any) => {
                const newContextId = loadRes.contextId;
                return this.sfApi.getConfiguratorInstance(newContextId);
              })
            );
          })
        );
      })
    ).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.loadingService.hide();

        // Clear errors on successful save
        this.clearValidationErrors();
        this.validationMessagesReceived.emit({
          productId: this.productId || '',
          productName: this.getActualProductNames(targetQuoteId),
          messages: []
        });

        this.lastSavedLookerState = JSON.stringify({
          periods: this.subscriptionPeriods,
          startDate: this.startDate,
          expirationDate: this.expirationDate,
          termStartInput: this.termStartInput,
          termEndDate: this.termEndDate
        });

        if (!skipFeedback) {
          this.toastService.show('Looker Configuration Saved Successfully!', 'success');
          this.showSuccessPopup = true;
        }
        if (onSuccess) onSuccess(res);
      },
      error: (err) => {
        this.isSaving = false;
        this.loadingService.hide();

        // If it's a validation error (we threw it), don't show a generic error
        if (err?.isValidationError) {
          console.warn('[Looker Save] Blocked by validation errors.');
          return;
        }

        console.error('❌ Looker Save error:', err);
        this.toastService.show(err.message || 'Failed to save looker configuration.', 'error');
      }
    });
  }

  private buildLookerNodes(quoteId: string): any[] {
    const nodes: any[] = [];
    const isRamped = this.subscriptionPeriods.length > 1;
    let globalChildCounter = 1;
    let globalRelCounter = 1;
    let globalSortOrder = this.startingSortOrder;
    // Clear and rebuild the mapping registries
    this.childRefToPeriodMap.clear();
    this.childRefToProductNameMap.clear();

    this.subscriptionPeriods.forEach((period, pIdx) => {
      const periodNum = pIdx + 1;
      const periodSuffix = periodNum.toString().padStart(2, '0');
      const groupRefId = `looker_group${periodNum}`;
      const parentLineRefId = `looker_parent_line_${periodSuffix}`;

      // A. QuoteLineGroup Node - Only create groups when there are multiple periods (ramped)
      if (isRamped) {
        nodes.push({
          "path": [quoteId, groupRefId],
          "addedObject": {
            "id": groupRefId,
            "GroupSortOrder": this.startingSortOrder + pIdx,
            "GroupName": `Year ${periodNum}`,
            "GroupIsRamped__std": true,
            "GroupSegmentType__std": "Yearly",
            "GroupStartDate__std": period.startDate,
            "GroupEndDate__std": period.endDate,
            "GroupSource": groupRefId,
            "ParentReference": quoteId,
            "SalesTransactionGroupParent": quoteId,
            "businessObjectType": "QuoteLineGroup"
          }
        });
      }

      // B. Main Bundle Line Node (Looker New RCA) - This is the Parent
      const subTermRaw = this.calculateSubscriptionTerm(period.startDate as string, period.endDate as string);
      const subTerm = subTermRaw > 0.95 && subTermRaw < 1.05 ? 1 : subTermRaw;
      const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';

      const startDateIso = period.startDate ? `${period.startDate}T00:00:00.000Z` : null;
      const endDateIso = period.endDate ? `${period.endDate}T00:00:00.000Z` : null;

      nodes.push({
        "path": [quoteId, parentLineRefId],
        "addedObject": {
          "id": parentLineRefId,
          "ItemSortOrder": globalSortOrder++,
          "SalesTransactionItemSource": parentLineRefId,
          "SalesTransactionItemParent": quoteId,
          "SalesTransactionItemGroup": isRamped ? `@{${groupRefId}.id}` : null,
          "LineItemPath": parentLineRefId,
          "Product": this.productId || '01tDz00000Ea17zIAB',
          "PricebookEntry": this.bundlePricebookEntryId || '01uDz00000dqXP8IAM',
          "ProductSellingModel": this.bundlePsmId || "0jPDz000000001OMAQ",
          "Quantity": 1,
          "StartDate": startDateIso,
          "EndDate": endDateIso,
          "SubscriptionTerm": subTerm,
          "SubscriptionTermUnit": "Monthly",
          "PeriodBoundary": "Anniversary",
          "BillingFrequency": standardFreq,
          "Billing_Frequency__c": this.billingFrequency,
          "Operation_Type__c": this.operationType || 'New',
          "Term_Starts_On__c": this.termStartsOn || 'Fixed Start Date',
          "businessObjectType": "QuoteLineItem"
        }
      });

      // C. Platform Product as a Child
      if (period.productId && period.pricebookEntryId && period.psmId) {
        const childSuffix = globalChildCounter.toString().padStart(3, '0');
        const relSuffix = globalRelCounter.toString().padStart(3, '0');
        const platChildId = `ref_child_${childSuffix}`;
        const platRelId = `ref_rel_${relSuffix}`;
        // Track this child ref to the period index
        this.childRefToPeriodMap.set(platChildId, pIdx);
        this.childRefToProductNameMap.set(platChildId, period.productName || 'Platform');

        globalChildCounter++;
        globalRelCounter++;

        const childObj: any = {
          "id": platChildId,
          "ItemSortOrder": globalSortOrder++,
          "SalesTransactionItemSource": platChildId,
          "SalesTransactionItemParent": quoteId,
          "Product": period.productId,
          "PricebookEntry": period.pricebookEntryId,
          "ProductSellingModel": period.psmId || "0jPDz000000001OMAQ",
          "Quantity": 1,
          "StartDate": startDateIso,
          "EndDate": endDateIso,
          "SubscriptionTerm": subTerm,
          "Discount": period.discount || 0,
          "SubscriptionTermUnit": "Monthly",
          "PeriodBoundary": "Anniversary",
          "BillingFrequency": standardFreq,
          "Billing_Frequency__c": this.billingFrequency,
          "Operation_Type__c": this.operationType || 'New',
          "Term_Starts_On__c": this.termStartsOn || 'Fixed Start Date',
          "businessObjectType": "QuoteLineItem"
        };

        nodes.push({
          "path": [quoteId, platChildId],
          "addedObject": childObj
        });

        nodes.push({
          "path": [quoteId, platChildId, platRelId],
          "addedObject": {
            "id": platRelId,
            "MainItem": parentLineRefId,
            "AssociatedItem": platChildId,
            "ProductRelatedComponent": period.relComponentId,
            "AssociatedItemPricing": "NotIncludedInBundlePrice",
            "AssociatedQuantScaleMethod": "Proportional",
            "businessObjectType": "QuoteLineRelationship"
          }
        });
      }

      // D. Child User Product Nodes & Relationships
      period.userRows.forEach((row) => {
        if (row.type !== 'Non-prod' && (row.quantity || 0) > 0) {
          if (row.productId && row.pricebookEntryId && row.psmId) {
            const childSuffix = globalChildCounter.toString().padStart(3, '0');
            const relSuffix = globalRelCounter.toString().padStart(3, '0');
            const childId = `ref_child_${childSuffix}`;
            const relId = `ref_rel_${relSuffix}`;
            // Track this child ref to the period index
            this.childRefToPeriodMap.set(childId, pIdx);
            this.childRefToProductNameMap.set(childId, row.name || row.type);

            globalChildCounter++;
            globalRelCounter++;

            // User Product Line
            const userObj: any = {
              "id": childId,
              "ItemSortOrder": globalSortOrder++,
              "SalesTransactionItemSource": childId,
              "SalesTransactionItemParent": quoteId,
              "Product": row.productId,
              "PricebookEntry": row.pricebookEntryId,
              "ProductSellingModel": row.psmId || "0jPDz000000001OMAQ",
              "Quantity": row.quantity || 0,
              "StartDate": startDateIso,
              "EndDate": endDateIso,
              "SubscriptionTerm": subTerm,
              "Discount": row.discount,
              "SubscriptionTermUnit": "Monthly",
              "PeriodBoundary": "Anniversary",
              "BillingFrequency": standardFreq,
              "Billing_Frequency__c": this.billingFrequency,
              "Operation_Type__c": this.operationType || 'New',
              "Term_Starts_On__c": this.termStartsOn || 'Fixed Start Date',
              "businessObjectType": "QuoteLineItem"
            };

            if (row.lookerInstanceId) userObj["Looker_Instance_Id__c"] = row.lookerInstanceId;
            if (row.gcpProjectId) userObj["GCP_Project_Id__c"] = row.gcpProjectId;
            if (row.region) userObj["Looker_Region__c"] = row.region;

            nodes.push({
              "path": [quoteId, childId],
              "addedObject": userObj
            });

            // Relationship
            nodes.push({
              "path": [quoteId, childId, relId],
              "addedObject": {
                "id": relId,
                "MainItem": parentLineRefId,
                "AssociatedItem": childId,
                "ProductRelatedComponent": row.relComponentId,
                "AssociatedItemPricing": "NotIncludedInBundlePrice",
                "AssociatedQuantScaleMethod": "Proportional",
                "businessObjectType": "QuoteLineRelationship"
              }
            });
          }
        }
      });

      // E. Non-Prod Product Logic
      const nonProdRow = period.userRows.find(r => r.type === 'Non-prod');
      if (nonProdRow && (nonProdRow.quantity || 0) > 0 && period.nonProdProductId && period.nonProdPricebookEntryId && period.nonProdPsmId) {
        const childSuffix = globalChildCounter.toString().padStart(3, '0');
        const relSuffix = globalRelCounter.toString().padStart(3, '0');
        const npChildId = `ref_child_${childSuffix}`;
        const npRelId = `ref_rel_${relSuffix}`;
        // Track this child ref to the period index
        this.childRefToPeriodMap.set(npChildId, pIdx);
        this.childRefToProductNameMap.set(npChildId, period.nonProdProductName || nonProdRow.type);

        globalChildCounter++;
        globalRelCounter++;

        const npObj: any = {
          "id": npChildId,
          "ItemSortOrder": globalSortOrder++,
          "SalesTransactionItemSource": npChildId,
          "SalesTransactionItemParent": quoteId,
          "Product": period.nonProdProductId,
          "PricebookEntry": period.nonProdPricebookEntryId,
          "ProductSellingModel": period.nonProdPsmId || "0jPDz000000001OMAQ",
          "Quantity": nonProdRow.quantity || 0,
          "StartDate": startDateIso,
          "EndDate": endDateIso,
          "SubscriptionTerm": subTerm,
          "Discount": nonProdRow.discount,
          "SubscriptionTermUnit": "Monthly",
          "PeriodBoundary": "Anniversary",
          "BillingFrequency": standardFreq,
          "Billing_Frequency__c": this.billingFrequency,
          "Operation_Type__c": this.operationType || 'New',
          "Term_Starts_On__c": this.termStartsOn || 'Fixed Start Date',
          "businessObjectType": "QuoteLineItem"
        };

        if (nonProdRow.lookerInstanceId) npObj["Looker_Instance_Id__c"] = nonProdRow.lookerInstanceId;
        if (nonProdRow.gcpProjectId) npObj["GCP_Project_Id__c"] = nonProdRow.gcpProjectId;
        if (nonProdRow.region) npObj["Looker_Region__c"] = nonProdRow.region;

        nodes.push({
          "path": [quoteId, npChildId],
          "addedObject": npObj
        });

        // Relationship to Platform
        nodes.push({
          "path": [quoteId, npChildId, npRelId],
          "addedObject": {
            "id": npRelId,
            "MainItem": parentLineRefId,
            "AssociatedItem": npChildId,
            "ProductRelatedComponent": period.nonProdRelComponentId,
            "AssociatedItemPricing": "NotIncludedInBundlePrice",
            "AssociatedQuantScaleMethod": "Proportional",
            "businessObjectType": "QuoteLineRelationship"
          }
        });
      }
    });

    console.log('[buildLookerNodes] Final Nodes:', nodes);
    console.log('[buildLookerNodes] childRefToPeriodMap:', Object.fromEntries(this.childRefToPeriodMap));
    return nodes;
  }


  private validateLookerConfig(): boolean {
    if (this.subscriptionPeriods.length === 0) return true;

    for (let i = 0; i < this.subscriptionPeriods.length; i++) {
      const p = this.subscriptionPeriods[i];
      const yearLabel = `Year ${i + 1}`;

      // 1. Check if period has a platform product
      if (!p.productName || p.productName === 'Select') {
        this.toastService.show(`${yearLabel}: Must select platform product.`, 'error');
        return false;
      }
    }

    // 3. Date check for the last period
    const last = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];
    if (last.endDate !== this.termEndDate) {
      this.toastService.show('The last period end date must match the overall subscription end date.', 'error');
      return false;
    }

    return true;
  }

  private syncAllPeriodUserProducts() {
    this.subscriptionPeriods.forEach(p => {
      // Sync Platform IDs
      if (p.productName) {
        const option = this.productOptions.find(opt => opt.name === p.productName);
        if (option) {
          p.productId = option.productId;
          p.pricebookEntryId = option.pricebookEntryId;
          p.psmId = option.psmId;
          p.relComponentId = option.relComponentId;
          p.nonProdProductId = option.nonProdProductId;
          p.nonProdPricebookEntryId = option.nonProdPricebookEntryId;
          p.nonProdPsmId = option.nonProdPsmId;
          p.nonProdRelComponentId = option.nonProdRelComponentId;
          p.nonProdProductName = option.nonProdProductName;
          p.unitPrice = option.price ?? null;
        }
      }

      p.userRows.forEach(r => {
        if (r.type === 'Viewer') {
          r.productId = this.viewerUserProductId;
          r.pricebookEntryId = this.viewerUserPBEId;
          r.psmId = this.viewerUserPSMId;
          r.relComponentId = this.viewerUserRelCompId;
          r.name = this.viewerUserName;
        }
        else if (r.type === 'Standard') {
          r.productId = this.standardUserProductId;
          r.pricebookEntryId = this.standardUserPBEId;
          r.psmId = this.standardUserPSMId;
          r.relComponentId = this.standardUserRelCompId;
          r.name = this.standardUserName;
        }
        else if (r.type === 'Developer') {
          r.productId = this.developerUserProductId;
          r.pricebookEntryId = this.developerUserPBEId;
          r.psmId = this.developerUserPSMId;
          r.relComponentId = this.developerUserRelCompId;
          r.name = this.developerUserName;
        }
        else if (r.type === 'Non-prod') {
          r.productId = p.nonProdProductId || '';
          r.pricebookEntryId = p.nonProdPricebookEntryId || '';
          r.psmId = p.nonProdPsmId || '';
          r.relComponentId = p.nonProdRelComponentId || '';
          r.name = p.nonProdProductName || '';
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
      if (!this.billingFrequency && data.defaultValue?.label) {
        this.billingFrequency = data.defaultValue.label;
      } else if (!this.billingFrequency && this.billingFrequencyOptions.length > 0) {
        this.billingFrequency = this.billingFrequencyOptions[0];
      }
    }
  }

  loadTermStartsOn(picklists: any) {
    const data = picklists.Term_Starts_On__c;
    if (data?.values) {
      this.termStartsOnOptions = data.values.map((v: any) => v.label);
      if (!this.termStartsOn && data.defaultValue?.label) {
        this.termStartsOn = data.defaultValue.label;
      } else if (!this.termStartsOn && this.termStartsOnOptions.length > 0) {
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
    const term = months + (diffDays / daysInMonth);
    return Math.round(term * 10000) / 10000;
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
  get sessionKey() {
    return 'subscription_config_' + (this.quoteId || 'draft') + '_' + (this.productId || '');
  }

  saveStateToSession() {
    try {
      const state = {
        operationType: this.operationType,
        billingFrequency: this.billingFrequency,
        termStartsOn: this.termStartsOn,
        termStartInput: this.termStartInput,
        termEndDate: this.termEndDate,
        activeTab: this.activeTab,
        subscriptionPeriods: this.subscriptionPeriods,
        currentFrequency: this.currentFrequency
      };
      sessionStorage.setItem(this.sessionKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save to session', e);
    }
  }

  loadStateFromSession() {
    try {
      if (!this.sessionKey) return;
      const raw = sessionStorage.getItem(this.sessionKey);
      if (raw) {
        const state = JSON.parse(raw);
        if (state.operationType) this.operationType = state.operationType;
        if (state.billingFrequency) this.billingFrequency = state.billingFrequency;
        if (state.termStartsOn) this.termStartsOn = state.termStartsOn;
        if (state.termStartInput) this.termStartInput = state.termStartInput;
        if (state.termEndDate) this.termEndDate = state.termEndDate;
        if (state.activeTab) this.activeTab = state.activeTab;
        if (state.subscriptionPeriods) this.subscriptionPeriods = state.subscriptionPeriods;
        if (state.currentFrequency) this.currentFrequency = state.currentFrequency;
      }
    } catch (e) {
      console.warn('Could not load from session', e);
    }
  }

  selectOperationType(v: string) { this.operationType = v; this.operationTypeOpen = false; this.saveStateToSession(); }
  selectBillingFrequency(v: string) { this.billingFrequency = v; this.billingFrequencyOpen = false; this.saveStateToSession(); }
  selectTermStartsOn(v: string) { this.termStartsOn = v; this.termStartsOnOpen = false; this.saveStateToSession(); }
  formatDate(s: string) { if (!s) return ''; return new Date(s).toLocaleDateString(); }
  updateTermFromDates() { this.onSubscriptionProductChanged(); this.saveStateToSession(); }
  updateExpirationDate() { this.updateTermFromDates(); }
  openSubscriptionModal() { this.isSubscriptionModalOpen = true; }
  closeSubscriptionModal() { this.isSubscriptionModalOpen = false; }
  removeSubscriptionPeriod(i: number) { this.subscriptionPeriods.splice(i, 1); this.onSubscriptionProductChanged(); this.saveStateToSession(); }
  get isLookerSubscription() { return true; }
  get totalTermLabel() { return this.subscriptionPeriods.length + ' periods'; }
  closeSuccessPopup() { this.showSuccessPopup = false; }

  getPeriodErrors(periodIndex: number): { message: string; messageType: string; category?: string }[] {
    return this.periodErrors.get(periodIndex) || [];
  }

  private getPeriodIndexFromRelatedRecordId(relatedRecordId: string): number | null {
    if (!relatedRecordId) return null;

    // 1. Check against our ref_child_XXX mapping (built during buildLookerNodes)
    if (this.childRefToPeriodMap.has(relatedRecordId)) {
      return this.childRefToPeriodMap.get(relatedRecordId)!;
    }

    // 2. Check looker_parent_line_XX format
    const match = relatedRecordId.match(/looker_parent_line_(\d+)/);
    if (match && match[1]) {
      const periodNum = parseInt(match[1], 10);
      return periodNum > 0 ? periodNum - 1 : null;
    }

    // 3. Not mappable to a known period
    return null;
  }

  private groupErrorsByPeriod(allMessages: any[]): void {
    this.periodErrors.clear();

    // Separate messages: those with mappable relatedRecordIds vs unknown
    const unmappedByKey: Map<string, any[]> = new Map();
    const bundleLevelMessages: any[] = []; // Messages that apply to all periods

    allMessages.forEach((msg: any) => {
      const periodIndex = this.getPeriodIndexFromRelatedRecordId(msg.relatedRecordId);
      if (periodIndex !== null && periodIndex >= 0 && periodIndex < this.subscriptionPeriods.length) {
        // Directly mappable
        if (!this.periodErrors.has(periodIndex)) {
          this.periodErrors.set(periodIndex, []);
        }
        this.periodErrors.get(periodIndex)!.push({
          message: msg.message,
          messageType: msg.messageType,
          category: msg.category
        });
      } else if (msg.relatedRecordId && msg.relatedRecordId !== msg.primaryRecordId) {
        // Group by unknown relatedRecordId key for positional mapping
        if (!unmappedByKey.has(msg.relatedRecordId)) {
          unmappedByKey.set(msg.relatedRecordId, []);
        }
        unmappedByKey.get(msg.relatedRecordId)!.push(msg);
      } else {
        // Bundle-level messages (no relatedRecordId or relatedRecordId === primaryRecordId)
        // These apply to all periods
        bundleLevelMessages.push({
          message: msg.message,
          messageType: msg.messageType,
          category: msg.category
        });
      }
    });

    // Distribute unmapped groups by position (order of distinct keys = order of periods)
    if (unmappedByKey.size > 0) {
      const unmappedKeys = Array.from(unmappedByKey.keys());
      unmappedKeys.forEach((key, idx) => {
        const periodIndex = idx < this.subscriptionPeriods.length ? idx : this.subscriptionPeriods.length - 1;
        const msgs = unmappedByKey.get(key)!;
        if (!this.periodErrors.has(periodIndex)) {
          this.periodErrors.set(periodIndex, []);
        }
        msgs.forEach(m => {
          this.periodErrors.get(periodIndex)!.push({
            message: m.message,
            messageType: m.messageType,
            category: m.category
          });
        });
      });
    }

    // Distribute bundle-level messages (like "Validate:...") to all periods
    if (bundleLevelMessages.length > 0 && this.subscriptionPeriods.length > 0) {
      for (let i = 0; i < this.subscriptionPeriods.length; i++) {
        if (!this.periodErrors.has(i)) {
          this.periodErrors.set(i, []);
        }
        bundleLevelMessages.forEach(m => {
          this.periodErrors.get(i)!.push(m);
        });
      }
    }

    console.log('[Looker] periodErrors map:', Object.fromEntries(this.periodErrors));
  }

  private resolveProductNameForNode(nodeId: string): string | null {
    if (nodeId === this.productId || nodeId === 'Parent_Looker_Product') return this.productName;
    
    // Check childRefToProductNameMap first (new map with actual product names)
    if (this.childRefToProductNameMap.has(nodeId)) {
      return this.childRefToProductNameMap.get(nodeId) || null;
    }

    // Fallback: Check childRefToPeriodMap (for User items)
    if (this.childRefToPeriodMap.has(nodeId)) {
      const periodIndex = this.childRefToPeriodMap.get(nodeId);
      return `Year ${periodIndex! + 1}`;
    }

    // Check looker_parent_line_XX format (for Period Parent items)
    const match = nodeId.match(/looker_parent_line_(\d+)/);
    if (match && match[1]) {
      const pIdx = parseInt(match[1], 10);
      return `Year ${pIdx}`;
    }
    
    return null;
  }


  getActualProductNames(quoteId: string): string {
    const productNames = new Set<string>();

    // Get product names from subscription periods
    if (this.subscriptionPeriods && this.subscriptionPeriods.length > 0) {
      this.subscriptionPeriods.forEach((period: any) => {
        if (period.productName) {
          productNames.add(period.productName);
        }
      });
    }

    // Return comma-separated list of unique product names, or fall back to input productName
    return productNames.size > 0 ? Array.from(productNames).join(', ') : (this.productName || 'Looker');
  }

  /**
   * Dynamically calculates total number of items (Groups + QLIs) in this Looker configuration
   */
  getItemCount(): number {
    let count = 0;
    const isRamped = this.subscriptionPeriods.length > 1;

    this.subscriptionPeriods.forEach(period => {
      // 1. Group Node (if ramped)
      if (isRamped) count++;

      // 2. Main Bundle Line
      count++;

      // 3. Platform Child (if set)
      if (period.productId) count++;

      // 4. User Product Children
      if (period.userRows) {
        period.userRows.forEach(row => {
          if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
            count++;
          }
        });
      }

      // 5. Non-Prod Child (if set)
      const nonProdRow = period.userRows?.find(r => r.type === 'Non-prod');
      if (nonProdRow && (nonProdRow.quantity || 0) > 0 && period.nonProdProductId) {
        count++;
      }
    });

    return count;
  }
}
