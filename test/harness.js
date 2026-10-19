"use strict";

/*
 * love-travel — dependency-free Node test harness.
 * Run: node test/harness.js
 *
 * Loads js/app.js in a fake-DOM sandbox and checks the pure logic exposed on
 * window.MenaTravel: date maths, trip status/countdown, sorting, itinerary
 * grouping, packing, budget and export/import.
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const store = {};

function fakeEl() {
  return {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {},
    insertBefore() {},
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    remove() {},
    innerHTML: "",
    textContent: "",
    value: "",
    type: "",
    checked: false
  };
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Intl,
  Promise,
  Number,
  String,
  Array,
  Object,
  RegExp,
  isFinite,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => fakeEl(),
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
  },
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = process.argv.slice(2);
for (const f of (files.length ? files : [path.join(__dirname, "..", "js", "app.js")])) {
  vm.runInContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f });
}

const T = sandbox.window.MenaTravel;
let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error("FAIL: " + msg);
  } else {
    console.log("ok - " + msg);
  }
}
function eq(actual, expected, msg) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), msg + " (got " + JSON.stringify(actual) + ")");
}

assert(!!T, "namespace MenaTravel exposed");

/* ---- dates ---- */
eq(T.normalizeDate("2026-09-02"), "2026-09-02", "normalizeDate keeps a valid date");
eq(T.normalizeDate("2026-02-30"), "", "normalizeDate rejects an impossible day");
eq(T.normalizeDate("2026-2-3"), "", "normalizeDate needs padding");
eq(T.shiftISO("2026-12-31", 1), "2027-01-01", "shiftISO crosses the year");
eq(T.daysBetween("2026-09-20", "2026-09-24"), 4, "daysBetween counts days");
eq(T.daysBetween("", "2026-09-24"), null, "daysBetween needs both dates");
eq(T.daysUntil("2026-09-20", "2026-09-10"), 10, "daysUntil counts forward");
eq(T.tripDuration("2026-09-20", "2026-09-24"), 5, "tripDuration is inclusive");
eq(T.tripDuration("2026-09-20", "2026-09-19"), 0, "tripDuration clamps reversed dates");

/* ---- status + countdown ---- */
const A = { start: "2026-09-20", end: "2026-09-24", name: "A" };
const B = { start: "2026-09-08", end: "2026-09-12", name: "B" };
const C = { start: "2026-06-01", end: "2026-06-05", name: "C" };
const D = { start: "", end: "", name: "D" };
const today = "2026-09-10";

eq(T.tripStatus(A, today), "upcoming", "A is upcoming");
eq(T.tripStatus(B, today), "active", "B is active");
eq(T.tripStatus(C, today), "past", "C is past");
eq(T.tripStatus(D, today), "undated", "D is undated");
eq(T.countdownLabel(A, today), "In 10 days", "countdown for a far trip");
eq(T.countdownLabel({ start: "2026-09-11", end: "2026-09-14" }, today), "Tomorrow", "countdown for tomorrow");
eq(T.countdownLabel(B, today), "Day 3 of 5", "countdown while away");
eq(T.countdownLabel(C, today), "Ended 97 days ago", "countdown after a trip");
eq(T.countdownLabel(D, today), "Add some dates", "countdown with no dates");

/* ---- sorting + next ---- */
eq(T.sortTrips([C, D, B, A], today).map((t) => t.name), ["A", "B", "C", "D"], "sortTrips orders upcoming, active, past, undated");
eq(T.sortTrips([{ name: "late", start: "2026-12-01", end: "2026-12-05" }, { name: "soon", start: "2026-10-01", end: "2026-10-05" }], today).map((t) => t.name), ["soon", "late"], "upcoming trips sort soonest first");
eq(T.nextTrip([C, D], today), null, "nextTrip is null without upcoming/active");
eq(T.nextTrip([C, D, B], today), B, "nextTrip falls back to the active trip");
eq(T.nextTrip([B, A, C], today), A, "nextTrip prefers the soonest upcoming");

/* ---- date-range label ---- */
eq(T.formatDateRange("2026-09-02", "2026-09-06"), "2\u20136 September 2026", "range inside one month");
eq(T.formatDateRange("2026-08-30", "2026-09-03"), "30 August \u2013 3 September 2026", "range across months");
eq(T.formatDateRange("2026-12-28", "2027-01-02"), "28 December 2026 \u2013 2 January 2027", "range across years");
eq(T.formatDateRange("2026-09-02", ""), "2 September 2026", "range with only a start");
eq(T.formatDateRange("", ""), "No dates yet", "range with no dates");

/* ---- itinerary grouping ---- */
const stops = [
  { id: "x", date: "2026-09-21", time: "10:00", activity: "Brunch" },
  { id: "y", date: "2026-09-20", time: "18:00", activity: "Arrive" },
  { id: "z", date: "2026-09-20", time: "", activity: "Settle in" },
  { id: "u", date: "", activity: "Book taxi" }
];
const groups = T.groupItineraryByDay(stops, "2026-09-20", "2026-09-22");
eq(groups.map((g) => g.date), ["2026-09-20", "2026-09-21", "2026-09-22", ""], "itinerary groups every day of the trip, undated last");
eq(groups[0].items.map((i) => i.id), ["y", "z"], "stops sort by time, blank time last");
eq(groups[1].items.map((i) => i.id), ["x"], "the next day holds its stop");
eq(groups[2].items.length, 0, "empty days are still shown");
eq(groups[3].label, "Unscheduled", "undated stops get a bucket");
eq(T.groupItineraryByDay(stops.slice(0, 3), "", "").map((g) => g.date), ["2026-09-20", "2026-09-21"], "without a range only dated stops appear");
eq(T.groupItineraryByDay([], "2026-09-20", "2026-09-20").length, 1, "a one-day trip has one day");

