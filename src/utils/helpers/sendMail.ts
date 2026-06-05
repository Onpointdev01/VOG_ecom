import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import logger from '../logger';

const resendApiKey = process.env.RESEND_PASSKEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const defaultFromEmail = 'noreply@st-cael.org';
const fromAddress =
  process.env.RESEND_FROM_EMAIL?.trim() || `St-Caël <${defaultFromEmail}>`;

interface SendEmailOptions {
  subject: string;
  html: string;
  to: string[];
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

  throw new Error(`Email template not found: ${templateFileName}`);
}

export async function sendEmail({ subject, html, to }: SendEmailOptions): Promise<void> {
  if (!resend) {
    logger.warn('RESEND_PASSKEY is not configured — email not sent');
    throw new Error('Email service is not configured');
  }

  try {
    const data = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });

    logger.info('Email sent', { to, subject, data });
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
}

export function renderTemplate(templateFileName: string, variables: { [key: string]: string }): string {
  const templatePath = resolveTemplatePath(templateFileName);
  let template = fs.readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(variables)) {
    template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return template;
}
