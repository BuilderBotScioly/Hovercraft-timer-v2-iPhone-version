/* Hovercraft Timer (SciOly Div B 2025/2026)
   Static GitHub Pages app: local-only storage, export/import JSON, CSV, chart JPEG.
   NOTE: Login is a casual lock (no backend security).
*/

const CONFIG = {
  USERNAME: "coach",
  PASSWORD: "hovercraft",
  REMEMBER_LOGIN: true, // stores login flag in localStorage
};

const STORAGE_KEYS = {
  login: "hovercraft_login_v1",
  practice: "hovercraft_practice_v1",
  mock: "hovercraft_mock_v1",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function show(id) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function fmtMs(ms) {
  ms = Math.max(0, ms);
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const mmm = String(Math.floor(ms % 1000)).padStart(3, "0");
  return `${mm}:${ss}.${mmm}`;
}

function fmtSec(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "";
  return (Math.round(sec * 1000) / 1000).toFixed(3);
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function downloadText(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadDataURL(filename, dataURL) {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { resolve(JSON.parse(fr.result)); } catch (e) { reject(e); }
    };
    fr.onerror = reject;
    fr.readAsText(file);
  });
}

function nowPerf() {
  return performance.now();
}

/* -----------------------
   LOGIN + APP NAV
------------------------*/
function isLoggedIn() {
  if (!CONFIG.REMEMBER_LOGIN) return false;
  return localStorage.getItem(STORAGE_KEYS.login) === "1";
}

function setLoggedIn(flag) {
  if (!CONFIG.REMEMBER_LOGIN) return;
  if (flag) localStorage.setItem(STORAGE_KEYS.login, "1");
  else localStorage.removeItem(STORAGE_KEYS.login);
}

function initLogin() {
  const u = $("#login-username");
  const p = $("#login-password");
  const btn = $("#btn-login");
  const err = $("#login-error");

  btn.addEventListener("click", () => {
    err.classList.add("hidden");
    const user = (u.value || "").trim();
    const pass = (p.value || "").trim();

    if (user === CONFIG.USERNAME && pass === CONFIG.PASSWORD) {
      setLoggedIn(true);
      show("#view-home");
    } else {
      err.textContent = "Incorrect username or password.";
      err.classList.remove("hidden");
    }
  });

  if (isLoggedIn()) show("#view-home");
  else show("#view-login");
}

