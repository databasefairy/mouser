declare module "pdf-parse" {
  function pdfParse(
    dataBuffer: Buffer,
    options?: unknown
  ): Promise<{ text?: string; numpages?: number; info?: unknown }>;
  export default pdfParse;
}
