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
    processingSek: number;
    terrainSek: number;
    disturbanceSek: number;
    engineTimeSek: number;
    bransleLiter: number;
    dailyVol: number[];
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
  // Extra KPIs
  bransleTotalt: number;
  branslePerM3: number;
  stammarPerG15h: number;
  // Per-medelstamsklass arrays (dynamic number of classes depending on machine)
  klassLabels: string[];
  klassVolym: number[];
  klassStammar: number[];
  klassM3g15: number[];
  klassStg15: number[];
  klassDieselM3: number[];
  // MTH flag + sortiment per dag
  hasMth: boolean;
  sortimentPerDag: {
    days: string[];
    timmer: number[];
    kubb: number[];
    massa: number[];
    energi: number[];
  } | null;
};

const MASKINVY_SCRIPT = `(function(){
if (typeof Chart === 'undefined') { console.error('[Maskinvy] Chart.js not loaded'); return; }
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

// Read DB data from window if available
var _db = window.__maskinvyData || {};
console.log('[Maskinvy Script] _db:', { keys: Object.keys(_db), totalVolym: _db.totalVolym, dailyVol: _db.dailyVol?.length, operatorer: _db.operatorer?.length, klassM3g15: _db.klassM3g15, klassDieselM3: _db.klassDieselM3 });

var classes = _db.klassLabels || [];
var m3g15   = _db.klassM3g15 || [];
var stg15   = _db.klassStg15 || [];
var volym   = _db.klassVolym || [];
var stammar = _db.klassStammar || [];

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
var _kpiBransle = _db.bransleTotalt || 0;
var _kpiBransleM3 = _db.branslePerM3 || 0;
var _kpiStG15 = _db.stammarPerG15h || 0;

// Update ALL KPI data-count attributes from DB
document.querySelectorAll('.k-val[data-count]').forEach(function(el) {
  var label = el.parentElement && el.parentElement.querySelector('.k-label');
  if (!label) return;
  var t = label.textContent;
  if (t === 'Stammar') el.setAttribute('data-count', String(_kpiStammar));
  if (t === 'Produktivitet') el.setAttribute('data-count', String(_kpiProd));
  if (t === 'Medelstam') el.setAttribute('data-count', String(_kpiMedel));
  if (t === 'Br\\u00e4nsle totalt') el.setAttribute('data-count', String(_kpiBransle));
  if (t === 'Br\\u00e4nsle/m\\u00b3') el.setAttribute('data-count', String(_kpiBransleM3));
  if (t === 'Stammar/G15h') el.setAttribute('data-count', String(_kpiStG15));
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
if(!dailyEl){console.warn('[Maskinvy] dailyChart canvas not found');}
else { new Chart(dailyEl,{
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
}); }

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

// MTH — only if machine has MTH data
var mthSection = document.getElementById('sec-mth');
var sortDagSection = document.getElementById('sec-sortiment-dag');
if (_db.hasMth === false) {
  if (mthSection) mthSection.style.display = 'none';
  if (sortDagSection) sortDagSection.style.removeProperty('display');
  var spd = _db.sortimentPerDag;
  var spdEl = document.getElementById('sortDagChart');
  if (spd && spdEl) {
    new Chart(spdEl, {
      type: 'bar',
      data: { labels: spd.days, datasets: [
        { label: 'Timmer', data: spd.timmer, backgroundColor: 'rgba(90,255,140,0.5)', borderRadius: 3, stack: 'sd' },
        { label: 'Kubb', data: spd.kubb, backgroundColor: 'rgba(91,143,255,0.5)', borderRadius: 3, stack: 'sd' },
        { label: 'Massa', data: spd.massa, backgroundColor: 'rgba(255,179,64,0.4)', borderRadius: 3, stack: 'sd' },
        { label: 'Energi', data: spd.energi, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, stack: 'sd' },
      ]},
      options: { responsive: true, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { font: { family: 'Geist', size: 11 }, boxWidth: 8, borderRadius: 2, padding: 12, color: '#7a7a72' } }, tooltip },
        scales: { x: { stacked: true, grid, ticks: { ...ticks, font: { size: 10 } } }, y: { stacked: true, grid, ticks, title: { display: true, text: 'm\\u00b3', color: '#7a7a72', font: { size: 10 } } } }
      }
    });
  }
} else {
  if (mthSection) mthSection.style.removeProperty('display');
  if (sortDagSection) sortDagSection.style.display = 'none';
  new Chart(document.getElementById('mthChart'),{
    type:'bar',
    data:{labels:classes,datasets:[
      {label:'Gran', data:[820,640,180,28,8,3,0], backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,stack:'m'},
      {label:'Tall', data:[190,120,50,10,2,1,0],  backgroundColor:'rgba(122,122,114,0.4)',borderRadius:3,stack:'m'},
      {label:'Björk',data:[112,52,32,4,1,0,0],   backgroundColor:'rgba(91,143,255,0.5)',borderRadius:3,stack:'m'}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{stacked:true,grid,ticks},y:{stacked:true,grid,ticks}}}
  });
}

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
const dieselPerM3 = _db.klassDieselM3 || [];
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
// Populate productivity sc-grid from DB data
var prodScGrid = document.getElementById('prodScGrid');
if (prodScGrid) {
  prodScGrid.innerHTML = classes.map(function(cls, i) {
    var isBest = m3g15[i] >= 10;
    return '<div class="sc' + (isBest ? ' best' : '') + '"><div class="sc-k">' + cls + '</div><div class="sc-p" style="color:var(--text)">' + m3g15[i] + '</div><div class="sc-u">m\\u00b3/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">' + stg15[i] + '</div><div class="sc-sl">st/G15h</div><div class="sc-x">' + volym[i].toLocaleString('sv') + ' m\\u00b3 \\u00b7 ' + stammar[i].toLocaleString('sv') + ' st</div></div>';
  }).join('');
}

// Populate diesel sc-grid from DB data
var dieselScGrid = document.getElementById('dieselScGrid');
if (dieselScGrid) {
  dieselScGrid.innerHTML = classes.map(function(cls, i) {
    var isBest = dieselPerM3[i] > 0 && dieselPerM3[i] <= 4;
    return '<div class="sc' + (isBest ? ' best' : '') + '"><div class="sc-k">' + cls + '</div><div class="sc-p"' + (dieselPerM3[i] > 5 ? ' style="color:var(--warn)"' : '') + '>' + dieselPerM3[i] + '</div><div class="sc-u">l/m\\u00b3</div></div>';
  }).join('');
}

// Populate diesel summary
var dieselSummary = document.getElementById('dieselSummary');
if (dieselSummary) {
  var totalBr = _db.bransleTotalt || 0;
  var totalVol = _db.totalVolym || 0;
  var totalSt = _db.totalStammar || 0;
  var snittLm3 = totalVol > 0 ? (totalBr / totalVol).toFixed(1) : '–';
  var lPerStam = totalSt > 0 ? (totalBr / totalSt).toFixed(2) : '–';
  var snums = dieselSummary.querySelectorAll('.snum-v');
  if (snums[0]) snums[0].textContent = snittLm3;
  if (snums[1]) snums[1].textContent = lPerStam;
}

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
      stammar: Math.round(op.stammar),
      dagar: op.dagar,
      processingSek: op.processingSek || 0,
      terrainSek: op.terrainSek || 0,
      disturbanceSek: op.disturbanceSek || 0,
      engineTimeSek: op.engineTimeSek || 0,
      bransleLiter: op.bransleLiter || 0,
      dailyVol: op.dailyVol || [],
    };
  });
}

let fpChart = null;

function openForare(id) {
  const f = forare[id];
  if (!f) return;
  var motorH = (f.engineTimeSek / 3600).toFixed(1);
  var prodH = (f.processingSek / 3600).toFixed(1);
  var korH = (f.terrainSek / 3600).toFixed(1);
  var storH = (f.disturbanceSek / 3600).toFixed(1);
  var totalTidSek = f.processingSek + f.terrainSek + f.disturbanceSek;
  var pProd = totalTidSek > 0 ? Math.round(f.processingSek / totalTidSek * 100) : 0;
  var pKor = totalTidSek > 0 ? Math.round(f.terrainSek / totalTidSek * 100) : 0;
  var pStor = totalTidSek > 0 ? (100 - pProd - pKor) : 0;

  document.getElementById('fpAv').textContent  = f.av;
  document.getElementById('fpName').textContent = f.name;
  document.getElementById('fpSub').textContent  = 'Vald period';
  document.getElementById('fpBody').innerHTML = \`
    <div class="fsec">
      <div class="fsec-title">Totalt</div>
      <div class="forar-kpis">
        <div class="fkpi"><div class="fkpi-v">\${f.stammar.toLocaleString('sv')}</div><div class="fkpi-l">Stammar</div></div>
        <div class="fkpi"><div class="fkpi-v">\${f.volym}</div><div class="fkpi-l">m³sub</div></div>
        <div class="fkpi"><div class="fkpi-v">\${motorH}</div><div class="fkpi-l">Motortid h</div></div>
        <div class="fkpi"><div class="fkpi-v">\${Math.round(f.bransleLiter)}</div><div class="fkpi-l">Bränsle L</div></div>
      </div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Produktivitet</div>
      <div class="forar-kpis">
        <div class="fkpi"><div class="fkpi-v">\${f.prod}</div><div class="fkpi-l">m³/G15h</div></div>
        <div class="fkpi"><div class="fkpi-v">\${f.medelstam}</div><div class="fkpi-l">m³/stam</div></div>
        <div class="fkpi"><div class="fkpi-v">\${f.dagar}</div><div class="fkpi-l">Aktiva dagar</div></div>
      </div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Tidsfördelning</div>
      <div style="display:flex;height:14px;border-radius:4px;overflow:hidden;gap:2px;margin-bottom:12px;">
        <div style="flex:\${pProd};background:rgba(90,255,140,0.4);"></div>
        <div style="flex:\${pKor};background:rgba(91,143,255,0.35);"></div>
        <div style="flex:\${pStor};background:rgba(255,179,64,0.3);"></div>
      </div>
      <div class="frow"><span class="frow-l" style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:2px;background:rgba(90,255,140,0.4);display:inline-block;"></span>Produktion</span><span class="frow-v">\${prodH}h · \${pProd}%</span></div>
      <div class="frow"><span class="frow-l" style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:2px;background:rgba(91,143,255,0.35);display:inline-block;"></span>Körning</span><span class="frow-v">\${korH}h · \${pKor}%</span></div>
      <div class="frow"><span class="frow-l" style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:2px;background:rgba(255,179,64,0.3);display:inline-block;"></span>Störning</span><span class="frow-v">\${storH}h · \${pStor}%</span></div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Daglig produktion</div>
      <canvas id="fpChart" style="max-height:180px;"></canvas>
    </div>\`;
  setTimeout(() => {
    if (fpChart) fpChart.destroy();
    const ctx = document.getElementById('fpChart');
    if (!ctx) return;
    var dLabels = _db.days || [];
    fpChart = new Chart(ctx, {
      type:'bar',
      data:{labels:dLabels,datasets:[
        {label:'m³/dag',data:f.dailyVol,backgroundColor:f.dailyVol.map(v=>v===0?'rgba(255,255,255,0.04)':'rgba(90,255,140,0.5)'),borderRadius:3}
      ]},
      options:{responsive:true,plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks:{...ticks,font:{size:9}}},y:{grid,ticks,title:{display:true,text:'m³',color:'#7a7a72',font:{size:10}}}}}
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
var opContainer = document.getElementById('opContainer');
var opBadge = document.getElementById('opBadge');
if (_db.operatorer && _db.operatorer.length > 0) {
  // Update operator rows in the card
  // Rebuild operator container from DB data
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
} else {
  // No operators — clear stale content
  if (opContainer) opContainer.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0;">Ingen data för vald period</div>';
  if (opBadge) opBadge.textContent = '0';
}

// Update time distribution bar & legend — always update (zero when no data)
{
  var totalSek = _db.engineTimeSek || 0;
  var pProc = totalSek > 0 ? Math.round((_db.processingSek / totalSek) * 100) : 0;
  var pTerr = totalSek > 0 ? Math.round((_db.terrainSek / totalSek) * 100) : 0;
  var pKort = totalSek > 0 ? Math.round((_db.kortStoppSek / totalSek) * 100) : 0;
  var pAvbr = totalSek > 0 ? Math.round((_db.avbrottSek / totalSek) * 100) : 0;
  var pRast = totalSek > 0 ? (100 - pProc - pTerr - pKort - pAvbr) : 0;

  var tbarSegs = document.querySelectorAll('.tbar .tseg');
  if (tbarSegs.length >= 5) {
    tbarSegs[0].style.flex = String(pProc || 1);
    tbarSegs[1].style.flex = String(pTerr || 0);
    tbarSegs[2].style.flex = String(pKort || 0);
    tbarSegs[3].style.flex = String(pAvbr || 0);
    tbarSegs[4].style.flex = String(pRast || 0);
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
  var g15h = Math.round(((_db.processingSek || 0) + (_db.terrainSek || 0)) / 3600);
  var avbrH = Math.round((_db.avbrottSek || 0) / 3600);
  // Find the ones labeled "Effektiv G15" and "Avbrott"
  document.querySelectorAll('.snum').forEach(function(el) {
    var label = el.querySelector('.snum-l');
    var val = el.querySelector('.snum-v');
    if (!label || !val) return;
    if (label.textContent === 'Effektiv G15') val.textContent = g15h + 'h';
    if (label.textContent === 'Avbrott') val.textContent = avbrH + 'h';
    });
}

// Expose to global scope for onclick handlers
Object.assign(window, {
  toggleMMenu, pickM, openForare, closeForare, openBolag, closeBolag,
  openTradslag, closeTradslag, openTid, closeTid, toggleCmp, runCmp,
  openDag, closeDag, openObjTyp, closeObjTyp, openObjJmf, closeObjJmf,
  toggleForareAvbrott, closeAllPanels
});
})();`;

