import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v137.0.0/chromium-v137.0.0-pack.x64.tar";

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const executablePath = await chromium.executablePath(CHROMIUM_REMOTE_URL);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Load the HTML directly — no network request needed
    await page.setContent(html, { waitUntil: "networkidle0" });

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
    await browser.close();
  }
}
