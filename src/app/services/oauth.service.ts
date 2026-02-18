import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';

interface OAuthResponse {
    access_token: string;
    instance_url: string;
    id: string;
    token_type: string;
    issued_at: string;
    signature: string;
}

@Injectable({
    providedIn: 'root'
})
export class OAuthService {
    private tokenSubject = new BehaviorSubject<string | null>(localStorage.getItem('sf_access_token'));
    public token$ = this.tokenSubject.asObservable();

    constructor(private http: HttpClient) { }

    /**
     * Login using Username-Password flow with provided credentials
     */
    login(credentials: any): Observable<string> {
        // Use relative path to go through the Angular Proxy (defined in proxy.conf.json)
        // This bypasses CORS by acting as if the request is to localhost
        const tokenUrl = `/services/oauth2/token`;

        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('client_id', credentials.clientId);
        params.append('client_secret', credentials.clientSecret);
        params.append('username', credentials.username);
        params.append('password', credentials.password);

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        return new Observable(observer => {
            this.http.post<OAuthResponse>(tokenUrl, params.toString(), { headers }).subscribe({
                next: (response) => {
                    this.tokenSubject.next(response.access_token);

                    // Store token in localStorage for persistence
                    localStorage.setItem('sf_access_token', response.access_token);
                    localStorage.setItem('sf_instance_url', response.instance_url);

                    observer.next(response.access_token);
                    observer.complete();
                },
                error: (error) => {
                    observer.error(error);
                }
            });
        });
    }

    /**
     * Get stored token
     */
    getCurrentToken(): Observable<string | null> {
        const storedToken = localStorage.getItem('sf_access_token');
        if (storedToken) {
            this.tokenSubject.next(storedToken);
            return of(storedToken);
        }
        return of(null);
    }

    /**
     * Clear stored token
     */
    logout(): void {
        localStorage.removeItem('sf_access_token');
        localStorage.removeItem('sf_instance_url');
        this.tokenSubject.next(null);
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return !!localStorage.getItem('sf_access_token');
    }
}