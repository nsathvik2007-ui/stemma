/* What a teacher can attach to an assignment. The server is the real check —
   it reads the file's first bytes — this only saves a round trip for the
   obvious mistakes. */

export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const MAX_BYTES = 10 * 1024 * 1024;

export function attachmentProblem(file: File): string | null {
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return 'Attach a PDF, JPG or PNG file.';
  if (file.size > MAX_BYTES) return 'Attachments can be up to 10 MB.';
  return null;
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
