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

export interface PaymentInstructions {
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
  // MTN's sandbox environment only accepts EUR — it rejects RWF (or any other
  // currency) with a 400/RESOURCE_NOT_FOUND-style failure on requesttopay.
  // Production accounts use the real settlement currency, RWF.
  // Docs/community confirmation: sandbox transactions must be created in EUR
  // regardless of the real-world currency you intend to charge.
  private static get transactionCurrency(): string {
    return this.environment === 'sandbox' ? 'EUR' : 'RWF';
  }

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

  // MTN's API accepts non-ASCII characters (e.g. an em-dash "—") in
  // payerMessage/payeeNote with a 202 Accepted — but at least in sandbox,
  // it then silently fails to persist the transaction, so every later
  // GET .../requesttopay/{referenceId} 404s even though the POST looked
  // successful. Strip to plain ASCII defensively so this can never recur.
  private static toAscii(text: string): string {
    return text
      .replace(/[\u2013\u2014]/g, '-') // en-dash / em-dash -> hyphen
      .replace(/[\u2018\u2019]/g, "'") // curly single quotes
      .replace(/[\u201C\u201D]/g, '"') // curly double quotes
      .replace(/[^\x00-\x7F]/g, ''); // drop anything else non-ASCII
  }


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
  private static async getAccessToken(): Promise<string | null> {    try {
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
      console.error(
        'MoMo token error:',
        JSON.stringify({ httpStatus: error?.response?.status, data: error?.response?.data, message: error.message })
      );
      return null;
    }
  }

  // Public diagnostic — checks config presence + attempts a real token fetch
  // against MTN sandbox/production, without exposing any secret values.
  static async testConnection(): Promise<{
    ok: boolean;
    message: string;
    config: Record<string, boolean | string>;
  }> {
    const config = {
      MOMO_BASE_URL: this.baseUrl,
      MOMO_ENVIRONMENT: this.environment,
      MOMO_MERCHANT_CODE: this.merchantCode,
      MOMO_COLLECTION_USER_ID_set: Boolean(this.collectionUserId),
      MOMO_API_KEY_set: Boolean(this.apiKey),
      MOMO_SUBSCRIPTION_KEY_set: Boolean(this.subscriptionKey),
    };

    if (!this.collectionUserId || !this.apiKey || !this.subscriptionKey) {
      return { ok: false, message: 'One or more required MoMo env vars are missing — see config below.', config };
    }

    const token = await this.getAccessToken();
    if (!token) {
      return { ok: false, message: 'Credentials are present but MTN rejected the token request — check Render logs for the exact MTN error.', config };
    }

    return { ok: true, message: 'Token fetched successfully — MoMo credentials are valid.', config };
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
          currency: this.transactionCurrency,
          externalId: request.reference,
          payer: {
            partyIdType: 'MSISDN',
            partyId: phone.replace('+', ''),
          },
          payerMessage: this.toAscii(request.description || 'KosmoPads payment'),
          payeeNote: this.toAscii(`Order: ${request.reference}`),
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
      console.error(
        'MoMo payment initiation error:',
        JSON.stringify({ httpStatus: error?.response?.status, data: error?.response?.data, message: error.message })
      );
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
      console.error(
        'MoMo status check error:',
        JSON.stringify({ httpStatus: error?.response?.status, data: error?.response?.data, message: error.message })
      );
      return { status: 'PENDING', reason: 'Status check failed, please verify manually' };
    }
  }
}
