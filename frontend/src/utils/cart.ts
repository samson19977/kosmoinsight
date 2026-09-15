// ============================================
// Pure cart logic, extracted out of CartContext so it can be unit-tested
// without mounting a React component or touching localStorage.
//
// CartContext still owns all the React state/localStorage/toast wiring —
// this file only owns "given the current items, what should the new
// items/totals be."
// ============================================

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  packageType?: string;
}

export const MAX_QUANTITY_PER_ITEM = 100;

export interface AddToCartResult {
  items: CartItem[];
  capped: boolean; // true if the requested quantity was reduced to respect MAX_QUANTITY_PER_ITEM
}

/**
 * Adds `quantity` of a product to the cart, merging into an existing line
 * if the product is already present. Enforces MAX_QUANTITY_PER_ITEM.
 */
export function addToCart(
  items: CartItem[],
  product: { id: number; name: string; price?: number; priceRwf?: number; packageType?: string },
  quantity: number = 1
): AddToCartResult {
  const price = product.priceRwf ?? product.price ?? 0;
  const existing = items.find((i) => i.id === product.id);

  if (existing) {
    const desired = existing.quantity + quantity;
    const capped = desired > MAX_QUANTITY_PER_ITEM;
    const finalQty = Math.min(desired, MAX_QUANTITY_PER_ITEM);
    return {
      items: items.map((i) => (i.id === product.id ? { ...i, quantity: finalQty } : i)),
      capped,
    };
  }

  const capped = quantity > MAX_QUANTITY_PER_ITEM;
  const finalQty = Math.min(Math.max(quantity, 1), MAX_QUANTITY_PER_ITEM);
  return {
    items: [...items, { id: product.id, name: product.name, price, quantity: finalQty, packageType: product.packageType }],
    capped,
  };
}

/**
 * Sets a line's quantity directly (the sidebar's +/- buttons and any
 * manual-entry field). A quantity of 0 or less removes the line.
 * Enforces the SAME MAX_QUANTITY_PER_ITEM cap as addToCart — previously
 * the sidebar's +/- buttons called setState directly and could push a
 * line's quantity past 100 even though addToCart blocked it there.
 */
export function updateQuantity(items: CartItem[], id: number, quantity: number): AddToCartResult {
  if (quantity <= 0) {
    return { items: items.filter((i) => i.id !== id), capped: false };
  }
  const capped = quantity > MAX_QUANTITY_PER_ITEM;
  const finalQty = Math.min(quantity, MAX_QUANTITY_PER_ITEM);
  return {
    items: items.map((i) => (i.id === id ? { ...i, quantity: finalQty } : i)),
    capped,
  };
}

export function removeFromCart(items: CartItem[], id: number): CartItem[] {
  return items.filter((i) => i.id !== id);
}

export function calculateTotals(items: CartItem[]): { totalItems: number; totalPrice: number } {
  return {
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
    totalPrice: items.reduce((s, i) => s + i.price * i.quantity, 0),
  };
}
