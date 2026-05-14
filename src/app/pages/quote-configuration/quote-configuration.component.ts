import { Component, OnInit, HostListener, inject, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { QuoteDataService } from '../../services/quote-data.service';
import { TopNavComponent } from '../../components/top-nav/top-nav.component';
import { DetailsOfQuoteComponent } from '../../components/details-of-quote/details-of-quote.component';
import { CommitConfigurationComponent } from '../../components/commit-configuration/commit-configuration.component';
import { SubscriptionConfigurationComponent } from '../../components/subscription-configuration/subscription-configuration.component';
import { QuotePreviewComponent } from '../../components/quote-preview/quote-preview.component';
import { CartService } from '../../services/cart.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { LoadingService } from '../../services/loading.service';
import { ToastService } from '../../services/toast.service';
import { ContextService } from '../../services/context.service';
import { finalize, take, map, tap, switchMap } from 'rxjs/operators';
import { DiscountIncentiveStateService } from '../../services/discount-incentive-state.service';

@Component({
  selector: 'app-quote-configuration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TopNavComponent,
    DetailsOfQuoteComponent,
    CommitConfigurationComponent,
    SubscriptionConfigurationComponent,
    QuotePreviewComponent
  ],
  templateUrl: './quote-configuration.component.html',
  styles: [`
    .glass-card {
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  `]
})
export class QuoteConfigurationComponent implements OnInit {
  @ViewChild(DetailsOfQuoteComponent) detailsComp?: DetailsOfQuoteComponent;
  @ViewChildren(CommitConfigurationComponent) commitComps!: QueryList<CommitConfigurationComponent>;
  @ViewChildren(SubscriptionConfigurationComponent) subComps!: QueryList<SubscriptionConfigurationComponent>;
  @ViewChild(QuotePreviewComponent) previewComp?: QuotePreviewComponent;

  private quoteDataService = inject(QuoteDataService);
  private router = inject(Router);
  private sfApi = inject(SalesforceApiService);
  private loadingService = inject(LoadingService);
  private toastService = inject(ToastService);
  private contextService = inject(ContextService);
  private activatedRoute = inject(ActivatedRoute);
  private cartService = inject(CartService);
  private discountIncentiveStateService = inject(DiscountIncentiveStateService);

  isLoading = true;
  accountName = '';
  opportunityName = '';
  quoteName = '';
  quoteNumber = '';
  quoteId = '';
  opportunityId = '';
  tabMaxCounts: Map<string, number> = new Map();

  products: any[] = [];
  selectedItemId = sessionStorage.getItem('qc_selected_item') || 'quote_details';
  isEditingName = false;
  annualContractValue = 0;
  totalContractValue = 0;
  isPrimary = false;

  // Track validation errors per product for sidebar highlighting
  productValidationErrors: Map<string, any[]> = new Map();

  // Header validation panel state
  hasValidationErrors: boolean = false;
  validationPanelOpen: boolean = false;
  submittedErrorMessages: { productId: string; productName: string; message: string; messageType?: string; category?: string }[] = [];
  savedTabs: Set<string> = new Set<string>();
  lastSaveResults: Map<string, any> = new Map<string, any>();
  showFinalSuccessPopup: boolean = false;

  get groupedValidationMessages(): { productName: string; messages: { message: string; messageType: string }[] }[] {
    const grouped = new Map<string, { message: string; messageType: string }[]>();
    this.submittedErrorMessages.forEach(item => {
      const key = item.productName || item.productId || 'Product';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push({ message: item.message, messageType: item.messageType || 'info' });
    });
    return Array.from(grouped.entries()).map(([productName, messages]) => ({ productName, messages }));
  }

  togglePrimary(event: any) {
    const isChecked = event.target.checked;
    this.isPrimary = isChecked;

    const opportunityId = this.opportunityId;
    const quoteId = isChecked ? this.quoteId : null;

    if (!opportunityId || (isChecked && !quoteId)) {
      this.toastService.show('Opportunity ID or Quote ID missing.', 'error');
      this.isPrimary = !isChecked;
      return;
    }

    this.loadingService.show();
    this.sfApi.syncQuoteToOpportunity(opportunityId, quoteId).pipe(
      finalize(() => this.loadingService.hide())
    ).subscribe({
      next: (res) => {
        const action = isChecked ? 'synced to' : 'unsynced from';
        this.toastService.show(`Quote ${action} Opportunity successfully.`, 'success');
      },
      error: (err) => {
        console.error('Sync Error:', err);
        this.isPrimary = !isChecked;
      }
    });
  }

