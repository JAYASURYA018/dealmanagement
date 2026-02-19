import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, map, finalize, switchMap, tap, catchError, take, of } from 'rxjs';
import { ContextService } from './context.service';
import { LoadingService } from './loading.service';
import { ToastService } from './toast.service';

@Injectable({
    providedIn: 'root'
})
export class RcaApiService {
    private http = inject(HttpClient);
    private contextService = inject(ContextService);
    private loadingService = inject(LoadingService);
    private toastService = inject(ToastService);

    private readonly apiUrl = 'https://vector--rcaagivant.sandbox.my.salesforce.com/services/data/v65.0/connect/pcm/products';

    private productsSubject = new BehaviorSubject<any[]>([]);
    products$ = this.productsSubject.asObservable();

    private familiesSubject = new BehaviorSubject<string[]>([]);
    families$ = this.familiesSubject.asObservable();

    constructor() { }

    getProductDetails(productId: string): Observable<any> {
        const method = 'RcaApiService.getProductDetails';

        // Return a new observable that waits for the context
        return this.contextService.context$.pipe(
            take(1),
            switchMap(context => {
                const providedToken = '00DDz000001qvYA!ARQAQE2ut._CySv0HuqzA58fQg2KQLcac4Eomg4keHeHi6SaaLi8m3e5R6_XFyXbm217O5tEzWvSRR82lg7htONLvNqSzO5g';
                const token = context?.accessToken || providedToken;
                const baseUrl = context?.apiBaseUrl;

                if (!token) {
                    console.error(`[API Error] ${method} No access token available`);
                    throw new Error('No access token available');
                }

                let requestUrl = `${this.apiUrl}/${productId}`;
                if (baseUrl) {
                    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                    requestUrl = `${cleanBaseUrl}/services/data/v65.0/connect/pcm/products/${productId}`;
                }

                console.log(`[API Request] ${method}`, { url: requestUrl });

                const headers = new HttpHeaders({
                    'Authorization': `Bearer ${token}`
                });

                return this.http.get<any>(requestUrl, { headers });
            }),
            // Tap to log the response for debugging
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                console.error(`[API Error] ${method}`, err);
                const msg = err.error?.message || err.message || 'Error fetching product details';
                this.toastService.show(`RCA API Error: ${msg}`, 'error');
                throw err;
            })
        );
    }

    getProductClassifications(parentBundleId: string): Observable<any> {
        const method = 'RcaApiService.getProductClassifications';

        return this.contextService.context$.pipe(
            take(1),
            switchMap(context => {
                const providedToken = '00DDz000001qvYA!ARQAQE2ut._CySv0HuqzA58fQg2KQLcac4Eomg4keHeHi6SaaLi8m3e5R6_XFyXbm217O5tEzWvSRR82lg7htONLvNqSzO5g';
                const token = context?.accessToken || providedToken;
                const baseUrl = context?.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

                if (!token) {
                    throw new Error('No access token available');
                }

                // Query: SELECT Id,Name,Code,it_has_Bundle_Products__c ,Status FROM ProductClassification WHERE Parent_Bundle_Product_ID__c ='...'
                const query = `SELECT Id, Name, Code, It_has_Bundle_Products__c, Status FROM ProductClassification WHERE Parent_Bundle_Product_ID__c = '${parentBundleId}'`;
                const encodedQuery = encodeURIComponent(query);
                const url = `${baseUrl}/services/data/v66.0/query?q=${encodedQuery}`;

                console.log(`[API Request] ${method}`, { url, query });

                const headers = new HttpHeaders({
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                });

                return this.http.get<any>(url, { headers });
            }),
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                console.error(`[API Error] ${method}`, err);
                // Return empty record set on error to prevent breaking flow
                return of({ totalSize: 0, done: true, records: [] });
            })
        );
    }

    getProductsByClassification(classificationId: string, pageSize: number = 20, offset: number = 0): Observable<any> {
        const method = 'RcaApiService.getProductsByClassification';

        return this.contextService.context$.pipe(
            take(1),
            switchMap(context => {
                const providedToken = '00DDz000001qvYA!ARQAQE2ut._CySv0HuqzA58fQg2KQLcac4Eomg4keHeHi6SaaLi8m3e5R6_XFyXbm217O5tEzWvSRR82lg7htONLvNqSzO5g';
                const token = context?.accessToken || providedToken;
                const baseUrl = context?.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

                if (!token) {
                    throw new Error('No access token available');
                }

                // URL: .../connect/pcm/products?productClassificationId=...&include=/products
                const url = `${baseUrl}/services/data/v66.0/connect/pcm/products?productClassificationId=${classificationId}&include=/products`;

                // Body for POST request with pagination
                const body = {
                    offset: offset,
                    pageSize: pageSize
                };

                console.log(`[API Request] ${method}`, { url, body });

                const headers = new HttpHeaders({
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                });

                return this.http.post<any>(url, body, { headers });
            }),
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                console.error(`[API Error] ${method}`, err);
                return of({ products: [] }); // Return empty on error
            })
        );
    }

    getDropdownOptions(): Observable<any> {
        const method = 'RcaApiService.getDropdownOptions';
        const query = "SELECT Id, Name, Code, It_has_Bundle_Products__c, Status FROM ProductClassification WHERE Parent_Bundle_Product_ID__c = '01tDz00000Eah7vIAB'";

        return this.contextService.context$.pipe(
            take(1),
            switchMap(context => {
                const providedToken = '00DDz000001qvYA!ARQAQE2ut._CySv0HuqzA58fQg2KQLcac4Eomg4keHeHi6SaaLi8m3e5R6_XFyXbm217O5tEzWvSRR82lg7htONLvNqSzO5g';
                const token = context?.accessToken || providedToken;
                const baseUrl = context?.apiBaseUrl || 'https://vector--rcaagivant.sandbox.my.salesforce.com';

                if (!token) {
                    throw new Error('No access token available for dropdown options');
                }

                const url = `${baseUrl}/services/data/v66.0/query?q=${encodeURIComponent(query)}`;
                console.log(`[API Request] ${method}`, { url });

                const headers = new HttpHeaders({
                    'Authorization': `Bearer ${token}`
                });

                return this.http.get<any>(url, { headers });
            }),
            tap(response => console.log(`[API Response] ${method}`, response)),
            catchError(err => {
                console.error(`[API Error] ${method}`, err);
                return of({ records: [] });
            })
        );
    }

    getProducts(): void {
        const method = 'RcaApiService.getProducts';

        this.contextService.context$.pipe(take(1)).subscribe(context => {
            // TEMPORARY: Use hardcoded token if dynamic one is missing
            const providedToken = '00DDz000001qvYA!ARQAQE2ut._CySv0HuqzA58fQg2KQLcac4Eomg4keHeHi6SaaLi8m3e5R6_XFyXbm217O5tEzWvSRR82lg7htONLvNqSzO5g';
            const token = context?.accessToken || providedToken;
            const baseUrl = context?.apiBaseUrl;

            if (!token) {
                console.error(`[API Error] ${method} No access token available`);
                return;
            }

            // Construct proper URL (dynamic or fallback for local dev)
            let requestUrl = this.apiUrl;
            if (baseUrl) {
                const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                requestUrl = `${cleanBaseUrl}/services/data/v65.0/connect/pcm/products`;
            }

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`
            });

            const body = {
                "language": "en_US",
                "filter": {
                    "criteria": [
                        {
                            "property": "isActive",
                            "operator": "eq",
                            "value": true
                        },
                        {
                            "property": "Type",
                            "operator": "eq",
                            "value": "Bundle"
                        }
                    ]
                },
                "offset": 0,
                "pageSize": 100,
                "additionalFields": {
                    "Product2": {
                        "fields": [
                            "Family", "Name"
                        ]
                    }
                }
            };

            console.log(`[API Request] ${method}`, { url: requestUrl, body });

            this.loadingService.show();
            this.http.post<any>(requestUrl, body, { headers }).pipe(
                finalize(() => this.loadingService.hide())
            ).subscribe({
                next: (result) => {
                    console.log(`[API Response] ${method}`, result);
                    const rawProducts = result.products || result.items || [];
                    const products = rawProducts.map((p: any) => {
                        let family = p.Family || p.fields?.Family || p.additionalFields?.Family || p.additionalFields?.Product2?.fields?.Family;
                        if (!p.additionalFields) p.additionalFields = {};
                        if (family) p.additionalFields.Family = family;

                        let name = p.Name || p.fields?.Name || p.additionalFields?.Product2?.fields?.Name;
                        if (name) p.additionalFields.Name = name;
                        return p;
                    });

                    const families = Array.from(new Set(products.map((p: any) => p.additionalFields?.Family).filter((f: any) => !!f)));
                    this.productsSubject.next(products);
                    this.familiesSubject.next(families as string[]);
                },
                error: (error) => {
                    console.error(`[API Error] ${method}`, error);
                    const msg = error.error?.message || error.message || 'RCA API Error';
                    this.toastService.show(`RCA API Error: ${msg}`, 'error');
                    this.productsSubject.next([]);
                    this.familiesSubject.next([]);
                }
            });
        });
    }
}
