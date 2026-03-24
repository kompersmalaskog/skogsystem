'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Maskin = { maskin_id: number; modell: string; tillverkare: string; typ: string };

const MASKINVY_SCRIPT = `
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

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

setTimeout(()=>{
  countUp(document.getElementById('hv'), 1847, 0, 1400);
  document.querySelectorAll('.k-val[data-count]').forEach(el=>{
    const v = parseFloat(el.dataset.count);
    const d = parseInt(el.dataset.dec||0);
    countUp(el, v, d, 1200);
  });
}, 300);

// Daily chart
const dailyVol = [0,0,142,168,0,0,188,195,172,0,0,155,0,178,192,0,0,168,145,188,0,0,175,162,144,0,0,130];
const dailySt  = [0,0,620,710,0,0,780,820,700,0,0,640,0,730,800,0,0,710,620,790,0,0,730,680,600,0,0,540];
const days = Array.from({length:28},(_,i)=>\`\${i+1}/2\`);

new Chart(document.getElementById('dailyChart'),{
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
const dt=[0,0,1,1,0,0,1,1,1,0,0,2,0,1,1,0,0,1,1,3,0,0,2,1,1,0,0,1];
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

// Tabs
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  t.classList.add('on');
}));

// ── MACHINE MENU ──
function toggleMMenu(){ document.getElementById('mMenu').classList.toggle('open'); }
function pickM(el,name,sub,color){
  document.getElementById('mName').textContent=name;
  document.getElementById('mDot').style.cssText=\`width:7px;height:7px;border-radius:50%;flex-shrink:0;background:\${color}\`;
  document.querySelectorAll('.mach-opt').forEach(o=>o.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('mMenu').classList.remove('open');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.mach-wrap')) document.getElementById('mMenu').classList.remove('open');
});

// ── OVERLAY HELPER ──
function openOverlay()  { document.getElementById('forarOverlay').classList.add('open'); }
function closeOverlay() { document.getElementById('forarOverlay').classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('forarOverlay').addEventListener('click', () => {
    closeAllPanels();
  });
});

function closeAllPanels() {
  closeOverlay();
  document.getElementById('forarPanel').classList.remove('open');
  document.getElementById('bolagPanel').classList.remove('open');
  document.getElementById('tradslagPanel').classList.remove('open');
  document.getElementById('tidPanel').classList.remove('open');
  document.getElementById('dagPanel').classList.remove('open');
  document.getElementById('objTypPanel').classList.remove('open');
  document.getElementById('objJmfPanel').classList.remove('open');
}

// ── FÖRARE ──
const forare = {
  stefan: { av:'SK', name:'Stefan Karlsson', timmar:68, volym:820, prod:12.1, medelstam:0.28, mth:18, stammar:2930,
    klasser:[{k:'0.0–0.1',prod:8.2,st:98,vol:42},{k:'0.1–0.2',prod:11.1,st:72,vol:110},{k:'0.2–0.3',prod:12.0,st:44,vol:242},{k:'0.3–0.4',prod:12.8,st:34,vol:198},{k:'0.4–0.5',prod:13.5,st:28,vol:148},{k:'0.5–0.7',prod:14.0,st:22,vol:68},{k:'0.7+',prod:16.2,st:18,vol:12}],
    dagar:14, objekt:'Ålshult AU 2025', gran:62, tall:26, bjork:12 },
  marcus: { av:'MN', name:'Marcus Nilsson', timmar:54, volym:598, prod:11.1, medelstam:0.25, mth:22, stammar:2390,
    klasser:[{k:'0.0–0.1',prod:7.4,st:105,vol:38},{k:'0.1–0.2',prod:9.8,st:75,vol:98},{k:'0.2–0.3',prod:10.2,st:43,vol:188},{k:'0.3–0.4',prod:10.9,st:31,vol:182},{k:'0.4–0.5',prod:11.4,st:26,vol:62},{k:'0.5–0.7',prod:11.8,st:20,vol:22},{k:'0.7+',prod:13.0,st:14,vol:8}],
    dagar:12, objekt:'Björsamåla AU 2025', gran:58, tall:30, bjork:12 },
  par: { av:'PL', name:'Pär Lindgren', timmar:41, volym:429, prod:10.5, medelstam:0.22, mth:28, stammar:1950,
    klasser:[{k:'0.0–0.1',prod:6.8,st:112,vol:58},{k:'0.1–0.2',prod:9.2,st:78,vol:90},{k:'0.2–0.3',prod:9.8,st:45,vol:115},{k:'0.3–0.4',prod:10.1,st:30,vol:102},{k:'0.4–0.5',prod:10.8,st:25,vol:42},{k:'0.5–0.7',prod:11.2,st:19,vol:18},{k:'0.7+',prod:12.0,st:12,vol:4}],
    dagar:10, objekt:'Karamåla 19 A-S', gran:55, tall:28, bjork:17 }
};

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
  const on = document.getElementById('cmpBtn').classList.toggle('on');
  document.getElementById('cmpBar').classList.toggle('show', on);
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

// ── DAG DATA ──
const dagData = {
  3:  { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:45', slut:'16:20', vol:142, stammar:620,  g15:8.2,  snitt:11.8, stg15:75, medelstam:0.23, avbrott:[{orsak:'Tankning',tid:'22 min'},{orsak:'Rast',tid:'35 min'}], diesel:3.8 },
  4:  { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:00', slut:'17:10', vol:168, stammar:710,  g15:9.1,  snitt:12.1, stg15:78, medelstam:0.24, avbrott:[{orsak:'Maskinfel – kranstyrning',tid:'48 min'},{orsak:'Rast',tid:'30 min'}], diesel:4.1 },
  7:  { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:50', slut:'16:45', vol:188, stammar:780,  g15:9.8,  snitt:12.4, stg15:80, medelstam:0.24, avbrott:[{orsak:'Tankning',tid:'18 min'},{orsak:'Rast',tid:'30 min'}], diesel:3.6 },
  8:  { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S',   start:'07:15', slut:'17:30', vol:195, stammar:820,  g15:10.2, snitt:12.7, stg15:80, medelstam:0.24, avbrott:[{orsak:'Rast',tid:'30 min'}], diesel:3.5 },
  9:  { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:45', slut:'16:15', vol:172, stammar:700,  g15:8.9,  snitt:11.9, stg15:79, medelstam:0.25, avbrott:[{orsak:'Service – oljebyte',tid:'55 min'},{orsak:'Rast',tid:'30 min'}], diesel:3.9 },
  12: { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:00', slut:'16:50', vol:155, stammar:640,  g15:8.4,  snitt:11.5, stg15:76, medelstam:0.24, avbrott:[{orsak:'Tankning',tid:'20 min'},{orsak:'Rast',tid:'35 min'}], diesel:4.0 },
  14: { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S',   start:'07:20', slut:'17:40', vol:178, stammar:730,  g15:9.3,  snitt:12.0, stg15:78, medelstam:0.24, avbrott:[{orsak:'Rast',tid:'30 min'}], diesel:3.7 },
  15: { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:50', slut:'17:00', vol:192, stammar:800,  g15:10.0, snitt:12.5, stg15:80, medelstam:0.24, avbrott:[{orsak:'Tankning',tid:'22 min'},{orsak:'Rast',tid:'30 min'}], diesel:3.6 },
  18: { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:05', slut:'16:55', vol:168, stammar:710,  g15:8.8,  snitt:11.8, stg15:81, medelstam:0.24, avbrott:[{orsak:'Väntan – körbesked',tid:'40 min'},{orsak:'Rast',tid:'30 min'}], diesel:4.2 },
  19: { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S',   start:'07:10', slut:'16:40', vol:145, stammar:620,  g15:7.9,  snitt:11.1, stg15:78, medelstam:0.23, avbrott:[{orsak:'Maskinfel – aggregat',tid:'1h 12 min'},{orsak:'Rast',tid:'30 min'}], diesel:4.4 },
  20: { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:45', slut:'17:10', vol:188, stammar:790,  g15:9.9,  snitt:12.6, stg15:80, medelstam:0.24, avbrott:[{orsak:'Tankning',tid:'20 min'},{orsak:'Rast',tid:'35 min'}], diesel:3.5 },
  23: { typ:2, forare:'–', objekt:'Ålshult → Björsamåla', start:'07:00', slut:'14:30', vol:0, stammar:0, g15:0, snitt:0, stg15:0, medelstam:0, avbrott:[], diesel:0, flytt:true },
  24: { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:00', slut:'16:50', vol:162, stammar:680,  g15:8.5,  snitt:11.8, stg15:80, medelstam:0.24, avbrott:[{orsak:'Rast',tid:'30 min'}], diesel:3.8 },
  25: { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S',   start:'07:15', slut:'16:30', vol:144, stammar:600,  g15:7.8,  snitt:11.1, stg15:77, medelstam:0.24, avbrott:[{orsak:'Tankning',tid:'18 min'},{orsak:'Rast',tid:'30 min'}], diesel:3.9 },
  28: { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:50', slut:'16:20', vol:130, stammar:540,  g15:7.2,  snitt:10.8, stg15:75, medelstam:0.24, avbrott:[{orsak:'Service – filter',tid:'45 min'},{orsak:'Rast',tid:'35 min'}], diesel:4.1 },
};

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
`;

