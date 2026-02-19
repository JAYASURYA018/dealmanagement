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
        }
    }

    fetchDropdownOptions() {
        this.rcaApiService.getDropdownOptions().subscribe({
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

        // 1. Get Classifications for the current Bundle ID (which implies the current product is a bundle)
        // The user requirement says: WHERE Parent_Bundle_Product_ID__c ='01tDz00000Eah7vIAB'
        // I should stick to using `this.productId` as the parent bundle ID.
        this.rcaApiService.getProductClassifications(this.productId).pipe(
            switchMap((res: any) => {
                const records = res.records || [];

                // 1. Handle Bundles (for Groups tab)
                const bundleClassifications = records.filter((r: any) => r.It_has_Bundle_Products__c === true);

                // 2. Handle Individuals (Legacy or Fallback logic, mainly dependent on Dropdown now)
                // We no longer rely on `individualClassifications` from THIS call for the main list,
                // as the Dropdown fetches its own options.
                // However, we might want to ensure consistency or use this as a fallback.
                // For now, removing the auto-load from here to rely on fetchDropdownOptions.
                // this.individualClassifications = records.filter((r: any) => r.It_has_Bundle_Products__c === false);
                // this.currentIndividualClassIndex = 0;
                // this.individualCurrentOffset = 0;
                // this.individualProducts = []; // Clear previous

                // Start loading individual products if any classifications exist
                // if (this.individualClassifications.length > 0) {
                //     this.loadIndividualProducts();
                // }

                // Continue with Group loading logic
                const requests = bundleClassifications.map((cls: any) =>
                    this.rcaApiService.getProductsByClassification(cls.Id).pipe(
                        map(productsRes => ({
                            classificationId: cls.Id,
                            products: productsRes.products || []
                        })),
                        catchError(() => of({ classificationId: cls.Id, products: [] }))
                    )
                );

                if (requests.length === 0) {
                    return of({ classifications: bundleClassifications, productResults: [] });
                }

                return forkJoin(requests).pipe(
                    map(productResults => ({
                        classifications: bundleClassifications,
                        productResults: productResults
                    }))
                );
            }),
            finalize(() => this.isLoading = false)
        ).subscribe({
            next: (data: any) => {
                this.debugData = data;
                this.mapNewProductData(data.classifications, data.productResults);
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

    mapNewProductData(classifications: any[], productResults: any[]) {
        this.productGroups = [];
        // Note: individualProducts is managed by loadIndividualProducts

        // The user wants the CONTENTS of the "Bundle" classifications to be listed in "Product Groups".
        // e.g. If "ROOT" is the Bundle Classification, we fetched its products (Edge, Compute, etc.)
        // We should display Edge, Compute, etc. as the groups.

        const allBundleProducts: any[] = [];

        productResults.forEach(res => {
            if (res.products && res.products.length > 0) {
                allBundleProducts.push(...res.products);
            }
        });

        // Map these products to the Product Groups model
        this.productGroups = allBundleProducts.map(p => ({
            id: p.id,
            name: p.name, // e.g. "Edge", "Compute"
            count: 0,     // We don't have child count from this API yet?
            selected: false,
            discount: 0,
            components: [] // No components known yet unless we fetch deeper
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
            if (group.components) {
                group.components.forEach((comp: any) => {
                    selectedItemsMap.set(comp.id, {
                        id: comp.id,
                        name: comp.name,
                        discount: group.discount || 0,
                        quantity: comp.quantity || 1,
                        price: comp.unitPrice || 0,
                        pricebookEntryId: comp.pricebookEntryId || '',
                        isBundleChild: true
                    });
                });
            }
        });

        // 2. Collect from Individual Products (Individual selection augments or overrides)
        const selectedIndividuals = this.individualProducts.filter(p => p.selected);
        selectedIndividuals.forEach(p => {
            // Overwrite if already in map, or add if new
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
        const groupCount = selectedGroups.length;
        const individualCount = selectedIndividuals.length;

        if (selectedItems.length === 0) {
            this.toastService.show('Please select at least one product or group', 'warning');
            return;
        }

        console.log('[Discounts] Final Selected Items for API:', selectedItems);

        if (this.discountForm.granularity === 'Granular') {
            this.handleGranularDiscount(selectedItems);
            return;
        }

        const newDiscount = {
            id: 'd' + Date.now(),
            title: `${this.discountForm.granularity} Discount - ${this.discountForm.type}`,
            subtext: `${groupCount} Groups and ${individualCount} Individual Products selected (${selectedItems.length} total)`,
            value: this.discountForm.value ? this.discountForm.value + '%' : '0%',
            type: 'discount',
            granularity: this.discountForm.granularity
        };

        this.activeDiscounts.push(newDiscount);
        this.toastService.show('Discount added successfully', 'success');

        // Reset form but keep defaults
        this.discountForm.value = '';
        this.resetSelections();
    }

    handleGranularDiscount(selectedItems: any[]) {
        const quoteId = this.contextService.currentContext?.quoteId;
        const pricebookId = this.contextService.currentContext?.pricebook2Id;

        if (!quoteId) {
            this.toastService.show('Quote ID missing in context. Please reload.', 'error');
            return;
        }

        this.isLoading = true;

        // 1. Fetch PricebookEntryIds for all selected products
        const requests = selectedItems.map(item => {
            if (item.pricebookEntryId) {
                return of({ itemId: item.id, pbeId: item.pricebookEntryId, pbeIdFound: true });
            }
            return this.salesforceApiService.getPricebookEntries([item.id]).pipe(
                map(res => ({
                    itemId: item.id,
                    pbeId: res.records && res.records.length > 0 ? res.records[0].Id : null,
                    pbePricebookId: res.records && res.records.length > 0 ? res.records[0].Pricebook2Id : null,
                    pbeIdFound: res.records && res.records.length > 0
                })),
                catchError(() => of({ itemId: item.id, pbeId: null, pbeIdFound: false }))
            );
        });

        forkJoin(requests).pipe(
            finalize(() => this.isLoading = false)
        ).subscribe(results => {
            const records: any[] = [];

            // A. Identify the Pricebook to use (Prefer the one from the first PBE result, or fallback to context)
            const firstValidPbe = results.find(r => (r as any).pbePricebookId);
            const dynamicPricebookId = (firstValidPbe as any)?.pbePricebookId || pricebookId || '01sf4000003ZgtzAAC';

            // B. Add Quote Patch to ensure Pricebook is set
            records.push({
                "referenceId": "QuoteUpdate",
                "record": {
                    "attributes": { "type": "Quote", "method": "PATCH", "id": quoteId },
                    "Pricebook2Id": dynamicPricebookId
                }
            });

            // C. Build QuoteLineItems and Relationships
            selectedItems.forEach((item, index) => {
                const pbeResult: any = results.find(r => r.itemId === item.id);
                const pbeId = pbeResult?.pbeId || item.pricebookEntryId;

                if (!pbeId) {
                    console.warn(`Missing PricebookEntryId for product ${item.name} (${item.id})`);
                    return;
                }

                const lineRefId = `refLine_${index}`;
                records.push({
                    "referenceId": lineRefId,
                    "record": {
                        "attributes": { "type": "QuoteLineItem", "method": "POST" },
                        "QuoteId": quoteId,
                        "Product2Id": item.id,
                        "PricebookEntryId": pbeId,
                        "Quantity": item.quantity || 1,
                        "UnitPrice": item.price || 0,
                        "Discount": item.discount || 0,
                        "StartDate": this.discountPeriod.startDate,
                        "EndDate": this.discountPeriod.endDate,
                        "PeriodBoundary": "Anniversary"
                    }
                });

                // D. Link child products to parent bundle if applicable
                if (item.isBundleChild && this.parentQuoteLineId) {
                    records.push({
                        "referenceId": `refRel_${index}`,
                        "record": {
                            "attributes": { "type": "QuoteLineRelationship", "method": "POST" },
                            "MainQuoteLineId": this.parentQuoteLineId,
                            "AssociatedQuoteLineId": `@{${lineRefId}.id}`,
                            "ProductRelationshipTypeId": "0PRDz000000Cc5BIAS" // Placeholder ID for Bundle relationship
                        }
                    });
                }
            });

            if (records.length <= 1) { // Only QuoteUpdate, no lines
                this.toastService.show('No valid products to add (missing Pricebook Entries)', 'warning');
                return;
            }

            const payload = {
                "graph": {
                    "graphId": "sync_" + Date.now(),
                    "records": records
                }
            };

            this.salesforceApiService.placeSalesTransaction(payload).subscribe({
                next: (res) => {
                    this.toastService.show('Quote updated successfully with granular discounts', 'success');
                    this.addDiscountToUI('Granular', selectedItems.length);
                    this.resetSelections();
                },
                error: (err) => {
                    // Error is handled by SalesforceApiService.handleError which now shows more detail
                    console.error('Failed to update quote', err);
                }
            });
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

        const selectedCount = this.getSelectedCount('groups') || this.getSelectedCount('individual');
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
        if (this.productTab === 'groups') {
            return this.productGroups.filter(g => g.selected).reduce((acc, g) => acc + (g.count || 0), 0);
        } else {
            return this.individualProducts.filter(p => p.selected).length;
        }
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
