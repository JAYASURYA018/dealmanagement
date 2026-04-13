import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TopNavComponent } from '../../components/top-nav/top-nav.component';
import { DetailsOfQuoteComponent } from '../../components/details-of-quote/details-of-quote.component';

@Component({
  selector: 'app-quote-configuration',
  standalone: true,
  imports: [CommonModule, FormsModule, TopNavComponent, DetailsOfQuoteComponent],
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
  isLoading = true;
  accountName = 'Acme Corp';
  opportunityName = '2026 Expansion Deal';
  quoteNumber = 'Q-00045921';
  
  // Dynamic Products List
  products = [
    { id: 'gcp', name: 'Google Cloud Platform', icon: 'cloud' },
    { id: 'looker', name: 'Looker', icon: 'bar_chart' }
  ];
  
  selectedItemId = 'quote_details';
  annualContractValue = 12450000;
  totalContractValue = 37350000;

  selectedProducts = [
    { id: '1', name: 'Looker Enterprise', category: 'Platform', price: 12000, quantity: 1 },
    { id: '2', name: 'Standard User', category: 'Users', price: 150, quantity: 50 },
    { id: '3', name: 'Developer User', category: 'Users', price: 300, quantity: 5 }
  ];

  activeTab = 'details';

  openPreview() {
    console.log('Opening preview...');
  }

  resetForm() {
    console.log('Resetting form...');
  }

  onSkipAndSave() {
    console.log('Skipping and saving...');
  }

  ngOnInit() {
    setTimeout(() => {
      this.isLoading = false;
    }, 1500);
  }

  selectItem(id: string) {
    this.selectedItemId = id;
    if (id === 'quote_details') {
      this.activeTab = 'details';
    } else {
      this.activeTab = 'configuration';
    }
  }

  getTotal() {
    return this.selectedProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
  }

  formatCurrency(val: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  }
}
