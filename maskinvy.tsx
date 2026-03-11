'use client';

import { useEffect, useState, useCallback } from 'react';

/* ══════════════════════════════════════════════════════════════
   SKÖRDARE – Chart.js script (existing test data)
   ══════════════════════════════════════════════════════════════ */
const SKORDARE_SCRIPT = `
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

const classes = ['0.0–0.1','0.1–0.2','0.2–0.3','0.3–0.4','0.4–0.5','0.5–0.7','0.7+'];
const m3g15   = [7.7,10.3,10.5,11.1,12.0,12.7,15.0];
const stg15   = [102,73,42,32,27,21,36];
const volym   = [138,298,545,311,252,228,75];
const stammar = [1840,2130,2180,890,560,380,180];

const grid    = {color:'rgba(255,255,255,0.05)'};
const ticks   = {color:'#7a7a72',font:{size:11}};
const tooltip = {backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10};

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
  const hv = document.getElementById('hv');
  if(hv) countUp(hv, 1847, 0, 1400);
  document.querySelectorAll('.k-val[data-count]').forEach(el=>{
    const v = parseFloat(el.dataset.count);
    const d = parseInt(el.dataset.dec||0);
    countUp(el, v, d, 1200);
  });
}, 300);

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
    scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'m³',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'Stammar',color:'#5b8fff',font:{size:10}}}}
  }
});

new Chart(document.getElementById('sortChart'),{
  type:'bar',
  data:{labels:['Gran','Tall','Björk'],datasets:[
    {label:'Sågtimmer',data:[820,220,84],backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,stack:'s'},
    {label:'Massaved', data:[280,215,80],backgroundColor:'rgba(255,179,64,0.4)',borderRadius:3,stack:'s'},
    {label:'Energived',data:[24,63,21], backgroundColor:'rgba(255,255,255,0.1)',borderRadius:3,stack:'s'}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{font:{family:'Geist',size:11},boxWidth:8,borderRadius:2,padding:12,color:'#7a7a72'}},tooltip},scales:{x:{stacked:true,grid,ticks},y:{stacked:true,grid,ticks}}}
});

new Chart(document.getElementById('mthChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'Gran', data:[820,640,180,28,8,3,0], backgroundColor:'rgba(90,255,140,0.5)',borderRadius:3,stack:'m'},
    {label:'Tall', data:[190,120,50,10,2,1,0],  backgroundColor:'rgba(122,122,114,0.4)',borderRadius:3,stack:'m'},
    {label:'Björk',data:[112,52,32,4,1,0,0],   backgroundColor:'rgba(91,143,255,0.5)',borderRadius:3,stack:'m'}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{stacked:true,grid,ticks},y:{stacked:true,grid,ticks}}}
});

new Chart(document.getElementById('totalChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'Volym m³',data:volym,backgroundColor:'rgba(91,143,255,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'Stammar',data:stammar,type:'line',borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.04)',pointBackgroundColor:'#5aff8c',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m³',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5aff8c'},title:{display:true,text:'Stammar',color:'#5aff8c',font:{size:10}}}}}
});

new Chart(document.getElementById('prodChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'m³/G15h',data:m3g15,backgroundColor:m3g15.map(()=>'rgba(90,255,140,0.5)'),borderRadius:4,yAxisID:'y',order:1},
    {label:'st/G15h',data:stg15,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.04)',pointBackgroundColor:'#5b8fff',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>c.datasetIndex===0?\` \${c.parsed.y} m³/G15h\`:\` \${c.parsed.y} st/G15h\`}}},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m³/G15h',color:'#7a7a72',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'st/G15h',color:'#5b8fff',font:{size:10}}}}}
});

const dieselPerM3 = [6.8, 5.2, 4.4, 3.9, 3.6, 3.3, 3.1];
new Chart(document.getElementById('dieselChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'l/m³',data:dieselPerM3,backgroundColor:'rgba(90,255,140,0.5)',borderRadius:4,yAxisID:'y',order:1},
    {label:'m³/G15h',data:m3g15,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.04)',pointBackgroundColor:'#5b8fff',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>c.datasetIndex===0?\` \${c.parsed.y} l/m³\`:\` \${c.parsed.y} m³/G15h\`}}},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'liter / m³',color:'#7a7a72',font:{size:10}},suggestedMin:2,suggestedMax:8},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5b8fff'},title:{display:true,text:'m³/G15h',color:'#5b8fff',font:{size:10}}}}}
});

// Calendar
const cal = document.getElementById('calGrid');
if(cal){
  for(let i=0;i<6;i++){const d=document.createElement('div');d.className='cal-cell';cal.appendChild(d);}
  const dt=[0,0,1,1,0,0,1,1,1,0,0,2,0,1,1,0,0,1,1,3,0,0,2,1,1,0,0,1];
  const dc={0:'c-off',1:'c-prod',2:'c-flytt',3:'c-service'};
  const dlbl={0:'Ej aktiv',1:'Produktion',2:'Flytt',3:'Service'};
  dt.forEach((t,i)=>{
    const el=document.createElement('div');
    el.className=\`cal-cell \${dc[t]}\`;
    el.title=\`\${i+1} feb · \${dlbl[t]}\${dailyVol[i]>0?' · '+dailyVol[i]+' m³':''}\`;
    el.textContent=i+1;
    cal.appendChild(el);
  });
}
`;

/* ══════════════════════════════════════════════════════════════
   SKOTARE – Chart.js script (test data)
   ══════════════════════════════════════════════════════════════ */
