import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';
import { FABRICS, PROD_TYPES, JZ, JZ_ZONES, JZ_LABELS, JZALUZJA_MOTORS, JZALUZJA_REMOTES,
  jzLookup, RCITY, RDUO, REL, KSLIM, KUNIV, KN, KP, RS_WIDTHS, RS_HEIGHTS,
  RS_C, RS_D, RS_E, RS_SUPP_WIDTHS, RS_PROFIL, RS_OB_B, RS_OB_C, RS_OB_D,
  RS_BASE, ROOM_PRESETS, WIN_PRESETS,
  IMG_ROOM_SALON, IMG_ROOM_KUCHNIA, IMG_ROOM_SYPIALNIA, IMG_ROOM_POKÓJ,
  IMG_ROOM_GABINET, IMG_OKNO, IMG_JZ_ALUMINIUM, IMG_JZ_BAMBOO, IMG_JZ_BASSWOOD,
  IMG_ROLETA_RELAX, IMG_ROLETA_PRINT, IMG_ROLETA_BACK, IMG_ROLETA_PODSZEWKA,
  IMG_ROLETA_DUO, IMG_ROLETA_FRONT, IMG_ROLETA_CASCADE,
  IMG_ROLETA_LANCUSZEK_BIALY, IMG_ROLETA_LANCUSZEK_METALOWY,
  IMG_FALDA_POJEDYNCZA, IMG_FALDA_PODWOJNA, IMG_FALDA_POTROJNA,
  IMG_FALDA_PLASKA, IMG_FALDA_STUDIO, IMG_MODEL_TASMA, IMG_MODEL_WAVE,
  IMG_MODEL_FALDA, LOGO_SRC, SB_STORAGE
} from '../constants/data.js';
import { generateFabricOrderPDF, generateClientEmail,


  generateSewingOrderPDF, generateSewingOrderPDFFromRows
} from '../lib/pdf.js';
const ce = React.createElement;

export function Chip(p){
  return ce("button",{onClick:p.onClick,style:{padding:"12px 22px",borderRadius:24,border:"1.5px solid "+(p.active?"var(--gr)":"var(--bd2)"),background:p.active?"var(--grl)":"transparent",color:p.active?"var(--grd)":"var(--t1)",fontSize:15,cursor:"pointer",marginBottom:6,transition:"all .15s",minHeight:50,fontWeight:p.active?600:400}},p.label);
}
export function Chips(p){return ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}},p.items.filter(Boolean));}
export function Fld(p){return ce("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:p.noMb?0:4}},ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase"}},(p.label||"").toUpperCase()),p.children);}
export function Section(p){
  return ce("div",{style:{borderTop:"1px solid var(--bd3)",paddingTop:20,marginTop:20}},
    ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:18}},
      ce("div",{style:{width:26,height:26,borderRadius:13,background:"var(--t1)",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},p.num),
      ce("span",{style:{fontSize:16,fontWeight:600,color:"var(--t1)",letterSpacing:"0.01em"}},p.title)
    ),
    p.children
  );
}

