import { Resend } from 'resend';
import fs from 'fs';

const resend = new Resend(process.env.RESEND_PASSKEY);

interface SendEmailOptions {
  subject: string;
  html: string;
  to: string[];
}

export async function sendEmail({ subject, html, to }: SendEmailOptions): Promise<void> {
  try {
    const data = await resend.emails.send({
      from: 'St-Caël <info@rehoboth-api.cloud>',
      to: to,
      subject: subject,
      html: html,
    });

    console.log(data);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

export function renderTemplate(templatePath: string, variables: { [key: string]: string }): string {
  let template = fs.readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(variables)) {
    template = template.replace(`{{${key}}}`, value);
  }
  return template;
}