const SKOTARE_SCRIPT = `
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

const grid    = {color:'rgba(255,255,255,0.05)'};
const ticks   = {color:'#7a7a72',font:{size:11}};
const tooltip = {backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10};

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
  const hv = document.getElementById('sk-hv');
  if(hv) countUp(hv, 342, 0, 1400);
  document.querySelectorAll('.sk-kv[data-count]').forEach(el=>{
    const v = parseFloat(el.dataset.count);
    const d = parseInt(el.dataset.dec||0);
    countUp(el, v, d, 1200);
  });
}, 300);

const days = Array.from({length:28},(_,i)=>\`\${i+1}/2\`);
const dailyLass = [0,0,18,20,0,0,22,21,19,0,0,17,0,20,22,0,0,19,18,21,0,0,20,18,17,0,0,15];
const dailyVol  = [0,0,97,108,0,0,119,113,103,0,0,92,0,108,119,0,0,103,97,113,0,0,108,97,92,0,0,81];
const dailyKm   = [0,0,13.9,15.4,0,0,16.9,16.2,14.6,0,0,13.1,0,15.4,16.9,0,0,14.6,13.9,16.2,0,0,15.4,13.9,13.1,0,0,11.6];
const medellast = [0,0,5.4,5.4,0,0,5.4,5.4,5.4,0,0,5.4,0,5.4,5.4,0,0,5.4,5.4,5.4,0,0,5.4,5.4,5.4,0,0,5.4];
const lassG15   = [0,0,2.7,2.9,0,0,3.1,3.0,2.8,0,0,2.5,0,2.9,3.1,0,0,2.8,2.7,3.0,0,0,2.9,2.7,2.5,0,0,2.2];
const dieselDay = [0,0,145,161,0,0,177,170,153,0,0,137,0,161,177,0,0,153,145,170,0,0,161,145,137,0,0,121];

// Dagliga lass & volym
new Chart(document.getElementById('skDailyChart'),{
  type:'bar',
  data:{labels:days,datasets:[
    {label:'Lass/dag',data:dailyLass,backgroundColor:dailyLass.map(v=>v===0?'rgba(255,255,255,0.04)':'rgba(91,143,255,0.5)'),borderRadius:3,yAxisID:'y',order:1},
    {label:'m³/dag',data:dailyVol,type:'line',borderColor:'rgba(90,255,140,0.6)',backgroundColor:'rgba(90,255,140,0.05)',pointBackgroundColor:dailyVol.map(v=>v>0?'#5aff8c':'transparent'),pointRadius:dailyVol.map(v=>v>0?3:0),tension:0.3,yAxisID:'y2',order:0,spanGaps:false}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'Lass',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{...ticks,color:'#5aff8c'},title:{display:true,text:'m³',color:'#5aff8c',font:{size:10}}}}}
});

// Körsträcka per dag
new Chart(document.getElementById('skDistChart'),{
  type:'bar',
  data:{labels:days,datasets:[
    {label:'km/dag',data:dailyKm,backgroundColor:dailyKm.map(v=>v===0?'rgba(255,255,255,0.04)':'rgba(255,179,64,0.4)'),borderRadius:3}
  ]},
  options:{responsive:true,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>\` \${c.parsed.y} km\`}}},scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'km',color:'#7a7a72',font:{size:10}}}}}
});

// Medellast över tid
new Chart(document.getElementById('skLoadChart'),{
  type:'line',
  data:{labels:days,datasets:[
    {label:'m³/lass',data:medellast.map(v=>v===0?null:v),borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.05)',pointBackgroundColor:medellast.map(v=>v>0?'#5aff8c':'transparent'),pointRadius:medellast.map(v=>v>0?3:0),tension:0.3,fill:true,spanGaps:false}
  ]},
  options:{responsive:true,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>\` \${c.parsed.y} m³/lass\`}}},scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'m³/lass',color:'#7a7a72',font:{size:10}},suggestedMin:4,suggestedMax:7}}}
});

// Lass per G15-timme över tid
new Chart(document.getElementById('skLassG15Chart'),{
  type:'line',
  data:{labels:days,datasets:[
    {label:'Lass/G15h',data:lassG15.map(v=>v===0?null:v),borderColor:'rgba(91,143,255,0.7)',backgroundColor:'rgba(91,143,255,0.05)',pointBackgroundColor:lassG15.map(v=>v>0?'#5b8fff':'transparent'),pointRadius:lassG15.map(v=>v>0?3:0),tension:0.3,fill:true,spanGaps:false}
  ]},
  options:{responsive:true,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>\` \${c.parsed.y} lass/G15h\`}}},scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'Lass/G15h',color:'#7a7a72',font:{size:10}},suggestedMin:1.5,suggestedMax:4}}}
});

// Dieselförbrukning
new Chart(document.getElementById('skDieselChart'),{
  type:'bar',
  data:{labels:days,datasets:[
    {label:'Liter/dag',data:dieselDay,backgroundColor:dieselDay.map(v=>v===0?'rgba(255,255,255,0.04)':'rgba(255,95,87,0.35)'),borderRadius:3}
  ]},
  options:{responsive:true,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>\` \${c.parsed.y} liter\`}}},scales:{x:{grid,ticks:{...ticks,font:{size:10}}},y:{grid,ticks,title:{display:true,text:'Liter',color:'#7a7a72',font:{size:10}}}}}
});
`;

