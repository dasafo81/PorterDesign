import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';
import {
  FABRICS, IMG_FALDA_PLASKA, IMG_FALDA_PODWOJNA, IMG_FALDA_POJEDYNCZA,
  IMG_FALDA_POTROJNA, IMG_FALDA_STUDIO, IMG_JZ_ALUMINIUM, IMG_JZ_BAMBOO,
  IMG_JZ_BASSWOOD, IMG_MODEL_FALDA, IMG_MODEL_TASMA, IMG_MODEL_WAVE,
  IMG_OKNO, IMG_ROLETA_BACK, IMG_ROLETA_CASCADE, IMG_ROLETA_DUO,
  IMG_ROLETA_FRONT, IMG_ROLETA_LANCUSZEK_BIALY, IMG_ROLETA_LANCUSZEK_METALOWY, IMG_ROLETA_PODSZEWKA,
  IMG_ROLETA_PRINT, IMG_ROLETA_RELAX, IMG_ROOM_GABINET, IMG_ROOM_KUCHNIA,
  IMG_ROOM_POKÓJ, IMG_ROOM_SALON, IMG_ROOM_SYPIALNIA, JZ,
  JZALUZJA_MOTORS, JZALUZJA_REMOTES, JZ_LABELS, JZ_ZONES,
  KN, KP, KSLIM, KUNIV,
  LOGO_SRC, PROD_TYPES, RCITY, RDUO,
  REL, ROOM_PRESETS, RS_BASE, RS_C,
  RS_D, RS_E, RS_HEIGHTS, RS_OB_B,
  RS_OB_C, RS_OB_D, RS_PROFIL, RS_SUPP_WIDTHS,
  RS_WIDTHS, SB_STORAGE, WIN_PRESETS, calc,
  jzLookup, mg, roundTo10
} from '../constants/data.js';
const ce = React.createElement;

