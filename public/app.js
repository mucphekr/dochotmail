const state = {
  config: null,
  rows: [],
  results: [],
  running: false,
  stopped: false,
  completed: 0
};

const $ = (selector) => document.querySelector(selector);

const els = {
  serverMeta: $("#serverMeta"),
  summaryBadge: $("#summaryBadge"),
  copyAllBtn: $("#copyAllBtn"),
  exportBtn: $("#exportBtn"),
  accountInput: $("#accountInput"),
  accountPreview: $("#accountPreview"),
  lineCount: $("#lineCount"),
  clearBtn: $("#clearBtn"),
  formatBtn: $("#formatBtn"),
  accessBox: $("#accessBox"),
  accessToken: $("#accessToken"),
  providerSelect: $("#providerSelect"),
  typeSelect: $("#typeSelect"),
  concurrencyInput: $("#concurrencyInput"),
  startBtn: $("#startBtn"),
  stopBtn: $("#stopBtn"),
  progressBar: $("#progressBar"),
  runStatus: $("#runStatus"),
  okCount: $("#okCount"),
  failCount: $("#failCount"),
  copyEmailBtn: $("#copyEmailBtn"),
  copyCodeBtn: $("#copyCodeBtn"),
  copyPairBtn: $("#copyPairBtn"),
  resultBody: $("#resultBody"),
  contentDialog: $("#contentDialog"),
  dialogContent: $("#dialogContent")
};

const EMAIL_PATTERN = "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)+";
const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const EMAIL_RE = new RegExp(EMAIL_PATTERN, "g");
const ACCOUNT_UUID_RE = new RegExp(`${EMAIL_PATTERN}\\|[\\s\\S]*?\\|${UUID_PATTERN}(?=[\\s,;]*${EMAIL_PATTERN}|[\\s,;]*$)`, "g");

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function normalizeAccountLine(value) {
  return String(value || "")
    .replace(/\r?\n/g, "")
    .replace(/\s*\|\s*/g, "|")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .trim();
}

function splitAccounts(text) {
  const raw = String(text || "");
  const uuidAccounts = [...raw.matchAll(ACCOUNT_UUID_RE)]
    .map((match) => normalizeAccountLine(match[0]))
    .filter(Boolean);

  if (uuidAccounts.length) {
    return uuidAccounts;
  }

  const matches = [...raw.matchAll(EMAIL_RE)];

  if (!matches.length) {
    return raw
      .split(/\r?\n/)
      .map(normalizeAccountLine)
      .filter(Boolean);
  }

  return matches
    .map((match, index) => {
      const start = match.index;
      const end = matches[index + 1]?.index ?? raw.length;
      return normalizeAccountLine(raw.slice(start, end));
    })
    .filter(Boolean);
}

function accountItems() {
  return splitAccounts(els.accountInput.value).map((line, index) => {
    const parts = line.split("|");
    const email = lineEmail(line);
    return {
      index,
      line,
      email,
      parts: parts.length,
      valid: Boolean(email) && parts.length >= 3
    };
  });
}

function lines() {
  return accountItems().map((item) => item.line);
}

function lineEmail(line) {
  return String(line || "").split("|")[0] || "";
}

function accessToken() {
  return els.accessToken.value.trim() || localStorage.getItem("hotmail_graph_access_token") || "";
}

function setStatus(message, tone = "muted") {
  els.runStatus.textContent = message;
  els.runStatus.dataset.tone = tone;
}

function updateLineCount() {
  const accounts = accountItems();
  const count = accounts.length;
  const max = state.config?.maxAccounts || 200;
  els.lineCount.textContent = `${count.toLocaleString()} / ${max.toLocaleString()} tài khoản`;
  renderAccountPreview(accounts);
}

