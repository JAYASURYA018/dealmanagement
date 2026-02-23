import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product } from '../models/mock-data';

@Injectable({
    providedIn: 'root'
})
export class CartService {

    private cartItemsSubject = new BehaviorSubject<Product[]>([]);
    cartItems$ = this.cartItemsSubject.asObservable();

    addToCart(product: Product) {
        const currentItems = this.cartItemsSubject.value;
        // Check if already in cart to avoid duplicates if needed, or allow multiples.
        // Assuming unique products for now based on ID.
        if (!currentItems.find(p => p.id === product.id)) {
            this.cartItemsSubject.next([...currentItems, product]);
        }
    }

    removeFromCart(productId: string) {
        const currentItems = this.cartItemsSubject.value;
        this.cartItemsSubject.next(currentItems.filter(p => p.id !== productId));
    }

    getCartItems(): Product[] {
        return this.cartItemsSubject.value;
    }

    clearCart() {
        this.cartItemsSubject.next([]);
    }
}