export function ModalRoom(p){
  var ss=useState(null),sel=ss[0],setSel=ss[1];
  var suf=useState(""),suffix=suf[0],setSuffix=suf[1];
  var sn=useState(""),customName=sn[0],setCustomName=sn[1];

  function submit(){
    if(!sel)return;
    var preset=ROOM_PRESETS.find(function(r){return r.key===sel;});
    if(!preset)return;
    var name,img;
    if(sel==="inne"){
      if(!customName.trim())return;
      name=customName.trim();
      img=null;
    } else if(preset.needsSuffix){
      name="Pok\xf3j"+(suffix.trim()?" "+suffix.trim():"");
      img=preset.img||null;
    } else {
      name=preset.label;
      img=preset.img||null;
    }
    p.onOk(name,img);
    p.onClose();
  }

  var canSubmit=sel&&(sel==="inne"?!!customName.trim():true);

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:"16px"}},
    ce("div",{style:{background:"var(--bg)",borderRadius:18,padding:"1.6rem",width:360,maxWidth:"100%",border:"1px solid var(--bd2)",boxShadow:"0 16px 48px rgba(0,0,0,0.18)"}},
      ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:16,color:"var(--t1)",letterSpacing:"0.02em"}},"Wybierz pomieszczenie"),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}},
        ROOM_PRESETS.map(function(preset){
          var isActive=sel===preset.key;
          return ce("div",{
            key:preset.key,
            onClick:function(){setSel(preset.key);setSuffix("");setCustomName("");},
            style:{
              display:"flex",flexDirection:"column",alignItems:"center",gap:6,
              padding:"12px 8px 10px",borderRadius:12,cursor:"pointer",
              border:isActive?"2px solid var(--t1)":"2px solid var(--bd2)",
              background:isActive?"var(--grl)":"var(--bg)",
              transition:"all .15s"
            }},
            preset.img
              ?ce("img",{src:preset.img,style:{width:80,height:80,objectFit:"cover",borderRadius:10}})
              :ce("div",{style:{width:80,height:80,borderRadius:10,background:"var(--bg2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,color:"var(--t2)"}},"+"),
            ce("div",{style:{fontSize:11,fontWeight:600,color:isActive?"var(--t1)":"var(--t2)",textAlign:"center",lineHeight:1.2}},preset.label)
          );
        })
      ),
      sel==="pokoj"?ce("input",{
        autoFocus:true,
        value:suffix,
        onChange:function(ev){setSuffix(ev.target.value);},
        onKeyDown:function(ev){if(ev.key==="Enter")submit();},
        placeholder:"np. Kasi, Piotrusia...",
        style:{width:"100%",padding:"8px 10px",fontSize:13,border:"0.5px solid var(--bd2)",borderRadius:7,marginBottom:12,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block"}
      }):null,
      sel==="inne"?ce("input",{
        autoFocus:true,
        value:customName,
        onChange:function(ev){setCustomName(ev.target.value);},
        onKeyDown:function(ev){if(ev.key==="Enter")submit();},
        placeholder:"Nazwa pomieszczenia...",
        style:{width:"100%",padding:"8px 10px",fontSize:13,border:"0.5px solid var(--bd2)",borderRadius:7,marginBottom:12,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block"}
      }):null,
      ce("div",{style:{display:"flex",gap:8,marginTop:4}},
        ce("button",{
          onClick:submit,
          disabled:!canSubmit,
          style:{flex:1,padding:"9px",borderRadius:7,border:"none",background:canSubmit?"var(--t1)":"var(--bd1)",color:"#fff",fontSize:12,fontWeight:600,cursor:canSubmit?"pointer":"default",letterSpacing:"0.04em"}
        },"DODAJ"),
        ce("button",{onClick:p.onClose,style:{padding:"9px 16px",borderRadius:7,border:"0.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:12,cursor:"pointer"}},"Anuluj")
      )
    )
  );
}

// ── MODAL WYBORU OKNA ────────────────────────────────────────────────


export function ModalWindow(p){
  var ss=useState(null),sel=ss[0],setSel=ss[1];
  var sn=useState(""),customName=sn[0],setCustomName=sn[1];

  function submit(){
    if(!sel)return;
    var name;
    if(sel==="inne"){
      if(!customName.trim())return;
      name="Okno "+customName.trim();
    } else {
      var preset=WIN_PRESETS.find(function(r){return r.key===sel;});
      name=preset?("Okno "+preset.label):"Okno";
    }
    p.onOk(name);
    p.onClose();
  }

  var canSubmit=sel&&(sel==="inne"?!!customName.trim():true);

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:"16px"}},
    ce("div",{style:{background:"var(--bg)",borderRadius:18,padding:"1.6rem",width:340,maxWidth:"100%",border:"1px solid var(--bd2)",boxShadow:"0 16px 48px rgba(0,0,0,0.18)"}},
      ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:16,color:"var(--t1)",letterSpacing:"0.02em"}},"Wybierz rodzaj okna"),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}},
        WIN_PRESETS.map(function(preset){
          var isActive=sel===preset.key;
          return ce("div",{
            key:preset.key,
            onClick:function(){setSel(preset.key);setCustomName("");},
            style:{
              display:"flex",flexDirection:"column",alignItems:"center",gap:8,
              padding:"16px 8px 12px",borderRadius:12,cursor:"pointer",
              border:isActive?"2px solid var(--t1)":"2px solid var(--bd2)",
              background:isActive?"var(--grl)":"var(--bg)",
              transition:"all .15s"
            }},
            preset.img
              ?ce("img",{src:preset.img,style:{width:72,height:72,objectFit:"cover",borderRadius:8}})
              :null,
            ce("div",{style:{fontSize:12,fontWeight:600,color:isActive?"var(--t1)":"var(--t2)",textAlign:"center"}},
              preset.key==="inne"?"Inne...":preset.label
            )
          );
        })
      ),
      sel==="inne"?ce("input",{
        autoFocus:true,
        value:customName,
        onChange:function(ev){setCustomName(ev.target.value);},
        onKeyDown:function(ev){if(ev.key==="Enter")submit();},
        placeholder:"np. balkonowe, narożne...",
        style:{width:"100%",padding:"8px 10px",fontSize:13,border:"0.5px solid var(--bd2)",borderRadius:7,marginBottom:12,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block"}
      }):null,
      ce("div",{style:{display:"flex",gap:8,marginTop:4}},
        ce("button",{
          onClick:submit,
          disabled:!canSubmit,
          style:{flex:1,padding:"9px",borderRadius:7,border:"none",background:canSubmit?"var(--t1)":"var(--bd1)",color:"#fff",fontSize:12,fontWeight:600,cursor:canSubmit?"pointer":"default",letterSpacing:"0.04em"}
        },"DODAJ"),
        ce("button",{onClick:p.onClose,style:{padding:"9px 16px",borderRadius:7,border:"0.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:12,cursor:"pointer"}},"Anuluj")
      )
    )
  );
}

export function ModalConfirmDelete(p){
  // p.itemType: "client"|"room"|"window", p.label, p.onConfirm, p.onClose
  var titles={client:"Usuń klienta",room:"Usuń pomieszczenie",window:"Usuń okno"};
  var subtitles={
    client:"Usunięcie klienta spowoduje trwałe usunięcie wszystkich jego pomieszczeń, okien i produktów.",
    room:"Usunięcie pomieszczenia spowoduje trwałe usunięcie wszystkich jego okien i produktów.",
    window:"Usunięcie okna spowoduje trwałe usunięcie wszystkich przypisanych do niego produktów."
  };
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200,padding:"16px"}},
    ce("div",{style:{background:"var(--bg)",borderRadius:18,padding:"2rem",width:340,maxWidth:"100%",border:"1px solid var(--bd2)",boxShadow:"0 20px 60px rgba(0,0,0,0.22)"}},
      ce("div",{style:{fontSize:28,textAlign:"center",marginBottom:12}},"⚠️"),
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",textAlign:"center",marginBottom:10,lineHeight:1.3}},
        titles[p.itemType]||"Usuń"
      ),
      ce("div",{style:{fontSize:13,color:"var(--t2)",textAlign:"center",lineHeight:1.6,marginBottom:20}},
        "Czy na pewno chcesz usunąć ",
        ce("strong",{style:{color:"var(--t1)"}},"\u201e"+p.label+"\u201d"),
        "?",
        ce("br",null),
        ce("span",{style:{color:"#b91c1c",fontWeight:600}},subtitles[p.itemType]),
        ce("br",null),
        ce("span",{style:{color:"#b91c1c",fontWeight:600}},"Tej operacji nie można cofnąć.")
      ),
      ce("div",{style:{display:"flex",flexDirection:"column",gap:8}},
        ce("button",{
          onClick:p.onConfirm,
          style:{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#b91c1c",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"0.03em"}
        },"Tak, usuń bezpowrotnie"),
        ce("button",{
          onClick:p.onClose,
          style:{width:"100%",padding:"12px",borderRadius:10,border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t1)",fontSize:13,fontWeight:600,cursor:"pointer"}
        },"Anuluj — zostaw jak jest")
      )
    )
  );
}