function initHomeNav() {
  $("#btn-open-practice").addEventListener("click", () => show("#view-practice"));
  $("#btn-open-mock").addEventListener("click", () => show("#view-mock"));

  $("#btn-logout").addEventListener("click", () => {
    setLoggedIn(false);
    show("#view-login");
  });

  $("#btn-export-all").addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      practice: loadPractice(),
      mock: loadMock(),
    };
    downloadText(`hovercraft_all_${dateStamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
  });

  $("#file-import-all").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const obj = await readJSONFile(file);
      if (obj.practice) savePractice(obj.practice);
      if (obj.mock) saveMock(obj.mock);
      practiceRenderAll();
      mockRenderAll();
      alert("Imported data successfully.");
    } catch (err) {
      console.error(err);
      alert("Import failed. Make sure it is a valid JSON export.");
    }
  });

  $("#btn-back-from-practice").addEventListener("click", () => show("#view-home"));
  $("#btn-back-from-mock").addEventListener("click", () => show("#view-home"));
}

function dateStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/* -----------------------
   PRACTICE DATA + UI
   ✅ UNCHANGED PRACTICE SECTION
------------------------*/
function defaultPractice() {
  return {
    version: 1,
    session: { date: "", name: "", track: "" },
    rows: [],
  };
}

function loadPractice() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.practice);
    if (!raw) return defaultPractice();
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return defaultPractice();
    if (!Array.isArray(obj.rows)) obj.rows = [];
    if (!obj.session) obj.session = { date: "", name: "", track: "" };
    return obj;
  } catch {
    return defaultPractice();
  }
}

function savePractice(p) {
  localStorage.setItem(STORAGE_KEYS.practice, JSON.stringify(p));
}

let practice = defaultPractice();

let pTimer = {
  running: false,
  startAt: 0,
  elapsedMs: 0,
  raf: null,
  activeRowId: null,
  activeRunIndex: 0,
};

let practiceChart = null;

function initPractice() {
  practice = loadPractice();

  $("#practice-date").addEventListener("change", () => {
    practice.session.date = $("#practice-date").value;
    savePractice(practice);
  });
  $("#practice-session-name").addEventListener("input", () => {
    practice.session.name = $("#practice-session-name").value;
    savePractice(practice);
  });
  $("#practice-track-level").addEventListener("input", () => {
    practice.session.track = $("#practice-track-level").value;
    savePractice(practice);
  });

  $("#btn-practice-save-session").addEventListener("click", () => {
    practice.session.date = $("#practice-date").value;
    practice.session.name = $("#practice-session-name").value;
    practice.session.track = $("#practice-track-level").value;
    savePractice(practice);
    $("#practice-session-saved").textContent = "Saved.";
    setTimeout(() => $("#practice-session-saved").textContent = "", 1200);
  });

  $("#practice-voltage").addEventListener("input", () => {
    const v = parseNum($("#practice-voltage").value);
    $("#btn-practice-start").disabled = !(v && v > 0) || pTimer.running;
  });

  $("#btn-practice-start").addEventListener("click", practiceStart);
  $("#btn-practice-stop").addEventListener("click", practiceStop);
  $("#btn-practice-reset").addEventListener("click", practiceReset);

  $("#btn-practice-export-csv").addEventListener("click", practiceExportCSV);
  $("#btn-practice-export-jpeg").addEventListener("click", practiceExportJPEG);
  $("#btn-practice-export-json").addEventListener("click", () => {
    downloadText(`hovercraft_practice_${dateStamp()}.json`, JSON.stringify(practice, null, 2), "application/json");
  });

  $("#file-practice-import-json").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const obj = await readJSONFile(file);
      if (!obj || !Array.isArray(obj.rows)) throw new Error("Bad practice JSON");
      practice = obj;
      savePractice(practice);
      practiceRenderAll();
      alert("Imported practice data.");
    } catch (err) {
      console.error(err);
      alert("Import failed.");
    }
  });

  $("#btn-practice-clear").addEventListener("click", () => {
    if (!confirm("Clear ALL practice data?")) return;
    practice = defaultPractice();
    savePractice(practice);
    practiceReset();
    practiceRenderAll();
  });

  practiceRenderAll();
}

function practiceRenderAll() {
  $("#practice-date").value = practice.session.date || "";
  $("#practice-session-name").value = practice.session.name || "";
  $("#practice-track-level").value = practice.session.track || "";

  practiceRenderTable();
  practiceRenderChart();
  practiceUpdateRunHint();
  practiceUpdateButtons();
}

function practiceUpdateButtons() {
  const v = parseNum($("#practice-voltage").value);
  $("#btn-practice-start").disabled = !(v && v > 0) || pTimer.running;
  $("#btn-practice-stop").disabled = !pTimer.running;
}

function practiceStart() {
  const v = parseNum($("#practice-voltage").value);
  if (!(v && v > 0)) return;

  if (!pTimer.activeRowId) {
    const row = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      voltage: v,
      run1: null,
      run2: null,
      run3: null,
      createdAt: new Date().toISOString(),
    };
    practice.rows.push(row);
    pTimer.activeRowId = row.id;
    pTimer.activeRunIndex = 0;
    savePractice(practice);
    practiceRenderTable();
  }

  pTimer.running = true;
  pTimer.startAt = nowPerf();
  pTimer.raf = requestAnimationFrame(practiceTick);

  $("#btn-practice-start").disabled = true;
  $("#btn-practice-stop").disabled = false;
  $("#practice-voltage").disabled = true;
  practiceUpdateRunHint();
}

function practiceTick() {
  if (!pTimer.running) return;
  const delta = nowPerf() - pTimer.startAt;
  const ms = pTimer.elapsedMs + delta;
  $("#practice-time-display").textContent = fmtMs(ms);
  pTimer.raf = requestAnimationFrame(practiceTick);
}

function practiceStop() {
  if (!pTimer.running) return;

  const delta = nowPerf() - pTimer.startAt;
  pTimer.elapsedMs += delta;
  pTimer.running = false;
  if (pTimer.raf) cancelAnimationFrame(pTimer.raf);

  const row = practice.rows.find(r => r.id === pTimer.activeRowId);
  if (!row) { practiceReset(); return; }

  const sec = pTimer.elapsedMs / 1000;
  const idx = pTimer.activeRunIndex;

  if (idx === 0) row.run1 = sec;
  if (idx === 1) row.run2 = sec;
  if (idx === 2) row.run3 = sec;

  pTimer.activeRunIndex = Math.min(2, idx + 1);

  savePractice(practice);
  practiceRenderTable();
  practiceRenderChart();

  pTimer.elapsedMs = 0;
  $("#practice-time-display").textContent = fmtMs(0);

  if (idx === 2) {
    pTimer.activeRowId = null;
    pTimer.activeRunIndex = 0;
    $("#practice-voltage").disabled = false;
    $("#practice-voltage").value = "";
  }

  practiceUpdateButtons();
  practiceUpdateRunHint();
}

function practiceReset() {
  pTimer.running = false;
  if (pTimer.raf) cancelAnimationFrame(pTimer.raf);
  pTimer.raf = null;
  pTimer.startAt = 0;
  pTimer.elapsedMs = 0;
  $("#practice-time-display").textContent = fmtMs(0);
  $("#btn-practice-stop").disabled = true;
  $("#btn-practice-start").disabled = true;

  practiceUpdateRunHint();
  practiceUpdateButtons();
}

function practiceUpdateRunHint() {
  const hint = $("#practice-run-hint");
  if (!pTimer.activeRowId) {
    hint.textContent = "Enter a voltage, then start timing. You will record Run 1, Run 2, Run 3 for that row.";
    return;
  }
  const runNum = pTimer.activeRunIndex + 1;
  hint.textContent = `Recording row in progress. Next capture: Run ${runNum} (of 3). Voltage input is locked until Run 3 is saved.`;
}

function practiceAvg(row) {
  const runs = [row.run1, row.run2, row.run3].filter(v => typeof v === "number" && Number.isFinite(v));
  if (runs.length !== 3) return null;
  return (runs[0] + runs[1] + runs[2]) / 3;
}

function practiceRenderTable() {
  const sorted = [...practice.rows].sort((a, b) => {
    if (b.voltage !== a.voltage) return b.voltage - a.voltage;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  const tb = $("#practice-tbody");
  tb.innerHTML = "";

  for (const row of sorted) {
    const tr = document.createElement("tr");
    const avg = practiceAvg(row);

    const tdV = editableCell(fmtSec(row.voltage), (val) => {
      const n = parseNum(val);
      if (!(n && n > 0)) return false;
      row.voltage = n;
      savePractice(practice);
      practiceRenderTable();
      practiceRenderChart();
      return true;
    }, true);

    const td1 = editableCell(fmtSec(row.run1), (val) => {
      const n = parseNum(val);
      if (!(n && n >= 0)) return false;
      row.run1 = n;
      savePractice(practice);
      practiceRenderTable();
      practiceRenderChart();
      return true;
    });

    const td2 = editableCell(fmtSec(row.run2), (val) => {
      const n = parseNum(val);
      if (!(n && n >= 0)) return false;
      row.run2 = n;
      savePractice(practice);
      practiceRenderTable();
      practiceRenderChart();
      return true;
    });

    const td3 = editableCell(fmtSec(row.run3), (val) => {
      const n = parseNum(val);
      if (!(n && n >= 0)) return false;
      row.run3 = n;
      savePractice(practice);
      practiceRenderTable();
      practiceRenderChart();
      return true;
    });

    const tdAvg = document.createElement("td");
    tdAvg.textContent = avg == null ? "" : fmtSec(avg);
    tdAvg.className = "mono";

    const tdAct = document.createElement("td");
    tdAct.className = "actions";
    const del = document.createElement("button");
    del.className = "btn danger icon-btn small";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      if (!confirm("Delete this row?")) return;
      practice.rows = practice.rows.filter(r => r.id !== row.id);
      if (pTimer.activeRowId === row.id) {
        pTimer.activeRowId = null;
        pTimer.activeRunIndex = 0;
        $("#practice-voltage").disabled = false;
      }
      savePractice(practice);
      practiceRenderTable();
      practiceRenderChart();
      practiceUpdateRunHint();
    });
    tdAct.appendChild(del);

    tr.appendChild(tdV);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(tdAvg);
    tr.appendChild(tdAct);
    tb.appendChild(tr);
  }
}

function editableCell(text, onCommit, isVoltage = false) {
  const td = document.createElement("td");
  td.textContent = text || "";
  td.contentEditable = "true";
  td.dataset.orig = td.textContent;
  td.className = "mono";

  td.addEventListener("focus", () => {
    td.dataset.orig = td.textContent;
  });

  td.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      td.blur();
    }
    if (e.key === "Escape") {
      td.textContent = td.dataset.orig || "";
      td.blur();
    }
  });

  td.addEventListener("blur", () => {
    const raw = (td.textContent || "").trim();
    if (raw === (td.dataset.orig || "").trim()) return;

    if (!isVoltage && raw === "") {
      const ok = onCommit("0");
      if (!ok) td.textContent = td.dataset.orig || "";
      return;
    }
    const ok = onCommit(raw);
    if (!ok) td.textContent = td.dataset.orig || "";
  });

  return td;
}

function practiceExportCSV() {
  const lines = [];
  lines.push(`"Session Date","${(practice.session.date || "").replaceAll('"','""')}"`);
  lines.push(`"Session Name","${(practice.session.name || "").replaceAll('"','""')}"`);
  lines.push(`"Track Levelness","${(practice.session.track || "").replaceAll('"','""')}"`);
  lines.push("");
  lines.push(`"Voltage","Run1","Run2","Run3","Average"`);

  const sorted = [...practice.rows].sort((a, b) => {
    if (b.voltage !== a.voltage) return b.voltage - a.voltage;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  for (const r of sorted) {
    const avg = practiceAvg(r);
    lines.push([
      fmtSec(r.voltage),
      fmtSec(r.run1),
      fmtSec(r.run2),
      fmtSec(r.run3),
      avg == null ? "" : fmtSec(avg)
    ].map(x => `"${String(x).replaceAll('"','""')}"`).join(","));
  }
  downloadText(`hovercraft_practice_${dateStamp()}.csv`, lines.join("\n"), "text/csv");
}

function practiceRenderChart() {
  const points = [];
  for (const r of practice.rows) {
    const avg = practiceAvg(r);
    if (avg == null) continue;
    points.push({ x: r.voltage, y: avg });
  }
  points.sort((a, b) => a.x - b.x);

  const ctx = $("#practice-chart").getContext("2d");

  if (practiceChart) {
    practiceChart.data.datasets[0].data = points;
    practiceChart.update();
  } else {
    practiceChart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [{
          label: "Avg Time vs Voltage",
          data: points,
          parsing: false,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.15,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "Voltage (V)" }
          },
          y: {
            title: { display: true, text: "Average Time (s)" }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `V=${ctx.parsed.x.toFixed(2)}  Avg=${ctx.parsed.y.toFixed(3)}s`
            }
          }
        }
      }
    });
  }

  const reg = linearRegression(points);
  if (!reg || points.length < 2) {
    $("#practice-eq").textContent = "";
    $("#practice-r2").textContent = points.length < 2 ? "Add at least 2 completed rows to show best-fit equation." : "";
  } else {
    $("#practice-eq").textContent = `Best fit: y = ${reg.m.toFixed(4)}x + ${reg.b.toFixed(4)}`;
    $("#practice-r2").textContent = `R² = ${reg.r2.toFixed(4)}`;
  }
}

