import { describe, it, expect } from 'vitest';
import { addToCart, updateQuantity, removeFromCart, calculateTotals, MAX_QUANTITY_PER_ITEM, type CartItem } from '../src/utils/cart';

const product = (id: number, price: number, name = `Product ${id}`) => ({ id, name, price });

describe('addToCart', () => {
  it('adds a new product as a new line', () => {
    const result = addToCart([], product(1, 6000), 2);
    expect(result.items).toEqual([{ id: 1, name: 'Product 1', price: 6000, quantity: 2, packageType: undefined }]);
    expect(result.capped).toBe(false);
  });

  it('merges into an existing line instead of duplicating it', () => {
    const existing: CartItem[] = [{ id: 1, name: 'Product 1', price: 6000, quantity: 2 }];
    const result = addToCart(existing, product(1, 6000), 3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(5);
  });

  it('prefers priceRwf over price when both are present (matches the product API shape)', () => {
    const result = addToCart([], { id: 1, name: 'X', price: 999, priceRwf: 6000 }, 1);
    expect(result.items[0].price).toBe(6000);
  });

  it(`caps a new line at ${MAX_QUANTITY_PER_ITEM} and reports capped=true`, () => {
    const result = addToCart([], product(1, 6000), 150);
    expect(result.items[0].quantity).toBe(MAX_QUANTITY_PER_ITEM);
    expect(result.capped).toBe(true);
  });

  it(`caps a merged line at ${MAX_QUANTITY_PER_ITEM} even when neither add alone exceeds it cumulatively`, () => {
    const existing: CartItem[] = [{ id: 1, name: 'Product 1', price: 6000, quantity: 95 }];
    const result = addToCart(existing, product(1, 6000), 10);
    expect(result.items[0].quantity).toBe(MAX_QUANTITY_PER_ITEM);
    expect(result.capped).toBe(true);
  });
});

describe('updateQuantity', () => {
  const items: CartItem[] = [{ id: 1, name: 'Product 1', price: 6000, quantity: 2 }];

  it('sets the quantity directly', () => {
    const result = updateQuantity(items, 1, 5);
    expect(result.items[0].quantity).toBe(5);
    expect(result.capped).toBe(false);
  });

  it('removes the line when quantity drops to 0 or below', () => {
    expect(updateQuantity(items, 1, 0).items).toHaveLength(0);
    expect(updateQuantity(items, 1, -3).items).toHaveLength(0);
  });

  it(`enforces the same ${MAX_QUANTITY_PER_ITEM} cap as addToCart — this is the bug the sidebar's +/- buttons had before`, () => {
    const result = updateQuantity(items, 1, 250);
    expect(result.items[0].quantity).toBe(MAX_QUANTITY_PER_ITEM);
    expect(result.capped).toBe(true);
  });
});

describe('removeFromCart', () => {
  it('removes only the matching line', () => {
    const items: CartItem[] = [
      { id: 1, name: 'A', price: 1000, quantity: 1 },
      { id: 2, name: 'B', price: 2000, quantity: 1 },
    ];
    expect(removeFromCart(items, 1)).toEqual([{ id: 2, name: 'B', price: 2000, quantity: 1 }]);
  });
});

describe('calculateTotals', () => {
  it('sums quantity and price*quantity across all lines', () => {
    const items: CartItem[] = [
      { id: 1, name: 'A', price: 6000, quantity: 2 },
      { id: 2, name: 'B', price: 1500, quantity: 3 },
    ];
    expect(calculateTotals(items)).toEqual({ totalItems: 5, totalPrice: 16500 });
  });

  it('returns zero totals for an empty cart', () => {
    expect(calculateTotals([])).toEqual({ totalItems: 0, totalPrice: 0 });
  });
});