export function ModalConfirmRemove(p){
  // p.prodLabel, p.onConfirm, p.onClose
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200,padding:"16px"}},
    ce("div",{style:{background:"var(--bg)",borderRadius:18,padding:"2rem",width:340,maxWidth:"100%",border:"1px solid var(--bd2)",boxShadow:"0 20px 60px rgba(0,0,0,0.22)"}},
      ce("div",{style:{fontSize:28,textAlign:"center",marginBottom:12}},"🗑️"),
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",textAlign:"center",marginBottom:10,lineHeight:1.3}},
        "Usuń produkt"
      ),
      ce("div",{style:{fontSize:13,color:"var(--t2)",textAlign:"center",lineHeight:1.6,marginBottom:20}},
        "Czy na pewno chcesz usunąć produkt ",
        ce("strong",{style:{color:"var(--t1)"}},"\u201e"+p.prodLabel+"\u201d"),
        "?",
        ce("br",null),
        ce("span",{style:{color:"#b91c1c",fontWeight:600}},"Wszystkie wpisane dane zostaną bezpowrotnie usunięte.")
      ),
      ce("div",{style:{display:"flex",flexDirection:"column",gap:8}},
        ce("button",{
          onClick:function(){p.onConfirm();p.onClose();},
          style:{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#b91c1c",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"0.03em"}
        },"Tak, usuń produkt"),
        ce("button",{
          onClick:p.onClose,
          style:{width:"100%",padding:"12px",borderRadius:10,border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t1)",fontSize:13,fontWeight:600,cursor:"pointer"}
        },"Anuluj — zostaw jak jest")
      )
    )
  );
}

