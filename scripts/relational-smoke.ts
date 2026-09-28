import { chromium, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { initialData } from "../src/lib/finance";
import assert from "node:assert/strict";

// Run against a separate Next dev server with the environment documented in README.
// Supabase HTTP is intercepted, but both RPCs execute the actual migration SQL in PostgreSQL.
async function main() {
  const db = new PGlite();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const owner = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; insert into auth.users values('${owner}');`,
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202609280001_financial_plans.sql",
        "utf8",
      ),
    );
    await db.query("insert into public.financial_plans values($1,$2,now())", [
      owner,
      initialData,
    ]);
    await db.exec(
      await readFile(
        "supabase/migrations/202609280002_relational_finance.sql",
        "utf8",
      ),
    );
    await db.exec(await readFile('supabase/migrations/202609280003_account_scoped_writes.sql','utf8'));
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let failNext = false,
      writes = 0;
    await page.route("http://127.0.0.1:54321/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "application/json",
      };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      try {
        if (path.endsWith("/finance_read")) {
          const result = await db.query<{ data: unknown }>("select public.finance_read() as data");
          await route.fulfill({
            headers,
            body: JSON.stringify(result.rows[0].data),
          });
          return;
        }
        if (path.endsWith("/finance_write")) {
          writes++;
          if (failNext) {
            failNext = false;
            await route.fulfill({
              status: 503,
              headers,
              body: JSON.stringify({
                message: "Conexión de prueba interrumpida",
                code: "503",
              }),
            });
            return;
          }
          const body = route.request().postDataJSON();
          const result = await db.query<{ data: number }>(
            "select public.finance_write($1,$2,$3) as data",
            [body.p_expected_revision, body.p_changes, body.p_account],
          );
          await route.fulfill({
            headers,
            body: JSON.stringify(result.rows[0].data),
          });
          return;
        }
        if (path.endsWith("/logout")) {
          await route.fulfill({ headers, body: "{}" });
          return;
        }
        await route.fulfill({
          status: 404,
          headers,
          body: JSON.stringify({ message: "Unexpected endpoint " + path }),
        });
      } catch (error) {
        const e = error as { message: string; code: string };
        await route.fulfill({
          status: 409,
          headers,
          body: JSON.stringify({ message: e.message, code: e.code }),
        });
      }
    });
    const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`;
    await page.addInitScript(
      ({ owner, token, initialData }) => {
        if (sessionStorage.getItem("test-seeded")) return;
        sessionStorage.setItem("test-seeded", "1");
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: token,
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            user: {
              id: owner,
              aud: "authenticated",
              role: "authenticated",
              email: "test@example.com",
              app_metadata: {},
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
        );
        localStorage.setItem(
          "finplan-v1",
          JSON.stringify({ ...initialData, payments: [] }),
        );
      },
      { owner, token, initialData },
    );
    await page.goto("http://localhost:3001");
    await expect(page.locator(".finance-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    await expect(page.locator(".hero-number")).toContainText("610.000");
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Pagos", exact: true })
      .click();
    await page.getByLabel("Buscar concepto").fill("Teléfono");
    await page.getByTitle("Marcar o desmarcar como pagado").click();
    await expect(page.locator(".finance-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    assert.equal(writes, 1);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.monthly_overrides where payment_id='phone'",
        )
      ).rows[0].status,
      "Pagado",
    );
    await page.reload();
    await expect(page.locator(".finance-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Pagos", exact: true })
      .click();
    await page.getByLabel("Buscar concepto").fill("Teléfono");
    await expect(page.locator("tbody .badge")).toHaveText("Pagado");
    failNext = true;
    await page.getByTitle("Marcar o desmarcar como pagado").click();
    await expect(page.locator(".sync-banner[role=alert]")).toContainText(
      "interrumpida",
    );
    await page.reload();
    await expect(page.locator(".sync-banner[role=alert]")).toContainText(
      "sesión anterior",
    );
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(page.locator(".finance-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    // Another device advances the revision. The next local edit must not overwrite it.
    await db.exec("reset role");
    await db.exec("update public.finance_accounts set revision=revision+1");
    await db.exec("set role authenticated");
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Pagos", exact: true })
      .click();
    await page.getByLabel("Buscar concepto").fill("Teléfono");
    await page.getByTitle("Marcar o desmarcar como pagado").click();
    await expect(page.locator(".sync-banner[role=alert]")).toContainText(
      "otro dispositivo",
    );
    const pending = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem(`finplan-pending:${owner}`)!),
      owner,
    );
    assert.equal(pending.data.overrides["phone:2026-09"].status, "Pagado");
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Cargar versión de mi cuenta", exact: true })
      .click();
    await expect(page.locator(".finance-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    await expect(page.locator("tbody .badge")).toHaveText("Pendiente");
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('finplan-v1')!).payments.length),0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: cloud source of truth, row autosave, reload, network recovery, stale revision conflict, pending export data, logout isolates guest data.",
    );
  } finally {
    await browser.close();
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
