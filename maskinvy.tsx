'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type Maskin = { maskin_id: any; modell: string; tillverkare: string; typ: string };

// ── Types for DB data ──
type DbData = {
  dailyVol: number[];
  dailySt: number[];
  days: string[];
  totalVolym: number;
  totalStammar: number;
  g15Timmar: number;
  produktivitet: number;
  medelstam: number;
  // Time distribution
  processingSek: number;
  terrainSek: number;
  kortStoppSek: number;
  avbrottSek: number;
  rastSek: number;
  engineTimeSek: number;
  // Operators
  operatorer: Array<{
    id: string;
    key: string;
    namn: string;
    initialer: string;
    timmar: number;
    volym: number;
    prod: number;
    medelstam: number;
    stammar: number;
    dagar: number;
  }>;
  // Objekt
  objekt: Array<{
    objekt_id: string;
    namn: string;
    vo_nummer: string;
    volym: number;
    stammar: number;
    g15h: number;
    prod: number;
  }>;
  // Day data
  dagData: Record<number, {
    typ: number; forare: string; objekt: string;
    start: string; slut: string; vol: number; stammar: number;
    g15: number; snitt: number; stg15: number; medelstam: number;
    diesel: number; avbrott: Array<{ orsak: string; tid: string }>;
    flytt?: boolean;
  }>;
  // Calendar day types
  calendarDt: number[];
};

