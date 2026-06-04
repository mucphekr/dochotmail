require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const MAX_ACCOUNTS_PER_REQUEST = Number(process.env.MAX_ACCOUNTS_PER_REQUEST || 200);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 45000);

const CODE_PROVIDER = String(process.env.CODE_PROVIDER || "direct").toLowerCase();
const GRAPH_CODE_ENDPOINT = process.env.GRAPH_CODE_ENDPOINT || "https://tools.dongvanfb.net/api/graph_code";
const OAUTH2_CODE_ENDPOINT = process.env.OAUTH2_CODE_ENDPOINT || "https://tools.dongvanfb.net/api/get_code_oauth2";
const MICROSOFT_TOKEN_ENDPOINT = process.env.MICROSOFT_TOKEN_ENDPOINT || "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ENDPOINT = process.env.MICROSOFT_GRAPH_ENDPOINT || "https://graph.microsoft.com/v1.0";
const MICROSOFT_TOKEN_SCOPES = String(
  process.env.MICROSOFT_TOKEN_SCOPES || "https://graph.microsoft.com/Mail.Read offline_access|https://graph.microsoft.com/.default"
)
  .split("|")
  .map((scope) => scope.trim())
  .filter(Boolean);
const MAIL_TOP = Number(process.env.MAIL_TOP || 30);
const DISPLAY_TIME_ZONE = process.env.DISPLAY_TIME_ZONE || "Asia/Ho_Chi_Minh";

const TYPES = new Set([
  "all",
  "facebook",
  "instagram",
  "twitter",
  "apple",
  "tiktok",
  "amazon",
  "lazada",
  "kakaotalk",
  "google",
  "openai",
  "shopee",
  "telegram",
  "wechat"
]);

const CODE_PROVIDERS = new Set(["direct", "oauth2", "dongvan", "dongvan_fallback"]);

const SERVICE_KEYWORDS = {
  facebook: ["facebook", "meta", "fb"],
  instagram: ["instagram"],
  twitter: ["twitter", "x.com"],
  apple: ["apple"],
  tiktok: ["tiktok"],
  amazon: ["amazon"],
  lazada: ["lazada"],
  kakaotalk: ["kakaotalk", "kakao"],
  google: ["google", "gmail"],
  openai: ["openai", "chatgpt", "tm.openai.com"],
  shopee: ["shopee"],
  telegram: ["telegram"],
  wechat: ["wechat", "weixin"]
};

const EMAIL_PATTERN = "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)+";
const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const EMAIL_RE = new RegExp(EMAIL_PATTERN, "g");
const ACCOUNT_UUID_RE = new RegExp(`${EMAIL_PATTERN}\\|[\\s\\S]*?\\|${UUID_PATTERN}(?=[\\s,;]*${EMAIL_PATTERN}|[\\s,;]*$)`, "g");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAccess(req, res, next) {
  if (!ACCESS_TOKEN) {
    next();
    return;
  }

  const token = req.get("x-access-token") || req.body.accessToken || "";
  if (!safeEqual(token, ACCESS_TOKEN)) {
    res.status(401).json({ status: false, message: "Access token is missing or incorrect." });
    return;
  }

  next();
}

function normalizeType(value) {
  const type = String(value || "all").trim().toLowerCase();
  return TYPES.has(type) ? type : "all";
}

