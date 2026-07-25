import api from './api';

export interface OrderPayload {
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    district?: string;
    village?: string;
  };
  items: Array<{ name: string; quantity: number; price: number; productId?: number }>;
  paymentMethod: string;
  notes?: string;
}

export async function createOrder(payload: OrderPayload) {
  const { data } = await api.post('/orders', payload);
  return data;
}

export async function getOrderStatus(orderNumber: string) {
  const { data } = await api.get(`/orders/${orderNumber}/status`);
  return data;
}
