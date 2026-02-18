import { Component, HostListener, OnInit, inject } from '@angular/core';
import { DiscountsIncentivesComponent } from '../../components/discounts-incentives/discounts-incentives.component';
import { CommonModule } from '@angular/common';
import { CartService } from '../../services/cart.service';
import { ContextService } from '../../services/context.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { QuoteDataService } from '../../services/quote-data.service';
import { switchMap, map } from 'rxjs/operators';
import { Observable, of, forkJoin } from 'rxjs';
import { Router } from '@angular/router';
import { LoadingService } from '../../services/loading.service';
import { ToastService } from '../../services/toast.service';
import html2canvas from 'html2canvas';

import { FormsModule } from '@angular/forms';
import { SubscriptionPeriodsModalComponent } from '../../components/subscription-periods-modal/subscription-periods-modal';
import { SubscriptionPeriodItemComponent, SubscriptionPeriod, ProductItem } from '../../components/subscription-period-item/subscription-period-item';

@Component({
    selector: 'app-quote-details',
    standalone: true,
    imports: [CommonModule, FormsModule, DiscountsIncentivesComponent, SubscriptionPeriodsModalComponent, SubscriptionPeriodItemComponent],
    templateUrl: './quote-details.component.html',
})
export class QuoteDetailsComponent implements OnInit {
    static lastInitTime = 0;
    private router = inject(Router);
    private sfApi = inject(SalesforceApiService);
    private contextService = inject(ContextService);
    private cartService = inject(CartService);
    private loadingService = inject(LoadingService);
    private quoteDataService = inject(QuoteDataService);
    private toastService = inject(ToastService);

    isSaving: boolean = false;
    isLoading: boolean = true; // Start in loading state
    showSuccessPopup: boolean = false;
    showPreviewPopup: boolean = false;
    previewData: any = null;
    previewScreenshot: string | null = null;
    isCapturingScreenshot: boolean = false; // Flag to hide preview during screenshot capture

    commitmentPeriods: any[] = [{ months: null, amount: null, isCollapsed: false }];
    activeMenuIndex: number | null = null;
    activeTab: 'details' | 'discounts' = 'details';

    // Quote Data Properties
    opportunityName: string = '';
    accountName: string = '';
    quoteId: string = '';
    primaryContactName: string = '';
    salesChannel: string = '';
    productName: string = 'No Products';
    productId: string | null = null;
    bundleQuoteLineId: string | null = null; // To link components to this parent
    website: string = '';
    isGCP: boolean = false;

    // Dates
    startDate: string = '';
    expirationDate: string = '';
    previewCommitments: any[] = [];

    // Subscription Flow (Looker New RCA) Properties
    operationType: string = 'New';
    billingFrequency: string = 'Annual in Advance';
    termStartsOn: string = 'Fixed Start Date';
    // termStartDate is reused 'startDate'
    termEndDate: string = '';

    operationTypeOptions = ['New', 'Renewal', 'Amendment'];
    billingFrequencyOptions = [
        'Annual in Advance Anniversary', 'Monthly in Advance Anniversary', 'Quarterly in Advance Anniversary',
        'Annual in Advance', 'Quarterly in Advance', 'Monthly in Arrears'
    ];
    termStartsOnOptions = ['Fixed Start Date', 'Upon Provisioning', 'Customer Signature Date'];

    // Subscription State
    isSubscriptionModalOpen: boolean = false;
    subscriptionPeriods: SubscriptionPeriod[] = [];
    productOptions: ProductItem[] = [];
    lookerRegionOptions: string[] = ['us-central1', 'europe-west1', 'asia-northeast1']; // Mock options

    // Mock Prices for Bundle
    developerUserPrice: number = 100;
    standardUserPrice: number = 200;
    viewerUserPrice: number = 50;

    // UI State for Subscription Dropdowns
    operationTypeOpen = false;
    billingFrequencyOpen = false;
    termStartsOnOpen = false;

    // API Data for Save Logic
    existingQuoteLineItems: any[] = [];
    productRelationshipTypeId: string = '';

    // Explicit termStartDate property to match ConfigureQuoteDetails usage if needed, 
    // or we can map it to this.startDate. for now let's use a getter/setter or just use startDate.
    get termStartDate(): string { return this.startDate; }
    set termStartDate(val: string) { this.startDate = val; }


    switchTab(tab: 'details' | 'discounts') {
        this.activeTab = tab;
    }

    // Mock Bundle Loading
    loadBundleDetails() {
        const bundleId = '01tDz00000Ea17zIAB'; // Looker New RCA
        this.loadingService.show();

        this.sfApi.getBundleDetails(bundleId).subscribe({
            next: (data) => {
                console.log('📦 Bundle Details Received:', data);
                // Handle response structure (Connect API sometimes wraps in 'result' or returns directly)
                const result = data.result || data;

                if (result && result.productComponentGroups) {
                    const groups = result.productComponentGroups;

                    // 1. Extract Platform Products
                    const platformGroup = groups.find((g: any) => g.name === 'Platform');
                    const nonProdGroup = groups.find((g: any) => g.name === 'Non-production' || g.name === 'Non-Production');

                    if (platformGroup) {
                        this.productOptions = platformGroup.components.map((c: any) => {
                            const priceObj = (c.prices && c.prices.find((p: any) => p.isDefault || p.isSelected)) || (c.prices && c.prices[0]) || null;
                            const mainPrice = priceObj ? priceObj.price : 0;
                            const frequency = priceObj && priceObj.pricingModel ? priceObj.pricingModel.frequency : 'Year';
                            const pricebookEntryId = priceObj ? priceObj.priceBookEntryId : null;

                            // Find corresponding non-prod component
                            let nonProdPrice = 0;
                            let nonProdProductId = null;
                            let nonProdPricebookEntryId = null;
                            if (nonProdGroup) {
                                const name = c.name.toLowerCase();
                                const match = nonProdGroup.components.find((npc: any) => {
                                    const npcName = npc.name.toLowerCase();
                                    if (name.includes('standard') && npcName.includes('standard')) return true;
                                    if (name.includes('enterprise') && npcName.includes('enterprise')) return true;
                                    if (name.includes('embed') && npcName.includes('embed')) return true;
                                    return false;
                                });
                                if (match) {
                                    const npPriceObj = (match.prices && match.prices.find((p: any) => p.isDefault || p.isSelected)) || (match.prices && match.prices[0]) || null;
                                    nonProdPrice = npPriceObj ? npPriceObj.price : 0;
                                    nonProdProductId = match.id; // As requested: take ID from response 'id'
                                    nonProdPricebookEntryId = npPriceObj ? npPriceObj.priceBookEntryId : null;
                                }
                            }

                            return {
                                category: 'Platform',
                                name: c.name,
                                price: mainPrice,
                                nonProdPrice: nonProdPrice,
                                frequency: frequency,
                                productId: c.id, // As requested: take ID from response 'id'
                                pricebookEntryId: pricebookEntryId,
                                nonProdProductId: nonProdProductId,
                                nonProdPricebookEntryId: nonProdPricebookEntryId,
                                // Dynamic Fields from User Request (Defaulted here, but can be from API if available)
                                startDate: null, // Will be set by user selection
                                endDate: null,   // Will be set by user selection
                                billingFrequency: 'Annual', // Default from user request example
                                periodBoundary: 'Anniversary',
                                operationType: 'New',
                                termStartsOn: 'Fixed Start Date',
                                subscriptionTermUnit: 'Monthly'
                            };
                        });
                    }

                    // 2. Extract User Prices and IDs
                    const userGroup = groups.find((g: any) => g.name === 'Users');
                    if (userGroup) {
                        userGroup.components.forEach((c: any) => {
                            const priceObj = (c.prices && c.prices.find((p: any) => p.isDefault || p.isSelected)) || (c.prices && c.prices[0]) || null;
                            const price = priceObj ? priceObj.price : 0;
                            const frequency = priceObj && priceObj.pricingModel ? priceObj.pricingModel.frequency : 'Year';
                            const productId = c.productId || c.product2Id || c.id;
                            const pricebookEntryId = priceObj ? priceObj.priceBookEntryId : null;

                            // Store prices and IDs securely if needed for global access, 
                            // or relied upon standard/viewer logic in subscription-period-item
                            if (c.name.includes('Developer')) {
                                this.developerUserPrice = price;
                                // Store IDs if you have properties for them, or just rely on period update below
                            } else if (c.name.includes('Standard')) {
                                this.standardUserPrice = price;
                            } else if (c.name.includes('Viewer')) {
                                this.viewerUserPrice = price;
                            }

                            // Update existing periods with IDs and Prices
                            this.subscriptionPeriods.forEach(p => {
                                p.userRows.forEach(r => {
                                    if (c.name.includes(r.type)) {
                                        r.price = price;
                                        r.frequency = frequency;
                                        r.productId = productId;
                                        r.pricebookEntryId = pricebookEntryId;
                                    }
                                });
                            });
                        });
                    }

                    // PBE IDs are now directly from the CPQ response, so no need for extra API call!
                    this.loadingService.hide();

                } else {
                    console.warn('⚠️ No productComponentGroups found in response.');
                    this.loadingService.hide();
                }
            },
            error: (err) => {
                console.error('❌ Failed to load bundle details:', err);
                this.loadingService.hide();
                this.toastService.show('Failed to load products.', 'error');
            }
        });
    }

