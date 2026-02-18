import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-subscription-periods-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './subscription-periods-modal.html',
})
export class SubscriptionPeriodsModalComponent {
    @Input() isOpen: boolean = false;
    @Output() close = new EventEmitter<void>();
    @Output() create = new EventEmitter<string>();

    selectedFrequency: string = 'Yearly';
    frequencyOptions: string[] = ['Yearly', 'Custom'];
    frequencyOpen: boolean = false;

    onClose() {
        this.frequencyOpen = false;
        this.close.emit();
    }

    onCreate() {
        this.create.emit(this.selectedFrequency);
        this.onClose();
    }

    selectFrequency(freq: string) {
        this.selectedFrequency = freq;
        this.frequencyOpen = false;
    }

    @HostListener('document:click')
    closeDropdown() {
        this.frequencyOpen = false;
    }
}
