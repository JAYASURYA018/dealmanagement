import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { TwPkceService } from './tw-pkce.service';
import { lastValueFrom, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TwAuthService {
    // All OAuth config comes from environment — no secrets in source code.
    private clientId = environment.salesforcePkce.clientId;
    private loginUrl = environment.salesforcePkce.loginUrl;
    private tokenUrl = environment.salesforcePkce.tokenUrl;

    // Callback URL — must match what is registered in the Connected App
    private callbackUrl = window.location.origin + '/#/callback';

    private tokenSubject = new BehaviorSubject<string | null>(sessionStorage.getItem('access_token'));
    public token$ = this.tokenSubject.asObservable();

    constructor(
        private http: HttpClient,
        private pkce: TwPkceService,
        private router: Router
    ) { }

    isAuthenticated(): boolean {
        return !!sessionStorage.getItem('access_token');
    }

    getAccessToken(): string | null {
        return sessionStorage.getItem('access_token');
    }

    async login() {
        const verifier = this.pkce.generateCodeVerifier();
        const challenge = await this.pkce.generateCodeChallenge(verifier);

        sessionStorage.setItem('pkce_verifier', verifier);

        const params = new HttpParams()
            .set('response_type', 'code')
            .set('client_id', this.clientId)
            .set('redirect_uri', this.callbackUrl)
            .set('code_challenge', challenge)
            .set('code_challenge_method', 'S256');

        const redirectUrl = `${this.loginUrl}?${params.toString()}`;

        // Force redirect
        window.location.href = redirectUrl;
    }

    async handleCallback(code: string) {
        const verifier = sessionStorage.getItem('pkce_verifier');
        if (!verifier) {
            throw new Error('No PKCE verifier found in session.');
        }

        const body = new HttpParams()
            .set('grant_type', 'authorization_code')
            .set('code', code)
            .set('client_id', this.clientId)
            .set('redirect_uri', this.callbackUrl)
            .set('code_verifier', verifier);

        try {
            const response: any = await lastValueFrom(
                this.http.post(this.tokenUrl, body.toString(), {
                    headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded')
                })
            );

            sessionStorage.setItem('access_token', response.access_token);
            sessionStorage.setItem('instance_url', response.instance_url);
            sessionStorage.removeItem('pkce_verifier');

            this.tokenSubject.next(response.access_token);

            // Update local storage for compatibility if needed, but session is safer
            localStorage.setItem('sf_access_token', response.access_token);

            return response;

        } catch (error) {
            throw error;
        }
    }

    logout() {
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('instance_url');
        localStorage.removeItem('sf_access_token');
        this.tokenSubject.next(null);
        this.router.navigate(['/']);
    }
}
