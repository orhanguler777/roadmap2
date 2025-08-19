// src/pages/api/sheets.js
export const runtime = "nodejs";

import { google } from "googleapis";
import fs from "fs";
import path from "path";

/**
 * ENV
 * ----
 * SHEET_ID=...
 * GOOGLE_SA_EMAIL=...
 * GOOGLE_SA_KEY=...(PEM, \n'ler korunur)
 *  - ya da GOOGLE_SA_KEY_FILE=path/to/key.pem
 * MODS_SHEET=modules (default)
 * META_SHEET=meta (default)
 */
const {
  SHEET_ID,
  GOOGLE_SA_EMAIL,
  GOOGLE_SA_KEY,
  GOOGLE_SA_KEY_FILE,
  MODS_SHEET = "modules",
  META_SHEET = "meta",
} = process.env;

function loadPrivateKey() {
  if (GOOGLE_SA_KEY_FILE) {
    const keyPath = path.resolve(process.cwd(), GOOGLE_SA_KEY_FILE);
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Key file not found at ${keyPath}`);
    }
    const pem = fs.readFileSync(keyPath, "utf8").trim();
    if (!pem.includes("BEGIN PRIVATE KEY")) {
      throw new Error("Key file exists but not a PEM private key.");
    }
    return pem;
  }
  if (GOOGLE_SA_KEY && GOOGLE_SA_KEY.trim()) {
    const k = GOOGLE_SA_KEY.replace(/\\n/g, "\n").trim();
    if (!k.includes("BEGIN PRIVATE KEY")) {
      throw new Error("GOOGLE_SA_KEY present but not a PEM string.");
    }
    return k;
  }
  throw new Error(
    "No key provided. Set GOOGLE_SA_KEY (PEM) or GOOGLE_SA_KEY_FILE (path)."
  );
}

async function sheetsClient() {
  if (!SHEET_ID) throw new Error("SHEET_ID missing");
  if (!GOOGLE_SA_EMAIL) throw new Error("GOOGLE_SA_EMAIL missing");

  const key = loadPrivateKey();
  const jwt = new google.auth.JWT({
    email: GOOGLE_SA_EMAIL,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await jwt.getAccessToken();
  return google.sheets({ version: "v4", auth: jwt });
}

/** A..Q sütunları:
 * A id
 * B name
 * C desc
 * D color
 * E baseDuration
 * F baseFe
 * G baseBe
 * H baseQa
 * I fe
 * J be
 * K qa
 * L deps_json
 * M enabled
 * N isMvp
 * O startWeek
 * P obMode
 * Q duration
 */
const RANGE_A1 = `${MODS_SHEET}!A1:Q`;
const RANGE_DATA_START = `${MODS_SHEET}!A2:Q`;

async function readModules(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE_A1,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = res.data.values || [];
  const data = rows.slice(1);
  return data
    .filter((r) => r && r[0] !== undefined && r[0] !== "")
    .map((r) => ({
      id: Number(r[0]),
      name: r[1] ?? "",
      desc: r[2] ?? "",
      color: r[3] ?? "#999999",
      baseDuration: Number(r[4] || 0),
      baseFe: Number(r[5] || 0),
      baseBe: Number(r[6] || 0),
      baseQa: Number(r[7] || 0),
      fe: Number(r[8] || 0),
      be: Number(r[9] || 0),
      qa: Number(r[10] || 0),
      deps_json: r[11] ?? "[]",
      enabled: r[12] === true || r[12] === "true" || r[12] === 1,
      isMvp: r[13] === true || r[13] === "true" || r[13] === 1,
      startWeek: Number(r[14] || 0),
      obMode: r[15] ?? "",
      duration: Number(r[16] || 0),
    }));
}

async function readMeta(sheets, key) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${META_SHEET}!A1:B`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = res.data.values || [];
  for (const r of rows.slice(1)) if (r[0] === key) return r[1] || "";
  return "";
}

async function writeMetaOrder(sheets, order) {
  const metaRange = `${META_SHEET}!A1:B`;
  const metaRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: metaRange,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const metaRows = metaRes.data.values || [["key", "value"]];
  let found = false;
  for (let i = 1; i < metaRows.length; i++) {
    if (metaRows[i][0] === "order") {
      metaRows[i][1] = (order || []).join(",");
      found = true;
      break;
    }
  }
  if (!found) metaRows.push(["order", (order || []).join(",")]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: metaRange,
    valueInputOption: "RAW",
    requestBody: { values: metaRows },
  });
}

/** Server-side yazma kuyruğu — aynı node süreçte çakışmayı önler */
let writeQueue = Promise.resolve();

