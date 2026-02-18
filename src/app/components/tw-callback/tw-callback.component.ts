import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TwAuthService } from '../../services/tw-auth.service';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-tw-callback',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; background: #f3f4f6;">
      <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px;">
        <h2 style="margin: 0 0 1rem 0; color: #1f2937;">🔐 Authenticating with Salesforce...</h2>
        <p style="margin: 0; color: #6b7280;">Please wait while we set up your secure session.</p>
        <div *ngIf="error" style="margin-top: 1rem; padding: 1rem; background: #fee2e2; border-radius: 4px; color: #991b1b;">
          <strong>Error:</strong> {{ error }}
        </div>
        <div *ngIf="status" style="margin-top: 1rem; padding: 1rem; background: #dbeafe; border-radius: 4px; color: #1e40af;">
          {{ status }}
        </div>
      </div>
    </div>
  `
})
export class TwCallbackComponent implements OnInit {
    error: string = '';
    status: string = '';

    constructor(
        private route: ActivatedRoute,
        private auth: TwAuthService,
        private router: Router
    ) {
        console.log('🏗️ TwCallbackComponent: Constructor called');
        console.log('🌐 Current URL:', window.location.href);
    }

    ngOnInit() {
        console.log('🔄 TwCallbackComponent: Initialized');
        this.status = 'Initializing...';

        // Manual URL inspection to catch params that Angular Router might miss with HashLocationStrategy
        const fullUrl = window.location.href;
        console.log('🔍 inspecting full URL:', fullUrl);

        let code = this.getParameterByName('code', fullUrl);
        let error = this.getParameterByName('error', fullUrl);
        let errorDescription = this.getParameterByName('error_description', fullUrl);

        // Fallback: check Angular route params if manual check failed
        if (!code && !error) {
            console.log('⚠️ Manual parse found nothing, checking ActivatedRoute params...');
            this.route.queryParams.subscribe(params => {
                this.handleAuth(params['code'], params['error'], params['error_description']);
            });
        } else {
            this.handleAuth(code, error, errorDescription);
        }
    }

    private getParameterByName(name: string, url: string): string | null {
        name = name.replace(/[\[\]]/g, '\\$&');
        const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
        const results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    private handleAuth(code: string | null | undefined, error: string | null | undefined, errorDescription: string | null | undefined) {
        if (error) {
            console.error('❌ OAuth Error from Salesforce:', error);
            console.error('Error Description:', errorDescription);
            this.error = `${error}: ${errorDescription || 'Unknown error'}`;
            this.status = '';
            return;
        }

        if (code) {
            console.log('✅ Authorization code received:', code.substring(0, 20) + '...');
            this.status = 'Exchanging authorization code for access token...';
            console.log('🔄 Attempting token exchange...');

            this.auth.handleCallback(code)
                .then((response) => {
                    console.log('✅ Token exchange successful!');
                    console.log('Access Token:', response.access_token.substring(0, 20) + '...');
                    console.log('Instance URL:', response.instance_url);

                    this.status = 'Success! Redirecting to home...';

                    // Navigate to home or intended route
                    setTimeout(() => {
                        this.router.navigate(['/']);
                    }, 1000);
                })
                .catch(err => {
                    console.error('❌ Token exchange failed:', err);
                    console.error('Error details:', err.error);
                    console.error('Status:', err.status);
                    console.error('Full error object:', err);

                    this.error = `Token exchange failed: ${err.status} - ${err.statusText}`;
                    this.status = '';
                });
        } else {
            console.warn('⚠️ No authorization code found in callback URL');
            this.status = '';
            this.error = 'No authorization code found in URL';
        }
    }
}
