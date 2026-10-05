import { supabase } from "./supabase";

const bucket = "receipts";
export const receiptTypes =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
export const maxReceiptBytes = 10 * 1024 * 1024;

function client() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

// Storage policies only allow paths that start with the owner's id.
export async function uploadReceipt(
  user: string,
  entryId: string,
  month: string,
  file: File,
): Promise<string> {
  if (file.size > maxReceiptBytes)
    throw new Error("El comprobante no puede superar los 10 MB.");
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  const path = `${user}/${entryId}/${month}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const { error } = await client()
    .storage.from(bucket)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(`No se pudo subir el comprobante: ${error.message}`);
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await client()
    .storage.from(bucket)
    .createSignedUrl(path, 60);
  if (error) throw new Error(`No se pudo abrir el comprobante: ${error.message}`);
  return data.signedUrl;
}

export async function removeReceipt(path: string): Promise<void> {
  const { error } = await client().storage.from(bucket).remove([path]);
  if (error) throw new Error(`No se pudo borrar el comprobante: ${error.message}`);
}
