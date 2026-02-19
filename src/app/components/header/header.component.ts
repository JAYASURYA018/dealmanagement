import { Component, inject } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common'; // Import AsyncPipe
import { SearchFilterService } from '../../services/search-filter.service';

import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [CommonModule, RouterLink, AsyncPipe], // Add AsyncPipe to imports
    templateUrl: './header.component.html',
})
export class HeaderComponent {
    searchFilterService = inject(SearchFilterService);
    searchQuery$ = this.searchFilterService.searchQuery$; // Expose observable for template

    onSearch(event: Event) {
        const input = event.target as HTMLInputElement;
        this.searchFilterService.setSearchQuery(input.value);
    }
}