export default function Maskinvy() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [vald, setVald] = useState('');

  useEffect(() => {
    supabase.from('dim_maskin').select('maskin_id,modell,tillverkare,typ').then(({ data }) => {
      if (data) { setMaskiner(data); setVald(data[0]?.modell ?? ''); }
    });
  }, []);

  useEffect(() => {
    let scriptEl: HTMLScriptElement | null = null;

    function initCharts() {
      scriptEl = document.createElement('script');
      scriptEl.textContent = MASKINVY_SCRIPT;
      document.body.appendChild(scriptEl);
    }

    // @ts-ignore
    if (typeof window !== 'undefined' && !(window as any).Chart) {
      const chartJs = document.createElement('script');
      chartJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      chartJs.onload = initCharts;
      document.head.appendChild(chartJs);
    } else {
      initCharts();
    }

    return () => {
      if (scriptEl) scriptEl.remove();
      // @ts-ignore
      if (typeof window !== 'undefined' && (window as any).Chart) {
        document.querySelectorAll('canvas').forEach((c) => {
          // @ts-ignore
          const chart = (window as any).Chart.getChart(c as HTMLCanvasElement);
          if (chart) chart.destroy();
        });
      }
    };
  }, []);

  const valdMaskin = maskiner.find(m => m.modell === vald);

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', zIndex: 1 }}>
      {/* ── MASKINVÄLJARE (Supabase) ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 200, background: 'rgba(17,17,16,0.92)',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 36px', display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: "'Geist', system-ui, sans-serif",
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#7a7a72' }}>Maskin</span>
        <select
          value={vald}
          onChange={e => setVald(e.target.value)}
          style={{
            background: '#222220', color: '#e8e8e4', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7, padding: '6px 12px', fontSize: 13, fontFamily: "'Geist', system-ui, sans-serif",
            outline: 'none', cursor: 'pointer', minWidth: 240,
          }}
        >
          {maskiner.map(m => (
            <option key={m.maskin_id} value={m.modell}>{m.tillverkare} {m.modell} ({m.typ})</option>
          ))}
        </select>
        {valdMaskin && (
          <span style={{ fontSize: 11, color: '#7a7a72' }}>ID: {valdMaskin.maskin_id}</span>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.mach-wrap { display: none !important; }
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
  height: 58px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 36px;
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
.page { max-width: 1320px; margin: 0 auto; padding: 28px 36px 60px; }

/* ── ANIMATIONS ── */
@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
.anim { opacity: 0; animation: fadeUp 0.5s forwards; }

/* ── HERO ── */
.hero { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.hero-main { grid-column: 1 / -1; }

.hero-main {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 28px 32px;
  position: relative; overflow: hidden;
  animation-delay: 0.05s;
}
.hero-main::after {
  content: ''; position: absolute; bottom: -60px; right: -60px;
  width: 200px; height: 200px; border-radius: 50%;
  background: radial-gradient(circle, rgba(90,255,140,0.08) 0%, transparent 70%);
}

.hero-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 12px; }
.hero-val {
  font-family: 'Fraunces', serif; font-size: 64px; line-height: 1;
  font-weight: 700; letter-spacing: -3px; color: var(--accent);
  margin-bottom: 4px;
}
.hero-unit { font-size: 14px; color: var(--muted); font-weight: 400; }
.hero-delta { margin-top: 18px; font-size: 12px; color: var(--accent); opacity: 0.8; display: flex; align-items: center; gap: 4px; }

.kpi {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 24px 20px; position: relative; overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.kpi:hover { border-color: var(--border2); transform: translateY(-1px); }
.kpi:nth-child(2){animation-delay:0.1s} .kpi:nth-child(3){animation-delay:0.15s}
.kpi:nth-child(4){animation-delay:0.2s} .kpi:nth-child(5){animation-delay:0.25s}

.k-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 10px; }
.k-val { font-family: 'Fraunces', serif; font-size: 36px; line-height: 1; letter-spacing: -1px; color: var(--text); margin-bottom: 4px; }
.k-unit { font-size: 11px; color: var(--muted); }
.k-delta { margin-top: 10px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 20px; }
.up   { color: var(--accent); background: rgba(90,255,140,0.1); }
.down { color: var(--danger); background: rgba(255,95,87,0.1); }

/* ── CARD ── */
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  overflow: hidden; transition: border-color 0.2s;
}
.card:hover { border-color: var(--border2); }
.card-h { padding: 18px 22px 0; display: flex; align-items: center; justify-content: space-between; }
.card-t { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.9px; color: var(--muted); }
.card-b { padding: 14px 22px 20px; }

