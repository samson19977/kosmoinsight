import api from './api';

export interface LoanInstallment {
  id: number;
  installmentNumber: number;
  dueDate: string;
  amountDueRwf: number;
  amountPaidRwf: number;
  penaltyRwf: number;
  status: 'upcoming' | 'partial' | 'paid' | 'overdue';
  pendingPayment: { amountRwf: number; initiatedAt: string } | null;
}

export interface LoanStatus {
  loanNumber: string;
  status: string;
  totalPayableRwf: number;
  paidRwf: number;
  remainingRwf: number;
  repaymentRatePercent: number;
  nextInstallment: LoanInstallment | null;
  schedule: LoanInstallment[];
}

export async function fetchLoanStatus(loanNumber: string, phone: string): Promise<LoanStatus> {
  const { data } = await api.get(`/loans/${loanNumber}/status`, { params: { phone } });
  return data;
}

export async function payInstallmentMomo(loanNumber: string, installmentId: number, amountRwf: number, phone: string): Promise<{ message: string; status: string }> {
  const { data } = await api.post(`/loans/${loanNumber}/installments/${installmentId}/pay-momo`, { amountRwf, phone });
  return data;
}
