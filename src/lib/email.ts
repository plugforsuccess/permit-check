import { Resend } from "resend";
import type { PermitSummary } from "./summary";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

export interface SendReportEmailParams {
  to: string;
  address: string;
  lookupId: string;
  downloadUrl: string;
  permitCount: number;
  summary: PermitSummary | null;
  expiresAt: string;
}

export async function sendReportEmail(
  params: SendReportEmailParams
): Promise<void> {
  const {
    to,
    address,
    lookupId,
    downloadUrl,
    permitCount,
    summary,
    expiresAt,
  } = params;

  const fromEmail = process.env.EMAIL_FROM || "reports@permitcheck.org";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://permitcheck.org";
  const reportUrl = `${appUrl}/results/${lookupId}`;
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const riskColor = {
    high: "#dc2626",
    medium: "#d97706",
    low: "#16a34a",
  }[summary?.riskLevel ?? "medium"];

  const riskLabel = {
    high: "High Risk",
    medium: "Medium Risk",
    low: "Low Risk",
  }[summary?.riskLevel ?? "medium"];

  const flagsHtml =
    summary && summary.flags.length > 0
      ? `<ul style="margin: 8px 0 0; padding: 0 0 0 20px; color: #7f1d1d;">
          ${summary.flags
            .slice(0, 3)
            .map((f) => `<li style="margin-bottom: 4px; font-size: 13px;">${escapeHtml(f)}</li>`)
            .join("")}
        </ul>`
      : "";

  const positivesHtml =
    summary && summary.positives.length > 0
      ? `<ul style="margin: 8px 0 0; padding: 0 0 0 20px; color: #14532d;">
          ${summary.positives
            .slice(0, 2)
            .map((p) => `<li style="margin-bottom: 4px; font-size: 13px;">${escapeHtml(p)}</li>`)
            .join("")}
        </ul>`
      : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your PermitCheck Report</title>
</head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: #0f1f3d; padding: 28px 40px;">
              <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                <span style="color: white;">Permit</span><span style="color: #c9a84c;">Check</span>
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">

              <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.3px;">
                Your permit report is ready
              </h1>
              <p style="margin: 0 0 24px; font-size: 15px; color: #6b7280; line-height: 1.6;">
                ${escapeHtml(address)}
              </p>

              <!-- Risk badge -->
              ${
                summary
                  ? `<div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid ${riskColor};">
                  <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${riskColor}; margin-bottom: 6px;">
                    ${riskLabel}
                  </div>
                  <p style="margin: 0; font-size: 14px; color: #111827; font-weight: 600; line-height: 1.5;">
                    ${escapeHtml(summary.verdict)}
                  </p>
                  ${flagsHtml}
                  ${positivesHtml}
                </div>`
                  : ""
              }

              <!-- Permit count -->
              <p style="margin: 0 0 24px; font-size: 14px; color: #374151; line-height: 1.6;">
                <strong>${permitCount} permit record${permitCount !== 1 ? "s" : ""}</strong> found in the official government database for this address.
              </p>

              <!-- CTA buttons -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${escapeHtml(reportUrl)}"
                       style="display: inline-block; padding: 12px 24px; background: #0f1f3d; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                      View Full Report
                    </a>
                  </td>
                  <td>
                    <a href="${escapeHtml(downloadUrl)}"
                       style="display: inline-block; padding: 12px 24px; background: white; color: #0f1f3d; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; border: 1.5px solid #0f1f3d;">
                      Download PDF
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Report details -->
              <table cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 24px; background: #f9fafb; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <span style="font-size: 12px; color: #6b7280;">Report ID</span>
                    <span style="float: right; font-size: 11px; font-family: monospace; color: #374151;">${escapeHtml(lookupId)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <span style="font-size: 12px; color: #6b7280;">Report expires</span>
                    <span style="float: right; font-size: 12px; color: #374151;">${expiryDate}</span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                This report is based on official government permit records.
                Not a substitute for professional inspection or legal advice.
                Report access expires ${expiryDate}.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
                &copy; ${new Date().getFullYear()} PermitCheck LLC &middot; <a href="https://permitcheck.org" style="color: #9ca3af;">permitcheck.org</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Your PermitCheck report is ready

Property: ${address}
${summary ? `Risk Level: ${riskLabel}\n${summary.verdict}\n` : ""}
Permits found: ${permitCount}

View your report: ${reportUrl}
Download PDF: ${downloadUrl}

Report ID: ${lookupId}
Expires: ${expiryDate}

PermitCheck LLC · permitcheck.org
  `.trim();

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to,
    subject: `Your PermitCheck Report — ${address}`,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
