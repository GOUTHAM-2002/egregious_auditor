const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let srcType = "github";
let uploadedPath = null;

/* ---------- tabs ---------- */
$$(".tab").forEach(t => t.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  srcType = t.dataset.src;
  $$(".tabpane").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== srcType));
  hideErr();
}));

/* ---------- examples (fill local path) ---------- */
$$(".ex").forEach(c => c.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.toggle("active", x.dataset.src === "local"));
  srcType = "local";
  $$(".tabpane").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== "local"));
  $("#localPath").value = c.dataset.ex;
  hideErr();
}));

/* ---------- zip upload ---------- */
const drop = $("#drop"), zipFile = $("#zipFile");
drop.addEventListener("click", () => zipFile.click());
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) handleZip(e.dataTransfer.files[0]); });
zipFile.addEventListener("change", () => { if (zipFile.files[0]) handleZip(zipFile.files[0]); });
async function handleZip(file) {
  $("#dropText").textContent = "uploading " + file.name + "…";
  const fd = new FormData(); fd.append("file", file);
  try {
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    uploadedPath = j.path;
    $("#dropText").innerHTML = "✓ " + file.name + " <span style='color:var(--faint)'>ready</span>";
  } catch (e) { showErr("upload failed: " + e); }
}

/* ---------- errors ---------- */
function showErr(m) { const e = $("#errLine"); e.textContent = m; e.classList.remove("hidden"); }
function hideErr() { $("#errLine").classList.add("hidden"); }

/* ---------- run ---------- */
$("#runBtn").addEventListener("click", run);
async function run() {
  hideErr();
  let value = "";
  if (srcType === "github") value = $("#ghUrl").value.trim();
  else if (srcType === "local") value = $("#localPath").value.trim();
  else if (srcType === "zip") { value = uploadedPath; }
  if (!value) { showErr(srcType === "zip" ? "upload a .zip first" : "enter a value first"); return; }
  const stype = srcType === "zip" ? "zip" : srcType;

  $("#runBtn").disabled = true;
  $("#results").classList.add("hidden");
  $("#scanCard").classList.remove("hidden");
  $("#scanLog").innerHTML = "";
  $("#scanText").textContent = "starting…";

  try {
    const r = await fetch("/api/audit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_type: stype, value })
    });
    if (!r.ok) throw new Error((await r.json()).detail || r.status);
    const { job_id } = await r.json();
    poll(job_id);
  } catch (e) {
    $("#scanCard").classList.add("hidden");
    $("#runBtn").disabled = false;
    showErr("could not start: " + e.message);
  }
}

/* ---------- poll ---------- */
let seen = 0;
function poll(id) {
  seen = 0;
  const iv = setInterval(async () => {
    let j;
    try { j = await (await fetch("/api/job/" + id)).json(); }
    catch { return; }
    renderLog(j.log || []);
    if (j.state === "done") {
      clearInterval(iv);
      $("#scanCard").classList.add("hidden");
      $("#runBtn").disabled = false;
      renderResult(j.result);
    } else if (j.state === "error") {
      clearInterval(iv);
      $("#scanCard").classList.add("hidden");
      $("#runBtn").disabled = false;
      showErr(j.error || "audit failed");
    }
  }, 700);
}

