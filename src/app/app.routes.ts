import { Routes } from '@angular/router';
import { OpportunitiesComponent } from './pages/opportunities/opportunities.component';
import { ProductDiscoveryComponent } from './pages/product-discovery/product-discovery.component';
import { QuoteDetailsComponent } from './pages/quote-details/quote-details.component';

import { LoginComponent } from './pages/login/login.component';

import { authGuard } from './guards/auth.guard';

import { TwCallbackComponent } from './components/tw-callback/tw-callback.component';
import { DebugComponent } from './pages/debug/debug.component';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'callback', component: TwCallbackComponent },
    { path: 'debug', component: DebugComponent },
    { path: '', component: OpportunitiesComponent },
    { path: 'products', component: ProductDiscoveryComponent },
    { path: 'configure-quote', component: QuoteDetailsComponent },
    { path: '**', redirectTo: '' }
];
