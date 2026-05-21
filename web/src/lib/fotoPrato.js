import { supabase } from "./supabase";

const BUCKET = "prato-foto";
const SIGNED_TTL = 3600;

async function resolveSignedFotoUrl(fotoPath) {
  if (!fotoPath) return null;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(fotoPath, SIGNED_TTL);
  if (!error && data?.signedUrl) return data.signedUrl;

  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return null;

  const res = await fetch(`/api/foto-url?path=${encodeURIComponent(fotoPath)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.signedUrl ?? null;
}

/** Fallback upload foto da client se il server non ha salvato il path. */
export async function uploadFotoAnalisiClient(userId, analisiId, base64, mimeType = "image/jpeg") {
  if (!userId || !analisiId || !base64) return null;

  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${analisiId}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (upErr) {
    console.warn("[fotoPrato] upload:", upErr.message);
    return null;
  }

  await supabase
    .from("prato_analisi")
    .update({ foto_path: path, foto_url: null })
    .eq("id", analisiId);

  return resolveSignedFotoUrl(path);
}

/** URL firmato per riga analisi (path o legacy url). */
export async function resolveSignedFotoFromAnalisi(analisi) {
  if (!analisi) return null;
  const path = analisi.foto_path || null;
  if (path) return resolveSignedFotoUrl(path);
  return analisi.foto_url || null;
}

export async function loadUltimaFoto(userId) {
  const { data, error } = await supabase
    .from("prato_analisi")
    .select("id, created_at, foto_path, foto_url")
    .eq("user_id", userId)
    .or("foto_path.not.is.null,foto_url.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("foto_path") || error.message?.includes("foto_url")) return null;
    throw error;
  }
  if (!data) return null;

  const path = data.foto_path || null;
  const signed = path ? await resolveSignedFotoUrl(path) : data.foto_url;
  return { ...data, foto_url: signed };
}