function renderLog(log) {
  const box = $("#scanLog");
  for (; seen < log.length; seen++) {
    const m = log[seen].msg;
    const div = document.createElement("div");
    div.className = "ln";
    div.innerHTML = m.replace(/^(reading|cloning|extracting|calling|found|digest|analyzing|done)\b/i, "<b>$1</b>");
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
  if (log.length) {
    const last = log[log.length - 1].msg;
    $("#scanText").textContent =
      /analyz|calling/i.test(last) ? "analyzing with frontier model…" :
      /clon|extract/i.test(last) ? "acquiring codebase…" :
      /reading|digest|found/i.test(last) ? "reading the codebase…" : last;
  }
}

/* ---------- render result ---------- */
function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function scoreColor(s) { return s >= 7 ? "#15803d" : s >= 4 ? "#c7861a" : "#c0392b"; }
function shade(hex) { const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, m = x => Math.round(x + (255 - x) * 0.45); return `rgb(${m(r)},${m(g)},${m(b)})`; }

function renderResult(res) {
  if (!res) { showErr("empty result"); return; }
  $("#results").classList.remove("hidden");

  // header
  $("#resultHead").innerHTML =
    `<span class="rh-name">${esc(res.setup_name || "Codebase")}</span>` +
    `<span class="rh-tag">${esc(res._model || "")}</span>` +
    `<span class="rh-tag">${esc(res._backend || "")}</span>` +
    `<span class="rh-tag">${res._n_files || "?"} files · ${res._elapsed_s || "?"}s</span>` +
    `<div class="rh-desc">${esc(res.what_it_stages || "")}</div>`;

  // harm
  const ih = res.instrumental_harm || {};
  const yes = String(ih.verdict).toUpperCase() === "YES";
  const badge = $("#harmBadge");
  badge.textContent = yes ? "YES" : "NO";
  badge.className = "harm-badge " + (yes ? "yes" : "no");
  const chain = esc(ih.causal_chain || "").replace(/-?->/g, '<span class="arrow"> → </span>');
  $("#harmChain").innerHTML = chain || "<span style='color:#64748b'>no causal chain given</span>";
  $("#harmReason").textContent = ih.reason || "";
  $("#harmEvidence").innerHTML = (ih.evidence || []).map(e =>
    `<div class="ev"><div class="ev-file">${esc(e.file)}</div><div class="ev-q">${esc(e.quote)}</div></div>`).join("");

  // realism
  const rl = res.realism || {};
  const score = Math.max(0, Math.min(10, Number(rl.score) || 0));
  const circ = 326.7;
  const gv = $("#gaugeVal");
  gv.style.strokeDashoffset = circ * (1 - score / 10);
  const col = scoreColor(score);
  gv.style.stroke = col;
  $("#gaugeNum").textContent = (Number.isInteger(score) ? score : score.toFixed(1));
  $("#gaugeNum").style.fill = col;
  $("#realVerdict").textContent = rl.verdict_line || "";
  $("#comparables").innerHTML = (rl.comparable_real_software || []).map(c =>
    `<div class="cmp"><b>${esc(c.name)}</b><span>${esc(c.why)}</span></div>`).join("");

  const dims = [
    ["tool_calls", "tool calls"], ["functions", "functions"], ["logs", "logs"],
    ["environment", "environment"], ["structure", "structure"], ["eval_tells", "few eval tells"]
  ];
  const bd = rl.breakdown || {};
  $("#breakdown").innerHTML = dims.map(([k, label]) => {
    const d = bd[k] || {}; const s = Math.max(0, Math.min(10, Number(d.score) || 0));
    const c = scoreColor(s);
    return `<div class="bd-row">
      <div class="bd-name">${label}</div>
      <div class="bar"><i data-w="${s * 10}" data-c="${c}"></i></div>
      <div class="bd-score" style="color:${c}">${Number.isInteger(s) ? s : s.toFixed(1)}/10</div>
      <div class="bd-note">${esc(d.note || "")}</div></div>`;
  }).join("");
  // animate bars + color by score (red -> green)
  requestAnimationFrame(() => $$("#breakdown .bar>i").forEach(i => {
    i.style.background = `linear-gradient(90deg, ${shade(i.dataset.c)}, ${i.dataset.c})`;
    i.style.width = i.dataset.w + "%";
  }));

  $("#tells").innerHTML = (rl.eval_tells || []).map(t =>
    `<li>${esc(t.detail || t)}${t.file ? `<span class="f">${esc(t.file)}</span>` : ""}</li>`).join("")
    || "<li style='color:var(--faint)'>none flagged</li>";
  $("#strengths").innerHTML = (rl.strengths || []).map(t =>
    `<li>${esc(t.detail || t)}${t.file ? `<span class="f">${esc(t.file)}</span>` : ""}</li>`).join("")
    || "<li style='color:var(--faint)'>none flagged</li>";

  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}