export function FabPicker(p){
  var qs=useState("");var q=qs[0],setQ=qs[1];
  var os=useState(false);var open=os[0],setOpen=os[1];
  var list=q?FABRICS.filter(function(f){return f.name.toLowerCase().includes(q.toLowerCase())||f.prod.toLowerCase().includes(q.toLowerCase());}):FABRICS;
  var sf=FABRICS.find(function(f){return f.name===p.fabName;});
  var hasSelection=p.fabName||p.fabMan!=null;
  return ce("div",{style:{border:"1.5px solid "+(open?"var(--t1)":"var(--bd2)"),borderRadius:12,overflow:"hidden",marginTop:8,marginBottom:4,transition:"border-color .15s"}},
    ce("div",{
      onClick:function(){setOpen(!open);},
      style:{padding:"14px 16px",background:open?"var(--grl)":"var(--bg2)",fontSize:13,fontWeight:500,color:"var(--t1)",display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none",transition:"background .15s"}
    },
      ce("span",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:open?"var(--grd)":"var(--t2)",textTransform:"uppercase",flexShrink:0}},"Tkanina"),
      hasSelection?ce("span",{style:{background:"var(--grl)",border:"1px solid var(--grm)",borderRadius:6,padding:"4px 10px",color:"var(--grd)",fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
        sf?(p.fabName+" · "+sf.brutto+" zł/mb"):("ręczna: "+p.fabMan+" zł/mb")
      ):ce("span",{style:{color:"var(--t3)",fontSize:13,flex:1}},
        "nie wybrano — kliknij aby wybrać"
      ),
      ce("span",{style:{color:"var(--t3)",fontSize:16,transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s",flexShrink:0,lineHeight:1,display:"inline-block"}},"⌄")
    ),
    open?ce("div",null,
      ce("input",{autoFocus:true,value:q,onChange:function(ev){setQ(ev.target.value);},placeholder:"Szukaj tkaniny po nazwie lub dostawcy...",style:{width:"100%",padding:"14px 16px",fontSize:16,border:"none",borderBottom:"1px solid var(--bd3)",background:"var(--bg)",color:"var(--t1)",outline:"none",boxSizing:"border-box",minHeight:56}}),
      ce("div",{style:{maxHeight:240,overflowY:"auto"}},
        list.map(function(f){
          var active=p.fabName===f.name;
          return ce("div",{key:f.name,
            onClick:function(){p.onSelect(f);setOpen(false);setQ("");},
            style:{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid var(--bd3)",cursor:"pointer",fontSize:15,background:active?"var(--grl)":"var(--bg)"}
          },
            active?ce("span",{style:{color:"var(--gr)",fontSize:14,flexShrink:0,width:16}},"✓"):ce("span",{style:{width:16,flexShrink:0}}),
            ce("span",{style:{flex:1,fontWeight:active?600:500,color:"var(--t1)"}},f.name),
            ce("span",{style:{fontSize:11,color:"var(--t3)",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.prod),
            ce("span",{style:{color:"var(--t2)",whiteSpace:"nowrap",fontSize:13}},f.width+"cm"),
            ce("span",{style:{color:"var(--grd)",fontWeight:600,whiteSpace:"nowrap",fontSize:13}},f.brutto+" zł")
          );
        })
      ),
      ce("div",{style:{padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderTop:"1px solid var(--bd3)",background:"var(--bg2)",flexWrap:"wrap"}},
        ce("label",{style:{fontSize:12,color:"var(--t2)",flex:1}},"Cena ręczna (zł/mb):"),
        ce("input",{type:"number",value:p.fabMan!=null?p.fabMan:"",onChange:function(ev){p.onManual(ev.target.value===""?null:+ev.target.value);},placeholder:"np. 180",style:{width:100,padding:"12px 12px",fontSize:15,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right",minHeight:52}}),
        ce("label",{style:{fontSize:12,color:"var(--t2)",whiteSpace:"nowrap"}},"Wys. belki (cm):"),
        ce("input",{type:"number",value:p.fabManW!=null?p.fabManW:"",onChange:function(ev){p.onManualW(ev.target.value===""?null:+ev.target.value);},placeholder:"np. 300",style:{width:90,padding:"12px 12px",fontSize:15,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right",minHeight:52}})
      )
    ):null
  );
}

// ── MODALS ─────────────────────────────────────────────────────────────────

export function ProdCard(p){
  var prod=p.prod,c=prod.c||{},par=prod.par||{};
  function sc(k,v){p.onChange(mg(prod,{c:mg(c,{[k]:v})}));}
  function tc(k,a,b){a=a||"nie";b=b||"tak";sc(k,c[k]===b?a:b);}
  function sp(k,v){p.onChange(mg(prod,{par:mg(par,{[k]:+v||0})}));}
  function sf(f){p.onChange(mg(prod,{fabName:f.name,fabP:f.brutto,fabW:f.width,fabMan:null}));}
  function sfm(v){p.onChange(mg(prod,{fabName:null,fabP:null,fabW:prod.fabManW||null,fabMan:v}));}
  function sfmW(v){p.onChange(mg(prod,{fabManW:v,fabW:v}));}

  // --- Curtain split logic ---
  // split: "left" | "right" | "equal" | "unequal"
  var split = c.split||"unequal";
  var leftW = c.leftW||0;
  var rightW = c.rightW||0;
  var totalW = par.wCm||0;

  // If split is "unequal": entering left auto-calculates right
  function setLeftW(v){
    var lv = +v||0;
    var rv = totalW>0 ? Math.max(0, totalW-lv) : 0;
    p.onChange(mg(prod,{c:mg(c,{leftW:lv, rightW:totalW>0?rv:c.rightW||0})}));
  }
  function setRightW(v){
    var rv = +v||0;
    var lv = totalW>0 ? Math.max(0, totalW-rv) : 0;
    p.onChange(mg(prod,{c:mg(c,{rightW:rv, leftW:totalW>0?lv:c.leftW||0})}));
  }
  function onTotalWChange(v){
    var tw = +v||0;
    sp("wCm", v);
    // Recalculate panels based on split
    if(split==="unequal" && tw>0 && c.leftW>0){
      var newR = Math.max(0, tw - c.leftW);
      p.onChange(mg(prod,{par:mg(par,{wCm:tw}), c:mg(c,{rightW:newR})}));
    }
  }

  
  // Override prod panels for calc
  var prodForCalc = mg(prod, {panels: getPanelsForProd(prod)});

  var res=calc(prodForCalc),total=res.total,lines=res.lines,warn=res.warn;
  var eff=prod.mp!=null?prod.mp:total;
  var lbl=(PROD_TYPES.find(function(t){return t.id===prod.type;})||{label:prod.type}).label;

  function hasProdData(pr){
    return !!(pr.fabName||pr.fabMan||pr.mp!=null||pr.innyNazwa||
      (pr.par&&(pr.par.wCm||pr.par.hCm||pr.par.len))||
      (pr.c&&Object.keys(pr.c).length>1));
  }
  var spt=useState(null),pendingType=spt[0],setPendingType=spt[1];
  var src=useState(false),showRemoveConfirm=src[0],setShowRemoveConfirm=src[1];
  var typeChips=PROD_TYPES.map(function(t){
    return ce(Chip,{key:t.id,label:t.label,active:prod.type===t.id,onClick:function(){
      if(prod.type===t.id)return;
      if(hasProdData(prod)){setPendingType(t);return;}
      p.onChange(mg(prod,{type:t.id,c:{split:"unequal"},par:{},panels:[],fabName:null,fabP:null,fabW:null,fabMan:null,mp:null,innyNazwa:undefined}));
    }});
  });

  var panOpts=["Zas\u0142ona lewa","Zas\u0142ona prawa","Firana \u015brodkowa","Panel lewy","Panel prawy","Ca\u0142o\u015b\u0107"];
  var form=null;

  if(prod.type==="zaslona"||prod.type==="firana"){

    // ── SVG HELPERS FOR MODEL & FOLD TYPE ──────────────────────────────
    // Model SVGs: Fałda, Wave, Taśma Marszcząca
    function svgFalda(active){
      var bg=active?"var(--t1)":"var(--bg)";
      var cl=active?"#fff":"#888";
      var cl2=active?"rgba(255,255,255,0.5)":"#ccc";
      return '<svg width="100" height="70" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">'+
        '<rect width="100" height="70" fill="'+bg+'" rx="6"/>'+
        '<rect x="8" y="10" width="84" height="2.5" rx="1.2" fill="'+cl2+'"/>'+
        '<rect x="10" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        '<rect x="86" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        // Panel lewy - fałdy (pinch pleat)
        '<line x1="20" y1="12" x2="18" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="24" y1="12" x2="22" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="28" y1="12" x2="26" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        // fałda 1 górna
        '<path d="M19 12 L21.5 10 L24 12" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
        '<line x1="34" y1="12" x2="32" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="38" y1="12" x2="36" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="42" y1="12" x2="40" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        // fałda 2 górna
        '<path d="M33 12 L35.5 10 L38 12" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
        // Panel prawy
        '<line x1="58" y1="12" x2="56" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="62" y1="12" x2="60" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="66" y1="12" x2="64" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<path d="M57 12 L59.5 10 L62 12" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
        '<line x1="72" y1="12" x2="70" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="76" y1="12" x2="74" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<line x1="80" y1="12" x2="78" y2="60" stroke="'+cl+'" stroke-width="1.2" fill="none"/>'+
        '<path d="M71 12 L73.5 10 L76 12" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
        '</svg>';
    }
    function svgWave(active){
      var bg=active?"var(--t1)":"var(--bg)";
      var cl=active?"#fff":"#888";
      var cl2=active?"rgba(255,255,255,0.5)":"#ccc";
      return '<svg width="100" height="70" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">'+
        '<rect width="100" height="70" fill="'+bg+'" rx="6"/>'+
        '<rect x="8" y="10" width="84" height="2.5" rx="1.2" fill="'+cl2+'"/>'+
        '<rect x="10" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        '<rect x="86" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        // Wave pattern - sinusoidal folds left panel
        '<path d="M14 13 C16 18,18 22,20 18 C22 14,24 10,26 14 C28 18,30 22,32 18 C34 14,36 10,38 14 C40 18,42 22,44 18" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
        // Wave lines going down - uniform smooth
        '<path d="M14 13 L13 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M20 18 L19 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M26 14 L25 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M32 18 L31 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M38 14 L37 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M44 18 L43 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        // right panel
        '<path d="M54 13 C56 18,58 22,60 18 C62 14,64 10,66 14 C68 18,70 22,72 18 C74 14,76 10,78 14 C80 18,82 22,84 18" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
        '<path d="M54 13 L53 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M60 18 L59 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M66 14 L65 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M72 18 L71 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M78 14 L77 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<path d="M84 18 L83 58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '</svg>';
    }
    function svgTasma(active){
      var bg=active?"var(--t1)":"var(--bg)";
      var cl=active?"#fff":"#888";
      var cl2=active?"rgba(255,255,255,0.5)":"#ccc";
      return '<svg width="100" height="70" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">'+
        '<rect width="100" height="70" fill="'+bg+'" rx="6"/>'+
        '<rect x="8" y="10" width="84" height="2.5" rx="1.2" fill="'+cl2+'"/>'+
        '<rect x="10" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        '<rect x="86" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        // Taśma marszcząca - gęste równomierne fałdy
        '<path d="M13 13 Q15 10,17 13 Q19 16,21 13 Q23 10,25 13 Q27 16,29 13 Q31 10,33 13 Q35 16,37 13 Q39 10,41 13 Q43 16,45 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
        '<line x1="13" y1="13" x2="13" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="17" y1="13" x2="17" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="21" y1="13" x2="21" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="25" y1="13" x2="25" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="29" y1="13" x2="29" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="33" y1="13" x2="33" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="37" y1="13" x2="37" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="41" y1="13" x2="41" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="45" y1="13" x2="45" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        // right panel
        '<path d="M55 13 Q57 10,59 13 Q61 16,63 13 Q65 10,67 13 Q69 16,71 13 Q73 10,75 13 Q77 16,79 13 Q81 10,83 13 Q85 16,87 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
        '<line x1="55" y1="13" x2="55" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="59" y1="13" x2="59" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="63" y1="13" x2="63" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="67" y1="13" x2="67" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="71" y1="13" x2="71" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="75" y1="13" x2="75" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="79" y1="13" x2="79" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="83" y1="13" x2="83" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '<line x1="87" y1="13" x2="87" y2="58" stroke="'+cl+'" stroke-width="1" fill="none"/>'+
        '</svg>';
    }

    // Fold type SVGs: Pojedyncza, Podwójna, Potrójna, Płaska, Studio
    function svgFoldType(type,active){
      var bg=active?"var(--t1)":"var(--bg)";
      var cl=active?"#fff":"#888";
      var cl2=active?"rgba(255,255,255,0.5)":"#ccc";
      var lines="";
      if(type==="pojedyncza"){
        // Pojedyncza - jedna fałda - jeden szpic na górze
        lines='<line x1="20" y1="13" x2="18" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M17 13 L20 9 L23 13" stroke="'+cl+'" stroke-width="2" fill="none"/>'+
          '<line x1="34" y1="13" x2="32" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M31 13 L34 9 L37 13" stroke="'+cl+'" stroke-width="2" fill="none"/>'+
          '<line x1="48" y1="13" x2="46" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M45 13 L48 9 L51 13" stroke="'+cl+'" stroke-width="2" fill="none"/>'+
          '<line x1="62" y1="13" x2="60" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M59 13 L62 9 L65 13" stroke="'+cl+'" stroke-width="2" fill="none"/>'+
          '<line x1="76" y1="13" x2="74" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M73 13 L76 9 L79 13" stroke="'+cl+'" stroke-width="2" fill="none"/>';
      }else if(type==="podwojna"){
        // Podwójna - dwie szpilki obok siebie
        lines='<line x1="17" y1="13" x2="15" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="21" y1="13" x2="19" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M15 13 L17 9 L19 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<path d="M19 13 L21 9 L23 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<line x1="32" y1="13" x2="30" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="36" y1="13" x2="34" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M30 13 L32 9 L34 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<path d="M34 13 L36 9 L38 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<line x1="47" y1="13" x2="45" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="51" y1="13" x2="49" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M45 13 L47 9 L49 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<path d="M49 13 L51 9 L53 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<line x1="62" y1="13" x2="60" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="66" y1="13" x2="64" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M60 13 L62 9 L64 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<path d="M64 13 L66 9 L68 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<line x1="77" y1="13" x2="75" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="81" y1="13" x2="79" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<path d="M75 13 L77 9 L79 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>'+
          '<path d="M79 13 L81 9 L83 13" stroke="'+cl+'" stroke-width="1.8" fill="none"/>';
      }else if(type==="potrojna"){
        // Potrójna - trzy szpilki
        lines='<line x1="14" y1="13" x2="12" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="18" y1="13" x2="16" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="22" y1="13" x2="20" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M13 13 L15 9 L17 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M17 13 L19 9 L21 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M21 13 L23 9 L25 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<line x1="35" y1="13" x2="33" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="39" y1="13" x2="37" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="43" y1="13" x2="41" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M34 13 L36 9 L38 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M38 13 L40 9 L42 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M42 13 L44 9 L46 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<line x1="56" y1="13" x2="54" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="60" y1="13" x2="58" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="64" y1="13" x2="62" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M55 13 L57 9 L59 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M59 13 L61 9 L63 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M63 13 L65 9 L67 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<line x1="77" y1="13" x2="75" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="81" y1="13" x2="79" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="85" y1="13" x2="83" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M76 13 L78 9 L80 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M80 13 L82 9 L84 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>'+
          '<path d="M84 13 L86 9 L88 13" stroke="'+cl+'" stroke-width="1.5" fill="none"/>';
      }else if(type==="plaska"){
        // Płaska - fałda pudełkowa, płaski top
        lines='<rect x="14" y="10" width="12" height="3" rx="0" fill="'+cl2+'"/>'+
          '<line x1="14" y1="13" x2="12" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="26" y1="13" x2="24" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="20" y1="13" x2="18" y2="62" stroke="'+cl+'" stroke-width="0.8"/>'+
          '<rect x="33" y="10" width="12" height="3" rx="0" fill="'+cl2+'"/>'+
          '<line x1="33" y1="13" x2="31" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="45" y1="13" x2="43" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="39" y1="13" x2="37" y2="62" stroke="'+cl+'" stroke-width="0.8"/>'+
          '<rect x="52" y="10" width="12" height="3" rx="0" fill="'+cl2+'"/>'+
          '<line x1="52" y1="13" x2="50" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="64" y1="13" x2="62" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="58" y1="13" x2="56" y2="62" stroke="'+cl+'" stroke-width="0.8"/>'+
          '<rect x="71" y="10" width="12" height="3" rx="0" fill="'+cl2+'"/>'+
          '<line x1="71" y1="13" x2="69" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="83" y1="13" x2="81" y2="62" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="77" y1="13" x2="75" y2="62" stroke="'+cl+'" stroke-width="0.8"/>';
      }else if(type==="studio"){
        // Studio - gruba, luźna fałda (jedna centralna, szeroka)
        lines='<path d="M16 13 Q20 9,24 13 L22 62 L18 62 Z" fill="'+cl2+'" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="14" y1="13" x2="12" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="28" y1="13" x2="26" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M38 13 Q42 9,46 13 L44 62 L40 62 Z" fill="'+cl2+'" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="36" y1="13" x2="34" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="50" y1="13" x2="48" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M60 13 Q64 9,68 13 L66 62 L62 62 Z" fill="'+cl2+'" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="58" y1="13" x2="56" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="72" y1="13" x2="70" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<path d="M80 13 Q84 9,88 13 L86 62 L82 62 Z" fill="'+cl2+'" stroke="'+cl+'" stroke-width="1.2"/>'+
          '<line x1="78" y1="13" x2="76" y2="62" stroke="'+cl+'" stroke-width="1"/>'+
          '<line x1="90" y1="13" x2="88" y2="62" stroke="'+cl+'" stroke-width="1"/>';
      }
      return '<svg width="100" height="75" viewBox="0 0 100 75" xmlns="http://www.w3.org/2000/svg">'+
        '<rect width="100" height="75" fill="'+bg+'" rx="6"/>'+
        '<rect x="8" y="10" width="84" height="2.5" rx="1.2" fill="'+cl2+'"/>'+
        '<rect x="10" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        '<rect x="86" y="9" width="4" height="6" rx="2" fill="'+cl2+'"/>'+
        lines+
        '</svg>';
    }

    // ── STATE from c ───────────────────────────────────────────────────
    var model = c.model||null;              // null | "falda" | "wave" | "tasma"
    var foldType = c.foldType||null; // null|"pojedyncza"|"podwojna"|"potrojna"|"plaska"|"studio"
    var split = c.split||"unequal";
    var totalW = par.wCm||0;

    function setLeftW(v){
      var lv=+v||0;
      var rv=totalW>0?Math.max(0,totalW-lv):0;
      p.onChange(mg(prod,{c:mg(c,{leftW:lv,rightW:totalW>0?rv:c.rightW||0})}));
    }
    function setRightW(v){
      var rv=+v||0;
      var lv=totalW>0?Math.max(0,totalW-rv):0;
      p.onChange(mg(prod,{c:mg(c,{rightW:rv,leftW:totalW>0?lv:c.leftW||0})}));
    }
    function onTotalWChange(v){
      var tw=+v||0;
      sp("wCm",v);
      if(split==="unequal"&&tw>0&&c.leftW>0){
        var newR=Math.max(0,tw-c.leftW);
        p.onChange(mg(prod,{par:mg(par,{wCm:tw}),c:mg(c,{rightW:newR})}));
      }
    }

    // ── SECTION 0: Model selection ─────────────────────────────────────
    var modelSelector = ce("div",{style:{marginBottom:0}},
      ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:580}},
        [
          {key:"falda",label:"Zas\u0142ona z fa\u0142d\u0105",imgSrc:IMG_MODEL_FALDA},
          {key:"wave",label:"Zas\u0142ona Wave",imgSrc:IMG_MODEL_WAVE},
          {key:"tasma",label:"Ta\u015bma marszcz\u0105ca",imgSrc:IMG_MODEL_TASMA}
        ].map(function(m){
          var isActive=model!==null&&model===m.key;
          return ce("button",{
            key:m.key,
            onClick:function(){
              p.onChange(mg(prod,{c:mg(c,{model:m.key,foldType:m.key==="falda"?(c.foldType||null):undefined})}));
            },
            style:{
              padding:"0 0 10px",borderRadius:12,
              border:"2px solid "+(isActive?"var(--t1)":"var(--bd2)"),
              background:"var(--bg)",
              cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",
              gap:0,overflow:"hidden",transition:"all .18s"
            }
          },
            ce("div",{style:{position:"relative",width:"100%",lineHeight:0}},
              ce("img",{src:m.imgSrc,alt:m.label,style:{width:"100%",height:"90px",objectFit:"cover",objectPosition:"top",display:"block",borderRadius:"10px 10px 0 0"}}),
              isActive?ce("div",{style:{position:"absolute",top:8,left:8,width:26,height:26,borderRadius:"50%",background:"var(--t1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700}},"✓"):null
            ),
            ce("span",{style:{
              fontSize:12,
              color:"var(--t1)",
              marginTop:8,paddingLeft:6,paddingRight:6,
              lineHeight:1.3,textAlign:"center",fontWeight:isActive?700:400
            }},m.label)
          );
        })
      )
    );

    // ── SECTION 1a: Fold type (only for Fałda) ──────────────────────────
    var foldTypeSelector = null;
    if(model==="falda"){
      var foldTypes=[
        {key:"pojedyncza",label:"Pojedyncza",imgSrc:IMG_FALDA_POJEDYNCZA},
        {key:"podwojna",label:"Podw\xf3jna",imgSrc:IMG_FALDA_PODWOJNA},
        {key:"potrojna",label:"Potr\xf3jna",imgSrc:IMG_FALDA_POTROJNA},
        {key:"plaska",label:"P\u0142aska",imgSrc:IMG_FALDA_PLASKA},
        {key:"studio",label:"Studio",imgSrc:IMG_FALDA_STUDIO}
      ];
      foldTypeSelector = ce("div",{style:{marginTop:20}},
        ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:580}},
          foldTypes.map(function(ft){
            var isActive=foldType!==null&&foldType===ft.key;
            return ce("button",{
              key:ft.key,
              onClick:function(){sc("foldType",ft.key);},
              style:{
                padding:"0 0 10px",borderRadius:12,
                border:"2px solid "+(isActive?"var(--t1)":"var(--bd2)"),
                background:isActive?"var(--t1)":"var(--bg)",
                cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",
                gap:0,overflow:"hidden",transition:"all .18s"
              }
            },
              ce("div",{style:{position:"relative",width:"100%",lineHeight:0}},
                ce("img",{src:ft.imgSrc,alt:ft.label,style:{width:"100%",height:"90px",objectFit:"cover",objectPosition:"top",display:"block",borderRadius:"10px 10px 0 0"}}),
                isActive?ce("div",{style:{position:"absolute",top:8,left:8,width:24,height:24,borderRadius:"50%",background:"var(--t1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:700}},"✓"):null
              ),
              ce("span",{style:{
                fontSize:12,fontWeight:isActive?600:400,
                color:isActive?"#fff":"var(--t1)",
                marginTop:8
              }},ft.label)
            );
          })
        )
      );
    }

    // ── Split selector (SVG jak poprzednio) ────────────────────────────
    var lVal=c.leftW!=null?c.leftW:"";
    var rVal=c.rightW!=null?c.rightW:"";

    var splitSelector = ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:0}},
      [
        {key:"left",label:"Lewy"},
        {key:"right",label:"Prawy"},
        {key:"equal",label:"Komplet r\xf3wny"},
        {key:"unequal",label:"Komplet nier\xf3wny"}
      ].map(function(opt){
        var isA=split===opt.key;
        var cC=isA?"rgba(255,255,255,0.9)":"#c8bfb0";
        var cS=isA?"rgba(255,255,255,0.35)":"#e0d8ce";
        var rC=isA?"rgba(255,255,255,0.55)":"#b8b0a0";
        var wC=isA?"rgba(255,255,255,0.12)":"#f4f1ee";
        var svgL='<svg width="68" height="52" viewBox="0 0 68 52"><rect width="68" height="52" fill="'+wC+'"/><rect x="3" y="4" width="62" height="2" rx="1" fill="'+rC+'"/><rect x="5" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><rect x="60" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><path d="M6 6 Q9 18 7 48 L31 48 Q28 22 31 6 Z" fill="'+cC+'"/><path d="M9 6 Q12 20 10 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M16 6 Q19 22 17 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M23 6 Q26 19 24 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/></svg>';
        var svgR='<svg width="68" height="52" viewBox="0 0 68 52"><rect width="68" height="52" fill="'+wC+'"/><rect x="3" y="4" width="62" height="2" rx="1" fill="'+rC+'"/><rect x="5" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><rect x="60" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><path d="M37 6 Q40 18 38 48 L62 48 Q59 22 62 6 Z" fill="'+cC+'"/><path d="M40 6 Q43 20 41 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M47 6 Q50 22 48 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M54 6 Q57 19 55 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/></svg>';
        var svgE='<svg width="68" height="52" viewBox="0 0 68 52"><rect width="68" height="52" fill="'+wC+'"/><rect x="3" y="4" width="62" height="2" rx="1" fill="'+rC+'"/><rect x="5" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><rect x="60" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><path d="M6 6 Q9 18 7 48 L31 48 Q28 22 31 6 Z" fill="'+cC+'"/><path d="M10 6 Q13 20 11 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M20 6 Q23 22 21 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M37 6 Q40 18 38 48 L62 48 Q59 22 62 6 Z" fill="'+cC+'"/><path d="M41 6 Q44 20 42 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M51 6 Q54 22 52 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/></svg>';
        var svgU='<svg width="68" height="52" viewBox="0 0 68 52"><rect width="68" height="52" fill="'+wC+'"/><rect x="3" y="4" width="62" height="2" rx="1" fill="'+rC+'"/><rect x="5" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><rect x="60" y="3" width="3" height="6" rx="1.5" fill="'+rC+'"/><path d="M6 6 Q9 18 7 48 L27 48 Q24 22 27 6 Z" fill="'+cC+'"/><path d="M10 6 Q13 20 11 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M18 6 Q21 22 19 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M31 6 Q34 18 32 48 L62 48 Q59 22 62 6 Z" fill="'+cC+'"/><path d="M35 6 Q38 20 36 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M45 6 Q48 22 46 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/><path d="M55 6 Q58 19 56 48" stroke="'+cS+'" stroke-width="1.5" fill="none"/></svg>';
        var svgMap={left:svgL,right:svgR,equal:svgE,unequal:svgU};
        return ce("button",{
          key:opt.key,
          onClick:function(){
            var newC=mg(c,{split:opt.key});
            if(opt.key==="unequal"&&totalW>0&&!c.leftW){newC=mg(newC,{leftW:Math.floor(totalW/2),rightW:Math.ceil(totalW/2)});}
            p.onChange(mg(prod,{c:newC}));
          },
          style:{padding:"12px 6px 10px",borderRadius:12,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t2)",fontSize:12,fontWeight:isA?600:400,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,transition:"all .18s"}
        },
          ce("div",{dangerouslySetInnerHTML:{__html:svgMap[opt.key]},style:{borderRadius:6,overflow:"hidden",lineHeight:0}}),
          ce("span",{style:{lineHeight:1.3,textAlign:"center"}},opt.label)
        );
      })
    );

    // ── Unequal split fields ───────────────────────────────────────────
    var splitFields=null;
    if(split==="unequal"){
      splitFields=ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:20}},
        ce(Fld,{label:"Lewa sztuka"},
          ce("div",{style:{display:"flex",alignItems:"center",gap:8,background:"var(--bg)",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:56}},
            ce("button",{onClick:function(){if((+lVal||0)>0)setLeftW((+lVal||0)-1);},style:{width:46,height:56,border:"none",background:"none",fontSize:20,cursor:"pointer",color:"var(--t2)",flexShrink:0}},"\u2212"),
            ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:4,fontSize:17,color:"var(--t1)",fontWeight:500}},
              ce("input",{type:"number",value:lVal,onChange:function(ev){setLeftW(ev.target.value);},style:{width:60,border:"none",background:"transparent",textAlign:"center",fontSize:17,color:"var(--t1)",fontWeight:500,outline:"none"}}),
              ce("span",{style:{color:"var(--t3)",fontSize:14}},"cm")
            ),
            ce("button",{onClick:function(){setLeftW((+lVal||0)+1);},style:{width:46,height:56,border:"none",background:"none",fontSize:20,cursor:"pointer",color:"var(--t2)",flexShrink:0}},"+")
          )
        ),
        ce(Fld,{label:"Prawa sztuka"},
          ce("div",{style:{display:"flex",alignItems:"center",gap:8,background:totalW>0?"var(--bg3)":"var(--bg)",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:56}},
            ce("button",{onClick:function(){if(totalW>0&&(+rVal||0)>0)setRightW((+rVal||0)-1);},disabled:totalW>0,style:{width:46,height:56,border:"none",background:"none",fontSize:20,cursor:totalW>0?"default":"pointer",color:"var(--t3)",flexShrink:0}},"\u2212"),
            ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:4,fontSize:17}},
              ce("input",{type:"number",value:rVal,readOnly:totalW>0,onChange:function(ev){if(!totalW)setRightW(ev.target.value);},style:{width:60,border:"none",background:"transparent",textAlign:"center",fontSize:17,color:totalW>0?"var(--t2)":"var(--t1)",fontWeight:500,outline:"none"}}),
              ce("span",{style:{color:"var(--t3)",fontSize:14}},"cm")
            ),
            ce("button",{onClick:function(){if(!totalW)setRightW((+rVal||0)+1);},disabled:totalW>0,style:{width:46,height:56,border:"none",background:"none",fontSize:20,cursor:totalW>0?"default":"pointer",color:"var(--t3)",flexShrink:0}},"+")
          )
        )
      );
    }

    // ── Procent marszczenia (stepper) ──────────────────────────────────
    var marsVal = +(c.mars||1.5);
    var marsPct = Math.round(marsVal*100);
    var marsSection = ce("div",{style:{marginTop:20}},
      ce(Fld,{label:"PROCENT MARSZCZENIA FA\u0141DY"},
        ce("div",{style:{display:"flex",alignItems:"center",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:52,background:"var(--bg)",maxWidth:200}},
          ce("button",{onClick:function(){if(marsPct>100)sc("mars",((marsPct-25)/100).toFixed(2));},style:{width:44,height:52,border:"none",background:"none",fontSize:18,cursor:"pointer",color:"var(--t2)"}},"−"),
          ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:2,fontSize:17,color:"var(--t1)",fontWeight:500}},
            ce("input",{type:"number",value:marsPct,onChange:function(ev){sc("mars",(+(ev.target.value||100)/100).toFixed(2));},style:{width:52,border:"none",background:"transparent",textAlign:"center",fontSize:17,outline:"none",fontWeight:500}}),
            ce("span",{style:{color:"var(--t3)",fontSize:14}},"%")
          ),
          ce("button",{onClick:function(){sc("mars",((marsPct+25)/100).toFixed(2));},style:{width:44,height:52,border:"none",background:"none",fontSize:18,cursor:"pointer",color:"var(--t2)"}},"+" )
        )
      )
    );

    // ── Fałda zwrotna checkbox ─────────────────────────────────────────
    var faldaZwrotna = ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginTop:16,cursor:"pointer"}},
      ce("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:15,color:"var(--t1)"}},
        ce("input",{type:"checkbox",checked:c.faldaZwrotna||false,onChange:function(ev){sc("faldaZwrotna",ev.target.checked);},style:{width:18,height:18,cursor:"pointer",accentColor:"var(--t1)"}}),
        ce("span",{},"Fa\u0142da zwrotna")
      )
    );

    // ── Szerokość taśmy dropdown ───────────────────────────────────────
    var tasmyOptions=[6,7,8,9,10,12];
    var tVal=c.szerokosc_tasmy||8;
    var tasmaSection=ce("div",{style:{marginTop:20}},
      ce(Fld,{label:"SZEROKO\u015a\u0106 TA\u015aMY"},
        ce("div",{style:{position:"relative",maxWidth:200}},
          ce("select",{
            value:tVal,
            onChange:function(ev){sc("szerokosc_tasmy",+ev.target.value);},
            style:{width:"100%",padding:"14px 16px",fontSize:16,border:"1.5px solid var(--bd2)",borderRadius:10,background:"var(--bg)",color:"var(--t1)",appearance:"none",cursor:"pointer",minHeight:52,outline:"none"}
          },
            tasmyOptions.map(function(v){
              return ce("option",{key:v,value:v},v+" cm");
            })
          ),
          ce("span",{style:{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:"var(--t2)",fontSize:12}},"▼")
        )
      )
    );

    // ── Wysokość haczyka/ryszki (stepper z ołówkiem) ──────────────────
    var haczVal=c.wysokosc_haczyka!=null?c.wysokosc_haczyka:2.5;
    var haczSection=ce("div",{style:{marginTop:20}},
      ce(Fld,{label:"WYSOKO\u015a\u0106 HACZYKA / RYSZKI"},
        ce("div",{style:{display:"flex",alignItems:"center",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:52,background:"var(--bg)",maxWidth:200}},
          ce("button",{onClick:function(){if(haczVal>=0.5)sc("wysokosc_haczyka",Math.round((haczVal-0.5)*10)/10);},style:{width:44,height:52,border:"none",background:"none",fontSize:18,cursor:"pointer",color:"var(--t2)"}},"−"),
          ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:4,fontSize:17,color:"var(--t1)",fontWeight:500}},
            ce("span",{style:{fontSize:13,color:"var(--t2)",marginRight:2}},"\u270f\ufe0f"),
            ce("input",{type:"number",step:"0.5",value:haczVal,onChange:function(ev){sc("wysokosc_haczyka",+ev.target.value||0);},style:{width:44,border:"none",background:"transparent",textAlign:"center",fontSize:17,outline:"none",fontWeight:500}}),
            ce("span",{style:{color:"var(--t3)",fontSize:14}},"cm")
          ),
          ce("button",{onClick:function(){sc("wysokosc_haczyka",Math.round((haczVal+0.5)*10)/10);},style:{width:44,height:52,border:"none",background:"none",fontSize:18,cursor:"pointer",color:"var(--t2)"}},"+" )
        )
      )
    );

    // ── Odstęp między ślizgami ─────────────────────────────────────────
    var glideGap=ce("div",{style:{marginTop:20}},
      ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"ODST\u0118P MI\u0118DZY \u015aLIZGAMI"),
      ce("div",{style:{display:"flex",gap:12}},
        [6,8].map(function(gap){
          var isA=c.glideGap===gap||(!c.glideGap&&gap===8);
          return ce("button",{key:gap,onClick:function(){sc("glideGap",gap);},style:{padding:"14px 28px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"transparent",color:isA?"#fff":"var(--t1)",fontSize:15,fontWeight:isA?600:400,cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .18s"}},
            isA?ce("span",{style:{fontSize:16}},"✓"):"",
            gap+" cm"
          );
        })
      )
    );

    // ── Bottom section ─────────────────────────────────────────────────
    var bottomType=c.bottomType||"single";
    var bottomSection=ce("div",{style:{marginTop:20}},
      ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"TYP DO\u0141U"),
      ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}},
        [{key:"single",label:"Pojedynczy"},{key:"double",label:"Podw\xf3jny"},{key:"overlock",label:"Overlock"},{key:"tape",label:"O\u0142owianka"}].map(function(bt){
          var isA=bottomType===bt.key;
          return ce("button",{key:bt.key,onClick:function(){sc("bottomType",bt.key);},style:{padding:"16px 12px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",textAlign:"center",transition:"all .18s"}},
            isA?"\u2713 "+bt.label:bt.label
          );
        })
      ),
      ce("div",{style:{display:"grid",gridTemplateColumns:"auto auto 1fr",gap:16,alignItems:"center"}},
        ce(Fld,{label:"ROZMIAR DO\u0141U (cm)",noMb:true},
          ce("div",{style:{display:"flex",alignItems:"center",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:52,background:"var(--bg)"}},
            ce("button",{onClick:function(){var v=c.bottomSize||8;sc("bottomSize",Math.max(0,v-1));},style:{width:44,height:52,border:"none",background:"none",fontSize:18,cursor:"pointer",color:"var(--t2)"}},"−"),
            ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:4,fontSize:16,color:"var(--t1)",fontWeight:500}},
              ce("input",{type:"number",value:c.bottomSize!=null?c.bottomSize:8,onChange:function(ev){sc("bottomSize",+ev.target.value||0);},style:{width:50,border:"none",background:"transparent",textAlign:"center",fontSize:16,outline:"none",fontWeight:500}}),
              ce("span",{style:{color:"var(--t3)",fontSize:13}},"cm")
            ),
            ce("button",{onClick:function(){sc("bottomSize",(c.bottomSize||8)+1);},style:{width:44,height:52,border:"none",background:"none",fontSize:18,cursor:"pointer",color:"var(--t2)"}},"+" )
          )
        ),
        ce("div",{style:{height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:4}},
          ce("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"14px 0",fontSize:15,color:"var(--t1)"}},
            ce("input",{type:"checkbox",checked:c.leadInSides||false,onChange:function(ev){sc("leadInSides",ev.target.checked);},style:{width:20,height:20,cursor:"pointer",accentColor:"var(--t1)"}}),
            ce("span",{},"O\u0142\xf3w w bokach")
          )
        )
      ),
      ce("div",{style:{marginTop:16}},
        ce("label",{style:{display:"flex",alignItems:"center",gap:12,cursor:"pointer",padding:"14px 18px",borderRadius:10,border:"2px solid "+(c.podszewka==="tak"?"var(--t1)":"var(--bd2)"),background:c.podszewka==="tak"?"var(--grl)":"var(--bg)",transition:"all .18s"}},
          ce("input",{type:"checkbox",checked:c.podszewka==="tak",onChange:function(ev){sc("podszewka",ev.target.checked?"tak":"nie");},style:{width:20,height:20,cursor:"pointer",accentColor:"var(--t1)"}}),
          ce("div",{},
            ce("span",{style:{fontSize:15,fontWeight:600,color:"var(--t1)"}},"Podszewka"),
            ce("span",{style:{fontSize:12,color:"var(--t3)",marginLeft:10}},"materia\u0142 80 z\u0142/mb + 50% do szycia")
          )
        )
      )
    );

    // ── FORM ASSEMBLY ──────────────────────────────────────────────────
    form=ce("div",{style:{display:"flex",flexDirection:"column"}},

      // SEKCJA 1: Wymiary + tkanina
      ce(Section,{num:"1",title:"Wymiary"},
        ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}},
          ce(Fld,{label:"SZEROKO\u015a\u0106"},
            ce("div",{style:{display:"flex",alignItems:"center",background:"var(--bg)",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:56}},
              ce("span",{style:{padding:"0 14px",color:"var(--t3)",fontSize:14,flexShrink:0}},"cm"),
              ce("input",{type:"number",value:par.wCm||"",onChange:function(ev){onTotalWChange(ev.target.value);},placeholder:"200",style:{flex:1,padding:"16px 14px 16px 0",fontSize:17,border:"none",background:"transparent",color:"var(--t1)",outline:"none",minHeight:56}})
            )
          ),
          ce(Fld,{label:"WYSOKO\u015a\u0106"},
            ce("div",{style:{display:"flex",alignItems:"center",background:"var(--bg)",border:"1.5px solid var(--bd2)",borderRadius:10,overflow:"hidden",minHeight:56}},
              ce("span",{style:{padding:"0 14px",color:"var(--t3)",fontSize:14,flexShrink:0}},"cm"),
              ce("input",{type:"number",value:par.hCm||"",onChange:function(ev){sp("hCm",ev.target.value);},placeholder:"270",style:{flex:1,padding:"16px 14px 16px 0",fontSize:17,border:"none",background:"transparent",color:"var(--t1)",outline:"none",minHeight:56}})
            )
          )
        ),
        ce("div",{style:{marginTop:4}},
          ce(Fld,{label:"KOLOR"},
            ce("input",{type:"text",value:c.kolor||"",onChange:function(ev){sc("kolor",ev.target.value);},placeholder:"np. 03 Ecru, Ivory White...",style:{padding:"16px 18px",fontSize:16,border:"1.5px solid var(--bd2)",borderRadius:10,background:"var(--bg)",color:"var(--t1)",width:"100%",minHeight:56,boxSizing:"border-box"}})
          )
        ),
        ce(FabPicker,{fabName:prod.fabName,fabMan:prod.fabMan,fabManW:prod.fabManW,onSelect:sf,onManual:sfm,onManualW:sfmW})
      ),

      // SEKCJA 2: Model zasłony
      ce(Section,{num:"2",title:"Model"},
        ce("p",{style:{fontSize:13,color:"var(--t2)",marginBottom:16}},"Wybierz model zas\u0142ony"),
        modelSelector,
        foldTypeSelector?ce("div",{style:{marginTop:4}},
          ce("p",{style:{fontSize:13,color:"var(--t2)",margin:"16px 0 0"}},"Wybierz rodzaj fa\u0142dy"),
          foldTypeSelector
        ):null
      ),

      // SEKCJA 3: Podział + szczegóły (zależne od modelu)
      model?ce(Section,{num:"3",title:"Szczeg\xf3\u0142y"},
        ce("div",{style:{marginBottom:6}},
          ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:14,fontStyle:"italic"}},"(Je\u015bli wybierzesz nier\xf3wn\u0105 par\u0119, zmotoryzowane szyny nie b\u0119d\u0105 dost\u0119pne)"),
          splitSelector,
          splitFields
        ),
        // Procent marszczenia - wszystkie modele
        marsSection,
        // Fałda zwrotna - tylko Fałda
        model==="falda"?faldaZwrotna:null,
        // Szerokość taśmy - Fałda i Taśma
        (model==="falda"||model==="tasma")?tasmaSection:null,
        // Typ marszczenia - tylko Taśma Marszcząca
        model==="tasma"?ce("div",{style:{marginTop:20}},
          ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"TYP MARSZCZENIA"),
          ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:400}},
            ["Smok","O\u0142\xf3wek","Plisa"].map(function(typ){
              var isA=c.typMarszczenia===typ||(typ==="Smok"&&!c.typMarszczenia);
              return ce("button",{key:typ,onClick:function(){sc("typMarszczenia",typ);},style:{padding:"14px 8px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:13,fontWeight:isA?600:400,cursor:"pointer",textAlign:"center",transition:"all .18s"}},
                isA?"\u2713 "+typ:typ
              );
            })
          )
        ):null,
        // Wysokość haczyka - Fałda i Taśma (NIE Wave)
        (model==="falda"||model==="tasma")?haczSection:null,
        model==="wave"?glideGap:null
      ):null,

      // SEKCJA 4: Wykończenie
      model?ce(Section,{num:"4",title:"Wyko\u0144czenie"},
        bottomSection
      ):null
    );

  }else if(prod.type==="zaluzja"){
    var jzMaterials=[
      {key:"al",label:"Aluminium",img:IMG_JZ_ALUMINIUM,sizes:["al25","al35"]},
      {key:"ba",label:"Bamboo",img:IMG_JZ_BAMBOO,sizes:["ba35","ba50","ba65"]},
      {key:"bs",label:"Basswood",img:IMG_JZ_BASSWOOD,sizes:["bs35","bs50","bs65"]}
    ];
    var jzSizeLabels={al25:"25mm",al35:"35mm",ba35:"35mm",ba50:"50mm",ba65:"65mm",bs35:"35mm",bs50:"50mm",bs65:"65mm"};
    var curJt=c.jt||"al25";
    var curMat=curJt.startsWith("al")?"al":curJt.startsWith("ba")?"ba":"bs";
    form=ce(Fragment,null,
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}},
        ce(Fld,{label:"SZEROKO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.wCm||"",onChange:function(ev){sp("wCm",ev.target.value);},placeholder:"np. 120",style:IST})),
        ce(Fld,{label:"D\u0141UGO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.lCm||"",onChange:function(ev){sp("lCm",ev.target.value);},placeholder:"np. 160",style:IST}))
      ),
      ce("div",{style:{marginBottom:10}},
        ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",marginBottom:6}},"MATERIA\u0141"),
        ce("div",{style:{display:"flex",gap:8}},
          jzMaterials.map(function(mat){
            var isActive=curMat===mat.key;
            return ce("div",{
              key:mat.key,
              onClick:function(){sc("jt",mat.sizes[0]);},
              style:{
                display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                padding:"8px 10px",borderRadius:10,cursor:"pointer",flex:1,
                border:isActive?"2px solid var(--t1)":"2px solid var(--bd2)",
                background:isActive?"var(--grl)":"var(--bg)",
                transition:"all .15s"
              }},
              ce("img",{src:mat.img,style:{width:120,height:120,objectFit:"cover",borderRadius:8}}),
              ce("div",{style:{fontSize:11,fontWeight:600,color:isActive?"var(--t1)":"var(--t2)",textAlign:"center"}},mat.label)
            );
          })
        )
      ),
      ce("div",{style:{marginBottom:10}},
        ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",marginBottom:6}},"GRUBO\u015a\u0106 LAMELI"),
        ce(Chips,{items:jzMaterials.find(function(m){return m.key===curMat;}).sizes.map(function(sv){
          return ce(Chip,{key:sv,label:jzSizeLabels[sv],active:curJt===sv,onClick:function(){sc("jt",sv);}});
        })})
      ),
      ce("div",{style:{marginTop:8}},
        ce(Chips,{items:[
          ce(Chip,{key:"bi",label:"Monta\u017c bezinwazyjny",active:c.bezinw==="tak",onClick:function(){tc("bezinw");}}),
          (par.wCm&&par.wCm>=60)?ce(Chip,{key:"ts",label:"Dodatkowa tasiemka +46,43 z\u0142",active:c.tasiemka==="tak",onClick:function(){tc("tasiemka");}}):null
        ]})
      ),
      // ── TRYB STEROWANIA ─────────────────────────────────────────────
      ce("div",{style:{marginTop:16}},
        ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",marginBottom:6}},"STEROWANIE"),
        ce(Chips,{items:[
          ce(Chip,{key:"m",label:"\ud83d\udd27 Manual",active:!c.jzMode||c.jzMode==="manual",onClick:function(){sc("jzMode","manual");sc("jzMotorId",null);sc("jzRemoteId",null);}}),
          ce(Chip,{key:"a",label:"\u26a1 Automatyka",active:c.jzMode==="auto",onClick:function(){sc("jzMode","auto");}})
        ]})
      ),
      // ── AUTOMATYKA: silnik + pilot ───────────────────────────────────
      (c.jzMode==="auto")?(function(){
        var wMm=(par.wCm||0)*10;
        var availMotors=JZALUZJA_MOTORS.filter(function(m){return !wMm||m.minWidthMm<=wMm;});
        var selMotor=JZALUZJA_MOTORS.find(function(m){return m.id===c.jzMotorId;})||null;
        var selRemote=JZALUZJA_REMOTES.find(function(r){return r.id===c.jzRemoteId;})||null;
        return ce("div",{style:{marginTop:12,display:"flex",flexDirection:"column",gap:12}},
          ce("div",null,
            ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",marginBottom:4}},
              "SILNIK"+(wMm?" (filtrowane dla szer. "+wMm+"mm)":"")
            ),
            ce("select",{
              value:c.jzMotorId||"",
              onChange:function(ev){sc("jzMotorId",ev.target.value||null);},
              style:Object.assign({},IST,{width:"100%"})
            },
              ce("option",{value:""},"-- wybierz silnik --"),
              availMotors.map(function(m){
                return ce("option",{key:m.id,value:m.id},
                  m.label+" | "+m.tech+" | "+m.nm+"Nm | maks. "+m.maxKg+"kg | "+m.power+" | "+m.price.toFixed(2)+" z\u0142"
                );
              })
            ),
            selMotor?ce("div",{style:{marginTop:6,padding:"8px 10px",background:"var(--bg2)",borderRadius:8,border:"1px solid var(--bd2)",fontSize:11,color:"var(--t2)"}},
              ce("div",{style:{fontWeight:600,color:"var(--t1)",marginBottom:4}},selMotor.label),
              ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}},
                ce("div",null,"\u2699\ufe0f Technologia: "+selMotor.tech),
                ce("div",null,"\u26a1 Si\u0142a: "+selMotor.nm+"Nm"),
                ce("div",null,"\u2696\ufe0f Waga silnika: "+selMotor.weightKg+" kg"),
                ce("div",null,"\ud83d\udd0c Zasilanie: "+selMotor.power),
                ce("div",null,"\u2195\ufe0f Maks. waga \u017caluzji: "+selMotor.maxKg+" kg"),
                ce("div",null,"\u2194\ufe0f Min. szeroko\u015b\u0107: "+selMotor.minWidthMm+" mm")
              ),
              ce("div",{style:{marginTop:6,fontWeight:700,color:"var(--t1)",fontSize:13}},selMotor.price.toFixed(2)+" z\u0142")
            ):null
          ),
          ce("div",null,
            ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",marginBottom:4}},"PILOT / AKCESORIA (opcjonalnie)"),
            ce("select",{
              value:c.jzRemoteId||"",
              onChange:function(ev){sc("jzRemoteId",ev.target.value||null);},
              style:Object.assign({},IST,{width:"100%"})
            },
              ce("option",{value:""},"-- brak / wybierz pilot --"),
              JZALUZJA_REMOTES.map(function(r){
                return ce("option",{key:r.id,value:r.id},r.label+" | "+r.price.toFixed(2)+" z\u0142");
              })
            ),
            selRemote?ce("div",{style:{marginTop:6,padding:"6px 10px",background:"var(--bg2)",borderRadius:8,border:"1px solid var(--bd2)",fontSize:11,color:"var(--t2)"}},
              ce("span",{style:{fontWeight:600}},selRemote.label),
              "  \u2014  ",
              ce("span",{style:{fontWeight:700,color:"var(--t1)"}},selRemote.price.toFixed(2)+" z\u0142")
            ):null
          )
        );
      })():null
    );
  }else if(prod.type==="roleta"){

    // ── ROLLER BLIND MODELS ──────────────────────────────────────────
    var ROLETA_MODELS = [
      {key:"relax",   label:"Relax",      imgSrc:IMG_ROLETA_RELAX},
      {key:"print",   label:"Print",      imgSrc:IMG_ROLETA_PRINT},
      {key:"back",    label:"Back",       imgSrc:IMG_ROLETA_BACK},
      {key:"podszewka",label:"Podszewka", imgSrc:IMG_ROLETA_PODSZEWKA},
      {key:"front",   label:"Front",      imgSrc:IMG_ROLETA_FRONT},
      {key:"cascade", label:"Cascade",    imgSrc:IMG_ROLETA_CASCADE},
      {key:"duo",     label:"Duo",        imgSrc:IMG_ROLETA_DUO}
    ];

    var rModel  = c.rModel||null;   // wybrany model rolety
    var rSystem = c.rSystem||null;  // "manual" | "elektryk" | "polautomatyczny"
    var isDuo   = rModel==="duo";

    // ── MODEL SELECTOR ───────────────────────────────────────────────
    var roletaModelSelector = ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,maxWidth:600}},
      ROLETA_MODELS.map(function(m){
        var isA = rModel===m.key;
        return ce("button",{
          key:m.key,
          onClick:function(){
            var newSys = rSystem;
            if(m.key!=="duo" && rSystem==="polautomatyczny") newSys=null;
            p.onChange(mg(prod,{c:mg(c,{rModel:m.key,rSystem:newSys})}));
          },
          style:{padding:"0 0 10px",borderRadius:12,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:"var(--bg)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:0,overflow:"hidden",transition:"all .18s"}
        },
          ce("div",{style:{position:"relative",width:"100%",lineHeight:0}},
            ce("img",{src:m.imgSrc,alt:m.label,style:{width:"100%",height:"90px",objectFit:"cover",objectPosition:"top",display:"block",borderRadius:"10px 10px 0 0"}}),
            isA?ce("div",{style:{position:"absolute",top:6,left:6,width:22,height:22,borderRadius:"50%",background:"var(--t1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700}},"✓"):null
          ),
          ce("span",{style:{fontSize:12,fontWeight:isA?700:400,color:"var(--t1)",marginTop:8,lineHeight:1.3,textAlign:"center"}},m.label)
        );
      })
    );

    // ── SYSTEM SELECTOR ──────────────────────────────────────────────
    var systemOpts = [
      {key:"manual",         label:"Manual"},
      {key:"elektryk",       label:"Elektryk"},
    ];
    if(isDuo) systemOpts.splice(1,0,{key:"polautomatyczny",label:"P\xf3\u0142automatyczny"});

    var roletaSystemSelector = rModel?ce("div",{style:{marginTop:20}},
      ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"SYSTEM"),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        systemOpts.map(function(s){
          var isA=rSystem===s.key;
          return ce("button",{key:s.key,onClick:function(){sc("rSystem",s.key);},style:{padding:"14px 22px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
            isA?"✓ "+s.label:s.label
          );
        })
      )
    ):null;

    // ── BĘBENEK ──────────────────────────────────────────────────────
    var bebenekChip = rSystem?ce("div",{style:{marginTop:16}},
      ce("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:15,color:"var(--t1)"}},
        ce("input",{type:"checkbox",checked:c.rb==="tak",onChange:function(ev){sc("rb",ev.target.checked?"tak":"nie");},style:{width:18,height:18,cursor:"pointer",accentColor:"var(--t1)"}}),
        ce("span",{},"+ B\u0119benek (11 z\u0142)")
      )
    ):null;

    // ── MANUAL / PÓŁAUTOMAT options ───────────────────────────────────
    var METALOWY_KOLORY=[
      {key:"srebrny",   label:"Srebrny"},
      {key:"zloty",     label:"Z\u0142oty"},
      {key:"stare_zloto",label:"Stare z\u0142oto"},
      {key:"antracyt",  label:"Antracyt"},
      {key:"miedz",     label:"Mied\u017a"}
    ];
    var isMetalowy=c.lancuszek==="metalowy";
    var lancuszekSection = (rSystem==="manual"||rSystem==="polautomatyczny")?ce("div",{style:{marginTop:20}},
      // Kolor łańcuszka
      ce("div",{style:{marginBottom:16}},
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"KOLOR \u0141A\u0143CUSZKA"),
        ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,maxWidth:360}},
          [
            {key:"bialy",   label:"Bia\u0142y",   imgSrc:IMG_ROLETA_LANCUSZEK_BIALY},
            {key:"metalowy",label:"Metalowy",      imgSrc:IMG_ROLETA_LANCUSZEK_METALOWY}
          ].map(function(lk){
            var isA=c.lancuszek===lk.key||(lk.key==="bialy"&&!c.lancuszek);
            return ce("button",{
              key:lk.key,
              onClick:function(){sc("lancuszek",lk.key);},
              style:{padding:"0 0 10px",borderRadius:12,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:"var(--bg)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:0,overflow:"hidden",transition:"all .18s"}
            },
              ce("div",{style:{position:"relative",width:"100%",lineHeight:0}},
                ce("img",{src:lk.imgSrc,alt:lk.label,style:{width:"100%",height:"80px",objectFit:"cover",objectPosition:"top",display:"block",borderRadius:"10px 10px 0 0"}}),
                isA?ce("div",{style:{position:"absolute",top:6,left:6,width:20,height:20,borderRadius:"50%",background:"var(--t1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700}},"✓"):null
              ),
              ce("span",{style:{fontSize:12,fontWeight:isA?700:400,color:"var(--t1)",marginTop:8}},lk.label)
            );
          })
        ),
        // Podmenu kolorów łańcuszka metalowego
        isMetalowy?ce("div",{style:{marginTop:14,padding:"14px 16px",background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd2)"}},
          ce("label",{style:{fontSize:11,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:10}},"KOLOR METALOWEGO \u0141A\u0143CUSZKA"),
          ce("div",{style:{display:"flex",flexWrap:"wrap",gap:8}},
            METALOWY_KOLORY.map(function(mk){
              var isAK=c.kolorLancuszka===mk.key||(mk.key==="srebrny"&&!c.kolorLancuszka);
              return ce("button",{
                key:mk.key,
                onClick:function(){sc("kolorLancuszka",mk.key);},
                style:{padding:"8px 16px",borderRadius:8,border:"2px solid "+(isAK?"var(--t1)":"var(--bd2)"),background:isAK?"var(--t1)":"var(--bg)",color:isAK?"#fff":"var(--t1)",fontSize:13,fontWeight:isAK?600:400,cursor:"pointer",transition:"all .18s"}
              },isAK?"\u2713 "+mk.label:mk.label);
            })
          )
        ):null
      ),
      // Strona obsługi
      ce("div",null,
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"STRONA OBS\u0141UGI"),
        ce("div",{style:{display:"flex",gap:10}},
          ["Lewo","Prawo"].map(function(str){
            var isA=c.stronaObslugi===str||(str==="Lewo"&&!c.stronaObslugi);
            return ce("button",{key:str,onClick:function(){sc("stronaObslugi",str);},style:{padding:"14px 28px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
              isA?"✓ "+str:str
            );
          })
        )
      )
    ):null;

    // ── ELEKTRYK options ──────────────────────────────────────────────
    var rrzBrand = c.rrzBrand||null;
    var rrzModel = c.rrzModel||null;
    var rrzAcc   = c.rrzAcc||[];

    var elektrykSection = rSystem==="elektryk"?ce("div",{style:{marginTop:20,display:"flex",flexDirection:"column",gap:20}},

      // Strona montażu silnika
      ce("div",null,
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"STRONA MONTAŻU SILNIKA"),
        ce("div",{style:{display:"flex",gap:10}},
          ["Lewo","Prawo"].map(function(str){
            var isA=c.stronaSilnika===str||(str==="Lewo"&&!c.stronaSilnika);
            return ce("button",{key:str,onClick:function(){sc("stronaSilnika",str);},style:{padding:"14px 28px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
              isA?"✓ "+str:str
            );
          })
        )
      ),

      // Wybór producenta automatyki
      ce("div",null,
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"AUTOMATYKA — PRODUCENT"),
        ce("div",{style:{display:"flex",gap:10}},
          [{key:"somfy",label:"SOMFY"},{key:"premium",label:"PREMIUM LINE"}].map(function(br){
            var isA=rrzBrand===br.key;
            return ce("button",{key:br.key,
              onClick:function(){p.onChange(mg(prod,{c:mg(c,{rrzBrand:br.key,rrzModel:null,rrzAcc:[]})}));},
              style:{padding:"14px 22px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
              isA?"✓ "+br.label:br.label
            );
          })
        )
      ),

      // Wybór modelu silnika
      rrzBrand?ce("div",null,
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"MODEL MECHANIZMU"),
        ce("div",{style:{display:"flex",flexDirection:"column",gap:8}},
          Object.keys(rrzBrand==="somfy"?RRZ_SOMFY:RRZ_PREMIUM).map(function(mKey){
            var labels=rrzBrand==="somfy"?RRZ_SOMFY_LABELS:RRZ_PREMIUM_LABELS;
            var isA=rrzModel===mKey;
            var wCm2=prod.par&&prod.par.wCm?+prod.par.wCm:0;
            var rrzCheck=wCm2?rrzLookup(rrzBrand,mKey,wCm2):null;
            var avail=!wCm2||rrzCheck!=null;
            var priceStr=isA&&rrzCheck?" → "+rrzCheck.price.toFixed(2).replace(".",",")+" zł":"";
            return ce("button",{key:mKey,
              onClick:function(){p.onChange(mg(prod,{c:mg(c,{rrzModel:mKey,rrzAcc:[]})}));},
              disabled:!avail,
              style:{padding:"12px 16px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":avail?"var(--bg)":"var(--bg3)",color:isA?"#fff":avail?"var(--t1)":"var(--t3)",fontSize:13,fontWeight:isA?600:400,cursor:avail?"pointer":"not-allowed",textAlign:"left",transition:"all .18s",opacity:avail?1:0.5}},
              (isA?"✓ ":"")+labels[mKey]+priceStr
            );
          })
        )
      ):null,

      // Akcesoria
      rrzModel?ce("div",null,
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"AKCESORIA (opcjonalnie)"),
        ce("div",{style:{display:"flex",flexDirection:"column",gap:6}},
          (rrzBrand==="somfy"?RRZ_SOMFY_ACC:RRZ_PREMIUM_ACC).map(function(acc){
            var checked=rrzAcc.indexOf(acc.id)>=0;
            return ce("label",{key:acc.id,style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:"var(--t1)",padding:"6px 0"}},
              ce("input",{type:"checkbox",checked:checked,
                onChange:function(ev){
                  var next=ev.target.checked?[].concat(rrzAcc,[acc.id]):rrzAcc.filter(function(x){return x!==acc.id;});
                  p.onChange(mg(prod,{c:mg(c,{rrzAcc:next})}));
                },
                style:{width:16,height:16,cursor:"pointer",accentColor:"var(--t1)"}}),
              ce("span",{},acc.label+" — "+acc.price.toFixed(2).replace(".",",")+" zł")
            );
          })
        )
      ):null

    ):null;

    form=ce("div",{style:{display:"flex",flexDirection:"column"}},
      // SEKCJA 1: Wymiary + tkanina
      ce(Section,{num:"1",title:"Wymiary"},
        ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}},
          ce(Fld,{label:"SZEROKO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.wCm||"",onChange:function(ev){sp("wCm",ev.target.value);},placeholder:"np. 120",style:IST})),
          ce(Fld,{label:"WYSOKO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.hCm||"",onChange:function(ev){sp("hCm",ev.target.value);},placeholder:"np. 160",style:IST}))
        ),
        ce(FabPicker,{fabName:prod.fabName,fabMan:prod.fabMan,fabManW:prod.fabManW,onSelect:sf,onManual:sfm,onManualW:sfmW}),
        ce("div",{style:{marginTop:12}},
          ce(Fld,{label:"KOLOR"},
            ce("input",{type:"text",value:c.kolor||"",onChange:function(ev){sc("kolor",ev.target.value);},placeholder:"np. Ivory White, Ecru, Stone...",style:IST})
          )
        )
      ),
      // SEKCJA 2: Model rolety
      ce(Section,{num:"2",title:"Model"},
        ce("p",{style:{fontSize:13,color:"var(--t2)",marginBottom:16}},"Wybierz model rolety"),
        roletaModelSelector
      ),
      // SEKCJA 3: System (tylko po wyborze modelu)
      rModel?ce(Section,{num:"3",title:"System"},
        roletaSystemSelector,
        bebenekChip,
        lancuszekSection,
        elektrykSection
      ):null
    );

    }else if(prod.type==="shadow"){
    // ── ROLETA SHADOW FORM ───────────────────────────────────────────
    form=ce(Fragment,null,
      // Wymiary
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}},
        ce(Fld,{label:"SZEROKO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.wCm||"",onChange:function(ev){sp("wCm",ev.target.value);},placeholder:"np. 120",style:IST})),
        ce(Fld,{label:"WYSOKO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.hCm||"",onChange:function(ev){sp("hCm",ev.target.value);},placeholder:"np. 160",style:IST}))
      ),
      // Grupa cenowa
      ce(Fld,{label:"GRUPA CENOWA"},
        ce("div",{style:{display:"flex",gap:8}},
          ["C","D","E"].map(function(g){
            var isA=(c.sgrup||"C")===g;
            return ce("button",{key:g,onClick:function(){sc("sgrup",g);},style:{flex:1,padding:"12px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?700:400,cursor:"pointer"}},isA?"\u2713 "+g:g);
          })
        )
      ),
      // Profil montażowy
      ce("div",{style:{marginTop:12}},
        ce("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:15,color:"var(--t1)"}},
          ce("input",{type:"checkbox",checked:c.sprofil==="tak",onChange:function(ev){sc("sprofil",ev.target.checked?"tak":null);}}),
          "Profil monta\u017cowy (dop\u0142ata wg szeroko\u015bci)"
        )
      ),
      // Obciążnik — karty z obrazkami
      ce(Fld,{label:"OBCI\u0104\u017bNIK"},
        ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}},
          [
            {k:"A", l:"Typ A", img:RS_IMG.obcA},
            {k:"B", l:"Typ B", img:RS_IMG.obcB},
            {k:"C", l:"Typ C", img:RS_IMG.obcC},
            {k:"D", l:"Typ D", img:RS_IMG.obcD}
          ].map(function(o){
            var isA=c.sobcTyp===o.k;
            return ce("button",{key:o.k,onClick:function(){sc("sobcTyp",isA?null:o.k);},
              style:{padding:0,borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),
                background:isA?"var(--bg2)":"var(--bg)",cursor:"pointer",overflow:"hidden",
                display:"flex",flexDirection:"column",alignItems:"center",transition:"border-color .15s"}},
              ce("div",{style:{width:"100%",height:90,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"8px 8px 0 0",overflow:"hidden"}},
                ce("img",{src:o.img,alt:o.l,style:{maxWidth:"100%",maxHeight:86,objectFit:"contain",display:"block"}})
              ),
              ce("span",{style:{display:"block",padding:"6px 4px",fontSize:12,fontWeight:isA?700:400,color:isA?"var(--t1)":"var(--t2)"}},
                isA?"\u2713 "+o.l:o.l
              )
            );
          })
        )
      ),
      // Maskownica — bez opcji "Brak", kliknięcie aktywnej odznacza
      ce(Fld,{label:"MASKOWNICA UCHWYTU (RM40)"},
        ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
          [{k:"oval",l:"Oval 27,56 z\u0142"},{k:"kwadro",l:"Kwadro 33,92 z\u0142"},{k:"cube",l:"Cube 38,16 z\u0142"}].map(function(o){
            var isA=c.smask===o.k;
            return ce("button",{key:o.k,onClick:function(){sc("smask",isA?null:o.k);if(isA)sc("smaskKolor",null);},style:{padding:"10px 16px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:13,fontWeight:isA?600:400,cursor:"pointer"}},isA?"\u2713 "+o.l:o.l);
          })
        )
      ),
      c.smask?ce(Fld,{label:"KOLOR MASKOWNIC"},
        ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}},
          RS_MASK_COLORS.map(function(col){
            var isA=(c.smaskKolor||"bialy")===col.k;
            return ce("button",{key:col.k,onClick:function(){sc("smaskKolor",col.k);},
              style:{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:10,
                border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),
                background:isA?"var(--bg2)":"var(--bg)",
                cursor:"pointer",fontSize:13,fontWeight:isA?600:400,color:"var(--t1)"}},
              ce("span",{style:{width:18,height:18,borderRadius:"50%",background:col.hex,border:"1.5px solid "+col.border,display:"inline-block",flexShrink:0}}),
              isA?"\u2713 "+col.l:col.l
            );
          })
        )
      ):null,
      // Dopłaty stałe
      ce("div",{style:{marginTop:4,display:"flex",flexDirection:"column",gap:8}},
        ce("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,color:"var(--t1)"}},
          ce("input",{type:"checkbox",checked:c.szylko==="tak",onChange:function(ev){sc("szylko",ev.target.checked?"tak":null);}}),
          "Zestaw do prowadzenia \u017cy\u0142kowego +27,56 z\u0142/kpl"
        ),
        ce("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,color:"var(--t1)"}},
          ce("input",{type:"checkbox",checked:c.slanc==="tak",onChange:function(ev){sc("slanc",ev.target.checked?"tak":null);}}),
          "Ozdobny obci\u0105\u017cnik \u0142a\u0144cuszka +15,90 z\u0142/szt"
        )
      ),
      // Napęd
      ce(Fld,{label:"NAP\u0118D (opcjonalnie)"},
        ce("select",{value:c.smotor||"",onChange:function(ev){sc("smotor",ev.target.value||null);},style:Object.assign({},IST,{width:"100%"})},
          ce("option",{value:""},"-- Manualny / brak nap\u0119du --"),
          ce("optgroup",{label:"\u2014 Przewodowe"},
            RS_MOTORS.filter(function(m){return m.type==="wire";}).map(function(m){
              return ce("option",{key:m.id,value:m.id},m.label+" | "+m.price+" z\u0142");
            })
          ),
          ce("optgroup",{label:"\u2014 Radiowe"},
            RS_MOTORS.filter(function(m){return m.type==="radio";}).map(function(m){
              return ce("option",{key:m.id,value:m.id},m.label+" | "+m.price+" z\u0142");
            })
          )
        )
      ),
      // Pilot i centralka — niezależne checkboxy (tylko gdy wybrany napęd)
      c.smotor?ce("div",{style:{display:"flex",flexDirection:"column",gap:10,marginTop:4}},
        ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",marginBottom:2}},"PILOT / CENTRALKA (opcjonalnie)"),
        ce("div",{style:{display:"flex",flexDirection:"column",gap:6}},
          [{id:"ac12701",label:"Pilot 1-kan. AC-127-01",price:162},{id:"ac52001",label:"Centralka Smart Home AC-520-01",price:405},{id:"ac52601",label:"Centralka Smart Home ZigBee AC-526-01",price:385}].map(function(r){
            var checked=(c.sremotes||[]).indexOf(r.id)>=0;
            return ce("label",{key:r.id,style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:"var(--t1)",padding:"8px 12px",borderRadius:8,border:"1px solid "+(checked?"var(--t1)":"var(--bd2)"),background:checked?"var(--bg2)":"var(--bg)"}},
              ce("input",{type:"checkbox",checked:checked,onChange:function(){
                var cur=c.sremotes||[];
                var next=checked?cur.filter(function(x){return x!==r.id;}):cur.concat([r.id]);
                sc("sremotes",next.length?next:null);
              }}),
              ce("span",{style:{flex:1}},r.label),
              ce("span",{style:{fontWeight:600,color:"var(--t2)",whiteSpace:"nowrap"}},r.price+" z\u0142")
            );
          })
        )
      ):null,
      // Strona silnika / strona obsługi
      c.smotor
        ? ce("div",{style:{marginTop:12}},
            ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:10}},"STRONA SILNIKA"),
            ce("div",{style:{display:"flex",gap:10}},
              ["Lewo","Prawo"].map(function(str){
                var isA=(c.sstronaSilnika||"Lewo")===str;
                return ce("button",{key:str,onClick:function(){sc("sstronaSilnika",str);},style:{flex:1,padding:"14px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
                  isA?"\u2713 "+str:str
                );
              })
            )
          )
        : ce("div",{style:{marginTop:12}},
            ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:10}},"STRONA OBS\u0141UGI"),
            ce("div",{style:{display:"flex",gap:10}},
              ["Lewo","Prawo"].map(function(str){
                var isA=(c.sstronaObslugi||"Lewo")===str;
                return ce("button",{key:str,onClick:function(){sc("sstronaObslugi",str);},style:{flex:1,padding:"14px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
                  isA?"\u2713 "+str:str
                );
              })
            )
          ),
      // ── SCHEMATY TECHNICZNE ──────────────────────────────────────
      ce("div",{style:{marginTop:8,borderRadius:10,border:"1px solid var(--bd2)",overflow:"hidden"}},
        ce("button",{
          onClick:function(){sc("sSchemat",c.sSchemat==="open"?null:"open");},
          style:{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"12px 16px",background:"var(--bg2)",border:"none",cursor:"pointer",
            fontSize:13,fontWeight:600,color:"var(--t2)",letterSpacing:"0.06em",textTransform:"uppercase"}},
          "\uD83D\uDCCF Schematy techniczne RM40 / RM45",
          ce("span",{style:{fontSize:16,transition:"transform .2s",display:"inline-block",
            transform:c.sSchemat==="open"?"rotate(180deg)":"rotate(0deg)"}},"▾")
        ),
        c.sSchemat==="open"?ce("div",{style:{padding:"16px",display:"flex",flexDirection:"column",gap:20,background:"var(--bg)"}},
          // RM 40
          ce("div",null,
            ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.1em",marginBottom:8}},"ROLETA RM 40"),
            ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
              ce("div",null,
                ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:4}},"Schemat pomiaru"),
                ce("img",{src:RS_IMG.rm40schemat,alt:"RM40 schemat pomiaru",
                  style:{width:"100%",borderRadius:8,border:"1px solid var(--bd2)",display:"block"}})
              ),
              ce("div",null,
                ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:4}},"Uchwyty i profil monta\u017cowy"),
                ce("img",{src:RS_IMG.rm40uchwyty,alt:"RM40 uchwyty",
                  style:{width:"100%",borderRadius:8,border:"1px solid var(--bd2)",display:"block"}})
              )
            )
          ),
          // RM 45
          ce("div",null,
            ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.1em",marginBottom:8}},"ROLETA RM 45"),
            ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
              ce("div",null,
                ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:4}},"Schemat pomiaru"),
                ce("img",{src:RS_IMG.rm45schemat,alt:"RM45 schemat pomiaru",
                  style:{width:"100%",borderRadius:8,border:"1px solid var(--bd2)",display:"block"}})
              ),
              ce("div",null,
                ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:4}},"Uchwyty i profil monta\u017cowy"),
                ce("img",{src:RS_IMG.rm45uchwyty,alt:"RM45 uchwyty",
                  style:{width:"100%",borderRadius:8,border:"1px solid var(--bd2)",display:"block"}})
              )
            )
          )
        ):null
      )
    );



    }else if(prod.type==="szyna"){
    form=ce(Fragment,null,
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}},
        ce(Fld,{label:"ILO\u015a\u0106 SZTUK"},ce("input",{type:"number",min:1,value:par.qty||"",onChange:function(ev){sp("qty",ev.target.value);},placeholder:"1",style:IST})),
        ce(Fld,{label:"D\u0141UGO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.len||"",onChange:function(ev){sp("len",ev.target.value);},placeholder:"np. 250",style:IST})),
        ce(Fld,{label:"GI\u0118CIE \u0141UK (mb)"},ce("input",{type:"number",step:"0.1",value:par.arc||"",onChange:function(ev){sp("arc",ev.target.value);},placeholder:"0",style:IST})),
        ce(Fld,{label:"G\u0141\u0118BOKO\u015a\u0106 \u0141UKU (cm) — opcjonalnie"},ce("input",{type:"number",value:par.arcDepth||"",onChange:function(ev){sp("arcDepth",ev.target.value);},placeholder:"–",style:IST})),
        ce(Fld,{label:"GI\u0118CIE PKT (szt.)"},ce("input",{type:"number",value:par.pts||"",onChange:function(ev){sp("pts",ev.target.value);},placeholder:"0",style:IST})),
        ce(Fld,{label:"WYSOKO\u015a\u0106 (cm) — opcjonalnie"},ce("input",{type:"number",value:par.hKs||"",onChange:function(ev){sp("hKs",ev.target.value);},placeholder:"–",style:IST}))
      ),
      ce(Chips,{items:[
        ce(Chip,{key:"fl",label:"Flex 80 z\u0142/mb",active:!c.ks||c.ks==="flex",onClick:function(){sc("ks","flex");}}),
        ce(Chip,{key:"wv",label:"Wave",active:c.ks==="wave",onClick:function(){sc("ks","wave");}}),
        c.ks==="wave"?ce(Chip,{key:"bi",label:"Bia\u0142a",active:!c.kk||c.kk==="biala",onClick:function(){sc("kk","biala");}}):null,
        c.ks==="wave"?ce(Chip,{key:"cz",label:"Czarna",active:c.kk==="czarna",onClick:function(){sc("kk","czarna");}}):null,
        ce(Chip,{key:"sc",label:"Monta\u017c \u015bcienny",active:c.km==="sciana",onClick:function(){tc("km","sufit","sciana");}})
      ]})
    );
  }else if(prod.type==="karnisz"){
    var nap=[{v:"am75",l:"A-OK AM75 644z\u0142"},{v:"am50",l:"A-OK AM50 1000z\u0142"},{v:"mdct",l:"Movelite DCT 902z\u0142"},{v:"mrts",l:"Movelite RTS 1056z\u0142"},{v:"glydea",l:"Glydea 2268z\u0142"},{v:"irismo",l:"Irismo 2182z\u0142"}];
    var pil=[{v:"brak",l:"Brak st."},{v:"aok1b",l:"Pilot bia\u0142y 130z\u0142"},{v:"aok1c",l:"Pilot czarny 148z\u0142"},{v:"tuya",l:"Tuya 340z\u0142"},{v:"situo",l:"Situo 284z\u0142"},{v:"tahoma",l:"TaHoma 1390z\u0142"}];
    form=ce(Fragment,null,
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}},
        ce(Fld,{label:"ILO\u015a\u0106 SZTUK"},ce("input",{type:"number",min:1,value:par.qty||"",onChange:function(ev){sp("qty",ev.target.value);},placeholder:"1",style:IST})),
        ce(Fld,{label:"D\u0141UGO\u015a\u0106 (cm)"},ce("input",{type:"number",value:par.len||"",onChange:function(ev){sp("len",ev.target.value);},placeholder:"300",style:IST})),
        ce(Fld,{label:"GI\u0118CIE PKT (szt.)"},ce("input",{type:"number",value:par.pt||"",onChange:function(ev){sp("pt",ev.target.value);},placeholder:"0",style:IST})),
        ce(Fld,{label:"GI\u0118CIE \u0141UK (mb)"},ce("input",{type:"number",step:"0.1",value:par.arc||"",onChange:function(ev){sp("arc",ev.target.value);},placeholder:"0",style:IST})),
        ce(Fld,{label:"G\u0141\u0118BOKO\u015a\u0106 \u0141UKU (cm) — opcjonalnie"},ce("input",{type:"number",value:par.arcDepth||"",onChange:function(ev){sp("arcDepth",ev.target.value);},placeholder:"–",style:IST})),
        ce(Fld,{label:"WYSOKO\u015a\u0106 (cm) — opcjonalnie"},ce("input",{type:"number",value:par.hKm||"",onChange:function(ev){sp("hKm",ev.target.value);},placeholder:"–",style:IST}))
      ),
      ce(Chips,{items:[
        ce(Chip,{key:"sl",label:"SLIM",active:!c.km||c.km==="slim",onClick:function(){sc("km","slim");}}),
        ce(Chip,{key:"un",label:"UNIVERSAL",active:c.km==="universal",onClick:function(){sc("km","universal");}})
      ]}),
      ce("div",{style:{marginTop:8}},ce(Chips,{items:nap.map(function(x){return ce(Chip,{key:x.v,label:x.l,active:(!c.kn&&x.v==="am75")||c.kn===x.v,onClick:function(){sc("kn",x.v);}});})})),
      ce("div",{style:{marginTop:8}},ce(Chips,{items:pil.map(function(x){return ce(Chip,{key:x.v,label:x.l,active:(!c.kp&&x.v==="brak")||c.kp===x.v,onClick:function(){sc("kp",x.v);}});})})),
      ce("div",{style:{marginTop:20}},
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"STRONA SILNIKA"),
        ce("div",{style:{display:"flex",gap:10}},
          [{key:"lewo",label:"Lewo"},{key:"prawo",label:"Prawo"}].map(function(s){
            var isA=(c.motorSide||"lewo")===s.key;
            return ce("button",{key:s.key,onClick:function(){sc("motorSide",s.key);},style:{padding:"14px 28px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
              isA?"\u2713 "+s.label:s.label
            );
          })
        )
      ),
      ce("div",{style:{marginTop:16}},
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:12}},"TYP"),
        ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
          [{key:"kurtyna",label:"Kurtyna"},{key:"lewostronny",label:"Lewostronny"},{key:"prawostronny",label:"Prawostronny"}].map(function(t){
            var isA=(c.motorType||"kurtyna")===t.key;
            return ce("button",{key:t.key,onClick:function(){sc("motorType",t.key);},style:{padding:"14px 22px",borderRadius:10,border:"2px solid "+(isA?"var(--t1)":"var(--bd2)"),background:isA?"var(--t1)":"var(--bg)",color:isA?"#fff":"var(--t1)",fontSize:14,fontWeight:isA?600:400,cursor:"pointer",transition:"all .18s"}},
              isA?"\u2713 "+t.label:t.label
            );
          })
        )
      )
    );
  }else if(prod.type==="inny"){
    form=ce("div",{style:{display:"flex",flexDirection:"column",gap:14}},
      ce(Fld,{label:"NAZWA PRODUKTU"},
        ce("input",{type:"text",value:prod.innyNazwa||"",
          onChange:function(ev){p.onChange(mg(prod,{innyNazwa:ev.target.value||undefined}));},
          placeholder:"np. Narzuta dekoracyjna, Poduszka...",
          style:Object.assign({},IST,{width:"100%"})
        })
      ),
      ce("div",{style:{fontSize:13,color:"var(--t2)",padding:"8px 12px",background:"var(--bg2)",borderRadius:8,border:"1px solid var(--bd2)"}},
        "\u2139\uFE0F Wpisz cen\u0119 ko\u0144cow\u0105 w polu poni\u017cej \u2014 zostanie wliczona do podsumowania."
      )
    );
  }else{
    form=ce("div",{style:{fontSize:14,color:"var(--t2)",padding:"16px 0"}},"Cennik wkr\xf3tce.");
  }

  return ce("div",{style:{background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}},
    ce("div",{style:{padding:"14px 20px",background:"#2a7a8a",display:"flex",alignItems:"center",gap:10,borderBottom:"none"}},
      ce("span",{style:{fontSize:16,fontWeight:700,color:"#fff",flex:1,letterSpacing:"0.01em"}},prod.type==="inny"?(prod.innyNazwa?prod.innyNazwa:lbl):lbl),
      ce("span",{style:{fontSize:14,fontWeight:700,color:"#fff",background:"rgba(0,0,0,0.25)",padding:"4px 12px",borderRadius:20,whiteSpace:"nowrap"}},eff?roundTo10(eff)+" z\u0142":""),
      ce("button",{onClick:p.onDuplicate,title:"Kopiuj produkt",style:{border:"none",background:"rgba(255,255,255,0.15)",cursor:"pointer",fontSize:15,color:"#fff",padding:"5px 9px",borderRadius:7,lineHeight:1}},"⧉"),
      ce("button",{onClick:function(){if(hasProdData(prod)){setShowRemoveConfirm(true);}else{p.onRemove();}},style:{border:"none",background:"rgba(255,255,255,0.15)",cursor:"pointer",fontSize:18,color:"#fff",padding:"5px 9px",borderRadius:7,lineHeight:1}},"×")
    ),
    ce("div",{style:{padding:"16px 20px 4px"}},
      ce("div",{style:{marginBottom:16}},
        ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase",display:"block",marginBottom:10}},"TYP PRODUKTU"),
        ce("div",{style:{border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}},
          ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap",padding:"8px"}},typeChips)
        )
      )
    ),
    ce("div",{style:{padding:"4px 20px 20px",display:"flex",flexDirection:"column"}},
      form,
      warn?ce("div",{style:{background:"var(--wb)",border:"1px solid var(--wbd)",borderRadius:8,padding:"10px 14px",fontSize:13,color:"var(--wt)",marginTop:16}},warn):null,
      (total>0&&prod.mp==null)?ce("div",{style:{background:"var(--grl)",border:"1px solid var(--grm)",borderRadius:10,padding:"14px 16px",marginTop:16}},
        lines.map(function(l,i){return ce("div",{key:i,style:{fontSize:13,color:"var(--gr)",marginBottom:4}},l);}),
        ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700,color:"var(--grd)",marginTop:8,paddingTop:10,borderTop:"1px solid var(--grm)"}},
          ce("span",{},"Razem"),ce("span",{},total.toFixed(2).replace(".",",")+"\u00a0z\u0142"))
      ):null,
      ce("div",{style:{display:"flex",alignItems:"center",gap:10,paddingTop:16,marginTop:16,borderTop:"1px solid var(--bd3)"}},
        ce("label",{style:{fontSize:13,color:"var(--t2)",flex:1}},"W\u0142asna cena ko\u0144cowa:"),
        ce("input",{type:"number",value:prod.mp!=null?prod.mp:"",onChange:function(ev){p.onChange(mg(prod,{mp:ev.target.value===""?null:+ev.target.value}));},placeholder:"z\u0142",style:{width:100,padding:"10px 14px",fontSize:15,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}),
        prod.mp!=null?ce("button",{onClick:function(){p.onChange(mg(prod,{mp:null}));},style:{border:"none",background:"none",cursor:"pointer",fontSize:13,color:"var(--t3)"}},
          "wyczy\u015b\u0107"):null
      ),
      ce("div",{style:{paddingTop:12,marginTop:4}},
        ce("label",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.1em",textTransform:"uppercase",display:"block",marginBottom:6}},"UWAGA (opcjonalnie)"),
        ce("input",{type:"text",value:prod.note||"",onChange:function(ev){p.onChange(mg(prod,{note:ev.target.value||undefined}));},placeholder:"np. inny kolor, specjalna prośba...",style:{width:"100%",padding:"10px 14px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box"}})
      )
    ),
    pendingType?ce(ModalConfirmTypeChange,{
      fromLabel:lbl,
      toLabel:pendingType.label,
      onConfirm:function(){
        p.onChange(mg(prod,{type:pendingType.id,c:{split:"unequal"},par:{},panels:[],fabName:null,fabP:null,fabW:null,fabMan:null,mp:null,innyNazwa:undefined}));
      },
      onClose:function(){setPendingType(null);}
    }):null,
    showRemoveConfirm?ce(ModalConfirmRemove,{
      prodLabel:prod.type==="inny"?(prod.innyNazwa||lbl):lbl+(prod.fabName?" \xb7 "+prod.fabName:""),
      onConfirm:p.onRemove,
      onClose:function(){setShowRemoveConfirm(false);}
    }):null
  );
}



