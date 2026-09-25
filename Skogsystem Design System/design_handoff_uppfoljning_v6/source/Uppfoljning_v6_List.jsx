// Uppföljning v6 — list med Oskotat-kort överst
const V6_GREY='#8e8e93'; const V6_GREY2='#636366';
const V6_CARD='#1c1c1e'; const V6_CARD2='#141416';
const V6_SEP='rgba(255,255,255,0.06)';
const V6_SK='#a8d582';   // skördare — mossgrön
const V6_ST='#f0b24c';   // skotare — bärnsten
const V6_WARN='#ff9f0a'; // varnings-orange för oskotat
const V6_DONE='#30d158';
const V6_FF="-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

function v6Fmt(iso){if(!iso) return '—';const d=new Date(iso);return `${d.getDate()} ${['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]}`;}

function v6Status(obj){
  if(obj.status==='avslutat') return {t:'Avslutat',k:'done'};
  const seven=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
  const skAct=obj.skordareLastDate && obj.skordareLastDate>=seven;
  const stAct=obj.skotareLastDate && obj.skotareLastDate>=seven;
  const skDone=!!obj.skordareSlut;
  if(skAct) return {t:'Skördare kör',k:'skordare'};
  if(skDone && stAct) return {t:'Skotare kör',k:'skotare'};
  if(skDone && !stAct) return {t:'Väntar på skotning',k:'vantar'};
  if(obj.skordareModell && !skAct && !skDone) return {t:'Skördare kör',k:'skordare'};
  return {t:'Pågående',k:'pagaende'};
}

