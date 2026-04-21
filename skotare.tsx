'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type Maskin = { maskin_id: string; modell: string; tillverkare: string; typ: string };

// Paginated Supabase fetch — fetches all rows beyond the 1000-row default limit.
async function fetchAllRows(queryFn: (from: number, to: number) => Promise<{ data: any[] | null }>): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await queryFn(offset, offset + PAGE - 1);
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ── Types ──
type DistClassData = {
  label: string;
  lass: number;
  volym: number;
  g15h: number;
  lassG15h: number;
  medellast: number;
  dieselM3: number;
};

type OperatorData = {
  id: string;
  key: string;
  namn: string;
  initialer: string;
  lass: number;
  volym: number;
  g15h: number;
  medellast: number;
  lassG15h: number;
  medelavstand: number;
  dagar: number;
  processingSek: number;
  terrainSek: number;
  disturbanceSek: number;
  engineTimeSek: number;
  bransleLiter: number;
  dailyLass: number[];
  dailyVol: number[];
  utnyttjandePct: number;
  klassData: DistClassData[];
};

type DagDataEntry = {
  typ: number;
  forare: string;
  objekt: string;
  start: string;
  slut: string;
  lass: number;
  volym: number;
  g15: number;
  medellast: number;
  medelavstand: number;
  diesel: number;
  avbrott: Array<{ orsak: string; tid: string }>;
  flytt?: boolean;
};

type DbData = {
  totalVolym: number;
  totalLass: number;
  medellast: number;
  medelavstand: number;
  g15Timmar: number;
  lassPerG15h: number;
  utnyttjandegrad: number;
  bransleTotalt: number;
  branslePerM3: number;
  // Time distribution
  processingSek: number;
  terrainSek: number;
  kortStoppSek: number;
  avbrottSek: number;
  rastSek: number;
  engineTimeSek: number;
  // Daily
  dailyLass: number[];
  dailyVol: number[];
  days: string[];
  dailyDates: string[];
  // Operators
  operatorer: OperatorData[];
  // Distance class
  distClasses: DistClassData[];
  // DagData
  dagData: Record<number, DagDataEntry>;
  calendarDt: number[];
  // Avbrott
  avbrottTotal: { timmar: number; antal: number; snittMin: number };
  avbrottPerKategori: Array<{ kategori: string; timmar: number; antal: number; snittMin: number }>;
  // Period info
  periodStartDate: string;
  totalDays: number;
};

const DIST_EDGES = [0, 100, 200, 300, 400, 500, 700, Infinity];
const DIST_LABELS = ['0\u2013100', '100\u2013200', '200\u2013300', '300\u2013400', '400\u2013500', '500\u2013700', '700+'];

