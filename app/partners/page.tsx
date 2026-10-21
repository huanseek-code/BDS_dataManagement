import { createClient } from "@/lib/supabase/server";
import { PartnersView } from "@/components/PartnersView";

export const revalidate = 10;

export default async function PartnersPage() {
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("partners")
    .select("*")
    .order("total_submissions", { ascending: false });

  return <PartnersView initialPartners={partners || []} />;
}
