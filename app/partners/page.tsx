import { createClient } from "@/lib/supabase/server";
import { PartnersView } from "@/components/PartnersView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PartnersPage() {
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("partners")
    .select(`
      *,
      properties:properties(count)
    `)
    .order("created_at", { ascending: true });

  const formattedPartners = (partners || []).map((p: any) => ({
    ...p,
    total_submissions: p.properties?.[0]?.count ?? p.total_submissions ?? 0,
  }));

  // Sắp xếp theo số căn đã duyệt giảm dần
  formattedPartners.sort(
    (a: any, b: any) => (b.total_submissions || 0) - (a.total_submissions || 0)
  );

  return <PartnersView initialPartners={formattedPartners} />;
}