function normalizeProvider(value) {
  const provider = String(value || CODE_PROVIDER || "direct").trim().toLowerCase();
  return CODE_PROVIDERS.has(provider) ? provider : "direct";
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function parseLine(line, index = 0) {
  const raw = normalizeAccountLine(line);
  const parts = raw.split("|").map((part) => part.trim());
  const result = {
    index: index + 1,
    line: raw,
    email: parts[0] || "",
    password: "",
    refresh_token: "",
    client_id: "",
    valid: false,
    error: ""
  };

  if (!raw) {
    result.error = "Empty line.";
    return result;
  }

  if (parts.length >= 4) {
    result.password = parts[1] || "";
    result.refresh_token = parts.slice(2, -1).join("|").trim();
    result.client_id = parts[parts.length - 1] || "";
  } else if (parts.length === 3) {
    result.refresh_token = parts[1] || "";
    result.client_id = parts[2] || "";
  } else {
    result.error = "Expected email|password|refresh_token|client_id or email|refresh_token|client_id.";
    return result;
  }

  if (!isEmail(result.email)) {
    result.error = "Invalid email.";
    return result;
  }

  if (!result.refresh_token) {
    result.error = "Missing refresh_token.";
    return result;
  }

  if (!result.client_id) {
    result.error = "Missing client_id.";
    return result;
  }

  result.valid = true;
  return result;
}

function parseInput(input) {
  const raw = Array.isArray(input) ? input.join("\n") : String(input || "");
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

function normalizeAccountLine(value) {
  return String(value || "")
    .replace(/\r?\n/g, "")
    .replace(/\s*\|\s*/g, "|")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .trim();
}

function extractCodeFromText(value) {
  const text = String(value || "");
  const dashed = text.match(/\b[A-Z0-9]{3}\s*-\s*[A-Z0-9]{3}\b/i);
  if (dashed) {
    return dashed[0].replace(/\s*-\s*/g, "-").toUpperCase();
  }

  const preferred = text.match(/(?<!\d)\d{4,8}(?!\d)/);
  return preferred ? preferred[0] : "";
}

function isDashedCode(value) {
  return /^[A-Z0-9]{3}-[A-Z0-9]{3}$/i.test(String(value || "").trim());
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function formatGraphDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: DISPLAY_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return `${parts.hour}:${parts.minute} - ${parts.day}/${parts.month}/${parts.year}`;
}

function messageSearchText(message) {
  return [
    message.from,
    message.from_name,
    message.subject,
    message.preview,
    message.content
  ]
    .join(" ")
    .toLowerCase();
}

function matchesType(message, type) {
  if (type === "all") return true;
  const keywords = SERVICE_KEYWORDS[type] || [type];
  const text = messageSearchText(message);
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeMailMessage(message) {
  const bodyText = stripHtml(message.body?.content || "");
  const subject = String(message.subject || "").trim();
  const preview = String(message.bodyPreview || "").trim();
  const content = [subject, bodyText || preview].filter(Boolean).join("\n\n");
  const fromAddress = message.from?.emailAddress?.address || "";
  const fromName = message.from?.emailAddress?.name || "";
  const code = extractCodeFromText([subject, preview, bodyText].join("\n"));

  return {
    id: message.id || "",
    conversation_id: message.conversationId || "",
    from: fromAddress || fromName,
    from_name: fromName,
    subject,
    preview,
    content,
    date: formatGraphDate(message.receivedDateTime),
    receivedDateTime: message.receivedDateTime || "",
    code
  };
}

function normalizeDongVanResponse(account, type, httpStatus, body) {
  const ok = Boolean(body && body.status);
  const content = body?.content || body?.message || "";
  const extractedCode = extractCodeFromText(content);
  const responseCode = String(body?.code || "").trim();
  const code = isDashedCode(extractedCode) ? extractedCode : responseCode || extractedCode;

  return {
    status: ok,
    httpStatus,
    email: body?.email || account.email,
    type,
    code,
    from: body?.from || "",
    subject: body?.subject || "",
    content,
    date: body?.date || body?.time || "",
    raw: body || null,
    provider: "dongvan",
    message: ok ? "OK" : body?.message || content || "No code found."
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function exchangeRefreshToken(account) {
  let lastError = "Could not exchange refresh token.";

  for (const scope of MICROSOFT_TOKEN_SCOPES) {
    const body = new URLSearchParams({
      client_id: account.client_id,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
      scope
    });

    const response = await fetchWithTimeout(MICROSOFT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "HotmailGraphCodeRailway/1.0"
      },
      body
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.access_token) {
      return data.access_token;
    }

    lastError = data.error_description || data.error || `Token request failed (${response.status}).`;
  }

  throw new Error(lastError);
}

async function listRecentMessages(accessToken) {
  const url = new URL(`${MICROSOFT_GRAPH_ENDPOINT}/me/messages`);
  url.searchParams.set("$top", String(Math.max(1, Math.min(MAIL_TOP, 100))));
  url.searchParams.set("$select", "id,conversationId,subject,bodyPreview,receivedDateTime,from,body");
  url.searchParams.set("$orderby", "receivedDateTime desc");

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      prefer: 'outlook.body-content-type="text"',
      "user-agent": "HotmailGraphCodeRailway/1.0"
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || `Graph messages request failed (${response.status}).`);
  }

  return Array.isArray(data.value) ? data.value : [];
}

async function callDirectGraph(account, type) {
  const accessToken = await exchangeRefreshToken(account);
  const rawMessages = await listRecentMessages(accessToken);
  const messages = rawMessages.map(normalizeMailMessage);
  const found = messages.find((message) => message.code && matchesType(message, type));
  const first = found || messages[0] || {};

  if (!found) {
    return {
      status: false,
      httpStatus: 200,
      email: account.email,
      type,
      code: "",
      from: first.from || "",
      subject: first.subject || "",
      content: `No code found in latest ${messages.length} messages.`,
      date: first.date || "",
      conversation_id: first.conversation_id || "",
      messages: messages.slice(0, 10),
      provider: "microsoft_graph",
      message: "No code found."
    };
  }

  return {
    status: true,
    httpStatus: 200,
    email: account.email,
    type,
    code: found.code,
    from: found.from,
    subject: found.subject,
    content: found.content || found.preview,
    date: found.date,
    conversation_id: found.conversation_id,
    messages: messages.slice(0, 10),
    provider: "microsoft_graph",
    message: "OK"
  };
}

async function callDongVanEndpoint(account, type, endpoint, providerName) {
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "HotmailGraphCodeRailway/1.0"
    },
    body: JSON.stringify({
      email: account.email,
      refresh_token: account.refresh_token,
      client_id: account.client_id,
      type
    })
  });
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch (error) {
    body = {
      status: false,
      message: `API returned non-JSON response (${response.status}).`,
      content: text.slice(0, 1000)
    };
  }

  const result = normalizeDongVanResponse(account, type, response.status, body);
  return {
    ...result,
    provider: providerName
  };
}

