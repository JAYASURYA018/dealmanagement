import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchFilterService } from '../../services/search-filter.service';

import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './header.component.html',
})
export class HeaderComponent {
    searchFilterService = inject(SearchFilterService);

    onSearch(event: Event) {
        const input = event.target as HTMLInputElement;
        this.searchFilterService.setSearchQuery(input.value);
    }
}