/* ── GRID ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.gf { margin-bottom: 8px; }

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
.op-av { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
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
.cal-sn { font-family: 'Fraunces', serif; font-size: 22px; line-height: 1; }
.cal-sl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-top: 3px; }

/* ── MEDELSTAM CARDS ── */
.sc-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 5px; margin-top: 14px; }
.sc {
  background: var(--surface2); border-radius: 10px; padding: 11px 6px; text-align: center;
  border: 1px solid transparent; transition: all 0.15s; cursor: default;
}
.sc:hover { border-color: var(--border2); background: var(--surface); }
.sc.best { border-color: rgba(90,255,140,0.2); }
.sc-k { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 0.3px; margin-bottom: 7px; text-transform: uppercase; }
.sc-p { font-family: 'Fraunces', serif; font-size: 17px; line-height: 1; margin-bottom: 1px; }
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
.snum-v { font-family: 'Fraunces', serif; font-size: 18px; line-height: 1; }
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
.fkpi { background: var(--surface2); border-radius: 10px; padding: 14px 12px; text-align: center; }
.fkpi-v { font-family: 'Fraunces', serif; font-size: 24px; line-height: 1; color: var(--text); }
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
    <div>
      <div class="brand-name">Kompersmåla Skog</div>
    </div>
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

<div class="page" id="page">

  <!-- HERO -->
  <div class="hero">
    <div class="hero-main anim" style="animation-delay:0.05s">
      <div class="hero-label">Volym – februari 2026</div>
      <div class="hero-val" id="hv">0</div>
      <div class="hero-unit">m³fub</div>
      <div class="hero-delta">↑ 12% jämfört med januari</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Stammar</div>
      <div class="k-val" data-count="9240">0</div>
      <div class="k-unit">stammar</div>
      <div class="k-delta up">↑ 8%</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">G15-timmar</div>
      <div class="k-val" data-count="163">0</div>
      <div class="k-unit">timmar</div>
      <div class="k-delta down">↓ 3%</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Produktivitet</div>
      <div class="k-val" data-count="11.3" data-dec="1">0</div>
      <div class="k-unit">m³/G15h</div>
      <div class="k-delta up">↑ 5%</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Medelstam</div>
      <div class="k-val" data-count="0.26" data-dec="2">0</div>
      <div class="k-unit">m³/stam</div>
      <div class="k-delta up">↑ 0.02</div>
    </div>
  </div>

  <!-- ROW 1 -->
  <div class="g3">
    <div class="card anim" style="animation-delay:0.3s">
      <div class="card-h"><div class="card-t">Operatörer</div><span class="badge bg">3 aktiva</span></div>
      <div class="card-b">
        <div class="op-row op-clickable" onclick="openForare('stefan')" title="Visa förarvy">
          <div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">SK</div>
          <div class="op-info"><div class="op-name">Stefan Karlsson</div><div class="op-sub">68 timmar</div></div>
          <div class="op-stats">
            <div><div class="op-sv" style="color:var(--text)">820 m³</div><div class="op-sl">volym</div></div>
            <div><div class="op-sv">12.1</div><div class="op-sl">m³/G15h</div></div>
          </div>
        </div>
        <div class="op-row op-clickable" onclick="openForare('marcus')" title="Visa förarvy">
          <div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">MN</div>
          <div class="op-info"><div class="op-name">Marcus Nilsson</div><div class="op-sub">54 timmar</div></div>
          <div class="op-stats">
            <div><div class="op-sv" style="color:var(--text)">598 m³</div><div class="op-sl">volym</div></div>
            <div><div class="op-sv">11.1</div><div class="op-sl">m³/G15h</div></div>
          </div>
        </div>
        <div class="op-row op-clickable" onclick="openForare('par')" title="Visa förarvy">
          <div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">PL</div>
          <div class="op-info"><div class="op-name">Pär Lindgren</div><div class="op-sub">41 timmar</div></div>
          <div class="op-stats">
            <div><div class="op-sv" style="color:var(--text)">429 m³</div><div class="op-sl">volym</div></div>
            <div><div class="op-sv">10.5</div><div class="op-sl">m³/G15h</div></div>
          </div>
        </div>
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

    <div class="card anim" style="animation-delay:0.4s;cursor:pointer;" onclick="window.location.href='/kalibrering?maskin=PONS20SDJAA270231'" title="Gå till kalibreringssidan">
      <div class="card-h"><div class="card-t">Kalibrering (HQC)</div><span class="badge bg">OK</span></div>
      <div class="card-b">
        <div class="kal"><div class="kal-d">2026-02-28</div><div class="kal-v">Längd −0.4 cm · Dia +1.8 mm</div><span class="badge bg">OK</span></div>
        <div class="kal"><div class="kal-d">2026-02-14</div><div class="kal-v">Längd +0.2 cm · Dia −0.9 mm</div><span class="badge bg">OK</span></div>
        <div class="kal"><div class="kal-d">2026-01-31</div><div class="kal-v" style="color:var(--warn)">Längd +3.1 cm · Dia +5.2 mm</div><span class="badge bw">VARNING</span></div>
        <div class="kal"><div class="kal-d">2026-01-17</div><div class="kal-v">Längd −0.8 cm · Dia +2.1 mm</div><span class="badge bg">OK</span></div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för fullständig kalibreringshistorik →</div>
      </div>
    </div>
  </div>

  <!-- ROW 2 -->
  <div class="g3">
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
  <div class="gf">
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
  <div class="g2">
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
  <div class="gf">
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
  <div class="gf">
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
  <div style="margin-top:8px;">
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
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Stopp ≤ 15 min (kort_stopp_sek)</div>
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

    <!-- Avbrott per förare -->
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Avbrott per förare</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">
      <div class="frow" style="cursor:pointer;" onclick="toggleForareAvbrott(this,'Stefan Karlsson')">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">SK</div>
          <span class="frow-l">Stefan Karlsson</span>
        </div>
        <span class="frow-v">7h 20min <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span>
      </div>
      <div class="frow" style="cursor:pointer;" onclick="toggleForareAvbrott(this,'Marcus Nilsson')">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">MN</div>
          <span class="frow-l">Marcus Nilsson</span>
        </div>
        <span class="frow-v">6h 10min <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span>
      </div>
      <div class="frow" style="border-bottom:none;cursor:pointer;" onclick="toggleForareAvbrott(this,'Pär Lindgren')">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">PL</div>
          <span class="frow-l">Pär Lindgren</span>
        </div>
        <span class="frow-v">4h 30min <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span>
      </div>
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
  );
}
