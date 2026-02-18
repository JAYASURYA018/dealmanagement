import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SearchFilterService {

    private searchQuerySubject = new BehaviorSubject<string>('');
    searchQuery$ = this.searchQuerySubject.asObservable();

    private selectedCategorySubject = new BehaviorSubject<string | null>(null);
    selectedCategory$ = this.selectedCategorySubject.asObservable();

    setSearchQuery(query: string) {
        this.searchQuerySubject.next(query);
    }

    setCategoryFilter(categoryId: string | null) {
        this.selectedCategorySubject.next(categoryId);
    }

    getSearchQuery(): string {
        return this.searchQuerySubject.value;
    }

    getSelectedCategory(): string | null {
        return this.selectedCategorySubject.value;
    }
}
