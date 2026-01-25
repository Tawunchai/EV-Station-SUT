/**
 * =============================================================================
 * EV SIM DASHBOARD (ONE FILE) - MINIMAL & USER FRIENDLY
 * -----------------------------------------------------------------------------
 * ✅ UI:    http://127.0.0.1:9000/sim
 * ✅ Proxy: http://127.0.0.1:9000/* -> https://api.evstation-sut.it.com/*
 *
 * Run:
 *   node ev_sim_onefile.js
 * =============================================================================
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const TARGET = "https://api.evstation-sut.it.com";
const PORT = 9000;

const httpsAgent = new https.Agent({ keepAlive: true });

// -------------------------------------
// CORS headers helper
// -------------------------------------
function setCorsHeaders(res, extra = {}) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    ...extra,
  };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
}

function sendText(res, status, text, extraHeaders = {}) {
  res.statusCode = status;
  setCorsHeaders(res, {
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  res.end(text);
}

function sendHtml(res, html) {
  res.statusCode = 200;
  setCorsHeaders(res, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// -------------------------------------
// Proxy (stream) - ลด Failed to fetch
// -------------------------------------
function proxyRequest(req, res) {
  const targetUrl = new URL(req.url, TARGET);

  const forwardedHeaders = { ...req.headers };
  delete forwardedHeaders.origin;
  delete forwardedHeaders.referer;
  forwardedHeaders.host = targetUrl.host;

  const options = {
    method: req.method,
    headers: forwardedHeaders,
    agent: httpsAgent,
  };

  const proxyReq = https.request(targetUrl, options, (proxyRes) => {
    const respHeaders = { ...proxyRes.headers };

    respHeaders["access-control-allow-origin"] = "*";
    respHeaders["access-control-allow-methods"] =
      "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    respHeaders["access-control-allow-headers"] =
      "Content-Type, Authorization";

    res.writeHead(proxyRes.statusCode || 200, respHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    res.statusCode = 500;
    setCorsHeaders(res, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err.message }));
  });

  req.pipe(proxyReq, { end: true });
}

// -------------------------------------
// HTML UI (Minimal Dashboard)
// -------------------------------------
function getHtml() {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>EV SIM Dashboard</title>

  <style>
    :root{
      --bg:#f7fbff;
      --card:#ffffff;
      --border:rgba(37,99,235,0.14);

      --text:#061428;
      --muted:#5c7396;

      --blue:#2563eb;
      --sky:#0ea5e9;

      --green:#22c55e;
      --green2:#16a34a;

      --red:#ef4444;
      --red2:#dc2626;

      --shadow: 0 14px 35px rgba(10, 45, 90, 0.10);
      --shadow2: 0 10px 22px rgba(10, 45, 90, 0.08);

      --radius: 18px;

      /* ✅ Status Colors */
      --st-available-bg: rgba(34,197,94,0.12);
      --st-available-bd: rgba(34,197,94,0.35);
      --st-available-tx: #166534;

      --st-preparing-bg: rgba(245,158,11,0.14);
      --st-preparing-bd: rgba(245,158,11,0.40);
      --st-preparing-tx: #92400e;

      --st-charging-bg: rgba(37,99,235,0.14);
      --st-charging-bd: rgba(37,99,235,0.40);
      --st-charging-tx: #1e40af;

      --st-finishing-bg: rgba(168,85,247,0.14);
      --st-finishing-bd: rgba(168,85,247,0.40);
      --st-finishing-tx: #6b21a8;

      --st-default-bg: rgba(148,163,184,0.18);
      --st-default-bd: rgba(148,163,184,0.40);
      --st-default-tx: #334155;
    }

    *{ box-sizing:border-box; }

    html, body{
      height:100%;
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
        "Helvetica Neue", Arial, "Noto Sans";
      color: var(--text);
      background:
        radial-gradient(1000px 450px at 0% -10%, rgba(37,99,235,0.15), transparent 62%),
        radial-gradient(900px 420px at 100% -15%, rgba(14,165,233,0.16), transparent 62%),
        var(--bg);
      overflow:hidden;
    }

    .app{
      width:100vw;
      height:100vh;
      padding: 16px;
      display:flex;
      flex-direction: column;
      gap: 14px;
    }

    /* ✅ Minimal Topbar */
    .topbar{
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap:12px;
      padding: 14px 16px;
      border-radius: var(--radius);
      background: rgba(255,255,255,0.78);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .brand{
      display:flex;
      align-items:center;
      gap: 10px;
      min-width: 0;
    }

    .logo{
      width: 44px;
      height: 44px;
      border-radius: 16px;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#fff;
      font-weight: 1000;
      background: linear-gradient(135deg, rgba(37,99,235,1), rgba(14,165,233,1));
      box-shadow: 0 16px 34px rgba(37,99,235,0.28);
      user-select:none;
      flex: 0 0 auto;
    }

    .brandText{
      display:flex;
      flex-direction: column;
      gap: 2px;
      min-width:0;
    }

    .title{
      font-size: 14px;
      font-weight: 1000;
      white-space: nowrap;
      overflow:hidden;
      text-overflow: ellipsis;
    }

    .sub{
      font-size: 12px;
      font-weight: 900;
      color: var(--muted);
      white-space: nowrap;
      overflow:hidden;
      text-overflow: ellipsis;
    }

    .rightBadges{
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .chip{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 8px 12px;
      border-radius: 999px;
      background:#fff;
      border: 1px solid var(--border);
      box-shadow: var(--shadow2);
      font-size: 12px;
      font-weight: 1000;
      user-select:none;
    }

    .dot{
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background:#94a3b8;
    }

    .dot.ok{ background: var(--green); }
    .dot.bad{ background: #fb7185; }

    .chip .value{
      color:#071428;
      font-weight: 1000;
    }

    /* ✅ Status Badge */
    .statusBadge{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 1000;
      border: 1px solid var(--st-default-bd);
      background: var(--st-default-bg);
      color: var(--st-default-tx);
      box-shadow: var(--shadow2);
      user-select:none;
      line-height: 1;
    }

    .statusBadge .miniDot{
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--st-default-tx);
      opacity: 0.85;
    }

    .statusBadge.available{
      background: var(--st-available-bg);
      border-color: var(--st-available-bd);
      color: var(--st-available-tx);
    }
    .statusBadge.available .miniDot{ background: var(--st-available-tx); }

    .statusBadge.preparing{
      background: var(--st-preparing-bg);
      border-color: var(--st-preparing-bd);
      color: var(--st-preparing-tx);
    }
    .statusBadge.preparing .miniDot{ background: var(--st-preparing-tx); }

    .statusBadge.charging{
      background: var(--st-charging-bg);
      border-color: var(--st-charging-bd);
      color: var(--st-charging-tx);
    }
    .statusBadge.charging .miniDot{ background: var(--st-charging-tx); }

    .statusBadge.finishing{
      background: var(--st-finishing-bg);
      border-color: var(--st-finishing-bd);
      color: var(--st-finishing-tx);
    }
    .statusBadge.finishing .miniDot{ background: var(--st-finishing-tx); }

    /* Layout */
    .main{
      flex:1;
      min-height:0;
      display:grid;
      grid-template-columns: 370px 1fr;
      gap: 14px;
    }

    @media (max-width: 980px){
      html, body{ overflow:auto; }
      .app{ height:auto; min-height:100vh; overflow:visible; }
      .main{ grid-template-columns: 1fr; }
    }

    .panel{
      background: rgba(255,255,255,0.78);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
      overflow:hidden;
      display:flex;
      flex-direction: column;
      min-height: 0;
    }

    .panelHeader{
      padding: 14px 16px;
      border-bottom: 1px solid rgba(37,99,235,0.10);
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap: 10px;
    }

    .panelHeader h3{
      margin:0;
      font-size: 13px;
      font-weight: 1000;
      display:flex;
      align-items:center;
      gap: 8px;
    }

    .panelHeader small{
      color: var(--muted);
      font-weight: 900;
    }

    .panelBody{
      padding: 16px;
      display:flex;
      flex-direction: column;
      gap: 12px;
      flex:1;
      min-height:0;
    }

    label{
      display:block;
      font-size: 12px;
      color: var(--muted);
      font-weight: 1000;
      margin-bottom: 6px;
    }

    input{
      width:100%;
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid rgba(37,99,235,0.16);
      outline:none;
      font-size: 14px;
      background:#fff;
    }

    input:focus{
      border-color: rgba(37,99,235,0.55);
      box-shadow: 0 0 0 4px rgba(37,99,235,0.10);
    }

    .grid2{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    @media (max-width: 520px){
      .grid2{ grid-template-columns: 1fr; }
    }

    /* Buttons - minimal & friendly */
    .btn{
      width:100%;
      border:none;
      padding: 13px 12px;
      border-radius: 14px;
      font-weight: 1000;
      font-size: 13px;
      cursor:pointer;
      color:#fff;
      transition: 0.15s;
      display:flex;
      align-items:center;
      justify-content:center;
      gap: 8px;
      user-select:none;
    }

    .btn:active{ transform: scale(0.99); }
    .btn:disabled{
      opacity: 0.55;
      cursor:not-allowed;
      transform:none;
      filter: grayscale(0.2);
      box-shadow:none !important;
    }

    .btn.sky{
      background: linear-gradient(135deg, rgba(14,165,233,1), rgba(37,99,235,1));
      box-shadow: 0 14px 30px rgba(14,165,233,0.18);
    }

    .btn.green{
      background: linear-gradient(135deg, rgba(34,197,94,1), rgba(22,163,74,1));
      box-shadow: 0 14px 30px rgba(34,197,94,0.16);
    }

    .btn.red{
      background: linear-gradient(135deg, rgba(239,68,68,1), rgba(220,38,38,1));
      box-shadow: 0 14px 30px rgba(239,68,68,0.14);
    }

    /* Status Cards */
    .stats{
      display:grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    @media (max-width: 980px){
      .stats{ grid-template-columns: 1fr; }
    }

    .stat{
      background:#fff;
      border: 1px solid rgba(37,99,235,0.14);
      border-radius: 16px;
      padding: 12px 12px;
      box-shadow: var(--shadow2);
      position: relative;
      overflow:hidden;
    }

    .stat::before{
      content:"";
      position:absolute;
      inset: -2px;
      background: radial-gradient(300px 140px at 0% 0%, rgba(37,99,235,0.12), transparent 70%);
      pointer-events:none;
    }

    .stat .k{
      position: relative;
      font-size: 11px;
      color: var(--muted);
      font-weight: 1000;
    }

    .stat .v{
      position: relative;
      margin-top: 6px;
      font-size: 16px;
      font-weight: 1000;
      white-space: nowrap;
      overflow:hidden;
      text-overflow: ellipsis;
    }

    /* ✅ Status in Snapshot */
    .statusInline{
      margin-top: 8px;
      display:flex;
      justify-content:flex-start;
    }

    /* Log */
    .logWrap{
      flex:1;
      min-height:0;
      border-radius: 16px;
      overflow:hidden;
      border: 1px solid rgba(37,99,235,0.14);
      background: #06142a;
      box-shadow: var(--shadow2);
    }

    .log{
      height:100%;
      overflow-y:auto;
      padding: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
      font-size: 11px;
      color: #7dd3fc;
    }

    .line{
      padding: 2px 0;
      word-break: break-word;
    }

    .t{
      color: #cbd5e1;
      font-weight: 1000;
      margin-right: 6px;
    }

    .ok{ color:#34d399; font-weight:1000; }
    .err{ color:#fb7185; font-weight:1000; }
    .info{ color:#7dd3fc; font-weight:1000; }

    /* Small note (minimal) */
    .miniNote{
      margin-top: 2px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 900;
      line-height: 1.5;
    }

    .pill{
      display:inline-flex;
      align-items:center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(37,99,235,0.14);
      background: rgba(37,99,235,0.06);
      color:#1e40af;
      font-weight: 1000;
      font-size: 12px;
    }
  </style>
</head>

<body>
  <div class="app">

    <!-- TOPBAR -->
    <div class="topbar">
      <div class="brand">
        <div class="logo">EV</div>
        <div class="brandText">
          <div class="title">EV SIM Dashboard</div>
          <div class="sub">
            Start ได้เมื่อ <span class="pill">Preparing</span> และ Stop ได้เมื่อ <span class="pill">Charging</span>
          </div>
        </div>
      </div>

      <div class="rightBadges">
        <div class="chip">
          <span id="wsDot" class="dot bad"></span>
          WS <span class="value" id="wsText">Disconnected</span>
        </div>

        <!-- ✅ Status badge topbar -->
        <div id="statusBadgeTop" class="statusBadge">
          <span class="miniDot"></span>
          <span id="statusTop">-</span>
        </div>

        <div class="chip">
          Tx <span class="value" id="txTop">-</span>
        </div>
      </div>
    </div>

    <!-- MAIN -->
    <div class="main">

      <!-- LEFT -->
      <div class="panel">
        <div class="panelHeader">
          <h3>⚙️ Control</h3>
          <small>เชื่อมต่อ WS ก่อนเริ่มใช้งาน</small>
        </div>

        <div class="panelBody">
          <div class="grid2">
            <div>
              <label>REST Base (Proxy)</label>
              <input id="apiBase" value="http://127.0.0.1:9000" />
            </div>
            <div>
              <label>WS Base (Real API)</label>
              <input id="wsBase" value="https://api.evstation-sut.it.com" />
            </div>
          </div>

          <div class="grid2">
            <div>
              <label>Charger ID</label>
              <input id="chargerId" value="CP_3" placeholder="เช่น CP_1 / CP_3" />
            </div>
            <div>
              <label>idTag</label>
              <input id="idTag" value="B001" placeholder="เช่น B001" />
            </div>
          </div>

          <button class="btn sky" onclick="connectWS()">
            🔌 Connect WebSocket
          </button>

          <button class="btn green" id="startBtn" onclick="remoteStart()" disabled>
            ▶️ Start Charging
          </button>

          <button class="btn red" id="stopBtn" onclick="remoteStop()" disabled>
            ⏹ Stop Charging
          </button>

          <div class="miniNote">
            💡 ถ้าปุ่มกดไม่ได้ ระบบจะรอให้สถานะถูกต้องก่อนอัตโนมัติ
          </div>
        </div>
      </div>

      <!-- RIGHT -->
      <div class="panel">
        <div class="panelHeader">
          <h3>📊 Live Snapshot</h3>
          <small>อัปเดตแบบ Real-time</small>
        </div>

        <div class="panelBody">
          <div class="stats">
            <div class="stat">
              <div class="k">ChargerID</div>
              <div class="v" id="stCharger">-</div>
            </div>

            <div class="stat">
              <div class="k">Status</div>
              <div class="v" id="stStatus">-</div>
              <div class="statusInline">
                <div id="statusBadgeSnap" class="statusBadge">
                  <span class="miniDot"></span>
                  <span id="statusSnapText">-</span>
                </div>
              </div>
            </div>

            <div class="stat">
              <div class="k">Connected</div>
              <div class="v" id="stConnected">-</div>
            </div>

            <div class="stat">
              <div class="k">Transaction ID</div>
              <div class="v" id="stTx">-</div>
            </div>
            <div class="stat">
              <div class="k">Power (kW)</div>
              <div class="v" id="stPower">-</div>
            </div>
            <div class="stat">
              <div class="k">Energy (Wh)</div>
              <div class="v" id="stEnergy">-</div>
            </div>
          </div>

          <div class="logWrap">
            <div id="log" class="log">
              <div class="line">
                <span class="t">[SYSTEM]</span><span class="info">ระบบพร้อมทำงาน…</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div><!-- /main -->
  </div><!-- /app -->

<script>
  // ================================
  // STATE
  // ================================
  let ws = null;
  let wsConnected = false;

  let currentChargerStatus = "-";
  let currentTxId = "-";

  // ================================
  // Helpers
  // ================================
  const $ = (id) => document.getElementById(id);

  function nowTime(){ return new Date().toLocaleTimeString(); }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function logLine(msg, type="info"){
    const el = $("log");
    const cls = type === "ok" ? "ok" : type === "error" ? "err" : "info";
    const div = document.createElement("div");
    div.className = "line";
    div.innerHTML = '<span class="t">['+nowTime()+']</span><span class="'+cls+'">'+escapeHtml(msg)+'</span>';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function cleanBaseUrl(v){
    return (v || "").trim().replace(/\\/+$/, "");
  }

  function getApiBase(){ return cleanBaseUrl($("apiBase").value); }
  function getWsBase(){ return cleanBaseUrl($("wsBase").value); }
  function getChargerId(){ return ($("chargerId").value || "").trim(); }
  function getIdTag(){ return ($("idTag").value || "").trim(); }

  function buildWsUrl(wsBaseHttps, chargerId){
    const wsBase = wsBaseHttps
      .replace(/^https:\\/\\//i, "wss://")
      .replace(/^http:\\/\\//i, "ws://");
    return wsBase + "/frontend/" + encodeURIComponent(chargerId);
  }

  function setWsBadge(ok, text){
    const dot = $("wsDot");
    dot.classList.remove("ok","bad");
    dot.classList.add(ok ? "ok" : "bad");
    $("wsText").textContent = text || (ok ? "Connected" : "Disconnected");
  }

  // ✅ Map status -> badge class
  function statusClass(status){
    const s = String(status || "").toLowerCase().trim();
    if(s === "available") return "available";
    if(s === "preparing") return "preparing";
    if(s === "charging") return "charging";
    if(s === "finishing") return "finishing";
    return ""; // default
  }

  function applyStatusBadge(el, statusText){
    if(!el) return;
    el.classList.remove("available","preparing","charging","finishing");
    const cls = statusClass(statusText);
    if(cls) el.classList.add(cls);
  }

  function setTop(){
    $("statusTop").textContent = currentChargerStatus || "-";
    $("txTop").textContent = String(currentTxId ?? "-");

    // top badge
    applyStatusBadge($("statusBadgeTop"), currentChargerStatus);

    // snapshot badge
    $("statusSnapText").textContent = currentChargerStatus || "-";
    applyStatusBadge($("statusBadgeSnap"), currentChargerStatus);
  }

  // ✅ Rule ตามที่กำหนด
  // Start: Preparing เท่านั้น
  // Stop : Charging เท่านั้น
  function updateButtons(){
    const startBtn = $("startBtn");
    const stopBtn = $("stopBtn");

    const s = String(currentChargerStatus || "-");

    const canStart = wsConnected && s === "Preparing";
    const canStop  = wsConnected && s === "Charging";

    startBtn.disabled = !canStart;
    stopBtn.disabled  = !canStop;
  }

  function setSnapshotUI(snapshot){
    if(!snapshot || typeof snapshot !== "object") return;

    const cid = snapshot.chargerId || getChargerId() || "-";
    const status = snapshot.status || "-";
    const connected = (snapshot.connected === true) ? "true" : (snapshot.connected === false ? "false" : "-");

    const tx =
      snapshot.active_transaction_id ??
      (snapshot.meter && snapshot.meter.transaction_id) ??
      snapshot.transactionId ??
      "-";

    const power =
      (snapshot.meter && snapshot.meter.power_kw != null) ? snapshot.meter.power_kw :
      snapshot.power_kw ?? "-";

    const energy =
      (snapshot.meter && snapshot.meter.energy_wh != null) ? snapshot.meter.energy_wh :
      snapshot.energy_wh ?? "-";

    $("stCharger").textContent = String(cid);
    $("stStatus").textContent = String(status);
    $("stConnected").textContent = String(connected);
    $("stTx").textContent = String(tx);
    $("stPower").textContent = String(power);
    $("stEnergy").textContent = String(energy);

    currentChargerStatus = String(status || "-");
    currentTxId = String(tx ?? "-");

    setTop();
    updateButtons();
  }

  // ================================
  // WS
  // ================================
  function connectWS(){
    const wsBase = getWsBase();
    const chargerId = getChargerId();

    if(!wsBase || !chargerId){
      logLine("❌ กรุณาใส่ WS Base และ Charger ID", "error");
      return;
    }

    const wsUrl = buildWsUrl(wsBase, chargerId);
    logLine("➡️ Connect WS: " + wsUrl, "info");

    try{
      if(ws) ws.close();
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        wsConnected = true;
        setWsBadge(true, "Connected");
        logLine("✅ WS Connected: " + chargerId, "ok");
        updateButtons();
      };

      ws.onmessage = (e) => {
        try{
          const data = JSON.parse(e.data);

          // Heartbeat raw
          if(Array.isArray(data) && data[2] === "Heartbeat"){
            logLine("💓 Heartbeat", "info");
            return;
          }

          // StatusNotification raw
          if(Array.isArray(data) && data[2] === "StatusNotification"){
            const payload = data[3] || {};
            if(payload.status){
              setSnapshotUI({ chargerId: getChargerId(), status: payload.status, connected: true });
            }
            logLine("📩 WS JSON: " + JSON.stringify(data), "info");
            return;
          }

          // snapshot/update objects
          if(data && typeof data === "object"){
            if(data.type === "charger_snapshot" || data.type === "charger_status_update"){
              setSnapshotUI(data);
            }
            logLine("📩 WS JSON: " + JSON.stringify(data), "info");
            return;
          }

          logLine("📩 WS: " + String(e.data), "info");
        }catch{
          logLine("📩 WS TEXT: " + String(e.data), "info");
        }
      };

      ws.onclose = () => {
        wsConnected = false;
        setWsBadge(false, "Disconnected");
        logLine("❌ WS Disconnected", "error");
        updateButtons();
      };

      ws.onerror = () => {
        wsConnected = false;
        setWsBadge(false, "Error");
        logLine("❌ WS Error (ตรวจสอบ URL / server)", "error");
        updateButtons();
      };

    }catch(err){
      logLine("❌ สร้าง WebSocket ไม่ได้: " + err.message, "error");
    }
  }

  // ================================
  // REST Start/Stop via Proxy
  // ================================
  function previewBody(text, maxLen = 320){
    const t = String(text ?? "");
    if(t.length <= maxLen) return t;
    return t.slice(0, maxLen) + " ...";
  }

  async function remoteStart(){
    if(String(currentChargerStatus) !== "Preparing"){
      logLine("⛔ Start ได้เฉพาะตอน Status = Preparing", "error");
      updateButtons();
      return;
    }

    const apiBase = getApiBase();
    const chargerId = getChargerId();
    const idTag = getIdTag();

    if(!apiBase || !chargerId || !idTag){
      logLine("❌ กรุณากรอก REST Base, Charger ID, idTag ให้ครบ", "error");
      return;
    }

    const url = apiBase + "/ocpp/remote-start";
    const body = { chargerId: String(chargerId), connectorId: 1, idTag: String(idTag) };

    logLine("➡️ REST START", "info");
    logLine("📦 " + JSON.stringify(body), "info");

    try{
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();

      if(!res.ok){
        logLine("❌ START failed (status=" + res.status + ")", "error");
        logLine("↳ " + previewBody(text), "error");
        return;
      }

      logLine("✅ START OK: " + previewBody(text), "ok");
    }catch(err){
      logLine("❌ START fetch error: " + err.message, "error");
    }finally{
      updateButtons();
    }
  }

  async function remoteStop(){
    if(String(currentChargerStatus) !== "Charging"){
      logLine("⛔ Stop ได้เฉพาะตอน Status = Charging", "error");
      updateButtons();
      return;
    }

    const apiBase = getApiBase();
    const chargerId = getChargerId();

    if(!apiBase || !chargerId){
      logLine("❌ กรุณากรอก REST Base และ Charger ID", "error");
      return;
    }

    const url = apiBase + "/ocpp/remote-stop";
    const body = { chargerId: String(chargerId) };

    logLine("➡️ REST STOP", "info");
    logLine("📦 " + JSON.stringify(body), "info");

    try{
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();

      if(!res.ok){
        logLine("❌ STOP failed (status=" + res.status + ")", "error");
        logLine("↳ " + previewBody(text), "error");
        return;
      }

      logLine("✅ STOP OK: " + previewBody(text), "ok");
    }catch(err){
      logLine("❌ STOP fetch error: " + err.message, "error");
    }finally{
      updateButtons();
    }
  }

  // init
  (function init(){
    setWsBadge(false, "Disconnected");
    currentChargerStatus = "-";
    currentTxId = "-";
    setTop();
    updateButtons();
  })();
</script>

</body>
</html>`;
}

// -------------------------------------
// Server
// -------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    setCorsHeaders(res);
    return res.end();
  }

  if (req.url === "/sim" || req.url === "/sim/") {
    return sendHtml(res, getHtml());
  }

  if (req.url === "/__health") {
    return sendText(res, 200, "OK");
  }

  return proxyRequest(req, res);
});

server.listen(PORT, () => {
  console.log("✅ EV SIM ONE FILE (MINIMAL DASHBOARD) RUNNING");
  console.log(`🖥️  UI:    http://127.0.0.1:${PORT}/sim`);
  console.log(`🔁 PROXY: http://127.0.0.1:${PORT}/*  ->  ${TARGET}/*`);
});
