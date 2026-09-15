import { useQuery } from '@tanstack/react-query';
import { fetchProducts, fetchProduct, type Product } from '../services/products.service';

export function useProducts() {
  const { data, isLoading, error } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 5 * 60 * 1000,
  });
  return { products: data, isLoading, error };
}

export function useProduct(id: number) {
  const { data, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
    enabled: !!id,
  });
  return { product: data, isLoading };
}
