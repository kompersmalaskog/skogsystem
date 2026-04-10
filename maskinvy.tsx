'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { translateKategori } from '@/lib/avbrott-kategorier';

type Maskin = { maskin_id: any; modell: string; tillverkare: string; typ: string };

// Paginated Supabase fetch — fetches all rows beyond the 1000-row default limit.
// queryFn receives a range (from, to) and must return a fresh query with .range() applied.
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

// ── Types for DB data ──
type DbData = {
  dailyVol: number[];
  dailySt: number[];
  days: string[];
  dailyDates: string[];  // full ISO dates for weekend detection
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
    utnyttjandePct: number;
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
  utnyttjandegrad: number;           // G15h / inloggad tid %
  // Avbrott
  avbrottTotal: { timmar: number; antal: number; snittMin: number };
  avbrottPerKategori: Array<{ kategori: string; timmar: number; antal: number; snittMin: number }>;
  avbrottPerManad: Array<{ month: string; byKat: Record<string, number> }>;
  // Per-medelstamsklass arrays (dynamic number of classes depending on machine)
  klassLabels: string[];
  klassVolym: number[];
  klassStammar: number[];
  klassM3g15: number[];
  klassStg15: number[];
  klassDieselM3: number[];
  klassMthPct: number[];             // MTH% stammar per medelstamsklass
  mthAndelPct: number;               // total MTH-andel %
  mthMedelstam: number;              // snitt medelstam MTH
  singleMedelstam: number;           // snitt medelstam Single
  // Sortiment: totalvolym per kategori
  sortimentData: {
    categories: string[];        // ['Sägtimmer','Kubb','Massaved','Energived']
    totals: number[];            // volym per category
  };
  // MTH flag + sortiment per dag
  hasMth: boolean;
  sortimentPerDag: {
    days: string[];
    timmer: number[];
    kubb: number[];
    massa: number[];
    energi: number[];
  } | null;
  // Bolag data (from dim_objekt + fakt_produktion)
  bolagData: Array<{
    key: string; logo: string; name: string; volym: number; pct: number;
    inkopare: Array<{
      namn: string; initialer: string; volym: number;
      objekt: Array<{ namn: string; nr: string; typ: string; volym: number }>;
    }>;
  }>;
  // ObjTyp data (certifiering from dim_objekt)
  objTypList: Array<{
    key: string; label: string; title: string;
    volym: number; stammar: number; g15: number; prod: number; stg15: number; medelstam: number;
    objekt: Array<{ namn: string; volym: number; stammar: number; prod: number }>;
  }>;
  // Timpeng vs Ackord
  timpengData: Array<{
    key: string; label: string;
    volym: number; stammar: number; g15: number; prod: number; stg15: number; medelstam: number;
    objekt: Array<{ namn: string; volym: number; stammar: number; prod: number }>;
  }>;
  // Inköpardata
  inkopareData: Array<{
    key: string; namn: string; bolag: string; volym: number; stammar: number; prod: number; antalObjekt: number;
    perAtgard: Record<string, number>;
    perTradslag: Record<string, number>;
    objekt: Array<{ namn: string; volym: number; stammar: number; atgard: string }>;
  }>;
  // Per klass per åtgärd (för jämförelsediagram)
  atgardKlassData: Record<string, number[]>;
  atgardM3g15Data: Record<string, number[]>;
  // Trädslag: total volym per kategori (Gran/Tall/Björk/Övr. löv)
  tradslagData: Record<string, number>;
  // Start date ISO for calendar/dag
  periodStartDate: string;
  totalDays: number;
};

