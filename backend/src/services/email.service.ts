import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  paymentMethod: string;
  ussdCode: string;
  reference: string;
  notes?: string;
}

interface PaymentReceiptData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  amountRwf: number;
  paidAt: Date;
  items: Array<{ name: string; quantity: number; priceRwf: number; subtotalRwf: number }>;
}

interface AdminPaymentAlertData {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  amountRwf: number;
  status: 'paid' | 'failed';
}

export class EmailService {
  private static fromEmail = process.env.EMAIL_FROM || 'noreply@kosmopads.rw';
  private static adminEmail = process.env.ADMIN_EMAIL || 'admin@kosmopads.rw';

  static async sendEmail(data: EmailData): Promise<boolean> {
    try {
      const { data: info, error } = await resend.emails.send({
        from: `KosmoPads <${this.fromEmail}>`,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });
      if (error) throw error;
      console.log('✅ Email sent:', info?.id);
      return true;
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return false;
    }
  }

  // ============================================
  // Order confirmation (sent right after order is placed)
  // ============================================
  static async sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    const itemsHtml = data.items
      .map(
        (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${(item.price * item.quantity).toLocaleString()} FRW</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>Order Confirmation – KosmoPads</title></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7fafc;margin:0;padding:20px;color:#333;">
      <div style="max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0f7a72,#0a5c56);color:#fff;padding:30px 24px;border-radius:10px 10px 0 0;text-align:center;">
          <h1 style="margin:0;font-size:26px;">🩸 KosmoPads</h1>
          <p style="margin:6px 0 0;opacity:.9;">Order Confirmation</p>
        </div>
        <div style="background:#fff;padding:28px 24px;border-radius:0 0 10px 10px;box-shadow:0 2px 6px rgba(0,0,0,.08);">
          <h2 style="color:#0f7a72;margin-top:0;">Hi ${data.customerName},</h2>
          <p>Thank you for your order! It will be processed once your payment is confirmed.</p>

          <div style="background:#fffbeb;border-left:4px solid #d69e2e;padding:18px 20px;border-radius:8px;margin:20px 0;">
            <h3 style="margin-top:0;color:#744210;">📱 Pay via MTN MoMo</h3>
            <div style="font-size:22px;font-weight:bold;color:#2d3748;text-align:center;padding:10px;background:#fff;border-radius:8px;border:2px dashed #48bb78;margin:10px 0;">${data.ussdCode}</div>
            <p style="margin:6px 0;"><strong>Merchant:</strong> Kosmotive</p>
            <p style="margin:6px 0;"><strong>Reference / Order #:</strong> <span style="font-size:18px;font-weight:bold;">${data.reference}</span></p>
            <p style="font-size:13px;color:#744210;margin:8px 0 0;"><em>Use your Order Number as the payment reference when prompted.</em></p>
          </div>

          <h3 style="color:#0f7a72;">Order #${data.orderNumber}</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>
              <th style="text-align:left;padding:8px;background:#f0f4f3;">Product</th>
              <th style="padding:8px;background:#f0f4f3;text-align:center;">Qty</th>
              <th style="padding:8px;background:#f0f4f3;text-align:right;">Subtotal</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:10px 8px;font-weight:bold;text-align:right;">Total:</td>
              <td style="padding:10px 8px;font-weight:bold;font-size:18px;text-align:right;color:#0f7a72;">${data.total.toLocaleString()} FRW</td>
            </tr></tfoot>
          </table>

          ${data.notes ? `<p style="color:#555;font-size:14px;"><strong>Note:</strong> ${data.notes}</p>` : ''}

          <p style="color:#718096;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:20px;">
            KosmoPads Rwanda — Sustainable feminine hygiene products.<br/>
            Questions? Reply to this email or contact us on WhatsApp.
          </p>
        </div>
      </div>
    </body></html>`;

    await this.sendEmail({
      to: data.customerEmail,
      subject: `Order Confirmed – #${data.orderNumber} | KosmoPads`,
      html,
      text: `Hi ${data.customerName}, your order #${data.orderNumber} has been received. Total: ${data.total.toLocaleString()} FRW. Pay via MoMo USSD: ${data.ussdCode} using reference ${data.reference}.`,
    });
  }

  // ============================================
  // Payment receipt (sent after MoMo webhook confirms payment)
  // ============================================
  static async sendPaymentReceipt(data: PaymentReceiptData): Promise<void> {
    const itemsHtml = data.items
      .map(
        (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${item.subtotalRwf.toLocaleString()} FRW</td>
      </tr>`
      )
      .join('');

    const paidAtStr = data.paidAt.toLocaleString('en-RW', { dateStyle: 'long', timeStyle: 'short' });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>Payment Receipt – KosmoPads</title></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7fafc;margin:0;padding:20px;color:#333;">
      <div style="max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#1e8e4e,#155e37);color:#fff;padding:30px 24px;border-radius:10px 10px 0 0;text-align:center;">
          <div style="font-size:40px;margin-bottom:6px;">✅</div>
          <h1 style="margin:0;font-size:24px;">Payment Confirmed</h1>
          <p style="margin:6px 0 0;opacity:.9;">KosmoPads Rwanda</p>
        </div>
        <div style="background:#fff;padding:28px 24px;border-radius:0 0 10px 10px;box-shadow:0 2px 6px rgba(0,0,0,.08);">
          <h2 style="color:#1e8e4e;margin-top:0;">Hi ${data.customerName},</h2>
          <p>Your payment has been received and your order is now being processed. Thank you! 🙏</p>

          <div style="background:#e5f6ec;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Order #:</strong> ${data.orderNumber}</p>
            <p style="margin:4px 0;"><strong>Amount paid:</strong> <span style="font-size:18px;font-weight:bold;color:#1e8e4e;">${data.amountRwf.toLocaleString()} FRW</span></p>
            <p style="margin:4px 0;"><strong>Date:</strong> ${paidAtStr}</p>
          </div>

          <h3 style="color:#333;">Items ordered</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>
              <th style="text-align:left;padding:8px;background:#f0f4f3;">Product</th>
              <th style="padding:8px;background:#f0f4f3;text-align:center;">Qty</th>
              <th style="padding:8px;background:#f0f4f3;text-align:right;">Subtotal</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:10px 8px;font-weight:bold;text-align:right;">Total paid:</td>
              <td style="padding:10px 8px;font-weight:bold;font-size:16px;text-align:right;color:#1e8e4e;">${data.amountRwf.toLocaleString()} FRW</td>
            </tr></tfoot>
          </table>

          <p style="color:#718096;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:20px;">
            KosmoPads Rwanda — Sustainable feminine hygiene products.<br/>
            Keep this email as your payment receipt.
          </p>
        </div>
      </div>
    </body></html>`;

    await this.sendEmail({
      to: data.customerEmail,
      subject: `✅ Payment Received – Order #${data.orderNumber} | KosmoPads`,
      html,
      text: `Hi ${data.customerName}, your payment of ${data.amountRwf.toLocaleString()} FRW for order #${data.orderNumber} has been confirmed. Thank you!`,
    });
  }

  // ============================================
  // Admin alert when a payment status changes
  // ============================================
  static async sendAdminPaymentAlert(data: AdminPaymentAlertData): Promise<void> {
    const icon = data.status === 'paid' ? '✅' : '❌';
    const label = data.status === 'paid' ? 'PAID' : 'FAILED';
    const color = data.status === 'paid' ? '#1e8e4e' : '#c0392b';

    const html = `<div style="font-family:sans-serif;padding:20px;max-width:500px;">
      <h2 style="color:${color};">${icon} Payment ${label}</h2>
      <p><strong>Order #:</strong> ${data.orderNumber}</p>
      <p><strong>Customer:</strong> ${data.customerName}</p>
      <p><strong>Phone:</strong> ${data.customerPhone}</p>
      <p><strong>Amount:</strong> ${data.amountRwf.toLocaleString()} FRW</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>`;

    await this.sendEmail({
      to: this.adminEmail,
      subject: `${icon} Payment ${label} – Order #${data.orderNumber} | KosmoPads`,
      html,
      text: `Payment ${label} for order #${data.orderNumber}. Customer: ${data.customerName} (${data.customerPhone}). Amount: ${data.amountRwf.toLocaleString()} FRW.`,
    });
  }

  // ============================================
  // Admin notification for orders without email (unchanged)
  // ============================================
  static async sendAdminNotification(data: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    total: number;
    paymentMethod: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    notes?: string;
  }): Promise<void> {
    const itemsList = data.items
      .map((i) => `• ${i.name} ×${i.quantity} = ${(i.price * i.quantity).toLocaleString()} FRW`)
      .join('\n');

    const html = `<div style="font-family:sans-serif;padding:20px;max-width:500px;">
      <h2 style="color:#0f7a72;">🆕 New Order Received</h2>
      <p><strong>Order #:</strong> ${data.orderNumber}</p>
      <p><strong>Customer:</strong> ${data.customerName}</p>
      <p><strong>Phone:</strong> ${data.customerPhone}</p>
      <p><strong>Payment method:</strong> ${data.paymentMethod}</p>
      <p><strong>Total:</strong> ${data.total.toLocaleString()} FRW</p>
      ${data.notes ? `<p><strong>Note:</strong> ${data.notes}</p>` : ''}
      <p style="color:#744210;">⚠️ Action required: Confirm payment to process this order.</p>
    </div>`;

    await this.sendEmail({
      to: this.adminEmail,
      subject: `🆕 New Order #${data.orderNumber} – KosmoPads`,
      html,
      text: `New Order #${data.orderNumber} from ${data.customerName} (${data.customerPhone}). Total: ${data.total.toLocaleString()} FRW.\n\nItems:\n${itemsList}`,
    });
  }

  // ============================================
  // Payment reminder (unchanged)
  // ============================================
  static async sendPaymentReminder(data: {
    customerName: string;
    customerEmail: string;
    orderNumber: string;
    total: number;
    expiresInHours: number;
    ussdCode: string;
  }): Promise<void> {
    const html = `<div style="font-family:sans-serif;padding:20px;max-width:500px;">
      <div style="background:#ecc94b;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">⏰ Payment Reminder</h2>
      </div>
      <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;">
        <h2>Hi ${data.customerName},</h2>
        <p>Your order <strong>#${data.orderNumber}</strong> is still awaiting payment.</p>
        <p><strong>Total:</strong> ${data.total.toLocaleString()} FRW</p>
        <p><strong>Expires in:</strong> ${data.expiresInHours} hours</p>
        <p>Dial <strong>${data.ussdCode}</strong> and use <strong>${data.orderNumber}</strong> as reference.</p>
      </div>
    </div>`;

    await this.sendEmail({
      to: data.customerEmail,
      subject: `⏰ Payment Reminder – Order #${data.orderNumber} expires in ${data.expiresInHours}h`,
      html,
      text: `Reminder: Complete payment for order #${data.orderNumber}. Total: ${data.total.toLocaleString()} FRW. Expires in ${data.expiresInHours} hours.`,
    });
  }

  static async testConnection(): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is not set — emails will fail to send.');
      return false;
    }
    console.log('✅ Resend API key configured — email service ready.');
    return true;
  }
}