// ── Chart script (injected into DOM) ──
const SKOTARE_SCRIPT = `(function(){
if (typeof Chart === 'undefined') { console.error('[Skotare] Chart.js not loaded'); return; }
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

var _db = window.__skotareData || {};
console.log('[Skotare Script] _db keys:', Object.keys(_db));

var grid = {color:'rgba(255,255,255,0.05)'};
var ticks = {color:'#7a7a72',font:{size:11}};
var tooltip = {backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10};

// Count-up animation
function countUp(el, target, dec, duration){
  if (!el) return;
  dec = dec || 0;
  duration = duration || 1200;
  var start = performance.now();
  var step = function(t) {
    var p = Math.min((t-start)/duration, 1);
    var ease = 1-Math.pow(1-p, 3);
    el.textContent = (target*ease).toFixed(dec).replace(/\\B(?=(\\d{3})+(?!\\d))/g,' ');
    if(p<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// KPIs
var _kpiVolym = _db.totalVolym || 0;
var _kpiLass = _db.totalLass || 0;
var _kpiG15 = _db.g15Timmar || 0;
var _kpiMedellast = _db.medellast || 0;
var _kpiMedelavstand = _db.medelavstand || 0;
var _kpiBransle = _db.bransleTotalt || 0;
var _kpiBransleM3 = _db.branslePerM3 || 0;
var _kpiLassG15h = _db.lassPerG15h || 0;
var _kpiUtnytt = _db.utnyttjandegrad || 0;

// Update KPI count-ups
document.querySelectorAll('.k-val[data-count]').forEach(function(el) {
  var label = el.parentElement && el.parentElement.querySelector('.k-label');
  if (!label) return;
  var t = label.textContent;
  if (t === 'Antal lass') el.setAttribute('data-count', String(_kpiLass));
  if (t === 'Medellast') el.setAttribute('data-count', String(_kpiMedellast));
  if (t === 'Medelavstånd') el.setAttribute('data-count', String(_kpiMedelavstand));
  if (t === 'Bränsle totalt') el.setAttribute('data-count', String(_kpiBransle));
  if (t === 'Bränsle/m³') el.setAttribute('data-count', String(_kpiBransleM3));
  if (t === 'Lass/G15h') el.setAttribute('data-count', String(_kpiLassG15h));
  if (t === 'Utnyttjandegrad') el.setAttribute('data-count', String(_kpiUtnytt));
  if (t === 'G15-timmar') el.setAttribute('data-count', String(_kpiG15));
});

setTimeout(function(){
  countUp(document.getElementById('hv'), _kpiVolym, 0, 1400);
  document.querySelectorAll('.k-val[data-count]').forEach(function(el){
    var v = parseFloat(el.dataset.count);
    var d = parseInt(el.dataset.dec||'0');
    countUp(el, v, d, 1200);
  });
}, 300);

// Daily chart
var dailyLass = _db.dailyLass || [];
var dailyVol = _db.dailyVol || [];
var days = _db.days || [];
var dailyDates = _db.dailyDates || [];
var dagData = _db.dagData || {};

var isWeekend = dailyDates.map(function(ds) {
  var d = new Date(ds + 'T12:00:00');
  var dow = d.getDay();
  return dow === 0 || dow === 6;
});

var nonZeroLass = dailyLass.filter(function(v){return v>0;});
var avgLass = nonZeroLass.length > 0 ? Math.round(nonZeroLass.reduce(function(a,b){return a+b;},0) / nonZeroLass.length) : 0;

var dailyTitleEl = document.getElementById('dailyChartTitle');
if (dailyTitleEl && avgLass > 0) {
  dailyTitleEl.innerHTML = 'Daglig produktion <span style="color:#7a7a72;font-size:11px;font-weight:400;"> · Snitt: ' + avgLass + ' lass/dag</span>';
}

var weekendBgPlugin = {
  id: 'weekendBg',
  beforeDraw: function(chart) {
    var ctx = chart.ctx;
    var xAxis = chart.scales.x;
    var yAxis = chart.scales.y;
    ctx.save();
    for (var i = 0; i < isWeekend.length; i++) {
      if (!isWeekend[i]) continue;
      var x = xAxis.getPixelForValue(i);
      var halfBar = (xAxis.getPixelForValue(1) - xAxis.getPixelForValue(0)) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x - halfBar, yAxis.top, halfBar * 2, yAxis.bottom - yAxis.top);
    }
    ctx.restore();
  }
};

var barLabelPlugin = {
  id: 'barLabels',
  afterDatasetsDraw: function(chart) {
    var ctx = chart.ctx;
    var meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = '500 9px Geist, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232,232,228,0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (var i = 0; i < meta.data.length; i++) {
      var val = dailyLass[i];
      if (val > 0) {
        var bar = meta.data[i];
        ctx.fillText(val.toString(), bar.x, bar.y - 3);
      }
    }
    ctx.restore();
  }
};

try {
var dailyEl = document.getElementById('dailyChart');
if (dailyEl) {
  new Chart(dailyEl, {
    type:'bar',
    data:{labels:days,datasets:[
      {label:'Lass/dag',data:dailyLass,backgroundColor:dailyLass.map(function(v,i){
        if(v===0) return isWeekend[i]?'rgba(255,255,255,0.02)':'rgba(255,255,255,0.04)';
        if(isWeekend[i]) return 'rgba(91,143,255,0.15)';
        return v>avgLass?'rgba(90,255,140,0.7)':'rgba(76,175,80,0.5)';
      }),borderRadius:6,barPercentage:0.85,categoryPercentage:0.9,yAxisID:'y',order:1},
      {label:'Volym m³',data:dailyVol,type:'line',borderColor:'rgba(90,255,140,0.6)',backgroundColor:'rgba(90,255,140,0.05)',pointBackgroundColor:dailyVol.map(function(v){return v>0?'#5aff8c':'transparent';}),pointRadius:dailyVol.map(function(v){return v>0?3:0;}),tension:0.3,yAxisID:'y2',order:0,spanGaps:false},
      {label:'Snitt: '+avgLass+' lass',data:new Array(dailyLass.length).fill(avgLass),type:'line',borderColor:'rgba(255,255,255,0.2)',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false,order:0}
    ]},
    plugins:[weekendBgPlugin,barLabelPlugin],
    options:{
      responsive:true,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},
        tooltip:{
          backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#c8c8c4',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:12,
          filter:function(item){return item.datasetIndex===0;},
          callbacks:{
            title:function(items){
              var idx=items[0].dataIndex;
              var ds=dailyDates[idx]||'';
              var dObj=new Date(ds+'T12:00:00');
              var vd=['Sön','Mån','Tis','Ons','Tor','Fre','Lör'];
              return vd[dObj.getDay()]+' '+days[idx];
            },
            label:function(ctx){
              var idx=ctx.dataIndex;
              var d=dagData[idx+1];
              var lines=[];
              lines.push('Lass: '+dailyLass[idx]);
              lines.push('Volym: '+dailyVol[idx]+' m³');
              if(d&&d.medellast) lines.push('Medellast: '+d.medellast+' m³');
              if(d&&d.objekt&&d.objekt!=='\\u2013') lines.push('Objekt: '+d.objekt);
              return lines;
            }
          }
        }
      },
      scales:{
        x:{grid:grid,ticks:{color:'#7a7a72',font:{size:10},callback:function(val,idx){
          if(isWeekend[idx]) return '\\u25AA '+days[idx];
          return days[idx];
        }}},
        y:{grid:grid,ticks:ticks,title:{display:true,text:'Lass',color:'#7a7a72',font:{size:11}},
          suggestedMax: Math.max.apply(null,dailyLass)*1.15},
        y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#5aff8c',font:{size:11}},title:{display:true,text:'m³',color:'#5aff8c',font:{size:10}}}
      },
      onClick:function(e,els){
        if(!els.length||els[0].datasetIndex!==0) return;
        var dag = els[0].index + 1;
        if(window.__skotareOpenDag) window.__skotareOpenDag(dag);
      },
      onHover:function(e,els){
        e.native.target.style.cursor = els.length && els[0].datasetIndex===0 && dagData[els[0].index+1] ? 'pointer' : 'default';
      }
    }
  });
}

// Calendar
var cal = document.getElementById('calGrid');
var dt = _db.calendarDt || [];
var dc = {0:'c-off',1:'c-prod',2:'c-flytt',3:'c-service'};
var dlbl = {0:'Ej aktiv',1:'Produktion',2:'Flytt',3:'Service'};
var calStart = new Date((_db.periodStartDate || '2026-01-01') + 'T12:00:00');
var calTotalDays = _db.totalDays || dt.length || 28;
var calTitleMonths = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
var calTitleEl = document.getElementById('calTitle');
if (calTitleEl) calTitleEl.textContent = calTitleMonths[calStart.getMonth()] + ' ' + calStart.getFullYear();
if (cal) {
  var firstDow = calStart.getDay();
  var emptyBefore = firstDow === 0 ? 6 : firstDow - 1;
  for(var eb=0;eb<emptyBefore;eb++){var ec=document.createElement('div');ec.className='cal-cell';cal.appendChild(ec);}
  var calManader = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  var calCounts = {prod:0,flytt:0,service:0,off:0};
  for(var ci=0;ci<calTotalDays;ci++){
    var cDate = new Date(calStart); cDate.setDate(calStart.getDate()+ci);
    var t = dt[ci] || 0;
    if(t===1) calCounts.prod++;
    else if(t===2) calCounts.flytt++;
    else if(t===3) calCounts.service++;
    else calCounts.off++;
    var el=document.createElement('div');
    el.className='cal-cell '+(dc[t]||'c-off');
    el.title=cDate.getDate()+' '+calManader[cDate.getMonth()]+' · '+dlbl[t]+(dailyLass[ci]>0?' · '+dailyLass[ci]+' lass':'');
    if(t===1||t===2||t===3) el.onclick=(function(idx){return function(){if(window.__skotareOpenDag) window.__skotareOpenDag(idx+1);};})(ci);
    el.textContent=cDate.getDate();
    cal.appendChild(el);
  }
  var calSumEl = document.getElementById('calSummary');
  if(calSumEl) calSumEl.innerHTML = '<div class="cal-si"><div class="cal-sn" style="color:var(--text)">'+calCounts.prod+'</div><div class="cal-sl">Produktion</div></div>'
    +'<div class="cal-si"><div class="cal-sn" style="color:var(--text)">'+calCounts.flytt+'</div><div class="cal-sl">Flytt</div></div>'
    +'<div class="cal-si"><div class="cal-sn" style="color:var(--warn)">'+calCounts.service+'</div><div class="cal-sl">Service</div></div>'
    +'<div class="cal-si"><div class="cal-sn" style="color:var(--muted)">'+calCounts.off+'</div><div class="cal-sl">Ej aktiv</div></div>';
}

// Distance class data
var _dc = _db.distClasses || [];
var s_classes = _dc.map(function(c){return c.label;});
var s_lassG15h = _dc.map(function(c){return c.lassG15h;});
var s_medellast = _dc.map(function(c){return c.medellast;});
var s_volym = _dc.map(function(c){return c.volym;});
var s_lass = _dc.map(function(c){return c.lass;});
var s_dieselPerM3 = _dc.map(function(c){return c.dieselM3;});

// Active classes (non-zero)
var _activeIdx = s_lass.map(function(_,i){return s_lass[i]>0||s_volym[i]>0?i:-1;}).filter(function(i){return i>=0;});
var ac = _activeIdx.map(function(i){return s_classes[i];});
var aLG15 = _activeIdx.map(function(i){return s_lassG15h[i];});
var aML = _activeIdx.map(function(i){return s_medellast[i];});
var aV = _activeIdx.map(function(i){return s_volym[i];});
var aL = _activeIdx.map(function(i){return s_lass[i];});
var aD = _activeIdx.map(function(i){return s_dieselPerM3[i];});

// Medellast per avstandsklass chart
var mlEl = document.getElementById('medellastChart');
if (mlEl && ac.length > 0) {
  new Chart(mlEl,{
    type:'bar',
    data:{labels:ac,datasets:[
      {label:'Medellast m³',data:aML,backgroundColor:'rgba(91,143,255,0.5)',borderRadius:4,yAxisID:'y',order:1},
      {label:'Lass/G15h',data:aLG15,type:'line',borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.04)',pointBackgroundColor:'#5aff8c',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:tooltip},scales:{x:{grid:grid,ticks:ticks},y:{grid:grid,ticks:ticks,title:{display:true,text:'m³/lass',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#5aff8c',font:{size:11}},title:{display:true,text:'Lass/G15h',color:'#5aff8c',font:{size:10}}}}}
  });
}

// Produktion per avstandsklass chart
var totalEl = document.getElementById('totalChart');
if (totalEl && ac.length > 0) {
  new Chart(totalEl,{
    type:'bar',
    data:{labels:ac,datasets:[
      {label:'Volym m³',data:aV,backgroundColor:'rgba(91,143,255,0.5)',borderRadius:4,yAxisID:'y',order:1},
      {label:'Lass',data:aL,type:'line',borderColor:'rgba(90,255,140,0.7)',backgroundColor:'rgba(90,255,140,0.04)',pointBackgroundColor:'#5aff8c',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:tooltip},scales:{x:{grid:grid,ticks:ticks},y:{grid:grid,ticks:ticks,title:{display:true,text:'m³',color:'#5b8fff',font:{size:10}}},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#5aff8c',font:{size:11}},title:{display:true,text:'Lass',color:'#5aff8c',font:{size:10}}}}}
  });
}

// Diesel per avstandsklass chart
var dieselEl = document.getElementById('dieselChart');
if (dieselEl && ac.length > 0) {
  new Chart(dieselEl,{
    type:'bar',
    data:{labels:ac,datasets:[
      {label:'l/m³',data:aD,backgroundColor:'rgba(90,255,140,0.5)',borderRadius:4,yAxisID:'y',order:1},
      {label:'Lass/G15h',data:aLG15,type:'line',borderColor:'rgba(91,143,255,0.6)',backgroundColor:'rgba(91,143,255,0.04)',pointBackgroundColor:'#5b8fff',pointRadius:4,tension:0.3,yAxisID:'y2',order:0}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10,callbacks:{label:function(c){return c.datasetIndex===0?' '+c.parsed.y+' l/m³':' '+c.parsed.y+' lass/G15h';}}}},scales:{x:{grid:grid,ticks:ticks},y:{grid:grid,ticks:ticks,title:{display:true,text:'liter / m³',color:'#7a7a72',font:{size:10}},suggestedMin:0.5,suggestedMax:4},y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#5b8fff',font:{size:11}},title:{display:true,text:'Lass/G15h',color:'#5b8fff',font:{size:10}}}}}
  });
}

// m3fub/G15h per medelkoravstand
var m3fubEl = document.getElementById('m3fubG15hChart');
if (m3fubEl && ac.length > 0) {
  var m3fubVals = _activeIdx.map(function(i){
    var dc = _db.distClasses[i];
    return dc && dc.g15h > 0 ? parseFloat((dc.volym / dc.g15h).toFixed(1)) : 0;
  });
  new Chart(m3fubEl,{
    type:'bar',
    data:{labels:ac,datasets:[
      {label:'m³fub/G15h',data:m3fubVals,backgroundColor:'rgba(90,255,140,0.5)',borderRadius:4}
    ]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a1a18',titleColor:'#e8e8e4',bodyColor:'#7a7a72',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10,callbacks:{label:function(c){return ' '+c.parsed.y.toFixed(1)+' m³fub/G15h';}}}},scales:{x:{grid:grid,ticks:ticks},y:{grid:grid,ticks:ticks,title:{display:true,text:'m³fub/G15h',color:'#7a7a72',font:{size:10}},beginAtZero:true}}}
  });
}

// Update time distribution bar & legend
var _tdProc = _db.processingSek || 0;
var _tdTerr = _db.terrainSek || 0;
var _tdKort = _db.kortStoppSek || 0;
var _tdAvbr = _db.avbrottSek || 0;
var _tdRast = _db.rastSek || 0;
var totalSek = _tdProc + _tdTerr + _tdKort + _tdAvbr + _tdRast;
var pProc = totalSek > 0 ? Math.round((_tdProc / totalSek) * 100) : 0;
var pTerr = totalSek > 0 ? Math.round((_tdTerr / totalSek) * 100) : 0;
var pKort = totalSek > 0 ? Math.round((_tdKort / totalSek) * 100) : 0;
var pAvbr = totalSek > 0 ? Math.round((_tdAvbr / totalSek) * 100) : 0;
var pRast = totalSek > 0 ? Math.max(0, Math.round((_tdRast / totalSek) * 100)) : 0;

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
  tlegItems[0].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.3)"></div>Lastar/lossar ' + pProc + '%';
  tlegItems[1].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.2)"></div>Kör ' + pTerr + '%';
  tlegItems[2].innerHTML = '<div class="tld" style="background:rgba(91,143,255,0.35)"></div>Korta stopp ' + pKort + '%';
  tlegItems[3].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.1)"></div>Avbrott ' + pAvbr + '%';
  tlegItems[4].innerHTML = '<div class="tld" style="background:rgba(255,255,255,0.1)"></div>Rast ' + pRast + '%';
}
var g15h = Math.round((_db.processingSek + _db.terrainSek) / 3600);
var _g15El = document.getElementById('tidG15Val'); if (_g15El) _g15El.textContent = g15h + 'h';
var _avbrEl = document.getElementById('tidAvbrVal'); if (_avbrEl) _avbrEl.textContent = Math.round((_db.avbrottSek || 0) / 3600) + 'h';

// Update operators container
var opContainer = document.getElementById('opContainer');
var opBadge = document.getElementById('opBadge');
var ops = _db.operatorer || [];
if (opContainer && ops.length > 0) {
  opContainer.innerHTML = '';
  ops.forEach(function(f) {
    var row = document.createElement('div');
    row.className = 'op-row op-clickable';
    row.setAttribute('data-op-key', f.key);
    row.title = 'Visa förarvy';
    row.innerHTML = '<div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">' + f.initialer + '</div>'
      + '<div class="op-info"><div class="op-name">' + f.namn + '</div><div class="op-sub">' + Math.round(f.g15h) + ' G15h</div></div>'
      + '<div class="op-stats"><div><div class="op-sv" style="color:var(--text)">' + Math.round(f.volym) + ' m³</div><div class="op-sl">volym</div></div>'
      + '<div><div class="op-sv">' + f.lassG15h.toFixed(1) + '</div><div class="op-sl">lass/G15h</div></div>'
      + '<div><div class="op-sv">' + f.medelavstand + 'm</div><div class="op-sl">avst.</div></div></div>';
    opContainer.appendChild(row);
  });
  if (opBadge) opBadge.textContent = '· ' + ops.length + ' aktiva';
} else if (opContainer) {
  opContainer.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0;">Ingen data för vald period</div>';
  if (opBadge) opBadge.textContent = '';
}

} catch(e) { console.error('[SKOTARE] Chart init error:', e); }
})();`;

type IdagData = {
  vol: number;
  lass: number;
  g15h: number;
  medellast: number;
  medelavstand: number;
  utnyttj: number;
  bransle: number;
  bransleLm3: number;
  lassG15h: number;
  operatorer: Array<{ namn: string; objekt: string; start: string; lass: number; vol: number }>;
  senastAktiv: { datum: string; tid: string | null } | null;
};