/* ══════════════════════════════════════════════════════════════
   Shared CSS
   ══════════════════════════════════════════════════════════════ */
const SHARED_CSS = `:root {
  --bg:       #111110;
  --surface:  #1a1a18;
  --surface2: #222220;
  --border:   rgba(255,255,255,0.07);
  --border2:  rgba(255,255,255,0.12);
  --text:     #e8e8e4;
  --muted:    #7a7a72;
  --dim:      #3a3a36;
  --accent:   #5aff8c;
  --accent2:  #1a4a2e;
  --warn:     #ffb340;
  --danger:   #ff5f57;
  --blue:     #5b8fff;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
.anim { opacity: 0; animation: fadeUp 0.5s forwards; }
.page { max-width: 1320px; margin: 0 auto; padding: 28px 36px 60px; }
.hero { display: grid; grid-template-columns: 2.2fr 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px; }
.hero-main { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px 32px; position: relative; overflow: hidden; }
.hero-main::after { content: ''; position: absolute; bottom: -60px; right: -60px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(90,255,140,0.08) 0%, transparent 70%); }
.hero-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 12px; }
.hero-val { font-family: 'Fraunces', serif; font-size: 64px; line-height: 1; font-weight: 700; letter-spacing: -3px; color: var(--accent); margin-bottom: 4px; }
.hero-unit { font-size: 14px; color: var(--muted); font-weight: 400; }
.hero-delta { margin-top: 18px; font-size: 12px; color: var(--accent); opacity: 0.8; display: flex; align-items: center; gap: 4px; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 22px 18px; position: relative; overflow: hidden; transition: border-color 0.2s, transform 0.2s; }
.kpi:hover { border-color: var(--border2); transform: translateY(-1px); }
.k-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 10px; }
.k-val { font-family: 'Fraunces', serif; font-size: 32px; line-height: 1; letter-spacing: -1px; color: var(--text); margin-bottom: 4px; }
.k-unit { font-size: 11px; color: var(--muted); }
.k-delta { margin-top: 10px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 20px; }
.up   { color: var(--accent); background: rgba(90,255,140,0.1); }
.down { color: var(--danger); background: rgba(255,95,87,0.1); }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; transition: border-color 0.2s; }
.card:hover { border-color: var(--border2); }
.card-h { padding: 18px 22px 0; display: flex; align-items: center; justify-content: space-between; }
.card-t { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.9px; color: var(--muted); }
.card-b { padding: 14px 22px 20px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.gf { margin-bottom: 8px; }
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.3px; }
.bg  { background: rgba(90,255,140,0.1);  color: var(--accent); }
.bw  { background: rgba(255,179,64,0.1);  color: var(--warn); }
.bs  { background: rgba(255,179,64,0.12); color: var(--warn); }
.bgall { background: rgba(90,255,140,0.1); color: var(--accent); }
.bm  { background: rgba(255,255,255,0.06); color: var(--muted); }
.div { height: 1px; background: var(--border); }
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
.prog { height: 3px; background: var(--dim); border-radius: 2px; overflow: hidden; margin-top: 5px; }
.pf   { height: 100%; border-radius: 2px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }
.kal { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--surface2); border-radius: 8px; margin-bottom: 6px; }
.kal:last-child { margin-bottom: 0; }
.kal-d { font-size: 11px; color: var(--muted); width: 76px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.kal-v { flex: 1; font-size: 12px; font-weight: 500; }
.ts  { padding: 9px 0; border-bottom: 1px solid var(--border); }
.ts:last-child { border-bottom: none; padding-bottom: 0; }
.ts:first-child { padding-top: 0; }
.ts-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
.ts-n { font-size: 13px; font-weight: 400; }
.ts-v { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); padding: 0 0 10px; border-bottom: 1px solid var(--border); }
.tbl td { padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 12px; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tn { font-weight: 600; font-size: 12px; }
.ts2{ font-size: 10px; color: var(--muted); margin-top: 1px; }
.ink-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.ink-row:last-child { border-bottom: none; padding-bottom: 0; }
.ink-row:first-child { padding-top: 0; }
.ink-logo { width: 30px; height: 30px; border-radius: 6px; background: var(--surface2); border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: var(--muted); flex-shrink: 0; }
.ink-name { font-size: 12px; font-weight: 400; flex: 1; }
.ink-vol  { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cal-names { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-bottom: 5px; }
.cal-dn { text-align: center; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dim); padding-bottom: 3px; }
.cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
.cal-cell { aspect-ratio: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; cursor: default; }
.c-prod    { background: rgba(90,255,140,0.18); color: rgba(255,255,255,0.9); }
.c-flytt   { background: rgba(91,143,255,0.18); color: rgba(255,255,255,0.9); }
.c-service { background: rgba(255,179,64,0.15); color: var(--warn); }
.c-off     { background: rgba(255,255,255,0.03); color: var(--dim); }
.cal-sum { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-top: 12px; }
.cal-si { background: var(--surface2); border-radius: 8px; padding: 10px 8px; text-align: center; }
.cal-sn { font-family: 'Fraunces', serif; font-size: 22px; line-height: 1; }
.cal-sl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-top: 3px; }
.sc-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 5px; margin-top: 14px; }
.sc { background: var(--surface2); border-radius: 10px; padding: 11px 6px; text-align: center; border: 1px solid transparent; transition: all 0.15s; }
.sc:hover { border-color: var(--border2); background: var(--surface); }
.sc.best { border-color: rgba(90,255,140,0.2); }
.sc-k { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 0.3px; margin-bottom: 7px; text-transform: uppercase; }
.sc-p { font-family: 'Fraunces', serif; font-size: 17px; line-height: 1; margin-bottom: 1px; }
.sc-u { font-size: 9px; color: var(--muted); margin-bottom: 6px; }
.sc-d { height: 1px; background: var(--border); margin: 5px 0; }
.sc-s { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sc-sl{ font-size: 9px; color: var(--muted); }
.sc-x { font-size: 9px; color: var(--dim); margin-top: 4px; }
.cleg { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.li { display: flex; align-items: center; gap: 4px; }
.ld { width: 7px; height: 7px; border-radius: 50%; }
.cdiv { height: 1px; background: var(--border); margin: 18px 0; }
.snum-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 12px; }
.snum { background: var(--surface2); border-radius: 8px; padding: 10px; text-align: center; }
.snum-v { font-family: 'Fraunces', serif; font-size: 18px; line-height: 1; }
.snum-l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-top: 3px; }
.tbar { display: flex; height: 18px; border-radius: 5px; overflow: hidden; gap: 2px; margin-bottom: 14px; }
.tseg { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; }
.tleg { display: flex; flex-wrap: wrap; gap: 10px; }
.tli  { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
.tld  { width: 6px; height: 6px; border-radius: 2px; }
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr 1fr; }
  .hero-main { grid-column: 1 / -1; }
  .hero-val { font-size: 48px; }
  .g3 { grid-template-columns: 1fr; }
  .g2 { grid-template-columns: 1fr; }
  .page { padding: 20px 16px 60px; }
  .sc-grid { grid-template-columns: repeat(4,1fr); }
}`;