function renderAccountPreview(accounts) {
  if (!accounts.length) {
    els.accountPreview.innerHTML = '<div class="account-preview-empty">Chưa có tài khoản</div>';
    return;
  }

  const limit = 50;
  const visible = accounts.slice(0, limit);
  const hidden = accounts.length - visible.length;
  const validCount = accounts.filter((item) => item.valid).length;

  els.accountPreview.innerHTML = `
    <div class="account-preview-head">
      <span>Đã tách ${accounts.length.toLocaleString()} tài khoản</span>
      <span>${validCount.toLocaleString()} hợp lệ</span>
    </div>
    <div class="account-preview-list">
      ${visible
        .map((item) => `
          <div class="account-chip ${item.valid ? "" : "invalid"}">
            <b>${item.index + 1}</b>
            <span title="${escapeHtml(item.email || item.line)}">${escapeHtml(item.email || "Không nhận diện email")}</span>
            <small>${item.parts} cột</small>
          </div>
        `)
        .join("")}
      ${hidden > 0 ? `<div class="account-more">Còn ${hidden.toLocaleString()} tài khoản khác</div>` : ""}
    </div>
  `;
}

function updateSummary() {
  const total = state.rows.length;
  const ok = state.results.filter((item) => item.status).length;
  const fail = state.results.filter((item) => item.done && !item.status).length;
  const percent = total ? Math.round((state.completed / total) * 100) : 0;

  els.summaryBadge.textContent = `${state.completed} / ${total}`;
  els.okCount.textContent = ok.toLocaleString();
  els.failCount.textContent = fail.toLocaleString();
  els.progressBar.style.width = `${percent}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function preview(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 92 ? `${text.slice(0, 92)}...` : text;
}

async function api(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };
  const token = accessToken();
  if (token) headers["x-access-token"] = token;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({ status: false, message: "Máy chủ trả về dữ liệu không hợp lệ." }));

  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }

  return data;
}

function renderEmpty() {
  els.resultBody.innerHTML = '<tr><td class="empty-state" colspan="7">Chưa có kết quả</td></tr>';
}

function createRows(inputLines) {
  state.rows = inputLines;
  state.results = inputLines.map((line, index) => ({
    index,
    line,
    email: lineEmail(line),
    status: false,
    done: false,
    code: "",
    from: "",
    subject: "",
    content: "",
    date: "",
    message: "Đang chờ"
  }));

  els.resultBody.innerHTML = state.results
    .map((item) => `
      <tr data-index="${item.index}">
        <td>${item.index + 1}</td>
        <td class="email-cell">
          <div class="cell-copy">
            <span title="${escapeHtml(item.email)}">${escapeHtml(item.email)}</span>
            <button class="tiny-copy" data-copy-email="${escapeHtml(item.email)}" type="button" title="Copy email này">Copy</button>
          </div>
        </td>
        <td class="from-cell">...</td>
        <td class="date-cell">...</td>
        <td class="content-cell">Đang chờ</td>
        <td class="code-cell"></td>
        <td class="status-cell"><span class="status wait">Chờ</span></td>
      </tr>
    `)
    .join("");
  updateSummary();
}

function updateRow(index, data) {
  const item = {
    ...state.results[index],
    ...data,
    done: true
  };
  state.results[index] = item;

  const row = els.resultBody.querySelector(`tr[data-index="${index}"]`);
  if (!row) return;

  const contentText = item.content || item.message || "";
  row.querySelector(".from-cell").textContent = item.from || "";
  row.querySelector(".date-cell").textContent = item.date || "";

  const contentCell = row.querySelector(".content-cell");
  contentCell.textContent = "";
  const previewSpan = document.createElement("span");
  previewSpan.className = "preview";
  previewSpan.textContent = preview(contentText);
  contentCell.appendChild(previewSpan);

  if (contentText) {
    const detailBtn = document.createElement("button");
    detailBtn.className = "link-button";
    detailBtn.type = "button";
    detailBtn.dataset.contentIndex = String(index);
    detailBtn.textContent = "Chi tiết";
    contentCell.appendChild(detailBtn);
  }

  const codeCell = row.querySelector(".code-cell");
  codeCell.textContent = "";
  if (item.code) {
    const wrap = document.createElement("div");
    wrap.className = "cell-copy otp-copy";

    const code = document.createElement("strong");
    code.className = "otp-value";
    code.title = item.code;
    code.textContent = item.code;
    wrap.appendChild(code);

    const copy = document.createElement("button");
    copy.className = "tiny-copy";
    copy.type = "button";
    copy.dataset.copyCode = item.code;
    copy.title = "Copy mã OTP này";
    copy.textContent = "Copy";
    wrap.appendChild(copy);
    codeCell.appendChild(wrap);
  }

  const status = row.querySelector(".status-cell");
  status.innerHTML = item.status
    ? '<span class="status ok">OK</span>'
    : `<span class="status fail">${escapeHtml(item.message || "Lỗi")}</span>`;
}

function normalizeCopyRows(kind) {
  const done = state.results.filter((item) => item.done);
  if (kind === "email") {
    return done.map((item) => item.email).filter(Boolean).join("\n");
  }
  if (kind === "code") {
    return done.map((item) => item.code).filter(Boolean).join("\n");
  }
  return done
    .filter((item) => item.email || item.code)
    .map((item) => `${item.email || ""}|${item.code || ""}`)
    .join("\n");
}

async function readOne(line, index) {
  return api("/api/code", {
    method: "POST",
    body: JSON.stringify({
      line,
      index: index + 1,
      provider: els.providerSelect.value,
      type: els.typeSelect.value
    })
  });
}

async function runPool(inputLines, concurrency) {
  let cursor = 0;

  async function worker() {
    while (!state.stopped) {
      const index = cursor;
      cursor += 1;
      if (index >= inputLines.length) return;

      const row = els.resultBody.querySelector(`tr[data-index="${index}"]`);
      if (row) {
        row.querySelector(".content-cell").textContent = "Đang xử lý";
        row.querySelector(".status-cell").innerHTML = '<span class="status wait">Đang đọc</span>';
      }

      try {
        const result = await readOne(inputLines[index], index);
        updateRow(index, result);
      } catch (error) {
        updateRow(index, {
          status: false,
          email: lineEmail(inputLines[index]),
          code: "",
          from: "",
          subject: "",
          content: error.message,
          date: "",
          message: error.message
        });
      } finally {
        state.completed += 1;
        updateSummary();
      }
    }
  }

  const workers = [];
  const size = Math.min(concurrency, inputLines.length);
  for (let i = 0; i < size; i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

async function start() {
  if (state.running) return;

  const inputLines = lines();
  if (!inputLines.length) {
    setStatus("Chưa có tài khoản", "error");
    return;
  }

  if (inputLines.length > (state.config?.maxAccounts || 200)) {
    setStatus(`Tối đa ${state.config.maxAccounts} tài khoản mỗi lần`, "error");
    return;
  }

  if (state.config?.hasAccessToken && !accessToken()) {
    setStatus("Thiếu mã truy cập", "error");
    return;
  }

  if (els.accessToken.value.trim()) {
    localStorage.setItem("hotmail_graph_access_token", els.accessToken.value.trim());
  }

  const concurrency = Math.max(1, Math.min(50, Number(els.concurrencyInput.value || 10)));
  state.running = true;
  state.stopped = false;
  state.completed = 0;
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  createRows(inputLines);
  setStatus("Đang đọc hòm thư...");

  try {
    await runPool(inputLines, concurrency);
    setStatus(state.stopped ? "Đã dừng" : "Hoàn tất", state.stopped ? "muted" : "ok");
  } finally {
    state.running = false;
    els.startBtn.disabled = false;
    els.stopBtn.disabled = true;
  }
}

function stop() {
  state.stopped = true;
  els.stopBtn.disabled = true;
  setStatus("Đang dừng...");
}

async function copyText(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function copyAll() {
  const text = normalizeCopyRows("pair");
  await copyText(text);
  setStatus(text ? "Đã sao chép Email|OTP" : "Chưa có dữ liệu để sao chép", text ? "ok" : "error");
}

async function copyQuick(kind) {
  const text = normalizeCopyRows(kind);
  await copyText(text);

  const labels = {
    email: "email",
    code: "mã OTP",
    pair: "Email|OTP"
  };
  setStatus(text ? `Đã sao chép ${labels[kind]}` : "Chưa có dữ liệu để sao chép", text ? "ok" : "error");
}

function formatAccounts() {
  const accountLines = lines();
  if (!accountLines.length) {
    setStatus("Chưa có tài khoản để chuẩn hóa", "error");
    return;
  }

  els.accountInput.value = accountLines.join("\n");
  updateLineCount();
  setStatus("Đã chuẩn hóa mỗi tài khoản một dòng", "ok");
}

function exportCsv() {
  const rows = [
    ["email", "provider", "type", "code", "from", "date", "status", "content"],
    ...state.results
      .filter((item) => item.done)
      .map((item) => [
        item.email,
        item.provider || els.providerSelect.value,
        els.typeSelect.value,
        item.code || "",
        item.from || "",
        item.date || "",
        item.status ? "OK" : item.message || "Lỗi",
        item.content || ""
      ])
  ];

  if (rows.length === 1) return;

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hotmail-graph-code-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function openDetail(index) {
  const item = state.results[Number(index)];
  if (!item) return;
  els.dialogContent.textContent = item.content || item.message || "";
  els.contentDialog.showModal();
}

async function loadConfig() {
  const config = await api("/api/config", { method: "GET" });
  state.config = config;
  const providerLabels = {
    direct: "Microsoft Graph",
    oauth2: "DongVan OAuth2",
    dongvan: "DongVan Graph API",
    dongvan_fallback: "DongVan Graph + fallback"
  };
  const provider = providerLabels[config.provider] || config.provider;
  els.serverMeta.textContent = `Tối đa ${config.maxAccounts} tài khoản mỗi lần - ${provider}`;
  if (config.provider && els.providerSelect.querySelector(`option[value="${config.provider}"]`)) {
    els.providerSelect.value = config.provider;
  }
  els.accessBox.classList.toggle("hidden", !config.hasAccessToken);
  updateLineCount();
}

function bindEvents() {
  els.accountInput.addEventListener("input", updateLineCount);
  els.formatBtn.addEventListener("click", formatAccounts);
  els.clearBtn.addEventListener("click", () => {
    els.accountInput.value = "";
    updateLineCount();
    renderEmpty();
  });
  els.startBtn.addEventListener("click", start);
  els.stopBtn.addEventListener("click", stop);
  els.copyAllBtn.addEventListener("click", copyAll);
  els.copyEmailBtn.addEventListener("click", () => copyQuick("email"));
  els.copyCodeBtn.addEventListener("click", () => copyQuick("code"));
  els.copyPairBtn.addEventListener("click", () => copyQuick("pair"));
  els.exportBtn.addEventListener("click", exportCsv);
  els.resultBody.addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy-code]");
    const copyEmail = event.target.closest("[data-copy-email]");
    const detail = event.target.closest("[data-content-index]");
    if (copy) {
      await copyText(copy.dataset.copyCode);
      setStatus("Đã sao chép mã", "ok");
    }
    if (copyEmail) {
      await copyText(copyEmail.dataset.copyEmail);
      setStatus("Đã sao chép email", "ok");
    }
    if (detail) {
      openDetail(detail.dataset.contentIndex);
    }
  });
}

async function init() {
  bindEvents();
  refreshIcons();
  if (localStorage.getItem("hotmail_graph_access_token")) {
    els.accessToken.value = localStorage.getItem("hotmail_graph_access_token");
  }
  els.providerSelect.value = "direct";
  els.typeSelect.value = "all";
  updateLineCount();

  try {
    await loadConfig();
  } catch (error) {
    els.serverMeta.textContent = "Không kết nối được máy chủ";
    setStatus(error.message, "error");
  }
}

init();