async function writeAll(sheets, { modules, order }) {
  // Yazmaları sırala:
  writeQueue = writeQueue.then(async () => {
    // 1) mevcutları oku
    const existing = await readModules(sheets);
    const byId = new Map(existing.map((m) => [Number(m.id), m]));

    // 2) merge — kritik alanlar asla kaybolmasın
    const merged = (modules || []).map((m) => {
      const old = byId.get(Number(m.id)) || {};
      return {
        id: Number(m.id),
        name: m.name ?? old.name ?? "",
        desc: m.desc ?? old.desc ?? "",
        color: m.color ?? old.color ?? "#999999",

        baseDuration: Number(m.baseDuration ?? old.baseDuration ?? 0),
        baseFe: Number(m.baseFe ?? old.baseFe ?? 0),
        baseBe: Number(m.baseBe ?? old.baseBe ?? 0),
        baseQa: Number(m.baseQa ?? old.baseQa ?? 0),

        fe: Number(m.fe ?? old.fe ?? 0),
        be: Number(m.be ?? old.be ?? 0),
        qa: Number(m.qa ?? old.qa ?? 0),

        deps_json: JSON.stringify(
          Array.isArray(m.deps)
            ? m.deps
            : old.deps_json
            ? JSON.parse(old.deps_json)
            : []
        ),

        enabled: !!(m.enabled ?? old.enabled ?? false),
        isMvp: !!(m.isMvp ?? old.isMvp ?? false),

        startWeek: Number(m.startWeek ?? old.startWeek ?? 0),
        obMode: (m.obMode ?? old.obMode ?? "").toString(),
        duration: Number(m.duration ?? old.duration ?? 0),
      };
    });

    // 3) header + values hazırlığı
    const header = [
      [
        "id",
        "name",
        "desc",
        "color",
        "baseDuration",
        "baseFe",
        "baseBe",
        "baseQa",
        "fe",
        "be",
        "qa",
        "deps_json",
        "enabled",
        "isMvp",
        "startWeek",
        "obMode",
        "duration",
      ],
    ];
    const values = merged.map((m) => [
      m.id,
      m.name,
      m.desc,
      m.color,
      m.baseDuration,
      m.baseFe,
      m.baseBe,
      m.baseQa,
      m.fe,
      m.be,
      m.qa,
      m.deps_json,
      m.enabled,
      m.isMvp,
      m.startWeek,
      m.obMode,
      m.duration,
    ]);

    // 4) tek batch ile yaz (clear yok→sütunlar silinmez)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${MODS_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: header.concat(values) },
    });

    // (opsiyonel) tail temizliği: varsa aşağıdaki fazladan satırları boşalt
    const tailStartRow = values.length + 2; // header + 1
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${MODS_SHEET}!A${tailStartRow}:Z`,
    });

    // 5) meta.order yaz
    await writeMetaOrder(sheets, order || []);
  });

  // sıradaki yazma tamamlanana kadar beklet
  await writeQueue;
  return { ok: true };
}

// ------- PATCH tek kayıt (opsiyonel) -------
async function patchOne(sheets, id, patch = {}) {
  const modules = await readModules(sheets);
  const orderStr = await readMeta(sheets, "order");
  const order = (orderStr || "")
    .split(",")
    .map((n) => Number(n))
    .filter(Boolean);

  const idx = modules.findIndex((m) => m.id === Number(id));
  if (idx < 0) throw new Error("Module not found");
  const old = modules[idx];

  const next = {
    ...old,
    ...patch,
    // kritik alanlar
    startWeek: Number(patch.startWeek ?? old.startWeek ?? 0),
    obMode: (patch.obMode ?? old.obMode ?? "").toString(),
    duration: Number(patch.duration ?? old.duration ?? 0),
  };

  const mergedList = modules.map((m, i) => (i === idx ? next : m));
  await writeAll(sheets, { modules: mergedList, order });
  return next;
}

// ------- API handler -------
export default async function handler(req, res) {
  try {
    const sheets = await sheetsClient();

    if (req.method === "GET") {
      const [mods, orderStr] = await Promise.all([
        readModules(sheets),
        readMeta(sheets, "order"),
      ]);
      const order = (orderStr || "")
        .split(",")
        .map((n) => Number(n))
        .filter(Number.isFinite);
      return res.status(200).json({ modules: mods, order });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await writeAll(sheets, {
        modules: body.modules || [],
        order: body.order || [],
      });
      return res.status(200).json(result);
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const updated = await patchOne(sheets, body.id, body.patch || {});
      return res.status(200).json({ ok: true, module: updated });
    }

    res.setHeader("Allow", ["GET", "POST", "PATCH"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Sheets API error:", err);
    return res
      .status(500)
      .json({ error: "Sheets API error", details: String(err?.message || err) });
  }
}