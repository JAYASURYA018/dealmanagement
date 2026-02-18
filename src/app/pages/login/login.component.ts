import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OAuthService } from '../../services/oauth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './login.component.html'
})
export class LoginComponent {
    private oauthService = inject(OAuthService);
    private router = inject(Router);

    credentials = {
        clientId: '3MVG9YFqzc_KnL.wMMu8VYv3FCif_NT_iDRNO0PvVu2Vc_hiMsDFvwKSFTSVgokLY1UZcYyBbT8Pf1.piml_d',
        clientSecret: '58EBADED59483248A597131444DE984641B15071D0E8EF6124A816DA70042D1D',
        username: 'jayasuryav@google.com',
        password: 'Jayasuryaagivant@123',
        loginUrl: 'https://vector--rcaagivant.sandbox.my.salesforce.com'
    };

    isLoading = false;
    errorMessage = '';

    constructor() {
        // Load saved credentials for convenience (excluding password)
        const saved = localStorage.getItem('sf_dev_credentials');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.credentials.clientId = parsed.clientId || '';
            this.credentials.clientSecret = parsed.clientSecret || '';
            this.credentials.username = parsed.username || '';
            this.credentials.loginUrl = parsed.loginUrl || 'https://test.salesforce.com';
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
