import type { ImportInput } from "@/lib/hooks/skills";

/** Base64-encode bytes in chunks (avoids arg-count limits on large buffers). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Turn a chosen file into an import request. `.zip` is sent as base64 for
 * server-side extract-only handling; anything else is read as markdown text.
 */
export async function fileToImportInput(file: File): Promise<ImportInput> {
  if (/\.zip$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { kind: "archive", content_base64: toBase64(bytes) };
  }
  return { kind: "markdown", content: await file.text(), filename: file.name };
}
