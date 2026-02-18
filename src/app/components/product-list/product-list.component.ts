import { Component, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { RcaApiService } from '../../services/rca-api.service';
import { SearchFilterService } from '../../services/search-filter.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/mock-data';
import { ProductCardComponent } from '../product-card/product-card.component';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
    selector: 'app-product-list',
    standalone: true,
    imports: [CommonModule, ProductCardComponent],
    templateUrl: './product-list.component.html',
})
export class ProductListComponent implements OnInit {
    productService = inject(ProductService);
    rcaApiService = inject(RcaApiService);
    searchFilterService = inject(SearchFilterService);
    cartService = inject(CartService);



    products: Product[] = [];
    filteredProducts: Product[] = [];
    currentTitle: string = 'Recommended products';

    ngOnInit() {
        this.cartService.clearCart();
        const rcaProducts$ = this.rcaApiService.products$.pipe(
            map(rcaProducts => {
                return rcaProducts.map(rp => {
                    // The RCA API returns products with 'id' as the Salesforce Product2Id
                    const product = {
                        id: rp.id, // This is the Product2Id from Salesforce
                        name: rp.additionalFields?.Name || rp.name,
                        description: rp.description,
                        family: rp.additionalFields?.Family || 'Other',
                        tags: [], // Static icons for now
                        productId: rp.id, // Store as productId as well for clarity
                        pricebookEntryId: rp.defaultPrice?.pricebookEntryId || rp.pricebookEntryId
                    } as any;
                    return product;
                });
            })
        );

        const search$ = this.searchFilterService.searchQuery$;
        const category$ = this.searchFilterService.selectedCategory$;

        combineLatest([rcaProducts$, search$, category$]).subscribe(([products, search, category]) => {
            if (category) {
                this.currentTitle = category;
            } else if (search) {
                this.currentTitle = `Search results for "${search}"`;
            } else {
                this.currentTitle = 'Recommended products';
            }

            this.filteredProducts = products.filter(product => {
                const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase()) ||
                    (product.description?.toLowerCase() || '').includes(search.toLowerCase());
                const matchesCategory = category ? product.family === category : true;

                return matchesSearch && matchesCategory;
            });
        });
    }


}