/* ══════════════════════════════════════════════════════════════
   Skördare HTML (existing content, header removed)
   ══════════════════════════════════════════════════════════════ */
const SKORDARE_HTML = `<div class="page" id="page">
  <div class="hero">
    <div class="hero-main anim" style="animation-delay:0.05s">
      <div class="hero-label">Volym – februari 2026</div>
      <div class="hero-val" id="hv">0</div>
      <div class="hero-unit">m³fub</div>
      <div class="hero-delta">↑ 12% jämfört med januari</div>
    </div>
    <div class="kpi anim"><div class="k-label">Stammar</div><div class="k-val" data-count="9240">0</div><div class="k-unit">stammar</div><div class="k-delta up">↑ 8%</div></div>
    <div class="kpi anim"><div class="k-label">G15-timmar</div><div class="k-val" data-count="163">0</div><div class="k-unit">timmar</div><div class="k-delta down">↓ 3%</div></div>
    <div class="kpi anim"><div class="k-label">Produktivitet</div><div class="k-val" data-count="11.3" data-dec="1">0</div><div class="k-unit">m³/G15h</div><div class="k-delta up">↑ 5%</div></div>
    <div class="kpi anim"><div class="k-label">Medelstam</div><div class="k-val" data-count="0.26" data-dec="2">0</div><div class="k-unit">m³/stam</div><div class="k-delta up">↑ 0.02</div></div>
  </div>

  <div class="g3">
    <div class="card anim" style="animation-delay:0.3s">
      <div class="card-h"><div class="card-t">Operatörer</div><span class="badge bg">3 aktiva</span></div>
      <div class="card-b">
        <div class="op-row"><div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">SK</div><div class="op-info"><div class="op-name">Stefan Karlsson</div><div class="op-sub">68 timmar</div></div><div class="op-stats"><div><div class="op-sv" style="color:var(--text)">820 m³</div><div class="op-sl">volym</div></div><div><div class="op-sv">12.1</div><div class="op-sl">m³/G15h</div></div></div></div>
        <div class="op-row"><div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">MN</div><div class="op-info"><div class="op-name">Marcus Nilsson</div><div class="op-sub">54 timmar</div></div><div class="op-stats"><div><div class="op-sv" style="color:var(--text)">598 m³</div><div class="op-sl">volym</div></div><div><div class="op-sv">11.1</div><div class="op-sl">m³/G15h</div></div></div></div>
        <div class="op-row"><div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">PL</div><div class="op-info"><div class="op-name">Pär Lindgren</div><div class="op-sub">41 timmar</div></div><div class="op-stats"><div><div class="op-sv" style="color:var(--text)">429 m³</div><div class="op-sl">volym</div></div><div><div class="op-sv">10.5</div><div class="op-sl">m³/G15h</div></div></div></div>
      </div>
    </div>
    <div class="card anim" style="animation-delay:0.35s">
      <div class="card-h"><div class="card-t">Tidsfördelning</div></div>
      <div class="card-b">
        <div class="tbar"><div class="tseg" style="flex:68;background:rgba(90,255,140,0.25)"></div><div class="tseg" style="flex:14;background:rgba(91,143,255,0.2)"></div><div class="tseg" style="flex:11;background:rgba(255,179,64,0.2)"></div><div class="tseg" style="flex:7;background:rgba(255,255,255,0.04)"></div></div>
        <div class="tleg"><div class="tli"><div class="tld" style="background:rgba(255,255,255,0.3)"></div>Processar 68%</div><div class="tli"><div class="tld" style="background:rgba(255,255,255,0.2)"></div>Kör 14%</div><div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Avbrott 11%</div><div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Rast 7%</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px;"><div class="snum"><div class="snum-v" style="color:var(--text)">111h</div><div class="snum-l">Effektiv G15</div></div><div class="snum"><div class="snum-v">18h</div><div class="snum-l">Avbrott</div></div></div>
      </div>
    </div>
    <div class="card anim" style="animation-delay:0.4s">
      <div class="card-h"><div class="card-t">Kalibrering (HQC)</div><span class="badge bg">OK</span></div>
      <div class="card-b">
        <div class="kal"><div class="kal-d">2026-02-28</div><div class="kal-v">Längd −0.4 cm · Dia +1.8 mm</div><span class="badge bg">OK</span></div>
        <div class="kal"><div class="kal-d">2026-02-14</div><div class="kal-v">Längd +0.2 cm · Dia −0.9 mm</div><span class="badge bg">OK</span></div>
        <div class="kal"><div class="kal-d">2026-01-31</div><div class="kal-v" style="color:var(--warn)">Längd +3.1 cm · Dia +5.2 mm</div><span class="badge bw">VARNING</span></div>
        <div class="kal"><div class="kal-d">2026-01-17</div><div class="kal-v">Längd −0.8 cm · Dia +2.1 mm</div><span class="badge bg">OK</span></div>
      </div>
    </div>
  </div>

  <div class="g3">
    <div class="card anim" style="animation-delay:0.45s">
      <div class="card-h"><div class="card-t">Trädslag</div></div>
      <div class="card-b">
        <div class="ts"><div class="ts-top"><span class="ts-n">Gran</span><span class="ts-v">1 124 m³ · 61%</span></div><div class="prog"><div class="pf" style="width:61%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">Tall</span><span class="ts-v">498 m³ · 27%</span></div><div class="prog"><div class="pf" style="width:27%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">Björk</span><span class="ts-v">185 m³ · 10%</span></div><div class="prog"><div class="pf" style="width:10%;background:rgba(255,255,255,0.15)"></div></div></div>
        <div class="ts"><div class="ts-top"><span class="ts-n">Övrigt</span><span class="ts-v">40 m³ · 2%</span></div><div class="prog"><div class="pf" style="width:2%;background:rgba(255,255,255,0.08)"></div></div></div>
        <div class="snum-grid"><div class="snum"><div class="snum-v">23%</div><div class="snum-l">MTH-andel</div></div><div class="snum"><div class="snum-v">0.07</div><div class="snum-l">MTH stam</div></div><div class="snum"><div class="snum-v">0.26</div><div class="snum-l">Single stam</div></div></div>
      </div>
    </div>
    <div class="card anim" style="animation-delay:0.5s">
      <div class="card-h"><div class="card-t">Volym per bolag</div></div>
      <div class="card-b">
        <div class="ink-row"><div class="ink-logo">VIDA</div><div class="ink-name">Vida Skog AB</div><div style="text-align:right"><div class="ink-vol">1 024 m³</div><div style="font-size:10px;color:var(--muted)">55%</div></div></div>
        <div style="padding:4px 0 10px 40px"><div class="prog"><div class="pf" style="width:55%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ink-row"><div class="ink-logo">SÖD</div><div class="ink-name">Södra Skogsägarna</div><div style="text-align:right"><div class="ink-vol">444 m³</div><div style="font-size:10px;color:var(--muted)">24%</div></div></div>
        <div style="padding:4px 0 10px 40px"><div class="prog"><div class="pf" style="width:24%;background:rgba(255,255,255,0.2)"></div></div></div>
        <div class="ink-row"><div class="ink-logo">ATA</div><div class="ink-name">ATA Timber</div><div style="text-align:right"><div class="ink-vol">379 m³</div><div style="font-size:10px;color:var(--muted)">21%</div></div></div>
        <div style="padding:4px 0 0 40px"><div class="prog"><div class="pf" style="width:21%;background:rgba(255,255,255,0.15)"></div></div></div>
      </div>
    </div>
    <div class="card anim" style="animation-delay:0.55s">
      <div class="card-h"><div class="card-t">Objekt</div></div>
      <div class="card-b" style="padding-left:0;padding-right:0;padding-bottom:4px;">
        <div style="overflow-y:auto;max-height:220px;">
        <table class="tbl" style="padding:0 22px"><thead><tr style="position:sticky;top:0;background:var(--surface);z-index:1;"><th style="padding-left:22px">Objekt</th><th>Typ</th><th>m³</th><th>m³/G15h</th><th style="padding-right:22px">Cert</th></tr></thead><tbody>
          <tr><td style="padding-left:22px"><div class="tn">Ålshult AU 2025</div><div class="ts2">Vida · VO 11080064</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">623</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">12.4</td><td style="padding-right:22px"><span class="badge bm">FSC</span></td></tr>
          <tr><td style="padding-left:22px"><div class="tn">Björsamåla AU 2025</div><div class="ts2">Vida · VO 11081163</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">401</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">11.8</td><td style="padding-right:22px"><span class="badge bm">FSC</span></td></tr>
          <tr><td style="padding-left:22px"><div class="tn">Karamåla 19 A-S</div><div class="ts2">ATA · VO 11106406</div></td><td><span class="badge bgall">GALLRING</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">379</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">10.2</td><td style="padding-right:22px"><span class="badge bm">FSC</span></td></tr>
          <tr><td style="padding-left:22px"><div class="tn">Svinhult Au 2025</div><div class="ts2">Södra · VO 11088xxx</div></td><td><span class="badge bs">SLUTAVV</span></td><td style="font-variant-numeric:tabular-nums;font-weight:600">444</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">11.5</td><td style="padding-right:22px"><span class="badge bm">PEFC</span></td></tr>
        </tbody></table></div>
        <div style="margin:14px 22px 4px;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:10px;">Fördelning RP · AU · LRK</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;"><div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">892</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">RP · m³</div></div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;"><div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">748</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">AU · m³</div></div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;"><div style="font-family:'Fraunces',serif;font-size:22px;line-height:1;">207</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);margin-top:3px;">LRK · m³</div></div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;overflow:hidden;height:6px;display:flex;"><div style="flex:892;background:rgba(90,255,140,0.5);"></div><div style="flex:748;background:rgba(255,255,255,0.2);margin-left:2px;"></div><div style="flex:207;background:rgba(91,143,255,0.4);margin-left:2px;"></div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="gf"><div class="card anim" style="animation-delay:0.6s"><div class="card-h"><div class="card-t">Daglig produktion – februari 2026</div><div style="display:flex;gap:12px;"><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--accent)"></div>m³/dag</div><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--blue)"></div>Stammar</div></div></div><div class="card-b"><canvas id="dailyChart" style="max-height:190px"></canvas></div></div></div>

  <div class="g2">
    <div class="card anim" style="animation-delay:0.65s"><div class="card-h"><div class="card-t">Aktivitet – februari</div><div style="display:flex;gap:10px;"><div class="li" style="font-size:10px;color:var(--muted)"><div style="width:7px;height:7px;border-radius:2px;background:rgba(255,255,255,0.4)"></div>Produktion</div><div class="li" style="font-size:10px;color:var(--muted)"><div style="width:7px;height:7px;border-radius:2px;background:rgba(255,255,255,0.2)"></div>Flytt</div><div class="li" style="font-size:10px;color:var(--muted)"><div style="width:7px;height:7px;border-radius:2px;background:var(--warn)"></div>Service</div></div></div><div class="card-b"><div class="cal-names"><div class="cal-dn">Mån</div><div class="cal-dn">Tis</div><div class="cal-dn">Ons</div><div class="cal-dn">Tor</div><div class="cal-dn">Fre</div><div class="cal-dn">Lör</div><div class="cal-dn">Sön</div></div><div class="cal-grid" id="calGrid"></div><div class="cal-sum"><div class="cal-si"><div class="cal-sn" style="color:var(--text)">18</div><div class="cal-sl">Produktion</div></div><div class="cal-si"><div class="cal-sn" style="color:var(--text)">2</div><div class="cal-sl">Flytt</div></div><div class="cal-si"><div class="cal-sn" style="color:var(--warn)">1</div><div class="cal-sl">Service</div></div><div class="cal-si"><div class="cal-sn" style="color:var(--muted)">7</div><div class="cal-sl">Ej aktiv</div></div></div></div></div>
    <div class="card anim" style="animation-delay:0.7s"><div class="card-h"><div class="card-t">Sortiment</div></div><div class="card-b"><canvas id="sortChart" style="max-height:175px"></canvas><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;"><div class="snum"><div class="snum-v" style="color:var(--text)">1 124</div><div class="snum-l">Sågtimmer</div></div><div class="snum"><div class="snum-v" style="color:var(--text)">612</div><div class="snum-l">Massaved</div></div><div class="snum"><div class="snum-v">111</div><div class="snum-l">Energived</div></div></div></div></div>
  </div>

  <div class="gf"><div class="card anim" style="animation-delay:0.75s"><div class="card-h"><div class="card-t">Flerträd (MTH) per trädslag & medelstamsklass</div><div style="display:flex;gap:12px;"><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--accent)"></div>Gran</div><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--muted)"></div>Tall</div><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--blue)"></div>Björk</div></div></div><div class="card-b"><canvas id="mthChart" style="max-height:170px"></canvas></div></div></div>

  <div class="gf"><div class="card anim" style="animation-delay:0.8s"><div class="card-h"><div class="card-t">Produktion & produktivitet per medelstamsklass</div></div><div class="card-b">
    <div class="cleg">Total produktion<div class="li"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>Volym m³</div><div class="li"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>Stammar</div></div>
    <canvas id="totalChart" style="max-height:155px"></canvas>
    <div class="cdiv"></div>
    <div class="cleg">Produktivitet<div class="li"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>m³/G15h</div><div class="li"><div class="ld" style="background:rgba(91,143,255,0.7)"></div>st/G15h</div></div>
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
  </div></div></div>

  <div style="margin-top:8px;"><div class="card anim" style="animation-delay:0.7s"><div class="card-h"><div class="card-t">Dieselförbrukning per medelstamsklass</div></div><div class="card-b">
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
  </div></div></div>
</div>`;