  totalCatalogProducts: number = 1000;

  get usedQuotaCount(): number {
    // 1. Initial count includes every main product added to the cart
    let count = this.products ? this.products.length : 0;

    // 2. Extra products selected in Commit (via Discounts/Incentives selections)
    if (this.commitComps) {
      this.commitComps.forEach(commit => {
        if (commit.discountsIncentives) {
          // Count current selections (in progress)
          count += (commit.discountsIncentives.persistentSelectedGroups?.size || 0);
          count += (commit.discountsIncentives.persistentSelectedIndividuals?.size || 0);
          count += (commit.discountsIncentives.persistentIncentiveGroups?.size || 0);

          // Count already applied discounts
          commit.discountsIncentives.discountPeriods.forEach((p: any) => {
            if (p.activeDiscounts) {
              p.activeDiscounts.forEach((d: any) => count += (d.itemCount || 0));
            }
          });

          // Count already applied incentives
          commit.discountsIncentives.incentivePeriods.forEach((p: any) => {
            if (p.activeIncentives) {
              p.activeIncentives.forEach((i: any) => count += (i.itemCount || 0));
            }
          });
        }
      });
    }

    // 3. Subscription selections (Platform product + User quantities)
    if (this.subComps) {
      this.subComps.forEach(sub => {
        if (sub.subscriptionPeriods && sub.subscriptionPeriods.length > 0) {
          const firstPeriod = sub.subscriptionPeriods[0];

          // 3a. Count the Platform selection from the picklist if it's set
          if (firstPeriod.productName) {
            // Check if this specific product ID is already in our main products list to avoid double counting
            const isMainProduct = this.products.some(p => p.id === firstPeriod.productId || p.name === firstPeriod.productName);
            if (!isMainProduct) {
              count++;
            }
          }

          // 3b. Count each active user category
          if (firstPeriod.userRows) {
            firstPeriod.userRows.forEach((row: any) => {
              if ((row.quantity || 0) > 0) {
                count++;
              }
            });
          }
        }
      });
    }

    return count;
  }

  get remainingProductsQuota(): number {
    return Math.max(0, this.totalCatalogProducts - this.usedQuotaCount);
  }

  activeTab = 'details';

  get isSaveDisabled(): boolean {
    const type = this.getProductType(this.selectedItemId);
    if (type === 'commitment') {
      const comp = this.commitComps?.find(c => c.productId === this.selectedItemId);
      return comp?.activeTab !== 'discounts';
    }
    if (type === 'subscription') {
      const comp = this.subComps?.find(c => c.productId === this.selectedItemId);
      return comp?.activeTab !== 'plans';
    }
    return false; // Quote details
  }

  get isSubmitDisabled(): boolean {
    if (!this.products || this.products.length === 0) return true;

    // 1. Must be on the last product
    const lastProduct = this.products[this.products.length - 1];
    if (this.selectedItemId !== lastProduct.id) return true;

    // 2. Must be on the final configuration tab
    const type = this.getProductType(this.selectedItemId);
    let onFinalTab = false;
    if (type === 'commitment') {
      const comp = this.commitComps?.find(c => c.productId === this.selectedItemId);
      onFinalTab = comp?.activeTab === 'discounts';
    } else if (type === 'subscription') {
      const comp = this.subComps?.find(c => c.productId === this.selectedItemId);
      onFinalTab = comp?.activeTab === 'plans';
    }

    if (!onFinalTab) return true;

    // 3. Must have been saved
    return !this.savedTabs.has(this.selectedItemId);
  }

  get isPreviewDisabled(): boolean {
    if (this.selectedItemId === 'quote_details') return true;
    return !this.savedTabs.has(this.selectedItemId);
  }

  previewState: any = {
    show: false,
    data: null,
    commitments: [],
    products: [],
    isLooker: false,
    tcv: 0,
    incentives: 0,
    terms: 0,
    startDate: '',
    expirationDate: ''
  };

