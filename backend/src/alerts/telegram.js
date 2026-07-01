// Optional Telegram notifications. Free: create a bot with @BotFather, then set
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. If either is missing this is a silent
// no-op. The token is NEVER logged (the logger also redacts it as a safety net).

import { logger } from '../logger.js';

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text) {
  if (!telegramConfigured()) return { sent: false, reason: 'not_configured' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    return { sent: res.ok };
  } catch (err) {
    logger.warn('telegram send failed', { error: err.message });
    return { sent: false, reason: 'error' };
  }
}
