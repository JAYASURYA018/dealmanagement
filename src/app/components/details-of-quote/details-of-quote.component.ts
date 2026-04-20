import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesforceApiService } from '../../services/salesforce-api.service';
import { LoadingService } from '../../services/loading.service';
import { ToastService } from '../../services/toast.service';
import { QuoteDataService } from '../../services/quote-data.service';

@Component({
  selector: 'app-details-of-quote',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './details-of-quote.component.html',
  styles: [`
    .shadow-inner-soft {
      box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.03);
    }
  `]
})
export class DetailsOfQuoteComponent implements OnInit {
  private sfApi = inject(SalesforceApiService);
  private loadingService = inject(LoadingService);
  private toastService = inject(ToastService);
  private quoteDataService = inject(QuoteDataService);

  accountId: string | null = null;
  accountName = '';
  // Primary Contact State
  primaryContactName = '';
  primaryContactOpen = false;
  primaryContactOptions: string[] = [];
  
  // Sales Channel State
  salesChannel = '';
  salesChannelOpen = false;
  salesChannelOptions: string[] = [];
  
  // Operation Type State
  operationType = '';
  operationTypeOpen = false;
  operationTypeOptions: string[] = [];

  // Expiration Date State
  expirationDate = '';
  minDate = new Date().toISOString().split('T')[0];

  ngOnInit() {
    this.setInitialExpirationDate();
    this.quoteDataService.quoteData$.subscribe(data => {
      if (data.accountName) this.accountName = data.accountName;
      if (data.accountId) {
        this.accountId = data.accountId;
        this.loadContacts(data.accountId);
      }
      if (data.primaryContactName) this.primaryContactName = data.primaryContactName;
      if (data.salesChannel) this.salesChannel = data.salesChannel;
      
      this.loadAllPicklists();
    });
  }

  loadAllPicklists() {
    this.sfApi.getQuotePicklistValues().subscribe({
      next: (res) => {
        const picklists = res.picklistFieldValues;
        
        // Sales Channel
        if (picklists.Sales_Channel__c) {
          this.salesChannelOptions = picklists.Sales_Channel__c.values.map((v: any) => v.label);
          if (!this.salesChannel && this.salesChannelOptions.length > 0) {
            this.salesChannel = this.salesChannelOptions[0];
          }
        }

        // Operation Type
        if (picklists.Operation_Type__c) {
          this.operationTypeOptions = picklists.Operation_Type__c.values.map((v: any) => v.label);
          if (!this.operationType && this.operationTypeOptions.length > 0) {
            this.operationType = this.operationTypeOptions[0];
          }
        }
      },
      error: (err) => console.error('Error loading quote picklists:', err)
    });
  }

  loadContacts(accountId: string) {
    this.sfApi.getContactsByAccount(accountId).subscribe({
      next: (res) => {
        if (res.records) {
          this.primaryContactOptions = res.records.map((r: any) => r.Name);
          if (!this.primaryContactName && this.primaryContactOptions.length > 0) {
            this.primaryContactName = this.primaryContactOptions[0];
          }
        }
      },
      error: (err) => console.error('Error loading contacts:', err)
    });
  }

  @HostListener('document:click')
  closeMenu() {
    this.primaryContactOpen = false;
    this.salesChannelOpen = false;
    this.operationTypeOpen = false;
  }

  // Dropdown Helpers for Subscription Flow
  closeAllDropdowns() {
    this.operationTypeOpen = false;
    this.primaryContactOpen = false;
    this.salesChannelOpen = false;
  }

  toggleOperationType() {
    const wasOpen = this.operationTypeOpen;
    this.closeAllDropdowns();
    this.operationTypeOpen = !wasOpen;
  }

  selectOperationType(type: string) {
    this.operationType = type;
    this.operationTypeOpen = false;
  }

  togglePrimaryContact() {
    const wasOpen = this.primaryContactOpen;
    this.closeAllDropdowns();
    this.primaryContactOpen = !wasOpen;
  }

  selectContact(contact: string) {
    this.primaryContactName = contact;
    this.primaryContactOpen = false;
  }

  toggleSalesChannel() {
    const wasOpen = this.salesChannelOpen;
    this.closeAllDropdowns();
    this.salesChannelOpen = !wasOpen;
  }

  selectChannel(channel: string) {
    this.salesChannel = channel;
    this.salesChannelOpen = false;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();

    return `${month} ${day},${year}`;
  }

  private setInitialExpirationDate() {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 45);
    this.expirationDate = expiry.toISOString().split('T')[0];
  }

  onSave(onSuccess?: () => void) {
    const quoteId = this.quoteDataService.getQuoteData().quoteId;
    if (!quoteId) {
      this.toastService.show('Quote ID not found', 'error');
      return;
    }

    this.loadingService.show();
    this.sfApi.patchQuoteDates(
      quoteId,
      new Date().toISOString().split('T')[0], // Use today for start date update if needed
      this.expirationDate
    ).subscribe({
      next: () => {
        // Also update other fields if needed via similar patch call
        this.loadingService.hide();
        this.toastService.show('Quote Details Saved Successfully!', 'success');
        if (onSuccess) onSuccess();
      },
      error: () => this.loadingService.hide()
    });
  }

  onSkipAndSave() {
    this.onSave();
  }
}
