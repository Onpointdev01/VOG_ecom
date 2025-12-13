import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { sendGmailEmail } from './gmailSMTP';

const resend = new Resend(process.env.RESEND_PASSKEY);

interface SendEmailOptions {
  subject: string;
  html: string;
  to: string[];
  useGmail?: boolean; // Option to use Gmail SMTP instead of Resend
}

export async function sendEmail({ subject, html, to, useGmail = false }: SendEmailOptions): Promise<void> {
  try {
    // Check if Gmail is configured and should be used
    const gmailConfigured = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
    const resendConfigured = process.env.RESEND_PASSKEY;
    
    // Priority: useGmail flag > Gmail configured > Resend configured
    if (useGmail && gmailConfigured) {
      // Use Gmail SMTP
      console.log(`📧 Sending email via Gmail SMTP to: ${Array.isArray(to) ? to.join(', ') : to}`);
      await sendGmailEmail({
        to,
        subject,
        html,
      });
      console.log('✅ Email sent successfully via Gmail SMTP');
    } else if (gmailConfigured && !resendConfigured) {
      // Fallback to Gmail if Resend is not configured
      console.log(`📧 Resend not configured, using Gmail SMTP as fallback to: ${Array.isArray(to) ? to.join(', ') : to}`);
      await sendGmailEmail({
        to,
        subject,
        html,
      });
      console.log('✅ Email sent successfully via Gmail SMTP (fallback)');
    } else if (resendConfigured) {
      // Use Resend (default)
      console.log(`📧 Sending email via Resend to: ${Array.isArray(to) ? to.join(', ') : to}`);
      const data = await resend.emails.send({
        from: 'St-Caël <info@rehoboth-api.cloud>',
        to: to,
        subject: subject,
        html: html,
      });
      console.log('✅ Email sent successfully via Resend:', data);
    } else {
      // No email service configured
      const errorMsg = 'No email service configured. Please set either RESEND_PASSKEY or GMAIL_USER/GMAIL_APP_PASSWORD in your .env file.';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    console.error('❌ Error sending email:', error);
    console.error('Error details:', {
      message: error?.message,
      response: error?.response?.data || error?.response,
      status: error?.response?.status,
      stack: error?.stack
    });
    throw error; // Re-throw to allow caller to handle
  }
}

export function renderTemplate(templatePath: string, variables: { [key: string]: string }): string {
  // Resolve template path relative to project root (works from both src/ and dist/)
  // If path starts with 'src/', resolve from project root
  // Otherwise, treat as relative to project root
  const resolvedPath = templatePath.startsWith('src/') 
    ? path.join(process.cwd(), templatePath)
    : path.isAbsolute(templatePath)
    ? templatePath
    : path.join(process.cwd(), templatePath);
  
  try {
    let template = fs.readFileSync(resolvedPath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(`{{${key}}}`, value);
    }
    return template;
  } catch (error: any) {
    console.error(`❌ Failed to load template from: ${resolvedPath}`);
    console.error(`Original path: ${templatePath}`);
    console.error(`Current working directory: ${process.cwd()}`);
    console.error(`Error:`, error.message);
    throw new Error(`Failed to load email template: ${error.message}`);
  }
}
