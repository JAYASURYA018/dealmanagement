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
    bundleQuoteLineId: string | null = null;
    website: string = '';
    isGCP: boolean = false;

    // Dates
    startDate: string = new Date().toISOString().split('T')[0]; // Default to Today
    expirationDate: string = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    previewCommitments: any[] = [];
    todayDate: Date = new Date(); // Keep for explicit today reference if needed, but startDate is now separate
    minDate: string = new Date().toISOString().split('T')[0];

    // Term Start Date (Separate from Quote Start Date)
    termStartInput: string = '';

    get termStartDate(): string { return this.termStartInput; }
    set termStartDate(val: string) { this.termStartInput = val; }

    // Subscription Flow (Looker New RCA) Properties
    operationType: string = 'New';
    billingFrequency: string = 'Annual in Advance';
    termStartsOn: string = 'Fixed Start Date';

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
    lookerRegionOptions: string[] = ['us-central1', 'europe-west1', 'asia-northeast1'];

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


    switchTab(tab: 'details' | 'discounts') {
        this.activeTab = tab;
    }

    loadBundleDetails() {
        const bundleId = '01tDz00000Ea17zIAB';
        this.loadingService.show();

        this.sfApi.getBundleDetails(bundleId).subscribe({
            next: (data) => {
                console.log('📦 Bundle Details Received:', data);
                // Handle response structure (Connect API sometimes wraps in 'result' or returns directly)
                const result = data.result || data;

                if (result && result.productComponentGroups) {
                    const groups = result.productComponentGroups;


                    const platformGroup = groups.find((g: any) => g.name === 'Platform');
                    const nonProdGroup = groups.find((g: any) => g.name === 'Non-production' || g.name === 'Non-Production');

                    if (platformGroup) {
                        this.productOptions = platformGroup.components.map((c: any) => {
                            const priceObj = (c.prices && c.prices.find((p: any) => p.isDefault || p.isSelected)) || (c.prices && c.prices[0]) || null;
                            const mainPrice = priceObj ? priceObj.price : 0;
                            const frequency = priceObj && priceObj.pricingModel ? priceObj.pricingModel.frequency : 'Year';
                            const pricebookEntryId = priceObj ? priceObj.priceBookEntryId : null;


                            let nonProdPrice = 0;
                            let nonProdProductId = null;
                            let nonProdPricebookEntryId = null;
                            let nonProdProductName = null;
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
                                    nonProdProductId = match.id;
                                    nonProdPricebookEntryId = npPriceObj ? npPriceObj.priceBookEntryId : null;
                                    nonProdProductName = match.name;
                                }
                            }

                            return {
                                category: 'Platform',
                                name: c.name,
                                price: mainPrice,
                                nonProdPrice: nonProdPrice,
                                frequency: frequency,
                                productId: c.id,
                                pricebookEntryId: pricebookEntryId,
                                nonProdProductId: nonProdProductId,
                                nonProdPricebookEntryId: nonProdPricebookEntryId,
                                nonProdProductName: nonProdProductName,
                                startDate: null,
                                endDate: null,
                                billingFrequency: 'Annual',
                                periodBoundary: 'Anniversary',
                                operationType: 'New',
                                termStartsOn: 'Fixed Start Date',
                                subscriptionTermUnit: 'Monthly'
                            };
                        });
                    }


                    const userGroup = groups.find((g: any) => g.name === 'Users');
                    if (userGroup) {
                        userGroup.components.forEach((c: any) => {
                            const priceObj = (c.prices && c.prices.find((p: any) => p.isDefault || p.isSelected)) || (c.prices && c.prices[0]) || null;
                            const price = priceObj ? priceObj.price : 0;
                            const frequency = priceObj && priceObj.pricingModel ? priceObj.pricingModel.frequency : 'Year';
                            const productId = c.productId || c.product2Id || c.id;
                            const pricebookEntryId = priceObj ? priceObj.priceBookEntryId : null;

                            if (c.name.includes('Developer')) {
                                this.developerUserPrice = price;
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
                                        r.name = c.name;
                                    }
                                });
                            });
                        });
                    }


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
        const effectiveStart = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : this.startDate;

        if (!effectiveStart || !this.termEndDate) {
            // If dates are not set, just add one period or alert
            if (!effectiveStart) {
                alert('Please select a Start Date first.');
                this.closeSubscriptionModal();
                return;
            }
            // If end date missing, maybe just add one year
        }

        const totalStart = this.parseDate(effectiveStart);
        const totalEnd = this.termEndDate ? this.parseDate(this.termEndDate) : new Date(totalStart.getFullYear() + 1, totalStart.getMonth(), totalStart.getDate() - 1);

        if (totalStart > totalEnd) {
            this.addOnePeriod(effectiveStart, this.termEndDate || this.toIsoDateString(totalEnd));
            this.closeSubscriptionModal();
            return;
        }

        if (frequency === 'Custom') {
            this.addOnePeriod(effectiveStart, this.termEndDate || '');
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

            this.loadBundleDetails();
        }


        const sfQuoteId = this.salesforceQuoteId;
        if (sfQuoteId) {
            console.log('🔄 Fetching Quote Line Items and Relationship Types...', { sfQuoteId });
            forkJoin({
                qlItems: this.sfApi.getQuoteLineItems(sfQuoteId),
                prType: this.sfApi.getProductRelationshipType()
            }).subscribe({
                next: (results: any) => {
                    console.log('✅ APIs Fetched Successfully on Create:', results);


                    if (results.qlItems && results.qlItems.records) {
                        this.existingQuoteLineItems = results.qlItems.records;
                    }


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
        const startToUse = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : this.startDate;
        if (!startToUse || !this.termEndDate) return 0;
        try {
            const start = this.parseDate(startToUse);
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
        return this.productId === '01tDz00000Ea17zIAB' || (this.productName ? this.productName.includes('Looker') : false);
    }

    ngOnInit() {
        const now = Date.now();
        if (now - QuoteDetailsComponent.lastInitTime < 500) {
            console.warn('⚠️ [QuoteDetails] Duplicate Init detected within 500ms! Skipping execution.');
            return;
        }
        QuoteDetailsComponent.lastInitTime = now;


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

        const quoteId = this.contextService.currentContext?.quoteId;
        if (quoteId && quoteId.startsWith('0Q0')) {
            this.sfApi.getQuotePreview(quoteId).subscribe({
                next: (res) => {
                    if (res.records && res.records.length > 0) {
                        const quote = res.records[0];


                        if (quote.QuoteNumber) {
                            const formatted = `Q-${quote.QuoteNumber}`;
                            this.quoteDataService.setQuoteData({ quoteNumber: formatted });
                            this.quoteId = formatted;
                        }


                        if (quote.Account && quote.Account.Website) {
                            this.website = quote.Account.Website;
                        }

                        if (quote.StartDate) {
                            this.startDate = quote.StartDate;
                        }

                        if (quote.ExpirationDate) {
                            this.expirationDate = quote.ExpirationDate;
                        } else {
                            // Default Expiration Date: Today + 45 days
                            const date = new Date();
                            date.setDate(date.getDate() + 45);
                            this.expirationDate = this.toIsoDateString(date);
                        }


                        if (quote.QuoteLineItems?.records?.length > 0) {
                            const lineItem = quote.QuoteLineItems.records[0];
                            this.productName = lineItem.Product2?.Name || 'Product';
                            this.productId = lineItem.Product2Id || lineItem.Product2?.Id;
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

        this.contextService.context$.subscribe(ctx => {
            if (!this.accountName) this.accountName = ctx.accountName;
            if (!this.opportunityName) this.opportunityName = ctx.opportunityName;
            this.website = ctx.website;
            this.primaryContactName = ctx.primaryContactName;
            this.salesChannel = ctx.salesChannel;
            this.quoteId = ctx.quoteId || 'Q-1234';
            this.isGCP = !!ctx.isGCPFamily;
            this.isGCP = !!ctx.isGCPFamily;
        });

        this.loadBundleDetails();
        this.loadAllPicklists();
    }

    loadAllPicklists() {
        const recordTypeId = '012000000000000AAA';

        this.sfApi.getAllPicklistValues('QuoteLineItem', recordTypeId)
            .subscribe({
                next: (response) => {

                    const picklists = response.picklistFieldValues;

                    this.loadLookerRegion(picklists);
                    this.loadOperationType(picklists);
                    this.loadBillingFrequency(picklists);
                    this.loadTermStartsOn(picklists);

                },
                error: err => console.error('Error loading picklists:', err)
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
            }
            else if (!this.operationType && this.operationTypeOptions.length > 0) {
                this.operationType = this.operationTypeOptions[0];
            }
        }
    }
    loadBillingFrequency(picklists: any) {

        const data = picklists.Billing_Frequency__c;

        if (data?.values) {

            this.billingFrequencyOptions =
                data.values
                    .map((v: any) => v.label);


            if (data.defaultValue?.label) {
                this.billingFrequency = data.defaultValue.label;
            }
            else if (this.billingFrequencyOptions.length > 0) {
                this.billingFrequency = this.billingFrequencyOptions[0];
            }
        }
    }
    loadTermStartsOn(picklists: any) {

        const data = picklists.Term_Starts_On__c;

        if (data?.values) {

            this.termStartsOnOptions =
                data.values.map((v: any) => v.label);

            if (data.defaultValue?.label) {
                this.termStartsOn = data.defaultValue.label;
            }
            else if (!this.termStartsOn && this.termStartsOnOptions.length > 0) {
                this.termStartsOn = this.termStartsOnOptions[0];
            }
        }
    }




    submitQuote() {
        const fullQuoteId = this.contextService.currentContext?.quoteId;

        if (!this.startDate || !this.expirationDate || !fullQuoteId) {
            this.showSuccessPopup = true;
            return;
        }

        this.isSaving = true;
        this.loadingService.show();


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

        this.loadingService.show();
        this.sfApi.patchQuoteDates(fullQuoteId, this.startDate, this.expirationDate || this.startDate).subscribe({
            next: () => {
                this.fetchQuotePreview(fullQuoteId);
            },
            error: (err) => {
                this.loadingService.hide();
                this.toastService.show('Failed to update quote dates for preview', 'error');
            }
        });

        this.previewCommitments = this.buildPreviewCommitments();
    }

    buildPreviewCommitments(): any[] {
        if (this.isLookerSubscription && this.subscriptionPeriods.length > 0) {
            return this.buildSubscriptionPreview();
        }


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

    buildSubscriptionPreview(): any[] {
        const previews: any[] = [];

        this.subscriptionPeriods.forEach((period, index) => {
            const items: any[] = [];

            // 1. Platform (First Row)
            if (period.productName) {
                const discount = period.discount || 0;
                const price = period.unitPrice || 0;
                const total = price * (1 - discount / 100);

                items.push({
                    name: period.productName, // Use actual name without suffix
                    operationType: 'New',
                    quantity: 1,
                    startDate: this.formatDateForDisplay(new Date(period.startDate)),
                    endDate: period.endDate ? this.formatDateForDisplay(new Date(period.endDate)) : '-',
                    // Calculate "12M 0D" roughly or leave as is if not critical
                    orderTerm: this.calculateMonthsBetween(period.startDate, period.endDate) + ' Months',
                    listPrice: price,
                    discount: discount, // Display as %
                    total: total
                });
            }

            // 2. User Rows
            period.userRows.forEach((userRow: any) => {
                const qty = userRow.quantity || 0;

                // Determine price: Use period.nonProdPrice for 'Non-prod' type if available, otherwise row price
                let price = userRow.price || 0;
                if (userRow.type === 'Non-prod' && period.nonProdPrice) {
                    price = period.nonProdPrice;
                }

                // Only show if quantity > 0
                if (qty > 0) {
                    const discount = userRow.discount || 0;
                    const total = (price * qty) * (1 - discount / 100);

                    // Use stored name from Salesforce if available
                    const displayName = userRow.name || `${period.productName || 'Looker'} ${userRow.type} ${userRow.type === 'Non-prod' ? 'Environment' : 'User'}`;

                    items.push({
                        name: displayName,
                        operationType: 'New',
                        quantity: qty,
                        startDate: this.formatDateForDisplay(new Date(period.startDate)),
                        endDate: period.endDate ? this.formatDateForDisplay(new Date(period.endDate)) : '-',
                        orderTerm: this.calculateMonthsBetween(period.startDate, period.endDate) + ' Months',
                        listPrice: price,
                        discount: discount,
                        total: total
                    });
                }
            });


            // Re-evaluating the user row loop to fix price:
            // (Self-correction in thought process)
            // Let's check `items` generation again.

            // Total for period
            const periodTotal = items.reduce((sum, item) => sum + item.total, 0);

            if (items.length > 0) {
                previews.push({
                    name: `Year ${index + 1}`,
                    startDate: this.formatDateForDisplay(new Date(period.startDate)),
                    endDate: this.formatDateForDisplay(new Date(period.endDate)),
                    months: this.calculateMonthsBetween(period.startDate, period.endDate),
                    amount: periodTotal,
                    items: items // Changed from userDetails to items generic list
                });
            }
        });

        return previews;
    }

    calculateMonthsBetween(startDate: string, endDate: string): number {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Add 1 day to end date to make it inclusive (e.g. Feb 19 to Feb 18 is 1 full year)
        const adjustedEnd = new Date(end);
        adjustedEnd.setDate(adjustedEnd.getDate() + 1);

        let months = (adjustedEnd.getFullYear() - start.getFullYear()) * 12;
        months += adjustedEnd.getMonth() - start.getMonth();

        // Adjust if the day of month hasn't reached the start day
        if (adjustedEnd.getDate() < start.getDate()) {
            months--;
        }

        return Math.max(0, months);
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

    capturePreviewScreenshot() {
        const fullQuoteId = this.salesforceQuoteId;
        if (!fullQuoteId) {
            this.showSuccessPopup = true;
            return;
        }

        this.previewCommitments = this.buildPreviewCommitments();
        this.loadingService.show();
        this.sfApi.getQuotePreview(fullQuoteId).subscribe({
            next: (response) => {
                if (response.records && response.records.length > 0) {
                    this.previewData = response.records[0];

                    this.isCapturingScreenshot = true;
                    this.showPreviewPopup = true;

                    setTimeout(() => {
                        const previewElement = document.querySelector('.bg-white.rounded-2xl.shadow-2xl.max-w-7xl') as HTMLElement;

                        if (previewElement) {
                            html2canvas(previewElement, {
                                scale: 2,
                                logging: false,
                                useCORS: true,
                                backgroundColor: '#ffffff'
                            }).then(canvas => {
                                this.previewScreenshot = canvas.toDataURL('image/png');
                                this.showPreviewPopup = false;
                                this.isCapturingScreenshot = false;
                                this.loadingService.hide();
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
        if (this.isLookerSubscription) {
            // Calculate actual months from term start/end for accuracy
            const startToUse = this.termStartInput || this.startDate;
            if (!startToUse || !this.termEndDate) return 0;
            const start = this.parseDate(startToUse);
            const end = this.parseDate(this.termEndDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

            const endAdjusted = new Date(end);
            endAdjusted.setDate(endAdjusted.getDate() + 1);
            let diffMonths = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());
            return Math.max(1, diffMonths);
        }
        return this.commitmentPeriods.reduce((acc, curr) => acc + (parseInt(curr.months) || 0), 0);
    }

    get totalContractValue(): number {
        if (this.activeTab === 'discounts' && this.isLookerSubscription) {
            return this.subscriptionPeriods.reduce((sum, p) => sum + this.calculatePeriodTotal(p), 0);
        }
        return this.commitmentPeriods.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    }

    buildCommitmentRecords(quoteId: string, quoteLineItemId: string): any[] {
        if (!this.startDate) {
            console.warn('[QuoteDetails] Start date not set, cannot build commitments');
            return [];
        }

        const records: any[] = [];
        const parts = this.startDate.split('-');
        let currentStartDate = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));

        this.commitmentPeriods.forEach((period, index) => {
            const months = parseInt(period.months) || 0;
            const amount = Number(period.amount) || 0;

            if (months > 0) {
                const endDate = new Date(currentStartDate);
                endDate.setUTCMonth(endDate.getUTCMonth() + months);
                endDate.setUTCDate(endDate.getUTCDate() - 1);

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

                currentStartDate = new Date(endDate);
                currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1);
            }
        });

        return records;
    }

    formatDateForSalesforce(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

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

        if (this.isLookerSubscription && this.subscriptionPeriods.length > 0) {
            this.onSave();
        } else if (this.commitmentPeriods.length > 0 && this.commitmentPeriods[0].months) {
            this.executeCommitFlow();
        } else {
            this.toastService.show('Please configure periods before saving', 'warning');
        }
    }

    executeCommitFlow() {
        const fullQuoteId = this.contextService.currentContext?.quoteId;
        if (!fullQuoteId) {
            this.toastService.show('Quote ID not found', 'error');
            return;
        }

        this.loadingService.show();

        this.sfApi.getQuoteLineItems(fullQuoteId).pipe(
            switchMap((lineItemsResponse: any) => {
                const quoteLineItems: Array<{ id: string, commitmentAmount: number }> = [];

                if (lineItemsResponse.records && lineItemsResponse.records.length > 0) {
                    const firstLineItem = lineItemsResponse.records[0];
                    const firstLineItemId = firstLineItem.Id;
                    this.bundleQuoteLineId = firstLineItemId;
                    quoteLineItems.push({
                        id: firstLineItemId,
                        commitmentAmount: this.totalContractValue
                    });
                } else {
                    throw new Error('No QuoteLineItems found');
                }


                if (this.startDate && this.expirationDate) {
                    return this.sfApi.updateQuoteDates(
                        fullQuoteId,
                        this.startDate,
                        this.expirationDate,
                        this.totalTerms,
                        this.totalContractValue,
                        quoteLineItems
                    ).pipe(
                        map(() => lineItemsResponse)
                    );
                } else {
                    return of(lineItemsResponse);
                }
            }),
            switchMap((lineItemsResponse: any) => {
                const firstLineItemId = lineItemsResponse.records[0].Id;
                const commitmentRecords = this.buildCommitmentRecords(fullQuoteId, firstLineItemId);

                if (commitmentRecords.length > 0) {
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
                this.loadingService.hide();
                this.toastService.show('Quote Data Saved Successfully!', 'success');
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

    formatDateForDisplay(dateString: any): string {
        if (!dateString) return '-';
        const date = new Date(dateString);
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
        this.operationTypeOpen = false;
        this.billingFrequencyOpen = false;
        this.termStartsOnOpen = false;
    }

    checkCollapse(index: number, event: FocusEvent) { }

    // Input handlers for commitment periods
    onMonthFocus(index: number, el: HTMLElement) { }
    onMonthBlur(index: number, el: HTMLElement) {
        const val = (el as HTMLInputElement).value;
        this.commitmentPeriods[index].months = val.replace(/[^0-9]/g, '');
        this.updateExpirationDate();
    }
    onMonthInput(index: number, val: string) { }

    updateExpirationDate() {
        if (!this.startDate) {
            this.expirationDate = '';
            this.termEndDate = '';
            return;
        }

        if (this.isLookerSubscription) {
            if (!this.termStartInput) return; // Wait for term start
            if (this.termStartInput < this.minDate) {
                this.toastService.show('You cannot select a term start date less than the current date.', 'warning');
                this.termStartInput = this.minDate;
                return;
            }
        } else {
            if (this.startDate && this.startDate < this.minDate) {
                this.toastService.show('Quote Start Date cannot be less than the current date.', 'warning');
                this.startDate = this.minDate;
            }
        }

        const totalMonths = this.totalTerms;
        if (totalMonths <= 0 && !this.isLookerSubscription) {
            this.expirationDate = '';
            return;
        }

        const termsToUse = totalMonths > 0 ? totalMonths : 12;

        const parts = this.startDate.split('-');
        const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        date.setUTCMonth(date.getUTCMonth() + termsToUse);
        date.setUTCDate(date.getUTCDate() - 1);
        const isoDate = date.toISOString().split('T')[0];

        if (!this.isLookerSubscription) {
            this.expirationDate = isoDate;
        } else {
            this.updateTermFromDates();
        }
    }


    updateTermFromDates() {
        if (!this.termStartInput || !this.termEndDate) return;

        const startParts = this.termStartInput.split('-').map(Number);
        const endParts = this.termEndDate.split('-').map(Number);

        const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
        const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

        if (end < start) {
            this.toastService.show('Term End Date cannot be earlier than Term Start Date.', 'warning');
            this.termEndDate = '';
            return;
        }

        // Check if duration > 5 years
        const limitDate = new Date(start);
        limitDate.setFullYear(limitDate.getFullYear() + 5);

        // If end date is strictly after limit date (start + 5 years), then it's > 5 years
        // Example: Start 2026-01-01. Limit 2031-01-01. End 2031-01-02 is > 5 years.
        if (end > limitDate) {
            this.toastService.show('The duration between start and end dates cannot exceed 5 years.', 'warning');
            this.termEndDate = '';
            return;
        }

        // Calculate difference in months
        let months = (end.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += end.getMonth();


        const endAdjusted = new Date(end);
        endAdjusted.setDate(endAdjusted.getDate() + 1);

        let diffMonths = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());

        if (diffMonths < 1) diffMonths = 1;

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
        this.cartService.clearCart();
        this.quoteDataService.clearQuoteData();
        this.resetForm();
        this.router.navigate(['/']);
    }

    // Dropdown Helpers for Subscription Flow
    closeAllDropdowns() {
        this.operationTypeOpen = false;
        this.billingFrequencyOpen = false;
        this.termStartsOnOpen = false;
        this.primaryContactOpen = false;
        this.salesChannelOpen = false;
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

    togglePrimaryContact() {
        const wasOpen = this.primaryContactOpen;
        this.closeAllDropdowns();
        this.primaryContactOpen = !wasOpen;
    }

    toggleSalesChannel() {
        const wasOpen = this.salesChannelOpen;
        this.closeAllDropdowns();
        this.salesChannelOpen = !wasOpen;
    }

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
            this.termStartDate = '';
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

                const bundleRelType = relTypes.find((r: any) => r.Name === 'Bundle to Bundle Component Relationship');
                const relationshipTypeId = bundleRelType ? bundleRelType.Id : '0yoKf0000010wFiIAI';

                const bundleProductId = '01tDz00000Ea17zIAB';
                let mainLineId = lineItems.find((item: any) => item.Product2Id === bundleProductId)?.Id || (lineItems.length > 0 ? lineItems[0].Id : '0QLDz000001KGRvOAO');

                const records1: any[] = [];
                const firstPeriod = this.subscriptionPeriods[0];

                if (!firstPeriod) {
                    this.isSaving = false;
                    this.loadingService.hide();
                    this.toastService.show('Error: No subscription periods found to sync.', 'error');
                    return;
                }

                const todayStr = new Date().toISOString().split('T')[0];
                const firstRegion = firstPeriod.userRows.find((r: any) => r.region)?.region || '';

                const quoteRec: any = {
                    "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId },
                    "Pricebook2Id": "01sf4000003ZgtzAAC",
                    "StartDate": todayStr
                };
                if (this.expirationDate) quoteRec["ExpirationDate"] = this.expirationDate;

                records1.push({
                    "referenceId": "refQuote",
                    "record": quoteRec
                });


                lineItems.forEach((item: any, index: number) => {
                    const lineUpdate: any = {
                        "attributes": { "type": "QuoteLineItem", "method": "PATCH", "id": item.Id },
                        "Term_Starts_On__c": this.termStartsOn,
                        "Operation_Type__c": this.operationType,
                        "Billing_Frequency__c": this.billingFrequency,
                        "SubscriptionTerm": 1,
                        "SubscriptionTermUnit": "Anual",
                        "PeriodBoundary": "Anniversary"
                    };

                    if (this.isLookerSubscription && this.termStartInput) {
                        lineUpdate["StartDate"] = this.termStartInput;
                    } else if (this.startDate) {
                        lineUpdate["StartDate"] = this.startDate;
                    }

                    if (this.isLookerSubscription && firstPeriod.endDate) {
                        lineUpdate["EndDate"] = firstPeriod.endDate;
                    } else if (firstPeriod.endDate) {
                        lineUpdate["EndDate"] = firstPeriod.endDate;
                    }

                    records1.push({
                        "referenceId": `refLineUpdate_${index}`,
                        "record": lineUpdate
                    });
                });

                let childIdx = 1;
                const selectedPlatform = this.productOptions.find(p => p.name === firstPeriod.productName);
                if (selectedPlatform && selectedPlatform.productId) {
                    this.addGraphRecords(records1, childIdx++, selectedPlatform, firstPeriod, mainLineId, 1, targetQuoteId, 'NotIncludedInBundlePrice', firstPeriod.discount || 0, '_P1', null, relationshipTypeId);
                }
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



                console.log('📦 Step 1 Payload (Periods/Lines):', JSON.stringify(payload1, null, 2));
                this.sfApi.placeGraphRequest(payload1).subscribe({
                    next: (res1: any) => {
                        if (this.subscriptionPeriods.length <= 1) {
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

        const records2 = [
            {
                "referenceId": "refQuote_Step2",
                "record": {
                    "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId }
                }
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



        console.log('📦 Step 2 Payload (Ramp Group):', JSON.stringify(payload2, null, 2));
        this.sfApi.placeGraphRequest(payload2).subscribe({
            next: (res) => {
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
        const bundlePBEId = '01uDz00000dqXP8IAM';

        remainingPeriods.reduce((prev: Observable<any>, period, idx) => {
            return prev.pipe(
                switchMap(() => {
                    const periodNum = idx + 2;

                    const recordsP: any[] = [];
                    const groupRef = `refRampGroup_P${periodNum}`;
                    const bundleParentRef = `refBundleParent_P${periodNum}`;

                    recordsP.push({
                        "referenceId": `refQuote_P${periodNum}`,
                        "record": {
                            "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId },
                            "Pricebook2Id": "01sf4000003ZgtzAAC"
                        }
                    });

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
                        "SubscriptionTerm": 1,
                        "SubscriptionTermUnit": "Anual",
                        "PeriodBoundary": "Anniversary",
                        "QuoteLineGroupId": `@{${groupRef}.id}`
                    };
                    if (period.startDate) parentRec["StartDate"] = period.startDate;
                    if (period.endDate) parentRec["EndDate"] = period.endDate;

                    recordsP.push({
                        "referenceId": bundleParentRef,
                        "record": parentRec
                    });

                    let childIdx = 1;
                    const selectedPlatform = this.productOptions.find(p => p.name === period.productName);
                    if (selectedPlatform && selectedPlatform.productId) {
                        this.addGraphRecords(recordsP, childIdx++, selectedPlatform, period, `@{${bundleParentRef}.id}`, 1, targetQuoteId, "NotIncludedInBundlePrice", period.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                    }

                    period.userRows.forEach(row => {
                        if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                            this.addGraphRecords(recordsP, childIdx++, row, period, `@{${bundleParentRef}.id}`, row.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", row.discount || 0, `_P${periodNum}`, `@{${groupRef}.id}`, relationshipTypeId);
                        }
                    });

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


                    console.log(`📦 Payload for Period ${periodNum}:`, JSON.stringify(payloadP, null, 2));
                    return this.sfApi.placeGraphRequest(payloadP);
                })
            );
        }, of('Start Chain')).subscribe({
            next: () => {
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Quote Data Saved Successfully!', 'success');
                this.capturePreviewScreenshot();
            },
            error: (err) => {
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Failed to sync remaining periods.', 'error');
            }
        });
    }

    addGraphRecords(records: any[], index: number, item: any, period: SubscriptionPeriod, parentId: string, quantity: number, quoteId: string, pricing: string, discount: number = 0, suffix: string = '', groupId: string | null = null, productRelationshipTypeId: string | null = null) {
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
                "SubscriptionTerm": 1,
                "SubscriptionTermUnit": "Anual",
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

    resetForm() {
        this.startDate = new Date().toISOString().split('T')[0];
        this.expirationDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        this.commitmentPeriods = [{ months: null, amount: null, isCollapsed: false }];
        this.activeMenuIndex = null;
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
