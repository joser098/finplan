import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entriesFor,
  initialData,
  totals,
  addMonth,
  type Entry,
} from "./finance";
test("totals distinguish projected cash and current cash", () => {
  const t = totals(initialData, "2026-09", "ARS");
  assert.equal(t.income, 1850000);
  assert.equal(t.committed, 1240000);
  assert.equal(t.available, 610000);
  assert.equal(t.paid, 720000);
  assert.equal(t.today, 580000);
  assert.equal(t.pending, 520000);
});
test("currencies never mix", () =>
  assert.equal(totals(initialData, "2026-09", "USD").committed, 0));
test("recurrence resets payment status and clamps last day", () => {
  const e: Entry = { ...initialData.payments[0], date: "2026-01-31" };
  const feb = entriesFor([e], "2026-02", {});
  assert.equal(feb[0].date, "2026-02-28");
  assert.equal(feb[0].status, "Pendiente");
});
test("monthly overrides preserve preceding and future months", () => {
  const e = initialData.payments[0];
  const overrides = { ["rent:2026-10"]: { amount: 500000, status: "Pagado" } };
  assert.equal(entriesFor([e], "2026-09", overrides)[0].amount, 480000);
  assert.equal(entriesFor([e], "2026-10", overrides)[0].amount, 500000);
  assert.equal(entriesFor([e], "2026-11", overrides)[0].amount, 480000);
});
test("installments stop after final month", () => {
  const e = initialData.payments.find((e) => e.id === "course")!;
  assert.equal(entriesFor([e], "2026-11", {}).length, 1);
  assert.equal(entriesFor([e], "2026-12", {}).length, 0);
});
test("frequencies, one-off entries and ended versions", () => {
  const e = { ...initialData.payments[0], interval: 3 };
  assert.equal(entriesFor([e], "2026-10", {}).length, 0);
  assert.equal(entriesFor([e], "2026-12", {}).length, 1);
  assert.equal(entriesFor([{ ...e, end: "2026-11" }], "2026-12", {}).length, 0);
  assert.equal(entriesFor([{ ...e, interval: 0 }], "2026-10", {}).length, 0);
  assert.equal(addMonth("2026-12", 1), "2027-01");
});
import { changeCategory, paymentCategories } from './finance';
test('category rename and removal preserve payment amounts and statuses, including overrides',()=>{
 const data={...initialData,overrides:{'rent:2026-10':{category:'Vivienda',amount:500000,status:'Pagado'}}};
 const renamed=changeCategory(data,'Vivienda','Hogar');
 assert.equal(renamed.payments[0].category,'Hogar');
 assert.deepEqual(renamed.overrides['rent:2026-10'],{category:'Hogar',amount:500000,status:'Pagado'});
 const removed=changeCategory(renamed,'Hogar');
 assert.equal(removed.payments[0].category,'Otros');
 assert.equal(removed.overrides['rent:2026-10'].category,'Otros');
 assert.equal(paymentCategories(removed).includes('Hogar'),false);
 assert.equal(totals(removed,'2026-10','ARS').committed,totals(data,'2026-10','ARS').committed);
 assert.throws(()=>changeCategory(data,'Vivienda','servicios'));
 assert.throws(()=>changeCategory(data,'Tarjetas'));
});