    openSubscriptionModal() {
        const termYears = this.getTermYears();
        if (this.subscriptionPeriods.length >= termYears && termYears > 0) {
            alert('You must change the term end date to create new period');
            return;
        }
        this.isSubscriptionModalOpen = true;
    }

    closeSubscriptionModal() {
        this.isSubscriptionModalOpen = false;
    }

    onSubscriptionPeriodsCreated(frequency: string) {
        if (!this.startDate || !this.termEndDate) {
            // If dates are not set, just add one period or alert
            if (!this.startDate) {
                alert('Please select a Start Date first.');
                this.closeSubscriptionModal();
                return;
            }
            // If end date missing, maybe just add one year
        }

        const totalStart = this.parseDate(this.startDate);
        const totalEnd = this.termEndDate ? this.parseDate(this.termEndDate) : new Date(totalStart.getFullYear() + 1, totalStart.getMonth(), totalStart.getDate() - 1);

        if (totalStart > totalEnd) {
            this.addOnePeriod(this.startDate, this.termEndDate || this.toIsoDateString(totalEnd));
            this.closeSubscriptionModal();
            return;
        }

        if (frequency === 'Custom') {
            this.addOnePeriod(this.startDate, this.termEndDate || '');
        } else {
            this.subscriptionPeriods = [];
            let currentStart = new Date(totalStart);
            let pIndex = 1;

            while (currentStart <= totalEnd) {
                let nextStart = new Date(currentStart);
                if (frequency === 'Yearly') nextStart.setFullYear(nextStart.getFullYear() + 1);
                else if (frequency === 'Quarterly') nextStart.setMonth(nextStart.getMonth() + 3);
                else if (frequency === 'Monthly') nextStart.setMonth(nextStart.getMonth() + 1);
                else break; // Should not happen

                let periodEnd = new Date(nextStart);
                periodEnd.setDate(periodEnd.getDate() - 1);

                if (periodEnd > totalEnd) {
                    periodEnd = new Date(totalEnd);
                }

                this.addPeriodItem(pIndex++, currentStart, periodEnd);

                currentStart = nextStart;
                if (currentStart > totalEnd) break;
                if (pIndex > 50) break; // Safety
            }
            // Trigger ID mapping
            this.loadBundleDetails();
        }

        // Call Dynamic APIs as requested by user on "Create"
        const sfQuoteId = this.salesforceQuoteId;
        if (sfQuoteId) {
            console.log('🔄 Fetching Quote Line Items and Relationship Types...', { sfQuoteId });
            forkJoin({
                qlItems: this.sfApi.getQuoteLineItems(sfQuoteId),
                prType: this.sfApi.getProductRelationshipType()
            }).subscribe({
                next: (results: any) => {
                    console.log('✅ APIs Fetched Successfully on Create:', results);

                    // Store Quote Line Items (IDs)
                    if (results.qlItems && results.qlItems.records) {
                        this.existingQuoteLineItems = results.qlItems.records;
                    }

                    // Store Product Relationship Type ID
                    if (results.prType && results.prType.records && results.prType.records.length > 0) {
                        this.productRelationshipTypeId = results.prType.records[0].Id;
                    }

                    this.closeSubscriptionModal();
                },
                error: (err) => {
                    console.error('❌ Error fetching dynamic APIs on create:', err);
                    this.closeSubscriptionModal();
                }
            });
        } else {
            this.closeSubscriptionModal();
        }
    }

    addOnePeriod(start: string, end: string) {
        this.addPeriodItem(this.subscriptionPeriods.length + 1, new Date(start), end ? new Date(end) : null);
    }

    addPeriodItem(index: number, start: Date, end: Date | null) {
        this.subscriptionPeriods.push({
            id: Math.random().toString(36).substr(2, 9),
            name: `Period ${index}`,
            productCategory: 'Platform',
            productName: '',
            startDate: this.toIsoDateString(start),
            endDate: end ? this.toIsoDateString(end) : '',
            discount: null,
            unitPrice: null,
            nonProdPrice: null,
            isExpanded: true,
            userRows: this.getDefaultUserRows()
        });
    }

    private getDefaultUserRows() {
        return [
            { type: 'Viewer', price: this.viewerUserPrice, frequency: 'Year', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null },
            { type: 'Standard', price: this.standardUserPrice, frequency: 'Year', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null },
            { type: 'Developer', price: this.developerUserPrice, frequency: 'Year', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null },
            { type: 'Non-prod', price: 0, frequency: 'Year', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null }
        ];
    }

