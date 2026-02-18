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
    cartItems$ = this.cartService.cartItems$;


    opportunityId: string | null = null;

    ngOnInit(): void {
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

                this.quoteDataService.setQuoteData({
                    opportunityId: opp.Id,
                    opportunityName: opp.Name,
                    accountId: opp.AccountId,
                    accountName: opp.Account?.Name, // Account name is now here
                    pricebook2Id: opp.Pricebook2Id
                });

                if (opp.Primary_Contact__c) { // Check for custom field standard logic
                    this.fetchContactDetails(opp.Primary_Contact__c);
                }

                if (opp.Sales_Channel__c) {
                    this.quoteDataService.setQuoteData({
                        salesChannel: opp.Sales_Channel__c
                    });
                }
            },
            error: (err) => {
                // error handled
            }
        });
    }

    fetchContactDetails(contactId: string): void {
        this.salesforceApiService.getContactDetails(contactId).subscribe({
            next: (contact: any) => {
                this.quoteDataService.setQuoteData({
                    primaryContactName: contact.Name
                });
            },
            error: (err) => { /* error */ }
        });
    }

    ngAfterViewInit(): void {
        // No op
    }


}
