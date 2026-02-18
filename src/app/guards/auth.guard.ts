import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { OAuthService } from '../services/oauth.service';

export const authGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const oauthService = inject(OAuthService);

    if (oauthService.isAuthenticated()) {
        return true;
    }

    // Redirect to login page
    router.navigate(['/login']);
    return false;
};
