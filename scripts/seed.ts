/**
 * Materialises a `lots` row for every surface in the catalogue.
 *
 * Not strictly required — placeBid inserts a lot row on first bid — but running
 * it after a migration means the admin console and the board show the full
 * catalogue from a live database immediately, and it is the fastest way to
 * confirm DATABASE_URL actually works before the auction opens.
 *
 * Idempotent: existing rows keep their status.
 */
import postgres from "postgres";
import { PANEL_CATALOGUE } from "../src/lib/domain/panels";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const ids = PANEL_CATALOGUE.map((panel) => ({ panel_id: panel.id }));
    await sql`
      insert into lots ${sql(ids, "panel_id")}
      on conflict (panel_id) do nothing
    `;

    const [row] = await sql<{ count: string }[]>`select count(*)::text as count from lots`;
    console.log(`Seeded ${PANEL_CATALOGUE.length} lots; ${row?.count ?? "?"} rows present.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
