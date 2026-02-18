import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TwAuthService } from '../../services/tw-auth.service';

@Component({
    selector: 'app-debug',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div style="padding: 2rem; font-family: monospace;">
      <h1>🔍 PKCE Debug Page</h1>
      
      <div style="margin: 2rem 0; padding: 1rem; background: #f3f4f6; border-radius: 4px;">
        <h3>Current State:</h3>
        <p><strong>URL:</strong> {{ currentUrl }}</p>
        <p><strong>Path:</strong> {{ currentPath }}</p>
        <p><strong>sessionStorage.access_token:</strong> {{ sessionToken || 'null' }}</p>
        <p><strong>sessionStorage.pkce_verifier:</strong> {{ pkceVerifier || 'null' }}</p>
        <p><strong>localStorage.sf_access_token:</strong> {{ localToken || 'null' }}</p>
        <p><strong>isAuthenticated():</strong> {{ isAuth }}</p>
      </div>

      <div style="margin: 2rem 0;">
        <h3>Actions:</h3>
        <button (click)="clearAll()" style="margin: 0.5rem; padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Clear All Storage
        </button>
        <button (click)="triggerLogin()" style="margin: 0.5rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Trigger PKCE Login
        </button>
        <button (click)="goToCallback()" style="margin: 0.5rem; padding: 0.5rem 1rem; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Navigate to /callback
        </button>
        <button (click)="goToHome()" style="margin: 0.5rem; padding: 0.5rem 1rem; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Navigate to /
        </button>
      </div>

      <div style="margin: 2rem 0; padding: 1rem; background: #fef3c7; border-radius: 4px;">
        <h3>⚠️ Instructions:</h3>
        <ol>
          <li>Click "Clear All Storage"</li>
          <li>Click "Trigger PKCE Login"</li>
          <li>Log in to Salesforce</li>
          <li>After redirect, check if you're on /callback route</li>
          <li>Check browser console for callback component logs</li>
        </ol>
      </div>
    </div>
  `
})
export class DebugComponent {
    currentUrl = window.location.href;
    currentPath = window.location.pathname;
    sessionToken = sessionStorage.getItem('access_token');
    pkceVerifier = sessionStorage.getItem('pkce_verifier');
    localToken = localStorage.getItem('sf_access_token');
    isAuth: boolean;

    constructor(
        private router: Router,
        private auth: TwAuthService
    ) {
        this.isAuth = this.auth.isAuthenticated();
        console.log('🐛 DebugComponent loaded');
    }

    clearAll() {
        sessionStorage.clear();
        localStorage.clear();
        console.log('🗑️ All storage cleared');
        location.reload();
    }

    triggerLogin() {
        console.log('🚀 Triggering PKCE login...');
        this.auth.login();
    }

    goToCallback() {
        console.log('➡️ Navigating to /callback');
        this.router.navigate(['/callback']);
    }

    goToHome() {
        console.log('➡️ Navigating to /');
        this.router.navigate(['/']);
    }
}
