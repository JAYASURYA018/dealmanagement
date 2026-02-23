import { HttpInterceptorFn, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap, finalize } from 'rxjs';
import { LoggingService } from '../services/logging.service';
import { getApiDetails } from '../utils/api-log-helper';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
    const loggingService = inject(LoggingService);
    const startTime = performance.now();
    const url = req.url;

    // Skip logging for the logging endpoint itself or internal assets if needed
    if (url.includes('google-cloud-logger') || url.includes('assets/')) {
        return next(req);
    }

    // Get API details (Name & Description)
    const apiDetails = getApiDetails(url, req.method, req.body);

    return next(req).pipe(
        tap({
            next: (event) => {
                if (event instanceof HttpResponse) {
                    const duration = performance.now() - startTime;
                    loggingService.logMetric({
                        url,
                        method: req.method,
                        status: event.status,
                        startTime: new Date().toISOString(),
                        durationMs: Math.round(duration),
                        user: 'system', // Placeholder, could be dynamic
                        apiName: apiDetails.name,
                        description: apiDetails.description
                    });
                }
            },
            error: (error: HttpErrorResponse) => {
                const duration = performance.now() - startTime;
                loggingService.logMetric({
                    url,
                    method: req.method,
                    status: error.status || 0,
                    startTime: new Date().toISOString(),
                    durationMs: Math.round(duration),
                    error: error.message,
                    user: 'system',
                    apiName: apiDetails.name,
                    description: apiDetails.description
                });
            }
        })
    );
};