const MASKINVY_SCRIPT = `(function(){
if (typeof Chart === 'undefined') { console.error('[Maskinvy] Chart.js not loaded'); return; }
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

// Read DB data from window if available
var _db = window.__maskinvyData || {};
console.log('[Maskinvy Script] _db:', { keys: Object.keys(_db), totalVolym: _db.totalVolym, dailyVol: _db.dailyVol?.length, operatorer: _db.operatorer?.length });

var classes = ['0.0–0.1','0.1–0.2','0.2–0.3','0.3–0.4','0.4–0.5','0.5–0.7','0.7+'];
var m3g15   = [7.7,10.3,10.5,11.1,12.0,12.7,15.0];
var stg15   = [102,73,42,32,27,21,36];
var volym   = [138,298,545,311,252,228,75];
var stammar = [1840,2130,2180,890,560,380,180];

var grid    = {color:'rgba(255,255,255,0.05)'};
var ticks   = {color:'#7a7a72',font:{size:11}};
const tooltip = {backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10};

// Count-up animation
function countUp(el, target, dec=0, duration=1200){
  const start = performance.now();
  const step = t => {
    const p = Math.min((t-start)/duration, 1);
    const ease = 1-Math.pow(1-p, 3);
    el.textContent = (target*ease).toFixed(dec).replace(/\\B(?=(\\d{3})+(?!\\d))/g,' ');
    if(p<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// KPI values from DB only — no fallback
var _kpiVolym = _db.totalVolym || 0;
var _kpiStammar = _db.totalStammar || 0;
var _kpiG15 = _db.g15Timmar || 0;
var _kpiProd = _db.produktivitet || 0;
var _kpiMedel = _db.medelstam || 0;

// Update ALL KPI data-count attributes from DB
document.querySelectorAll('.k-val[data-count]').forEach(function(el) {
  var label = el.parentElement && el.parentElement.querySelector('.k-label');
  if (!label) return;
  var t = label.textContent;
  if (t === 'Stammar') el.setAttribute('data-count', String(_kpiStammar));
  if (t === 'Produktivitet') el.setAttribute('data-count', String(_kpiProd));
  if (t === 'Medelstam') el.setAttribute('data-count', String(_kpiMedel));
});

setTimeout(()=>{
  countUp(document.getElementById('hv'), _kpiVolym, 0, 1400);
  document.querySelectorAll('.k-val[data-count]').forEach(el=>{
    const v = parseFloat(el.dataset.count);
    const d = parseInt(el.dataset.dec||0);
    countUp(el, v, d, 1200);
  });
}, 300);

// Daily chart — DB only
const dailyVol = _db.dailyVol || [];
const dailySt  = _db.dailySt || [];
const days = _db.days || [];

var dailyEl = document.getElementById('dailyChart');
console.log('[Maskinvy Script] dailyChart element:', !!dailyEl, 'dailyVol:', dailyVol?.slice(0,5));
if(!dailyEl){console.warn('[Maskinvy] dailyChart canvas not found');return;}
new Chart(dailyEl,{
  type:'bar',
  data:{labels:days,datasets:[
    {label:'m³/dag',data:dailyVol,backgroundColor:dailyVol.map(v=>v===0?'rgba(255,255,255,0.04)':'rgba(90,255,140,0.5)'),borderRadius:3,yAxisID:'y',order:1},
    {label:'Stammar',data:dailySt,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.05)',pointBackgroundColor:dailySt.map(v=>v>0?'#5b8fff':'transparent'),pointRadius:dailySt.map(v=>v>0?3:0),tension:0.3,yAxisID:'y2',order:0,spanGaps:false}
  ]},
  options:{
    responsive:true,
    interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip},
    scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'m³',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'Stammar',color:'#5b8fff',font:{size:10}}}},
    onClick:(e,els)=>{
      if(!els.length) return;
      const dag = els[0].index + 1;
      if(dagData[dag]) openDag(dag);
    },
    onHover:(e,els)=>{
      e.native.target.style.cursor = els.length && dagData[els[0].index+1] ? 'pointer' : 'default';
    }
  }
});

// Calendar
const cal = document.getElementById('calGrid');
for(let i=0;i<6;i++){const d=document.createElement('div');d.className='cal-cell';cal.appendChild(d);}
const dt = _db.calendarDt || [];
const dc={0:'c-off',1:'c-prod',2:'c-flytt',3:'c-service'};
const dlbl={0:'Ej aktiv',1:'Produktion',2:'Flytt',3:'Service'};
dt.forEach((t,i)=>{
  const el=document.createElement('div');
  el.className=\`cal-cell \${dc[t]}\`;
  el.title=\`\${i+1} feb · \${dlbl[t]}\${dailyVol[i]>0?' · '+dailyVol[i]+' m³':''}\` ;
  if(t===1||t===2||t===3) el.onclick=()=>openDag(i+1);
  el.textContent=i+1;
  cal.appendChild(el);
});

// Sortiment
if(!document.getElementById('sortChart')){console.warn('[Maskinvy] sortChart not found, skipping remaining charts');}
else {
new Chart(document.getElementById('sortChart'),{
  type:'bar',
  data:{labels:['Gran','Tall','Björk'],datasets:[
    {label:'Sågtimmer',data:[820,220,84],backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,stack:'s'},
    {label:'Massaved', data:[280,215,80],backgroundColor:'rgba(255,179,64,0.4)',borderRadius:3,stack:'s'},
    {label:'Energived',data:[24,63,21], backgroundColor:'rgba(255,255,255,0.1)',borderRadius:3,stack:'s'}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{font:{family:'Geist',size:11},boxWidth:8,borderRadius:2,padding:12,color:'#7a7a72'}},tooltip},scales:{x:{stacked:true,grid,ticks},y:{stacked:true,grid,ticks}}}
});

// MTH
new Chart(document.getElementById('mthChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'Gran', data:[820,640,180,28,8,3,0], backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,stack:'m'},
    {label:'Tall', data:[190,120,50,10,2,1,0],  backgroundColor:'rgba(122,122,114,0.4)',borderRadius:3,stack:'m'},
    {label:'Björk',data:[112,52,32,4,1,0,0],   backgroundColor:'rgba(91,143,255,0.5)',borderRadius:3,stack:'m'}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{stacked:true,grid,ticks},y:{stacked:true,grid,ticks}}}
});

// Total
new Chart(document.getElementById('totalChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'Volym m³',data:volym,backgroundColor:'rgba(91,143,255,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'Stammar',data:stammar,type:'line',borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.04)',pointBackgroundColor:'#5aff8c',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m³',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5aff8c'},title:{display:true,text:'Stammar',color:'#5aff8c',font:{size:10}}}}}
});

// Produktivitet
const pc = m3g15.map(()=>'rgba(90,255,140,0.5)');
new Chart(document.getElementById('prodChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'m³/G15h',data:m3g15,backgroundColor:pc,borderRadius:4,yAxisID:'y',order:1},
    {label:'st/G15h',data:stg15,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.04)',pointBackgroundColor:'#5b8fff',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>c.datasetIndex===0?\` \${c.parsed.y} m³/G15h\`:\` \${c.parsed.y} st/G15h\`}}},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m³/G15h',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'st/G15h',color:'#5b8fff',font:{size:10}}}}}
});

// Diesel per medelstamsklass
const dieselPerM3 = [6.8, 5.2, 4.4, 3.9, 3.6, 3.3, 3.1];
new Chart(document.getElementById('dieselChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {
      label:'l/m³',
      data:dieselPerM3,
      backgroundColor:'rgba(90,255,140,0.5)',
      borderRadius:4,
      yAxisID:'y',
      order:1
    },
    {
      label:'m³/G15h',
      data:m3g15,
      type:'line',
      borderColor:'rgba(91,143,255,0.6)',
      backgroundColor:'rgba(91,143,255,0.04)',
      pointBackgroundColor:'#5b8fff',
      pointRadius:4,
      tension:0.3,
      yAxisID:'y2',
      order:0
    }
  ]},
  options:{
    responsive:true,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{display:false},
      tooltip:{...tooltip,callbacks:{label:c=>c.datasetIndex===0?\` \${c.parsed.y} l/m³\`:\` \${c.parsed.y} m³/G15h\`}}
    },
    scales:{
      x:{grid,ticks},
      y:{grid,ticks,title:{display:true,text:'liter / m³',color:'#7a7a72',font:{size:10}},suggestedMin:2,suggestedMax:8},
      y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'m³/G15h',color:'#5b8fff',font:{size:10}}}
    }
  }
});
} // end if(sortChart) else block

// Tabs
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  t.classList.add('on');
}));

// ── MACHINE MENU ──
function toggleMMenu(){ var el=document.getElementById('mMenu'); if(el) el.classList.toggle('open'); }
function pickM(el,name,sub,color){
  var n=document.getElementById('mName'); if(n) n.textContent=name;
  var d=document.getElementById('mDot'); if(d) d.style.cssText=\`width:7px;height:7px;border-radius:50%;flex-shrink:0;background:\${color}\`;
  document.querySelectorAll('.mach-opt').forEach(o=>o.classList.remove('sel'));
  el.classList.add('sel');
  var m=document.getElementById('mMenu'); if(m) m.classList.remove('open');
}
document.addEventListener('click',e=>{
  var m=document.getElementById('mMenu'); if(m && !e.target.closest('.mach-wrap')) m.classList.remove('open');
});

// ── OVERLAY HELPER ──
function openOverlay()  { var el=document.getElementById('forarOverlay'); if(el) el.classList.add('open'); }
function closeOverlay() { var el=document.getElementById('forarOverlay'); if(el) el.classList.remove('open'); }

var forarOvl = document.getElementById('forarOverlay');
if(forarOvl) forarOvl.addEventListener('click', function(){ closeAllPanels(); });

function closeAllPanels() {
  closeOverlay();
  ['forarPanel','bolagPanel','tradslagPanel','tidPanel','dagPanel','objTypPanel','objJmfPanel'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.classList.remove('open');
  });
}

// ── FÖRARE ──
// Build forare from DB operatorer — no fallback
var forare = {};
if (_db.operatorer && _db.operatorer.length > 0) {
  _db.operatorer.forEach(function(op) {
    var key = op.key || op.namn.split(' ')[0].toLowerCase();
    forare[key] = {
      av: op.initialer,
      name: op.namn,
      timmar: Math.round(op.timmar),
      volym: Math.round(op.volym),
      prod: parseFloat(op.prod.toFixed(1)),
      medelstam: op.stammar > 0 ? parseFloat((op.volym / op.stammar).toFixed(2)) : 0,
      mth: 0,
      stammar: Math.round(op.stammar),
      klasser: [],
      dagar: op.dagar,
      objekt: '–',
      gran: 0, tall: 0, bjork: 0
    };
  });
}

let fpChart = null;

function openForare(id) {
  const f = forare[id];
  document.getElementById('fpAv').textContent  = f.av;
  document.getElementById('fpName').textContent = f.name;
  document.getElementById('fpSub').textContent  = 'Ponsse Scorpion Giant 8W · februari 2026';
  document.getElementById('fpBody').innerHTML = \`
    <div class="forar-kpis">
      <div class="fkpi"><div class="fkpi-v">\${f.volym}</div><div class="fkpi-l">m³fub</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.prod}</div><div class="fkpi-l">m³/G15h</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.timmar}h</div><div class="fkpi-l">G15-timmar</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.medelstam}</div><div class="fkpi-l">Medelstam</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.mth}%</div><div class="fkpi-l">MTH-andel</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.dagar}</div><div class="fkpi-l">Aktiva dagar</div></div>
    </div>
    <div class="fsec"><div class="fsec-title">Produktivitet per medelstamsklass</div><canvas id="fpChart" style="max-height:180px;margin-bottom:12px;"></canvas></div>
    <div class="fsec">
      <div class="fsec-title">Trädslag</div>
      <div class="frow"><span class="frow-l">Gran</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:\${f.gran}%;background:rgba(90,255,140,0.5)"></div></div></div><span class="frow-v">\${f.gran}%</span></div>
      <div class="frow"><span class="frow-l">Tall</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:\${f.tall}%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">\${f.tall}%</span></div>
      <div class="frow"><span class="frow-l">Björk</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:\${f.bjork}%;background:rgba(91,143,255,0.4)"></div></div></div><span class="frow-v">\${f.bjork}%</span></div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Övrigt</div>
      <div class="frow"><span class="frow-l">Stammar totalt</span><span class="frow-v">\${f.stammar.toLocaleString('sv')}</span></div>
      <div class="frow"><span class="frow-l">Aktivt objekt</span><span class="frow-v">\${f.objekt}</span></div>
    </div>\`;
  setTimeout(() => {
    if (fpChart) fpChart.destroy();
    const ctx = document.getElementById('fpChart');
    if (!ctx) return;
    fpChart = new Chart(ctx, {
      type:'bar',
      data:{labels:f.klasser.map(k=>k.k),datasets:[
        {label:'m³/G15h',data:f.klasser.map(k=>k.prod),backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,yAxisID:'y',order:1},
        {label:'st/G15h',data:f.klasser.map(k=>k.st),type:'line',borderColor:'rgba(91,143,255,0.6)',pointBackgroundColor:'#5b8fff',pointRadius:3,tension:0.3,yAxisID:'y2',order:0}
      ]},
      options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'m³/G15h',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'st/G15h',color:'#5b8fff',font:{size:10}}}}}
    });
  }, 50);
  openOverlay();
  document.getElementById('forarPanel').classList.add('open');
}

function closeForare() {
  closeAllPanels();
}

// ── BOLAG ──
const bolag = {
  vida: { logo:'VIDA', name:'Vida Skog AB', volym:1024, pct:55,
    inkopare:[
      {namn:'Jan-Erik Svensson',initialer:'JS',volym:623,objekt:[{namn:'Ålshult AU 2025',nr:'VO 11080064',typ:'Slutavverkning',volym:623,filer:8,gran:68,tall:28,bjork:4}]},
      {namn:'Martin Lindqvist', initialer:'ML',volym:401,objekt:[{namn:'Björsamåla AU 2025',nr:'VO 11081163',typ:'Slutavverkning',volym:401,filer:11,gran:72,tall:22,bjork:6}]}
    ]},
  sod: { logo:'SÖD', name:'Södra Skogsägarna', volym:444, pct:24,
    inkopare:[{namn:'Anders Bergström',initialer:'AB',volym:444,objekt:[{namn:'Svinhult Au 2025',nr:'VO 11088xxx',typ:'Slutavverkning',volym:444,filer:6,gran:55,tall:32,bjork:13}]}]},
  ata: { logo:'ATA', name:'ATA Timber', volym:379, pct:21,
    inkopare:[{namn:'Kristoffer Holm',initialer:'KH',volym:379,objekt:[{namn:'Karamåla 19 A-S',nr:'VO 11106406',typ:'Gallring',volym:379,filer:5,gran:48,tall:38,bjork:14}]}]}
};

function openBolag(id) {
  const b = bolag[id];
  document.getElementById('bpLogo').textContent = b.logo;
  document.getElementById('bpName').textContent = b.name;
  document.getElementById('bpSub').textContent  = b.volym.toLocaleString('sv') + ' m³ · ' + b.pct + '% av total volym';
  const slutVol = b.inkopare.flatMap(i=>i.objekt).filter(o=>o.typ==='Slutavverkning').reduce((s,o)=>s+o.volym,0);
  const gallVol = b.inkopare.flatMap(i=>i.objekt).filter(o=>o.typ==='Gallring').reduce((s,o)=>s+o.volym,0);
  const summaryRows = b.inkopare.map(ink=>{
    const inkSlut=ink.objekt.filter(o=>o.typ==='Slutavverkning').reduce((s,o)=>s+o.volym,0);
    const inkGall=ink.objekt.filter(o=>o.typ==='Gallring').reduce((s,o)=>s+o.volym,0);
    return \`<div class="frow">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);flex-shrink:0;">\${ink.initialer}</div>
        <span class="frow-l">\${ink.namn}</span>
      </div>
      <div style="display:flex;gap:12px;align-items:center;">
        \${inkSlut>0?\`<span style="font-size:10px;color:var(--muted);">Slutavv <strong style="color:var(--text)">\${inkSlut.toLocaleString('sv')}</strong></span>\`:''}
        \${inkGall>0?\`<span style="font-size:10px;color:var(--muted);">Gallring <strong style="color:var(--text)">\${inkGall.toLocaleString('sv')}</strong></span>\`:''}
        <span class="frow-v">\${ink.volym.toLocaleString('sv')} m³</span>
      </div>
    </div>\`;
  }).join('');
  const inkopareRows = b.inkopare.map(ink=>{
    const objRows = ink.objekt.map(o=>\`
      <div style="background:var(--bg);border-radius:8px;padding:12px;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div><div style="font-size:12px;font-weight:600;">\${o.namn}</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">\${o.nr} · \${o.typ}</div></div>
          <div style="text-align:right;"><div style="font-family:'Fraunces',serif;font-size:18px;line-height:1;">\${o.volym}</div><div style="font-size:10px;color:var(--muted);">m³</div></div>
        </div>
        <div class="frow"><span class="frow-l">Gran</span><div style="flex:1;margin:0 10px"><div class="prog"><div class="pf" style="width:\${o.gran}%;background:rgba(90,255,140,0.5)"></div></div></div><span class="frow-v">\${o.gran}%</span></div>
        <div class="frow"><span class="frow-l">Tall</span><div style="flex:1;margin:0 10px"><div class="prog"><div class="pf" style="width:\${o.tall}%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">\${o.tall}%</span></div>
        <div class="frow" style="border-bottom:none"><span class="frow-l">Björk</span><div style="flex:1;margin:0 10px"><div class="prog"><div class="pf" style="width:\${o.bjork}%;background:rgba(91,143,255,0.4)"></div></div></div><span class="frow-v">\${o.bjork}%</span></div>
      </div>\`).join('');
    return \`<div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);flex-shrink:0;">\${ink.initialer}</div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">\${ink.namn}</div><div style="font-size:10px;color:var(--muted);">\${ink.objekt.length} objekt</div></div>
        <div style="text-align:right;"><div style="font-family:'Fraunces',serif;font-size:20px;line-height:1;">\${ink.volym.toLocaleString('sv')}</div><div style="font-size:10px;color:var(--muted);">m³fub</div></div>
      </div>\${objRows}</div>\`;
  }).join('');
  const totObjekt = b.inkopare.reduce((s,i)=>s+i.objekt.length,0);
  document.getElementById('bpBody').innerHTML = \`
    <div class="forar-kpis" style="margin-bottom:16px;">
      <div class="fkpi"><div class="fkpi-v">\${b.volym.toLocaleString('sv')}</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">\${slutVol.toLocaleString('sv')}</div><div class="fkpi-l">Slutavverkning</div></div>
      <div class="fkpi"><div class="fkpi-v">\${gallVol>0?gallVol.toLocaleString('sv'):'–'}</div><div class="fkpi-l">Gallring</div></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Sammanställning per inköpare</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 14px;margin-bottom:16px;">\${summaryRows}</div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Inköpare & objekt</div>
    \${inkopareRows}\`;
  openOverlay();
  document.getElementById('bolagPanel').classList.add('open');
}
function closeBolag() { closeAllPanels(); }

// ── TRÄDSLAG ──
function openTradslag() {
  openOverlay();
  document.getElementById('tradslagPanel').classList.add('open');
}
function closeTradslag() { closeAllPanels(); }

// ── TIDSFÖRDELNING ──
function openTid() {
  openOverlay();
  document.getElementById('tidPanel').classList.add('open');
}
function closeTid() { closeAllPanels(); }

// ── COMPARE ──
function toggleCmp(){
  var btn = document.getElementById('cmpBtn'); if(!btn) return;
  const on = btn.classList.toggle('on');
  var bar = document.getElementById('cmpBar'); if(bar) bar.classList.toggle('show', on);
  if(!on){ const v=document.getElementById('cmpView'); if(v) v.remove(); }
}

function runCmp(){
  const ex=document.getElementById('cmpView'); if(ex) ex.remove();
  const ms=[
    {lbl:'Volym',a:1847,b:1650,unit:'m³'},
    {lbl:'Stammar',a:9240,b:8100,unit:'st'},
    {lbl:'G15-timmar',a:163,b:158,unit:'h'},
    {lbl:'Produktivitet',a:11.3,b:10.4,unit:'m³/G15h'},
    {lbl:'Medelstam',a:0.26,b:0.24,unit:'m³/st'},
  ];
  const div=document.createElement('div');
  div.id='cmpView'; div.style.marginBottom='8px';
  div.innerHTML=\`
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.9px;color:var(--muted);">Jämförelse</div>
      <button onclick="document.getElementById('cmpView').remove()" style="border:none;background:var(--surface2);border-radius:6px;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;color:var(--muted);">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:120px 1fr 32px 1fr;gap:7px;align-items:center;margin-bottom:12px;">
      <div></div>
      <div style="background:rgba(90,255,140,0.08);color:var(--accent);border-radius:7px;padding:9px 14px;font-size:11px;font-weight:600;border:1px solid rgba(90,255,140,0.15);">Period A · Jan 2026</div>
      <div style="text-align:center;font-size:10px;font-weight:700;color:var(--dim);">VS</div>
      <div style="background:rgba(255,179,64,0.08);color:var(--warn);border-radius:7px;padding:9px 14px;font-size:11px;font-weight:600;border:1px solid rgba(255,179,64,0.15);">Period B · Feb 2026</div>
    </div>
    \${ms.map(m=>{
      const d=((m.b-m.a)/m.a*100).toFixed(1);
      const pos=m.b>=m.a;
      const fmt=v=>v>100?v.toLocaleString('sv'):v;
      return \`<div style="display:grid;grid-template-columns:120px 1fr 32px 1fr;gap:7px;align-items:center;margin-bottom:7px;">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);">\${m.lbl}</div>
        <div style="background:var(--surface2);border-radius:10px;padding:12px 16px;display:flex;align-items:baseline;gap:5px;">
          <span style="font-family:'Fraunces',serif;font-size:26px;color:var(--accent)">\${fmt(m.a)}</span>
          <span style="font-size:11px;color:var(--muted)">\${m.unit}</span>
        </div>
        <div style="text-align:center;">
          <div style="border-radius:5px;padding:3px 1px;font-size:10px;font-weight:700;background:\${pos?'rgba(90,255,140,0.1)':'rgba(255,95,87,0.1)'};color:\${pos?'var(--accent)':'var(--danger)'};">\${pos?'+':''}\${d}%</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:12px 16px;display:flex;align-items:baseline;gap:5px;">
          <span style="font-family:'Fraunces',serif;font-size:26px;color:var(--warn)">\${fmt(m.b)}</span>
          <span style="font-size:11px;color:var(--muted)">\${m.unit}</span>
        </div>
      </div>\`;
    }).join('')}
  </div>\`;
  document.getElementById('page').insertBefore(div, document.getElementById('page').firstChild);
}

// ── DAG DATA — DB only ──
const dagData = _db.dagData || {};

const typIcon = { 1:'🌲', 2:'🚛', 3:'🔧' };
const typNamn = { 1:'Produktion', 2:'Flytt', 3:'Service' };

function openDag(dag) {
  const d = dagData[dag];
  if (!d) return;
  document.getElementById('dagIcon').textContent  = typIcon[d.typ] || '📅';
  document.getElementById('dagTitle').textContent = dag + ' februari 2026';
  document.getElementById('dagSub').textContent   = typNamn[d.typ];

  let html = '';

  if (d.flytt) {
    html = \`
      <div class="forar-kpis" style="margin-bottom:20px;">
        <div class="fkpi"><div class="fkpi-v">\${d.start}</div><div class="fkpi-l">Start</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.slut}</div><div class="fkpi-l">Slut</div></div>
        <div class="fkpi"><div class="fkpi-v">7h 30m</div><div class="fkpi-l">Tid</div></div>
      </div>
      <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
        <div class="frow"><span class="frow-l">Sträcka</span><span class="frow-v">\${d.objekt}</span></div>
      </div>\`;
  } else {
    const avbrott = d.avbrott.length > 0
      ? d.avbrott.map(a => \`
          <div class="frow"><span class="frow-l">\${a.orsak}</span><span class="frow-v">\${a.tid}</span></div>
        \`).join('')
      : '<div class="frow" style="border:none"><span class="frow-l" style="color:var(--muted)">Inga avbrott registrerade</span></div>';

    html = \`
      <div class="forar-kpis" style="margin-bottom:16px;">
        <div class="fkpi"><div class="fkpi-v">\${d.vol}</div><div class="fkpi-l">m³ totalt</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.stammar.toLocaleString('sv')}</div><div class="fkpi-l">Stammar</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.g15}h</div><div class="fkpi-l">G15-timmar</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.snitt}</div><div class="fkpi-l">m³/G15h</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.stg15}</div><div class="fkpi-l">st/G15h</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.medelstam}</div><div class="fkpi-l">Medelstam</div></div>
      </div>

      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Skiftinfo</div>
      <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:16px;">
        <div class="frow"><span class="frow-l">Förare</span><span class="frow-v">\${d.forare}</span></div>
        <div class="frow"><span class="frow-l">Objekt</span><span class="frow-v">\${d.objekt}</span></div>
        <div class="frow"><span class="frow-l">Start</span><span class="frow-v">\${d.start}</span></div>
        <div class="frow"><span class="frow-l">Slut</span><span class="frow-v">\${d.slut}</span></div>
        <div class="frow" style="border:none"><span class="frow-l">Diesel</span><span class="frow-v">\${d.diesel} l/m³</span></div>
      </div>

      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Avbrott</div>
      <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">
        \${avbrott}
      </div>\`;
  }

  document.getElementById('dagBody').innerHTML = html;
  openOverlay();
  document.getElementById('dagPanel').classList.add('open');
}

function closeDag() { closeAllPanels(); }

// ── AVBROTT PER FÖRARE EXPAND ──
function parseAvbrottMinuter(tid) {
  let min = 0;
  const hm = tid.match(/(\\d+)\\s*h/);
  const mm = tid.match(/(\\d+)\\s*min/);
  if (hm) min += parseInt(hm[1]) * 60;
  if (mm) min += parseInt(mm[1]);
  return min;
}
function fmtAvbrottTid(min) {
  if (min >= 60) return Math.floor(min/60) + 'h ' + (min%60 > 0 ? (min%60) + 'min' : '');
  return min + ' min';
}
function getForareAvbrott(forareNamn) {
  const orsaker = {};
  Object.values(dagData).forEach(d => {
    if (d.forare !== forareNamn || !d.avbrott) return;
    d.avbrott.forEach(a => {
      if (!orsaker[a.orsak]) orsaker[a.orsak] = { tid: 0, antal: 0 };
      orsaker[a.orsak].tid += parseAvbrottMinuter(a.tid);
      orsaker[a.orsak].antal += 1;
    });
  });
  return Object.entries(orsaker).sort((a,b) => b[1].tid - a[1].tid);
}
function toggleForareAvbrott(el, forareNamn) {
  var existing = el.parentElement.querySelector('.forare-avbrott-detail');
  if (existing) { existing.remove(); return; }
  document.querySelectorAll('.forare-avbrott-detail').forEach(function(e) { e.remove(); });
  var data = getForareAvbrott(forareNamn);
  if (data.length === 0) return;
  var totMin = data.reduce(function(s, item) { return s + item[1].tid; }, 0);
  var rows = data.map(function(item, i) {
    var orsak = item[0]; var v = item[1];
    var pct = totMin > 0 ? Math.round((v.tid / totMin) * 100) : 0;
    var bb = i < data.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:' + bb + ';font-size:11px;">' +
      '<span style="color:var(--muted);">' + orsak + ' <span style="font-size:9px;">(' + v.antal + 'x · ' + pct + '%)</span></span>' +
      '<span style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--warn);">' + fmtAvbrottTid(v.tid) + '</span></div>';
  }).join('');
  var div = document.createElement('div');
  div.className = 'forare-avbrott-detail';
  div.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:8px;padding:4px 14px;margin:4px 0 8px;';
  div.innerHTML = rows;
  el.after(div);
}

// ── OBJ TYP DATA ──
const objTypData = {
  rp: {
    label:'RP', title:'Röjningsprioriterat',
    volym:892, stammar:4120, g15:75.6, prod:11.8, stg15:54, medelstam:0.22,
    objekt:[
      {namn:'Ålshult AU 2025',    volym:512, stammar:2340, prod:12.1},
      {namn:'Svinhult Au 2025',   volym:380, stammar:1780, prod:11.4},
    ]
  },
  au: {
    label:'AU', title:'Avverkning utan krav',
    volym:748, stammar:2980, g15:61.8, prod:12.1, stg15:48, medelstam:0.25,
    objekt:[
      {namn:'Björsamåla AU 2025', volym:401, stammar:1620, prod:12.4},
      {namn:'Karamåla 19 A-S',   volym:347, stammar:1360, prod:11.8},
    ]
  },
  lrk: {
    label:'LRK', title:'Lågriskklass',
    volym:207, stammar:1140, g15:21.1, prod:9.8, stg15:54, medelstam:0.18,
    objekt:[
      {namn:'Karamåla 19 A-S',   volym:207, stammar:1140, prod:9.8},
    ]
  }
};

function openObjTyp(id) {
  const d = objTypData[id];
  document.getElementById('otpLabel').textContent = d.label;
  document.getElementById('otpTitle').textContent = d.title;

  const objRows = d.objekt.map(o => \`
    <div class="frow">
      <span class="frow-l">\${o.namn}</span>
      <div style="display:flex;gap:14px;align-items:center;">
        <span style="font-size:10px;color:var(--muted);">m³/G15h <strong style="color:var(--text)">\${o.prod}</strong></span>
        <span style="font-size:10px;color:var(--muted);">st <strong style="color:var(--text)">\${o.stammar.toLocaleString('sv')}</strong></span>
        <span class="frow-v">\${o.volym.toLocaleString('sv')} m³</span>
      </div>
    </div>\`).join('');

  document.getElementById('otpBody').innerHTML = \`
    <div class="forar-kpis" style="margin-bottom:16px;">
      <div class="fkpi"><div class="fkpi-v">\${d.volym.toLocaleString('sv')}</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.stammar.toLocaleString('sv')}</div><div class="fkpi-l">Stammar</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.g15}h</div><div class="fkpi-l">G15-timmar</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.prod}</div><div class="fkpi-l">m³/G15h</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.stg15}</div><div class="fkpi-l">st/G15h</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.medelstam}</div><div class="fkpi-l">Medelstam</div></div>
    </div>

    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Per objekt</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">
      \${objRows}
    </div>
  \`;

  openOverlay();
  document.getElementById('objTypPanel').classList.add('open');
}
function closeObjTyp() { closeAllPanels(); }


function openObjJmf() {
  const d = objTypData;
  const rows = [
    {lbl:'Volym m³',      rp:d.rp.volym.toLocaleString('sv'),    au:d.au.volym.toLocaleString('sv'),    lrk:d.lrk.volym.toLocaleString('sv'),    best:'au'},
    {lbl:'Stammar',       rp:d.rp.stammar.toLocaleString('sv'),  au:d.au.stammar.toLocaleString('sv'),  lrk:d.lrk.stammar.toLocaleString('sv'),  best:'rp'},
    {lbl:'G15-timmar',    rp:d.rp.g15+'h',                       au:d.au.g15+'h',                       lrk:d.lrk.g15+'h',                       best:'rp'},
    {lbl:'m³/G15h',       rp:d.rp.prod,                          au:d.au.prod,                          lrk:d.lrk.prod,                          best:'au'},
    {lbl:'st/G15h',       rp:d.rp.stg15,                         au:d.au.stg15,                         lrk:d.lrk.stg15,                         best:'rp'},
    {lbl:'Medelstam',     rp:d.rp.medelstam,                     au:d.au.medelstam,                     lrk:d.lrk.medelstam,                     best:'au'},
  ];

  document.getElementById('jmfTableBody').innerHTML = rows.map((r,i) => \`
    <tr style="border-top:1px solid var(--border)\${i===rows.length-1?';border-bottom:none':''}">
      <td style="padding:11px 16px;color:var(--muted);font-size:11px;">\${r.lbl}</td>
      <td style="text-align:right;padding:11px 10px;font-weight:\${r.best==='rp'?'700':'400'};color:\${r.best==='rp'?'rgba(90,255,140,0.9)':'var(--text)'};">\${r.rp}\${r.best==='rp'?' ↑':''}</td>
      <td style="text-align:right;padding:11px 10px;font-weight:\${r.best==='au'?'700':'400'};color:\${r.best==='au'?'rgba(90,255,140,0.9)':'var(--text)'};">\${r.au}\${r.best==='au'?' ↑':''}</td>
      <td style="text-align:right;padding:11px 16px 11px 10px;font-weight:\${r.best==='lrk'?'700':'400'};color:\${r.best==='lrk'?'rgba(90,255,140,0.9)':'var(--text)'};">\${r.lrk}\${r.best==='lrk'?' ↑':''}</td>
    </tr>\`).join('');

  document.getElementById('jmfBest').innerHTML = \`
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Bäst produktivitet</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">AU</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">12.1 m³/G15h</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Mest volym</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">RP</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">892 m³ · 48%</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Lägst medelstam</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">LRK</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">0.18 m³/stam</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Mest stammar/tim</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">RP</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">54 st/G15h</div>
    </div>
  \`;

  openOverlay();
  document.getElementById('objJmfPanel').classList.add('open');
}
function closeObjJmf() { closeAllPanels(); }

// ── UPDATE DOM WITH DB DATA ──
if (_db.operatorer && _db.operatorer.length > 0) {
  // Update operator rows in the card
  // Rebuild operator container from DB data
  var opContainer = document.getElementById('opContainer');
  if (opContainer) {
    opContainer.innerHTML = '';
    var opKeys = Object.keys(forare);
    opKeys.forEach(function(key) {
      var f = forare[key];
      var row = document.createElement('div');
      row.className = 'op-row op-clickable';
      row.setAttribute('onclick', "openForare('" + key + "')");
      row.title = 'Visa förarvy';
      row.innerHTML = '<div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">' + f.av + '</div>'
        + '<div class="op-info"><div class="op-name">' + f.name + '</div><div class="op-sub">' + Math.round(f.timmar) + ' timmar</div></div>'
        + '<div class="op-stats"><div><div class="op-sv" style="color:var(--text)">' + Math.round(f.volym) + ' m³</div><div class="op-sl">volym</div></div>'
        + '<div><div class="op-sv">' + parseFloat(f.prod).toFixed(1) + '</div><div class="op-sl">m³/G15h</div></div></div>';
      opContainer.appendChild(row);
    });
  }

  // Update badge count
  var opBadge = document.getElementById('opBadge');
  if (opBadge) opBadge.textContent = Object.keys(forare).length + ' aktiva';

  // Populate avbrott per förare
  var avbrottContainer = document.getElementById('avbrottForareContainer');
  if (avbrottContainer) {
    avbrottContainer.innerHTML = '';
    var opKeys2 = Object.keys(forare);
    opKeys2.forEach(function(key, i) {
      var f = forare[key];
      var row = document.createElement('div');
      row.className = 'frow';
      row.style.cursor = 'pointer';
      if (i === opKeys2.length - 1) row.style.borderBottom = 'none';
      row.setAttribute('onclick', "toggleForareAvbrott(this,'" + f.name + "')");
      row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex:1;">'
        + '<div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">' + f.av + '</div>'
        + '<span class="frow-l">' + f.name + '</span></div>'
        + '<span class="frow-v">– <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span>';
      avbrottContainer.appendChild(row);
    });
  }
}

// Update time distribution bar & legend if DB data is available
if (_db.engineTimeSek && _db.engineTimeSek > 0) {
  var totalSek = _db.engineTimeSek;
  if (totalSek > 0) {
    var pProc = Math.round((_db.processingSek / totalSek) * 100);
    var pTerr = Math.round((_db.terrainSek / totalSek) * 100);
    var pKort = Math.round((_db.kortStoppSek / totalSek) * 100);
    var pAvbr = Math.round((_db.avbrottSek / totalSek) * 100);
    var pRast = 100 - pProc - pTerr - pKort - pAvbr;

    var tbarSegs = document.querySelectorAll('.tbar .tseg');
    if (tbarSegs.length >= 5) {
      tbarSegs[0].style.flex = String(pProc);
      tbarSegs[1].style.flex = String(pTerr);
      tbarSegs[2].style.flex = String(pKort);
      tbarSegs[3].style.flex = String(pAvbr);
      tbarSegs[4].style.flex = String(pRast);
    }

    var tlegItems = document.querySelectorAll('.tleg .tli');
    if (tlegItems.length >= 5) {
      tlegItems[0].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.3)"></div>Processar ' + pProc + '%';
      tlegItems[1].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.2)"></div>Kör ' + pTerr + '%';
      tlegItems[2].innerHTML = '<div class="tld" style="background:rgba(91,143,255,0.35)"></div>Korta stopp ' + pKort + '%';
      tlegItems[3].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.1)"></div>Avbrott ' + pAvbr + '%';
      tlegItems[4].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.1)"></div>Rast ' + pRast + '%';
    }

    // Update G15 and avbrott summary
    var g15h = Math.round((_db.processingSek + _db.terrainSek) / 3600);
    var avbrH = Math.round(_db.avbrottSek / 3600);
    // Find the ones labeled "Effektiv G15" and "Avbrott"
    document.querySelectorAll('.snum').forEach(function(el) {
      var label = el.querySelector('.snum-l');
      var val = el.querySelector('.snum-v');
      if (!label || !val) return;
      if (label.textContent === 'Effektiv G15') val.textContent = g15h + 'h';
      if (label.textContent === 'Avbrott') val.textContent = avbrH + 'h';
    });
  }
}

// Expose to global scope for onclick handlers
Object.assign(window, {
  toggleMMenu, pickM, openForare, closeForare, openBolag, closeBolag,
  openTradslag, closeTradslag, openTid, closeTid, toggleCmp, runCmp,
  openDag, closeDag, openObjTyp, closeObjTyp, openObjJmf, closeObjJmf,
  toggleForareAvbrott, closeAllPanels
});
})();`;

