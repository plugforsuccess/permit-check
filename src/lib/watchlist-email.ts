import { Resend } from "resend";
import { env } from "./env";
import type { PermitRecord } from "@/lib/accela/scraper";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(env.RESEND_API_KEY);
  }
  return resendInstance;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface WatchlistAlertParams {
  to: string;
  address: string;
  newPermitCount: number;
  newPermits: PermitRecord[];
  reportUrl: string;
}

export async function sendWatchlistAlert(
  params: WatchlistAlertParams
): Promise<void> {
  const { to, address, newPermitCount, newPermits, reportUrl } = params;

  const permitRows = newPermits
    .slice(0, 5)
    .map(
      (p) => `
      <tr>
        <td style="padding: 8px 12px; font-family: monospace; font-size: 12px;">${escapeHtml(p.recordNumber)}</td>
        <td style="padding: 8px 12px; font-size: 12px;">${escapeHtml(p.type)}</td>
        <td style="padding: 8px 12px; font-size: 12px; font-weight: 600;">${escapeHtml(p.status)}</td>
        <td style="padding: 8px 12px; font-size: 12px;">${escapeHtml(p.filedDate ?? "\u2014")}</td>
      </tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; padding: 40px; background: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background: #0f1f3d; padding: 20px 28px;">
      <span style="font-size: 20px; font-weight: 800;">
        <span style="color: white;">Permit</span><span style="color: #c9a84c;">Check</span>
      </span>
    </div>
    <div style="padding: 28px;">
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #111827;">
        New permit activity detected
      </h2>
      <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px;">
        ${escapeHtml(address)}
      </p>
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; font-weight: 600; color: #92400e;">
          ${newPermitCount} new permit record${newPermitCount !== 1 ? "s" : ""} filed since your last check
        </p>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Record #</th>
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Type</th>
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Status</th>
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Filed</th>
          </tr>
        </thead>
        <tbody>${permitRows}</tbody>
      </table>
      <a href="${escapeHtml(reportUrl)}" style="display: inline-block; padding: 12px 24px; background: #0f1f3d; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
        View Full Report &rarr;
      </a>
      <p style="margin: 20px 0 0; font-size: 11px; color: #9ca3af;">
        You're monitoring this address via PermitCheck. Monitoring expires in 30 days from your original report.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await getResend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `New permit activity at ${address}`,
    html,
  });
}
