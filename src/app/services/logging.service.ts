import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ApiLogMetric {
    url: string;
    method: string;
    status: number;
    startTime: string; // ISO String
    durationMs: number;
    user?: string;
    error?: string;
    clientSource?: string; // e.g. http://localhost:4200 or https://dealmanagement.vercel.app
    apiName?: string;
    description?: string;
}

@Injectable({
    providedIn: 'root'
})
export class LoggingService {
    private logQueue: ApiLogMetric[] = [];
    // Use endpoint from environment config (handles local vs prod)
    private readonly LOG_ENDPOINT = environment.loggingEndpoint;
    private readonly BATCH_SIZE = 10;
    private readonly FLUSH_INTERVAL_MS = 10000; // 10 seconds

    private http: HttpClient;
    private httpBackend = inject(HttpBackend);

    constructor() {
        // Use HttpBackend to bypass interceptors (prevent infinite logging loops)
        this.http = new HttpClient(this.httpBackend);

        // Auto-flush periodically
        setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);

        // Expose download function globally for easy access
        (window as any).downloadApiLogs = () => this.downloadAllLogs();
        (window as any).clearApiLogs = () => this.clearAllLogs();
        // console.log('💡 [LoggingService] Use window.downloadApiLogs() to download CSV or window.clearApiLogs() to clear');
    }

    logMetric(metric: ApiLogMetric) {
        // Add current origin to the metric
        metric.clientSource = window.location.origin;

        const displayName = metric.apiName || 'API Call';
        console.log(`📊 [LoggingService] ${displayName}: ${metric.method} ${metric.url} - ${metric.status} (${metric.durationMs}ms)`);
        this.logQueue.push(metric);
        if (this.logQueue.length >= this.BATCH_SIZE) {
            this.flush();
        }
    }

    private flush() {
        if (this.logQueue.length === 0) return;

        const payload = [...this.logQueue];
        this.logQueue = []; // Clear queue immediately

        console.log(`💾 [LoggingService] Saving ${payload.length} API logs to OneDrive folder...`);

        // Display in console table for quick viewing
        console.table(payload.map(p => ({
            Time: new Date(p.startTime).toLocaleTimeString(),
            'API Name': p.apiName || 'General',
            Method: p.method,
            URL: p.url.substring(p.url.lastIndexOf('/') + 1, Math.min(p.url.length, p.url.lastIndexOf('/') + 50)),
            Status: p.status,
            Duration: `${p.durationMs}ms`,
            Error: p.error || '-'
        })));

        // Send to backend API to save to file system
        this.http.post(this.LOG_ENDPOINT, payload).pipe(
            catchError(err => {
                console.error('❌ [LoggingService] Failed to save logs to file system:', err);
                console.log('💡 [LoggingService] Falling back to localStorage...');
                this.saveToLocalStorage(payload);
                return of(null);
            })
        ).subscribe(response => {
            if (response) {
                console.log(`✅ [LoggingService] Logs saved to: ${(response as any).filepath}`);
            }
        });
    }

    private saveToLocalStorage(newLogs: ApiLogMetric[]) {
        try {
            // Get existing logs from localStorage
            const existingLogsJson = localStorage.getItem('api_logs');
            const existingLogs: ApiLogMetric[] = existingLogsJson ? JSON.parse(existingLogsJson) : [];

            // Append new logs
            const allLogs = [...existingLogs, ...newLogs];

            // Save back to localStorage
            localStorage.setItem('api_logs', JSON.stringify(allLogs));

            console.log(`✅ [LoggingService] Saved to localStorage. Total logs: ${allLogs.length}`);
            console.log(`📊 [LoggingService] To download CSV, run: window.downloadApiLogs()`);
        } catch (error) {
            console.error('❌ [LoggingService] Failed to save to localStorage:', error);
        }
    }

    // Public method to download all logs as CSV
    public downloadAllLogs() {
        try {
            const logsJson = localStorage.getItem('api_logs');
            if (!logsJson) {
                console.warn('⚠️ [LoggingService] No logs found in localStorage');
                return;
            }

            const logs: ApiLogMetric[] = JSON.parse(logsJson);
            console.log(`📥 [LoggingService] Downloading ${logs.length} logs...`);

            this.downloadCSV(logs);
        } catch (error) {
            console.error('❌ [LoggingService] Failed to download logs:', error);
        }
    }

    // Public method to clear all logs
    public clearAllLogs() {
        localStorage.removeItem('api_logs');
        console.log('🗑️ [LoggingService] All logs cleared from localStorage');
    }

    private downloadCSV(logs: ApiLogMetric[]) {
        // CSV Header
        const headers = ['Start Time', 'End Time', 'API URL', 'Method', 'Status', 'Duration (ms)', 'Error', 'User'];

        // Convert logs to CSV rows
        const rows = logs.map(log => {
            const start = new Date(log.startTime);
            const end = new Date(start.getTime() + log.durationMs);

            return [
                this.formatDateForCSV(start),
                this.formatDateForCSV(end),
                log.url,
                log.method,
                log.status,
                log.durationMs,
                log.error || '',
                log.user || 'system'
            ];
        });

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        // Format filename with current date and time in IST
        const now = new Date();
        const dateStr = now.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/[/,:\s]/g, '-');

        const filename = `API-Logs-${dateStr}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`✅ [LoggingService] CSV file downloaded: ${filename}`);
        console.log(`📁 [LoggingService] File will be in your Downloads folder. Move it to: C:\\Users\\admin\\OneDrive - Agivant Technlogies India Pvt. Ltd\\Agivant Projects`);
    }

    private formatDateForCSV(date: Date): string {
        // Format as IST: DD/MM/YYYY HH:MM:SS
        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}
