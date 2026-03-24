import { useState, useMemo } from "react";

const C = {
  bg:'#09090b', card:'#131315', card2:'#1a1a1d', border:'rgba(255,255,255,0.06)',
  t1:'#fafafa', t2:'rgba(255,255,255,0.7)', t3:'rgba(255,255,255,0.45)', t4:'rgba(255,255,255,0.2)',
  yellow:'#eab308', green:'#22c55e', orange:'#f97316', blue:'#3b82f6', red:'#ef4444', purple:'#5856d6',
};
const ff="-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";

const objektLista = [
  { id:'1', namn:'Karatorp RP 2025', vo:'11109556', uid:'881416', typ:'slutavverkning', agare:'Södra', areal:2.33, planVol:580, volSk:545, volSt:432, stammar:700, status:'pagaende',
    maskin:'PONSSE Scorpion Giant 8W', skordareStart:'2026-01-15', skordareSlut:null,
    skotare:'PONSSE Wisent 2015', skotareStart:'2026-01-22', skotareSlut:null,
    barighet:'Bra', terrang:'Flackt', lutning:'5%', undervxt:'Lite' },
  { id:'2', namn:'Björkebråten', vo:null, uid:'93693', typ:'gallring', agare:'Stefan Svensson', areal:4.5, planVol:200, volSk:184, volSt:146, stammar:631, status:'pagaende',
    maskin:'Rottne H8E', skordareStart:'2026-01-14', skordareSlut:'2026-01-28',
    skotare:'PONSSE Elephant King AF', skotareStart:'2026-02-03', skotareSlut:null,
    barighet:'Dålig', terrang:'Kuperat', lutning:'12%', undervxt:'Mycket' },
  { id:'3', namn:'Stenåsa', vo:'11108234', uid:'881320', typ:'gallring', agare:'Södra', areal:8.2, planVol:300, volSk:312, volSt:312, stammar:1245, status:'avslutat',
    maskin:'Rottne H8E', skordareStart:'2026-01-08', skordareSlut:'2026-01-19',
    skotare:'PONSSE Elephant King AF', skotareStart:'2026-01-22', skotareSlut:'2026-02-01',
    barighet:'Medel', terrang:'Kuperat', lutning:'10%', undervxt:'Lite' },
  { id:'4', namn:'Möckleryd', vo:'11107892', uid:'881105', typ:'slutavverkning', agare:'Södra', areal:3.8, planVol:820, volSk:856, volSt:856, stammar:1892, status:'avslutat',
    maskin:'PONSSE Scorpion Giant 8W', skordareStart:'2025-12-18', skordareSlut:'2026-01-08',
    skotare:'PONSSE Wisent 2015', skotareStart:'2025-12-28', skotareSlut:'2026-01-12',
    barighet:'Bra', terrang:'Flackt', lutning:'3%', undervxt:'Lite' },
  { id:'5', namn:'Mossvägen', vo:null, uid:'93701', typ:'slutavverkning', agare:'Lars Eriksson', areal:1.2, planVol:230, volSk:246, volSt:246, stammar:423, status:'avslutat',
    maskin:'John Deere 810E', skordareStart:'2025-12-10', skordareSlut:'2025-12-14',
    skotare:'PONSSE Wisent 2015', skotareStart:'2025-12-16', skotareSlut:'2025-12-18',
    barighet:'Bra', terrang:'Flackt', lutning:'2%', undervxt:'Lite' },
  { id:'6', namn:'Holmsjön Norra', vo:'11109601', uid:'881450', typ:'gallring', agare:'Södra', areal:12.4, planVol:450, volSk:0, volSt:0, stammar:0, status:'pagaende',
    maskin:'Rottne H8E', skordareStart:'2026-01-17', skordareSlut:null,
    skotare:null, skotareStart:null, skotareSlut:null,
    barighet:'Medel', terrang:'Kuperat', lutning:'15%', undervxt:'Mycket' },
];