/* ══════════════════════════════════════════════════════════════
   Skotare HTML (new forwarder content)
   ══════════════════════════════════════════════════════════════ */
const SKOTARE_HTML = `<div class="page" id="page">
  <!-- HERO -->
  <div class="hero">
    <div class="hero-main anim" style="animation-delay:0.05s">
      <div class="hero-label">Antal lass – februari 2026</div>
      <div class="hero-val" id="sk-hv" style="color:var(--blue)">0</div>
      <div class="hero-unit">lass</div>
      <div class="hero-delta" style="color:var(--blue)">↑ 8% jämfört med januari</div>
    </div>
    <div class="kpi anim"><div class="k-label">Skotad volym</div><div class="sk-kv k-val" data-count="1847">0</div><div class="k-unit">m³fub</div><div class="k-delta up">↑ 10%</div></div>
    <div class="kpi anim"><div class="k-label">Medelavstånd</div><div class="sk-kv k-val" data-count="385">0</div><div class="k-unit">meter</div><div class="k-delta down">↓ 5%</div></div>
    <div class="kpi anim"><div class="k-label">Medellast</div><div class="sk-kv k-val" data-count="5.4" data-dec="1">0</div><div class="k-unit">m³/lass</div><div class="k-delta up">↑ 0.2</div></div>
    <div class="kpi anim"><div class="k-label">Lass / G15h</div><div class="sk-kv k-val" data-count="2.8" data-dec="1">0</div><div class="k-unit">lass/timme</div><div class="k-delta up">↑ 3%</div></div>
  </div>

  <!-- ROW 1: Operatörer + Tidsfördelning + Objekt -->
  <div class="g3">
    <div class="card anim" style="animation-delay:0.3s">
      <div class="card-h"><div class="card-t">Operatörer</div><span class="badge bg">2 aktiva</span></div>
      <div class="card-b">
        <div class="op-row"><div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">EJ</div><div class="op-info"><div class="op-name">Erik Johansson</div><div class="op-sub">72 timmar</div></div><div class="op-stats"><div><div class="op-sv" style="color:var(--text)">198 lass</div><div class="op-sl">antal</div></div><div><div class="op-sv">1 069 m³</div><div class="op-sl">volym</div></div></div></div>
        <div class="op-row"><div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">AL</div><div class="op-info"><div class="op-name">Anders Larsson</div><div class="op-sub">50 timmar</div></div><div class="op-stats"><div><div class="op-sv" style="color:var(--text)">144 lass</div><div class="op-sl">antal</div></div><div><div class="op-sv">778 m³</div><div class="op-sl">volym</div></div></div></div>
      </div>
    </div>
    <div class="card anim" style="animation-delay:0.35s">
      <div class="card-h"><div class="card-t">Tidsfördelning</div></div>
      <div class="card-b">
        <div class="tbar"><div class="tseg" style="flex:42;background:rgba(91,143,255,0.3)"></div><div class="tseg" style="flex:28;background:rgba(90,255,140,0.2)"></div><div class="tseg" style="flex:18;background:rgba(255,179,64,0.2)"></div><div class="tseg" style="flex:12;background:rgba(255,255,255,0.04)"></div></div>
        <div class="tleg"><div class="tli"><div class="tld" style="background:rgba(91,143,255,0.5)"></div>Lastar 42%</div><div class="tli"><div class="tld" style="background:rgba(90,255,140,0.4)"></div>Kör 28%</div><div class="tli"><div class="tld" style="background:rgba(255,179,64,0.4)"></div>Avbrott 18%</div><div class="tli"><div class="tld" style="background:rgba(255,255,255,0.1)"></div>Rast 12%</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px;"><div class="snum"><div class="snum-v" style="color:var(--text)">86h</div><div class="snum-l">Effektiv G15</div></div><div class="snum"><div class="snum-v">22h</div><div class="snum-l">Avbrott</div></div></div>
      </div>
    </div>
    <div class="card anim" style="animation-delay:0.4s">
      <div class="card-h"><div class="card-t">Objekt</div></div>
      <div class="card-b" style="padding-left:0;padding-right:0;padding-bottom:4px;">
        <div style="overflow-y:auto;max-height:220px;">
        <table class="tbl" style="padding:0 22px"><thead><tr style="position:sticky;top:0;background:var(--surface);z-index:1;"><th style="padding-left:22px">Objekt</th><th>Lass</th><th>m³</th><th>Avst.</th></tr></thead><tbody>
          <tr><td style="padding-left:22px"><div class="tn">Ålshult AU 2025</div><div class="ts2">Vida · VO 11080064</div></td><td style="font-variant-numeric:tabular-nums;font-weight:600">148</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">799</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">340 m</td></tr>
          <tr><td style="padding-left:22px"><div class="tn">Björsamåla AU 2025</div><div class="ts2">Vida · VO 11081163</div></td><td style="font-variant-numeric:tabular-nums;font-weight:600">102</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">551</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">420 m</td></tr>
          <tr><td style="padding-left:22px"><div class="tn">Karamåla 19 A-S</div><div class="ts2">ATA · VO 11106406</div></td><td style="font-variant-numeric:tabular-nums;font-weight:600">92</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">497</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">395 m</td></tr>
        </tbody></table></div>
      </div>
    </div>
  </div>

  <!-- DAGLIGA LASS & VOLYM -->
  <div class="gf"><div class="card anim" style="animation-delay:0.5s"><div class="card-h"><div class="card-t">Dagliga lass & volym – februari 2026</div><div style="display:flex;gap:12px;"><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--blue)"></div>Lass</div><div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:var(--accent)"></div>m³</div></div></div><div class="card-b"><canvas id="skDailyChart" style="max-height:190px"></canvas></div></div></div>

  <!-- KÖRSTRÄCKA + MEDELLAST -->
  <div class="g2">
    <div class="card anim" style="animation-delay:0.55s"><div class="card-h"><div class="card-t">Körsträcka per dag</div></div><div class="card-b">
      <canvas id="skDistChart" style="max-height:175px"></canvas>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;"><div class="snum"><div class="snum-v" style="color:var(--text)">385</div><div class="snum-l">Snitt km/dag</div></div><div class="snum"><div class="snum-v">256</div><div class="snum-l">Totalt km</div></div><div class="snum"><div class="snum-v" style="color:var(--warn)">16.9</div><div class="snum-l">Max km/dag</div></div></div>
    </div></div>
    <div class="card anim" style="animation-delay:0.6s"><div class="card-h"><div class="card-t">Medellast över tid</div></div><div class="card-b">
      <canvas id="skLoadChart" style="max-height:175px"></canvas>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;"><div class="snum"><div class="snum-v" style="color:var(--text)">5.4</div><div class="snum-l">Snitt m³/lass</div></div><div class="snum"><div class="snum-v">5.8</div><div class="snum-l">Max last</div></div><div class="snum"><div class="snum-v">4.9</div><div class="snum-l">Min last</div></div></div>
    </div></div>
  </div>

  <!-- LASS PER G15-TIMME -->
  <div class="gf"><div class="card anim" style="animation-delay:0.65s"><div class="card-h"><div class="card-t">Lass per G15-timme över tid</div></div><div class="card-b">
    <canvas id="skLassG15Chart" style="max-height:190px"></canvas>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;"><div class="snum"><div class="snum-v" style="color:var(--text)">2.8</div><div class="snum-l">Snitt lass/G15h</div></div><div class="snum"><div class="snum-v" style="color:var(--accent)">3.1</div><div class="snum-l">Bästa dag</div></div><div class="snum"><div class="snum-v" style="color:var(--warn)">2.2</div><div class="snum-l">Sämsta dag</div></div></div>
  </div></div></div>

  <!-- DIESEL -->
  <div style="margin-top:8px;"><div class="card anim" style="animation-delay:0.7s"><div class="card-h"><div class="card-t">Dieselförbrukning per dag</div></div><div class="card-b">
    <canvas id="skDieselChart" style="max-height:190px;margin-bottom:16px;"></canvas>
    <div style="display:flex;gap:20px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
      <div class="snum"><div class="snum-v" style="color:var(--text)">1.6</div><div class="snum-l">Snitt l/m³</div></div>
      <div class="snum"><div class="snum-v">8.6</div><div class="snum-l">l/lass</div></div>
      <div class="snum"><div class="snum-v">2 934</div><div class="snum-l">Liter totalt</div></div>
    </div>
  </div></div></div>
</div>`;

