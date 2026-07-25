import nodemailer, { createTransport } from 'nodemailer';

const transporter = createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

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

export class EmailService {
  private static fromEmail = process.env.EMAIL_FROM || 'noreply@kosmopads.rw';
  private static adminEmail = process.env.ADMIN_EMAIL || 'sniyizurugero@aimsric.org';

  static async sendEmail(data: EmailData): Promise<boolean> {
    try {
      const info = await transporter.sendMail({
        from: `"KosmoPads" <${this.fromEmail}>`,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });
      console.log('✅ Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return false;
    }
  }

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
    <title>Order Confirmation - KosmoPads</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f7fafc;}
      .container{max-width:600px;margin:0 auto;padding:20px;}
      .header{background:linear-gradient(135deg,#2d3748 0%,#1a202c 100%);color:white;padding:30px 20px;text-align:center;border-radius:8px 8px 0 0;}
      .header h1{margin:0;font-size:28px;}.header p{margin:5px 0 0;opacity:.9;}
      .content{background:white;padding:30px;border-radius:0 0 8px 8px;box-shadow:0 2px 4px rgba(0,0,0,.1);}
      .payment-box{background:#fefcbf;border-left:4px solid #d69e2e;padding:20px;border-radius:8px;margin:20px 0;}
      .payment-box h3{margin-top:0;color:#744210;}
      .ussd-code{font-size:24px;font-weight:bold;color:#2d3748;text-align:center;padding:10px;background:white;border-radius:8px;border:2px dashed #48bb78;margin:10px 0;}
      table{width:100%;border-collapse:collapse;}th{text-align:left;padding:8px;background:#edf2f7;}
      .footer{text-align:center;padding:20px;color:#718096;font-size:14px;border-top:1px solid #e2e8f0;margin-top:30px;}
      .badge{display:inline-block;background:#ecc94b;color:#744210;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold;}
    </style></head><body>
    <div class="container">
      <div class="header"><h1>🩸 KosmoPads</h1><p>Thank you for your order</p></div>
      <div class="content">
        <h2>Hi ${data.customerName},</h2>
        <p>Thanks for your order! It's on-hold until we confirm your payment.</p>
        <div class="payment-box">
          <h3>📱 Send payment via MTN MoMo:</h3>
          <div class="ussd-code">${data.ussdCode}</div>
          <p><strong>Merchant:</strong> Kosmotive</p>
          <p><strong>Reference / Order #:</strong> <span style="font-weight:bold;font-size:18px;">${data.reference}</span></p>
          <p style="font-size:14px;color:#744210;"><em>Use your Order ID as the payment reference.</em></p>
        </div>
        <h3>Order #${data.orderNumber}</h3>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Phone:</strong> ${data.phone}</p>
        <table>
          <thead><tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr><td colspan="2" style="text-align:right;padding-top:16px;font-weight:bold;">Total:</td>
            <td style="text-align:right;padding-top:16px;font-weight:bold;font-size:20px;color:#2d3748;">${data.total.toLocaleString()} FRW</td></tr>
          </tfoot>
        </table>
        <p><strong>Payment method:</strong> ${data.paymentMethod} <span class="badge">On-hold</span></p>
        ${data.notes ? `<p><strong>Note:</strong> ${data.notes}</p>` : ''}
        <div style="background:#ebf8ff;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #3182ce;">
          <p style="margin:0;font-size:14px;color:#2c5282;"><strong>📦 Delivery:</strong> Delivery fee is not included and is paid directly by the client.</p>
        </div>
        <p>We look forward to fulfilling your order soon.</p>
      </div>
      <div class="footer"><p>© 2026 Kosmotive. All rights reserved.</p><p><a href="https://kosmopads.rw" style="color:#48bb78;text-decoration:none;">kosmopads.rw</a></p></div>
    </div></body></html>`;

    const text = `KosmoPads - Order #${data.orderNumber}\n\nHi ${data.customerName},\n\nPayment: Dial ${data.ussdCode}\nMerchant: Kosmotive\nReference: ${data.reference}\n\nTotal: ${data.total.toLocaleString()} FRW\nMethod: ${data.paymentMethod}\n${data.notes ? `Note: ${data.notes}` : ''}\n\nThank you!`;

    await this.sendEmail({
      to: data.customerEmail,
      subject: `Your KosmoPads order #${data.orderNumber} has been received!`,
      html,
      text,
    });

    // Notify admin
    await this.sendAdminNotification({
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      phone: data.phone,
      total: data.total,
      items: data.items,
      notes: data.notes,
    });
  }

  static async sendPaymentReceipt(data: {
    customerName: string;
    customerEmail: string;
    orderNumber: string;
    total: number;
    paymentMethod: string;
    momoReference?: string;
    phone: string;
  }): Promise<void> {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;background:#f7fafc;}
      .container{max-width:600px;margin:0 auto;padding:20px;}
      .header{background:linear-gradient(135deg,#38a169 0%,#2f855a 100%);color:white;padding:30px 20px;text-align:center;border-radius:8px 8px 0 0;}
      .content{background:white;padding:30px;border-radius:0 0 8px 8px;}
      .receipt-box{background:#f0fff4;border:2px solid #38a169;padding:20px;border-radius:8px;margin:20px 0;}
      .footer{text-align:center;padding:20px;color:#718096;font-size:14px;border-top:1px solid #e2e8f0;margin-top:30px;}
    </style></head><body>
    <div class="container">
      <div class="header"><h1>🩸 KosmoPads</h1><p>Payment Confirmed ✅</p></div>
      <div class="content">
        <p style="font-size:48px;text-align:center;margin:0;">✅</p>
        <h2 style="text-align:center;color:#38a169;">Payment Successful!</h2>
        <p style="text-align:center;">Hi <strong>${data.customerName}</strong>, payment confirmed for order <strong>#${data.orderNumber}</strong>.</p>
        <div class="receipt-box">
          <h3 style="margin-top:0;">🧾 Receipt</h3>
          <p><strong>Order:</strong> #${data.orderNumber}</p>
          <p><strong>Total:</strong> <span style="font-size:20px;font-weight:bold;">${data.total.toLocaleString()} FRW</span></p>
          <p><strong>Method:</strong> ${data.paymentMethod}</p>
          ${data.momoReference ? `<p><strong>Reference:</strong> ${data.momoReference}</p>` : ''}
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Phone:</strong> ${data.phone}</p>
        </div>
        <p style="text-align:center;font-size:18px;">Thank you for choosing KosmoPads! 🌸</p>
      </div>
      <div class="footer"><p>© 2026 Kosmotive. All rights reserved.</p></div>
    </div></body></html>`;

    await this.sendEmail({
      to: data.customerEmail,
      subject: `✅ Payment Confirmed - Order #${data.orderNumber}`,
      html,
      text: `Payment confirmed for order #${data.orderNumber}. Total: ${data.total.toLocaleString()} FRW`,
    });
  }

  static async sendAdminNotification(data: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    phone: string;
    total: number;
    items: Array<{ name: string; quantity: number; price: number }>;
    notes?: string;
  }): Promise<void> {
    const itemsList = data.items
      .map((i) => `${i.name} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString()} FRW`)
      .join('<br>');

    const html = `
      <h2>🆕 New Order Received — KosmoPads</h2>
      <p><strong>Order #:</strong> ${data.orderNumber}</p>
      <p><strong>Customer:</strong> ${data.customerName}</p>
      <p><strong>Email:</strong> ${data.customerEmail}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      <p><strong>Total:</strong> ${data.total.toLocaleString()} FRW</p>
      <h3>Items:</h3><p>${itemsList}</p>
      ${data.notes ? `<p><strong>Note:</strong> ${data.notes}</p>` : ''}
      <p style="color:#718096;font-size:14px;">⚠️ Action required: Confirm payment to process this order.</p>`;

    await this.sendEmail({
      to: this.adminEmail,
      subject: `🆕 New Order #${data.orderNumber} - KosmoPads`,
      html,
      text: `New Order #${data.orderNumber} from ${data.customerName}. Total: ${data.total} FRW`,
    });
  }

  static async sendPaymentReminder(data: {
    customerName: string;
    customerEmail: string;
    orderNumber: string;
    total: number;
    expiresInHours: number;
    ussdCode: string;
  }): Promise<void> {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{font-family:sans-serif;}.container{max-width:600px;margin:0 auto;padding:20px;}.header{background:#ecc94b;padding:20px;text-align:center;border-radius:8px 8px 0 0;}.content{background:white;padding:30px;border-radius:0 0 8px 8px;}</style>
    </head><body><div class="container">
      <div class="header"><h2 style="margin:0;">⏰ Payment Reminder</h2></div>
      <div class="content">
        <h2>Hi ${data.customerName},</h2>
        <p>Your order <strong>#${data.orderNumber}</strong> is still awaiting payment.</p>
        <p><strong>Total:</strong> ${data.total.toLocaleString()} FRW</p>
        <p><strong>Expires in:</strong> ${data.expiresInHours} hours</p>
        <p>To pay: Dial <strong>${data.ussdCode}</strong> and use <strong>${data.orderNumber}</strong> as reference.</p>
        <p>Please complete payment to avoid cancellation.</p>
      </div>
    </div></body></html>`;

    await this.sendEmail({
      to: data.customerEmail,
      subject: `⏰ Payment Reminder - Order #${data.orderNumber} expires in ${data.expiresInHours}h`,
      html,
      text: `Reminder: Complete payment for order #${data.orderNumber}. Total: ${data.total} FRW. Expires in ${data.expiresInHours} hours.`,
    });
  }

  static async testConnection(): Promise<boolean> {
    try {
      await transporter.verify();
      console.log('✅ Nodemailer SMTP connected successfully!');
      return true;
    } catch (error) {
      console.error('❌ Nodemailer connection failed (check SMTP credentials):', error);
      return false;
    }
  }
}