// ── MODUŁ MAIL ───────────────────────────────────────────────────────────────

// Zaślepki danych — zastąpione przez Graph API w Etapie 3/4/5
export const MOCK_SENT = [
  {id:"m1", to:"anna.kowalska@gmail.com", toName:"Anna Kowalska", subject:"Oferta aranżacji okiennych – Salon", date:"2025-04-22T10:14:00", preview:"W nawiązaniu do naszego spotkania, przesyłam w załączeniu PDF z wyceną...", body:"Dzień dobry,\n\nW nawiązaniu do naszego spotkania, przesyłam w załączeniu PDF z wyceną Pani zamówienia.\n\nOrientacyjna wartość realizacji: 4 800 zł brutto\n(zaliczka 50% = 2 400 zł)\n\nPozdrawiam serdecznie,\nPaulina Porter"},
  {id:"m2", to:"marek.nowak@wp.pl",       toName:"Marek Nowak",    subject:"Potwierdzenie zamówienia – rolety zaciemniające", date:"2025-04-18T14:32:00", preview:"Dziękuję za wpłatę zaliczki. Potwierdzam przyjęcie zamówienia na...", body:"Dzień dobry,\n\nDziękuję za wpłatę zaliczki. Potwierdzam przyjęcie zamówienia na rolety zaciemniające.\n\nCzas realizacji: ok. 4 tygodnie.\n\nPozdrawiam,\nPaulina Porter"},
  {id:"m3", to:"julia.wozniak@onet.pl",   toName:"Julia Woźniak",  subject:"Przypomnienie – wycena zasłon", date:"2025-04-10T09:05:00", preview:"Pozwalam sobie przypomnieć o przesłanej wycenie zasłon do salonu...", body:"Dzień dobry,\n\nPozwalam sobie przypomnieć o przesłanej wycenie zasłon do salonu. Jeśli ma Pani pytania, chętnie się spotkam lub porozmawiam telefonicznie.\n\nPozdrawiam,\nPaulina Porter"}
];

