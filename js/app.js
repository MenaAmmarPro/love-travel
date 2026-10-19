"use strict";

/*
 * love-travel — page logic.
 *
 * "Our Travels": plan trips together. Each trip has an itinerary (grouped by
 * day), a packing checklist (by category) and a budget estimate, plus a
 * countdown to the next departure. Everything lives in localStorage on this
 * device only.
 *
 * All the pure helpers are exposed on window.MenaTravel so they can be tested
 * in a bare Node context (see test/harness.js).
 */

(function () {
  var STORE = "mena-travel";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  var DEFAULT_CATEGORIES = ["Documents", "Clothes", "Toiletries", "Electronics", "Misc"];

  var DEFAULT_BUDGET = { travel: 0, stay: 0, food: 0, activities: 0, shopping: 0, other: 0 };

  var BUDGET_LABELS = {
    travel: "Travel", stay: "Stay", food: "Food",
    activities: "Activities", shopping: "Shopping", other: "Other"
  };

  var CURRENCIES = { EUR: "\u20ac", USD: "$", PKR: "\u20a8", RON: "lei" };

  var state = { trips: [], selectedId: null };

  /* ======================= pure helpers ======================= */

  function uid() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function isoOf(d) {
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
      return null;
    }
    return t;
  }

  function normalizeDate(value) {
    var s = String(value || "").trim();
    return parseISO(s) !== null ? s : "";
  }

  function prettyDate(iso) {
    var d = normalizeDate(iso);
    if (!d) return "No date";
    var p = d.split("-");
    return Number(p[2]) + " " + MONTHS[Number(p[1]) - 1] + " " + p[0];
  }

  function shiftISO(iso, delta) {
    var t = parseISO(iso);
    if (t === null) return "";
    var d = new Date(t);
    d.setUTCDate(d.getUTCDate() + Number(delta || 0));
    return isoOf(d);
  }

  function daysBetween(a, b) {
    var A = parseISO(a);
    var B = parseISO(b);
    if (A === null || B === null) return null;
    return Math.round((B - A) / 86400000);
  }

  function daysUntil(start, today) {
    return daysBetween(today || todayISO(), start);
  }

  function tripDuration(start, end) {
    var n = daysBetween(start, end);
    if (n === null || n < 0) return 0;
    return n + 1;
  }

  function tripStatus(trip, today) {
    var t = today || todayISO();
    var s = parseISO(trip && trip.start);
    var e = parseISO(trip && trip.end);
    var T = parseISO(t);
    if (s === null || e === null || T === null) return "undated";
    if (T < s) return "upcoming";
    if (T > e) return "past";
    return "active";
  }

  function countdownLabel(trip, today) {
    var st = tripStatus(trip, today);
    if (st === "undated") return "Add some dates";
    if (st === "upcoming") {
      var days = daysUntil(trip.start, today);
      if (days === 1) return "Tomorrow";
      return "In " + days + " days";
    }
    if (st === "active") {
      var day = daysBetween(trip.start, today) + 1;
      return "Day " + day + " of " + tripDuration(trip.start, trip.end);
    }
    var ago = daysBetween(trip.end, today);
    if (ago <= 0) return "Ended today";
    if (ago === 1) return "Ended yesterday";
    return "Ended " + ago + " days ago";
  }

  function sortTrips(trips, today) {
    var t = today || todayISO();
    var rank = { upcoming: 0, active: 1, past: 2, undated: 3 };
    return (trips || []).slice().sort(function (a, b) {
      var ra = rank[tripStatus(a, t)];
      var rb = rank[tripStatus(b, t)];
      if (ra !== rb) return ra - rb;
      var sa = parseISO(a && a.start);
      var sb = parseISO(b && b.start);
      if (sa !== null && sb !== null) {
        if (ra === 2) return sb - sa; // past trips: most recent first
        return sa - sb;               // upcoming: soonest first
      }
      if (sa !== null) return -1;
      if (sb !== null) return 1;
      return String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
    });
  }

  function nextTrip(trips, today) {
    var t = today || todayISO();
    var list = trips || [];
    var upcoming = list.filter(function (x) { return tripStatus(x, t) === "upcoming"; });
    if (upcoming.length) return sortTrips(upcoming, t)[0];
    var active = list.filter(function (x) { return tripStatus(x, t) === "active"; });
    if (active.length) return active[0];
    return null;
  }

  function formatDateRange(start, end) {
    var s = normalizeDate(start);
    var e = normalizeDate(end);
    if (!s && !e) return "No dates yet";
    if (s && !e) return prettyDate(s);
    if (!s && e) return prettyDate(e);
    var sp = s.split("-").map(Number);
    var ep = e.split("-").map(Number);
    if (sp[0] === ep[0] && sp[1] === ep[1]) {
      return sp[2] + "\u2013" + ep[2] + " " + MONTHS[sp[1] - 1] + " " + sp[0];
    }
    if (sp[0] === ep[0]) {
      return sp[2] + " " + MONTHS[sp[1] - 1] + " \u2013 " + ep[2] + " " + MONTHS[ep[1] - 1] + " " + sp[0];
    }
    return sp[2] + " " + MONTHS[sp[1] - 1] + " " + sp[0] + " \u2013 " +
      ep[2] + " " + MONTHS[ep[1] - 1] + " " + ep[0];
  }

  function timeKey(time) {
    var t = String(time || "");
    return /^\d{2}:\d{2}$/.test(t) ? t : "99:99";
  }

  function groupItineraryByDay(items, start, end) {
    var list = Array.isArray(items) ? items : [];
    var dates = [];
    var seen = {};
    var haveRange = parseISO(start) !== null && parseISO(end) !== null && tripDuration(start, end) > 0;
    if (haveRange) {
      var n = tripDuration(start, end);
      for (var i = 0; i < n; i += 1) {
        var d = shiftISO(start, i);
        if (!seen[d]) { seen[d] = true; dates.push(d); }
      }
    }
    var undated = [];
    list.forEach(function (it) {
      var dd = normalizeDate(it && it.date);
      if (!dd) { undated.push(it); return; }
      if (!seen[dd]) { seen[dd] = true; dates.push(dd); }
    });
    dates.sort();
    var byDate = {};
    list.forEach(function (it) {
      var dd = normalizeDate(it && it.date);
      if (!dd) return;
      if (!byDate[dd]) byDate[dd] = [];
      byDate[dd].push(it);
    });
    var groups = dates.map(function (dd) {
      var sorted = (byDate[dd] || []).slice().sort(function (a, b) {
        return timeKey(a && a.time) < timeKey(b && b.time) ? -1 : (timeKey(a && a.time) > timeKey(b && b.time) ? 1 : 0);
      });
      return { date: dd, label: prettyDate(dd), items: sorted };
    });
    if (undated.length) {
      groups.push({ date: "", label: "Unscheduled", items: undated });
    }
    return groups;
  }

  function packingProgress(list) {
    var items = Array.isArray(list) ? list : [];
    var total = items.length;
    var done = items.filter(function (it) { return it && it.done; }).length;
    return { done: done, total: total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function togglePacking(list, id) {
    return (Array.isArray(list) ? list : []).map(function (it) {
      if (it && it.id === id) {
        var copy = {};
        Object.keys(it).forEach(function (k) { copy[k] = it[k]; });
        copy.done = !it.done;
        return copy;
      }
      return it;
    });
  }

  function packingByCategory(list, categories) {
    var cats = (Array.isArray(categories) && categories.length ? categories : DEFAULT_CATEGORIES).slice();
    var map = {};
    cats.forEach(function (c) { map[c] = []; });
    (Array.isArray(list) ? list : []).forEach(function (it) {
      var c = String((it && it.category) || "Misc");
      if (!map[c]) { map[c] = []; cats.push(c); }
      map[c].push(it);
    });
    return cats.map(function (c) { return { name: c, items: map[c] }; });
  }

  function budgetTotal(budget) {
    if (!budget) return 0;
    var total = 0;
    Object.keys(budget).forEach(function (k) {
      var v = Number(budget[k]);
      if (isFinite(v)) total += v;
    });
    return total;
  }

  function budgetLines(budget) {
    var keys = Object.keys(DEFAULT_BUDGET);
    Object.keys(budget || {}).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    return keys.map(function (k) {
      return {
        key: k,
        label: BUDGET_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)),
        amount: Number(budget && budget[k]) || 0
      };
    });
  }

  function formatMoney(amount, currency) {
    var code = String(currency || "EUR").toUpperCase();
    var n = Number(amount) || 0;
    var digits = n % 1 ? 2 : 0;
    var s = n.toFixed(digits);
    var sym = CURRENCIES[code];
    if (!sym) return s + " " + code;
    if (code === "RON") return s + " " + sym;
    return sym + s;
  }

  function normalizeStop(s) {
    if (!s) return null;
    var activity = String(s.activity || "").slice(0, 120);
    var place = String(s.place || "").slice(0, 120);
    if (!activity && !place) return null;
    return {
      id: typeof s.id === "string" && s.id ? s.id : uid(),
      date: normalizeDate(s.date),
      time: /^\d{2}:\d{2}$/.test(String(s.time || "")) ? String(s.time) : "",
      activity: activity,
      place: place
    };
  }

  function normalizePackItem(p) {
    if (!p) return null;
    var text = String(p.text || "").slice(0, 80);
    if (!text) return null;
    return {
      id: typeof p.id === "string" && p.id ? p.id : uid(),
      text: text,
      category: String(p.category || "Misc").slice(0, 30),
      done: !!p.done
    };
  }

  function normalizeBudget(b) {
    var out = {};
    Object.keys(DEFAULT_BUDGET).forEach(function (k) {
      var v = Number(b && b[k]);
      out[k] = isFinite(v) ? v : 0;
    });
    Object.keys(b || {}).forEach(function (k) {
      if (k in out) return;
      var v = Number(b[k]);
      if (isFinite(v)) out[k] = v;
    });
    return out;
  }

  function normalizeTrip(t) {
    t = t || {};
    return {
      id: typeof t.id === "string" && t.id ? t.id : uid(),
      name: String(t.name || "Untitled trip").slice(0, 60),
      dest: String(t.dest || "").slice(0, 80),
      start: normalizeDate(t.start),
      end: normalizeDate(t.end),
      currency: CURRENCIES[String(t.currency || "").toUpperCase()] ? String(t.currency).toUpperCase() : "EUR",
      itinerary: (Array.isArray(t.itinerary) ? t.itinerary : []).map(normalizeStop).filter(Boolean),
      packing: (Array.isArray(t.packing) ? t.packing : []).map(normalizePackItem).filter(Boolean),
      budget: normalizeBudget(t.budget)
    };
  }

  function exportTrips(trips, now) {
    return {
      app: "love-travel",
      version: 1,
      exportedAt: new Date(now == null ? Date.now() : now).toISOString(),
      trips: (trips || []).map(normalizeTrip)
    };
  }

  function importTrips(raw, existing) {
    var current = (existing || []).slice();
    var have = {};
    current.forEach(function (t) { if (t && t.id) have[t.id] = true; });
    var incoming = raw && Array.isArray(raw.trips) ? raw.trips : [];
    var added = 0;
    var skipped = 0;
    incoming.forEach(function (t) {
      if (!t || !t.name) { skipped += 1; return; }
      if (t.id && have[t.id]) { skipped += 1; return; }
      var clean = normalizeTrip(t);
      have[clean.id] = true;
      current.push(clean);
      added += 1;
    });
    return { trips: current, added: added, skipped: skipped };
  }

  /* ======================= persistence ======================= */

  function load() {
    state.trips = [];
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    if (!raw) return;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    var list = parsed && Array.isArray(parsed.trips) ? parsed.trips : [];
    list.forEach(function (t) { state.trips.push(normalizeTrip(t)); });
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ v: 1, trips: state.trips, selectedId: state.selectedId }));
    } catch (e) { /* ignore */ }
  }

  /* ======================= DOM helpers ======================= */

  function $(id) { return document.getElementById(id); }

  function setText(id, value) {
    var elNode = $(id);
    if (elNode) elNode.textContent = String(value);
  }

  function note(id, message) { setText(id, message); }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function input(attrs) {
    var node = document.createElement("input");
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "value") node.value = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function button(label, cls, action) {
    var b = el("button", cls || "mini-btn");
    b.type = "button";
    b.textContent = label;
    if (action) b.addEventListener("click", action);
    return b;
  }

  function findTrip(id) {
    for (var i = 0; i < state.trips.length; i += 1) {
      if (state.trips[i].id === id) return state.trips[i];
    }
    return null;
  }

  function selectedTrip() {
    return state.selectedId ? findTrip(state.selectedId) : null;
  }

  /* ======================= hero countdown ======================= */

  function renderNext() {
    var trip = nextTrip(state.trips);
    if (!trip) {
      setText("next-label", "No trips yet \u2014 add the first one");
      setText("next-name", "");
      setText("next-count", "");
      return;
    }
    setText("next-label", tripStatus(trip) === "active" ? "We're there now" : "Next up");
    setText("next-name", trip.name + (trip.dest ? " \u00b7 " + trip.dest : ""));
    setText("next-count", countdownLabel(trip) + " \u00b7 " + formatDateRange(trip.start, trip.end));
  }

  /* ======================= trip list ======================= */

  function renderTripList() {
    var list = $("trip-list");
    if (!list) return;
    list.textContent = "";

    if (!state.trips.length) {
      var empty = el("p", "trip-empty");
      empty.textContent = "No trips planned yet \u2014 make the first one above \u2665";
      list.appendChild(empty);
      return;
    }

    sortTrips(state.trips).forEach(function (trip) {
      var card = el("article", "trip-card" + (trip.id === state.selectedId ? " is-selected" : ""));
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", trip.name);

      var head = el("div", "trip-card-head");
      head.appendChild(el("h3", "trip-card-name")).textContent = trip.name;
      var status = el("span", "trip-status status-" + tripStatus(trip));
      status.textContent = tripStatus(trip);
      head.appendChild(status);
      card.appendChild(head);

      if (trip.dest) card.appendChild(el("p", "trip-card-dest")).textContent = trip.dest;
      card.appendChild(el("p", "trip-card-dates")).textContent = formatDateRange(trip.start, trip.end);
      card.appendChild(el("p", "trip-card-count")).textContent = countdownLabel(trip);

      var pack = packingProgress(trip.packing);
      var bar = el("div", "mini-bar");
      var fill = el("div", "mini-fill");
      fill.style.width = pack.percent + "%";
      bar.appendChild(fill);
      card.appendChild(bar);

      var foot = el("div", "trip-card-foot");
      var left = el("span");
      left.textContent = pack.done + "/" + pack.total + " packed";
      var right = el("span");
      right.textContent = formatMoney(budgetTotal(trip.budget), trip.currency);
      foot.appendChild(left);
      foot.appendChild(right);
      card.appendChild(foot);

      function pick() { selectTrip(trip.id); }
      card.addEventListener("click", pick);
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
      });

      list.appendChild(card);
    });
  }

  function selectTrip(id) {
    state.selectedId = id;
    save();
    renderTripList();
    renderDetail();
    var plan = $("plan");
    if (plan && plan.scrollIntoView) {
      try { plan.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* ignore */ }
    }
  }

  /* ======================= detail: header ======================= */

  function buildHead(trip) {
    var panel = el("div", "detail-head");

    var title = el("div", "detail-title");
    title.appendChild(el("h3")).textContent = trip.name;
    var count = el("span", "detail-count");
    count.textContent = countdownLabel(trip);
    title.appendChild(count);
    panel.appendChild(title);

    var fields = el("div", "detail-fields");

    fields.appendChild(fieldInput("Name", "text", trip.name, 60, function (v) {
      trip.name = String(v || "Untitled trip").slice(0, 60);
      afterTripChange(false);
    }));
    fields.appendChild(fieldInput("Destination", "text", trip.dest, 80, function (v) {
      trip.dest = String(v || "").slice(0, 80);
      afterTripChange(false);
    }));
    fields.appendChild(fieldInput("Start", "date", trip.start, 0, function (v) {
      trip.start = normalizeDate(v);
      afterTripChange(true);
    }));
    fields.appendChild(fieldInput("End", "date", trip.end, 0, function (v) {
      trip.end = normalizeDate(v);
      afterTripChange(true);
    }));

    var curField = el("label", "field");
    curField.appendChild(el("span")).textContent = "Currency";
    var sel = document.createElement("select");
    Object.keys(CURRENCIES).forEach(function (code) {
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code + " " + CURRENCIES[code];
      if (code === trip.currency) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      trip.currency = CURRENCIES[sel.value] ? sel.value : "EUR";
      afterTripChange(true);
    });
    curField.appendChild(sel);
    fields.appendChild(curField);

    panel.appendChild(fields);

    var meta = el("div", "detail-meta");
    var span1 = el("span");
    span1.textContent = formatDateRange(trip.start, trip.end);
    var span2 = el("span");
    span2.textContent = tripDuration(trip.start, trip.end) + " day" + (tripDuration(trip.start, trip.end) === 1 ? "" : "s");
    meta.appendChild(span1);
    meta.appendChild(span2);
    panel.appendChild(meta);

    var actions = el("div", "detail-actions");
    actions.appendChild(button("Delete this trip", "mini-del-wide", function () { deleteTrip(trip.id); }));
    panel.appendChild(actions);

    return panel;
  }

  function fieldInput(label, type, value, maxLength, onChange) {
    var field = el("label", "field");
    field.appendChild(el("span")).textContent = label;
    var attrs = { type: type };
    if (maxLength) attrs.maxlength = String(maxLength);
    var node = input(attrs);
    node.value = value || "";
    node.addEventListener("change", function () { onChange(node.value); });
    field.appendChild(node);
    return field;
  }

  function afterTripChange(rebuildDetail) {
    save();
    renderNext();
    renderTripList();
    if (rebuildDetail) renderDetail();
  }

  function deleteTrip(id) {
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (state.selectedId === id) state.selectedId = state.trips.length ? state.trips[0].id : null;
    save();
    renderNext();
    renderTripList();
    renderDetail();
    note("save-note", "That trip is gone.");
  }

  /* ======================= detail: itinerary ======================= */

  function buildItinerary(trip) {
    var panel = el("div", "panel");
    var heading = el("h4");
    heading.appendChild(document.createTextNode("Itinerary "));
    var s = el("span");
    s.textContent = "per day";
    heading.appendChild(s);
    panel.appendChild(heading);

    var groups = groupItineraryByDay(trip.itinerary, trip.start, trip.end);
    if (!groups.length) {
      var hint = el("p", "day-note");
      hint.textContent = "No stops yet \u2014 add the first one below.";
      panel.appendChild(hint);
    }

    groups.forEach(function (group) {
      var wrap = el("div", "day-group");
      var head = el("div", "day-heading");
      head.appendChild(document.createTextNode(group.label));
      var noteEl = el("span", "day-note");
      noteEl.textContent = group.items.length + (group.items.length === 1 ? " stop" : " stops");
      head.appendChild(noteEl);
      wrap.appendChild(head);

      var ul = el("ul", "stop-list");
      group.items.forEach(function (stop) {
        var li = el("li", "stop");
        li.appendChild(el("span", "stop-time")).textContent = stop.time || "\u2013";
        var body = el("div", "stop-body");
        var act = el("p", "stop-activity");
        act.textContent = stop.activity || stop.place || "(no note)";
        body.appendChild(act);
        if (stop.place && stop.activity) {
          body.appendChild(el("p", "stop-place")).textContent = stop.place;
        }
        li.appendChild(body);
        li.appendChild(button("\u00d7", "mini-del", function () { removeStop(trip, stop.id); }));
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      panel.appendChild(wrap);
    });

    // Add-a-stop form (single, at the bottom)
    var form = el("div", "add-row");
    var dateIn = input({ type: "date" });
    dateIn.value = trip.start || todayISO();
    var timeIn = input({ type: "time" });
    var actIn = input({ type: "text", placeholder: "What are we doing?", maxlength: "120" });
    var placeIn = input({ type: "text", placeholder: "Where?", maxlength: "120", class: "stop-place-input" });
    form.appendChild(dateIn);
    form.appendChild(actIn);
    form.appendChild(placeIn);
    form.appendChild(button("Add", "mini-btn", function () {
      var activity = actIn.value;
      var place = placeIn.value;
      if (!String(activity).trim() && !String(place).trim()) return;
      trip.itinerary.push({
        id: uid(),
        date: normalizeDate(dateIn.value) || trip.start || "",
        time: timeIn.value || "",
        activity: String(activity).slice(0, 120),
        place: String(place).slice(0, 120)
      });
      afterTripChange(true);
    }));
    // time input sits before activity visually
    form.insertBefore(timeIn, actIn);
    panel.appendChild(form);

    return panel;
  }

  function removeStop(trip, id) {
    trip.itinerary = trip.itinerary.filter(function (s) { return s.id !== id; });
    afterTripChange(true);
  }

  /* ======================= detail: packing ======================= */

  function buildPacking(trip) {
    var panel = el("div", "panel");
    var heading = el("h4");
    heading.appendChild(document.createTextNode("Packing "));
    var s = el("span");
    s.textContent = "checklist";
    heading.appendChild(s);
    panel.appendChild(heading);

    var progress = packingProgress(trip.packing);
    var barWrap = el("div", "pack-progress");
    var bar = el("div", "mini-bar");
    var fill = el("div", "mini-fill");
    fill.style.width = progress.percent + "%";
    bar.appendChild(fill);
    barWrap.appendChild(bar);
    var progressNote = el("p", "pack-progress-note");
    progressNote.textContent = progress.done + " of " + progress.total + " packed";
    barWrap.appendChild(progressNote);
    panel.appendChild(barWrap);

    var cats = packingByCategory(trip.packing);
    cats.forEach(function (cat) {
      var group = el("div", "pack-category");
      var head = el("div", "pack-category-head");
      head.appendChild(document.createTextNode(cat.name));
      var cnt = el("span", "pack-count");
      cnt.textContent = cat.items.filter(function (i) { return i.done; }).length + "/" + cat.items.length;
      head.appendChild(cnt);
      group.appendChild(head);

      var ul = el("ul", "pack-list");
      if (!cat.items.length) {
        var li0 = el("li", "pack-item");
        var empty = el("span", "pack-label");
        empty.textContent = "\u2014";
        li0.appendChild(empty);
        ul.appendChild(li0);
      }
      cat.items.forEach(function (item) {
        var li = el("li", "pack-item" + (item.done ? " is-done" : ""));
        var cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!item.done;
        cb.addEventListener("change", function () {
          trip.packing = togglePacking(trip.packing, item.id);
          afterTripChange(true);
        });
        li.appendChild(cb);
        var label = el("span", "pack-label");
        label.textContent = item.text;
        li.appendChild(label);
        li.appendChild(button("\u00d7", "mini-del", function () {
          trip.packing = trip.packing.filter(function (p) { return p.id !== item.id; });
          afterTripChange(true);
        }));
        ul.appendChild(li);
      });
      group.appendChild(ul);
      panel.appendChild(group);
    });

    var form = el("div", "pack-add");
    var textIn = input({ type: "text", placeholder: "Add something to pack", maxlength: "80" });
    var catSel = document.createElement("select");
    cats.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name;
      catSel.appendChild(opt);
    });
    form.appendChild(textIn);
    form.appendChild(catSel);
    form.appendChild(button("Add", "mini-btn", function () {
      var text = String(textIn.value || "").trim();
      if (!text) return;
      trip.packing.push({ id: uid(), text: text.slice(0, 80), category: catSel.value || "Misc", done: false });
      afterTripChange(true);
    }));
    panel.appendChild(form);

    if (progress.done) {
      var clear = el("div", "detail-actions");
      clear.appendChild(button("Reset packed items", "mini-btn", function () {
        trip.packing = trip.packing.map(function (p) {
          var copy = {};
          Object.keys(p).forEach(function (k) { copy[k] = p[k]; });
          copy.done = false;
          return copy;
        });
        afterTripChange(true);
      }));
      panel.appendChild(clear);
    }

    return panel;
  }

  /* ======================= detail: budget ======================= */

  function buildBudget(trip) {
    var panel = el("div", "panel");
    var heading = el("h4");
    heading.appendChild(document.createTextNode("Budget "));
    var s = el("span");
    s.textContent = "estimate";
    heading.appendChild(s);
    panel.appendChild(heading);

    var grid = el("div", "budget-grid");
    budgetLines(trip.budget).forEach(function (line) {
      var row = el("label", "budget-row");
      row.appendChild(el("span")).textContent = line.label;
      var num = input({ type: "number", min: "0", step: "1" });
      num.value = String(line.amount);
      num.addEventListener("change", function () {
        var v = Number(num.value);
        trip.budget[line.key] = isFinite(v) && v >= 0 ? v : 0;
        afterTripChange(true);
      });
      row.appendChild(num);
      grid.appendChild(row);
    });
    panel.appendChild(grid);

    var total = budgetTotal(trip.budget);
    var days = tripDuration(trip.start, trip.end);
    var totalRow = el("div", "budget-total");
    var t1 = el("span");
    t1.textContent = "Total";
    var t2 = el("strong");
    t2.textContent = formatMoney(total, trip.currency);
    totalRow.appendChild(t1);
    totalRow.appendChild(t2);
    panel.appendChild(totalRow);

    if (days > 0 && total > 0) {
      var perDay = el("p", "day-note");
      perDay.textContent = "About " + formatMoney(total / days, trip.currency) + " a day over " + days + " days.";
      panel.appendChild(perDay);
    }

    return panel;
  }

  /* ======================= detail root ======================= */

  function renderDetail() {
    var host = $("trip-detail");
    if (!host) return;
    host.textContent = "";

    var trip = selectedTrip();
    if (!trip) {
      var empty = el("p", "trip-detail-empty");
      empty.textContent = state.trips.length
        ? "Pick a trip above to plan its days, packing and budget."
        : "Once you've made a trip, its full plan shows up right here.";
      host.appendChild(empty);
      return;
    }

    host.appendChild(buildHead(trip));
    host.appendChild(buildItinerary(trip));
    host.appendChild(buildPacking(trip));
    host.appendChild(buildBudget(trip));

    var actions = el("div", "detail-actions");
    actions.appendChild(button("Print this trip", "mini-btn", function () {
      try { window.print(); } catch (e) { /* ignore */ }
    }));
    actions.appendChild(button("Export all trips", "mini-btn", exportAll));
    host.appendChild(actions);
  }

  /* ======================= create / export / import ======================= */

  function createTrip(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var nameEl = $("nt-name");
    var name = nameEl ? String(nameEl.value || "").trim() : "";
    if (!name) { note("trip-note", "Give the trip a name first \u2665"); return; }

    var destEl = $("nt-dest");
    var startEl = $("nt-start");
    var endEl = $("nt-end");
    var curEl = $("nt-currency");

    var trip = normalizeTrip({
      name: name,
      dest: destEl ? destEl.value : "",
      start: startEl ? startEl.value : "",
      end: endEl ? endEl.value : "",
      currency: curEl ? curEl.value : "EUR"
    });
    state.trips.push(trip);
    state.selectedId = trip.id;
    save();
    renderNext();
    renderTripList();
    renderDetail();
    if (nameEl) nameEl.value = "";
    if (destEl) destEl.value = "";
    if (startEl) startEl.value = "";
    if (endEl) endEl.value = "";
    note("trip-note", "Added \u2665 \u2014 plan its days below.");
  }

  function exportAll() {
    var data = exportTrips(state.trips);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "love-travel-trips.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    note("save-note", "Exported " + state.trips.length + " trip" + (state.trips.length === 1 ? "" : "s") + " \u2665");
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      if (!parsed) { note("save-note", "That file didn't look like our trips."); return; }
      var merged = importTrips(parsed, state.trips);
      state.trips = merged.trips;
      save();
      renderNext();
      renderTripList();
      renderDetail();
      note("save-note", "Imported " + merged.added + " trip" + (merged.added === 1 ? "" : "s") +
        (merged.skipped ? " (" + merged.skipped + " skipped)" : "") + ".");
    };
    reader.readAsText(file);
  }

  function clearAll() {
    state.trips = [];
    state.selectedId = null;
    save();
    renderNext();
    renderTripList();
    renderDetail();
    note("save-note", "All trips removed \u2014 a blank map whenever you're ready.");
  }

  /* ======================= wiring ======================= */

  function wire() {
    var form = $("new-trip-form");
    if (form) form.addEventListener("submit", createTrip);

    var startEl = $("nt-start");
    if (startEl && !startEl.value) startEl.value = todayISO();

    var exp = $("export-trips");
    if (exp) exp.addEventListener("click", exportAll);

    var imp = $("import-trips");
    if (imp) imp.addEventListener("change", function () {
      if (imp.files && imp.files[0]) importFile(imp.files[0]);
      imp.value = "";
    });

    var clear = $("clear-trips");
    if (clear) clear.addEventListener("click", clearAll);
  }

  function boot() {
    load();
    renderNext();
    renderTripList();
    renderDetail();
    wire();
  }

  /* ======================= expose ======================= */

  window.MenaTravel = {
    uid: uid,
    todayISO: todayISO,
    normalizeDate: normalizeDate,
    prettyDate: prettyDate,
    shiftISO: shiftISO,
    daysBetween: daysBetween,
    daysUntil: daysUntil,
    tripDuration: tripDuration,
    tripStatus: tripStatus,
    countdownLabel: countdownLabel,
    sortTrips: sortTrips,
    nextTrip: nextTrip,
    formatDateRange: formatDateRange,
    groupItineraryByDay: groupItineraryByDay,
    packingProgress: packingProgress,
    togglePacking: togglePacking,
    packingByCategory: packingByCategory,
    budgetTotal: budgetTotal,
    budgetLines: budgetLines,
    formatMoney: formatMoney,
    normalizeTrip: normalizeTrip,
    exportTrips: exportTrips,
    importTrips: importTrips,
    MONTHS: MONTHS,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    DEFAULT_BUDGET: DEFAULT_BUDGET
  };

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
