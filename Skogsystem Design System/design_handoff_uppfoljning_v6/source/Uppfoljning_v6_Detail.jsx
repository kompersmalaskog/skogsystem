// Uppföljning v6 — detail. Omdesign med fokus: lätt att förstå, snygg hierarki.
// Struktur: Headline (klartext) → Maskinkort (skördare+skotare) → Tidslinje → Fördjupning (kollapsad)

const V6D_GREY='#8e8e93';
const V6D_GREY2='#636366';
const V6D_CARD='#141416';
const V6D_CARD2='#1c1c1e';
const V6D_SEP='rgba(255,255,255,0.06)';
const V6D_SK='#a8d582';
const V6D_ST='#f0b24c';
const V6D_WARN='#ff9f0a';
const V6D_DONE='#30d158';
const V6D_BG='#000';
const V6D_FF="-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

function v6dFmt(iso){if(!iso) return '—';const d=new Date(iso);return `${d.getDate()} ${['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]}`;}
function v6dR1(n){return Math.round(n*10)/10;}
function v6dDays(a,b){if(!a) return 0; const d1=new Date(a), d2=b?new Date(b):new Date(); return Math.max(1,Math.round((d2-d1)/864e5));}
function v6dDaysAgo(iso){if(!iso) return null; const d=v6dDays(iso,null); return d===0?'idag':d===1?'igår':`${d} dagar sedan`;}

// ============ HEADLINE LOGIC ============
// Bygger en mening på svenska som svarar på "vad händer just nu"
function v6dHeadline(obj){
  const now=new Date().toISOString().slice(0,10);
  const seven=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
  const skAct=obj.skordareLastDate && obj.skordareLastDate>=seven;
  const stAct=obj.skotareLastDate && obj.skotareLastDate>=seven;
  const skDone=!!obj.skordareSlut;
  const kvar=Math.max(0,obj.volymSkordare-obj.volymSkotare);

  if(obj.status==='avslutat'){
    return {t:'Avslutat',sub:`Klart ${v6dFmt(obj.skotareSlut||obj.skordareSlut)}`,color:V6D_DONE,k:'done'};
  }
  if(skAct && !skDone){
    return {t:'Skördaren kör',sub:`${Math.round(obj.volymSkordare)} m³ skördat hittills`,color:V6D_SK,k:'skordare'};
  }
  if(skDone && stAct){
    return {t:'Skotaren kör',sub:`${Math.round(kvar)} m³ kvar att köra ut`,color:V6D_ST,k:'skotare'};
  }
  if(skDone && !stAct && kvar>0){
    const days=obj.skotareLastDate?v6dDaysAgo(obj.skotareLastDate):null;
    return {t:'Väntar på skotning',sub:`${Math.round(kvar)} m³ ligger kvar${days?` · senast körd ${days}`:''}`,color:V6D_WARN,k:'vantar'};
  }
  if(obj.skordareModell && !skAct && !skDone){
    return {t:'Skördare tilldelad',sub:`Start ${v6dFmt(obj.skordareStart)}`,color:V6D_SK,k:'skordare'};
  }
  return {t:'Pågående',sub:'',color:V6D_GREY,k:'pagaende'};
}

// ============ NAV ============
function V6DNav({onBack}){
  return (<nav style={{position:'sticky',top:0,zIndex:30,height:44,display:'flex',alignItems:'center',padding:'0 6px',background:'rgba(0,0,0,0.78)',backdropFilter:'blur(24px) saturate(180%)',WebkitBackdropFilter:'blur(24px) saturate(180%)',borderBottom:`0.5px solid ${V6D_SEP}`}}>
    <button onClick={onBack} style={{display:'flex',alignItems:'center',gap:2,background:'none',border:'none',color:'#fff',fontSize:17,cursor:'pointer',padding:'8px 10px',fontFamily:V6D_FF,letterSpacing:-0.2}}>
      <svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 2 2 10 10 18"/></svg>
      <span style={{marginLeft:2}}>Uppföljning</span>
    </button>
  </nav>);
}

