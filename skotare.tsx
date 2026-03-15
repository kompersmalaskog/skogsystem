'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SKOTARE_SCRIPT = `
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

const s_classes = ['0–100','100–200','200–300','300–400','400–500','500–700','700+'];
const s_lassG15h = [3.2, 2.8, 2.3, 2.0, 1.7, 1.4, 1.0];
const s_medellast = [8.2, 7.8, 7.5, 7.2, 6.8, 6.5, 6.0];
const s_volym = [420, 580, 520, 380, 240, 130, 70];
const s_lass = [51, 74, 69, 53, 35, 20, 12];
const s_dieselPerM3 = [1.2, 1.4, 1.6, 1.9, 2.2, 2.6, 3.1];

const s_grid = {color:'rgba(255,255,255,0.05)'};
const s_ticks = {color:'#7a7a72',font:{size:11}};
const s_tooltip = {backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10};

function s_countUp(el, target, dec=0, duration=1200){
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
  s_countUp(document.getElementById('s_hv'), 2340, 0, 1400);
  document.querySelectorAll('.sk-val[data-count]').forEach(el=>{
    const v = parseFloat(el.dataset.count);
    const d = parseInt(el.dataset.dec||0);
    s_countUp(el, v, d, 1200);
  });
}, 300);

// Daily chart
const s_dailyLass = [0,0,18,22,0,0,24,26,20,0,0,16,0,23,25,0,0,21,19,24,0,0,22,20,18,0,0,15];
const s_dailyVol = [0,0,135,165,0,0,180,195,150,0,0,120,0,173,188,0,0,158,143,180,0,0,165,150,135,0,0,113];
const s_days = Array.from({length:28},(_,i)=>\`\${i+1}/2\`);

try{
new Chart(document.getElementById('s_dailyChart'),{
  type:'bar',
  data:{labels:s_days,datasets:[
    {label:'Lass/dag',data:s_dailyLass,backgroundColor:s_dailyLass.map(v=>v===0?'rgba(255,255,255,0.04)':'rgba(91,143,255,0.5)'),borderRadius:3,yAxisID:'y',order:1},
    {label:'Volym m³',data:s_dailyVol,type:'line',borderColor:'rgba(90,255,140,0.6)',backgroundColor:'rgba(90,255,140,0.05)',pointBackgroundColor:s_dailyVol.map(v=>v>0?'#5aff8c':'transparent'),pointRadius:s_dailyVol.map(v=>v>0?3:0),tension:0.3,yAxisID:'y2',order:0,spanGaps:false}
  ]},
  options:{
    responsive:true,
    interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},s_tooltip},
    scales:{x:{s_grid,s_ticks:{...s_ticks,font:{size:10}}},y:{s_grid,s_ticks,title:{display:true,text:'Lass',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...s_ticks,color:'#5aff8c'},title:{display:true,text:'m³',color:'#5aff8c',font:{size:10}}}},
    onClick:(e,els)=>{
      if(!els.length) return;
      const dag = els[0].index + 1;
      if(s_dagData[dag]) s_openDag(dag);
    },
    onHover:(e,els)=>{
      e.native.target.style.cursor = els.length && s_dagData[els[0].index+1] ? 'pointer' : 'default';
    }
  }
});

// Calendar
const s_cal = document.getElementById('s_calGrid');
for(let i=0;i<6;i++){const d=document.createElement('div');d.className='cal-cell';s_cal.appendChild(d);}
const s_dt=[0,0,1,1,0,0,1,1,1,0,0,2,0,1,1,0,0,1,1,3,0,0,2,1,1,0,0,1];
const s_dc={0:'c-off',1:'c-prod',2:'c-flytt',3:'c-service'};
const s_dlbl={0:'Ej aktiv',1:'Produktion',2:'Flytt',3:'Service'};
s_dt.forEach((t,i)=>{
  const el=document.createElement('div');
  el.className=\`cal-cell \${s_dc[t]}\`;
  el.title=\`\${i+1} feb · \${s_dlbl[t]}\${s_dailyVol[i]>0?' · '+s_dailyVol[i]+' m³':''}\`;
  if(t===1||t===2||t===3) el.onclick=()=>s_openDag(i+1);
  el.textContent=i+1;
  s_cal.appendChild(el);
});

// Sortiment
new Chart(document.getElementById('s_sortChart'),{
  type:'bar',
  data:{labels:['Gran','Tall','Björk'],datasets:[
    {label:'Sågtimmer',data:[740,200,76],backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,stack:'s'},
    {label:'Massaved', data:[252,194,72],backgroundColor:'rgba(255,179,64,0.4)',borderRadius:3,stack:'s'},
    {label:'Energived',data:[22,57,19], backgroundColor:'rgba(255,255,255,0.1)',borderRadius:3,stack:'s'}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{font:{family:'Geist',size:11},boxWidth:8,borderRadius:2,padding:12,color:'#7a7a72'}},s_tooltip},scales:{x:{stacked:true,grid:s_grid,ticks:s_ticks},y:{stacked:true,grid:s_grid,ticks:s_ticks}}}
});

// Medellast per avståndsklass
new Chart(document.getElementById('s_medellastChart'),{
  type:'bar',
  data:{labels:s_classes,datasets:[
    {label:'Medellast m³',data:s_medellast,backgroundColor:'rgba(91,143,255,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'Lass/G15h',data:s_lassG15h,type:'line',borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.04)',pointBackgroundColor:'#5aff8c',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},s_tooltip},scales:{x:{s_grid,s_ticks},y:{s_grid,s_ticks,title:{display:true,text:'m³/lass',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...s_ticks,color:'#5aff8c'},title:{display:true,text:'Lass/G15h',color:'#5aff8c',font:{size:10}}}}}
});

// Produktion per avståndsklass
new Chart(document.getElementById('s_totalChart'),{
  type:'bar',
  data:{labels:s_classes,datasets:[
    {label:'Volym m³',data:s_volym,backgroundColor:'rgba(91,143,255,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'Lass',data:s_lass,type:'line',borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.04)',pointBackgroundColor:'#5aff8c',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},s_tooltip},scales:{x:{s_grid,s_ticks},y:{s_grid,s_ticks,title:{display:true,text:'m³',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...s_ticks,color:'#5aff8c'},title:{display:true,text:'Lass',color:'#5aff8c',font:{size:10}}}}}
});

// Produktivitet per avståndsklass
new Chart(document.getElementById('s_prodChart'),{
  type:'bar',
  data:{labels:s_classes,datasets:[
    {label:'Lass/G15h',data:s_lassG15h,backgroundColor:'rgba(90,255,140,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'Medellast',data:s_medellast,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.04)',pointBackgroundColor:'#5b8fff',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...s_tooltip,callbacks:{label:c=>c.datasetIndex===0?\` \${c.parsed.y} lass/G15h\`:\` \${c.parsed.y} m³/lass\`}}},scales:{x:{s_grid,s_ticks},y:{s_grid,s_ticks,title:{display:true,text:'Lass/G15h',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...s_ticks,color:'#5b8fff'},title:{display:true,text:'m³/lass',color:'#5b8fff',font:{size:10}}}}}
});

// Diesel per avståndsklass
new Chart(document.getElementById('s_dieselChart'),{
  type:'bar',
  data:{labels:s_classes,datasets:[
    {label:'l/m³',data:s_dieselPerM3,backgroundColor:'rgba(90,255,140,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'Lass/G15h',data:s_lassG15h,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.04)',pointBackgroundColor:'#5b8fff',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...s_tooltip,callbacks:{label:c=>c.datasetIndex===0?\` \${c.parsed.y} l/m³\`:\` \${c.parsed.y} lass/G15h\`}}},scales:{x:{s_grid,s_ticks},y:{s_grid,s_ticks,title:{display:true,text:'liter / m³',color:'#7a7a72',font:{size:10}},suggestedMin:0.5,suggestedMax:4},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...s_ticks,color:'#5b8fff'},title:{display:true,text:'Lass/G15h',color:'#5b8fff',font:{size:10}}}}}
});
// m³fub/G15h per medelköravstånd (from Supabase)
const s_m3fubData = window.__s_m3fubData;
if (s_m3fubData && document.getElementById('s_m3fubG15hChart')) {
  new Chart(document.getElementById('s_m3fubG15hChart'),{
    type:'bar',
    data:{labels:s_m3fubData.labels,datasets:[
      {label:'m³fub/G15h',data:s_m3fubData.values,backgroundColor:'rgba(90,255,140,0.5)',borderRadius:4}
    ]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{...s_tooltip,callbacks:{label:c=>\` \${c.parsed.y.toFixed(1)} m³fub/G15h\`}}},scales:{x:{s_grid,s_ticks},y:{s_grid,s_ticks,title:{display:true,text:'m³fub/G15h',color:'#7a7a72',font:{size:10}},beginAtZero:true}}}
  });
  // Update the value labels below the chart
  s_m3fubData.values.forEach((v,i) => {
    const el = document.getElementById('s_m3fub_v'+i);
    if(el) el.textContent = v.toFixed(1);
  });
  const totalEl = document.getElementById('s_m3fub_total');
  if(totalEl && s_m3fubData.total !== undefined) totalEl.textContent = s_m3fubData.total.toFixed(1);
}
}catch(e){console.error('[SKOTARE] Chart init error:',e);}
// Tabs
document.querySelectorAll('.s-tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.s-tab').forEach(x=>x.classList.remove('on'));
  t.classList.add('on');
}));

// Machine menu
function s_toggleMMenu(){ document.getElementById('s_mMenu').classList.toggle('open'); }
function s_pickM(el,name,sub,color){
  document.getElementById('s_mName').textContent=name;
  document.getElementById('s_mDot').style.cssText=\`width:7px;height:7px;border-radius:50%;flex-shrink:0;background:\${color}\`;
  document.querySelectorAll('.s-mach-opt').forEach(o=>o.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('s_mMenu').classList.remove('open');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.s-mach-wrap')) document.getElementById('s_mMenu').classList.remove('open');
});

// Overlay
function s_openOverlay()  { document.getElementById('s_forarOverlay').classList.add('open'); }
function s_closeOverlay() { document.getElementById('s_forarOverlay').classList.remove('open'); }

// Attach overlay click directly (DOMContentLoaded may have already fired)
(function(){
  const ov = document.getElementById('s_forarOverlay');
  if(ov) ov.addEventListener('click', () => { s_closeAllPanels(); });
})();

function s_closeAllPanels() {
  s_closeOverlay();
  document.getElementById('s_forarPanel').classList.remove('open');
  document.getElementById('s_bolagPanel').classList.remove('open');
  document.getElementById('s_avstandPanel').classList.remove('open');
  document.getElementById('s_tidPanel').classList.remove('open');
  document.getElementById('s_dagPanel').classList.remove('open');
  document.getElementById('s_objTypPanel').classList.remove('open');
  document.getElementById('s_objJmfPanel').classList.remove('open');
}

// Förare
const s_forare = {
  stefan: { av:'SK', name:'Stefan Karlsson', timmar:62, lass:124, volym:930, medellast:7.5, lassG15h:2.0, medelavst:280, dagar:14, objekt:'Ålshult AU 2025', gran:62, tall:26, bjork:12,
    klasser:[{k:'0–100',lass:3.4,last:8.4,vol:180},{k:'100–200',lass:2.9,last:7.8,vol:220},{k:'200–300',lass:2.4,last:7.5,vol:210},{k:'300–400',lass:2.0,last:7.1,vol:160},{k:'400–500',lass:1.8,last:6.8,vol:90},{k:'500–700',lass:1.5,last:6.5,vol:50},{k:'700+',lass:1.1,last:6.0,vol:20}]},
  marcus: { av:'MN', name:'Marcus Nilsson', timmar:48, lass:108, volym:810, medellast:7.5, lassG15h:2.25, medelavst:290, dagar:12, objekt:'Björsamåla AU 2025', gran:58, tall:30, bjork:12,
    klasser:[{k:'0–100',lass:3.0,last:8.0,vol:140},{k:'100–200',lass:2.6,last:7.6,vol:200},{k:'200–300',lass:2.2,last:7.3,vol:180},{k:'300–400',lass:1.9,last:7.0,vol:140},{k:'400–500',lass:1.6,last:6.7,vol:80},{k:'500–700',lass:1.3,last:6.3,vol:45},{k:'700+',lass:0.9,last:5.8,vol:25}]},
  par: { av:'PL', name:'Pär Lindgren', timmar:38, lass:80, volym:600, medellast:7.5, lassG15h:2.1, medelavst:275, dagar:10, objekt:'Karamåla 19 A-S', gran:55, tall:28, bjork:17,
    klasser:[{k:'0–100',lass:2.8,last:7.8,vol:100},{k:'100–200',lass:2.5,last:7.4,vol:160},{k:'200–300',lass:2.1,last:7.2,vol:130},{k:'300–400',lass:1.8,last:6.9,vol:80},{k:'400–500',lass:1.5,last:6.6,vol:70},{k:'500–700',lass:1.2,last:6.2,vol:35},{k:'700+',lass:0.8,last:5.5,vol:25}]}
};

let s_fpChart = null;

function s_openForare(id) {
  const f = s_forare[id];
  document.getElementById('s_fpAv').textContent  = f.av;
  document.getElementById('s_fpName').textContent = f.name;
  document.getElementById('s_fpSub').textContent  = 'Ponsse Elephant King AF · februari 2026';
  document.getElementById('s_fpBody').innerHTML = \`
    <div class="forar-kpis">
      <div class="fkpi"><div class="fkpi-v">\${f.lass}</div><div class="fkpi-l">Lass</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.volym}</div><div class="fkpi-l">m³ skotad</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.medellast}</div><div class="fkpi-l">Medellast</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.lassG15h}</div><div class="fkpi-l">Lass/G15h</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.medelavst}m</div><div class="fkpi-l">Medelavstånd</div></div>
      <div class="fkpi"><div class="fkpi-v">\${f.dagar}</div><div class="fkpi-l">Aktiva dagar</div></div>
    </div>
    <div class="fsec"><div class="fsec-title">Lass/G15h per avståndsklass</div><canvas id="s_fpChart" style="max-height:180px;margin-bottom:12px;"></canvas></div>
    <div class="fsec">
      <div class="fsec-title">Trädslag</div>
      <div class="frow"><span class="frow-l">Gran</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:\${f.gran}%;background:rgba(90,255,140,0.5)"></div></div></div><span class="frow-v">\${f.gran}%</span></div>
      <div class="frow"><span class="frow-l">Tall</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:\${f.tall}%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">\${f.tall}%</span></div>
      <div class="frow"><span class="frow-l">Björk</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:\${f.bjork}%;background:rgba(91,143,255,0.4)"></div></div></div><span class="frow-v">\${f.bjork}%</span></div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Övrigt</div>
      <div class="frow"><span class="frow-l">G15-timmar</span><span class="frow-v">\${f.timmar}h</span></div>
      <div class="frow"><span class="frow-l">Aktivt objekt</span><span class="frow-v">\${f.objekt}</span></div>
    </div>\`;
  setTimeout(() => {
    if (s_fpChart) s_fpChart.destroy();
    const ctx = document.getElementById('s_fpChart');
    if (!ctx) return;
    s_fpChart = new Chart(ctx, {
      type:'bar',
      data:{labels:f.klasser.map(k=>k.k),datasets:[
        {label:'Lass/G15h',data:f.klasser.map(k=>k.lass),backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,yAxisID:'y',order:1},
        {label:'Medellast',data:f.klasser.map(k=>k.last),type:'line',borderColor:'rgba(91,143,255,0.6)',pointBackgroundColor:'#5b8fff',pointRadius:3,tension:0.3,yAxisID:'y2',order:0}
      ]},
      options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},s_tooltip},scales:{x:{s_grid,s_ticks:{...s_ticks,font:{size:10}}},y:{s_grid,s_ticks,title:{display:true,text:'Lass/G15h',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...s_ticks,color:'#5b8fff'},title:{display:true,text:'m³/lass',color:'#5b8fff',font:{size:10}}}}}
    });
  }, 50);
  s_openOverlay();
  document.getElementById('s_forarPanel').classList.add('open');
}
function s_closeForare() { s_closeAllPanels(); }

// Bolag
const s_bolag = {
  vida: { logo:'VIDA', name:'Vida Skog AB', volym:1260, pct:54,
    inkopare:[
      {namn:'Jan-Erik Svensson',initialer:'JS',volym:760,objekt:[{namn:'Ålshult AU 2025',nr:'VO 11080064',typ:'Slutavverkning',volym:760,filer:8,gran:68,tall:28,bjork:4}]},
      {namn:'Martin Lindqvist', initialer:'ML',volym:500,objekt:[{namn:'Björsamåla AU 2025',nr:'VO 11081163',typ:'Slutavverkning',volym:500,filer:11,gran:72,tall:22,bjork:6}]}
    ]},
  sod: { logo:'SÖD', name:'Södra Skogsägarna', volym:560, pct:24,
    inkopare:[{namn:'Anders Bergström',initialer:'AB',volym:560,objekt:[{namn:'Svinhult Au 2025',nr:'VO 11088xxx',typ:'Slutavverkning',volym:560,filer:6,gran:55,tall:32,bjork:13}]}]},
  ata: { logo:'ATA', name:'ATA Timber', volym:520, pct:22,
    inkopare:[{namn:'Kristoffer Holm',initialer:'KH',volym:520,objekt:[{namn:'Karamåla 19 A-S',nr:'VO 11106406',typ:'Gallring',volym:520,filer:5,gran:48,tall:38,bjork:14}]}]}
};

function s_openBolag(id) {
  const b = s_bolag[id];
  document.getElementById('s_bpLogo').textContent = b.logo;
  document.getElementById('s_bpName').textContent = b.name;
  document.getElementById('s_bpSub').textContent  = b.volym.toLocaleString('sv') + ' m³ · ' + b.pct + '% av total volym';
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
  document.getElementById('s_bpBody').innerHTML = \`
    <div class="forar-kpis" style="margin-bottom:16px;">
      <div class="fkpi"><div class="fkpi-v">\${b.volym.toLocaleString('sv')}</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">\${slutVol.toLocaleString('sv')}</div><div class="fkpi-l">Slutavverkning</div></div>
      <div class="fkpi"><div class="fkpi-v">\${gallVol>0?gallVol.toLocaleString('sv'):'–'}</div><div class="fkpi-l">Gallring</div></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Sammanställning per inköpare</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 14px;margin-bottom:16px;">\${summaryRows}</div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Inköpare & objekt</div>
    \${inkopareRows}\`;
  s_openOverlay();
  document.getElementById('s_bolagPanel').classList.add('open');
}
function s_closeBolag() { s_closeAllPanels(); }

// Avstånd panel
function s_openAvstand() { s_openOverlay(); document.getElementById('s_avstandPanel').classList.add('open'); }
function s_closeAvstand() { s_closeAllPanels(); }

// Tid panel
function s_openTid() { s_openOverlay(); document.getElementById('s_tidPanel').classList.add('open'); }
function s_closeTid() { s_closeAllPanels(); }

// Compare
function s_toggleCmp(){
  const on = document.getElementById('s_cmpBtn').classList.toggle('on');
  document.getElementById('s_cmpBar').classList.toggle('show', on);
  if(!on){ const v=document.getElementById('s_cmpView'); if(v) v.remove(); }
}

function s_runCmp(){
  const ex=document.getElementById('s_cmpView'); if(ex) ex.remove();
  const ms=[
    {lbl:'Skotad volym',a:2340,b:2100,unit:'m³'},
    {lbl:'Antal lass',a:312,b:280,unit:'st'},
    {lbl:'G15-timmar',a:148,b:142,unit:'h'},
    {lbl:'Lass/G15h',a:2.1,b:2.0,unit:'lass/h'},
    {lbl:'Medelavstånd',a:285,b:295,unit:'m'},
  ];
  const div=document.createElement('div');
  div.id='s_cmpView'; div.style.marginBottom='8px';
  div.innerHTML=\`
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.9px;color:var(--muted);">Jämförelse</div>
      <button onclick="document.getElementById('s_cmpView').remove()" style="border:none;background:var(--surface2);border-radius:6px;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;color:var(--muted);">✕</button>
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
  document.getElementById('s_page').insertBefore(div, document.getElementById('s_page').firstChild);
}

// Dag data
const s_dagData = {
  3:  { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:45', slut:'16:20', lass:18, volym:135, g15:8.2, lastSnitt:7.5, avstand:280, avbrott:[{orsak:'Tankning',tid:'22 min'}], diesel:1.5 },
  4:  { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:00', slut:'17:10', lass:22, volym:165, g15:9.1, lastSnitt:7.5, avstand:290, avbrott:[{orsak:'Väntan - lastbil',tid:'45 min'}], diesel:1.6 },
  7:  { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:50', slut:'16:45', lass:24, volym:180, g15:9.8, lastSnitt:7.5, avstand:275, avbrott:[{orsak:'Tankning',tid:'18 min'}], diesel:1.4 },
  8:  { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S', start:'07:15', slut:'17:30', lass:26, volym:195, g15:10.2, lastSnitt:7.5, avstand:265, avbrott:[], diesel:1.3 },
  9:  { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:45', slut:'16:15', lass:20, volym:150, g15:8.9, lastSnitt:7.5, avstand:290, avbrott:[{orsak:'Service',tid:'55 min'}], diesel:1.7 },
  12: { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:00', slut:'16:50', lass:16, volym:120, g15:8.4, lastSnitt:7.5, avstand:310, avbrott:[{orsak:'Maskinfel – vägkompressor',tid:'1h'}], diesel:1.9 },
  14: { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S', start:'07:20', slut:'17:40', lass:23, volym:173, g15:9.3, lastSnitt:7.5, avstand:270, avbrott:[], diesel:1.4 },
  15: { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:50', slut:'17:00', lass:25, volym:188, g15:10.0, lastSnitt:7.5, avstand:280, avbrott:[{orsak:'Tankning',tid:'22 min'}], diesel:1.4 },
  18: { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:05', slut:'16:55', lass:21, volym:158, g15:8.8, lastSnitt:7.5, avstand:295, avbrott:[{orsak:'Väntan – körbesked',tid:'40 min'}], diesel:1.6 },
  19: { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S', start:'07:10', slut:'16:40', lass:19, volym:143, g15:7.9, lastSnitt:7.5, avstand:260, avbrott:[{orsak:'Maskinfel – grip',tid:'1h 12 min'}], diesel:1.8 },
  20: { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:45', slut:'17:10', lass:24, volym:180, g15:9.9, lastSnitt:7.5, avstand:280, avbrott:[{orsak:'Tankning',tid:'20 min'}], diesel:1.4 },
  23: { typ:2, forare:'–', objekt:'Ålshult → Björsamåla', start:'07:00', slut:'14:30', lass:0, volym:0, g15:0, lastSnitt:0, avstand:0, avbrott:[], diesel:0, flytt:true },
  24: { typ:1, forare:'Marcus Nilsson',  objekt:'Björsamåla AU 2025', start:'07:00', slut:'16:50', lass:20, volym:150, g15:8.5, lastSnitt:7.5, avstand:300, avbrott:[], diesel:1.5 },
  25: { typ:1, forare:'Pär Lindgren',    objekt:'Karamåla 19 A-S', start:'07:15', slut:'16:30', lass:18, volym:135, g15:7.8, lastSnitt:7.5, avstand:265, avbrott:[{orsak:'Tankning',tid:'18 min'}], diesel:1.5 },
  28: { typ:1, forare:'Stefan Karlsson', objekt:'Ålshult AU 2025', start:'06:50', slut:'16:20', lass:15, volym:113, g15:7.2, lastSnitt:7.5, avstand:290, avbrott:[{orsak:'Service – filter',tid:'45 min'}], diesel:1.8 },
};

const s_typIcon = { 1:'🏗️', 2:'🚛', 3:'🔧' };
const s_typNamn = { 1:'Produktion', 2:'Flytt', 3:'Service' };

function s_openDag(dag) {
  const d = s_dagData[dag];
  if (!d) return;
  document.getElementById('s_dagIcon').textContent  = s_typIcon[d.typ] || '📅';
  document.getElementById('s_dagTitle').textContent = dag + ' februari 2026';
  document.getElementById('s_dagSub').textContent   = s_typNamn[d.typ];
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
      ? d.avbrott.map(a => \`<div class="frow"><span class="frow-l">\${a.orsak}</span><span class="frow-v">\${a.tid}</span></div>\`).join('')
      : '<div class="frow" style="border:none"><span class="frow-l" style="color:var(--muted)">Inga avbrott registrerade</span></div>';
    html = \`
      <div class="forar-kpis" style="margin-bottom:16px;">
        <div class="fkpi"><div class="fkpi-v">\${d.lass}</div><div class="fkpi-l">Lass</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.volym}</div><div class="fkpi-l">m³ skotad</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.g15}h</div><div class="fkpi-l">G15-timmar</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.lastSnitt}</div><div class="fkpi-l">Medellast</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.avstand}m</div><div class="fkpi-l">Medelavstånd</div></div>
        <div class="fkpi"><div class="fkpi-v">\${d.diesel}</div><div class="fkpi-l">Diesel l/m³</div></div>
      </div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Skiftinfo</div>
      <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:16px;">
        <div class="frow"><span class="frow-l">Förare</span><span class="frow-v">\${d.forare}</span></div>
        <div class="frow"><span class="frow-l">Objekt</span><span class="frow-v">\${d.objekt}</span></div>
        <div class="frow"><span class="frow-l">Start</span><span class="frow-v">\${d.start}</span></div>
        <div class="frow" style="border:none"><span class="frow-l">Slut</span><span class="frow-v">\${d.slut}</span></div>
      </div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Avbrott</div>
      <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">\${avbrott}</div>\`;
  }
  document.getElementById('s_dagBody').innerHTML = html;
  s_openOverlay();
  document.getElementById('s_dagPanel').classList.add('open');
}
function s_closeDag() { s_closeAllPanels(); }

// ── AVBROTT PER FÖRARE EXPAND ──
function s_parseAvbrottMinuter(tid) {
  var min = 0;
  var hm = tid.match(/(\\d+)\\s*h/);
  var mm = tid.match(/(\\d+)\\s*min/);
  if (hm) min += parseInt(hm[1]) * 60;
  if (mm) min += parseInt(mm[1]);
  return min;
}
function s_fmtAvbrottTid(min) {
  if (min >= 60) return Math.floor(min/60) + 'h ' + (min%60 > 0 ? (min%60) + 'min' : '');
  return min + ' min';
}
function s_getForareAvbrott(forareNamn) {
  var orsaker = {};
  Object.values(s_dagData).forEach(function(d) {
    if (d.forare !== forareNamn || !d.avbrott) return;
    d.avbrott.forEach(function(a) {
      if (!orsaker[a.orsak]) orsaker[a.orsak] = { tid: 0, antal: 0 };
      orsaker[a.orsak].tid += s_parseAvbrottMinuter(a.tid);
      orsaker[a.orsak].antal += 1;
    });
  });
  return Object.entries(orsaker).sort(function(a,b) { return b[1].tid - a[1].tid; });
}
function s_toggleForareAvbrott(el, forareNamn) {
  var existing = el.parentElement.querySelector('.forare-avbrott-detail');
  if (existing) { existing.remove(); return; }
  document.querySelectorAll('.forare-avbrott-detail').forEach(function(e) { e.remove(); });
  var data = s_getForareAvbrott(forareNamn);
  if (data.length === 0) return;
  var totMin = data.reduce(function(s, item) { return s + item[1].tid; }, 0);
  var rows = data.map(function(item, i) {
    var orsak = item[0]; var v = item[1];
    var pct = totMin > 0 ? Math.round((v.tid / totMin) * 100) : 0;
    var bb = i < data.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:' + bb + ';font-size:11px;">' +
      '<span style="color:var(--muted);">' + orsak + ' <span style="font-size:9px;">(' + v.antal + 'x · ' + pct + '%)</span></span>' +
      '<span style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--warn);">' + s_fmtAvbrottTid(v.tid) + '</span></div>';
  }).join('');
  var div = document.createElement('div');
  div.className = 'forare-avbrott-detail';
  div.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:8px;padding:4px 14px;margin:4px 0 8px;';
  div.innerHTML = rows;
  el.after(div);
}

// ObjTyp
const s_objTypData = {
  rp: { label:'RP', title:'Röjningsprioriterat', volym:1080, lass:144, g15:71, lassG15h:2.0, medelavst:280, medellast:7.5,
    objekt:[{namn:'Ålshult AU 2025',volym:620,lass:83,lassG15h:2.1},{namn:'Svinhult Au 2025',volym:460,lass:61,lassG15h:1.9}]},
  au: { label:'AU', title:'Avverkning utan krav', volym:920, lass:123, g15:55, lassG15h:2.2, medelavst:290, medellast:7.5,
    objekt:[{namn:'Björsamåla AU 2025',volym:510,lass:68,lassG15h:2.3},{namn:'Karamåla 19 A-S',volym:410,lass:55,lassG15h:2.1}]},
  lrk: { label:'LRK', title:'Lågriskklass', volym:340, lass:45, g15:22, lassG15h:2.0, medelavst:310, medellast:7.6,
    objekt:[{namn:'Karamåla 19 A-S',volym:340,lass:45,lassG15h:2.0}]}
};

function s_openObjTyp(id) {
  const d = s_objTypData[id];
  document.getElementById('s_otpLabel').textContent = d.label;
  document.getElementById('s_otpTitle').textContent = d.title;
  const objRows = d.objekt.map(o => \`
    <div class="frow">
      <span class="frow-l">\${o.namn}</span>
      <div style="display:flex;gap:14px;align-items:center;">
        <span style="font-size:10px;color:var(--muted);">Lass/G15h <strong style="color:var(--text)">\${o.lassG15h}</strong></span>
        <span style="font-size:10px;color:var(--muted);">Lass <strong style="color:var(--text)">\${o.lass}</strong></span>
        <span class="frow-v">\${o.volym.toLocaleString('sv')} m³</span>
      </div>
    </div>\`).join('');
  document.getElementById('s_otpBody').innerHTML = \`
    <div class="forar-kpis" style="margin-bottom:16px;">
      <div class="fkpi"><div class="fkpi-v">\${d.volym.toLocaleString('sv')}</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.lass}</div><div class="fkpi-l">Lass</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.g15}h</div><div class="fkpi-l">G15-timmar</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.lassG15h}</div><div class="fkpi-l">Lass/G15h</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.medelavst}m</div><div class="fkpi-l">Medelavstånd</div></div>
      <div class="fkpi"><div class="fkpi-v">\${d.medellast}</div><div class="fkpi-l">Medellast</div></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Per objekt</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">\${objRows}</div>\`;
  s_openOverlay();
  document.getElementById('s_objTypPanel').classList.add('open');
}
function s_closeObjTyp() { s_closeAllPanels(); }

function s_openObjJmf() {
  const d = s_objTypData;
  const rows = [
    {lbl:'Volym m³',      rp:d.rp.volym.toLocaleString('sv'),    au:d.au.volym.toLocaleString('sv'),    lrk:d.lrk.volym.toLocaleString('sv'),    best:'rp'},
    {lbl:'Lass',          rp:d.rp.lass,                           au:d.au.lass,                           lrk:d.lrk.lass,                           best:'rp'},
    {lbl:'G15-timmar',    rp:d.rp.g15+'h',                       au:d.au.g15+'h',                       lrk:d.lrk.g15+'h',                       best:'rp'},
    {lbl:'Lass/G15h',     rp:d.rp.lassG15h,                      au:d.au.lassG15h,                      lrk:d.lrk.lassG15h,                      best:'au'},
    {lbl:'Medelavstånd',  rp:d.rp.medelavst+'m',                 au:d.au.medelavst+'m',                 lrk:d.lrk.medelavst+'m',                 best:'rp'},
    {lbl:'Medellast',     rp:d.rp.medellast,                     au:d.au.medellast,                     lrk:d.lrk.medellast,                     best:'lrk'},
  ];
  document.getElementById('s_jmfTableBody').innerHTML = rows.map((r,i) => \`
    <tr style="border-top:1px solid var(--border)\${i===rows.length-1?';border-bottom:none':''}">
      <td style="padding:11px 16px;color:var(--muted);font-size:11px;">\${r.lbl}</td>
      <td style="text-align:right;padding:11px 10px;font-weight:\${r.best==='rp'?'700':'400'};color:\${r.best==='rp'?'rgba(90,255,140,0.9)':'var(--text)'};">\${r.rp}\${r.best==='rp'?' ↑':''}</td>
      <td style="text-align:right;padding:11px 10px;font-weight:\${r.best==='au'?'700':'400'};color:\${r.best==='au'?'rgba(90,255,140,0.9)':'var(--text)'};">\${r.au}\${r.best==='au'?' ↑':''}</td>
      <td style="text-align:right;padding:11px 16px 11px 10px;font-weight:\${r.best==='lrk'?'700':'400'};color:\${r.best==='lrk'?'rgba(90,255,140,0.9)':'var(--text)'};">\${r.lrk}\${r.best==='lrk'?' ↑':''}</td>
    </tr>\`).join('');
  document.getElementById('s_jmfBest').innerHTML = \`
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Bäst produktivitet</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">AU</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">2.2 lass/G15h</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Mest volym</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">RP</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">1 080 m³ · 46%</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Kortast avstånd</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">RP</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">280 m snitt</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Högst medellast</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">LRK</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">7.6 m³/lass</div>
    </div>\`;
  s_openOverlay();
  document.getElementById('s_objJmfPanel').classList.add('open');
}
function s_closeObjJmf() { s_closeAllPanels(); }
`;

async function fetchM3fubG15h() {
  const classEdges = [0, 100, 200, 300, 400, Infinity];
  const classLabels = ['0–100', '100–200', '200–300', '300–400', '400+'];

  const [tidRes, prodRes] = await Promise.all([
    supabase.from('fakt_tid').select('objekt_id, terrain_korstracka_m, processing_sek, terrain_sek, other_work_sek'),
    supabase.from('fakt_produktion').select('objekt_id, volym_m3sub'),
  ]);

  if (!tidRes.data || !prodRes.data) return null;

  // Aggregate fakt_tid per objekt_id: avg terrain distance, total G15
  const tidByObj: Record<string, { distSum: number; distCount: number; g15Sek: number }> = {};
  for (const r of tidRes.data) {
    if (!r.objekt_id || r.terrain_korstracka_m == null) continue;
    if (!tidByObj[r.objekt_id]) tidByObj[r.objekt_id] = { distSum: 0, distCount: 0, g15Sek: 0 };
    tidByObj[r.objekt_id].distSum += r.terrain_korstracka_m;
    tidByObj[r.objekt_id].distCount += 1;
    tidByObj[r.objekt_id].g15Sek += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
  }

  // Aggregate fakt_produktion per objekt_id: total volym_m3sub
  const prodByObj: Record<string, number> = {};
  for (const r of prodRes.data) {
    if (!r.objekt_id) continue;
    prodByObj[r.objekt_id] = (prodByObj[r.objekt_id] || 0) + (r.volym_m3sub || 0);
  }

  // Group into distance classes
  const classVolym = new Array(5).fill(0);
  const classG15h = new Array(5).fill(0);

  for (const [objId, tid] of Object.entries(tidByObj)) {
    const vol = prodByObj[objId];
    if (!vol || tid.distCount === 0 || tid.g15Sek === 0) continue;
    const avgDist = tid.distSum / tid.distCount;
    let ci = classEdges.length - 2;
    for (let i = 0; i < classEdges.length - 1; i++) {
      if (avgDist < classEdges[i + 1]) { ci = i; break; }
    }
    classVolym[ci] += vol;
    classG15h[ci] += tid.g15Sek / 3600;
  }

  const values = classVolym.map((v, i) => classG15h[i] > 0 ? v / classG15h[i] : 0);
  const totalVol = classVolym.reduce((a, b) => a + b, 0);
  const totalG15 = classG15h.reduce((a, b) => a + b, 0);
  const total = totalG15 > 0 ? totalVol / totalG15 : 0;

  return { labels: classLabels, values, total };
}

export default function SkotareVy() {
  useEffect(() => {
    let scriptEl: HTMLScriptElement | null = null;
    let cancelled = false;

    async function init() {
      // Fetch real data before injecting script
      const m3fubData = await fetchM3fubG15h();
      if (cancelled) return;
      if (m3fubData) {
        (window as any).__s_m3fubData = m3fubData;
      }

      function initCharts() {
        scriptEl = document.createElement('script');
        scriptEl.textContent = SKOTARE_SCRIPT;
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
    }

    init();

    return () => {
      cancelled = true;
      delete (window as any).__s_m3fubData;
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

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', zIndex: 1 }}>
      <style dangerouslySetInnerHTML={{ __html: `:root {
  --bg:#111110;--surface:#1a1a18;--surface2:#222220;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);
  --text:#e8e8e4;--muted:#7a7a72;--dim:#3a3a36;--accent:#5aff8c;--accent2:#1a4a2e;--warn:#ffb340;--danger:#ff5f57;--blue:#5b8fff;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--bg);color:var(--text);font-family:'Geist',system-ui,sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh;}
.hdr{position:sticky;top:0;z-index:100;background:rgba(17,17,16,0.88);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;}
.brand{display:flex;align-items:center;gap:12px;}
.brand-mark{width:30px;height:30px;border-radius:7px;background:var(--accent2);border:1px solid rgba(90,255,140,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;}
.brand-name{font-family:'Fraunces',Georgia,serif;font-size:15px;font-weight:500;letter-spacing:-0.3px;color:var(--text);}
.hdr-mid{display:flex;gap:2px;background:rgba(255,255,255,0.05);border-radius:8px;padding:3px;}
.s-tab{padding:4px 14px;border:none;background:transparent;border-radius:6px;font-family:'Geist',sans-serif;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;transition:all 0.15s;}
.s-tab.on{background:var(--surface2);color:var(--text);}
.hdr-r{display:flex;align-items:center;gap:8px;}
.cmp-btn{padding:5px 12px;border:1px solid var(--border2);border-radius:7px;background:transparent;font-family:'Geist',sans-serif;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;transition:all 0.15s;}
.cmp-btn:hover{color:var(--text);border-color:var(--muted);}
.cmp-btn.on{background:var(--accent2);color:var(--accent);border-color:rgba(90,255,140,0.3);}
.s-mach-wrap{position:relative;}
.mach-btn{display:flex;align-items:center;gap:8px;padding:5px 12px;background:var(--surface);border:1px solid var(--border2);border-radius:7px;font-family:'Geist',sans-serif;font-size:12px;font-weight:500;color:var(--text);cursor:pointer;transition:border-color 0.15s;}
.mach-btn:hover{border-color:var(--muted);}
.m-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.mach-menu{display:none;position:absolute;top:calc(100%+6px);right:0;background:var(--surface);border:1px solid var(--border2);border-radius:12px;min-width:260px;padding:5px;z-index:300;box-shadow:0 20px 60px rgba(0,0,0,0.6);}
.mach-menu.open{display:block;animation:pop 0.15s ease;}
@keyframes pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.s-mach-opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background 0.1s;}
.s-mach-opt:hover{background:var(--surface2);}
.s-mach-opt.sel{background:var(--accent2);}
.mach-opt-name{font-size:13px;font-weight:500;}
.mach-opt-sub{font-size:11px;color:var(--muted);margin-top:1px;}
.cmp-bar{display:none;background:var(--surface);border-bottom:1px solid var(--border);padding:12px 36px;gap:12px;align-items:center;}
.cmp-bar.show{display:flex;}
.cmp-period{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--surface2);border-radius:7px;border:1px solid var(--border);flex:1;max-width:300px;}
.cmp-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap;}
.cmp-lbl.a{color:var(--accent);}.cmp-lbl.b{color:var(--warn);}
.cmp-period input[type=date]{border:none;background:transparent;font-family:'Geist',sans-serif;font-size:12px;color:var(--text);outline:none;cursor:pointer;color-scheme:dark;}
.cmp-sep{color:var(--dim);}.cmp-vs{font-size:11px;font-weight:700;color:var(--dim);}
.cmp-go{padding:7px 18px;background:var(--accent);color:#0a1a10;border:none;border-radius:7px;font-family:'Geist',sans-serif;font-size:12px;font-weight:600;cursor:pointer;margin-left:auto;transition:opacity 0.15s;}
.cmp-go:hover{opacity:0.85;}
.page{max-width:1320px;margin:0 auto;padding:28px 36px 60px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.anim{opacity:0;animation:fadeUp 0.5s forwards;}
.hero{display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:16px;}
.hero-main{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 32px;position:relative;overflow:hidden;animation-delay:0.05s;}
.hero-main::after{content:'';position:absolute;bottom:-60px;right:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(91,143,255,0.08) 0%,transparent 70%);}
.hero-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:12px;}
.hero-val{font-family:'Fraunces',serif;font-size:64px;line-height:1;font-weight:700;letter-spacing:-3px;color:var(--blue);margin-bottom:4px;}
.hero-unit{font-size:14px;color:var(--muted);font-weight:400;}
.hero-delta{margin-top:18px;font-size:12px;color:var(--blue);opacity:0.8;display:flex;align-items:center;gap:4px;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 18px;position:relative;overflow:hidden;transition:border-color 0.2s,transform 0.2s;}
.kpi:hover{border-color:var(--border2);transform:translateY(-1px);}
.kpi:nth-child(2){animation-delay:0.1s}.kpi:nth-child(3){animation-delay:0.15s}.kpi:nth-child(4){animation-delay:0.2s}.kpi:nth-child(5){animation-delay:0.25s}
.k-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;}
.sk-val{font-family:'Fraunces',serif;font-size:32px;line-height:1;letter-spacing:-1px;color:var(--text);margin-bottom:4px;}
.k-unit{font-size:11px;color:var(--muted);}
.k-delta{margin-top:10px;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;}
.up{color:var(--accent);background:rgba(90,255,140,0.1);}.down{color:var(--danger);background:rgba(255,95,87,0.1);}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:border-color 0.2s;}
.card:hover{border-color:var(--border2);}
.card-h{padding:18px 22px 0;display:flex;align-items:center;justify-content:space-between;}
.card-t{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.9px;color:var(--muted);}
.card-b{padding:14px 22px 20px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;}
.gf{margin-bottom:8px;}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.3px;}
.bg{background:rgba(90,255,140,0.1);color:var(--accent);}.bw{background:rgba(255,179,64,0.1);color:var(--warn);}
.bs{background:rgba(255,179,64,0.12);color:var(--warn);}.bgall{background:rgba(90,255,140,0.1);color:var(--accent);}
.bd{background:rgba(255,95,87,0.1);color:var(--danger);}.bm{background:rgba(255,255,255,0.06);color:var(--muted);}
.op-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);}
.op-row:last-child{border-bottom:none;padding-bottom:0;}.op-row:first-child{padding-top:0;}
.op-av{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;}
.op-name{font-size:13px;font-weight:500;}.op-sub{font-size:11px;color:var(--muted);}.op-info{flex:1;}
.op-stats{display:flex;gap:16px;}.op-sv{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;}.op-sl{font-size:10px;color:var(--muted);}
.prog{height:3px;background:var(--dim);border-radius:2px;overflow:hidden;margin-top:5px;}
.pf{height:100%;border-radius:2px;transition:width 1s cubic-bezier(0.4,0,0.2,1);}
.kal{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface2);border-radius:8px;margin-bottom:6px;}
.kal:last-child{margin-bottom:0;}.kal-d{font-size:11px;color:var(--muted);width:76px;flex-shrink:0;font-variant-numeric:tabular-nums;}.kal-v{flex:1;font-size:12px;font-weight:500;}
.ts{padding:9px 0;border-bottom:1px solid var(--border);}.ts:last-child{border-bottom:none;padding-bottom:0;}.ts:first-child{padding-top:0;}
.ts-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
.ts-n{font-size:13px;font-weight:400;}.ts-v{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}
.tbl{width:100%;border-collapse:collapse;}
.tbl th{text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;color:var(--muted);padding:0 0 10px;border-bottom:1px solid var(--border);}
.tbl td{padding:11px 0;border-bottom:1px solid var(--border);font-size:12px;vertical-align:middle;}
.tbl tr:last-child td{border-bottom:none;}.tbl tr:hover td{background:rgba(255,255,255,0.02);}
.tn{font-weight:600;font-size:12px;}.ts2{font-size:10px;color:var(--muted);margin-top:1px;}
.ink-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);}
.ink-row:last-child{border-bottom:none;padding-bottom:0;}.ink-row:first-child{padding-top:0;}
.ink-logo{width:30px;height:30px;border-radius:6px;background:var(--surface2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--muted);flex-shrink:0;}
.ink-name{font-size:12px;font-weight:400;flex:1;}.ink-vol{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;}
.cal-names{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:5px;}
.cal-dn{text-align:center;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--dim);padding-bottom:3px;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.cal-cell{aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;cursor:default;transition:transform 0.1s,opacity 0.1s;}
.cal-cell:hover{transform:scale(1.1);}
.c-prod{background:rgba(90,255,140,0.18);color:rgba(255,255,255,0.9);cursor:pointer;}
.c-flytt{background:rgba(91,143,255,0.18);color:rgba(255,255,255,0.9);cursor:pointer;}
.c-service{background:rgba(255,179,64,0.15);color:var(--warn);cursor:pointer;}
.c-off{background:rgba(255,255,255,0.03);color:var(--dim);}
.cal-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;}
.cal-si{background:var(--surface2);border-radius:8px;padding:10px 8px;text-align:center;}
.cal-sn{font-family:'Fraunces',serif;font-size:22px;line-height:1;}
.cal-sl{font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-top:3px;}
.sc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:14px;}
.sc{background:var(--surface2);border-radius:10px;padding:11px 6px;text-align:center;border:1px solid transparent;transition:all 0.15s;cursor:default;}
.sc:hover{border-color:var(--border2);background:var(--surface);}.sc.best{border-color:rgba(90,255,140,0.2);}
.sc-k{font-size:9px;color:var(--muted);font-weight:600;letter-spacing:0.3px;margin-bottom:7px;text-transform:uppercase;}
.sc-p{font-family:'Fraunces',serif;font-size:17px;line-height:1;margin-bottom:1px;}.sc-u{font-size:9px;color:var(--muted);margin-bottom:6px;}
.sc-d{height:1px;background:var(--border);margin:5px 0;}.sc-s{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;}.sc-sl{font-size:9px;color:var(--muted);}.sc-x{font-size:9px;color:var(--dim);margin-top:4px;}
.cleg{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;color:var(--muted);display:flex;align-items:center;gap:12px;margin-bottom:12px;}
.li{display:flex;align-items:center;gap:4px;}.ld{width:7px;height:7px;border-radius:50%;}.cdiv{height:1px;background:var(--border);margin:18px 0;}
.snum-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px;}
.snum{background:var(--surface2);border-radius:8px;padding:10px;text-align:center;}
.snum-v{font-family:'Fraunces',serif;font-size:18px;line-height:1;}.snum-l{font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-top:3px;}
.tbar{display:flex;height:18px;border-radius:5px;overflow:hidden;gap:2px;margin-bottom:14px;}
.tseg{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;}
.tleg{display:flex;flex-wrap:wrap;gap:10px;}.tli{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);}.tld{width:6px;height:6px;border-radius:2px;}
.op-clickable{cursor:pointer;transition:background 0.15s;border-radius:8px;margin:0 -8px;padding-left:8px;padding-right:8px;}
.op-clickable:hover{background:rgba(255,255,255,0.04);}.op-clickable:hover .op-name::after{content:' →';opacity:0.4;font-size:11px;}
.forar-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:500;opacity:0;pointer-events:none;transition:opacity 0.25s;}
.forar-overlay.open{opacity:1;pointer-events:all;}
.forar-panel{position:fixed;top:0;right:0;bottom:0;width:520px;background:var(--surface);border-left:1px solid var(--border2);z-index:501;overflow-y:auto;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);}
.forar-panel.open{transform:translateX(0);}
.forar-head{position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--border);padding:18px 24px;display:flex;align-items:center;gap:14px;z-index:10;}
.forar-av{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:rgba(255,255,255,0.7);flex-shrink:0;}
.forar-title{font-family:'Fraunces',serif;font-size:18px;font-weight:500;}.forar-sub{font-size:11px;color:var(--muted);margin-top:2px;}
.forar-close{margin-left:auto;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.07);border:none;cursor:pointer;color:var(--muted);font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;}
.forar-close:hover{background:rgba(255,255,255,0.12);color:var(--text);}
.forar-body{padding:20px 24px 40px;}
.forar-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px;}
.fkpi{background:var(--surface2);border-radius:10px;padding:14px 12px;text-align:center;}
.fkpi-v{font-family:'Fraunces',serif;font-size:24px;line-height:1;color:var(--text);}.fkpi-l{font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:4px;}
.fsec-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;}.fsec{margin-bottom:20px;}
.frow{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px;}
.frow:last-child{border-bottom:none;}.frow-l{color:var(--muted);}.frow-v{font-weight:600;font-variant-numeric:tabular-nums;}
.ink-clickable{cursor:pointer;transition:background 0.12s;border-radius:8px;margin:0 -8px;padding-left:8px;padding-right:8px;}
.ink-clickable:hover{background:rgba(255,255,255,0.04);}
.bolag-panel{position:fixed;top:0;right:0;bottom:0;width:480px;background:var(--surface);border-left:1px solid var(--border2);z-index:501;overflow-y:auto;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);}
.bolag-panel.open{transform:translateX(0);}
::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.2);}
.dag-panel{position:fixed;top:0;right:0;bottom:0;width:460px;background:var(--surface);border-left:1px solid var(--border2);z-index:501;overflow-y:auto;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);}
.dag-panel.open{transform:translateX(0);}` }} />
      <div dangerouslySetInnerHTML={{ __html: `<header class="hdr">
  <div class="brand"><div class="brand-mark">🏗️</div><div><div class="brand-name">Kompersmåla Skog</div></div></div>
  <div class="hdr-mid">
    <button class="s-tab">Vecka</button><button class="s-tab on">Månad</button><button class="s-tab">Kvartal</button><button class="s-tab">År</button>
  </div>
  <div class="hdr-r">
    <button class="cmp-btn" id="s_cmpBtn" onclick="s_toggleCmp()">⇄ Jämför</button>
    <div class="s-mach-wrap">
      <div class="mach-btn" onclick="s_toggleMMenu()">
        <div class="m-dot" id="s_mDot" style="background:var(--blue)"></div>
        <span id="s_mName">Ponsse Elephant King AF</span>
        <span style="color:var(--dim);font-size:10px;margin-left:2px">▾</span>
      </div>
      <div class="mach-menu" id="s_mMenu">
        <div class="s-mach-opt" onclick="s_pickM(this,'Ponsse Scorpion Giant 8W','Skördare · PONS20SDJAA270231','var(--accent)')">
          <div class="m-dot" style="background:var(--accent)"></div>
          <div><div class="mach-opt-name">Ponsse Scorpion Giant 8W</div><div class="mach-opt-sub">Skördare · PONS20SDJAA270231</div></div>
        </div>
        <div class="s-mach-opt sel" onclick="s_pickM(this,'Ponsse Elephant King AF','Skotare · A110148','var(--blue)')">
          <div class="m-dot" style="background:var(--blue)"></div>
          <div><div class="mach-opt-name">Ponsse Elephant King AF</div><div class="mach-opt-sub">Skotare · A110148</div></div>
        </div>
        <div class="s-mach-opt" onclick="s_pickM(this,'Rottne H8E','Gallringsskördare · R64101','var(--warn)')">
          <div class="m-dot" style="background:var(--warn)"></div>
          <div><div class="mach-opt-name">Rottne H8E</div><div class="mach-opt-sub">Gallringsskördare · R64101</div></div>
        </div>
      </div>
    </div>
  </div>
</header>

<div class="cmp-bar" id="s_cmpBar">
  <div class="cmp-period"><span class="cmp-lbl a">A</span><input type="date" value="2026-01-01"><span class="cmp-sep">–</span><input type="date" value="2026-01-31"></div>
  <span class="cmp-vs">VS</span>
  <div class="cmp-period"><span class="cmp-lbl b">B</span><input type="date" value="2026-02-01"><span class="cmp-sep">–</span><input type="date" value="2026-02-28"></div>
  <button class="cmp-go" onclick="s_runCmp()">Visa →</button>
</div>

<div class="page" id="s_page">

  <!-- HERO -->
  <div class="hero">
    <div class="hero-main anim" style="animation-delay:0.05s">
      <div class="hero-label">Skotad volym – februari 2026</div>
      <div class="hero-val" id="s_hv">0</div>
      <div class="hero-unit">m³fub</div>
      <div class="hero-delta">↑ 11% jämfört med januari</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Antal lass</div>
      <div class="sk-val" data-count="312">0</div>
      <div class="k-unit">lass</div>
      <div class="k-delta up">↑ 6%</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">G15-timmar</div>
      <div class="sk-val" data-count="148">0</div>
      <div class="k-unit">timmar</div>
      <div class="k-delta down">↓ 2%</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Medelavstånd</div>
      <div class="sk-val" data-count="285">0</div>
      <div class="k-unit">meter</div>
      <div class="k-delta down">↓ 3%</div>
    </div>
    <div class="kpi anim">
      <div class="k-label">Medellast</div>
      <div class="sk-val" data-count="7.5" data-dec="1">0</div>
      <div class="k-unit">m³/lass</div>
      <div class="k-delta up">↑ 0.2</div>
    </div>
  </div>

  <!-- ROW 1: Operatörer | Tidsfördelning -->
  <div class="g2">
    <div class="card anim" style="animation-delay:0.3s">
      <div class="card-h"><div class="card-t">Operatörer</div><span class="badge bg">3 aktiva</span></div>
      <div class="card-b">
        <div class="op-row op-clickable" onclick="s_openForare('stefan')" title="Visa förarvy">
          <div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">SK</div>
          <div class="op-info"><div class="op-name">Stefan Karlsson</div><div class="op-sub">62 timmar · 124 lass</div></div>
          <div class="op-stats">
            <div><div class="op-sv" style="color:var(--text)">930 m³</div><div class="op-sl">volym</div></div>
            <div><div class="op-sv">2.0</div><div class="op-sl">lass/G15h</div></div>
          </div>
        </div>
        <div class="op-row op-clickable" onclick="s_openForare('marcus')" title="Visa förarvy">
          <div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">MN</div>
          <div class="op-info"><div class="op-name">Marcus Nilsson</div><div class="op-sub">48 timmar · 108 lass</div></div>
          <div class="op-stats">
            <div><div class="op-sv" style="color:var(--text)">810 m³</div><div class="op-sl">volym</div></div>
            <div><div class="op-sv">2.25</div><div class="op-sl">lass/G15h</div></div>
          </div>
        </div>
        <div class="op-row op-clickable" onclick="s_openForare('par')" title="Visa förarvy">
          <div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">PL</div>
          <div class="op-info"><div class="op-name">Pär Lindgren</div><div class="op-sub">38 timmar · 80 lass</div></div>
          <div class="op-stats">
            <div><div class="op-sv" style="color:var(--text)">600 m³</div><div class="op-sl">volym</div></div>
            <div><div class="op-sv">2.1</div><div class="op-sl">lass/G15h</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.35s;cursor:pointer;" onclick="s_openTid()">
      <div class="card-h"><div class="card-t">Tidsfördelning</div></div>
      <div class="card-b">
        <div class="tbar">
          <div class="tseg" style="flex:65;background:rgba(90,255,140,0.25)"></div>
          <div class="tseg" style="flex:18;background:rgba(91,143,255,0.2)"></div>
          <div class="tseg" style="flex:10;background:rgba(255,179,64,0.2)"></div>
          <div class="tseg" style="flex:7;background:rgba(255,255,255,0.04)"></div>
        </div>
        <div class="tleg">
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.3)"></div>Processar 65%</div>
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.2)"></div>Kör 18%</div>
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Avbrott 10%</div>
          <div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Rast 7%</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px;">
          <div class="snum"><div class="snum-v" style="color:var(--text)">96h</div><div class="snum-l">Effektiv G15</div></div>
          <div class="snum"><div class="snum-v">15h</div><div class="snum-l">Avbrott</div></div>
        </div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för avbrottsdetaljer →</div>
      </div>
    </div>

  </div>

  <!-- ROW 2: Avståndsklass | Volym per bolag | Objekt -->
  <div class="g3">
    <div class="card anim" style="animation-delay:0.45s">
      <div class="card-h"><div class="card-t">Avståndsklass</div></div>
      <div class="card-b" onclick="s_openAvstand()" style="cursor:pointer;">
        <div class="ts"><div class="ts-top"><span class="ts-n">0–100 m</span><span class="ts-v">420 m³ · 18%</span></div><div class="prog"><div class="pf" style="width:18%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">100–200 m</span><span class="ts-v">580 m³ · 25%</span></div><div class="prog"><div class="pf" style="width:25%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">200–300 m</span><span class="ts-v">520 m³ · 22%</span></div><div class="prog"><div class="pf" style="width:22%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">300–400 m</span><span class="ts-v">380 m³ · 16%</span></div><div class="prog"><div class="pf" style="width:16%;background:rgba(255,255,255,0.15)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">400+ m</span><span class="ts-v">440 m³ · 19%</span></div><div class="prog"><div class="pf" style="width:19%;background:rgba(255,255,255,0.1)"></div></div></div>
        <div class="snum-grid">
          <div class="snum"><div class="snum-v">285m</div><div class="snum-l">Medelavst</div></div>
          <div class="snum"><div class="snum-v">7.5</div><div class="snum-l">Medellast</div></div>
          <div class="snum"><div class="snum-v">2.1</div><div class="snum-l">Lass/G15h</div></div>
        </div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för avståndsklass-detaljer →</div>
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.5s">
      <div class="card-h"><div class="card-t">Volym per bolag</div></div>
      <div class="card-b">
        <div class="ink-row ink-clickable" onclick="s_openBolag('vida')">
          <div class="ink-logo">VIDA</div>
          <div class="ink-name">Vida Skog AB</div>
          <div style="text-align:right"><div class="ink-vol">1 260 m³</div><div style="font-size:10px;color:var(--muted)">54%</div></div>
        </div>
        <div style="padding:4px 0 10px 40px"><div class="prog"><div class="pf" style="width:54%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ink-row ink-clickable" onclick="s_openBolag('sod')">
          <div class="ink-logo">SÖD</div>
          <div class="ink-name">Södra Skogsägarna</div>
          <div style="text-align:right"><div class="ink-vol">560 m³</div><div style="font-size:10px;color:var(--muted)">24%</div></div>
        </div>
        <div style="padding:4px 0 10px 40px"><div class="prog"><div class="pf" style="width:24%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ink-row ink-clickable" onclick="s_openBolag('ata')">
          <div class="ink-logo">ATA</div>
          <div class="ink-name">ATA Timber</div>
          <div style="text-align:right"><div class="ink-vol">520 m³</div><div style="font-size:10px;color:var(--muted)">22%</div></div>
        </div>
        <div style="padding:4px 0 0 40px"><div class="prog"><div class="pf" style="width:22%;background:rgba(255,255,255,0.15)"></div></div></div>
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.55s">
      <div class="card-h"><div class="card-t">Objekt</div></div>
      <div class="card-b" style="padding-left:0;padding-right:0;padding-bottom:4px;">
        <div style="overflow-y:auto;max-height:220px;">
        <table class="tbl" style="padding:0 22px">
          <thead><tr style="position:sticky;top:0;background:var(--surface);z-index:1;">
            <th style="padding-left:22px">Objekt</th><th>Typ</th><th>m³</th><th>Lass</th><th style="padding-right:22px">Cert</th>
          </tr></thead>
          <tbody>
            <tr><td style="padding-left:22px"><div class="tn">Ålshult AU 2025</div><div class="ts2">Vida · VO 11080064</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">620</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">83</td><td style="padding-right:22px"><span class="badge bm">FSC</span></td></tr>
            <tr><td style="padding-left:22px"><div class="tn">Björsamåla AU 2025</div><div class="ts2">Vida · VO 11081163</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">510</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">68</td><td style="padding-right:22px"><span class="badge bm">FSC</span></td></tr>
            <tr><td style="padding-left:22px"><div class="tn">Karamåla 19 A-S</div><div class="ts2">ATA · VO 11106406</div></td><td><span class="badge bgall">GALLRING</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">410</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">55</td><td style="padding-right:22px"><span class="badge bm">FSC</span></td></tr>
            <tr><td style="padding-left:22px"><div class="tn">Svinhult Au 2025</div><div class="ts2">Södra · VO 11088xxx</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">460</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">61</td><td style="padding-right:22px"><span class="badge bm">PEFC</span></td></tr>
          </tbody>
        </table>
        </div>
        <div style="margin:14px 22px 4px;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Fördelning RP · AU · LRK</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="s_openObjTyp('rp')">
              <div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">1 080</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">RP · m³</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;">2.0 lass/G15h</div>
            </div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="s_openObjTyp('au')">
              <div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">920</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">AU · m³</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;">2.2 lass/G15h</div>
            </div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="s_openObjTyp('lrk')">
              <div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">340</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">LRK · m³</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;">2.0 lass/G15h</div>
            </div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;overflow:hidden;height:6px;display:flex;">
            <div style="flex:1080;background:rgba(90,255,140,0.5);"></div>
            <div style="flex:920;background:rgba(255,255,255,0.2);margin-left:2px;"></div>
            <div style="flex:340;background:rgba(91,143,255,0.4);margin-left:2px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;">
            <div style="display:flex;gap:14px;">
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(90,255,140,0.5);"></div>RP 46%</div>
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(255,255,255,0.2);"></div>AU 39%</div>
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(91,143,255,0.4);"></div>LRK 15%</div>
            </div>
            <button onclick="s_openObjJmf()" style="border:none;background:rgba(255,255,255,0.07);border-radius:6px;padding:5px 12px;font-family:inherit;font-size:10px;font-weight:600;color:rgba(255,255,255,0.6);cursor:pointer;letter-spacing:0.3px;">Jämför →</button>
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
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--blue)"></div>Lass/dag</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--accent)"></div>Volym m³</div>
        </div>
      </div>
      <div class="card-b"><canvas id="s_dailyChart" style="max-height:190px"></canvas></div>
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
        <div class="cal-grid" id="s_calGrid"></div>
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
        <canvas id="s_sortChart" style="max-height:175px"></canvas>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;">
          <div class="snum"><div class="snum-v" style="color:var(--text)">1 016</div><div class="snum-l">Sågtimmer</div></div>
          <div class="snum"><div class="snum-v" style="color:var(--text)">518</div><div class="snum-l">Massaved</div></div>
          <div class="snum"><div class="snum-v">98</div><div class="snum-l">Energived</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- MEDELLAST PER AVSTÅNDSKLASS -->
  <div class="gf">
    <div class="card anim" style="animation-delay:0.75s">
      <div class="card-h">
        <div class="card-t">Medellast per avståndsklass</div>
        <div style="display:flex;gap:12px;">
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>Medellast m³</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>Lass/G15h</div>
        </div>
      </div>
      <div class="card-b">
        <canvas id="s_medellastChart" style="max-height:170px"></canvas>
        <div class="sc-grid" style="margin-top:12px;">
          <div class="sc best"><div class="sc-k">0–100</div><div class="sc-p" style="color:var(--text)">8.2</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">3.2</div><div class="sc-sl">lass/G15h</div></div>
          <div class="sc"><div class="sc-k">100–200</div><div class="sc-p" style="color:var(--text)">7.8</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">2.8</div><div class="sc-sl">lass/G15h</div></div>
          <div class="sc"><div class="sc-k">200–300</div><div class="sc-p" style="color:var(--text)">7.5</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">2.3</div><div class="sc-sl">lass/G15h</div></div>
          <div class="sc"><div class="sc-k">300–400</div><div class="sc-p" style="color:var(--text)">7.2</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">2.0</div><div class="sc-sl">lass/G15h</div></div>
          <div class="sc"><div class="sc-k">400–500</div><div class="sc-p" style="color:var(--text)">6.8</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">1.7</div><div class="sc-sl">lass/G15h</div></div>
          <div class="sc"><div class="sc-k">500–700</div><div class="sc-p" style="color:var(--text)">6.5</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">1.4</div><div class="sc-sl">lass/G15h</div></div>
          <div class="sc"><div class="sc-k">700+</div><div class="sc-p" style="color:var(--text)">6.0</div><div class="sc-u">m³/lass</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">1.0</div><div class="sc-sl">lass/G15h</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- PRODUKTION & PRODUKTIVITET PER AVSTÅNDSKLASS -->
  <div class="gf">
    <div class="card anim" style="animation-delay:0.8s">
      <div class="card-h"><div class="card-t">Produktion & produktivitet per avståndsklass</div></div>
      <div class="card-b">
        <div class="cleg">Total produktion <div class="li"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>Volym m³</div><div class="li"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>Lass</div></div>
        <canvas id="s_totalChart" style="max-height:155px"></canvas>
        <div class="cdiv"></div>
        <div class="cleg">Produktivitet <div class="li"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>Lass/G15h</div><div class="li"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>Medellast</div></div>
        <canvas id="s_prodChart" style="max-height:175px"></canvas>
        <div class="sc-grid">
          <div class="sc best"><div class="sc-k">0–100</div><div class="sc-p" style="color:var(--text)">3.2</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">8.2</div><div class="sc-sl">m³/lass</div><div class="sc-x">420 m³ · 51 lass</div></div>
          <div class="sc"><div class="sc-k">100–200</div><div class="sc-p" style="color:var(--text)">2.8</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">7.8</div><div class="sc-sl">m³/lass</div><div class="sc-x">580 m³ · 74 lass</div></div>
          <div class="sc"><div class="sc-k">200–300</div><div class="sc-p" style="color:var(--text)">2.3</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">7.5</div><div class="sc-sl">m³/lass</div><div class="sc-x">520 m³ · 69 lass</div></div>
          <div class="sc"><div class="sc-k">300–400</div><div class="sc-p" style="color:var(--text)">2.0</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">7.2</div><div class="sc-sl">m³/lass</div><div class="sc-x">380 m³ · 53 lass</div></div>
          <div class="sc"><div class="sc-k">400–500</div><div class="sc-p" style="color:var(--text)">1.7</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">6.8</div><div class="sc-sl">m³/lass</div><div class="sc-x">240 m³ · 35 lass</div></div>
          <div class="sc"><div class="sc-k">500–700</div><div class="sc-p" style="color:var(--text)">1.4</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">6.5</div><div class="sc-sl">m³/lass</div><div class="sc-x">130 m³ · 20 lass</div></div>
          <div class="sc"><div class="sc-k">700+</div><div class="sc-p" style="color:var(--text)">1.0</div><div class="sc-u">lass/G15h</div><div class="sc-d"></div><div class="sc-s" style="color:var(--muted)">6.0</div><div class="sc-sl">m³/lass</div><div class="sc-x">70 m³ · 12 lass</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- DIESEL -->
  <div style="margin-top:8px;">
    <div class="card anim" style="animation-delay:0.7s">
      <div class="card-h"><div class="card-t">Dieselförbrukning per avståndsklass</div></div>
      <div class="card-b">
        <canvas id="s_dieselChart" style="max-height:200px;margin-bottom:16px;"></canvas>
        <div class="sc-grid">
          <div class="sc best"><div class="sc-k">0–100</div><div class="sc-p" style="color:var(--text)">1.2</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">100–200</div><div class="sc-p">1.4</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">200–300</div><div class="sc-p">1.6</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">300–400</div><div class="sc-p">1.9</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">400–500</div><div class="sc-p">2.2</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">500–700</div><div class="sc-p" style="color:var(--warn)">2.6</div><div class="sc-u">l/m³</div></div>
          <div class="sc"><div class="sc-k">700+</div><div class="sc-p" style="color:var(--warn)">3.1</div><div class="sc-u">l/m³</div></div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:20px;">
          <div class="snum"><div class="snum-v">1.8</div><div class="snum-l">Snitt l/m³</div></div>
          <div class="snum"><div class="snum-v">13.5</div><div class="snum-l">l/lass</div></div>
          <div class="snum"><div class="snum-v">4 212</div><div class="snum-l">Liter totalt</div></div>
        </div>
      </div>
    </div>
  </div>

</div>

<!-- M³FUB/G15H PER MEDELKÖRAVSTÅND -->
<div style="margin-top:8px;">
  <div class="card anim" style="animation-delay:0.85s">
    <div class="card-h"><div class="card-t">m³fub / G15h per medelköravstånd</div></div>
    <div class="card-b">
      <canvas id="s_m3fubG15hChart" style="max-height:200px;margin-bottom:16px;"></canvas>
      <div class="sc-grid">
        <div class="sc"><div class="sc-k">0–100</div><div class="sc-p" id="s_m3fub_v0" style="color:var(--text)">–</div><div class="sc-u">m³fub/G15h</div></div>
        <div class="sc"><div class="sc-k">100–200</div><div class="sc-p" id="s_m3fub_v1" style="color:var(--text)">–</div><div class="sc-u">m³fub/G15h</div></div>
        <div class="sc"><div class="sc-k">200–300</div><div class="sc-p" id="s_m3fub_v2" style="color:var(--text)">–</div><div class="sc-u">m³fub/G15h</div></div>
        <div class="sc"><div class="sc-k">300–400</div><div class="sc-p" id="s_m3fub_v3" style="color:var(--text)">–</div><div class="sc-u">m³fub/G15h</div></div>
        <div class="sc"><div class="sc-k">400+</div><div class="sc-p" id="s_m3fub_v4" style="color:var(--text)">–</div><div class="sc-u">m³fub/G15h</div></div>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:20px;">
        <div class="snum"><div class="snum-v" id="s_m3fub_total">–</div><div class="snum-l">Snitt m³fub/G15h</div></div>
      </div>
    </div>
  </div>
</div>

<!-- BOLAG PANEL -->
<div class="bolag-panel" id="s_bolagPanel">
  <div class="forar-head">
    <div class="forar-av" id="s_bpLogo" style="border-radius:8px;font-size:11px;font-weight:700;">VIDA</div>
    <div><div class="forar-title" id="s_bpName">Vida Skog AB</div><div class="forar-sub" id="s_bpSub">1 260 m³ · 54% av total volym</div></div>
    <button class="forar-close" onclick="s_closeBolag()">✕</button>
  </div>
  <div class="forar-body" id="s_bpBody"></div>
</div>

<!-- TIDSFÖRDELNING PANEL -->
<div class="bolag-panel" id="s_tidPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:14px;">⏱</div>
    <div><div class="forar-title">Tidsfördelning & avbrott</div><div class="forar-sub">Ponsse Elephant King AF · februari 2026</div></div>
    <button class="forar-close" onclick="s_closeTid()">✕</button>
  </div>
  <div class="forar-body">
    <div class="forar-kpis" style="margin-bottom:20px;">
      <div class="fkpi"><div class="fkpi-v">148h</div><div class="fkpi-l">Motortid</div></div>
      <div class="fkpi"><div class="fkpi-v">96h</div><div class="fkpi-l">Effektiv G15</div></div>
      <div class="fkpi"><div class="fkpi-v">15h</div><div class="fkpi-l">Avbrott</div></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Fördelning</div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
      <div class="frow"><span class="frow-l">Processar</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:65%;background:rgba(90,255,140,0.4)"></div></div></div><span class="frow-v">96h · 65%</span></div>
      <div class="frow"><span class="frow-l">Kör</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:18%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">27h · 18%</span></div>
      <div class="frow"><span class="frow-l">Avbrott</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:10%;background:rgba(255,179,64,0.4)"></div></div></div><span class="frow-v">15h · 10%</span></div>
      <div class="frow" style="border-bottom:none"><span class="frow-l">Rast</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:7%;background:rgba(255,255,255,0.08)"></div></div></div><span class="frow-v">10h · 7%</span></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Avbrott per orsak</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <div class="frow"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Service & underhåll</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Schemalagt underhåll</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;">4h 35min</div><div style="font-size:10px;color:var(--muted);">3 tillfällen · 29%</div></div></div>
      <div class="frow"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Flytt</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Förflyttning mellan objekt</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;">3h 30min</div><div style="font-size:10px;color:var(--muted);">2 tillfällen · 22%</div></div></div>
      <div class="frow"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Maskinfel</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Oplanerade stopp</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--warn);">2h 12min</div><div style="font-size:10px;color:var(--muted);">2 tillfällen · 14%</div></div></div>
      <div class="frow"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Korta stopp</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Stopp ≤ 15 min (kort_stopp_sek)</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;">1h 45min</div><div style="font-size:10px;color:var(--muted);">38 tillfällen · 11%</div></div></div>
      <div class="frow"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Tankning</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Bränsle & smörjning</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;">1h 40min</div><div style="font-size:10px;color:var(--muted);">6 tillfällen · 11%</div></div></div>
      <div class="frow"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Väntan</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Lastbil, körbesked, övrigt</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;">1h 25min</div><div style="font-size:10px;color:var(--muted);">2 tillfällen · 9%</div></div></div>
      <div class="frow" style="border-bottom:none;"><div style="flex:1;"><div style="font-size:12px;font-weight:500;">Övrigt</div><div style="font-size:10px;color:var(--muted);margin-top:1px;">Ej kategoriserat</div></div><div style="text-align:right;"><div style="font-weight:600;font-variant-numeric:tabular-nums;">0h 38min</div><div style="font-size:10px;color:var(--muted);">2 tillfällen · 4%</div></div></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Avbrott per förare</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">
      <div class="frow" style="cursor:pointer;" onclick="s_toggleForareAvbrott(this,'Stefan Karlsson')"><div style="display:flex;align-items:center;gap:8px;flex:1;"><div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">SK</div><span class="frow-l">Stefan Karlsson</span></div><span class="frow-v">5h 50min <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span></div>
      <div class="frow" style="cursor:pointer;" onclick="s_toggleForareAvbrott(this,'Marcus Nilsson')"><div style="display:flex;align-items:center;gap:8px;flex:1;"><div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">MN</div><span class="frow-l">Marcus Nilsson</span></div><span class="frow-v">5h 05min <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span></div>
      <div class="frow" style="border-bottom:none;cursor:pointer;" onclick="s_toggleForareAvbrott(this,'Pär Lindgren')"><div style="display:flex;align-items:center;gap:8px;flex:1;"><div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">PL</div><span class="frow-l">Pär Lindgren</span></div><span class="frow-v">4h 05min <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span></div>
    </div>
  </div>
</div>

<!-- AVSTÅND PANEL -->
<div class="bolag-panel" id="s_avstandPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:14px;">📏</div>
    <div><div class="forar-title">Avståndsklass & detaljer</div><div class="forar-sub">Ponsse Elephant King AF · februari 2026</div></div>
    <button class="forar-close" onclick="s_closeAvstand()">✕</button>
  </div>
  <div class="forar-body">
    <div class="forar-kpis" style="margin-bottom:20px;">
      <div class="fkpi"><div class="fkpi-v">2 340</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">312</div><div class="fkpi-l">Lass totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">285m</div><div class="fkpi-l">Medelavstånd</div></div>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Per avståndsklass</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="text-align:left;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;"></th><th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Volym</th><th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Lass</th><th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">Medellast</th><th style="text-align:right;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);padding:10px 0 8px;">l/m³</th></tr></thead>
        <tbody>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">0–100 m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">420</td><td style="text-align:right;font-variant-numeric:tabular-nums;">51</td><td style="text-align:right;font-variant-numeric:tabular-nums;">8.2</td><td style="text-align:right;font-variant-numeric:tabular-nums;">1.2</td></tr>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">100–200 m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">580</td><td style="text-align:right;font-variant-numeric:tabular-nums;">74</td><td style="text-align:right;font-variant-numeric:tabular-nums;">7.8</td><td style="text-align:right;font-variant-numeric:tabular-nums;">1.4</td></tr>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">200–300 m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">520</td><td style="text-align:right;font-variant-numeric:tabular-nums;">69</td><td style="text-align:right;font-variant-numeric:tabular-nums;">7.5</td><td style="text-align:right;font-variant-numeric:tabular-nums;">1.6</td></tr>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">300–400 m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">380</td><td style="text-align:right;font-variant-numeric:tabular-nums;">53</td><td style="text-align:right;font-variant-numeric:tabular-nums;">7.2</td><td style="text-align:right;font-variant-numeric:tabular-nums;">1.9</td></tr>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">400–500 m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">240</td><td style="text-align:right;font-variant-numeric:tabular-nums;">35</td><td style="text-align:right;font-variant-numeric:tabular-nums;">6.8</td><td style="text-align:right;font-variant-numeric:tabular-nums;">2.2</td></tr>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">500–700 m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">130</td><td style="text-align:right;font-variant-numeric:tabular-nums;">20</td><td style="text-align:right;font-variant-numeric:tabular-nums;">6.5</td><td style="text-align:right;font-variant-numeric:tabular-nums;">2.6</td></tr>
          <tr style="border-top:1px solid var(--border)"><td style="padding:10px 0;font-weight:500;">700+ m</td><td style="text-align:right;font-variant-numeric:tabular-nums;">70</td><td style="text-align:right;font-variant-numeric:tabular-nums;">12</td><td style="text-align:right;font-variant-numeric:tabular-nums;">6.0</td><td style="text-align:right;font-variant-numeric:tabular-nums;">3.1</td></tr>
          <tr style="border-top:1px solid var(--border2)"><td style="padding:10px 0;font-size:10px;color:var(--muted);font-weight:600;">Totalt</td><td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">2 340</td><td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">312</td><td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">7.5</td><td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">1.8</td></tr>
        </tbody>
      </table>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Andel per avståndsklass</div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
      <div class="frow"><span class="frow-l">0–100 m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:18%;background:rgba(90,255,140,0.5)"></div></div></div><span class="frow-v">18% · 420 m³</span></div>
      <div class="frow"><span class="frow-l">100–200 m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:25%;background:rgba(90,255,140,0.4)"></div></div></div><span class="frow-v">25% · 580 m³</span></div>
      <div class="frow"><span class="frow-l">200–300 m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:22%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">22% · 520 m³</span></div>
      <div class="frow"><span class="frow-l">300–400 m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:16%;background:rgba(255,255,255,0.15)"></div></div></div><span class="frow-v">16% · 380 m³</span></div>
      <div class="frow"><span class="frow-l">400–500 m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:10%;background:rgba(255,255,255,0.1)"></div></div></div><span class="frow-v">10% · 240 m³</span></div>
      <div class="frow"><span class="frow-l">500–700 m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:6%;background:rgba(91,143,255,0.4)"></div></div></div><span class="frow-v">6% · 130 m³</span></div>
      <div class="frow" style="border-bottom:none"><span class="frow-l">700+ m</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:3%;background:rgba(91,143,255,0.3)"></div></div></div><span class="frow-v">3% · 70 m³</span></div>
    </div>
  </div>
</div>

<!-- OBJ JMF PANEL -->
<div class="bolag-panel" id="s_objJmfPanel" style="width:560px;">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;">⚡</div>
    <div><div class="forar-title">RP · AU · LRK – jämförelse</div><div class="forar-sub">Ponsse Elephant King AF · februari 2026</div></div>
    <button class="forar-close" onclick="s_closeObjJmf()">✕</button>
  </div>
  <div class="forar-body">
    <div style="background:var(--surface2);border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:12px 16px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;color:var(--muted);"></th>
          <th style="text-align:right;padding:12px 10px;font-size:11px;font-weight:700;color:rgba(90,255,140,0.9);">RP</th>
          <th style="text-align:right;padding:12px 10px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);">AU</th>
          <th style="text-align:right;padding:12px 16px 12px 10px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);">LRK</th>
        </tr></thead>
        <tbody id="s_jmfTableBody"></tbody>
      </table>
    </div>
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Bäst per kategori</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" id="s_jmfBest"></div>
  </div>
</div>

<!-- OBJ TYP PANEL -->
<div class="bolag-panel" id="s_objTypPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;font-weight:700;" id="s_otpLabel">RP</div>
    <div><div class="forar-title" id="s_otpTitle">Röjningsprioriterat</div><div class="forar-sub">Ponsse Elephant King AF · februari 2026</div></div>
    <button class="forar-close" onclick="s_closeObjTyp()">✕</button>
  </div>
  <div class="forar-body" id="s_otpBody"></div>
</div>

<!-- DAG PANEL -->
<div class="dag-panel" id="s_dagPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;" id="s_dagIcon">📅</div>
    <div><div class="forar-title" id="s_dagTitle">1 februari 2026</div><div class="forar-sub" id="s_dagSub">Produktion</div></div>
    <button class="forar-close" onclick="s_closeDag()">✕</button>
  </div>
  <div class="forar-body" id="s_dagBody"></div>
</div>

<!-- FÖRAR OVERLAY -->
<div class="forar-overlay" id="s_forarOverlay" onclick="s_closeForare()"></div>

<!-- FÖRAR PANEL -->
<div class="forar-panel" id="s_forarPanel">
  <div class="forar-head">
    <div class="forar-av" id="s_fpAv">SK</div>
    <div><div class="forar-title" id="s_fpName">Stefan Karlsson</div><div class="forar-sub" id="s_fpSub">Ponsse Elephant King AF</div></div>
    <button class="forar-close" onclick="s_closeForare()">✕</button>
  </div>
  <div class="forar-body" id="s_fpBody"></div>
</div>` }} />
    </div>
  );
}
