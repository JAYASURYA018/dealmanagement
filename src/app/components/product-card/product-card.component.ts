import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Product } from '../../models/mock-data';
import { CartService } from '../../services/cart.service';
import { map } from 'rxjs/operators';

@Component({
    selector: 'app-product-card',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './product-card.component.html',
})
export class ProductCardComponent {
    @Input() product!: Product;
    cartService = inject(CartService);
    isAdded$ = this.cartService.cartItems$.pipe(
        map(items => !!items.find(item => item.id === this.product.id))
    );

    toggleCart() {
        const currentItems = this.cartService.getCartItems();
        const isAlreadyAdded = currentItems.find(item => item.id === this.product.id);

        if (isAlreadyAdded) {
            this.cartService.removeFromCart(this.product.id);
        } else {
            this.cartService.addToCart(this.product);
        }
    }

    getBadgeColor(tag: string): string {
        if (tag.includes('discount')) return 'bg-green-100 text-green-700 border-green-200';
        if (tag.includes('Promotions')) return 'bg-purple-100 text-purple-700 border-purple-200';
        if (tag.includes('incentives')) return 'bg-orange-100 text-orange-700 border-orange-200';
        if (tag.includes('Commission')) return 'bg-blue-100 text-blue-700 border-blue-200';
        return 'bg-gray-100 text-gray-700';
    }

    getBadgeIcon(tag: string): string {
        if (tag.includes('discount')) return '%';
        if (tag.includes('Promotions')) return 'sell';
        if (tag.includes('incentives')) return 'savings';
        if (tag.includes('Commission')) return 'emoji_events';
        return 'label';
    }
}
