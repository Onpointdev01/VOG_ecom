import nodemailer from 'nodemailer';

interface GmailSMTPConfig {
  user: string;
  appPassword: string;
}

/**
 * Create Gmail SMTP transporter
 */
export function createGmailTransporter(config: GmailSMTPConfig) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: config.appPassword,
    },
  });
}

/**
 * Send email via Gmail SMTP
 */
export async function sendGmailEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    throw new Error('Gmail SMTP credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.');
  }

  const transporter = createGmailTransporter({
    user: gmailUser,
    appPassword: gmailAppPassword,
  });

  const recipients = Array.isArray(to) ? to : [to];

  await transporter.sendMail({
    from: `"${process.env.APP_NAME || 'VOG E-commerce'}" <${gmailUser}>`,
    to: recipients.join(', '),
    subject,
    text,
    html,
  });
}

