import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QuoteDataService } from '../../services/quote-data.service';
import { TopNavComponent } from '../../components/top-nav/top-nav.component';
import { DetailsOfQuoteComponent } from '../../components/details-of-quote/details-of-quote.component';
import { CommitConfigurationComponent } from '../../components/commit-configuration/commit-configuration.component';
import { SubscriptionConfigurationComponent } from '../../components/subscription-configuration/subscription-configuration.component';
@Component({
  selector: 'app-quote-configuration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TopNavComponent,
    DetailsOfQuoteComponent,
    CommitConfigurationComponent,
    SubscriptionConfigurationComponent
  ],
  templateUrl: './quote-configuration.component.html',
  styles: [`
    .glass-card {
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  `]
})
export class QuoteConfigurationComponent implements OnInit {
  @ViewChild(DetailsOfQuoteComponent) detailsComp?: DetailsOfQuoteComponent;
  @ViewChild(CommitConfigurationComponent) commitComp?: CommitConfigurationComponent;
  @ViewChild(SubscriptionConfigurationComponent) subComp?: SubscriptionConfigurationComponent;

  private quoteDataService = inject(QuoteDataService);
  private router = inject(Router);
  
  isLoading = true;
  accountName = '';
  opportunityName = '';
  quoteNumber = '';
  
  products: any[] = [];
  selectedItemId = 'quote_details';
  annualContractValue = 0;
  totalContractValue = 0;

  activeTab = 'details';

  get isSaveDisabled(): boolean {
    const type = this.getProductType(this.selectedItemId);
    if (type === 'commitment') return this.commitComp?.activeTab !== 'discounts';
    if (type === 'subscription') return this.subComp?.activeTab !== 'plans';
    return false; // Quote details
  }

  get isSubmitDisabled(): boolean {
    const type = this.getProductType(this.selectedItemId);
    if (type === 'commitment') return this.commitComp?.activeTab !== 'discounts';
    if (type === 'subscription') return this.subComp?.activeTab !== 'plans';
    return true; // Quote details
  }

  openPreview() {
    console.log('Opening preview...');
  }

  resetForm() {
    this.router.navigate(['/']);
  }

  onSkipAndSave() {
    this.saveCurrentTab(() => {
        // Submit logic: show success or navigate
    });
  }

  onSave() {
    this.saveCurrentTab();
  }

  private saveCurrentTab(onSuccess?: () => void) {
    if (this.selectedItemId === 'quote_details') {
      this.detailsComp?.onSave(onSuccess);
    } else {
      const type = this.getProductType(this.selectedItemId);
      if (type === 'commitment') {
        this.commitComp?.onSave(onSuccess);
      } else if (type === 'subscription') {
        this.subComp?.onSave(onSuccess);
      }
    }
  }

  ngOnInit() {
    this.quoteDataService.quoteData$.subscribe(data => {
      this.accountName = data.accountName || 'Acme Corp';
      this.opportunityName = data.opportunityName || 'Expansion Deal';
      this.quoteNumber = data.quoteNumber || 'Q-DRAFT';
      
      // Map products from QuoteData
      if (data.products && data.products.length > 0) {
        this.products = data.products.map(p => {
          const isLooker = p.name ? p.name.toLowerCase().includes('looker') : false;
          return {
            id: p.id,
            name: p.name,
            icon: isLooker ? 'bar_chart' : 'cloud',
            type: isLooker ? 'subscription' : 'commitment',
            quoteLineId: p.quoteLineId,
            categoryId: p.categoryId
          };
        });
      } else if (data.productId || data.productName) {
        const isLooker = data.productName?.toLowerCase().includes('looker');
        this.products = [
          { 
            id: data.productId || 'p1', 
            name: data.productName || 'Product', 
            icon: isLooker ? 'bar_chart' : 'cloud',
            type: isLooker ? 'subscription' : 'commitment',
            categoryId: data.categoryId || ''
          }
        ];
      }
    });

    setTimeout(() => {
      this.isLoading = false;
    }, 1000);
  }

  getProductType(id: string) {
    const p = this.products.find(p => p.id === id);
    return p ? p.type : 'none';
  }

  getSelectedProduct() {
    return this.products.find(p => p.id === this.selectedItemId);
  }

  selectItem(id: string) {
    this.selectedItemId = id;
    if (id === 'quote_details') {
      this.activeTab = 'details';
    } else {
      this.activeTab = 'configuration';
    }
  }

  formatCurrency(val: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  }
}
