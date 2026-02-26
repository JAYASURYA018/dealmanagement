import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class QuoteRefreshService {
    // true when a discount/incentive modification requires quote line items refresh
    private refreshNeeded$ = new BehaviorSubject<boolean>(false);

    setRefreshNeeded(value: boolean) {
        this.refreshNeeded$.next(value);
    }

    getRefreshNeeded() {
        return this.refreshNeeded$.asObservable();
    }

    // Helper to consume and reset the flag
    consumeRefreshFlag(): boolean {
        const current = this.refreshNeeded$.getValue();
        if (current) {
            this.refreshNeeded$.next(false);
        }
        return current;
    }
}