const MASKINVY_SCRIPT = `(function(){
if (typeof Chart === 'undefined') { console.error('[Maskinvy] Chart.js not loaded'); return; }
Chart.defaults.font.family = 'Geist';
Chart.defaults.color = '#7a7a72';

// Read DB data from window if available
var _db = window.__maskinvyData || {};
console.log('[Maskinvy Script] _db:', { keys: Object.keys(_db), totalVolym: _db.totalVolym, dailyVol: _db.dailyVol?.length, operatorer: _db.operatorer?.length, klassM3g15: _db.klassM3g15, klassDieselM3: _db.klassDieselM3 });

// Filter out medelstamsklasser with zero stammar
var _rawClasses = _db.klassLabels || [];
var _rawM3g15   = _db.klassM3g15 || [];
var _rawStg15   = _db.klassStg15 || [];
var _rawVolym   = _db.klassVolym || [];
var _rawStammar = _db.klassStammar || [];
var _activeIdx = _rawStammar.map(function(_,i){return _rawStammar[i]>0?i:-1;}).filter(function(i){return i>=0;});
var classes = _activeIdx.map(function(i){return _rawClasses[i];});
var m3g15   = _activeIdx.map(function(i){return _rawM3g15[i];});
var stg15   = _activeIdx.map(function(i){return _rawStg15[i];});
var volym   = _activeIdx.map(function(i){return _rawVolym[i];});
var stammar = _activeIdx.map(function(i){return _rawStammar[i];});

console.log('[MTH klasser]', classes.map(function(c,i){return {klass:c, volym:volym[i], stammar:stammar[i]};}));
console.log('[MTH total]', {sumKlassVolym: volym.reduce(function(a,b){return a+b;},0), totalVolym: _db.totalVolym});
console.log('[MTH raw]', _rawClasses.map(function(c,i){return {klass:c, volym:_rawVolym[i], stammar:_rawStammar[i]};}));

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
var _kpiUtnytt = _db.utnyttjandegrad || 0;

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
  if (t === 'Utnyttjandegrad') el.setAttribute('data-count', String(_kpiUtnytt));
});

// Update MTH stats
var _mthA = document.getElementById('mthAndelVal'); if (_mthA) _mthA.textContent = (_db.mthAndelPct || 0) + '%';
var _mthS = document.getElementById('mthStamVal'); if (_mthS) _mthS.textContent = (_db.mthMedelstam || 0).toFixed(2);
var _sinS = document.getElementById('singleStamVal'); if (_sinS) _sinS.textContent = (_db.singleMedelstam || 0).toFixed(2);

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
const dailyDates = _db.dailyDates || [];

// Detect weekends from ISO date strings
var isWeekend = dailyDates.map(function(ds) {
  var d = new Date(ds + 'T12:00:00');
  var dow = d.getDay();
  return dow === 0 || dow === 6;
});

// Average of non-zero days
var nonZeroVols = dailyVol.filter(function(v){return v>0;});
var avgVol = nonZeroVols.length > 0 ? Math.round(nonZeroVols.reduce(function(a,b){return a+b;},0) / nonZeroVols.length) : 0;

// Update daily chart title with average
var dailyTitleEl = document.getElementById('dailyChartTitle');
if (dailyTitleEl && avgVol > 0) {
  dailyTitleEl.innerHTML = 'Daglig produktion <span style="color:#7a7a72;font-size:11px;font-weight:400;"> \\u00b7 Snitt: ' + avgVol + ' m\\u00b3/dag</span>';
}

// Weekend background plugin
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

// Datalabels plugin (volume on top of bars)
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
      var val = dailyVol[i];
      if (val > 0) {
        var bar = meta.data[i];
        ctx.fillText(val.toString(), bar.x, bar.y - 3);
      }
    }
    ctx.restore();
  }
};

var dailyEl = document.getElementById('dailyChart');
console.log('[Maskinvy Script] dailyChart element:', !!dailyEl, 'dailyVol:', dailyVol?.slice(0,5));
if(!dailyEl){console.warn('[Maskinvy] dailyChart canvas not found');}
else { new Chart(dailyEl,{
  type:'bar',
  data:{labels:days,datasets:[
    {label:'m³/dag',data:dailyVol,backgroundColor:dailyVol.map(function(v,i){
      if(v===0) return isWeekend[i]?'rgba(255,255,255,0.02)':'rgba(255,255,255,0.04)';
      if(isWeekend[i]) return 'rgba(91,143,255,0.15)';
      return v>avgVol?'rgba(90,255,140,0.7)':'rgba(76,175,80,0.5)';
    }),borderRadius:6,barPercentage:0.85,categoryPercentage:0.9,order:1},
    {label:'Snitt: '+avgVol+' m³',data:new Array(dailyVol.length).fill(avgVol),type:'line',borderColor:'rgba(255,255,255,0.2)',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false,order:0}
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
            lines.push('Volym: '+dailyVol[idx]+' m\\u00b3');
            if(d&&d.snitt) lines.push('m\\u00b3/G15h: '+d.snitt);
            if(d&&d.objekt&&d.objekt!=='\\u2013') lines.push('Objekt: '+d.objekt);
            return lines;
          }
        }
      }
    },
    scales:{
      x:{grid,ticks:{...ticks,callback:function(val,idx){
        if(isWeekend[idx]) return '\\u25AA '+days[idx];
        return days[idx];
      }}},
      y:{grid,ticks,title:{display:true,text:'m\\u00b3',color:'#7a7a72',font:{size:11}},
        suggestedMax: Math.max.apply(null,dailyVol)*1.15}
    },
    onClick:(e,els)=>{
      if(!els.length||els[0].datasetIndex!==0) return;
      const dag = els[0].index + 1;
      if(dagData[dag]) openDag(dag);
    },
    onHover:(e,els)=>{
      e.native.target.style.cursor = els.length && els[0].datasetIndex===0 && dagData[els[0].index+1] ? 'pointer' : 'default';
    }
  }
}); }

// Calendar — dynamic based on periodStartDate + totalDays
const cal = document.getElementById('calGrid');
const dt = _db.calendarDt || [];
const dc={0:'c-off',1:'c-prod',2:'c-flytt',3:'c-service'};
const dlbl={0:'Ej aktiv',1:'Produktion',2:'Flytt',3:'Service'};
var calStart = new Date((_db.periodStartDate || '2026-01-01') + 'T12:00:00');
var calTotalDays = _db.totalDays || dt.length || 28;
// Set calendar title with month name
var calTitleMonths = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
var calTitleEl = document.getElementById('calTitle');
if (calTitleEl) calTitleEl.textContent = calTitleMonths[calStart.getMonth()] + ' ' + calStart.getFullYear();
// Add empty cells for days before Monday (week starts on Monday)
var firstDow = calStart.getDay(); // 0=Sun
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
  el.title=cDate.getDate()+' '+calManader[cDate.getMonth()]+' · '+dlbl[t]+(dailyVol[ci]>0?' · '+dailyVol[ci]+' m³':'');
  if(t===1||t===2||t===3) el.onclick=(function(idx){return function(){openDag(idx+1);};})(ci);
  el.textContent=cDate.getDate();
  cal.appendChild(el);
}
// Update summary counts
var calSumEl = document.getElementById('calSummary');
if(calSumEl) calSumEl.innerHTML = '<div class="cal-si"><div class="cal-sn" style="color:var(--text)">'+calCounts.prod+'</div><div class="cal-sl">Produktion</div></div>'
  +'<div class="cal-si"><div class="cal-sn" style="color:var(--text)">'+calCounts.flytt+'</div><div class="cal-sl">Flytt</div></div>'
  +'<div class="cal-si"><div class="cal-sn" style="color:var(--warn)">'+calCounts.service+'</div><div class="cal-sl">Service</div></div>'
  +'<div class="cal-si"><div class="cal-sn" style="color:var(--muted)">'+calCounts.off+'</div><div class="cal-sl">Ej aktiv</div></div>';

// Sortiment (from fakt_sortiment + dim_sortiment)
var _sd = _db.sortimentData || { categories:[], totals:[] };
if(!document.getElementById('sortChart')){console.warn('[Maskinvy] sortChart not found, skipping remaining charts');}
else {
var _stotal = _sd.totals.reduce(function(a,b){return a+b;},0);
new Chart(document.getElementById('sortChart'),{
  type:'bar',
  data:{labels:_sd.categories,datasets:[
    {label:'m\\u00b3sub',data:_sd.totals,backgroundColor:['rgba(90,255,140,0.5)','rgba(91,143,255,0.5)','rgba(255,179,64,0.4)','rgba(255,255,255,0.15)'],borderRadius:4}
  ]},
  options:{responsive:true,layout:{padding:{top:22}},plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m\\u00b3',color:'#7a7a72',font:{size:11}}}}},
  plugins:[{
    id:'sortPctLabels',
    afterDatasetsDraw:function(chart){
      var ctx = chart.ctx;
      var meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      meta.data.forEach(function(bar, i){
        var pct = _stotal > 0 ? Math.round((_sd.totals[i] || 0) / _stotal * 100) : 0;
        ctx.save();
        ctx.fillStyle = '#e8e8e4';
        ctx.font = "500 11px 'Geist', system-ui, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(pct + '%', bar.x, bar.y - 4);
        ctx.restore();
      });
    }
  }]
});

// Trädslag — populera sec-tradslag-kortet från _db.tradslagData
var _tsData = _db.tradslagData || {};
console.log('[Trädslag script]', _tsData);
var _tsRowsEl = document.getElementById('tradslagRows');
if (_tsRowsEl) {
  var _tsOrder = ['Gran','Tall','Björk','Övr. löv'];
  var _tsLabels = {'Gran':'Gran','Tall':'Tall','Björk':'Björk','Övr. löv':'Övrigt'};
  var _tsColors = {'Gran':'rgba(255,255,255,0.2)','Tall':'rgba(255,255,255,0.2)','Björk':'rgba(255,255,255,0.15)','Övr. löv':'rgba(255,255,255,0.08)'};
  var _tsTotal = _tsOrder.reduce(function(a,k){return a + (_tsData[k] || 0);}, 0);
  _tsRowsEl.innerHTML = _tsOrder.map(function(k){
    var v = _tsData[k] || 0;
    var pct = _tsTotal > 0 ? Math.round(v / _tsTotal * 100) : 0;
    return '<div class="ts"><div class="ts-top"><span class="ts-n">' + _tsLabels[k] + '</span><span class="ts-v">' + Math.round(v).toLocaleString('sv') + ' m\\u00b3 \\u00b7 ' + pct + '%</span></div><div class="prog"><div class="pf" style="width:' + pct + '%;background:' + _tsColors[k] + '"></div></div></div>';
  }).join('');
}

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
        scales: { x: { stacked: true, grid, ticks }, y: { stacked: true, grid, ticks, title: { display: true, text: 'm\\u00b3', color: '#7a7a72', font: { size: 11 } } } }
      }
    });
  }
} else {
  if (mthSection) mthSection.style.removeProperty('display');
  if (sortDagSection) sortDagSection.style.display = 'none';
  // Build horizontal bar rows for MTH% per medelstamsklass
  var _rawMthPct = _db.klassMthPct || [];
  var mthPct = _activeIdx.map(function(i){return _rawMthPct[i]||0;});
  var mthBody = document.getElementById('mthBody');
  if (mthBody && classes.length > 0) {
    mthBody.innerHTML = classes.map(function(cls, i) {
      var p = mthPct[i] || 0;
      var st = stammar[i] || 0;
      if (st === 0) return '';
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;">'
        + '<div style="width:48px;font-size:14px;color:#fff;text-align:right;flex-shrink:0;">' + cls + '</div>'
        + '<div style="flex:1;height:32px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;">'
        + '<div style="height:100%;width:' + Math.max(p, 1) + '%;background:rgba(90,255,140,' + (p > 30 ? '0.5' : p > 10 ? '0.35' : '0.2') + ');border-radius:4px;"></div>'
        + '</div>'
        + '<div style="width:140px;font-size:16px;font-weight:500;color:#fff;text-align:right;flex-shrink:0;">' + p + '%<span style="font-size:12px;color:#7a7a72;margin-left:6px;">\\u2014 ' + st.toLocaleString('sv') + ' st</span></div>'
        + '</div>';
    }).filter(Boolean).join('');
  }
}

// Total — volym per medelstamsklass (en y-axel)
new Chart(document.getElementById('totalChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'Volym m³',data:volym,backgroundColor:'rgba(76,175,80,0.65)',borderRadius:6}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{title:function(items){return items[0].label;},label:function(ctx){var idx=ctx.dataIndex;return ['Volym: '+volym[idx].toLocaleString('sv')+' m\\u00b3','Stammar: '+(stammar[idx]||0).toLocaleString('sv')+' st','m\\u00b3/G15h: '+m3g15[idx]];}}}},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m\\u00b3',color:'#7a7a72',font:{size:11}}}}}
});

// Åtgärdsjämförelse — volym per klass per åtgärd
var atgKlassData = _db.atgardKlassData || {};
var atgKlassEl = document.getElementById('atgardKlassChart');
var atgNames = Object.keys(atgKlassData);
if (atgKlassEl && atgNames.length >= 2) {
  var atgColors = ['rgba(76,175,80,0.65)','rgba(91,143,255,0.65)','rgba(255,179,64,0.65)','rgba(255,95,87,0.65)','rgba(160,120,255,0.65)'];
  var atgDatasets = atgNames.map(function(atg, ai) {
    // Filter by activeIdx (same as classes)
    var filtered = _activeIdx.map(function(i){return atgKlassData[atg][i]||0;});
    return {label:atg, data:filtered, backgroundColor:atgColors[ai%atgColors.length], borderRadius:6};
  });
  new Chart(atgKlassEl, {
    type:'bar',
    data:{labels:classes, datasets:atgDatasets},
    options:{responsive:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#7a7a72',font:{family:'Geist',size:11},boxWidth:10,padding:14}},
        tooltip:{...tooltip,callbacks:{title:function(items){return items[0].label;},label:function(ctx){return ' '+ctx.dataset.label+': '+ctx.parsed.y.toLocaleString('sv')+' m\\u00b3';}}}},
      scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m\\u00b3',color:'#7a7a72',font:{size:11}}}}}
  });
  document.getElementById('atgardKlassWrap').style.display = '';
} else if (document.getElementById('atgardKlassWrap')) {
  document.getElementById('atgardKlassWrap').style.display = 'none';
}

// Åtgärdsjämförelse — m³/G15h per klass per åtgärd
var atgM3g15Data = _db.atgardM3g15Data || {};
var atgM3g15El = document.getElementById('atgardM3g15Chart');
var atgM3g15Names = Object.keys(atgM3g15Data);
if (atgM3g15El && atgM3g15Names.length >= 2) {
  var atgProdColors = ['rgba(76,175,80,0.65)','rgba(91,143,255,0.65)','rgba(255,179,64,0.65)','rgba(255,95,87,0.65)','rgba(160,120,255,0.65)'];
  var atgProdDatasets = atgM3g15Names.map(function(atg, ai) {
    var filtered = _activeIdx.map(function(i){return atgM3g15Data[atg][i]||0;});
    return {label:atg, data:filtered, backgroundColor:atgProdColors[ai%atgProdColors.length], borderRadius:6};
  });
  new Chart(atgM3g15El, {
    type:'bar',
    data:{labels:classes, datasets:atgProdDatasets},
    options:{responsive:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#7a7a72',font:{family:'Geist',size:11},boxWidth:10,padding:14}},
        tooltip:{...tooltip,callbacks:{title:function(items){return items[0].label;},label:function(ctx){return ' '+ctx.dataset.label+': '+ctx.parsed.y+' m\\u00b3/G15h';}}}},
      scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m\\u00b3/G15h',color:'#7a7a72',font:{size:11}}}}}
  });
  document.getElementById('atgardM3g15Wrap').style.display = '';
} else if (document.getElementById('atgardM3g15Wrap')) {
  document.getElementById('atgardM3g15Wrap').style.display = 'none';
}

// RP · AU sammanfattning — volymviktad m³/G15h per åtgärd
var rpauSummaryEl = document.getElementById('rpauSummary');
if (rpauSummaryEl && atgM3g15Names.length >= 1) {
  var atgKlassVol = _db.atgardKlassData || {};
  var rpauParts = atgM3g15Names.map(function(atg) {
    var vols = atgKlassVol[atg] || [];
    var m3g15s = atgM3g15Data[atg] || [];
    var totalVol = 0, totalH = 0;
    for (var i = 0; i < vols.length; i++) {
      if (m3g15s[i] > 0 && vols[i] > 0) {
        totalVol += vols[i];
        totalH += vols[i] / m3g15s[i];
      }
    }
    var avg = totalH > 0 ? (totalVol / totalH) : 0;
    return atg + ': ' + avg.toFixed(1) + ' m\\u00b3/G15h';
  });
  rpauSummaryEl.innerHTML = rpauParts.join('  \\u00b7  ');
  rpauSummaryEl.style.display = '';
} else if (rpauSummaryEl) {
  rpauSummaryEl.style.display = 'none';
}

// Produktivitet — m³/G15h per medelstamsklass (en y-axel)
new Chart(document.getElementById('prodChart'),{
  type:'bar',
  data:{labels:classes,datasets:[
    {label:'m³/G15h',data:m3g15,backgroundColor:'rgba(76,175,80,0.65)',borderRadius:6}
  ]},
  options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{title:function(items){return items[0].label;},label:function(ctx){var idx=ctx.dataIndex;return ['Produktivitet: '+m3g15[idx]+' m\\u00b3/G15h','Stammar: '+(stammar[idx]||0).toLocaleString('sv')];}}}},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m\\u00b3/G15h',color:'#7a7a72',font:{size:11}}}}}
});

// Medelstam insight card (ovanför diagrammen)
var miCard = document.getElementById('medelstamInsightCard');
if (miCard && classes.length > 0) {
  var bestProdIdx = 0;
  for (var pi=1;pi<m3g15.length;pi++) { if(m3g15[pi]>m3g15[bestProdIdx]) bestProdIdx=pi; }
  var mostVolIdx = 0;
  for (var vi=1;vi<volym.length;vi++) { if(volym[vi]>volym[mostVolIdx]) mostVolIdx=vi; }
  var bpVal = document.getElementById('miBestProdVal');
  var bpLbl = document.getElementById('miBestProdLbl');
  var mvVal = document.getElementById('miMostVolVal');
  var mvLbl = document.getElementById('miMostVolLbl');
  if (bpVal) bpVal.textContent = m3g15[bestProdIdx] + ' m\\u00b3/G15h';
  if (bpLbl) bpLbl.textContent = 'Medelstamsklass ' + classes[bestProdIdx];
  if (mvVal) mvVal.textContent = volym[mostVolIdx].toLocaleString('sv') + ' m\\u00b3';
  if (mvLbl) mvLbl.textContent = 'Medelstamsklass ' + classes[mostVolIdx];
  miCard.style.display = '';
} else if (miCard) {
  miCard.style.display = 'none';
}

// Stammar/G15h per medelstamsklass
var stg15ChartEl = document.getElementById('stg15Chart');
if (stg15ChartEl && classes.length > 0) {
  new Chart(stg15ChartEl, {
    type:'bar',
    data:{labels:classes,datasets:[
      {label:'st/G15h',data:stg15,backgroundColor:'rgba(76,175,80,0.65)',borderRadius:6}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{title:function(items){return items[0].label;},label:function(ctx){var idx=ctx.dataIndex;return ['st/G15h: '+stg15[idx],'Stammar totalt: '+(stammar[idx]||0).toLocaleString('sv')];}}}},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'st/G15h',color:'#7a7a72',font:{size:11}}}}}
  });
}
var stg15SumEl = document.getElementById('stg15Summary');
if (stg15SumEl && classes.length > 0) {
  var bestStIdx = 0;
  for (var si=1;si<stg15.length;si++) { if(stg15[si]>stg15[bestStIdx]) bestStIdx=si; }
  stg15SumEl.innerHTML = '<span style="color:var(--muted);font-size:11px;">Flest stammar/h: <strong style="color:var(--text)">'+classes[bestStIdx]+' · '+stg15[bestStIdx]+' st/G15h</strong></span>';
}

// Populate diesel KPI cards
var dieselKpiEl = document.getElementById('dieselKpis');
if (dieselKpiEl) {
  var totalBr = _db.bransleTotalt || 0;
  var totalVol = _db.totalVolym || 0;
  var totalSt = _db.totalStammar || 0;
  var snittLm3 = totalVol > 0 ? (totalBr / totalVol).toFixed(1) : '–';
  var lPerStam = totalSt > 0 ? (totalBr / totalSt).toFixed(2) : '–';
  dieselKpiEl.innerHTML = '<div class="fkpi"><div class="fkpi-v">'+totalBr.toLocaleString('sv')+'</div><div class="fkpi-l">Liter totalt</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+snittLm3+'</div><div class="fkpi-l">Liter / m\\u00b3</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+lPerStam+'</div><div class="fkpi-l">Liter / stam</div></div>';
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
  ['forarPanel','bolagPanel','tradslagPanel','tidPanel','dagPanel','objTypPanel','objJmfPanel','inkPanel'].forEach(function(id){
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
      utnyttjandePct: op.utnyttjandePct || 0,
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
        <div class="fkpi"><div class="fkpi-v">\${f.timmar}</div><div class="fkpi-l">G15h</div></div>
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
      options:{responsive:true,plugins:{legend:{display:false},tooltip},scales:{x:{grid,ticks},y:{grid,ticks,title:{display:true,text:'m³',color:'#7a7a72',font:{size:11}}}}}
    });
  }, 50);
  openOverlay();
  document.getElementById('forarPanel').classList.add('open');
}

function closeForare() {
  closeAllPanels();
}

// ── BOLAG (from DB) ──
const bolagList = _db.bolagData || [];
var bolag = {};
bolagList.forEach(function(b) { bolag[b.key] = b; });

function openBolag(id) {
  const b = bolag[id];
  if (!b) return;
  document.getElementById('bpLogo').textContent = b.logo;
  document.getElementById('bpName').textContent = b.name;
  document.getElementById('bpSub').textContent  = b.volym.toLocaleString('sv') + ' m³ · ' + b.pct + '% av total volym';
  const slutVol = b.inkopare.flatMap(i=>i.objekt).filter(o=>o.typ==='Slutavverkning').reduce((s,o)=>s+o.volym,0);
  const gallVol = b.inkopare.flatMap(i=>i.objekt).filter(o=>o.typ==='Gallring').reduce((s,o)=>s+o.volym,0);
  // Inköpare som klickbara kort — tryck för att se objekt
  const inkopareCards = b.inkopare.map(ink=>{
    const inkSlut=ink.objekt.filter(o=>o.typ==='Slutavverkning').reduce((s,o)=>s+o.volym,0);
    const inkGall=ink.objekt.filter(o=>o.typ==='Gallring').reduce((s,o)=>s+o.volym,0);
    // Hitta matchande inkopareData för detaljer
    var objList = ink.objekt.map(function(o){
      return '<div class="frow" style="padding:8px 0;">'
        +'<div style="flex:1;"><div style="font-size:12px;font-weight:500;">'+o.namn+'</div><div style="font-size:10px;color:var(--muted);">'+o.nr+' · '+o.typ+'</div></div>'
        +'<span class="frow-v">'+o.volym.toLocaleString('sv')+' m³</span></div>';
    }).join('');
    return '<div style="background:var(--surface2);border-radius:12px;padding:16px;margin-bottom:10px;">'
      +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">'
      +'<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:rgba(255,255,255,0.6);flex-shrink:0;">'+ink.initialer+'</div>'
      +'<div style="flex:1;"><div style="font-size:14px;font-weight:500;">'+ink.namn+'</div><div style="font-size:11px;color:var(--muted);">'+ink.objekt.length+' objekt</div></div>'
      +'<div style="text-align:right;"><div style="font-family:Fraunces,serif;font-size:22px;line-height:1;">'+ink.volym.toLocaleString('sv')+'</div><div style="font-size:10px;color:var(--muted);">m³</div></div>'
      +'</div>'
      +'<div style="display:flex;gap:12px;margin-bottom:10px;">'
      +(inkSlut>0?'<div style="font-size:11px;color:var(--muted);">Slutavv <strong style="color:var(--text)">'+inkSlut.toLocaleString('sv')+'</strong> m³</div>':'')
      +(inkGall>0?'<div style="font-size:11px;color:var(--muted);">Gallring <strong style="color:var(--text)">'+inkGall.toLocaleString('sv')+'</strong> m³</div>':'')
      +'</div>'
      +'<div style="background:var(--bg);border-radius:8px;padding:4px 12px;">'+objList+'</div>'
      +'</div>';
  }).join('');
  document.getElementById('bpBody').innerHTML = '<div class="forar-kpis" style="margin-bottom:20px;">'
    +'<div class="fkpi"><div class="fkpi-v">'+b.volym.toLocaleString('sv')+'</div><div class="fkpi-l">m³ totalt</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+slutVol.toLocaleString('sv')+'</div><div class="fkpi-l">Slutavverkning</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+(gallVol>0?gallVol.toLocaleString('sv'):'–')+'</div><div class="fkpi-l">Gallring</div></div>'
    +'</div>'
    +'<div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:12px;">Inköpare</div>'
    +inkopareCards;
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
      <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);">Jämförelse</div>
      <button onclick="document.getElementById('cmpView').remove()" style="border:none;background:var(--surface2);border-radius:6px;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;color:var(--muted);">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:120px 1fr 32px 1fr;gap:7px;align-items:center;margin-bottom:12px;">
      <div></div>
      <div style="background:rgba(90,255,140,0.08);color:var(--accent);border-radius:7px;padding:9px 14px;font-size:11px;font-weight:500;border:1px solid rgba(90,255,140,0.15);">Period A · Jan 2026</div>
      <div style="text-align:center;font-size:10px;font-weight:500;color:var(--dim);">VS</div>
      <div style="background:rgba(255,179,64,0.08);color:var(--warn);border-radius:7px;padding:9px 14px;font-size:11px;font-weight:500;border:1px solid rgba(255,179,64,0.15);">Period B · Feb 2026</div>
    </div>
    \${ms.map(m=>{
      const d=((m.b-m.a)/m.a*100).toFixed(1);
      const pos=m.b>=m.a;
      const fmt=v=>v>100?v.toLocaleString('sv'):v;
      return \`<div style="display:grid;grid-template-columns:120px 1fr 32px 1fr;gap:7px;align-items:center;margin-bottom:7px;">
        <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);">\${m.lbl}</div>
        <div style="background:var(--surface2);border-radius:10px;padding:12px 16px;display:flex;align-items:baseline;gap:5px;">
          <span style="font-family:'Fraunces',serif;font-size:26px;color:var(--accent)">\${fmt(m.a)}</span>
          <span style="font-size:11px;color:var(--muted)">\${m.unit}</span>
        </div>
        <div style="text-align:center;">
          <div style="border-radius:5px;padding:3px 1px;font-size:10px;font-weight:500;background:\${pos?'rgba(90,255,140,0.1)':'rgba(255,95,87,0.1)'};color:\${pos?'var(--accent)':'var(--danger)'};">\${pos?'+':''}\${d}%</div>
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
  // Compute actual date from periodStartDate + day index
  var pStart = _db.periodStartDate || '2026-01-01';
  var dagDate = new Date(pStart + 'T12:00:00');
  dagDate.setDate(dagDate.getDate() + dag - 1);
  var manader = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
  document.getElementById('dagTitle').textContent = dagDate.getDate() + ' ' + manader[dagDate.getMonth()] + ' ' + dagDate.getFullYear();
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

      <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Skiftinfo</div>
      <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:16px;">
        <div class="frow"><span class="frow-l">Förare</span><span class="frow-v">\${d.forare}</span></div>
        <div class="frow"><span class="frow-l">Objekt</span><span class="frow-v">\${d.objekt}</span></div>
        <div class="frow"><span class="frow-l">Start</span><span class="frow-v">\${d.start}</span></div>
        <div class="frow"><span class="frow-l">Slut</span><span class="frow-v">\${d.slut}</span></div>
        <div class="frow" style="border:none"><span class="frow-l">Diesel</span><span class="frow-v">\${d.diesel} l/m³</span></div>
      </div>

      <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Avbrott</div>
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
      '<span style="font-weight:500;font-variant-numeric:tabular-nums;color:var(--text);">' + fmtAvbrottTid(v.tid) + '</span></div>';
  }).join('');
  var div = document.createElement('div');
  div.className = 'forare-avbrott-detail';
  div.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:8px;padding:4px 14px;margin:4px 0 8px;';
  div.innerHTML = rows;
  el.after(div);
}

// ── OBJ TYP DATA (from DB certifiering) ──
const objTypArr = _db.objTypList || [];
var objTypData = {};
objTypArr.forEach(function(t) { objTypData[t.key] = t; });

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

    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Per objekt</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">
      \${objRows}
    </div>
  \`;

  openOverlay();
  document.getElementById('objTypPanel').classList.add('open');
}
function closeObjTyp() { closeAllPanels(); }


function openObjJmf() {
  if (objTypArr.length < 2) return;
  // Dynamic comparison table
  var headers = objTypArr.map(function(t){return t.label;});
  var thHtml = '<th style="padding:11px 16px;color:var(--muted);font-size:11px;"></th>' + headers.map(function(h){return '<th style="text-align:right;padding:11px 10px;font-size:11px;font-weight:500;">'+h+'</th>';}).join('');
  var metrics = [
    {lbl:'Volym m³', fn:function(t){return t.volym.toLocaleString('sv');}, valFn:function(t){return t.volym;}, higher:true},
    {lbl:'Stammar', fn:function(t){return t.stammar.toLocaleString('sv');}, valFn:function(t){return t.stammar;}, higher:true},
    {lbl:'G15-timmar', fn:function(t){return t.g15+'h';}, valFn:function(t){return t.g15;}, higher:true},
    {lbl:'m³/G15h', fn:function(t){return t.prod;}, valFn:function(t){return t.prod;}, higher:true},
    {lbl:'st/G15h', fn:function(t){return t.stg15;}, valFn:function(t){return t.stg15;}, higher:true},
    {lbl:'Medelstam', fn:function(t){return t.medelstam;}, valFn:function(t){return t.medelstam;}, higher:true},
  ];
  var tbody = metrics.map(function(m,mi){
    var vals = objTypArr.map(function(t){return m.valFn(t);});
    var bestIdx = vals.indexOf(Math.max.apply(null,vals));
    var tds = objTypArr.map(function(t,ti){
      var isBest = ti===bestIdx;
      return '<td style="text-align:right;padding:11px 10px;font-weight:'+(isBest?'500':'400')+';color:'+(isBest?'rgba(90,255,140,0.9)':'var(--text)')+';">'+m.fn(t)+(isBest?' ↑':'')+'</td>';
    }).join('');
    return '<tr style="border-top:1px solid var(--border)"><td style="padding:11px 16px;color:var(--muted);font-size:11px;">'+m.lbl+'</td>'+tds+'</tr>';
  }).join('');
  document.getElementById('jmfTableBody').innerHTML = tbody;
  // Update header row
  var headerRow = document.getElementById('jmfTableHead');
  if (headerRow) headerRow.innerHTML = thHtml;

  // Best cards
  var bestProd = objTypArr.slice().sort(function(a,b){return b.prod-a.prod;})[0];
  var bestVol = objTypArr.slice().sort(function(a,b){return b.volym-a.volym;})[0];
  var totalOtVol = objTypArr.reduce(function(s,t){return s+t.volym;},0);
  var bestVolPct = totalOtVol>0?Math.round(bestVol.volym/totalOtVol*100):0;
  document.getElementById('jmfBest').innerHTML = \`
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Bäst produktivitet</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">\${bestProd.label}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">\${bestProd.prod} m³/G15h</div>
    </div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">Mest volym</div>
      <div style="font-family:'Fraunces',serif;font-size:22px;">\${bestVol.label}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">\${bestVol.volym.toLocaleString('sv')} m³ · \${bestVolPct}%</div>
    </div>
  \`;

  openOverlay();
  document.getElementById('objJmfPanel').classList.add('open');
}
function closeObjJmf() { closeAllPanels(); }

// ── TIMPENG / ACKORD (from DB) ──
const timpengArr = _db.timpengData || [];
var timpengData = {};
timpengArr.forEach(function(t) { timpengData[t.key] = t; });

function openTimpeng(id) {
  var d = timpengData[id];
  if (!d) return;
  document.getElementById('otpLabel').textContent = d.label;
  document.getElementById('otpTitle').textContent = d.label === 'Timpeng' ? 'Timpeng-objekt' : 'Ackord-objekt';

  var objRows = d.objekt.map(function(o) {
    return '<div class="frow"><span class="frow-l">'+o.namn+'</span><div style="display:flex;gap:14px;align-items:center;"><span style="font-size:10px;color:var(--muted);">m³/G15h <strong style="color:var(--text)">'+o.prod+'</strong></span><span style="font-size:10px;color:var(--muted);">st <strong style="color:var(--text)">'+o.stammar.toLocaleString('sv')+'</strong></span><span class="frow-v">'+o.volym.toLocaleString('sv')+' m³</span></div></div>';
  }).join('');

  document.getElementById('otpBody').innerHTML = '<div class="forar-kpis" style="margin-bottom:16px;">'
    +'<div class="fkpi"><div class="fkpi-v">'+d.volym.toLocaleString('sv')+'</div><div class="fkpi-l">m³ totalt</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+d.stammar.toLocaleString('sv')+'</div><div class="fkpi-l">Stammar</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+d.g15+'h</div><div class="fkpi-l">G15-timmar</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+d.prod+'</div><div class="fkpi-l">m³/G15h</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+d.stg15+'</div><div class="fkpi-l">st/G15h</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+d.medelstam+'</div><div class="fkpi-l">Medelstam</div></div></div>'
    +'<div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Per objekt</div>'
    +'<div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">'+objRows+'</div>';
  openOverlay();
  document.getElementById('objTypPanel').classList.add('open');
}

// ── UPDATE DOM WITH DB DATA ──

// Populate bolag card dynamically
var bolagCardBody = document.getElementById('bolagCardBody');
if (bolagCardBody && bolagList.length > 0) {
  bolagCardBody.innerHTML = bolagList.map(function(b,i){
    return '<div class="ink-row ink-clickable" onclick="openBolag(\\''+b.key+'\\')"><div class="ink-logo">'+b.logo+'</div><div class="ink-name">'+b.name+'</div><div style="text-align:right"><div class="ink-vol">'+b.volym.toLocaleString('sv')+' m³</div><div style="font-size:10px;color:var(--muted)">'+b.pct+'%</div></div></div><div style="padding:4px 0 '+(i<bolagList.length-1?'10':'0')+'px 40px"><div class="prog"><div class="pf" style="width:'+b.pct+'%;background:rgba(255,255,255,0.2)"></div></div></div>';
  }).join('');
} else if (bolagCardBody) {
  bolagCardBody.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px;">Ingen data</div>';
}

// Populate objekt table dynamically
var objektTblBody = document.getElementById('objektTblBody');
var objektData = _db.objekt || [];
if (objektTblBody && objektData.length > 0) {
  objektTblBody.innerHTML = objektData.map(function(o){
    return '<tr><td style="padding-left:22px"><div class="tn">'+o.namn+'</div><div class="ts2">'+(o.vo_nummer||'')+'</div></td><td style="font-variant-numeric:tabular-nums;font-weight:500">'+Math.round(o.volym)+'</td><td style="font-variant-numeric:tabular-nums;color:var(--muted)">'+o.prod.toFixed(1)+'</td></tr>';
  }).join('');
}

// Populate objtyp distribution dynamically
var objTypDistEl = document.getElementById('objTypDist');
if (objTypDistEl && objTypArr.length > 0) {
  var otTotal = objTypArr.reduce(function(s,t){return s+t.volym;},0);
  var cards = objTypArr.map(function(t){
    var pct = otTotal>0?Math.round(t.volym/otTotal*100):0;
    return '<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="openObjTyp(\\''+t.key+'\\')">'
      +'<div style="font-family:Fraunces,serif;font-size:22px;line-height:1;">'+t.volym.toLocaleString('sv')+'</div>'
      +'<div style="font-size:9px;letter-spacing:0.2px;color:var(--muted);margin-top:3px;">'+t.label+' · m³</div>'
      +'<div style="font-size:10px;color:var(--muted);margin-top:4px;">'+t.prod+' m³/G15h</div></div>';
  }).join('');
  var colors = ['rgba(90,255,140,0.5)','rgba(255,255,255,0.2)','rgba(91,143,255,0.4)','rgba(255,179,64,0.4)'];
  var bar = '<div style="background:var(--surface2);border-radius:8px;overflow:hidden;height:6px;display:flex;">'
    + objTypArr.map(function(t,i){return '<div style="flex:'+t.volym+';background:'+colors[i%colors.length]+(i>0?';margin-left:2px':'')+'"></div>';}).join('')+'</div>';
  var legend = objTypArr.map(function(t,i){
    var pct = otTotal>0?Math.round(t.volym/otTotal*100):0;
    return '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:'+colors[i%colors.length]+';"></div>'+t.label+' '+pct+'%</div>';
  }).join('');
  objTypDistEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat('+Math.min(objTypArr.length,3)+',1fr);gap:8px;margin-bottom:14px;">'+cards+'</div>'
    +bar+'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;"><div style="display:flex;gap:14px;">'+legend+'</div>'
    +'<button onclick="openObjJmf()" style="border:none;background:rgba(255,255,255,0.07);border-radius:6px;padding:5px 12px;font-family:inherit;font-size:10px;font-weight:500;color:rgba(255,255,255,0.6);cursor:pointer;letter-spacing:0.3px;">Jämför →</button></div>';
}

// Populate timpeng distribution
var timpengDistEl = document.getElementById('timpengDist');
if (timpengDistEl && timpengArr.length > 0) {
  var tpTotal = timpengArr.reduce(function(s,t){return s+t.volym;},0);
  var tpColors = ['rgba(255,179,64,0.5)','rgba(90,255,140,0.5)'];
  var tpCards = timpengArr.map(function(t,i){
    return '<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="openTimpeng(\\''+t.key+'\\')">'
      +'<div style="font-family:Fraunces,serif;font-size:22px;line-height:1;">'+t.volym.toLocaleString('sv')+'</div>'
      +'<div style="font-size:9px;letter-spacing:0.2px;color:var(--muted);margin-top:3px;">'+t.label+' · m³</div>'
      +'<div style="font-size:10px;color:var(--muted);margin-top:4px;">'+t.prod+' m³/G15h</div></div>';
  }).join('');
  var tpBar = '<div style="background:var(--surface2);border-radius:8px;overflow:hidden;height:6px;display:flex;">'
    + timpengArr.map(function(t,i){return '<div style="flex:'+t.volym+';background:'+tpColors[i%tpColors.length]+(i>0?';margin-left:2px':'')+'"></div>';}).join('')+'</div>';
  var tpLegend = timpengArr.map(function(t,i){
    var pct = tpTotal>0?Math.round(t.volym/tpTotal*100):0;
    return '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);"><div style="width:8px;height:8px;border-radius:2px;background:'+tpColors[i%tpColors.length]+';"></div>'+t.label+' '+pct+'%</div>';
  }).join('');
  timpengDistEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat('+timpengArr.length+',1fr);gap:8px;margin-bottom:14px;">'+tpCards+'</div>'
    +tpBar+'<div style="display:flex;gap:14px;margin-top:7px;">'+tpLegend+'</div>';
} else if (timpengDistEl) {
  timpengDistEl.innerHTML = '<div style="color:var(--muted);font-size:12px;">Ingen data</div>';
}

// Populate inkopare cards
var inkopareList = _db.inkopareData || [];
var inkopareEl = document.getElementById('inkopareCards');
if (inkopareEl && inkopareList.length > 0) {
  var totalInkVol = inkopareList.reduce(function(s,i){return s+i.volym;},0);
  inkopareEl.innerHTML = inkopareList.map(function(ink) {
    var pct = totalInkVol > 0 ? Math.round(ink.volym / totalInkVol * 100) : 0;
    var words = ink.namn.split(' ');
    var init = words.length >= 2 ? (words[0][0]+words[words.length-1][0]).toUpperCase() : ink.namn.substring(0,2).toUpperCase();
    // Trädslag bars
    var tsOrder = ['Gran','Tall','Björk','Övr. löv'];
    var tsColors = {'Gran':'rgba(90,255,140,0.5)','Tall':'rgba(255,255,255,0.2)','Björk':'rgba(91,143,255,0.4)','Övr. löv':'rgba(255,179,64,0.3)'};
    var inkTs2 = ink.perTradslag || {};
    var tsBars = tsOrder.filter(function(ts){return (inkTs2[ts]||0)>0;}).map(function(ts){
      var tsPct = ink.volym>0?Math.round((inkTs2[ts]||0)/ink.volym*100):0;
      return '<div style="flex:'+tsPct+';background:'+(tsColors[ts]||'rgba(255,255,255,0.1)')+';height:4px;border-radius:2px;"></div>';
    }).join('');
    return '<div class="ink-row ink-clickable" onclick="openInkopare(\\''+ink.key+'\\')" style="flex-direction:column;align-items:stretch;gap:6px;">'
      +'<div style="display:flex;align-items:center;gap:10px;">'
      +'<div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;color:rgba(255,255,255,0.5);flex-shrink:0;">'+init+'</div>'
      +'<div style="flex:1;"><div style="font-size:12px;font-weight:500;">'+ink.namn+'</div><div style="font-size:10px;color:var(--muted);">'+ink.bolag+' · '+ink.antalObjekt+' objekt</div></div>'
      +'<div style="text-align:right;"><div style="font-family:Fraunces,serif;font-size:18px;line-height:1;">'+ink.volym.toLocaleString('sv')+'</div><div style="font-size:10px;color:var(--muted);">m³ · '+pct+'%</div></div>'
      +'</div>'
      +'<div style="display:flex;gap:2px;border-radius:2px;overflow:hidden;">'+tsBars+'</div>'
      +'</div>';
  }).join('');
} else if (inkopareEl) {
  inkopareEl.innerHTML = '<div style="color:var(--muted);font-size:12px;">Ingen data</div>';
}

function openInkopare(key) {
  var ink = inkopareList.find(function(i){return i.key===key;});
  if (!ink) return;
  var words = ink.namn.split(' ');
  var init = words.length >= 2 ? (words[0][0]+words[words.length-1][0]).toUpperCase() : ink.namn.substring(0,2).toUpperCase();
  document.getElementById('inkLogo').textContent = init;
  document.getElementById('inkName').textContent = ink.namn;
  document.getElementById('inkSub').textContent = ink.bolag + ' · ' + ink.volym.toLocaleString('sv') + ' m³';

  // Åtgärdsfördelning
  var inkAtgard = ink.perAtgard || {};
  var atgRows = Object.entries(inkAtgard).sort(function(a,b){return b[1]-a[1];}).map(function(e){
    var pct = ink.volym>0?Math.round(e[1]/ink.volym*100):0;
    return '<div class="frow" style="padding:10px 0;"><span class="frow-l">'+e[0]+'</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:'+pct+'%;background:rgba(90,255,140,0.5)"></div></div></div><span class="frow-v" style="min-width:90px;text-align:right;">'+e[1].toLocaleString('sv')+' m³ <span style="color:var(--muted)">'+pct+'%</span></span></div>';
  }).join('');

  // Trädslag
  var tsOrder = ['Gran','Tall','Björk','Övr. löv'];
  var tsColors = {'Gran':'rgba(90,255,140,0.5)','Tall':'rgba(255,255,255,0.2)','Björk':'rgba(91,143,255,0.4)','Övr. löv':'rgba(255,179,64,0.3)'};
  var inkTs = ink.perTradslag || {};
  var tsRows = tsOrder.filter(function(ts){return (inkTs[ts]||0)>0;}).map(function(ts){
    var v = inkTs[ts]||0;
    var pct = ink.volym>0?Math.round(v/ink.volym*100):0;
    return '<div class="frow" style="padding:10px 0;"><span class="frow-l">'+ts+'</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:'+pct+'%;background:'+(tsColors[ts]||'rgba(255,255,255,0.1)')+'"></div></div></div><span class="frow-v" style="min-width:90px;text-align:right;">'+v.toLocaleString('sv')+' m³ <span style="color:var(--muted)">'+pct+'%</span></span></div>';
  }).join('');

  // Objekt
  var objRows = ink.objekt.map(function(o){
    return '<div class="frow"><span class="frow-l">'+o.namn+'</span><div style="display:flex;gap:12px;align-items:center;"><span style="font-size:10px;color:var(--muted);">'+o.atgard+'</span><span class="frow-v">'+o.volym.toLocaleString('sv')+' m³</span></div></div>';
  }).join('');

  document.getElementById('inkBody').innerHTML = '<div class="forar-kpis" style="margin-bottom:16px;">'
    +'<div class="fkpi"><div class="fkpi-v">'+ink.volym.toLocaleString('sv')+'</div><div class="fkpi-l">m³ totalt</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+ink.stammar.toLocaleString('sv')+'</div><div class="fkpi-l">Stammar</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+ink.prod+'</div><div class="fkpi-l">m³/G15h</div></div>'
    +'<div class="fkpi"><div class="fkpi-v">'+ink.antalObjekt+'</div><div class="fkpi-l">Objekt</div></div></div>'
    +'<div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Åtgärdsfördelning</div>'
    +'<div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:16px;">'+atgRows+'</div>'
    +'<div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Trädslag</div>'
    +'<div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:16px;">'+tsRows+'</div>'
    +'<div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:8px;">Objekt</div>'
    +'<div style="background:var(--surface2);border-radius:10px;padding:4px 16px;">'+objRows+'</div>';
  openOverlay();
  document.getElementById('inkPanel').classList.add('open');
}
function closeInkopare() { closeAllPanels(); }

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
      var uVal = (f.utnyttjandePct > 0 && f.utnyttjandePct <= 100) ? f.utnyttjandePct + '%' : '\u2014';
      var uWarn = (f.utnyttjandePct === 0 || f.utnyttjandePct > 100) ? '<div style="font-size:9px;color:#3a3a36;">data saknas</div>' : '';
      row.innerHTML = '<div class="op-av" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)">' + f.av + '</div>'
        + '<div class="op-info"><div class="op-name">' + f.name + '</div><div class="op-sub">' + Math.round(f.timmar) + ' G15h' + uWarn + '</div></div>'
        + '<div class="op-stats"><div><div class="op-sv" style="color:var(--text)">' + Math.round(f.volym) + ' m\\u00b3</div><div class="op-sl">volym</div></div>'
        + '<div><div class="op-sv">' + parseFloat(f.prod).toFixed(1) + '</div><div class="op-sl">m\\u00b3/G15h</div></div>'
        + '<div><div class="op-sv">' + uVal + '</div><div class="op-sl">utnyttj.</div></div></div>';
      opContainer.appendChild(row);
    });
  }

  if (opBadge) opBadge.textContent = '\\u00b7 ' + Object.keys(forare).length + ' aktiva';

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
        + '<div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;color:rgba(255,255,255,0.5);">' + f.av + '</div>'
        + '<span class="frow-l">' + f.name + '</span></div>'
        + '<span class="frow-v">– <span style="font-size:10px;color:var(--muted);margin-left:4px;">›</span></span>';
      avbrottContainer.appendChild(row);
    });
  }
} else {
  // No operators — clear stale content
  if (opContainer) opContainer.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0;">Ingen data för vald period</div>';
  if (opBadge) opBadge.textContent = '';
}

// Update time distribution bar & legend — always update (zero when no data)
{
  var totalSek = _db.engineTimeSek || 0;
  var pProc = totalSek > 0 ? Math.round((_db.processingSek / totalSek) * 100) : 0;
  var pTerr = totalSek > 0 ? Math.round((_db.terrainSek / totalSek) * 100) : 0;
  var pKort = totalSek > 0 ? Math.round((_db.kortStoppSek / totalSek) * 100) : 0;
  var pAvbr = totalSek > 0 ? Math.round((_db.avbrottSek / totalSek) * 100) : 0;
  var pRast = totalSek > 0 ? Math.max(0, Math.round((_db.rastSek / totalSek) * 100)) : 0;

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
  var _g15El = document.getElementById('tidG15Val'); if (_g15El) _g15El.textContent = g15h + 'h';
  var _avbrEl = document.getElementById('tidAvbrVal'); if (_avbrEl) _avbrEl.textContent = avbrH + 'h';
}

// Expose to global scope for onclick handlers
// Produktion sub-tabs
var _prodSubTab = 'daglig';
var _subTabs = [
  {key:'daglig',label:'Daglig'},
  {key:'medelstam',label:'Medelstam'},
  {key:'rpau',label:'RP \\u00b7 AU'},
  {key:'sortiment',label:'Sortiment'}
];
function switchProdSub(tab) {
  _prodSubTab = tab;
  _subTabs.forEach(function(t) {
    var els = document.querySelectorAll('.ps-'+t.key);
    els.forEach(function(el) {
      if (t.key === tab) el.classList.remove('ps-hidden');
      else el.classList.add('ps-hidden');
    });
  });
  // Update button styles
  var btns = document.querySelectorAll('.ps-btn');
  btns.forEach(function(btn) {
    var isActive = btn.getAttribute('data-tab') === tab;
    btn.style.background = isActive ? 'rgba(90,255,140,0.15)' : 'transparent';
    btn.style.color = isActive ? 'rgba(90,255,140,0.9)' : '#7a7a72';
  });
}
var prodSubTabsEl = document.getElementById('prodSubTabs');
if (prodSubTabsEl) {
  prodSubTabsEl.innerHTML = _subTabs.map(function(t) {
    var isActive = t.key === _prodSubTab;
    return '<button class="ps-btn" data-tab="'+t.key+'" onclick="switchProdSub(\\''+t.key+'\\')" style="border:none;border-radius:6px;padding:10px 14px;font-family:inherit;font-size:11px;font-weight:500;cursor:pointer;letter-spacing:0.2px;background:'+(isActive?'rgba(90,255,140,0.15)':'transparent')+';color:'+(isActive?'rgba(90,255,140,0.9)':'#7a7a72')+';">'+t.label+'</button>';
  }).join('');
}

Object.assign(window, {
  toggleMMenu, pickM, openForare, closeForare, openBolag, closeBolag,
  openTradslag, closeTradslag, openTid, closeTid, toggleCmp, runCmp,
  openDag, closeDag, openObjTyp, closeObjTyp, openObjJmf, closeObjJmf,
  openInkopare, closeInkopare, toggleForareAvbrott, closeAllPanels, switchProdSub
});
})();`;

