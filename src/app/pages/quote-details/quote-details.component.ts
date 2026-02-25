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
    private lastValidTermStart: string = '';
    private lastValidTermEnd: string = '';

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
    currentFrequency: string = 'Yearly';
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
                            const priceObj = c.prices ? c.prices.find((p: any) => p.pricingModel?.frequency === 'Months') : null;
                            const mainPrice = priceObj ? priceObj.price : 0;
                            const frequency = priceObj && priceObj.pricingModel ? priceObj.pricingModel.frequency : 'Months';
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
                                    const npPriceObj = match.prices ? match.prices.find((p: any) => p.pricingModel?.frequency === 'Months') : null;
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
                                subscriptionTermUnit: 'Months'
                            };
                        });
                    }


                    const userGroup = groups.find((g: any) => g.name === 'Users');
                    if (userGroup) {
                        userGroup.components.forEach((c: any) => {
                            const priceObj = c.prices ? c.prices.find((p: any) => p.pricingModel?.frequency === 'Months') : null;
                            const price = priceObj ? priceObj.price : 0;
                            const frequency = priceObj && priceObj.pricingModel ? priceObj.pricingModel.frequency : 'Months';
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

    addSubscriptionPeriodDirectly() {
        if (this.subscriptionPeriods.length === 0) {
            if (this.termStartInput && this.termEndDate) {
                this.addOnePeriod(this.termStartInput, this.termEndDate);
                this.onSubscriptionProductChanged();
            } else {
                this.isSubscriptionModalOpen = true;
            }
            return;
        }

        const lastPeriod = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];

        // 1. If previous period end date equals subscription end date
        if (lastPeriod.endDate === this.termEndDate) {
            this.toastService.show('change the subscription end date to create new period', 'warning');
            return;
        }

        // 2. If subscription end date is greater than previous end date but previous duration < 1 year
        if (this.termEndDate && lastPeriod.endDate && lastPeriod.endDate < this.termEndDate) {
            if (lastPeriod.startDate) {
                const term = this.calculateSubscriptionTerm(lastPeriod.startDate, lastPeriod.endDate);
                if (term < 12) {
                    this.toastService.show('you cannot create new period without having previous period with duration exactly 1 year', 'warning');
                    return;
                }
            }
        }

        if (lastPeriod.endDate) {
            const lastEnd = this.parseDate(lastPeriod.endDate);
            const newStart = new Date(lastEnd);
            newStart.setDate(newStart.getDate() + 1);

            const newEnd = new Date(newStart);
            newEnd.setFullYear(newEnd.getFullYear() + 1);
            newEnd.setDate(newEnd.getDate() - 1);

            const newStartIso = this.toIsoDateString(newStart);
            const newEndIso = this.toIsoDateString(newEnd);

            this.addOnePeriod(newStartIso, newEndIso);
            this.onSubscriptionProductChanged();
        }
    }

    removeSubscriptionPeriod(index: number) {
        if (this.subscriptionPeriods.length > 0) {
            this.subscriptionPeriods.splice(index, 1);
            this.onSubscriptionProductChanged();
        }
    }

    closeSubscriptionModal() {
        this.isSubscriptionModalOpen = false;
    }

    onSubscriptionPeriodsCreated(frequency: string) {
        this.currentFrequency = frequency;

        const effectiveStart = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : this.startDate;

        if (!effectiveStart || !this.termEndDate) {
            this.toastService.show('Please select both Subscription Start Date and End Date.', 'warning');
            this.closeSubscriptionModal();
            return;
        }

        const totalStart = this.parseDate(effectiveStart);
        const totalEnd = this.termEndDate ? this.parseDate(this.termEndDate) : new Date(totalStart.getFullYear() + 1, totalStart.getMonth(), totalStart.getDate() - 1);

        if (totalStart > totalEnd) {
            this.addOnePeriod(effectiveStart, this.termEndDate || this.toIsoDateString(totalEnd));
            this.closeSubscriptionModal();
            return;
        }

        if (this.currentFrequency === 'Yearly' && !this.isValidYearlyDuration(effectiveStart, this.termEndDate)) {
            this.toastService.show('Subscription duration should be exactly in years for yearly periods', 'warning');
            this.closeSubscriptionModal();
            return;
        }

        // Capture valid state for future reversions
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

            this.addPeriodItem(pIndex++, currentStart, periodEnd);

            currentStart = nextStart;
            if (currentStart > totalEnd) break;
            if (pIndex > 50) break; // Safety
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

                    this.loadBundleDetails();
                    this.closeSubscriptionModal();
                },
                error: (err) => {
                    console.error('❌ Error fetching dynamic APIs on create:', err);
                    this.loadBundleDetails();
                    this.closeSubscriptionModal();
                }
            });
        } else {
            this.loadBundleDetails();
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
            { type: 'Viewer', price: this.viewerUserPrice, frequency: 'Months', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null },
            { type: 'Standard', price: this.standardUserPrice, frequency: 'Months', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null },
            { type: 'Developer', price: this.developerUserPrice, frequency: 'Months', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null },
            { type: 'Non-prod', price: 0, frequency: 'Months', quantity: 0, region: '', gcpProjectId: '', lookerInstanceId: '', discount: null }
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

    private isValidYearlyDuration(startDate: string, endDate: string): boolean {
        if (!startDate || !endDate) return false;
        const start = this.parseDate(startDate);
        const end = this.parseDate(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

        const checkDate = new Date(start);
        while (checkDate <= end) {
            checkDate.setFullYear(checkDate.getFullYear() + 1);
            const expectedEnd = new Date(checkDate);
            expectedEnd.setDate(expectedEnd.getDate() - 1);
            if (expectedEnd.getTime() === end.getTime()) return true;
            if (expectedEnd > end) break;
        }
        return false;
    }

    private toIsoDateString(date: Date): string {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
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
        return parseFloat((months + (diffDays / daysInMonth)).toFixed(4));
    }
    formatTermDisplay(startDate: string, endDate: string): string {
        if (!startDate || !endDate) return '';
        const start = this.parseDate(startDate);
        const end = this.parseDate(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';

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

        let res = '';
        if (months > 0) res += `${months} month${months > 1 ? 's' : ''} `;
        if (diffDays > 0) res += `${diffDays} day${diffDays > 1 ? 's' : ''}`;
        return res.trim() || '0 months';
    }

    onSubscriptionProductChanged() {
        console.log('🔄 Subscription period changed, refreshing term and totals...');

        // If no periods exist, just track the current dates as the "last valid" state
        if (!this.subscriptionPeriods || this.subscriptionPeriods.length === 0) {
            if (this.termStartInput && this.termEndDate) {
                this.lastValidTermStart = this.termStartInput;
                this.lastValidTermEnd = this.termEndDate;
            }
            return;
        }

        // Strict Yearly Validation for global boundaries
        if (this.currentFrequency === 'Yearly' && this.termStartInput && this.termEndDate) {
            if (!this.isValidYearlyDuration(this.termStartInput, this.termEndDate)) {
                // Duration is invalid (likely in the middle of being edited)
                // We return silently to allow user to continue editing without annoying toasts.
                // Period dates will only ripple once they reach a valid yearly duration.
                return;
            }
        }

        // Passed validation - update last valid global dates
        this.lastValidTermStart = this.termStartInput;
        this.lastValidTermEnd = this.termEndDate;

        const totalEnd = this.termEndDate ? this.parseDate(this.termEndDate) : null;

        // Cascade dates through all periods to maintain yearly structure
        for (let i = 0; i < this.subscriptionPeriods.length; i++) {
            const current = this.subscriptionPeriods[i];

            // 1. Set Start Date
            if (i === 0) {
                // First period locked to global start
                if (this.termStartInput && current.startDate !== this.termStartInput) {
                    current.startDate = this.termStartInput;
                }
            } else {
                // Subsequent periods start day after previous end
                const prev = this.subscriptionPeriods[i - 1];
                if (prev.endDate) {
                    const prevEnd = this.parseDate(prev.endDate);
                    const nextStart = new Date(prevEnd);
                    nextStart.setDate(nextStart.getDate() + 1);
                    const nextStartIso = this.toIsoDateString(nextStart);
                    if (current.startDate !== nextStartIso) {
                        current.startDate = nextStartIso;
                    }
                }
            }

            // 2. Set End Date (Strict 1-year periods, capped by global end if necessary)
            if (current.startDate) {
                const currentStart = this.parseDate(current.startDate);

                // Calculate standard 1-year end date
                const standardEnd = new Date(currentStart);
                standardEnd.setFullYear(standardEnd.getFullYear() + 1);
                standardEnd.setDate(standardEnd.getDate() - 1);

                let targetEnd = standardEnd;

                // Cap at global totalEnd if the global end is earlier than 1 year
                if (totalEnd && totalEnd < standardEnd) {
                    targetEnd = totalEnd;
                }

                const targetEndIso = this.toIsoDateString(targetEnd);
                if (current.endDate !== targetEndIso) {
                    current.endDate = targetEndIso;
                }
            }

            // Sync names
            current.name = `Period ${i + 1}`;
        }
    }

    calculatePeriodTotal(p: SubscriptionPeriod): number {
        let total = 0;
        const term = this.calculateSubscriptionTerm(p.startDate, p.endDate);

        if (p.unitPrice && p.productName) {
            total += (p.unitPrice * term) * (1 - (p.discount || 0) / 100);
        }
        p.userRows.forEach(r => {
            if (r.price && r.quantity) {
                total += (r.price * r.quantity * term) * (1 - (r.discount || 0) / 100);
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
        this.lastValidTermStart = this.termStartInput;
        this.lastValidTermEnd = this.termEndDate;
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
                const term = this.calculateSubscriptionTerm(period.startDate, period.endDate);
                const displayTerm = this.formatTermDisplay(period.startDate, period.endDate);
                const total = (price * term) * (1 - discount / 100);

                items.push({
                    name: period.productName,
                    operationType: 'New',
                    quantity: 1,
                    startDate: this.formatDateForDisplay(new Date(period.startDate)),
                    endDate: period.endDate ? this.formatDateForDisplay(new Date(period.endDate)) : '-',
                    orderTerm: displayTerm,
                    listPrice: price,
                    discount: discount,
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
                    const term = this.calculateSubscriptionTerm(period.startDate, period.endDate);
                    const displayTerm = this.formatTermDisplay(period.startDate, period.endDate);
                    const total = (price * qty * term) * (1 - discount / 100);

                    // Use stored name from Salesforce if available
                    const displayName = userRow.name || `${period.productName || 'Looker'} ${userRow.type} ${userRow.type === 'Non-prod' ? 'Environment' : 'User'}`;

                    items.push({
                        name: displayName,
                        operationType: 'New',
                        quantity: qty,
                        startDate: this.formatDateForDisplay(new Date(period.startDate)),
                        endDate: period.endDate ? this.formatDateForDisplay(new Date(period.endDate)) : '-',
                        orderTerm: displayTerm,
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
                const term = this.calculateSubscriptionTerm(period.startDate, period.endDate);

                previews.push({
                    name: `Year ${index + 1}`,
                    startDate: this.formatDateForDisplay(new Date(period.startDate)),
                    endDate: this.formatDateForDisplay(new Date(period.endDate)),
                    months: term,
                    amount: periodTotal,
                    items: items
                });
            }
        });

        return previews;
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
            // Priority 1: Use the top-level inputs if set, as they define the contract boundaries
            if (this.termStartInput && this.termEndDate) {
                return this.calculateSubscriptionTerm(this.termStartInput, this.termEndDate);
            }
            // Priority 2: Fallback to period boundaries if top-level inputs are missing
            if (this.subscriptionPeriods.length > 0) {
                const first = this.subscriptionPeriods[0];
                const last = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];
                if (first.startDate && last.endDate) {
                    return this.calculateSubscriptionTerm(first.startDate, last.endDate);
                }
            }
            return 0;
        }
        return this.commitmentPeriods.reduce((acc, curr) => acc + (parseInt(curr.months || '0') || 0), 0);
    }

    get totalTermLabel(): string {
        if (this.isLookerSubscription) {
            if (this.termStartInput && this.termEndDate) {
                return this.formatTermDisplay(this.termStartInput, this.termEndDate);
            }
            if (this.subscriptionPeriods.length > 0) {
                const first = this.subscriptionPeriods[0];
                const last = this.subscriptionPeriods[this.subscriptionPeriods.length - 1];
                if (first.startDate && last.endDate) {
                    return this.formatTermDisplay(first.startDate, last.endDate);
                }
            }
            return '0 months';
        }
        return `${this.totalTerms} months`;
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

        if (this.isLookerSubscription && this.termStartInput && this.termEndDate) {
            if (this.currentFrequency === 'Yearly' && !this.isValidYearlyDuration(this.termStartInput, this.termEndDate)) {
                this.toastService.show('Subscription duration must be exactly in years. Please adjust Subscription Dates.', 'warning');
                return;
            }

            // Validate period count vs duration
            const totalMonths = this.calculateSubscriptionTerm(this.termStartInput, this.termEndDate);
            const expectedCount = this.currentFrequency === 'Yearly'
                ? Math.round(totalMonths / 12)
                : Math.ceil(totalMonths / 12);
            const currentPeriods = this.subscriptionPeriods.length;

            if (currentPeriods < expectedCount) {
                const missing = expectedCount - currentPeriods;
                this.toastService.show(`Your subscription duration is ${this.formatTermDisplay(this.termStartInput, this.termEndDate)}. Please add ${missing} more period${missing > 1 ? 's' : ''}.`, 'warning');
                return;
            } else if (currentPeriods > expectedCount) {
                this.toastService.show('Please delete extra periods before saving.', 'warning');
                return;
            }

            // Ensure periods are perfectly synced to these final global dates
            this.onSubscriptionProductChanged();
        }

        if (this.isLookerSubscription && this.subscriptionPeriods.length > 0) {
            const hasMissingProduct = this.subscriptionPeriods.some(p => !p.productName);
            if (hasMissingProduct) {
                this.toastService.show('you should select a platform product for all periods', 'warning');
                return;
            }
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
            this.termEndDate = this.lastValidTermEnd;
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
            const startVal = this.lastValidTermStart;
            const endVal = this.lastValidTermEnd;
            setTimeout(() => {
                this.termStartInput = startVal;
                this.termEndDate = endVal;
            });
            return;
        }

        // Check if duration > 5 years
        const limitDate = new Date(start);
        limitDate.setFullYear(limitDate.getFullYear() + 5);

        // If end date is strictly after limit date (start + 5 years), then it's > 5 years
        // Example: Start 2026-01-01. Limit 2031-01-01. End 2031-01-02 is > 5 years.
        if (end > limitDate) {
            this.toastService.show('The duration between start and end dates cannot exceed 5 years.', 'warning');
            const startVal = this.lastValidTermStart;
            const endVal = this.lastValidTermEnd;
            setTimeout(() => {
                this.termStartInput = startVal;
                this.termEndDate = endVal;
            });
            return;
        }

        // Calculate difference in months
        let months = (end.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += end.getMonth();


        if (this.isLookerSubscription) {
            const fractionalMonths = this.calculateSubscriptionTerm(this.termStartInput, this.termEndDate);
            if (this.commitmentPeriods.length === 0) {
                this.commitmentPeriods.push({ months: fractionalMonths, amount: null, isCollapsed: false });
            } else {
                this.commitmentPeriods[0].months = fractionalMonths;
            }
            this.onSubscriptionProductChanged();
            return;
        }

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
        console.log('🚀 Initiating Consolidated Quote Update (Full Graph API)...');
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
                const bundlePBEId = '01uDz00000dqXP8IAM';
                const mainLineId = lineItems.find((item: any) => item.Product2Id === bundleProductId)?.Id || (lineItems.length > 0 ? lineItems[0].Id : null);

                const records: any[] = [];

                // 1. Quote Update
                const todayStr = new Date().toISOString().split('T')[0];
                const quoteRec: any = {
                    "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId },
                    "Pricebook2Id": "01sf4000003ZgtzAAC",
                    "StartDate": todayStr
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
                    const subTerm = this.calculateSubscriptionTerm(startToUse, firstPeriod.endDate);

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
                    const selectedPlatform = this.productOptions.find(p => p.name === firstPeriod.productName);
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

                        const subTerm = this.calculateSubscriptionTerm(period.startDate, period.endDate);
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
                        const selectedPlatform = this.productOptions.find(p => p.name === period.productName);
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
                        this.toastService.show('Quote Data Saved Successfully!', 'success');
                        this.capturePreviewScreenshot();
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

        const subTerm = this.calculateSubscriptionTerm(period.startDate, period.endDate);
        const record: any = {
            "referenceId": refId,
            "record": {
                "attributes": { "type": "QuoteLineItem", "method": "POST" },
                "SortOrder": index + 1,
                "QuoteId": quoteId,
                "Product2Id": item.productId,
                "PricebookEntryId": item.pricebookEntryId || '01uDz00000dqXP8IAM',
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
