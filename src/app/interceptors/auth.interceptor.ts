import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { ContextService } from '../services/context.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const contextService = inject(ContextService);

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
                console.warn('[AuthInterceptor] 401 Detected. Attempting to refresh session...');
                return contextService.fetchSessionToken().pipe(
                    switchMap((newToken) => {
                        console.log('[AuthInterceptor] Token refreshed. Retrying request...');
                        const newReq = req.clone({
                            setHeaders: {
                                Authorization: `Bearer ${newToken}`
                            }
                        });
                        return next(newReq);
                    }),
                    catchError((refreshErr) => {
                        console.error('[AuthInterceptor] Token refresh failed.', refreshErr);
                        return throwError(() => refreshErr);
                    })
                );
            }
            return throwError(() => error);
        })
    );
};
