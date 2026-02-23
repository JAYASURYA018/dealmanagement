import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="loadingService.isLoading$ | async" 
         class="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 backdrop-blur-[2px] transition-all duration-300">
      <div class="flex flex-col items-center gap-4 p-8 bg-white rounded-3xl shadow-2xl border border-gray-100">
        <!-- Modern Spinner -->
        <div class="relative w-16 h-16">
          <div class="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
          <div class="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <div class="flex flex-col items-center">
          <span class="text-lg font-bold text-gray-900 tracking-tight">Loading</span>
          <span class="text-sm text-gray-500 font-medium">Please wait a moment</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `]
})
export class LoaderComponent {
  loadingService = inject(LoadingService);
}
