import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'app-upload-products-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './upload-products-modal.component.html',
})
export class UploadProductsModalComponent {
    @Input() isOpen: boolean = false;
    @Input() selectedPeriodName: string = '';
    @Input() selectedStartDate: string = '';
    @Input() selectedEndDate: string = '';
    @Input() remainingQuota: number = 1000;
    @Output() close = new EventEmitter<void>();
    @Output() finish = new EventEmitter<any[]>();

    private toastService = inject(ToastService);

    selectedFile: File | null = null;
    isDragging = false;
    isUploading = false;
    uploadProgress = 0;
    private uploadInterval: any;

    // New properties for Workflow
    currentStep: 'upload' | 'preview' = 'upload';
    csvData: any[] = [];
    filteredCsvData: any[] = [];
    headers: string[] = [];

    // Required headers from screenshot
    readonly REQUIRED_HEADERS = [
        'ProductID',
        'ProductName',
        'PricebookEntryID',
        'SortOrder',
        'DiscountType',
        'Discount %'
    ];
    
    // Pagination
    currentPage = 1;
    pageSize = 10;
    pageSizeOptions = [10, 20, 50, 100];
    paginatedData: any[] = [];

    showDownloadPopup = false;

    onClose() {
        this.cancelUpload();
        this.close.emit();
        this.resetFile();
    }

    onFinish() {
        if (this.filteredCsvData.length > 0) {
            this.finish.emit(this.filteredCsvData);
            this.onClose();
        }
    }

    formatDate(dateStr: string): string {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        });
    }

    downloadTemplate() {
        this.showDownloadPopup = true;
    }

    confirmDownload() {
        this.showDownloadPopup = false;
        const templateUrl = 'https://vector--rcaagivant.sandbox.my.salesforce.com/sfc/p/Dz000001qvYA/a/Dz0000009rl1/BfkrJBCxB_wo8SNTcPqTCkxuqPrsVAVN9bYHvidK6iQ';
        window.open(templateUrl, '_blank');
    }

    cancelDownloadPopup() {
        this.showDownloadPopup = false;
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = true;
    }

    onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;

        const file = event.dataTransfer?.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    private handleFile(file: File) {
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            this.selectedFile = file;
            this.startSimulatedUpload();
        } else {
            this.toastService.show('Please upload only CSV files.', 'error');
        }
    }

    startSimulatedUpload() {
        if (!this.selectedFile) return;

        this.isUploading = true;
        this.uploadProgress = 0;

        this.uploadInterval = setInterval(() => {
            if (this.uploadProgress < 100) {
                this.uploadProgress += Math.floor(Math.random() * 20) + 10;
                if (this.uploadProgress > 100) this.uploadProgress = 100;
            } else {
                this.isUploading = false;
                clearInterval(this.uploadInterval);
                this.readAndParseCSV();
            }
        }, 100);
    }

    private readAndParseCSV() {
        if (!this.selectedFile) return;

        const reader = new FileReader();
        reader.onload = (e: any) => {
            const text = e.target.result;
            this.parseCSV(text);
        };
        reader.readAsText(this.selectedFile);
    }

    private parseCSV(text: string) {
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) return;

        // Get headers
        const rawHeaders = lines[0].split(',');
        this.headers = rawHeaders.map(h => h.trim());

        // Validate Headers against REQUIRED_HEADERS
        const missingHeaders = this.REQUIRED_HEADERS.filter(
            required => !this.headers.some(h => h.toLowerCase() === required.toLowerCase())
        );

        if (missingHeaders.length > 0) {
            this.toastService.show(`Invalid CSV template. Missing columns: ${missingHeaders.join(', ')}`, 'error');
            this.resetFile();
            return;
        }

        // Find discount column index (case-insensitive search for 'discount %')
        const discountIndex = this.headers.findIndex(h => h.toLowerCase().includes('discount %'));

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',');
            const row: any = {};
            this.headers.forEach((header, index) => {
                row[header] = values[index] ? values[index].trim() : '';
            });

            // Filtering logic: only rows with a discount value in the discount column
            if (discountIndex !== -1) {
                const discountValueStr = values[discountIndex]?.trim();
                if (discountValueStr && discountValueStr !== '') {
                    const discountValue = parseFloat(discountValueStr);
                    
                    if (isNaN(discountValue)) continue;

                    // Range Validation: Should be between 1 and 100
                    if (discountValue <= 0 || discountValue > 100) {
                        this.toastService.show(`Invalid discount value for product: ${row['ProductName'] || 'Unknown'}. Discount must be between 1 and 100.`, 'error');
                        this.resetFile();
                        return;
                    }
                    rows.push(row);
                }
            }
        }

        if (rows.length > this.remainingQuota) {
            this.toastService.show(`Only ${this.remainingQuota} products can still be added. Your file contains ${rows.length}.`, 'warning');
            this.resetFile();
            return;
        }

        this.filteredCsvData = rows;
        this.currentPage = 1;
        this.applyPagination();
    }

    applyPagination() {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.paginatedData = this.filteredCsvData.slice(start, end);
    }

    nextStep() {
        if (this.uploadProgress === 100) {
            this.currentStep = 'preview';
        }
    }

    prevStep() {
        this.currentStep = 'upload';
    }

    onPageChange(page: number) {
        this.currentPage = page;
        this.applyPagination();
    }

    onPageSizeChange(event: any) {
        this.pageSize = parseInt(event.target.value, 10);
        this.currentPage = 1;
        this.applyPagination();
    }

    get totalPages(): number {
        return Math.ceil(this.filteredCsvData.length / this.pageSize);
    }

    cancelUpload() {
        if (this.uploadInterval) {
            clearInterval(this.uploadInterval);
        }
        this.resetFile();
    }

    private resetFile() {
        this.selectedFile = null;
        this.isDragging = false;
        this.isUploading = false;
        this.uploadProgress = 0;
        this.currentStep = 'upload';
        this.filteredCsvData = [];
        this.paginatedData = [];
    }
}
