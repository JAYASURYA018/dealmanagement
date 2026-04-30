import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product } from '../models/mock-data';

@Injectable({
    providedIn: 'root'
})
export class CartService {

    private readonly SESSION_KEY = 'cart_items';

    private cartItemsSubject = new BehaviorSubject<Product[]>(this.loadFromSession());
    cartItems$ = this.cartItemsSubject.asObservable();

    /** Load persisted cart from sessionStorage on app boot / page refresh */
    private loadFromSession(): Product[] {
        try {
            const raw = sessionStorage.getItem(this.SESSION_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    private saveToSession(items: Product[]): void {
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(items));
    }

    addToCart(product: Product) {
        const currentItems = this.cartItemsSubject.value;
        if (!currentItems.find(p => p.id === product.id)) {
            const updated = [...currentItems, product];
            this.cartItemsSubject.next(updated);
            this.saveToSession(updated);
        }
    }

    removeFromCart(productId: string) {
        const updated = this.cartItemsSubject.value.filter(p => p.id !== productId);
        this.cartItemsSubject.next(updated);
        this.saveToSession(updated);
    }

    getCartItems(): Product[] {
        return this.cartItemsSubject.value;
    }

    clearCart() {
        this.cartItemsSubject.next([]);
        sessionStorage.removeItem(this.SESSION_KEY);
    }
}
