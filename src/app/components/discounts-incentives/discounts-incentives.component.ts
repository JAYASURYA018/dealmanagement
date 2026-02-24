import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RcaApiService } from '../../services/rca-api.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { ContextService } from '../../services/context.service';
import { ToastService } from '../../services/toast.service';
import { LoadingService } from '../../services/loading.service';
import { finalize, forkJoin, map, catchError, of, switchMap } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-discounts-incentives',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './discounts-incentives.component.html',
})
export class DiscountsIncentivesComponent implements OnChanges {
    @Input() productId: string | null = null;
    @Input() parentQuoteLineId: string | null = null; // Parent Bundle Line ID


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
    discountPeriod = {
        timePeriod: 'Date range',
        startDate: '',
        endDate: ''
    };

    incentivePeriod = {
        timePeriod: 'Date range',
        startDate: '',
        endDate: ''
    };

    // Active items for left panel
    activeDiscounts: any[] = [];
    activeIncentives: any[] = [];

    // Dropdown Options
    incentiveTypeOptions = ['Select', 'Incentives type 1', 'Incentives type 2'];



    // Product Selector Logic
    showProductSelector = false;
    productTab: 'groups' | 'individual' = 'groups';
    filterQuery: string = '';
    viewMode: 'all' | 'selected' = 'all';

    // Sorting
    sortConfig = {
        column: 'name',
        direction: 'asc' as 'asc' | 'desc'
    };

    // Data
    displayMode: 'grid' | 'list' = 'list';
    productGroups: any[] = [];
    individualProducts: any[] = [];

    // Dropdown Data
    dropdownOptions: any[] = [];
    filteredDropdownOptions: any[] = [];
    selectedDropdownOption: any = null;
    dropdownSearchText: string = '';
    isDropdownOpen: boolean = false;

    // Individual Pagination State
    individualPageSize: number = 50;
    individualPageOptions: number[] = [10, 20, 50];
    individualCurrentOffset: number = 0;
    individualTotalLoaded: number = 0;
    isIndividualLoading: boolean = false;

    productSearchTerm: string = '';
    categoryId: string = '';

    constructor(
        private rcaApiService: RcaApiService,
        private salesforceApiService: SalesforceApiService,
        private contextService: ContextService,
        private toastService: ToastService,
        private loadingService: LoadingService
    ) { }

