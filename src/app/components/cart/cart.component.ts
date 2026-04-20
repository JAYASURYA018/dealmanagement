import { Component, Input, inject, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { QuoteDataService } from '../../services/quote-data.service';
import { forkJoin } from 'rxjs';
import { switchMap, finalize } from 'rxjs/operators';
import { LoadingService } from '../../services/loading.service';
import { SearchFilterService } from '../../services/search-filter.service'; // Import SearchFilterService

@Component({
    selector: 'app-cart',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './cart.component.html',
})
export class CartComponent implements AfterViewInit, OnChanges {
    @Input() opportunityId: string | null = null;

    private router = inject(Router);
    cartService = inject(CartService);
    private salesforceApi = inject(SalesforceApiService);
    private quoteDataService = inject(QuoteDataService);
    private loadingService = inject(LoadingService);
    private searchFilterService = inject(SearchFilterService); // Inject SearchFilterService
    cartItems$ = this.cartService.cartItems$;

    // Store API responses for later use
    private opportunityData: any = null;
    private accountData: any = null;

    ngOnChanges(changes: SimpleChanges): void {
        // No op
    }

    ngAfterViewInit(): void {
        // No op
    }

    removeItem(productId: string) {
        this.cartService.removeFromCart(productId);
    }

    closeCart() {
        this.cartService.clearCart();
    }

    isSubmitting = false;

    onContinue() {
        if (this.isSubmitting) return;

        const quoteData = this.quoteDataService.getQuoteData();
        if (!quoteData.opportunityId) {
            this.router.navigate(['/']);
            return;
        }

        this.isSubmitting = true;
        this.loadingService.show();

        // Prepare items for quote creation
        const cartItems = this.cartService.getCartItems();
        if (cartItems.length === 0) {
            this.loadingService.hide();
            this.isSubmitting = false;
            return;
        }

        if (!quoteData.pricebook2Id) {
            this.loadingService.hide();
            this.isSubmitting = false;
            throw new Error('Missing Pricebook2Id on Opportunity');
        }

        this.salesforceApi.createQuoteWithLines(
            quoteData.opportunityId,
            quoteData.pricebook2Id,
            cartItems
        ).pipe(
            switchMap((quoteResult: any) => {
                if (quoteResult.isSuccess && quoteResult.salesTransactionId) {
                    const quoteId = quoteResult.salesTransactionId;

                    // Store initial Quote ID
                    this.quoteDataService.setQuoteData({
                        quoteId: quoteId
                    });

                    return forkJoin({
                        quote: this.salesforceApi.getQuoteDetails(quoteId),
                        lines: this.salesforceApi.getQuoteLineItems(quoteId)
                    });
                } else {
                    throw new Error('Quote Creation Failed');
                }
            }),
            finalize(() => {
                this.loadingService.hide();
                this.isSubmitting = false;
            })
        ).subscribe({
            next: (data: any) => {
                const quoteDetails = data.quote;
                const lineItems = data.lines.records || [];

                // Extract QuoteNumber and other details if needed from the Quote
                if (quoteDetails && quoteDetails.QuoteNumber) {
                    const formatted = `Q-${quoteDetails.QuoteNumber}`;
                    const firstItem = cartItems[0] as any;
                    
                    this.quoteDataService.setQuoteData({
                        quoteId: quoteDetails.Id,
                        quoteNumber: formatted,
                        productId: firstItem ? firstItem.id : null,
                        productName: firstItem ? firstItem.name : 'No Products',
                        categoryId: firstItem ? firstItem.categoryId : null,
                        products: cartItems.map(item => {
                            const matchingLine = lineItems.find((li: any) => li.Product2Id === item.id);
                            return {
                                id: item.id,
                                name: item.name,
                                categoryId: (item as any).categoryId,
                                quoteLineId: matchingLine ? matchingLine.Id : null
                            };
                        })
                    });
                }

                // Clear search query
                this.searchFilterService.setSearchQuery('');

                // Navigate to quote details page
                this.router.navigate(['/quote-configuration']);
            },
            error: (error: any) => {
                console.error('Quote creation error:', error);
            }
        });
    }
}
