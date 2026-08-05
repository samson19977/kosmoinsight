import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface MomoPaymentRequest {
  phone: string;
  amount: number;
  reference: string;
  description?: string;
}

interface MomoPaymentResult {
  success: boolean;
  transactionId?: string;
  status?: string;
  message: string;
}

interface PaymentInstructions {
  ussdCode: string;
  merchantCode: string;
  reference: string;
  instructions: string[];
}

export class MomoService {
  private static baseUrl = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
  private static subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY || '';
  // MTN MoMo Collection Basic-auth credentials are (API User ID : API Key) —
  // there is no separate "API secret" for this product.
  private static collectionUserId = process.env.MOMO_COLLECTION_USER_ID || '';
  private static apiKey = process.env.MOMO_API_KEY || '';
  private static merchantCode = process.env.MOMO_MERCHANT_CODE || '675566';
  private static environment = process.env.MOMO_ENVIRONMENT || 'sandbox';

  // Normalize phone number to international format
  static normalizePhone(phone: string): string {
    phone = phone.trim().replace(/\s+/g, '');
    if (phone.startsWith('0')) {
      return '+250' + phone.substring(1);
    }
    if (phone.startsWith('250')) {
      return '+' + phone;
    }
    return phone;
  }

  // Generate USSD payment instructions for manual payment
  static generatePaymentInstructions(reference: string): PaymentInstructions {
    const merchantCode = this.merchantCode;
    const ussdCode = `*182*8*1*${merchantCode}#`;
    return {
      ussdCode,
      merchantCode,
      reference,
      instructions: [
        `Dial ${ussdCode} on your phone`,
        `Select "Pay Bill" or option for merchant payment`,
        `Enter merchant code: ${merchantCode}`,
        `Enter amount (RWF)`,
        `Use "${reference}" as the payment reference`,
        `Enter your MoMo PIN to confirm`,
      ],
    };
  }

  // Get OAuth token from MoMo API
  private static async getAccessToken(): Promise<string | null> {
    try {
      if (!this.collectionUserId || !this.apiKey) {
        console.error('MoMo token error: MOMO_COLLECTION_USER_ID or MOMO_API_KEY is not set');
        return null;
      }
      const credentials = Buffer.from(`${this.collectionUserId}:${this.apiKey}`).toString('base64');
      const response = await axios.post(
        `${this.baseUrl}/collection/token/`,
        {},
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'X-Target-Environment': this.environment,
          },
        }
      );
      return response.data.access_token;
    } catch (error: any) {
      console.error('MoMo token error:', error?.response?.data || error.message);
      return null;
    }
  }

  // Initiate a MoMo Request-to-Pay
  static async initiatePayment(request: MomoPaymentRequest): Promise<MomoPaymentResult> {
    const referenceId = uuidv4();
    const phone = this.normalizePhone(request.phone);

    try {
      const token = await this.getAccessToken();
      if (!token) {
        // If API token fails (e.g., sandbox not configured), fall back to manual payment
        return {
          success: true,
          transactionId: referenceId,
          status: 'pending_manual',
          message: `Please complete payment manually using USSD: ${this.generatePaymentInstructions(request.reference).ussdCode}`,
        };
      }

      await axios.post(
        `${this.baseUrl}/collection/v1_0/requesttopay`,
        {
          amount: String(request.amount),
          currency: 'RWF',
          externalId: request.reference,
          payer: {
            partyIdType: 'MSISDN',
            partyId: phone.replace('+', ''),
          },
          payerMessage: request.description || 'KosmoPads payment',
          payeeNote: `Order: ${request.reference}`,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Reference-Id': referenceId,
            'X-Target-Environment': this.environment,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        transactionId: referenceId,
        status: 'pending',
        message: 'Payment request sent. Please approve on your phone.',
      };
    } catch (error: any) {
      console.error('MoMo payment initiation error:', error?.response?.data || error.message);
      // Fall back gracefully to manual payment instructions
      return {
        success: true,
        transactionId: referenceId,
        status: 'pending_manual',
        message: `Payment request queued. Use USSD: ${this.generatePaymentInstructions(request.reference).ussdCode} with reference: ${request.reference}`,
      };
    }
  }

  // Check payment status
  static async checkPaymentStatus(referenceId: string): Promise<{
    status: string;
    amount?: number;
    currency?: string;
    payer?: string;
    reason?: string;
  }> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return { status: 'PENDING', reason: 'Cannot verify automatically - check manual payment' };
      }

      const response = await axios.get(
        `${this.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Target-Environment': this.environment,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          },
        }
      );

      return {
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        payer: response.data.payer?.partyId,
        reason: response.data.reason,
      };
    } catch (error: any) {
      console.error('MoMo status check error:', error?.response?.data || error.message);
      return { status: 'PENDING', reason: 'Status check failed, please verify manually' };
    }
  }
}