type PeriodKpi = {
  volym: number; stammar: number; g15Timmar: number;
  produktivitet: number; medelstam: number; label: string;
};

export default function Maskinvy() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [vald, setVald] = useState('');
  const [activeView, setActiveView] = useState('idag');
  const [dataVersion, setDataVersion] = useState(0); // increments on each data load
  const [period, setPeriod] = useState<'V' | 'M' | 'K' | 'Å'>('M');
  const [periodOffset, setPeriodOffset] = useState(0); // 0=current, -1=previous, etc.
  const [loading, setLoading] = useState(false);
  const [maskinOpen, setMaskinOpen] = useState(false);
  const [filterAtgard, setFilterAtgard] = useState('');
  const [availableAtgarder, setAvailableAtgarder] = useState<string[]>([]);
  // Idag-data
  type IdagData = { vol: number; st: number; g15h: number; prod: number; medelstam: number; bransle: number; bransleLm3: number; utnyttj: number; operatorer: Array<{ namn: string; objekt: string; start: string; vol: number; prod: number }>; tidFord: { proc: number; terr: number; avbrott: number; rast: number; ovrigt: number }; bolag: Array<{ namn: string; vol: number; pct: number }>; trend: Array<{ datum: string; label: string; vol: number; helg: boolean }>; senastAktiv: { datum: string; tid: string | null } | null };
  const [idagData, setIdagData] = useState<IdagData | null>(null);
  const [idagLoading, setIdagLoading] = useState(false);

  // ── Period comparison state ──
  const [showCmp, setShowCmp] = useState(false);
  // Default comparison: previous month vs current month
  const [cmpDateA, setCmpDateA] = useState(() => {
    const now = new Date();
    const ps = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pe = new Date(now.getFullYear(), now.getMonth(), 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { start: `${ps.getFullYear()}-${pad(ps.getMonth()+1)}-01`, end: `${pe.getFullYear()}-${pad(pe.getMonth()+1)}-${pad(pe.getDate())}` };
  });
  const [cmpDateB, setCmpDateB] = useState(() => {
    const now = new Date();
    const ce = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { start: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, end: `${ce.getFullYear()}-${pad(ce.getMonth()+1)}-${pad(ce.getDate())}` };
  });
  const [cmpDataA, setCmpDataA] = useState<PeriodKpi | null>(null);
  const [cmpDataB, setCmpDataB] = useState<PeriodKpi | null>(null);
  const [cmpLoading, setCmpLoading] = useState(false);


  // ── Machine comparison state ──
  // Combo ID maps to multiple maskin_ids for machines that were swapped
  const COMBO_IDS: Record<string, string[]> = { 'R64101+R64428': ['R64101', 'R64428'] };
  const resolveIds = (id: string): string[] => COMBO_IDS[id] || [id];
  const GALLRING_IDS = new Set(['R64101', 'R64428']);
  function getMedelstamKlasser(mIds: string[]): { edges: number[]; labels: string[] } {
    const isGallring = mIds.some(id => GALLRING_IDS.has(id)) && !mIds.includes('PONS20SDJAA270231');
    if (isGallring) {
      // Gallring: 0.03–0.039, 0.04–0.049, ..., 0.20+
      const edges = [0, 0.03, 0.04, 0.05, 0.055, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.20, Infinity];
      const labels = [
        '<0.03', '0.03', '0.04', '0.05', '0.055', '0.06', '0.07', '0.08', '0.09',
        '0.10', '0.11', '0.12', '0.13', '0.14', '0.15', '0.16', '0.17', '0.18', '0.19', '0.20+',
      ];
      return { edges, labels };
    }
    // Slutavverkning: <0.20, 0.20, 0.25, ..., 0.95, 1.00+
    const edges: number[] = [0, 0.175]; // <0.20 = allt under 0.175
    const labels: string[] = ['<0.20'];
    for (let v = 0.20; v <= 0.95; v = parseFloat((v + 0.05).toFixed(2))) {
      edges.push(v + 0.025);
      labels.push(v.toFixed(2));
    }
    edges.push(Infinity);
    labels.push('1.00+');
    return { edges, labels };
  }
  const allMachines: { id: string; namn: string }[] = [
    { id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion Giant 8W' },
    { id: 'R64101', namn: 'Rottne H8E (ny)' },
    { id: 'R64428', namn: 'Rottne H8E (gammal)' },
    { id: 'R64101+R64428', namn: 'Rottne H8E (båda)' },
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
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } }, title: { display: true, text: 'm³/G15h', color: '#7a7a72', font: { size: 11 } } },
        },
      },
    });
  }, [machCmpMonths, machCmpRows]);

  // ── Hardcoded machines (from database inspection) ──
  useEffect(() => {
    const skordare: Maskin[] = [
      { maskin_id: 'PONS20SDJAA270231', modell: 'Scorpion Giant 8W', tillverkare: 'Ponsse', typ: 'Skördare' },
      { maskin_id: 'R64101', modell: 'H8E (ny)', tillverkare: 'Rottne', typ: 'Skördare' },
      { maskin_id: 'R64101+R64428', modell: 'H8E (total)', tillverkare: 'Rottne', typ: 'Skördare' },
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
      // Q1=jan-mar, Q2=apr-jun, Q3=jul-sep, Q4=okt-dec
      // Start from month 0 of current year, step by 3 months per quarter
      const currentQ = Math.floor(now.getMonth() / 3); // 0-3
      const totalQ = now.getFullYear() * 4 + currentQ + offset;
      const year = Math.floor(totalQ / 4);
      const qIdx = ((totalQ % 4) + 4) % 4; // 0=Q1, 1=Q2, 2=Q3, 3=Q4
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
  const fetchDbData = useCallback(async (maskinId: any, p: 'V' | 'M' | 'K' | 'Å' = 'M', pOffset = 0, atgardFilter = '') => {
    if (!maskinId) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getPeriodDates(p, pOffset);
      console.log('[Maskinvy] fetchDbData:', { maskinId, period: p, pOffset, startDate, endDate, atgardFilter });

      // maskinId may be an array (combo machine) or single string
      const maskinIds = Array.isArray(maskinId) ? maskinId : [maskinId];
      const rawProdData = await fetchAllRows((from, to) =>
        supabase.from('fakt_produktion')
          .select('datum, volym_m3sub, stammar, operator_id, objekt_id, processtyp, tradslag_id')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate)
          .range(from, to)
      );

      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const totalDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;

      // Fetch tid for all maskinIds, plus operators from all
      const [tidRes, opRes, objRes, skiftRes, tradslagRes] = await Promise.all([
        supabase.from('fakt_tid')
          .select('datum, operator_id, objekt_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, kort_stopp_sek, avbrott_sek, rast_sek, engine_time_sek, bransle_liter')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
        supabase.from('dim_operator').select('operator_id, operator_key, operator_namn, maskin_id').in('maskin_id', maskinIds),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, bolag, inkopare, avverkningsform, certifiering, timpeng, atgard'),
        supabase.from('fakt_skift')
          .select('datum, inloggning_tid, utloggning_tid')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
        supabase.from('dim_tradslag').select('tradslag_id, namn').in('maskin_id', maskinIds),
      ]);

      const operators = opRes.data || [];
      const objekter = objRes.data || [];

      // Build available åtgärder for filter buttons
      const atgSet = new Set<string>();
      for (const o of objekter) { if (o.atgard && o.atgard.trim()) atgSet.add(o.atgard.trim()); }
      setAvailableAtgarder(Array.from(atgSet).sort());

      // Filter prod rows by åtgärd if filter is active
      let rawProdRows = rawProdData;
      if (atgardFilter) {
        const filteredObjIds = new Set(objekter.filter((o: any) => (o.atgard || '').trim() === atgardFilter).map((o: any) => o.objekt_id));
        rawProdRows = rawProdData.filter((r: any) => filteredObjIds.has(r.objekt_id));
        console.log(`[Maskinvy] Åtgärdsfilter "${atgardFilter}": ${rawProdData.length} → ${rawProdRows.length} prod-rader (${filteredObjIds.size} objekt)`);
      }

      console.log('[Maskinvy] Data loaded:', { maskinIds, rawProd: rawProdRows.length, rawTid: (tidRes.data||[]).length });

      // Consolidate fakt_tid rows per (datum, operator_id, objekt_id) by SUMMING
      // all fields. Earlier versions picked the row with highest engine_time_sek,
      // but that silently dropped rows where other fields (notably kort_stopp_sek
      // for Ponsse) were non-zero but engine_time_sek happened to be lower.
      // Summing matches the DB SUM the SQL query returns.
      const tidConsolidated: Record<string, any> = {};
      for (const r of (tidRes.data || [])) {
        const key = `${r.datum}|${r.operator_id || ''}|${r.objekt_id || ''}`;
        if (!tidConsolidated[key]) {
          tidConsolidated[key] = {
            datum: r.datum,
            operator_id: r.operator_id,
            objekt_id: r.objekt_id,
            processing_sek: 0, terrain_sek: 0, other_work_sek: 0,
            maintenance_sek: 0, disturbance_sek: 0, kort_stopp_sek: 0,
            avbrott_sek: 0, rast_sek: 0, engine_time_sek: 0, bransle_liter: 0,
          };
        }
        const c = tidConsolidated[key];
        c.processing_sek += r.processing_sek || 0;
        c.terrain_sek += r.terrain_sek || 0;
        c.other_work_sek += r.other_work_sek || 0;
        c.maintenance_sek += r.maintenance_sek || 0;
        c.disturbance_sek += r.disturbance_sek || 0;
        c.kort_stopp_sek += r.kort_stopp_sek || 0;
        c.avbrott_sek += r.avbrott_sek || 0;
        c.rast_sek += r.rast_sek || 0;
        c.engine_time_sek += r.engine_time_sek || 0;
        c.bransle_liter += parseFloat(r.bransle_liter) || 0;
      }
      let rawTidRows = Object.values(tidConsolidated);

      // Filter tid rows by same objekt_ids if åtgärd filter is active
      if (atgardFilter) {
        const filteredObjIds = new Set(objekter.filter((o: any) => (o.atgard || '').trim() === atgardFilter).map((o: any) => o.objekt_id));
        rawTidRows = rawTidRows.filter((r: any) => filteredObjIds.has(r.objekt_id));
      }

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
          dailyDates: emptyDays,
          totalVolym: 0, totalStammar: 0, g15Timmar: 0,
          produktivitet: 0, medelstam: 0,
          processingSek: 0, terrainSek: 0, kortStoppSek: 0,
          avbrottSek: 0, rastSek: 0, engineTimeSek: 0,
          operatorer: [], objekt: [], dagData: {},
          calendarDt: new Array(totalDays).fill(0),
          bransleTotalt: 0, branslePerM3: 0, stammarPerG15h: 0, utnyttjandegrad: 0,
          avbrottTotal: { timmar: 0, antal: 0, snittMin: 0 }, avbrottPerKategori: [], avbrottPerManad: [],
          klassLabels: [], klassVolym: [], klassStammar: [],
          klassM3g15: [], klassStg15: [], klassDieselM3: [], klassMthPct: [],
          mthAndelPct: 0, mthMedelstam: 0, singleMedelstam: 0,
          sortimentData: { categories: ['Sägtimmer','Kubb','Massaved','Energived'], totals: [0,0,0,0] },
          hasMth: false, sortimentPerDag: null,
          bolagData: [], objTypList: [], timpengData: [], inkopareData: [], atgardKlassData: {}, atgardM3g15Data: {}, tradslagData: { 'Gran': 0, 'Tall': 0, 'Björk': 0, 'Övr. löv': 0 }, periodStartDate: startDate, totalDays,
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
      type ProdAgg = { vol: number; st: number; mthSt: number };
      const prodByDay: Record<string, ProdAgg> = {};                        // per datum
      const prodByDayOp: Record<string, ProdAgg> = {};                      // per datum|operator_id
      const prodByObjekt: Record<string, ProdAgg> = {};                     // per objekt_id
      const prodObjIds = new Set<string>();

      for (const r of rawProdRows) {
        const d = r.datum;
        const isMth = r.processtyp === 'MTH' ? (r.stammar || 0) : 0;
        // Per day totals
        if (!prodByDay[d]) prodByDay[d] = { vol: 0, st: 0, mthSt: 0 };
        prodByDay[d].vol += r.volym_m3sub || 0;
        prodByDay[d].st += r.stammar || 0;
        prodByDay[d].mthSt += isMth;
        // Per day+operator
        const opKey = `${d}|${r.operator_id || ''}`;
        if (!prodByDayOp[opKey]) prodByDayOp[opKey] = { vol: 0, st: 0, mthSt: 0 };
        prodByDayOp[opKey].vol += r.volym_m3sub || 0;
        prodByDayOp[opKey].st += r.stammar || 0;
        prodByDayOp[opKey].mthSt += isMth;
        // Per objekt
        if (r.objekt_id) {
          prodObjIds.add(r.objekt_id);
          if (!prodByObjekt[r.objekt_id]) prodByObjekt[r.objekt_id] = { vol: 0, st: 0, mthSt: 0 };
          prodByObjekt[r.objekt_id].vol += r.volym_m3sub || 0;
          prodByObjekt[r.objekt_id].st += r.stammar || 0;
          prodByObjekt[r.objekt_id].mthSt += isMth;
        }
      }

      // Debug: inspektera en specifik dag+operator
      const _debugKey = '2026-01-20|R64101_7';
      const _debugDayOp = prodByDayOp[_debugKey];
      const _debugRawRows = rawProdRows.filter((r: any) => r.datum === '2026-01-20' && r.operator_id === 'R64101_7');
      if (_debugDayOp || _debugRawRows.length > 0) {
        console.log(`[ProdByDayOp debug] key="${_debugKey}":`, {
          prodByDayOp_st: _debugDayOp?.st, prodByDayOp_vol: _debugDayOp?.vol, prodByDayOp_mthSt: _debugDayOp?.mthSt,
          rawRows: _debugRawRows.length,
          rawRowsDetail: _debugRawRows.map((r: any) => ({ tradslag: r.tradslag_id, processtyp: r.processtyp, stammar: r.stammar, vol: r.volym_m3sub, objekt: r.objekt_id })),
          rawSumStammar: _debugRawRows.reduce((s: number, r: any) => s + (r.stammar || 0), 0),
          rawSumVol: _debugRawRows.reduce((s: number, r: any) => s + (r.volym_m3sub || 0), 0),
        });
      }

      // ── Aggregate fakt_tid per (datum, operator_id, objekt_id) ──
      type TidAgg = { processingSek: number; terrainSek: number; otherWorkSek: number; disturbanceSek: number; maintenanceSek: number; kortStoppSek: number; avbrottSek: number; rastSek: number; engineTimeSek: number; bransleLiter: number };
      const emptyTid = (): TidAgg => ({ processingSek: 0, terrainSek: 0, otherWorkSek: 0, disturbanceSek: 0, maintenanceSek: 0, kortStoppSek: 0, avbrottSek: 0, rastSek: 0, engineTimeSek: 0, bransleLiter: 0 });
      const addTid = (agg: TidAgg, r: any) => {
        agg.processingSek += r.processing_sek || 0;
        agg.terrainSek += r.terrain_sek || 0;
        agg.otherWorkSek += r.other_work_sek || 0;
        agg.disturbanceSek += r.disturbance_sek || 0;
        agg.maintenanceSek += r.maintenance_sek || 0;
        agg.kortStoppSek += r.kort_stopp_sek || 0;
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
      const dailyDates: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(sDate); d.setDate(d.getDate() + i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const p = prodByDay[dateStr];
        dailyVol.push(p ? Math.round(p.vol) : 0);
        dailySt.push(p ? Math.round(p.st) : 0);
        dayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
        dailyDates.push(dateStr);
      }

      // ── KPI totals (from pre-aggregated data) ──
      const totalVolym = Object.values(prodByDay).reduce((s, d) => s + d.vol, 0);
      const totalStammar = Object.values(prodByDay).reduce((s, d) => s + d.st, 0);

      // ── Time distribution (from tid grand total — never mixed with prod) ──
      const processingSek = tidTotal.processingSek;
      const terrainSek = tidTotal.terrainSek;
      const kortStoppSek = tidTotal.kortStoppSek;
      // OBS: avbrottSek hämtas nedan från fakt_avbrott (SUM langd_sek), INTE från
      // fakt_tid.avbrott_sek som är ofullständig. Se totalAvbrottSek-beräkningen.
      const rastSek = tidTotal.rastSek;
      const engineTimeSek = tidTotal.engineTimeSek;
      const bransleTotalt = tidTotal.bransleLiter;

      const g15Sek = processingSek + terrainSek; // G15 = processing + terrain
      const g15Timmar = g15Sek / 3600;
      const produktivitet = g15Timmar > 0 ? totalVolym / g15Timmar : 0;
      const medelstam = totalStammar > 0 ? totalVolym / totalStammar : 0;
      const branslePerM3 = totalVolym > 0 ? bransleTotalt / totalVolym : 0;
      const stammarPerG15h = g15Timmar > 0 ? totalStammar / g15Timmar : 0;

      // ── MTH stats from processtyp ──
      let mthStammar = 0, mthVolym = 0, singleStammar = 0, singleVolym = 0;
      for (const r of rawProdRows) {
        if (r.processtyp === 'MTH') { mthStammar += r.stammar || 0; mthVolym += r.volym_m3sub || 0; }
        else { singleStammar += r.stammar || 0; singleVolym += r.volym_m3sub || 0; }
      }
      const mthAndelPct = totalStammar > 0 ? Math.round(mthStammar / totalStammar * 100) : 0;
      const mthMedelstam = mthStammar > 0 ? parseFloat((mthVolym / mthStammar).toFixed(3)) : 0;
      const singleMedelstam = singleStammar > 0 ? parseFloat((singleVolym / singleStammar).toFixed(3)) : 0;

      // ── Utnyttjandegrad: effektiv G15h / inloggad tid ──
      const effG15h = (tidTotal.processingSek + tidTotal.terrainSek + tidTotal.kortStoppSek) / 3600;
      const [arbetsdagRes, opMedRes, avbrottRes] = await Promise.all([
        supabase.from('arbetsdag')
          .select('medarbetare_id, arbetad_min')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
        supabase.from('operator_medarbetare')
          .select('operator_id, medarbetare_id'),
        supabase.from('fakt_avbrott')
          .select('datum, kategori_kod, langd_sek')
          .in('maskin_id', maskinIds)
          .gte('datum', startDate).lte('datum', endDate),
      ]);
      const arbetsdagRows = arbetsdagRes.data || [];
      const totalArbetadMin = arbetsdagRows.reduce((s: number, r: any) => s + (r.arbetad_min || 0), 0);
      const inloggadH = totalArbetadMin / 60;
      const utnyttjandegrad = inloggadH > 0 ? parseFloat((effG15h / inloggadH * 100).toFixed(1)) : 0;

      // Per-operator utnyttjandegrad: map operator_id → medarbetare_id → SUM(arbetad_min)
      const opToMed: Record<string, string> = {};
      for (const r of (opMedRes.data || [])) opToMed[r.operator_id] = r.medarbetare_id;
      const medArbetad: Record<string, number> = {};
      for (const r of arbetsdagRows) {
        if (!r.medarbetare_id) continue;
        medArbetad[r.medarbetare_id] = (medArbetad[r.medarbetare_id] || 0) + (r.arbetad_min || 0);
      }

      // ── Avbrott aggregation ──
      const avbrottRows = avbrottRes.data || [];
      const katAgg: Record<string, { sek: number; antal: number }> = {};
      const manadKat: Record<string, Record<string, number>> = {};
      for (const r of avbrottRows) {
        const kat = r.kategori_kod || 'Övrigt';
        if (!katAgg[kat]) katAgg[kat] = { sek: 0, antal: 0 };
        katAgg[kat].sek += r.langd_sek || 0;
        katAgg[kat].antal += 1;
        const ym = r.datum.substring(0, 7);
        if (!manadKat[ym]) manadKat[ym] = {};
        manadKat[ym][kat] = (manadKat[ym][kat] || 0) + (r.langd_sek || 0) / 3600;
      }
      const totalAvbrottSek = avbrottRows.reduce((s: number, r: any) => s + (r.langd_sek || 0), 0);
      // avbrottSek för tidsfördelningskortet — samma källa som Avbrott-fliken (fakt_avbrott)
      const avbrottSek = totalAvbrottSek;
      const avbrottTotal = {
        timmar: parseFloat((totalAvbrottSek / 3600).toFixed(1)),
        antal: avbrottRows.length,
        snittMin: avbrottRows.length > 0 ? Math.round(totalAvbrottSek / avbrottRows.length / 60) : 0,
      };
      const avbrottPerKategori = Object.entries(katAgg)
        .map(([k, v]) => ({ kategori: k, timmar: parseFloat((v.sek / 3600).toFixed(1)), antal: v.antal, snittMin: v.antal > 0 ? Math.round(v.sek / v.antal / 60) : 0 }))
        .sort((a, b) => b.timmar - a.timmar);
      const avbrottPerManad = Object.keys(manadKat).sort().map(ym => ({ month: ym, byKat: manadKat[ym] }));

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
        // m³/G15h = volym from fakt_produktion / g15h from fakt_tid
        const opG15sek = tOp.processingSek + tOp.terrainSek;
        const g15h = opG15sek / 3600;
        // timmar = G15h from fakt_tid
        const timmar = g15h;
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
        // Utnyttjandegrad per operator: effG15h / inloggad tid from arbetsdag
        const opEffG15h = (tOp.processingSek + tOp.terrainSek + tOp.kortStoppSek) / 3600;
        const medId = opToMed[opId];
        const opArbetadMin = medId ? (medArbetad[medId] || 0) : 0;
        const opInloggadH = opArbetadMin / 60;
        const utnyttjandePct = opInloggadH > 0 ? parseFloat((opEffG15h / opInloggadH * 100).toFixed(1)) : 0;

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
          utnyttjandePct,
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
          namn: objInfo?.object_name || `Objekt ${oid}`,
          vo_nummer: objInfo?.vo_nummer || '',
          volym: pAgg.vol, stammar: pAgg.st, g15h,
          prod: g15h > 0 ? pAgg.vol / g15h : 0,
        };
      }).sort((a, b) => b.volym - a.volym);

      // ── Build shift time lookup from fakt_skift (min login, max logout per datum) ──
      const skiftByDay: Record<string, { start: string; slut: string }> = {};
      for (const r of (skiftRes.data || [])) {
        if (!r.datum || !r.inloggning_tid || !r.utloggning_tid) continue;
        const login = r.inloggning_tid.substring(11, 16);   // "HH:MM"
        const logout = r.utloggning_tid.substring(11, 16);
        if (!skiftByDay[r.datum]) {
          skiftByDay[r.datum] = { start: login, slut: logout };
        } else {
          if (login < skiftByDay[r.datum].start) skiftByDay[r.datum].start = login;
          if (logout > skiftByDay[r.datum].slut) skiftByDay[r.datum].slut = logout;
        }
      }

      // ── Group avbrott per day ──
      const avbrottByDay: Record<string, Array<{ orsak: string; tid: string }>> = {};
      for (const r of avbrottRows) {
        const dateStr = r.datum;
        if (!avbrottByDay[dateStr]) avbrottByDay[dateStr] = [];
        const sek = r.langd_sek || 0;
        const min = Math.round(sek / 60);
        const tid = min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 > 0 ? (min % 60) + 'min' : ''}` : `${min} min`;
        avbrottByDay[dateStr].push({ orsak: translateKategori(r.kategori_kod || 'Övrigt'), tid });
      }

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
            objekt: objInfo?.object_name || '–',
            start: skiftByDay[dateStr]?.start || '–', slut: skiftByDay[dateStr]?.slut || '–',
            vol: Math.round(pDay.vol), stammar: Math.round(pDay.st),
            g15: parseFloat(g15h.toFixed(1)),
            snitt: g15h > 0 ? parseFloat((pDay.vol / g15h).toFixed(1)) : 0,
            stg15: g15h > 0 ? Math.round(pDay.st / g15h) : 0,
            medelstam: pDay.st > 0 ? parseFloat((pDay.vol / pDay.st).toFixed(2)) : 0,
            diesel: pDay.vol > 0 ? parseFloat((diesel / pDay.vol).toFixed(1)) : 0,
            avbrott: avbrottByDay[dateStr] || [],
          };
          calendarDt[i] = 1;
        }
      }

      // ── Medelstamsklass-aggregering ──
      // BARA pre-aggregerad data, ALDRIG direkt join:
      //   prodByDayOp[datum|opId] → {vol, st, mthSt}  (fakt_produktion summerat separat)
      //   tidByDayOp[datum|opId]  → TidAgg             (fakt_tid summerat separat)
      const { edges, labels: klassLabels } = getMedelstamKlasser(maskinIds);
      const nKlass = edges.length - 1;

      const klassStammar = new Array(nKlass).fill(0);
      const klassG15h    = new Array(nKlass).fill(0);
      const klassVolym   = new Array(nKlass).fill(0);
      const klassMthSt   = new Array(nKlass).fill(0);

      const _debugRows: string[] = [];
      let _debugCount = 0;
      for (const [key, prod] of Object.entries(prodByDayOp)) {
        if (prod.st === 0) continue;
        const medelstam = prod.vol / prod.st;
        const tid = tidByDayOp[key];
        const g15h = tid ? (tid.processingSek + tid.terrainSek) / 3600 : 0;

        if (_debugCount < 3) {
          console.log('[Klass debug]', key, 'st:', prod.st, 'mthSt:', prod.mthSt, 'vol:', Math.round(prod.vol), 'medelstam:', medelstam.toFixed(3));
          _debugCount++;
        }

        // Hitta rätt klass
        let placed = false;
        for (let i = 0; i < nKlass; i++) {
          if (medelstam >= edges[i] && medelstam < edges[i + 1]) {
            klassStammar[i] += prod.st;
            klassG15h[i] += g15h;
            klassVolym[i] += prod.vol;
            klassMthSt[i] += prod.mthSt || 0;
            if (_debugRows.length < 5) {
              _debugRows.push(`"${key}" → medelstam:${medelstam.toFixed(3)}, g15h:${g15h.toFixed(1)}h, stammar:${Math.round(prod.st)} → klass:${klassLabels[i]}`);
            }
            placed = true;
            break;
          }
        }
        if (!placed && _debugRows.length < 5) {
          _debugRows.push(`"${key}" → medelstam:${medelstam.toFixed(3)} EJ PLACERAD (utanför edges)`);
        }
      }
      const _prodByDayOpTotalSt = Object.values(prodByDayOp).reduce((s: number, p: any) => s + p.st, 0);
      const _klassStammarTotal = klassStammar.reduce((a: number, b: number) => a + b, 0);
      console.log('[Klass total stammar från prodByDayOp]', Math.round(_prodByDayOpTotalSt));
      console.log('[Klass total klassStammar]', Math.round(_klassStammarTotal));
      console.log(`[Maskinvy] Klassberäkning: ${Object.keys(prodByDayOp).length} dagliga poster (prodByDayOp), ${Object.keys(tidByDayOp).length} tidposter (tidByDayOp)`);
      console.log(`[Maskinvy] Första 5 poster:`, _debugRows);

      // Beräkna produktivitet per klass
      const klassM3g15 = klassG15h.map((h, i) => h > 0 ? parseFloat((klassVolym[i] / h).toFixed(1)) : 0);
      const klassStg15 = klassG15h.map((h, i) => h > 0 ? Math.round(klassStammar[i] / h) : 0);

      // Avrunda volym och stammar
      for (let i = 0; i < nKlass; i++) {
        klassVolym[i] = Math.round(klassVolym[i]);
        klassStammar[i] = Math.round(klassStammar[i]);
      }

      const klassDieselM3 = new Array(nKlass).fill(0);
      const klassMthPct = klassStammar.map((st: number, i: number) => st > 0 ? Math.round(klassMthSt[i] / st * 100) : 0);

      // Verifiering
      const sumKlassVol = klassVolym.reduce((s: number, v: number) => s + v, 0);
      const sumKlassSt = klassStammar.reduce((s: number, v: number) => s + v, 0);
      const sumKlassMth = klassMthSt.reduce((s: number, v: number) => s + v, 0);
      const sumKlassG15 = klassG15h.reduce((s: number, v: number) => s + v, 0);
      console.log(`[Maskinvy] Klasser: sumVol=${sumKlassVol} totalVol=${Math.round(totalVolym)} sumSt=${sumKlassSt} totalSt=${Math.round(totalStammar)} sumMth=${Math.round(sumKlassMth)} sumG15h=${sumKlassG15.toFixed(1)} totalG15h=${g15Timmar.toFixed(1)}`);
      console.log(`[Maskinvy] Per klass:`, klassLabels.map((l, i) => `${l}: ${klassVolym[i]}m³ ${klassStammar[i]}st MTH:${Math.round(klassMthSt[i])}st=${klassMthPct[i]}% ${klassG15h[i].toFixed(1)}h`));

      // ── Volym per klass per åtgärd (för jämförelsediagram) ──
      // Aggregera per (datum, operator_id, objekt_id) för att veta åtgärd
      const objAtgardMap: Record<string, string> = {};
      for (const o of objekter) { if (o.atgard && o.atgard.trim()) objAtgardMap[o.objekt_id] = o.atgard.trim(); }
      type AtgProdGroup = { vol: number; st: number };
      const atgProdByDayOpObj: Record<string, AtgProdGroup & { objekt_id: string }> = {};
      for (const r of rawProdRows) {
        const key = `${r.datum}|${r.operator_id || ''}|${r.objekt_id || ''}`;
        if (!atgProdByDayOpObj[key]) atgProdByDayOpObj[key] = { vol: 0, st: 0, objekt_id: r.objekt_id || '' };
        atgProdByDayOpObj[key].vol += r.volym_m3sub || 0;
        atgProdByDayOpObj[key].st += r.stammar || 0;
      }
      const atgardKlassVolym: Record<string, number[]> = {};
      const atgardKlassG15sek: Record<string, number[]> = {};
      for (const [key, g] of Object.entries(atgProdByDayOpObj)) {
        if (g.st === 0) continue;
        const atg = objAtgardMap[g.objekt_id] || '';
        if (!atg) continue;
        const ms = g.vol / g.st;
        // G15h: hämta från tidByDayOp med datum|operator_id (utan objekt_id)
        const parts = key.split('|');
        const tidKey = parts[0] + '|' + parts[1];
        const tid = tidByDayOp[tidKey];
        // Fördela tid proportionellt efter volym om flera objekt samma dag+operator
        const dayOpProd = prodByDayOp[tidKey];
        const volShare = dayOpProd && dayOpProd.vol > 0 ? g.vol / dayOpProd.vol : 0;
        const g15sek = tid ? (tid.processingSek + tid.terrainSek) * volShare : 0;
        for (let i = 0; i < nKlass; i++) {
          if (ms >= edges[i] && ms < edges[i + 1]) {
            if (!atgardKlassVolym[atg]) atgardKlassVolym[atg] = new Array(nKlass).fill(0);
            if (!atgardKlassG15sek[atg]) atgardKlassG15sek[atg] = new Array(nKlass).fill(0);
            atgardKlassVolym[atg][i] += g.vol;
            atgardKlassG15sek[atg][i] += g15sek;
            break;
          }
        }
      }
      // Avrunda volym och beräkna m³/G15h per åtgärd per klass
      const atgardKlassData: Record<string, number[]> = {};
      const atgardM3g15Data: Record<string, number[]> = {};
      for (const [atg, vols] of Object.entries(atgardKlassVolym)) {
        const rounded = vols.map(v => Math.round(v));
        if (rounded.some(v => v > 0)) atgardKlassData[atg] = rounded;
        const g15arr = atgardKlassG15sek[atg] || [];
        atgardM3g15Data[atg] = vols.map((v, i) => {
          const h = g15arr[i] / 3600;
          return h > 0 ? parseFloat((v / h).toFixed(1)) : 0;
        });
      }

      // ── Fetch sortiment data (always — used for sortChart + sortimentPerDag) ──
      const mthCheck = await supabase.from('fakt_produktion')
        .select('processtyp')
        .in('maskin_id', maskinIds)
        .eq('processtyp', 'MTH')
        .limit(1);
      const hasMth = (mthCheck.data?.length || 0) > 0;

      // Sortiment: classify each dim_sortiment by category + trädslag
      const CATS = ['Sägtimmer', 'Kubb', 'Massaved', 'Energived'] as const;
      const nCats = CATS.length;
      const emptySortData = (): DbData['sortimentData'] => ({ categories: [...CATS], totals: Array(nCats).fill(0) });
      let sortimentData = emptySortData();
      let sortimentPerDag: DbData['sortimentPerDag'] = null;
      const objIds = [...prodObjIds];
      if (objIds.length > 0) {
        const [sortRows, dimSortRes] = await Promise.all([
          fetchAllRows((from, to) =>
            supabase.from('fakt_sortiment')
              .select('objekt_id, sortiment_id, volym_m3sub')
              .in('objekt_id', objIds)
              .range(from, to)
          ),
          supabase.from('dim_sortiment')
            .select('sortiment_id, namn'),
        ]);
        const dimSort = dimSortRes.data || [];

        // Classify each sortiment_id → category index
        const catMap: Record<string, number> = {};
        for (const s of dimSort) {
          const n = (s.namn || '').toLowerCase();
          let catIdx = 3; // default Energived
          if (n.includes('timmer') || n.includes('såg') || n.includes('stock')) catIdx = 0;
          else if (n.includes('kubb')) catIdx = 1;
          else if (n.includes('massa') || n.includes('flis')) catIdx = 2;
          catMap[s.sortiment_id] = catIdx;
        }

        // Aggregate total volym per category
        const sd = emptySortData();
        for (const r of sortRows) {
          const ci = catMap[r.sortiment_id] ?? 3;
          sd.totals[ci] += r.volym_m3sub || 0;
        }
        sd.totals = sd.totals.map(v => Math.round(v));
        sortimentData = sd;

        // Per-dag breakdown (for alternative chart when no MTH)
        if (!hasMth) {
          const objCat: Record<string, number[]> = {};
          for (const r of sortRows) {
            const ci = catMap[r.sortiment_id] ?? 3;
            if (!r.objekt_id) continue;
            if (!objCat[r.objekt_id]) objCat[r.objekt_id] = Array(nCats).fill(0);
            objCat[r.objekt_id][ci] += r.volym_m3sub || 0;
          }
          const dayCat: Record<string, number[]> = {};
          for (const r of rawProdRows) {
            if (!r.datum || !r.objekt_id) continue;
            if (!dayCat[r.datum]) dayCat[r.datum] = Array(nCats).fill(0);
            const oc = objCat[r.objekt_id];
            if (!oc) continue;
            const ocTotal = oc.reduce((a, b) => a + b, 0);
            if (ocTotal <= 0) continue;
            const dayVol = r.volym_m3sub || 0;
            for (let c = 0; c < nCats; c++) dayCat[r.datum][c] += dayVol * (oc[c] / ocTotal);
          }
          const sDays: string[] = [], timmer: number[] = [], kubb: number[] = [], massa: number[] = [], energi: number[] = [];
          for (let i = 0; i < totalDays; i++) {
            const d = new Date(sDate); d.setDate(d.getDate() + i);
            const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            sDays.push(`${d.getDate()}/${d.getMonth() + 1}`);
            const dc = dayCat[dateStr];
            timmer.push(dc ? Math.round(dc[0]) : 0);
            kubb.push(dc ? Math.round(dc[1]) : 0);
            massa.push(dc ? Math.round(dc[2]) : 0);
            energi.push(dc ? Math.round(dc[3]) : 0);
          }
          sortimentPerDag = { days: sDays, timmer, kubb, massa, energi };
        }
      }

      // ── Build bolagData from dim_objekt + prodByObjekt ──
      // Group case-insensitively (VIDA, Vida → same group), keep first-seen display name
      const bolagMap = new Map<string, { displayName: string; inkopareMap: Map<string, { namn: string; objekt: Array<{ namn: string; nr: string; typ: string; volym: number }> }> }>();
      for (const o of objekter) {
        const bRaw = (o.bolag || '').trim();
        const bKey = bRaw.toUpperCase() || 'ÖVRIGT';
        const bDisplay = bRaw || 'Övrigt';
        const iRaw = (o.inkopare || '').trim();
        const iKey = iRaw.toUpperCase() || '–';
        const iDisplay = iRaw || '–';
        if (!bolagMap.has(bKey)) bolagMap.set(bKey, { displayName: bDisplay, inkopareMap: new Map() });
        const bEntry = bolagMap.get(bKey)!;
        if (!bEntry.inkopareMap.has(iKey)) bEntry.inkopareMap.set(iKey, { namn: iDisplay, objekt: [] });
        const iEntry = bEntry.inkopareMap.get(iKey)!;
        const pObj = prodByObjekt[o.objekt_id];
        if (pObj && pObj.vol > 0) {
          const avvForm = (o.avverkningsform || '').toLowerCase();
          const typ = avvForm.includes('gallring') ? 'Gallring' : 'Slutavverkning';
          iEntry.objekt.push({
            namn: o.object_name || o.vo_nummer || o.objekt_id,
            nr: o.vo_nummer ? `VO ${o.vo_nummer}` : '',
            typ,
            volym: Math.round(pObj.vol),
          });
        }
      }
      const bolagArr: DbData['bolagData'] = [];
      bolagMap.forEach((b, bKey) => {
        const inkArr: DbData['bolagData'][0]['inkopare'] = [];
        b.inkopareMap.forEach((ink) => {
          if (ink.objekt.length === 0) return;
          const iVol = ink.objekt.reduce((s, o) => s + o.volym, 0);
          const words = ink.namn.split(' ');
          const init = words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : ink.namn.substring(0, 2).toUpperCase();
          inkArr.push({ namn: ink.namn, initialer: init, volym: iVol, objekt: ink.objekt });
        });
        if (inkArr.length === 0) return;
        const bVol = inkArr.reduce((s, i) => s + i.volym, 0);
        const logo = bKey.substring(0, 4);
        bolagArr.push({ key: bKey.replace(/\s/g, '_').toLowerCase(), logo, name: b.displayName, volym: bVol, pct: 0, inkopare: inkArr });
      });
      bolagArr.sort((a, b) => b.volym - a.volym);
      const totalBolagVol = bolagArr.reduce((s, b) => s + b.volym, 0);
      bolagArr.forEach(b => { b.pct = totalBolagVol > 0 ? Math.round(b.volym / totalBolagVol * 100) : 0; });

      // ── Build objTypList from atgard (Rp, Au, etc.) ──
      const atgardMap = new Map<string, { label: string; volym: number; stammar: number; g15sek: number; objekt: Array<{ namn: string; volym: number; stammar: number; g15sek: number }> }>();
      for (const o of objekter) {
        const atg = (o.atgard || '').trim();
        if (!atg) continue;
        const pObj = prodByObjekt[o.objekt_id];
        const tObj = tidByObjekt[o.objekt_id];
        if (!pObj || pObj.vol <= 0) continue;
        if (!atgardMap.has(atg)) atgardMap.set(atg, { label: atg, volym: 0, stammar: 0, g15sek: 0, objekt: [] });
        const a = atgardMap.get(atg)!;
        const oG15 = tObj ? tObj.processingSek + tObj.terrainSek : 0;
        a.volym += pObj.vol;
        a.stammar += pObj.st;
        a.g15sek += oG15;
        a.objekt.push({ namn: o.object_name || o.vo_nummer || '', volym: Math.round(pObj.vol), stammar: Math.round(pObj.st), g15sek: oG15 });
      }
      const objTypList: DbData['objTypList'] = [];
      atgardMap.forEach((a) => {
        const g15h = a.g15sek / 3600;
        objTypList.push({
          key: a.label.toLowerCase().replace(/\s/g, '_'),
          label: a.label, title: a.label,
          volym: Math.round(a.volym), stammar: Math.round(a.stammar),
          g15: parseFloat(g15h.toFixed(1)),
          prod: g15h > 0 ? parseFloat((a.volym / g15h).toFixed(1)) : 0,
          stg15: g15h > 0 ? Math.round(a.stammar / g15h) : 0,
          medelstam: a.stammar > 0 ? parseFloat((a.volym / a.stammar).toFixed(2)) : 0,
          objekt: a.objekt.map(o => {
            const oG15h = o.g15sek / 3600;
            return { namn: o.namn, volym: o.volym, stammar: o.stammar, prod: oG15h > 0 ? parseFloat((o.volym / oG15h).toFixed(1)) : 0 };
          }),
        });
      });
      objTypList.sort((a, b) => b.volym - a.volym);

      // ── Build timpengData from dim_objekt.timpeng ──
      const timpengGroups: Record<string, { volym: number; stammar: number; g15sek: number; objekt: Array<{ namn: string; volym: number; stammar: number; g15sek: number }> }> = { Timpeng: { volym: 0, stammar: 0, g15sek: 0, objekt: [] }, Ackord: { volym: 0, stammar: 0, g15sek: 0, objekt: [] } };
      for (const o of objekter) {
        const pObj = prodByObjekt[o.objekt_id];
        if (!pObj || pObj.vol <= 0) continue;
        const tObj = tidByObjekt[o.objekt_id];
        const oG15 = tObj ? tObj.processingSek + tObj.terrainSek : 0;
        const grp = o.timpeng === true ? 'Timpeng' : 'Ackord';
        timpengGroups[grp].volym += pObj.vol;
        timpengGroups[grp].stammar += pObj.st;
        timpengGroups[grp].g15sek += oG15;
        timpengGroups[grp].objekt.push({ namn: o.object_name || o.vo_nummer || '', volym: Math.round(pObj.vol), stammar: Math.round(pObj.st), g15sek: oG15 });
      }
      const timpengData: DbData['timpengData'] = Object.entries(timpengGroups)
        .filter(([, g]) => g.volym > 0)
        .map(([label, g]) => {
          const g15h = g.g15sek / 3600;
          return {
            key: label.toLowerCase(), label,
            volym: Math.round(g.volym), stammar: Math.round(g.stammar),
            g15: parseFloat(g15h.toFixed(1)),
            prod: g15h > 0 ? parseFloat((g.volym / g15h).toFixed(1)) : 0,
            stg15: g15h > 0 ? Math.round(g.stammar / g15h) : 0,
            medelstam: g.stammar > 0 ? parseFloat((g.volym / g.stammar).toFixed(2)) : 0,
            objekt: g.objekt.map(o => {
              const oG15h = o.g15sek / 3600;
              return { namn: o.namn, volym: o.volym, stammar: o.stammar, prod: oG15h > 0 ? parseFloat((o.volym / oG15h).toFixed(1)) : 0 };
            }),
          };
        });

      // ── Build inkopareData ──
      const tradslagMap: Record<string, string> = {};
      for (const t of (tradslagRes.data || [])) {
        const n = (t.namn || '').toUpperCase();
        const cat = n.includes('GRAN') ? 'Gran' : n.includes('TALL') ? 'Tall' : n.includes('BJÖRK') ? 'Björk' : 'Övr. löv';
        tradslagMap[t.tradslag_id] = cat;
      }

      // Aggregera total volym per trädslag från rawProdRows (används av sec-tradslag-kortet)
      const tradslagData: Record<string, number> = { 'Gran': 0, 'Tall': 0, 'Björk': 0, 'Övr. löv': 0 };
      for (const r of rawProdRows) {
        const ts = tradslagMap[r.tradslag_id] || 'Övr. löv';
        tradslagData[ts] = (tradslagData[ts] || 0) + (r.volym_m3sub || 0);
      }
      console.log('[Trädslag raw]', tradslagData);
      console.log('[Trädslag filter]', maskinId, startDate, endDate);
      // Aggregate per objekt_id: volym, stammar, per tradslag
      type ObjProdAgg = { vol: number; st: number; perTs: Record<string, number> };
      const prodPerObj: Record<string, ObjProdAgg> = {};
      for (const r of rawProdRows) {
        const oid = r.objekt_id || '';
        if (!prodPerObj[oid]) prodPerObj[oid] = { vol: 0, st: 0, perTs: {} };
        prodPerObj[oid].vol += r.volym_m3sub || 0;
        prodPerObj[oid].st += r.stammar || 0;
        const ts = tradslagMap[r.tradslag_id] || 'Övr. löv';
        prodPerObj[oid].perTs[ts] = (prodPerObj[oid].perTs[ts] || 0) + (r.volym_m3sub || 0);
      }
      // Group per inkopare
      type InkAgg = { namn: string; bolag: string; vol: number; st: number; g15sek: number; perAtgard: Record<string, number>; perTs: Record<string, number>; objekt: Array<{ namn: string; volym: number; stammar: number; atgard: string }> };
      const inkMap: Record<string, InkAgg> = {};
      for (const o of objekter) {
        const ink = (o.inkopare || '').trim();
        if (!ink) continue;
        const pObj = prodPerObj[o.objekt_id];
        if (!pObj || pObj.vol <= 0) continue;
        if (!inkMap[ink]) inkMap[ink] = { namn: ink, bolag: (o.bolag || '').trim(), vol: 0, st: 0, g15sek: 0, perAtgard: {}, perTs: {}, objekt: [] };
        const entry = inkMap[ink];
        entry.vol += pObj.vol;
        entry.st += pObj.st;
        const tObj = tidByObjekt[o.objekt_id];
        if (tObj) entry.g15sek += tObj.processingSek + tObj.terrainSek;
        const atg = (o.atgard || '').trim() || 'Övrigt';
        entry.perAtgard[atg] = (entry.perAtgard[atg] || 0) + pObj.vol;
        if (o.timpeng === true) entry.perAtgard['Timpeng'] = (entry.perAtgard['Timpeng'] || 0) + pObj.vol;
        for (const [ts, v] of Object.entries(pObj.perTs)) entry.perTs[ts] = (entry.perTs[ts] || 0) + v;
        entry.objekt.push({ namn: o.object_name || o.vo_nummer || '', volym: Math.round(pObj.vol), stammar: Math.round(pObj.st), atgard: atg });
      }
      const inkopareData: DbData['inkopareData'] = Object.values(inkMap)
        .map(ink => {
          const g15h = ink.g15sek / 3600;
          const words = ink.namn.split(' ');
          const key = words[0].toLowerCase().replace(/[^a-zåäö0-9]/g, '');
          return {
            key, namn: ink.namn, bolag: ink.bolag,
            volym: Math.round(ink.vol), stammar: Math.round(ink.st),
            prod: g15h > 0 ? parseFloat((ink.vol / g15h).toFixed(1)) : 0,
            antalObjekt: ink.objekt.length,
            perAtgard: Object.fromEntries(Object.entries(ink.perAtgard).map(([k, v]) => [k, Math.round(v)])),
            perTradslag: Object.fromEntries(Object.entries(ink.perTs).map(([k, v]) => [k, Math.round(v)])),
            objekt: ink.objekt.sort((a, b) => b.volym - a.volym),
          };
        })
        .filter(i => i.volym > 0)
        .sort((a, b) => b.volym - a.volym);

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
        dailyDates,
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
        utnyttjandegrad,
        avbrottTotal, avbrottPerKategori, avbrottPerManad,
        klassLabels, klassVolym, klassStammar, klassM3g15, klassStg15, klassDieselM3, klassMthPct,
        mthAndelPct, mthMedelstam, singleMedelstam,
        sortimentData,
        hasMth,
        sortimentPerDag,
        bolagData: bolagArr,
        objTypList,
        timpengData,
        inkopareData,
        atgardKlassData,
        atgardM3g15Data,
        tradslagData,
        periodStartDate: startDate,
        totalDays,
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
    const [prodRows, tidRes] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from('fakt_produktion')
          .select('volym_m3sub, stammar')
          .eq('maskin_id', maskinId)
          .gte('datum', startDate).lte('datum', endDate)
          .range(from, to)
      ),
      supabase.from('fakt_tid')
        .select('datum, operator_id, objekt_id, processing_sek, terrain_sek, kort_stopp_sek, avbrott_sek, engine_time_sek')
        .eq('maskin_id', maskinId)
        .gte('datum', startDate).lte('datum', endDate),
    ]);
    // Deduplicate fakt_tid per (datum, operator_id, objekt_id)
    const tidDedupKpi: Record<string, any> = {};
    for (const r of (tidRes.data || [])) {
      const key = `${r.datum}|${r.operator_id || ''}|${r.objekt_id || ''}`;
      if (!tidDedupKpi[key] || (r.engine_time_sek || 0) > (tidDedupKpi[key].engine_time_sek || 0)) tidDedupKpi[key] = r;
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


  // ── Fetch machine comparison data ──
  const runMachCmp = useCallback(async () => {
    if (machCmpA === machCmpB) return;
    setMachCmpLoading(true);

    // Resolve combo IDs (e.g. "R64101+R64428" → ["R64101","R64428"])
    const logicalIds = [machCmpA, machCmpB]; // what we display
    const dbIdsA = resolveIds(machCmpA);
    const dbIdsB = resolveIds(machCmpB);
    const allDbIds = [...new Set([...dbIdsA, ...dbIdsB])];

    // Fetch prod and tid SEPARATELY (paginate prod — can exceed 1000 rows)
    const [prodData, tidRes] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from('fakt_produktion')
          .select('datum, maskin_id, volym_m3sub, stammar')
          .in('maskin_id', allDbIds)
          .gte('datum', machCmpFrom).lte('datum', machCmpTo)
          .range(from, to)
      ),
      supabase.from('fakt_tid')
        .select('datum, maskin_id, operator_id, objekt_id, processing_sek, terrain_sek, kort_stopp_sek, avbrott_sek, engine_time_sek, bransle_liter')
        .in('maskin_id', allDbIds)
        .gte('datum', machCmpFrom).lte('datum', machCmpTo),
    ]);

    // Map raw maskin_id → logical ID
    const toLogical = (rawMid: string): string => {
      if (dbIdsA.includes(rawMid)) return machCmpA;
      if (dbIdsB.includes(rawMid)) return machCmpB;
      return rawMid;
    };

    // Pre-aggregate prod per logical machine (sum all rows — one per diameterklass/trädslag)
    const prodAgg: Record<string, { vol: number; st: number }> = {};
    const monthProd: Record<string, Record<string, { vol: number; g15sek: number }>> = {};
    for (const r of prodData) {
      const lid = toLogical(r.maskin_id);
      if (!prodAgg[lid]) prodAgg[lid] = { vol: 0, st: 0 };
      prodAgg[lid].vol += r.volym_m3sub || 0;
      prodAgg[lid].st += r.stammar || 0;
      const ym = r.datum.substring(0, 7);
      if (!monthProd[ym]) monthProd[ym] = {};
      if (!monthProd[ym][lid]) monthProd[ym][lid] = { vol: 0, g15sek: 0 };
      monthProd[ym][lid].vol += r.volym_m3sub || 0;
    }

    // Deduplicate + pre-aggregate tid per logical machine
    const tidDedup: Record<string, any> = {};
    for (const r of (tidRes.data || [])) {
      const key = `${r.datum}|${r.maskin_id}|${r.operator_id || ''}|${r.objekt_id || ''}`;
      if (!tidDedup[key] || (r.engine_time_sek || 0) > (tidDedup[key].engine_time_sek || 0)) tidDedup[key] = r;
    }
    const tidAgg: Record<string, { g15sek: number; engineSek: number; bransle: number }> = {};
    for (const r of Object.values(tidDedup)) {
      const lid = toLogical((r as any).maskin_id);
      if (!tidAgg[lid]) tidAgg[lid] = { g15sek: 0, engineSek: 0, bransle: 0 };
      tidAgg[lid].g15sek += ((r as any).processing_sek || 0) + ((r as any).terrain_sek || 0);
      tidAgg[lid].engineSek += (r as any).engine_time_sek || 0;
      tidAgg[lid].bransle += (r as any).bransle_liter || 0;
      const ym = (r as any).datum.substring(0, 7);
      if (monthProd[ym]?.[lid]) monthProd[ym][lid].g15sek += ((r as any).processing_sek || 0) + ((r as any).terrain_sek || 0);
    }

    const rows: MachCmpRow[] = logicalIds.map(lid => {
      const p = prodAgg[lid] || { vol: 0, st: 0 };
      const t = tidAgg[lid] || { g15sek: 0, engineSek: 0, bransle: 0 };
      const g15h = t.g15sek / 3600;
      return {
        id: lid,
        namn: allMachines.find(m => m.id === lid)?.namn || lid,
        stammar: Math.round(p.st), volym: Math.round(p.vol),
        medelstam: p.st > 0 ? parseFloat((p.vol / p.st).toFixed(3)) : 0,
        prod: g15h > 0 ? parseFloat((p.vol / g15h).toFixed(1)) : 0,
        dieselM3: p.vol > 0 ? parseFloat((t.bransle / p.vol).toFixed(2)) : 0,
        motorH: parseFloat((t.engineSek / 3600).toFixed(1)),
      };
    });

    // Monthly m³/G15h per logical machine
    const months: MachCmpMonth[] = Object.keys(monthProd).sort().map(ym => {
      const byMach: Record<string, number> = {};
      for (const lid of logicalIds) {
        const d = monthProd[ym]?.[lid];
        if (d && d.g15sek > 0) byMach[lid] = d.vol / (d.g15sek / 3600);
        else byMach[lid] = 0;
      }
      return { month: ym, byMach };
    });

    setMachCmpRows(rows);
    setMachCmpMonths(months);
    setMachCmpLoading(false);
  }, [machCmpA, machCmpB, machCmpFrom, machCmpTo]);


  // Fetch data when machine, period, or åtgärd filter changes
  useEffect(() => {
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (valdMaskinObj) {
      const dbIds = resolveIds(valdMaskinObj.maskin_id);
      console.log('[Maskinvy] Trigger fetch:', { modell: vald, maskin_id: valdMaskinObj.maskin_id, dbIds, period, filterAtgard });
      fetchDbData(dbIds.length === 1 ? dbIds[0] : dbIds, period, periodOffset, filterAtgard);
    }
  }, [vald, maskiner, period, periodOffset, filterAtgard, fetchDbData]);

  // ── Fetch Idag data ──
  useEffect(() => {
    if (activeView !== 'idag') return;
    const valdMaskinObj = maskiner.find(m => m.modell === vald);
    if (!valdMaskinObj) return;
    const maskinIds = resolveIds(valdMaskinObj.maskin_id);
    setIdagLoading(true);
    (async () => {
      try {
        const pad = (n: number) => String(n).padStart(2, '0');
        const now = new Date();
        const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        // 14 dagars trend
        const trendStart = new Date(now); trendStart.setDate(trendStart.getDate() - 13);
        const trendStartStr = `${trendStart.getFullYear()}-${pad(trendStart.getMonth()+1)}-${pad(trendStart.getDate())}`;

        const [prodRes, tidRes, objRes, opRes, skiftRes, senastRes] = await Promise.all([
          fetchAllRows((from, to) => supabase.from('fakt_produktion')
            .select('datum, volym_m3sub, stammar, operator_id, objekt_id')
            .in('maskin_id', maskinIds).gte('datum', trendStartStr).lte('datum', today).range(from, to)),
          supabase.from('fakt_tid')
            .select('datum, operator_id, objekt_id, processing_sek, terrain_sek, other_work_sek, avbrott_sek, rast_sek, engine_time_sek, bransle_liter, kort_stopp_sek')
            .in('maskin_id', maskinIds).gte('datum', trendStartStr).lte('datum', today),
          supabase.from('dim_objekt').select('objekt_id, object_name, bolag'),
          supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', maskinIds),
          supabase.from('fakt_skift').select('datum, inloggning_tid').in('maskin_id', maskinIds).eq('datum', today),
          supabase.from('fakt_produktion')
            .select('datum')
            .in('maskin_id', maskinIds).gt('volym_m3sub', 0)
            .order('datum', { ascending: false }).limit(1),
        ]);

        const objekter = objRes.data || [];
        const operators = opRes.data || [];
        const objNameMap: Record<string, string> = {};
        const objBolagMap: Record<string, string> = {};
        for (const o of objekter) { objNameMap[o.objekt_id] = o.object_name || ''; objBolagMap[o.objekt_id] = (o.bolag || '').trim(); }
        const opNameMap: Record<string, string> = {};
        for (const o of operators) opNameMap[o.operator_id] = o.operator_namn || '';

        // Today's prod
        const todayProd = prodRes.filter((r: any) => r.datum === today);
        const todayVol = todayProd.reduce((s: number, r: any) => s + (r.volym_m3sub || 0), 0);
        const todaySt = todayProd.reduce((s: number, r: any) => s + (r.stammar || 0), 0);

        // Today's tid (dedup)
        const tidDedup: Record<string, any> = {};
        for (const r of (tidRes.data || [])) {
          if (r.datum !== today) continue;
          const key = `${r.operator_id || ''}|${r.objekt_id || ''}`;
          if (!tidDedup[key] || (r.engine_time_sek || 0) > (tidDedup[key].engine_time_sek || 0)) tidDedup[key] = r;
        }
        const todayTid = Object.values(tidDedup);
        const procSek = todayTid.reduce((s: number, r: any) => s + (r.processing_sek || 0), 0);
        const terrSek = todayTid.reduce((s: number, r: any) => s + (r.terrain_sek || 0), 0);
        const avbrSek = todayTid.reduce((s: number, r: any) => s + (r.avbrott_sek || 0), 0);
        const rastSek = todayTid.reduce((s: number, r: any) => s + (r.rast_sek || 0), 0);
        const otherSek = todayTid.reduce((s: number, r: any) => s + (r.other_work_sek || 0), 0);
        const engineSek = todayTid.reduce((s: number, r: any) => s + (r.engine_time_sek || 0), 0);
        const bransleTot = todayTid.reduce((s: number, r: any) => s + parseFloat(r.bransle_liter || 0), 0);
        const kortStoppSek = todayTid.reduce((s: number, r: any) => s + (r.kort_stopp_sek || 0), 0);
        const g15sek = procSek + terrSek;
        const g15h = g15sek / 3600;
        const effG15h = (procSek + terrSek + kortStoppSek) / 3600;
        const engineH = engineSek / 3600;
        const utnyttj = engineH > 0 ? parseFloat((effG15h / engineH * 100).toFixed(1)) : 0;

        // Operators today
        const opAgg: Record<string, { vol: number; st: number; objekt: string }> = {};
        for (const r of todayProd) {
          const opId = r.operator_id || '';
          if (!opAgg[opId]) opAgg[opId] = { vol: 0, st: 0, objekt: objNameMap[r.objekt_id] || '' };
          opAgg[opId].vol += r.volym_m3sub || 0;
          opAgg[opId].st += r.stammar || 0;
          if (!opAgg[opId].objekt) opAgg[opId].objekt = objNameMap[r.objekt_id] || '';
        }
        const opList = Object.entries(opAgg).map(([opId, d]) => {
          const opTid = todayTid.filter((t: any) => t.operator_id === opId);
          const opG15 = opTid.reduce((s: number, t: any) => s + (t.processing_sek || 0) + (t.terrain_sek || 0), 0) / 3600;
          const skift = (skiftRes.data || []).find((s: any) => s.datum === today);
          return { namn: opNameMap[opId] || opId, objekt: d.objekt, start: skift?.inloggning_tid?.substring(11, 16) || '–', vol: Math.round(d.vol), prod: opG15 > 0 ? parseFloat((d.vol / opG15).toFixed(1)) : 0 };
        }).sort((a, b) => b.vol - a.vol);

        // Bolag today
        const bolagAgg: Record<string, number> = {};
        for (const r of todayProd) {
          const b = objBolagMap[r.objekt_id] || 'Övrigt';
          bolagAgg[b] = (bolagAgg[b] || 0) + (r.volym_m3sub || 0);
        }
        const bolagList = Object.entries(bolagAgg).map(([namn, vol]) => ({
          namn, vol: Math.round(vol), pct: todayVol > 0 ? Math.round(vol / todayVol * 100) : 0
        })).sort((a, b) => b.vol - a.vol);

        // Trend 14 dagar
        const trend: IdagData['trend'] = [];
        for (let i = 0; i < 14; i++) {
          const d = new Date(trendStart); d.setDate(d.getDate() + i);
          const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
          const dow = d.getDay();
          const dayVol = prodRes.filter((r: any) => r.datum === ds).reduce((s: number, r: any) => s + (r.volym_m3sub || 0), 0);
          trend.push({ datum: ds, label: `${d.getDate()}/${d.getMonth()+1}`, vol: Math.round(dayVol), helg: dow === 0 || dow === 6 });
        }

        // Senast aktiv: senaste datum i fakt_produktion med volym > 0
        const senastAktivDatum: string | null = (senastRes.data && senastRes.data[0] && senastRes.data[0].datum) || null;
        let senastAktivTid: string | null = null;
        if (senastAktivDatum) {
          const { data: sRows } = await supabase
            .from('fakt_skift')
            .select('inloggning_tid')
            .in('maskin_id', maskinIds)
            .eq('datum', senastAktivDatum)
            .order('inloggning_tid', { ascending: false })
            .limit(1);
          const rawTid = sRows?.[0]?.inloggning_tid;
          if (rawTid && typeof rawTid === 'string') {
            senastAktivTid = rawTid.length >= 16 ? rawTid.substring(11, 16) : rawTid.substring(0, 5);
          }
        }

        setIdagData({
          vol: Math.round(todayVol), st: Math.round(todaySt), g15h: parseFloat(g15h.toFixed(1)),
          prod: g15h > 0 ? parseFloat((todayVol / g15h).toFixed(1)) : 0,
          medelstam: todaySt > 0 ? parseFloat((todayVol / todaySt).toFixed(3)) : 0,
          bransle: Math.round(bransleTot), bransleLm3: todayVol > 0 ? parseFloat((bransleTot / todayVol).toFixed(1)) : 0,
          utnyttj, operatorer: opList,
          tidFord: { proc: procSek, terr: terrSek, avbrott: avbrSek, rast: rastSek, ovrigt: otherSek },
          bolag: bolagList, trend,
          senastAktiv: senastAktivDatum ? { datum: senastAktivDatum, tid: senastAktivTid } : null,
        });
      } catch (err) { console.error('Idag fetch error', err); }
      setIdagLoading(false);
    })();
  }, [activeView, maskiner, vald]);

  // ── Re-initialize charts every time data updates or view changes ──
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
        // Pass filter state to script
        (window as any).__maskinvyAtgarder = availableAtgarder;
        (window as any).__maskinvyFilterAtgard = filterAtgard;
        (window as any).__setFilterAtgard = (val: string) => setFilterAtgard(val);
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

  // ── Initialize avbrott chart when avbrott view is active and data is ready ──
  useEffect(() => {
    if (activeView !== 'avbrott' || dataVersion === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    function initAvbrott() {
      const Chart = (window as any).Chart;
      const canvas = document.getElementById('avbrottCanvas') as HTMLCanvasElement | null;
      if (!Chart || !canvas) { timer = setTimeout(initAvbrott, 200); return; }
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      const db = (window as any).__maskinvyData || {};
      const pk: Array<{ kategori: string; timmar: number; antal: number; snittMin: number }> = db.avbrottPerKategori || [];
      const pm: Array<{ month: string; byKat: Record<string, number> }> = db.avbrottPerManad || [];
      if (pk.length === 0) return;
      const allKats = pk.map(k => k.kategori);
      const palette = ['rgba(90,255,140,0.7)','rgba(90,255,140,0.55)','rgba(90,255,140,0.4)','rgba(90,255,140,0.28)','rgba(90,255,140,0.18)','rgba(90,255,140,0.1)'];
      const katColors: Record<string, string> = {};
      allKats.forEach((k, i) => { katColors[k] = palette[i % palette.length]; });
      const isMultiMonth = pm.length > 1;
      if (isMultiMonth) {
        new Chart(canvas, {
          type: 'bar',
          data: {
            labels: pm.map(m => m.month),
            datasets: allKats.map(kat => ({
              label: translateKategori(kat),
              data: pm.map(m => parseFloat((m.byKat[kat] || 0).toFixed(1))),
              backgroundColor: katColors[kat],
              borderRadius: 3, stack: 'a',
            })),
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index' as const, intersect: false },
            plugins: { legend: { position: 'top' as const, labels: { color: '#7a7a72', font: { family: "'Geist',sans-serif", size: 11 }, boxWidth: 8, padding: 10 } } },
            scales: {
              x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } } },
              y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a7a72', font: { size: 11 } }, title: { display: true, text: 'timmar', color: '#7a7a72', font: { size: 11 } } },
            },
          },
        });
      } else {
        new Chart(canvas, {
          type: 'bar',
          data: {
            labels: pk.map(k => translateKategori(k.kategori)),
            datasets: [{ data: pk.map(k => k.timmar), backgroundColor: pk.map(k => katColors[k.kategori]), borderRadius: 4 }],
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
    }
    // Delay to run after MASKINVY_SCRIPT (which has 500ms delay) and let React render the canvas
    timer = setTimeout(initAvbrott, 800);
    return () => { if (timer) clearTimeout(timer); };
  }, [activeView, dataVersion]);

  useEffect(() => {
    const page = document.getElementById('page');
    if (page) page.setAttribute('data-view', activeView);
  }, [activeView, dataVersion]);

  const valdMaskin = maskiner.find(m => m.modell === vald);

  // Update TopBar title with machine name + period
  useEffect(() => {
    const el = document.getElementById('topbar-title');
    if (!el) return;
    const maskinNamn = valdMaskin ? `${valdMaskin.tillverkare} ${valdMaskin.modell}` : 'Maskinvy';
    const periodLabel = getPeriodLabel(period, periodOffset);
    el.textContent = `${maskinNamn} — ${periodLabel}`;
    return () => { el.textContent = 'Maskinvy'; };
  }, [valdMaskin, period, periodOffset]);

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
      <aside className="mv-sidebar" style={{
        width: 220, flexShrink: 0, background: '#0f0f0e', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', fontFamily: "'Geist', system-ui, sans-serif",
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a4a2e', border: '1px solid rgba(90,255,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🌲</div>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#e8e8e4', letterSpacing: '-0.3px' }}>Dashboard</span>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { icon: '☀', label: 'Idag', view: 'idag' },
            { icon: '◻', label: 'Översikt', view: 'oversikt' },
            { icon: '▤', label: 'Produktion', view: 'produktion' },
            { icon: '⚠', label: 'Avbrott', view: 'avbrott' },


            { icon: '◈', label: 'Analys', view: 'analys' },
            { icon: '🔧', label: 'Maskinlogg', view: 'maskinlogg' },
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
      </aside>
      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', background: '#111110', display: 'flex', flexDirection: 'column' }}>
        {/* ── TOP BAR: Maskin + Period ── */}
        <div className="mv-topbar" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0f0f0e',
          fontFamily: "'Geist', system-ui, sans-serif", flexShrink: 0,
        }}>
          {/* Maskin dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMaskinOpen(!maskinOpen)}
              style={{
                background: '#1a1a18', color: '#e8e8e4',
                border: maskinOpen ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500,
                fontFamily: "'Geist', system-ui, sans-serif",
                outline: 'none', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              }}
            >
              <span>{maskiner.find(m => m.modell === vald)
                ? `${maskiner.find(m => m.modell === vald)!.tillverkare} ${vald}`
                : 'Välj maskin...'}</span>
              <span style={{ fontSize: 9, color: '#555', transform: maskinOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
            </button>
            {maskinOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                background: '#1a1a18', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, overflow: 'hidden', zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                maxHeight: 240, overflowY: 'auto', minWidth: '100%',
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
                      cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                    }}
                  >
                    {m.tillverkare} {m.modell}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Period navigation: ‹ Label › */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <button onClick={() => setPeriodOffset(o => o - 1)} style={{
              width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent',
              color: '#7a7a72', fontSize: 14, cursor: 'pointer', fontFamily: "'Geist', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
            <div style={{
              minWidth: 90, textAlign: 'center', fontSize: 12, fontWeight: 500,
              color: '#e8e8e4', letterSpacing: '-0.2px',
            }}>
              {getPeriodLabel(period, periodOffset)}
            </div>
            <button onClick={() => setPeriodOffset(o => Math.min(o + 1, 0))} style={{
              width: 26, height: 26, border: 'none', borderRadius: 6, background: 'transparent',
              color: periodOffset >= 0 ? '#333' : '#7a7a72', fontSize: 14,
              cursor: periodOffset >= 0 ? 'default' : 'pointer',
              fontFamily: "'Geist', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>›</button>
          </div>

          {/* Period type: V M K Å */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
            {(['V', 'M', 'K', 'Å'] as const).map((p) => (
              <button key={p} onClick={() => { setPeriod(p); setPeriodOffset(0); }} style={{
                padding: '4px 10px', border: 'none', borderRadius: 5,
                background: period === p ? '#1e1e1c' : 'transparent',
                color: period === p ? '#e8e8e4' : '#555',
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                fontFamily: "'Geist', system-ui, sans-serif",
              }}>{p}</button>
            ))}
          </div>
        </div>
        {/* ── SCROLLABLE CONTENT ── */}
        <div className="mv-scroll" style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>

      {/* ── PERIOD COMPARISON PANEL ── */}
      {activeView === 'idag' && (() => {
        const d = idagData;
        if (idagLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#7a7a72' }}>Laddar...</div>;
        if (!d) return <div style={{ padding: 40, textAlign: 'center', color: '#7a7a72' }}>Ingen data</div>;
        const noProduction = d.vol === 0 && d.st === 0;
        const stG15h = d.g15h > 0 ? parseFloat((d.st / d.g15h).toFixed(1)) : 0;
        return (
          <div style={{ padding: '0 20px 60px', maxWidth: 900, fontFamily: "'Geist', system-ui, sans-serif" }}>

            {noProduction ? (<>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#e8e8e4', letterSpacing: -0.5, marginTop: 24, marginBottom: 20 }}>Idag</div>
              <div style={{ textAlign: 'center', padding: '48px 20px', background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>☀</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#e8e8e4', marginBottom: 6 }}>Ingen produktion registrerad idag</div>
                {d.senastAktiv && (() => {
                  const [yy, mm, dd] = d.senastAktiv.datum.split('-').map(Number);
                  const dObj = new Date(yy, mm - 1, dd);
                  const datumStr = dObj.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
                  const tidStr = d.senastAktiv.tid ? `, kl ${d.senastAktiv.tid}` : '';
                  return (
                    <div style={{ fontSize: 13, color: '#9a9a92', marginTop: 4 }}>
                      Senast aktiv: {datumStr}{tidStr}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, color: '#5a5a52', marginTop: 24, fontStyle: 'italic' }}>
                  Data synkroniseras automatiskt när MOM-filer importeras
                </div>
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
                  <div className="k-label">Stammar</div>
                  <div className="k-val">{d.st.toLocaleString('sv')}</div>
                  <div className="k-unit">stammar</div>
                </div>
                <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                  <div className="k-label">Produktivitet</div>
                  <div className="k-val">{d.prod}</div>
                  <div className="k-unit">m³/G15h</div>
                </div>
                <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                  <div className="k-label">Medelstam</div>
                  <div className="k-val">{d.medelstam}</div>
                  <div className="k-unit">m³/stam</div>
                </div>
              </div>
              {/* KPI ROW 2 */}
              <div className="hero" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 8 }}>
                <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                  <div className="k-label">Utnyttjandegrad</div>
                  <div className="k-val">{d.utnyttj}</div>
                  <div className="k-unit">%</div>
                </div>
                <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                  <div className="k-label">Bränsle totalt</div>
                  <div className="k-val">{d.bransle}</div>
                  <div className="k-unit">liter</div>
                </div>
                <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                  <div className="k-label">Bränsle/m³</div>
                  <div className="k-val">{d.bransleLm3}</div>
                  <div className="k-unit">L/m³</div>
                </div>
                <div className="kpi" style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px' }}>
                  <div className="k-label">Stammar/G15h</div>
                  <div className="k-val">{stG15h}</div>
                  <div className="k-unit">st/G15h</div>
                </div>
              </div>

              {/* Aktiv förare & objekt */}
              {d.operatorer.length > 0 && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="card-h"><div className="card-t">Just nu</div></div>
                  <div className="card-b">
                    {d.operatorer.map(op => (
                      <div key={op.namn} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(90,255,140,0.1)', border: '1px solid rgba(90,255,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: 'rgba(90,255,140,0.8)', flexShrink: 0 }}>
                          {op.namn.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e8e4' }}>{op.namn}</div>
                          <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{op.objekt} · start {op.start}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 17, fontWeight: 500, color: '#e8e8e4' }}>{op.vol} m³</div>
                          <div style={{ fontSize: 10, color: '#7a7a72' }}>{op.prod} m³/G15h</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bolag */}
              {d.bolag.length > 0 && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-h"><div className="card-t">Bolag</div></div>
                  <div className="card-b">
                    {d.bolag.map(b => (
                      <div key={b.namn} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{b.namn}</span>
                          <span><span style={{ fontWeight: 500 }}>{b.vol} m³</span> <span style={{ color: '#666', fontSize: 11 }}>{b.pct}%</span></span>
                        </div>
                        <div style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${b.pct}%`, background: 'rgba(90,255,140,0.5)', borderRadius: 2 }} />
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

      {activeView === 'jamfor' && (
        <div style={{ padding: '24px 28px 60px', fontFamily: "'Geist', system-ui, sans-serif", maxWidth: 900 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#e8e8e4', letterSpacing: -0.5, marginBottom: 4 }}>
            Jämför perioder
          </div>
          <div style={{ fontSize: 13, color: '#7a7a72', marginBottom: 24 }}>
            {valdMaskin ? `${valdMaskin.tillverkare} ${valdMaskin.modell}` : ''} — sida vid sida
          </div>

          {/* Date pickers */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ background: '#1a1a18', border: '1px solid rgba(90,255,140,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: '#00c48c', letterSpacing: '0.08em' }}>A</span>
              <input type="date" value={cmpDateA.start} onChange={e => setCmpDateA(p => ({ ...p, start: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <span style={{ color: '#3a3a36' }}>–</span>
              <input type="date" value={cmpDateA.end} onChange={e => setCmpDateA(p => ({ ...p, end: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#3a3a36' }}>VS</span>
            <div style={{ background: '#1a1a18', border: '1px solid rgba(255,179,64,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: '#ffb340', letterSpacing: '0.08em' }}>B</span>
              <input type="date" value={cmpDateB.start} onChange={e => setCmpDateB(p => ({ ...p, start: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
              <span style={{ color: '#3a3a36' }}>–</span>
              <input type="date" value={cmpDateB.end} onChange={e => setCmpDateB(p => ({ ...p, end: e.target.value }))}
                style={{ background: 'transparent', border: 'none', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, outline: 'none' }} />
            </div>
            <button onClick={runComparison} style={{
              padding: '10px 20px', border: 'none', borderRadius: 8,
              background: '#1a4a2e', color: '#00c48c', fontFamily: "'Geist', system-ui, sans-serif",
              fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: -0.2,
            }}>
              {cmpLoading ? 'Laddar...' : 'Visa →'}
            </button>
          </div>

          {/* Comparison results */}
          {cmpDataA && cmpDataB && (
            <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px 1fr', gap: 7, alignItems: 'center', marginBottom: 12 }}>
                <div />
                <div style={{ background: 'rgba(90,255,140,0.08)', color: '#00c48c', borderRadius: 7, padding: '9px 14px', fontSize: 11, fontWeight: 500, border: '1px solid rgba(90,255,140,0.15)' }}>Period A</div>
                <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, color: '#3a3a36' }}>VS</div>
                <div style={{ background: 'rgba(255,179,64,0.08)', color: '#ffb340', borderRadius: 7, padding: '9px 14px', fontSize: 11, fontWeight: 500, border: '1px solid rgba(255,179,64,0.15)' }}>Period B</div>
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
                    <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', color: '#7a7a72' }}>{m.lbl}</div>
                    <div style={{ background: '#222220', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: '#e8e8e4' }}>{fmt(m.a)}</span>
                      <span style={{ fontSize: 11, color: '#7a7a72' }}>{m.unit}</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        borderRadius: 5, padding: '3px 1px', fontSize: 10, fontWeight: 500,
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
            <div style={{ fontSize: 18, fontWeight: 500, color: '#e8e8e4', letterSpacing: -0.4, marginBottom: 4 }}>
              Jämför maskiner
            </div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>
              Välj två maskiner och en period
            </div>

            {/* Machine selectors + date range */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <select value={machCmpA} onChange={e => setMachCmpA(e.target.value)} style={{
                background: '#1a1a18', border: '1px solid rgba(90,255,140,0.15)', borderRadius: 8,
                padding: '7px 10px', color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif",
                fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer',
              }}>
                {allMachines.map(m => <option key={m.id} value={m.id}>{m.namn}</option>)}
              </select>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#3a3a36' }}>VS</span>
              <select value={machCmpB} onChange={e => setMachCmpB(e.target.value)} style={{
                background: '#1a1a18', border: '1px solid rgba(91,143,255,0.2)', borderRadius: 8,
                padding: '7px 10px', color: '#5b8fff', fontFamily: "'Geist', system-ui, sans-serif",
                fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer',
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
                color: machCmpA !== machCmpB ? '#e8e8e4' : '#555',
                fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, fontWeight: 500,
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
                            <td style={{ padding: '10px 14px', fontWeight: 500, color: colors[i] }}>{r.namn}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.stammar, other.stammar, true) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.stammar, other.stammar, true) ? 500 : 400 }}>{r.stammar.toLocaleString('sv-SE')}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.volym, other.volym, true) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.volym, other.volym, true) ? 500 : 400 }}>{r.volym.toLocaleString('sv-SE')}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{r.medelstam}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.prod, other.prod, true) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.prod, other.prod, true) ? 500 : 400 }}>{r.prod}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: better(r.dieselM3, other.dieselM3, false) ? '#e8e8e4' : '#7a7a72', fontWeight: better(r.dieselM3, other.dieselM3, false) ? 500 : 400 }}>{r.dieselM3}</td>
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
                    <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', color: '#3a3a36', marginBottom: 12 }}>
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

      {/* ── AVBROTT PANEL ── */}
      {activeView === 'avbrott' && (() => {
        void dataVersion; // depend on dataVersion so panel re-renders when data loads
        const db = (window as any).__maskinvyData || {} as DbData;
        const at = db.avbrottTotal || { timmar: 0, antal: 0, snittMin: 0 };
        const pk: Array<{ kategori: string; timmar: number; antal: number; snittMin: number }> = db.avbrottPerKategori || [];
        const pm: Array<{ month: string; byKat: Record<string, number> }> = db.avbrottPerManad || [];
        const allKats = pk.map(k => k.kategori);
        const katColors: Record<string, string> = {};
        const palette = ['rgba(90,255,140,0.7)','rgba(90,255,140,0.55)','rgba(90,255,140,0.4)','rgba(90,255,140,0.28)','rgba(90,255,140,0.18)','rgba(90,255,140,0.1)'];
        allKats.forEach((k, i) => { katColors[k] = palette[i % palette.length]; });
        const isMultiMonth = pm.length > 1;
        return (
          <div style={{ padding: '24px 28px 60px', fontFamily: "'Geist', system-ui, sans-serif", maxWidth: 960 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#e8e8e4', letterSpacing: -0.5, marginBottom: 20 }}>Avbrott</div>

            {/* KPI cards */}
            <div className="hero" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total avbrottstid', value: at.timmar + 'h', hero: true },
                { label: 'Antal avbrott', value: String(at.antal), hero: false },
                { label: 'Snitt per avbrott', value: at.snittMin + ' min', hero: false },
              ].map(c => (
                <div key={c.label} style={{
                  background: '#161614',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16,
                  padding: 20,
                  minHeight: 100,
                  ...(c.hero ? { gridColumn: 'span 2' } : {}),
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.02em', color: '#666', marginBottom: 8 }}>{c.label}</div>
                  <div style={{ fontSize: c.hero ? 48 : 32, fontWeight: 500, color: '#e8e8e4', letterSpacing: -1, marginBottom: 4 }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Chart: stacked bars per month if multi-month, horizontal bars per category if single month */}
            {pk.length > 0 && (
              <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', color: '#3a3a36', marginBottom: 14 }}>
                  {isMultiMonth ? 'Avbrottstid per månad & kategori' : 'Avbrottstid per kategori'}
                </div>
                <div style={{ height: isMultiMonth ? 280 : Math.max(180, pk.length * 36), position: 'relative' }}>
                  <canvas id="avbrottCanvas" />
                </div>
              </div>
            )}

            {/* Top list */}
            {pk.length > 0 && (
              <div style={{ background: '#1a1a18', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.15)' }}>
                      <th style={{ padding: '12px 14px', textAlign: 'left', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Kategori</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Timmar</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Antal</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', color: '#7a7a72', fontWeight: 500, fontSize: 11 }}>Snitt min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pk.map(r => (
                      <tr key={r.kategori} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: katColors[r.kategori] || '#7a7a72', flexShrink: 0 }} />
                          {translateKategori(r.kategori)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: '#e8e8e4' }}>{r.timmar}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{r.antal}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{r.snittMin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ display: activeView === 'jamfor' || activeView === 'avbrott' || activeView === 'idag' ? 'none' : 'block' }}>
      <style dangerouslySetInnerHTML={{ __html: `.mach-wrap { display: none !important; }
.hdr { display: none !important; }
.cmp-bar { display: none !important; }

/* ── VIEW SWITCHING ── */
.view-section { display: none !important; }
.page[data-view="oversikt"] .vs-oversikt { display: block !important; }
.page[data-view="produktion"] .vs-produktion { display: block !important; }
.page[data-view="objekt"] .vs-objekt { display: block !important; }
.page[data-view="analys"] .vs-objekt { display: block !important; }
.page[data-view="kalibrering"] .vs-kalibrering { display: block !important; }
/* grids need display:grid */
.page[data-view="oversikt"] .vs-oversikt.hero { display: grid !important; }
.page[data-view="oversikt"] .vs-oversikt.g2 { display: grid !important; }
.page[data-view="objekt"] .vs-objekt.g2 { display: grid !important; }
.page[data-view="analys"] .vs-objekt.g2 { display: grid !important; }
.page[data-view="produktion"] .vs-produktion.g2 { display: grid !important; }
/* ps-hidden MUST come after .g2 rules so it wins at equal specificity */
.page[data-view="produktion"] .vs-produktion.ps-hidden { display: none !important; }
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
.cmp-lbl { font-size: 10px; font-weight: 500; letter-spacing: 0.2px; white-space: nowrap; }
.cmp-lbl.a { color: var(--accent); }
.cmp-lbl.b { color: var(--warn); }
.cmp-period input[type=date] { border: none; background: transparent; font-family: 'Geist', sans-serif; font-size: 12px; color: var(--text); outline: none; cursor: pointer; color-scheme: dark; }
.cmp-sep { color: var(--dim); }
.cmp-vs { font-size: 11px; font-weight: 500; color: var(--dim); }
.cmp-go { padding: 7px 18px; background: var(--accent); color: #0a1a10; border: none; border-radius: 7px; font-family: 'Geist', sans-serif; font-size: 12px; font-weight: 500; cursor: pointer; margin-left: auto; transition: opacity 0.15s; }
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
  border-radius: 16px; padding: 20px; min-height: 100px;
  position: relative; overflow: hidden;
  animation-delay: 0.05s;
}
.hero-main::after { display: none; }

.hero-label { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: #666; margin-bottom: 8px; }
.hero-val {
  font-family: 'Geist', system-ui, sans-serif; font-size: 32px; line-height: 1;
  font-weight: 500; letter-spacing: -1px; color: var(--text);
  margin-bottom: 4px;
}
.hero-unit { font-size: 12px; color: #888; font-weight: 400; }
.hero-delta { margin-top: 12px; font-size: 11px; color: var(--accent); opacity: 0.9; display: flex; align-items: center; gap: 4px; }

.kpi {
  background: #161614; border: 1px solid var(--border); border-radius: 16px;
  padding: 20px; min-height: 100px; position: relative; overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.kpi:hover { border-color: var(--border2); transform: translateY(-1px); }
.kpi:nth-child(2){animation-delay:0.1s} .kpi:nth-child(3){animation-delay:0.15s}
.kpi:nth-child(4){animation-delay:0.2s} .kpi:nth-child(5){animation-delay:0.25s}

.k-label { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: #666; margin-bottom: 8px; }
.k-val { font-family: 'Geist', system-ui, sans-serif; font-size: 32px; line-height: 1; font-weight: 500; letter-spacing: -1px; color: var(--text); margin-bottom: 4px; }
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
.card-t { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: #666; }
.card-b { padding: 16px 24px 24px; }

/* ── GRID ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.gf { margin-bottom: 16px; }

/* ── BADGE ── */
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 500; letter-spacing: 0.3px; }
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
.op-av { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; }
.op-name { font-size: 13px; font-weight: 500; }
.op-sub  { font-size: 11px; color: var(--muted); }
.op-info { flex: 1; }
.op-stats { display: flex; gap: 16px; }
.op-sv { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
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
.tbl th { text-align: left; font-size: 10px; font-weight: 500; letter-spacing: 0.2px; color: var(--muted); padding: 0 0 10px; border-bottom: 1px solid var(--border); }
.tbl td { padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 12px; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: rgba(255,255,255,0.02); }
.tn { font-weight: 500; font-size: 12px; }
.ts2{ font-size: 10px; color: var(--muted); margin-top: 1px; }

/* ── INK ── */
.ink-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.ink-row:last-child { border-bottom: none; padding-bottom: 0; }
.ink-row:first-child { padding-top: 0; }
.ink-logo { width: 30px; height: 30px; border-radius: 6px; background: var(--surface2); border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 500; color: var(--muted); flex-shrink: 0; }
.ink-name { font-size: 12px; font-weight: 400; flex: 1; }
.ink-vol  { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }

/* ── CALENDAR ── */
.cal-names { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-bottom: 5px; }
.cal-dn { text-align: center; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dim); padding-bottom: 3px; }
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
.cal-sn { font-family: 'Geist', system-ui, sans-serif; font-size: 20px; font-weight: 500; line-height: 1; }
.cal-sl { font-size: 9px; letter-spacing: 0.2px; color: var(--muted); margin-top: 3px; }

/* ── MEDELSTAM CARDS ── */
.sc-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 6px; margin-top: 14px; }
.sc {
  background: var(--surface2); border-radius: 10px; padding: 11px 6px; text-align: center;
  border: 1px solid transparent; transition: all 0.15s; cursor: default;
}
.sc:hover { border-color: var(--border2); background: var(--surface); }
.sc.best { border-color: rgba(90,255,140,0.2); }
.sc-k { font-size: 9px; color: var(--muted); font-weight: 500; letter-spacing: 0.2px; margin-bottom: 7px; }
.sc-p { font-family: 'Geist', system-ui, sans-serif; font-size: 16px; font-weight: 500; line-height: 1; margin-bottom: 1px; }
.sc-u { font-size: 9px; color: var(--muted); margin-bottom: 6px; }
.sc-d { height: 1px; background: var(--border); margin: 5px 0; }
.sc-s { font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.sc-sl{ font-size: 9px; color: var(--muted); }
.sc-x { font-size: 9px; color: var(--dim); margin-top: 4px; }

/* ── CHART LEGEND ── */
.cleg { font-size: 10px; font-weight: 500; letter-spacing: 0.2px; color: var(--muted); display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.li { display: flex; align-items: center; gap: 4px; }
.ld { width: 7px; height: 7px; border-radius: 50%; }
.cdiv { height: 1px; background: var(--border); margin: 18px 0; }

/* ── SMALL NUMS ── */
.snum-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 12px; }
.snum { background: var(--surface2); border-radius: 8px; padding: 10px; text-align: center; }
.snum-v { font-family: 'Geist', system-ui, sans-serif; font-size: 17px; font-weight: 500; line-height: 1; }
.snum-l { font-size: 9px; letter-spacing: 0.2px; color: var(--muted); margin-top: 3px; }

/* ── TIDS-BAR ── */
.tbar { display: flex; height: 18px; border-radius: 5px; overflow: hidden; gap: 2px; margin-bottom: 14px; }
.tseg { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 500; }
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
  font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.7);
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
.fkpi-v { font-family: 'Geist', system-ui, sans-serif; font-size: 22px; font-weight: 500; line-height: 1; color: var(--text); }
.fkpi-l { font-size: 9px; letter-spacing: 0.2px; color: var(--muted); margin-top: 4px; }

.fsec-title { font-size: 10px; font-weight: 500; letter-spacing: 0.2px; color: var(--muted); margin-bottom: 10px; }
.fsec { margin-bottom: 20px; }

.frow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.frow:last-child { border-bottom: none; }
.frow-l { color: var(--muted); }
.frow-v { font-weight: 500; font-variant-numeric: tabular-nums; }

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
.cal-cell.c-service { cursor: pointer; }

/* ── BOTTOM NAV (hidden on desktop) ── */
.mv-bottomnav { display: none; }

/* ── RESPONSIVE: MOBILE & TABLET ── */
@media (max-width: 768px) {
  /* 1. Hide sidebar, show bottom nav */
  .mv-sidebar { display: none !important; }
  .mv-bottomnav {
    display: flex !important;
    position: fixed; bottom: 0; left: 0; right: 0;
    height: 56px; background: rgba(15,15,14,0.97);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255,255,255,0.07);
    z-index: 200; justify-content: space-around; align-items: center;
    padding: 0 4px; padding-bottom: env(safe-area-inset-bottom);
    font-family: 'Geist', system-ui, sans-serif;
  }
  .mv-bottomnav button {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    gap: 2px; background: none; border: none; cursor: pointer;
    padding: 6px 0; min-height: 44px; color: #555; transition: color 0.15s;
  }
  .mv-bottomnav button.active { color: #00c48c; }
  .mv-bn-icon { font-size: 18px; line-height: 1; }
  .mv-bn-label { font-size: 9px; font-weight: 500; letter-spacing: 0.3px; }

  /* 2. Top bar: stack vertically */
  .mv-topbar {
    flex-wrap: wrap !important;
    gap: 8px !important;
    padding: 8px 12px !important;
  }
  .mv-topbar > div:first-child { width: 100%; }
  .mv-topbar > div:first-child button { width: 100%; }

  /* 3. KPI grids: 2 columns */
  .hero, .page .hero { grid-template-columns: repeat(2, 1fr) !important; }

  /* 4. Two-column grids: stack to 1 column */
  .g2 { grid-template-columns: 1fr !important; }

  /* 5. Chart containers: horizontal scroll */
  .card-b { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .card-b canvas { min-width: 320px; }

  /* 6. Sub-tabs: horizontal scroll */
  #prodSubTabs {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap !important;
  }

  /* 7. Page padding & bottom spacing for bottom nav */
  .page { padding-left: 12px !important; padding-right: 12px !important; padding-bottom: 72px !important; }
  .mv-scroll { padding-bottom: 64px; }

  /* 8. Slide-out panels: full width */
  .bolag-panel, .forar-panel, .dag-panel { width: 100% !important; }

  /* 9. Touch targets: min 44px */
  .cmp-btn, .mach-btn { min-height: 44px; display: flex; align-items: center; }

  /* 10. Compare bar: reduce padding */
  .cmp-bar { padding: 8px 12px !important; flex-wrap: wrap !important; }
  .cmp-period { flex: 1 1 100% !important; max-width: none !important; margin-bottom: 6px; }

  /* 11. Machine dropdown: fit screen */
  .mach-menu { min-width: auto !important; max-width: 90vw !important; }

  /* 12. Machine name: ellipsis */
  #mName { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; display: inline-block; }
}
` }} />
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

  <!-- KPI ROW 1 — Volym (hero) + Stammar + Medelstam -->
  <div class="hero view-section vs-oversikt" id="sec-oversikt" style="grid-template-columns:repeat(4,1fr);">
    <div class="hero-main anim" style="animation-delay:0.05s;grid-column:span 2;background:rgba(255,255,255,0.06);">
      <div class="hero-label">Volym</div>
      <div class="hero-val" id="hv" style="font-size:48px;">0</div>
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
      <div class="k-label">Medelstam</div>
      <div class="k-val" data-count="0" data-dec="2">0</div>
      <div class="k-unit">m³/stam</div>
      <div class="k-delta"></div>
    </div>
  </div>

  <!-- KPI ROW 2 — Produktivitet (hero) + Utnyttjandegrad + Bränsle totalt -->
  <div class="hero view-section vs-oversikt" id="sec-kpi2" style="grid-template-columns:repeat(4,1fr);margin-top:-8px;">
    <div class="kpi anim" style="animation-delay:0.12s;grid-column:span 2;background:rgba(255,255,255,0.06);">
      <div class="k-label">Produktivitet</div>
      <div class="k-val" data-count="0" data-dec="1" style="font-size:48px;">0</div>
      <div class="k-unit">m³/G15h</div>
      <div class="k-delta"></div>
    </div>
    <div class="kpi anim" style="animation-delay:0.15s">
      <div class="k-label">Utnyttjandegrad</div>
      <div class="k-val" data-count="0" data-dec="1">0</div>
      <div class="k-unit">G15h / inloggad tid</div>
    </div>
    <div class="kpi anim" style="animation-delay:0.18s">
      <div class="k-label">Bränsle totalt</div>
      <div class="k-val" data-count="0">0</div>
      <div class="k-unit">liter</div>
    </div>
  </div>

  <!-- KPI ROW 3 — Bränsle/m³ + Stammar/G15h -->
  <div class="hero view-section vs-oversikt" id="sec-kpi3" style="grid-template-columns:repeat(4,1fr);margin-top:-8px;">
    <div class="kpi anim" style="animation-delay:0.21s">
      <div class="k-label">Bränsle/m³</div>
      <div class="k-val" data-count="0" data-dec="2">0</div>
      <div class="k-unit">L/m³</div>
    </div>
    <div class="kpi anim" style="animation-delay:0.24s">
      <div class="k-label">Stammar/G15h</div>
      <div class="k-val" data-count="0" data-dec="1">0</div>
      <div class="k-unit">st/G15h</div>
    </div>
  </div>

  <!-- ROW 1: Operatörer + Tidsfördelning -->
  <div class="g2 view-section vs-oversikt" id="sec-operatorer">
    <div class="card anim" style="animation-delay:0.3s">
      <div class="card-h"><div class="card-t">Operatörer <span id="opBadge" style="color:#7a7a72;font-weight:400;"></span></div></div>
      <div class="card-b" id="opContainer">
        <!-- Populated dynamically from DB -->
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;">
      <!-- Zon 1: Stapel + legend -->
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
          <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för avbrottsdetaljer →</div>
        </div>
      </div>
      <!-- Zon 2: Sub-KPI-kort -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="kpi anim" style="animation-delay:0.4s">
          <div class="k-label">Effektiv G15</div>
          <div class="k-val" id="tidG15Val" style="font-size:24px;">111h</div>
          <div class="k-unit">timmar</div>
        </div>
        <div class="kpi anim" style="animation-delay:0.45s">
          <div class="k-label">Avbrott</div>
          <div class="k-val" id="tidAvbrVal" style="font-size:24px;">18h</div>
          <div class="k-unit">timmar</div>
        </div>
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
      <div class="card-b" id="bolagCardBody">
        <div style="color:var(--muted);font-size:12px;padding:10px;">Laddar...</div>
      </div>
    </div>

    <div class="card anim" style="animation-delay:0.55s">
      <div class="card-h"><div class="card-t">Objekt</div></div>
      <div class="card-b" style="padding-left:0;padding-right:0;padding-bottom:4px;">
        <div style="overflow-y:auto;max-height:220px;">
        <table class="tbl" style="padding:0 22px">
          <thead><tr style="position:sticky;top:0;background:var(--surface);z-index:1;">
            <th style="padding-left:22px">Objekt</th><th>m³</th><th>m³/G15h</th>
          </tr></thead>
          <tbody id="objektTblBody">
            <tr><td style="padding-left:22px;color:var(--muted)">Laddar...</td><td></td><td></td></tr>
          </tbody>
        </table>
        </div>
        <div style="margin:14px 22px 4px;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Fördelning per åtgärd</div>
          <div id="objTypDist"><div style="color:var(--muted);font-size:12px;">Laddar...</div></div>
        </div>
        <div style="margin:14px 22px 4px;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Timpeng / Ackord</div>
          <div id="timpengDist"><div style="color:var(--muted);font-size:12px;">Laddar...</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- INKÖPARE -->
  <div class="gf view-section vs-objekt" style="margin-top:16px;">
    <div class="card anim" style="animation-delay:0.6s">
      <div class="card-h"><div class="card-t">Inköpare</div></div>
      <div class="card-b" id="inkopareCards">
        <div style="color:var(--muted);font-size:12px;padding:10px;">Laddar...</div>
      </div>
    </div>
  </div>

  <!-- PRODUKTION SUB-TABS -->
  <div class="gf view-section vs-produktion" style="margin-bottom:-4px;">
    <div id="prodSubTabs" style="display:flex;gap:2px;background:rgba(255,255,255,0.05);border-radius:8px;padding:3px;"></div>
  </div>

  <!-- SUB: DAGLIG -->
  <div class="gf view-section vs-produktion ps-daglig" id="sec-produktion">
    <div class="card anim" style="animation-delay:0.6s">
      <div class="card-h">
        <div class="card-t" id="dailyChartTitle">Daglig produktion</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(90,255,140,0.7)"></div>Över snitt</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(76,175,80,0.5)"></div>Under snitt</div>
          <div class="li" style="font-size:10px;color:var(--muted)"><div class="ld" style="background:rgba(91,143,255,0.15)"></div>Helg</div>
        </div>
      </div>
      <div class="card-b"><canvas id="dailyChart" style="max-height:190px"></canvas></div>
    </div>
  </div>
  <div class="g2 view-section vs-produktion ps-daglig">
    <div class="card anim" style="animation-delay:0.65s">
      <div class="card-h">
        <div class="card-t" id="calTitle">Aktivitet</div>
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
        <div class="cal-sum" id="calSummary"></div>
      </div>
    </div>
  </div>

  <!-- SUB: MEDELSTAM -->
  <!-- Insight highlight card above Medelstam-diagrams -->
  <div class="gf view-section vs-produktion ps-medelstam ps-hidden">
    <div class="card anim" id="medelstamInsightCard" style="display:none;">
      <div class="card-b" style="padding:22px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <div style="font-size:11px;font-weight:500;letter-spacing:0.02em;color:#666;margin-bottom:8px;">Bästa produktivitet</div>
            <div id="miBestProdVal" style="font-size:24px;font-weight:500;color:#e8e8e4;letter-spacing:-0.5px;line-height:1.1;">–</div>
            <div id="miBestProdLbl" style="font-size:11px;color:#7a7a72;margin-top:4px;"></div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:500;letter-spacing:0.02em;color:#666;margin-bottom:8px;">Mest volym</div>
            <div id="miMostVolVal" style="font-size:24px;font-weight:500;color:#e8e8e4;letter-spacing:-0.5px;line-height:1.1;">–</div>
            <div id="miMostVolLbl" style="font-size:11px;color:#7a7a72;margin-top:4px;"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="gf view-section vs-produktion ps-medelstam ps-hidden">
    <div class="card anim">
      <div class="card-h"><div class="card-t">Produktion per medelstamsklass</div></div>
      <div class="card-b">
        <div class="cleg">Volym per medelstamsklass</div>
        <canvas id="totalChart" style="max-height:155px"></canvas>
        <div class="cdiv"></div>
        <div class="cleg">m³/G15h per medelstamsklass</div>
        <canvas id="prodChart" style="max-height:175px"></canvas>
        <div class="cdiv"></div>
        <div class="cleg">Stammar/G15h per medelstamsklass</div>
        <canvas id="stg15Chart" style="max-height:175px"></canvas>
        <div style="margin-top:10px;" id="stg15Summary"></div>
      </div>
    </div>
  </div>
  <div class="gf view-section vs-produktion ps-medelstam ps-hidden" id="sec-mth">
    <div class="card anim">
      <div class="card-h">
        <div class="card-t">Flerträd (MTH) per medelstamsklass</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;border-radius:2px;background:rgba(90,255,140,0.4);"></div>
          <span style="font-size:10px;color:var(--muted);">MTH-andel</span>
        </div>
      </div>
      <div class="card-b"><div id="mthBody"></div></div>
    </div>
  </div>

  <!-- SUB: RP · AU -->
  <div class="gf view-section vs-produktion ps-rpau ps-hidden">
    <div class="card anim">
      <div class="card-h"><div class="card-t">Åtgärdsjämförelse per medelstamsklass</div></div>
      <div class="card-b">
        <div id="rpauSummary" style="display:none;margin-bottom:16px;padding:14px 18px;background:rgba(0,196,140,0.06);border:1px solid rgba(0,196,140,0.18);border-radius:12px;color:#e8e8e4;font-size:14px;font-weight:500;letter-spacing:-0.1px;text-align:center;"></div>
        <div id="atgardKlassWrap" style="display:none;">
          <div class="cleg">Volym per medelstamsklass — per åtgärd</div>
          <canvas id="atgardKlassChart" style="max-height:175px"></canvas>
        </div>
        <div id="atgardM3g15Wrap" style="display:none;">
          <div class="cdiv"></div>
          <div class="cleg">m³/G15h per medelstamsklass — per åtgärd</div>
          <canvas id="atgardM3g15Chart" style="max-height:175px"></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- SUB: SORTIMENT -->
  <div class="gf view-section vs-produktion ps-sortiment ps-hidden">
    <div class="card anim">
      <div class="card-h"><div class="card-t">Sortiment</div></div>
      <div class="card-b">
        <canvas id="sortChart" style="max-height:175px"></canvas>
      </div>
    </div>
  </div>
  <div class="gf view-section vs-produktion ps-sortiment ps-hidden" id="sec-sortiment-dag">
    <div class="card anim">
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
  <div class="gf view-section vs-produktion ps-sortiment ps-hidden">
    <div class="card anim">
      <div class="card-h"><div class="card-t">Bränsleförbrukning</div></div>
      <div class="card-b">
        <div class="forar-kpis" id="dieselKpis" style="justify-content:center;">
          <div class="fkpi"><div class="fkpi-v">–</div><div class="fkpi-l">Liter totalt</div></div>
          <div class="fkpi"><div class="fkpi-v">–</div><div class="fkpi-l">Liter / m³</div></div>
          <div class="fkpi"><div class="fkpi-v">–</div><div class="fkpi-l">Liter / stam</div></div>
        </div>
      </div>
    </div>
  </div>
  <div class="gf view-section vs-produktion ps-sortiment ps-hidden" id="sec-tradslag">
    <div class="card anim">
      <div class="card-h"><div class="card-t">Trädslag</div></div>
      <div class="card-b" onclick="openTradslag()" style="cursor:pointer;">
        <div id="tradslagRows"></div>
        <div class="snum-grid">
          <div class="snum"><div class="snum-v" id="mthAndelVal">0%</div><div class="snum-l">MTH-andel</div></div>
          <div class="snum"><div class="snum-v" id="mthStamVal">0</div><div class="snum-l">MTH stam</div></div>
          <div class="snum"><div class="snum-v" id="singleStamVal">0</div><div class="snum-l">Single stam</div></div>
        </div>
        <div style="margin-top:12px;font-size:10px;color:var(--muted);text-align:center;letter-spacing:0.3px;">Tryck för sortiment per trädslag →</div>
      </div>
    </div>
  </div>

</div>




<!-- BOLAG PANEL -->
<div class="bolag-panel" id="bolagPanel" style="width:min(480px,100vw)">
  <div class="forar-head">
    <div class="forar-av" id="bpLogo" style="border-radius:8px;font-size:11px;font-weight:500;"></div>
    <div>
      <div class="forar-title" id="bpName"></div>
      <div class="forar-sub" id="bpSub"></div>
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
      <div class="forar-sub"></div>
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
    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Fördelning</div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
      <div class="frow"><span class="frow-l">Processar</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:66%;background:rgba(90,255,140,0.4)"></div></div></div><span class="frow-v">111h · 66%</span></div>
      <div class="frow"><span class="frow-l">Kör</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:14%;background:rgba(255,255,255,0.2)"></div></div></div><span class="frow-v">23h · 14%</span></div>
      <div class="frow"><span class="frow-l">Korta stopp</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:2%;background:rgba(91,143,255,0.3)"></div></div></div><span class="frow-v">4h · 2%</span></div>
      <div class="frow"><span class="frow-l">Avbrott</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:11%;background:rgba(255,179,64,0.4)"></div></div></div><span class="frow-v">18h · 11%</span></div>
      <div class="frow" style="border-bottom:none"><span class="frow-l">Rast</span><div style="flex:1;margin:0 12px"><div class="prog"><div class="pf" style="width:7%;background:rgba(255,255,255,0.08)"></div></div></div><span class="frow-v">11h · 7%</span></div>
    </div>

    <!-- Avbrott per orsak -->
    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Avbrott per orsak</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Service & underhåll</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Schemalagt underhåll</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">6h 20min</div>
          <div style="font-size:10px;color:var(--muted);">4 tillfällen · 30%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Flytt</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Förflyttning mellan objekt</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">4h 45min</div>
          <div style="font-size:10px;color:var(--muted);">2 tillfällen · 22%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Maskinfel</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Oplanerade stopp</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">3h 10min</div>
          <div style="font-size:10px;color:var(--muted);">3 tillfällen · 15%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Korta stopp</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Stopp ≤ 15 min (other_work_sek)</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">2h 30min</div>
          <div style="font-size:10px;color:var(--muted);">48 tillfällen · 12%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Tankning</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Bränsle & smörjning</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">2h 05min</div>
          <div style="font-size:10px;color:var(--muted);">8 tillfällen · 10%</div>
        </div>
      </div>
      <div class="frow">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Väntan</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Väder, uppdrag, övrigt</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">1h 40min</div>
          <div style="font-size:10px;color:var(--muted);">5 tillfällen · 8%</div>
        </div>
      </div>
      <div class="frow" style="border-bottom:none;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:500;">Övrigt</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">Ej kategoriserat</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;font-variant-numeric:tabular-nums;">0h 40min</div>
          <div style="font-size:10px;color:var(--muted);">2 tillfällen · 3%</div>
        </div>
      </div>
    </div>

    <!-- Avbrott per förare (dynamiskt) -->
    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Avbrott per förare</div>
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
      <div class="forar-sub"></div>
    </div>
    <button class="forar-close" onclick="closeTradslag()">✕</button>
  </div>
  <div class="forar-body">
    <div class="forar-kpis" style="margin-bottom:20px;">
      <div class="fkpi"><div class="fkpi-v">1 807</div><div class="fkpi-l">m³ totalt</div></div>
      <div class="fkpi"><div class="fkpi-v">1 124</div><div class="fkpi-l">Sågtimmer</div></div>
      <div class="fkpi"><div class="fkpi-v">575</div><div class="fkpi-l">Massaved</div></div>
    </div>

    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Sortiment per trädslag</div>
    <div style="background:var(--surface2);border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:9px;font-weight:500;letter-spacing:0.2px;color:var(--muted);padding:10px 0 8px;"></th>
            <th style="text-align:right;font-size:9px;font-weight:500;letter-spacing:0.2px;color:var(--muted);padding:10px 0 8px;">Sågtimmer</th>
            <th style="text-align:right;font-size:9px;font-weight:500;letter-spacing:0.2px;color:var(--muted);padding:10px 0 8px;">Massaved</th>
            <th style="text-align:right;font-size:9px;font-weight:500;letter-spacing:0.2px;color:var(--muted);padding:10px 0 8px;">Energived</th>
            <th style="text-align:right;font-size:9px;font-weight:500;letter-spacing:0.2px;color:var(--muted);padding:10px 0 8px;">Totalt</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:10px 0;font-weight:500;">Gran</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">820</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">280</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">24</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">1 124</td>
          </tr>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:10px 0;font-weight:500;">Tall</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">220</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">215</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">63</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">498</td>
          </tr>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:10px 0;font-weight:500;">Björk</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">84</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">80</td>
            <td style="text-align:right;padding:10px 0;font-variant-numeric:tabular-nums;">21</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">185</td>
          </tr>
          <tr style="border-top:1px solid var(--border2)">
            <td style="padding:10px 0;font-size:10px;color:var(--muted);font-weight:500;">Totalt</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">1 124</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">575</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">108</td>
            <td style="text-align:right;padding:10px 0;font-weight:500;font-variant-numeric:tabular-nums;">1 807</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Andel per sortiment</div>
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
      <div class="forar-sub"></div>
    </div>
    <button class="forar-close" onclick="closeObjJmf()">✕</button>
  </div>
  <div class="forar-body">

    <!-- Tabell -->
    <div style="background:var(--surface2);border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);" id="jmfTableHead">
            <th style="text-align:left;padding:12px 16px;font-size:9px;font-weight:500;letter-spacing:0.2px;color:var(--muted);"></th>
          </tr>
        </thead>
        <tbody id="jmfTableBody"></tbody>
      </table>
    </div>

    <!-- Bäst-kort -->
    <div style="font-size:10px;font-weight:500;letter-spacing:0.2px;color:var(--muted);margin-bottom:10px;">Bäst per kategori</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" id="jmfBest"></div>

  </div>
</div>

<!-- OBJ TYP PANEL -->
<div class="bolag-panel" id="objTypPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;font-weight:500;" id="otpLabel">RP</div>
    <div>
      <div class="forar-title" id="otpTitle"></div>
      <div class="forar-sub"></div>
    </div>
    <button class="forar-close" onclick="closeObjTyp()">✕</button>
  </div>
  <div class="forar-body" id="otpBody"></div>
</div>

<!-- INKÖPARE PANEL -->
<div class="bolag-panel" id="inkPanel" style="width:min(480px,100vw)">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:50%;font-size:11px;font-weight:500;" id="inkLogo"></div>
    <div>
      <div class="forar-title" id="inkName"></div>
      <div class="forar-sub" id="inkSub"></div>
    </div>
    <button class="forar-close" onclick="closeInkopare()">✕</button>
  </div>
  <div class="forar-body" id="inkBody"></div>
</div>

<!-- DAG PANEL -->
<div class="dag-panel" id="dagPanel">
  <div class="forar-head">
    <div class="forar-av" style="border-radius:8px;font-size:13px;" id="dagIcon">📅</div>
    <div>
      <div class="forar-title" id="dagTitle"></div>
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
      <div class="forar-sub" id="fpSub"></div>
    </div>
    <button class="forar-close" onclick="closeForare()">✕</button>
  </div>
  <div class="forar-body" id="fpBody"></div>
</div>` }} />
      </div>

      {/* Jämför perioder section inside Analys view */}
      {activeView === 'analys' && (
        <div style={{ padding: '0 28px 60px', fontFamily: "'Geist', system-ui, sans-serif", maxWidth: 1400, margin: '0 auto' }}>
          <div style={{
            background: '#161614', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16, padding: 20, marginTop: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.02em', color: '#666', marginBottom: 8 }}>Jämför perioder</div>
              <div style={{ fontSize: 13, color: '#e8e8e4' }}>
                {valdMaskin ? `${valdMaskin.tillverkare} ${valdMaskin.modell}` : ''} — sida vid sida
              </div>
            </div>
            <button onClick={() => setActiveView('jamfor')} style={{
              padding: '8px 18px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
              background: '#1a1a18', color: '#e8e8e4',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'Geist', system-ui, sans-serif",
              transition: 'border-color 0.15s',
            }}>Öppna jämförelse →</button>
          </div>
        </div>
      )}

      </div>{/* end scrollable content */}
      </div>{/* end main content */}
      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="mv-bottomnav">
        {[
          { icon: '☀', label: 'Idag', view: 'idag' },
          { icon: '◻', label: 'Översikt', view: 'oversikt' },
          { icon: '▤', label: 'Produktion', view: 'produktion' },
          { icon: '⚠', label: 'Avbrott', view: 'avbrott' },
          { icon: '◈', label: 'Analys', view: 'analys' },
          { icon: '🔧', label: 'Logg', view: 'maskinlogg' },
        ].map(item => (
          <button key={item.view} onClick={() => {
            if (item.view === 'maskinlogg') { (window as any).__openMaskinLogg?.(); return; }
            setActiveView(item.view);
          }} className={activeView === item.view ? 'active' : ''}>
            <span className="mv-bn-icon">{item.icon}</span>
            <span className="mv-bn-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
