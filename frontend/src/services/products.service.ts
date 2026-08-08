import api from './api';

export interface Product {
  id: number;
  name: string;
  description: string;
  priceRwf: number;
  packageType: string;
  imageUrl?: string;
  isActive?: boolean;
}

export async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get('/products');
  return data.products;
}

export async function fetchProduct(id: number): Promise<Product> {
  const { data } = await api.get(`/products/${id}`);
  return data.product;
}