const testAnalys = {
  medelstam: 0.29,
  skordare: {
    arbetstid:36.5, g15:28.5, g0:32.1, kortaStopp:85, avbrott:115, rast:60, tomgang:42,
    stamPerG15:22.1, m3PerG15:19.1, flertrad:34,
    diesel:{tot:142,perM3:0.26,perTim:4.98},
    sortiment:[
      {namn:'Grantimmer',vol:186,st:145},{namn:'Granmassa',vol:142,st:198},
      {namn:'Talltimmer',vol:98,st:87},{namn:'Tallmassa',vol:65,st:112},{namn:'Björkmassa',vol:54,st:89},
    ],
    avbrott_lista:[{typ:'Reparation',tid:45},{typ:'Tankning',tid:25},{typ:'Planering',tid:15},{typ:'Flytt',tid:30}]
  },
  skotare: {
    arbetstid:28.5, g15:22.3, g0:25.8, kortaStopp:42, avbrott:95, rast:45, tomgang:38,
    lass:48, snittLass:9.0, lassPerG15:2.15, m3PerG15:19.4, avstand:645, lastrede:'breddat',
    diesel:{tot:98,perM3:0.23,perG15:4.39},
    avbrott_lista:[{typ:'Reparation',tid:25},{typ:'Tankning',tid:20},{typ:'Väntan',tid:35},{typ:'Flytt',tid:15}]
  }
};

const fmtDate = (d) => { if(!d) return null; const p=new Date(d); return p.toLocaleDateString('sv-SE',{day:'numeric',month:'short'}); };
const daysBetween = (a,b) => { if(!a||!b) return null; return Math.floor((new Date(b)-new Date(a))/864e5); };
const fmtMin = (m) => { const h=Math.floor(m/60); const min=m%60; return `${h}:${min.toString().padStart(2,'0')}`; };

function Section({title, sub, children, defaultOpen=false}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{marginBottom:12}}>
      <div onClick={()=>setOpen(!open)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',background:C.card,borderRadius:open?'16px 16px 0 0':16,cursor:'pointer',border:'1px solid '+C.border,borderBottom:open?'none':undefined}}>
        <div>
          <span style={{fontSize:15,fontWeight:600,color:C.t1}}>{title}</span>
          {sub && <span style={{fontSize:12,color:C.t3,marginLeft:10}}>{sub}</span>}
        </div>
        <span style={{fontSize:16,color:C.t4,transform:open?'rotate(90deg)':'',transition:'transform 0.2s ease'}}>›</span>
      </div>
      {open && (
        <div style={{background:C.card,borderRadius:'0 0 16px 16px',border:'1px solid '+C.border,borderTop:'none',padding:'4px 20px 20px'}}>
          {children}
        </div>
      )}
    </div>
  );
}

function Bar({pct, color, height=8}) {
  return (
    <div style={{height,background:'rgba(255,255,255,0.04)',borderRadius:height/2,overflow:'hidden'}}>
      <div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:color,borderRadius:height/2,opacity:.65,transition:'width 0.5s ease'}}/>
    </div>
  );
}