    ngOnInit() {
        this.fetchDropdownOptions();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['productId'] && changes['productId'].currentValue) {
            this.fetchProductDetails();
            this.fetchDropdownOptions();
        }
    }

    fetchDropdownOptions() {
        if (!this.productId) return;

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

    validateDiscountDates() {
        if (!this.discountPeriod.startDate || !this.discountPeriod.endDate) return;
        if (this.discountPeriod.endDate < this.discountPeriod.startDate) {
            this.toastService.show('Discount End Date cannot be earlier than Start Date.', 'warning');
            this.discountPeriod.endDate = '';
        }
    }

    validateIncentiveDates() {
        if (!this.incentivePeriod.startDate || !this.incentivePeriod.endDate) return;
        if (this.incentivePeriod.endDate < this.incentivePeriod.startDate) {
            this.toastService.show('Incentive End Date cannot be earlier than Start Date.', 'warning');
            this.incentivePeriod.endDate = '';
        }
    }
    // Selector Actions
    openProductSelector() {
        if (this.discountForm.granularity === 'Select' || this.discountForm.type === 'Select') {
            this.toastService.show('Please select a Discount Type.', 'warning');
            return;
        }

        this.showProductSelector = true;

        if (this.productId) {
            this.fetchProductDetails();
        } else {
            // Fallback or empty state? For now, let's clear mocks if no ID
            this.productGroups = [];
            this.individualProducts = [];
        }
    }

    debugData: any = null;

    fetchProductDetails() {
        if (!this.productId) return;

        this.isLoading = true;
        this.debugData = null; // Clear previous

        // 1. Get Categories for the current Bundle
        console.log('[fetchProductDetails] Fetching product details for category resolution:', this.productId);
        this.rcaApiService.getProductDetails(this.productId).subscribe({
            next: (p: any) => {
                console.log('[fetchProductDetails] Product detail response for category resolution:', p);

                // Handle both single object and array responses
                const productData = Array.isArray(p) ? p[0] : p;

                if (productData && productData.categories && productData.categories.length > 0) {
                    this.categoryId = productData.categories[0].id;
                    console.log('[fetchProductDetails] Resolved categoryId:', this.categoryId);
                } else {
                    console.warn('[fetchProductDetails] No categories found in product details response', productData);
                }
            },
            error: (err) => console.error('[fetchProductDetails] Error fetching product categories', err)
        });

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

        this.isIndividualLoading = true;

        this.rcaApiService.getProductsByClassification(
            currentClassId,
            this.individualPageSize,
            this.individualCurrentOffset
        ).pipe(
            finalize(() => this.isIndividualLoading = false)
        ).subscribe({
            next: (data) => {
                const newProducts = data.products || [];

                // Map to UI model
                const mappedProducts = newProducts.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    family: currentClassName, // Use classification name as family
                    selected: false,
                    discount: 0,
                    quantity: 1,
                    price: p.unitPrice || 0,
                    pricebookEntryId: p.pricebookEntryId || '',
                    isBundleChild: false
                }));

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
        this.individualPageSize = newSize;
        this.individualCurrentOffset = 0;
        // this.currentIndividualClassIndex = 0; // Reset to start? Or keep current class?
        // User implied "continuous" flow. Let's restart to be safe and simple.
        this.loadIndividualProducts();
    }

    nextPage() {
        // Increment offset
        this.individualCurrentOffset += this.individualPageSize;
        this.loadIndividualProducts();
    }

    prevPage() {
        if (this.individualCurrentOffset >= this.individualPageSize) {
            this.individualCurrentOffset -= this.individualPageSize;
            this.loadIndividualProducts();
        }
    }

    onProductSearch() {
        console.log('[onProductSearch] Triggered with term:', this.productSearchTerm);

        if (!this.productSearchTerm) {
            console.log('[onProductSearch] Search term cleared, reloading default products');
            this.loadIndividualProducts();
            return;
        }

        if (!this.categoryId) {
            console.warn('[onProductSearch] No category ID found for search, attempting to re-fetch product details...');
            // Try to fetch it again if it's missing
            if (this.productId) {
                this.isIndividualLoading = true;
                this.rcaApiService.getProductDetails(this.productId).pipe(
                    finalize(() => this.isIndividualLoading = false)
                ).subscribe({
                    next: (p: any) => {
                        const productData = Array.isArray(p) ? p[0] : p;
                        if (productData && productData.categories && productData.categories.length > 0) {
                            this.categoryId = productData.categories[0].id;
                            console.log('[onProductSearch] Resolved categoryId on retry:', this.categoryId);
                            this.executeSearch(); // Actually perform the search now
                        } else {
                            this.toastService.show('Unable to determine product category for search.', 'warning');
                        }
                    },
                    error: (err) => {
                        console.error('[onProductSearch] Retry fetch of product details failed', err);
                        this.toastService.show('Search failed: Category context unavailable.', 'error');
                    }
                });
                return;
            }
            return;
        }

        this.executeSearch();
    }

    executeSearch() {
        if (!this.productSearchTerm) {
            // If search is cleared, maybe reload default classification products?
            this.loadIndividualProducts();
            return;
        }

        this.isIndividualLoading = true;
        this.rcaApiService.searchProducts(this.productSearchTerm, [this.categoryId]).pipe(
            finalize(() => this.isIndividualLoading = false)
        ).subscribe({
            next: (data) => {
                const newProducts = data.products || [];
                // Map to UI model
                this.individualProducts = newProducts.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    family: p.additionalFields?.Family || 'Search Result',
                    selected: false,
                    discount: 0,
                    quantity: 1,
                    price: p.unitPrice || 0,
                    pricebookEntryId: p.pricebookEntryId || '',
                    isBundleChild: false
                }));
            },
            error: (err) => {
                console.error('Search error', err);
                this.toastService.show('Search failed', 'error');
            }
        });
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
                        allComponents.push({
                            id: comp.id,
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

    closeProductSelector() {
        this.showProductSelector = false;
        // Optionally reset temporary selection state if needed
    }

    switchProductTab(tab: 'groups' | 'individual') {
        this.productTab = tab;
        this.filterQuery = ''; // Reset filter on switch
    }

    toggleSelection(item: any) {
        item.selected = !item.selected;
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
            items = items.filter(item => item.selected);
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
        const list = type === 'groups' ? this.productGroups : this.individualProducts;
        return list.filter(i => i.selected).length;
    }

    get isAllSelected(): boolean {
        const items = this.filteredItems;
        return items.length > 0 && items.every(item => item.selected);
    }

    toggleSelectAll() {
        const allSelected = this.isAllSelected;
        this.filteredItems.forEach(item => item.selected = !allSelected);
    }

    // Management Actions
    addDiscount() {
        if (!this.discountPeriod.startDate || !this.discountPeriod.endDate) {
            this.toastService.show('Please select both Start and End dates for the discount period.', 'warning');
            return;
        }

        if (this.discountForm.granularity === 'Select') {
            this.toastService.show('Please select discount granularity', 'warning');
            return;
        }

        let selectedItemsMap = new Map<string, any>();

        // 1. Collect from Product Groups
        const selectedGroups = this.productGroups.filter(g => g.selected);
        selectedGroups.forEach(group => {
            // Use parent bundle's product ID for the group line item
            selectedItemsMap.set(group.id, {
                id: this.productId, // Map group to Bundle Product ID
                name: group.name,
                discount: group.discount || 0,
                quantity: 1,
                price: group.price || 0,
                pricebookEntryId: group.pricebookEntryId || '',
                isBundleChild: false
            });
        });

        // 2. Collect from Individual Products
        const selectedIndividuals = this.individualProducts.filter(p => p.selected);
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
            this.toastService.show('Please select at least one product or group', 'warning');
            return;
        }

        if (this.discountForm.granularity === 'Overall' && this.discountForm.value) {
            const overallDisc = parseFloat(this.discountForm.value) || 0;
            selectedItems.forEach(item => {
                item.discount = overallDisc;
            });
        }

        console.log('[Discounts] Final Selected Items (Direct):', selectedItems);
        this.handleGranularDiscount(selectedItems);
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
                            "StartDate": this.discountPeriod.startDate,
                            "EndDate": this.discountPeriod.endDate,
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
                this.addDiscountToUI(this.discountForm.granularity, result.count);
                this.resetSelections();
            },
            error: (err) => {
                console.error('Failed to update quote', err);
            }
        });
    }

    private addDiscountToUI(granularity: string, count: number) {
        const newDiscount = {
            id: 'd' + Date.now(),
            title: `${granularity} Discount applied`,
            subtext: `${count} Products updated in Salesforce`,
            value: 'See Salesforce',
            type: 'discount',
            granularity: granularity
        };
        this.activeDiscounts.push(newDiscount);
    }

    addIncentive() {
        if (!this.incentivePeriod.startDate || !this.incentivePeriod.endDate) {
            this.toastService.show('Please select both Start and End dates for the incentive period.', 'warning');
            return;
        }

        if (this.incentiveForm.type === 'Select') {
            this.toastService.show('Please select incentive type', 'warning');
            return;
        }

        const selectedCount = this.totalProductsCount;
        if (selectedCount === 0) {
            this.toastService.show('Please select at least one product', 'warning');
            return;
        }

        const newIncentive = {
            id: 'i' + Date.now(),
            title: this.incentiveForm.type,
            subtext: `${selectedCount} Product Groups, ${this.totalProductsCount} Products`,
            value: this.incentiveForm.amount ? '$' + this.incentiveForm.amount : '$0',
            type: 'incentive'
        };

        this.activeIncentives.push(newIncentive);
        this.toastService.show('Incentive added successfully', 'success');

        // Reset form
        this.incentiveForm.amount = '';
        this.resetSelections();
    }

    get totalProductsCount(): number {
        // Treat each selected group as ONE product line item
        const groupCount = this.productGroups.filter(g => g.selected).length;
        const individualCount = this.individualProducts.filter(p => p.selected).length;
        return groupCount + individualCount;
    }

    duplicateItem(item: any) {
        const newItem = { ...item, id: Date.now().toString() };
        if (item.type === 'discount') {
            this.activeDiscounts.push(newItem);
        } else {
            this.activeIncentives.push(newItem);
        }
        this.openActionMenuId = null;
        this.toastService.show('Item duplicated', 'success');
    }

    deleteItem(item: any) {
        if (item.type === 'discount') {
            this.activeDiscounts = this.activeDiscounts.filter(d => d.id !== item.id);
        } else {
            this.activeIncentives = this.activeIncentives.filter(i => i.id !== item.id);
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