/* ══════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════ */
export default function Maskinvy() {
  const [view, setView] = useState<'skordare' | 'skotare'>('skordare');

  const destroyCharts = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).Chart) {
      document.querySelectorAll('canvas').forEach((c) => {
        const chart = (window as any).Chart.getChart(c as HTMLCanvasElement);
        if (chart) chart.destroy();
      });
    }
  }, []);

  const initCharts = useCallback((script: string) => {
    const scriptEl = document.createElement('script');
    scriptEl.textContent = script;
    scriptEl.id = 'maskinvy-charts';
    document.body.appendChild(scriptEl);
    return scriptEl;
  }, []);

  useEffect(() => {
    let scriptEl: HTMLScriptElement | null = null;

    function loadAndInit() {
      // Small delay to let DOM render
      setTimeout(() => {
        scriptEl = initCharts(view === 'skordare' ? SKORDARE_SCRIPT : SKOTARE_SCRIPT);
      }, 50);
    }

    // @ts-ignore
    if (typeof window !== 'undefined' && !(window as any).Chart) {
      const chartJs = document.createElement('script');
      chartJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      chartJs.onload = loadAndInit;
      document.head.appendChild(chartJs);
    } else {
      loadAndInit();
    }

    return () => {
      destroyCharts();
      const old = document.getElementById('maskinvy-charts');
      if (old) old.remove();
      if (scriptEl) scriptEl.remove();
    };
  }, [view, initCharts, destroyCharts]);

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', zIndex: 1 }}>
      <style dangerouslySetInnerHTML={{ __html: SHARED_CSS }} />

      {/* Header with toggle */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(17,17,16,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 36px',
        fontFamily: "'Geist', system-ui, sans-serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: '#1a4a2e', border: '1px solid rgba(90,255,140,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>🌲</div>
          <div style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 15, fontWeight: 500, letterSpacing: '-0.3px', color: '#e8e8e4',
          }}>Kompersmåla Skog</div>
        </div>

        {/* Skördare / Skotare toggle */}
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)',
          borderRadius: 8, padding: 3,
        }}>
          <button
            onClick={() => setView('skordare')}
            style={{
              padding: '6px 18px', border: 'none', borderRadius: 6,
              fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: view === 'skordare' ? '#222220' : 'transparent',
              color: view === 'skordare' ? '#e8e8e4' : '#7a7a72',
            }}
          >Skördare</button>
          <button
            onClick={() => setView('skotare')}
            style={{
              padding: '6px 18px', border: 'none', borderRadius: 6,
              fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: view === 'skotare' ? '#222220' : 'transparent',
              color: view === 'skotare' ? '#e8e8e4' : '#7a7a72',
            }}
          >Skotare</button>
        </div>

        {/* Period tabs */}
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)',
          borderRadius: 8, padding: 3,
        }}>
          {['Vecka', 'Månad', 'Kvartal', 'År'].map((p) => (
            <button key={p} style={{
              padding: '4px 14px', border: 'none', borderRadius: 6,
              fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: p === 'Månad' ? '#222220' : 'transparent',
              color: p === 'Månad' ? '#e8e8e4' : '#7a7a72',
            }}>{p}</button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div
        key={view}
        dangerouslySetInnerHTML={{ __html: view === 'skordare' ? SKORDARE_HTML : SKOTARE_HTML }}
      />
    </div>
  );
}