    private getTermYears(): number {
        if (!this.startDate || !this.termEndDate) return 0;
        try {
            const start = this.parseDate(this.startDate);
            const end = this.parseDate(this.termEndDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
            let months = (end.getFullYear() - start.getFullYear()) * 12;
            months += end.getMonth() - start.getMonth();
            if (end.getDate() < start.getDate()) months--;
            return Math.ceil((months + 1) / 12);
        } catch (e) { return 0; }
    }

    private parseDate(dateStr: string): Date {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    private toIsoDateString(date: Date): string {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    calculateMonths(start: string, end: string): number {
        if (!start || !end) return 0;
        const s = new Date(start);
        const e = new Date(end);
        const diff = e.getTime() - s.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24 * 30.44));
    }

    calculatePeriodTotal(p: SubscriptionPeriod): number {
        let total = 0;
        if (p.unitPrice && p.productName) {
            total += p.unitPrice * (1 - (p.discount || 0) / 100);
        }
        p.userRows.forEach(r => {
            if (r.price && r.quantity) {
                total += (r.price * r.quantity) * (1 - (r.discount || 0) / 100);
            }
        });
        return total;
    }

    // Expose quote ID for template access
    get salesforceQuoteId(): string | null | undefined {
        return this.contextService.currentContext?.quoteId;
    }

    get isLookerSubscription(): boolean {
        // Check for specific Looker New RCA Product ID OR Name containing 'Looker'
        return this.productId === '01tDz00000Ea17zIAB' || (this.productName ? this.productName.includes('Looker') : false);
    }

    ngOnInit() {
        const now = Date.now();
        if (now - QuoteDetailsComponent.lastInitTime < 500) {
            console.warn('⚠️ [QuoteDetails] Duplicate Init detected within 500ms! Skipping execution.');
            return;
        }
        QuoteDetailsComponent.lastInitTime = now;

        // Subscribe to QuoteDataService for API-fetched data
        this.quoteDataService.quoteData$.subscribe(quoteData => {
            if (quoteData.opportunityName) {
                this.opportunityName = quoteData.opportunityName;
            }
            if (quoteData.accountName) {
                this.accountName = quoteData.accountName;
            }
            if (quoteData.quoteId) {
                this.contextService.updateContext({ quoteId: quoteData.quoteId });
            }
            if (quoteData.quoteNumber) {
                this.quoteId = quoteData.quoteNumber;
            }
            if (quoteData.primaryContactName) {
                this.primaryContactName = quoteData.primaryContactName;
            }
            if (quoteData.salesChannel) {
                this.salesChannel = quoteData.salesChannel;
            }
            if (quoteData.website) {
                this.website = quoteData.website;
            }
        });

        // Fetch Quote Details if quoteId is available
        const quoteId = this.contextService.currentContext?.quoteId;
        if (quoteId && quoteId.startsWith('0Q0')) {
            // Use getQuotePreview because it contains line items and headers in one SOQL call
            this.sfApi.getQuotePreview(quoteId).subscribe({
                next: (res) => {
                    if (res.records && res.records.length > 0) {
                        const quote = res.records[0];

                        // Set Quote Number
                        if (quote.QuoteNumber) {
                            const formatted = `Q-${quote.QuoteNumber}`;
                            this.quoteDataService.setQuoteData({ quoteNumber: formatted });
                            this.quoteId = formatted;
                        }

                        // Set Website from Account (via Quote Preview)
                        if (quote.Account && quote.Account.Website) {
                            this.website = quote.Account.Website;
                        }

                        // Set Product Name (from first line item)
                        if (quote.QuoteLineItems?.records?.length > 0) {
                            const lineItem = quote.QuoteLineItems.records[0];
                            this.productName = lineItem.Product2?.Name || 'Product';
                            // Save Product ID for configuration calls
                            this.productId = lineItem.Product2Id || lineItem.Product2?.Id;
                            // Save Line Item ID as parent for relationships
                            this.bundleQuoteLineId = lineItem.Id;
                        } else {
                            this.productName = 'No Products';
                            this.productId = null;
                            this.bundleQuoteLineId = null;
                        }
                    }
                    this.isLoading = false; // Data loaded
                },
                error: (err) => {
                    /* Handle error silently or simplistic alert if needed */
                    this.isLoading = false; // Stop loading on error
                }
            });
        } else {
            this.isLoading = false; // No valid quote ID, stop loading
        }

        // Keep existing context service subscription for backward compatibility
        this.contextService.context$.subscribe(ctx => {
            // Only use context values if not already set by QuoteDataService
            if (!this.accountName) this.accountName = ctx.accountName;
            if (!this.opportunityName) this.opportunityName = ctx.opportunityName;
            this.website = ctx.website;
            this.primaryContactName = ctx.primaryContactName;
            this.salesChannel = ctx.salesChannel;
            this.quoteId = ctx.quoteId || 'Q-1234';
            this.isGCP = !!ctx.isGCPFamily;
            this.isGCP = !!ctx.isGCPFamily;
        });

        // Load mock bundle details for Looker flows
        this.loadBundleDetails();

        // Load Picklist Values
        this.loadTermStartsOnFromAPI();
        this.loadBillingFrequencyFromAPI();
        this.loadOperationTypeFromAPI();
        this.loadLookerRegionFromAPI();
    }

    loadLookerRegionFromAPI() {
        // Using Master Record Type ID: 012000000000000AAA
        const recordTypeId = '012000000000000AAA';
        this.sfApi.getRegionPicklist(recordTypeId).subscribe({
            next: (data) => {
                if (data && data.values) {
                    this.lookerRegionOptions = data.values.map((v: any) => v.label);
                }
            },
            error: (err) => {
                console.error('Error loading Looker Region:', err);
                // Fallback is already handled in service or we can keep defaults
            }
        });
    }

    loadOperationTypeFromAPI() {
        const recordTypeId = '012000000000000AAA';
        this.sfApi.getOperationTypePicklist(recordTypeId).subscribe({
            next: (data) => {
                if (data && data.values) {
                    this.operationTypeOptions = data.values.map((v: any) => v.label);
                    // Set default if not set
                    if (!this.operationType && data.defaultValue) {
                        this.operationType = data.defaultValue.label;
                    } else if (!this.operationType && this.operationTypeOptions.length > 0) {
                        this.operationType = this.operationTypeOptions[0];
                    }
                }
            },
            error: (err) => console.error('Error loading Operation Type:', err)
        });
    }

    loadBillingFrequencyFromAPI() {
        const recordTypeId = '012000000000000AAA';
        this.sfApi.getBillingFrequencyPicklist(recordTypeId).subscribe({
            next: (data) => {
                if (data && data.values) {
                    this.billingFrequencyOptions = data.values
                        .map((v: any) => v.label)
                        .filter((label: string) => label !== 'None');

                    // Priority 1: User specified target (Annual in Advance Anniversary)
                    const targetDefault = 'Annual in Advance Anniversary';
                    const foundDefault = this.billingFrequencyOptions.find(opt => opt.toLowerCase() === targetDefault.toLowerCase());

                    if (foundDefault) {
                        this.billingFrequency = foundDefault;
                    } else if (data.defaultValue && data.defaultValue.label) {
                        this.billingFrequency = data.defaultValue.label;
                    } else if (this.billingFrequencyOptions.length > 0) {
                        this.billingFrequency = this.billingFrequencyOptions[0];
                    }
                }
            },
            error: (err) => console.error('Error loading Billing Frequency:', err)
        });
    }

    loadTermStartsOnFromAPI() {
        const recordTypeId = '012000000000000AAA';
        this.sfApi.getTermStartsOnPicklist(recordTypeId).subscribe({
            next: (data) => {
                if (data && data.values) {
                    this.termStartsOnOptions = data.values.map((v: any) => v.label);

                    if (data.defaultValue && data.defaultValue.label) {
                        this.termStartsOn = data.defaultValue.label;
                    } else if (!this.termStartsOn && this.termStartsOnOptions.length > 0) {
                        this.termStartsOn = this.termStartsOnOptions[0];
                    }
                }
            },
            error: (err) => console.error('Error loading Term Starts On:', err)
        });
    }



    submitQuote() {
        const fullQuoteId = this.contextService.currentContext?.quoteId;

        // "if not select dont call the api" - as per user requirement
        if (!this.startDate || !this.expirationDate || !fullQuoteId) {
            this.showSuccessPopup = true;
            return;
        }

        this.isSaving = true;
        this.loadingService.show();

        // Use patchQuoteDates directly
        this.sfApi.patchQuoteDates(
            fullQuoteId,
            this.startDate,
            this.expirationDate
        ).subscribe({
            next: (res) => {
                this.isSaving = false;
                this.loadingService.hide();
                this.showSuccessPopup = true;
            },
            error: (err) => {
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Failed to update quote dates.', 'error');
                console.error('[QuoteDetails] Error:', err);
                // Still show popup on error? Maybe not, allow retry.
                // this.showSuccessPopup = true; 
            }
        });
    }

    openPreview() {
        const fullQuoteId = this.contextService.currentContext?.quoteId;
        if (!fullQuoteId) {
            this.toastService.show('Quote ID not found', 'error');
            return;
        }

        if (!this.startDate) {
            this.toastService.show('Please select a start date first', 'warning');
            return;
        }

        // update dates first so preview is accurate
        this.loadingService.show();
        this.sfApi.patchQuoteDates(fullQuoteId, this.startDate, this.expirationDate || this.startDate).subscribe({
            next: () => {
                // Fetch existing quote data for the preview
                this.fetchQuotePreview(fullQuoteId);
            },
            error: (err) => {
                this.loadingService.hide();
                this.toastService.show('Failed to update quote dates for preview', 'error');
            }
        });

        // Build commitment preview data from current form state
        this.previewCommitments = this.buildPreviewCommitments();
    }

    /**
     * Builds commitment preview data for display
     */
    buildPreviewCommitments(): any[] {
        // For Looker Subscription Flow, use subscriptionPeriods
        if (this.isLookerSubscription && this.subscriptionPeriods.length > 0) {
            return this.buildSubscriptionPreview();
        }

        // Default to today if start date is not set, so preview still works
        const start = this.startDate ? new Date(this.startDate) : new Date();
        const previews: any[] = [];
        let currentStartDate = new Date(start);

        this.commitmentPeriods.forEach((period, index) => {
            const months = parseInt(period.months) || 0;
            const amount = Number(period.amount) || 0;

            if (months > 0) {
                const endDate = new Date(currentStartDate);
                endDate.setMonth(endDate.getMonth() + months);
                endDate.setDate(endDate.getDate() - 1);

                previews.push({
                    name: `Commitment period ${index + 1}`,
                    startDate: this.formatDateForDisplay(currentStartDate),
                    endDate: this.formatDateForDisplay(endDate),
                    months: months,
                    amount: amount
                });

                currentStartDate = new Date(endDate);
                currentStartDate.setDate(currentStartDate.getDate() + 1);
            }
        });

        return previews;
    }

    /**
     * Builds subscription period preview data for Looker flow
     */
    buildSubscriptionPreview(): any[] {
        const previews: any[] = [];

        this.subscriptionPeriods.forEach((period, index) => {
            // Calculate total amount for this period from all user types
            let totalAmount = 0;
            const userDetails: any[] = [];

            period.userRows.forEach((userRow: any) => {
                const qty = userRow.quantity || 0;
                const price = userRow.price || 0;
                const userTotal = qty * price;
                totalAmount += userTotal;

                if (qty > 0) {
                    userDetails.push({
                        type: userRow.type,
                        quantity: qty,
                        price: price,
                        total: userTotal
                    });
                }
            });

            // Also add non-prod price if available
            if (period.nonProdPrice) {
                totalAmount += period.nonProdPrice;
                userDetails.push({
                    type: 'Non-Prod',
                    quantity: 1,
                    price: period.nonProdPrice,
                    total: period.nonProdPrice
                });
            }

            previews.push({
                name: `Period ${index + 1} - ${period.name}`,
                startDate: this.formatDateForDisplay(new Date(period.startDate)),
                endDate: this.formatDateForDisplay(new Date(period.endDate)),
                months: this.calculateMonthsBetween(period.startDate, period.endDate),
                amount: totalAmount,
                userDetails: userDetails // Include user details for expanded view
            });
        });

        return previews;
    }

    /**
     * Calculate months between two dates
     */
    calculateMonthsBetween(startDate: string, endDate: string): number {
        const start = new Date(startDate);
        const end = new Date(endDate);

        let months = (end.getFullYear() - start.getFullYear()) * 12;
        months += end.getMonth() - start.getMonth();

        // Add 1 to include both start and end months
        return months + 1;
    }

    fetchQuotePreview(quoteId: string) {
        this.loadingService.show();
        this.sfApi.getQuotePreview(quoteId).subscribe({
            next: (response) => {
                if (response.records && response.records.length > 0) {
                    this.previewData = response.records[0];
                    this.showPreviewPopup = true;
                }
                this.loadingService.hide();
            },
            error: (err) => {
                this.loadingService.hide();
                this.toastService.show('Failed to load quote preview', 'error');
            }
        });
    }

    getProductIcon(): string {
        const name = this.productName.toLowerCase();
        if (name.includes('cloud') || name.includes('gcp')) {
            return 'https://www.gstatic.com/images/branding/product/2x/cloud_64dp.png';
        } else if (name.includes('maps')) {
            return 'https://www.gstatic.com/images/branding/product/2x/maps_64dp.png';
        } else if (name.includes('workspace')) {
            return 'https://www.gstatic.com/images/branding/product/2x/workspace_64dp.png';
        } else if (name.includes('chrome')) {
            return 'https://www.gstatic.com/images/branding/product/2x/chrome_64dp.png';
        }
        // Default G Icon
        return 'https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg';
    }

    closePreview() {
        this.showPreviewPopup = false;
        this.previewData = null;
    }

    /**
     * Captures a screenshot of the preview popup before showing the success popup
     */
    capturePreviewScreenshot() {
        const fullQuoteId = this.salesforceQuoteId;
        if (!fullQuoteId) {
            // If no quote ID, just show success popup without screenshot
            this.showSuccessPopup = true;
            return;
        }

        // Build commitment preview data
        this.previewCommitments = this.buildPreviewCommitments();

        // Fetch quote preview data
        this.loadingService.show();
        this.sfApi.getQuotePreview(fullQuoteId).subscribe({
            next: (response) => {
                if (response.records && response.records.length > 0) {
                    this.previewData = response.records[0];

                    // Set flag to render preview off-screen
                    this.isCapturingScreenshot = true;
                    // Show preview popup off-screen for screenshot
                    this.showPreviewPopup = true;

                    // Wait for DOM to render, then capture screenshot
                    setTimeout(() => {
                        const previewElement = document.querySelector('.bg-white.rounded-2xl.shadow-2xl.max-w-7xl') as HTMLElement;

                        if (previewElement) {
                            html2canvas(previewElement, {
                                scale: 2,
                                logging: false,
                                useCORS: true,
                                backgroundColor: '#ffffff'
                            }).then(canvas => {
                                // Convert canvas to base64 image
                                this.previewScreenshot = canvas.toDataURL('image/png');

                                // Hide preview popup and reset flag
                                this.showPreviewPopup = false;
                                this.isCapturingScreenshot = false;
                                this.loadingService.hide();

                                // Show success popup with screenshot
                                this.showSuccessPopup = true;
                            }).catch(err => {
                                console.error('Screenshot capture failed:', err);
                                this.showPreviewPopup = false;
                                this.isCapturingScreenshot = false;
                                this.loadingService.hide();
                                this.showSuccessPopup = true;
                            });
                        } else {
                            console.warn('Preview element not found for screenshot');
                            this.showPreviewPopup = false;
                            this.isCapturingScreenshot = false;
                            this.loadingService.hide();
                            this.showSuccessPopup = true;
                        }
                    }, 100); // Wait 100ms for rendering
                } else {
                    this.loadingService.hide();
                    this.showSuccessPopup = true;
                }
            },
            error: (err) => {
                console.error('Failed to load quote preview for screenshot:', err);
                this.loadingService.hide();
                this.showSuccessPopup = true;
            }
        });
    }

    // UI Helpers
    primaryContactOptions = ['Yin Jye Lee', 'Sarah Connor', 'John Doe'];
    salesChannelOptions = ['Partner', 'Direct', 'Reseller'];
    primaryContactOpen = false;
    salesChannelOpen = false;

    selectContact(contact: string) {
        this.primaryContactName = contact;
        this.primaryContactOpen = false;
    }

    selectChannel(channel: string) {
        this.salesChannel = channel;
        this.salesChannelOpen = false;
    }

    formatCurrency(value: any): string {
        if (value === null || value === undefined || value === '') return '$0.00';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
    }

    get totalTerms(): number {
        if (this.activeTab === 'discounts' && this.isLookerSubscription) { // Using 'discounts' as the tab name for 'Plans & Discounts'
            // If we are in the subscription flow, calculate from periods
            if (this.subscriptionPeriods.length > 0) {
                // Sum of all period durations? Or just total duration?
                // Usually term is start of first to end of last
                // Implementation assumes periods fill the term
                return this.getTermYears() * 12; // Approximation or sum of months
            }
        }
        return this.commitmentPeriods.reduce((acc, curr) => acc + (parseInt(curr.months) || 0), 0);
    }

    get totalContractValue(): number {
        if (this.activeTab === 'discounts' && this.isLookerSubscription) {
            return this.subscriptionPeriods.reduce((sum, p) => sum + this.calculatePeriodTotal(p), 0);
        }
        return this.commitmentPeriods.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    }

    /**
     * Builds commitment records array for API submission
     * Calculates start and end dates dynamically based on periods
     */
    buildCommitmentRecords(quoteId: string, quoteLineItemId: string): any[] {
        if (!this.startDate) {
            console.warn('[QuoteDetails] Start date not set, cannot build commitments');
            return [];
        }

        const records: any[] = [];
        // Parse start date as UTC
        const parts = this.startDate.split('-');
        let currentStartDate = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));

