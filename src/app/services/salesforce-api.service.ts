import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, switchMap, tap, catchError, throwError, map } from 'rxjs'; // Add throwError

import { ContextService } from './context.service';
import { ToastService } from './toast.service';

declare const Visualforce: any;

@Injectable({
    providedIn: 'root'
})
export class SalesforceApiService {
    private http = inject(HttpClient);
    private contextService = inject(ContextService);
    private toastService = inject(ToastService);

    constructor() {
        console.log('🔄 SalesforceApiService: Service Initialized (Real API Environment)');
    }

    private handleError(method: string, err: any): Observable<never> {
        console.error(`[API Error] ${method}`, err);
        let msg = 'Unknown Error';
        if (err.error) {
            msg = typeof err.error === 'string' ? err.error : JSON.stringify(err.error);
        } else if (err.message) {
            msg = err.message;
        }
        this.toastService.show(`API Error (${method}): ${msg}`, 'error');
        return throwError(() => err);
    }

    /**
     * Calls the Salesforce backend via Visualforce Remoting
     */
    placeOrder(payload: any): Observable<any> {
        const method = 'SalesforceApiService.placeOrder';
        console.log(`[API Request] ${method}`, { payload });

        return new Observable(observer => {
            // Mock for local development
            if (!window.SF_CONTEXT && !((window as any).Visualforce)) {
                console.warn(`[API Warn] ${method} Mocking API Call (Local Dev)`);
                setTimeout(() => {
                    const response = { success: true, orderId: 'MOCK-ORDER-123' };
                    console.log(`[API Response] ${method}`, response);
                    observer.next(response);
                    observer.complete();
                }, 1000);
                return;
            }

            // Real Salesforce Call
            Visualforce.remoting.Manager.invokeAction(
                'QuoteController.placeOrder',
                payload,
                (result: any, event: any) => {
                    if (event.status) {
                        console.log(`[API Response] ${method}`, result);
                        observer.next(result);
                        observer.complete();
                    } else {
                        const msg = event.message || 'Visualforce Remote Action Failed';
                        this.toastService.show(`Error: ${msg}`, 'error');
                        observer.error(event);
                    }
                },
                { escape: false }
            );
        });
    }

