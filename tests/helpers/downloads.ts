import { expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";

/** Capture a download triggered by actionFn; returns the saved file path. */
export async function interceptDownload(page: Page, actionFn: () => Promise<void>): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), actionFn()]);
  const path = await download.path();
  if (!path) throw new Error("Download produced no file path.");
  return path;
}

/** Verify a PDF's structure (page count, metadata) — not content quality (that's manual). */
export async function assertPDFStructure(path: string, expected: { minPages?: number; title?: string } = {}) {
  const bytes = readFileSync(path);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPageCount();
  if (expected.minPages) expect(pages).toBeGreaterThanOrEqual(expected.minPages);
  if (expected.title) expect(doc.getTitle() ?? "").toContain(expected.title);
  return { pages, title: doc.getTitle() };
}
