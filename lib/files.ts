/**
 * Upload validation that trusts bytes, never `File.type`.
 *
 * The browser Content-Type is attacker-controlled. Storage then serves the
 * object with whatever `contentType` we pin on upload, so a HTML/SVG/EXE
 * payload labelled `image/jpeg` or `application/pdf` would later be handed to
 * a recruiter or every member in the directory. Allowed kinds are detected
 * from magic at offset 0; everything else is refused, including polyglots
 * whose real payload starts before a later `%PDF-` or image signature.
 */

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const PDF_CONTENT_TYPE = "application/pdf";

export type ImageKind = "jpeg" | "png" | "webp";

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PDF_MAGIC = "%PDF-";

export function imageExtension(kind: ImageKind): "jpg" | "png" | "webp" {
  if (kind === "png") return "png";
  if (kind === "webp") return "webp";
  return "jpg";
}

export function imageContentType(kind: ImageKind): string {
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * JPEG / PNG / WebP only. SVG, GIF, ICO, BMP, TIFF, HTML, and empty files
 * return null — they are not photos, and SVG/HTML as an "image" is XSS.
 * Size is enforced here so callers cannot forget the 2MB cap.
 */
export async function imageKind(file: File): Promise<ImageKind | null> {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return null;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return imageKindFromBytes(head);
}

export function imageKindFromBytes(head: Uint8Array): ImageKind | null {
  if (matches(head, 0, JPEG)) return "jpeg";
  if (matches(head, 0, PNG)) return "png";
  if (isWebp(head)) return "webp";
  return null;
}

/**
 * Real PDF, `%PDF-` at byte 0, under 5MB, not empty. Ignores `File.type`.
 * A ZIP/OLE/HTML payload that merely claims to be a PDF is refused.
 */
export async function assertPdf(file: File, label: string): Promise<void> {
  if (file.size <= 0) throw new Error(`${label} must be a PDF`);
  if (file.size > MAX_PDF_BYTES) throw new Error(`${label} must be under 5MB`);
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!isPdfHeader(head)) throw new Error(`${label} must be a PDF`);
}

export function isPdfHeader(head: Uint8Array): boolean {
  return asciiAt(head, 0, PDF_MAGIC);
}

/**
 * Spreadsheet formula injection: cells that start with `= + - @` or a
 * leading tab/CR are executed by Excel when the CSV is opened. Prefix a
 * single quote and quote the field so the value stays text.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  const formula = /^[=+\-@\t\r]/.test(s);
  if (formula) s = `'${s}`;
  if (formula || /[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/** Cookie-gated img src so RSC HTML never embeds a Storage signed URL. */
export function memberPhotoSrc(memberId: string, photoPath: string | null | undefined) {
  if (!photoPath) return null;
  return `/members/${memberId}/photo`;
}

function isWebp(head: Uint8Array): boolean {
  return asciiAt(head, 0, "RIFF") && asciiAt(head, 8, "WEBP");
}

function matches(bytes: Uint8Array, offset: number, sig: readonly number[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, s: string): boolean {
  if (bytes.length < offset + s.length) return false;
  for (let i = 0; i < s.length; i++) {
    if (bytes[offset + i] !== s.charCodeAt(i)) return false;
  }
  return true;
}
