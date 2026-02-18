# Angular Dynamic Token Authentication Guide

This document explains how to implement dynamic access token retrieval in Angular for calling Salesforce headless APIs, specifically the Revenue Cloud API (RCA).

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication Methods](#authentication-methods)
3. [Method 1: Using Salesforce Session ID](#method-1-using-salesforce-session-id)
4. [Method 2: OAuth Username-Password Flow](#method-2-oauth-username-password-flow)
5. [Method 3: OAuth Web Server Flow](#method-3-oauth-web-server-flow)
6. [Method 4: JWT Bearer Token Flow](#method-4-jwt-bearer-token-flow)
7. [Implementation Examples](#implementation-examples)
8. [CORS Configuration](#cors-configuration)
9. [Error Handling](#error-handling)
10. [Security Considerations](#security-considerations)
11. [Testing and Debugging](#testing-and-debugging)

---

## Overview

Currently, your Angular application uses a hardcoded access token:

```typescript
private readonly token = '-00DDz000001qvYA!ARQAQKpwDwg2aB2iK1BkjDnnIB9w3zj1.tB7oypgrfRxvLx5lnzKL0_vFsZzdgLcYXJ_933N6Z4nId0zxicMKzn94Py5hFD_';
```

This approach has several problems:
- **Security Risk**: Token is exposed in client-side code
- **Expiration**: Tokens expire and need refresh
- **Portability**: Different orgs need different tokens
- **User Context**: Token doesn't represent the actual user

This guide shows you how to implement dynamic token retrieval.

---

## Authentication Methods

### Comparison of Methods

| Method | Use Case | Complexity | Security | User Experience |
|--------|----------|------------|----------|-----------------|
| **Salesforce Session ID** | VF Container | Low | High | Seamless |
| **OAuth Username-Password** | Service Account | Medium | Medium | Seamless |
| **OAuth Web Server** | User Authentication | High | High | Login Required |
| **JWT Bearer** | Server-to-Server | High | Highest | Seamless |

---

## Method 1: Using Salesforce Session ID

**Best for**: Applications running inside Visualforce containers

### How it Works

When your Angular app runs inside a Visualforce page, you can access the current user's session ID directly.

### Implementation

#### Step 1: Update Context Service

```typescript
// src/app/services/context.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

declare global {
    interface Window {
        SF_CONTEXT: any;
    }
}

@Injectable({
    providedIn: 'root'
})
export class ContextService {
    private contextSubject = new BehaviorSubject<any>(this.getInitialContext());
    public context$ = this.contextSubject.asObservable();

    constructor() {
        // Listen for data from the Salesforce Bridge
        window.addEventListener('sfcontextready', () => {
            console.log('ContextService: Received sfcontextready event');
            if (window.SF_CONTEXT) {
                this.contextSubject.next(window.SF_CONTEXT);
            }
        });

        // If it's already there (rare race condition)
        if (window.SF_CONTEXT) {
            this.contextSubject.next(window.SF_CONTEXT);
        }
    }

    private getInitialContext() {
        if (window.SF_CONTEXT) return window.SF_CONTEXT;

        // Mock Data for Local Development
        return {
            accessToken: 'mock_token',
            sessionId: 'mock_session_id', // Add this
            opportunityId: '006MOCK_OPP_ID',
            accountId: '001MOCK_ACC_ID',
            accountName: 'Cymbal (Mock Content)',
            opportunityName: 'Mock Opportunity',
            isGCPFamily: true,
            salesChannel: 'Partner',
            primaryContactName: 'Sarah Connor'
        };
    }

    get currentContext() {
        return this.contextSubject.value;
    }

    // Add getter for session ID
    get sessionId(): string {
        return this.currentContext?.sessionId || this.currentContext?.accessToken;
    }

    // Other getters...
}
```

#### Step 2: Update Visualforce Page

```html
<!-- salesforce/force-app/main/default/pages/GoogleQuoteAppVF.page -->
<apex:page standardController="Opportunity" extensions="QuoteController">
    <script>
        // Inject session ID into global context
        window.SF_CONTEXT = {
            sessionId: '{!$Api.Session_ID}',
            accessToken: '{!$Api.Session_ID}', // Same as session ID
            opportunityId: '{!Opportunity.Id}',
            accountId: '{!Opportunity.AccountId}',
            accountName: '{!Opportunity.Account.Name}',
            // ... other context data
        };
        
        // Notify Angular that context is ready
        window.dispatchEvent(new CustomEvent('sfcontextready'));
    </script>
    
    <!-- Load Angular App -->
    <app-root></app-root>
    <script src="{!URLFOR($Resource.GoogleQuoteAppV2, 'main.js')}"></script>
</apex:page>
```

#### Step 3: Update RCA API Service

```typescript
// src/app/services/rca-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, switchMap, of } from 'rxjs';
import { ContextService } from './context.service';

@Injectable({
    providedIn: 'root'
})
export class RcaApiService {
    private http = inject(HttpClient);
    private contextService = inject(ContextService);

    private readonly apiUrl = 'https://vector--rcaagivant.sandbox.my.salesforce.com/services/data/v65.0/connect/pcm/products';

    private productsSubject = new BehaviorSubject<any[]>([]);
    products$ = this.productsSubject.asObservable();

    private familiesSubject = new BehaviorSubject<string[]>([]);
    families$ = this.familiesSubject.asObservable();

    constructor() { }

    getProducts(): void {
        // Wait for context to be available, then make API call
        this.contextService.context$.pipe(
            switchMap(context => {
                const sessionId = context?.sessionId || context?.accessToken;
                
                if (!sessionId) {
                    console.error('No session ID available for RCA API call');
                    return of(null);
                }

                if (sessionId === 'mock_session_id') {
                    // Return mock data for local development
                    return of({
                        products: [
                            {
                                id: 'mock-1',
                                name: 'Google Cloud Platform Bundle',
                                additionalFields: { Family: 'GCP' }
                            },
                            {
                                id: 'mock-2',
                                name: 'Google Workspace Bundle', 
                                additionalFields: { Family: 'Workspace' }
                            }
                        ]
                    });
                }

                // Make real API call
                return this.callRcaApi(sessionId);
            })
        ).subscribe({
            next: (response) => {
                if (response) {
                    console.log('RCA API Response:', response);
                    const products = response.products || [];
                    this.productsSubject.next(products);

                    // Extract unique families
                    const families = [...new Set(products.map((p: any) => p.additionalFields?.Family).filter(Boolean))];
                    this.familiesSubject.next(families as string[]);
                }
            },
            error: (error) => {
                console.error('RCA API Error:', error);
                this.productsSubject.next([]);
                this.familiesSubject.next([]);
            }
        });
    }

    private callRcaApi(sessionId: string): Observable<any> {
        const headers = new HttpHeaders({
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
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
        console.log("Product discovery request body",body)
        return this.http.post<any>(this.apiUrl, body, { headers });
    }
}
```

---

## Method 2: OAuth Username-Password Flow

**Best for**: Service account integration, server-to-server communication

### How it Works

Uses a dedicated service account to authenticate and get tokens programmatically.

### Prerequisites

1. **Connected App** in Salesforce
2. **Service Account User** with API access
3. **Security Token** for the service account

### Implementation

#### Step 1: Create OAuth Service

```typescript
// src/app/services/oauth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

interface OAuthResponse {
    access_token: string;
    instance_url: string;
    id: string;
    token_type: string;
    issued_at: string;
    signature: string;
}

interface TokenInfo {
    token: string;
    instanceUrl: string;
    expiresAt: number;
}

@Injectable({
    providedIn: 'root'
})
export class OAuthService {
    private tokenSubject = new BehaviorSubject<string | null>(null);
    public token$ = this.tokenSubject.asObservable();

    // OAuth Configuration - Move to environment files
    private readonly config = {
        clientId: '3MVG9pRzvMtpzlZON9VvzOeF8nJ_JKvQNKvQNKvQNKvQNKvQNKvQNKvQ', // Your Connected App Consumer Key
        clientSecret: 'YOUR_CONNECTED_APP_CONSUMER_SECRET',
        username: 'serviceaccount@yourorg.com',
        password: 'password123SECURITYTOKEN', // Password + Security Token
        loginUrl: 'https://login.salesforce.com' // Use https://test.salesforce.com for sandbox
    };

    private tokenInfo: TokenInfo | null = null;

    constructor(private http: HttpClient) {
        // Try to load token from storage on startup
        this.loadStoredToken();
    }

    /**
     * Get access token using Username-Password OAuth flow
     */
    getAccessToken(): Observable<string> {
        // Check if we have a valid cached token
        if (this.tokenInfo && this.isTokenValid()) {
            this.tokenSubject.next(this.tokenInfo.token);
            return of(this.tokenInfo.token);
        }

        // Get new token
        return this.requestNewToken();
    }

    private requestNewToken(): Observable<string> {
        const tokenUrl = `${this.config.loginUrl}/services/oauth2/token`;
        
        const body = new URLSearchParams({
            grant_type: 'password',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            username: this.config.username,
            password: this.config.password
        });

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        return this.http.post<OAuthResponse>(tokenUrl, body.toString(), { headers }).pipe(
            tap(response => {
                console.log('OAuth Success:', response);
                
                // Store token info
                this.tokenInfo = {
                    token: response.access_token,
                    instanceUrl: response.instance_url,
                    expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 hours from now
                };
                
                // Update subject
                this.tokenSubject.next(response.access_token);
                
                // Store in localStorage for persistence
                this.storeToken();
            }),
            map(response => response.access_token),
            catchError(error => {
                console.error('OAuth Error:', error);
                throw error;
            })
        );
    }

    private isTokenValid(): boolean {
        if (!this.tokenInfo) return false;
        
        // Check if token expires in next 5 minutes
        const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
        return this.tokenInfo.expiresAt > fiveMinutesFromNow;
    }

    private storeToken(): void {
        if (this.tokenInfo) {
            localStorage.setItem('sf_token_info', JSON.stringify(this.tokenInfo));
        }
    }

    private loadStoredToken(): void {
        const stored = localStorage.getItem('sf_token_info');
        if (stored) {
            try {
                this.tokenInfo = JSON.parse(stored);
                if (this.isTokenValid()) {
                    this.tokenSubject.next(this.tokenInfo!.token);
                } else {
                    // Token expired, clear it
                    this.clearToken();
                }
            } catch (e) {
                console.error('Error loading stored token:', e);
                this.clearToken();
            }
        }
    }

    private clearToken(): void {
        this.tokenInfo = null;
        localStorage.removeItem('sf_token_info');
        this.tokenSubject.next(null);
    }

    /**
     * Force refresh token
     */
    refreshToken(): Observable<string> {
        this.clearToken();
        return this.requestNewToken();
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.tokenInfo !== null && this.isTokenValid();
    }

    /**
     * Logout and clear tokens
     */
    logout(): void {
        this.clearToken();
    }
}
```

#### Step 2: Update RCA API Service

```typescript
// src/app/services/rca-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, switchMap } from 'rxjs';
import { OAuthService } from './oauth.service';

@Injectable({
    providedIn: 'root'
})
export class RcaApiService {
    private http = inject(HttpClient);
    private oauthService = inject(OAuthService);

    private readonly apiUrl = 'https://vector--rcaagivant.sandbox.my.salesforce.com/services/data/v65.0/connect/pcm/products';

    private productsSubject = new BehaviorSubject<any[]>([]);
    products$ = this.productsSubject.asObservable();

    private familiesSubject = new BehaviorSubject<string[]>([]);
    families$ = this.familiesSubject.asObservable();

    constructor() { }

    getProducts(): void {
        // Get token first, then make API call
        this.oauthService.getAccessToken().pipe(
            switchMap(token => this.callRcaApi(token))
        ).subscribe({
            next: (response) => {
                console.log('RCA API Response:', response);
                const products = response.products || [];
                this.productsSubject.next(products);

                // Extract unique families
                const families = [...new Set(products.map((p: any) => p.additionalFields?.Family).filter(Boolean))];
                this.familiesSubject.next(families as string[]);
            },
            error: (error) => {
                console.error('RCA API Error:', error);
                
                // If unauthorized, try refreshing token
                if (error.status === 401) {
                    console.log('Token expired, refreshing...');
                    this.oauthService.refreshToken().pipe(
                        switchMap(newToken => this.callRcaApi(newToken))
                    ).subscribe({
                        next: (response) => {
                            const products = response.products || [];
                            this.productsSubject.next(products);
                            const families = [...new Set(products.map((p: any) => p.additionalFields?.Family).filter(Boolean))];
                            this.familiesSubject.next(families as string[]);
                        },
                        error: (retryError) => {
                            console.error('RCA API Error after token refresh:', retryError);
                            this.productsSubject.next([]);
                            this.familiesSubject.next([]);
                        }
                    });
                } else {
                    this.productsSubject.next([]);
                    this.familiesSubject.next([]);
                }
            }
        });
    }

    private callRcaApi(token: string): Observable<any> {
        const headers = new HttpHeaders({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });

        const body = {
            "language": "en_US",
            "filter": {
                "criteria": [
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

        return this.http.post<any>(this.apiUrl, body, { headers });
    }
}
```

#### Step 3: Environment Configuration

```typescript
// src/environments/environment.ts
export const environment = {
    production: false,
    salesforce: {
        clientId: '3MVG9pRzvMtpzlZON9VvzOeF8nJ_JKvQNKvQNKvQNKvQNKvQNKvQNKvQ',
        clientSecret: 'YOUR_CONNECTED_APP_CONSUMER_SECRET',
        username: 'serviceaccount@yourorg.com.sandbox',
        password: 'password123SECURITYTOKEN',
        loginUrl: 'https://test.salesforce.com' // Sandbox
    }
};

// src/environments/environment.prod.ts
export const environment = {
    production: true,
    salesforce: {
        clientId: '3MVG9pRzvMtpzlZON9VvzOeF8nJ_JKvQNKvQNKvQNKvQNKvQNKvQNKvQ',
        clientSecret: 'YOUR_CONNECTED_APP_CONSUMER_SECRET',
        username: 'serviceaccount@yourorg.com',
        password: 'password123SECURITYTOKEN',
        loginUrl: 'https://login.salesforce.com' // Production
    }
};
```

---

## Method 3: OAuth Web Server Flow

**Best for**: User-facing applications where each user needs their own authentication

### How it Works

Redirects users to Salesforce login, then exchanges authorization code for access token.

### Implementation

#### Step 1: OAuth Web Server Service

```typescript
// src/app/services/oauth-web.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

interface OAuthResponse {
    access_token: string;
    refresh_token: string;
    instance_url: string;
    id: string;
    token_type: string;
    issued_at: string;
    signature: string;
}

@Injectable({
    providedIn: 'root'
})
export class OAuthWebService {
    private tokenSubject = new BehaviorSubject<string | null>(null);
    public token$ = this.tokenSubject.asObservable();

    private readonly config = {
        clientId: '3MVG9pRzvMtpzlZON9VvzOeF8nJ_JKvQNKvQNKvQNKvQNKvQNKvQNKvQ',
        clientSecret: 'YOUR_CONNECTED_APP_CONSUMER_SECRET',
        redirectUri: 'http://localhost:4200/oauth/callback', // Your app's callback URL
        loginUrl: 'https://login.salesforce.com'
    };

    constructor(
        private http: HttpClient,
        private router: Router
    ) {
        // Check for stored token on startup
        const storedToken = localStorage.getItem('sf_access_token');
        if (storedToken) {
            this.tokenSubject.next(storedToken);
        }
    }

    /**
     * Start OAuth flow by redirecting to Salesforce
     */
    login(): void {
        const authUrl = `${this.config.loginUrl}/services/oauth2/authorize` +
            `?response_type=code` +
            `&client_id=${this.config.clientId}` +
            `&redirect_uri=${encodeURIComponent(this.config.redirectUri)}` +
            `&scope=api refresh_token`;

        window.location.href = authUrl;
    }

    /**
     * Handle OAuth callback with authorization code
     */
    handleCallback(code: string): Observable<string> {
        const tokenUrl = `${this.config.loginUrl}/services/oauth2/token`;
        
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uri: this.config.redirectUri,
            code: code
        });

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        return new Observable(observer => {
            this.http.post<OAuthResponse>(tokenUrl, body.toString(), { headers }).subscribe({
                next: (response) => {
                    console.log('OAuth Success:', response);
                    
                    // Store tokens
                    localStorage.setItem('sf_access_token', response.access_token);
                    localStorage.setItem('sf_refresh_token', response.refresh_token);
                    localStorage.setItem('sf_instance_url', response.instance_url);
                    
                    this.tokenSubject.next(response.access_token);
                    
                    observer.next(response.access_token);
                    observer.complete();
                },
                error: (error) => {
                    console.error('OAuth Error:', error);
                    observer.error(error);
                }
            });
        });
    }

    /**
     * Refresh access token using refresh token
     */
    refreshToken(): Observable<string> {
        const refreshToken = localStorage.getItem('sf_refresh_token');
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const tokenUrl = `${this.config.loginUrl}/services/oauth2/token`;
        
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            refresh_token: refreshToken
        });

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        return new Observable(observer => {
            this.http.post<OAuthResponse>(tokenUrl, body.toString(), { headers }).subscribe({
                next: (response) => {
                    localStorage.setItem('sf_access_token', response.access_token);
                    this.tokenSubject.next(response.access_token);
                    
                    observer.next(response.access_token);
                    observer.complete();
                },
                error: (error) => {
                    console.error('Token refresh error:', error);
                    this.logout();
                    observer.error(error);
                }
            });
        });
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return !!localStorage.getItem('sf_access_token');
    }

    /**
     * Get current token
     */
    getCurrentToken(): string | null {
        return localStorage.getItem('sf_access_token');
    }

    /**
     * Logout and clear tokens
     */
    logout(): void {
        localStorage.removeItem('sf_access_token');
        localStorage.removeItem('sf_refresh_token');
        localStorage.removeItem('sf_instance_url');
        this.tokenSubject.next(null);
        this.router.navigate(['/login']);
    }
}
```

#### Step 2: OAuth Callback Component

```typescript
// src/app/components/oauth-callback/oauth-callback.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OAuthWebService } from '../../services/oauth-web.service';

@Component({
    selector: 'app-oauth-callback',
    template: `
        <div class="callback-container">
            <h2>Authenticating...</h2>
            <p>Please wait while we complete your login.</p>
        </div>
    `
})
export class OAuthCallbackComponent implements OnInit {
    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private oauthService: OAuthWebService
    ) {}

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            const code = params['code'];
            const error = params['error'];

            if (error) {
                console.error('OAuth Error:', error);
                this.router.navigate(['/login'], { queryParams: { error: error } });
                return;
            }

            if (code) {
                this.oauthService.handleCallback(code).subscribe({
                    next: (token) => {
                        console.log('Authentication successful');
                        this.router.navigate(['/']);
                    },
                    error: (error) => {
                        console.error('Authentication failed:', error);
                        this.router.navigate(['/login'], { queryParams: { error: 'auth_failed' } });
                    }
                });
            } else {
                this.router.navigate(['/login']);
            }
        });
    }
}
```

---

## Method 4: JWT Bearer Token Flow

**Best for**: Server-to-server integration with highest security

### Prerequisites

1. **Connected App** with JWT Bearer flow enabled
2. **Digital Certificate** uploaded to Connected App
3. **Private Key** for signing JWT tokens

### Implementation

```typescript
// src/app/services/jwt-oauth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

// Note: You'll need to install jsonwebtoken library
// npm install jsonwebtoken @types/jsonwebtoken
import * as jwt from 'jsonwebtoken';

@Injectable({
    providedIn: 'root'
})
export class JwtOAuthService {
    private tokenSubject = new BehaviorSubject<string | null>(null);
    public token$ = this.tokenSubject.asObservable();

    private readonly config = {
        clientId: '3MVG9pRzvMtpzlZON9VvzOeF8nJ_JKvQNKvQNKvQNKvQNKvQNKvQNKvQ',
        username: 'serviceaccount@yourorg.com',
        loginUrl: 'https://login.salesforce.com',
        privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----` // Your private key
    };

    constructor(private http: HttpClient) {}

    /**
     * Get access token using JWT Bearer flow
     */
    getAccessToken(): Observable<string> {
        const jwtToken = this.createJWT();
        return this.exchangeJWTForToken(jwtToken);
    }

    private createJWT(): string {
        const payload = {
            iss: this.config.clientId,
            sub: this.config.username,
            aud: this.config.loginUrl,
            exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes from now
        };

        return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
    }

    private exchangeJWTForToken(jwtToken: string): Observable<string> {
        const tokenUrl = `${this.config.loginUrl}/services/oauth2/token`;
        
        const body = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwtToken
        });

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        return new Observable(observer => {
            this.http.post<any>(tokenUrl, body.toString(), { headers }).subscribe({
                next: (response) => {
                    console.log('JWT OAuth Success:', response);
                    this.tokenSubject.next(response.access_token);
                    observer.next(response.access_token);
                    observer.complete();
                },
                error: (error) => {
                    console.error('JWT OAuth Error:', error);
                    observer.error(error);
                }
            });
        });
    }
}
```

---

## CORS Configuration

For any of these methods to work when calling Salesforce APIs directly from Angular, you need to configure CORS.

### Step 1: Add CORS Origin in Salesforce

1. Go to **Setup** in your Salesforce org
2. Search for **CORS** in Quick Find
3. Click **CORS**
4. Click **New**
5. Add these origins:
   - `http://localhost:4200` (for development)
   - `https://yourdomain.com` (for production)
   - `https://yourorg.my.salesforce.com` (if hosting in Salesforce)

### Step 2: Handle CORS in Development

Add proxy configuration for local development:

```json
// proxy.conf.json
{
  "/services/*": {
    "target": "https://vector--rcaagivant.sandbox.my.salesforce.com",
    "secure": true,
    "changeOrigin": true,
    "logLevel": "debug"
  }
}
```

Update `angular.json`:

```json
"serve": {
  "builder": "@angular-devkit/build-angular:dev-server",
  "options": {
    "proxyConfig": "proxy.conf.json"
  }
}
```

---

## Error Handling

### Common Errors and Solutions

#### 1. INVALID_SESSION_ID

```typescript
// Error handler in service
private handleApiError(error: any): void {
    if (error.status === 401 || error.error?.message?.includes('INVALID_SESSION_ID')) {
        console.log('Session expired, refreshing token...');
        this.refreshToken().subscribe({
            next: () => this.retryLastRequest(),
            error: (refreshError) => {
                console.error('Token refresh failed:', refreshError);
                this.logout();
            }
        });
    }
}
```

#### 2. CORS Errors

```typescript
// Check for CORS errors
private isCorsError(error: any): boolean {
    return error.status === 0 && error.error instanceof ProgressEvent;
}

private handleCorsError(): void {
    console.error('CORS Error: Please configure CORS in Salesforce Setup');
    // Show user-friendly error message
}
```

#### 3. Token Expiration

```typescript
// Automatic token refresh
private setupTokenRefresh(): void {
    // Refresh token 5 minutes before expiration
    const refreshInterval = (this.tokenExpiresIn - 5 * 60) * 1000;
    
    setTimeout(() => {
        this.refreshToken().subscribe();
    }, refreshInterval);
}
```

---

## Security Considerations

### 1. Never Store Secrets in Frontend Code

❌ **Don't do this:**
```typescript
const clientSecret = 'your_secret_here'; // Visible to users!
```

✅ **Do this instead:**
```typescript
// Use environment variables or backend proxy
const clientSecret = environment.salesforce.clientSecret;
```

### 2. Use HTTPS in Production

```typescript
// Check protocol in production
if (environment.production && location.protocol !== 'https:') {
    location.replace(`https:${location.href.substring(location.protocol.length)}`);
}
```

### 3. Implement Token Rotation

```typescript
// Rotate tokens regularly
private scheduleTokenRotation(): void {
    setInterval(() => {
        this.refreshToken().subscribe();
    }, 30 * 60 * 1000); // Every 30 minutes
}
```

### 4. Validate Tokens

```typescript
// Validate token format
private isValidToken(token: string): boolean {
    return token && token.length > 50 && token.startsWith('00D');
}
```

---

## Testing and Debugging

### 1. Test Token Retrieval

```typescript
// src/app/components/token-test/token-test.component.ts
import { Component } from '@angular/core';
import { OAuthService } from '../../services/oauth.service';

@Component({
    selector: 'app-token-test',
    template: `
        <div class="token-test">
            <h3>Token Test</h3>
            <button (click)="testToken()">Get Token</button>
            <div *ngIf="token">
                <p>Token: {{ token | slice:0:20 }}...</p>
                <p>Status: {{ status }}</p>
            </div>
        </div>
    `
})
export class TokenTestComponent {
    token: string | null = null;
    status: string = '';

    constructor(private oauthService: OAuthService) {}

    testToken(): void {
        this.status = 'Getting token...';
        
        this.oauthService.getAccessToken().subscribe({
            next: (token) => {
                this.token = token;
                this.status = 'Success!';
                console.log('Full token:', token);
            },
            error: (error) => {
                this.status = 'Error: ' + error.message;
                console.error('Token error:', error);
            }
        });
    }
}
```

### 2. Debug API Calls

```typescript
// Add debugging to HTTP interceptor
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';

@Injectable()
export class DebugInterceptor implements HttpInterceptor {
    intercept(req: HttpRequest<any>, next: HttpHandler) {
        console.log('HTTP Request:', {
            url: req.url,
            method: req.method,
            headers: req.headers.keys().map(key => ({ [key]: req.headers.get(key) }))
        });

        return next.handle(req).pipe(
            tap(event => {
                if (event instanceof HttpResponse) {
                    console.log('HTTP Response:', {
                        status: event.status,
                        body: event.body
                    });
                }
            })
        );
    }
}
```

### 3. Monitor Token Status

```typescript
// Token status component
@Component({
    selector: 'app-token-status',
    template: `
        <div class="token-status" [class.authenticated]="isAuthenticated">
            <span>{{ isAuthenticated ? 'Authenticated' : 'Not Authenticated' }}</span>
            <button *ngIf="!isAuthenticated" (click)="login()">Login</button>
            <button *ngIf="isAuthenticated" (click)="logout()">Logout</button>
        </div>
    `
})
export class TokenStatusComponent implements OnInit {
    isAuthenticated = false;

    constructor(private oauthService: OAuthService) {}

    ngOnInit(): void {
        this.oauthService.token$.subscribe(token => {
            this.isAuthenticated = !!token;
        });
    }

    login(): void {
        this.oauthService.getAccessToken().subscribe();
    }

    logout(): void {
        this.oauthService.logout();
    }
}
```

---

## Recommendation

For your current setup, I recommend **Method 1 (Salesforce Session ID)** because:

1. **Simplest Implementation**: Minimal code changes required
2. **No Additional Setup**: Works with existing Visualforce container
3. **Secure**: Uses current user's session
4. **No CORS Issues**: When running inside Salesforce

If you want to make the app truly standalone, use **Method 2 (OAuth Username-Password)** with a service account.

Choose the method that best fits your deployment strategy and security requirements.