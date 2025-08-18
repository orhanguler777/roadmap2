// src/pages/api/sheets.js
export const runtime = 'nodejs';

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const {
  GOOGLE_SA_EMAIL,
  GOOGLE_SA_KEY,
  GOOGLE_SA_KEY_FILE,
  SHEET_ID,
  MODS_SHEET = 'modules',
  META_SHEET = 'meta',
} = process.env;

/* ====================== AUTH ====================== */
function loadPrivateKey() {
  // 1) Dosyadan PEM
  if (GOOGLE_SA_KEY_FILE) {
    const keyPath = path.resolve(process.cwd(), GOOGLE_SA_KEY_FILE);
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Key file not found at ${keyPath}`);
    }
    const pem = fs.readFileSync(keyPath, 'utf8').trim();
    if (!pem.includes('BEGIN PRIVATE KEY')) {
      throw new Error('Key file exists but does not look like a PEM private key.');
    }
    return pem;
  }
  // 2) ENV’den PEM
  if (GOOGLE_SA_KEY && GOOGLE_SA_KEY.trim().length > 0) {
    const fromEnv = GOOGLE_SA_KEY.replace(/\\n/g, '\n').trim();
    if (!fromEnv.includes('BEGIN PRIVATE KEY')) {
      throw new Error('GOOGLE_SA_KEY present but not a PEM string.');
    }
    return fromEnv;
  }
  throw new Error('No key or keyFile set. Provide GOOGLE_SA_KEY_FILE or GOOGLE_SA_KEY.');
}

async function sheetsClient() {
  const key = loadPrivateKey();
  const jwt = new google.auth.JWT({
    email: GOOGLE_SA_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  await jwt.getAccessToken();
  return google.sheets({ version: 'v4', auth: jwt });
}

/* ====================== READERS ====================== */
// NOT: Artık Q sütununa kadar okuyoruz: startWeek (O), obMode (P), duration (Q)
async function readModules(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${MODS_SHEET}!A1:Q`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const data = rows.slice(1).filter(r => r[0] !== undefined && r[0] !== '');

  return data.map(r => {
    // indeksler:
    // 0:id 1:name 2:desc 3:color
    // 4:baseDuration 5:baseFe 6:baseBe 7:baseQa
    // 8:fe 9:be 10:qa
    // 11:deps_json 12:enabled 13:isMvp
    // 14:startWeek 15:obMode 16:duration
    let deps = [];
    try { deps = r[11] ? JSON.parse(r[11]) : []; } catch { deps = []; }
    const boolVal = v => (v === true || v === 'true' || v === 'TRUE' || v === 1);

    return {
      id: Number(r[0]),
      name: r[1],
      desc: r[2],
      color: r[3],
      baseDuration: Number(r[4] || 0),
      baseFe: Number(r[5] || 0),
      baseBe: Number(r[6] || 0),
      baseQa: Number(r[7] || 0),

      fe: Number(r[8] || 0),
      be: Number(r[9] || 0),
      qa: Number(r[10] || 0),

      deps,
      enabled: boolVal(r[12]),
      isMvp:  boolVal(r[13]),

      startWeek: Number(r[14] || 0),
      obMode: (r[15] ?? '') || '',        // 'onb' | 'half' | '' (string)
      duration: Number(r[16] || 0),       // computed ya da elle yazılmış olabilir
    };
  });
}

async function readMeta(sheets, key) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${META_SHEET}!A1:B`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  for (const r of rows.slice(1)) if (r[0] === key) return r[1] || '';
  return '';
}

/* ====================== WRITERS ====================== */
/**
 * Tüm veriyi tek seferde yazar; tabloyu asla silmez.
 * - Boş modules gelirse yazmayı reddeder (kazara silmeyi engeller)
 * - Başlıklar sabit (A1:Q1)
 * - order meta satırını upsert eder (meta sheet'teki diğer satırlara dokunmaz)
 */
async function writeAll(sheets, { modules, order }) {
  if (!Array.isArray(modules) || modules.length === 0) {
    // tabloyu kazara boşaltmamak için guard
    throw new Error('Refused to write: modules array is empty.');
  }

  // --- META: mevcut meta'yı al, 'order' satırını güncelle ---
  const metaRange = `${META_SHEET}!A1:B`;
  const metaRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: metaRange,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const metaRows = (metaRes.data.values && metaRes.data.values.length > 0)
    ? metaRes.data.values
    : [['key','value']];

  let found = false;
  for (let i = 1; i < metaRows.length; i++) {
    if (metaRows[i][0] === 'order') {
      metaRows[i][1] = (order || []).join(',');
      found = true;
      break;
    }
  }
  if (!found) metaRows.push(['order', (order || []).join(',')]);

  // --- MODULES: başlık + satırlar (A1:Qn) ---
  const header = [[
    'id','name','desc','color',
    'baseDuration','baseFe','baseBe','baseQa',
    'fe','be','qa',
    'deps_json','enabled','isMvp',
    'startWeek','obMode','duration'
  ]];

  const values = modules.map(m => ([
    Number(m.id),
    m.name ?? '',
    m.desc ?? '',
    m.color ?? '#999999',
    Number(m.baseDuration || 0),
    Number(m.baseFe || 0),
    Number(m.baseBe || 0),
    Number(m.baseQa || 0),

    Number(m.fe || 0),
    Number(m.be || 0),
    Number(m.qa || 0),

    JSON.stringify(m.deps || []),
    !!m.enabled,
    !!m.isMvp,

    Number(m.startWeek || 0),
    (m.obMode ?? '') + '',
    Number(m.duration || 0),
  ]));

  // Tek batchUpdate ile yaz
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: metaRange, values: metaRows },
        { range: `${MODS_SHEET}!A1:Q${values.length + 1}`, values: header.concat(values) },
      ],
    },
  });

  return { ok: true };
}

/**
 * (Opsiyonel) Tek alan güncelleme — PATCH
 * Body: { id: number, patch: { startWeek?: number, obMode?: string, duration?: number, ... } }
 * Not: Arkaya uyumlu; kullanmak zorunda değilsin.
 */
async function patchOne(sheets, id, patch) {
  const modules = await readModules(sheets);
  const orderStr = await readMeta(sheets, 'order');
  const order = (orderStr || '').split(',').map(n => Number(n)).filter(Boolean);

  const idx = modules.findIndex(m => m.id === Number(id));
  if (idx === -1) throw new Error('Module not found');

  modules[idx] = { ...modules[idx], ...patch };
  await writeAll(sheets, { modules, order });
  return modules[idx];
}

/* ====================== API HANDLER ====================== */
export default async function handler(req, res) {
  try {
    if (!SHEET_ID) throw new Error('SHEET_ID is missing');
    if (!GOOGLE_SA_EMAIL) throw new Error('GOOGLE_SA_EMAIL is missing');

    const sheets = await sheetsClient();

    if (req.method === 'GET') {
      const [modules, orderStr] = await Promise.all([
        readModules(sheets),
        readMeta(sheets, 'order')
      ]);
      const order = (orderStr || '')
        .split(',')
        .map(n => Number(n))
        .filter(Boolean);
      return res.status(200).json({ modules, order });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      try {
        const result = await writeAll(sheets, {
          modules: body.modules || [],
          order: body.order || []
        });
        return res.status(200).json(result);
      } catch (e) {
        // boş dizi guard'ından ya da başka mantık hatalarından
        return res.status(400).json({ error: String(e?.message || e) });
      }
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const updated = await patchOne(sheets, body.id, body.patch || {});
      return res.status(200).json({ ok: true, module: updated });
    }

    res.setHeader('Allow', ['GET','POST','PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Sheets API error:', err);
    return res.status(500).json({ error: 'Sheets API error', details: String(err?.message || err) });
  }
}