export function ModalConfirmTypeChange(p){
  // p.fromLabel, p.toLabel, p.onConfirm, p.onClose
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200,padding:"16px"}},
    ce("div",{style:{background:"var(--bg)",borderRadius:18,padding:"2rem",width:340,maxWidth:"100%",border:"1px solid var(--bd2)",boxShadow:"0 20px 60px rgba(0,0,0,0.22)"}},
      ce("div",{style:{fontSize:28,textAlign:"center",marginBottom:12}},"⚠️"),
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",textAlign:"center",marginBottom:10,lineHeight:1.3}},
        "Zmiana typu produktu"
      ),
      ce("div",{style:{fontSize:13,color:"var(--t2)",textAlign:"center",lineHeight:1.6,marginBottom:20}},
        "Czy na pewno chcesz zmienić typ z ",
        ce("strong",{style:{color:"var(--t1)"}},"\u201e"+p.fromLabel+"\u201d"),
        " na ",
        ce("strong",{style:{color:"var(--t1)"}},"\u201e"+p.toLabel+"\u201d"),
        "?",
        ce("br",null),
        ce("span",{style:{color:"#b91c1c",fontWeight:600}},"Wszystkie wpisane dane zostaną bezpowrotnie usunięte.")
      ),
      ce("div",{style:{display:"flex",flexDirection:"column",gap:8}},
        ce("button",{
          onClick:function(){p.onConfirm();p.onClose();},
          style:{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#b91c1c",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"0.03em"}
        },"Tak, zmień i wyczyść dane"),
        ce("button",{
          onClick:p.onClose,
          style:{width:"100%",padding:"12px",borderRadius:10,border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t1)",fontSize:13,fontWeight:600,cursor:"pointer"}
        },"Anuluj — zostaw jak jest")
      )
    )
  );
}

export function ModalSimple(p){
  var ns=useState(""),name=ns[0],setName=ns[1];
  function submit(){if(!name.trim())return;p.onOk(name.trim());p.onClose();}
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}},
    ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:"1.8rem",width:320,border:"1px solid var(--bd2)",boxShadow:"0 12px 40px rgba(0,0,0,0.15)"}},
      ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--t1)",letterSpacing:"0.02em"}},p.title),
      ce("input",{autoFocus:true,value:name,onChange:function(ev){setName(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:p.placeholder,style:{width:"100%",padding:"7px 10px",fontSize:13,border:"0.5px solid var(--bd2)",borderRadius:7,marginBottom:12,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block"}}),
      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:submit,style:{flex:1,padding:"8px",borderRadius:7,border:"none",background:"var(--t1)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em"}},"DODAJ"),
        ce("button",{onClick:p.onClose,style:{padding:"8px 14px",borderRadius:7,border:"0.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:12,cursor:"pointer"}},"Anuluj")
      )
    )
  );
}



// ── ROLLER BLIND IMAGES (base64) ──────────────────────────────
// ── CURTAIN MODEL & FOLD TYPE IMAGES (base64) ──────────────────────
// ── PRODUCT CARD ───────────────────────────────────────────────────────────
