import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
// import { UploadProductsService } from '../../services/upload-products.service';

@Component({
    selector: 'app-upload-products-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './upload-products-modal.component.html',
})
export class UploadProductsModalComponent {
    @Input() isOpen: boolean = false;
    @Output() close = new EventEmitter<void>();

    // private uploadService = inject(UploadProductsService);

    selectedFile: File | null = null;
    isDragging = false;
    isUploading = false;
    uploadProgress = 0;
    private uploadInterval: any;

    onClose() {
        this.cancelUpload();
        this.close.emit();
        this.resetFile();
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
            alert('Please upload only CSV files.');
        }
    }

    startSimulatedUpload() {
        if (!this.selectedFile) return;

        this.isUploading = true;
        this.uploadProgress = 0;

        this.uploadInterval = setInterval(() => {
            if (this.uploadProgress < 100) {
                this.uploadProgress += Math.floor(Math.random() * 10) + 5;
                if (this.uploadProgress > 100) this.uploadProgress = 100;
            } else {
                this.isUploading = false;
                clearInterval(this.uploadInterval);
            }
        }, 50);
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
    }
}
