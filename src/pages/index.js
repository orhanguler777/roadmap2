// src/pages/index.js
import React, { useMemo, useRef, useState, useEffect } from "react";

/** PERFECT + Login (admin/viewer)
 * - Şifreler: admin123 (tam yetki), user123 (view-only)
 * - Rol localStorage’ta saklanır
 * - İlk açılışta: role yoksa otomatik **viewer** başlar (view-only)
 * - Admin: tüm aksiyonlar açık, Sheets POST autosave aktif
 * - Viewer: tüm UI girişleri kilitli, POST autosave kapalı
 */

// ====== Layout ======
const DEFAULT_COL_W = 40;
const ROW_H = 80;
const BAR_H = 80;
const HDR_H = 48;

// ====== Utils ======
function textColorFor(bg){
  try{
    const hex = bg?.replace('#','');
    if (!hex || (hex.length!==6 && hex.length!==3)) return '#fff';
    const h = hex.length===3 ? hex.split('').map(ch=>ch+ch).join('') : hex;
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    const yiq = (r*299 + g*587 + b*114)/1000;
    return yiq >= 160 ? '#111827' : '#fff';
  }catch{ return '#fff'; }
}
function formatRes(m){
  return [ m.fe>0 ? `${m.fe} FE` : null,
           m.be>0 ? `${m.be} BE` : null,
           m.qa>0 ? `${m.qa} QA` : null ]
         .filter(Boolean).join(' • ');
}
function randomHex(){ return "#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0"); }
function safeColor(c, fb){ if (typeof c!=="string") return fb; const ok=/^#([0-9A-F]{3}){1,2}$/i.test(c.trim()); return ok?c.trim():fb; }

// normalize: Google Sheets -> state (deps -> Number!)
function normalizeModules(apiModules = []) {
  return apiModules.map((m, i) => {
    let deps = [];
    if (typeof m.deps_json === "string") {
      try { deps = JSON.parse(m.deps_json) || []; } catch { deps = []; }
    } else if (Array.isArray(m.deps_json)) {
      deps = m.deps_json;
    }
    deps = (Array.isArray(deps) ? deps : []).map(x => Number(x)).filter(Number.isFinite);

    return {
      id: Number(m.id ?? i + 1),
      name: String(m.name ?? "UNTITLED").toUpperCase(),
      desc: m.desc ?? "",
      color: safeColor(m.color, randomHex()),

      baseDuration: Number(m.baseDuration ?? m.duration ?? 1),
      baseFe: Number(m.baseFe ?? m.fe ?? 0),
      baseBe: Number(m.baseBe ?? m.be ?? 0),
      baseQa: Number(m.baseQa ?? m.qa ?? 0),

      fe: Number(m.fe ?? m.baseFe ?? 0),
      be: Number(m.be ?? m.baseBe ?? 0),
      qa: Number(m.qa ?? m.baseQa ?? 0),

      deps,
      enabled: !!m.enabled,
      isMvp: !!m.isMvp,
      obMode: (typeof m.obMode === 'string' ? m.obMode : (m.obMode ? String(m.obMode) : null)),
      startWeek: Number.isFinite(Number(m.startWeek)) ? Number(m.startWeek) : 0,
      // İstersen mevcut duration kolonunu da oku (gerekli değil ama silinmesin diye tutabiliriz)
      duration: Number.isFinite(Number(m.duration)) ? Number(m.duration) : undefined,
    };
  });
}

// eski scale (ekip dağılımına göre)
function scaleDuration({ baseDuration, baseFe, baseBe, baseQa, fe, be, qa }) {
  const baseDur = Math.max(1, Number(baseDuration ?? 1) || 1);
  const baseTot = Math.max(1, (Number(baseFe)||0) + (Number(baseBe)||0) + (Number(baseQa)||0));
  const curTot  = Math.max(1, (Number(fe)||0) + (Number(be)||0) + (Number(qa)||0));
  const adjusted = Math.round(baseDur * (baseTot / curTot));
  return Math.max(1, adjusted);
}
// yeni kural: OB popup seçimine göre override; aksi halde eski scale
function computeDuration(m){
  const base = Math.max(1, Number(m.baseDuration)||1);
  if (m.obMode === 'onb')  return Math.ceil(base/2) + 6;
  if (m.obMode === 'half') return Math.max(1, Math.ceil(base/2));
  return scaleDuration({
    baseDuration: m.baseDuration, baseFe: m.baseFe, baseBe: m.baseBe, baseQa: m.baseQa,
    fe: m.fe, be: m.be, qa: m.qa,
  });
}

// ====== Loading ======
function Loading() {
  return (
    <div style={{display:"grid", placeItems:"center", minHeight:"60vh", fontFamily:"Inter, system-ui, Arial"}}>
      <div style={{display:"flex", alignItems:"center", gap:12}}>
        <div style={{
          width:18, height:18, border:"3px solid #e5e7eb",
          borderTopColor:"#111827", borderRadius:"50%",
          animation:"spin 0.8s linear infinite"
        }}/>
        <span style={{fontWeight:700}}>Loading…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ======================= LOGIN WRAPPER ======================= */
export default function Home(){
  const [role, setRole] = useState(null); // 'admin' | 'viewer' | null (null => login form)
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  // İlk açılışta localStorage'da rol yoksa viewer olarak başla
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("role") : null;
    if (saved === "admin" || saved === "viewer") {
      setRole(saved);
    } else {
      setRole("viewer"); // viewer gibi login
      localStorage.setItem("role","viewer");
    }
  }, []);

  function handleLogin(e){
    e?.preventDefault?.();
    setErr("");
    if (pw === "admin123") { setRole("admin"); localStorage.setItem("role","admin"); setPw(""); return; }
    if (pw === "user123")  { setRole("viewer"); localStorage.setItem("role","viewer"); setPw(""); return; }
    setErr("Wrong password");
  }
  function handleLogout(){
    localStorage.removeItem("role");
    setRole("viewer"); // logout olduğunda viewer'a düş
    localStorage.setItem("role","viewer");
    setPw("");
  }

  if (role === null){
    return (
      <div style={{minHeight:'100vh', display:'grid', placeItems:'center', fontFamily:'Inter, system-ui, Arial', background:'#f9fafb'}}>
        <form onSubmit={handleLogin} style={{width:280, background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:16, boxShadow:'0 10px 24px rgba(0,0,0,0.05)'}}>
          <h1 style={{fontSize:18, fontWeight:800, marginBottom:10}}>Sign in</h1>
          <input
            type="password"
            value={pw}
            onChange={e=>setPw(e.target.value)}
            placeholder="Password"
            style={{width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, marginBottom:10, boxSizing:'border-box'}}
          />
          {err && <div style={{fontSize:12, color:'#b91c1c', marginBottom:10}}>{err}</div>}
          <button type="submit" style={{width:'100%', padding:'9px 10px', borderRadius:8, border:'1px solid #111827', background:'#111827', color:'#fff', fontWeight:800, cursor:'pointer'}}>Login</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{fontFamily:'Inter, system-ui, Arial'}}>
      <TopBar role={role} onLogout={handleLogout} onLogin={()=>setRole(null)} />
      <DevGantt editable={role === "admin"} />
    </div>
  );
}

function TopBar({ role, onLogout, onLogin }){
  return (
    <div style={{display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:'1px solid #e5e7eb', background:'#fff'}}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: 900 }}>
        <img src="/logo.png" alt="Pixup Logo" style={{ height: 80, width: 80, objectFit: "contain" }} />
        Roadmap
      </div>
      <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:8}}>
        <span style={{
          fontSize:12, fontWeight:800, padding:'2px 8px', borderRadius:999,
          background: role==='admin' ? '#d1fae5' : '#e5e7eb', color:'#111827'
        }}>
          {role.toUpperCase()}
        </span>
        {role==='viewer' && <span style={{fontSize:12, color:'#6b7280'}}>View-only</span>}
        {role==='viewer'
          ? <button onClick={onLogin} style={{padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', cursor:'pointer'}}>Login</button>
          : <button onClick={onLogout} style={{padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', cursor:'pointer'}}>Logout</button>}
      </div>
    </div>
  );
}

/* ======================= APP ======================= */
function DevGantt({ editable = true }){
  // state
  const [modules, setModules] = useState(null); // null -> loading
  const [order, setOrder] = useState([]);
  const [tab, setTab] = useState('timeline');
  const [offsets, setOffsets] = useState({});
  const [swapId, setSwapId] = useState(null);
  const [colW, setColW] = useState(DEFAULT_COL_W);
  const [err, setErr] = useState("");

  // anti-double-add
  const [adding, setAdding] = useState(false);
  const addLockRef = useRef(false);
  const nextIdRef = useRef(1); // mount’ta gerçek maxId ile güncellenecek

  // Sheets load
  async function loadFromSheets() {
    setErr("");
    try {
      const res = await fetch("/api/sheets", { cache: "no-store" });
      if (!res.ok) throw new Error(`Sheets GET failed (${res.status})`);
      const data = await res.json();
      const norm = normalizeModules(data.modules || []);
      setModules(norm);
      const initialOrder = data.order?.length ? data.order : norm.map(m => m.id);
      setOrder(initialOrder);
      const maxId = norm.reduce((mx, m) => Math.max(mx, Number(m.id)||0), 0);
      nextIdRef.current = Math.max(1, maxId + 1);
    } catch (e) {
      setErr(String(e?.message || e));
      setModules([]);
      setOrder([]);
      nextIdRef.current = 1;
    }
  }
  useEffect(() => { loadFromSheets(); }, []);

  // autosave (viewer için POST kapalı)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (modules === null) return;
    if (!editable) return; // viewer → sheets’e yazma
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules, order }),
      }).catch(()=>{});
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [modules, order, editable]);

  // derived
  const modulesById = useMemo(() => new Map((modules || []).map(m => [m.id, m])), [modules]);
  const ordered = useMemo(() => (order || []).map(id => modulesById.get(id)).filter(Boolean), [order, modulesById]);
  const enabledOrdered = useMemo(() => ordered.filter(m => m.enabled), [ordered]);

  // adjacency for grouping (deps undirected for components)
  const adjacency = useMemo(() => {
    const adj = new Map((modules||[]).map(m => [m.id, new Set()]));
    (modules||[]).forEach(m => {
      (m.deps||[]).forEach(d => { if (adj.has(m.id) && adj.has(d)) { adj.get(m.id).add(d); adj.get(d).add(m.id); } });
    });
    return adj;
  }, [modules]);

  function getConnectedIds(startId){
    const seen = new Set(); const stack = [startId];
    while(stack.length){
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      (adjacency.get(id)||new Set()).forEach(n => { if (!seen.has(n)) stack.push(n); });
    }
    return Array.from(seen);
  }
  function buildComponents(orderArr){
    const visited = new Set(), comps = [];
    orderArr.forEach(id => {
      if (visited.has(id)) return;
      const comp = getConnectedIds(id);
      comp.forEach(x => visited.add(x));
      comps.push(orderArr.filter(x => comp.includes(x)));
    });
    return comps;
  }
  function componentOfId(orderArr, id){
    const comps = buildComponents(orderArr);
    for (const c of comps) if (c.includes(id)) return c;
    return [id];
  }
  function moveBlock(orderArr, blockIds, toIndex){
    const rest = orderArr.filter(x => !blockIds.includes(x));
    const idx = Math.max(0, Math.min(toIndex, rest.length));
    return [...rest.slice(0, idx), ...blockIds, ...rest.slice(idx)];
  }

  // ----- startWeek -> offsets türet -----
  function deriveOffsetsFromStartWeeks(mods, ord){
    const byId = new Map((mods||[]).map(m => [m.id, m]));
    const enabled = (ord||[]).map(id => byId.get(id)).filter(m => m && m.enabled);

    let offsets = {};
    let baseStarts = [];
    let durations = [];

    // 1) contiguous başlangıçlar (offset=0 kabul ederek)
    let cur = 0;
    enabled.forEach(m => {
      const d = computeDuration(m);
      durations.push(d);
      baseStarts.push(cur);
      cur += d;
    });

    // 2) hedef start: varsa startWeek, yoksa contiguous
    const targetStarts = enabled.map((m, i) => (
      Number.isFinite(Number(m.startWeek)) ? Number(m.startWeek) : baseStarts[i]
    ));

    // 3) kümülatif offset çöz
    let cum = 0;
    enabled.forEach((m, i) => {
      const need = targetStarts[i] - (baseStarts[i] + cum);
      if (need !== 0) {
        offsets[m.id] = (offsets[m.id]||0) + need;
        cum += need;
      }
    });
    return offsets;
  }

  // İlk yüklemede startWeek'leri ekrana uygula (offsets kur)
  useEffect(() => {
    if (!modules || !order) return;
    if (Object.keys(offsets||{}).length) return; // yalnızca ilk kurulumda
    const init = deriveOffsetsFromStartWeeks(modules, order);
    if (Object.keys(init).length) setOffsets(init);
  }, [modules, order]); // eslint-disable-line

  // positions (contiguous + incremental offsets)
  const positioned = useMemo(() => {
    let start = 0, cumulativeShift = 0;
    return enabledOrdered.map(m => {
      const duration = computeDuration(m);
      const ownShift = Number(offsets[m.id] || 0);
      cumulativeShift += ownShift;
      const p = { ...m, start: start + cumulativeShift, duration };
      start += duration;
      return p;
    });
  }, [enabledOrdered, offsets]);

  const totalWeeks = useMemo(() => {
    if (!positioned.length) return 1;
    const maxEnd = positioned.reduce((mx, m) => Math.max(mx, m.start + m.duration), 0);
    return Math.max(1, Math.ceil(maxEnd));
  }, [positioned]);

  const weekLabels = useMemo(
    () => Array.from({ length: totalWeeks + 1 }, (_, i) => (i === 0 ? '' : `${i}W`)),
    [totalWeeks]
  );

  // actions
  function updateModule(id, patch){
    if (!editable) return;
    setModules(prev => (prev||[]).map(m => m.id === id ? { ...m, ...patch } : m));
  }

  // MVP disable koruması
  const mvpDisableWarnedRef = useRef(false);
  function toggleEnabled(id){
    if (!editable) return;
    const m = modulesById.get(id);
    if (!m) return;
    if (m.isMvp && m.enabled) {
      if (!mvpDisableWarnedRef.current) {
        mvpDisableWarnedRef.current = true;
        setTimeout(() => { mvpDisableWarnedRef.current = false; }, 0);
        alert("These are Minimum Required Modules");
      }
      return;
    }
    updateModule(id, { enabled: !m.enabled });
  }

  function toggleMvpFlag(id){
    if (!editable) return;
    const m = modulesById.get(id);
    if (!m) return;
    if (!m.isMvp) updateModule(id, { isMvp: true, enabled: true });
    else updateModule(id, { isMvp: false });
  }

  // FE/BE/QA change → OB popup if increased
  function onResChange(id, role, nextValRaw){
    if (!editable) return;
    const nextVal = Math.max(0, Number(nextValRaw)||0);
    const m = modulesById.get(id); if (!m) return;
    const patch = { [role]: nextVal };
    if (nextVal > (m[role] ?? 0)) {
      const yes = window.confirm(
        "Wiil onboarding Applied?\n\nOK = Yes (time: ceil(base/2)+6)\nCancel = No (time: ceil(base/2))"
      );
      patch.obMode = yes ? 'onb' : 'half';
    }
    const newVals = {
      fe: role==='fe' ? nextVal : m.fe,
      be: role==='be' ? nextVal : m.be,
      qa: role==='qa' ? nextVal : m.qa,
    };
    if (newVals.fe<=m.baseFe && newVals.be<=m.baseBe && newVals.qa<=m.baseQa) {
      patch.obMode = null;
    }
    updateModule(id, patch);
  }

  // Add Module — üç kat güvenlik
  function addModule(e){
    if (!editable) return;
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    if (adding) return;
    if (addLockRef.current) return;

    setAdding(true);
    addLockRef.current = true;

    const newId = nextIdRef.current++;

    setModules(prev => {
      const list = prev || [];
      if (list.some(x => Number(x.id) === newId)) {
        nextIdRef.current = newId + 2;
        return list;
      }
      const newM = {
        id: newId,
        name: 'NEW MODULE',
        desc: 'Describe this module...',
        color: randomHex(),
        baseDuration: 2,
        baseFe: 1, baseBe: 1, baseQa: 1,
        fe: 1, be: 1, qa: 1,
        deps: [],
        enabled: true,
        isMvp: false,
        obMode: null,
      };
      return [...list, newM];
    });

    setOrder(o => {
      const cur = o || [];
      if (cur.includes(newId)) return cur;
      return [...cur, newId];
    });

    setTimeout(() => {
      addLockRef.current = false;
      setAdding(false);
    }, 250);
  }

  function deleteModule(id){
    if (!editable) return;
    const m = modulesById.get(id); if (!m) return;
    if (!window.confirm(`Delete module "${m.name}"?`)) return;
    setModules(prev => (prev||[]).filter(x => x.id !== id));
    setOrder(prev => (prev||[]).filter(x => x !== id));
    setOffsets(prev => { const { [id]: _, ...rest } = prev; return rest; });
    setSwapId(s => (s === id ? null : s));
  }

  function removeFromMvp(id){
    if (!editable) return;
    updateModule(id, { isMvp: false });
  }

  // drag reorder (sidebar)
  const dragIdRef = useRef(null);
  function onDragStart(id){ if (!editable) return; dragIdRef.current = id; }
  function onDragOver(e){ if (!editable) return; e.preventDefault(); }
  function onDrop(overId){
    if (!editable) return;
    const draggedId = dragIdRef.current; dragIdRef.current = null;
    if (!draggedId || draggedId === overId) return;
    setOrder(prev => {
      const p = prev || [];
      const draggedBlock = componentOfId(p, draggedId);
      const overBlock    = componentOfId(p, overId);
      const rest = p.filter(x => !draggedBlock.includes(x));
      const insertIdx = rest.indexOf(overBlock[0]);
      return moveBlock(rest, draggedBlock, insertIdx < 0 ? rest.length : insertIdx);
    });
  }

  // swap as blocks: select 2 bars
  function handleSwapClick(targetId){
    if (!editable) return;
    if (!swapId) { setSwapId(targetId); return; }
    if (swapId === targetId) { setSwapId(null); return; }
    setOrder(prev => {
      const blocks = []; const seen = new Set();
      for (let i = 0; i < prev.length; i++){
        const id = prev[i]; if (seen.has(id)) continue;
        const comp = componentOfId(prev, id);
        comp.forEach(x => seen.add(x));
        blocks.push(comp);
      }
      const ia = blocks.findIndex(b => b.includes(swapId));
      const ib = blocks.findIndex(b => b.includes(targetId));
      if (ia < 0 || ib < 0 || ia === ib) return prev;
      const next = [...blocks];
      [next[ia], next[ib]] = [next[ib], next[ia]];
      return next.flat();
    });
    setSwapId(null);
  }

  // ========== ÖNEMLİ: Kartı itince yalnızca o karta offset veriyoruz ==========
  // Böylece positioned()'daki cumulativeShift, bu karttan SONRAKİ tüm modülleri
  // otomatik aynı miktarda taşır → boşluk kalmaz.
  function nudgeGroupFrom(id, dw){
    if (!editable) return;
    if (!dw) return;
    setOffsets(prev => ({ ...(prev||{}), [id]: (prev?.[id]||0) + dw }));
  }

  useEffect(() => {
    function onKey(e){
      if (!editable) return;
      if (!swapId) return;
      if (e.key === 'ArrowLeft'){ e.preventDefault(); nudgeGroupFrom(swapId, -1); }
      if (e.key === 'ArrowRight'){ e.preventDefault(); nudgeGroupFrom(swapId, +1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swapId, adjacency, editable]);

  // zoom & fit
  function zoom(delta){ setColW(w => Math.max(24, Math.min(120, Math.round((w+delta)/2)*2))); }
  function fitToScreen(){
    if (!positioned.length) return;
    const container = document.querySelector('.timeline-container'); if (!container) return;
    const availableWidth = container.clientWidth;
    const weeks = totalWeeks || 1;
    const newColW = Math.max(24, Math.floor(availableWidth / weeks));
    setColW(newColW);
  }

// ---- SAVE ORDER: positioned.start -> startWeek, tek POST ile kalıcı ----
function saveAllStartWeeks(){
  const startMap = new Map((positioned || []).map(
    p => [p.id, Math.max(0, Math.round(p.start))]
  ));

  const updatedModules = (modules || []).map(m => {
    const sw = startMap.has(m.id) ? startMap.get(m.id) : m.startWeek;
    return {
      ...m,
        startWeek: Number.isFinite(Number(sw)) ? Number(sw) : 0,
    obMode: m.obMode ? String(m.obMode) : "",
    duration: Number(computeDuration(m)),
    };
  });

  setModules(updatedModules);

  fetch("/api/sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order,
    modules: updatedModules.map(m => ({

        id: m.id,
        name: m.name,
        startWeek: Number(m.startWeek),
      obMode: m.obMode,           // "" | "onb" | "half"
      duration: Number(m.duration)
    })),
    forceColumns: ["startWeek","obMode","duration"]
  }),
}).catch(()=>{});
}

  // check-all (Timeline & Modules)
  const allEnabledTimeline = (modules||[]).every(m => m.isMvp || m.enabled);
  function toggleAllEnabledTimeline(){
    if (!editable) return;
    const target = !allEnabledTimeline;
    setModules(prev => (prev||[]).map(m => {
      if (m.isMvp) return { ...m, enabled: true };
      return { ...m, enabled: target };
    }));
  }
  const allEnabledModules = (modules||[]).every(m => m.enabled || m.isMvp);
  function toggleAllEnabledModules(){
    if (!editable) return;
    const target = !allEnabledModules;
    setModules(prev => (prev||[]).map(m => {
      if (m.isMvp) return { ...m, enabled: true };
      return { ...m, enabled: target };
    }));
  }

  if (modules === null) return <Loading />;
  if (err) {
    return (
      <div style={{padding:16}}>
        <div style={{background:"#FEF2F2", color:"#991B1B", border:"1px solid #FEE2E2", borderRadius:8, padding:12, marginBottom:12, fontWeight:600}}>
          Sheets error: {err}
        </div>
        <button onClick={loadFromSheets}
                style={{padding:"8px 12px", border:"1px solid #e5e7eb", borderRadius:8, cursor:"pointer"}}>
          Retry
        </button>
      </div>
    );
  }

  // tabs
  return (
    <div style={{ background: '#fff', color: '#111827', padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <Tab active={tab==='timeline'} onClick={()=>setTab('timeline')}>Timeline</Tab>
        <Tab active={tab==='modules'} onClick={()=>setTab('modules')}>Modules</Tab>
        <Tab active={tab==='mvp'}      onClick={()=>setTab('mvp')}>MVP</Tab>
        <div style={{ marginLeft: 'auto', display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={()=>zoom(-6)} title="Zoom out" style={iconBtn()}>−</button>
          <button onClick={()=>zoom(+6)} title="Zoom in"  style={iconBtn()}>+</button>
          <button onClick={fitToScreen} title="Fit to screen" style={iconBtn()}>⤢</button>

          {/* YENİ: Save Order (sadece admin aktif) */}
          <button
            onClick={saveAllStartWeeks}
            disabled={!editable}
            title="Save current order & positions"
            style={{
              padding:'6px 10px',
              border:'1px solid #e5e7eb',
              borderRadius:8,
              background: editable ? '#111827' : '#fff',
              color: editable ? '#fff' : '#111827',
              fontWeight:800,
              cursor: editable ? 'pointer' : 'default'
            }}>
            Save Order
          </button>

          <div style={{ fontWeight: 800, marginLeft: 8 }}>Total: {totalWeeks} weeks</div>
        </div>
      </div>

      {tab === 'timeline' && (
        <TimelineView
          weekLabels={weekLabels}
          ordered={ordered}
          positioned={positioned}
          swapId={swapId}
          onSwapClick={handleSwapClick}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNudge={nudgeGroupFrom}
          colW={colW}
          modulesEnabledMap={Object.fromEntries((modules||[]).map(m=>[m.id,m.enabled]))}
          onToggleEnabled={toggleEnabled}
          allEnabled={allEnabledTimeline}
          onToggleAll={toggleAllEnabledTimeline}
          editable={editable}
        />
      )}

      {tab === 'modules' && (
        <ModulesEditor
          ordered={ordered}
          swapId={swapId}
          onSwapClick={handleSwapClick}
          onChangeText={(id, patch)=>updateModule(id, patch)}
          onChangeNumber={(id, key, val)=>updateModule(id, { [key]: val })}
          onResChange={onResChange}
          onToggleEnabled={toggleEnabled}
          onToggleIsMvp={toggleMvpFlag}
          onAdd={addModule}
          onDelete={deleteModule}
          adding={adding}
          allEnabled={allEnabledModules}
          onToggleAll={toggleAllEnabledModules}
          editable={editable}
        />
      )}

      {tab === 'mvp' && (
        <MvpPicker
          ordered={ordered.filter(m=>m.isMvp)}
          onRemoveMvp={removeFromMvp}
          editable={editable}
        />
      )}
    </div>
  );
}

/* ======================= TIMELINE ======================= */
function TimelineView({
  weekLabels, ordered, positioned, swapId, onSwapClick,
  onDragStart, onDragOver, onDrop, onNudge, colW,
  modulesEnabledMap, onToggleEnabled, allEnabled, onToggleAll, editable
}){
  const sidebarWidth = 220;
  const gridWidth = Math.max(weekLabels.length * colW, colW);
  const gridHeight = positioned.length * ROW_H + HDR_H;

  // drag-to-nudge on bars
  const draggingRef = useRef(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  useEffect(() => {
    function onMove(e){ if (!draggingRef.current) return; e.preventDefault(); }
    function onUp(e){
      if (!draggingRef.current) return;
      const { id, startX } = draggingRef.current;
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const dx = clientX - startX;
      const dw = Math.round(dx / colW);
      draggingRef.current = null; setIsGrabbing(false);
      if (dw && editable) onNudge?.(id, dw);
    }
    window.addEventListener('mousemove', onMove, { passive:false });
    window.addEventListener('mouseup', onUp, { passive:false });
    window.addEventListener('touchmove', onMove, { passive:false });
    window.addEventListener('touchend', onUp, { passive:false });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [onNudge, colW, editable]);

  // clamp & gutter
  const clampShift = useMemo(() => {
    if (!positioned.length) return 0;
    const minStart = Math.min(...positioned.map(m => m.start));
    return minStart < 0 ? -minStart : 0;
  }, [positioned]);

  // positions for arrows
  const positionsById = useMemo(() => {
    const map = new Map();
    positioned.forEach((m, rowIdx) => {
      const x = ((m.start + clampShift) * colW) + colW; // gutter
      const y = rowIdx * ROW_H + (ROW_H - BAR_H) / 2 + HDR_H;
      const w = Math.max(1, Number(m.duration) || 1) * colW;
      map.set(m.id, { x, y, w, h: BAR_H });
    });
    return map;
  }, [positioned, colW, clampShift]);

  // arrows
  const Arrows = () => {
    const stroke = '#dc2626', sw = 2.4, markerId = 'arrow-simple-tip';
    const markerW = 8, markerH = 8, gap = 8;
    function simplePath(from, to){
      const sx = from.x + from.w / 2, sy = from.y + BAR_H / 2;
      const tx = to.x + to.w / 2, ty = to.y - gap;
      const midY = ty - 12;
      const d = [`M ${sx} ${sy}`, `L ${tx} ${sy}`, `L ${tx} ${midY}`, `L ${tx} ${ty}`].join(' ');
      return { d, start:{x:sx,y:sy}, end:{x:tx,y:ty} };
    }
    return (
      <svg width={gridWidth} height={gridHeight} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="6.5" refY="5" markerWidth={markerW} markerHeight={markerH} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
          </marker>
          <filter id="arrowGlow2" x="-10%" y="-10%" width="120%">
            <feDropShadow dx="0" dy="0" stdDeviation="0.8" floodColor="#ffffff" floodOpacity="0.85"/>
          </filter>
        </defs>
        {positioned.map(m => (
          (m.deps || []).map(depId => {
            const from = positionsById.get(depId), to = positionsById.get(m.id);
            if (!from || !to) return null;
            const { d, start, end } = simplePath(from, to);
            return (
              <g key={`${depId}->${m.id}`} filter="url(#arrowGlow2)">
                <circle cx={start.x} cy={start.y} r={2.6} fill={stroke}/>
                <path d={d} stroke={stroke} strokeWidth={sw} fill="none" markerEnd={`url(#${markerId})`} />
                <circle cx={end.x} cy={end.y} r={2.6} fill={stroke}/>
              </g>
            );
          })
        ))}
      </svg>
    );
  };

  return (
    <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: sidebarWidth, background: '#fff', borderRight: '1px solid #e5e7eb' }}>
        {/* header with ALL */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:'1px solid #f3f4f6', fontSize:12, color:'#6b7280' }}>
          <input type="checkbox" checked={allEnabled} onChange={editable ? onToggleAll : ()=>{}} disabled={!editable} />
          <span>All</span>
        </div>
        {ordered.map((m) => {
          const tipSide = [m.name, (m.desc||''), formatRes(m)].filter(Boolean).join('\n');
          const enabled = modulesEnabledMap[m.id];
          return (
            <div key={m.id}
                 draggable={editable}
                 onDragStart={()=>editable && onDragStart(m.id)}
                 onDragOver={onDragOver}
                 onDrop={()=>editable && onDrop(m.id)}
                 title={tipSide}
                 style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', height: ROW_H, boxSizing: 'border-box', borderBottom: '1px solid #f3f4f6', background: '#fff' }}>
              <span style={{ fontSize: 14, color: '#9ca3af', paddingTop: 2, cursor: editable ? 'grab':'default' }}>⋮⋮</span>
              <input
                type="checkbox"
                checked={!!(m.isMvp || enabled)}
                onChange={()=>editable && onToggleEnabled(m.id)}
                disabled={!editable}
                title={m.isMvp ? "MVP modules are always enabled" : ""}
              />
              <div onClick={()=>editable && onSwapClick(m.id)} style={{ display:'flex', flexDirection:'column', gap:4, overflow:'hidden', minWidth: 0, cursor: editable ? 'pointer':'default', background: (swapId===m.id? '#eef2ff':'transparent'), borderRadius:6, padding:'2px 4px' }}>
                <span style={{ fontWeight: 600, fontSize: '12px' }}>{m.name}</span>
                <span style={{ fontSize: 12, color:'#6b7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth: sidebarWidth-80 }}>{m.desc || ''}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="timeline-container" style={{ position: 'relative', flex: 1, overflow: 'auto' }}>
        <div style={{ position: 'relative', width: gridWidth, height: gridHeight, background: '#fff' }}>
          {/* Sticky header */}
          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', display: 'flex', borderBottom: '1px solid #eee' }}>
            {weekLabels.map((label, i) => (
              <div key={i} style={{ width: colW, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '10px 0 6px', borderRight: '1px solid #eef2f7' }}>{label}</div>
            ))}
          </div>

          {/* Grid columns */}
          <div style={{ position: 'absolute', top: HDR_H, left: 0, right: 0, bottom: 0, display: 'flex', pointerEvents: 'none' }}>
            {Array.from({ length: weekLabels.length }).map((_, i) => (<div key={i} style={{ width: colW, borderRight: '1px solid #f3f4f6' }} />))}
          </div>

          {/* Arrows UNDER bars */}
          <Arrows />

          {/* Bars */}
          <div style={{ position: 'absolute', top: HDR_H, left: 0, right: 0 }}>
            {positioned.map((m, rowIdx) => {
              const barW = Math.max(1, Number(m.duration) || 1) * colW;
              const leftPx = ((m.start + clampShift) * colW) + colW; // gutter
              const titleFont = Math.max(10, Math.min(16, Math.floor(barW / 12)));
              const selected = swapId === m.id;
              const tColor = textColorFor(m.color);
              const resText = formatRes(m);
              const tip = `${m.name}\n${m.desc ? m.desc + '\n' : ''}${resText ? resText + ' • ' : ''}${m.duration} weeks${m.obMode==='onb' ? ' • OnB' : (m.obMode==='half' ? ' • Half' : '')}`;
              const labelText = (resText || ' ');              return (
                <div key={m.id}
                     onMouseDown={(e)=>{ if(!editable) return; draggingRef.current = { id: m.id, startX: e.clientX }; setIsGrabbing(true); }}
                     onTouchStart={(e)=>{ if(!editable) return; const t=e.touches[0]; draggingRef.current = { id: m.id, startX: t.clientX }; setIsGrabbing(true); }}
                     onMouseUp={()=> setIsGrabbing(false)}
                     onClick={()=>editable && onSwapClick(m.id)}
                     style={{
                       position: 'absolute',
                       left: `${leftPx}px`,
                       top: `${rowIdx * ROW_H + (ROW_H - BAR_H) / 2}px`,
                       width: `${barW}px`,
                       height: `${BAR_H}px`,
                       background: m.color || '#3498db',
                       color: tColor,
                       borderRadius: 10,
                       display: 'flex',
                       flexDirection: 'column',
                       alignItems: 'center',
                       justifyContent: 'center',
                       padding: '2px 8px',
                       boxSizing: 'border-box',
                       boxShadow: selected? '0 0 0 3px rgba(79,70,229,0.7)' : '0 1px 2px rgba(0,0,0,0.06)',
                       textAlign: 'center',
                       lineHeight: 1.1,
                       cursor: editable ? (isGrabbing ? 'grabbing' : 'grab') : 'default',
                       userSelect: 'none'
                     }}
                     title={tip}>
                  {m.isMvp && <div style={{position:'absolute', left:6, top:6, fontSize:14, color:'#000'}}>★</div>}
                  {m.obMode==='onb' && (
                    <div style={{
                      position:'absolute', right:6, top:6,
                      fontSize:11, fontWeight:800,
                      padding:'2px 6px', borderRadius:6,
                      background:'rgba(0,0,0,0.36)', color:'#fff'
                    }}>OnB</div>
                  )}
                  <div style={{ fontWeight: 800, fontSize: titleFont, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', padding: '0 6px', maxHeight: '2.2em' }}>{m.name}</div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 6px', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.36)', color: '#fff', alignSelf: 'center' }}>
                    {(resText || ' ') + (m.obMode==='onb' ? '  OnB' : '')}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ======================= MODULES ======================= */
function ModulesEditor({
  ordered, swapId, onSwapClick,
  onChangeText, onChangeNumber, onResChange,
  onToggleEnabled, onToggleIsMvp,
  onAdd, onDelete, adding, allEnabled, onToggleAll,
  editable
}){
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: '10px 12px', borderBottom:'1px solid #e5e7eb', background:'#fafafa' }}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <input type="checkbox" checked={allEnabled} onChange={editable ? onToggleAll : ()=>{}} disabled={!editable} />
          <strong style={{ fontSize: 14 }}>All</strong>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || !editable}
          style={{ padding:'6px 10px',
                   opacity: (adding || !editable) ? 0.6 : 1,
                   border:'1px solid #e5e7eb', borderRadius:8,
                   background:'#111827', color:'#fff', fontWeight:700, cursor: (adding || !editable) ? 'not-allowed' : 'pointer' }}>
          {adding ? 'Adding…' : '+ Add Module'}
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fafafa' }}>
            {['Enabled','is MVP','Module Name','Description','Base Duration\n(Weeks)','FE','BE','QA','Color','Depends On','Computed Duration (Weeks)','Swap',''].map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 12, padding: 10, whiteSpace: 'pre-wrap', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(m => (
            <tr key={m.id} style={{ background: swapId===m.id? '#eef2ff' : '#fff' }}>
              <td style={td()}>
                <input type="checkbox"
                  checked={!!m.enabled}
                  onChange={()=>editable && onToggleEnabled(m.id)}
                  disabled={!editable}
                  title={m.isMvp ? "MVP modules are always enabled" : ""}
                />
              </td>
              <td style={td()}>
                <input type="checkbox"
                  checked={!!m.isMvp}
                  onChange={()=>editable && onToggleIsMvp(m.id)}
                  disabled={!editable}
                />
              </td>
              <td style={td()}>
                <input value={m.name} onChange={e=>editable && onChangeText(m.id,{name: e.target.value})} disabled={!editable} style={inp(200)} />
              </td>
              <td style={td()}>
                <textarea value={m.desc || ''} onChange={e=>editable && onChangeText(m.id,{ desc: e.target.value })} disabled={!editable} style={{ ...inp(320), height: 56, resize: 'vertical' }} />
              </td>
              <td style={td()}>
                <input type="number" min={1} value={m.baseDuration} onChange={e=>editable && onChangeNumber(m.id,'baseDuration', Math.max(1, Number(e.target.value)||1))} disabled={!editable} style={inp(56)} />
              </td>
              <td style={td()}>
                <input type="number" min={0} value={m.fe} onChange={(e)=>editable && onResChange(m.id,'fe', e.target.value)} disabled={!editable} style={inp(44)} />
              </td>
              <td style={td()}>
                <input type="number" min={0} value={m.be} onChange={(e)=>editable && onResChange(m.id,'be', e.target.value)} disabled={!editable} style={inp(44)} />
              </td>
              <td style={td()}>
                <input type="number" min={0} value={m.qa} onChange={(e)=>editable && onResChange(m.id,'qa', e.target.value)} disabled={!editable} style={inp(44)} />
              </td>
              <td style={td()}>
                <input type="color" value={m.color} onChange={(e)=>editable && onChangeText(m.id,{ color: e.target.value })} disabled={!editable} style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'transparent', cursor: editable ? 'pointer':'default' }} />
              </td>
              <td style={td()}>
                <DepDropdown
                  value={(m.deps||[]).map(Number)}
                  options={ordered.filter(x=>x.id!==m.id).map(opt => ({ value: Number(opt.id), label: opt.name }))}
                  onChange={(values)=> editable && onChangeText(m.id, { deps: values })}
                  disabled={!editable}
                />
              </td>
              <td style={td()}><strong>{computeDuration(m)}</strong>{m.obMode==='onb' ? '  (OnB)' : (m.obMode==='half' ? '  (Half)' : '')}</td>
              <td style={td()}>
                <button type="button" onClick={()=>editable && onSwapClick(m.id)} disabled={!editable} style={{ padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:6, background: swapId===m.id? '#eef2ff':'#fff', cursor: editable ? 'pointer':'default', opacity: editable ? 1 : 0.6 }}>Pick</button>
              </td>
              <td style={{ ...td(), width: 60 }}>
                <button type="button" title="Delete" onClick={()=>editable && onDelete?.(m.id)}
                        disabled={!editable}
                        style={{ width: 36, height: 28, borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', color:'#dc2626', fontWeight: 800, cursor: editable ? 'pointer':'default', opacity: editable ? 1 : 0.6 }}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ======================= MVP ======================= */
function MvpPicker({ ordered, onRemoveMvp, editable }){
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', padding: 12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12 }}>
        {ordered.map(m => {
          const tColor = textColorFor(m.color);
          return (
            <div key={m.id} title={m.desc || m.name} style={{
              border:'1px solid #e5e7eb',
              borderRadius:12,
              padding:'10px 12px',
              minHeight: 100,
              display:'flex',
              flexDirection:'column',
              gap:6,
              position:'relative',
              background: m.color || '#fff',
              color: tColor
            }}>
              <div style={{position:'absolute', left:8, top:6, fontSize:16, color:'#000'}}>★</div>
              <button type="button" onClick={()=>editable && onRemoveMvp(m.id)} title="Remove from MVP"
                      disabled={!editable}
                      style={{position:'absolute', right:8, top:6, width:28, height:28, borderRadius:6, border:'1px solid #fee2e2', background:'#fef2f2', color:'#dc2626', fontWeight:800, cursor: editable ? 'pointer':'default', opacity: editable ? 1 : 0.6}}>🗑</button>
              <div style={{ fontWeight:800, fontSize:14, paddingLeft:22 }}>{m.name}</div>
              <div style={{ fontSize:12, opacity:0.95, whiteSpace:'pre-wrap' }}>{m.desc || ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= Small UI helpers ======================= */
function DepDropdown({ value = [], options = [], onChange, disabled }){
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedSet = useMemo(() => new Set((value||[]).map(Number)), [value]);

  useEffect(() => {
    function onDoc(e){ if (!ref.current) return; if (!ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const selectedLabels = options
    .filter(o => selectedSet.has(Number(o.value)))
    .map(o => o.label);
  const title = selectedLabels.length ? `${selectedLabels.length} selected` : 'Select deps…';

  function toggleOne(valNum){
    const next = new Set(selectedSet);
    if (next.has(valNum)) next.delete(valNum); else next.add(valNum);
    onChange?.(Array.from(next));
  }

  return (
    <div ref={ref} style={{ position:'relative', width: 180, opacity: disabled ? 0.6 : 1 }}>
      <button type="button" onClick={(e)=>{ if(disabled) return; e.stopPropagation(); setOpen(o=>!o); }}
        disabled={disabled}
        style={{ width:'100%', padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', textAlign:'left', fontSize:13, cursor: disabled ? 'default' : 'pointer' }}>
        {title}
      </button>
      {open && !disabled && (
        <div style={{ position:'absolute', top:'110%', left:0, zIndex:5, width:'100%', maxHeight:220, overflow:'auto', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', boxShadow:'0 8px 20px rgba(0,0,0,0.08)' }}>
          {options.map(opt => {
            const valNum = Number(opt.value);
            const checked = selectedSet.has(valNum);
            return (
              <label key={opt.value}
                     style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', cursor:'pointer' }}
                     onClick={(e)=> e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={()=> toggleOne(valNum)}
                />
                <span style={{ fontSize:12 }}>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }){
  return (
    <button type="button" onClick={onClick} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: active ? '#111827' : '#fff', color: active ? '#fff' : '#111827', fontWeight: 700, cursor: 'pointer' }}>{children}</button>
  );
}
function td(){ return { padding: 10, borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'top' }; }
function inp(w=160){ return { width: w, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }; }
function iconBtn(){ return { width: 32, height: 28, borderRadius: 8, border: '1px solid #e5e7eb', background:'#fff', cursor:'pointer', fontWeight:900 }; }