function linearRegression(points) {
  if (!points || points.length < 2) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const n = points.length;
  const meanX = xs.reduce((a, c) => a + c, 0) / n;
  const meanY = ys.reduce((a, c) => a + c, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  const m = num / den;
  const b = meanY - m * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yi = ys[i];
    const yhat = m * xs[i] + b;
    ssTot += (yi - meanY) ** 2;
    ssRes += (yi - yhat) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : (1 - ssRes / ssTot);

  return { m, b, r2 };
}

function practiceExportJPEG() {
  if (!practiceChart) { alert("No chart yet."); return; }
  const canvas = $("#practice-chart");
  const dataURL = canvas.toDataURL("image/jpeg", 0.95);
  downloadDataURL(`hovercraft_practice_graph_${dateStamp()}.jpg`, dataURL);
}

/* -----------------------
   MOCK COMPETE DATA + UI
   ✅ FIXED: Bonus Mode button lights green after eligible
------------------------*/
function defaultMock() {
  return {
    version: 1,
    meta: {
      versionNum: "",
      competitors: "",
      team: "",
      ruleset: null, // { name, step }
      tt: null,
      btt: null,
      constructionViolations: 0,
      missedImpound: false,
      constructionChecked: false,
    },
    period: {
      started: false,
      startAtISO: null,
      remainingMs: 8 * 60 * 1000,
      paused: true,
      pauseAtPerf: null,
    },
    runState: {
      runCount: 0,
      completeCount: 0,
      incompleteCount: 0,
      bonusEligible: false,
      bonusMode: false,   // ✅ NEW: controlled by green button
      bonusUsed: false,   // once used, cannot turn on again
      ended: false,
    },
    runs: [],
  };
}

function loadMock() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.mock);
    if (!raw) return defaultMock();
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return defaultMock();
    if (!obj.meta) obj.meta = defaultMock().meta;
    if (!obj.period) obj.period = defaultMock().period;
    if (!obj.runState) obj.runState = defaultMock().runState;
    if (!Array.isArray(obj.runs)) obj.runs = [];
    // backfill new fields
    if (obj.runState.bonusMode == null) obj.runState.bonusMode = false;
    if (obj.runState.bonusUsed == null) obj.runState.bonusUsed = false;
    return obj;
  } catch {
    return defaultMock();
  }
}

