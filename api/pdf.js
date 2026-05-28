// api/pdf.js — Vercel Serverless Function (Node.js runtime)
// Przyjmuje: POST z body { html: "..." }
// Zwraca: prawdziwy PDF jako binary

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

// Vercel Hobby/Pro: max 50MB compressed lambda
// chromium-min pobiera binarny Chromium z CDN w runtime (nie bundluje go)
const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let html = "";
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    html = body.html || "";
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (!html) {
    return res.status(400).json({ error: "Brak pola html" });
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="dokument.pdf"');
    res.setHeader("Content-Length", pdf.length);
    return res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    console.error("PDF generation error:", err);
    return res.status(500).json({ error: "PDF generation failed", detail: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