function ObjektKort({obj, onClick}) {
  const kvar = obj.volSk>0 ? 100-Math.round((obj.volSt/obj.volSk)*100) : 0;
  const ej = obj.volSk===0;
  const tf = obj.typ==='slutavverkning'?C.yellow:C.green;
  return (
    <div onClick={onClick} style={{background:C.card,borderRadius:16,padding:'18px 18px',cursor:'pointer',marginBottom:10,border:'1px solid '+C.border,transition:'transform 0.1s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:ej?0:14}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:3,height:22,borderRadius:2,background:tf,opacity:.6}}/>
            <div>
              <div style={{fontSize:17,fontWeight:600,letterSpacing:'-0.3px'}}>{obj.namn}</div>
              <div style={{fontSize:12,color:C.t3,marginTop:3}}>{obj.agare}{obj.vo && <span style={{marginLeft:8,padding:'2px 8px',background:'rgba(255,255,255,0.04)',borderRadius:5,fontSize:10,fontWeight:500}}>VO {obj.vo}</span>}</div>
            </div>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          {!ej && <div style={{fontSize:24,fontWeight:700,letterSpacing:'-0.5px'}}>{obj.volSk}<span style={{fontSize:11,fontWeight:400,color:C.t3}}> m³</span></div>}
          <span style={{fontSize:10,fontWeight:500,color:tf,padding:'2px 10px',background:tf+'15',borderRadius:6}}>
            {obj.typ==='slutavverkning'?'Slutavv.':'Gallring'}
          </span>
        </div>
      </div>
      {ej ? (
        <div style={{marginTop:10,fontSize:12,color:C.t3}}>Ej startad · {obj.areal} ha</div>
      ) : (
        <div>
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:5,padding:'6px 10px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
              <span style={{fontSize:10,color:C.t3}}>Skördare</span>
              <span style={{fontSize:10,color:C.t2,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{obj.maskin.split(' ').slice(-2).join(' ')}</span>
              <span style={{fontSize:9,fontWeight:600,color:obj.skordareSlut?C.t3:C.green,whiteSpace:'nowrap'}}>{obj.skordareSlut?'Klar':'Pågår'}</span>
            </div>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:5,padding:'6px 10px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
              <span style={{fontSize:10,color:C.t3}}>Skotare</span>
              <span style={{fontSize:10,color:C.t2,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{obj.skotare?obj.skotare.split(' ').slice(-2).join(' '):'—'}</span>
              <span style={{fontSize:9,fontWeight:600,color:obj.volSt>0&&!obj.skotareSlut?C.green:obj.skotareSlut?C.t3:obj.skotare?C.orange:C.t4,whiteSpace:'nowrap'}}>{obj.skotareSlut?'Klar':obj.volSt>0?'Pågår':obj.skotare?'Väntar':'—'}</span>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                <span style={{fontSize:11,color:C.t3}}>{obj.areal} ha</span>
                <span style={{fontSize:11,color:kvar>30?C.orange:C.green,fontWeight:600}}>{kvar}% kvar i skogen</span>
              </div>
              <Bar pct={100-kvar} color={kvar>30?C.orange:C.green}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ObjektDetalj({obj, onBack}) {
  const d = testAnalys;
  const framkort = obj.volSk>0?Math.round((obj.volSt/obj.volSk)*100):0;
  const kvar = 100-framkort;
  const tf = obj.typ==='slutavverkning'?C.yellow:C.green;
  const tempoSk = obj.volSk>0?(obj.volSk/d.skordare.g15).toFixed(1):'–';
  const tempoSt = obj.volSt>0?(obj.volSt/d.skotare.g15).toFixed(1):'–';
  const sagbart = Math.round((d.skordare.sortiment.filter(s=>s.namn.includes('timmer')).reduce((a,s)=>a+s.vol,0)/d.skordare.sortiment.reduce((a,s)=>a+s.vol,0))*100);
  const produktiv = Math.round((d.skordare.g15/d.skordare.arbetstid)*100);
  const produktivSt = Math.round((d.skotare.g15/d.skotare.arbetstid)*100);

  const skDagar = daysBetween(obj.skordareStart, obj.skordareSlut);
  const stDagar = daysBetween(obj.skotareStart, obj.skotareSlut);
  const glapp = daysBetween(obj.skordareSlut, obj.skotareStart);

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.t1,fontFamily:ff,WebkitFontSmoothing:'antialiased'}}>
      {/* Header */}
      <div style={{padding:'14px 20px 20px',background:C.card}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.blue,fontSize:15,cursor:'pointer',padding:0,marginBottom:16,fontFamily:ff,fontWeight:500}}>‹ Tillbaka</button>
        
        <div style={{marginBottom:16}}>
          <div style={{fontSize:28,fontWeight:700,letterSpacing:'-0.5px',marginBottom:6}}>{obj.namn}</div>
          <div style={{fontSize:14,color:C.t2}}>
            {obj.agare} · {obj.areal} ha
            <span style={{marginLeft:10,padding:'3px 12px',borderRadius:12,fontSize:12,fontWeight:500,background:tf+'15',color:tf}}>
              {obj.typ==='slutavverkning'?'Slutavverkning':'Gallring'}
            </span>
          </div>
          <div style={{fontSize:11,color:C.t3,marginTop:8}}>
            {obj.vo && <span>VO {obj.vo} · </span>}ID {obj.uid}
          </div>
        </div>

        {/* Terräng */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {[{l:'Bärighet',v:obj.barighet},{l:'Terräng',v:obj.terrang},{l:'Lutning',v:obj.lutning},{l:'Underväxt',v:obj.undervxt}].map((t,i) => (
            <div key={i} style={{padding:'5px 12px',background:'rgba(255,255,255,0.04)',borderRadius:8}}>
              <span style={{fontSize:10,color:C.t3,marginRight:6}}>{t.l}</span>
              <span style={{fontSize:11,fontWeight:500,color:t.v==='Dålig'||t.v==='Brant'||t.v==='Mycket'?C.orange:C.t2}}>{t.v}</span>
            </div>
          ))}
        </div>

        {/* Maskiner med datum */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.blue}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.t1}}>{obj.maskin}</div>
                <div style={{fontSize:10,color:C.t3,marginTop:2}}>Skördare</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:12,color:C.t2}}>{fmtDate(obj.skordareStart)} → {obj.skordareSlut?fmtDate(obj.skordareSlut):'pågår'}</div>
              {skDagar && <div style={{fontSize:10,color:C.t3,marginTop:2}}>{skDagar} dagar</div>}
            </div>
          </div>
          
          {/* Glapp-indikator */}
          {glapp !== null && glapp > 0 && (
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <span style={{fontSize:10,color:glapp>7?C.orange:C.t3}}>{glapp} dagar mellanrum</span>
            </div>
          )}
          {obj.skotareStart && glapp !== null && glapp <= 0 && (
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <span style={{fontSize:10,color:C.green}}>Parallellkörning</span>
            </div>
          )}

          <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.green}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.t1}}>{obj.skotare||'Ej tilldelad'}</div>
                <div style={{fontSize:10,color:C.t3,marginTop:2}}>Skotare</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              {obj.skotareStart ? (
                <>
                  <div style={{fontSize:12,color:C.t2}}>{fmtDate(obj.skotareStart)} → {obj.skotareSlut?fmtDate(obj.skotareSlut):'pågår'}</div>
                  {stDagar && <div style={{fontSize:10,color:C.t3,marginTop:2}}>{stDagar} dagar</div>}
                </>
              ) : (
                <div style={{fontSize:12,color:C.t4}}>Väntar</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'16px 16px 80px'}}>

        {/* Visa avverkning */}
        <button onClick={()=>alert('Öppnar kartvy med GPS-spår, högar och stickvägar för '+obj.namn)} style={{width:'100%',padding:'16px',background:C.card,border:'1px solid '+C.border,borderRadius:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:16}}>
          <span style={{fontSize:15,fontWeight:600,color:C.t1,fontFamily:ff}}>Visa avverkning på karta</span>
          <span style={{fontSize:14,color:C.t4}}>›</span>
        </button>

        {/* Stora nyckeltal */}
        <div style={{display:'flex',gap:10,marginBottom:12}}>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'24px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Skördat</div>
            <div style={{fontSize:42,fontWeight:700,letterSpacing:'-1px',lineHeight:1}}>{obj.volSk}</div>
            <div style={{fontSize:13,color:C.t3,marginTop:4}}>m³</div>
          </div>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'24px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Skotat</div>
            <div style={{fontSize:42,fontWeight:700,letterSpacing:'-1px',lineHeight:1}}>{obj.volSt}</div>
            <div style={{fontSize:13,color:C.t3,marginTop:4}}>m³</div>
          </div>
        </div>

        <div style={{display:'flex',gap:10,marginBottom:16}}>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'18px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Medelstam</div>
            <div style={{fontSize:24,fontWeight:700}}>{d.medelstam}<span style={{fontSize:12,fontWeight:400,color:C.t3}}> m³fub</span></div>
          </div>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'18px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Volym/ha</div>
            <div style={{fontSize:24,fontWeight:700}}>{(obj.volSk/obj.areal).toFixed(0)}<span style={{fontSize:12,fontWeight:400,color:C.t3}}> m³</span></div>
          </div>
        </div>

        {/* Kvar i skogen */}
        <div style={{background:C.card,borderRadius:16,padding:'20px 20px',marginBottom:16,border:'1px solid '+C.border}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
            <span style={{fontSize:14,fontWeight:500,color:C.t2}}>Kvar i skogen</span>
            <div style={{textAlign:'right'}}>
              <span style={{fontSize:28,fontWeight:700,color:kvar>30?C.orange:C.green}}>{kvar}%</span>
            </div>
          </div>
          <Bar pct={kvar} color={kvar>30?C.orange:C.green} height={10}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.t3,marginTop:8}}>
            <span>Skotat {obj.volSt} m³</span>
            <span>Kvar ~{obj.volSk-obj.volSt} m³</span>
          </div>
        </div>

        {/* Diesel fritt bilväg */}
        <div style={{background:C.card,borderRadius:16,padding:'24px 20px',marginBottom:16,border:'1px solid '+C.border,textAlign:'center'}}>
          <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Diesel fritt bilväg</div>
          <div style={{fontSize:36,fontWeight:700,letterSpacing:'-1px'}}>{(d.skordare.diesel.perM3+d.skotare.diesel.perM3).toFixed(2)}<span style={{fontSize:14,fontWeight:400,color:C.t3}}> L/m³fub</span></div>
          <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:12,fontSize:12,color:C.t3}}>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.blue,marginRight:6}}/>Skördare {d.skordare.diesel.perM3} L</span>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.green,marginRight:6}}/>Skotare {d.skotare.diesel.perM3} L</span>
          </div>
        </div>

        {/* Tidsbalans */}
        <Section title="Tidsbalans" defaultOpen={true}>
          <div style={{marginTop:8}}/>
          <div style={{display:'flex',height:36,borderRadius:10,overflow:'hidden',marginBottom:12}}>
            <div style={{background:C.blue,width:`${(d.skordare.g15/(d.skordare.g15+d.skotare.g15))*100}%`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:600}}>{d.skordare.g15}h</div>
            <div style={{background:C.green,width:`${(d.skotare.g15/(d.skordare.g15+d.skotare.g15))*100}%`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:600}}>{d.skotare.g15}h</div>
          </div>
          <div style={{display:'flex',justifyContent:'center',gap:24,fontSize:11,color:C.t3,marginBottom:10}}>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.blue,marginRight:5}}/>Skördare · {obj.maskin}</span>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.green,marginRight:5}}/>Skotare · {obj.skotare||'Ej tilldelad'}</span>
          </div>
          <div style={{textAlign:'center',fontSize:13,color:C.green,fontWeight:500}}>
            Skotare {Math.round((1-(d.skotare.g15/d.skordare.g15))*100)}% snabbare
          </div>
        </Section>

        {/* ── SKÖRDARE ── */}
        <div style={{display:'flex',alignItems:'center',gap:10,margin:'24px 0 12px',paddingLeft:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.blue}}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:'-0.3px'}}>Skördare</span>
          <span style={{fontSize:12,color:C.t3}}>{obj.maskin}</span>
        </div>

        <Section title="Tid" sub={`${produktiv}% produktiv`}>
          <div style={{display:'flex',justifyContent:'space-around',marginTop:8,marginBottom:20}}>
            {[{l:'Arbetstid',v:d.skordare.arbetstid},{l:'G15',v:d.skordare.g15},{l:'G0',v:d.skordare.g0}].map((t,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:'-0.5px'}}>{t.v}</div>
                <div style={{fontSize:12,color:C.t3,marginTop:4}}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{height:1,background:C.border,margin:'0 0 16px'}}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'Korta stopp',v:fmtMin(d.skordare.kortaStopp)},{l:'Avbrott',v:fmtMin(d.skordare.avbrott)},{l:'Rast',v:fmtMin(d.skordare.rast)},{l:'Tomgång',v:fmtMin(d.skordare.tomgang)}].map((t,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{t.l}</div>
                <div style={{fontSize:14,fontWeight:600}}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Produktion" sub={`${d.skordare.flertrad}% flerträd`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8}}>
            {[{l:'Stammar/G15',v:d.skordare.stamPerG15},{l:'m³/G15',v:d.skordare.m3PerG15},{l:'Stammar',v:d.skordare.antalStammar||obj.stammar}].map((p,i) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{p.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{p.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Sortiment" sub={`${sagbart}% sågbart`}>
          <div style={{marginTop:4}}>
          {d.skordare.sortiment.map((s,i) => {
            const totVol = d.skordare.sortiment.reduce((a,x)=>a+x.vol,0);
            const pct = Math.round((s.vol/totVol)*100);
            return (
              <div key={i} style={{display:'flex',alignItems:'center',padding:'12px 0',borderBottom:i<d.skordare.sortiment.length-1?'1px solid '+C.border:'none'}}>
                <span style={{fontSize:14,fontWeight:500,color:C.t2,flex:1}}>{s.namn}</span>
                <span style={{fontSize:12,color:C.t3,minWidth:35,textAlign:'right',marginRight:12}}>{pct}%</span>
                <span style={{fontSize:14,fontWeight:600,minWidth:60,textAlign:'right'}}>{s.vol} m³</span>
                <span style={{fontSize:12,color:C.t3,minWidth:45,textAlign:'right',marginLeft:8}}>{s.st} st</span>
              </div>
            );
          })}
          </div>
        </Section>

        <Section title="Diesel" sub={`${d.skordare.diesel.perM3} L/m³`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8}}>
            {[{l:'Totalt',v:d.skordare.diesel.tot,s:'L'},{l:'Per m³fub',v:d.skordare.diesel.perM3,s:'L'},{l:'Per timme',v:d.skordare.diesel.perTim,s:'L'}].map((x,i) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{x.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{x.v} <span style={{fontSize:12,color:C.t3,fontWeight:400}}>{x.s}</span></div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Avbrott & stillestånd">
          <div style={{marginTop:4}}>
          {d.skordare.avbrott_lista.map((a,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:i<d.skordare.avbrott_lista.length-1?'1px solid '+C.border:'none'}}>
              <span style={{fontSize:14,color:C.t2}}>{a.typ}</span>
              <span style={{fontSize:14,fontWeight:600,color:C.orange}}>{fmtMin(a.tid)}</span>
            </div>
          ))}
          </div>
        </Section>

        {/* ── SKOTARE ── */}
        <div style={{display:'flex',alignItems:'center',gap:10,margin:'24px 0 12px',paddingLeft:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.green}}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:'-0.3px'}}>Skotare</span>
          <span style={{fontSize:12,color:C.t3}}>{obj.skotare}</span>
        </div>

        <Section title="Tid" sub={`${produktivSt}% produktiv`}>
          <div style={{display:'flex',justifyContent:'space-around',marginTop:8,marginBottom:20}}>
            {[{l:'Arbetstid',v:d.skotare.arbetstid},{l:'G15',v:d.skotare.g15},{l:'G0',v:d.skotare.g0}].map((t,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:'-0.5px'}}>{t.v}</div>
                <div style={{fontSize:12,color:C.t3,marginTop:4}}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{height:1,background:C.border,margin:'0 0 16px'}}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'Korta stopp',v:fmtMin(d.skotare.kortaStopp)},{l:'Avbrott',v:fmtMin(d.skotare.avbrott)},{l:'Rast',v:fmtMin(d.skotare.rast)},{l:'Tomgång',v:fmtMin(d.skotare.tomgang)}].map((t,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{t.l}</div>
                <div style={{fontSize:14,fontWeight:600}}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Produktion" sub={`${d.skotare.lastrede} lastrede`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'20px 16px',marginTop:8}}>
            {[{l:'Antal lass',v:d.skotare.lass,s:''},{l:'Snitt lass',v:d.skotare.snittLass,s:'m³'},{l:'Lass/G15',v:d.skotare.lassPerG15,s:''},{l:'m³/G15',v:d.skotare.m3PerG15,s:''},{l:'Skotningsavst.',v:d.skotare.avstand,s:'m'}].map((p,i) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{p.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{p.v} <span style={{fontSize:12,color:C.t3,fontWeight:400}}>{p.s}</span></div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Diesel" sub={`${d.skotare.diesel.perM3} L/m³`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8}}>
            {[{l:'Totalt',v:d.skotare.diesel.tot,s:'L'},{l:'Per m³fub',v:d.skotare.diesel.perM3,s:'L'},{l:'Per G15',v:d.skotare.diesel.perG15,s:'L'}].map((x,i) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{x.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{x.v} <span style={{fontSize:12,color:C.t3,fontWeight:400}}>{x.s}</span></div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Avbrott & stillestånd">
          <div style={{marginTop:4}}>
          {d.skotare.avbrott_lista.map((a,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:i<d.skotare.avbrott_lista.length-1?'1px solid '+C.border:'none'}}>
              <span style={{fontSize:14,color:C.t2}}>{a.typ}</span>
              <span style={{fontSize:14,fontWeight:600,color:C.orange}}>{fmtMin(a.tid)}</span>
            </div>
          ))}
          </div>
        </Section>

      </div>
    </div>
  );
}

export default function App() {
  const [flik, setFlik] = useState('pagaende');
  const [filter, setFilter] = useState('alla');
  const [sok, setSok] = useState('');
  const [valt, setValt] = useState(null);

  const lista = useMemo(() => {
    return objektLista
      .filter(o=>o.status===flik)
      .filter(o=>filter==='alla'||o.typ===filter)
      .filter(o=>{
        if(!sok.trim())return true;
        const t=sok.toLowerCase();
        return o.namn.toLowerCase().includes(t)||o.agare.toLowerCase().includes(t)||o.vo?.includes(t)||o.uid.includes(t);
      });
  },[flik,filter,sok]);

  if(valt) return <ObjektDetalj obj={valt} onBack={()=>setValt(null)}/>;

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.t1,fontFamily:ff,WebkitFontSmoothing:'antialiased'}}>
      <div style={{padding:'24px 20px 0'}}>
        <div style={{fontSize:32,fontWeight:700,letterSpacing:'-0.5px',marginBottom:20}}>Uppföljning</div>
        {/* Sök */}
        <div style={{display:'flex',alignItems:'center',background:'rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',gap:10,marginBottom:16}}>
          <span style={{fontSize:16,color:C.t3}}>⌕</span>
          <input type="text" placeholder="Sök objekt, ägare, VO..." value={sok} onChange={e=>setSok(e.target.value)} style={{flex:1,border:'none',background:'none',fontSize:16,color:C.t1,outline:'none',fontFamily:ff}}/>
          {sok&&<button onClick={()=>setSok('')} style={{background:C.t3,border:'none',color:C.bg,width:20,height:20,borderRadius:'50%',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>}
        </div>
        {/* Flikar */}
        <div style={{display:'flex',gap:28,borderBottom:'1px solid '+C.border,marginBottom:14}}>
          {['pagaende','avslutat'].map(f => (
            <button key={f} onClick={()=>setFlik(f)} style={{padding:'12px 0',border:'none',background:'none',fontSize:15,fontWeight:500,color:flik===f?C.t1:C.t3,cursor:'pointer',borderBottom:flik===f?'2px solid '+C.t1:'2px solid transparent',marginBottom:-1,fontFamily:ff}}>
              {f==='pagaende'?'Pågående':'Avslutade'}
            </button>
          ))}
        </div>
        {/* Filter */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[{k:'alla',l:'Alla'},{k:'slutavverkning',l:'Slutavverkning'},{k:'gallring',l:'Gallring'}].map(f => (
            <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:'9px 18px',borderRadius:22,border:'none',fontSize:13,fontWeight:500,cursor:'pointer',background:filter===f.k?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.03)',color:filter===f.k?C.t1:C.t3,fontFamily:ff}}>{f.l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:'0 16px 40px'}}>
        {lista.length===0 ? (
          <div style={{textAlign:'center',padding:60,color:C.t3}}><div style={{fontSize:40,marginBottom:12,opacity:.3}}>○</div><div style={{fontSize:15}}>Inga objekt hittades</div></div>
        ) : lista.map(o => <ObjektKort key={o.id} obj={o} onClick={()=>setValt(o)}/>)}
      </div>
    </div>
  );
}
