const { chromium, expect } = require("@playwright/test");
require("@next/env").loadEnvConfig(process.cwd());
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "prueba@example.com",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".test";
  const session = {
    access_token: token,
    refresh_token: "test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  let magic = 0,
    recover = 0,
    updates = 0;
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON();
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith("/token")) {
      if (body.password === "incorrecta")
        return route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({
            code: "invalid_credentials",
            msg: "Invalid login credentials",
          }),
        });
      return route.fulfill({ headers, body: JSON.stringify(session) });
    }
    if (url.pathname.endsWith("/otp")) {
      magic++;
      if (!url.searchParams.get("redirect_to").endsWith("/login"))
        throw Error("Magic redirect");
      return route.fulfill({ headers, body: "{}" });
    }
    if (url.pathname.endsWith("/recover")) {
      recover++;
      if (!url.searchParams.get("redirect_to").endsWith("/auth/reset-password"))
        throw Error("Recovery redirect");
      return route.fulfill({ headers, body: "{}" });
    }
    if (url.pathname.endsWith("/user")) {
      if (route.request().method() === "PUT") updates++;
      return route.fulfill({ headers, body: JSON.stringify(user) });
    }
    if (url.pathname.endsWith("/logout"))
      return route.fulfill({ headers, body: "{}" });
    throw Error("Unexpected auth request " + url.pathname);
  });
  await context.route("**/rest/v1/rpc/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        revision: 0,
        initialized: false,
        tables: {
          categories: [],
          credit_cards: [],
          payments: [],
          incomes: [],
          recurrences: [],
          installment_plans: [],
          monthly_overrides: [],
        },
      }),
    }),
  );
  const p = await context.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    await p.goto("http://localhost:3000");
    await expect(p).toHaveURL(/\/login$/);
    await p.screenshot({ path: "artifacts/login-desktop.png", fullPage: true });
    await p.getByLabel("Correo electrónico", { exact: true }).fill(user.email);
    await p.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
    await p
      .getByRole("button", { name: "Mostrar contraseña", exact: true })
      .click();
    await expect(p.getByLabel("Contraseña", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await p.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(p.locator(".auth-error")).toContainText("no son correctos");
    await p.getByRole("button", { name: "Enlace mágico", exact: true }).click();
    await p
      .getByRole("button", { name: "Enviar enlace mágico", exact: true })
      .click();
    await expect(p.locator(".auth-feedback")).toContainText("Revisá tu correo");
    if (magic !== 1) throw Error("Magic not sent");
    await p.getByRole("button", { name: "Contraseña", exact: true }).click();
    await p
      .getByRole("button", { name: "Olvidé mi contraseña", exact: true })
      .click();
    await p
      .getByRole("button", {
        name: "Enviar enlace de recuperación",
        exact: true,
      })
      .click();
    await expect(p.locator(".auth-feedback")).toContainText(
      "Si hay una cuenta",
    );
    if (recover !== 1) throw Error("Recovery not sent");
    await p
      .getByRole("button", { name: "Volver al inicio de sesión", exact: true })
      .click();
    await p
      .getByLabel("Contraseña", { exact: true })
      .fill("correcta-de-prueba");
    await p.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: "Mis finanzas", exact: true }),
    ).toBeVisible();
    await p
      .locator(".sidebar")
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await p.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(p).toHaveURL(/\/login$/);
    await p.goto("http://localhost:3000/auth/reset-password");
    await expect(
      p.getByText("Abrí el enlace de recuperación", { exact: false }),
    ).toBeVisible();
    await p.goto("about:blank");
    await p.goto(
      "http://localhost:3000/auth/reset-password#access_token=" +
        token +
        "&refresh_token=test&token_type=bearer&expires_in=3600&type=recovery",
    );
    await p
      .getByLabel("Nueva contraseña", { exact: true })
      .fill("Nueva-prueba-2026!");
    await p
      .getByLabel("Repetí la nueva contraseña", { exact: true })
      .fill("No-coincide-2026!");
    await p
      .getByRole("button", { name: "Guardar nueva contraseña", exact: true })
      .click();
    await expect(p.locator(".auth-error")).toContainText("no coinciden");
    if (updates !== 0) throw Error("Premature update");
    await p
      .getByLabel("Repetí la nueva contraseña", { exact: true })
      .fill("Nueva-prueba-2026!");
    await p
      .getByRole("button", { name: "Guardar nueva contraseña", exact: true })
      .click();
    await expect(p.locator(".auth-feedback")).toContainText(
      "actualizó correctamente",
    );
    if (updates !== 1) throw Error("No password update");
    await context.clearCookies();
    await p.evaluate(() => localStorage.clear());
    await p.goto("http://localhost:3000/login");
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await p.screenshot({
      path: "artifacts/login-mobile-dark.png",
      fullPage: true,
    });
    if (
      !(await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw Error("Mobile overflow");
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "PASS: login gate, invalid/password login, magic link, reset email, recovery session, password update, logout, mobile; all auth requests mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
