// Optional email notifications over SMTP (nodemailer). Free with any SMTP account
// (e.g. a Gmail app password). If SMTP isn't configured this is a silent no-op and
// nodemailer is never even imported. Credentials are never logged.

import { logger } from '../logger.js';

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.ALERT_EMAIL_TO);
}

let transporter = null;
async function getTransporter() {
  if (transporter) return transporter;
  const nodemailer = (await import('nodemailer')).default;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendEmail(subject, text) {
  if (!emailConfigured()) return { sent: false, reason: 'not_configured' };
  try {
    const t = await getTransporter();
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: process.env.ALERT_EMAIL_TO, subject, text });
    return { sent: true };
  } catch (err) {
    logger.warn('email send failed', { error: err.message });
    return { sent: false, reason: 'error' };
  }
}
