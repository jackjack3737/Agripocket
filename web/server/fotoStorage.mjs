/** Storage foto prato: bucket privato, niente URL pubblici. */

const BUCKET = "prato-foto";
const SIGNED_TTL_SEC = 900;

export async function uploadAnalisiFoto(admin, userId, analisiId, imageBase64, mimeType = "image/jpeg") {
  if (!imageBase64 || !analisiId || !userId) return { foto_url: null, foto_path: null };

  const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 100) return { foto_url: null, foto_path: null };

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const foto_path = `${userId}/${analisiId}.${ext}`;

  const { error } = await admin.storage.from(BUCKET).upload(foto_path, buf, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    console.warn("[uploadAnalisiFoto]", error.message);
    return { foto_url: null, foto_path: null };
  }

  return { foto_url: null, foto_path };
}

export async function createSignedFotoUrl(admin, fotoPath, expiresIn = SIGNED_TTL_SEC) {
  if (!fotoPath) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(fotoPath, expiresIn);
  if (error) {
    console.warn("[fotoStorage] signedUrl:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function aggiornaAnalisiFoto(admin, analisiId, patch) {
  if (!patch.foto_path && !patch.foto_url) return;
  const row = { foto_path: patch.foto_path ?? null, foto_url: null };
  await admin.from("prato_analisi").update(row).eq("id", analisiId);
}
