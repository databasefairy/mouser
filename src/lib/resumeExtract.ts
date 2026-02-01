/**
 * Resume extraction: PDF and DOCX to plain text.
 * Server-only; do not store the file; extract and discard.
 * Max file size 2MB.
 */

export const MAX_RESUME_FILE_BYTES = 2 * 1024 * 1024; // 2MB

export async function extractResumeText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (buffer.length > MAX_RESUME_FILE_BYTES) {
    throw new Error(`Resume file exceeds ${MAX_RESUME_FILE_BYTES / 1024 / 1024}MB limit.`);
  }

  const type = mimeType.toLowerCase();
  if (type === "application/pdf" || type === "application/x-pdf") {
    return extractPdf(buffer);
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword"
  ) {
    return extractDocx(buffer);
  }
  throw new Error("Unsupported resume format. Use PDF or DOCX.");
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid loading in edge/browser
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return typeof data?.text === "string" ? data.text.trim() : "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result?.value ?? "").trim();
}
