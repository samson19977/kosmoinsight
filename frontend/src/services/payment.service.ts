import api from './api';

export async function initiateMomoPayment(params: {
  phone: string;
  amount: number;
  reference: string;
  description?: string;
}) {
  const { data } = await api.post('/payments/momo/initiate', params);
  return data;
}

export async function getMomoStatus(referenceId: string) {
  const { data } = await api.get(`/payments/momo/status/${referenceId}`);
  return data;
}