        this.commitmentPeriods.forEach((period, index) => {
            const months = parseInt(period.months) || 0;
            const amount = Number(period.amount) || 0;

            if (months > 0) {
                // Calculate end date by adding months to current start date (in UTC)
                const endDate = new Date(currentStartDate);
                endDate.setUTCMonth(endDate.getUTCMonth() + months);
                endDate.setUTCDate(endDate.getUTCDate() - 1); // End date is one day before next period starts

                records.push({
                    attributes: {
                        type: 'Commitment_Details__c',
                        referenceId: `ref${index + 1}`
                    },
                    Name: `CommitPeriod${index + 1}`,
                    Periods_Months__c: months.toString(),
                    Quote__c: quoteId,
                    Quote_Line_Item__c: quoteLineItemId,
                    Start_Date__c: this.formatDateForSalesforce(currentStartDate),
                    End_Date__c: this.formatDateForSalesforce(endDate),
                    Commit_Amount__c: amount.toString()
                });

                // Next period starts where this one ended + 1 day
                currentStartDate = new Date(endDate);
                currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1);
            }
        });

        return records;
    }

    /**
     * Formats a Date object to Salesforce date format (YYYY-MM-DD)
     */
    formatDateForSalesforce(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Main save handler for "Skip and Save" button
     * Intelligently routes to subscription or commit flow based on product type
     */
    onSkipAndSave() {
        const fullQuoteId = this.contextService.currentContext?.quoteId;
        if (!fullQuoteId) {
            this.toastService.show('Quote ID not found', 'error');
            return;
        }

        if (!this.startDate) {
            this.toastService.show('Please select a start date first', 'warning');
            return;
        }

        // Route to appropriate flow based on product type
        if (this.isLookerSubscription && this.subscriptionPeriods.length > 0) {
            // Execute subscription flow for Looker New RCA
            console.log('[QuoteDetails] Executing subscription flow');
            this.onSave();
        } else if (this.commitmentPeriods.length > 0 && this.commitmentPeriods[0].months) {
            // Execute traditional commit flow for other products
            console.log('[QuoteDetails] Executing commit flow');
            this.executeCommitFlow();
        } else {
            this.toastService.show('Please configure periods before saving', 'warning');
        }
    }

    /**
     * Executes traditional commit flow for non-subscription products
     * Based on reference implementation
     */
    executeCommitFlow() {
        const fullQuoteId = this.contextService.currentContext?.quoteId;
        if (!fullQuoteId) {
            this.toastService.show('Quote ID not found', 'error');
            return;
        }

        this.loadingService.show();

        // Step 1: Fetch QuoteLineItems first to get their IDs
        this.sfApi.getQuoteLineItems(fullQuoteId).pipe(
            switchMap((lineItemsResponse: any) => {
                // Extract QuoteLineItem IDs and build the array
                const quoteLineItems: Array<{ id: string, commitmentAmount: number }> = [];

                if (lineItemsResponse.records && lineItemsResponse.records.length > 0) {
                    const firstLineItem = lineItemsResponse.records[0];
                    const firstLineItemId = firstLineItem.Id;
                    console.log('[QuoteDetails] First QuoteLineItem ID:', firstLineItemId);
                    this.bundleQuoteLineId = firstLineItemId;

                    // Add to quoteLineItems array for updateQuoteDates
                    quoteLineItems.push({
                        id: firstLineItemId,
                        commitmentAmount: this.totalContractValue
                    });
                } else {
                    throw new Error('No QuoteLineItems found');
                }

                // Step 2: Update Quote and QuoteLineItems together (if dates are set)
                if (this.startDate && this.expirationDate) {
                    return this.sfApi.updateQuoteDates(
                        fullQuoteId,
                        this.startDate,
                        this.expirationDate,
                        this.totalTerms,
                        this.totalContractValue,
                        quoteLineItems
                    ).pipe(
                        map(() => lineItemsResponse) // Pass lineItemsResponse to next step
                    );
                } else {
                    // If no dates, skip update and just return lineItemsResponse
                    return of(lineItemsResponse);
                }
            }),
            switchMap((lineItemsResponse: any) => {
                // Step 3: Build commitment records
                const firstLineItemId = lineItemsResponse.records[0].Id;
                const commitmentRecords = this.buildCommitmentRecords(fullQuoteId, firstLineItemId);

                if (commitmentRecords.length > 0) {
                    console.log('[QuoteDetails] Creating commitments:', commitmentRecords);
                    // Step 4: Create commitments
                    return this.sfApi.createQuoteLineCommitments(commitmentRecords);
                } else {
                    return new Observable(observer => {
                        observer.next({ success: true, message: 'No commitments to create' });
                        observer.complete();
                    });
                }
            })
        ).subscribe({
            next: (commitmentResponse: any) => {
                console.log('[QuoteDetails] Commitments saved:', commitmentResponse);
                this.loadingService.hide();
                this.toastService.show('Quote Data Saved Successfully!', 'success');
                // Capture screenshot and show success popup
                this.capturePreviewScreenshot();
            },
            error: (err) => {
                this.loadingService.hide();
                this.toastService.show('Failed to save quote', 'error');
                console.error('[QuoteDetails] Error:', err);
            }
        });
    }



    addPeriod() {
        if (this.commitmentPeriods.length < 5) {
            this.commitmentPeriods.push({ months: null, amount: null, isCollapsed: false });
            this.updateExpirationDate();
        }
    }

    removePeriod() {
        if (this.commitmentPeriods.length > 1) {
            this.commitmentPeriods.pop();
            this.updateExpirationDate();
        }
    }

    toggleEdit(index: number) {
        this.commitmentPeriods[index].isCollapsed = !this.commitmentPeriods[index].isCollapsed;
    }

    duplicatePeriod(index: number) {
        if (this.commitmentPeriods.length >= 5) return;
        const org = this.commitmentPeriods[index];
        this.commitmentPeriods.push({ ...org, isDuplicated: true });
        this.activeMenuIndex = null;
        this.updateExpirationDate();
    }

    /**
     * Formats a date string (YYYY-MM-DD) to readable format (Month Day, Year)
     * Used for preview display only
     */
    formatDateForDisplay(dateString: any): string {
        if (!dateString) return '-';
        const date = new Date(dateString);
        // Changed to M/d/yyyy format as requested
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    }

    deletePeriod(index: number) {
        if (this.commitmentPeriods.length > 1) {
            this.commitmentPeriods.splice(index, 1);
            this.activeMenuIndex = null;
            this.updateExpirationDate();
        }
    }

    toggleMenu(index: number, event: Event) {
        event.stopPropagation();
        this.activeMenuIndex = this.activeMenuIndex === index ? null : index;
    }

    @HostListener('document:click')
    closeMenu() {
        this.activeMenuIndex = null;
        this.primaryContactOpen = false;
        this.salesChannelOpen = false;
    }

    checkCollapse(index: number, event: FocusEvent) {
        // Simple blur logic
    }

    // Input handlers for commitment periods
    onMonthFocus(index: number, el: HTMLElement) { }
    onMonthBlur(index: number, el: HTMLElement) {
        const val = (el as HTMLInputElement).value;
        this.commitmentPeriods[index].months = val.replace(/[^0-9]/g, '');
        this.updateExpirationDate();
    }
    onMonthInput(index: number, val: string) { }

    updateExpirationDate() {
        // If it's a subscription flow, handle term end date differently if needed
        // For now, reuse the same logic or add specific subscription logic
        if (!this.startDate) {
            this.expirationDate = '';
            this.termEndDate = '';
            return;
        }

        const totalMonths = this.totalTerms;
        // If no commitment periods (subscription flow might just use term length), default to 12 or use a specific field
        // For Looker Subscription, if we use the same commitment structure
        if (totalMonths <= 0 && !this.isLookerSubscription) {
            this.expirationDate = '';
            return;
        }

        // For Looker Subscription, if we assume a standard 12 month term or derived from somewhere else?
        // The screenshot shows "Term", we can probably reuse commitmentPeriods or just a simple term input. 
        // If reusing commitmentPeriods, logic holds.
        // If Looker Subscription is fixed 12 months? 
        // Let's assume for now it uses the same commitment logic for calculation

        const termsToUse = totalMonths > 0 ? totalMonths : 12; // Default to 12 if 0 for subscription?

        // Create date in UTC to avoid timezone issues
        const parts = this.startDate.split('-');
        const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));

        // Add months
        date.setUTCMonth(date.getUTCMonth() + termsToUse);

        // Subtract 1 day to get the end of term (e.g. Jan 1 to Dec 31)
        date.setUTCDate(date.getUTCDate() - 1);

        const isoDate = date.toISOString().split('T')[0];
        // For Looker flow, Term End Date needs to be calculated if not set, 
        // OR if we are getting it from totalTerms.
        // But if we want distinct fields, we should probably set termEndDate here if driven by start+term
        // However, if we allow manual date selection, we might not want to overwrite it always.

        if (!this.isLookerSubscription) {
            this.expirationDate = isoDate;
        } else {
            this.termEndDate = isoDate;
        }
    }

    // New method to calculate term (months) when Start or End date changes manually in Subscription flow
    updateTermFromDates() {
        if (!this.startDate || !this.termEndDate) return;

        const start = new Date(this.startDate);
        const end = new Date(this.termEndDate);

        // Calculate difference in months
        let months = (end.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += end.getMonth();

        // Adjust for days (if end day is less than start day, it's not a full month)
        // Taking a simple approach for now: Round to nearest or just floor
        // Usually Term End = Start + Months - 1 day.
        // So (End + 1 day) - Start

        const endAdjusted = new Date(end);
        endAdjusted.setDate(endAdjusted.getDate() + 1);

        let diffMonths = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());

        if (diffMonths < 1) diffMonths = 1;

        // Update the first commitment period to reflect this term
        if (this.commitmentPeriods.length === 0) {
            this.commitmentPeriods.push({ months: diffMonths, amount: null, isCollapsed: false });
        } else {
            this.commitmentPeriods[0].months = diffMonths;
        }
    }

    onAmountBlur(index: number, val: string) {
        this.commitmentPeriods[index].amount = this.parseShorthandValue(val);
    }

    parseShorthandValue(val: string): number {
        if (!val) return 0;

        let cleaned = val.toLowerCase().replace(/[^0-9.kmb]/g, '');
        if (!cleaned) return 0;

        const lastChar = cleaned.slice(-1);
        let multiplier = 1;

        if (lastChar === 'k') {
            multiplier = 1000;
            cleaned = cleaned.slice(0, -1);
        } else if (lastChar === 'm') {
            multiplier = 1000000;
            cleaned = cleaned.slice(0, -1);
        } else if (lastChar === 'b') {
            multiplier = 1000000000;
            cleaned = cleaned.slice(0, -1);
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

        if (others.length > 0 && others[0] instanceof HTMLElement) {
            others[0].focus();
        } else {
            this.commitmentPeriods[index].isCollapsed = true;
        }
    }

    closePopup() {
        this.showSuccessPopup = false;

        // Clear state
        this.cartService.clearCart();
        this.quoteDataService.clearQuoteData();
        this.resetForm();

        // Redirect to opportunities page
        this.router.navigate(['/']);
    }

    // Dropdown Helpers for Subscription Flow
    selectOperationType(type: string) {
        this.operationType = type;
        this.operationTypeOpen = false;
    }

    selectBillingFrequency(freq: string) {
        this.billingFrequency = freq;
        this.billingFrequencyOpen = false;
    }

    selectTermStartsOn(option: string) {
        this.termStartsOn = option;
        this.termStartsOnOpen = false;
        if (this.isTermStartDateDisabled()) {
            this.startDate = '';
        }
    }

    isTermStartDateDisabled(): boolean {
        if (!this.termStartsOn) return false;
        const val = this.termStartsOn.toLowerCase().replace(/\s/g, '');
        return val === 'uponprovisioning' || val === 'customersignaturedate';
    }

    formatDate(dateStr: string): string {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();

        return `${month} ${day},${year}`;
    }

    // --- SKIP & SAVE IMPLEMENTATION ---

    // --- SAVE IMPLEMENTATION ---

    onSave() {
        console.log('🚀 Initiating Consolidated Quote Update (Graph API)...');
        if (this.isSaving) return;
        this.isSaving = true;
        this.loadingService.show();

        const targetQuoteId = this.salesforceQuoteId;
        if (!targetQuoteId) {
            this.toastService.show('Quote ID not found.', 'error');
            this.isSaving = false;
            this.loadingService.hide();
            return;
        }

        forkJoin({
            lineItemRes: this.sfApi.getQuoteLineItems(targetQuoteId),
            relTypeRes: this.sfApi.getProductRelationshipType()
        }).subscribe({
            next: (data) => {
                const lineItems = data.lineItemRes.records || [];
                const relTypes = data.relTypeRes.recentItems || [];

                // Find the specific relationship type ID
                const bundleRelType = relTypes.find((r: any) => r.Name === 'Bundle to Bundle Component Relationship');
                const relationshipTypeId = bundleRelType ? bundleRelType.Id : '0yoKf0000010wFiIAI';

                console.log(`📦 Found Relationship Type ID: ${relationshipTypeId}`);
                console.log(`📦 Found ${lineItems.length} QuoteLineItems to update.`);

                // Identify Main Line ID
                const bundleProductId = '01tDz00000Ea17zIAB';
                let mainLineId = lineItems.find((item: any) => item.Product2Id === bundleProductId)?.Id || (lineItems.length > 0 ? lineItems[0].Id : '0QLDz000001KGRvOAO');
                console.log(`🎯 Target MainLineId: ${mainLineId}`);

                const records1: any[] = [];
                const firstPeriod = this.subscriptionPeriods[0];

                if (!firstPeriod) {
                    this.isSaving = false;
                    this.loadingService.hide();
                    this.toastService.show('Error: No subscription periods found to sync.', 'error');
                    return;
                }

                // 1. Patch Quote
                const todayStr = new Date().toISOString().split('T')[0];
                const quoteRec: any = {
                    "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId },
                    "Pricebook2Id": "01sf4000003ZgtzAAC",
                    "StartDate": todayStr // Using Today as per reference logic
                };
                if (firstPeriod.endDate) quoteRec["ExpirationDate"] = firstPeriod.endDate;

                records1.push({
                    "referenceId": "refQuote",
                    "record": quoteRec
                });

                // 1.1 Patch Existing Lines
                lineItems.forEach((item: any, index: number) => {
                    const lineUpdate: any = {
                        "attributes": { "type": "QuoteLineItem", "method": "PATCH", "id": item.Id },
                        "Term_Starts_On__c": this.termStartsOn,
                        "Operation_Type__c": this.operationType,
                        "Billing_Frequency__c": this.billingFrequency,
                        "PeriodBoundary": "Anniversary"
                    };

                    // Fix for END_DATE_MISSING:
                    // If this is the main bundle line or any line, we should ensure it has dates if we are setting term fields.
                    // Use the first period's start date and calculate end date based on total term or just 1 year if it's segmented?
                    // Safe bet: Sync it with the Quote's StartDate and either ExpirationDate or specific Term.

                    if (this.startDate) lineUpdate["StartDate"] = this.startDate;

                    // If we have an expiration date (Term End Date), use it. 
                    // Otherwise default to 1 year from start?
                    if (this.expirationDate) {
                        lineUpdate["EndDate"] = this.expirationDate;
                    } else if (firstPeriod.endDate) {
                        lineUpdate["EndDate"] = firstPeriod.endDate;
                    }

                    // Alternatively, add SubscriptionTerm if dates are tricky, but Dates are preferred for alignment.
                    // lineUpdate["SubscriptionTerm"] = 12; 
                    // lineUpdate["SubscriptionTermUnit"] = "Months";

                    records1.push({
                        "referenceId": `refLineUpdate_${index}`,
                        "record": lineUpdate
                    });
                });

                // 2. Add Child Products Logic (Year 1)
                let childIdx = 1;

                // Platform
                const selectedPlatform = this.productOptions.find(p => p.name === firstPeriod.productName);
                if (selectedPlatform && selectedPlatform.productId) {
                    this.addGraphRecords(records1, childIdx++, selectedPlatform, firstPeriod, mainLineId, 1, targetQuoteId, 'NotIncludedInBundlePrice', firstPeriod.discount || 0, '_P1', null, relationshipTypeId);
                }
                // Users
                firstPeriod.userRows.forEach(row => {
                    if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                        const userProduct = this.productOptions.find(p => p.name.includes(row.type));
                        const uProductId = row.productId || (userProduct ? userProduct.productId : null);
                        const uPbeId = (row as any).pricebookEntryId || (userProduct ? userProduct.pricebookEntryId : null);

                        if (uProductId) {
                            const itemWithId = { ...row, productId: uProductId, pricebookEntryId: uPbeId };
                            this.addGraphRecords(records1, childIdx++, itemWithId, firstPeriod, mainLineId, row.quantity || 0, targetQuoteId, 'NotIncludedInBundlePrice', row.discount || 0, '_P1', null, relationshipTypeId);
                        }
                    }
                });
                // Non-Prod
                const nonProdRow = firstPeriod.userRows.find(r => r.type === 'Non-prod');
                if (nonProdRow && (nonProdRow.quantity || 0) > 0 && selectedPlatform?.nonProdProductId) {
                    const matchingItem = {
                        productId: selectedPlatform.nonProdProductId,
                        pricebookEntryId: (selectedPlatform as any).nonProdPricebookEntryId,
                        price: nonProdRow.price || 0
                    };
                    this.addGraphRecords(records1, childIdx++, matchingItem, firstPeriod, mainLineId, nonProdRow.quantity || 0, targetQuoteId, 'NotIncludedInBundlePrice', nonProdRow.discount || 0, '_P1', null, relationshipTypeId);
                }

                const payload1 = {
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
                        "graphId": "insertChildQuoteLine",
                        "records": records1
                    }
                };

                console.log('📡 STEP 1: Sending Child Products Payload:', JSON.stringify(payload1, null, 2));

                this.sfApi.placeGraphRequest(payload1).subscribe({
                    next: (res1: any) => {
                        console.log('✅ STEP 1 Success:', res1);
                        if (this.subscriptionPeriods.length <= 1) {
                            console.log('🛑 Only 1 period detected. Skipping grouping logic.');
                            this.isSaving = false;
                            this.loadingService.hide();
                            this.capturePreviewScreenshot();
                        } else {
                            this.syncRampGroup(firstPeriod, mainLineId, relationshipTypeId);
                        }
                    },
                    error: (err: any) => {
                        console.error('❌ STEP 1 Error:', err);
                        this.isSaving = false;
                        this.loadingService.hide();
                        this.toastService.show('Failed to save Period 1.', 'error');
                    }
                });
            },
            error: (err) => {
                console.error('❌ Error fetching QuoteLineItems:', err);
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Failed to fetch Line Items.', 'error');
            }
        });
    }

    syncRampGroup(period: SubscriptionPeriod, mainLineId: string, relationshipTypeId: string) {
        const targetQuoteId = this.salesforceQuoteId;
        console.log('🚀 Creating Ramp Group for first period...');

        const records2 = [
            {
                "referenceId": "refQuote_Step2",
                "record": { "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId } }
            },
            {
                "referenceId": "refGroup1",
                "record": {
                    "attributes": { "type": "QuoteLineGroup", "method": "POST" },
                    "Name": "Year 1",
                    "QuoteId": targetQuoteId,
                    "IsRamped": true,
                    "SegmentType": "Yearly",
                    "StartDate": period.startDate,
                    "EndDate": period.endDate
                }
            },
            {
                "referenceId": "linkExistingLine",
                "record": {
                    "attributes": { "type": "QuoteLineItem", "method": "PATCH", "id": mainLineId },
                    "QuoteLineGroupId": "@{refGroup1.id}"
                }
            }
        ];
        const payload2 = {
            "groupRampAction": "EditGroup",
            "pricingPref": "System",
            "graph": { "graphId": "updateQuote", "records": records2 }
        };

        console.log('📡 STEP 2: Sending Group Creation Payload:', JSON.stringify(payload2, null, 2));

        this.sfApi.placeGraphRequest(payload2).subscribe({
            next: (res) => {
                console.log('✅ Ramp Group created and line linked successfully:', res);
                this.syncRemainingPeriods(relationshipTypeId);
            },
            error: (err) => {
                console.error('❌ Ramp Group Sync Error:', err);
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Failed to create Year 1 Group.', 'error');
            }
        });
    }

    syncRemainingPeriods(relationshipTypeId: string) {
        if (this.subscriptionPeriods.length <= 1) {
            this.isSaving = false;
            this.loadingService.hide();
            this.capturePreviewScreenshot();
            return;
        }

        const remainingPeriods = this.subscriptionPeriods.slice(1);
        const targetQuoteId = this.salesforceQuoteId || '';
        const bundleProductId = '01tDz00000Ea17zIAB';
        const bundlePBEId = '01uDz00000dqXP8IAM'; // Standard PBE for Looker New RCA

        console.log(`🚀 Starting Sequential Sync for ${remainingPeriods.length} remaining periods...`);

        // Use reduce to execute sequentially
        remainingPeriods.reduce((prev: Observable<any>, period, idx) => {
            return prev.pipe(
                switchMap(() => {
                    const periodNum = idx + 2; // slice(1) starts at index 0 which is actually Period 2
                    console.log(`📡 STEP 3.${idx + 1}: Processing Year ${periodNum}...`);

                    const recordsP: any[] = [];
                    const groupRef = `refRampGroup_P${periodNum}`;
                    const bundleParentRef = `refBundleParent_P${periodNum}`;

                    // A. Quote Patch
                    recordsP.push({
                        "referenceId": `refQuote_P${periodNum}`,
                        "record": { "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId }, "Pricebook2Id": "01sf4000003ZgtzAAC" }
                    });

                    // B. Create Group
                    const groupName = period.name.replace('Period', 'Year');
                    const groupRec: any = {
                        "attributes": { "type": "QuoteLineGroup", "method": "POST" },
                        "QuoteId": targetQuoteId,
                        "Name": groupName,
                        "IsRamped": true,
                        "SegmentType": "Yearly"
                    };
                    if (period.startDate) groupRec["StartDate"] = period.startDate;
                    if (period.endDate) groupRec["EndDate"] = period.endDate;

                    recordsP.push({
                        "referenceId": groupRef,
                        "record": groupRec
                    });

                    // C. Create Bundle Parent
                    const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';
                    const parentRec: any = {
                        "attributes": { "type": "QuoteLineItem", "method": "POST" },
                        "QuoteId": targetQuoteId,
                        "Product2Id": bundleProductId,
                        "PricebookEntryId": bundlePBEId,
                        "Quantity": 1,
                        "BillingFrequency": standardFreq,
                        "Billing_Frequency__c": this.billingFrequency,
                        "Operation_Type__c": this.operationType,
                        "Term_Starts_On__c": this.termStartsOn,
                        "PeriodBoundary": "Anniversary",
                        "QuoteLineGroupId": `@{${groupRef}.id}`
                    };
                    if (period.startDate) parentRec["StartDate"] = period.startDate;
                    if (period.endDate) parentRec["EndDate"] = period.endDate;

                    recordsP.push({
                        "referenceId": bundleParentRef,
                        "record": parentRec
                    });

                    // D. Add Children (Platform & Users)
                    let childIdx = 1;

                    // Platform
                    const selectedPlatform = this.productOptions.find(p => p.name === period.productName);
                    if (selectedPlatform && selectedPlatform.productId) {
                        this.addGraphRecords(recordsP, childIdx++, selectedPlatform, period, `@{${bundleParentRef}.id}`, 1, targetQuoteId, "NotIncludedInBundlePrice", period.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                    }

                    // Users
                    period.userRows.forEach(row => {
                        if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                            this.addGraphRecords(recordsP, childIdx++, row, period, `@{${bundleParentRef}.id}`, row.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", row.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                        }
                    });

                    // Non-Prod
                    const nonProdRow = period.userRows.find(r => r.type === 'Non-prod');
                    if (nonProdRow && (nonProdRow.quantity || 0) > 0 && selectedPlatform?.nonProdProductId) {
                        const matchingItem = {
                            productId: selectedPlatform.nonProdProductId,
                            pricebookEntryId: (selectedPlatform as any).nonProdPricebookEntryId,
                            price: nonProdRow.price || 0
                        };
                        this.addGraphRecords(recordsP, childIdx++, matchingItem, period, `@{${bundleParentRef}.id}`, nonProdRow.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", nonProdRow.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                    }

                    const payloadP = {
                        "save": true,
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
                        "graph": { "graphId": "updateQuote", "records": recordsP }
                    };

                    console.log(`📡 STEP 3.${idx + 1}: Sending Payload for Year ${periodNum}...`);
                    return this.sfApi.placeGraphRequest(payloadP);
                })
            );
        }, of('Start Chain')).subscribe({
            next: (res) => {
                console.log('✅ All Sequential Periods Synced:', res);
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Quote Data Saved Successfully!', 'success');
                // Capture screenshot before showing success popup
                this.capturePreviewScreenshot();
            },
            error: (err) => {
                console.error('❌ Sequential Sync Error:', err);
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Failed to sync remaining periods.', 'error');
            }
        });
    }

    addGraphRecords(records: any[], index: number, item: any, period: SubscriptionPeriod, parentId: string, quantity: number, quoteId: string, pricing: string, discount: number = 0, suffix: string = '', groupId: string | null = null, productRelationshipTypeId: string | null = null) {
        // refIdStr logic to match reference payload naming convention (e.g., refChildQuoteLineItem_P1)
        const refIdStr = index === 1 ? '' : `-${index}`;
        const refId = `refChildQuoteLineItem${suffix}${refIdStr}`;

        const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';

        const record: any = {
            "referenceId": refId,
            "record": {
                "attributes": { "type": "QuoteLineItem", "method": "POST" },
                "QuoteId": quoteId,
                "Product2Id": item.productId,
                "PricebookEntryId": item.pricebookEntryId || '01uDz00000dqXP8IAM',
                "Quantity": quantity,
                // "UnitPrice": item.price || item.unitPrice || 0, // Removed to match reference
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

        records.push(record);

        if (parentId && productRelationshipTypeId) {
            records.push({
                "referenceId": `refRel${suffix}_${index}`, // Updated format to match reference: refRel_P1_1
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

    resetForm() {
        this.startDate = '';
        this.expirationDate = '';
        this.commitmentPeriods = [{ months: null, amount: null, isCollapsed: false }];
        this.activeMenuIndex = null;
    }
}