function saveMock(m) {
  localStorage.setItem(STORAGE_KEYS.mock, JSON.stringify(m));
}

let mock = defaultMock();

let mockPeriodRAF = null;
let mockRun = {
  running: false,
  startAt: 0,
  elapsedMs: 0,
  raf: null,
  runStartValid: false,
};

function initMock() {
  mock = loadMock();

  $("#mock-version").addEventListener("input", () => {
    mock.meta.versionNum = $("#mock-version").value;
    saveMock(mock);
  });
  $("#mock-competitors").addEventListener("input", () => {
    mock.meta.competitors = $("#mock-competitors").value;
    saveMock(mock);
  });
  $("#mock-team").addEventListener("input", () => {
    mock.meta.team = $("#mock-team").value;
    saveMock(mock);
  });

  $("#btn-rule-regional").addEventListener("click", () => selectRuleset("Regional", 2.0));
  $("#btn-rule-state").addEventListener("click", () => selectRuleset("State", 1.0));
  $("#btn-rule-national").addEventListener("click", () => selectRuleset("National", 0.5));

  $("#btn-mock-randomize-tt").addEventListener("click", () => {
    if (!mock.meta.ruleset) return;
    const { tt, btt } = randomTTBTT(mock.meta.ruleset.step);
    mock.meta.tt = tt;
    mock.meta.btt = btt;
    saveMock(mock);
    mockRenderAll();
  });

  // ✅ NEW: Bonus Mode button handler
  $("#btn-mock-bonus-mode").addEventListener("click", () => {
    if (!mock.runState.bonusEligible || mock.runState.bonusUsed) return;
    mock.runState.bonusMode = !mock.runState.bonusMode; // toggle
    saveMock(mock);
    mockRenderAll();
  });

  $("#mock-check-complete").addEventListener("change", () => {
    mock.meta.constructionChecked = $("#mock-check-complete").checked;
    saveMock(mock);
    mockUpdateStartEligibility();
  });
  $("#mock-construction-violations").addEventListener("input", () => {
    mock.meta.constructionViolations = Math.max(0, parseInt($("#mock-construction-violations").value || "0", 10));
    saveMock(mock);
    mockRecalcAllScores();
    mockRenderAll();
  });
  $("#mock-missed-impound").addEventListener("change", () => {
    mock.meta.missedImpound = $("#mock-missed-impound").checked;
    saveMock(mock);
    mockRecalcAllScores();
    mockRenderAll();
  });

  $("#btn-mock-start-period").addEventListener("click", mockStartPeriod);
  $("#btn-mock-reset-period").addEventListener("click", () => {
    if (!confirm("Reset the 8:00 period AND clear runs log?")) return;
    mock = defaultMock();
    saveMock(mock);
    mockStopPeriodRAF();
    mockStopRunRAF();
    mockRenderAll();
  });

  $("#btn-mock-pause-period").addEventListener("click", mockPausePeriod);
  $("#btn-mock-resume-period").addEventListener("click", mockResumePeriod);

  $("#btn-mock-start-run").addEventListener("click", mockStartRun);
  $("#btn-mock-stop-run").addEventListener("click", mockStopRun);
  $("#btn-mock-reset-run").addEventListener("click", () => {
    mockStopRunRAF();
    mockRun.elapsedMs = 0;
    $("#mock-run-display").textContent = fmtMs(0);
  });

  $("#mock-did-not-cross-start").addEventListener("change", () => {
    const c = $("#mock-did-not-cross-start").checked;
    $("#mock-complete-select").disabled = c;
    $("#mock-distance-cm").disabled = true;
    $("#mock-used-ramp").disabled = c;
  });

  $("#mock-complete-select").addEventListener("change", () => {
    const val = $("#mock-complete-select").value;
    $("#mock-distance-cm").disabled = (val !== "incomplete");
  });

  // keep select, but it is controlled by bonus mode
  $("#mock-final-run-type").addEventListener("change", () => {});

  $("#btn-mock-save-run").addEventListener("click", mockSaveRun);
  $("#btn-mock-cancel-run").addEventListener("click", () => {
    $("#mock-run-form").classList.add("hidden");
    $("#mock-save-hint").textContent = "";
  });

  $("#btn-mock-export-json").addEventListener("click", () => {
    downloadText(`hovercraft_mock_${dateStamp()}.json`, JSON.stringify(mock, null, 2), "application/json");
  });
  $("#file-mock-import-json").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const obj = await readJSONFile(file);
      if (!obj || !obj.meta || !Array.isArray(obj.runs)) throw new Error("Bad mock JSON");
      mock = obj;
      if (mock.runState?.bonusMode == null) mock.runState.bonusMode = false;
      if (mock.runState?.bonusUsed == null) mock.runState.bonusUsed = false;
      saveMock(mock);
      mockRenderAll();
      alert("Imported mock compete data.");
    } catch (err) {
      console.error(err);
      alert("Import failed.");
    }
  });

  $("#btn-mock-clear").addEventListener("click", () => {
    if (!confirm("Clear ALL mock compete data?")) return;
    mock = defaultMock();
    saveMock(mock);
    mockStopPeriodRAF();
    mockStopRunRAF();
    mockRenderAll();
  });

  $("#btn-mock-generate-scoresheet").addEventListener("click", () => {
    generateScoresheet();
    $("#btn-mock-print-scoresheet").disabled = false;
    $("#mock-scoresheet").classList.remove("hidden");
    document.getElementById("mock-scoresheet").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#btn-mock-print-scoresheet").addEventListener("click", () => window.print());

  mockRenderAll();
}

function selectRuleset(name, step) {
  mock.meta.ruleset = { name, step };
  saveMock(mock);
  $("#mock-rules-name").textContent = `${name} (step ${step}s)`;
  $("#btn-mock-randomize-tt").disabled = false;
  mockUpdateStartEligibility();
}

function randomTTBTT(step) {
  const values = [];
  for (let t = 10.0; t <= 20.0001; t += step) values.push(Math.round(t * 10) / 10);
  const tt = values[Math.floor(Math.random() * values.length)];
  let btt = tt;
  while (btt === tt) btt = values[Math.floor(Math.random() * values.length)];
  return { tt, btt };
}

function mockRenderAll() {
  $("#mock-version").value = mock.meta.versionNum || "";
  $("#mock-competitors").value = mock.meta.competitors || "";
  $("#mock-team").value = mock.meta.team || "";

  $("#mock-rules-name").textContent = mock.meta.ruleset ? `${mock.meta.ruleset.name} (step ${mock.meta.ruleset.step}s)` : "Not selected";
  $("#btn-mock-randomize-tt").disabled = !mock.meta.ruleset;

  $("#mock-tt").textContent = mock.meta.tt != null ? `${mock.meta.tt.toFixed(1)}s` : "—";
  $("#mock-btt").textContent = mock.meta.btt != null ? `${mock.meta.btt.toFixed(1)}s` : "—";

  $("#mock-check-complete").checked = !!mock.meta.constructionChecked;
  $("#mock-construction-violations").value = String(mock.meta.constructionViolations ?? 0);
  $("#mock-missed-impound").checked = !!mock.meta.missedImpound;

  // ✅ Bonus button visuals + enabled/disabled + glow
  const bonusBtn = $("#btn-mock-bonus-mode");
  const canBonus = mock.runState.bonusEligible && !mock.runState.bonusUsed && !mock.runState.ended;
  bonusBtn.disabled = !canBonus;
  bonusBtn.classList.toggle("glow", canBonus && !mock.runState.bonusMode);
  bonusBtn.textContent = `BONUS MODE: ${mock.runState.bonusMode ? "ON" : "OFF"}`;

  // sync the (hidden-ish) select for clarity
  $("#mock-final-run-type").value = mock.runState.bonusMode ? "bonus" : "tt";

  mockRenderPeriod();
  mockRenderRunState();
  mockRenderRunsTable();
  mockRenderScore();
  mockUpdateStartEligibility();
  mockUpdateRunButtons();
}

function mockUpdateStartEligibility() {
  const hint = $("#mock-start-hint");
  const can =
    !!mock.meta.ruleset &&
    (mock.meta.tt != null) &&
    (mock.meta.btt != null) &&
    !!mock.meta.constructionChecked;

  const started = mock.period.started;
  $("#btn-mock-start-period").disabled = started || !can;
  $("#btn-mock-reset-period").disabled = !started && mock.runs.length === 0;

  if (started) hint.textContent = "Period started.";
  else if (!mock.meta.ruleset) hint.textContent = "Select a ruleset first.";
  else if (mock.meta.tt == null || mock.meta.btt == null) hint.textContent = "Randomize TT/BTT.";
  else if (!mock.meta.constructionChecked) hint.textContent = "Complete construction check to start.";
  else hint.textContent = "Ready.";
}

function mockRenderPeriod() {
  $("#mock-period-display").textContent = fmtPeriod(mock.period.remainingMs);
  $("#btn-mock-pause-period").disabled = !mock.period.started || mock.period.paused;
  $("#btn-mock-resume-period").disabled = !mock.period.started || !mock.period.paused;
}

function fmtPeriod(ms) {
  ms = Math.max(0, ms);
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const t = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${t}`;
}

function mockStartPeriod() {
  mock.period.started = true;
  mock.period.paused = false;
  mock.period.startAtISO = new Date().toISOString();
  mock.period.pauseAtPerf = null;
  saveMock(mock);

  mockStartPeriodRAF();
  mockUpdateStartEligibility();
  mockUpdateRunButtons();
  mockRenderPeriod();
}

function mockPausePeriod() {
  if (!mock.period.started || mock.period.paused) return;
  mock.period.paused = true;
  mock.period.pauseAtPerf = nowPerf();
  saveMock(mock);
  mockStopPeriodRAF();
  mockRenderPeriod();
  mockUpdateRunButtons();
}

function mockResumePeriod() {
  if (!mock.period.started || !mock.period.paused) return;
  mock.period.paused = false;
  mock.period.pauseAtPerf = null;
  saveMock(mock);
  mockStartPeriodRAF();
  mockRenderPeriod();
  mockUpdateRunButtons();
}

function mockStartPeriodRAF() {
  mockStopPeriodRAF();
  let last = nowPerf();
  mockPeriodRAF = requestAnimationFrame(function tick() {
    if (!mock.period.started || mock.period.paused) return;
    const cur = nowPerf();
    const dt = cur - last;
    last = cur;

    mock.period.remainingMs = Math.max(0, mock.period.remainingMs - dt);
    $("#mock-period-display").textContent = fmtPeriod(mock.period.remainingMs);

    mockPeriodRAF = requestAnimationFrame(tick);
  });
}

function mockStopPeriodRAF() {
  if (mockPeriodRAF) cancelAnimationFrame(mockPeriodRAF);
  mockPeriodRAF = null;
}

function mockUpdateRunButtons() {
  const canStart =
    mock.period.started &&
    !mock.period.paused &&
    !mock.runState.ended &&
    mock.meta.tt != null;

  $("#btn-mock-start-run").disabled = !canStart || mockRun.running;
  $("#btn-mock-stop-run").disabled = !mockRun.running;
  $("#btn-mock-reset-run").disabled = !mock.period.started;

  if (!$("#mock-run-form").classList.contains("hidden")) {
    $("#btn-mock-start-run").disabled = true;
  }
}

function mockStopRunRAF() {
  mockRun.running = false;
  if (mockRun.raf) cancelAnimationFrame(mockRun.raf);
  mockRun.raf = null;
  mockRun.startAt = 0;
}

function mockStartRun() {
  if (mockRun.running) return;

  mockRun.runStartValid = mock.period.remainingMs > 0;

  mockRun.running = true;
  mockRun.startAt = nowPerf();
  mockRun.elapsedMs = 0;
  $("#mock-run-display").textContent = fmtMs(0);

  $("#btn-mock-start-run").disabled = true;
  $("#btn-mock-stop-run").disabled = false;

  mockRun.raf = requestAnimationFrame(function tick() {
    if (!mockRun.running) return;
    const ms = nowPerf() - mockRun.startAt;
    mockRun.elapsedMs = ms;
    $("#mock-run-display").textContent = fmtMs(ms);
    mockRun.raf = requestAnimationFrame(tick);
  });
}

function mockStopRun() {
  if (!mockRun.running) return;

  const ms = mockRun.elapsedMs;
  mockStopRunRAF();
  $("#btn-mock-stop-run").disabled = true;

  $("#mock-run-form").classList.remove("hidden");
  $("#mock-save-hint").textContent = "";

  $("#mock-did-not-cross-start").checked = false;
  $("#mock-complete-select").value = "complete";
  $("#mock-complete-select").disabled = false;
  $("#mock-distance-cm").value = "";
  $("#mock-distance-cm").disabled = true;

  $("#mock-touched-after-start").checked = false;
  $("#mock-part-fell-off").checked = false;
  $("#mock-competition-violations").value = "0";

  // ✅ If bonus mode is ON, ramp must be off/disabled
  if (mock.runState.bonusMode) {
    $("#mock-used-ramp").checked = false;
    $("#mock-used-ramp").disabled = true;
    $("#mock-final-run-type").value = "bonus";
  } else {
    $("#mock-used-ramp").disabled = false;
    $("#mock-final-run-type").value = "tt";
  }

  $("#mock-run-form").dataset.runtimeMs = String(ms);
  $("#mock-run-form").dataset.startedValid = mockRun.runStartValid ? "1" : "0";

  mockUpdateRunButtons();
}

function mockRenderRunState() {
  $("#mock-run-number").textContent = String(mock.runState.runCount || 0);
  $("#mock-complete-count").textContent = String(mock.runState.completeCount || 0);
  $("#mock-incomplete-count").textContent = String(mock.runState.incompleteCount || 0);
  $("#mock-bonus-eligible").textContent = mock.runState.bonusEligible ? "YES" : "NO";

  const hint = $("#mock-run-hint");
  if (!mock.period.started) hint.textContent = "Start the 8:00 period to begin runs.";
  else if (mock.period.paused) hint.textContent = "Period is paused.";
  else if (mock.runState.ended) hint.textContent = "Testing ended (rule limit reached).";
  else if (mock.runState.bonusMode) hint.textContent = "BONUS MODE is ON: next run will be scored as BONUS (no ramp).";
  else hint.textContent = "Start a run, stop it, then record outcome.";
}

function mockSaveRun() {
  const form = $("#mock-run-form");
  const runtimeMs = parseNum(form.dataset.runtimeMs);
  const startedValid = form.dataset.startedValid === "1";
  if (runtimeMs == null) return;

  if (!startedValid) {
    $("#mock-save-hint").textContent = "This run started after the 8:00 timer hit 0, so it does not count.";
    return;
  }

  if ($("#mock-did-not-cross-start").checked) {
    $("#mock-save-hint").textContent = "Recorded: did not cross start line within 3s (does not count as a run).";
    setTimeout(() => { $("#mock-run-form").classList.add("hidden"); mockUpdateRunButtons(); }, 700);
    return;
  }

  if (mock.runState.ended) {
    $("#mock-save-hint").textContent = "Testing already ended by rule.";
    return;
  }

  const runtimeSec = runtimeMs / 1000;
  const touched = $("#mock-touched-after-start").checked;
  const partFellOff = $("#mock-part-fell-off").checked;
  let compViol = Math.max(0, parseInt($("#mock-competition-violations").value || "0", 10));
  if (partFellOff) compViol += 1;

  let status = $("#mock-complete-select").value;

  const tt = mock.meta.tt;
  const btt = mock.meta.btt;

  // Which target applies?
  const isBonusRun = mock.runState.bonusMode === true;
  const target = isBonusRun ? btt : tt;

  // Auto-incomplete if > 2*target (we cannot detect "fails to move 3s")
  if (target != null && runtimeSec > 2 * target) status = "incomplete";

  let distCm = null;
  if (status === "incomplete") {
    distCm = parseNum($("#mock-distance-cm").value);
    if (distCm == null || distCm < 0) {
      $("#mock-save-hint").textContent = "Enter distance from finish line (cm) for an incomplete run.";
      return;
    }
  }

  // Ramp not allowed during bonus run
  let ramp = $("#mock-used-ramp").checked;
  if (isBonusRun) ramp = false;

  const type = isBonusRun ? "BONUS" : "TT";

  const scored = scoreRun({
    status,
    runtimeSec,
    tt,
    btt,
    runType: type,
    distCm,
    ramp,
    touched,
    compViol,
    constructionViol: mock.meta.constructionViolations || 0,
    missedImpound: !!mock.meta.missedImpound,
  });

  mock.runState.runCount += 1;
  if (status === "complete") mock.runState.completeCount += 1;
  else mock.runState.incompleteCount += 1;

  // ✅ After FIRST complete TT run, compute bonus eligibility
  if (type === "TT" && status === "complete" && mock.runState.completeCount === 1) {
    mock.runState.bonusEligible = isBonusEligible(runtimeSec, tt);
    // If eligible, BONUS MODE button will light up on render
  }

  // ✅ If a BONUS run was used, lock it out afterward
  if (type === "BONUS") {
    mock.runState.bonusUsed = true;
    mock.runState.bonusMode = false; // auto turn off after use
  }

  // rules: after 1 complete run, only one more run allowed
  const reachedIncompleteLimit = mock.runState.incompleteCount >= 3;
  const reachedFinalAfterComplete = mock.runState.completeCount >= 1 && mock.runState.runCount >= 2;
  if (reachedIncompleteLimit || reachedFinalAfterComplete) mock.runState.ended = true;

  const idx = mock.runs.length + 1;
  mock.runs.push({
    idx,
    type,
    runtimeSec,
    status,
    distCm,
    ramp,
    touched,
    compViol,
    partFellOff,
    ds: scored.ds,
    ts: scored.ts,
    rs: scored.rs,
    bs: scored.bs,
  });

  saveMock(mock);

  $("#mock-run-form").classList.add("hidden");
  $("#mock-run-display").textContent = fmtMs(0);

  mockRenderAll();
}

function isBonusEligible(runtimeSec, tt) {
  if (tt == null) return false;
  return Math.abs(runtimeSec - tt) <= 0.25 * tt;
}

function scoreRun({
  status, runtimeSec, tt, btt, runType, distCm,
  ramp, touched, compViol, constructionViol, missedImpound
}) {
  const mImp = missedImpound ? 0.7 : 1.0;
  const mCon = Math.pow(0.8, Math.max(0, constructionViol || 0));
  const mComp = Math.pow(0.9, Math.max(0, compViol || 0));
  const mult = mImp * mCon * mComp;

  let ds = 0;
  let ts = 0;
  let rs = 0;
  let bs = 0;

  if (touched) return { ds: 0, ts: 0, rs: 0, bs: 0, mult };

  if (status === "complete") ds = 30;
  else {
    const d = Math.min(185, Math.max(0, distCm ?? 185));
    ds = 30 * (185 - d) / 185;
    ts = 0;
  }

  if (ramp) ds *= 0.5;

  if (status === "complete" && tt != null) {
    ts = 60 * (1 - (Math.abs(runtimeSec - tt) / tt));
    ts = Math.max(0, ts);
  }

  rs = ds + ts;

  if (runType === "BONUS") {
    if (status === "complete" && btt != null) {
      bs = 15 * (1 - (1.5 * Math.abs(runtimeSec - btt) / btt));
      bs = Math.max(0, bs);
    } else {
      bs = 0;
    }
  }

  ds *= mult;
  ts *= mult;
  rs = ds + ts;
  bs *= mult;

  return { ds: round3(ds), ts: round3(ts), rs: round3(rs), bs: round3(bs), mult };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function mockRenderRunsTable() {
  const tb = $("#mock-tbody");
  tb.innerHTML = "";
  for (const r of mock.runs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${r.idx}</td>
      <td class="mono">${r.type}</td>
      <td class="mono">${fmtSec(r.runtimeSec)}</td>
      <td class="mono">${r.status}</td>
      <td class="mono">${r.distCm == null ? "" : fmtSec(r.distCm)}</td>
      <td class="mono">${r.ramp ? "YES" : "NO"}</td>
      <td class="mono">${r.touched ? "YES" : "NO"}</td>
      <td class="mono">${r.compViol ?? 0}</td>
      <td class="mono">${fmtSec(r.ds)}</td>
      <td class="mono">${fmtSec(r.ts)}</td>
      <td class="mono">${fmtSec(r.rs)}</td>
      <td class="mono">${fmtSec(r.bs)}</td>
    `;
    tb.appendChild(tr);
  }
}