export const MOCK_CONTACTS = [
  {email:"anna.kowalska@gmail.com",    name:"Anna Kowalska"},
  {email:"marek.nowak@wp.pl",          name:"Marek Nowak"},
  {email:"julia.wozniak@onet.pl",      name:"Julia Woźniak"},
  {email:"tomasz.lewandowski@o2.pl",   name:"Tomasz Lewandowski"},
  {email:"katarzyna.wisniewska@wp.pl", name:"Katarzyna Wiśniewska"}
];

export const MAIL_TEMPLATES = [
  {
    id:"oferta",
    label:"Oferta",
    icon:"\uD83D\uDCCB",
    subject:"Oferta aranżacji okiennych \u2013 {clientName}",
    body:"Dzie\u0144 dobry,\n\nW nawi\u0105zaniu do naszej rozmowy, przesy\u0142am w za\u0142\u0105czeniu PDF z przybli\u017con\u0105 wycen\u0105 {honorific} zam\u00f3wienia.\n\nOrientacyjna warto\u015b\u0107 realizacji: {total} z\u0142 brutto\n(zaliczka 50% = {zaliczka} z\u0142)\n\nCzas realizacji: ok. 4 tygodnie od akceptacji i wp\u0142aty zaliczki.\n\nCh\u0119tnie przyjad\u0119 z wzornikami tkanin.\nKoszt pomiaru z dojazdem: 250 PLN (odliczane od warto\u015bci zam\u00f3wienia).\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design"
  },
  {
    id:"potwierdzenie",
    label:"Potwierdzenie",
    icon:"\u2705",
    subject:"Potwierdzenie zam\u00f3wienia \u2013 Porter Design",
    body:"Dzie\u0144 dobry,\n\nDzi\u0119kuj\u0119 za wp\u0142at\u0119 zaliczki. Potwierdzam przyj\u0119cie {honorific} zam\u00f3wienia do realizacji.\n\nSzacowany czas realizacji: ok. 4 tygodnie.\nO post\u0119pach b\u0119d\u0119 informowa\u0107 na bie\u017c\u0105co.\n\nPozdrawiam,\nPaulina Porter\nPorter Design"
  },
  {
    id:"przypomnienie",
    label:"Przypomnienie",
    icon:"\uD83D\uDD14",
    subject:"Przypomnienie \u2013 wycena Porter Design",
    body:"Dzie\u0144 dobry,\n\nPozwalam sobie przypomnie\u0107 o przes\u0142anej wycenie. Oferta wa\u017cna jest przez 30 dni.\n\nJe\u015bli ma {honorific2} pytania lub \u017cyczenia zmian \u2014 ch\u0119tnie porozmawiam.\n\nPozdrawiam,\nPaulina Porter\nPorter Design"
  },
  {
    id:"wlasny",
    label:"W\u0142asny",
    icon:"\u270F\uFE0F",
    subject:"",
    body:""
  }
];

