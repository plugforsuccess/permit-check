import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v137.0.0/chromium-v137.0.0-pack.x64.tar";

// Browser singleton — reused across PDF requests within a single serverless invocation.
// Avoids cold-starting Chromium for every PDF generation.
let browserInstance: Browser | null = null;
let browserClosingTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_TIMEOUT_MS = 30_000; // Close browser after 30s of inactivity

async function getBrowser(): Promise<Browser> {
  // Clear any pending close timer
  if (browserClosingTimer) {
    clearTimeout(browserClosingTimer);
    browserClosingTimer = null;
  }

  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  const executablePath = await chromium.executablePath(CHROMIUM_REMOTE_URL);

  browserInstance = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless: true,
  });

  return browserInstance;
}

function scheduleBrowserClose() {
  if (browserClosingTimer) clearTimeout(browserClosingTimer);
  browserClosingTimer = setTimeout(async () => {
    if (browserInstance) {
      await browserInstance.close().catch(() => {});
      browserInstance = null;
    }
  }, IDLE_TIMEOUT_MS);
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();

  try {
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 15_000 });

      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: {
          top: "0.75in",
          right: "0.75in",
          bottom: "0.75in",
          left: "0.75in",
        },
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  } finally {
    scheduleBrowserClose();
  }
}