// ============ HEADLINE ============
// Bara objekt-info (typ/areal/ägare + namn). Status-boxen borttagen — redundant med maskinkorten.
function V6DHeadline({obj}){
  const typLabel=obj.typ==='slutavverkning'?'Slutavverkning':'Gallring';
  return (<section style={{padding:'22px 24px 20px'}}>
    <div style={{fontSize:13,color:V6D_GREY,fontWeight:500}}>{typLabel} · {obj.areal} ha · {obj.agare}</div>
    <h1 style={{fontSize:30,fontWeight:700,letterSpacing:'-0.8px',margin:'4px 0 0',lineHeight:1.05,textWrap:'balance'}}>{obj.namn}</h1>
  </section>);
}

// ============ MASKINKORT ============
// Två kort sida vid sida. Varje kort: status, m³, m³/dag-snitt, senaste.
function V6DMaskinkort({obj}){
  const kvar=Math.max(0,obj.volymSkordare-obj.volymSkotare);
  const now=new Date().toISOString().slice(0,10);
  const seven=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
  const skAct=obj.skordareLastDate && obj.skordareLastDate>=seven;
  const stAct=obj.skotareLastDate && obj.skotareLastDate>=seven;

  // Skördare snitt
  const skProd=obj.prodSkordarePerDag;
  const skSnitt=skProd && skProd.length>0?Math.round(skProd.reduce((a,b)=>a+b.m3,0)/skProd.length):null;
  // Skotare snitt
  const stProd=obj.lassPerDag;
  const stSnitt=stProd && stProd.length>0?Math.round(stProd.reduce((a,b)=>a+b.m3,0)/stProd.length):null;

  const showSt=!!obj.skotareModell;

  return (<section style={{padding:'0 24px 24px'}}>
    <div style={{display:'grid',gridTemplateColumns:showSt?'1fr 1fr':'1fr',gap:10}}>
      <V6DMaskinCell
        label="Skördare" color={V6D_SK}
        modell={obj.skordareModell}
        forare={obj.operatorSkordare}
        statusKort={obj.skordareSlut?'Klar':skAct?'Aktiv idag':obj.skordareStart?`Start ${v6dFmt(obj.skordareStart)}`:'—'}
        primary={Math.round(obj.volymSkordare)}
        primaryUnit="m³"
        primaryLabel="skördat"
        snitt={skSnitt}
        senaste={obj.skordareLastDate?v6dDaysAgo(obj.skordareLastDate):null}
      />
      {showSt && <V6DMaskinCell
        label="Skotare" color={V6D_ST}
        modell={obj.skotareModell}
        forare={obj.operatorSkotare}
        statusKort={obj.skotareSlut?'Klar':stAct?'Aktiv idag':obj.skotareStart?`Start ${v6dFmt(obj.skotareStart)}`:'Ej startad'}
        primary={Math.round(obj.volymSkotare)}
        primaryUnit="m³"
        primaryLabel={kvar>0?`utkört · ${Math.round(kvar)} kvar`:'utkört'}
        snitt={stSnitt}
        senaste={obj.skotareLastDate?v6dDaysAgo(obj.skotareLastDate):null}
      />}
    </div>
  </section>);
}