function mockRecalcAllScores() {
  for (const r of mock.runs) {
    const scored = scoreRun({
      status: r.status,
      runtimeSec: r.runtimeSec,
      tt: mock.meta.tt,
      btt: mock.meta.btt,
      runType: r.type,
      distCm: r.distCm,
      ramp: r.ramp,
      touched: r.touched,
      compViol: r.compViol,
      constructionViol: mock.meta.constructionViolations || 0,
      missedImpound: !!mock.meta.missedImpound,
    });
    r.ds = scored.ds;
    r.ts = scored.ts;
    r.rs = scored.rs;
    r.bs = scored.bs;
  }
  saveMock(mock);
}

function mockRenderScore() {
  let bestRS = 0;
  let bestBS = 0;
  for (const r of mock.runs) {
    if (typeof r.rs === "number") bestRS = Math.max(bestRS, r.rs);
    if (typeof r.bs === "number") bestBS = Math.max(bestBS, r.bs);
  }
  const finalScore = round3(bestRS + bestBS);
  $("#mock-best-rs").textContent = bestRS ? fmtSec(bestRS) : "0.000";
  $("#mock-best-bs").textContent = bestBS ? fmtSec(bestBS) : "0.000";
  $("#mock-final-score").textContent = fmtSec(finalScore);
}

