import axios from 'axios';

// ============================================
// SmsService
//
// WHY THIS EXISTS: every reminder/overdue-alert/default-alert in
// LoanService currently only fires `if (customer.email)` — but `email`
// is optional on the customers table while `phone` is required (every
// customer has one, since PayGo sales happen over MoMo/phone in the
// first place). In practice that means the whole automated reminder
// system has been silently doing nothing for any customer who never
// gave an email address — likely the majority. SMS reaches everyone;
// email reaches whoever happens to have one. This adds SMS as an
// ADDITIONAL channel alongside email, not a replacement.
//
// PROVIDER: built against Africa's Talking, the standard SMS (and USSD)
// gateway for Rwanda and the wider region — also worth knowing because
// it's the same provider family your existing USSD scaffolding
// (`channel: 'ussd'` in the schema, `src/routes/ussd.ts`) would use if
// that gets built out, so setting this up now covers both.
//
// CONFIGURATION: set AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME,
// and AFRICASTALKING_SENDER_ID (optional — omit to use Africa's
// Talking's shared shortcode) in your environment. Until those are set,
// every method here logs what WOULD have been sent and returns
// { success: false, skipped: true } instead of throwing — so the loan
// automation can call this unconditionally without needing to know
// whether SMS is configured yet, exactly like MomoService's sandbox
// fallback behaves when MTN credentials aren't set.
// ============================================

interface SmsResult {
  success: boolean;
  skipped?: boolean;
  messageId?: string;
  message: string;
}

export class SmsService {
  private static apiKey = process.env.AFRICASTALKING_API_KEY || '';
  private static username = process.env.AFRICASTALKING_USERNAME || '';
  private static senderId = process.env.AFRICASTALKING_SENDER_ID || '';
  private static baseUrl = process.env.AFRICASTALKING_ENVIRONMENT === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  private static get isConfigured(): boolean {
    return Boolean(this.apiKey && this.username);
  }

  // Normalizes to the +250XXXXXXXXX format Africa's Talking expects.
  // Customers are stored as either 07XXXXXXXX or already-international.
  private static normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('250')) return `+${digits}`;
    if (digits.startsWith('0')) return `+250${digits.slice(1)}`;
    return `+${digits}`;
  }

  static async send(phone: string, message: string): Promise<SmsResult> {
    if (!this.isConfigured) {
      console.log(`📱 [SMS not configured — would send to ${phone}]: ${message}`);
      return { success: false, skipped: true, message: 'SMS not configured (AFRICASTALKING_API_KEY/USERNAME missing)' };
    }

    try {
      const params = new URLSearchParams({
        username: this.username,
        to: this.normalizePhone(phone),
        message,
        ...(this.senderId ? { from: this.senderId } : {}),
      });

      const { data } = await axios.post(this.baseUrl, params, {
        headers: {
          apiKey: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const recipient = data?.SMSMessageData?.Recipients?.[0];
      if (recipient?.status === 'Success') {
        return { success: true, messageId: recipient.messageId, message: 'Sent' };
      }
      return { success: false, message: recipient?.status || 'Unknown SMS gateway response' };
    } catch (error: any) {
      console.error('SMS send error (non-fatal):', error.message);
      return { success: false, message: error.message || 'SMS send failed' };
    }
  }

  // ---- Templates used by LoanService's daily automation ----

  static async sendInstallmentReminder(phone: string, opts: { customerName: string; loanNumber: string; amountDueRwf: number; daysUntilDue: number }) {
    const when = opts.daysUntilDue === 0 ? 'today' : `in ${opts.daysUntilDue} day(s)`;
    return this.send(
      phone,
      `Hi ${opts.customerName}, your KosmoPads PayGo payment of ${opts.amountDueRwf.toLocaleString()} RWF (loan ${opts.loanNumber}) is due ${when}. Pay via MoMo to stay on track. — Kosmotive`
    );
  }

  static async sendOverdueAlert(phone: string, opts: { customerName: string; loanNumber: string; amountOwedRwf: number; daysOverdue: number }) {
    return this.send(
      phone,
      `Hi ${opts.customerName}, your KosmoPads PayGo payment (loan ${opts.loanNumber}) is ${opts.daysOverdue} day(s) overdue. Amount owed: ${opts.amountOwedRwf.toLocaleString()} RWF. Please pay via MoMo as soon as possible. — Kosmotive`
    );
  }
}
