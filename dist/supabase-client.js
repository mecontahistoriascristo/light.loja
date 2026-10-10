const config = window.LIGHT_CONFIG || {};
let clientPromise;

export function hasSupabaseConfig() {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}

export async function getSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2.57.4")
      .then(({ createClient }) => createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }))
      .catch(() => null);
  }
  return clientPromise;
}

export async function currentAdminState() {
  const supabase = await getSupabaseClient();
  if (!supabase) return { configured: false, session: null, isAdmin: false };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { configured: true, session: null, isAdmin: false };
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { configured: true, session: null, isAdmin: false, error: userError?.message || "Não foi possível confirmar sua sessão." };
  const { data, error } = await supabase.rpc("is_light_admin");
  return { configured: true, session: { ...session, user }, isAdmin: !error && data === true, error: error?.message || "" };
}

export async function sendAdminMagicLink(email) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/admin.html` },
  });
  if (error) throw error;
}

export async function signOutAdmin() {
  const supabase = await getSupabaseClient();
  if (supabase) await supabase.auth.signOut();
}

export async function uploadCatalogImage(file, folder = "products") {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  if (!file?.type?.startsWith("image/")) throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Cada imagem pode ter no máximo 5 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
  const name = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("catalog-media").upload(name, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("catalog-media").getPublicUrl(name).data.publicUrl;
}