export default function Maskinvy() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [vald, setVald] = useState('');
  const [activeView, setActiveView] = useState('oversikt');
  const [dataVersion, setDataVersion] = useState(0); // increments on each data load
  const [period, setPeriod] = useState<'V' | 'M' | 'K' | 'Å'>('M');
  const [loading, setLoading] = useState(false);
  const [maskinOpen, setMaskinOpen] = useState(false);

  // ── Hardcoded machines (from database inspection) ──
  useEffect(() => {
    const skordare: Maskin[] = [
      { maskin_id: 'PONS20SDJAA270231', modell: 'Scorpion Giant 8W', tillverkare: 'Ponsse', typ: 'Skördare' },
      { maskin_id: 'R64101', modell: 'H8E', tillverkare: 'Rottne', typ: 'Skördare' },
    ];
    setMaskiner(skordare);
    setVald(skordare[0].modell); // Auto-select Ponsse (mest data)
  }, []);

  // ── Compute date range from period ──
  function getPeriodDates(p: 'V' | 'M' | 'K' | 'Å'): { startDate: string; endDate: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (p === 'V') {
      const day = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { startDate: fmt(mon), endDate: fmt(sun) };
    }
    if (p === 'K') {
      const q = Math.floor(now.getMonth() / 3);
      const qs = new Date(now.getFullYear(), q * 3, 1);
      const qe = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { startDate: fmt(qs), endDate: fmt(qe) };
    }
    if (p === 'Å') {
      return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
    }
    // M (default)
    const ms = new Date(now.getFullYear(), now.getMonth(), 1);
    const me = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: fmt(ms), endDate: fmt(me) };
  }

  // ── Fetch production data from Supabase ──
  const fetchDbData = useCallback(async (maskinId: any, p: 'V' | 'M' | 'K' | 'Å' = 'M') => {
    if (!maskinId) return;
    setLoading(true);
    try {
      let { startDate, endDate } = getPeriodDates(p);

      // For period M: find the most recent month with data (not current calendar month)
      if (p === 'M') {
        const latestRes = await supabase.from('fakt_produktion')
          .select('datum')
          .eq('maskin_id', maskinId)
          .order('datum', { ascending: false })
          .limit(1);
        if (latestRes.data && latestRes.data.length > 0) {
          const latestDate = new Date(latestRes.data[0].datum);
          const pad2 = (n: number) => String(n).padStart(2, '0');
          const monthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
          const monthEnd = new Date(latestDate.getFullYear(), latestDate.getMonth() + 1, 0);
          startDate = `${monthStart.getFullYear()}-${pad2(monthStart.getMonth() + 1)}-01`;
          endDate = `${monthEnd.getFullYear()}-${pad2(monthEnd.getMonth() + 1)}-${pad2(monthEnd.getDate())}`;
          console.log('[Maskinvy] Latest month with data:', { startDate, endDate });
        }
      }

      let prodRes = await supabase.from('fakt_produktion')
        .select('datum, volym_m3sub, stammar, operator_id, objekt_id')
        .eq('maskin_id', maskinId)
        .gte('datum', startDate).lte('datum', endDate);

      console.log('[Maskinvy] Query:', { maskinId, startDate, endDate, rows: prodRes.data?.length, error: prodRes.error?.message });

      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const totalDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;

      const [tidRes, opRes, objRes] = await Promise.all([
        supabase.from('fakt_tid')
          .select('datum, operator_id, objekt_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, avbrott_sek, rast_sek, engine_time_sek, bransle_liter')
          .eq('maskin_id', maskinId)
          .gte('datum', startDate).lte('datum', endDate),
        supabase.from('dim_operator').select('operator_id, operator_key, operator_namn, maskin_id').eq('maskin_id', maskinId),
        supabase.from('dim_objekt').select('objekt_id, objekt_namn, vo_nummer'),
      ]);

      const prodRows = prodRes.data || [];
      const tidRows = tidRes.data || [];
      const operators = opRes.data || [];
      const objekter = objRes.data || [];

      console.log('[Maskinvy] Data loaded:', { maskinId, prodRows: prodRows.length, tidRows: tidRows.length, operators: operators.length, sample: prodRows[0] });

      if (prodRows.length === 0 && tidRows.length === 0) {
        (window as any).__maskinvyData = {};
        setDataVersion(v => v + 1);
        setLoading(false);
        return;
      }

      // ── Daily production arrays ──
      const dailyMap: Record<string, { vol: number; st: number }> = {};
      for (const r of prodRows) {
        if (!dailyMap[r.datum]) dailyMap[r.datum] = { vol: 0, st: 0 };
        dailyMap[r.datum].vol += r.volym_m3sub || 0;
        dailyMap[r.datum].st += r.stammar || 0;
      }

      const dailyVol: number[] = [];
      const dailySt: number[] = [];
      const dayLabels: string[] = [];
      const pad = (n: number) => String(n).padStart(2, '0');
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate);
        d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const entry = dailyMap[dateStr];
        dailyVol.push(entry ? Math.round(entry.vol) : 0);
        dailySt.push(entry ? Math.round(entry.st) : 0);
        dayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      }

      // ── KPI totals ──
      const totalVolym = prodRows.reduce((s: number, r: any) => s + (r.volym_m3sub || 0), 0);
      const totalStammar = prodRows.reduce((s: number, r: any) => s + (r.stammar || 0), 0);

      // ── Time distribution ──
      let processingSek = 0, terrainSek = 0, kortStoppSek = 0, avbrottSek = 0, rastSek = 0, engineTimeSek = 0;
      for (const r of tidRows) {
        processingSek += r.processing_sek || 0;
        terrainSek += r.terrain_sek || 0;
        kortStoppSek += r.other_work_sek || 0;
        avbrottSek += (r.disturbance_sek || 0) + (r.maintenance_sek || 0);
        rastSek += r.rast_sek || 0;
        engineTimeSek += r.engine_time_sek || 0;
      }

      const g15Sek = processingSek + terrainSek;
      const g15Timmar = g15Sek / 3600;
      const produktivitet = g15Timmar > 0 ? totalVolym / g15Timmar : 0;
      const medelstam = totalStammar > 0 ? totalVolym / totalStammar : 0;

      // ── Operators ──
      const opMap: Record<string, { volym: number; stammar: number; g15sek: number; dagar: Set<string> }> = {};
      for (const r of prodRows) {
        const opId = r.operator_id;
        if (!opId) continue;
        if (!opMap[opId]) opMap[opId] = { volym: 0, stammar: 0, g15sek: 0, dagar: new Set() };
        opMap[opId].volym += r.volym_m3sub || 0;
        opMap[opId].stammar += r.stammar || 0;
        opMap[opId].dagar.add(r.datum);
      }
      for (const r of tidRows) {
        const opId = r.operator_id;
        if (!opId) continue;
        if (!opMap[opId]) opMap[opId] = { volym: 0, stammar: 0, g15sek: 0, dagar: new Set() };
        opMap[opId].g15sek += (r.processing_sek || 0) + (r.terrain_sek || 0);
      }

      const operatorer = Object.entries(opMap).map(([opId, stats]) => {
        const opInfo = operators.find((o: any) => String(o.operator_id) === String(opId));
        const namn = opInfo?.operator_namn || `Operatör ${opId}`;
        const nameParts = namn.split(' ');
        const initialer = nameParts.length >= 2
          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
          : namn.substring(0, 2).toUpperCase();
        const timmar = stats.g15sek / 3600;
        const prod = timmar > 0 ? stats.volym / timmar : 0;
        return {
          id: opId,
          key: opInfo?.operator_key || nameParts[0].toLowerCase(),
          namn,
          initialer,
          timmar,
          volym: stats.volym,
          prod,
          medelstam: stats.stammar > 0 ? stats.volym / stats.stammar : 0,
          stammar: stats.stammar,
          dagar: stats.dagar.size,
        };
      }).sort((a, b) => b.volym - a.volym);

      // ── Objekt ──
      const objMap: Record<string, { volym: number; stammar: number; g15sek: number }> = {};
      for (const r of prodRows) {
        const oid = r.objekt_id;
        if (!oid) continue;
        if (!objMap[oid]) objMap[oid] = { volym: 0, stammar: 0, g15sek: 0 };
        objMap[oid].volym += r.volym_m3sub || 0;
        objMap[oid].stammar += r.stammar || 0;
      }
      for (const r of tidRows) {
        const oid = r.objekt_id;
        if (!oid || !objMap[oid]) continue;
        objMap[oid].g15sek += (r.processing_sek || 0) + (r.terrain_sek || 0);
      }

      const objekt = Object.entries(objMap).map(([oid, stats]) => {
        const objInfo = objekter.find((o: any) => String(o.objekt_id) === String(oid));
        const g15h = stats.g15sek / 3600;
        return {
          objekt_id: oid,
          namn: objInfo?.objekt_namn || `Objekt ${oid}`,
          vo_nummer: objInfo?.vo_nummer || '',
          volym: stats.volym,
          stammar: stats.stammar,
          g15h,
          prod: g15h > 0 ? stats.volym / g15h : 0,
        };
      }).sort((a, b) => b.volym - a.volym);

      // ── Build dagData from daily aggregation ──
      const dagData: DbData['dagData'] = {};
      const calendarDt: number[] = new Array(totalDays).fill(0);

      // Group prod+tid per day
      const dayDetail: Record<string, { vol: number; st: number; g15sek: number; opId: string; objId: string; diesel: number }> = {};
      for (const r of prodRows) {
        if (!dayDetail[r.datum]) dayDetail[r.datum] = { vol: 0, st: 0, g15sek: 0, opId: '', objId: '', diesel: 0 };
        dayDetail[r.datum].vol += r.volym_m3sub || 0;
        dayDetail[r.datum].st += r.stammar || 0;
        if (r.operator_id) dayDetail[r.datum].opId = r.operator_id;
        if (r.objekt_id) dayDetail[r.datum].objId = r.objekt_id;
      }
      for (const r of tidRows) {
        if (!dayDetail[r.datum]) dayDetail[r.datum] = { vol: 0, st: 0, g15sek: 0, opId: '', objId: '', diesel: 0 };
        dayDetail[r.datum].g15sek += (r.processing_sek || 0) + (r.terrain_sek || 0);
        dayDetail[r.datum].diesel += r.bransle_liter || 0;
        if (r.operator_id) dayDetail[r.datum].opId = r.operator_id;
      }

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate);
        d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const dd = dayDetail[dateStr];
        if (dd && dd.vol > 0) {
          const dayNum = i + 1;
          const g15h = dd.g15sek / 3600;
          const opInfo = operators.find((o: any) => String(o.operator_id) === String(dd.opId));
          const objInfo = objekter.find((o: any) => String(o.objekt_id) === String(dd.objId));
          dagData[dayNum] = {
            typ: 1, forare: opInfo?.operator_namn || '–',
            objekt: objInfo?.objekt_namn || '–',
            start: '07:00', slut: '16:30',
            vol: Math.round(dd.vol), stammar: Math.round(dd.st),
            g15: parseFloat(g15h.toFixed(1)),
            snitt: g15h > 0 ? parseFloat((dd.vol / g15h).toFixed(1)) : 0,
            stg15: g15h > 0 ? Math.round(dd.st / g15h) : 0,
            medelstam: dd.st > 0 ? parseFloat((dd.vol / dd.st).toFixed(2)) : 0,
            diesel: dd.vol > 0 ? parseFloat((dd.diesel / dd.vol).toFixed(1)) : 0,
            avbrott: [],
          };
          calendarDt[i] = 1;
        }
      }

      console.log('[Maskinvy] Computed data:', {
        maskinId, period: p,
        totalVolym: Math.round(totalVolym),
        totalStammar: Math.round(totalStammar),
        g15Timmar: Math.round(g15Timmar),
        produktivitet: produktivitet.toFixed(1),
        operatorer: operatorer.map(o => ({ namn: o.namn, volym: Math.round(o.volym), prod: o.prod.toFixed(1) })),
        dagDataKeys: Object.keys(dagData),
      });

      const dbData: DbData = {
        dailyVol,
        dailySt,
        days: dayLabels,
        totalVolym: Math.round(totalVolym),
        totalStammar: Math.round(totalStammar),
        g15Timmar: Math.round(g15Timmar),
        produktivitet: parseFloat(produktivitet.toFixed(1)),
        medelstam: parseFloat(medelstam.toFixed(2)),
        processingSek,
        terrainSek,
        kortStoppSek,
        avbrottSek,
        rastSek,
        engineTimeSek,
        operatorer,
        objekt,
        dagData,
        calendarDt,
      };

      (window as any).__maskinvyData = dbData;
      setDataVersion(v => v + 1);
      setLoading(false);
    } catch (err) {
      console.error('Maskinvy: failed to fetch DB data', err);
      (window as any).__maskinvyData = {};
      setDataVersion(v => v + 1);
      setLoading(false);
    }
  }, []);

  // Fetch data when machine or period changes
  useEffect(() => {
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (valdMaskinObj) {
      console.log('[Maskinvy] Trigger fetch:', { modell: vald, maskin_id: valdMaskinObj.maskin_id, period });
      fetchDbData(valdMaskinObj.maskin_id, period);
    }
  }, [vald, maskiner, period, fetchDbData]);

  // ── Re-initialize charts every time data updates ──
  useEffect(() => {
    if (dataVersion === 0) return;

    let scriptEl: HTMLScriptElement | null = null;
    let timer: ReturnType<typeof setTimeout>;

    function destroyCharts() {
      if (typeof window !== 'undefined' && (window as any).Chart) {
        document.querySelectorAll('canvas').forEach((c) => {
          const chart = (window as any).Chart.getChart(c as HTMLCanvasElement);
          if (chart) chart.destroy();
        });
      }
      // Remove old script elements
      document.querySelectorAll('script[data-maskinvy]').forEach(el => el.remove());
    }

    function runScript() {
      timer = setTimeout(() => {
        if (!document.getElementById('dailyChart')) {
          console.warn('[Maskinvy] DOM not ready, retrying in 200ms');
          timer = setTimeout(runScript, 200);
          return;
        }
        destroyCharts();
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-maskinvy', 'true');
        scriptEl.textContent = MASKINVY_SCRIPT;
        document.body.appendChild(scriptEl);
        console.log('[Maskinvy] Charts initialized (v' + dataVersion + ')');
      }, 500);
    }

    if (typeof window !== 'undefined' && !(window as any).Chart) {
      const chartJs = document.createElement('script');
      chartJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      chartJs.onload = runScript;
      document.head.appendChild(chartJs);
    } else {
      runScript();
    }

    return () => {
      if (timer) clearTimeout(timer);
      destroyCharts();
    };
  }, [dataVersion]);

  useEffect(() => {
    const page = document.getElementById('page');
    if (page) page.setAttribute('data-view', activeView);
  }, [activeView]);

  const valdMaskin = maskiner.find(m => m.modell === vald);

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, display: 'flex', zIndex: 1 }}>
      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(15,15,14,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ color: '#7a7a72', fontSize: 14, fontFamily: "'Geist', system-ui, sans-serif" }}>Laddar data...</div>
        </div>
      )}
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 220, flexShrink: 0, background: '#0f0f0e', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', fontFamily: "'Geist', system-ui, sans-serif",
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a4a2e', border: '1px solid rgba(90,255,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🌲</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e4', letterSpacing: '-0.3px' }}>Dashboard</span>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { icon: '◻', label: 'Översikt', view: 'oversikt' },
            { icon: '▤', label: 'Produktion', view: 'produktion' },
            { icon: '◉', label: 'Operatörer', view: 'operatorer' },
            { icon: '⬡', label: 'Trädslag', view: 'tradslag' },
            { icon: '▣', label: 'Objekt', view: 'objekt' },
            { icon: '⊘', label: 'Kalibrering', view: 'kalibrering' },
          ].map(item => {
            const isActive = activeView === item.view;
            return (
            <div key={item.label} onClick={() => setActiveView(item.view)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
              background: isActive ? '#1e1e1c' : 'transparent',
              borderLeft: isActive ? '3px solid #00c48c' : '3px solid transparent',
              color: isActive ? '#e8e8e4' : '#666',
              fontSize: 13, fontWeight: 500,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center', opacity: isActive ? 1 : 0.5 }}>{item.icon}</span>
              {item.label}
            </div>
            );
          })}
        </nav>
        {/* Maskin + Period at bottom */}
        <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Maskin — custom dropdown that opens UPWARD */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666', marginBottom: 2 }}>Maskin</div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMaskinOpen(!maskinOpen)}
              style={{
                width: '100%', background: '#1a1a18', color: '#e8e8e4',
                border: maskinOpen ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '8px 10px', fontSize: 12,
                fontFamily: "'Geist', system-ui, sans-serif",
                outline: 'none', cursor: 'pointer', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span>{maskiner.find(m => m.modell === vald)
                ? `${maskiner.find(m => m.modell === vald)!.tillverkare} ${vald}`
                : 'Välj maskin...'}</span>
              <span style={{ fontSize: 10, color: '#555', transform: maskinOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▲</span>
            </button>
            {maskinOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#1a1a18', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, overflow: 'hidden', zIndex: 50,
                boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {maskiner.map((m, i) => (
                  <button
                    key={m.maskin_id}
                    onClick={() => { setVald(m.modell); setMaskinOpen(false); }}
                    style={{
                      width: '100%', padding: '9px 12px', border: 'none',
                      borderBottom: i < maskiner.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: m.modell === vald ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: m.modell === vald ? '#e8e8e4' : '#999',
                      fontSize: 12, fontFamily: "'Geist', system-ui, sans-serif",
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {m.tillverkare} {m.modell}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Period */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666', marginTop: 8, marginBottom: 2 }}>Period</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['V', 'M', 'K', 'Å'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                flex: 1, padding: '5px 0', border: 'none', borderRadius: 6,
                background: period === p ? '#1e1e1c' : 'transparent',
                color: period === p ? '#e8e8e4' : '#555',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Geist', system-ui, sans-serif",
              }}>{p}</button>
            ))}
          </div>
        </div>
      </aside>
      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', background: '#111110' }}>
      <style dangerouslySetInnerHTML={{ __html: `.mach-wrap { display: none !important; }
.hdr { display: none !important; }
.cmp-bar { display: none !important; }

/* ── VIEW SWITCHING ── */
.view-section { display: none !important; }
.page[data-view="oversikt"] .vs-oversikt { display: block !important; }
.page[data-view="produktion"] .vs-produktion { display: block !important; }
.page[data-view="operatorer"] .vs-operatorer { display: block !important; }
.page[data-view="tradslag"] .vs-tradslag { display: block !important; }
.page[data-view="objekt"] .vs-objekt { display: block !important; }
.page[data-view="kalibrering"] .vs-kalibrering { display: block !important; }
/* grids need display:grid */
.page[data-view="oversikt"] .vs-oversikt.hero { display: grid !important; }
.page[data-view="oversikt"] .vs-oversikt.g2 { display: grid !important; }
.page[data-view="operatorer"] .vs-operatorer.g2 { display: grid !important; }
.page[data-view="objekt"] .vs-objekt.g2 { display: grid !important; }
.page[data-view="produktion"] .vs-produktion.g2 { display: grid !important; }
:root {
  --bg:       #111110;
  --surface:  #1a1a18;
  --surface2: #222220;
  --border:   rgba(255,255,255,0.07);
  --border2:  rgba(255,255,255,0.12);
  --text:     #e8e8e4;
  --muted:    #7a7a72;
  --dim:      #3a3a36;
  --accent:   #00c48c;
  --accent2:  #1a4a2e;
  --warn:     #ffb340;
  --danger:   #ff5f57;
  --blue:     #5b8fff;
}

*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

/* ── HEADER ── */
.hdr {
  position: sticky; top: 0; z-index: 100;
  background: rgba(17,17,16,0.88);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
  height: 48px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px;
}

.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark {
  width: 30px; height: 30px; border-radius: 7px;
  background: var(--accent2); border: 1px solid rgba(90,255,140,0.2);
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.brand-name {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 15px; font-weight: 500; letter-spacing: -0.3px;
  color: var(--text);
}

.hdr-mid { display: flex; gap: 2px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 3px; }
.tab {
  padding: 4px 14px; border: none; background: transparent; border-radius: 6px;
  font-family: 'Geist', sans-serif; font-size: 12px; font-weight: 500;
  color: var(--muted); cursor: pointer; transition: all 0.15s;
}
.tab.on { background: var(--surface2); color: var(--text); }

.hdr-r { display: flex; align-items: center; gap: 8px; }

.cmp-btn {
  padding: 5px 12px; border: 1px solid var(--border2); border-radius: 7px;
  background: transparent; font-family: 'Geist', sans-serif;
  font-size: 12px; font-weight: 500; color: var(--muted); cursor: pointer;
  transition: all 0.15s;
}
.cmp-btn:hover { color: var(--text); border-color: var(--muted); }
.cmp-btn.on { background: var(--accent2); color: var(--accent); border-color: rgba(90,255,140,0.3); }

.mach-wrap { position: relative; }
.mach-btn {
  display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  background: var(--surface); border: 1px solid var(--border2); border-radius: 7px;
  font-family: 'Geist', sans-serif; font-size: 12px; font-weight: 500;
  color: var(--text); cursor: pointer; transition: border-color 0.15s;
}
.mach-btn:hover { border-color: var(--muted); }
.m-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

.mach-menu {
  display: none; position: absolute; top: calc(100%+6px); right: 0;
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: 12px; min-width: 260px; padding: 5px; z-index: 300;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.mach-menu.open { display: block; animation: pop 0.15s ease; }
@keyframes pop { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

.mach-opt {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 8px; cursor: pointer; transition: background 0.1s;
}
.mach-opt:hover { background: var(--surface2); }
.mach-opt.sel { background: var(--accent2); }
.mach-opt-name { font-size: 13px; font-weight: 500; }
.mach-opt-sub  { font-size: 11px; color: var(--muted); margin-top: 1px; }

/* ── COMPARE BAR ── */
.cmp-bar {
  display: none; background: var(--surface); border-bottom: 1px solid var(--border);
  padding: 12px 36px; gap: 12px; align-items: center;
}
.cmp-bar.show { display: flex; }
.cmp-period {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  background: var(--surface2); border-radius: 7px; border: 1px solid var(--border);
  flex: 1; max-width: 300px;
}
.cmp-lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; white-space: nowrap; }
.cmp-lbl.a { color: var(--accent); }
.cmp-lbl.b { color: var(--warn); }
.cmp-period input[type=date] { border: none; background: transparent; font-family: 'Geist', sans-serif; font-size: 12px; color: var(--text); outline: none; cursor: pointer; color-scheme: dark; }
.cmp-sep { color: var(--dim); }
.cmp-vs { font-size: 11px; font-weight: 700; color: var(--dim); }
.cmp-go { padding: 7px 18px; background: var(--accent); color: #0a1a10; border: none; border-radius: 7px; font-family: 'Geist', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; margin-left: auto; transition: opacity 0.15s; }
.cmp-go:hover { opacity: 0.85; }

/* ── PAGE ── */
.page { max-width: 1400px; margin: 0 auto; padding: 24px 28px 60px; }

/* ── ANIMATIONS ── */
@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
.anim { opacity: 0; animation: fadeUp 0.5s forwards; }

/* ── HERO (4 KPI row) ── */
.hero { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.hero-main { grid-column: auto; }

.hero-main {
  background: #161614; border: 1px solid var(--border);
  border-radius: 16px; padding: 24px;
  position: relative; overflow: hidden;
  animation-delay: 0.05s;
}
.hero-main::after { display: none; }

.hero-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 10px; }
.hero-val {
  font-family: 'Geist', system-ui, sans-serif; font-size: 32px; line-height: 1;
  font-weight: 700; letter-spacing: -1px; color: var(--accent);
  margin-bottom: 4px;
}
.hero-unit { font-size: 12px; color: #888; font-weight: 400; }
.hero-delta { margin-top: 12px; font-size: 11px; color: var(--accent); opacity: 0.9; display: flex; align-items: center; gap: 4px; }

.kpi {
  background: #161614; border: 1px solid var(--border); border-radius: 16px;
  padding: 24px; position: relative; overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.kpi:hover { border-color: var(--border2); transform: translateY(-1px); }
.kpi:nth-child(2){animation-delay:0.1s} .kpi:nth-child(3){animation-delay:0.15s}
.kpi:nth-child(4){animation-delay:0.2s} .kpi:nth-child(5){animation-delay:0.25s}

.k-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 10px; }
.k-val { font-family: 'Geist', system-ui, sans-serif; font-size: 32px; line-height: 1; font-weight: 700; letter-spacing: -1px; color: var(--text); margin-bottom: 4px; }
.k-unit { font-size: 12px; color: #888; }
.k-delta { margin-top: 10px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 20px; }
.up   { color: var(--accent); background: rgba(90,255,140,0.1); }
.down { color: var(--danger); background: rgba(255,95,87,0.1); }

/* ── CARD ── */
.card {
  background: #161614; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px;
  overflow: hidden; transition: border-color 0.2s;
}
.card:hover { border-color: var(--border2); }
.card-h { padding: 20px 24px 0; display: flex; align-items: center; justify-content: space-between; }
.card-t { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #666; }
.card-b { padding: 16px 24px 24px; }

/* ── GRID ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.gf { margin-bottom: 16px; }

/* ── BADGE ── */
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.3px; }
.bg  { background: rgba(90,255,140,0.1);  color: var(--accent); }
.bw  { background: rgba(255,179,64,0.1);  color: var(--warn); }
.bs  { background: rgba(255,179,64,0.12); color: var(--warn); }
.bgall { background: rgba(90,255,140,0.1); color: var(--accent); }
.bd  { background: rgba(255,95,87,0.1);   color: var(--danger); }
.bm  { background: rgba(255,255,255,0.06); color: var(--muted); }

/* ── DIVIDER ── */
.div { height: 1px; background: var(--border); }

/* ── OPERATORS ── */
.op-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.op-row:last-child { border-bottom: none; padding-bottom: 0; }
.op-row:first-child { padding-top: 0; }
.op-av { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.op-name { font-size: 13px; font-weight: 500; }
.op-sub  { font-size: 11px; color: var(--muted); }
.op-info { flex: 1; }
.op-stats { display: flex; gap: 16px; }
.op-sv { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.op-sl { font-size: 10px; color: var(--muted); }

/* ── PROGRESS ── */
.prog { height: 6px; background: var(--dim); border-radius: 3px; overflow: hidden; margin-top: 5px; }
.pf   { height: 100%; border-radius: 2px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }

/* ── KALIBRERING ── */
.kal { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--surface2); border-radius: 8px; margin-bottom: 6px; }
.kal:last-child { margin-bottom: 0; }
.kal-d { font-size: 11px; color: var(--muted); width: 76px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.kal-v { flex: 1; font-size: 12px; font-weight: 500; }

/* ── TRADSLAG ── */
.ts  { padding: 9px 0; border-bottom: 1px solid var(--border); }
.ts:last-child { border-bottom: none; padding-bottom: 0; }
.ts:first-child { padding-top: 0; }
.ts-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
.ts-n { font-size: 13px; font-weight: 400; }
.ts-v { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }

/* ── TABLE ── */
.tbl { width: 100%; border-collapse: collapse; }
.tbl th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); padding: 0 0 10px; border-bottom: 1px solid var(--border); }
.tbl td { padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 12px; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: rgba(255,255,255,0.02); }
.tn { font-weight: 600; font-size: 12px; }
.ts2{ font-size: 10px; color: var(--muted); margin-top: 1px; }

/* ── INK ── */
.ink-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.ink-row:last-child { border-bottom: none; padding-bottom: 0; }
.ink-row:first-child { padding-top: 0; }
.ink-logo { width: 30px; height: 30px; border-radius: 6px; background: var(--surface2); border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: var(--muted); flex-shrink: 0; }
.ink-name { font-size: 12px; font-weight: 400; flex: 1; }
.ink-vol  { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }

/* ── CALENDAR ── */
.cal-names { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-bottom: 5px; }
.cal-dn { text-align: center; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dim); padding-bottom: 3px; }
.cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
.cal-cell {
  aspect-ratio: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 500; cursor: default; transition: transform 0.1s, opacity 0.1s;
}
.cal-cell:hover { transform: scale(1.1); }
.c-prod    { background: rgba(90,255,140,0.18); color: rgba(255,255,255,0.9); }
.c-flytt   { background: rgba(91,143,255,0.18); color: rgba(255,255,255,0.9); }
.c-service { background: rgba(255,179,64,0.15); color: var(--warn); }
.c-off     { background: rgba(255,255,255,0.03); color: var(--dim); }

.cal-sum { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-top: 12px; }
.cal-si { background: var(--surface2); border-radius: 8px; padding: 10px 8px; text-align: center; }
.cal-sn { font-family: 'Geist', system-ui, sans-serif; font-size: 20px; font-weight: 700; line-height: 1; }
.cal-sl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-top: 3px; }

/* ── MEDELSTAM CARDS ── */
.sc-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 6px; margin-top: 14px; }
.sc {
  background: var(--surface2); border-radius: 10px; padding: 11px 6px; text-align: center;
  border: 1px solid transparent; transition: all 0.15s; cursor: default;
}
.sc:hover { border-color: var(--border2); background: var(--surface); }
.sc.best { border-color: rgba(90,255,140,0.2); }
.sc-k { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 0.3px; margin-bottom: 7px; text-transform: uppercase; }
.sc-p { font-family: 'Geist', system-ui, sans-serif; font-size: 16px; font-weight: 700; line-height: 1; margin-bottom: 1px; }
.sc-u { font-size: 9px; color: var(--muted); margin-bottom: 6px; }
.sc-d { height: 1px; background: var(--border); margin: 5px 0; }
.sc-s { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sc-sl{ font-size: 9px; color: var(--muted); }
.sc-x { font-size: 9px; color: var(--dim); margin-top: 4px; }

/* ── CHART LEGEND ── */
.cleg { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.li { display: flex; align-items: center; gap: 4px; }
.ld { width: 7px; height: 7px; border-radius: 50%; }
.cdiv { height: 1px; background: var(--border); margin: 18px 0; }

/* ── SMALL NUMS ── */
.snum-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 12px; }
.snum { background: var(--surface2); border-radius: 8px; padding: 10px; text-align: center; }
.snum-v { font-family: 'Geist', system-ui, sans-serif; font-size: 17px; font-weight: 700; line-height: 1; }
.snum-l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-top: 3px; }

/* ── TIDS-BAR ── */
.tbar { display: flex; height: 18px; border-radius: 5px; overflow: hidden; gap: 2px; margin-bottom: 14px; }
.tseg { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; }
.tleg { display: flex; flex-wrap: wrap; gap: 10px; }
.tli  { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
.tld  { width: 6px; height: 6px; border-radius: 2px; }

.op-clickable { cursor: pointer; transition: background 0.15s; border-radius: 8px; margin: 0 -8px; padding-left: 8px; padding-right: 8px; }
.op-clickable:hover { background: rgba(255,255,255,0.04); }
.op-clickable:hover .op-name::after { content: ' →'; opacity: 0.4; font-size: 11px; }

/* ── FÖRAR PANEL ── */
.forar-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px); z-index: 500;
  opacity: 0; pointer-events: none; transition: opacity 0.25s;
}
.forar-overlay.open { opacity: 1; pointer-events: all; }

.forar-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(520px, 100vw); background: var(--surface);
  border-left: 1px solid var(--border2);
  z-index: 501; overflow-y: auto;
  transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
}
.forar-panel.open { transform: translateX(0); }

.forar-head {
  position: sticky; top: 0; background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 18px 24px; display: flex; align-items: center; gap: 14px;
  z-index: 10;
}
.forar-av {
  width: 44px; height: 44px; border-radius: 50%;
  background: rgba(255,255,255,0.07);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.7);
  flex-shrink: 0;
}
.forar-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500; }
.forar-sub   { font-size: 11px; color: var(--muted); margin-top: 2px; }
.forar-close {
  margin-left: auto; width: 30px; height: 30px; border-radius: 50%;
  background: rgba(255,255,255,0.07); border: none; cursor: pointer;
  color: var(--muted); font-size: 14px; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.forar-close:hover { background: rgba(255,255,255,0.12); color: var(--text); }

.forar-body { padding: 20px 24px 40px; }

.forar-kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 20px; }
.fkpi { background: #161614; border-radius: 10px; padding: 14px 12px; text-align: center; }
.fkpi-v { font-family: 'Geist', system-ui, sans-serif; font-size: 22px; font-weight: 700; line-height: 1; color: var(--text); }
.fkpi-l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); margin-top: 4px; }

.fsec-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 10px; }
.fsec { margin-bottom: 20px; }

.frow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.frow:last-child { border-bottom: none; }
.frow-l { color: var(--muted); }
.frow-v { font-weight: 600; font-variant-numeric: tabular-nums; }

/* ── BOLAG PANEL ── */
.ink-clickable { cursor: pointer; transition: background 0.12s; border-radius: 8px; margin: 0 -8px; padding-left: 8px; padding-right: 8px; }
.ink-clickable:hover { background: rgba(255,255,255,0.04); }

.bolag-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(480px, 100vw); background: var(--surface);
  border-left: 1px solid var(--border2);
  z-index: 501; overflow-y: auto;
  transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
}
.bolag-panel.open { transform: translateX(0); }

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }


.dag-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(460px, 100vw); background: var(--surface);
  border-left: 1px solid var(--border2);
  z-index: 501; overflow-y: auto;
  transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
}
.dag-panel.open { transform: translateX(0); }
.cal-cell.c-prod { cursor: pointer; }
.cal-cell.c-flytt { cursor: pointer; }
.cal-cell.c-service { cursor: pointer; }` }} />
      <div dangerouslySetInnerHTML={{ __html: `<header class="hdr">
  <div class="brand">
    <div class="brand-mark">🌲</div>
  </div>

  <div class="hdr-mid">
    <button class="tab">Vecka</button>
    <button class="tab on">Månad</button>
    <button class="tab">Kvartal</button>
    <button class="tab">År</button>
  </div>

  <div class="hdr-r">
    <button class="cmp-btn" id="cmpBtn" onclick="toggleCmp()">⇄ Jämför</button>
    <div class="mach-wrap">
      <div class="mach-btn" onclick="toggleMMenu()">
        <div class="m-dot" id="mDot" style="background:var(--accent)"></div>
        <span id="mName">Ponsse Scorpion Giant 8W</span>
        <span style="color:var(--dim);font-size:10px;margin-left:2px">▾</span>
      </div>
      <div class="mach-menu" id="mMenu">
        <div class="mach-opt sel" onclick="pickM(this,'Ponsse Scorpion Giant 8W','Skördare · PONS20SDJAA270231','var(--accent)')">
          <div class="m-dot" style="background:var(--accent)"></div>
          <div><div class="mach-opt-name">Ponsse Scorpion Giant 8W</div><div class="mach-opt-sub">Skördare · PONS20SDJAA270231</div></div>
        </div>
        <div class="mach-opt" onclick="pickM(this,'Ponsse Elephant King AF','Skotare · A110148','var(--blue)')">
          <div class="m-dot" style="background:var(--blue)"></div>
          <div><div class="mach-opt-name">Ponsse Elephant King AF</div><div class="mach-opt-sub">Skotare · A110148</div></div>
        </div>
        <div class="mach-opt" onclick="pickM(this,'Rottne H8E','Gallringsskördare · R64101','var(--warn)')">
          <div class="m-dot" style="background:var(--warn)"></div>
          <div><div class="mach-opt-name">Rottne H8E</div><div class="mach-opt-sub">Gallringsskördare · R64101</div></div>
        </div>
      </div>
    </div>
  </div>
</header>

<div class="cmp-bar" id="cmpBar">
  <div class="cmp-period">
    <span class="cmp-lbl a">A</span>
    <input type="date" value="2026-01-01">
    <span class="cmp-sep">–</span>
    <input type="date" value="2026-01-31">
  </div>
  <span class="cmp-vs">VS</span>
  <div class="cmp-period">
    <span class="cmp-lbl b">B</span>
    <input type="date" value="2026-02-01">
    <span class="cmp-sep">–</span>
    <input type="date" value="2026-02-28">
  </div>
  <button class="cmp-go" onclick="runCmp()">Visa →</button>
</div>

<div class="page" id="page" data-view="oversikt">

  <!-- KPI ROW — 4 cards -->
  <div class="hero view-section vs-oversikt" id="sec-oversikt">
    <div class="hero-main anim" style="animation-delay:0.05s">
      <div class="hero-label">Volym</div>
      <div class="hero-val" id="hv">0</div>
      <div class="hero-unit">m³sub</div>
      <div class="hero-delta" id="hvDelta"></div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Stammar</div>
      <div class="k-val" data-count="0">0</div>
      <div class="k-unit">stammar</div>
      <div class="k-delta"></div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Produktivitet</div>
      <div class="k-val" data-count="0" data-dec="1">0</div>
      <div class="k-unit">m³/G15h</div>
      <div class="k-delta"></div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Medelstam</div>
      <div class="k-val" data-count="0" data-dec="2">0</div>
      <div class="k-unit">m³/stam</div>
      <div class="k-delta"></div>
    </div>
  </div>

  <!-- ROW 1: Operatörer + Tidsfördelning -->
  <div class="g2 view-section vs-oversikt vs-operatorer" id="sec-operatorer">
    <div class="card anim" style="animation-delay:0.3s">
      <div class="card-h"><div class="card-t">Operatörer</div><span class="badge bg" id="opBadge">–</span></div>
      <div class="card-b" id="opContainer">
        <!-- Populated dynamically from DB -->
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.35s;cursor:pointer;" onclick="openTid()">
      <div class="card-h"><div class="card-t">Tidsfördelning</div></div>
      <div class="card-b">
        <div class="tbar">
          <div class="tseg" style="flex:66;background:rgba(90,255,140,0.25)"></div>
          <div class="tseg" style="flex:14;background:rgba(91,143,255,0.2)"></div>
          <div class="tseg" style="flex:2;background:rgba(91,143,255,0.35)"></div>
          <div class="tseg" style="flex:11;background:rgba(255,179,64,0.2)"></div>
          <div class="tseg" style="flex:7;background:rgba(255,255,255,0.04)"></div>
        </div>
        <div class="tleg">
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.3)"></div>Processar 66%</div>
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.2)"></div>Kör 14%</div>
          <div class="tli"><div class="tld" style="background:rgba(91,143,255,0.35)"></div>Korta stopp 2%</div>
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Avbrott 11%</div>
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Rast 7%</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px;">
          <div class="snum"><div class="snum-v" style="color:var(--text)">111h</div><div class="snum-l">Effektiv G15</div></div>
          <div class="snum"><div class="snum-v">18h</div><div class="snum-l">Avbrott</div></div>
        </div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för avbrottsdetaljer →</div>
      </div>
    </div>

  </div>

  <!-- Trädslag -->
  <div class="gf view-section vs-tradslag" id="sec-tradslag">
    <div class="card anim" style="animation-delay:0.45s">
      <div class="card-h"><div class="card-t">Trädslag</div></div>
      <div class="card-b" onclick="openTradslag()" style="cursor:pointer;">
        <div class="ts"><div class="ts-top"><span class="ts-n">Gran</span><span class="ts-v">1 124 m³ · 61%</span></div><div class="prog"><div class="pf" style="width:61%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">Tall</span><span class="ts-v">498 m³ · 27%</span></div><div class="prog"><div class="pf" style="width:27%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">Björk</span><span class="ts-v">185 m³ · 10%</span></div><div class="prog"><div class="pf" style="width:10%;background:rgba(255,255,255,0.15)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">Övrigt</span><span class="ts-v">40 m³ · 2%</span></div><div class="prog"><div class="pf" style="width:2%;background:rgba(255,255,255,0.08)"></div></div></div>
        <div class="snum-grid">
          <div class="snum"><div class="snum-v">23%</div><div class="snum-l">MTH-andel</div></div>
          <div class="snum"><div class="snum-v">0.07</div><div class="snum-l">MTH stam</div></div>
          <div class="snum"><div class="snum-v">0.26</div><div class="snum-l">Single stam</div></div>
        </div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för sortiment per trädslag →</div>
      </div>
    </div>
  </div>

  <!-- Kalibrering -->
  <div class="gf view-section vs-kalibrering">
    <div class="card anim" id="sec-kalibrering" style="animation-delay:0.4s;cursor:pointer;" onclick="window.location.href='/kalibrering?maskin=PONS20SDJAA270231'" title="Gå till kalibreringssidan">
      <div class="card-h"><div class="card-t">Kalibrering (HQC)</div><span class="badge bg">OK</span></div>
      <div class="card-b">
        <div class="kal"><div class="kal-d">2026-02-28</div><div class="kal-v">Längd −0.4 cm · Dia +1.8 mm</div><span class="badge bg">OK</span></div>
        <div class="kal"><div class="kal-d">2026-02-14</div><div class="kal-v">Längd +0.2 cm · Dia −0.9 mm</div><span class="badge bg">OK</span></div>
        <div class="kal"><div class="kal-d">2026-01-31</div><div class="kal-v" style="color:var(--warn)">Längd +3.1 cm · Dia +5.2 mm</div><span class="badge bw">VARNING</span></div>
        <div class="kal"><div class="kal-d">2026-01-17</div><div class="kal-v">Längd −0.8 cm · Dia +2.1 mm</div><span class="badge bg">OK</span></div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för kalibreringshistorik →</div>
      </div>
    </div>
  </div>

  <!-- ROW 3: Bolag + Objekt -->
  <div class="g2 view-section vs-objekt" id="sec-objekt">
    <div class="card anim" style="animation-delay:0.5s">
      <div class="card-h"><div class="card-t">Volym per bolag</div></div>
      <div class="card-b">
        <div class="ink-row ink-clickable" onclick="openBolag('vida')">
          <div class="ink-logo">VIDA</div>
          <div class="ink-name">Vida Skog AB</div>
          <div style="text-align:right"><div class="ink-vol">1 024 m³</div><div style="font-size:10px;color:var(--muted)">55%</div></div>
        </div>
        <div style="padding:4px 0 10px 40px"><div class="prog"><div class="pf" style="width:55%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ink-row ink-clickable" onclick="openBolag('sod')">
          <div class="ink-logo">SÖD</div>
          <div class="ink-name">Södra Skogsägarna</div>
          <div style="text-align:right"><div class="ink-vol">444 m³</div><div style="font-size:10px;color:var(--muted)">24%</div></div>
        </div>
        <div style="padding:4px 0 10px 40px"><div class="prog"><div class="pf" style="width:24%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ink-row ink-clickable" onclick="openBolag('ata')">
          <div class="ink-logo">ATA</div>
          <div class="ink-name">ATA Timber</div>
          <div style="text-align:right"><div class="ink-vol">379 m³</div><div style="font-size:10px;color:var(--muted)">21%</div></div>
        </div>
        <div style="padding:4px 0 0 40px"><div class="prog"><div class="pf" style="width:21%;background:rgba(255,255,255,0.15)"></div></div></div>
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.55s">
      <div class="card-h"><div class="card-t">Objekt</div></div>
      <div class="card-b" style="padding-left:0;padding-right:0;padding-bottom:4px;">
        <div style="overflow-y:auto;max-height:220px;">
        <table class="tbl" style="padding:0 22px">
          <thead><tr style="position:sticky;top:0;background:var(--surface);z-index:1;">
            <th style="padding-left:22px">Objekt</th><th>Typ</th><th>m³</th><th>m³/G15h</th><th style="padding-right:22px">Cert</th>
          </tr></thead>
          <tbody>
            <tr style="cursor:pointer;" onclick="window.location.href='/planering?objekt=VO11080064'" title="Gå till objektvy"><td style="padding-left:22px"><div class="tn">Ålshult AU 2025</div><div class="ts2">Vida · VO 11080064</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">623</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">12.4</td><td style="padding-right:22px;display:flex;align-items:center;gap:6px;"><span class="badge bm">FSC</span><span style="color:var(--muted);font-size:11px;">→</span></td></tr>
            <tr style="cursor:pointer;" onclick="window.location.href='/planering?objekt=VO11081163'" title="Gå till objektvy"><td style="padding-left:22px"><div class="tn">Björsamåla AU 2025</div><div class="ts2">Vida · VO 11081163</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">401</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">11.8</td><td style="padding-right:22px;display:flex;align-items:center;gap:6px;"><span class="badge bm">FSC</span><span style="color:var(--muted);font-size:11px;">→</span></td></tr>
            <tr style="cursor:pointer;" onclick="window.location.href='/planering?objekt=VO11106406'" title="Gå till objektvy"><td style="padding-left:22px"><div class="tn">Karamåla 19 A-S</div><div class="ts2">ATA · VO 11106406</div></td><td><span class="badge bgall">GALLRING</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">379</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">10.2</td><td style="padding-right:22px;display:flex;align-items:center;gap:6px;"><span class="badge bm">FSC</span><span style="color:var(--muted);font-size:11px;">→</span></td></tr>
            <tr style="cursor:pointer;" onclick="window.location.href='/planering?objekt=VO11088xxx'" title="Gå till objektvy"><td style="padding-left:22px"><div class="tn">Svinhult Au 2025</div><div class="ts2">Södra · VO 11088xxx</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">444</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">11.5</td><td style="padding-right:22px;display:flex;align-items:center;gap:6px;"><span class="badge bm">PEFC</span><span style="color:var(--muted);font-size:11px;">→</span></td></tr>
          </tbody>
        </table>
        </div>
        <div style="margin:14px 22px 4px;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Fördelning RP · AU · LRK</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="openObjTyp('rp')">
              <div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">892</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">RP · m³</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;">11.8 m³/G15h</div>
            </div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="openObjTyp('au')">
              <div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">748</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">AU · m³</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;">12.1 m³/G15h</div>
            </div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="openObjTyp('lrk')">
              <div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">207</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">LRK · m³</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;">9.8 m³/G15h</div>
            </div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;overflow:hidden;height:6px;display:flex;">
            <div style="flex:892;background:rgba(90,255,140,0.5);"></div>
            <div style="flex:748;background:rgba(255,255,255,0.2);margin-left:2px;"></div>
            <div style="flex:207;background:rgba(91,143,255,0.4);margin-left:2px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;">
            <div style="display:flex;gap:14px;">
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(90,255,140,0.5);"></div>RP 48%</div>
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(255,255,255,0.2);"></div>AU 41%</div>
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(91,143,255,0.4);"></div>LRK 11%</div>
            </div>
            <button onclick="openObjJmf()" style="border:none;background:rgba(255,255,255,0.07);border-radius:6px;padding:5px 12px;font-family:inherit;font-size:10px;font-weight:600;color:rgba(255,255,255,0.6);cursor:pointer;letter-spacing:0.3px;">Jämför →</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- DAGLIG PRODUKTION -->
  <div class="gf view-section vs-produktion" id="sec-produktion">
    <div class="card anim" style="animation-delay:0.6s">
      <div class="card-h">
        <div class="card-t">Daglig produktion – februari 2026</div>
        <div style="display:flex;gap:12px;">
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--accent)"></div>m³/dag</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--blue)"></div>Stammar</div>
        </div>
      </div>
      <div class="card-b"><canvas id="dailyChart" style="max-height:190px"></canvas></div>
    </div>
  </div>

  <!-- KALENDER + SORTIMENT -->
  <div class="g2 view-section vs-produktion">
    <div class="card anim" style="animation-delay:0.65s">
      <div class="card-h">
        <div class="card-t">Aktivitet – februari</div>
        <div style="display:flex;gap:10px;">
          <div class="li" style="font-size:10px;color:var(--muted)"><div style="width:7px;height:7px;border-radius:2px;background:rgba(255,255,255,0.4)"></div>Produktion</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div style="width:7px;height:7px;border-radius:2px;background:rgba(255,255,255,0.2)"></div>Flytt</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div style="width:7px;height:7px;border-radius:2px;background:var(--warn)"></div>Service</div>
        </div>
      </div>
      <div class="card-b">
        <div class="cal-names">
          <div class="cal-dn">Mån</div><div class="cal-dn">Tis</div><div class="cal-dn">Ons</div>
          <div class="cal-dn">Tor</div><div class="cal-dn">Fre</div><div class="cal-dn">Lör</div><div class="cal-dn">Sön</div>
        </div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="cal-sum">
          <div class="cal-si"><div class="cal-sn" style="color:var(--text)">18</div><div class="cal-sl">Produktion</div></div>
          <div class="cal-si"><div class="cal-sn" style="color:var(--text)">2</div><div class="cal-sl">Flytt</div></div>
          <div class="cal-si"><div class="cal-sn" style="color:var(--warn)">1</div><div class="cal-sl">Service</div></div>
          <div class="cal-si"><div class="cal-sn" style="color:var(--muted)">7</div><div class="cal-sl">Ej aktiv</div></div>
        </div>
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.7s">
      <div class="card-h"><div class="card-t">Sortiment</div></div>
      <div class="card-b">
        <canvas id="sortChart" style="max-height:175px"></canvas>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;">
          <div class="snum"><div class="snum-v" style="color:var(--text)">1 124</div><div class="snum-l">Sågtimmer</div></div>
          <div class="snum"><div class="snum-v" style="color:var(--text)">612</div><div class="snum-l">Massaved</div></div>
          <div class="snum"><div class="snum-v">111</div><div class="snum-l">Energived</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- MTH -->
  <div class="gf view-section vs-produktion vs-tradslag">
    <div class="card anim" style="animation-delay:0.75s">
      <div class="card-h">
        <div class="card-t">Flerträd (MTH) per trädslag & medelstamsklass</div>
        <div style="display:flex;gap:12px;">
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--accent)"></div>Gran</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--muted)"></div>Tall</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--blue)"></div>Björk</div>
        </div>
      </div>
      <div class="card-b">
        <canvas id="mthChart" style="max-height:170px"></canvas>
        <div class="sc-grid" style="margin-top:12px;">
          <div class="sc"><div class="sc-k">0.0–0.1</div><div class="sc-p" style="color:var(--text)">61%</div><div class="sc-u">MTH</div></div>
          <div class="sc"><div class="sc-k">0.1–0.2</div><div class="sc-p" style="color:var(--text)">38%</div><div class="sc-u">MTH</div></div>
          <div class="sc"><div class="sc-k">0.2–0.3</div><div class="sc-p" style="color:var(--text)">12%</div><div class="sc-u">MTH</div></div>
          <div class="sc best"><div class="sc-k">0.3–0.4</div><div class="sc-p" style="color:var(--text)">4%</div><div class="sc-u">MTH</div></div>
          <div class="sc best"><div class="sc-k">0.4–0.5</div><div class="sc-p" style="color:var(--text)">2%</div><div class="sc-u">MTH</div></div>
          <div class="sc best"><div class="sc-k">0.5–0.7</div><div class="sc-p" style="color:var(--text)">1%</div><div class="sc-u">MTH</div></div>
          <div class="sc best"><div class="sc-k">0.7+</div><div class="sc-p" style="color:var(--text)">0%</div><div class="sc-u">MTH</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- PRODUKTION & PRODUKTIVITET -->
  <div class="gf view-section vs-produktion">
    <div class="card anim" style="animation-delay:0.8s">
      <div class="card-h"><div class="card-t">Produktion & produktivitet per medelstamsklass</div></div>
      <div class="card-b">
        <div class="cleg">
          Total produktion
          <div class="li"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>Volym m³</div>
          <div class="li"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>Stammar</div>
        </div>
        <canvas id="totalChart" style="max-height:155px"></canvas>
        <div class="cdiv"></div>
        <div class="cleg">
          Produktivitet
          <div class="li"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>m³/G15h</div>
          <div class="li"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>st/G15h</div>
        </div>
        <canvas id="prodChart" style="max-height:175px"></canvas>
        <div class="sc-grid">
          <div class="sc"><div class="sc-k">0.0–0.1</div><div class="sc-p" style="color:var(--text)">7.7</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">102</div><div class="sc-sl">st/G15h</div><div class="sc-x">138 m³ · 1 840 st</div></div>
          <div class="sc"><div class="sc-k">0.1–0.2</div><div class="sc-p" style="color:var(--text)">10.3</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">73</div><div class="sc-sl">st/G15h</div><div class="sc-x">298 m³ · 2 130 st</div></div>
          <div class="sc"><div class="sc-k">0.2–0.3</div><div class="sc-p" style="color:var(--text)">10.5</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">42</div><div class="sc-sl">st/G15h</div><div class="sc-x">545 m³ · 2 180 st</div></div>
          <div class="sc best"><div class="sc-k">0.3–0.4</div><div class="sc-p" style="color:var(--text)">11.1</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">32</div><div class="sc-sl">st/G15h</div><div class="sc-x">311 m³ · 890 st</div></div>
          <div class="sc best"><div class="sc-k">0.4–0.5</div><div class="sc-p" style="color:var(--text)">12.0</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--text)">27</div><div class="sc-sl">st/G15h</div><div class="sc-x">252 m³ · 560 st</div></div>
          <div class="sc best"><div class="sc-k">0.5–0.7</div><div class="sc-p" style="color:var(--text)">12.7</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--text)">21</div><div class="sc-sl">st/G15h</div><div class="sc-x">228 m³ · 380 st</div></div>
          <div class="sc best"><div class="sc-k">0.7+</div><div class="sc-p" style="color:var(--text)">15.0</div><div class="sc-u">m³/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">36</div><div class="sc-sl">st/G15h</div><div class="sc-x">75 m³ · 180 st</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- DIESEL DIAGRAM -->
  <div class="view-section vs-produktion" style="margin-top:8px;">
    <div class="card anim" style="animation-delay:0.7s">
      <div class="card-h"><div class="card-t">Dieselförbrukning per medelstamsklass</div></div>
      <div class="card-b">
        <canvas id="dieselChart" style="max-height:200px;margin-bottom:16px;"></canvas>
        <div class="sc-grid">
          <div class="sc"><div class="sc-k">0.0–0.1</div><div class="sc-p" style="color:var(--warn)">6.8</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">0.1–0.2</div><div class="sc-p">5.2</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">0.2–0.3</div><div class="sc-p">4.4</div><div class="sc-u">l/m³</div></div>
          <div class="sc best"><div class="sc-k">0.3–0.4</div><div class="sc-p">3.9</div><div class="sc-u">l/m³</div></div>
          <div class="sc best"><div class="sc-k">0.4–0.5</div><div class="sc-p">3.6</div><div class="sc-u">l/m³</div></div>
          <div class="sc best"><div class="sc-k">0.5–0.7</div><div class="sc-p">3.3</div><div class="sc-u">l/m³</div></div>
          <div class="sc best"><div class="sc-k">0.7+</div><div class="sc-p">3.1</div><div class="sc-u">l/m³</div></div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:20px;">
          <div class="snum"><div class="snum-v">4.1</div><div class="snum-l">Snitt l/m³</div></div>
          <div class="snum"><div class="snum-v">1.08</div><div class="snum-l">l/stam</div></div>
          <div class="snum"><div class="snum-v">7 570</div><div class="snum-l">Liter totalt</div></div>
        </div>
      </div>
    </div>
  </div>

</div>




<!-- BOLAG PANEL -->
<div class="bolag-panel" id="bolagPanel">
  <div class="forar-head">
    <div class="forar-av" id="bpLogo" style="border-radius:8px;font-size:11px;font-weight:700;">VIDA</div>
    <div>
      <div class="forar-title" id="bpName">Vida Skog AB</div>
      <div class="forar-sub" id="bpSub">1 024 m³ · 55% av total volym</div>
    </div>
    <button class="forar-close" onclick="closeBolag()">✕</button>
  </div>
  <div class="forar-body" id="bpBody"></div>
</div>



<!-- TIDSFÖRDELNING PANEL -->
<div class="bolag-panel" id="tidPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:14px;">⏱</div>
    <div>
      <div class="forar-title">Tidsfördelning & avbrott</div>
      <div class="forar-sub">Ponsse Scorpion Giant 8W · februari 2026</div>
    </div>
    <button class="forar-close" onclick="closeTid()">✕</button>
  </div>
  <div class="forar-body">

    <!-- Översikt -->
    <div class="forar-kpis" style="margin-bottom:20px;">
      <div class="fkpi"><div class="fkpi-v">163h</div><div class="fkpi-l">Motortid</div></div>
      <div class="fkpi"><div class="fkpi-v">111h</div><div class="fkpi-l">Effektiv G15</div></div>
      <div class="fkpi"><div class="fkpi-v">18h</div><div class="fkpi-l">Avbrott</div></div>
    </div>

    <!-- Tidsfördelning stapel -->
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Fördelning</div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
      <div class="frow"><span class="frow-l">Processar</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:66%;background:rgba(90,255,140,0.4)"></div></div></div><span class="frow-v">111h · 66%</span></div>
      <div class="frow"><span class="frow-l">Kör</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:14%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">23h · 14%</span></div>
      <div class="frow"><span class="frow-l">Korta stopp</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:2%;background:rgba(91,143,255,0.3)"></div></div></div><span class="frow-v">4h · 2%</span></div>
      <div class="frow"><span class="frow-l">Avbrott</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:11%;background:rgba(255,179,64,0.4)"></div></div></div><span class="frow-v">18h · 11%</span></div>
      <div class="frow" style="border-bottom:none"><span class="frow-l">Rast</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:7%;background:rgba(255,255,255,0.08)"></div></div></div><span class="frow-v">11h · 7%</span></div>
    </div>

    <!-- Avbrott per orsak -->
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Avbrott per orsak</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Service & underhåll</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Schemalagt underhåll</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;">6h 20min</div>
          <div style="font-size:10px;color:var(--muted);">4 tillfällen · 30%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Flytt</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Förflyttning mellan objekt</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;">4h 45min</div>
          <div style="font-size:10px;color:var(--muted);">2 tillfällen · 22%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Maskinfel</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Oplanerade stopp</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--warn);">3h 10min</div>
          <div style="font-size:10px;color:var(--muted);">3 tillfällen · 15%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Korta stopp</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Stopp ≤ 15 min (other_work_sek)</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;">2h 30min</div>
          <div style="font-size:10px;color:var(--muted);">48 tillfällen · 12%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Tankning</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Bränsle & smörjning</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;">2h 05min</div>
          <div style="font-size:10px;color:var(--muted);">8 tillfällen · 10%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Väntan</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Väder, uppdrag, övrigt</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;">1h 40min</div>
          <div style="font-size:10px;color:var(--muted);">5 tillfällen · 8%</div>
        </div>
      </div>
      <div class="frow" style="border-bottom:none;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Övrigt</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Ej kategoriserat</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;font-variant-numeric:tabular-nums;">0h 40min</div>
          <div style="font-size:10px;color:var(--muted);">2 tillfällen · 3%</div>
        </div>
      </div>
    </div>

    <!-- Avbrott per förare (dynamiskt) -->
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Avbrott per förare</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;" id="avbrottForareContainer">
      <!-- Populated dynamically -->
    </div>

  </div>
</div>

<!-- TRÄDSLAG PANEL -->
<div class="bolag-panel" id="tradslagPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:14px;">🌲</div>
    <div>
      <div class="forar-title">Trädslag & sortiment</div>
      <div class="forar-sub">Ponsse Scorpion Giant 8W · februari 2026</div>
    </div>
    <button class="forar-close" onclick="closeTradslag()">✕</button>
  </div>
  <div class="forar-body">
    <div class="forar-kpis" style="margin-bottom:20px;">
      <div class="fkpi"><div class="fkpi-v">1 807</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">1 124</div><div class="fkpi-l">Sågtimmer</div></div>
      <div class="fkpi"><div class="fkpi-v">575</div><div class="fkpi-l">Massaved</div></div>
    </div>

    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Sortiment per trädslag</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;"></th>
            <th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Sågtimmer</th>
            <th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Massaved</th>
            <th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Energived</th>
            <th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Totalt</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:10px 0;font-weight:500;">Gran</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">820</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">280</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">24</td>
            <td style="text-align:right;padding:10px 0;font-weight:600;font-variant-numeric:tabular-nums;">1 124</td>
          </tr>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:10px 0;font-weight:500;">Tall</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">220</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">215</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">63</td>
            <td style="text-align:right;padding:10px 0;font-weight:600;font-variant-numeric:tabular-nums;">498</td>
          </tr>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:10px 0;font-weight:500;">Björk</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">84</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">80</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">21</td>
            <td style="text-align:right;padding:10px 0;font-weight:600;font-variant-numeric:tabular-nums;">185</td>
          </tr>
          <tr style="border-top:1px solid var(--border2)">
            <td style="padding:10px 0;font-size:10px;color:var(--muted);font-weight:600;">Totalt</td>
            <td style="text-align:right;padding:10px 0;font-weight:600;font-variant-numeric:tabular-nums;">1 124</td>
            <td style="text-align:right;padding:10px 0;font-weight:600;font-variant-numeric:tabular-nums;">575</td>
            <td style="text-align:right;padding:10px 0;font-weight:600;font-variant-numeric:tabular-nums;">108</td>
            <td style="text-align:right;padding:10px 0;font-weight:700;font-variant-numeric:tabular-nums;">1 807</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Andel per sortiment</div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
      <div class="frow"><span class="frow-l">Sågtimmer</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:62%;background:rgba(90,255,140,0.5)"></div></div></div><span class="frow-v">62% · 1 124 m³</span></div>
      <div class="frow"><span class="frow-l">Massaved</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:32%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">32% · 575 m³</span></div>
      <div class="frow" style="border-bottom:none"><span class="frow-l">Energived</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:6%;background:rgba(91,143,255,0.4)"></div></div></div><span class="frow-v">6% · 108 m³</span></div>
    </div>
  </div>
</div>




<!-- OBJ JMF PANEL -->
<div class="bolag-panel" id="objJmfPanel" style="width:min(560px,100vw);">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;">⚡</div>
    <div>
      <div class="forar-title">RP · AU · LRK – jämförelse</div>
      <div class="forar-sub">Ponsse Scorpion Giant 8W · februari 2026</div>
    </div>
    <button class="forar-close" onclick="closeObjJmf()">✕</button>
  </div>
  <div class="forar-body">

    <!-- Tabell -->
    <div style="background:var(--surface2);border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="text-align:left;padding:12px 16px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;color:var(--muted);"></th>
            <th style="text-align:right;padding:12px 10px;font-size:11px;font-weight:700;color:rgba(90,255,140,0.9);">RP</th>
            <th style="text-align:right;padding:12px 10px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);">AU</th>
            <th style="text-align:right;padding:12px 16px 12px 10px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);">LRK</th>
          </tr>
        </thead>
        <tbody id="jmfTableBody"></tbody>
      </table>
    </div>

    <!-- Bäst-kort -->
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Bäst per kategori</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" id="jmfBest"></div>

  </div>
</div>

<!-- OBJ TYP PANEL -->
<div class="bolag-panel" id="objTypPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;font-weight:700;" id="otpLabel">RP</div>
    <div>
      <div class="forar-title" id="otpTitle">Röjningsprioriterat</div>
      <div class="forar-sub">Ponsse Scorpion Giant 8W · februari 2026</div>
    </div>
    <button class="forar-close" onclick="closeObjTyp()">✕</button>
  </div>
  <div class="forar-body" id="otpBody"></div>
</div>

<!-- DAG PANEL -->
<div class="dag-panel" id="dagPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;" id="dagIcon">📅</div>
    <div>
      <div class="forar-title" id="dagTitle">1 februari 2026</div>
      <div class="forar-sub" id="dagSub">Produktion</div>
    </div>
    <button class="forar-close" onclick="closeDag()">✕</button>
  </div>
  <div class="forar-body" id="dagBody"></div>
</div>

<!-- FÖRAR OVERLAY -->
<div class="forar-overlay" id="forarOverlay" onclick="closeForare()"></div>

<!-- FÖRAR PANEL -->
<div class="forar-panel" id="forarPanel">
  <div class="forar-head">
    <div class="forar-av" id="fpAv">SK</div>
    <div>
      <div class="forar-title" id="fpName">Stefan Karlsson</div>
      <div class="forar-sub" id="fpSub">Ponsse Scorpion Giant 8W</div>
    </div>
    <button class="forar-close" onclick="closeForare()">✕</button>
  </div>
  <div class="forar-body" id="fpBody"></div>
</div>` }} />
      </div>
    </div>
  );
}
