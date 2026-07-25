import { config } from "../config.js";

/**
 * Transactional email over Resend's HTTP API (https://resend.com/docs).
 *
 * Deliberately not an SDK: one POST is the whole integration, and a
 * dependency-free client is easier to swap if the provider changes.
 *
 * When no API key is configured the message is logged instead of sent, so
 * local development and CI work without credentials and a missing key can
 * never silently drop a reset a user is waiting on — it appears in the logs.
 */

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 15_000;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const mailerConfigured = () => Boolean(config.RESEND_API_KEY);

export async function sendMail(
  mail: Mail,
  log?: { info: (o: unknown, m: string) => void; error: (o: unknown, m: string) => void }
): Promise<boolean> {
  if (!config.RESEND_API_KEY) {
    log?.info(
      { to: mail.to, subject: mail.subject, text: mail.text },
      "Email not sent: RESEND_API_KEY is not configured"
    );
    return false;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      log?.error(
        { status: res.status, body: await res.text().catch(() => "") },
        "Email provider rejected the message"
      );
      return false;
    }
    return true;
  } catch (err) {
    log?.error({ err }, "Email could not be delivered");
    return false;
  }
}

export function resetEmail(link: string, expiresInMinutes: number): Omit<Mail, "to"> {
  return {
    subject: "Reset your BeamLoop password",
    text:
      `Someone asked to reset the password for your BeamLoop account.\n\n` +
      `Open this link to choose a new one:\n${link}\n\n` +
      `The link works once and expires in ${expiresInMinutes} minutes. ` +
      `If this wasn't you, ignore this email — your password stays as it is.`,
    html: `<!doctype html><html><body style="margin:0;background:#0C121A;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C121A;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#161F2B;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.16em;color:#7C8BA0;text-transform:uppercase">BeamLoop</p>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#E8ECF1">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9AA7B8">
            Someone asked to reset the password for your BeamLoop account.
            Choose a new one with the button below.
          </p>
          <a href="${link}" style="display:inline-block;background:#E8ECF1;color:#0C121A;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px">Choose a new password</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#7C8BA0">
            The link works once and expires in ${expiresInMinutes} minutes.
            If this wasn't you, ignore this email — your password stays as it is.
          </p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#5E6C7E;word-break:break-all">${link}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}
