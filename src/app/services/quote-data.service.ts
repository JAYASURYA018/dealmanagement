import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface QuoteData {
    opportunityId: string | null;
    opportunityName: string | null;
    accountId: string | null;
    accountName: string | null;
    website: string | null; // Added website field
    pricebook2Id: string | null;
    quoteId: string | null; // Salesforce ID
    quoteNumber: string | null; // Formatted Q-Number
    primaryContactName: string | null;
    salesChannel: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class QuoteDataService {
    private quoteDataSubject = new BehaviorSubject<QuoteData>({
        opportunityId: null,
        opportunityName: null,
        accountId: null,
        accountName: null,
        website: null,
        pricebook2Id: null,
        quoteId: null,
        quoteNumber: null,
        primaryContactName: null,
        salesChannel: null
    });

    quoteData$ = this.quoteDataSubject.asObservable();

    setQuoteData(data: Partial<QuoteData>) {
        const currentData = this.quoteDataSubject.value;
        this.quoteDataSubject.next({ ...currentData, ...data });
    }

    getQuoteData(): QuoteData {
        return this.quoteDataSubject.value;
    }

    clearQuoteData() {
        this.quoteDataSubject.next({
            opportunityId: null,
            opportunityName: null,
            accountId: null,
            accountName: null,
            website: null,
            pricebook2Id: null,
            quoteId: null,
            quoteNumber: null,
            primaryContactName: null,
            salesChannel: null
        });
    }
}