function generateScoresheet() {
  mockRecalcAllScores();
  mockRenderScore();

  const meta = mock.meta;
  const rules = meta.ruleset ? `${meta.ruleset.name} (step ${meta.ruleset.step}s)` : "—";
  const tt = meta.tt != null ? `${meta.tt.toFixed(1)}s` : "—";
  const btt = meta.btt != null ? `${meta.btt.toFixed(1)}s` : "—";

  let bestRS = 0;
  let bestBS = 0;
  let bestRSIdx = null;
  let bestBSIdx = null;

  for (const r of mock.runs) {
    if (r.rs != null && r.rs >= bestRS) { bestRS = r.rs; bestRSIdx = r.idx; }
    if (r.bs != null && r.bs >= bestBS) { bestBS = r.bs; bestBSIdx = r.idx; }
  }
  const finalScore = round3(bestRS + bestBS);

  const rowsHtml = mock.runs.map(r => `
    <tr>
      <td>${r.idx}</td>
      <td>${r.type}</td>
      <td>${fmtSec(r.runtimeSec)}</td>
      <td>${r.status}</td>
      <td>${r.distCm == null ? "" : fmtSec(r.distCm)}</td>
      <td>${r.ramp ? "YES" : "NO"}</td>
      <td>${r.touched ? "YES" : "NO"}</td>
      <td>${r.compViol ?? 0}</td>
      <td>${fmtSec(r.ds)}</td>
      <td>${fmtSec(r.ts)}</td>
      <td>${fmtSec(r.rs)}</td>
      <td>${fmtSec(r.bs)}</td>
    </tr>
  `).join("");

  const html = `
    <div class="meta">
      <div><b>Team/School:</b> ${escapeHtml(meta.team || "")}</div>
      <div><b>Hovercraft Version #:</b> ${escapeHtml(meta.versionNum || "")}</div>
      <div><b>Competitors:</b> ${escapeHtml(meta.competitors || "")}</div>
      <div><b>Ruleset:</b> ${escapeHtml(rules)}</div>
      <div><b>TT:</b> ${escapeHtml(tt)}</div>
      <div><b>BTT:</b> ${escapeHtml(btt)}</div>
      <div><b>Construction Violations:</b> ${meta.constructionViolations ?? 0}</div>
      <div><b>Missed Impound:</b> ${meta.missedImpound ? "YES" : "NO"}</div>
    </div>

    <h3>Runs</h3>
    <div class="table-wrap" style="margin-bottom:10px;">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Type</th><th>Runtime (s)</th><th>Status</th><th>Dist cm</th><th>Ramp</th><th>Touch</th><th>Comp viol</th><th>DS</th><th>TS</th><th>RS</th><th>BS</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="12" class="muted">No runs recorded.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="meta">
      <div><b>Best RS:</b> ${fmtSec(bestRS)} (Run #${bestRSIdx ?? "—"})</div>
      <div><b>Best Bonus:</b> ${fmtSec(bestBS)} (Run #${bestBSIdx ?? "—"})</div>
      <div><b>Final Score:</b> ${fmtSec(finalScore)}</div>
      <div><b>Generated:</b> ${new Date().toLocaleString()}</div>
    </div>
  `;

  $("#mock-scoresheet-content").innerHTML = html;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -----------------------
   BOOT
------------------------*/
window.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initHomeNav();
  initPractice();
  initMock();
});
