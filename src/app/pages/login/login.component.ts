import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OAuthService } from '../../services/oauth.service';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './login.component.html'
})
export class LoginComponent {
    private oauthService = inject(OAuthService);
    private router = inject(Router);

    // Default values come from environment config (no secrets in source code).
    // The user can override these in the login form at runtime.
    credentials = {
        clientId: environment.salesforce.clientId,
        clientSecret: environment.salesforce.clientSecret,
        username: environment.salesforce.username,
        password: '',
        loginUrl: environment.salesforce.loginUrl
    };

    isLoading = false;
    errorMessage = '';

    constructor() {
        // Load saved credentials for convenience (excluding password)
        const saved = localStorage.getItem('sf_dev_credentials');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.credentials.clientId = parsed.clientId || this.credentials.clientId;
            this.credentials.clientSecret = parsed.clientSecret || this.credentials.clientSecret;
            this.credentials.username = parsed.username || this.credentials.username;
            this.credentials.loginUrl = parsed.loginUrl || this.credentials.loginUrl;
        }
    }

    onSubmit() {
        this.isLoading = true;
        this.errorMessage = '';

        // Save configuration for next time (excluding password)
        localStorage.setItem('sf_dev_credentials', JSON.stringify({
            clientId: this.credentials.clientId,
            clientSecret: this.credentials.clientSecret,
            username: this.credentials.username,
            loginUrl: this.credentials.loginUrl
        }));

        this.oauthService.login(this.credentials).subscribe({
            next: () => {
                this.isLoading = false;
                this.router.navigate(['/']);
            },
            error: (err) => {
                this.isLoading = false;
                this.errorMessage = 'Login failed. Check console and CORS settings.';
            }
        });
    }
}
