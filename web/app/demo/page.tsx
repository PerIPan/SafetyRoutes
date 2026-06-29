import { redirect } from "next/navigation";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

// Jump to the most recent seeded demo report (npm run db:seed).
export default async function Demo() {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM scans WHERE domain = 'harbourtrust.org' ORDER BY created_at DESC LIMIT 1`,
  );
  redirect(row ? `/report/${row.id}` : "/new");
}
