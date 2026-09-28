import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { initialData, entriesFor, totals, changeCategory } from "./finance";
import {
  diffTables,
  emptyTables,
  fromTables,
  toTables,
  Snapshot,
} from "./relational";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const fixture = {
  ...initialData,
  categories: [
    "Vivienda",
    "Servicios",
    "Suscripciones",
    "Tarjetas",
    "Préstamos",
    "Impuestos",
    "Otros",
    "Salud",
  ],
  overrides: {
    "rent:2026-10": {
      ...entriesFor(initialData.payments, "2026-10", {}).find(
        (e) => e.id === "rent",
      )!,
      amount: 510000,
      status: "Pagado",
    },
    "salary:2026-11": { status: "Cobrado" },
  },
};

test("relational adapter preserves totals, currencies, recurrence and historical adjustments", () => {
  const result = fromTables(toTables(fixture));
  for (const month of ["2026-09", "2026-10", "2026-11", "2027-10"])
    for (const currency of ["ARS", "USD"] as const) {
      const a = totals(fixture, month, currency),
        b = totals(result, month, currency);
      for (const key of [
        "income",
        "committed",
        "paid",
        "pending",
        "available",
        "today",
      ] as const)
        assert.equal(a[key], b[key]);
    }
  assert.deepEqual(
    diffTables(toTables(fixture), toTables(result)),
    diffTables(toTables(fixture), toTables(fixture)),
  );
  const changed = {
    ...fixture,
    overrides: { ...fixture.overrides, "phone:2026-09": { status: "Pagado" } },
  };
  const delta = diffTables(toTables(fixture), toTables(changed));
  assert.equal(delta.monthly_overrides.upsert.length, 1);
  assert.equal(delta.payments.upsert.length, 0);
});

test("Postgres migrations, legacy backfill, RLS, transactional writes and stale revision rejection", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; insert into auth.users values('${owner}'),('${other}');`,
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202609280001_financial_plans.sql",
        "utf8",
      ),
    );
    await db.query(
      "insert into public.financial_plans(user_id,data) values($1,$2)",
      [owner, fixture],
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202609280002_relational_finance.sql",
        "utf8",
      ),
    );
    // Simulate a project that applied the old signature before the account guard.
    await db.exec("drop function public.finance_write(bigint,jsonb,uuid); create function public.finance_write(bigint,jsonb) returns bigint language sql as $$ select 0::bigint $$;");
    await db.exec(await readFile('supabase/migrations/202609280003_account_scoped_writes.sql','utf8'));
    assert.equal((await db.query<{old:unknown}>("select to_regprocedure('public.finance_write(bigint,jsonb)') as old")).rows[0].old,null);
    let currentAccount = owner;
    const login = async (user: string, role = "authenticated") => {
      currentAccount = user;
      await db.exec(`reset role; set role ${role};`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
    };
    const read = async () =>
      (
        await db.query<{ plan: Snapshot }>(
          "select public.finance_read() as plan",
        )
      ).rows[0].plan;
    const write = async (rev: number, changes: unknown) =>
      (
        await db.query<{ revision: number }>(
          "select public.finance_write($1,$2,$3) as revision",
          [rev, changes, currentAccount],
        )
      ).rows[0].revision;
    await login(owner);
    const migrated = await read();
    assert.equal(migrated.initialized, true);
    assert.equal(migrated.revision, 1);
    for (const month of ["2026-09", "2026-10", "2026-11", "2027-10"])
      assert.equal(
        totals(fromTables(migrated.tables), month, "ARS").available,
        totals(fixture, month, "ARS").available,
      );
    assert.equal(
      fromTables(migrated.tables).overrides["rent:2026-10"].amount,
      510000,
    );
    assert.equal(
      (await db.query("select * from public.financial_plans")).rows.length,
      1,
    );
    await assert.rejects(
      db.exec("update public.financial_plans set data='{}'"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("update public.payments set amount=1"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.finance_apply_rows($1,$2)", [owner, {}]),
      /permission denied/,
    );
    const renamed = toTables(
      changeCategory(fromTables(migrated.tables), "Vivienda", "Hogar"),
    );
    const revision = await write(1, diffTables(migrated.tables, renamed));
    assert.equal(Number(revision), 2);
    const updated = await read();
    assert.equal(fromTables(updated.tables).payments[0].category, "Hogar");
    assert.equal(
      fromTables(updated.tables).overrides["rent:2026-10"].category,
      "Hogar",
    );
    await assert.rejects(
      write(1, diffTables(renamed, toTables(fixture))),
      /FINPLAN_CONFLICT/,
    );
    assert.equal((await read()).revision, 2);
    const invalid = structuredClone(renamed);
    invalid.payments[0].amount = -1;
    invalid.categories.push({ id: "Rollback", name: "Rollback", position: 99 });
    await assert.rejects(
      write(2, diffTables(renamed, invalid)),
      /check constraint/,
    );
    assert.equal(
      (await read()).tables.categories.some((c) => c.id === "Rollback"),
      false,
    );
    assert.equal((await read()).revision, 2);
    await login(other);
    await assert.rejects(
      db.query("select public.finance_write($1,$2,$3)", [0, {}, owner]),
      /Account changed/,
    );
    assert.equal(
      (await db.query("select * from public.payments")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.financial_plans")).rows.length,
      0,
    );
    const blank = await read();
    assert.equal(blank.initialized, false);
    const insert = diffTables(emptyTables(), toTables(initialData));
    // Client-supplied ownership is always overwritten with auth.uid().
    for (const row of insert.payments.upsert) row.user_id = owner;
    await write(0, insert);
    assert.equal(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.payments limit 1",
        )
      ).rows[0].user_id,
      other,
    );
    const foreign = await read();
    foreign.tables.payments[0].category_id = "Hogar";
    await assert.rejects(
      write(1, diffTables(toTables(initialData), foreign.tables)),
      /foreign key constraint/,
    );
    await login(owner);
    assert.equal((await read()).revision, 2);
    await login("", "anon");
    await assert.rejects(read(), /permission denied/);
    await assert.rejects(
      db.query("select * from public.payments"),
      /permission denied/,
    );
    await login("");
    await assert.rejects(read(), /Authentication required/);
  } finally {
    await db.close();
  }
});