  openPreview() {
    if (this.selectedItemId === 'quote_details') {
      this.toastService.show('Please select a product to preview.', 'warning');
      return;
    }

    if (!this.savedTabs.has(this.selectedItemId)) {
      this.toastService.show('Please save your changes before previewing.', 'warning');
      return;
    }

    const previewData = this.lastSaveResults.get(this.selectedItemId);
    console.log('Opening preview with cached data:', previewData);

    if (previewData) {
      const type = this.getProductType(this.selectedItemId);
      let pData: any = null;

      try {
        if (type === 'commitment') {
          const comp = this.commitComps?.find(c => c.productId === this.selectedItemId);
          if (comp) pData = comp.getPreviewData(previewData);
        } else if (type === 'subscription') {
          const comp = this.subComps?.find(c => c.productId === this.selectedItemId);
          if (comp) pData = comp.getPreviewData(previewData);
        }
      } catch (e) {
        console.error('Error building preview data:', e);
        this.toastService.show('Error preparing preview details.', 'error');
      }

      if (pData) {
        this.previewState = {
          show: true,
          data: previewData,
          previewCommitments: pData.previewCommitments,
          commitmentDetailsOnly: pData.commitmentDetailsOnly || pData.commitmentDetailsSummary || [],
          previewProductsWithoutDiscounts: pData.previewProductsWithoutDiscounts,
          isLooker: pData.isLookerSubscription,
          tcv: pData.totalContractValue,
          incentives: pData.totalIncentivesValue,
          terms: pData.totalTerms,
          startDate: pData.startDate,
          expirationDate: pData.expirationDate
        };
      } else {
        this.toastService.show('No preview data available for this selection.', 'warning');
      }
    } else {
      this.toastService.show('No saved configuration found for this product.', 'warning');
    }
  }

  closePreview() {
    this.previewState.show = false;
  }

  resetForm() {
    this.router.navigate(['/']);
  }

  onSkipAndSave() {
    this.toastService.show('Quote Details Saved Successfully', 'success');
    this.cartService.clearCart();
    this.quoteDataService.clearQuoteData();
    this.showFinalSuccessPopup = true;
  }

  closeFinalSuccessPopup() {
    this.showFinalSuccessPopup = false;
    this.router.navigate(['/']);
  }

  onSave() {
    this.saveCurrentTab();
  }

  private saveCurrentTab(onSuccess?: (previewData?: any) => void) {
    if (this.selectedItemId === 'quote_details') {
      this.detailsComp?.onSave(onSuccess);
    } else {
      const type = this.getProductType(this.selectedItemId);
      
      // Capture and persist the current footprint before the save clears it
      let currentCount = 0;
      if (type === 'commitment') {
        const comp = this.commitComps?.find(c => c.productId === this.selectedItemId);
        if (comp) currentCount = comp.getItemCount();
      } else if (type === 'subscription') {
        const comp = this.subComps?.find(s => s.productId === this.selectedItemId);
        if (comp) currentCount = comp.getItemCount();
      }
      
      if (currentCount > 0) {
        this.tabMaxCounts.set(this.selectedItemId, currentCount);
        this.saveCountsToSession();
      }

      if (type === 'commitment') {
        const comp = this.commitComps?.find(c => c.productId === this.selectedItemId);
        if (comp) {
          comp.onSave((res) => {
            if (res) {
              const transaction = res.transaction?.SalesTransaction?.[0];
              res.QuoteNumber = transaction?.QuoteNumber__c || this.quoteNumber.replace('Q-', '');
              res.Name = transaction?.SalesTransactionName || this.quoteName;
              
              // Update footer values from the response
              this.totalContractValue = transaction?.CommitmentAmount__c || 0;
              this.annualContractValue = transaction?.Annual_Commit_Value__c || 0;
            }
            this.savedTabs.add(this.selectedItemId);
            this.lastSaveResults.set(this.selectedItemId, res);
            if (onSuccess) onSuccess(res);
          });
        }
      } else if (type === 'subscription') {
        const comp = this.subComps?.find(c => c.productId === this.selectedItemId);
        if (comp) {
          comp.onSave((res) => {
            if (res) {
              const transaction = res.transaction?.SalesTransaction?.[0];
              res.QuoteNumber = transaction?.QuoteNumber__c || this.quoteNumber.replace('Q-', '');
              res.Name = transaction?.SalesTransactionName || this.quoteName;

              // Update footer values from the response
              this.totalContractValue = transaction?.CommitmentAmount__c || 0;
              this.annualContractValue = transaction?.Annual_Commit_Value__c || 0;
            }
            this.savedTabs.add(this.selectedItemId);
            this.lastSaveResults.set(this.selectedItemId, res);
            if (onSuccess) onSuccess(res);
          }, false);
        }
      }
    }
  }