export function fillTemplate(tpl, client, clients){
  var cl = client || {};
  var honorific = cl.gender==="male" ? "Pana" : "Pani";
  var honorific2 = cl.gender==="male" ? "Pan" : "Pani";
  var total = 0;
  if(cl.rooms){
    total = roundTo10((cl.rooms||[]).reduce(function(a,r){
      return a+(r.windows||[]).reduce(function(b,w){
        return b+(w.products||[]).reduce(function(c,prod){
          var pfc=(prod.type==="zaslona"||prod.type==="firana")?mg(prod,{panels:getPanelsForProd(prod)}):prod;
          return c+(prod.mp!=null?prod.mp:(calc(pfc).total||0));
        },0);
      },0);
    },0));
  }
  var zaliczka = roundTo10(total*0.5);
  return {
    subject: tpl.subject
      .replace("{clientName}", cl.name||"")
      .replace("{honorific}", honorific),
    body: tpl.body
      .replace(/{honorific2}/g, honorific2)
      .replace(/{honorific}/g, honorific)
      .replace(/{clientName}/g, cl.name||"")
      .replace(/{total}/g, total>0?String(total):"___")
      .replace(/{zaliczka}/g, zaliczka>0?String(zaliczka):"___")
  };
}

export function fmtMailDate(iso){
  if(!iso)return "";
  var d=new Date(iso);
  var today=new Date();
  var isToday=d.toDateString()===today.toDateString();
  if(isToday) return d.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit"});
}