export default function SkotareVy() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [vald, setVald] = useState('');
  const [activeView, setActiveView] = useState('idag');
  const [dataVersion, setDataVersion] = useState(0);
  const [period, setPeriod] = useState<'V' | 'M' | 'K' | 'Å'>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [maskinOpen, setMaskinOpen] = useState(false);
  // Idag
  const [idagData, setIdagData] = useState<IdagData | null>(null);
  const [idagLoading, setIdagLoading] = useState(false);
  // Panel state
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [panelType, setPanelType] = useState<'operator' | 'dag' | null>(null);
  const [panelOperator, setPanelOperator] = useState<OperatorData | null>(null);
  const [panelDag, setPanelDag] = useState<{ dayNum: number; entry: DagDataEntry } | null>(null);

  // ── Hardcoded machines ──
  useEffect(() => {
    const skotare: Maskin[] = [
      { maskin_id: 'A110148', modell: 'Elephant King AF', tillverkare: 'Ponsse', typ: 'Skotare' },
      { maskin_id: 'A030353', modell: 'Wisent', tillverkare: 'Ponsse', typ: 'Skotare' },
    ];
    setMaskiner(skotare);
    setVald(skotare[0].modell);

    // Auto-detect latest month with data
    (async () => {
      const latestRes = await supabase.from('fakt_produktion')
        .select('datum')
        .eq('maskin_id', skotare[0].maskin_id)
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
      const currentQ = Math.floor(now.getMonth() / 3);
      const totalQ = now.getFullYear() * 4 + currentQ + offset;
      const year = Math.floor(totalQ / 4);
      const qIdx = ((totalQ % 4) + 4) % 4;
      const qs = new Date(year, qIdx * 3, 1);
      const qe = new Date(year, qIdx * 3 + 3, 0);
      return { startDate: fmt(qs), endDate: fmt(qe) };
    }
    if (p === 'Å') {
      const y = now.getFullYear() + offset;
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }
    const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { startDate: fmt(ms), endDate: fmt(me) };
  }

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
  const fetchDbData = useCallback(async (maskinId: string, p: 'V' | 'M' | 'K' | 'Å' = 'M', pOffset = 0) => {
    if (!maskinId) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getPeriodDates(p, pOffset);
      const maskinIds = [maskinId];

      // Skotare = FPR-data i fakt_lass (varje rad = ett lass)
      const rawProdData = await fetchAllRows(async (from, to) => {
        const res = await supabase.from('fakt_lass')
          .select('datum, volym_m3sub, operator_id, objekt_id, korstracka_m, lass_nummer')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate)
          .range(from, to);
        return res;
      });

      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const totalDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;
      const pad = (n: number) => String(n).padStart(2, '0');

      // Fetch time, operators, objects, shifts, avbrott
      const [tidRes, opRes, objRes, skiftRes, avbrottRes] = await Promise.all([
        supabase.from('fakt_tid')
          .select('datum, operator_id, objekt_id, processing_sek, terrain_sek, other_work_sek, kort_stopp_sek, disturbance_sek, rast_sek, engine_time_sek, terrain_korstracka_m, bransle_liter')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
        supabase.from('dim_operator').select('operator_id, operator_key, operator_namn, maskin_id').in('maskin_id', maskinIds),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer'),
        supabase.from('fakt_skift')
          .select('datum, inloggning_tid, utloggning_tid')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
        supabase.from('fakt_avbrott')
          .select('datum, kategori_kod, langd_sek')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
      ]);

      const operators = opRes.data || [];
      const objekter = objRes.data || [];
      const avbrottRows = avbrottRes.data || [];

      // Slå ihop operator_id:n som delar namn (dim_operator kan ha samma person
      // med flera id:n — fakt_lass och fakt_tid använder ofta olika id).
      const nameToCanonId: Record<string, string> = {};
      const idToCanon: Record<string, string> = {};
      for (const o of operators) {
        if (!o.operator_namn || !o.operator_id) continue;
        if (!nameToCanonId[o.operator_namn]) nameToCanonId[o.operator_namn] = o.operator_id;
        idToCanon[o.operator_id] = nameToCanonId[o.operator_namn];
      }
      const canonOp = (id: string | null | undefined): string => (id && idToCanon[id]) || id || '';

      if (rawProdData.length === 0 && (!tidRes.data || tidRes.data.length === 0)) {
        const emptyDays: string[] = [];
        const emptyDates: string[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(sDate); d.setDate(d.getDate() + i);
          emptyDays.push(`${d.getDate()}/${d.getMonth() + 1}`);
          emptyDates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        }
        const emptyData: DbData = {
          totalVolym: 0, totalLass: 0, medellast: 0, medelavstand: 0,
          g15Timmar: 0, lassPerG15h: 0, utnyttjandegrad: 0,
          bransleTotalt: 0, branslePerM3: 0,
          processingSek: 0, terrainSek: 0, kortStoppSek: 0,
          avbrottSek: 0, rastSek: 0, engineTimeSek: 0,
          dailyLass: new Array(totalDays).fill(0),
          dailyVol: new Array(totalDays).fill(0),
          days: emptyDays, dailyDates: emptyDates,
          operatorer: [], distClasses: [],
          dagData: {}, calendarDt: new Array(totalDays).fill(0),
          avbrottTotal: { timmar: 0, antal: 0, snittMin: 0 }, avbrottPerKategori: [],
          periodStartDate: startDate, totalDays,
        };
        (window as any).__skotareData = emptyData;
        setDataVersion(v => v + 1);
        setLoading(false);
        return;
      }

      // Consolidate fakt_tid rows per (datum, operator_id, objekt_id)
      const tidConsolidated: Record<string, any> = {};
      for (const r of (tidRes.data || [])) {
        const key = `${r.datum}|${r.operator_id || ''}|${r.objekt_id || ''}`;
        if (!tidConsolidated[key]) {
          tidConsolidated[key] = {
            datum: r.datum, operator_id: r.operator_id, objekt_id: r.objekt_id,
            processing_sek: 0, terrain_sek: 0, other_work_sek: 0,
            disturbance_sek: 0, kort_stopp_sek: 0,
            rast_sek: 0, engine_time_sek: 0, terrain_korstracka_m: 0,
            bransle_liter: 0, _distCount: 0,
          };
        }
        const c = tidConsolidated[key];
        c.processing_sek += r.processing_sek || 0;
        c.terrain_sek += r.terrain_sek || 0;
        c.other_work_sek += r.other_work_sek || 0;
        c.disturbance_sek += r.disturbance_sek || 0;
        c.kort_stopp_sek += r.kort_stopp_sek || 0;
        c.rast_sek += r.rast_sek || 0;
        c.engine_time_sek += r.engine_time_sek || 0;
        c.bransle_liter += parseFloat(r.bransle_liter) || 0;
        if (r.terrain_korstracka_m != null && r.terrain_korstracka_m > 0) {
          c.terrain_korstracka_m += r.terrain_korstracka_m;
          c._distCount += 1;
        }
      }
      const rawTidRows = Object.values(tidConsolidated);

      // ── Pre-aggregate lass per day and per operator ──
      type ProdAgg = { vol: number; lass: number; distSum: number; distCount: number };
      const prodByDay: Record<string, ProdAgg> = {};
      const prodByOp: Record<string, { vol: number; lass: number; distSum: number; distCount: number; dagar: Set<string>; dailyLass: Record<string, number>; dailyVol: Record<string, number> }> = {};

      // Global lass-distance totals
      let lassDistSum = 0, lassDistCount = 0;

      for (const r of rawProdData) {
        const d = r.datum;
        const dist = r.korstracka_m || 0;
        if (!prodByDay[d]) prodByDay[d] = { vol: 0, lass: 0, distSum: 0, distCount: 0 };
        prodByDay[d].vol += r.volym_m3sub || 0;
        prodByDay[d].lass += 1;
        if (dist > 0) { prodByDay[d].distSum += dist; prodByDay[d].distCount += 1; }

        if (dist > 0) { lassDistSum += dist; lassDistCount += 1; }

        const opId = canonOp(r.operator_id);
        if (opId) {
          if (!prodByOp[opId]) prodByOp[opId] = { vol: 0, lass: 0, distSum: 0, distCount: 0, dagar: new Set(), dailyLass: {}, dailyVol: {} };
          prodByOp[opId].vol += r.volym_m3sub || 0;
          prodByOp[opId].lass += 1;
          if (dist > 0) { prodByOp[opId].distSum += dist; prodByOp[opId].distCount += 1; }
          prodByOp[opId].dagar.add(d);
          prodByOp[opId].dailyLass[d] = (prodByOp[opId].dailyLass[d] || 0) + 1;
          prodByOp[opId].dailyVol[d] = (prodByOp[opId].dailyVol[d] || 0) + (r.volym_m3sub || 0);
        }
      }

      // ── Pre-aggregate tid ──
      type TidAgg = { processingSek: number; terrainSek: number; otherWorkSek: number; disturbanceSek: number; kortStoppSek: number; rastSek: number; engineTimeSek: number; bransleLiter: number; totalDist: number; distCount: number };
      const emptyTid = (): TidAgg => ({ processingSek: 0, terrainSek: 0, otherWorkSek: 0, disturbanceSek: 0, kortStoppSek: 0, rastSek: 0, engineTimeSek: 0, bransleLiter: 0, totalDist: 0, distCount: 0 });
      const addTid = (agg: TidAgg, r: any) => {
        agg.processingSek += r.processing_sek || 0;
        agg.terrainSek += r.terrain_sek || 0;
        agg.otherWorkSek += r.other_work_sek || 0;
        agg.disturbanceSek += r.disturbance_sek || 0;
        agg.kortStoppSek += r.kort_stopp_sek || 0;
        agg.rastSek += r.rast_sek || 0;
        agg.engineTimeSek += r.engine_time_sek || 0;
        agg.bransleLiter += r.bransle_liter || 0;
        if (r.terrain_korstracka_m > 0) {
          agg.totalDist += r.terrain_korstracka_m;
          agg.distCount += (r._distCount || 1);
        }
      };

      const tidTotal: TidAgg = emptyTid();
      const tidByDay: Record<string, TidAgg> = {};
      const tidByOp: Record<string, TidAgg> = {};

      for (const r of rawTidRows) {
        const d = r.datum;
        addTid(tidTotal, r);
        if (!tidByDay[d]) tidByDay[d] = emptyTid();
        addTid(tidByDay[d], r);
        const opId = canonOp(r.operator_id);
        if (opId) {
          if (!tidByOp[opId]) tidByOp[opId] = emptyTid();
          addTid(tidByOp[opId], r);
        }
      }

      // ── Distance classes from per-lass korstracka_m (fakt_lass) ──
      const prodByDistClass: Array<{ vol: number; lass: number; distSum: number }> =
        DIST_LABELS.map(() => ({ vol: 0, lass: 0, distSum: 0 }));
      const prodByOpDistClass: Record<string, Array<{ vol: number; lass: number; distSum: number }>> = {};

      const bucketForDist = (dist: number): number => {
        for (let i = 0; i < DIST_EDGES.length - 1; i++) {
          if (dist >= DIST_EDGES[i] && dist < DIST_EDGES[i + 1]) return i;
        }
        return -1;
      };

      for (const r of rawProdData) {
        const dist = r.korstracka_m || 0;
        const idx = bucketForDist(dist);
        if (idx < 0) continue;
        prodByDistClass[idx].vol += r.volym_m3sub || 0;
        prodByDistClass[idx].lass += 1;
        prodByDistClass[idx].distSum += dist;
        const opId = canonOp(r.operator_id);
        if (opId) {
          if (!prodByOpDistClass[opId]) {
            prodByOpDistClass[opId] = DIST_LABELS.map(() => ({ vol: 0, lass: 0, distSum: 0 }));
          }
          prodByOpDistClass[opId][idx].vol += r.volym_m3sub || 0;
          prodByOpDistClass[opId][idx].lass += 1;
          prodByOpDistClass[opId][idx].distSum += dist;
        }
      }

      // ── KPI totals ──
      const totalVolym = Object.values(prodByDay).reduce((s, d) => s + d.vol, 0);
      const totalLass = rawProdData.length;
      const medellast = totalLass > 0 ? parseFloat((totalVolym / totalLass).toFixed(1)) : 0;
      const processingSek = tidTotal.processingSek;
      const terrainSek = tidTotal.terrainSek;
      const g15Sek = processingSek + terrainSek;
      const g15Timmar = g15Sek / 3600;
      const lassPerG15h = g15Timmar > 0 ? parseFloat((totalLass / g15Timmar).toFixed(2)) : 0;
      const medelavstand = lassDistCount > 0 ? Math.round(lassDistSum / lassDistCount) : 0;
      const bransleTotalt = tidTotal.bransleLiter;
      const branslePerM3 = totalVolym > 0 ? parseFloat((bransleTotalt / totalVolym).toFixed(2)) : 0;
      const effG15h = (processingSek + terrainSek + tidTotal.kortStoppSek) / 3600;
      const engineH = tidTotal.engineTimeSek / 3600;
      const utnyttjandegrad = engineH > 0 ? parseFloat((effG15h / engineH * 100).toFixed(1)) : 0;

      // Avbrott
      const totalAvbrottSek = avbrottRows.reduce((s: number, r: any) => s + (r.langd_sek || 0), 0);
      const katAgg: Record<string, { sek: number; antal: number }> = {};
      for (const r of avbrottRows) {
        const kat = r.kategori_kod || 'Övrigt';
        if (!katAgg[kat]) katAgg[kat] = { sek: 0, antal: 0 };
        katAgg[kat].sek += r.langd_sek || 0;
        katAgg[kat].antal += 1;
      }
      const avbrottTotal = {
        timmar: parseFloat((totalAvbrottSek / 3600).toFixed(1)),
        antal: avbrottRows.length,
        snittMin: avbrottRows.length > 0 ? Math.round(totalAvbrottSek / avbrottRows.length / 60) : 0,
      };
      const avbrottPerKategori = Object.entries(katAgg)
        .map(([k, v]) => ({ kategori: k, timmar: parseFloat((v.sek / 3600).toFixed(1)), antal: v.antal, snittMin: v.antal > 0 ? Math.round(v.sek / v.antal / 60) : 0 }))
        .sort((a, b) => b.timmar - a.timmar);

      // ── Daily arrays ──
      const dailyLass: number[] = [];
      const dailyVol: number[] = [];
      const dayLabels: string[] = [];
      const dailyDates: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate); d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const p2 = prodByDay[dateStr];
        dailyLass.push(p2 ? p2.lass : 0);
        dailyVol.push(p2 ? Math.round(p2.vol) : 0);
        dayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
        dailyDates.push(dateStr);
      }

      // ── Operators ──
      const opIds = new Set<string>();
      for (const id of Object.keys(prodByOp)) opIds.add(id);
      for (const id of Object.keys(tidByOp)) opIds.add(id);

      const operatorer: OperatorData[] = Array.from(opIds).map(opId => {
        const pOp = prodByOp[opId];
        const tOp = tidByOp[opId] || emptyTid();
        const volym = pOp ? pOp.vol : 0;
        const lass = pOp ? pOp.lass : 0;
        const opG15sek = tOp.processingSek + tOp.terrainSek;
        const opG15h = opG15sek / 3600;
        const opMedellast = lass > 0 ? parseFloat((volym / lass).toFixed(1)) : 0;
        const opLassG15h = opG15h > 0 ? parseFloat((lass / opG15h).toFixed(2)) : 0;
        const opMedelavstand = pOp && pOp.distCount > 0 ? Math.round(pOp.distSum / pOp.distCount) : 0;
        const dagarSize = pOp ? pOp.dagar.size : 0;

        const opDailyLass: number[] = [];
        const opDailyVol: number[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(sDate); d.setDate(d.getDate() + i);
          const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          opDailyLass.push(pOp ? (pOp.dailyLass[dateStr] || 0) : 0);
          opDailyVol.push(pOp ? Math.round(pOp.dailyVol[dateStr] || 0) : 0);
        }

        const opInfo = operators.find((o: any) => String(o.operator_id) === String(opId));
        const namn = opInfo?.operator_namn || `Operatör ${opId}`;
        const nameParts = namn.split(' ');
        const initialer = nameParts.length >= 2
          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
          : namn.substring(0, 2).toUpperCase();

        const opEffG15h = (tOp.processingSek + tOp.terrainSek + tOp.kortStoppSek) / 3600;
        const opEngineH = tOp.engineTimeSek / 3600;
        const opUtnyttj = opEngineH > 0 ? parseFloat((opEffG15h / opEngineH * 100).toFixed(1)) : 0;

        // Per-distance-class data for this operator (från fakt_lass)
        const opClasses = prodByOpDistClass[opId] || DIST_LABELS.map(() => ({ vol: 0, lass: 0, distSum: 0 }));
        // Fördela operator-G15h + bränsle proportionellt mot lass-andel per klass
        const opTotLass = opClasses.reduce((s, c) => s + c.lass, 0);
        const opTotVol  = opClasses.reduce((s, c) => s + c.vol, 0);
        const opBransleTot = tOp.bransleLiter;
        const klassData: DistClassData[] = DIST_LABELS.map((label, ki) => {
          const c = opClasses[ki];
          const lassShare = opTotLass > 0 ? c.lass / opTotLass : 0;
          const volShare  = opTotVol  > 0 ? c.vol / opTotVol  : 0;
          const klassG15sek = opG15sek * lassShare;
          const klassBransle = opBransleTot * volShare;
          const klassG15h2 = klassG15sek / 3600;
          return {
            label,
            lass: c.lass,
            volym: Math.round(c.vol),
            g15h: parseFloat(klassG15h2.toFixed(1)),
            lassG15h: klassG15h2 > 0 ? parseFloat((c.lass / klassG15h2).toFixed(1)) : 0,
            medellast: c.lass > 0 ? parseFloat((c.vol / c.lass).toFixed(1)) : 0,
            dieselM3: c.vol > 0 ? parseFloat((klassBransle / c.vol).toFixed(2)) : 0,
          };
        });

        return {
          id: opId,
          key: opInfo?.operator_key || nameParts[0].toLowerCase(),
          namn, initialer,
          lass, volym, g15h: opG15h, medellast: opMedellast,
          lassG15h: opLassG15h, medelavstand: opMedelavstand,
          dagar: dagarSize,
          processingSek: tOp.processingSek, terrainSek: tOp.terrainSek,
          disturbanceSek: tOp.disturbanceSek, engineTimeSek: tOp.engineTimeSek,
          bransleLiter: tOp.bransleLiter,
          dailyLass: opDailyLass, dailyVol: opDailyVol,
          utnyttjandePct: opUtnyttj,
          klassData,
        };
      }).filter(o => o.volym > 0 || o.g15h > 0).sort((a, b) => b.volym - a.volym);

      // ── Distance classes (global) — G15h + bränsle proportionellt mot lass-andel ──
      const globTotLass = prodByDistClass.reduce((s, c) => s + c.lass, 0);
      const globTotVol  = prodByDistClass.reduce((s, c) => s + c.vol, 0);
      const globG15sek  = tidTotal.processingSek + tidTotal.terrainSek;
      const globBransle = tidTotal.bransleLiter;
      const distClasses: DistClassData[] = DIST_LABELS.map((label, i) => {
        const pdc = prodByDistClass[i];
        const lassShare = globTotLass > 0 ? pdc.lass / globTotLass : 0;
        const volShare  = globTotVol  > 0 ? pdc.vol / globTotVol : 0;
        const dcG15sek = globG15sek * lassShare;
        const dcBransle = globBransle * volShare;
        const dcG15h = dcG15sek / 3600;
        return {
          label,
          lass: pdc.lass,
          volym: Math.round(pdc.vol),
          g15h: parseFloat(dcG15h.toFixed(1)),
          lassG15h: dcG15h > 0 ? parseFloat((pdc.lass / dcG15h).toFixed(1)) : 0,
          medellast: pdc.lass > 0 ? parseFloat((pdc.vol / pdc.lass).toFixed(1)) : 0,
          dieselM3: pdc.vol > 0 ? parseFloat((dcBransle / pdc.vol).toFixed(2)) : 0,
        };
      });

      // ── DagData and calendar ──
      const skiftByDay: Record<string, { start: string; slut: string }> = {};
      for (const r of (skiftRes.data || [])) {
        if (!r.datum || !r.inloggning_tid || !r.utloggning_tid) continue;
        const login = r.inloggning_tid.substring(11, 16);
        const logout = r.utloggning_tid.substring(11, 16);
        if (!skiftByDay[r.datum]) {
          skiftByDay[r.datum] = { start: login, slut: logout };
        } else {
          if (login < skiftByDay[r.datum].start) skiftByDay[r.datum].start = login;
          if (logout > skiftByDay[r.datum].slut) skiftByDay[r.datum].slut = logout;
        }
      }

      const avbrottByDay: Record<string, Array<{ orsak: string; tid: string }>> = {};
      for (const r of avbrottRows) {
        const dateStr2 = r.datum;
        if (!avbrottByDay[dateStr2]) avbrottByDay[dateStr2] = [];
        const sek = r.langd_sek || 0;
        const min = Math.round(sek / 60);
        const tid = min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 > 0 ? (min % 60) + 'min' : ''}` : `${min} min`;
        avbrottByDay[dateStr2].push({ orsak: r.kategori_kod || 'Övrigt', tid });
      }

      const dagData: DbData['dagData'] = {};
      const calendarDt: number[] = new Array(totalDays).fill(0);

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate); d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const pDay = prodByDay[dateStr];
        const tDay = tidByDay[dateStr];
        if (pDay && pDay.lass > 0) {
          const dayNum = i + 1;
          const dg15sek = tDay ? tDay.processingSek + tDay.terrainSek : 0;
          const dg15h = dg15sek / 3600;
          const diesel = tDay ? tDay.bransleLiter : 0;
          const dayAvgDist = pDay.distCount > 0 ? Math.round(pDay.distSum / pDay.distCount) : 0;
          const dayProdRow = rawProdData.find((r: any) => r.datum === dateStr);
          const opInfo2 = dayProdRow?.operator_id ? operators.find((o: any) => String(o.operator_id) === String(dayProdRow.operator_id)) : null;
          const objInfo = dayProdRow?.objekt_id ? objekter.find((o: any) => String(o.objekt_id) === String(dayProdRow.objekt_id)) : null;

          dagData[dayNum] = {
            typ: 1,
            forare: opInfo2?.operator_namn || '\u2013',
            objekt: objInfo?.object_name || '\u2013',
            start: skiftByDay[dateStr]?.start || '\u2013',
            slut: skiftByDay[dateStr]?.slut || '\u2013',
            lass: pDay.lass,
            volym: Math.round(pDay.vol),
            g15: parseFloat(dg15h.toFixed(1)),
            medellast: pDay.lass > 0 ? parseFloat((pDay.vol / pDay.lass).toFixed(1)) : 0,
            medelavstand: dayAvgDist,
            diesel: pDay.vol > 0 ? parseFloat((diesel / pDay.vol).toFixed(1)) : 0,
            avbrott: avbrottByDay[dateStr] || [],
          };
          calendarDt[i] = 1;
        }
      }

      const dbData: DbData = {
        totalVolym: Math.round(totalVolym), totalLass, medellast, medelavstand,
        g15Timmar: parseFloat(g15Timmar.toFixed(1)), lassPerG15h, utnyttjandegrad,
        bransleTotalt: Math.round(bransleTotalt), branslePerM3,
        processingSek, terrainSek,
        kortStoppSek: tidTotal.kortStoppSek,
        avbrottSek: totalAvbrottSek,
        rastSek: tidTotal.rastSek,
        engineTimeSek: tidTotal.engineTimeSek,
        dailyLass, dailyVol, days: dayLabels, dailyDates,
        operatorer, distClasses,
        dagData, calendarDt,
        avbrottTotal, avbrottPerKategori,
        periodStartDate: startDate, totalDays,
      };

      (window as any).__skotareData = dbData;
      setDataVersion(v => v + 1);
    } catch (err) {
      console.error('[Skotare] fetchDbData error:', err);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load data on machine/period change ──
  useEffect(() => {
    const m = maskiner.find(x => x.modell === vald);
    if (m) fetchDbData(m.maskin_id, period, periodOffset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vald, period, periodOffset, maskiner]);

  // ── Fetch Idag data ──
  useEffect(() => {
    if (activeView !== 'idag' || maskiner.length === 0) return;
    const m = maskiner.find(x => x.modell === vald);
    if (!m) return;
    setIdagLoading(true);
    (async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const maskinIds = [m.maskin_id];
        const pad2 = (n: number) => String(n).padStart(2, '0');

        const [prodRes2, tidRes2, opRes2, objRes2, skiftRes2, senastRes] = await Promise.all([
          supabase.from('fakt_lass')
            .select('datum, volym_m3sub, operator_id, objekt_id, korstracka_m')
            .in('maskin_id', maskinIds).eq('datum', today),
          supabase.from('fakt_tid')
            .select('datum, operator_id, processing_sek, terrain_sek, other_work_sek, kort_stopp_sek, engine_time_sek, bransle_liter')
            .in('maskin_id', maskinIds).eq('datum', today),
          supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', maskinIds),
          supabase.from('dim_objekt').select('objekt_id, object_name'),
          supabase.from('fakt_skift')
            .select('datum, inloggning_tid')
            .in('maskin_id', maskinIds).eq('datum', today),
          supabase.from('fakt_lass')
            .select('datum')
            .in('maskin_id', maskinIds)
            .order('datum', { ascending: false })
            .limit(1),
        ]);

        const todayProd = prodRes2.data || [];
        const todayTid = tidRes2.data || [];
        const opNameMap: Record<string, string> = {};
        for (const o of (opRes2.data || [])) opNameMap[o.operator_id] = o.operator_namn;
        // Slå ihop operator_id:n som delar namn
        const nameToId2: Record<string, string> = {};
        const idToCanon2: Record<string, string> = {};
        for (const o of (opRes2.data || [])) {
          if (!o.operator_namn || !o.operator_id) continue;
          if (!nameToId2[o.operator_namn]) nameToId2[o.operator_namn] = o.operator_id;
          idToCanon2[o.operator_id] = nameToId2[o.operator_namn];
        }
        const canonOp2 = (id: string | null | undefined): string => (id && idToCanon2[id]) || id || '';
        const objNameMap: Record<string, string> = {};
        for (const o of (objRes2.data || [])) objNameMap[o.objekt_id] = o.object_name;

        const todayVol = todayProd.reduce((s: number, r: any) => s + (r.volym_m3sub || 0), 0);
        const todayLass = todayProd.length;
        const procSek = todayTid.reduce((s: number, r: any) => s + (r.processing_sek || 0), 0);
        const terrSek2 = todayTid.reduce((s: number, r: any) => s + (r.terrain_sek || 0), 0);
        const kortSek = todayTid.reduce((s: number, r: any) => s + (r.kort_stopp_sek || 0), 0);
        const engineSek2 = todayTid.reduce((s: number, r: any) => s + (r.engine_time_sek || 0), 0);
        const bransleTot = todayTid.reduce((s: number, r: any) => s + parseFloat(r.bransle_liter || 0), 0);
        const totalDistT = todayProd.reduce((s: number, r: any) => s + (r.korstracka_m || 0), 0);
        const distCountT = todayProd.filter((r: any) => r.korstracka_m > 0).length;
        const g15sek2 = procSek + terrSek2;
        const g15h2 = g15sek2 / 3600;
        const effG15h2 = (procSek + terrSek2 + kortSek) / 3600;
        const engineH2 = engineSek2 / 3600;
        const utnyttj2 = engineH2 > 0 ? parseFloat((effG15h2 / engineH2 * 100).toFixed(1)) : 0;

        const opAgg: Record<string, { lass: number; vol: number; objekt: string }> = {};
        for (const r of todayProd) {
          const opId = canonOp2(r.operator_id);
          if (!opId) continue;
          if (!opAgg[opId]) opAgg[opId] = { lass: 0, vol: 0, objekt: objNameMap[r.objekt_id] || '' };
          opAgg[opId].lass += 1;
          opAgg[opId].vol += r.volym_m3sub || 0;
        }
        const opList = Object.entries(opAgg).map(([opId, d2]) => {
          const skift = (skiftRes2.data || []).find((s: any) => s.datum === today);
          return {
            namn: opNameMap[opId] || opId,
            objekt: d2.objekt,
            start: skift?.inloggning_tid?.substring(11, 16) || '\u2013',
            lass: d2.lass,
            vol: Math.round(d2.vol),
          };
        }).sort((a, b) => b.vol - a.vol);

        const senastAktivDatum: string | null = (senastRes.data && senastRes.data[0]?.datum) || null;
        let senastAktivTid: string | null = null;
        if (senastAktivDatum) {
          const { data: sRows } = await supabase
            .from('fakt_skift').select('inloggning_tid')
            .in('maskin_id', maskinIds).eq('datum', senastAktivDatum)
            .order('inloggning_tid', { ascending: false }).limit(1);
          const rawTid2 = sRows?.[0]?.inloggning_tid;
          if (rawTid2 && typeof rawTid2 === 'string') {
            senastAktivTid = rawTid2.length >= 16 ? rawTid2.substring(11, 16) : rawTid2.substring(0, 5);
          }
        }

        setIdagData({
          vol: Math.round(todayVol), lass: todayLass,
          g15h: parseFloat(g15h2.toFixed(1)),
          medellast: todayLass > 0 ? parseFloat((todayVol / todayLass).toFixed(1)) : 0,
          medelavstand: distCountT > 0 ? Math.round(totalDistT / distCountT) : 0,
          utnyttj: utnyttj2,
          bransle: Math.round(bransleTot),
          bransleLm3: todayVol > 0 ? parseFloat((bransleTot / todayVol).toFixed(1)) : 0,
          lassG15h: g15h2 > 0 ? parseFloat((todayLass / g15h2).toFixed(1)) : 0,
          operatorer: opList,
          senastAktiv: senastAktivDatum ? { datum: senastAktivDatum, tid: senastAktivTid } : null,
        });
      } catch (err) { console.error('Idag fetch error', err); }
      setIdagLoading(false);
    })();
  }, [activeView, maskiner, vald]);

  // ── Expose dag opener to script ──
  useEffect(() => {
    (window as any).__skotareOpenDag = (dayNum: number) => {
      const db = (window as any).__skotareData as DbData | undefined;
      if (!db?.dagData[dayNum]) return;
      setPanelDag({ dayNum, entry: db.dagData[dayNum] });
      setPanelType('dag');
      setOverlayOpen(true);
    };
    return () => { delete (window as any).__skotareOpenDag; };
  }, []);

  // ── Attach click handlers to operator rows (rendered by script) ──
  useEffect(() => {
    if (dataVersion === 0) return;
    const timer = setTimeout(() => {
      const container = document.getElementById('opContainer');
      if (!container) return;
      const rows = container.querySelectorAll('.op-clickable');
      rows.forEach(row => {
        const key = row.getAttribute('data-op-key');
        row.addEventListener('click', () => {
          const db = (window as any).__skotareData as DbData | undefined;
          if (!db) return;
          const op = db.operatorer.find(o => o.key === key);
          if (op) {
            setPanelOperator(op);
            setPanelType('operator');
            setOverlayOpen(true);
          }
        });
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [dataVersion]);

  // ── Re-initialize charts when data or view changes ──
  useEffect(() => {
    if (dataVersion === 0) return;

    let scriptEl: HTMLScriptElement | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;

    function destroyCharts() {
      if (typeof window !== 'undefined' && (window as any).Chart) {
        document.querySelectorAll('canvas:not(#avbrottCanvas)').forEach((c) => {
          const chart = (window as any).Chart.getChart(c as HTMLCanvasElement);
          if (chart) chart.destroy();
        });
      }
      document.querySelectorAll('script[data-skotare]').forEach(el => el.remove());
    }

    function runScript() {
      timer = setTimeout(() => {
        const dailyEl = document.getElementById('dailyChart');
        if (!dailyEl) {
          if (retries++ < 20) timer = setTimeout(runScript, 200);
          return;
        }
        destroyCharts();
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-skotare', 'true');
        scriptEl.textContent = SKOTARE_SCRIPT;
        document.body.appendChild(scriptEl);
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

  // ── Avbrott chart ──
  useEffect(() => {
    if (activeView !== 'avbrott' || dataVersion === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    function initAvbrott() {
      const Chart = (window as any).Chart;
      const canvas = document.getElementById('avbrottCanvas') as HTMLCanvasElement | null;
      if (!Chart || !canvas) { timer = setTimeout(initAvbrott, 200); return; }
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      const db = (window as any).__skotareData as DbData | undefined;
      const pk = db?.avbrottPerKategori || [];
      if (pk.length === 0) return;
      const palette = ['rgba(90,255,140,0.7)', 'rgba(90,255,140,0.55)', 'rgba(90,255,140,0.4)', 'rgba(90,255,140,0.28)', 'rgba(90,255,140,0.18)', 'rgba(90,255,140,0.1)'];
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: pk.map((k: any) => k.kategori),
          datasets: [{ data: pk.map((k: any) => k.timmar), backgroundColor: pk.map((_: any, i: number) => palette[i % palette.length]), borderRadius: 4 }],
        },
        options: {
          indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } }, title: { display: true, text: 'timmar', color: '#7a7a72', font: { size: 11 } } },
            y: { grid: { display: false }, ticks: { color: '#e8e8e4', font: { size: 11 } } },
          },
        },
      });
    }
    timer = setTimeout(initAvbrott, 800);
    return () => { if (timer) clearTimeout(timer); };
  }, [activeView, dataVersion]);

  // ── Operator panel chart ──
  const opChartRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !panelOperator) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const activeKlass = panelOperator.klassData.filter(k => k.lass > 0 || k.volym > 0);
    if (activeKlass.length === 0) return;
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: activeKlass.map(k => k.label),
        datasets: [
          { label: 'Lass/G15h', data: activeKlass.map(k => k.lassG15h), backgroundColor: 'rgba(90,255,140,0.5)', borderRadius: 3, yAxisID: 'y', order: 1 },
          { label: 'Medellast', data: activeKlass.map(k => k.medellast), type: 'line', borderColor: 'rgba(91,143,255,0.6)', pointBackgroundColor: '#5b8fff', pointRadius: 3, tension: 0.3, yAxisID: 'y2', order: 0 },
        ],
      },
      options: {
        responsive: true, interaction: { mode: 'index' as const, intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } }, title: { display: true, text: 'Lass/G15h', color: '#7a7a72', font: { size: 10 } } },
          y2: { position: 'right' as const, grid: { drawOnChartArea: false }, ticks: { color: '#5b8fff', font: { size: 11 } }, title: { display: true, text: 'm³/lass', color: '#5b8fff', font: { size: 10 } } },
        },
      },
    });
  }, [panelOperator]);

  const valdMaskin = maskiner.find(m => m.modell === vald);
  const dbData = (typeof window !== 'undefined' ? (window as any).__skotareData : null) as DbData | null;

  function closePanel() {
    setOverlayOpen(false);
    setPanelType(null);
    setPanelOperator(null);
    setPanelDag(null);
  }

  // ── SVG Icons for bottom nav ──
  const navIcons: Record<string, JSX.Element> = {
    idag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    oversikt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    produktion: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    avbrott: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    analys: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  };

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, display: 'flex', zIndex: 1 }}>
      <style dangerouslySetInnerHTML={{ __html: `
:root {
  --bg: #111110; --surface: #1a1a18; --surface2: #222220;
  --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.12);
  --text: #e8e8e4; --muted: #7a7a72; --dim: #3a3a36;
  --accent: #00c48c; --accent2: #1a4a2e;
  --warn: #ffb340; --danger: #ff5f57; --blue: #5b8fff;
}
.hero { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.hero-main { background: #161614; border: 1px solid var(--border); border-radius: 16px; padding: 20px; min-height: 100px; position: relative; overflow: hidden; }
.hero-label { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: #666; margin-bottom: 8px; }
.hero-val { font-family: 'Geist', system-ui, sans-serif; font-size: 32px; line-height: 1; font-weight: 500; letter-spacing: -1px; color: var(--text); margin-bottom: 4px; }
.hero-unit { font-size: 12px; color: #888; font-weight: 400; }
.kpi { background: #161614; border: 1px solid var(--border); border-radius: 16px; padding: 20px; min-height: 100px; position: relative; overflow: hidden; transition: border-color 0.2s; }
.kpi:hover { border-color: var(--border2); }
.k-label { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: #666; margin-bottom: 8px; }
.k-val { font-family: 'Geist', system-ui, sans-serif; font-size: 32px; line-height: 1; font-weight: 500; letter-spacing: -1px; color: var(--text); margin-bottom: 4px; }
.k-unit { font-size: 12px; color: #888; }
.card { background: #161614; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; overflow: hidden; transition: border-color 0.2s; }
.card:hover { border-color: var(--border2); }
.card-h { padding: 20px 24px 0; display: flex; align-items: center; justify-content: space-between; }
.card-t { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: #666; }
.card-b { padding: 16px 24px 24px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.gf { margin-bottom: 16px; }
.op-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.op-row:last-child { border-bottom: none; padding-bottom: 0; }
.op-row:first-child { padding-top: 0; }
.op-av { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; }
.op-name { font-size: 13px; font-weight: 500; }
.op-sub { font-size: 11px; color: var(--muted); }
.op-info { flex: 1; }
.op-stats { display: flex; gap: 16px; }
.op-sv { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
.op-sl { font-size: 10px; color: var(--muted); }
.op-clickable { cursor: pointer; transition: background 0.15s; border-radius: 8px; margin: 0 -8px; padding-left: 8px; padding-right: 8px; }
.op-clickable:hover { background: rgba(255,255,255,0.04); }
.tbar { display: flex; height: 18px; border-radius: 5px; overflow: hidden; gap: 2px; margin-bottom: 14px; }
.tseg { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 500; }
.tleg { display: flex; flex-wrap: wrap; gap: 10px; }
.tli { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
.tld { width: 6px; height: 6px; border-radius: 2px; }
.cal-names { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-bottom: 5px; }
.cal-dn { text-align: center; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dim); padding-bottom: 3px; }
.cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
.cal-cell { aspect-ratio: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; cursor: default; transition: transform 0.1s; }
.cal-cell:hover { transform: scale(1.1); }
.c-prod { background: rgba(90,255,140,0.18); color: rgba(255,255,255,0.9); cursor: pointer; }
.c-flytt { background: rgba(91,143,255,0.18); color: rgba(255,255,255,0.9); cursor: pointer; }
.c-service { background: rgba(255,179,64,0.15); color: var(--warn); cursor: pointer; }
.c-off { background: rgba(255,255,255,0.03); color: var(--dim); }
.cal-sum { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-top: 12px; }
.cal-si { background: var(--surface2); border-radius: 8px; padding: 10px 8px; text-align: center; }
.cal-sn { font-family: 'Geist', system-ui, sans-serif; font-size: 20px; font-weight: 500; line-height: 1; }
.cal-sl { font-size: 9px; letter-spacing: 0.2px; color: var(--muted); margin-top: 3px; }
.prog { height: 6px; background: var(--dim); border-radius: 3px; overflow: hidden; margin-top: 5px; }
.pf { height: 100%; border-radius: 2px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }
.forar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 500; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
.forar-overlay.open { opacity: 1; pointer-events: all; }
.forar-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: var(--surface); border-left: 1px solid var(--border2); z-index: 501; overflow-y: auto; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); }
.forar-panel.open { transform: translateX(0); }
.forar-head { position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border); padding: 18px 24px; display: flex; align-items: center; gap: 14px; z-index: 10; }
.forar-av { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.07); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.7); flex-shrink: 0; }
.forar-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500; }
.forar-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
.forar-close { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.07); border: none; cursor: pointer; color: var(--muted); font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
.forar-close:hover { background: rgba(255,255,255,0.12); color: var(--text); }
.forar-body { padding: 20px 24px 40px; }
.forar-kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 20px; }
.fkpi { background: #161614; border-radius: 10px; padding: 14px 12px; text-align: center; }
.fkpi-v { font-family: 'Geist', system-ui, sans-serif; font-size: 22px; font-weight: 500; line-height: 1; color: var(--text); }
.fkpi-l { font-size: 9px; letter-spacing: 0.2px; color: var(--muted); margin-top: 4px; }
.fsec-title { font-size: 10px; font-weight: 500; letter-spacing: 0.2px; color: var(--muted); margin-bottom: 10px; }
.fsec { margin-bottom: 20px; }
.frow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.frow:last-child { border-bottom: none; }
.frow-l { color: var(--muted); }
.frow-v { font-weight: 500; font-variant-numeric: tabular-nums; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
.mv-bottomnav { display: none; }
@media (max-width: 768px) {
  .mv-sidebar { display: none !important; }
  .mv-bottomnav {
    display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
    background: #111110; border-top: 0.5px solid rgba(255,255,255,0.07);
    z-index: 200; justify-content: space-around; align-items: flex-start;
    padding: 10px 4px 16px 4px; padding-bottom: max(16px, env(safe-area-inset-bottom));
    font-family: 'Geist', system-ui, sans-serif;
  }
  .mv-bottomnav button { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0; background: none; border: none; cursor: pointer; padding: 0; min-height: 44px; color: #7a7a72; transition: color 0.15s; }
  .mv-bottomnav button.active { color: #5aff8c; }
  .mv-bn-icon-wrap { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 12px; padding: 6px; transition: background 0.15s; }
  .mv-bottomnav button.active .mv-bn-icon-wrap { background: rgba(90,255,140,0.1); }
  .mv-bn-icon-wrap svg { width: 24px; height: 24px; }
  .mv-bn-label { font-size: 10px; font-weight: 500; letter-spacing: 0.3px; margin-top: 2px; }
  .mv-topbar { flex-wrap: wrap !important; gap: 8px !important; padding: 8px 12px !important; }
  .page { padding-left: 12px !important; padding-right: 12px !important; padding-bottom: 72px !important; }
  .mv-scroll { padding-bottom: 64px; }
  .hero { grid-template-columns: repeat(2, 1fr) !important; }
  .g2 { grid-template-columns: 1fr !important; }
  .forar-panel { width: 100% !important; }
}
` }} />

      {/* Loading overlay */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(15,15,14,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#7a7a72', fontSize: 14, fontFamily: "'Geist', system-ui, sans-serif" }}>Laddar data...</div>
        </div>
      )}

      {/* ── SIDEBAR ── */}
      <aside className="mv-sidebar" style={{
        width: 220, flexShrink: 0, background: '#0f0f0e', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', fontFamily: "'Geist', system-ui, sans-serif", overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a4a2e', border: '1px solid rgba(90,255,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🌲</div>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#e8e8e4', letterSpacing: '-0.3px' }}>Skotare</span>
        </div>
        <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { icon: '\u2600', label: 'Idag', view: 'idag' },
            { icon: '\u25fb', label: 'Översikt', view: 'oversikt' },
            { icon: '\u25a4', label: 'Produktion', view: 'produktion' },
            { icon: '\u26a0', label: 'Avbrott', view: 'avbrott' },
            { icon: '\u25c8', label: 'Analys', view: 'analys' },
            { icon: '\ud83d\udd27', label: 'Maskinlogg', view: 'maskinlogg' },
          ].map(item => {
            const isActive = activeView === item.view;
            return (
              <div key={item.label} onClick={() => {
                if (item.view === 'maskinlogg') { (window as any).__openMaskinLogg?.(); return; }
                setActiveView(item.view);
              }} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                background: isActive ? '#1e1e1c' : 'transparent',
                borderLeft: isActive ? '3px solid #00c48c' : '3px solid transparent',
                color: isActive ? '#e8e8e4' : '#666', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', opacity: isActive ? 1 : 0.5 }}>{item.icon}</span>
                {item.label}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', background: '#111110', display: 'flex', flexDirection: 'column' }}>
        {/* ── TOP BAR ── */}
        <div className="mv-topbar" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0f0f0e',
          fontFamily: "'Geist', system-ui, sans-serif", flexShrink: 0,
        }}>
          {/* Machine dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMaskinOpen(!maskinOpen)} style={{
              background: '#1a1a18', color: '#e8e8e4',
              border: maskinOpen ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500,
              fontFamily: "'Geist', system-ui, sans-serif", outline: 'none', cursor: 'pointer',
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}>
              <span>{valdMaskin ? `${valdMaskin.tillverkare} ${vald}` : 'Välj maskin...'}</span>
              <span style={{ fontSize: 9, color: '#555', transform: maskinOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>{'\u25bc'}</span>
            </button>
            {maskinOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                background: '#1a1a18', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, overflow: 'hidden', zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 240, overflowY: 'auto', minWidth: '100%',
              }}>
                {maskiner.map((m, i) => (
                  <button key={m.maskin_id} onClick={() => { setVald(m.modell); setMaskinOpen(false); }} style={{
                    width: '100%', padding: '9px 12px', border: 'none',
                    borderBottom: i < maskiner.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: m.modell === vald ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: m.modell === vald ? '#e8e8e4' : '#999', fontSize: 12,
                    fontFamily: "'Geist', system-ui, sans-serif", cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {m.tillverkare} {m.modell}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Period navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <button onClick={() => setPeriodOffset(o => o - 1)} style={{
              width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent',
              color: '#7a7a72', fontSize: 14, cursor: 'pointer', fontFamily: "'Geist', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{'\u2039'}</button>
            <div style={{ minWidth: 90, textAlign: 'center', fontSize: 12, fontWeight: 500, color: '#e8e8e4', letterSpacing: '-0.2px' }}>
              {getPeriodLabel(period, periodOffset)}
            </div>
            <button onClick={() => setPeriodOffset(o => Math.min(o + 1, 0))} style={{
              width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent',
              color: periodOffset >= 0 ? '#333' : '#7a7a72', fontSize: 14,
              cursor: periodOffset >= 0 ? 'default' : 'pointer',
              fontFamily: "'Geist', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{'\u203a'}</button>
          </div>

          {/* Period type */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
            {(['V', 'M', 'K', 'Å'] as const).map((p) => (
              <button key={p} onClick={() => { setPeriod(p); setPeriodOffset(0); }} style={{
                padding: '4px 10px', border: 'none', borderRadius: 5,
                background: period === p ? '#1e1e1c' : 'transparent',
                color: period === p ? '#e8e8e4' : '#555', fontSize: 11, fontWeight: 500,
                cursor: 'pointer', fontFamily: "'Geist', system-ui, sans-serif",
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* ── SCROLLABLE CONTENT ── */}
        <div className="mv-scroll" style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>

          {/* ── IDAG VIEW ── */}
          {activeView === 'idag' && (() => {
            const d = idagData;
            if (idagLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#7a7a72' }}>Laddar...</div>;
            if (!d) return <div style={{ padding: 40, textAlign: 'center', color: '#7a7a72' }}>Ingen data</div>;
            const noProduction = d.vol === 0 && d.lass === 0;
            return (
              <div style={{ padding: '0 20px 60px', maxWidth: 900, fontFamily: "'Geist', system-ui, sans-serif" }}>
                {noProduction ? (<>
                  <div style={{ fontSize: 20, fontWeight: 500, color: '#e8e8e4', letterSpacing: -0.5, marginTop: 24, marginBottom: 20 }}>Idag</div>
                  <div style={{ textAlign: 'center', padding: '48px 20px', background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>{'\u2600'}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: '#e8e8e4', marginBottom: 6 }}>Ingen produktion registrerad idag</div>
                    {d.senastAktiv && (() => {
                      const [yy, mm, dd2] = d.senastAktiv.datum.split('-').map(Number);
                      const dObj = new Date(yy, mm - 1, dd2);
                      const datumStr = dObj.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
                      const tidStr = d.senastAktiv.tid ? `, kl ${d.senastAktiv.tid}` : '';
                      return <div style={{ fontSize: 13, color: '#7a7a72', marginTop: 8 }}>Senast aktiv: {datumStr}{tidStr}</div>;
                    })()}
                  </div>
                </>) : (<>
                  {/* KPI ROW 1 */}
                  <div className="hero" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 16 }}>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Volym</div>
                      <div className="k-val">{d.vol.toLocaleString('sv')}</div>
                      <div className="k-unit">m³sub</div>
                    </div>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Lass</div>
                      <div className="k-val">{d.lass}</div>
                      <div className="k-unit">st</div>
                    </div>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Medellast</div>
                      <div className="k-val">{d.medellast.toFixed(1)}</div>
                      <div className="k-unit">m³/lass</div>
                    </div>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Medelavstånd</div>
                      <div className="k-val">{d.medelavstand}</div>
                      <div className="k-unit">m</div>
                    </div>
                  </div>
                  {/* KPI ROW 2 */}
                  <div className="hero" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 8 }}>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Utnyttjandegrad</div>
                      <div className="k-val">{d.utnyttj.toFixed(1)}</div>
                      <div className="k-unit">%</div>
                    </div>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Bränsle totalt</div>
                      <div className="k-val">{d.bransle}</div>
                      <div className="k-unit">liter</div>
                    </div>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Bränsle/m³</div>
                      <div className="k-val">{d.bransleLm3.toFixed(1)}</div>
                      <div className="k-unit">L/m³</div>
                    </div>
                    <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                      <div className="k-label">Lass/G15h</div>
                      <div className="k-val">{d.lassG15h.toFixed(1)}</div>
                      <div className="k-unit">lass/h</div>
                    </div>
                  </div>

                  {/* Aktiv förare & objekt */}
                  {d.operatorer.length > 0 && (
                    <div className="card" style={{ marginTop: 16 }}>
                      <div className="card-h"><div className="card-t">Just nu</div></div>
                      <div className="card-b">
                        {d.operatorer.map((op, oi) => (
                          <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(90,255,140,0.1)', border: '1px solid rgba(90,255,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: 'rgba(90,255,140,0.8)', flexShrink: 0 }}>
                              {op.namn.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e8e4' }}>{op.namn}</div>
                              <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{op.objekt} · start {op.start}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 17, fontWeight: 500, color: '#e8e8e4' }}>{op.vol} m³</div>
                              <div style={{ fontSize: 10, color: '#7a7a72' }}>{op.lass} lass</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>)}
              </div>
            );
          })()}

          {/* ── OVERSIKT VIEW ── */}
          {activeView === 'oversikt' && (
            <div style={{ padding: '24px 28px 60px', maxWidth: 1400, margin: '0 auto', fontFamily: "'Geist', system-ui, sans-serif" }}>
              {/* KPI ROW 1: Skotad volym (hero, span 2) + Antal lass + Medellast */}
              <div className="hero" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="hero-main" style={{ gridColumn: 'span 2', background: 'rgba(255,255,255,0.06)' }}>
                  <div className="hero-label">Skotad volym</div>
                  <div className="hero-val" id="hv" style={{ fontSize: 48 }}>0</div>
                  <div className="hero-unit">m³sub</div>
                </div>
                <div className="kpi"><div className="k-label">Antal lass</div><div className="k-val" data-count="0" data-dec="0">0</div><div className="k-unit">st</div></div>
                <div className="kpi"><div className="k-label">Medellast</div><div className="k-val" data-count="0" data-dec="1">0</div><div className="k-unit">m³/lass</div></div>
              </div>
              {/* KPI ROW 2: Lass/G15h (hero, span 2) + Utnyttjandegrad + Bränsle totalt */}
              <div className="hero" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: -8 }}>
                <div className="kpi" style={{ gridColumn: 'span 2', background: 'rgba(255,255,255,0.06)' }}>
                  <div className="k-label">Lass/G15h</div>
                  <div className="k-val" data-count="0" data-dec="1" style={{ fontSize: 48 }}>0</div>
                  <div className="k-unit">lass/h</div>
                </div>
                <div className="kpi"><div className="k-label">Utnyttjandegrad</div><div className="k-val" data-count="0" data-dec="1">0</div><div className="k-unit">%</div></div>
                <div className="kpi"><div className="k-label">Bränsle totalt</div><div className="k-val" data-count="0" data-dec="0">0</div><div className="k-unit">liter</div></div>
              </div>
              {/* KPI ROW 3: Bränsle/m³ + Medelavstånd + G15-timmar */}
              <div className="hero" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: -8 }}>
                <div className="kpi"><div className="k-label">Bränsle/m³</div><div className="k-val" data-count="0" data-dec="2">0</div><div className="k-unit">L/m³</div></div>
                <div className="kpi"><div className="k-label">Medelavstånd</div><div className="k-val" data-count="0" data-dec="0">0</div><div className="k-unit">m</div></div>
                <div className="kpi"><div className="k-label">G15-timmar</div><div className="k-val" data-count="0" data-dec="0">0</div><div className="k-unit">h</div></div>
              </div>

              {/* Operators + Time distribution */}
              <div className="g2">
                <div className="card">
                  <div className="card-h"><div className="card-t">Operatörer <span id="opBadge" style={{ color: '#7a7a72', fontWeight: 400 }}></span></div></div>
                  <div className="card-b"><div id="opContainer"></div></div>
                </div>
                <div className="card">
                  <div className="card-h">
                    <div className="card-t">Tidsfördelning</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span id="tidG15Val" style={{ fontSize: 11, color: '#e8e8e4' }}>0h</span>
                      <span style={{ fontSize: 10, color: '#7a7a72' }}>G15</span>
                      <span id="tidAvbrVal" style={{ fontSize: 11, color: '#ffb340' }}>0h</span>
                      <span style={{ fontSize: 10, color: '#7a7a72' }}>avbrott</span>
                    </div>
                  </div>
                  <div className="card-b">
                    <div className="tbar">
                      <div className="tseg" style={{ flex: 1, background: 'rgba(255,255,255,0.3)' }}></div>
                      <div className="tseg" style={{ flex: 0, background: 'rgba(255,255,255,0.2)' }}></div>
                      <div className="tseg" style={{ flex: 0, background: 'rgba(91,143,255,0.35)' }}></div>
                      <div className="tseg" style={{ flex: 0, background: 'rgba(255,255,255,0.1)' }}></div>
                      <div className="tseg" style={{ flex: 0, background: 'rgba(255,255,255,0.1)' }}></div>
                    </div>
                    <div className="tleg">
                      <div className="tli"><div className="tld" style={{ background: 'rgba(255,255,255,0.3)' }}></div>Lastar/lossar 0%</div>
                      <div className="tli"><div className="tld" style={{ background: 'rgba(255,255,255,0.2)' }}></div>Kör 0%</div>
                      <div className="tli"><div className="tld" style={{ background: 'rgba(91,143,255,0.35)' }}></div>Korta stopp 0%</div>
                      <div className="tli"><div className="tld" style={{ background: 'rgba(255,255,255,0.1)' }}></div>Avbrott 0%</div>
                      <div className="tli"><div className="tld" style={{ background: 'rgba(255,255,255,0.1)' }}></div>Rast 0%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily production chart */}
              <div className="card gf">
                <div className="card-h"><div className="card-t" id="dailyChartTitle">Daglig produktion</div></div>
                <div className="card-b"><canvas id="dailyChart"></canvas></div>
              </div>

              {/* Calendar */}
              <div className="card gf">
                <div className="card-h"><div className="card-t" id="calTitle">Kalender</div></div>
                <div className="card-b">
                  <div className="cal-names">
                    {['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(d2 => <div key={d2} className="cal-dn">{d2}</div>)}
                  </div>
                  <div className="cal-grid" id="calGrid"></div>
                  <div className="cal-sum" id="calSummary"></div>
                </div>
              </div>

              {/* Distance class charts */}
              <div className="g2">
                <div className="card"><div className="card-h"><div className="card-t">Medellast per avståndsklass</div></div><div className="card-b"><canvas id="medellastChart"></canvas></div></div>
                <div className="card"><div className="card-h"><div className="card-t">Produktion per avståndsklass</div></div><div className="card-b"><canvas id="totalChart"></canvas></div></div>
              </div>
              <div className="g2">
                <div className="card"><div className="card-h"><div className="card-t">Diesel per avståndsklass</div></div><div className="card-b"><canvas id="dieselChart"></canvas></div></div>
                <div className="card"><div className="card-h"><div className="card-t">m³fub/G15h per medelköravstånd</div></div><div className="card-b"><canvas id="m3fubG15hChart"></canvas></div></div>
              </div>
            </div>
          )}

          {/* ── PRODUKTION VIEW ── */}
          {activeView === 'produktion' && (
            <div style={{ padding: '24px 28px 60px', maxWidth: 1400, margin: '0 auto', fontFamily: "'Geist', system-ui, sans-serif" }}>
              <div className="card gf">
                <div className="card-h"><div className="card-t" id="dailyChartTitle">Daglig produktion</div></div>
                <div className="card-b"><canvas id="dailyChart"></canvas></div>
              </div>
              <div className="g2">
                <div className="card"><div className="card-h"><div className="card-t">Medellast per avståndsklass</div></div><div className="card-b"><canvas id="medellastChart"></canvas></div></div>
                <div className="card"><div className="card-h"><div className="card-t">Produktion per avståndsklass</div></div><div className="card-b"><canvas id="totalChart"></canvas></div></div>
              </div>
              <div className="g2">
                <div className="card"><div className="card-h"><div className="card-t">Diesel per avståndsklass</div></div><div className="card-b"><canvas id="dieselChart"></canvas></div></div>
                <div className="card"><div className="card-h"><div className="card-t">m³fub/G15h per medelköravstånd</div></div><div className="card-b"><canvas id="m3fubG15hChart"></canvas></div></div>
              </div>
            </div>
          )}

          {/* ── AVBROTT VIEW ── */}
          {activeView === 'avbrott' && (() => {
            const db = dbData;
            const at = db?.avbrottTotal;
            const pk = db?.avbrottPerKategori || [];
            return (
              <div style={{ padding: '24px 28px 60px', maxWidth: 1400, margin: '0 auto', fontFamily: "'Geist', system-ui, sans-serif" }}>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#e8e8e4', letterSpacing: -0.5, marginBottom: 20 }}>Avbrott</div>
                <div className="hero" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  <div className="hero-main" style={{ gridColumn: 'span 2', background: 'rgba(255,255,255,0.06)' }}>
                    <div className="hero-label">Total avbrottstid</div>
                    <div className="hero-val" style={{ fontSize: 48 }}>{at?.timmar || 0}<span style={{ fontSize: 24, color: '#888', marginLeft: 2 }}>h</span></div>
                    <div className="hero-unit">timmar</div>
                  </div>
                  <div className="kpi"><div className="k-label">Antal avbrott</div><div className="k-val">{at?.antal || 0}</div><div className="k-unit">st</div></div>
                  <div className="kpi"><div className="k-label">Snitt per avbrott</div><div className="k-val">{at?.snittMin || 0}</div><div className="k-unit">min</div></div>
                </div>
                <div className="card gf">
                  <div className="card-h"><div className="card-t">Avbrott per kategori</div></div>
                  <div className="card-b" style={{ height: Math.max(200, pk.length * 40) }}>
                    <canvas id="avbrottCanvas"></canvas>
                  </div>
                </div>
                {pk.length > 0 && (
                  <div className="card gf">
                    <div className="card-h"><div className="card-t">Detaljer</div></div>
                    <div className="card-b">
                      {pk.map((k, ki) => (
                        <div key={ki} className="frow">
                          <span className="frow-l">{k.kategori}</span>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: '#7a7a72' }}>{k.antal}x</span>
                            <span style={{ fontSize: 10, color: '#7a7a72' }}>snitt {k.snittMin} min</span>
                            <span className="frow-v">{k.timmar}h</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── ANALYS VIEW ── */}
          {activeView === 'analys' && (() => {
            const db = dbData;
            const ops = db?.operatorer || [];
            const dc = db?.distClasses || [];
            const activeDc = dc.filter(c => c.lass > 0 || c.volym > 0);
            return (
              <div style={{ padding: '24px 28px 60px', maxWidth: 1400, margin: '0 auto', fontFamily: "'Geist', system-ui, sans-serif" }}>
                {/* Distance class insight */}
                {activeDc.length > 0 && (
                  <div className="card gf">
                    <div className="card-h"><div className="card-t">Avståndsklassanalys</div></div>
                    <div className="card-b">
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Klass</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Lass</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Volym</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>G15h</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Lass/G15h</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Medellast</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Diesel l/m³</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeDc.map((c, ci) => (
                              <tr key={ci} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{c.label}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.lass}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.volym} m³</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.g15h}h</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5aff8c' }}>{c.lassG15h}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.medellast}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.dieselM3}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Operator comparison */}
                {ops.length > 0 && (
                  <div className="card gf">
                    <div className="card-h"><div className="card-t">Operatörsjämförelse</div></div>
                    <div className="card-b">
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Operatör</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Lass</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Volym</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>G15h</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Medellast</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Lass/G15h</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Medelavst.</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7a7a72', fontSize: 10, fontWeight: 500 }}>Dagar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ops.map((op, oi) => (
                              <tr key={oi} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                onClick={() => { setPanelOperator(op); setPanelType('operator'); setOverlayOpen(true); }}>
                                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{op.namn}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{op.lass}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(op.volym)} m³</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{op.g15h.toFixed(0)}h</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{op.medellast}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5aff8c' }}>{op.lassG15h}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{op.medelavstand}m</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{op.dagar}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="mv-bottomnav">
        {[
          { icon: 'idag', label: 'Idag', view: 'idag' },
          { icon: 'oversikt', label: 'Översikt', view: 'oversikt' },
          { icon: 'produktion', label: 'Produktion', view: 'produktion' },
          { icon: 'avbrott', label: 'Avbrott', view: 'avbrott' },
          { icon: 'analys', label: 'Analys', view: 'analys' },
        ].map(item => (
          <button key={item.view} className={activeView === item.view ? 'active' : ''} onClick={() => setActiveView(item.view)}>
            <div className="mv-bn-icon-wrap">{navIcons[item.icon]}</div>
            <div className="mv-bn-label">{item.label}</div>
          </button>
        ))}
      </nav>

      {/* ── OVERLAY + PANELS ── */}
      <div className={`forar-overlay ${overlayOpen ? 'open' : ''}`} onClick={closePanel}></div>

      {/* Operator panel */}
      <div className={`forar-panel ${overlayOpen && panelType === 'operator' ? 'open' : ''}`} onClick={e => e.stopPropagation()}>
        {panelOperator && (
          <>
            <div className="forar-head">
              <div className="forar-av">{panelOperator.initialer}</div>
              <div>
                <div className="forar-title">{panelOperator.namn}</div>
                <div className="forar-sub">Vald period</div>
              </div>
              <button className="forar-close" onClick={closePanel}>{'\u2715'}</button>
            </div>
            <div className="forar-body">
              <div className="fsec">
                <div className="fsec-title">Totalt</div>
                <div className="forar-kpis">
                  <div className="fkpi"><div className="fkpi-v">{panelOperator.lass}</div><div className="fkpi-l">Lass</div></div>
                  <div className="fkpi"><div className="fkpi-v">{Math.round(panelOperator.volym)}</div><div className="fkpi-l">m³ skotad</div></div>
                  <div className="fkpi"><div className="fkpi-v">{panelOperator.g15h.toFixed(0)}</div><div className="fkpi-l">G15h</div></div>
                  <div className="fkpi"><div className="fkpi-v">{panelOperator.medellast}</div><div className="fkpi-l">Medellast</div></div>
                  <div className="fkpi"><div className="fkpi-v">{panelOperator.lassG15h}</div><div className="fkpi-l">Lass/G15h</div></div>
                  <div className="fkpi"><div className="fkpi-v">{panelOperator.medelavstand}m</div><div className="fkpi-l">Medelavstånd</div></div>
                </div>
              </div>
              <div className="fsec">
                <div className="fsec-title">Lass/G15h per avståndsklass</div>
                <canvas ref={opChartRef} style={{ maxHeight: 180, marginBottom: 12 }}></canvas>
              </div>
              <div className="fsec">
                <div className="fsec-title">Övrigt</div>
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '4px 16px' }}>
                  <div className="frow"><span className="frow-l">Aktiva dagar</span><span className="frow-v">{panelOperator.dagar}</span></div>
                  <div className="frow"><span className="frow-l">Bränsle</span><span className="frow-v">{Math.round(panelOperator.bransleLiter)} liter</span></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dag panel */}
      <div className={`forar-panel ${overlayOpen && panelType === 'dag' ? 'open' : ''}`} onClick={e => e.stopPropagation()}>
        {panelDag && (() => {
          const { dayNum, entry: d } = panelDag;
          const typIcon: Record<number, string> = { 1: '\ud83c\udf32', 2: '\ud83d\ude9b', 3: '\ud83d\udd27' };
          const typNamn: Record<number, string> = { 1: 'Produktion', 2: 'Flytt', 3: 'Service' };
          const pStart = dbData?.periodStartDate || '2026-01-01';
          const dagDate = new Date(pStart + 'T12:00:00');
          dagDate.setDate(dagDate.getDate() + dayNum - 1);
          const manader = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
          return (
            <>
              <div className="forar-head">
                <div className="forar-av" style={{ fontSize: 22 }}>{typIcon[d.typ] || '\ud83d\udcc5'}</div>
                <div>
                  <div className="forar-title">{dagDate.getDate()} {manader[dagDate.getMonth()]} {dagDate.getFullYear()}</div>
                  <div className="forar-sub">{typNamn[d.typ] || ''}</div>
                </div>
                <button className="forar-close" onClick={closePanel}>{'\u2715'}</button>
              </div>
              <div className="forar-body">
                {d.flytt ? (
                  <div className="forar-kpis">
                    <div className="fkpi"><div className="fkpi-v">{d.start}</div><div className="fkpi-l">Start</div></div>
                    <div className="fkpi"><div className="fkpi-v">{d.slut}</div><div className="fkpi-l">Slut</div></div>
                  </div>
                ) : (<>
                  <div className="forar-kpis" style={{ marginBottom: 16 }}>
                    <div className="fkpi"><div className="fkpi-v">{d.lass}</div><div className="fkpi-l">Lass</div></div>
                    <div className="fkpi"><div className="fkpi-v">{d.volym}</div><div className="fkpi-l">m³ skotad</div></div>
                    <div className="fkpi"><div className="fkpi-v">{d.g15}h</div><div className="fkpi-l">G15-timmar</div></div>
                    <div className="fkpi"><div className="fkpi-v">{d.medellast}</div><div className="fkpi-l">Medellast</div></div>
                    <div className="fkpi"><div className="fkpi-v">{d.medelavstand}m</div><div className="fkpi-l">Medelavstånd</div></div>
                    <div className="fkpi"><div className="fkpi-v">{d.diesel}</div><div className="fkpi-l">Diesel l/m³</div></div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.2px', color: 'var(--muted)', marginBottom: 8 }}>Skiftinfo</div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '4px 16px', marginBottom: 16 }}>
                    <div className="frow"><span className="frow-l">Förare</span><span className="frow-v">{d.forare}</span></div>
                    <div className="frow"><span className="frow-l">Objekt</span><span className="frow-v">{d.objekt}</span></div>
                    <div className="frow"><span className="frow-l">Start</span><span className="frow-v">{d.start}</span></div>
                    <div className="frow" style={{ borderBottom: 'none' }}><span className="frow-l">Slut</span><span className="frow-v">{d.slut}</span></div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.2px', color: 'var(--muted)', marginBottom: 8 }}>Avbrott</div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '4px 16px' }}>
                    {d.avbrott.length > 0 ? d.avbrott.map((a, ai) => (
                      <div key={ai} className="frow"><span className="frow-l">{a.orsak}</span><span className="frow-v">{a.tid}</span></div>
                    )) : (
                      <div className="frow" style={{ borderBottom: 'none' }}><span className="frow-l" style={{ color: 'var(--muted)' }}>Inga avbrott registrerade</span></div>
                    )}
                  </div>
                </>)}
              </div>
            </>
          );
        })()}
      </div>

    </div>
  );
}