  getStartingSortOrder(index: number): number {
    let currentSortOrder = 1;

    // Sum up the item counts of all products that come before the requested index
    for (let i = 0; i < index; i++) {
      const product = this.products[i];
      const type = this.getProductType(product.id);
      let count = 0;

      if (type === 'commitment') {
        // 1. Direct calculation for GCP footprint
        const comp = this.commitComps?.find(c => c.productId === product.id);
        if (comp) count = comp.getItemCount();
        
        // Fallback to direct calculation if component hidden or state cleared after save
        if (count <= 1) {
          let pCount = 1; // Parent
          const pending = this.discountIncentiveStateService.getPendingTransactions(this.quoteId);
          pending.forEach((tx: any) => {
            tx.graph?.records?.forEach((rec: any) => {
              if (rec.record?.attributes?.type === 'QuoteLineItem') pCount++;
            });
          });
          count = pCount;
        }
      } else if (type === 'subscription') {
        // 2. Looker calculation
        const comp = this.subComps?.find(s => s.productId === product.id);
        if (comp) count = comp.getItemCount();
        if (count === 0) count = this.getLookerCountFromSession(product.id);
      }

      // Use the persisted max count to ensure continuity after saves
      const persistedCount = this.tabMaxCounts.get(product.id) || 0;
      const finalCount = Math.max(count, persistedCount);
      
      // Update max count if we found a higher live count
      if (count > persistedCount) {
        this.tabMaxCounts.set(product.id, count);
        this.saveCountsToSession();
      }

      currentSortOrder += (finalCount || (type === 'commitment' ? 1 : 5));
    }

    return currentSortOrder;
  }

  private saveCountsToSession() {
    if (!this.quoteId) return;
    try {
      const data = Object.fromEntries(this.tabMaxCounts);
      sessionStorage.setItem(`qc_counts_${this.quoteId}`, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save tab counts to session', e);
    }
  }

  private loadCountsFromSession() {
    if (!this.quoteId) return;
    try {
      const raw = sessionStorage.getItem(`qc_counts_${this.quoteId}`);
      if (raw) {
        const data = JSON.parse(raw);
        Object.keys(data).forEach(key => {
          this.tabMaxCounts.set(key, data[key]);
        });
      }
    } catch (e) {
      console.warn('Failed to load tab counts from session', e);
    }
  }

  private getLookerCountFromSession(productId: string): number {
    try {
      const sessionKey = 'subscription_config_' + (this.quoteId || 'draft') + '_' + (productId || '');
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return 5; // Default fallback estimate

      const state = JSON.parse(raw);
      if (!state.subscriptionPeriods) return 5;

      let count = 0;
      const isRamped = state.subscriptionPeriods.length > 1;

      state.subscriptionPeriods.forEach((period: any) => {
        if (isRamped) count++; // Group
        count++; // Bundle Parent
        if (period.productId) count++; // Platform
        if (period.userRows) {
          period.userRows.forEach((row: any) => {
            if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
              count++;
            }
          });
        }
        // Non-prod check (simplified fallback)
        const nonProdRow = period.userRows?.find((r: any) => r.type === 'Non-prod');
        if (nonProdRow && (nonProdRow.quantity || 0) > 0) count++;
      });
      return count || 5;
    } catch (e) {
      return 5;
    }
  }

  ngOnInit() {
    const mode = this.activatedRoute.snapshot.data['mode'] || 'configure';
    
    // Extract quoteId from URL params if available (for session keys)
    this.activatedRoute.queryParams.subscribe(params => {
      if (params['quoteId']) {
        this.quoteId = params['quoteId'];
        this.loadCountsFromSession();
      }
    });

    mode === 'edit' ? this.modifyQuote() : this.configureQuote();
  }

