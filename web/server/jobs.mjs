import { createClient } from "@supabase/supabase-js";

export async function createJob(admin, userId, tipo, payload = {}) {
  const { data, error } = await admin
    .from("prato_jobs")
    .insert({
      user_id: userId,
      tipo,
      status: "pending",
      payload,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST205") return { job: null, tablesMissing: true };
    throw new Error(`Job: ${error.message}`);
  }
  return { job: data, tablesMissing: false };
}

export async function updateJob(admin, jobId, patch) {
  const { data, error } = await admin
    .from("prato_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw new Error(`Job update: ${error.message}`);
  return data;
}

export async function getJobForUser(admin, jobId, userId) {
  const { data, error } = await admin
    .from("prato_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export function adminClient(env) {
  return createClient(env.SUPABASE_URL?.trim(), env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