async function callDongVanGraph(account, type) {
  return callDongVanEndpoint(account, type, GRAPH_CODE_ENDPOINT, "dongvan_graph");
}

async function callDongVanOAuth2(account, type) {
  return callDongVanEndpoint(account, type, OAUTH2_CODE_ENDPOINT, "dongvan_oauth2");
}

async function callCodeProvider(account, type, provider = CODE_PROVIDER) {
  const selectedProvider = normalizeProvider(provider);

  if (selectedProvider === "oauth2") {
    return callDongVanOAuth2(account, type);
  }

  if (selectedProvider === "dongvan") {
    return callDongVanGraph(account, type);
  }

  if (selectedProvider === "dongvan_fallback") {
    const result = await callDongVanGraph(account, type);
    return result.status ? result : callDirectGraph(account, type);
  }

  return callDirectGraph(account, type);
}

app.get("/api/config", (req, res) => {
  const provider = normalizeProvider(CODE_PROVIDER);
  res.json({
    status: true,
    provider,
    providers: [
      { value: "direct", label: "Microsoft Graph" },
      { value: "oauth2", label: "DongVan OAuth2" },
      { value: "dongvan", label: "DongVan Graph API" },
      { value: "dongvan_fallback", label: "DongVan Graph + fallback" }
    ],
    endpoints: {
      direct: MICROSOFT_GRAPH_ENDPOINT,
      oauth2: OAUTH2_CODE_ENDPOINT,
      dongvan: GRAPH_CODE_ENDPOINT
    },
    mailTop: MAIL_TOP,
    hasAccessToken: Boolean(ACCESS_TOKEN),
    maxAccounts: MAX_ACCOUNTS_PER_REQUEST,
    types: Array.from(TYPES)
  });
});

app.post("/api/parse", (req, res) => {
  const lines = parseInput(req.body.lines || req.body.input || req.body.line || "");
  const accounts = lines.map(parseLine);
  res.json({
    status: true,
    accounts,
    counts: {
      total: accounts.length,
      valid: accounts.filter((account) => account.valid).length,
      invalid: accounts.filter((account) => !account.valid).length
    }
  });
});

app.post("/api/code", requireAccess, async (req, res) => {
  const type = normalizeType(req.body.type);
  const provider = normalizeProvider(req.body.provider);
  const account = parseLine(req.body.line || "", Number(req.body.index || 1) - 1);

  if (!account.valid) {
    res.status(400).json({
      status: false,
      email: account.email,
      type,
      provider,
      code: "",
      from: "",
      subject: "",
      content: account.error,
      date: "",
      message: account.error
    });
    return;
  }

  try {
    const result = await callCodeProvider(account, type, provider);
    const statusCode = result.status ? 200 : result.httpStatus >= 400 ? result.httpStatus : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Graph code request timed out."
      : `Graph code request failed: ${error.message}`;
    res.status(502).json({
      status: false,
      email: account.email,
      type,
      provider,
      code: "",
      from: "",
      subject: "",
      content: message,
      date: "",
      message
    });
  }
});

app.post("/api/batch", requireAccess, async (req, res) => {
  const type = normalizeType(req.body.type);
  const provider = normalizeProvider(req.body.provider);
  const lines = parseInput(req.body.lines || req.body.input || "");

  if (!lines.length) {
    res.status(400).json({ status: false, message: "No account lines found.", results: [] });
    return;
  }

  if (lines.length > MAX_ACCOUNTS_PER_REQUEST) {
    res.status(400).json({
      status: false,
      message: `Too many accounts. Maximum is ${MAX_ACCOUNTS_PER_REQUEST} per request.`,
      results: []
    });
    return;
  }

  const results = [];
  for (const [index, line] of lines.entries()) {
    const account = parseLine(line, index);
    if (!account.valid) {
      results.push({
        status: false,
        email: account.email,
        type,
        provider,
        code: "",
        from: "",
        subject: "",
        content: account.error,
        date: "",
        message: account.error
      });
      continue;
    }

    try {
      results.push(await callCodeProvider(account, type, provider));
    } catch (error) {
      const message = error.name === "AbortError"
        ? "Graph code request timed out."
        : `Graph code request failed: ${error.message}`;
      results.push({
        status: false,
        email: account.email,
        type,
        provider,
        code: "",
        from: "",
        subject: "",
        content: message,
        date: "",
        message
      });
    }
  }

  res.json({
    status: true,
    type,
    provider,
    results,
    counts: {
      total: results.length,
      ok: results.filter((item) => item.status).length,
      fail: results.filter((item) => !item.status).length
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ status: false, message: "Not found." });
});

app.listen(PORT, () => {
  console.log(`Hotmail Graph Code app listening on port ${PORT}`);
});