  private configureQuote() {
    this.isLoading = true;
    this.quoteId = this.contextService.currentContext?.quoteId || '';

    this.quoteDataService.quoteData$
      .pipe(
        finalize(() => (this.isLoading = false))
      )
      .subscribe({
        next: (data) => this.applyQuoteData(data),
        error: (err) => this.handleError('Error configuring quote', err)
      });
  }

  private modifyQuote() {
    this.quoteId =
      this.contextService.currentContext?.quoteId ??
      this.quoteDataService.getQuoteData()?.quoteId ?? '';

    if (!this.quoteId) {
      this.handleError('Quote ID not found');
      return;
    }

    this.isLoading = true;
    this.loadingService.show();

    console.log('[QuoteConfiguration] modifyQuote starting with quoteId:', this.quoteId);

    this.sfApi.loadConfiguratorInstance(this.quoteId).pipe(
      take(1),
      switchMap((loadRes: any) => {
        const contextId = loadRes.contextId;
        console.log('[QuoteConfiguration] loadRes:', loadRes);
        if (!contextId) throw new Error('No contextId received from load-instance');
        
        // Capture quote number from loadRes if present
        const loadNumber = loadRes.QuoteNumber__c || (loadRes.transaction?.SalesTransaction?.[0]?.QuoteNumber__c);
        
        return this.sfApi.getConfiguratorInstance(contextId).pipe(
          map(instanceRes => ({ instanceRes, loadNumber }))
        );
      }),
      map(({ instanceRes, loadNumber }) => {
        const records = instanceRes.instance?.records || [];
        const transactionRecord = instanceRes.transaction?.SalesTransaction?.[0];
        const quoteRecord = records.find((r: any) => r.attributes?.type === 'Quote') || transactionRecord;

        // Robust deep search for the quote number and name
        const findValueByKey = (obj: any, targetKey: string): any => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj[targetKey] !== undefined && obj[targetKey] !== null) return obj[targetKey];
          const keys = Object.keys(obj);
          for (const key of keys) {
            if (typeof obj[key] === 'object') {
              const res = findValueByKey(obj[key], targetKey);
              if (res) return res;
            }
          }
          return null;
        };

        const quotenumber = loadNumber || 
                           findValueByKey(instanceRes, 'QuoteNumber__c') || 
                           findValueByKey(instanceRes, 'QuoteNumber') || 
                           'Q-';
        
        const name = findValueByKey(instanceRes, 'SalesTransactionName') || 
                     findValueByKey(instanceRes, 'Name') || 
                     'Quote';

        const commitmentAmount = findValueByKey(instanceRes, 'CommitmentAmount__c') || 0;
        const annualCommitValue = findValueByKey(instanceRes, 'Annual_Commit_Value__c') || 0;

        return {
          quoteId: quoteRecord?.id || quoteRecord?.Id,
          quoteName: name,
          quoteNumber: quotenumber,
          totalContractValue: commitmentAmount,
          annualContractValue: annualCommitValue,
          products: records.filter((r: any) => r.attributes?.type === 'QuoteLineItem').map((r: any) => ({
            id: r.Product2Id,
            name: r.Name || r.Product2?.Name,
            quoteLineId: r.Id,
            categoryId: r.categoryId ?? ''
          }))
        };
      }),
      tap((mappedData) => {
        const existing = this.quoteDataService.getQuoteData();

        // Merge products to avoid losing locally added items that aren't yet in Salesforce records
        const existingProducts = existing.products || [];
        const newProducts = mappedData.products || [];

        const productMap = new Map();
        existingProducts.forEach((p: any) => productMap.set(p.id, p));
        newProducts.forEach((p: any) => productMap.set(p.id, p));

        const mergedProducts = Array.from(productMap.values());

        this.quoteDataService.setQuoteData({
          ...existing,
          ...mappedData,
          products: mergedProducts
        });
      }),
      finalize(() => {
        this.loadingService.hide();
        this.isLoading = false;
      })
    )
      .subscribe({
        next: (mappedData) => this.applyQuoteData(mappedData),
        error: (err) => this.handleError('Failed to load quote products', err)
      });
  }

  applyQuoteData(data: any) {
    console.log('[QuoteConfiguration] applyQuoteData received:', data);
    if (!data) return;

    // Use nullish coalescing to preserve existing values if the new data doesn't have them
    this.accountName = data.accountName || this.accountName || 'Acme Corp';
    this.opportunityName = data.opportunityName || this.opportunityName || 'Expansion Deal';
    this.opportunityId = data.opportunityId || this.opportunityId || '';

    // Explicitly check for quoteName in data, then fall back to current value, then to 'Q-'
    if (data.quoteName) {
      this.quoteName = data.quoteName;
    }

    if (data.quoteNumber) {
      this.quoteNumber = data.quoteNumber;
    }

    if (data.totalContractValue !== undefined) {
      this.totalContractValue = data.totalContractValue;
    }
    
    if (data.annualContractValue !== undefined) {
      this.annualContractValue = data.annualContractValue;
    }

    if (data.quoteId) {
      this.quoteId = data.quoteId;
      this.loadCountsFromSession();
    }

    if (data.products && data.products.length > 0) {
      this.products = data.products.map((p: any) => {
        const isLooker = p.name ? p.name.toLowerCase().includes('looker') : false;
        return {
          id: p.id,
          name: p.name,
          icon: isLooker ? 'bar_chart' : 'cloud',
          type: isLooker ? 'subscription' : 'commitment',
          quoteLineId: p.quoteLineId,
          categoryId: p.categoryId
        };
      });
    } else if (data.productId || data.productName) {
      const isLooker = data.productName?.toLowerCase().includes('looker');
      this.products = [{
        id: data.productId || 'p1',
        name: data.productName || 'Product',
        icon: isLooker ? 'bar_chart' : 'cloud',
        type: isLooker ? 'subscription' : 'commitment',
        categoryId: data.categoryId || ''
      }];
    }
  }

  private handleError(message: string, error?: any) {
    if (error) console.error(message, error);
    this.toastService.show(message, 'error');
    this.loadingService.hide();
    this.isLoading = false;
  }

  getProductType(id: string) {
    const p = this.products.find(p => p.id === id);
    return p ? p.type : 'none';
  }

  getSelectedProduct() {
    return this.products.find(p => p.id === this.selectedItemId);
  }

  selectItem(id: string) {
    this.selectedItemId = id;
    sessionStorage.setItem('qc_selected_item', id);
    if (id === 'quote_details') {
      this.activeTab = 'details';
    } else {
      this.activeTab = 'configuration';
    }
  }

  onAddProduct() {
    this.cartService.clearCart();
    this.router.navigate(['/products']);
  }

  formatCurrency(val: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  }

  getSalesforceLink(): string {
    const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
    return `${baseUrl}/lightning/r/Quote/${this.quoteId}/view`;
  }

  // --- Validation Error Handling ---

  toggleValidationPanel(event?: Event) {
    if (event) event.stopPropagation();
    this.validationPanelOpen = !this.validationPanelOpen;
  }

  @HostListener('document:click')
  onDocumentClick() {
    // Close validation panel when clicking anywhere outside
    if (this.validationPanelOpen) {
      this.validationPanelOpen = false;
    }
  }

  onValidationMessagesReceived(event: { productId: string; productName: string; messages: any[] }) {
    if (event.messages && event.messages.length > 0) {
      this.productValidationErrors.set(event.productId, event.messages);

      // Build flat list of error messages for the header panel
      // First remove old errors for this product, then add new ones
      this.submittedErrorMessages = this.submittedErrorMessages.filter(m => m.productId !== event.productId);
      event.messages.forEach(msg => {
        this.submittedErrorMessages.push({
          productId: event.productId,
          productName: msg.productName || event.productName,
          message: msg.message,
          messageType: msg.messageType || 'info',
          category: msg.category
        });
      });

      this.hasValidationErrors = true;
      this.validationPanelOpen = true;
    } else {
      // Clear errors for this product
      this.productValidationErrors.delete(event.productId);
      this.submittedErrorMessages = this.submittedErrorMessages.filter(m => m.productId !== event.productId);

      // Check if any products still have errors
      this.hasValidationErrors = this.submittedErrorMessages.length > 0;
      if (!this.hasValidationErrors) {
        this.validationPanelOpen = false;
      }
    }
  }

  hasProductErrors(productId: string): boolean {
    const messages = this.productValidationErrors.get(productId);
    return !!messages && messages.some(e => e.messageType === 'error');
  }

  getProductErrors(productId: string): any[] {
    return this.productValidationErrors.get(productId) || [];
  }
}
