export type Currency = "ARS" | "USD";
export type Entry = {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  category: string;
  date: string;
  status: string;
  interval: number;
  variable: boolean;
  notes: string;
  end?: string;
  card?: string;
  installments?: number;
  /** Storage path of the receipt for one month; only stored in overrides. */
  receipt?: string;
};
export type Data = {
  categories?: string[];
  payments: Entry[];
  incomes: Entry[];
  overrides: Record<string, Partial<Entry>>;
};
export const categories = [
  "Vivienda",
  "Servicios",
  "Suscripciones",
  "Tarjetas",
  "Préstamos",
  "Impuestos",
  "Otros",
];
export const protectedCategories = ["Tarjetas", "Préstamos", "Otros"];
export function paymentCategories(data: Data): string[] {
  return [
    ...new Set([
      ...(data.categories ?? categories),
      ...protectedCategories,
      ...data.payments.map((e) => e.category),
      ...Object.values(data.overrides).flatMap((e) =>
        e?.category && e.category !== "Ingreso" ? [e.category] : [],
      ),
    ]),
  ];
}
export function changeCategory(
  data: Data,
  name: string,
  replacement?: string,
): Data {
  if (protectedCategories.includes(name))
    throw new Error(
      "Esta categoría se utiliza en la proyección y no se puede modificar.",
    );
  const target = replacement?.trim() || "Otros";
  if (
    replacement &&
    (target.toLocaleLowerCase("es") === "ingreso" ||
      paymentCategories(data).some(
        (c) =>
          c !== name &&
          c.toLocaleLowerCase("es") === target.toLocaleLowerCase("es"),
      ))
  )
    throw new Error("Ya existe una categoría con ese nombre.");
  const paymentIds = new Set(data.payments.map((e) => e.id));
  return {
    ...data,
    categories: paymentCategories(data).flatMap((c) =>
      c === name ? (replacement ? [target] : []) : [c],
    ),
    payments: data.payments.map((e) =>
      e.category === name ? { ...e, category: target } : e,
    ),
    overrides: Object.fromEntries(
      Object.entries(data.overrides).map(([key, e]) => [
        key,
        e?.category === name && paymentIds.has(key.split(":")[0])
          ? { ...e, category: target }
          : e,
      ]),
    ),
  };
}
export const money = (n: number, currency: Currency = "ARS") =>
  `${currency === "USD" ? "US$" : "$"} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)}`;
export function addMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export const monthName = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
export function entriesFor(
  entries: Entry[],
  month: string,
  overrides: Data["overrides"],
): Entry[] {
  return entries.flatMap((e) => {
    const start = e.date.slice(0, 7);
    const diff =
      (Number(month.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(month.slice(5)) -
      Number(start.slice(5));
    if (
      diff < 0 ||
      (e.end && month > e.end) ||
      (e.installments && diff >= e.installments) ||
      (e.interval ? diff % e.interval !== 0 : diff !== 0)
    )
      return [];
    const day = Math.min(
      Number(e.date.slice(8)),
      new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate(),
    );
    return [
      {
        ...e,
        date: `${month}-${String(day).padStart(2, "0")}`,
        status:
          diff === 0
            ? e.status
            : e.category === "Ingreso"
              ? "Estimado"
              : "Pendiente",
        ...overrides[`${e.id}:${month}`],
        end: e.end,
      },
    ];
  });
}
export function totals(data: Data, month: string, currency: Currency) {
  const payments = entriesFor(data.payments, month, data.overrides).filter(
    (e) => e.currency === currency,
  );
  const incomes = entriesFor(data.incomes, month, data.overrides).filter(
    (e) => e.currency === currency,
  );
  const sum = (list: Entry[]) => list.reduce((a, e) => a + e.amount, 0);
  const income = sum(incomes),
    committed = sum(payments),
    paid = sum(payments.filter((e) => e.status === "Pagado")),
    collected = sum(incomes.filter((e) => e.status === "Cobrado"));
  return {
    payments,
    incomes,
    income,
    committed,
    paid,
    collected,
    available: income - committed,
    pending: committed - paid,
    today: collected - paid,
  };
}
const entry = (
  id: string,
  name: string,
  amount: number,
  category: string,
  day: number,
  status = "Pendiente",
  interval = 1,
): Entry => ({
  id,
  name,
  amount,
  currency: "ARS",
  category,
  date: `2026-09-${String(day).padStart(2, "0")}`,
  status,
  interval,
  variable: false,
  notes: "",
});
export const initialData: Data = {
  payments: [
    entry("rent", "Alquiler", 480000, "Vivienda", 5, "Pagado"),
    entry("expenses", "Expensas", 145000, "Vivienda", 10, "Pagado"),
    entry("internet", "Internet", 32000, "Servicios", 10, "Pagado"),
    entry("water", "AySA", 18000, "Servicios", 15, "Pagado"),
    entry("light", "Luz", 45000, "Servicios", 18, "Pagado"),
    entry("visa", "Santander Visa", 215000, "Tarjetas", 30, "Pendiente", 0),
    entry("amex", "Santander Amex", 90000, "Tarjetas", 29, "Pendiente", 0),
    entry("tax", "Monotributo", 35000, "Impuestos", 30),
    entry("phone", "Teléfono", 25000, "Servicios", 29),
    entry("loan", "Préstamo personal", 155000, "Préstamos", 30),
    {
      ...entry("mac", "MacBook · cuota", 95000, "Tarjetas", 8),
      date: "2026-10-08",
      card: "Santander Visa",
      installments: 9,
    },
    {
      ...entry("course", "Curso · cuota", 32000, "Tarjetas", 8),
      date: "2026-10-08",
      card: "Santander Visa",
      installments: 2,
    },
  ],
  incomes: [
    entry("salary", "Trabajo principal", 1300000, "Ingreso", 1, "Cobrado"),
    entry(
      "freelance",
      "Proyecto freelance",
      350000,
      "Ingreso",
      25,
      "Confirmado",
      0,
    ),
    entry("design", "Proyecto de diseño", 200000, "Ingreso", 30, "Estimado", 0),
  ],
  overrides: {},
};
