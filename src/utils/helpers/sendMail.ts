import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

interface SendEmailOptions {
  subject: string;
  html: string;
  to: string[];
}

function getSmtpConfig(): SMTPTransport.Options {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!user || !pass) {
    throw new EmailDeliveryError(
      'Email (SMTP) is not configured. Set SMTP_USER and SMTP_PASS (Gmail app password) in .env'
    );
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE !== 'false' && port === 465);

  return {
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port,
    secure,
    auth: { user, pass },
  };
}

function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'VOG'
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(getSmtpConfig());
  }
  return transporter;
}

export async function sendEmail({
  subject,
  html,
  to,
}: SendEmailOptions): Promise<{ id: string }> {
  const recipients = Array.from(
    new Set(to.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))
  );
  if (recipients.length === 0) {
    throw new EmailDeliveryError('No valid email recipients');
  }

  const mailer = getTransporter();
  const info = await mailer.sendMail({
    from: getFromAddress(),
    to: recipients.join(', '),
    subject,
    html,
  });

  const accepted = (info.accepted || []).map((a: unknown) => String(a).toLowerCase());
  const rejected = info.rejected || [];

  if (rejected.length > 0 && accepted.length === 0) {
    throw new EmailDeliveryError(
      `SMTP rejected recipient(s): ${rejected.map(String).join(', ')}`
    );
  }

  if (accepted.length === 0 && !info.messageId) {
    throw new EmailDeliveryError('SMTP did not accept the message');
  }

  return { id: info.messageId || `smtp-${Date.now()}` };
}

/** Resolve email template from dist or src (dev). */
export function resolveTemplatePath(templateFileName: string): string {
  const candidates = [
    path.join(__dirname, '..', 'templates', templateFileName),
    path.join(process.cwd(), 'dist', 'utils', 'templates', templateFileName),
    path.join(process.cwd(), 'src', 'utils', 'templates', templateFileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new EmailDeliveryError(`Email template not found: ${templateFileName}`);
}

export function renderTemplate(templateFileName: string, variables: { [key: string]: string }): string {
  const templatePath = resolveTemplatePath(templateFileName);
  let template = fs.readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(variables)) {
    template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return template;
}