/* ---- packing ---- */
eq(T.packingProgress([{ done: true }, { done: false }]), { done: 1, total: 2, percent: 50 }, "packingProgress half done");
eq(T.packingProgress([]), { done: 0, total: 0, percent: 0 }, "packingProgress of nothing");

const pack = [{ id: "a", text: "Socks", done: false }, { id: "b", text: "Hat", done: true }];
const flipped = T.togglePacking(pack, "a");
eq(flipped[0].done, true, "togglePacking flips the item");
eq(pack[0].done, false, "togglePacking does not mutate the original");
eq(T.togglePacking(pack, "b")[1].done, false, "togglePacking flips a done item back");
eq(T.togglePacking(pack, "nope")[1].done, true, "togglePacking ignores an unknown id");

const cats = T.packingByCategory([
  { text: "Passport", category: "Documents", done: false },
  { text: "Socks", category: "Clothes", done: false },
  { text: "Snacks", category: "Custom", done: false }
]);
eq(cats.map((c) => c.name), ["Documents", "Clothes", "Toiletries", "Electronics", "Misc", "Custom"], "packingByCategory keeps defaults then extras");
eq(cats[0].items.length, 1, "Documents holds one item");
eq(cats[2].items.length, 0, "empty default category still listed");
eq(cats[5].items.length, 1, "custom category collected");

/* ---- budget ---- */
eq(T.budgetTotal({ travel: 100, stay: 50, food: 0 }), 150, "budgetTotal sums amounts");
eq(T.budgetTotal({}), 0, "budgetTotal of nothing");
eq(T.budgetTotal({ x: 10, junk: "no" }), 10, "budgetTotal ignores junk");
eq(T.budgetLines({}).length, 6, "budgetLines shows all default categories");
eq(T.budgetLines({ travel: 100 })[0], { key: "travel", label: "Travel", amount: 100 }, "budgetLines labels a category");

/* ---- money ---- */
eq(T.formatMoney(100, "EUR"), "\u20ac100", "formatMoney EUR");
eq(T.formatMoney(12.5, "EUR"), "\u20ac12.50", "formatMoney keeps cents");
eq(T.formatMoney(30, "RON"), "30 lei", "formatMoney RON suffix");
eq(T.formatMoney(0, "USD"), "$0", "formatMoney zero");
eq(T.formatMoney(5, "XYZ"), "5 XYZ", "formatMoney unknown currency");

/* ---- normalize ---- */
const clean = T.normalizeTrip({ name: "Trip" });
eq(clean.name, "Trip", "normalizeTrip keeps the name");
eq(clean.currency, "EUR", "normalizeTrip defaults the currency");
eq(clean.start, "", "normalizeTrip empties a bad date");
eq(Object.keys(clean.budget).length, 6, "normalizeTrip gives a full budget");
eq(T.normalizeTrip({ name: "T", currency: "ron" }).currency, "RON", "normalizeTrip upper-cases the currency");
eq(T.normalizeTrip({ itinerary: [{ activity: "" }, { activity: "Go" }] }).itinerary.length, 1, "normalizeTrip drops empty stops");
eq(T.normalizeTrip({ packing: [{ text: "" }, { text: "Socks" }] }).packing.length, 1, "normalizeTrip drops empty pack items");
eq(T.normalizeTrip({ budget: { travel: "50" } }).budget.travel, 50, "normalizeTrip coerces budget numbers");

/* ---- export / import ---- */
const exported = T.exportTrips([A], 0);
eq(exported.app, "love-travel", "exportTrips tags the app");
eq(exported.version, 1, "exportTrips has a version");
eq(exported.exportedAt, "1970-01-01T00:00:00.000Z", "exportTrips stamps the time");
eq(exported.trips.length, 1, "exportTrips keeps the trips");

const merged = T.importTrips({ trips: [{ id: "a", name: "dup" }, { name: "New" }] }, [{ id: "a", name: "Keep", budget: {}, itinerary: [], packing: [] }]);
eq(merged.added, 1, "importTrips adds the new trip");
eq(merged.skipped, 1, "importTrips skips the duplicate id");
eq(merged.trips.length, 2, "importTrips merges");
eq(T.importTrips(null, []).added, 0, "importTrips survives a null payload");
eq(T.importTrips({ trips: [null, {}] }, []).added, 0, "importTrips ignores malformed trips");

/* ---- uid ---- */
assert(/^t[0-9a-z]+$/.test(T.uid()), "uid has the expected shape");

if (failures) {
  console.error("\n" + failures + " assertion(s) failed");
  process.exitCode = 1;
} else {
  console.log("\nall assertions passed");
}