function V6DMaskinCell({label,color,modell,forare,statusKort,primary,primaryUnit,primaryLabel,snitt,senaste}){
  return (<div style={{background:V6D_CARD,borderRadius:16,padding:'16px 16px 14px',minWidth:0,position:'relative',overflow:'hidden'}}>
    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:12}}>
      <span style={{width:8,height:8,borderRadius:2,background:color}}/>
      <span style={{fontSize:11,color:'#fff',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700}}>{label}</span>
    </div>
    <div style={{display:'flex',alignItems:'baseline',gap:5,minWidth:0}}>
      <span style={{fontSize:32,fontWeight:700,letterSpacing:'-0.8px',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{primary}</span>
      <span style={{fontSize:14,color:V6D_GREY,fontWeight:500}}>{primaryUnit}</span>
    </div>
    <div style={{fontSize:11,color:V6D_GREY,marginTop:4,fontWeight:500,minHeight:14}}>{primaryLabel}</div>
    <div style={{marginTop:14,paddingTop:12,borderTop:`0.5px solid ${V6D_SEP}`,fontSize:12,color:V6D_GREY,display:'flex',flexDirection:'column',gap:3,fontVariantNumeric:'tabular-nums'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:6}}><span>Status</span><span style={{color:'#fff',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'60%'}}>{statusKort}</span></div>
      {snitt!=null && <div style={{display:'flex',justifyContent:'space-between'}}><span>Snitt/dag</span><span style={{color:'#fff',fontWeight:500}}>{snitt} m³</span></div>}
      {senaste && <div style={{display:'flex',justifyContent:'space-between'}}><span>Senast</span><span style={{color:'#fff',fontWeight:500}}>{senaste}</span></div>}
      {modell && <div style={{marginTop:4,fontSize:11,color:V6D_GREY2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{modell}{forare?` · ${forare}`:''}</div>}
    </div>
  </div>);
}

// ============ TIDSLINJE (stor, central) ============
function V6DTidslinje({obj}){
  const allDates=[obj.skordareStart,obj.skordareSlut,obj.skotareStart,obj.skotareSlut].filter(Boolean);
  if(allDates.length===0) return null;
  const now=new Date().toISOString().slice(0,10);
  allDates.push(now);
  const min=allDates.reduce((a,b)=>a<b?a:b);
  const max=allDates.reduce((a,b)=>a>b?a:b);
  const totalDays=v6dDays(min,max);
  const toPct=(iso)=>{if(!iso) return 0; return (v6dDays(min,iso)/totalDays)*100;};
  const today=toPct(now);

  const tracks=[];
  if(obj.skordareModell){
    tracks.push({label:'Skördare',color:V6D_SK,start:obj.skordareStart,end:obj.skordareSlut||now,active:!obj.skordareSlut});
  }
  if(obj.skotareModell){
    tracks.push({label:'Skotare',color:V6D_ST,start:obj.skotareStart,end:obj.skotareSlut||now,active:obj.skotareStart && !obj.skotareSlut});
  }
  if(tracks.length===0) return null;

  return (<section style={{padding:'0 24px 24px'}}>
    <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',margin:'0 0 12px'}}>
      <h2 style={{fontSize:20,fontWeight:700,margin:0,letterSpacing:'-0.3px'}}>Tidslinje</h2>
      <span style={{fontSize:12,color:V6D_GREY,fontVariantNumeric:'tabular-nums'}}>{totalDays} dagar</span>
    </div>
    <div style={{background:V6D_CARD,borderRadius:16,padding:'18px 18px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:V6D_GREY2,fontWeight:600,marginBottom:16,fontVariantNumeric:'tabular-nums'}}>
        <span>{v6dFmt(min)}</span>
        <span>{obj.status==='avslutat'?v6dFmt(max):'Idag'}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:18,position:'relative'}}>
        {obj.status!=='avslutat' && (
          <div style={{position:'absolute',left:`${today}%`,top:-10,bottom:-10,width:1,background:'rgba(255,255,255,0.14)',pointerEvents:'none',zIndex:1}}/>
        )}
        {tracks.map((t,i)=>{
          const startPct=toPct(t.start);
          const endPct=toPct(t.end);
          const width=Math.max(2,endPct-startPct);
          return (<div key={i}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{width:8,height:8,borderRadius:2,background:t.color}}/>
              <span style={{fontSize:13,color:'#fff',fontWeight:600}}>{t.label}</span>
              <span style={{fontSize:11,color:V6D_GREY,fontVariantNumeric:'tabular-nums',marginLeft:'auto'}}>
                {v6dFmt(t.start)} → {t.active?'pågår':v6dFmt(t.end)}
              </span>
            </div>
            <div style={{position:'relative',height:12,background:'rgba(255,255,255,0.04)',borderRadius:6}}>
              <div style={{position:'absolute',left:`${startPct}%`,width:`${width}%`,top:0,bottom:0,background:t.color,borderRadius:6,opacity:t.active?1:0.5}}/>
              {t.active && <div style={{position:'absolute',left:`${endPct}%`,top:-2,width:16,height:16,marginLeft:-8,borderRadius:'50%',background:t.color,boxShadow:`0 0 0 3px ${V6D_CARD}, 0 0 14px ${t.color}`}}/>}
            </div>
          </div>);
        })}
      </div>
    </div>
  </section>);
}

// ============ KOLLAPSBAR SEKTION ============
function V6DCollapse({title,children,defaultOpen=false}){
  const [open,setOpen]=React.useState(defaultOpen);
  return (<div style={{borderTop:`0.5px solid ${V6D_SEP}`}}>
    <button onClick={()=>setOpen(!open)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'16px 24px',background:'transparent',border:'none',color:'#fff',fontFamily:V6D_FF,cursor:'pointer'}}>
      <span style={{fontSize:17,fontWeight:600,letterSpacing:-0.2}}>{title}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={V6D_GREY} strokeWidth="2" strokeLinecap="round" style={{transform:open?'rotate(90deg)':'none',transition:'transform .2s'}}><polyline points="4 2 8 6 4 10"/></svg>
    </button>
    {open && <div style={{paddingBottom:8}}>{children}</div>}
  </div>);
}

