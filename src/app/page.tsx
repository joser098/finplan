"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import CategorySettings from "@/components/category-settings";
import AuthGate from "@/components/auth-gate";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Ellipsis,
  House,
  LayoutGrid,
  Paperclip,
  Plus,
  Repeat2,
  Search,
  Settings2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  addMonth,
  paymentCategories,
  Currency,
  Entry,
  entriesFor,
  money,
  monthName,
  totals,
} from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import {
  maxReceiptBytes,
  receiptTypes,
  receiptUrl,
  removeReceipt,
  uploadReceipt,
} from "@/lib/receipts";
import { useFinanceStore } from "@/lib/use-finance-store";
type View =
  | "Inicio"
  | "Pagos"
  | "Ingresos"
  | "Proyección"
  | "Configuración"
  | "Detalle mensual"
  | "Tarjeta";
type Modal = { income: boolean; entry?: Entry; detail?: boolean };
const nav = [
  { name: "Inicio", icon: LayoutGrid },
  { name: "Pagos", icon: Wallet },
  { name: "Ingresos", icon: ArrowDownLeft },
  { name: "Proyección", icon: TrendingUp },
] as const;
const dateLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export default function Home() {
  return (
    <AuthGate>
      <FinanceApp />
    </AuthGate>
  );
}
function FinanceApp() {
  const store = useFinanceStore();
  const { data, setData, user } = store;
  const [view, setView] = useState<View>("Inicio"),
    [month, setMonth] = useState("2026-09"),
    [currency, setCurrency] = useState<Currency>("ARS");
  const [filter, setFilter] = useState("Todos"),
    [category, setCategory] = useState("Todas las categorías"),
    [search, setSearch] = useState(""),
    [months, setMonths] = useState(6),
    [modal, setModal] = useState<Modal | null>(null),
    [paying, setPaying] = useState<Entry | null>(null),
    [toast, setToast] = useState("");
  const categories = paymentCategories(data);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const t = totals(data, month, currency),
    percent = t.income ? Math.round((t.committed / t.income) * 100) : 0,
    today = localDate(new Date());
  const status = (e: Entry) =>
    e.category !== "Ingreso" && e.status !== "Pagado" && e.date < today
      ? "Vencido"
      : e.status;
  const upcoming = [...t.payments]
    .filter((e) => e.status !== "Pagado")
    .sort((a, b) => a.date.localeCompare(b.date));
  function go(v: View) {
    setView(v);
    setFilter("Todos");
    setSearch("");
  }
  // Marking a payment as paid offers an optional receipt first (signed-in only).
  function requestMark(e: Entry, income = false) {
    if (!income && e.status !== "Pagado" && user) setPaying(e);
    else mark(e, income);
  }
  function mark(e: Entry, income = false, receipt?: string) {
    setData((d) => ({
      ...d,
      overrides: {
        ...d.overrides,
        [`${e.id}:${month}`]: {
          ...d.overrides[`${e.id}:${month}`],
          ...(receipt ? { receipt } : {}),
          status: income
            ? e.status === "Cobrado"
              ? "Confirmado"
              : "Cobrado"
            : e.status === "Pagado"
              ? "Pendiente"
              : "Pagado",
        },
      },
    }));
    setToast("Estado actualizado");
  }
  function save(e: Entry, scope: string) {
    const key = modal?.income ? "incomes" : "payments";
    setData((d) => {
      if (!modal?.entry) return { ...d, [key]: [...d[key], e] };
      if (scope === "future") {
        const old = d[key].find((p) => p.id === e.id)!;
        const diff =
          (Number(month.slice(0, 4)) - Number(old.date.slice(0, 4))) * 12 +
          Number(month.slice(5)) -
          Number(old.date.slice(5, 7));
        return {
          ...d,
          [key]: [
            ...d[key].map((p) =>
              p.id === e.id ? { ...p, end: addMonth(month, -1) } : p,
            ),
            {
              ...e,
              id: crypto.randomUUID(),
              receipt: undefined,
              installments: e.installments
                ? Math.max(1, e.installments - diff)
                : undefined,
            },
          ],
        };
      }
      // The end month belongs to the whole series, not to a single month.
      const { end, ...monthly } = e;
      return {
        ...d,
        [key]: d[key].map((p) => (p.id === e.id ? { ...p, end } : p)),
        overrides: { ...d.overrides, [`${e.id}:${month}`]: monthly },
      };
    });
    setModal(null);
    setToast(
      user ? "Actualizando tu planificación…" : "Guardado en este dispositivo.",
    );
  }
  function attachReceipt(e: Entry, receipt: string | undefined) {
    setData((d) => ({
      ...d,
      overrides: {
        ...d.overrides,
        [`${e.id}:${month}`]: { ...d.overrides[`${e.id}:${month}`], receipt },
      },
    }));
    setToast(receipt ? "Comprobante guardado" : "Comprobante eliminado");
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `finplan-${month}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function table(rows: Entry[], income = false) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>{income ? "Fecha de cobro" : "Vencimiento"}</th>
              <th>Monto</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>
                  <button
                    className="concept"
                    onClick={() => setModal({ income, entry: e, detail: true })}
                  >
                    <span
                      className={`concept-icon ${e.category === "Tarjetas" ? "purple" : ""}`}
                    >
                      {e.category === "Vivienda" ? (
                        <House size={18} />
                      ) : e.category === "Tarjetas" ? (
                        <CreditCard size={18} />
                      ) : income ? (
                        <ArrowDownLeft size={18} />
                      ) : (
                        <Wallet size={18} />
                      )}
                    </span>
                    <span>
                      <strong>{e.name}</strong>
                      <small>
                        {income
                          ? e.interval
                            ? "Ingreso recurrente"
                            : "Ingreso puntual"
                          : e.category}
                        {e.interval > 0 && <Repeat2 size={11} />}
                        {e.receipt && (
                          <Paperclip size={11} aria-label="Con comprobante" />
                        )}
                      </small>
                    </span>
                  </button>
                </td>
                <td>{dateLabel(e.date)}</td>
                <td className="amount">{money(e.amount, e.currency)}</td>
                <td>
                  <span className={`badge ${status(e).toLowerCase()}`}>
                    <i />
                    {status(e)}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className={`icon-button ${["Pagado", "Cobrado"].includes(e.status) ? "checked" : ""}`}
                      title={
                        income
                          ? "Cambiar estado de cobro"
                          : "Marcar o desmarcar como pagado"
                      }
                      onClick={() => requestMark(e, income)}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      className="icon-button"
                      title="Editar"
                      onClick={() => setModal({ income, entry: e })}
                    >
                      <Ellipsis size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            No hay {income ? "ingresos" : "pagos"} para esta selección.
            <button
              className="text-button"
              onClick={() => setModal({ income })}
            >
              Agregar el primero <Plus size={15} />
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-symbol">
            <TrendingUp size={24} />
          </span>
          finplan<span className="brand-dot">.</span>
        </Link>
        <div className="workspace">
          <span className="avatar">M</span>
          <div>
            Mi espacio personal<small>Un poco más de tranquilidad</small>
          </div>
        </div>
        <p className="nav-label">TU PLANIFICACIÓN</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              className={view === n.name ? "active" : ""}
              onClick={() => go(n.name)}
            >
              <n.icon size={20} />
              {n.name}
              {view === n.name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="settings-link" onClick={() => go("Configuración")}>
            <Settings2 size={19} />
            Configuración
          </button>
          <div className="profile">
            <span className="avatar">MP</span>
            <div>
              Mi planificación
              <small>
                {user ? "Cuenta conectada" : "Espacio de demostración"}
              </small>
            </div>
            <i className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <main>
          {(store.status === "loading" ||
            store.status === "saving" ||
            store.error) && (
            <div
              className="sync-banner"
              role={store.error ? "alert" : "status"}
            >
              <span>
                {store.error ||
                  (store.status === "loading"
                    ? "Cargando tu planificación…"
                    : "Guardando cambios en tu cuenta…")}
              </span>
              {store.error && (
                <div className="settings-actions">
                  <button
                    className="secondary"
                    onClick={() => void store.retry()}
                  >
                    Reintentar
                  </button>
                  <button className="secondary" onClick={exportData}>
                    Exportar lo que estoy viendo
                  </button>
                  {store.hasRecovery && (
                    <button
                      className="secondary"
                      onClick={store.downloadRecovery}
                    >
                      Descargar cambios pendientes
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => {
                      if (
                        confirm(
                          "¿Cargar la versión de tu cuenta? Podés descargar los cambios pendientes antes de continuar.",
                        )
                      )
                        void store.reload(true);
                    }}
                  >
                    Cargar versión de mi cuenta
                  </button>
                  {user && (
                    <button
                      className="text-button"
                      onClick={() => supabase?.auth.signOut()}
                    >
                      Cerrar sesión
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="finance-content" inert={!store.canEdit}>
            <div className="page-heading">
              <div>
                <div className="eyebrow">TU DINERO, CON CLARIDAD</div>
                <h1>
                  {view === "Inicio"
                    ? "Mis finanzas"
                    : view === "Proyección"
                      ? "Proyección financiera"
                      : view === "Detalle mensual"
                        ? monthName(month)
                        : view === "Tarjeta"
                          ? "Santander Visa"
                          : view}
                </h1>
                <p>
                  {view === "Inicio"
                    ? "Todo lo que necesitás saber para planificar tu mes."
                    : view === "Pagos"
                      ? "Tus compromisos, organizados y bajo control."
                      : view === "Ingresos"
                        ? "Lo que esperás recibir y lo que ya está en tus manos."
                        : view === "Proyección"
                          ? "Mirá hacia adelante. Decidí con más tranquilidad."
                          : "Un plan que se adapta a vos."}
                </p>
              </div>
              <div className="heading-actions">
                {view !== "Configuración" && (
                  <>
                    <select
                      aria-label="Moneda"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as Currency)}
                    >
                      <option>ARS</option>
                      <option>USD</option>
                    </select>
                    <button
                      className="primary"
                      onClick={() => setModal({ income: view === "Ingresos" })}
                    >
                      <Plus size={17} />
                      Nuevo {view === "Ingresos" ? "ingreso" : "pago"}
                    </button>
                  </>
                )}
              </div>
            </div>
            {view !== "Configuración" && (
              <div className="month-row">
                <div className="month-picker">
                  <button
                    aria-label="Mes anterior"
                    onClick={() => setMonth(addMonth(month, -1))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    <CalendarDays size={16} />
                    {monthName(month)}
                  </span>
                  <button
                    aria-label="Mes siguiente"
                    onClick={() => setMonth(addMonth(month, 1))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <span className="month-caption">Tu mes, en perspectiva</span>
              </div>
            )}
            {view === "Inicio" && (
              <>
                <section className="overview">
                  <div className="overview-left">
                    <div className="overview-metrics">
                      <div>
                        <span className="metric-label">
                          <span className="mini-icon">
                            <ArrowDownLeft size={15} />
                          </span>
                          Ingresos del mes
                        </span>
                        <h2>{money(t.income, currency)}</h2>
                        <small>Estimados y confirmados</small>
                      </div>
                      <div>
                        <span className="metric-label">
                          <span className="mini-icon gray">
                            <ArrowUpRight size={15} />
                          </span>
                          Total comprometido
                        </span>
                        <h2>{money(t.committed, currency)}</h2>
                        <small>{t.payments.length} compromisos este mes</small>
                      </div>
                    </div>
                    <div className="commitment">
                      <div>
                        <span>
                          <strong>{percent}%</strong> de tus ingresos están
                          comprometidos
                        </span>
                        <span>{Math.max(0, 100 - percent)}% libre</span>
                      </div>
                      <div className="progress">
                        <span style={{ width: `${Math.min(percent, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                  <div
                    className={`available-card ${t.available < 0 ? "negative" : ""}`}
                  >
                    <span className="available-label">
                      Disponible proyectado <ArrowUpRight size={19} />
                    </span>
                    <div className="hero-number">
                      {money(t.available, currency)}
                    </div>
                    <p>Para vos, después de pagar todo.</p>
                    <div className="available-footer">
                      <span className="check-circle">
                        <Check size={13} />
                      </span>
                      {t.available >= 0
                        ? "Tu mes está en equilibrio"
                        : "Tus compromisos superan tus ingresos"}
                    </div>
                    <div className="card-orbit" />
                  </div>
                </section>
                <section className="month-state">
                  <div className="state-title">
                    <span className="icon-circle">
                      <Wallet size={20} />
                    </span>
                    <div>
                      <strong>Así va tu mes</strong>
                      <small>Cada pago, un paso adelante.</small>
                    </div>
                  </div>
                  <div>
                    <span>
                      <i className="dot green" />
                      Ya pagaste
                    </span>
                    <strong>{money(t.paid, currency)}</strong>
                  </div>
                  <div>
                    <span>
                      <i className="dot amber" />
                      Pendiente de pago
                    </span>
                    <strong>{money(t.pending, currency)}</strong>
                  </div>
                  <div className="today">
                    <span>
                      Disponible hoy{" "}
                      <span title="Ingresos cobrados menos pagos realizados">
                        ⓘ
                      </span>
                    </span>
                    <strong>{money(t.today, currency)}</strong>
                  </div>
                </section>
                <div className="dashboard-grid">
                  <section className="panel upcoming">
                    <div className="panel-heading">
                      <div>
                        <h3>
                          Próximos pagos{" "}
                          <span className="count">{upcoming.length}</span>
                        </h3>
                        <p>Un vistazo a lo que viene.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("Pagos")}
                      >
                        Ver todos <ArrowRight size={15} />
                      </button>
                    </div>
                    {table(upcoming.slice(0, 4))}
                    <div className="table-footer">
                      <CalendarDays size={15} />
                      Un mes organizado, una preocupación menos.
                    </div>
                  </section>
                  <section className="panel outlook">
                    <div className="panel-heading">
                      <div>
                        <h3>Mirando hacia adelante</h3>
                        <p>Tu disponible en los próximos meses.</p>
                      </div>
                      <TrendingUp size={20} />
                    </div>
                    <div className="mini-chart">
                      {[1, 2, 3].map((i) => {
                        const m = addMonth(month, i),
                          v = totals(data, m, currency).available;
                        return (
                          <button
                            className="bar-column"
                            key={m}
                            onClick={() => {
                              setMonth(m);
                              go("Detalle mensual");
                            }}
                          >
                            <strong>{money(v, currency)}</strong>
                            <span
                              className={`bar bar-${i}`}
                              style={{
                                height: `${Math.max(12, Math.min(115, (Math.abs(v) / Math.max(t.income, 1)) * 190))}px`,
                              }}
                            />
                            <small>
                              {monthName(m).split(" ")[0].slice(0, 3)}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="projection-link"
                      onClick={() => go("Proyección")}
                    >
                      Explorar mi proyección <ArrowRight size={16} />
                    </button>
                  </section>
                </div>
                <div className="insight">
                  <span className="insight-icon">
                    <Check size={17} />
                  </span>
                  <p>
                    {t.committed ? (
                      <>
                        Ya pagaste el{" "}
                        <strong>
                          {Math.round((t.paid / t.committed) * 100)}% de tus
                          compromisos.
                        </strong>{" "}
                        {t.pending
                          ? `Te quedan ${money(t.pending, currency)} para completar el mes.`
                          : "¡Todo al día!"}
                      </>
                    ) : (
                      "Todavía no tenés compromisos este mes. Empezá a planificar."
                    )}
                  </p>
                  <span>UN PASO A LA VEZ</span>
                </div>
              </>
            )}
            {(view === "Pagos" || view === "Ingresos") && (
              <>
                {view === "Ingresos" && (
                  <div className="summary-grid">
                    {[
                      ["Ingreso estimado total", t.income],
                      [
                        "Confirmado y cobrado",
                        t.incomes
                          .filter((e) => e.status !== "Estimado")
                          .reduce((a, e) => a + e.amount, 0),
                      ],
                      ["Ingreso cobrado", t.collected],
                    ].map(([l, v]) => (
                      <div className="panel stat" key={l}>
                        <small>{l}</small>
                        <h2>{money(Number(v), currency)}</h2>
                      </div>
                    ))}
                  </div>
                )}
                <section className="panel">
                  <div className="filters">
                    <div className="tabs">
                      {(view === "Pagos"
                        ? [
                            "Todos",
                            "Pendientes",
                            "Pagados",
                            "Próximos",
                            "Vencidos",
                          ]
                        : ["Todos", "Estimado", "Confirmado", "Cobrado"]
                      ).map((f) => (
                        <button
                          className={filter === f ? "selected" : ""}
                          key={f}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="search-filters">
                      <label className="search">
                        <Search size={16} />
                        <input
                          aria-label="Buscar concepto"
                          placeholder="Buscar un concepto..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      {view === "Pagos" && (
                        <select
                          aria-label="Categoría"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option>Todas las categorías</option>
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  {table(
                    (view === "Ingresos" ? t.incomes : t.payments).filter(
                      (e) =>
                        e.name.toLowerCase().includes(search.toLowerCase()) &&
                        (view === "Ingresos" ||
                          category === "Todas las categorías" ||
                          e.category === category) &&
                        (filter === "Todos" ||
                          (filter === "Pendientes" && e.status !== "Pagado") ||
                          (filter === "Pagados" && e.status === "Pagado") ||
                          (filter === "Vencidos" && status(e) === "Vencido") ||
                          (filter === "Próximos" &&
                            e.status !== "Pagado" &&
                            e.date >= today &&
                            e.date <=
                              localDate(new Date(Date.now() + 7 * 86400000))) ||
                          filter === e.status),
                    ),
                    view === "Ingresos",
                  )}
                </section>
                {view === "Pagos" && (
                  <button className="card-banner" onClick={() => go("Tarjeta")}>
                    <CreditCard size={25} />
                    <div>
                      <strong>Tarjetas y cuotas</strong>
                      <span>
                        Consultá tus resúmenes y planificá las próximas cuotas.
                      </span>
                    </div>
                    <ArrowRight size={20} />
                  </button>
                )}
              </>
            )}
            {view === "Proyección" && (
              <section className="panel projection">
                <div className="panel-heading">
                  <h3>Tu panorama financiero</h3>
                  <div className="tabs">
                    {[3, 6, 12].map((n) => (
                      <button
                        key={n}
                        className={months === n ? "selected" : ""}
                        onClick={() => setMonths(n)}
                      >
                        {n} meses
                      </button>
                    ))}
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        {Array.from({ length: months }, (_, i) => (
                          <th key={i}>
                            <button
                              className="text-button capitalize"
                              onClick={() => {
                                setMonth(addMonth(month, i));
                                go("Detalle mensual");
                              }}
                            >
                              {monthName(addMonth(month, i))}
                              <ArrowUpRight size={13} />
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        "Ingresos",
                        "Gastos fijos",
                        "Tarjetas y deudas",
                        "Otros",
                        "Disponible",
                      ].map((row, r) => (
                        <tr key={row} className={r === 4 ? "total-row" : ""}>
                          <td>{row}</td>
                          {Array.from({ length: months }, (_, i) => {
                            const s = totals(
                                data,
                                addMonth(month, i),
                                currency,
                              ),
                              v =
                                r === 0
                                  ? s.income
                                  : r === 4
                                    ? s.available
                                    : s.payments
                                        .filter((e) =>
                                          r === 1
                                            ? ![
                                                "Tarjetas",
                                                "Préstamos",
                                                "Otros",
                                              ].includes(e.category)
                                            : r === 2
                                              ? [
                                                  "Tarjetas",
                                                  "Préstamos",
                                                ].includes(e.category)
                                              : e.category === "Otros",
                                        )
                                        .reduce((a, e) => a + e.amount, 0);
                            return <td key={i}>{money(v, currency)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="chart-title">Disponible proyectado</h3>
                <Chart
                  values={Array.from(
                    { length: months },
                    (_, i) =>
                      totals(data, addMonth(month, i), currency).available,
                  )}
                  currency={currency}
                />
                <div className="chart-labels">
                  {Array.from({ length: months }, (_, i) => (
                    <span key={i}>
                      {monthName(addMonth(month, i)).split(" ")[0].slice(0, 3)}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {view === "Detalle mensual" && (
              <>
                <div className="summary-grid">
                  {[
                    ["Ingresos", t.income],
                    ["Compromisos", t.committed],
                    ["Disponible", t.available],
                  ].map(([l, v]) => (
                    <div className="panel stat" key={l}>
                      <small>{l}</small>
                      <h2>{money(Number(v), currency)}</h2>
                    </div>
                  ))}
                </div>
                {["Gastos fijos", "Tarjetas y deudas", "Otros pagos"].map(
                  (l, i) => {
                    const rows = t.payments.filter((e) =>
                      i === 0
                        ? !["Tarjetas", "Préstamos", "Otros"].includes(
                            e.category,
                          )
                        : i === 1
                          ? ["Tarjetas", "Préstamos"].includes(e.category)
                          : e.category === "Otros",
                    );
                    return (
                      <section className="panel section-space" key={l}>
                        <div className="panel-heading">
                          <h3>{l}</h3>
                          <strong>
                            {money(
                              rows.reduce((a, e) => a + e.amount, 0),
                              currency,
                            )}
                          </strong>
                        </div>
                        {table(rows)}
                      </section>
                    );
                  },
                )}
              </>
            )}
            {view === "Tarjeta" && (
              <>
                <div className="credit-layout">
                  <div className="bank-card">
                    <span>
                      SANTANDER <strong>VISA</strong>
                    </span>
                    <CreditCard size={33} />
                    <div>•••• &nbsp; •••• &nbsp; •••• &nbsp; 4829</div>
                    <small>TARJETA DE EJEMPLO</small>
                  </div>
                  <div className="panel stat">
                    <small>Resumen cargado · {monthName(month)}</small>
                    <h2>
                      {money(
                        t.payments
                          .filter(
                            (e) =>
                              e.name === "Santander Visa" ||
                              e.card === "Santander Visa",
                          )
                          .reduce((a, e) => a + e.amount, 0),
                        currency,
                      )}
                    </h2>
                    <p>
                      Cierre habitual: día 24 · Vencimiento: día 8 del mes
                      siguiente
                    </p>
                    <small>
                      El resumen de septiembre ya está cargado. Las cuotas
                      futuras comienzan en octubre.
                    </small>
                  </div>
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Compras en cuotas</h3>
                      <p>Se proyectan únicamente las cuotas de cada mes.</p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => setModal({ income: false })}
                    >
                      <Plus size={16} />
                      Agregar compra
                    </button>
                  </div>
                  {table(t.payments.filter((e) => e.card === "Santander Visa"))}
                  <div className="recurring-list">
                    {data.payments
                      .filter((e) => e.card)
                      .map((e) => (
                        <div key={e.id}>
                          <span>
                            <strong>{e.name}</strong>
                            <small>
                              {e.installments} cuotas desde{" "}
                              {monthName(e.date.slice(0, 7))}
                            </small>
                          </span>
                          <strong>{money(e.amount, e.currency)} / mes</strong>
                        </div>
                      ))}
                  </div>
                </section>
              </>
            )}
            {view === "Configuración" && (
              <>
                <ThemeToggle />
                <CategorySettings
                  data={data}
                  update={(next) => {
                    setData(next);
                    setCategory("Todas las categorías");
                  }}
                />
                <section className="panel section-space">
                  <div className="panel-heading">
                    <div>
                      <h3>Pagos recurrentes</h3>
                      <p>Se incluyen automáticamente según su frecuencia.</p>
                    </div>
                    <Repeat2 size={22} />
                  </div>
                  <div className="recurring-list">
                    {entriesFor(data.payments, month, data.overrides)
                      .filter((e) => e.interval && !e.card)
                      .map((e) => (
                        <div key={e.id}>
                          <span>
                            <strong>{e.name}</strong>
                            <small>
                              Cada {e.interval} mes{e.interval > 1 ? "es" : ""}{" "}
                              · Día {Number(e.date.slice(8))}
                              {e.end ? ` · Hasta ${monthName(e.end)}` : ""}
                              {e.variable ? " · Monto variable" : ""}
                            </small>
                          </span>
                          <strong>{money(e.amount, e.currency)}</strong>
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ income: false, entry: e })
                            }
                          >
                            Editar
                          </button>
                        </div>
                      ))}
                  </div>
                </section>
                <section className="panel settings-panel">
                  <h3>Tu información</h3>
                  <p>
                    {user
                      ? "Tu cuenta guarda los cambios automáticamente en Supabase. Podés exportar un respaldo cuando lo necesites."
                      : "Estás en el espacio local de demostración. Los cambios se guardan en este navegador."}
                  </p>
                  <button className="secondary" onClick={exportData}>
                    <Download size={16} />
                    Exportar respaldo JSON
                  </button>
                  <h3>Cuenta y sincronización</h3>
                  {!supabase ? (
                    <p>
                      Configurá las variables de entorno del README y ejecutá la
                      migraciones SQL incluidas para conectar tu cuenta.
                    </p>
                  ) : user ? (
                    <div>
                      <p>
                        {store.initialized
                          ? "Tus cambios se guardan automáticamente. Al abrir la app se carga la versión de tu cuenta."
                          : "Tu cuenta está vacía. Podés comenzar desde cero o importar la planificación de este navegador, incluidos sus datos de ejemplo."}
                      </p>
                      <div className="settings-actions">
                        {!store.initialized && (
                          <button
                            className="primary"
                            onClick={() => {
                              if (
                                confirm(
                                  "¿Importar la planificación local a esta cuenta vacía? También se copiarán los datos de ejemplo que sigan presentes.",
                                )
                              )
                                void store.importLocal();
                            }}
                          >
                            Importar datos de este navegador
                          </button>
                        )}
                        <button
                          className="secondary"
                          onClick={() => void store.reload()}
                        >
                          Actualizar desde mi cuenta
                        </button>
                        {store.hasRecovery && (
                          <button
                            className="secondary"
                            onClick={store.downloadRecovery}
                          >
                            Descargar cambios pendientes anteriores
                          </button>
                        )}
                        <Link className="secondary" href="/auth/reset-password">
                          Crear o cambiar contraseña
                        </Link>
                        <button
                          className="text-button"
                          onClick={() => supabase?.auth.signOut()}
                        >
                          Cerrar sesión
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Link className="primary" href="/login">
                      Iniciar sesión
                    </Link>
                  )}
                </section>
              </>
            )}
            <footer className="page-footer">
              <span className="footer-logo">finplan.</span>Un poco de orden.
              Mucha más tranquilidad.
              <span>{currency} · Sin conversión de moneda</span>
            </footer>
          </div>
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map((n) => (
          <button
            key={n.name}
            className={view === n.name ? "active" : ""}
            onClick={() => go(n.name)}
          >
            <n.icon size={20} />
            <span>{n.name}</span>
          </button>
        ))}
        <button onClick={() => go("Configuración")}>
          <Settings2 size={20} />
          <span>Ajustes</span>
        </button>
      </nav>
      {modal && store.canEdit && (
        <EntryModal
          categories={categories}
          key={`${modal.entry?.id ?? "new"}-${modal.detail}`}
          modal={modal}
          month={month}
          currency={currency}
          cardMode={view === "Tarjeta"}
          close={() => setModal(null)}
          save={save}
          user={user}
          attachReceipt={(receipt) => attachReceipt(modal.entry!, receipt)}
          edit={() => setModal({ ...modal, detail: false })}
          mark={() => {
            setModal(null);
            requestMark(modal.entry!, modal.income);
          }}
        />
      )}
      {paying && user && store.canEdit && (
        <PayModal
          entry={paying}
          user={user}
          month={month}
          close={() => setPaying(null)}
          confirm={(receipt) => {
            mark(paying, false, receipt);
            setPaying(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Chart({ values, currency }: { values: number[]; currency: Currency }) {
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    points = values.map(
      (v, i) =>
        `${20 + (i * 960) / (values.length - 1)},${150 - ((v - min) / (max - min)) * 125}`,
    );
  return (
    <svg
      className="line-chart"
      viewBox="0 0 1000 180"
      role="img"
      aria-label={`Disponible por mes: ${values.map((v) => money(v, currency)).join(", ")}`}
    >
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d8eee3" />
          <stop offset="100%" stopColor="#fff" />
        </linearGradient>
      </defs>
      {[30, 90, 150].map((y) => (
        <line key={y} x1="20" x2="980" y1={y} y2={y} stroke="#edf0ee" />
      ))}
      <polygon
        points={`20,170 ${points.join(" ")} 980,170`}
        fill="url(#area)"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#287459"
        strokeWidth="3"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.split(",")[0]}
          cy={p.split(",")[1]}
          r="5"
          fill="#287459"
        >
          <title>{money(values[i], currency)}</title>
        </circle>
      ))}
    </svg>
  );
}
function PayModal({
  entry,
  user,
  month,
  close,
  confirm,
}: {
  entry: Entry;
  user: string;
  month: string;
  close: () => void;
  confirm: (receipt?: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [close, busy]);
  async function submit() {
    if (!file) return confirm();
    setBusy(true);
    setError("");
    try {
      if (file.size > maxReceiptBytes)
        throw new Error("El comprobante no puede superar los 10 MB.");
      const path = await uploadReceipt(user, entry.id, month, file);
      confirm(path);
      // The plan no longer references the replaced file.
      if (entry.receipt) void removeReceipt(entry.receipt).catch(() => {});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo subir el comprobante.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={() => !busy && close()}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{entry.name}</span>
            <h2 id="pay-title">Marcar como pagado</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar"
            onClick={close}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void submit();
          }}
        >
          <div className="form-body">
            <div className="detail-amount">
              {money(entry.amount, entry.currency)}
            </div>
            <label>
              Comprobante (opcional)
              <input
                type="file"
                accept={receiptTypes}
                disabled={busy}
                onChange={(v) => setFile(v.target.files?.[0] ?? null)}
              />
            </label>
            <small>
              {entry.receipt
                ? "Este pago ya tiene un comprobante. Si elegís otro, se reemplaza."
                : "Foto o PDF de hasta 10 MB. Podés agregarlo más tarde desde el detalle del pago."}
            </small>
            {error && (
              <small className="receipt-error" role="alert">
                {error}
              </small>
            )}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={close}
              disabled={busy}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy
                ? "Subiendo…"
                : file
                  ? "Guardar y marcar pagado"
                  : "Marcar como pagado"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function EntryModal({
  categories,
  modal,
  month,
  currency,
  cardMode,
  close,
  save,
  user,
  attachReceipt,
  edit,
  mark,
}: {
  categories: string[];
  modal: Modal;
  month: string;
  currency: Currency;
  cardMode: boolean;
  close: () => void;
  save: (e: Entry, scope: string) => void;
  user: string | null;
  attachReceipt: (receipt: string | undefined) => void;
  edit: () => void;
  mark: () => void;
}) {
  const income = modal.income;
  const [e, setE] = useState<Entry>(
    modal.entry ?? {
      id: crypto.randomUUID(),
      name: "",
      amount: 0,
      currency,
      category: income
        ? "Ingreso"
        : cardMode
          ? "Tarjetas"
          : (categories[0] ?? "Otros"),
      date: `${month}-05`,
      status: income ? "Estimado" : "Pendiente",
      interval: cardMode ? 1 : 0,
      variable: false,
      notes: "",
      ...(cardMode ? { card: "Santander Visa", installments: 3 } : {}),
    },
  );
  const [scope, setScope] = useState("month");
  const [receipt, setReceipt] = useState(e.receipt),
    [receiptBusy, setReceiptBusy] = useState(false),
    [receiptError, setReceiptError] = useState("");
  async function changeReceipt(file: File | null) {
    if (!user) return;
    const previous = receipt;
    setReceiptBusy(true);
    setReceiptError("");
    try {
      if (file && file.size > maxReceiptBytes)
        throw new Error("El comprobante no puede superar los 10 MB.");
      const path = file
        ? await uploadReceipt(user, e.id, month, file)
        : undefined;
      attachReceipt(path);
      setReceipt(path);
      // The plan no longer references the old file, so a failed cleanup is harmless.
      if (previous) await removeReceipt(previous).catch(() => {});
    } catch (err) {
      setReceiptError(
        err instanceof Error ? err.message : "No se pudo guardar el comprobante.",
      );
    } finally {
      setReceiptBusy(false);
    }
  }
  async function openReceipt() {
    if (!receipt) return;
    // Open synchronously so the browser does not block the pop-up.
    const tab = window.open("", "_blank");
    try {
      const url = await receiptUrl(receipt);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setReceiptError(
        err instanceof Error ? err.message : "No se pudo abrir el comprobante.",
      );
    }
  }
  const set = (k: keyof Entry, v: string | number | boolean | undefined) =>
    setE((e) => ({ ...e, [k]: v }));
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
      if (ev.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button, .modal input, .modal select, .modal textarea",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last?.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLElement>(".modal input, .modal button")?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [close]);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">TU PLANIFICACIÓN</span>
            <h2 id="modal-title">
              {modal.detail
                ? "Detalle del " + (income ? "ingreso" : "pago")
                : (modal.entry ? "Editar " : "Nuevo ") +
                  (income ? "ingreso" : "pago")}
            </h2>
          </div>
          <button className="icon-button" aria-label="Cerrar" onClick={close}>
            <X size={21} />
          </button>
        </div>
        {modal.detail ? (
          <div className="detail-body">
            <span className="concept-icon">
              <Wallet size={24} />
            </span>
            <h2>{e.name}</h2>
            <div className="detail-amount">{money(e.amount, e.currency)}</div>
            <dl>
              <dt>Estado</dt>
              <dd>{e.status}</dd>
              <dt>{income ? "Cobro esperado" : "Vencimiento"}</dt>
              <dd>{dateLabel(e.date)}</dd>
              <dt>Categoría</dt>
              <dd>{e.category}</dd>
              <dt>Frecuencia</dt>
              <dd>
                {e.interval ? `Cada ${e.interval} mes(es)` : "Único"}
                {e.interval > 0 && e.end ? ` · hasta ${monthName(e.end)}` : ""}
              </dd>
              <dt>Notas</dt>
              <dd>{e.notes || "Sin notas"}</dd>
              <dt>Comprobante</dt>
              <dd>
                {!user ? (
                  "Iniciá sesión para adjuntar comprobantes"
                ) : receiptBusy ? (
                  "Guardando…"
                ) : (
                  <span className="receipt-actions">
                    {receipt && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={openReceipt}
                      >
                        Ver
                      </button>
                    )}
                    <label className="text-button">
                      {receipt ? "Reemplazar" : "Cargar comprobante"}
                      <input
                        type="file"
                        accept={receiptTypes}
                        hidden
                        onChange={(v) => {
                          void changeReceipt(v.target.files?.[0] ?? null);
                          v.target.value = "";
                        }}
                      />
                    </label>
                    {receipt && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void changeReceipt(null)}
                      >
                        Quitar
                      </button>
                    )}
                  </span>
                )}
                {receiptError && (
                  <small className="receipt-error" role="alert">
                    {receiptError}
                  </small>
                )}
              </dd>
            </dl>
            <div className="modal-actions">
              <button className="secondary" onClick={edit}>
                Editar
              </button>
              <button className="primary" onClick={mark}>
                {income
                  ? "Cambiar estado de cobro"
                  : e.status === "Pagado"
                    ? "Marcar pendiente"
                    : "Marcar como pagado"}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              save(e, scope);
            }}
          >
            <div className="form-body">
              <label>
                Nombre
                <input
                  required
                  maxLength={100}
                  value={e.name}
                  onChange={(v) => set("name", v.target.value)}
                  placeholder={
                    income ? "Ej. Trabajo principal" : "Ej. Internet"
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Monto
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="999999999999"
                    step="0.01"
                    value={e.amount || ""}
                    onChange={(v) => set("amount", Number(v.target.value))}
                    placeholder="0"
                  />
                </label>
                <label>
                  Moneda
                  <select
                    value={e.currency}
                    onChange={(v) => set("currency", v.target.value)}
                  >
                    <option>ARS</option>
                    <option>USD</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                {!income && (
                  <label>
                    Categoría
                    <select
                      value={e.category}
                      onChange={(v) => set("category", v.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {income ? "Fecha estimada de cobro" : "Fecha de vencimiento"}
                  <input
                    required
                    type="date"
                    value={e.date}
                    min={modal.entry ? `${month}-01` : undefined}
                    max={
                      modal.entry
                        ? `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`
                        : undefined
                    }
                    onChange={(v) => set("date", v.target.value)}
                  />
                </label>
              </div>
              <label>
                Estado
                <select
                  value={e.status}
                  onChange={(v) => set("status", v.target.value)}
                >
                  {(income
                    ? ["Estimado", "Confirmado", "Cobrado"]
                    : ["Pendiente", "Pagado", "Programado"]
                  ).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={e.interval > 0}
                  onChange={(v) => {
                    set("interval", v.target.checked ? 1 : 0);
                    if (!v.target.checked) set("end", undefined);
                  }}
                />
                {income ? "Ingreso recurrente" : "Pago recurrente"}
              </label>
              {e.interval > 0 && (
                <>
                  <label>
                    Frecuencia
                    <select
                      value={e.interval}
                      onChange={(v) => set("interval", Number(v.target.value))}
                    >
                      {[
                        [1, "Mensual"],
                        [2, "Bimestral"],
                        [3, "Trimestral"],
                        [6, "Semestral"],
                        [12, "Anual"],
                      ].map(([n, l]) => (
                        <option value={n} key={n}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    Se repite el día {Number(e.date.slice(8))}. En meses más
                    cortos se usa el último día.
                  </small>
                  {!e.installments && (
                    <>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={!!e.end}
                          onChange={(v) =>
                            set(
                              "end",
                              v.target.checked
                                ? addMonth(e.date.slice(0, 7), 3)
                                : undefined,
                            )
                          }
                        />
                        Se repite hasta un mes determinado
                      </label>
                      {e.end && (
                        <label>
                          Último mes
                          <input
                            required
                            type="month"
                            min={e.date.slice(0, 7)}
                            value={e.end}
                            onChange={(v) =>
                              set("end", v.target.value || undefined)
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  {!income && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={e.variable}
                        onChange={(v) => set("variable", v.target.checked)}
                      />
                      El monto puede variar cada mes
                    </label>
                  )}
                </>
              )}
              {!income && e.category === "Tarjetas" && (
                <div className="form-grid">
                  <label>
                    Tarjeta (compras en cuotas)
                    <input
                      value={e.card ?? ""}
                      placeholder="Santander Visa"
                      onChange={(v) => {
                        set("card", v.target.value);
                        set("interval", 1);
                      }}
                    />
                  </label>
                  <label>
                    Cuotas pendientes
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={e.installments ?? ""}
                      onChange={(v) => {
                        set(
                          "installments",
                          v.target.value ? Number(v.target.value) : undefined,
                        );
                        set("interval", 1);
                        set("end", undefined);
                      }}
                    />
                  </label>
                </div>
              )}
              <label>
                Notas
                <textarea
                  rows={3}
                  value={e.notes}
                  onChange={(v) => set("notes", v.target.value)}
                  placeholder="Algo que quieras recordar..."
                />
              </label>
              {modal.entry && (
                <label>
                  Aplicar cambios
                  <select
                    value={scope}
                    onChange={(v) => setScope(v.target.value)}
                  >
                    <option value="month">Solo este mes</option>
                    <option value="future">Desde este mes en adelante</option>
                  </select>
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={close}>
                Cancelar
              </button>
              <button className="primary">
                Guardar {income ? "ingreso" : "pago"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