type PeriodKpi = {
  volym: number; stammar: number; g15Timmar: number;
  produktivitet: number; medelstam: number; label: string;
};

export default function Maskinvy() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [vald, setVald] = useState('');
  const [activeView, setActiveView] = useState('oversikt');
  const [dataVersion, setDataVersion] = useState(0); // increments on each data load
  const [period, setPeriod] = useState<'V' | 'M' | 'K' | 'Å'>('M');
  const [periodOffset, setPeriodOffset] = useState(0); // 0=current, -1=previous, etc.
  const [loading, setLoading] = useState(false);
  const [maskinOpen, setMaskinOpen] = useState(false);

  // ── Period comparison state ──
  const [showCmp, setShowCmp] = useState(false);
  const [cmpDateA, setCmpDateA] = useState({ start: '2026-01-01', end: '2026-01-31' });
  const [cmpDateB, setCmpDateB] = useState({ start: '2026-02-01', end: '2026-02-28' });
  const [cmpDataA, setCmpDataA] = useState<PeriodKpi | null>(null);
  const [cmpDataB, setCmpDataB] = useState<PeriodKpi | null>(null);
  const [cmpLoading, setCmpLoading] = useState(false);

  // ── Operator comparison state ──
  type OpCmpRow = { id: string; namn: string; stammar: number; volym: number; prod: number; motorH: number; bransleH: number };
  type OpCmpMonth = { month: string; byOp: Record<string, number> };
  const [opCmpIds, setOpCmpIds] = useState<string[]>([]);
  const [opCmpFrom, setOpCmpFrom] = useState('2026-01-01');
  const [opCmpTo, setOpCmpTo] = useState('2026-03-31');
  const [opCmpRows, setOpCmpRows] = useState<OpCmpRow[]>([]);
  const [opCmpMonths, setOpCmpMonths] = useState<OpCmpMonth[]>([]);
  const [opCmpLoading, setOpCmpLoading] = useState(false);
  const [opCmpAllOps, setOpCmpAllOps] = useState<{ id: string; namn: string }[]>([]);
  const opCmpChartRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || opCmpMonths.length === 0 || opCmpIds.length === 0) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const colors = ['rgba(90,255,140,0.8)', 'rgba(91,143,255,0.8)', 'rgba(255,179,64,0.8)', 'rgba(255,95,87,0.8)'];
    const names = opCmpRows.reduce((m, r) => { m[r.id] = r.namn; return m; }, {} as Record<string, string>);
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: opCmpMonths.map(m => m.month),
        datasets: opCmpIds.map((id, i) => ({
          label: names[id] || id,
          data: opCmpMonths.map(m => Math.round(m.byOp[id] || 0)),
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length].replace('0.8', '0.1'),
          pointRadius: 4, pointBackgroundColor: colors[i % colors.length],
          tension: 0.3, fill: false,
        })),
      },
      options: {
        responsive: true, interaction: { mode: 'index' as const, intersect: false },
        plugins: { legend: { labels: { color: '#7a7a72', font: { family: "'Geist',sans-serif", size: 11 }, boxWidth: 10, padding: 14 } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } }, title: { display: true, text: 'm³', color: '#7a7a72', font: { size: 10 } } },
        },
      },
    });
  }, [opCmpMonths, opCmpIds, opCmpRows]);

  // ── Machine comparison state ──
  const allMachines: { id: string; namn: string }[] = [
    { id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion Giant 8W' },
    { id: 'R64101', namn: 'Rottne H8E' },
    { id: 'A110148', namn: 'Ponsse Elephant King AF' },
    { id: 'A030353', namn: 'Ponsse Wisent' },
  ];
  type MachCmpRow = { id: string; namn: string; stammar: number; volym: number; medelstam: number; prod: number; dieselM3: number; motorH: number };
  type MachCmpMonth = { month: string; byMach: Record<string, number> };
  const [machCmpA, setMachCmpA] = useState(allMachines[0].id);
  const [machCmpB, setMachCmpB] = useState(allMachines[1].id);
  const [machCmpFrom, setMachCmpFrom] = useState('2026-01-01');
  const [machCmpTo, setMachCmpTo] = useState('2026-03-31');
  const [machCmpRows, setMachCmpRows] = useState<MachCmpRow[]>([]);
  const [machCmpMonths, setMachCmpMonths] = useState<MachCmpMonth[]>([]);
  const [machCmpLoading, setMachCmpLoading] = useState(false);

  const machCmpChartRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || machCmpMonths.length === 0) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const colors = ['#00c48c', '#5b8fff'];
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: machCmpMonths.map(m => m.month),
        datasets: machCmpRows.map((r, i) => ({
          label: r.namn,
          data: machCmpMonths.map(m => {
            const v = m.byMach[r.id];
            return v !== undefined ? parseFloat(v.toFixed(1)) : 0;
          }),
          borderColor: colors[i], backgroundColor: colors[i].replace(')', ',0.1)').replace('rgb', 'rgba'),
          pointRadius: 4, pointBackgroundColor: colors[i], tension: 0.3, fill: false,
        })),
      },
      options: {
        responsive: true, interaction: { mode: 'index' as const, intersect: false },
        plugins: { legend: { labels: { color: '#7a7a72', font: { family: "'Geist',sans-serif", size: 11 }, boxWidth: 10, padding: 14 } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } }, title: { display: true, text: 'm³/G15h', color: '#7a7a72', font: { size: 10 } } },
        },
      },
    });
  }, [machCmpMonths, machCmpRows]);

  // ── Hardcoded machines (from database inspection) ──
  useEffect(() => {
    const skordare: Maskin[] = [
      { maskin_id: 'PONS20SDJAA270231', modell: 'Scorpion Giant 8W', tillverkare: 'Ponsse', typ: 'Skördare' },
      { maskin_id: 'R64101', modell: 'H8E', tillverkare: 'Rottne', typ: 'Skördare' },
    ];
    setMaskiner(skordare);
    setVald(skordare[0].modell);

    // Auto-detect latest month with data and set periodOffset accordingly
    (async () => {
      const latestRes = await supabase.from('fakt_produktion')
        .select('datum')
        .eq('maskin_id', skordare[0].maskin_id)
        .order('datum', { ascending: false })
        .limit(1);
      if (latestRes.data && latestRes.data.length > 0) {
        const latest = new Date(latestRes.data[0].datum);
        const now = new Date();
        const monthDiff = (latest.getFullYear() - now.getFullYear()) * 12 + (latest.getMonth() - now.getMonth());
        if (monthDiff < 0) {
          setPeriodOffset(monthDiff);
        }
      }
    })();
  }, []);

  // ── Compute date range from period + offset ──
  function getPeriodDates(p: 'V' | 'M' | 'K' | 'Å', offset = 0): { startDate: string; endDate: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (p === 'V') {
      const day = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { startDate: fmt(mon), endDate: fmt(sun) };
    }
    if (p === 'K') {
      const q = Math.floor(now.getMonth() / 3) + offset;
      const baseYear = now.getFullYear() + Math.floor(q / 4) * (q < 0 ? -1 : 0);
      const adjQ = ((q % 4) + 4) % 4;
      const year = now.getFullYear() + Math.floor((Math.floor(now.getMonth() / 3) + offset) / 4);
      const qIdx = (((Math.floor(now.getMonth() / 3) + offset) % 4) + 4) % 4;
      const qs = new Date(year, qIdx * 3, 1);
      const qe = new Date(year, qIdx * 3 + 3, 0);
      return { startDate: fmt(qs), endDate: fmt(qe) };
    }
    if (p === 'Å') {
      const y = now.getFullYear() + offset;
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }
    // M (default)
    const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { startDate: fmt(ms), endDate: fmt(me) };
  }

  // ── Human-readable period label ──
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  function getPeriodLabel(p: 'V' | 'M' | 'K' | 'Å', offset: number): string {
    const { startDate } = getPeriodDates(p, offset);
    const d = new Date(startDate);
    if (p === 'V') {
      const onejan = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      return `V${weekNum} ${d.getFullYear()}`;
    }
    if (p === 'M') return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    if (p === 'K') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    return `${d.getFullYear()}`;
  }

  // ── Fetch production data from Supabase ──
  const fetchDbData = useCallback(async (maskinId: any, p: 'V' | 'M' | 'K' | 'Å' = 'M', pOffset = 0) => {
    if (!maskinId) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getPeriodDates(p, pOffset);
      console.log('[Maskinvy] fetchDbData:', { maskinId, period: p, pOffset, startDate, endDate });

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

      const rawProdRows = prodRes.data || [];
      const operators = opRes.data || [];
      const objekter = objRes.data || [];

      // Deduplicate fakt_tid: keep one row per (datum, operator_id, objekt_id).
      // If duplicates exist (from reimport), keep the row with highest engine_time_sek.
      const tidDedup: Record<string, any> = {};
      for (const r of (tidRes.data || [])) {
        const key = `${r.datum}|${r.operator_id || ''}|${r.objekt_id || ''}`;
        if (!tidDedup[key] || (r.engine_time_sek || 0) > (tidDedup[key].engine_time_sek || 0)) {
          tidDedup[key] = r;
        }
      }
      const rawTidRows = Object.values(tidDedup);

      console.log('[Maskinvy] Data loaded:', { maskinId, rawProd: rawProdRows.length, rawTid: rawTidRows.length, operators: operators.length });

      if (rawProdRows.length === 0 && rawTidRows.length === 0) {
        const emptyDays: string[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(sDate); d.setDate(d.getDate() + i);
          emptyDays.push(`${d.getDate()}/${d.getMonth() + 1}`);
        }
        const emptyData: DbData = {
          dailyVol: new Array(totalDays).fill(0),
          dailySt: new Array(totalDays).fill(0),
          days: emptyDays,
          totalVolym: 0, totalStammar: 0, g15Timmar: 0,
          produktivitet: 0, medelstam: 0,
          processingSek: 0, terrainSek: 0, kortStoppSek: 0,
          avbrottSek: 0, rastSek: 0, engineTimeSek: 0,
          operatorer: [], objekt: [], dagData: {},
          calendarDt: new Array(totalDays).fill(0),
          bransleTotalt: 0, branslePerM3: 0, stammarPerG15h: 0,
          klassLabels: [], klassVolym: [], klassStammar: [],
          klassM3g15: [], klassStg15: [], klassDieselM3: [],
          hasMth: false, sortimentPerDag: null,
        };
        (window as any).__maskinvyData = emptyData;
        setDataVersion(v => v + 1);
        setLoading(false);
        return;
      }

      const pad = (n: number) => String(n).padStart(2, '0');

      // ════════════════════════════════════════════════════════════
      // PRE-AGGREGATE: sum each table separately per (datum, operator_id, objekt_id)
      // to avoid any cross-multiplication between the 23 prod rows and 2 tid rows per day.
      // ════════════════════════════════════════════════════════════

      // ── Aggregate fakt_produktion per (datum, operator_id, objekt_id) ──
      type ProdAgg = { vol: number; st: number };
      const prodByDay: Record<string, ProdAgg> = {};                        // per datum
      const prodByDayOp: Record<string, ProdAgg> = {};                      // per datum|operator_id
      const prodByObjekt: Record<string, ProdAgg> = {};                     // per objekt_id
      const prodObjIds = new Set<string>();

      for (const r of rawProdRows) {
        const d = r.datum;
        // Per day totals
        if (!prodByDay[d]) prodByDay[d] = { vol: 0, st: 0 };
        prodByDay[d].vol += r.volym_m3sub || 0;
        prodByDay[d].st += r.stammar || 0;
        // Per day+operator
        const opKey = `${d}|${r.operator_id || ''}`;
        if (!prodByDayOp[opKey]) prodByDayOp[opKey] = { vol: 0, st: 0 };
        prodByDayOp[opKey].vol += r.volym_m3sub || 0;
        prodByDayOp[opKey].st += r.stammar || 0;
        // Per objekt
        if (r.objekt_id) {
          prodObjIds.add(r.objekt_id);
          if (!prodByObjekt[r.objekt_id]) prodByObjekt[r.objekt_id] = { vol: 0, st: 0 };
          prodByObjekt[r.objekt_id].vol += r.volym_m3sub || 0;
          prodByObjekt[r.objekt_id].st += r.stammar || 0;
        }
      }

      // ── Aggregate fakt_tid per (datum, operator_id, objekt_id) ──
      type TidAgg = { processingSek: number; terrainSek: number; otherWorkSek: number; disturbanceSek: number; maintenanceSek: number; avbrottSek: number; rastSek: number; engineTimeSek: number; bransleLiter: number };
      const emptyTid = (): TidAgg => ({ processingSek: 0, terrainSek: 0, otherWorkSek: 0, disturbanceSek: 0, maintenanceSek: 0, avbrottSek: 0, rastSek: 0, engineTimeSek: 0, bransleLiter: 0 });
      const addTid = (agg: TidAgg, r: any) => {
        agg.processingSek += r.processing_sek || 0;
        agg.terrainSek += r.terrain_sek || 0;
        agg.otherWorkSek += r.other_work_sek || 0;
        agg.disturbanceSek += r.disturbance_sek || 0;
        agg.maintenanceSek += r.maintenance_sek || 0;
        agg.avbrottSek += r.avbrott_sek || 0;
        agg.rastSek += r.rast_sek || 0;
        agg.engineTimeSek += r.engine_time_sek || 0;
        agg.bransleLiter += r.bransle_liter || 0;
      };

      const tidTotal: TidAgg = emptyTid();                                  // grand total
      const tidByDay: Record<string, TidAgg> = {};                          // per datum
      const tidByDayOp: Record<string, TidAgg> = {};                        // per datum|operator_id
      const tidByObjekt: Record<string, TidAgg> = {};                       // per objekt_id

      for (const r of rawTidRows) {
        const d = r.datum;
        addTid(tidTotal, r);
        // Per day
        if (!tidByDay[d]) tidByDay[d] = emptyTid();
        addTid(tidByDay[d], r);
        // Per day+operator
        const opKey = `${d}|${r.operator_id || ''}`;
        if (!tidByDayOp[opKey]) tidByDayOp[opKey] = emptyTid();
        addTid(tidByDayOp[opKey], r);
        // Per objekt
        if (r.objekt_id) {
          if (!tidByObjekt[r.objekt_id]) tidByObjekt[r.objekt_id] = emptyTid();
          addTid(tidByObjekt[r.objekt_id], r);
        }
      }

      // ════════════════════════════════════════════════════════════
      // BUILD RESULTS from pre-aggregated data (no raw row mixing)
      // ════════════════════════════════════════════════════════════

      // ── Daily production arrays ──
      const dailyVol: number[] = [];
      const dailySt: number[] = [];
      const dayLabels: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate); d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const p = prodByDay[dateStr];
        dailyVol.push(p ? Math.round(p.vol) : 0);
        dailySt.push(p ? Math.round(p.st) : 0);
        dayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      }

      // ── KPI totals (from pre-aggregated data) ──
      const totalVolym = Object.values(prodByDay).reduce((s, d) => s + d.vol, 0);
      const totalStammar = Object.values(prodByDay).reduce((s, d) => s + d.st, 0);

      // ── Time distribution (from tid grand total — never mixed with prod) ──
      const processingSek = tidTotal.processingSek;
      const terrainSek = tidTotal.terrainSek;
      const kortStoppSek = tidTotal.otherWorkSek;
      const avbrottSek = tidTotal.disturbanceSek + tidTotal.maintenanceSek;
      const rastSek = tidTotal.rastSek;
      const engineTimeSek = tidTotal.engineTimeSek;
      const bransleTotalt = tidTotal.bransleLiter;

      const g15Sek = processingSek + terrainSek;
      const g15Timmar = g15Sek / 3600;
      const produktivitet = g15Timmar > 0 ? totalVolym / g15Timmar : 0;
      const medelstam = totalStammar > 0 ? totalVolym / totalStammar : 0;
      const branslePerM3 = totalVolym > 0 ? bransleTotalt / totalVolym : 0;
      const stammarPerG15h = g15Timmar > 0 ? totalStammar / g15Timmar : 0;

      // ── Operators: aggregate prod and tid SEPARATELY per operator_id ──
      // 1. prodByOp: SUM(volym, stammar) from fakt_produktion per operator
      // 2. tidByOp: SUM(all tid fields) from fakt_tid per operator
      // 3. Merge per operator_id in JS — never cross-joined
      const prodByOp: Record<string, { vol: number; st: number; dagar: Set<string>; dailyVol: Record<string, number> }> = {};
      for (const r of rawProdRows) {
        const opId = r.operator_id;
        if (!opId) continue;
        if (!prodByOp[opId]) prodByOp[opId] = { vol: 0, st: 0, dagar: new Set(), dailyVol: {} };
        prodByOp[opId].vol += r.volym_m3sub || 0;
        prodByOp[opId].st += r.stammar || 0;
        prodByOp[opId].dagar.add(r.datum);
        prodByOp[opId].dailyVol[r.datum] = (prodByOp[opId].dailyVol[r.datum] || 0) + (r.volym_m3sub || 0);
      }
      const tidByOp: Record<string, TidAgg> = {};
      for (const r of rawTidRows) {
        const opId = r.operator_id;
        if (!opId) continue;
        if (!tidByOp[opId]) tidByOp[opId] = emptyTid();
        addTid(tidByOp[opId], r);
      }

      const opIds = new Set<string>();
      for (const id of Object.keys(prodByOp)) opIds.add(id);
      for (const id of Object.keys(tidByOp)) opIds.add(id);

      const operatorer = [...opIds].map(opId => {
        const pOp = prodByOp[opId];
        const tOp = tidByOp[opId] || emptyTid();
        const volym = pOp ? pOp.vol : 0;
        const stammar = pOp ? pOp.st : 0;
        const dagarSize = pOp ? pOp.dagar.size : 0;
        // timmar = engine_time from fakt_tid (never from fakt_produktion)
        const timmar = tOp.engineTimeSek / 3600;
        // m³/G15h = volym from fakt_produktion / g15h from fakt_tid
        const g15sek = tOp.processingSek + tOp.terrainSek;
        const g15h = g15sek / 3600;
        const prod = g15h > 0 ? volym / g15h : 0;
        // Daily vol array aligned to period
        const opDailyVol: number[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(sDate); d.setDate(d.getDate() + i);
          const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          opDailyVol.push(pOp ? Math.round(pOp.dailyVol[dateStr] || 0) : 0);
        }
        const opInfo = operators.find((o: any) => String(o.operator_id) === String(opId));
        const namn = opInfo?.operator_namn || `Operatör ${opId}`;
        const nameParts = namn.split(' ');
        const initialer = nameParts.length >= 2
          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
          : namn.substring(0, 2).toUpperCase();
        return {
          id: opId,
          key: opInfo?.operator_key || nameParts[0].toLowerCase(),
          namn, initialer, timmar, volym, prod,
          medelstam: stammar > 0 ? volym / stammar : 0,
          stammar, dagar: dagarSize,
          processingSek: tOp.processingSek,
          terrainSek: tOp.terrainSek,
          disturbanceSek: tOp.disturbanceSek + tOp.maintenanceSek,
          engineTimeSek: tOp.engineTimeSek,
          bransleLiter: tOp.bransleLiter,
          dailyVol: opDailyVol,
        };
      }).filter(o => o.volym > 0 || o.timmar > 0).sort((a, b) => b.volym - a.volym);

      // ── Objekt (prod and tid aggregated separately per objekt) ──
      const objekt = [...prodObjIds].map(oid => {
        const pAgg = prodByObjekt[oid] || { vol: 0, st: 0 };
        const tAgg = tidByObjekt[oid];
        const g15sek = tAgg ? tAgg.processingSek + tAgg.terrainSek : 0;
        const g15h = g15sek / 3600;
        const objInfo = objekter.find((o: any) => String(o.objekt_id) === String(oid));
        return {
          objekt_id: oid,
          namn: objInfo?.objekt_namn || `Objekt ${oid}`,
          vo_nummer: objInfo?.vo_nummer || '',
          volym: pAgg.vol, stammar: pAgg.st, g15h,
          prod: g15h > 0 ? pAgg.vol / g15h : 0,
        };
      }).sort((a, b) => b.volym - a.volym);

      // ── Build dagData from pre-aggregated daily data ──
      const dagData: DbData['dagData'] = {};
      const calendarDt: number[] = new Array(totalDays).fill(0);

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate); d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const pDay = prodByDay[dateStr];
        const tDay = tidByDay[dateStr];
        if (pDay && pDay.vol > 0) {
          const dayNum = i + 1;
          const g15sek = tDay ? tDay.processingSek + tDay.terrainSek : 0;
          const g15h = g15sek / 3600;
          const diesel = tDay ? tDay.bransleLiter : 0;
          // Find first operator/objekt for this day from raw rows
          const dayProdRow = rawProdRows.find((r: any) => r.datum === dateStr);
          const opInfo = dayProdRow?.operator_id ? operators.find((o: any) => String(o.operator_id) === String(dayProdRow.operator_id)) : null;
          const objInfo = dayProdRow?.objekt_id ? objekter.find((o: any) => String(o.objekt_id) === String(dayProdRow.objekt_id)) : null;
          dagData[dayNum] = {
            typ: 1, forare: opInfo?.operator_namn || '–',
            objekt: objInfo?.objekt_namn || '–',
            start: '07:00', slut: '16:30',
            vol: Math.round(pDay.vol), stammar: Math.round(pDay.st),
            g15: parseFloat(g15h.toFixed(1)),
            snitt: g15h > 0 ? parseFloat((pDay.vol / g15h).toFixed(1)) : 0,
            stg15: g15h > 0 ? Math.round(pDay.st / g15h) : 0,
            medelstam: pDay.st > 0 ? parseFloat((pDay.vol / pDay.st).toFixed(2)) : 0,
            diesel: pDay.vol > 0 ? parseFloat((diesel / pDay.vol).toFixed(1)) : 0,
            avbrott: [],
          };
          calendarDt[i] = 1;
        }
      }

      // ── Medelstamsklass-aggregering (per objekt → klass) ──
      // Medelstam = SUM(volym)/SUM(stammar) per objekt.
      // Alla KPI beräknas som viktat snitt: SUM/SUM per klass.
      // Klasser anpassas efter maskintyp.
      const isGallring = maskinId === 'R64101';
      const classEdges = isGallring
        ? [0, 0.03, 0.05, 0.07, 0.09, 0.12, Infinity]
        : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, Infinity];
      const klassLabels = isGallring
        ? ['0.00–0.03', '0.03–0.05', '0.05–0.07', '0.07–0.09', '0.09–0.12', '0.12+']
        : ['0.0–0.1', '0.1–0.2', '0.2–0.3', '0.3–0.4', '0.4–0.5', '0.5–0.7', '0.7+'];
      const nClasses = klassLabels.length;
      const klassAgg = Array.from({ length: nClasses }, () => ({ vol: 0, st: 0, g15sek: 0, bransle: 0 }));
      for (const oid of prodObjIds) {
        const pObj = prodByObjekt[oid];
        if (!pObj || pObj.st <= 0) continue;
        const medelstamObj = pObj.vol / pObj.st;
        let ci = nClasses - 1;
        for (let c = 0; c < nClasses; c++) {
          if (medelstamObj < classEdges[c + 1]) { ci = c; break; }
        }
        klassAgg[ci].vol += pObj.vol;
        klassAgg[ci].st += pObj.st;
        const tObj = tidByObjekt[oid];
        if (tObj) {
          klassAgg[ci].g15sek += tObj.processingSek + tObj.terrainSek;
          klassAgg[ci].bransle += tObj.bransleLiter;
        }
      }
      const klassVolym = klassAgg.map(k => Math.round(k.vol));
      const klassStammar = klassAgg.map(k => Math.round(k.st));
      const klassM3g15 = klassAgg.map(k => { const h = k.g15sek / 3600; return h > 0 ? parseFloat((k.vol / h).toFixed(1)) : 0; });
      const klassStg15 = klassAgg.map(k => { const h = k.g15sek / 3600; return h > 0 ? Math.round(k.st / h) : 0; });
      const klassDieselM3 = klassAgg.map(k => k.vol > 0 ? parseFloat((k.bransle / k.vol).toFixed(1)) : 0);

      // ── Check MTH data + fetch sortiment per dag ──
      const mthCheck = await supabase.from('fakt_produktion')
        .select('processtyp')
        .eq('maskin_id', maskinId)
        .eq('processtyp', 'MTH')
        .limit(1);
      const hasMth = (mthCheck.data?.length || 0) > 0;

      let sortimentPerDag: DbData['sortimentPerDag'] = null;
      if (!hasMth) {
        // Fetch sortiment data grouped per dag for this machine's objects
        const objIds = [...prodObjIds];
        if (objIds.length > 0) {
          const [sortRes, dimSortRes] = await Promise.all([
            supabase.from('fakt_sortiment')
              .select('objekt_id, sortiment_id, volym_m3sub')
              .in('objekt_id', objIds),
            supabase.from('dim_sortiment')
              .select('sortiment_id, namn'),
          ]);
          const dimSort = dimSortRes.data || [];
          const sortRows = sortRes.data || [];

          // Classify sortiment names into categories
          const catMap: Record<string, 'timmer' | 'kubb' | 'massa' | 'energi'> = {};
          for (const s of dimSort) {
            const n = (s.namn || '').toLowerCase();
            if (n.includes('timmer') || n.includes('såg') || n.includes('stock')) catMap[s.sortiment_id] = 'timmer';
            else if (n.includes('kubb')) catMap[s.sortiment_id] = 'kubb';
            else if (n.includes('massa') || n.includes('flis')) catMap[s.sortiment_id] = 'massa';
            else catMap[s.sortiment_id] = 'energi';
          }

          // Sum sortiment volym per objekt
          const objSortiment: Record<string, { timmer: number; kubb: number; massa: number; energi: number }> = {};
          for (const r of sortRows) {
            if (!objSortiment[r.objekt_id]) objSortiment[r.objekt_id] = { timmer: 0, kubb: 0, massa: 0, energi: 0 };
            const cat = catMap[r.sortiment_id] || 'energi';
            objSortiment[r.objekt_id][cat] += r.volym_m3sub || 0;
          }

          // Map back to daily arrays using rawProdRows dates → objekt_id
          const daySortiment: Record<string, { timmer: number; kubb: number; massa: number; energi: number }> = {};
          for (const r of rawProdRows) {
            if (!r.datum || !r.objekt_id) continue;
            if (!daySortiment[r.datum]) daySortiment[r.datum] = { timmer: 0, kubb: 0, massa: 0, energi: 0 };
            const objSort = objSortiment[r.objekt_id];
            if (!objSort) continue;
            const objTotal = objSort.timmer + objSort.kubb + objSort.massa + objSort.energi;
            if (objTotal <= 0) continue;
            // Distribute this day's volume by the object's sortiment proportions
            const dayVol = r.volym_m3sub || 0;
            daySortiment[r.datum].timmer += dayVol * (objSort.timmer / objTotal);
            daySortiment[r.datum].kubb += dayVol * (objSort.kubb / objTotal);
            daySortiment[r.datum].massa += dayVol * (objSort.massa / objTotal);
            daySortiment[r.datum].energi += dayVol * (objSort.energi / objTotal);
          }

          const sDays: string[] = [];
          const timmer: number[] = [];
          const kubb: number[] = [];
          const massa: number[] = [];
          const energi: number[] = [];
          for (let i = 0; i < totalDays; i++) {
            const d = new Date(sDate);
            d.setDate(d.getDate() + i);
            const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            sDays.push(`${d.getDate()}/${d.getMonth() + 1}`);
            const ds = daySortiment[dateStr];
            timmer.push(ds ? Math.round(ds.timmer) : 0);
            kubb.push(ds ? Math.round(ds.kubb) : 0);
            massa.push(ds ? Math.round(ds.massa) : 0);
            energi.push(ds ? Math.round(ds.energi) : 0);
          }
          sortimentPerDag = { days: sDays, timmer, kubb, massa, energi };
        }
      }

      console.log('[Maskinvy] Computed data:', {
        maskinId, period: p, hasMth,
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
        bransleTotalt: Math.round(bransleTotalt),
        branslePerM3: parseFloat(branslePerM3.toFixed(2)),
        stammarPerG15h: parseFloat(stammarPerG15h.toFixed(1)),
        klassLabels, klassVolym, klassStammar, klassM3g15, klassStg15, klassDieselM3,
        hasMth,
        sortimentPerDag,
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

  // ── Fetch KPIs for a specific date range (for comparison) ──
  const fetchPeriodKpi = useCallback(async (maskinId: string, startDate: string, endDate: string, label: string): Promise<PeriodKpi> => {
    const [prodRes, tidRes] = await Promise.all([
      supabase.from('fakt_produktion')
        .select('volym_m3sub, stammar')
        .eq('maskin_id', maskinId)
        .gte('datum', startDate).lte('datum', endDate),
      supabase.from('fakt_tid')
        .select('datum, operator_id, objekt_id, processing_sek, terrain_sek, engine_time_sek')
        .eq('maskin_id', maskinId)
        .gte('datum', startDate).lte('datum', endDate),
    ]);
    const prodRows = prodRes.data || [];
    // Deduplicate fakt_tid per (datum, operator_id, objekt_id)
    const tidDedupKpi: Record<string, any> = {};
    for (const r of (tidRes.data || [])) {
      const key = `${r.datum}|${r.operator_id || ''}|${r.objekt_id || ''}`;
      if (!tidDedupKpi[key] || (r.engine_time_sek || 0) > (tidDedupKpi[key].engine_time_sek || 0)) {
        tidDedupKpi[key] = r;
      }
    }
    const tidRows = Object.values(tidDedupKpi);
    const volym = prodRows.reduce((s: number, r: any) => s + (r.volym_m3sub || 0), 0);
    const stammar = prodRows.reduce((s: number, r: any) => s + (r.stammar || 0), 0);
    const g15Sek = tidRows.reduce((s: number, r: any) => s + (r.processing_sek || 0) + (r.terrain_sek || 0), 0);
    const g15Timmar = g15Sek / 3600;
    return {
      volym: Math.round(volym), stammar: Math.round(stammar),
      g15Timmar: Math.round(g15Timmar),
      produktivitet: g15Timmar > 0 ? parseFloat((volym / g15Timmar).toFixed(1)) : 0,
      medelstam: stammar > 0 ? parseFloat((volym / stammar).toFixed(2)) : 0,
      label,
    };
  }, []);

  const runComparison = useCallback(async () => {
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (!valdMaskinObj) return;
    setCmpLoading(true);
    const [a, b] = await Promise.all([
      fetchPeriodKpi(valdMaskinObj.maskin_id, cmpDateA.start, cmpDateA.end, `${cmpDateA.start} – ${cmpDateA.end}`),
      fetchPeriodKpi(valdMaskinObj.maskin_id, cmpDateB.start, cmpDateB.end, `${cmpDateB.start} – ${cmpDateB.end}`),
    ]);
    setCmpDataA(a);
    setCmpDataB(b);
    setCmpLoading(false);
  }, [maskiner, vald, cmpDateA, cmpDateB, fetchPeriodKpi]);

  // ── Fetch operator comparison data ──
  const runOpCmp = useCallback(async () => {
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (!valdMaskinObj || opCmpIds.length < 2) return;
    setOpCmpLoading(true);
    const [prodRes, tidRes, opRes] = await Promise.all([
      supabase.from('fakt_produktion')
        .select('datum, volym_m3sub, stammar, operator_id')
        .eq('maskin_id', valdMaskinObj.maskin_id)
        .in('operator_id', opCmpIds)
        .gte('datum', opCmpFrom).lte('datum', opCmpTo),
      supabase.from('fakt_tid')
        .select('datum, operator_id, processing_sek, terrain_sek, engine_time_sek, bransle_liter')
        .eq('maskin_id', valdMaskinObj.maskin_id)
        .in('operator_id', opCmpIds)
        .gte('datum', opCmpFrom).lte('datum', opCmpTo),
      supabase.from('dim_operator')
        .select('operator_id, operator_namn')
        .in('operator_id', opCmpIds),
    ]);
    const rawProd = prodRes.data || [];
    const opNames: Record<string, string> = {};
    (opRes.data || []).forEach((o: any) => { opNames[o.operator_id] = o.operator_namn || o.operator_id; });

    // Deduplicate fakt_tid per (datum, operator_id)
    const tidDedupCmp: Record<string, any> = {};
    for (const r of (tidRes.data || [])) {
      const key = `${r.datum}|${r.operator_id || ''}`;
      if (!tidDedupCmp[key] || (r.engine_time_sek || 0) > (tidDedupCmp[key].engine_time_sek || 0)) {
        tidDedupCmp[key] = r;
      }
    }
    const rawTid = Object.values(tidDedupCmp);

    // Pre-aggregate prod per (operator_id, YYYY-MM) to avoid 23x row multiplication
    const prodAgg: Record<string, { volym: number; stammar: number }> = {};
    const monthAgg: Record<string, Record<string, number>> = {};
    for (const r of rawProd) {
      const opId = r.operator_id;
      if (!opId) continue;
      if (!prodAgg[opId]) prodAgg[opId] = { volym: 0, stammar: 0 };
      prodAgg[opId].volym += r.volym_m3sub || 0;
      prodAgg[opId].stammar += r.stammar || 0;
      const ym = r.datum.substring(0, 7);
      if (!monthAgg[ym]) monthAgg[ym] = {};
      monthAgg[ym][opId] = (monthAgg[ym][opId] || 0) + (r.volym_m3sub || 0);
    }
    // Pre-aggregate tid per operator_id
    const tidAgg: Record<string, { g15sek: number; engineSek: number; bransle: number }> = {};
    for (const r of rawTid) {
      const opId = r.operator_id;
      if (!opId) continue;
      if (!tidAgg[opId]) tidAgg[opId] = { g15sek: 0, engineSek: 0, bransle: 0 };
      tidAgg[opId].g15sek += (r.processing_sek || 0) + (r.terrain_sek || 0);
      tidAgg[opId].engineSek += r.engine_time_sek || 0;
      tidAgg[opId].bransle += r.bransle_liter || 0;
    }

    const rows: OpCmpRow[] = opCmpIds.map(id => {
      const p = prodAgg[id] || { volym: 0, stammar: 0 };
      const t = tidAgg[id] || { g15sek: 0, engineSek: 0, bransle: 0 };
      const g15h = t.g15sek / 3600;
      const motorH = t.engineSek / 3600;
      return { id, namn: opNames[id] || id, stammar: Math.round(p.stammar), volym: Math.round(p.volym),
        prod: g15h > 0 ? parseFloat((p.volym / g15h).toFixed(1)) : 0,
        motorH: parseFloat(motorH.toFixed(1)),
        bransleH: motorH > 0 ? parseFloat((t.bransle / motorH).toFixed(1)) : 0 };
    });

    const months = Object.keys(monthAgg).sort().map(ym => ({ month: ym, byOp: monthAgg[ym] }));

    setOpCmpRows(rows);
    setOpCmpMonths(months);
    setOpCmpLoading(false);
  }, [maskiner, vald, opCmpIds, opCmpFrom, opCmpTo]);

  // ── Fetch machine comparison data ──
  const runMachCmp = useCallback(async () => {
    if (machCmpA === machCmpB) return;
    setMachCmpLoading(true);
    const ids = [machCmpA, machCmpB];

    // Fetch prod and tid SEPARATELY for both machines
    const [prodRes, tidRes] = await Promise.all([
      supabase.from('fakt_produktion')
        .select('datum, maskin_id, volym_m3sub, stammar')
        .in('maskin_id', ids)
        .gte('datum', machCmpFrom).lte('datum', machCmpTo),
      supabase.from('fakt_tid')
        .select('datum, maskin_id, operator_id, objekt_id, processing_sek, terrain_sek, engine_time_sek, bransle_liter')
        .in('maskin_id', ids)
        .gte('datum', machCmpFrom).lte('datum', machCmpTo),
    ]);

    // Pre-aggregate prod per maskin_id
    const prodAgg: Record<string, { vol: number; st: number }> = {};
    const monthProd: Record<string, Record<string, { vol: number; g15sek: number }>> = {}; // ym → maskin → {vol, g15sek}
    for (const r of (prodRes.data || [])) {
      const mid = r.maskin_id;
      if (!prodAgg[mid]) prodAgg[mid] = { vol: 0, st: 0 };
      prodAgg[mid].vol += r.volym_m3sub || 0;
      prodAgg[mid].st += r.stammar || 0;
      const ym = r.datum.substring(0, 7);
      if (!monthProd[ym]) monthProd[ym] = {};
      if (!monthProd[ym][mid]) monthProd[ym][mid] = { vol: 0, g15sek: 0 };
      monthProd[ym][mid].vol += r.volym_m3sub || 0;
    }

    // Deduplicate + pre-aggregate tid per maskin_id
    const tidDedup: Record<string, any> = {};
    for (const r of (tidRes.data || [])) {
      const key = `${r.datum}|${r.maskin_id}|${r.operator_id || ''}|${r.objekt_id || ''}`;
      if (!tidDedup[key] || (r.engine_time_sek || 0) > (tidDedup[key].engine_time_sek || 0)) tidDedup[key] = r;
    }
    const tidAgg: Record<string, { g15sek: number; engineSek: number; bransle: number }> = {};
    for (const r of Object.values(tidDedup)) {
      const mid = (r as any).maskin_id;
      if (!tidAgg[mid]) tidAgg[mid] = { g15sek: 0, engineSek: 0, bransle: 0 };
      tidAgg[mid].g15sek += ((r as any).processing_sek || 0) + ((r as any).terrain_sek || 0);
      tidAgg[mid].engineSek += (r as any).engine_time_sek || 0;
      tidAgg[mid].bransle += (r as any).bransle_liter || 0;
      // Monthly g15sek
      const ym = (r as any).datum.substring(0, 7);
      if (monthProd[ym]?.[mid]) monthProd[ym][mid].g15sek += ((r as any).processing_sek || 0) + ((r as any).terrain_sek || 0);
    }

    const rows: MachCmpRow[] = ids.map(mid => {
      const p = prodAgg[mid] || { vol: 0, st: 0 };
      const t = tidAgg[mid] || { g15sek: 0, engineSek: 0, bransle: 0 };
      const g15h = t.g15sek / 3600;
      return {
        id: mid,
        namn: allMachines.find(m => m.id === mid)?.namn || mid,
        stammar: Math.round(p.st), volym: Math.round(p.vol),
        medelstam: p.st > 0 ? parseFloat((p.vol / p.st).toFixed(3)) : 0,
        prod: g15h > 0 ? parseFloat((p.vol / g15h).toFixed(1)) : 0,
        dieselM3: p.vol > 0 ? parseFloat((t.bransle / p.vol).toFixed(2)) : 0,
        motorH: parseFloat((t.engineSek / 3600).toFixed(1)),
      };
    });

    // Monthly m³/G15h per machine
    const months: MachCmpMonth[] = Object.keys(monthProd).sort().map(ym => {
      const byMach: Record<string, number> = {};
      for (const mid of ids) {
        const d = monthProd[ym]?.[mid];
        if (d && d.g15sek > 0) byMach[mid] = d.vol / (d.g15sek / 3600);
        else byMach[mid] = 0;
      }
      return { month: ym, byMach };
    });

    setMachCmpRows(rows);
    setMachCmpMonths(months);
    setMachCmpLoading(false);
  }, [machCmpA, machCmpB, machCmpFrom, machCmpTo]);

  // Load available operators when switching to operatorer view
  useEffect(() => {
    if (activeView !== 'operatorer') return;
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (!valdMaskinObj) return;
    (async () => {
      const { data } = await supabase.from('dim_operator')
        .select('operator_id, operator_namn')
        .eq('maskin_id', valdMaskinObj.maskin_id);
      if (data) setOpCmpAllOps(data.map((o: any) => ({ id: o.operator_id, namn: o.operator_namn || o.operator_id })));
    })();
  }, [activeView, maskiner, vald]);

  // Fetch data when machine or period changes
  useEffect(() => {
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (valdMaskinObj) {
      console.log('[Maskinvy] Trigger fetch:', { modell: vald, maskin_id: valdMaskinObj.maskin_id, period });
      fetchDbData(valdMaskinObj.maskin_id, period, periodOffset);
    }
  }, [vald, maskiner, period, periodOffset, fetchDbData]);

  // ── Re-initialize charts every time data updates or view changes ──
  useEffect(() => {
    if (dataVersion === 0) return;

    let scriptEl: HTMLScriptElement | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;

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
        const dailyEl = document.getElementById('dailyChart');
        if (!dailyEl) {
          console.warn('[Maskinvy] DOM not ready, retrying in 200ms');
          if (retries++ < 20) timer = setTimeout(runScript, 200);
          return;
        }
        // Chart.js needs visible canvas with dimensions > 0.
        // Temporarily show all hidden view-sections so canvases get size.
        const hiddenSections = document.querySelectorAll<HTMLElement>('.view-section');
        const origDisplay: string[] = [];
        hiddenSections.forEach((el, i) => {
          origDisplay[i] = el.style.display;
          if (getComputedStyle(el).display === 'none') {
            el.style.setProperty('display', 'block', 'important');
          }
        });

        destroyCharts();
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-maskinvy', 'true');
        scriptEl.textContent = MASKINVY_SCRIPT;
        document.body.appendChild(scriptEl);
        console.log('[Maskinvy] Charts initialized (v' + dataVersion + ')');

        // Restore original display after Chart.js has read dimensions
        requestAnimationFrame(() => {
          hiddenSections.forEach((el, i) => {
            el.style.display = origDisplay[i];
          });
        });
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
  }, [dataVersion, activeView]);

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
            { icon: '⇄', label: 'Jämför perioder', view: 'jamfor' },
          ].map(item => {
            const isActive = activeView === item.view;
            return (
            <div key={item.label} onClick={() => { setActiveView(item.view); if (item.view === 'jamfor') setShowCmp(true); }} style={{
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
        {/* Maskin + Period */}
        <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Period type + navigation */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666', marginBottom: 2 }}>Period</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            {(['V', 'M', 'K', 'Å'] as const).map((p) => (
              <button key={p} onClick={() => { setPeriod(p); setPeriodOffset(0); }} style={{
                flex: 1, padding: '5px 0', border: 'none', borderRadius: 6,
                background: period === p ? '#1e1e1c' : 'transparent',
                color: period === p ? '#e8e8e4' : '#555',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Geist', system-ui, sans-serif",
              }}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <button onClick={() => setPeriodOffset(o => o - 1)} style={{
              width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent',
              color: '#7a7a72', fontSize: 14, cursor: 'pointer', fontFamily: "'Geist', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
            <div style={{
              flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600,
              color: periodOffset === 0 ? '#e8e8e4' : '#00c48c', letterSpacing: '-0.2px',
            }}>
              {getPeriodLabel(period, periodOffset)}
            </div>
            <button onClick={() => setPeriodOffset(o => Math.min(o + 1, 0))} style={{
              width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent',
              color: periodOffset >= 0 ? '#333' : '#7a7a72', fontSize: 14,
              cursor: periodOffset >= 0 ? 'default' : 'pointer',
              fontFamily: "'Geist', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>›</button>
          </div>

          {/* Maskin — custom dropdown that opens UPWARD */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666', marginTop: 8, marginBottom: 2 }}>Maskin</div>
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

        </div>
      </aside>
      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', background: '#111110' }}>

      {/* ── PERIOD COMPARISON PANEL ── */}
      {activeView === 'jamfor' && (
        <div style={{ padding: '24px 28px 60px', fontFamily: "'Geist', system-ui, sans-serif", maxWidth: 900 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e8e8e4', letterSpacing: -0.5, marginBottom: 4 }}>
            Jämför perioder
          </div>
          <div style={{ fontSize: 13, color: '#7a7a72', marginBottom: 24 }}>
            {valdMaskin ? `${valdMaskin.tillverkare} ${valdMaskin.modell}` : ''} — sida vid sida
          </div>

          {/* Date pickers */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ background: '#1a1a18', border: '1px solid rgba(90,255,140,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#00c48c', letterSpacing: '0.08em' }}>A</span>
              <input type="date" value={cmpDateA.start} onChange={e => setCmpDateA(p => ({ ...p, start: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <span style={{ color: '#3a3a36' }}>–</span>
              <input type="date" value={cmpDateA.end} onChange={e => setCmpDateA(p => ({ ...p, end: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3a3a36' }}>VS</span>
            <div style={{ background: '#1a1a18', border: '1px solid rgba(255,179,64,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#ffb340', letterSpacing: '0.08em' }}>B</span>
              <input type="date" value={cmpDateB.start} onChange={e => setCmpDateB(p => ({ ...p, start: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <span style={{ color: '#3a3a36' }}>–</span>
              <input type="date" value={cmpDateB.end} onChange={e => setCmpDateB(p => ({ ...p, end: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
            </div>
            <button onClick={runComparison} style={{
              padding: '10px 20px', border: 'none', borderRadius: 8,
              background: '#1a4a2e', color: '#00c48c', fontFamily: "'Geist', system-ui, sans-serif",
              fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: -0.2,
            }}>
              {cmpLoading ? 'Laddar...' : 'Visa →'}
            </button>
          </div>

          {/* Comparison results */}
          {cmpDataA && cmpDataB && (
            <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px 1fr', gap: 7, alignItems: 'center', marginBottom: 12 }}>
                <div />
                <div style={{ background: 'rgba(90,255,140,0.08)', color: '#00c48c', borderRadius: 7, padding: '9px 14px', fontSize: 11, fontWeight: 600, border: '1px solid rgba(90,255,140,0.15)' }}>Period A</div>
                <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#3a3a36' }}>VS</div>
                <div style={{ background: 'rgba(255,179,64,0.08)', color: '#ffb340', borderRadius: 7, padding: '9px 14px', fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,179,64,0.15)' }}>Period B</div>
              </div>
              {[
                { lbl: 'Volym', a: cmpDataA.volym, b: cmpDataB.volym, unit: 'm³' },
                { lbl: 'Stammar', a: cmpDataA.stammar, b: cmpDataB.stammar, unit: 'st' },
                { lbl: 'G15-timmar', a: cmpDataA.g15Timmar, b: cmpDataB.g15Timmar, unit: 'h' },
                { lbl: 'Produktivitet', a: cmpDataA.produktivitet, b: cmpDataB.produktivitet, unit: 'm³/G15h' },
                { lbl: 'Medelstam', a: cmpDataA.medelstam, b: cmpDataB.medelstam, unit: 'm³/st' },
              ].map(m => {
                const diff = m.a > 0 ? ((m.b - m.a) / m.a * 100) : 0;
                const pos = m.b >= m.a;
                const fmt = (v: number) => v > 100 ? v.toLocaleString('sv-SE') : v;
                return (
                  <div key={m.lbl} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px 1fr', gap: 7, alignItems: 'center', marginBottom: 7 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7a7a72' }}>{m.lbl}</div>
                    <div style={{ background: '#222220', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: '#00c48c' }}>{fmt(m.a)}</span>
                      <span style={{ fontSize: 11, color: '#7a7a72' }}>{m.unit}</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        borderRadius: 5, padding: '3px 1px', fontSize: 10, fontWeight: 700,
                        background: pos ? 'rgba(90,255,140,0.1)' : 'rgba(255,95,87,0.1)',
                        color: pos ? '#00c48c' : '#ff5f57',
                      }}>
                        {diff !== 0 ? `${pos ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div style={{ background: '#222220', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: '#ffb340' }}>{fmt(m.b)}</span>
                      <span style={{ fontSize: 11, color: '#7a7a72' }}>{m.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── MACHINE COMPARISON ── */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 28, marginTop: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8e4', letterSpacing: -0.4, marginBottom: 4 }}>
              Jämför maskiner
            </div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>
              Välj två maskiner och en period
            </div>

            {/* Machine selectors + date range */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <select value={machCmpA} onChange={e => setMachCmpA(e.target.value)} style={{
                background: '#1a1a18', border: '1px solid rgba(90,255,140,0.15)', borderRadius: 8,
                padding: '7px 10px', color: '#00c48c', fontFamily: "'Geist', system-ui, sans-serif",
                fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer',
              }}>
                {allMachines.map(m => <option key={m.id} value={m.id}>{m.namn}</option>)}
              </select>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#3a3a36' }}>VS</span>
              <select value={machCmpB} onChange={e => setMachCmpB(e.target.value)} style={{
                background: '#1a1a18', border: '1px solid rgba(91,143,255,0.2)', borderRadius: 8,
                padding: '7px 10px', color: '#5b8fff', fontFamily: "'Geist', system-ui, sans-serif",
                fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer',
              }}>
                {allMachines.map(m => <option key={m.id} value={m.id}>{m.namn}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <input type="date" value={machCmpFrom} onChange={e => setMachCmpFrom(e.target.value)}
                style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <span style={{ color: '#3a3a36', fontSize: 12 }}>–</span>
              <input type="date" value={machCmpTo} onChange={e => setMachCmpTo(e.target.value)}
                style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <button onClick={runMachCmp} disabled={machCmpA === machCmpB} style={{
                padding: '7px 16px', border: 'none', borderRadius: 8,
                background: machCmpA !== machCmpB ? '#1a4a2e' : '#1a1a18',
                color: machCmpA !== machCmpB ? '#00c48c' : '#555',
                fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, fontWeight: 600,
                cursor: machCmpA !== machCmpB ? 'pointer' : 'default',
              }}>
                {machCmpLoading ? 'Laddar...' : 'Jämför →'}
              </button>
            </div>

            {/* Results */}
            {machCmpRows.length === 2 && (
              <>
                <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Maskin</th>
                        {['Stammar', 'Volym m³', 'Medelstam', 'm³/G15h', 'L/m³', 'Motortid h'].map(h => (
                          <th key={h} style={{ padding: '10px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {machCmpRows.map((r, i) => {
                        const other = machCmpRows[1 - i];
                        const colors = ['#00c48c', '#5b8fff'];
                        const better = (a: number, b: number, higher: boolean) => higher ? a >= b : a <= b;
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: colors[i] }}>{r.namn}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.stammar, other.stammar, true) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.stammar, other.stammar, true) ? 700 : 400 }}>{r.stammar.toLocaleString('sv-SE')}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.volym, other.volym, true) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.volym, other.volym, true) ? 700 : 400 }}>{r.volym.toLocaleString('sv-SE')}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{r.medelstam}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.prod, other.prod, true) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.prod, other.prod, true) ? 700 : 400 }}>{r.prod}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.dieselM3, other.dieselM3, false) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.dieselM3, other.dieselM3, false) ? 700 : 400 }}>{r.dieselM3}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{r.motorH}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Monthly m³/G15h chart */}
                {machCmpMonths.length > 0 && (
                  <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 16px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#3a3a36', marginBottom: 12 }}>
                      m³/G15h per månad
                    </div>
                    <div style={{ height: 240, position: 'relative' }}>
                      <canvas ref={machCmpChartRef} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: activeView === 'jamfor' ? 'none' : 'block' }}>
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

  <!-- KPI ROW 2 — Bränsle + Stammar/G15h -->
  <div class="hero view-section vs-oversikt" id="sec-kpi2" style="grid-template-columns:repeat(3,1fr);margin-top:-8px;">
    <div class="kpi anim" style="animation-delay:0.15s">
      <div class="k-label">Bränsle totalt</div>
      <div class="k-val" data-count="0">0</div>
      <div class="k-unit">liter</div>
    </div>
    <div class="kpi anim" style="animation-delay:0.18s">
      <div class="k-label">Bränsle/m³</div>
      <div class="k-val" data-count="0" data-dec="2">0</div>
      <div class="k-unit">L/m³</div>
    </div>
    <div class="kpi anim" style="animation-delay:0.21s">
      <div class="k-label">Stammar/G15h</div>
      <div class="k-val" data-count="0" data-dec="1">0</div>
      <div class="k-unit">st/G15h</div>
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

  <!-- MTH (hidden for slutavverkningsskördare without MTH data) -->
  <div class="gf view-section vs-produktion vs-tradslag" id="sec-mth">
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

  <!-- SORTIMENT PER DAG (shown instead of MTH for slutavverkningsskördare) -->
  <div class="gf view-section vs-produktion vs-tradslag" id="sec-sortiment-dag" style="display:none">
    <div class="card anim" style="animation-delay:0.75s">
      <div class="card-h">
        <div class="card-t">Sortiment per dag</div>
        <div style="display:flex;gap:12px;">
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(90,255,140,0.5)"></div>Timmer</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(91,143,255,0.5)"></div>Kubb</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(255,179,64,0.4)"></div>Massa</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(255,255,255,0.1)"></div>Energi</div>
        </div>
      </div>
      <div class="card-b">
        <canvas id="sortDagChart" style="max-height:190px"></canvas>
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
        </div>
        <div class="sc-grid" id="prodScGrid"></div>
      </div>
    </div>
  </div>

  <!-- DIESEL DIAGRAM -->
  <div class="view-section vs-produktion" style="margin-top:8px;">
    <div class="card anim" style="animation-delay:0.7s">
      <div class="card-h"><div class="card-t">Dieselförbrukning per medelstamsklass</div></div>
      <div class="card-b">
        <canvas id="dieselChart" style="max-height:200px;margin-bottom:16px;"></canvas>
        <div class="sc-grid" id="dieselScGrid"></div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:20px;" id="dieselSummary">
          <div class="snum"><div class="snum-v">–</div><div class="snum-l">Snitt l/m³</div></div>
          <div class="snum"><div class="snum-v">–</div><div class="snum-l">l/stam</div></div>
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

      {/* ── OPERATOR COMPARISON — below the operator cards ── */}
      {activeView === 'operatorer' && (
        <div style={{ padding: '0 28px 60px', fontFamily: "'Geist', system-ui, sans-serif", maxWidth: 960 }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 24, marginTop: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8e4', letterSpacing: -0.3, marginBottom: 4 }}>
              Jämför operatörer
            </div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 16 }}>
              Välj 2–4 operatörer och en period
            </div>

            {/* Operator selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {opCmpAllOps.map(op => {
                const sel = opCmpIds.includes(op.id);
                return (
                  <button key={op.id} onClick={() => {
                    setOpCmpIds(prev => sel ? prev.filter(x => x !== op.id) : prev.length < 4 ? [...prev, op.id] : prev);
                  }} style={{
                    padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: sel ? '#1a4a2e' : '#1a1a18',
                    color: sel ? '#00c48c' : '#7a7a72',
                    fontSize: 11, fontWeight: 600, fontFamily: "'Geist', system-ui, sans-serif",
                    transition: 'all 0.15s',
                  }}>
                    {op.namn}
                  </button>
                );
              })}
            </div>

            {/* Date range */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
              <input type="date" value={opCmpFrom} onChange={e => setOpCmpFrom(e.target.value)}
                style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <span style={{ color: '#3a3a36', fontSize: 12 }}>–</span>
              <input type="date" value={opCmpTo} onChange={e => setOpCmpTo(e.target.value)}
                style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <button onClick={runOpCmp} disabled={opCmpIds.length < 2} style={{
                padding: '7px 16px', border: 'none', borderRadius: 8,
                background: opCmpIds.length >= 2 ? '#1a4a2e' : '#1a1a18',
                color: opCmpIds.length >= 2 ? '#00c48c' : '#555',
                fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, fontWeight: 600,
                cursor: opCmpIds.length >= 2 ? 'pointer' : 'default',
              }}>
                {opCmpLoading ? 'Laddar...' : 'Jämför →'}
              </button>
            </div>

            {/* Results table */}
            {opCmpRows.length > 0 && (
              <>
                <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Operatör</th>
                        <th style={{ padding: '10px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Stammar</th>
                        <th style={{ padding: '10px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Volym m³</th>
                        <th style={{ padding: '10px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>m³/G15h</th>
                        <th style={{ padding: '10px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Motortid h</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Bränsle L/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opCmpRows.map((r, i) => {
                        const colors = ['#00c48c', '#5b8fff', '#ffb340', '#ff5f57'];
                        const best = (field: keyof OpCmpRow, higher = true) => {
                          const vals = opCmpRows.map(x => x[field] as number);
                          const target = higher ? Math.max(...vals) : Math.min(...vals);
                          return r[field] === target;
                        };
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: colors[i % colors.length] }}>{r.namn}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: best('stammar') ? '#e8e8e4' : '#7a7a72', fontWeight: best('stammar') ? 700 : 400 }}>{r.stammar.toLocaleString('sv-SE')}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: best('volym') ? '#e8e8e4' : '#7a7a72', fontWeight: best('volym') ? 700 : 400 }}>{r.volym.toLocaleString('sv-SE')}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: best('prod') ? '#e8e8e4' : '#7a7a72', fontWeight: best('prod') ? 700 : 400 }}>{r.prod}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{r.motorH}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: best('bransleH', false) ? '#e8e8e4' : '#7a7a72', fontWeight: best('bransleH', false) ? 700 : 400 }}>{r.bransleH}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Monthly volume chart */}
                {opCmpMonths.length > 0 && (
                  <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 16px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#3a3a36', marginBottom: 12 }}>
                      Volym per månad
                    </div>
                    <div style={{ height: 240, position: 'relative' }}>
                      <canvas ref={opCmpChartRef} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