// ============ FÖRDJUPNING: PRODUKTIVITET ============
function V6DProduktivitet({obj}){
  const skRows=[
    obj.skordareM3G15h!=null?[obj.skordareM3G15h,'m³/G15h']:null,
    obj.skordareStammarG15h!=null?[obj.skordareStammarG15h,'stammar/G15h']:null,
    obj.skordareMedelstam!=null?[obj.skordareMedelstam,'m³ medelstam']:null,
    obj.flertradAndel!=null?[`${obj.flertradAndel}%`,'flerträd']:null,
  ].filter(Boolean);
  const stRows=obj.skotareModell && obj.skotareM3G15h?[
    [obj.skotareM3G15h,'m³/G15h'],
    obj.skotareLassG15h!=null?[obj.skotareLassG15h,'lass/G15h']:null,
    obj.skotareSnittlass!=null?[`${obj.skotareSnittlass} m³`,'snittlass']:null,
    obj.skotningsavstand?[`${obj.skotningsavstand} m`,'skotningsavstånd']:null,
  ].filter(Boolean):null;
  return (<div style={{padding:'0 24px 16px',display:'grid',gridTemplateColumns:stRows?'1fr 1fr':'1fr',gap:10}}>
    <V6DProdKort color={V6D_SK} label="Skördare" rows={skRows}/>
    {stRows && <V6DProdKort color={V6D_ST} label="Skotare" rows={stRows}/>}
  </div>);
}
function V6DProdKort({color,label,rows}){
  return (<div style={{background:V6D_CARD,borderRadius:14,padding:'14px 16px 12px'}}>
    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:10}}>
      <span style={{width:8,height:8,borderRadius:2,background:color}}/>
      <span style={{fontSize:11,color:'#fff',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700}}>{label}</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:9}}>
      {rows.map(([v,u],i)=>(<div key={i} style={{display:'flex',alignItems:'baseline',gap:6}}>
        <span style={{fontSize:20,fontWeight:700,letterSpacing:'-0.3px',fontVariantNumeric:'tabular-nums',lineHeight:1,whiteSpace:'nowrap'}}>{v}</span>
        <span style={{fontSize:11,color:V6D_GREY,textTransform:'uppercase',letterSpacing:'0.04em',fontWeight:600}}>{u}</span>
      </div>))}
    </div>
  </div>);
}

