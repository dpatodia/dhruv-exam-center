import React, { useEffect, useRef, useState } from 'react';

// A small drawing board for flowcharts and labelled diagrams, so diagram questions can be done online.
const W = 1000, H = 680;
const TOOLS = [
  ['pen', '✏️ Pen'], ['oval', '⬭ Start/Stop'], ['para', '▱ Input/Output'], ['rect', '▭ Process'],
  ['diamond', '◇ Decision'], ['arrow', '➜ Arrow'], ['line', '╱ Line'], ['text', '🔤 Text'],
];

function drawItem(ctx, it) {
  ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'; ctx.lineWidth = it.t === 'pen' ? 3 : 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const { x1, y1, x2, y2 } = it; const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  ctx.beginPath();
  if (it.t === 'pen') { it.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); return; }
  if (it.t === 'rect') { ctx.strokeRect(x, y, w, h); return; }
  if (it.t === 'oval') { ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.stroke(); return; }
  if (it.t === 'para') { const k = Math.min(w * 0.25, 40); ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.stroke(); return; }
  if (it.t === 'diamond') { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); ctx.stroke(); return; }
  if (it.t === 'line' || it.t === 'arrow') {
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (it.t === 'arrow') {
      const a = Math.atan2(y2 - y1, x2 - x1), L = 16;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - L * Math.cos(a - 0.4), y2 - L * Math.sin(a - 0.4));
      ctx.lineTo(x2 - L * Math.cos(a + 0.4), y2 - L * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (it.t === 'text') { ctx.font = '26px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.text, x1, y1); }
}

export default function SketchPad({ title, onSave, onClose }) {
  const ref = useRef(null);
  const [tool, setTool] = useState('oval');
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#eef0f6'; ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    [...items, draft].filter(Boolean).forEach((it) => drawItem(ctx, it));
  }, [items, draft]);

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  function down(e) {
    e.preventDefault(); ref.current.setPointerCapture?.(e.pointerId);
    const [x, y] = pos(e);
    if (tool === 'text') { if (text.trim()) { setItems([...items, { t: 'text', text: text.trim(), x1: x, y1: y }]); setText(''); } return; }
    setDraft(tool === 'pen' ? { t: 'pen', pts: [[x, y]] } : { t: tool, x1: x, y1: y, x2: x, y2: y });
  }
  function move(e) {
    if (!draft) return; const [x, y] = pos(e);
    setDraft(draft.t === 'pen' ? { ...draft, pts: [...draft.pts, [x, y]] } : { ...draft, x2: x, y2: y });
  }
  function up() {
    if (!draft) return;
    const tiny = draft.t !== 'pen' && Math.abs(draft.x2 - draft.x1) < 6 && Math.abs(draft.y2 - draft.y1) < 6;
    if (!tiny) setItems([...items, draft]);
    setDraft(null);
  }
  async function save() {
    setSaving(true);
    const blob = await new Promise((r) => ref.current.toBlob(r, 'image/png'));
    await onSave(new File([blob], 'drawing.png', { type: 'image/png' }));
    setSaving(false); onClose();
  }

  return (
    <div className="modal-bg">
      <div className="card" style={{ width: 'min(1100px, 100%)', maxHeight: '96vh', overflow: 'auto' }}>
        <div className="row between"><h3>✏️ {title}</h3><button className="btn ghost sm" onClick={onClose}>Close</button></div>
        <div className="row mt" style={{ gap: 6 }}>
          {TOOLS.map(([k, label]) => <button key={k} className={`btn sm ${tool === k ? '' : 'ghost'}`} onClick={() => setTool(k)}>{label}</button>)}
        </div>
        {tool === 'text' && (
          <div className="row mt"><input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder='Type a label, e.g. "Is temp > 30?" — then tap where it goes' style={{ maxWidth: 460 }} autoFocus /></div>
        )}
        <div className="small muted mt">Drag to draw a shape. Put labels inside shapes with the Text tool. Label decision arrows <b>Yes</b> / <b>No</b>.</div>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: 'calc(60vh * 1.47)', display: 'block', margin: '10px auto 0', borderRadius: 12, touchAction: 'none', cursor: 'crosshair', background: '#fff' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        <div className="row mt">
          <button className="btn ghost sm" disabled={!items.length} onClick={() => setItems(items.slice(0, -1))}>↶ Undo</button>
          <button className="btn ghost sm" disabled={!items.length} onClick={() => setItems([])}>🗑 Clear</button>
          <div className="spacer" />
          <button className="btn gold" disabled={!items.length || saving} onClick={save}>{saving ? 'Saving…' : 'Use this drawing ✓'}</button>
        </div>
      </div>
    </div>
  );
}
