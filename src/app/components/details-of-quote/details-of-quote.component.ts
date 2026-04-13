import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  accountName = 'Cymbol';
  // Primary Contact State
  primaryContactName = '';
  primaryContactOpen = false;
  primaryContactOptions = ['Alex Morgan', 'Yin Jye Lee', 'Sarah Connor', 'John Doe'];
  
  // Sales Channel State
  salesChannel = '';
  salesChannelOpen = false;
  salesChannelOptions = ['Reseller', 'Partner', 'Direct'];
  
  // Operation Type State
  operationType = 'New';
  operationTypeOpen = false;
  operationTypeOptions = ['New', 'Renewal', 'Amendments'];

  // Expiration Date State
  expirationDate = '';
  minDate = new Date().toISOString().split('T')[0];

  ngOnInit() {
    this.setInitialExpirationDate();
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

  toIsoDateString(date: Date): string {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
