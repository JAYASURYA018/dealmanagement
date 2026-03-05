import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject } from '@angular/core';
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
export class SubscriptionPeriodItemComponent implements OnInit {
    private _period!: SubscriptionPeriod;
    @Input()
    set period(value: SubscriptionPeriod) {
        this._period = value;
        if (value) {
            this.lastValidStartDate = value.startDate;
            this.lastValidEndDate = value.endDate;
        }
    }
    get period(): SubscriptionPeriod {
        return this._period;
    }
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
    @Input() isFirst: boolean = false;
    @Input() isLast: boolean = false;
    @Input() subscriptionStartDate: string = '';
    @Input() subscriptionEndDate: string = '';

    minDate: string = new Date().toISOString().split('T')[0];
    private lastValidStartDate: string = '';
    private lastValidEndDate: string = '';
    menuOpen: boolean = false;
    platformDropdownOpen: boolean = false;

    ngOnInit() {
    }

    toggleMenu(event: Event) {
        this.menuOpen = !this.menuOpen;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const isMenuClick = target.closest('.period-menu-container');

        if (!isMenuClick) {
            this.menuOpen = false;
        }

        // Always close region dropdowns if clicking outside the region area
        const isRegionClick = target.closest('.region-dropdown-container');
        if (!isRegionClick) {
            this.activeRegionIndex = null;
        }

        // Close platform dropdown if clicking outside
        const isPlatformClick = target.closest('.platform-dropdown-container');
        if (!isPlatformClick) {
            this.platformDropdownOpen = false;
        }
    }

    get maxEndDate(): string {
        if (!this.period.startDate) return '';
        const start = this.parseDateString(this.period.startDate);
        const max = new Date(start);
        max.setFullYear(max.getFullYear() + 1);
        max.setDate(max.getDate() - 1);
        return max.toISOString().split('T')[0];
    }

    onDateChange() {
        if (!this.period.startDate || !this.period.endDate) return;

        const start = new Date(this.period.startDate);
        const end = new Date(this.period.endDate);

        if (end < start) {
            this.period.startDate = this.lastValidStartDate;
            this.period.endDate = this.lastValidEndDate;
            this.toastService.show('End Date cannot be earlier than Start Date.', 'error');
            return;
        }

        // Period 1 Start Date Validation
        if (this.isFirst && this.subscriptionStartDate && this.period.startDate !== this.subscriptionStartDate) {
            this.period.startDate = this.subscriptionStartDate; // Revert to subscription start
            this.lastValidStartDate = this.period.startDate; // Sync valid state
            this.toastService.show('The Period 1 start date must equal to subscription start date', 'error');
            return;
        }

        // Last Period End Date Validation
        if (this.isLast && this.subscriptionEndDate && this.period.endDate !== this.subscriptionEndDate) {
            this.period.endDate = this.subscriptionEndDate; // Revert to subscription end
            this.lastValidEndDate = this.period.endDate; // Sync valid state
            this.toastService.show('The last period end date should equal to subscription end date', 'error');
            return;
        }

        // Limit to 1 year
        const limitDate = new Date(start);
        limitDate.setFullYear(limitDate.getFullYear() + 1);
        limitDate.setDate(limitDate.getDate() - 1);

        if (end > limitDate) {
            this.period.startDate = this.lastValidStartDate;
            this.period.endDate = this.lastValidEndDate;
            this.toastService.show('Period duration cannot exceed 1 year.', 'error');
            return;
        }

        // All passed - update last valid state
        this.lastValidStartDate = this.period.startDate;
        this.lastValidEndDate = this.period.endDate;
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

    togglePlatformDropdown() {
        this.platformDropdownOpen = !this.platformDropdownOpen;
    }

    selectPlatformProduct(product: ProductItem) {
        this.period.productName = product.name;
        this.onProductChange();
        this.platformDropdownOpen = false;
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
        return this.formatTermDisplay(this.period.startDate, this.period.endDate);
    }

    formatTermDisplay(startDate: string, endDate: string): string {
        if (!startDate || !endDate) return '';
        const start = this.parseDateString(startDate);
        const end = this.parseDateString(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';

        const endAdjusted = new Date(end);
        endAdjusted.setDate(endAdjusted.getDate() + 1);

        let months = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());
        const temp = new Date(start);
        temp.setMonth(temp.getMonth() + months);

        if (temp > endAdjusted) {
            months--;
            temp.setTime(start.getTime());
            temp.setMonth(temp.getMonth() + months);
        }

        const diffTime = endAdjusted.getTime() - temp.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        let res = '';
        if (months > 0) res += `${months} Month${months > 1 ? 's' : ''} `;
        if (diffDays > 0) res += `${diffDays} Day${diffDays > 1 ? 's' : ''}`;
        return res.trim() || '0 Months';
    }

    calculateFractionalTerm(startDate: string, endDate: string): number {
        if (!startDate || !endDate) return 0;
        const start = this.parseDateString(startDate);
        const end = this.parseDateString(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

        const endAdjusted = new Date(end);
        endAdjusted.setDate(endAdjusted.getDate() + 1);

        let months = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());
        const temp = new Date(start);
        temp.setMonth(temp.getMonth() + months);

        if (temp > endAdjusted) {
            months--;
            temp.setTime(start.getTime());
            temp.setMonth(temp.getMonth() + months);
        }

        const diffTime = endAdjusted.getTime() - temp.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return months;

        const daysInMonth = new Date(temp.getFullYear(), temp.getMonth() + 1, 0).getDate();
        return (months + (diffDays / daysInMonth));
    }

    private parseDateString(dateStr: string): Date {
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    private toIsoDateString(date: Date): string {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    restrictNumeric(event: KeyboardEvent) {
        const allowedKeys = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'End', 'Home'];

        // Allow navigation keys and shortcuts (Ctrl/Cmd + A, C, V, X, Z)
        if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
            return;
        }

        // Block 'e', 'E', '+', '-' explicitly
        if (['e', 'E', '+', '-'].includes(event.key)) {
            event.preventDefault();
            return;
        }

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

    validateDiscount(event: any) {
        let value = event.target.value;
        if (value < 0) {
            this.period.discount = 0;
            event.target.value = 0;
        }
        else if (value > 100) {
            this.toastService.show('Discount cannot be more than 100%.', 'error');
            this.period.discount = null;
            event.target.value = '';
        }
    }

    validateRowDiscount(event: any, row: UserTypeRow) {
        let value = event.target.value;
        if (value < 0) {
            row.discount = 0;
            event.target.value = 0;
        }
        else if (value > 100) {
            this.toastService.show('Discount cannot be more than 100%.', 'error');
            row.discount = null;
            event.target.value = '';
        }
    }

    validateQuantity(event: any, row: UserTypeRow) {
        let value = event.target.value;
        if (value < 0) {
            row.quantity = 0;
            event.target.value = 0;
        }
        this.productChanged.emit();
    }

    onBlurDiscount() {
        if (this.period.discount === null || this.period.discount === undefined) {
            this.period.discount = 0;
        }
    }

    onBlurRowDiscount(row: UserTypeRow) {
        if (row.discount === null || row.discount === undefined) {
            row.discount = 0;
        }
    }

    onBlurQuantity(row: UserTypeRow) {
        if (row.quantity === null || row.quantity === undefined) {
            row.quantity = 0;
        }
        this.productChanged.emit();
    }
}