// ============ OSKOTAT — kompakt expanderbar rad ============
// Liten rad högst upp. Tap → expanderar och visar uppdelningen.
function V6OskotatKort({data,onFilter}){
  const [open,setOpen]=React.useState(false);
  // Räkna per kategori
  const oskotat={slut:{m3:0,objekt:[]},gall:{m3:0,objekt:[]},grot:{m3:0,objekt:[]}};
  data.forEach(o=>{
    if(o.status==='avslutat') return;
    const kvar=Math.max(0,o.volymSkordare-o.volymSkotare);
    if(kvar<=0) return;
    if(o.grotSkotning){
      // Grot-objekt räknas separat (vi simulerar grot-volym som 15% av huvudvolym)
      const grotKvar=Math.round(o.volymSkordare*0.15);
      if(grotKvar>0){ oskotat.grot.m3+=grotKvar; oskotat.grot.objekt.push(o); }
    }
    if(o.typ==='slutavverkning'){ oskotat.slut.m3+=kvar; oskotat.slut.objekt.push(o); }
    else if(o.typ==='gallring'){ oskotat.gall.m3+=kvar; oskotat.gall.objekt.push(o); }
  });
  const total=oskotat.slut.m3+oskotat.gall.m3+oskotat.grot.m3;
  if(total===0) return null;

  const rad=(label,key,kat)=>{
    if(kat.m3===0) return null;
    return (<button key={key} onClick={()=>{onFilter(key);setOpen(false);}} style={{display:'flex',alignItems:'center',width:'100%',padding:'12px 18px',background:'transparent',border:'none',borderTop:`0.5px solid ${V6_SEP}`,color:'#fff',fontFamily:V6_FF,cursor:'pointer',textAlign:'left'}}
      onMouseDown={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
      onMouseUp={e=>e.currentTarget.style.background='transparent'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <span style={{flex:1,fontSize:14,fontWeight:500}}>{label}</span>
      <span style={{fontSize:11,color:V6_GREY,marginRight:12,fontVariantNumeric:'tabular-nums'}}>{kat.objekt.length} obj</span>
      <span style={{fontSize:15,fontWeight:600,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.2px',minWidth:56,textAlign:'right'}}>{Math.round(kat.m3).toLocaleString('sv-SE')}</span>
      <span style={{fontSize:10,color:V6_GREY,fontWeight:600,marginLeft:3}}>m³</span>
      <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:8}}><polyline points="1 1 7 7 1 13"/></svg>
    </button>);
  };

  return (<div style={{margin:'0 16px 14px',background:V6_CARD,borderRadius:12,overflow:'hidden'}}>
    <button onClick={()=>setOpen(!open)} style={{display:'flex',alignItems:'center',width:'100%',padding:'13px 16px',background:'transparent',border:'none',color:'#fff',fontFamily:V6_FF,cursor:'pointer',textAlign:'left',gap:10}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:V6_WARN,flexShrink:0}}/>
      <span style={{fontSize:14,fontWeight:600,letterSpacing:-0.1}}>Oskotat i skogen</span>
      <span style={{flex:1}}/>
      <span style={{fontSize:16,fontWeight:700,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.3px'}}>{Math.round(total).toLocaleString('sv-SE')}</span>
      <span style={{fontSize:11,color:V6_GREY,fontWeight:600,marginLeft:3}}>m³</span>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round" style={{marginLeft:6,transform:open?'rotate(90deg)':'none',transition:'transform .15s'}}><polyline points="4 2 8 6 4 10"/></svg>
    </button>
    {open && (<>
      {rad('Slutavverkning','slutavverkning',oskotat.slut)}
      {rad('Gallring','gallring',oskotat.gall)}
      {rad('Grot','grot',oskotat.grot)}
    </>)}
  </div>);
}

// ============ RING ============
function V6Ring({pct,size=52,stroke=3,color=V6_DONE}){
  const r=(size-stroke)/2, c=2*Math.PI*r;
  return (<svg width={size} height={size}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={c} strokeDashoffset={c-(pct/100)*c} transform={`rotate(-90 ${size/2} ${size/2})`}/>
  </svg>);
}

// ============ ROW (förenklad — färgprick + titel + m³ kvar) ============
function V6Row({obj,onClick,divider}){
  const kvar=Math.max(0,obj.volymSkordare-obj.volymSkotare);
  const status=v6Status(obj);
  const statusColor=status.k==='skordare'?V6_SK:status.k==='skotare'?V6_ST:status.k==='vantar'?V6_WARN:status.k==='done'?V6_DONE:V6_GREY;
  // Vad visas till höger? m³ kvar om det finns något, annars total skördad m³
  const showKvar=kvar>0 && obj.status!=='avslutat';
  const rightNum=showKvar?Math.round(kvar):Math.round(obj.volymSkordare);
  const rightLabel=showKvar?'kvar':'m³';
  // Dagar som virket legat oskotat (bara för väntar-status)
  let liggerDagar=null;
  if(status.k==='vantar' && obj.skordareSlut){
    const d=Math.round((new Date()-new Date(obj.skordareSlut))/864e5);
    if(d>0) liggerDagar=d;
  }
  return (<button onClick={onClick} style={{display:'flex',alignItems:'center',width:'100%',minHeight:60,padding:'12px 16px',gap:12,background:'transparent',border:'none',textAlign:'left',color:'#fff',fontFamily:V6_FF,cursor:'pointer',borderTop:divider?`0.5px solid ${V6_SEP}`:'none'}}
    onMouseDown={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
    onMouseUp={e=>e.currentTarget.style.background='transparent'}
    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
    <span style={{width:8,height:8,borderRadius:'50%',background:statusColor,flexShrink:0}}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:16,fontWeight:600,letterSpacing:-0.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{obj.namn}</div>
      <div style={{fontSize:12,color:V6_GREY,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
        {obj.typ==='slutavverkning'?'Slutavverkning':'Gallring'} · {obj.areal} ha
        {liggerDagar!=null && <span> · <span style={{color:V6_WARN,fontWeight:600}}>Oskotat {liggerDagar} {liggerDagar===1?'dag':'dagar'} · färdigskördat {v6Fmt(obj.skordareSlut)}</span></span>}
      </div>
    </div>
    <div style={{display:'flex',alignItems:'baseline',gap:3,flexShrink:0}}>
      <span style={{fontSize:17,fontWeight:600,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.3px',color:'#fff'}}>{rightNum.toLocaleString('sv-SE')}</span>
      <span style={{fontSize:11,color:V6_GREY,fontWeight:500}}>{rightLabel}{showKvar?' m³':''}</span>
    </div>
    <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:4,flexShrink:0}}><polyline points="1 1 7 7 1 13"/></svg>
  </button>);
}

function V6GroupHeader({title,count}){
  return (<div style={{padding:'20px 20px 8px',display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
    <span style={{fontSize:13,fontWeight:600,color:V6_GREY,letterSpacing:'0.04em',textTransform:'uppercase'}}>{title}</span>
    <span style={{fontSize:13,color:V6_GREY,fontVariantNumeric:'tabular-nums'}}>{count}</span>
  </div>);
}

function V6Search({value,onChange}){
  const [focused,setFocused]=React.useState(false);
  const inputRef=React.useRef(null);
  const active=focused||value.length>0;
  return (<div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
    <div style={{flex:1,display:'flex',alignItems:'center',gap:6,background:'rgba(118,118,128,0.24)',borderRadius:10,padding:'7px 8px',minWidth:0,position:'relative'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,flex:active?'0 0 auto':1,justifyContent:active?'flex-start':'center',transition:'flex .2s'}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={V6_GREY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        {!active && <span style={{fontSize:15,color:V6_GREY}}>Sök</span>}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setFocused(false)}
        style={{flex:active?1:0,width:active?'auto':0,border:'none',background:'none',outline:'none',color:'#fff',fontSize:15,fontFamily:V6_FF,minWidth:0,padding:0}}
      />
      {value.length>0 && (
        <button onMouseDown={e=>{e.preventDefault();onChange('');inputRef.current?.focus();}} style={{background:'rgba(255,255,255,0.22)',border:'none',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0,flexShrink:0}} aria-label="Rensa">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round"><line x1="1.5" y1="1.5" x2="6.5" y2="6.5"/><line x1="6.5" y1="1.5" x2="1.5" y2="6.5"/></svg>
        </button>
      )}
    </div>
    {active && (
      <button onMouseDown={e=>{e.preventDefault();onChange('');inputRef.current?.blur();}} style={{background:'none',border:'none',color:'#0a84ff',fontSize:15,fontFamily:V6_FF,cursor:'pointer',padding:'0 2px',flexShrink:0,whiteSpace:'nowrap'}}>Avbryt</button>
    )}
  </div>);
}

function V6Segmented({value,onChange,options}){
  return (<div style={{display:'flex',background:'rgba(118,118,128,0.24)',borderRadius:9,padding:2,position:'relative'}}>
    {options.map(([k,l])=>{const on=value===k;return (
      <button key={k} onClick={()=>onChange(k)} style={{flex:1,padding:'6px 8px',border:'none',borderRadius:7,fontSize:13,fontWeight:on?600:500,fontFamily:V6_FF,cursor:'pointer',background:on?'#636366':'transparent',color:'#fff',transition:'background .15s',minWidth:0,whiteSpace:'nowrap',letterSpacing:-0.1,boxShadow:on?'0 1px 2px rgba(0,0,0,0.2)':'none'}}>{l}</button>
    );})}
  </div>);
}

function V6ChipBar({value,onChange,options}){
  return (<div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}} className="v4-hscroll">
    {options.map(([k,l])=>{const on=value===k;return (
      <button key={k} onClick={()=>onChange(k)} style={{padding:'7px 14px',border:'none',borderRadius:999,fontSize:13,fontWeight:on?600:500,fontFamily:V6_FF,cursor:'pointer',background:on?'#fff':'rgba(118,118,128,0.24)',color:on?'#000':'#fff',whiteSpace:'nowrap',flexShrink:0}}>{l}</button>
    );})}
  </div>);
}

function UppfoljningListV6({data=OBJEKT_V4,onOpen}){
  const [sok,setSok]=React.useState('');
  const [typ,setTyp]=React.useState('alla');
  const [oskotatFilter,setOskotatFilter]=React.useState(null); // 'slutavverkning'|'gallring'|'grot'|null
  const [visaAvslutade,setVisaAvslutade]=React.useState(false);

  const filtered=data.filter(o=>{
    // Avslutade göms om inte toggle är på eller oskotatfilter är aktivt
    if(o.status==='avslutat' && !visaAvslutade && !oskotatFilter) return false;
    if(oskotatFilter){
      if(o.status==='avslutat') return false;
      const kvar=o.volymSkordare-o.volymSkotare;
      if(kvar<=0) return false;
      if(oskotatFilter==='grot' && !o.grotSkotning) return false;
      if(oskotatFilter!=='grot' && o.typ!==oskotatFilter) return false;
    } else {
      if(typ==='grot' && !o.grotSkotning) return false;
      if(typ!=='alla' && typ!=='grot' && o.typ!==typ) return false;
    }
    if(sok.trim()){const t=sok.toLowerCase();if(!(o.namn.toLowerCase().includes(t)||(o.agare||'').toLowerCase().includes(t)||(o.vo_nummer||'').includes(t))) return false;}
    return true;
  });

  // Räkna avslutade (alltid visa antalet i toggle)
  const avslutadeCount=data.filter(o=>o.status==='avslutat').length;

  const order=['skordare','skotare','vantar','pagaende','done'];
  const titles={skordare:'Skördare kör',skotare:'Skotare kör',vantar:'Väntar på skotning',pagaende:'Övrigt pågående',done:'Avslutade'};
  const groups={}; order.forEach(k=>groups[k]=[]);
  filtered.forEach(o=>{const k=v6Status(o).k; (groups[k]||groups.pagaende).push(o);});

  const filterLabel={slutavverkning:'Slutavverkning',gallring:'Gallring',grot:'Grot'}[oskotatFilter];

  return (<div style={{position:'absolute',inset:0,background:'#000',color:'#fff',fontFamily:V6_FF,overflowY:'auto',WebkitFontSmoothing:'antialiased'}}>
    <div style={{padding:'52px 20px 8px'}}>
      <h1 style={{fontSize:34,fontWeight:700,letterSpacing:'-0.8px',margin:0}}>Uppföljning</h1>
    </div>
    <div style={{padding:'8px 16px 14px'}}><V6Search value={sok} onChange={setSok}/></div>

    {!oskotatFilter && <V6OskotatKort data={data} onFilter={setOskotatFilter}/>}

    {oskotatFilter && (<div style={{margin:'0 16px 14px',padding:'12px 16px',background:V6_CARD,borderRadius:12,display:'flex',alignItems:'center',gap:10}}>
      <span style={{width:8,height:8,borderRadius:2,background:V6_WARN}}/>
      <span style={{flex:1,fontSize:14,fontWeight:500}}>Oskotat · {filterLabel}</span>
      <button onClick={()=>setOskotatFilter(null)} style={{background:'none',border:'none',color:V6_WARN,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:V6_FF}}>Rensa</button>
    </div>)}

    {!oskotatFilter && (<div style={{padding:'0 16px 12px'}}>
      <V6Segmented value={typ} onChange={setTyp} options={[['alla','Alla'],['slutavverkning','Slutavv.'],['gallring','Gallring'],['grot','Grot']]}/>
    </div>)}

    <div style={{paddingBottom:40}}>
      {order.map(k=>{const rows=groups[k]; if(!rows||rows.length===0) return null;
        return (<section key={k}>
          <V6GroupHeader title={titles[k]} count={rows.length}/>
          <div style={{margin:'0 16px',background:V6_CARD,borderRadius:14,overflow:'hidden'}}>
            {rows.map((o,i)=><V6Row key={o.vo_nummer} obj={o} onClick={()=>onOpen(o)} divider={i>0}/>)}
          </div>
        </section>);
      })}
      {filtered.length===0 && (<div style={{textAlign:'center',padding:80,color:V6_GREY,fontSize:15}}>Inga objekt hittades</div>)}

      {!oskotatFilter && avslutadeCount>0 && (
        <div style={{padding:'24px 16px 12px'}}>
          <button onClick={()=>setVisaAvslutade(!visaAvslutade)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:'12px 16px',background:'transparent',border:`0.5px solid ${V6_SEP}`,borderRadius:10,color:V6_GREY,fontSize:13,fontWeight:500,fontFamily:V6_FF,cursor:'pointer'}}>
            <span>{visaAvslutade?'Dölj':'Visa'} avslutade</span>
            <span style={{fontVariantNumeric:'tabular-nums'}}>({avslutadeCount})</span>
          </button>
        </div>
      )}
    </div>
  </div>);
}

Object.assign(window,{UppfoljningListV6,V6OskotatKort,V6Ring,V6Row,V6GroupHeader,V6Search,V6ChipBar,v6Status,V6_GREY,V6_GREY2,V6_CARD,V6_CARD2,V6_SEP,V6_SK,V6_ST,V6_WARN,V6_DONE,V6_FF});
