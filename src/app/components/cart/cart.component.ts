import { Component, Input, inject, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { QuoteDataService } from '../../services/quote-data.service';
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

                    return this.salesforceApi.getQuoteDetails(quoteId);
                } else {
                    throw new Error('Quote Creation Failed');
                }
            }),
            finalize(() => {
                this.loadingService.hide();
                this.isSubmitting = false;
            })
        ).subscribe({
            next: (quoteDetails: any) => {
                // Clear search query
                this.searchFilterService.setSearchQuery('');

                // Navigate to quote details page
                this.router.navigate(['/configure-quote']);
            },
            error: (error: any) => {
                console.error('Quote creation error:', error);
            }
        });
    }
}