// ============ FÖRDJUPNING: PROD PER DAG (återanvänd v5-komponenten) ============
function V6DProdChart({data,color,snitt}){
  const [active,setActive]=React.useState(null);
  const max=Math.max(...data.map(d=>d.m3),1);
  const chartH=130;
  const barMaxH=chartH-20;
  const snittH=snitt?(snitt/max)*barMaxH:0;
  return (<div style={{background:V6D_CARD,borderRadius:14,padding:'16px 18px 14px'}}>
    <div style={{position:'relative',height:chartH,borderBottom:`0.5px solid ${V6D_SEP}`,paddingBottom:4}}>
      {snitt>0 && (<div style={{position:'absolute',left:0,right:0,bottom:4+snittH,height:0,borderTop:`1px dashed ${V6D_GREY2}`,pointerEvents:'none',zIndex:2}}>
        <span style={{position:'absolute',right:0,top:-16,fontSize:10,color:V6D_GREY,letterSpacing:'0.04em',textTransform:'uppercase',fontWeight:700,background:V6D_CARD,padding:'0 4px'}}>snitt {Math.round(snitt)} m³</span>
      </div>)}
      <div style={{display:'flex',alignItems:'flex-end',gap:8,height:'100%'}}>
        {data.map((d,i)=>{
          const h=(d.m3/max)*barMaxH;
          const isActive=active===i;
          return (<div key={i} onClick={()=>setActive(isActive?null:i)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,height:'100%',justifyContent:'flex-end',cursor:'pointer',position:'relative'}}>
            {isActive && d.lass!=null && (<div style={{position:'absolute',bottom:h+30,left:'50%',transform:'translateX(-50%)',background:'#2c2c2e',border:'0.5px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'6px 9px',whiteSpace:'nowrap',fontSize:11,color:'#fff',zIndex:5,boxShadow:'0 4px 12px rgba(0,0,0,0.4)'}}>{d.lass} lass · {Math.round(d.m3)} m³</div>)}
            <div style={{fontSize:11,color:'#fff',fontVariantNumeric:'tabular-nums',fontWeight:700}}>{Math.round(d.m3)}</div>
            <div style={{width:'100%',maxWidth:26,height:`${h}px`,background:color,borderRadius:3,minHeight:4,opacity:active!=null&&!isActive?0.4:1,transition:'opacity .15s'}}/>
          </div>);
        })}
      </div>
    </div>
    <div style={{display:'flex',gap:8,marginTop:8}}>
      {data.map((d,i)=>(<div key={i} style={{flex:1,textAlign:'center',fontSize:10,color:V6D_GREY,fontVariantNumeric:'tabular-nums',fontWeight:600}}>{d.datum}</div>))}
    </div>
  </div>);
}

function V6DProdPerDag({obj}){
  const skData=obj.prodSkordarePerDag;
  const stData=obj.lassPerDag;
  const hasSk=skData && skData.length>0;
  const hasSt=stData && stData.length>0;
  if(!hasSk && !hasSt) return null;
  const skSnitt=hasSk?skData.reduce((a,b)=>a+b.m3,0)/skData.length:0;
  const stSnitt=hasSt?stData.reduce((a,b)=>a+b.m3,0)/stData.length:0;
  const stTotalLass=hasSt?stData.reduce((a,b)=>a+b.lass,0):0;
  const stTotal=hasSt?stData.reduce((a,b)=>a+b.m3,0):0;
  const skTotal=hasSk?skData.reduce((a,b)=>a+b.m3,0):0;
  return (<div style={{padding:'0 24px 16px',display:'flex',flexDirection:'column',gap:16}}>
    {hasSk && <div>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:8}}>
        <span style={{width:8,height:8,borderRadius:2,background:V6D_SK,alignSelf:'center'}}/>
        <span style={{fontSize:13,fontWeight:600}}>Skördare</span>
        <span style={{fontSize:11,color:V6D_GREY,marginLeft:'auto',fontVariantNumeric:'tabular-nums'}}>Snitt {Math.round(skSnitt)} m³/dag · {Math.round(skTotal)} m³</span>
      </div>
      <V6DProdChart data={skData} color={V6D_SK} snitt={skSnitt}/>
    </div>}
    {hasSt && <div>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:8}}>
        <span style={{width:8,height:8,borderRadius:2,background:V6D_ST,alignSelf:'center'}}/>
        <span style={{fontSize:13,fontWeight:600}}>Skotare</span>
        <span style={{fontSize:11,color:V6D_GREY,marginLeft:'auto',fontVariantNumeric:'tabular-nums'}}>Snitt {Math.round(stSnitt)} m³/dag · {stTotalLass} lass · {Math.round(stTotal)} m³</span>
      </div>
      <V6DProdChart data={stData} color={V6D_ST} snitt={stSnitt}/>
      <div style={{fontSize:10,color:V6D_GREY2,marginTop:6,textAlign:'center'}}>Tryck på en stapel för att se antal lass</div>
    </div>}
  </div>);
}

