import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { SearchFilterService } from '../../services/search-filter.service';
import { RcaApiService } from '../../services/rca-api.service';
import { ProductFamily, SalesDriver } from '../../models/mock-data';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements OnInit {
    productService = inject(ProductService);
    searchFilterService = inject(SearchFilterService);
    rcaApiService = inject(RcaApiService);

    families$ = this.rcaApiService.families$;
    selectedCategory$ = this.searchFilterService.selectedCategory$;

    ngOnInit() {
        // Data is managed by RcaApiService through its BehaviorSubject
    }

    selectCategory(categoryId: string) {
        // Toggle if already selected, or just set?
        // Let's assume selecting the same one deselects (sets to null) or just sets it.
        // For now, let's just set it.
        const current = this.searchFilterService.getSelectedCategory();
        if (current === categoryId) {
            this.searchFilterService.setCategoryFilter(null);
        } else {
            this.searchFilterService.setCategoryFilter(categoryId);
        }
    }
}
