import { Routes } from '@angular/router';
import { OpportunitiesComponent } from './pages/opportunities/opportunities.component';
import { ProductDiscoveryComponent } from './pages/product-discovery/product-discovery.component';
import { QuoteDetailsComponent } from './pages/quote-details/quote-details.component';

import { LoginComponent } from './pages/login/login.component';
import { QuoteConfigurationComponent } from './pages/quote-configuration/quote-configuration.component';

import { authGuard } from './guards/auth.guard';

import { TwCallbackComponent } from './components/tw-callback/tw-callback.component';
import { DebugComponent } from './pages/debug/debug.component';
import { QuotesContainerComponent } from './pages/quotes-container/quotes-container.component';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'callback', component: TwCallbackComponent },
    { path: 'debug', component: DebugComponent },
    { path: '', component: OpportunitiesComponent },
    { path: 'products', component: ProductDiscoveryComponent },
    { path: 'quote-configuration', component: QuoteConfigurationComponent },
    { path: 'configure-quote', component: QuoteDetailsComponent },
    { path: 'quotes', component: QuotesContainerComponent },
    { path: 'quote-edit/:quoteName', component: QuoteConfigurationComponent, data: { mode: 'edit' } },
    { path: '**', redirectTo: '' }
];
