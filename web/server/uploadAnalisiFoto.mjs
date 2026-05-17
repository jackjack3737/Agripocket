/** Carica foto analisi su Supabase Storage (service role). */

export async function uploadAnalisiFoto(admin, userId, analisiId, imageBase64, mimeType = "image/jpeg") {
  if (!imageBase64 || !analisiId || !userId) return { foto_url: null, foto_path: null };

  const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 100) return { foto_url: null, foto_path: null };

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const foto_path = `${userId}/${analisiId}.${ext}`;

  const { error } = await admin.storage.from("prato-foto").upload(foto_path, buf, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    console.warn("[uploadAnalisiFoto]", error.message);
    return { foto_url: null, foto_path: null };
  }

  const { data } = admin.storage.from("prato-foto").getPublicUrl(foto_path);
  return { foto_url: data?.publicUrl ?? null, foto_path };
}

export async function aggiornaAnalisiFoto(admin, analisiId, patch) {
  if (!patch.foto_url && !patch.foto_path) return;
  await admin.from("prato_analisi").update(patch).eq("id", analisiId);
}
