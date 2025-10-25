interface CartItem {
  id: string;
  price: number;
  quantity: number;
  totalPrice: number;
}

interface Cart {
  userId: string;
  items: CartItem[];
  totalItems: number;
  totalValue: number;
  createdAt: Date;
  updatedAt: Date;
}

// Use globalThis to ensure persistence across API calls
const globalForCart = globalThis as unknown as {
  cartStore: Map<string, Cart> | undefined;
};

class CartCache {
  private carts: Map<string, Cart>;

  constructor() {
    if (!globalForCart.cartStore) {
      globalForCart.cartStore = new Map<string, Cart>();
    }
    this.carts = globalForCart.cartStore;
  }

  // ...existing code...
  async addItemToCart(userId: string, item: CartItem): Promise<void> {
    if (!this.carts.has(userId)) {
      this.carts.set(userId, {
        userId: userId,
        items: [],
        totalItems: 0,
        totalValue: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const cart = this.carts.get(userId)!;
    
    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(cartItem => cartItem.id === item.id);
    
    if (existingItemIndex >= 0) {
      // Update existing item quantity
      cart.items[existingItemIndex].quantity += item.quantity;
    } else {
      // Add new item to cart
      cart.items.push(item);
    }

    // Recalculate totals
    cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
    cart.totalValue = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    cart.updatedAt = new Date();
    
    this.carts.set(userId, cart);
  }

  async removeItemFromCart(userId: string, itemId: string): Promise<void> {
    const cart = this.carts.get(userId);
    if (!cart) return;

    cart.items = cart.items.filter(item => item.id !== itemId);
    cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
    cart.totalValue = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    cart.updatedAt = new Date();
    
    this.carts.set(userId, cart);
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number): Promise<void> {
    const cart = this.carts.get(userId);
    if (!cart) return;

    const itemIndex = cart.items.findIndex(item => item.id === itemId);
    if (itemIndex >= 0) {
      if (quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = quantity;
      }

      cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      cart.totalValue = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      cart.updatedAt = new Date();
      
      this.carts.set(userId, cart);
    }
  }

  getUserCart(userId: string): Cart | null {
    return this.carts.get(userId) || null;
  }

  getAllCarts(): Cart[] {
    return Array.from(this.carts.values());
  }

  getCartCount(): number {
    return this.carts.size;
  }

  clearCart(userId: string): void {
    this.carts.delete(userId);
  }

  clearAllCarts(): void {
    this.carts.clear();
  }
}

export const cartCache = new CartCache();
export type { CartItem, Cart };