    /**
     * Fetches opportunity details from Salesforce REST API
     * @param opportunityId The Salesforce Opportunity ID
     * @returns Observable of opportunity details
     */
    getOpportunityDetails(opportunityId: string): Observable<any> {
        const method = 'SalesforceApiService.getOpportunityDetails';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        const query = `SELECT Id, Name, AccountId, Account.Name, Pricebook2Id, Primary_Contact__c, Sales_Channel__c FROM Opportunity WHERE Id = '${opportunityId}'`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v65.0/query/?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, query });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            map((res: any) => res.records && res.records.length > 0 ? res.records[0] : null),
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Fetches account details from Salesforce REST API
     * @param accountId The Salesforce Account ID
     * @returns Observable of account details
     */
    getAccountDetails(accountId: string): Observable<any> {
        const method = 'SalesforceApiService.getAccountDetails';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/sobjects/Account/${accountId}`;

        console.log(`[API Request] ${method}`, { url });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Creates a Quote with Quote Lines using the Salesforce Composite Graph API
     */
    createQuoteWithLines(opportunityId: string, pricebookId: string, items: any[]): Observable<any> {
        const method = 'SalesforceApiService.createQuoteWithLines';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/connect/rev/sales-transaction/actions/place`;

        // 1. Check if all items already have pricebookEntryId
        const missingPBE = items.filter(item => !item.pricebookEntryId && !item.defaultPrice?.pricebookEntryId);
        let pbeObservable: Observable<any>;

        if (missingPBE.length === 0) {
            // All items have PBE ID, skip fetch
            console.log(`[API Info] ${method} All items have PricebookEntryId, skipping lookup.`);
            pbeObservable = of({ records: [] });
        } else {
            // Fetch PricebookEntries for missing items
            const productIds = missingPBE.map(item => item.id);
            pbeObservable = this.getPricebookEntries(productIds);
        }

        return pbeObservable.pipe(
            switchMap((pbeResponse: any) => {
                const pbeRecords = pbeResponse.records || [];
                // Use the Pricebook2Id from the first record if available, else fallback to passed pricebookId
                // If we skipped lookup, we assume the passed pricebookId is correct or we take it from items if needed?
                // The API needs Pricebook2Id on the Quote.
                // If items have pricebookEntryId, we might not have Pricebook2Id here easily unless we fetch.
                // However, user usually passes pricebookId. Let's rely on that or the one found.
                const dynamicPricebookId = pbeRecords.length > 0 ? pbeRecords[0].Pricebook2Id : pricebookId;

                // Construct the records for the Graph API
                const records: any[] = [
                    {
                        "referenceId": "refQuote",
                        "record": {
                            "attributes": {
                                "method": "POST",
                                "type": "Quote"
                            },
                            "Name": "DealManagement-" + new Date().getTime(),
                            "OpportunityId": opportunityId,
                            "Pricebook2Id": dynamicPricebookId
                        }
                    }
                ];

                // Add dynamic quote lines
                items.forEach((item, index) => {
                    // Find matching PricebookEntry if we descended to fetch
                    const matchingPBE = pbeRecords.find((pbe: any) => pbe.Product2Id === item.id);
                    const finalPBEId = matchingPBE ? matchingPBE.Id : (item.pricebookEntryId || item.defaultPrice?.pricebookEntryId || '01uDz00000dqLY8IAM');

                    // Conditional Logic: Looker Bundle vs Others (or just use dynamic fields if present)
                    // The user wants dynamic fields for ALL relevant items (Platform/Users) in this bundle flow.
                    // We can check if item has 'billingFrequency' etc to decide?
                    // Or just map everything that is present.

                    const baseAttributes = {
                        "type": "QuoteLineItem",
                        "method": "POST"
                    };

                    const baseRecord = {
                        "attributes": baseAttributes,
                        "QuoteId": "@{refQuote.id}",
                        "Product2Id": item.id,
                        "PricebookEntryId": finalPBEId,
                        "Quantity": item.quantity || 1,
                        "StartDate": item.startDate || new Date().toISOString().split('T')[0]
                    };

                    // Merge dynamic fields from item
                    // User requested specific fields:
                    // StartDate (mapped), EndDate, BillingFrequency, PeriodBoundary, Billing_Frequency__c, Operation_Type__c, Term_Starts_On__c

                    let recordData: any = { ...baseRecord };

                    if (item.endDate) {
                        recordData["EndDate"] = item.endDate;
                    }
                    if (item.billingFrequency) {
                        recordData["BillingFrequency"] = item.billingFrequency;
                    }
                    if (item.periodBoundary) {
                        recordData["PeriodBoundary"] = item.periodBoundary;
                    }

                    // Custom Fields
                    if (item.billingFrequency) {
                        // Map standard BillingFrequency to custom Billing_Frequency__c if needed, or take direct custom prop
                        // User example: BillingFrequency: "Monthly", Billing_Frequency__c: "Annual in Advance Anniversary"
                        // This implies they might be different or mapped.
                        // For now, I will take item.customBillingFrequency if exists, else default to 'Annual' or item.billingFrequency
                        recordData["Billing_Frequency__c"] = item.customBillingFrequency || "Annual";
                    }
                    if (item.operationType) {
                        recordData["Operation_Type__c"] = item.operationType;
                    }
                    if (item.termStartsOn) {
                        recordData["Term_Starts_On__c"] = item.termStartsOn;
                    }

                    // Subscription Term
                    if (item.subscriptionTerm) {
                        recordData["SubscriptionTerm"] = item.subscriptionTerm;
                    }
                    if (item.subscriptionTermUnit) {
                        recordData["SubscriptionTermUnit"] = item.subscriptionTermUnit;
                    }


                    records.push({
                        "referenceId": `refQuoteLine${index}`,
                        "record": recordData
                    });
                });

                const body = {
                    "pricingPref": "Skip",
                    "catalogRatesPref": "Skip",
                    "configurationPref": {
                        "configurationMethod": "Skip",
                        "configurationOptions": {
                            "validateProductCatalog": true,
                            "validateAmendRenewCancel": true,
                            "executeConfigurationRules": true,
                            "addDefaultConfiguration": true
                        }
                    },
                    "taxPref": "Skip",
                    "contextDetails": {},
                    "graph": {
                        "graphId": "createQuoteWithLines",
                        "records": records
                    }
                };

                console.log(`[API Request] ${method}`, { url, body });

                const headers = new HttpHeaders({
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                });

                return this.http.post(url, body, { headers }).pipe(
                    tap(response => console.log(`[API Response] ${method}`, response)),
                    catchError(err => this.handleError(method, err))
                );
            })
        );
    }

    /**
     * Fetches Quote details from Salesforce REST API
     * @param quoteId The Salesforce Quote ID
     * @returns Observable of quote details
     */
    getQuoteDetails(quoteId: string): Observable<any> {
        const method = 'SalesforceApiService.getQuoteDetails';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/sobjects/Quote/${quoteId}`;

        console.log(`[API Request] ${method}`, { url });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }

    /**
     * Executes a composite graph request to the Place API
     */
    placeGraphRequest(payload: any): Observable<any> {
        const method = 'SalesforceApiService.placeGraphRequest';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        // Handle endpoint (no save parameter added to URL)
        let url = `${baseUrl}/services/data/v65.0/connect/rev/sales-transaction/actions/place`;
        const body = { ...payload };

        // Ensure 'save' is not in the body if it causes issues, but Reference uses it.
        // Reference code: if (body.save !== undefined) delete body.save; 
        // But then later adds it back? 
        // Let's stick to the Reference implementation which DELETES it for the first payload but ADDS it for the remaining periods?
        // Actually, Reference `placeGraphRequest` deletes `save`.
        // But `syncRemainingPeriods` adds `save: true`.
        // Let's copy Reference `placeGraphRequest` logic:
        if (body.save !== undefined) {
            delete body.save;
        }

        console.log(`[API Request] ${method}`, { url, body });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.post(url, body, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                console.error('❌ Place API Update Error:', err);
                const fullError = err.error || err;
                console.error('Full Error Response Body:', JSON.stringify(fullError, null, 2));

                if (fullError.errorResponse) {
                    console.error('Detailed Error Response:', JSON.stringify(fullError.errorResponse, null, 2));
                } else if (Array.isArray(fullError)) {
                    console.error('Salesforce Error Array:', JSON.stringify(fullError, null, 2));
                }
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Updates Quote Start and Expiry dates via Salesforce REST PATCH
     */
    patchQuoteDates(quoteId: string, startDate: string, expirationDate: string): Observable<any> {
        const method = 'SalesforceApiService.patchQuoteDates';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        // Use standard sobjects PATCH for simple updates vs Graph API
        const url = `${baseUrl}/services/data/v65.0/sobjects/Quote/${quoteId}`;

        const body = {
            StartDate: startDate,
            ExpirationDate: expirationDate
        };

        console.log(`[API Request] ${method}`, { url, body });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.patch(url, body, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }

    /**
     * Fetches QuoteLineItems for a given Quote ID
     * @param quoteId The Salesforce Quote ID
     * @returns Observable containing recentItems with QuoteLineItem IDs
     */
    getQuoteLineItems(quoteId: string): Observable<any> {
        const method = 'SalesforceApiService.getQuoteLineItems';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        // Using v59.0 and specific query as requested by user
        const query = `SELECT Id, Product2Id FROM QuoteLineItem WHERE QuoteId = '${quoteId}'`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v59.0/query/?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, quoteId });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }

    /**
     * Creates Commitment Details records using composite tree API
     * @param records Array of commitment records to create
     * @returns Observable of the creation result
     */
    createQuoteLineCommitments(records: any[]): Observable<any> {
        const method = 'SalesforceApiService.createQuoteLineCommitments';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/composite/tree/Commitment_Details__c`;

        const body = {
            records: records
        };

        console.log(`[API Request] ${method}`, { url, body });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.post(url, body, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }

    /**
     * Fetches Contact details from Salesforce REST API
     * @param contactId The Salesforce Contact ID
     * @returns Observable of contact details
     */
    getContactDetails(contactId: string): Observable<any> {
        const method = 'SalesforceApiService.getContactDetails';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/sobjects/Contact/${contactId}`;

        console.log(`[API Request] ${method}`, { url });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }
    /**
     * Updates Quote Start and Expiry dates via Salesforce REST PATCH
     */
    /**
     * Updates Quote Start and Expiry dates + Commitment Totals via Salesforce Graph API
     */
    updateQuoteDates(
        quoteId: string,
        startDate: string,
        expirationDate: string,
        term: number,
        totalCommitmentValue: number,
        quoteLineItems?: Array<{ id: string, commitmentAmount: number }>
    ): Observable<any> {
        const method = 'SalesforceApiService.updateQuoteDates';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/connect/rev/sales-transaction/actions/place`;

        console.log(`[API Request] ${method}`, { url, quoteId, startDate, expirationDate, term, totalCommitmentValue, quoteLineItems });

        // Build the records array starting with the Quote record
        const records: any[] = [
            {
                "referenceId": "refQuote",
                "record": {
                    "attributes": {
                        "type": "Quote",
                        "method": "PATCH",
                        "id": quoteId
                    },
                    "StartDate": startDate,
                    "ExpirationDate": expirationDate,
                    "Total_Commitment_Value__c": totalCommitmentValue,
                    "Term__c": term,
                    "Description": "Updated via RCA API with commitment totals"
                }
            }
        ];

        // Add QuoteLineItem records if provided
        if (quoteLineItems && quoteLineItems.length > 0) {
            quoteLineItems.forEach((lineItem, index) => {
                records.push({
                    "referenceId": `refQuoteLineitem${index}`,
                    "record": {
                        "attributes": {
                            "type": "QuoteLineItem",
                            "method": "PATCH",
                            "id": lineItem.id
                        },
                        "Commitment_Amount__c": lineItem.commitmentAmount,
                        "StartDate": startDate,
                        "EndDate": expirationDate
                    }
                });
            });
        }

        const body = {
            "pricingPref": "Skip",
            "catalogRatesPref": "Skip",
            "graph": {
                "graphId": "updateQuoteWithFields",
                "records": records
            }
        };

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.post(url, body, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Fetches Pricebook Entries for given Product2Ids
     */
    getPricebookEntries(productIds: string[]): Observable<any> {
        const method = 'SalesforceApiService.getPricebookEntries';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        const idsString = productIds.map(id => `'${id}'`).join(',');
        const query = `SELECT Id, Pricebook2Id, Pricebook2.Name, UnitPrice, IsActive, CurrencyIsoCode, Product2Id FROM PricebookEntry WHERE Product2Id IN (${idsString})`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v65.0/query/?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, query });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Fetches the 5 most recently created opportunities for today
     */
    getOpportunities(): Observable<any> {
        const method = 'SalesforceApiService.getOpportunities';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        // Query to get opportunities created today only, limited to 5
        // Query for specific date 2026-01-28 onwards (widened to catch timezone spillover)
        // Updated to include Account Website and Primary Contact (via Roles) as requested
        const query = `SELECT Id, Name, StageName, Amount, CloseDate, Owner.Name, AccountId, Account.Name, Account.Website, CreatedDate, (SELECT Contact.Id, Contact.Name FROM OpportunityContactRoles) FROM Opportunity WHERE CreatedDate >= 2026-01-28T00:00:00Z ORDER BY CreatedDate DESC LIMIT 5`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v65.0/query?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, query });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Fetches the 5 most recently updated products
     */
    getRecentProducts(): Observable<any> {
        const method = 'SalesforceApiService.getRecentProducts';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        const query = `SELECT Id, Name, Family, LastModifiedDate FROM Product2 ORDER BY LastModifiedDate DESC LIMIT 5`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v65.0/query?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, query });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Fetches detailed opportunity data using SOQL query
     */
    getOpportunitiesDetails(ids: string[]): Observable<any> {
        const method = 'SalesforceApiService.getOpportunitiesDetails';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        // Build the WHERE clause with multiple IDs
        const idsString = ids.map(id => `'${id}'`).join(',');
        const query = `SELECT Id, Name, Amount, CloseDate, AccountId, Account.Name, Owner.Name, Pricebook2Id, Primary_Contact__c, Sales_Channel__c FROM Opportunity WHERE Id IN (${idsString})`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v65.0/query/?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, query });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                return this.handleError(method, err);
            })
        );
    }

    /**
     * Fetches comprehensive quote preview data using SOQL query
     */
    getQuotePreview(quoteId: string): Observable<any> {
        const method = 'SalesforceApiService.getQuotePreview';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

        const query = `SELECT Name, QuoteNumber, StartDate, ExpirationDate, Opportunity.Name, Account.Name, Account.Website, (SELECT Product2Id, Product2.Name FROM QuoteLineItems) FROM Quote WHERE Id='${quoteId}'`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${baseUrl}/services/data/v65.0/query/?q=${encodedQuery}`;

        console.log(`[API Request] ${method}`, { url, query });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }

    /**
     * Submits a Salesforce Graph API transaction
     * @param payload The graph payload containing records to be processed
     * @returns Observable of the transaction result
     */
    placeSalesTransaction(payload: any): Observable<any> {
        const method = 'SalesforceApiService.placeSalesTransaction';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/connect/rev/sales-transaction/actions/place`;

        console.log(`[API Request] ${method}`, { url, payload });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        // The endpoint expects a specific structure for pricing/tax/etc.
        // If the payload already has the 'graph' property, we wrap it with defaults if needed.
        const body = payload.graph ? {
            "pricingPref": "Skip",
            "catalogRatesPref": "Skip",
            "configurationPref": {
                "configurationMethod": "Skip",
                "configurationOptions": {
                    "validateProductCatalog": true,
                    "validateAmendRenewCancel": true,
                    "executeConfigurationRules": true,
                    "addDefaultConfiguration": true
                }
            },
            "taxPref": "Skip",
            "contextDetails": {},
            ...payload
        } : payload;

        return this.http.post(url, body, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }


    /**
     * Generic method to fetch picklist values using UI API
     */
    getPicklistValues(objectApiName: string, recordTypeId: string, fieldApiName: string): Observable<any> {
        const method = `SalesforceApiService.getPicklistValues(${fieldApiName})`;
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/ui-api/object-info/${objectApiName}/picklist-values/${recordTypeId}/${fieldApiName}`;

        console.log(`[API Request] ${method}`, { url });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                // Return mock data if no token/offline for dev
                if (!token && !((window as any).Visualforce)) {
                    console.warn(`[API Mock] Returning mock values for ${fieldApiName}`);
                    return of({
                        values: [
                            { label: 'Mock Option 1', value: 'Mock Option 1' },
                            { label: 'Mock Option 2', value: 'Mock Option 2' }
                        ]
                    });
                }
                return this.handleError(method, err);
            })
        );
    }

    getRegionPicklist(recordTypeId: string): Observable<any> {
        return this.getPicklistValues('QuoteLineItem', recordTypeId, 'Looker_Region__c');
    }

    getBillingFrequencyPicklist(recordTypeId: string): Observable<any> {
        return this.getPicklistValues('QuoteLineItem', recordTypeId, 'Billing_Frequency__c');
    }

    getOperationTypePicklist(recordTypeId: string): Observable<any> {
        return this.getPicklistValues('QuoteLineItem', recordTypeId, 'Operation_Type__c');
    }

    getTermStartsOnPicklist(recordTypeId: string): Observable<any> {
        return this.getPicklistValues('QuoteLineItem', recordTypeId, 'Term_Starts_On__c');
    }

    /**
     * Fetches Bundle Details (Product Component Groups)
     */
    getBundleDetails(bundleId: string): Observable<any> {
        const method = 'SalesforceApiService.getBundleDetails';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/connect/cpq/products/${bundleId}`;

        console.log(`[API Request] ${method}`, { url });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.post(url, {}, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }

    /**
     * Fetches Product Relationship Type ID
     */
    getProductRelationshipType(): Observable<any> {
        const method = 'SalesforceApiService.getProductRelationshipType';
        const token = this.contextService.accessToken;
        const baseUrl = this.contextService.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';
        const url = `${baseUrl}/services/data/v65.0/sobjects/ProductRelationshipType`;

        console.log(`[API Request] ${method}`, { url });

        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        return this.http.get(url, { headers }).pipe(
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => this.handleError(method, err))
        );
    }
}
