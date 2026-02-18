import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { LoaderComponent } from './components/loader/loader.component';
import { ToastComponent } from './components/toast/toast.component';
import { TwAuthService } from './services/tw-auth.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, LoaderComponent, ToastComponent],
    template: `
        <app-loader></app-loader>
        <app-toast></app-toast>
        <router-outlet></router-outlet>
    `,
})
export class AppComponent implements OnInit {
    title = 'google-quote-creation';

    private authService = inject(TwAuthService);
    private router = inject(Router);

    ngOnInit() {
        console.log('🚀 AppComponent.ngOnInit() called');

        // Auto-login logic: Check if we're on the callback route
        const currentPath = window.location.pathname;
        console.log('📍 Current path:', currentPath);

        // Skip auto-login if we're handling the callback
        if (currentPath === '/callback') {
            console.log('⏭️ Skipping auto-login (on callback route)');
            return;
        }

        // TEMPORARILY DISABLED AUTO-LOGIN FOR DEBUGGING
        // Use the debug page at /#/debug to manually trigger login
        console.log('⚠️ Auto-login is DISABLED. Use /#/debug to manually test.');

        /*
        // If no token exists, trigger PKCE login automatically
        const isAuth = this.authService.isAuthenticated();
        console.log('🔐 isAuthenticated():', isAuth);
        
        if (!isAuth) {
            console.log('❌ No access token found. Initiating PKCE authentication...');
            this.authService.login();
        } else {
            console.log('✅ Access token found. User is authenticated.');
        }
        */
    }
}
