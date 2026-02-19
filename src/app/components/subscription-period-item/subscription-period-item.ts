import { Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';

export interface ProductItem {
    category: string;
    name: string;
    price?: number;
    nonProdPrice?: number;
    frequency?: string;
    productId?: string;
    pricebookEntryId?: string;
    nonProdProductId?: string | null;
    nonProdPricebookEntryId?: string | null;
    nonProdProductName?: string | null;
}

export interface UserTypeRow {
    type: string;
    quantity: number | null;
    region: string;
    gcpProjectId: string;
    lookerInstanceId: string;
    discount: number | null;
    price?: number;
    frequency?: string;
    productId?: string;
    pricebookEntryId?: string;
    name?: string;
}

export interface SubscriptionPeriod {
    id: string;
    name: string;
    productCategory: string;
    productName: string;
    startDate: string;
    endDate: string;
    discount: number | null;
    unitPrice: number | null;
    unitPriceFrequency?: string; // Added
    nonProdPrice: number | null;
    isExpanded: boolean;
    userRows: UserTypeRow[];
    productId?: string;
    pricebookEntryId?: string;
}

@Component({
    selector: 'app-subscription-period-item',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './subscription-period-item.html',
    styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
      display: block !important;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
      border: 2px solid #f1f1f1;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    /* Ensure the dropdown is visible over all containers */
    .region-dropdown {
      display: block !important;
      visibility: visible !important;
      z-index: 10000 !important;
    }
  `]
})
export class SubscriptionPeriodItemComponent {
    @Input() period!: SubscriptionPeriod;
    private _products: ProductItem[] = [];
    @Input()
    set products(value: ProductItem[]) {
        console.log('📦 SubscriptionPeriodItem: Received products:', value);
        this._products = value;
    }
    get products(): ProductItem[] {
        return this._products;
    }
    @Output() remove = new EventEmitter<void>();
    @Output() productChanged = new EventEmitter<void>();
    private toastService = inject(ToastService);
    activeRegionIndex: number | null = null;

    @Input() regionOptions: string[] = [];

    minDate: string = new Date().toISOString().split('T')[0];

    onDateChange() {
        if (!this.period.startDate || !this.period.endDate) return;

        const start = new Date(this.period.startDate);
        const end = new Date(this.period.endDate);

        if (end < start) {
            this.period.endDate = '';
            this.toastService.show('End Date cannot be earlier than Start Date.', 'warning');
            return;
        }

        // Limit to 1 year
        const limitDate = new Date(start);
        limitDate.setFullYear(limitDate.getFullYear() + 1);

        if (end > limitDate) {
            this.period.endDate = '';
            this.toastService.show('Period duration cannot exceed 1 year.', 'warning');
            return;
        }

        this.productChanged.emit();
    }

    toggleExpand() {
        this.period.isExpanded = !this.period.isExpanded;
    }

    onProductChange() {
        const selected = this.products.find(p => p.name.trim().toLowerCase() === this.period.productName.trim().toLowerCase());
        if (selected) {
            this.period.productCategory = selected.category;
            this.period.unitPrice = selected.price ?? null;
            this.period.unitPriceFrequency = selected.frequency;
            this.period.nonProdPrice = selected.nonProdPrice ?? null;
            this.period.productId = selected.productId;
            this.period.pricebookEntryId = selected.pricebookEntryId;

            const nonProdRow = this.period.userRows.find(r => r.type === 'Non-prod');
            if (nonProdRow) {
                nonProdRow.price = selected.nonProdPrice ?? 0;
                nonProdRow.frequency = selected.frequency;
                nonProdRow.name = selected.nonProdProductName || '';
            }
            this.productChanged.emit();
        }
    }

    @HostListener('document:click')
    closeDropdowns() {
        this.activeRegionIndex = null;
    }

    toggleRegionDropdown(index: number) {
        if (this.activeRegionIndex === index) {
            this.activeRegionIndex = null;
        } else {
            this.activeRegionIndex = index;
        }
    }

    selectRegion(index: number, region: string) {
        this.period.userRows[index].region = region;
        this.activeRegionIndex = null;
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

    getDurationLabel(): string {
        if (!this.period.startDate || !this.period.endDate) return '';
        const start = new Date(this.period.startDate);
        const end = new Date(this.period.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';

        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays <= 0) return '0M 0D (0 Days)';

        // Simple month/day logic for display
        const months = Math.floor(diffDays / 30.44); // Average month length
        const days = Math.round(diffDays % 30.44);

        if (diffDays >= 365 && diffDays <= 366) {
            return `12M 0D (${diffDays} Days)`;
        }

        return `${months}M ${days}D (${diffDays} Days)`;
    }
    restrictNumeric(event: KeyboardEvent) {
        const allowedKeys = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'End', 'Home'];
        if (allowedKeys.includes(event.key)) return;

        // Allow digits and at most one decimal point
        const isDigit = /[0-9]/.test(event.key);
        const isDot = event.key === '.';

        if (!isDigit && !isDot) {
            event.preventDefault();
        }

        // Prevent multiple dots
        if (isDot && (event.target as HTMLInputElement).value.includes('.')) {
            event.preventDefault();
        }
    }
}
