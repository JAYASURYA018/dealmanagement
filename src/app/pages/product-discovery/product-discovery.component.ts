import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductListComponent } from '../../components/product-list/product-list.component';
import { CartComponent } from '../../components/cart/cart.component';
import { CartService } from '../../services/cart.service';
import { RcaApiService } from '../../services/rca-api.service';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { QuoteDataService } from '../../services/quote-data.service';
import { LoadingService } from '../../services/loading.service';
import { SearchFilterService } from '../../services/search-filter.service'; // Import SearchFilterService

import { TopNavComponent } from '../../components/top-nav/top-nav.component';

@Component({
    selector: 'app-product-discovery',
    standalone: true,
    imports: [CommonModule, SidebarComponent, HeaderComponent, ProductListComponent, CartComponent, TopNavComponent],
    templateUrl: './product-discovery.component.html',
})
export class ProductDiscoveryComponent implements OnInit, AfterViewInit {
    private route = inject(ActivatedRoute);
    cartService = inject(CartService);
    rcaApiService = inject(RcaApiService);
    salesforceApiService = inject(SalesforceApiService);
    quoteDataService = inject(QuoteDataService);
    loadingService = inject(LoadingService);
    searchFilterService = inject(SearchFilterService); // Inject SearchFilterService
    cartItems$ = this.cartService.cartItems$;


    opportunityId: string | null = null;

    ngOnInit(): void {
        // Clear search query on init
        this.searchFilterService.setSearchQuery('');
        
        // Fetch products so they populate the list even on a hard page refresh
        this.rcaApiService.getProducts();

        // Read opportunity ID from query params
        this.route.queryParams.subscribe(params => {
            this.opportunityId = params['opportunityId'] || null;

            if (this.opportunityId) {
                const currentData = this.quoteDataService.getQuoteData();
                // If we don't have the data (e.g. direct URL access), fetch it
                if (!currentData.opportunityId || currentData.opportunityId !== this.opportunityId) {
                    this.fetchOpportunityAndAccountDetails(this.opportunityId);
                }
            }
        });
    }

    fetchOpportunityAndAccountDetails(oppId: string): void {
        this.loadingService.show();
        this.salesforceApiService.getOpportunityDetails(oppId).pipe(
            finalize(() => this.loadingService.hide())
        ).subscribe({
            next: (opp: any) => {
                if (!opp) return;

                // Extract Primary Contact from subquery
                let contactName = null;
                if (opp.OpportunityContactRoles && opp.OpportunityContactRoles.records && opp.OpportunityContactRoles.records.length > 0) {
                    contactName = opp.OpportunityContactRoles.records[0].Contact?.Name;
                }

                this.quoteDataService.setQuoteData({
                    opportunityId: opp.Id,
                    opportunityName: opp.Name,
                    accountId: opp.AccountId,
                    accountName: opp.Account?.Name,
                    website: opp.Account?.Website,
                    pricebook2Id: opp.Pricebook2Id,
                    primaryContactName: contactName,
                    salesChannel: opp.Sales_Channel__c || 'Direct'
                });
            },
            error: (err) => {
                // error handled
            }
        });
    }

    ngAfterViewInit(): void {
        // No op
    }


}
