const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() => sessionStorage.setItem('finplan-demo','1'));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000");
  await page
    .getByRole("heading", { name: "Mis finanzas", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Nuevo pago", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Seguro de prueba");
  await page.getByLabel("Monto", { exact: true }).fill("10000");
  await page.getByLabel("Pago recurrente", { exact: true }).check();
  await page.getByRole("button", { name: "Guardar pago", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Pagos", exact: true })
    .click();
  await page.getByLabel("Buscar concepto").fill("Seguro de prueba");
  await page.getByText("Seguro de prueba", { exact: true }).waitFor();
  await page.getByTitle("Marcar o desmarcar como pagado").click();
  assert.equal(await page.locator("tbody .badge").innerText(), "Pagado");
  await page.reload();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Pagos", exact: true })
    .click();
  await page.getByLabel("Buscar concepto").fill("Seguro de prueba");
  assert.equal(await page.locator("tbody .badge").innerText(), "Pagado");
  await page
    .getByRole("button", { name: "Mes siguiente", exact: true })
    .click();
  assert.notEqual(await page.locator("tbody .badge").innerText(), "Pagado");
  await page.getByTitle("Editar", { exact: true }).click();
  await page.getByLabel("Monto", { exact: true }).fill("12000");
  await page.getByLabel("Aplicar cambios").selectOption("future");
  await page.getByRole("button", { name: "Guardar pago", exact: true }).click();
  await page.getByRole("button", { name: "Mes anterior", exact: true }).click();
  assert.match(await page.locator("tbody .amount").innerText(), /10.000/);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Ingresos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nuevo ingreso", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Ingreso de prueba");
  await page.getByLabel("Monto", { exact: true }).fill("50000");
  await page
    .getByRole("button", { name: "Guardar ingreso", exact: true })
    .click();
  await page.getByText("Ingreso de prueba", { exact: true }).waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Proyección", exact: true })
    .click();
  await page.getByRole("button", { name: "12 meses", exact: true }).click();
  assert.equal(await page.locator("thead th").count(), 13);
  await page
    .getByRole("button", { name: "octubre de 2026", exact: false })
    .click();
  await page
    .getByRole("heading", { name: "Gastos fijos", exact: true })
    .waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Pagos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tarjetas y cuotas", exact: false })
    .click();
  await page
    .getByRole("heading", { name: "Compras en cuotas", exact: true })
    .waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Pagos recurrentes", exact: true })
    .waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Inicio", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Pagos", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: create payment/income, mark paid, persistence, recurrence, historical editing, projection, card, settings, mobile overflow, no browser errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
