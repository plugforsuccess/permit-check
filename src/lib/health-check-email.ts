import { Resend } from "resend";
import { env } from "./env";
import { log } from "./logger";

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

interface FailedTest {
  jurisdiction: string;
  description: string;
  passed: boolean;
  permitCount: number;
  error?: string;
}

export async function sendHealthCheckAlert(
  failures: FailedTest[]
): Promise<void> {
  const alertEmail = env.HEALTH_CHECK_ALERT_EMAIL;
  if (!alertEmail) {
    log.error("health-check: HEALTH_CHECK_ALERT_EMAIL not set", {
      step_name: "health_check_alert",
      event_type: "config_missing",
    });
    return;
  }

  const failureRows = failures
    .map(
      (f) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #fee2e2;">${escapeHtml(f.jurisdiction)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #fee2e2;">${escapeHtml(f.description)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #fee2e2;">${f.permitCount} permits found</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #fee2e2; font-size: 12px; color: #dc2626;">${escapeHtml(f.error ?? "Below expected minimum")}</td>
      </tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; padding: 40px; background: #fef2f2;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 2px solid #dc2626;">
    <div style="background: #dc2626; padding: 20px 28px;">
      <span style="color: white; font-size: 18px; font-weight: 700;">
        ⚠️ PermitCheck Scraper Alert
      </span>
    </div>
    <div style="padding: 28px;">
      <p style="margin: 0 0 20px; color: #111827; font-size: 15px;">
        The daily health check detected <strong>${failures.length} failing jurisdiction(s)</strong>.
        The scraper may be broken — check the Accela portal selectors immediately.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #fef2f2;">
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Jurisdiction</th>
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Address</th>
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Result</th>
            <th style="padding: 8px 12px; text-align: left; color: #374151;">Error</th>
          </tr>
        </thead>
        <tbody>${failureRows}</tbody>
      </table>
      <div style="margin-top: 24px; padding: 16px; background: #fef2f2; border-radius: 8px;">
        <p style="margin: 0; font-size: 13px; color: #374151;">
          <strong>Next steps:</strong><br>
          1. Open the failing portal in Chrome DevTools<br>
          2. Verify the field selectors in <code>src/lib/accela/scraper.ts</code><br>
          3. Check for Accela portal updates that may have changed field IDs<br>
          4. Run a manual test: <code>npx tsx scripts/verify-selectors.ts</code>
        </p>
      </div>
      <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af;">
        Timestamp: ${new Date().toISOString()}<br>
        PermitCheck health check · permitcheck.org
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await getResend().emails.send({
    from: env.EMAIL_FROM,
    to: alertEmail,
    subject: `🚨 PermitCheck Scraper Alert — ${failures.length} jurisdiction(s) failing`,
    html,
  });
}
