// import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { SalesforceApiService } from '../../services/salesforce-api.service';
// import { Subscription } from 'rxjs';
// import { finalize } from 'rxjs/operators';

// type Mode = 'DISCOUNT' | 'INCENTIVE';

// interface ProductItem {
//   id: string;
//   name: string;
//   selected: boolean;
//   value: number;
//   deleted: boolean;
// }

// interface PendingChange {
//   action: 'EDIT' | 'DELETE';
//   originalValue: number;
//   originalSelected: boolean;
//   currentValue: number;
// }

// @Component({
//   selector: 'app-edit-discount-incentive',
//   standalone: true,
//   imports: [CommonModule],
//   templateUrl: 'edit-discount-incentive.component.html',
// })
// export class EditDiscountIncentiveComponent implements OnInit, OnChanges, OnDestroy {

//   protected Math = Math;

//   @Input() mode: Mode = 'DISCOUNT';
//   @Input() quoteId: string = '';

//   @Output() close = new EventEmitter<void>();
//   @Output() submitPayload = new EventEmitter<any>();

//   private currentRequest: Subscription | null = null;

//   private readonly TOTAL_SIZE: number = 50;

//   constructor(private sfApi: SalesforceApiService) {}


//   paginatedItems: ProductItem[] = [];

//   // Pagination
//   pageSize: number = 10;
//   currentPage: number = 0;
//   pageOptions = [10, 25, 50, 100];
//   totalCount: number = 0;
//   isPageLoading: boolean = false;

//   bulkValue: number | null = null;
//   isAllSelected: boolean = false;

//   pendingChanges = new Map<string, PendingChange>();
//   committedSnapshots = new Map<string, { value: number; selected: boolean }>();

//   get isDiscountMode(): boolean {
//     return this.mode === 'DISCOUNT';
//   }

//   get totalPages(): number {
//     return Math.ceil(this.totalCount / this.pageSize);
//   }

//   ngOnInit() {
//     this.loadPage();
//   }

//   ngOnDestroy() {
//     if (this.currentRequest) {
//       this.currentRequest.unsubscribe();
//     }
//   }

//   ngOnChanges(changes: SimpleChanges) {
//     if (changes['mode'] && !changes['mode'].firstChange) {
//       this.resetState();
//       this.loadPage();
//     }
//     if (changes['quoteId'] && !changes['quoteId'].firstChange) {
//       this.resetState();
//       this.loadPage();
//     }
//   }

//   private resetState() {
//     this.currentPage = 0;
//     this.bulkValue = null;
//     this.pendingChanges.clear();
//     this.committedSnapshots.clear();
//   }

//   loadPage() {
//     if (this.currentRequest) {
//       this.currentRequest.unsubscribe();
//     }

//     this.isPageLoading = true;

//     const limit = this.pageSize;
//     const offset = this.currentPage * this.pageSize;

//     const apiCall = this.isDiscountMode
//       ? this.sfApi.getDiscounts(this.quoteId, limit, offset)
//       : this.sfApi.getIncentives(this.quoteId, limit, offset);

//     this.currentRequest = apiCall.pipe(
//       finalize(() => this.isPageLoading = false)
//     ).subscribe({
//       next: (response: any) => {
//         const records = Array.isArray(response) ? response : (response?.records || response?.result || []);

//         const items: ProductItem[] = records.map((record: any) => ({
//           id: record.Id || record.id,
//           name: record.Name || record.name || 'Unknown',
//           selected: false,
          
//           value: record.value !== undefined ? Number(record.value) : (
//             this.isDiscountMode
//               ? (Number(record.Discount) || Number(record.discount) || 0)
//               : (Number(record.Incentive) || Number(record.incentive) || Number(record.Incentive__c) || 0)
//           ),
//           deleted: false
//         }));

//         console.log(`Loaded discounts/incentives`, items);

//         this.totalCount = this.TOTAL_SIZE;

//         this.applyPageData(items);
//       },
//       error: (err: any) => {
//         console.error(`Error loading ${this.isDiscountMode ? 'discounts' : 'incentives'}:`, err);
//         this.paginatedItems = [];
//         this.totalCount = 0;
//       }
//     });
//   }

//   private applyPageData(items: ProductItem[]) {
//     items.forEach(item => {
//       // Save the committed (server) snapshot if we haven't already
//       if (!this.committedSnapshots.has(item.id)) {
//         this.committedSnapshots.set(item.id, {
//           value: item.value,
//           selected: item.selected
//         });
//       }

//       const pending = this.pendingChanges.get(item.id);
//       if (pending) {
//         if (pending.action === 'DELETE') {
//           item.deleted = true;
//           item.selected = pending.originalSelected;
//           item.value = pending.currentValue;
//         } else if (pending.action === 'EDIT') {
//           item.selected = true;
//           item.value = pending.currentValue;
//         }
//       }
//     });

//     this.paginatedItems = items;
//     this.updateSelectAllState();
//   }

//   private updateSelectAllState() {
//     const selectableItems = this.paginatedItems.filter(i => !i.deleted);
//     this.isAllSelected = selectableItems.length > 0 && selectableItems.every(i => i.selected);
//   }

//   toggleSelection(id: string) {
//     const item = this.paginatedItems.find(i => i.id === id);
//     if (!item || item.deleted) return;

