import { Component, inject } from '@angular/core';
import { CommonModule, AsyncPipe, Location } from '@angular/common'; // Import AsyncPipe
import { SearchFilterService } from '../../services/search-filter.service';

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [CommonModule, AsyncPipe], // Add AsyncPipe to imports
    templateUrl: './header.component.html',
})
export class HeaderComponent {
    searchFilterService = inject(SearchFilterService);
    location = inject(Location);
    searchQuery$ = this.searchFilterService.searchQuery$; // Expose observable for template

    onSearch(event: Event) {
        const input = event.target as HTMLInputElement;
        this.searchFilterService.setSearchQuery(input.value);
    }

    clearSearch(input: HTMLInputElement) {
        input.value = '';
        this.searchFilterService.setSearchQuery('');
    }

    goBack() {
        this.location.back();
    }
}
