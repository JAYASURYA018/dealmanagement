import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SalesDriver } from '../models/mock-data';

@Injectable({
    providedIn: 'root'
})
export class FilterService {

    private drivers: SalesDriver[] = [
        { id: 'discount', name: 'Pre-approved discount', icon: '%', count: 120 },
        { id: 'promotions', name: 'Promotions', icon: 'sell', count: 45 },
        { id: 'incentives', name: 'Additional incentives', icon: 'savings', count: 30 },
        { id: 'commission', name: 'Commission multiplier', icon: 'emoji_events', count: 80 }
    ];

    getSalesDrivers(): Observable<SalesDriver[]> {
        return of(this.drivers);
    }
}
