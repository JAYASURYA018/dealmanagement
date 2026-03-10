import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RcaApiService } from '../../services/rca-api.service';
import { QuoteRefreshService } from '../../services/quote-refresh.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { ContextService } from '../../services/context.service';
import { ToastService } from '../../services/toast.service';
import { LoadingService } from '../../services/loading.service';
import { finalize, forkJoin, map, catchError, of, switchMap, lastValueFrom, Subject, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { UploadProductsModalComponent } from '../upload-products-modal/upload-products-modal.component';

@Component({
    selector: 'app-discounts-incentives',
    standalone: true,
    imports: [CommonModule, FormsModule, UploadProductsModalComponent],
    templateUrl: './discounts-incentives.component.html',
})
export class DiscountsIncentivesComponent implements OnChanges {
    @Input() productId: string | null = null;
    @Input() parentQuoteLineId: string | null = null; // Parent Bundle Line ID
    @Input() categoryId: string | null = null;
    @Input() quoteStartDate: string | null = null;
    @Input() quoteEndDate: string | null = null;
    isLoading = false;

    // Tabs for the Right Panel
    activeTab: 'discounts' | 'incentives' = 'discounts';

    // Form Models
    discountForm = {
        granularity: 'Select',
        type: 'Flat rate (%)',
        priceReference: 'Select',
        value: '',
        selectedItemsCount: 0
    };

    incentiveForm = {
        type: 'Select',
        amount: '',
        currency: 'USD',
        selectedItemsCount: 0
    };

    // Dropdown Options
    granularityOptions = ['Select', 'Overall', 'Granular'];
    typeOptions = ['Flat rate (%)']; // Fixed as per requirement
    priceReferenceOptions = ['Select', 'Float', 'Fixed'];
    timePeriodOptions = ['Date range', 'Custom'];

    // UI State for custom dropdowns
    granularityOpen = false;
    typeOpen = false;
    priceRefOpen = false;
    incentiveTypeOpen = false;

    // Action menus state
    openActionMenuId: string | null = null;

    // Period Configuration
    discountPeriods = [{
        id: '1',
        name: 'Discount period 1',
        timePeriod: 'Date range',
        startDate: '',
        endDate: '',
        activeDiscounts: [] as any[]
    }];
    activeDiscountPeriodId = '1';

    incentivePeriods = [{
        id: '1',
        name: 'Incentives period 1',
        timePeriod: 'Date range',
        startDate: '',
        endDate: '',
        activeIncentives: [] as any[]
    }];
    activeIncentivePeriodId = '1';

    get activeDiscountPeriod() {
        return this.discountPeriods.find(p => p.id === this.activeDiscountPeriodId) || this.discountPeriods[0];
    }

    get activeIncentivePeriod() {
        return this.incentivePeriods.find(p => p.id === this.activeIncentivePeriodId) || this.incentivePeriods[0];
    }

    addDiscountPeriod() {
        if (this.discountPeriods.length >= 2) return;

        // Ensure the first period has at least one discount
        if (this.discountPeriods[0].activeDiscounts.length === 0) {
            this.toastService.show('Please add at least one discount to the first period before adding another.', 'warning');
            return;
        }

        const id = Date.now().toString();
        this.discountPeriods.push({
            id: id,
            name: `Discount period ${this.discountPeriods.length + 1}`,
            timePeriod: 'Date range',
            startDate: '',
            endDate: '',
            activeDiscounts: []
        });
        this.activeDiscountPeriodId = id;
    }

    removeDiscountPeriod(id: string) {
        if (this.discountPeriods.length > 1) {
            this.discountPeriods = this.discountPeriods.filter(p => p.id !== id);
            if (this.activeDiscountPeriodId === id) {
                this.activeDiscountPeriodId = this.discountPeriods[0].id;
            }
            this.discountPeriods.forEach((p, index) => p.name = `Discount period ${index + 1}`);
        }
    }

    addIncentivePeriod() {
        const id = Date.now().toString();
        this.incentivePeriods.push({
            id: id,
            name: `Incentives period ${this.incentivePeriods.length + 1}`,
            timePeriod: 'Date range',
            startDate: '',
            endDate: '',
            activeIncentives: []
        });
        this.activeIncentivePeriodId = id;
    }

    removeIncentivePeriod(id: string) {
        if (this.incentivePeriods.length > 1) {
            this.incentivePeriods = this.incentivePeriods.filter(p => p.id !== id);
            if (this.activeIncentivePeriodId === id) {
                this.activeIncentivePeriodId = this.incentivePeriods[0].id;
            }
            this.incentivePeriods.forEach((p, index) => p.name = `Incentives period ${index + 1}`);
        }
    }

    // Product Quota Tracking
    // Fixed business limit: max 999 products can receive discounts/incentives per quote
    totalCatalogProducts: number = 999;
    // Running total of product line items committed in all applied discounts/incentives
    usedQuotaCount: number = 0;

    get remainingProductsQuota(): number {
        return Math.max(0, this.totalCatalogProducts - this.usedQuotaCount);
    }

    // Live remaining = quota minus already-committed minus currently-selected-in-modal
    get liveQuotaRemaining(): number {
        const currentSelection = this.selectorCalledFrom === 'incentives'
            ? this.persistentIncentiveGroups.size
            : this.persistentSelectedGroups.size + this.persistentSelectedIndividuals.size;
        return Math.max(0, this.totalCatalogProducts - this.usedQuotaCount - currentSelection);
    }

    // Dropdown Options
    incentiveTypeOptions = ['Select', 'Incentive type 1', 'Incentive type 2'];



    // Product Selector Logic
    showProductSelector = false;
    showUploadModal = false;
    productTab: 'groups' | 'individual' = 'groups';
    filterQuery: string = '';
    viewMode: 'all' | 'selected' = 'all';
    // Which right-panel tab triggered the selector ('discounts' | 'incentives')
    selectorCalledFrom: 'discounts' | 'incentives' = 'discounts';

    // Persistent Selection State for Incentives (separate from discounts)
    persistentIncentiveGroups = new Map<string, any>();

    // Sorting
    sortConfig = {
        column: 'name',
        direction: 'asc' as 'asc' | 'desc'
    };

    // Data
    displayMode: 'grid' | 'list' = 'list';
    productGroups: any[] = [];
    individualProducts: any[] = [];

    // Persistent Selection State
    persistentSelectedGroups = new Map<string, any>();
    persistentSelectedIndividuals = new Map<string, any>();
    // Flag to avoid refetching data on navigation back
    private dataFetched = false;
    // Dropdown Data
    dropdownOptions: any[] = [];
    filteredDropdownOptions: any[] = [];
    selectedDropdownOption: any = null;
    dropdownSearchText: string = '';
    isDropdownOpen: boolean = false;

    // Individual Pagination State
    individualPageSize: number = 100;
    individualPageOptions: number[] = [10, 20, 50, 100];
    individualCurrentOffset: number = 0;
    individualTotalLoaded: number = 0;
    isIndividualLoading: boolean = false;
    private currentProductReq: any;

    productSearchTerm: string = '';
    rootClassificationId: string = '11BDz00000000NvMAI'; // ID for fetching sibling bundles (e.g., NvMAI)

    // Picklist Filter State (Region + Billing Frequency dropdowns)
    picklistLoaded = false;
    isPicklistLoading = false;
    regionOptions: { label: string; value: string }[] = [];
    billingFreqOptions: { label: string; value: string }[] = [];

    selectedRegion: { label: string; value: string } | null = null;
    selectedBillingFreq: { label: string; value: string } | null = null;

    regionDropdownOpen = false;
    billingDropdownOpen = false;
    regionSearchText = '';
    billingSearchText = '';

    get filteredRegionOptions() {
        if (!this.regionOptions) return [];
        const q = (this.regionSearchText || '').toLowerCase();
        return this.regionOptions.filter(o => (o.label || '').toLowerCase().includes(q));
    }

    get filteredBillingOptions() {
        if (!this.billingFreqOptions) return [];
        const q = (this.billingSearchText || '').toLowerCase();
        return this.billingFreqOptions.filter(o => (o.label || '').toLowerCase().includes(q));
    }

    // Kept for backward compat with evaluateSearchAndBuildCriteria references
    get facetedFilterData() {
        return {
            regions: this.regionOptions.map(o => ({ ...o, selected: this.selectedRegion?.value === o.value })),
            billingFrequencies: this.billingFreqOptions.map(o => ({ ...o, selected: this.selectedBillingFreq?.value === o.value }))
        };
    }

    constructor(
        private rcaApiService: RcaApiService,
        private salesforceApiService: SalesforceApiService,
        private contextService: ContextService,
        private toastService: ToastService,
        private loadingService: LoadingService,
        private quoteRefreshService: QuoteRefreshService
    ) { }

    ngOnInit() {
        // Deprecated: API calls are now deferred until modal opens
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['productId'] && changes['productId'].currentValue && changes['productId'].currentValue !== changes['productId'].previousValue) {
            this.dataFetched = false; // Reset if product ID actually changes
            this.resetAllState();
        }
    }

    resetAllState() {
        this.discountPeriods = [{
            id: '1', name: 'Discount period 1', timePeriod: 'Date range', startDate: '', endDate: '', activeDiscounts: []
        }];
        this.activeDiscountPeriodId = '1';
        this.incentivePeriods = [{
            id: '1', name: 'Incentives period 1', timePeriod: 'Date range', startDate: '', endDate: '', activeIncentives: []
        }];
        this.activeIncentivePeriodId = '1';
    }

    fetchDropdownOptions() {
        if (!this.productId) return;
        if (this.dataFetched) return; // Prevent duplicate calls

        this.rcaApiService.getDropdownOptions(this.productId).subscribe({
            next: (res: any) => {
                const records = res.records || [];
                // Filter only those with It_has_Bundle_Products__c = false (Individual Products)
                this.dropdownOptions = records.filter((r: any) => r.It_has_Bundle_Products__c === false);
                this.filteredDropdownOptions = [...this.dropdownOptions];

                // Select the first option by default if available
                if (this.filteredDropdownOptions.length > 0) {
                    this.selectDropdownOption(this.filteredDropdownOptions[0]);
                }
                this.dataFetched = true; // Mark as fetched
            },
            error: (err) => {
                console.error('Error fetching dropdown options', err);
                this.toastService.show('Error fetching product classifications', 'error');
            }
        });
    }

    toggleDropdown() {
        this.isDropdownOpen = !this.isDropdownOpen;
    }

    selectDropdownOption(option: any) {
        this.selectedDropdownOption = option;
        this.isDropdownOpen = false;
        this.individualCurrentOffset = 0; // Reset pagination
        this.loadIndividualProducts();
    }

    filterDropdownOptions() {
        if (!this.dropdownSearchText) {
            this.filteredDropdownOptions = [...this.dropdownOptions];
        } else {
            const searchLower = this.dropdownSearchText.toLowerCase();
            this.filteredDropdownOptions = this.dropdownOptions.filter(opt =>
                opt.Name.toLowerCase().includes(searchLower)
            );
        }
    }

    setActiveTab(tab: 'discounts' | 'incentives') {
        this.activeTab = tab;
        if (tab === 'incentives') {
            const quoteId = this.contextService.currentContext?.quoteId;
            if (quoteId) {
                // Fetch bundle quote line items when switching to incentives tab as requested
                this.salesforceApiService.getBundleQuoteLineItems(quoteId).subscribe({
                    next: (res) => console.log('✅ [Incentive Tab] Bundle Line Items fetched:', res),
                    error: (err) => console.error('❌ [Incentive Tab] Failed to fetch bundle line items:', err)
                });
            }
        }
    }

    // Dropdown Handlers
    selectGranularity(option: string) {
        this.discountForm.granularity = option;
        this.granularityOpen = false;
    }

    selectType(option: string) {
        this.discountForm.type = option;
        this.typeOpen = false;
    }

    selectPriceRef(option: string) {
        this.discountForm.priceReference = option;
        this.priceRefOpen = false;
    }

    selectIncentiveType(option: string) {
        this.incentiveForm.type = option;
        this.incentiveTypeOpen = false;
    }

    minDate: string = new Date().toISOString().split('T')[0];

    validateDiscountDates(period: any) {
        if (!period.startDate || !period.endDate) return;

        if (period.endDate < period.startDate) {
            this.toastService.show('Discount End Date cannot be earlier than Start Date.', 'warning');
            period.endDate = '';
        }

        if (this.quoteStartDate && period.startDate < this.quoteStartDate) {
            this.toastService.show(`Start Date cannot be earlier than quote start date (${this.quoteStartDate}).`, 'warning');
            period.startDate = this.quoteStartDate;
        }

        if (this.quoteEndDate && period.endDate > this.quoteEndDate) {
            this.toastService.show(`End Date cannot be later than quote end date (${this.quoteEndDate}).`, 'warning');
            period.endDate = this.quoteEndDate;
        }
    }

    validateIncentiveDates(period: any) {
        if (!period.startDate || !period.endDate) return;

        if (period.endDate < period.startDate) {
            this.toastService.show('Incentive End Date cannot be earlier than Start Date.', 'warning');
            period.endDate = '';
        }

        if (this.quoteStartDate && period.startDate < this.quoteStartDate) {
            this.toastService.show(`Start Date cannot be earlier than quote start date (${this.quoteStartDate}).`, 'warning');
            period.startDate = this.quoteStartDate;
        }

        if (this.quoteEndDate && period.endDate > this.quoteEndDate) {
            this.toastService.show(`End Date cannot be later than quote end date (${this.quoteEndDate}).`, 'warning');
            period.endDate = this.quoteEndDate;
        }
    }
    // Selector Actions
    openProductSelector(source: 'discounts' | 'incentives' = 'discounts') {
        this.selectorCalledFrom = source;

        // For discounts, validate granularity/type first
        if (source === 'discounts') {
            if (this.discountForm.granularity === 'Select' || this.discountForm.type === 'Select') {
                this.toastService.show('Please select a Discount Type.', 'warning');
                return;
            }
        }

        this.showProductSelector = true;
        // Always start on Product Groups tab
        this.productTab = 'groups';
        // Load picklist filter options (Region, Billing Freq) if not yet loaded
        this.loadPicklistOptions();
        if (this.productId) {
            // Always re-fetch if productGroups is empty OR coming from incentives and not yet loaded
            if (!this.dataFetched || this.productGroups.length === 0) {
                this.dataFetched = false;
                this.fetchProductDetails();
                this.fetchDropdownOptions();
            }
        } else {
            this.productGroups = [];
            this.individualProducts = [];
        }
    }

    // Upload Modal Actions
    openUploadModal() {
        console.log("Clicked upload products")
        this.showUploadModal = true;
    }

    closeUploadModal() {
        this.showUploadModal = false;
    }

    debugData: any = null;

    fetchProductDetails() {
        if (!this.productId) return;

        this.isLoading = true;
        this.debugData = null; // Clear previous

        // 1. We now receive categoryId via @Input from Product Discovery Page.
        // We use default rootClassificationId fallback directly.

        // 2. Get Classifications for the current Bundle ID
        this.rcaApiService.getProductClassifications(this.productId).pipe(
            finalize(() => this.isLoading = false)
        ).subscribe({
            next: (res: any) => {
                const records = res.records || [];
                this.debugData = res;
                this.mapNewProductData(records);
            },
            error: (err) => {
                console.error('Error in product fetch flow', err);
                this.toastService.show('Failed to load products', 'error');
                this.debugData = { error: err.message || err };
            }
        });
    }

    loadIndividualProducts() {
        if (!this.selectedDropdownOption) {
            return;
        }

        const currentClassId = this.selectedDropdownOption.Id;
        const currentClassName = this.selectedDropdownOption.Name;

        if (this.currentProductReq) {
            this.currentProductReq.unsubscribe();
        }

        this.isIndividualLoading = true;

        this.currentProductReq = this.rcaApiService.getProductsByClassification(
            currentClassId,
            this.individualPageSize,
            this.individualCurrentOffset
        ).pipe(
            finalize(() => this.isIndividualLoading = false)
        ).subscribe({
            next: (data) => {
                const newProducts = data.products || [];

                // Map to UI model
                const mappedProducts = newProducts.map((p: any) => {
                    // Use productId from selling model options if available, fallback to p.id (which might be the classification-product link ID)
                    const resolvedId = p.productSellingModelOptions?.[0]?.productId || p.id;

                    return {
                        id: resolvedId,
                        name: p.name,
                        family: currentClassName, // Use classification name as family
                        selected: false,
                        discount: 0,
                        quantity: 1,
                        price: p.unitPrice || 0,
                        pricebookEntryId: p.pricebookEntryId || '',
                        isBundleChild: false
                    };
                });

                // Restore persistent selection state
                mappedProducts.forEach((p: any) => {
                    if (this.persistentSelectedIndividuals.has(p.id)) {
                        p.selected = true;
                        // Sync back any local changes if needed (e.g. quantity/discount if they were edited)
                        const saved = this.persistentSelectedIndividuals.get(p.id);
                        p.discount = saved.discount;
                        p.quantity = saved.quantity;
                        // Update map with fresh reference from current load
                        this.persistentSelectedIndividuals.set(p.id, p);
                    }
                });

                this.individualProducts = mappedProducts; // Replace current view with page results

                // If fewer products returned than page size, we might be at end of this classification.
                // But for now, user just wants simple next/prev.
                // Logic for "Cross-Classification" Next:
                // If user clicks Next and we get 0 results, OR we decided we are at end, we move index.
                // For this implementation, I will handle "Next" logic in the Next button handler.
            },
            error: (err) => {
                console.error('Error loading individual products', err);
                this.toastService.show('Error loading products', 'error');
            }
        });
    }

    handlePageSizeChange(newSize: number) {
        this.individualPageSize = Number(newSize);
        this.individualCurrentOffset = 0;
        // this.currentIndividualClassIndex = 0; // Reset to start? Or keep current class?
        // User implied "continuous" flow. Let's restart to be safe and simple.
        if (this.productSearchTerm) {
            this.executeSearch();
        } else {
            this.loadIndividualProducts();
        }
    }

    nextPage() {
        // Increment offset
        this.individualCurrentOffset += Number(this.individualPageSize);
        if (this.productSearchTerm) {
            this.executeSearch();
        } else {
            this.loadIndividualProducts();
        }
    }

    prevPage() {
        const pageSize = Number(this.individualPageSize);
        if (this.individualCurrentOffset >= pageSize) {
            this.individualCurrentOffset -= pageSize;
            if (this.productSearchTerm) {
                this.executeSearch();
            } else {
                this.loadIndividualProducts();
            }
        }
    }

    onProductSearch() {
        console.log('[onProductSearch] Triggered with term:', this.productSearchTerm);

        const criteria = this.getFacetedCriteria();

        // If search term is empty AND no faceted filters, reload default category products
        if (!this.productSearchTerm && criteria.length === 0) {
            console.log('[onProductSearch] No search term or filters, reloading default products');
            this.loadIndividualProducts();
            return;
        }

        this.individualCurrentOffset = 0; // Reset offset on new search

        if (!this.selectedDropdownOption || !this.selectedDropdownOption.Id) {
            console.warn('[onProductSearch] No category/dropdown option selected for search.');
            this.toastService.show('Please select a product category first.', 'warning');
            return;
        }

        this.executeSearch();
    }

    // Builds criteria payload from the selected Region and Billing Frequency dropdowns.
    private getFacetedCriteria(): any[] {
        const criteria: any[] = [];

        if (this.selectedRegion) {
            criteria.push({
                "property": "RCA_Region__c",
                "operator": "eq",
                "value": this.selectedRegion.value
            });
        }

        if (this.selectedBillingFreq) {
            criteria.push({
                "property": "RCA_Billing_Frequency__c",
                "operator": "eq",
                "value": this.selectedBillingFreq.value
            });
        }

        return criteria;
    }

    executeSearch() {
        if (this.currentProductReq) {
            this.currentProductReq.unsubscribe();
        }

        const criteria = this.getFacetedCriteria();

        // If search is cleared AND no criteria, reload default products
        if (!this.productSearchTerm && criteria.length === 0) {
            this.loadIndividualProducts();
            return;
        }

        this.isIndividualLoading = true;
        let searchRequest$: Observable<any>;

        if (criteria.length > 0) {
            // If we have picklist criteria, always use faceted search
            searchRequest$ = this.rcaApiService.facetedProductSearch(
                this.selectedDropdownOption?.Id || this.rootClassificationId,
                criteria,
                this.individualPageSize,
                this.individualCurrentOffset
            );
        } else {
            // Global text-based search
            searchRequest$ = this.rcaApiService.searchProducts(
                this.productSearchTerm,
                [this.selectedDropdownOption?.Id || this.rootClassificationId],
                this.individualPageSize,
                this.individualCurrentOffset
            );
        }

        this.currentProductReq = searchRequest$.pipe(
            finalize(() => this.isIndividualLoading = false)
        ).subscribe({
            next: (data) => {
                const newProducts = data.products || [];
                // Map to UI model
                this.individualProducts = newProducts.map((p: any) => {
                    const resolvedId = p.productSellingModelOptions?.[0]?.productId || p.id;

                    return {
                        id: resolvedId,
                        name: p.name,
                        family: p.additionalFields?.Family || 'Search Result',
                        selected: false,
                        discount: 0,
                        quantity: 1,
                        price: p.unitPrice || 0,
                        pricebookEntryId: p.pricebookEntryId || '',
                        isBundleChild: false
                    };
                });

                // Restore persistent selection state
                this.individualProducts.forEach((p: any) => {
                    if (this.persistentSelectedIndividuals.has(p.id)) {
                        p.selected = true;
                        // Update map with fresh reference from search results
                        this.persistentSelectedIndividuals.set(p.id, p);
                    }
                });
            },
            error: (err) => {
                console.error('Search error', err);
                this.toastService.show('Search failed', 'error');
            }
        });
    }

    onSearchTermChange(term: string) {
        if (!term || term.trim() === '') {
            this.productSearchTerm = '';
            this.onProductSearch();
        }
    }

    mapNewProductData(classifications: any[]) {
        this.productGroups = classifications.map(cls => ({
            id: cls.Id,
            name: cls.Name,
            No_Of_Child_Products__c: cls.No_Of_Child_Products__c || 0,
            selected: false,
            discount: 0,
            price: 0,
            pricebookEntryId: '',
            isBundleChild: false,
            components: []
        }));


        // Restore persistent selection state
        this.productGroups.forEach(g => {
            if (this.persistentSelectedGroups.has(g.id)) {
                g.selected = true;
                // Update map with fresh reference
                this.persistentSelectedGroups.set(g.id, g);
            }
        });
    }



    mapProductData(data: any) {
        // Extract the actual product object. API returns { products: [...] } for bundle queries.
        const product = (data.products && data.products.length > 0) ? data.products[0] : data;

        // Map Groups
        if (product.productComponentGroups && product.productComponentGroups.length > 0) {

            this.productGroups = product.productComponentGroups.map((group: any) => ({
                id: group.id,
                name: group.name || 'Group',
                count: group.components?.length || 0,
                selected: false,
                discount: 0,
                components: group.components
            }));

            // Flatten all components for the Individual List
            const allComponents: any[] = [];
            product.productComponentGroups.forEach((group: any) => {
                if (group.components) {
                    group.components.forEach((comp: any) => {
                        // Only add actual components, ignore selling model options if they appear here (unlikely but safe)
                        const resolvedId = comp.productSellingModelOptions?.[0]?.productId || comp.id;

                        allComponents.push({
                            id: resolvedId,
                            name: comp.name,
                            family: group.name, // Use group name as family
                            selected: false,
                            discount: 0,
                            quantity: 1,
                            price: comp.unitPrice || 0,
                            pricebookEntryId: comp.pricebookEntryId || '',
                            isBundleChild: true // Components in groups are usually children
                        });
                    });
                }
            });
            this.individualProducts = allComponents;

            // Restore persistent selection state
            this.individualProducts.forEach(p => {
                if (this.persistentSelectedIndividuals.has(p.id)) {
                    p.selected = true;
                    this.persistentSelectedIndividuals.set(p.id, p);
                }
            });
            this.productGroups.forEach(g => {
                if (this.persistentSelectedGroups.has(g.id)) {
                    g.selected = true;
                    this.persistentSelectedGroups.set(g.id, g);
                }
            });
        } else {
            // Fallback for simple/standalone products without groups

            // Check if it's a valid product response even without groups
            if (product.id && product.name) {
                this.productGroups = []; // No groups to show
                this.individualProducts = [{
                    id: product.id,
                    name: product.name || 'Product',
                    family: 'Standalone',
                    selected: false,
                    discount: 0,
                    quantity: 1,
                    price: product.unitPrice || 0,
                    pricebookEntryId: product.pricebookEntryId || '',
                    isBundleChild: false
                }];
            } else {
                this.productGroups = [];
                this.individualProducts = [];
            }
        }
    }

    confirmProductSelection() {
        if (this.activeTab === 'discounts' && this.discountForm.granularity === 'Granular') {
            const selectedGroups = Array.from(this.persistentSelectedGroups.values()).filter(g => g.selected);
            const selectedIndividuals = Array.from(this.persistentSelectedIndividuals.values()).filter(p => p.selected);

            const invalidItems = [...selectedGroups, ...selectedIndividuals].filter(item => {
                return item.discount === null || item.discount === undefined || item.discount < 1 || item.discount > 100;
            });

            if (invalidItems.length > 0) {
                this.toastService.show('Please provide a 1 to 100% discount for all selected products, or unselect them.', 'warning');
                return; // Prevent closing
            }
        }

        this.closeProductSelector();
    }

    // Picklist Filter Methods
    loadPicklistOptions() {
        // Only load once unless specifically forced or needed
        if (this.picklistLoaded || this.isPicklistLoading) return;

        this.isPicklistLoading = true;
        this.salesforceApiService.getProductPicklistValues().subscribe({
            next: (res: any) => {
                // Salesforce UI API picklist-values returns picklistFieldValues map
                const fields = res?.picklistFieldValues || res || {};

                // Extract values with extra safety checks
                const bfData = fields.RCA_Billing_Frequency__c || fields.billing_frequency;
                const regData = fields.RCA_Region__c || fields.region;

                this.billingFreqOptions = (bfData?.values || []).map((v: any) => ({ label: v.label, value: v.value }));
                this.regionOptions = (regData?.values || []).map((v: any) => ({ label: v.label, value: v.value }));

                console.log('Picklist options loaded:', {
                    regions: this.regionOptions.length,
                    billing: this.billingFreqOptions.length
                });

                this.picklistLoaded = true;
                this.isPicklistLoading = false;
            },
            error: (err) => {
                console.error('Failed to load picklist values', err);
                this.isPicklistLoading = false;
            }
        });
    }

    selectRegion(opt: { label: string; value: string } | null) {
        this.selectedRegion = opt;
        this.regionDropdownOpen = false;
        this.regionSearchText = '';
        // As requested: remove existing search values when selecting a filter
        this.productSearchTerm = '';
        if (this.productTab === 'individual') this.onProductSearch();
    }

    selectBillingFreq(opt: { label: string; value: string } | null) {
        this.selectedBillingFreq = opt;
        this.billingDropdownOpen = false;
        this.billingSearchText = '';
        // As requested: remove existing search values when selecting a filter
        this.productSearchTerm = '';
        if (this.productTab === 'individual') this.onProductSearch();
    }

    closeAllPicklistDropdowns() {
        this.regionDropdownOpen = false;
        this.billingDropdownOpen = false;
    }

    closeProductSelector() {
        this.showProductSelector = false;
        // Optionally reset temporary selection state if needed
    }

    switchProductTab(tab: 'groups' | 'individual') {
        this.productTab = tab;
        this.filterQuery = ''; // Reset filter on switch
        this.viewMode = 'all'; // Reset to "Show All" when switching tabs

        // As requested: call picklist api when switching to individual products
        if (tab === 'individual') {
            this.loadPicklistOptions();
        }
    }

    toggleItem(item: any) {
        // Validation: Limit to 999 products
        if (!item.selected) {
            if (this.liveQuotaRemaining <= 0) {
                this.toastService.show('Maximum limit of 999 products reached.', 'warning');
                return;
            }
        }

        item.selected = !item.selected;
        if (!item.selected) {
            item.discount = 0;
        }
        if (this.selectorCalledFrom === 'incentives') {
            // For incentives only track group selections
            if (this.productTab === 'groups') {
                if (item.selected) {
                    this.persistentIncentiveGroups.set(item.id, item);
                } else {
                    this.persistentIncentiveGroups.delete(item.id);
                }
            }
            return;
        }
        const map = this.productTab === 'groups' ? this.persistentSelectedGroups : this.persistentSelectedIndividuals;
        if (item.selected) {
            map.set(item.id, item);
        } else {
            map.delete(item.id);
        }
    }

    updatePersistentSelected(item: any) {
        if (!item.selected) return;

        // Prevent leading zeros and cap between 0-100
        if (item.discount !== null && item.discount !== undefined && item.discount !== '') {
            let val = Number(item.discount);
            if (isNaN(val)) val = 0;
            if (val < 0) val = 0;
            if (val > 100) {
                this.toastService.show('Discount cannot be more than 100%.', 'error');
                item.discount = null;
            } else {
                item.discount = val;
            }
        } else if (item.discount === '') {
            item.discount = null; // Changed from 0 to null
        }

        const map = this.productTab === 'groups' ? this.persistentSelectedGroups : this.persistentSelectedIndividuals;
        map.set(item.id, item);
    }

    clearDiscountZero(item: any) {
        if (item.discount === 0) {
            item.discount = null;
        }
    }

    restoreDiscountZero(item: any) {
        if (item.discount === null || item.discount === undefined || item.discount === '') {
            item.discount = 0;
            this.updatePersistentSelected(item);
        }
    }


    setViewMode(mode: 'all' | 'selected') {
        this.viewMode = mode;
    }

    handleSort(column: string) {
        if (this.sortConfig.column === column) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.column = column;
            this.sortConfig.direction = 'asc';
        }
    }

    get filteredItems(): any[] {
        let items: any[] = this.productTab === 'groups' ? this.productGroups : this.individualProducts;

        // 1. Filter by Search Query
        if (this.filterQuery) {
            const lowerQuery = this.filterQuery.toLowerCase();
            items = items.filter(item =>
                item.name.toLowerCase().includes(lowerQuery) ||
                (item.family && item.family.toLowerCase().includes(lowerQuery))
            );
        }

        // 2. Filter by View Mode (Selected Only)
        if (this.viewMode === 'selected') {
            const map = this.productTab === 'groups' ? this.persistentSelectedGroups : this.persistentSelectedIndividuals;
            return Array.from(map.values()).sort((a, b) => {
                const valA = a[this.sortConfig.column];
                const valB = b[this.sortConfig.column];
                if (valA < valB) return this.sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // 3. Sort
        return items.sort((a, b) => {
            const valA = a[this.sortConfig.column];
            const valB = b[this.sortConfig.column];

            // Simple string/number compare
            if (valA < valB) return this.sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    getSelectedCount(type: 'groups' | 'individual'): number {
        if (this.selectorCalledFrom === 'incentives') {
            return type === 'groups' ? this.persistentIncentiveGroups.size : 0;
        }
        const map = type === 'groups' ? this.persistentSelectedGroups : this.persistentSelectedIndividuals;
        return map.size;
    }

    get isAllSelected(): boolean {
        const items = this.filteredItems;
        return items.length > 0 && items.every(item => item.selected);
    }

    toggleSelectAll() {
        const allSelected = this.isAllSelected;
        let blockedByLimit = false;

        // Pick the correct map based on current context
        let map: Map<string, any>;
        if (this.selectorCalledFrom === 'incentives') {
            map = this.persistentIncentiveGroups;
        } else {
            map = this.productTab === 'groups' ? this.persistentSelectedGroups : this.persistentSelectedIndividuals;
        }

        this.filteredItems.forEach(item => {
            const becomingSelected = !allSelected;

            // Check limit when selecting
            if (becomingSelected && !item.selected) {
                if (this.liveQuotaRemaining <= 0) {
                    blockedByLimit = true;
                    return; // Skip this one
                }
            }

            item.selected = becomingSelected;
            if (item.selected) {
                map.set(item.id, item);
            } else {
                map.delete(item.id);
            }
        });

        if (blockedByLimit) {
            this.toastService.show('Selection partially blocked: Maximum limit of 999 products reached.', 'warning');
        }
    }

    // Management Actions
    async addDiscount() {
        if (!this.activeDiscountPeriod.startDate || !this.activeDiscountPeriod.endDate) {
            this.toastService.show('Please select both Start and End dates for the active discount period.', 'warning');
            return;
        }

        if (this.discountForm.granularity === 'Select') {
            this.toastService.show('Please select discount granularity', 'warning');
            return;
        }

        const selectedGroups = Array.from(this.persistentSelectedGroups.values()).filter(g => g.selected);
        const selectedIndividuals = Array.from(this.persistentSelectedIndividuals.values()).filter(p => p.selected);

        if (selectedGroups.length === 0 && selectedIndividuals.length === 0) {
            this.toastService.show('Please select at least one product or group', 'warning');
            return;
        }

        // Validation for Discount Value
        if (this.discountForm.granularity === 'Overall') {
            const overallDisc = parseFloat(this.discountForm.value);
            if (!overallDisc || overallDisc <= 0) {
                this.toastService.show('Please enter a valid discount value greater than 0%.', 'warning');
                return;
            }
            if (overallDisc > 100) {
                this.toastService.show('Discount cannot be more than 100%.', 'error');
                this.discountForm.value = '';
                return;
            }
        } else {
            // Granular: Ensure ALL selected items have a discount between 1 and 100
            const invalidItems = [...selectedGroups, ...selectedIndividuals].filter(item => {
                return item.discount === null || item.discount === undefined || item.discount < 1 || item.discount > 100;
            });
            if (invalidItems.length > 0) {
                this.toastService.show('Please provide a 1 to 100% discount for all selected products, or unselect them.', 'warning');
                return;
            }
        }

        this.isLoading = true;
        this.loadingService.show();
        let selectedItemsMap = new Map<string, any>();

        try {
            // 0. Resolve Root Classification ID (Sibling Bundles)
            // Use resolved rootClassificationId or the user-provided NvMAI fallback
            const rootClassId = this.rootClassificationId || '11BDz00000000NvMAI';
            console.log(`[Discounts] Fetching sibling bundles from root classification: ${rootClassId}`);

            const rootResponse = await lastValueFrom(this.rcaApiService.getProductsByClassification(rootClassId, 100));
            const availableBundles = rootResponse?.products || [];
            console.log(`[Discounts] Found ${availableBundles.length} products in root list.`);

            // 1. Process Groups using Root List matching
            for (const group of selectedGroups) {
                console.log(`[Discounts] Resolving group: "${group.name}" (ID: ${group.id})`);
                const targetName = group.name?.toLowerCase().trim();

                // Multi-stage name matching in the root list
                let matchingProduct = availableBundles.find((p: any) => p.name?.toLowerCase().trim() === targetName);
                if (!matchingProduct) {
                    matchingProduct = availableBundles.find((p: any) => p.name?.toLowerCase().trim().startsWith(targetName));
                }
                if (!matchingProduct) {
                    matchingProduct = availableBundles.find((p: any) => p.name?.toLowerCase().trim().includes(targetName));
                }

                if (matchingProduct) {
                    // RESOLUTION SUCCESS: Use the bundle's Product2Id
                    const actualProductId = matchingProduct?.productSellingModelOptions?.[0]?.productId ||
                        matchingProduct?.productId ||
                        matchingProduct?.id;

                    console.log(`[Discounts] Resolved group "${group.name}" to Product2Id: ${actualProductId}`);

                    selectedItemsMap.set(group.id, {
                        id: actualProductId,
                        name: group.name,
                        discount: group.discount || 0,
                        quantity: 1,
                        price: group.price || 0,
                        pricebookEntryId: group.pricebookEntryId || '',
                        isBundleChild: false
                    });
                } else {
                    console.warn(`[Discounts] No match for group: ${group.name} in root list`);
                    selectedItemsMap.set(group.id, {
                        id: group.id,
                        name: group.name,
                        discount: group.discount || 0,
                        quantity: 1,
                        price: group.price || 0,
                        pricebookEntryId: group.pricebookEntryId || '',
                        isBundleChild: false
                    });
                }
            }

            // 2. Collect from Individual Products
            selectedIndividuals.forEach(p => {
                selectedItemsMap.set(p.id, {
                    id: p.id,
                    name: p.name,
                    discount: p.discount || 0,
                    quantity: p.quantity || 1,
                    price: p.price || 0,
                    pricebookEntryId: p.pricebookEntryId || '',
                    isBundleChild: p.isBundleChild
                });
            });

            const selectedItems = Array.from(selectedItemsMap.values());

            if (selectedItems.length === 0) {
                this.toastService.show('Failed to resolve IDs for selected items', 'error');
                this.loadingService.hide();
                this.isLoading = false;
                return;
            }

            // Apply overall discount if applicable
            if (this.discountForm.granularity === 'Overall' && this.discountForm.value) {
                const overallDisc = parseFloat(this.discountForm.value) || 0;
                selectedItems.forEach(item => {
                    item.discount = overallDisc;
                });
            }

            console.log('[Discounts] Final Selected Items (Mapped):', selectedItems);
            this.handleGranularDiscount(selectedItems);

        } catch (err) {
            console.error('[Discounts] Error in addDiscount:', err);
            this.toastService.show('An error occurred while processing discounts', 'error');
            this.loadingService.hide();
            this.isLoading = false;
        }
    }

    handleGranularDiscount(selectedItems: any[]) {
        const quoteId = this.contextService.currentContext?.quoteId;
        const pricebookId = this.contextService.currentContext?.pricebookId;

        if (!quoteId) {
            this.toastService.show('No active quote found in context', 'error');
            return;
        }

        this.isLoading = true;
        this.loadingService.show();

        // 1. Resolve PricebookEntries for all items
        const pbeRequests = selectedItems.map(item =>
            this.salesforceApiService.getPricebookEntries([item.id]).pipe(
                map(res => ({
                    itemId: item.id,
                    pbeId: (res as any).records?.[0]?.Id
                })),
                catchError(() => of({ itemId: item.id, pbeId: null }))
            )
        );

        forkJoin(pbeRequests).pipe(
            switchMap(results => {
                const records: any[] = [];
                const oppId = this.contextService.currentContext?.opportunityId || '006Dz00000Q7DCGIA3';

                // A. Add Quote PATCH record
                records.push({
                    "referenceId": "refQuote",
                    "record": {
                        "attributes": {
                            "method": "PATCH",
                            "type": "Quote",
                            "id": quoteId
                        }
                    }
                });

                // B. Build QuoteLineItems
                selectedItems.forEach((item, index) => {
                    const pbeResult: any = results.find(r => r.itemId === item.id);

                    // Use resolved PBE, or item's PBE, or fallback for groups
                    const pbeId = pbeResult?.pbeId || item.pricebookEntryId || '01uDz00000dqLY8IAM';

                    const lineRefId = `refLine_${index}`;

                    records.push({
                        "referenceId": lineRefId,
                        "record": {
                            "attributes": { "type": "QuoteLineItem", "method": "POST" },
                            "QuoteId": quoteId, // Direct ID as per sample
                            "Product2Id": item.id,
                            "PricebookEntryId": pbeId,
                            "StartDate": this.activeDiscountPeriod.startDate,
                            "EndDate": this.activeDiscountPeriod.endDate,
                            "PeriodBoundary": "Anniversary",
                            "Quantity": Number(item.quantity) || 1,
                            "Discount": Number(item.discount) || 0
                        }
                    });
                });

                if (records.length <= 1) {
                    return of({ status: 'skip', message: 'No valid products to add' });
                }

                const payload = {
                    "pricingPref": "System",
                    "catalogRatesPref": "Skip",
                    "configurationPref": {
                        "configurationMethod": "Skip",
                        "configurationOptions": {
                            "validateProductCatalog": true,
                            "validateAmendRenewCancel": true,
                            "executeConfigurationRules": true,
                            "addDefaultConfiguration": true
                        }
                    },
                    "taxPref": "Skip",
                    "contextDetails": {},
                    "graph": {
                        "graphId": "createQuoteWithLines",
                        "records": records
                    }
                };

                return this.salesforceApiService.placeSalesTransaction(payload).pipe(
                    map(res => ({ status: 'success', res, count: selectedItems.length }))
                );
            }),
            finalize(() => {
                this.isLoading = false;
                this.loadingService.hide();
            })
        ).subscribe({
            next: (result: any) => {
                if (result.status === 'skip') {
                    this.toastService.show(result.message, 'warning');
                    return;
                }
                this.toastService.show('Quote updated successfully with discounts', 'success');
                const selectedGroupCount = this.persistentSelectedGroups.size;
                const selectedIndividualCount = this.persistentSelectedIndividuals.size;
                const discValue = this.discountForm.value ? this.discountForm.value + '%' : 'Updated';

                // Count committed items = selected groups + selected individuals (line items added)
                const committedCount = this.persistentSelectedGroups.size + selectedIndividualCount;

                this.addDiscountToUI(this.discountForm.granularity, selectedGroupCount, selectedIndividualCount, discValue, committedCount);
                this.resetSelections();
                // Reset dataFetched so that next time the component is opened it can refresh data if needed
                this.dataFetched = false;
                // Signal that quote line items need refresh due to discount changes
                this.quoteRefreshService.setRefreshNeeded(true);
            },
            error: (err) => {
                console.error('Failed to update quote', err);
            }
        });
    }

    private addDiscountToUI(granularity: string, groupCount: number, individualCount: number, value: string, committedProductCount: number = 0) {
        // Update the running quota
        this.usedQuotaCount += committedProductCount;
        const newDiscount = {
            id: 'd' + Date.now(),
            title: `${granularity} Discount - Flat Rate (%)`,
            subtext: `${groupCount} Product Groups, ${individualCount} Products`,
            value: value,
            type: 'discount',
            granularity: granularity
        };
        this.activeDiscountPeriod.activeDiscounts.unshift(newDiscount); // Add to top
    }

    addIncentive() {
        if (!this.activeIncentivePeriod.startDate || !this.activeIncentivePeriod.endDate) {
            this.toastService.show('Please select both Start and End dates for the active incentive period.', 'warning');
            return;
        }

        if (this.incentiveForm.type === 'Select') {
            this.toastService.show('Please select incentive type', 'warning');
            return;
        }

        const selectedGroups = Array.from(this.persistentIncentiveGroups.values()).filter(g => g.selected);
        if (selectedGroups.length === 0) {
            this.toastService.show('Please select at least one Product Group', 'warning');
            return;
        }

        // Always granular: validate each selected group has an amount
        const invalidGroups = selectedGroups.filter(g => !g.incentiveAmount || parseFloat(g.incentiveAmount) <= 0);
        if (invalidGroups.length > 0) {
            this.toastService.show('Please enter a valid incentive amount for all selected Product Groups.', 'warning');
            return;
        }

        const quoteId = this.contextService.currentContext?.quoteId;
        if (!quoteId) {
            this.toastService.show('No active quote found in context', 'error');
            return;
        }

        this.isLoading = true;
        this.loadingService.show();

        // Resolve root classification products then match groups
        const rootClassId = this.rootClassificationId || '11BDz00000000NvMAI';
        lastValueFrom(this.rcaApiService.getProductsByClassification(rootClassId, 100))
            .then(rootResponse => {
                const availableBundles = rootResponse?.products || [];

                const resolvedItems: any[] = [];
                for (const group of selectedGroups) {
                    const targetName = group.name?.toLowerCase().trim();
                    let match = availableBundles.find((p: any) => p.name?.toLowerCase().trim() === targetName)
                        || availableBundles.find((p: any) => p.name?.toLowerCase().trim().includes(targetName));

                    const productId = match?.productSellingModelOptions?.[0]?.productId || match?.id || group.id;
                    const pbeId = group.pricebookEntryId || '';
                    resolvedItems.push({ id: productId, name: group.name, pbeId, incentiveAmount: group.incentiveAmount });
                }

                // Build pbe requests
                const pbeRequests = resolvedItems.map(item =>
                    this.salesforceApiService.getPricebookEntries([item.id]).pipe(
                        map((res: any) => ({ itemId: item.id, pbeId: res.records?.[0]?.Id || item.pbeId })),
                        catchError(() => of({ itemId: item.id, pbeId: item.pbeId }))
                    )
                );

                const quoteLinesRequest = this.salesforceApiService.getBundleQuoteLineItems(quoteId).pipe(
                    catchError(() => of({ records: [] }))
                );

                forkJoin({
                    pbeResults: pbeRequests.length > 0 ? forkJoin(pbeRequests) : of([]),
                    quoteLines: quoteLinesRequest
                }).pipe(
                    switchMap(({ pbeResults, quoteLines }: any) => {
                        const existingLines = quoteLines?.records || [];
                        const records: any[] = [
                            {
                                "referenceId": "refQuote",
                                "record": {
                                    "attributes": { "method": "PATCH", "type": "Quote", "id": quoteId }
                                }
                            }
                        ];

                        resolvedItems.forEach((item, index) => {
                            const pbeResult: any = Array.isArray(pbeResults) ? pbeResults.find((r: any) => r.itemId === item.id) : null;
                            const finalPbeId = pbeResult?.pbeId || item.pbeId || '01uDz00000dqLY8IAM';

                            const existingLine = existingLines.find((ql: any) => ql.Product2Id === item.id);
                            // Always use per-item incentive amount (always granular)
                            const itemAmount = parseFloat(item.incentiveAmount) || 0;

                            if (existingLine && existingLine.Id) {
                                records.push({
                                    "referenceId": `refLineUpdate_${index}`,
                                    "record": {
                                        "attributes": { "type": "QuoteLineItem", "method": "PATCH", "id": existingLine.Id },
                                        "Incentive__c": itemAmount
                                    }
                                });
                            } else {
                                records.push({
                                    "referenceId": `refLineUpdate_${index}`,
                                    "record": {
                                        "attributes": { "type": "QuoteLineItem", "method": "POST" },
                                        "QuoteId": quoteId,
                                        "Product2Id": item.id,
                                        "PricebookEntryId": finalPbeId,
                                        "StartDate": this.activeIncentivePeriod.startDate,
                                        "EndDate": this.activeIncentivePeriod.endDate,
                                        "Incentive__c": itemAmount,
                                        "PeriodBoundary": "Anniversary",
                                        "Quantity": 1
                                    }
                                });
                            }
                        });

                        const payload = {
                            "pricingPref": "Skip",
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
                                "graphId": "insert_incentive",
                                "records": records
                            }
                        };

                        return this.salesforceApiService.placeSalesTransaction(payload);
                    }),
                    finalize(() => {
                        this.isLoading = false;
                        this.loadingService.hide();
                    })
                ).subscribe({
                    next: () => {
                        this.toastService.show('Incentive added successfully', 'success');
                        const groupCount = selectedGroups.length;
                        this.usedQuotaCount += groupCount;
                        const displayValue = `${groupCount} group${groupCount !== 1 ? 's' : ''} with custom amounts`;
                        this.activeIncentivePeriod.activeIncentives.unshift({
                            id: 'i' + Date.now(),
                            title: this.incentiveForm.type,
                            subtext: `${groupCount} Product Group${groupCount !== 1 ? 's' : ''}`,
                            value: displayValue,
                            type: 'incentive'
                        });
                        this.incentiveForm.amount = '';
                        this.persistentIncentiveGroups.clear();
                        this.productGroups.forEach(g => { g.selected = false; });
                        this.quoteRefreshService.setRefreshNeeded(true);
                    },
                    error: (err) => {
                        console.error('[Incentives] Error adding incentive:', err);
                    }
                });
            })
            .catch(err => {
                console.error('[Incentives] Error resolving bundles:', err);
                this.toastService.show('Error resolving product groups', 'error');
                this.loadingService.hide();
                this.isLoading = false;
            });
    }

    get totalProductsCount(): number {
        // Treat each selected group as ONE product line item
        return this.persistentSelectedGroups.size + this.persistentSelectedIndividuals.size;
    }

    duplicateItem(item: any, period: any) {
        const newItem = { ...item, id: Date.now().toString() };
        if (item.type === 'discount') {
            period.activeDiscounts.push(newItem);
        } else {
            period.activeIncentives.push(newItem);
        }
        this.openActionMenuId = null;
        this.toastService.show('Item duplicated', 'success');
    }

    deleteItem(item: any, period: any) {
        if (item.type === 'discount') {
            period.activeDiscounts = period.activeDiscounts.filter((d: any) => d.id !== item.id);
        } else {
            period.activeIncentives = period.activeIncentives.filter((i: any) => i.id !== item.id);
        }
        this.openActionMenuId = null;
        this.toastService.show('Item deleted', 'success');
    }

    toggleActionMenu(id: string) {
        this.openActionMenuId = this.openActionMenuId === id ? null : id;
    }

    resetSelections() {
        this.productGroups.forEach(g => {
            g.selected = false;
            g.discount = 0;
        });
        this.individualProducts.forEach(p => {
            p.selected = false;
            p.discount = 0;
        });
        this.persistentSelectedGroups.clear();
        this.persistentSelectedIndividuals.clear();
        this.discountForm.value = '';
    }
    restrictNumeric(event: KeyboardEvent) {
        const allowedKeys = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'End', 'Home'];
        if (allowedKeys.includes(event.key)) return;

        const isDigit = /[0-9]/.test(event.key);
        const isDot = event.key === '.';

        if (!isDigit && !isDot) {
            event.preventDefault();
        }

        if (isDot && (event.target as HTMLInputElement).value.includes('.')) {
            event.preventDefault();
        }
    }
}
