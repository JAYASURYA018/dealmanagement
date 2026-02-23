import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product, ProductFamily } from '../models/mock-data';

@Injectable({
    providedIn: 'root'
})
export class ProductService {

    private families: ProductFamily[] = [
        { id: 'gcp', name: 'GCP', count: 1234 },
        { id: 'workspace', name: 'Workspace', count: 567 },
        { id: 'chrome', name: 'Chrome', count: 89 },
        { id: 'maps', name: 'Maps', count: 45 },
        { id: 'pso', name: 'PSO', count: 12 }
    ];

    private products: Product[] = [
        { id: '1', name: 'Vertex AI platform', description: 'Unified platform for ML models and generative AI', family: 'GCP', tags: [] },
        { id: '2', name: 'Vertex AI tool', description: 'Build, tune and deploy foundation models on Vertex AI', family: 'GCP', tags: [] },
        { id: '3', name: 'GCP', family: 'GCP', tags: ['Commission multiplier'] },
        { id: '4', name: 'Workspace', family: 'Workspace', tags: ['Promotions'] },
        { id: '5', name: 'GCP', family: 'GCP', tags: [] },
        { id: '6', name: 'Chrome', family: 'Chrome', tags: [] },
        { id: '7', name: 'Maps', family: 'Maps', tags: ['Pre-approved discount'] },
        { id: '8', name: 'GCP', family: 'GCP', tags: ['Additional incentives'] },
    ];

    getFamilies(): Observable<ProductFamily[]> {
        return of(this.families);
    }

    getProducts(): Observable<Product[]> {
        return of(this.products);
    }
}