// ============ FÖRDJUPNING: TRÄDSLAG + SORTIMENT ============
function V6DTradslag({tradslag}){
  if(!tradslag||tradslag.length===0) return null;
  const colors=['#a8d582','#64d2ff','#ff9f0a','#bf5af2','#ff453a'];
  return (<div style={{padding:'0 24px 16px'}}>
    <div style={{background:V6D_CARD,borderRadius:14,padding:'16px 16px 14px'}}>
      <div style={{fontSize:11,color:V6D_GREY,letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:700,marginBottom:12}}>Trädslag</div>
      <div style={{display:'flex',height:14,borderRadius:3,overflow:'hidden',gap:2,marginBottom:14}}>
        {tradslag.map((t,i)=>(<div key={t.namn} style={{width:`${t.pct}%`,background:colors[i%colors.length]}}/>))}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {tradslag.map((t,i)=>(<div key={t.namn} style={{display:'flex',alignItems:'baseline',gap:10}}>
          <span style={{width:8,height:8,borderRadius:2,background:colors[i%colors.length],flexShrink:0,alignSelf:'center'}}/>
          <span style={{flex:1,fontSize:14,color:'#fff'}}>{t.namn}</span>
          <span style={{fontSize:16,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{t.pct}%</span>
        </div>))}
      </div>
    </div>
  </div>);
}

function V6DSortiment({sortiment}){
  if(!sortiment||sortiment.length===0) return null;
  const max=Math.max(...sortiment.map(s=>s.m3));
  const total=sortiment.reduce((a,b)=>a+b.m3,0);
  return (<div style={{padding:'0 24px 16px'}}>
    <div style={{background:V6D_CARD,borderRadius:14,padding:'14px 18px 14px'}}>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:11,color:V6D_GREY,letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:700}}>Sortiment</span>
        <span style={{fontSize:12,color:V6D_GREY,fontVariantNumeric:'tabular-nums'}}>{total} m³</span>
      </div>
      {sortiment.map((s,i)=>(<div key={s.namn} style={{padding:'10px 0',borderTop:i===0?'none':`0.5px solid ${V6D_SEP}`}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontSize:13,color:'#fff',flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',paddingRight:8}}>{s.namn}</span>
          <span style={{fontSize:16,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{s.m3} <span style={{fontSize:10,color:V6D_GREY,fontWeight:600}}>m³</span></span>
        </div>
        <div style={{height:3,background:'rgba(255,255,255,0.04)',borderRadius:2}}>
          <div style={{width:`${(s.m3/max)*100}%`,height:'100%',background:V6D_SK,borderRadius:2}}/>
        </div>
      </div>))}
    </div>
  </div>);
}

// ============ FÖRDJUPNING: TIDFÖRDELNING ============
function V6DTid({obj}){
  const hasSk=obj.skordareG15h>0;
  const hasSt=obj.skotareG15h>0;
  if(!hasSk && !hasSt) return null;
  const rows=(prefix)=>{
    const r=[];
    const val=(k)=>obj[`${prefix}${k}`];
    if(val('G15h')!=null) r.push(['G15',val('G15h'),true]);
    if(val('G0')!=null) r.push(['G0',val('G0')]);
    if(val('Tomgang')!=null) r.push(['Tomgång',val('Tomgang')]);
    if(val('KortaStopp')!=null) r.push(['Korta stopp',val('KortaStopp')]);
    if(val('Rast')!=null) r.push(['Rast',val('Rast')]);
    if(val('Avbrott')!=null) r.push(['Avbrott',val('Avbrott')]);
    return r;
  };
  return (<div style={{padding:'0 24px 16px',display:'grid',gridTemplateColumns:hasSk && hasSt?'1fr 1fr':'1fr',gap:10}}>
    {hasSk && <V6DTidKort label="Skördare" color={V6D_SK} rows={rows('skordare')}/>}
    {hasSt && <V6DTidKort label="Skotare" color={V6D_ST} rows={rows('skotare')}/>}
  </div>);
}
function V6DTidKort({label,color,rows}){
  return (<div style={{background:V6D_CARD,borderRadius:14,padding:'14px 16px 12px'}}>
    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:10}}>
      <span style={{width:8,height:8,borderRadius:2,background:color}}/>
      <span style={{fontSize:11,color:'#fff',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700}}>{label}</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {rows.map(([k,v,accent],i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
        <span style={{fontSize:12,color:accent?'#fff':V6D_GREY,fontWeight:accent?600:400}}>{k}</span>
        <span style={{fontSize:accent?17:13,fontWeight:accent?700:500,color:'#fff',fontVariantNumeric:'tabular-nums'}}>{v}<span style={{fontSize:10,color:V6D_GREY,marginLeft:2}}>h</span></span>
      </div>))}
    </div>
  </div>);
}

// ============ FÖRDJUPNING: DIESEL ============
function V6DDiesel({obj}){
  if(!obj.dieselTotal) return null;
  return (<div style={{padding:'0 24px 16px'}}>
    <div style={{background:V6D_CARD,borderRadius:14,padding:'16px 18px 14px'}}>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
        <span style={{fontSize:11,color:V6D_GREY,letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:700}}>Diesel</span>
        <span style={{fontSize:12,color:V6D_GREY,fontVariantNumeric:'tabular-nums'}}>{(obj.dieselTotal/obj.volymSkordare).toFixed(2)} L/m³</span>
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:14}}>
        <span style={{fontSize:28,fontWeight:700,letterSpacing:'-0.6px',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{Math.round(obj.dieselTotal)}</span>
        <span style={{fontSize:13,color:V6D_GREY}}>liter</span>
      </div>
      <div style={{display:'flex',height:6,borderRadius:3,overflow:'hidden',background:'rgba(255,255,255,0.04)',marginBottom:10}}>
        <div style={{width:`${(obj.skordareL/obj.dieselTotal)*100}%`,background:V6D_SK}}/>
        <div style={{width:`${(obj.skotareL/obj.dieselTotal)*100}%`,background:V6D_ST}}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,fontSize:12}}>
        <div><span style={{color:V6D_GREY}}><span style={{display:'inline-block',width:7,height:7,borderRadius:2,background:V6D_SK,marginRight:5}}/>Skördare</span><span style={{marginLeft:6,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{obj.skordareL||0} L</span></div>
        <div><span style={{color:V6D_GREY}}><span style={{display:'inline-block',width:7,height:7,borderRadius:2,background:V6D_ST,marginRight:5}}/>Skotare</span><span style={{marginLeft:6,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{obj.skotareL||0} L</span></div>
      </div>
    </div>
  </div>);
}

// ============ FÖRDJUPNING: AVBROTT ============
function V6DAvbrott({obj}){
  const sk=obj.avbrottSkordare||[];
  const st=obj.avbrottSkotare||[];
  if(sk.length===0 && st.length===0) return null;
  const card=(label,color,items,totalt)=>(<div style={{background:V6D_CARD,borderRadius:14,padding:'14px 16px 12px'}}>
    <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
      <span style={{fontSize:11,color:'#fff',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700}}><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:color,marginRight:6,verticalAlign:'middle'}}/>{label}</span>
      <span style={{fontSize:15,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{totalt}</span>
    </div>
    {items.map((a,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:i>0?`0.5px solid ${V6D_SEP}`:'none'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,color:'#fff'}}>{a.orsak}</div>
        <div style={{fontSize:11,color:V6D_GREY,marginTop:2}}>{a.typ} · {a.antal} ggr</div>
      </div>
      <div style={{fontSize:13,color:V6D_GREY,fontVariantNumeric:'tabular-nums',fontWeight:600}}>{a.tid}</div>
    </div>))}
  </div>);
  return (<div style={{padding:'0 24px 16px',display:'flex',flexDirection:'column',gap:10}}>
    {sk.length>0 && card('Skördare',V6D_SK,sk,obj.avbrottSkordareTotalt)}
    {st.length>0 && card('Skotare',V6D_ST,st,obj.avbrottSkotareTotalt)}
  </div>);
}

// ============ FÖRDJUPNING: EXTERN SKOTNING ============
function V6DExtern({obj}){
  if(!obj.externSkotning) return null;
  const total=(obj.externPris||0)*(obj.externAntal||0);
  return (<div style={{padding:'0 24px 16px'}}>
    <div style={{background:V6D_CARD,borderRadius:14,padding:'14px 18px 14px'}}>
      <div style={{fontSize:11,color:V6D_GREY,letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Extern skotning</div>
      <div style={{fontSize:18,fontWeight:600}}>{obj.externForetag}</div>
      <div style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        <div><div style={{fontSize:10,color:V6D_GREY,letterSpacing:'0.04em',textTransform:'uppercase',fontWeight:600}}>Pris</div><div style={{fontSize:16,fontWeight:700,fontVariantNumeric:'tabular-nums',marginTop:2}}>{obj.externPris}</div></div>
        <div><div style={{fontSize:10,color:V6D_GREY,letterSpacing:'0.04em',textTransform:'uppercase',fontWeight:600}}>Antal</div><div style={{fontSize:16,fontWeight:700,fontVariantNumeric:'tabular-nums',marginTop:2}}>{obj.externAntal}</div></div>
        <div><div style={{fontSize:10,color:V6D_GREY,letterSpacing:'0.04em',textTransform:'uppercase',fontWeight:600}}>Totalt</div><div style={{fontSize:16,fontWeight:700,fontVariantNumeric:'tabular-nums',marginTop:2}}>{total.toLocaleString('sv-SE')} <span style={{fontSize:10,color:V6D_GREY}}>kr</span></div></div>
      </div>
    </div>
  </div>);
}

// ============ MAIN ============
function UppfoljningDetailV6({obj,onBack}){
  return (<div style={{position:'absolute',inset:0,background:V6D_BG,color:'#fff',fontFamily:V6D_FF,overflowY:'auto',WebkitFontSmoothing:'antialiased'}}>
    <V6DNav onBack={onBack}/>
    <V6DHeadline obj={obj}/>
    <V6DMaskinkort obj={obj}/>
    <V6DTidslinje obj={obj}/>

    {/* Fördjupning - allt kollapsat, öppnas på behov */}
    <div style={{marginTop:8}}>
      <V6DCollapse title="Produktivitet"><V6DProduktivitet obj={obj}/></V6DCollapse>
      <V6DCollapse title="Produktion per dag"><V6DProdPerDag obj={obj}/></V6DCollapse>
      <V6DCollapse title="Trädslag & sortiment">
        <V6DTradslag tradslag={obj.tradslag}/>
        <V6DSortiment sortiment={obj.sortiment}/>
      </V6DCollapse>
      <V6DCollapse title="Tid & diesel">
        <V6DTid obj={obj}/>
        <V6DDiesel obj={obj}/>
      </V6DCollapse>
      {(obj.avbrottSkordare?.length>0 || obj.avbrottSkotare?.length>0) && <V6DCollapse title="Avbrott"><V6DAvbrott obj={obj}/></V6DCollapse>}
      {obj.externSkotning && <V6DCollapse title="Extern skotning"><V6DExtern obj={obj}/></V6DCollapse>}
    </div>
    <div style={{height:60}}/>
  </div>);
}

Object.assign(window,{UppfoljningDetailV6,V6D_SK,V6D_ST,V6D_GREY,V6D_CARD,V6D_BG,V6D_FF});
