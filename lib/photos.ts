import { createClient } from "@/lib/supabase/server";

/** Short-lived photo URL for a path the caller can already SELECT. */
export async function signedPhotoUrl(path: string | null | undefined) {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
