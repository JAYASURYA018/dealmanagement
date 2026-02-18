import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none pr-4 sm:pr-0">
            <div *ngFor="let toast of toastService.toasts$ | async; trackBy: trackById"
                class="pointer-events-auto transform transition-all duration-300 ease-in-out hover:scale-[1.02] shadow-lg rounded-lg overflow-hidden border-l-4 p-4 flex items-start gap-3 bg-white"
                [ngClass]="getClasses(toast.type)">
                
                <!-- Icon -->
                <span class="material-icons-outlined text-xl shrink-0" [ngClass]="getIconColor(toast.type)">
                    {{ getIcon(toast.type) }}
                </span>

                <!-- Message -->
                <div class="flex-1 text-sm font-medium text-gray-800 break-words leading-tight py-0.5">
                    {{ toast.message }}
                </div>

                <!-- Close Button -->
                <button (click)="toastService.remove(toast.id)" class="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                    <span class="material-icons-outlined text-lg">close</span>
                </button>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: contents;
        }
    `]
})
export class ToastComponent {
    toastService = inject(ToastService);

    trackById(index: number, toast: Toast): number {
        return toast.id;
    }

    getClasses(type: string): string {
        switch (type) {
            case 'success': return 'border-green-500';
            case 'error': return 'border-red-500';
            case 'warning': return 'border-yellow-500';
            case 'info': return 'border-blue-500';
            default: return 'border-gray-500';
        }
    }

    getIconColor(type: string): string {
        switch (type) {
            case 'success': return 'text-green-500';
            case 'error': return 'text-red-500';
            case 'warning': return 'text-yellow-500';
            case 'info': return 'text-blue-500';
            default: return 'text-gray-500';
        }
    }

    getIcon(type: string): string {
        switch (type) {
            case 'success': return 'check_circle';
            case 'error': return 'error';
            case 'warning': return 'warning';
            case 'info': return 'info';
            default: return 'info';
        }
    }
}