//     if (item.selected) {
//       // Deselecting → rollback to committed state, remove from pendingChanges
//       const snapshot = this.committedSnapshots.get(id);
//       if (snapshot) {
//         item.value = snapshot.value;
//       }
//       item.selected = false;
//       this.pendingChanges.delete(id);
//     } else {
//       // Selecting → snapshot the current committed value
//       item.selected = true;
//       if (!this.committedSnapshots.has(id)) {
//         this.committedSnapshots.set(id, { value: item.value, selected: false });
//       }
//     }
//     this.updateSelectAllState();
//   }

//   toggleSelectAll() {
//     const selectableItems = this.paginatedItems.filter(i => !i.deleted);
//     const nextState = !this.isAllSelected;

//     selectableItems.forEach(item => {
//       if (nextState && !item.selected) {
//         // Selecting
//         item.selected = true;
//         if (!this.committedSnapshots.has(item.id)) {
//           this.committedSnapshots.set(item.id, { value: item.value, selected: false });
//         }
//       } else if (!nextState && item.selected) {
//         // Deselecting → rollback
//         const snapshot = this.committedSnapshots.get(item.id);
//         if (snapshot) {
//           item.value = snapshot.value;
//         }
//         item.selected = false;
//         this.pendingChanges.delete(item.id);
//       }
//     });

//     this.updateSelectAllState();
//   }

//   // --- Value Editing ---
//   updateItemValue(id: string, event: Event) {
//     const val = (event.target as HTMLInputElement).value;
//     const numVal = val === '' ? 0 : Number(val);

//     const item = this.paginatedItems.find(i => i.id === id);
//     if (!item || !item.selected || item.deleted) return;

//     item.value = Math.max(0, numVal);

//     // Track as a pending EDIT change
//     const snapshot = this.committedSnapshots.get(id);
//     this.pendingChanges.set(id, {
//       action: 'EDIT',
//       originalValue: snapshot?.value ?? item.value,
//       originalSelected: snapshot?.selected ?? false,
//       currentValue: item.value
//     });
//   }

//   updateBulkValue(event: Event) {
//     const val = (event.target as HTMLInputElement).value;
//     this.bulkValue = val === '' ? null : Math.max(0, Number(val));
//   }

//   applyBulkValue() {
//     if (this.bulkValue === null) return;

//     // Apply to ALL selected items across ALL pages via pendingChanges
//     // First, apply to current page items
//     this.paginatedItems.forEach(item => {
//       if (item.selected && !item.deleted) {
//         item.value = this.bulkValue as number;
//         const snapshot = this.committedSnapshots.get(item.id);
//         this.pendingChanges.set(item.id, {
//           action: 'EDIT',
//           originalValue: snapshot?.value ?? item.value,
//           originalSelected: snapshot?.selected ?? false,
//           currentValue: this.bulkValue as number
//         });
//       }
//     });

//     // Also update any pending EDIT items on other pages that are selected
//     this.pendingChanges.forEach((change, id) => {
//       if (change.action === 'EDIT' && !this.paginatedItems.find(i => i.id === id)) {
//         change.currentValue = this.bulkValue as number;
//       }
//     });

//     this.bulkValue = null;
//   }

//   // --- Soft Delete & Restore ---
//   removeItem(id: string) {
//     const item = this.paginatedItems.find(i => i.id === id);
//     if (!item || item.deleted) return;

//     item.deleted = true;

//     const snapshot = this.committedSnapshots.get(id);
//     this.pendingChanges.set(id, {
//       action: 'DELETE',
//       originalValue: snapshot?.value ?? item.value,
//       originalSelected: snapshot?.selected ?? item.selected,
//       currentValue: item.value
//     });

//     this.updateSelectAllState();
//   }

//   restoreItem(id: string) {
//     const item = this.paginatedItems.find(i => i.id === id);
//     if (!item || !item.deleted) return;

//     item.deleted = false;

//     // Restore to the committed snapshot
//     const snapshot = this.committedSnapshots.get(id);
//     if (snapshot) {
//       item.value = snapshot.value;
//       item.selected = snapshot.selected;
//     }

//     // Remove from pending changes
//     this.pendingChanges.delete(id);

//     this.updateSelectAllState();
//   }

//   // --- Pagination ---
//   changePageSize(event: Event) {
//     const size = Number((event.target as HTMLSelectElement).value);
//     this.pageSize = size;
//     this.currentPage = 0;
//     this.loadPage();
//   }

//   nextPage() {
//     if ((this.currentPage + 1) * this.pageSize < this.totalCount) {
//       this.currentPage++;
//       this.loadPage();
//     }
//   }

//   prevPage() {
//     if (this.currentPage > 0) {
//       this.currentPage--;
//       this.loadPage();
//     }
//   }

//   trackById(index: number, item: ProductItem): string {
//     return item.id;
//   }

//   restrictNumeric(event: KeyboardEvent) {
//     const allowedKeys = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', '.', 'ArrowUp', 'ArrowDown'];
//     if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) return;

//     if (!/^[0-9]$/.test(event.key)) {
//       event.preventDefault();
//     }
//   }

//   closeModal() {
//     this.close.emit();
//   }

//   onSubmit() {
//     // Build the final payload from all pendingChanges across all pages
//     const edits: any[] = [];
//     const deletes: any[] = [];

//     this.pendingChanges.forEach((change, id) => {
//       if (change.action === 'DELETE') {
//         deletes.push({ id });
//       } else if (change.action === 'EDIT') {
//         edits.push({
//           id,
//           [this.isDiscountMode ? 'discount' : 'incentiveAmount']: change.currentValue
//         });
//       }
//     });

//     const payload = {
//       edits,
//       deletes,
//       mode: this.mode
//     };

//     this.submitPayload.emit(payload);
//     this.closeModal();
//   }
// }
