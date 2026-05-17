import { supabase } from "./supabase";

/** Fallback upload foto da client se il server non ha salvato l'URL. */
export async function uploadFotoAnalisiClient(userId, analisiId, base64, mimeType = "image/jpeg") {
  if (!userId || !analisiId || !base64) return null;

  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${analisiId}.${ext}`;

  const { error: upErr } = await supabase.storage.from("prato-foto").upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (upErr) {
    console.warn("[fotoPrato] upload:", upErr.message);
    return null;
  }

  const { data } = supabase.storage.from("prato-foto").getPublicUrl(path);
  const foto_url = data?.publicUrl ?? null;

  if (foto_url) {
    await supabase
      .from("prato_analisi")
      .update({ foto_url, foto_path: path })
      .eq("id", analisiId);
  }

  return foto_url;
}

export async function loadUltimaFoto(userId) {
  const { data, error } = await supabase
    .from("prato_analisi")
    .select("id, created_at, foto_url")
    .eq("user_id", userId)
    .not("foto_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("foto_url")) return null;
    throw error;
  }
  return data;
}
