import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from './lib/supabase.js';
import { signOut } from './lib/auth.js';
import {
  FABRICS, IMG_OKNO, IMG_ROOM_GABINET, IMG_ROOM_KUCHNIA,
  IMG_ROOM_POKÓJ, IMG_ROOM_SALON, IMG_ROOM_SYPIALNIA, InlineEdit, JZ_LABELS,
  KARNISZ_SUPPLIERS, LOGO_SRC, PROD_TYPES, SELLER,
  buildFabricRows, buildOfferRows, buildSewingRows, calc,
  formatPLN, generateKarniszOrderPDF, generateOfferPDF,
  getPanelsForProd, mg, openPDFWindow, roundTo10
} from './constants/data.js';
import {
  generateClientEmail, generateSewingOrderPDF, generateSimplifiedPDF, buildSimplifiedPDFFromSelection
} from './lib/pdf.js';
import { ModalClient } from './components/ModalClient.jsx';
import { ModalSewing, ModalFabricOrder } from './components/ModalSewing.jsx';
import { ModalRoom, ModalWindow, ModalConfirmDelete, ModalConfirmRemove, ModalConfirmTypeChange, ModalSimple } from './components/ModalRoom.jsx';
import { ProdCard, Chip, Chips, Fld, Section, FabPicker } from './components/ProdCard.jsx';
import { ScreenMail } from './components/ScreenMail.jsx';
import { ScreenCRM, CRMKalendarz } from './components/ScreenCRM.jsx';
import { gcalWaitReady, gcalGetToken, gcalHasValidToken } from './lib/gcal.js';
import { ScreenTasks } from './components/ScreenTasks.jsx';
import { ScreenAdmin } from './components/ScreenAdmin.jsx';
import { ScreenInvoices } from './components/ScreenInvoices.jsx';
const ce = React.createElement;



export function App(p){
  var onLogout=p&&p.onLogout?p.onLogout:function(){};
  var sMode=useState("wyceniarka"),appMode=sMode[0],setAppMode=sMode[1];
  // Super-admin flaga z JWT — pokazuje zakladke Admin tylko gdy is_super_admin: true
  var sIsSuper=useState(false),isSuperAdmin=sIsSuper[0],setIsSuperAdmin=sIsSuper[1];
  React.useEffect(function(){
    try{
      var raw=localStorage.getItem("sb_session");
      if(!raw)return;
      var s=JSON.parse(raw);
      if(!s||!s.access_token)return;
      var payload=JSON.parse(atob(s.access_token.split(".")[1]));
      setIsSuperAdmin(!!(payload&&payload.app_metadata&&payload.app_metadata.is_super_admin));
    }catch(e){}
  },[]);
  // Branding tenanta - wczytany raz po starcie, fallback Porter Design jesli config pusty
  var sTenantCfg=useState(null),tenantConfig=sTenantCfg[0],setTenantConfig=sTenantCfg[1];
  React.useEffect(function(){
    sbApi.getMyTenant().then(function(t){
      if(t&&t.config)setTenantConfig(t.config);
    }).catch(function(){});
  },[]);
  var brandName=(tenantConfig&&tenantConfig.brand_name)||"Porter Design";
  var brandLogo=(tenantConfig&&tenantConfig.logo_url)||LOGO_SRC;
  // GCal token – żyje na poziomie App żeby przeżywać przełączanie zakładek
  var sGcalTok=useState(function(){
    try{var t=localStorage.getItem("pd_gcal_token");var e=localStorage.getItem("pd_gcal_token_exp");if(t&&e&&Date.now()<Number(e))return t;}catch(x){}return null;
  }),gcalToken=sGcalTok[0],setGcalToken=sGcalTok[1];
  var sGsiRdy=useState(false),gsiReady=sGsiRdy[0],setGsiReady=sGsiRdy[1];
  React.useEffect(function(){
    // Tylko ładujemy bibliotekę GIS — NIE próbujemy silent refresh przy starcie.
    // Silent refresh przez GIS implicit flow otwiera account picker gdy jest wiele kont Google.
    // Token jest odświeżany leniwie: gdy użytkownik wchodzi na CRM/Tasks i token wygasł.
    gcalWaitReady().then(function(){
      setGsiReady(true);
    }).catch(function(){});
  },[]);
  var s1=useState("home"),screen=s1[0],setScreen=s1[1];
  var s2=useState([]),clients=s2[0],setClients=s2[1];
  var s3=useState(null),curClientId=s3[0],setCurClientId=s3[1];
  var s4=useState(null),curRoomId=s4[0],setCurRoomId=s4[1];
  var s5=useState(null),curWin=s5[0],setCurWin=s5[1];
  var s6=useState(false),showClientModal=s6[0],setShowClientModal=s6[1];
  var s7=useState(false),showRoomModal=s7[0],setShowRoomModal=s7[1];
  var s8=useState(false),showWinModal=s8[0],setShowWinModal=s8[1];
  var s11=useState(false),showSewingModal=s11[0],setShowSewingModal=s11[1];
  var s11b=useState(false),showFabricModal=s11b[0],setShowFabricModal=s11b[1];
  var s12=useState(false),showAIModal=s12[0],setShowAIModal=s12[1];
  var s13=useState(""),commissionInput=s13[0],setCommissionInput=s13[1];
  var s14b=useState(false),showEmailModal=s14b[0],setShowEmailModal=s14b[1];
  var s14s=useState(false),showSimplifiedModal=s14s[0],setShowSimplifiedModal=s14s[1];
  var s14m=useState(""),montazInput=s14m[0],setMontazInput=s14m[1];
  var s9=useState(true),loading=s9[0],setLoading=s9[1];
  var s10=useState(null),saveStatus=s10[0],setSaveStatus=s10[1];
  var scd=useState(null),confirmDelete=scd[0],setConfirmDelete=scd[1];
  // confirmDelete: {type:"client"|"room"|"window", label:str, onConfirm:fn}
  var sHS=useState(""),homeSearch=sHS[0],setHomeSearch=sHS[1];
  var sHT=useState("nowe"),homeTab=sHT[0],setHomeTab=sHT[1];
  var sOffline=useState(false),offlineMode=sOffline[0],setOfflineMode=sOffline[1];
  var sShowOfflineModal=useState(false),showOfflineModal=sShowOfflineModal[0],setShowOfflineModal=sShowOfflineModal[1];

  var curClient=clients.find(function(cl){return cl.id===curClientId;})||null;
  var curRoom=curClient?(curClient.rooms||[]).find(function(r){return r.id===curRoomId;}):null;

  function wt(w){return(w.products||[]).reduce(function(a,p){var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;return a+(p.mp!=null?p.mp:(calc(pfc).total||0));},0);}
  function rt(r){return(r.windows||[]).reduce(function(a,w){return a+wt(w);},0);}
  function clientTotal(cl){return(cl.rooms||[]).reduce(function(a,r){return a+rt(r);},0);}
  function hasWinData(w){return !!(w.products&&w.products.length>0);}
  function hasRoomData(r){return !!(r.windows&&r.windows.some(function(w){return hasWinData(w);}));}
  function hasClientData(cl){return !!(cl.rooms&&cl.rooms.some(function(r){return hasRoomData(r)||r.windows&&r.windows.length>0;}));}

  // Załaduj klientów z Supabase przy starcie
  React.useEffect(function(){
    sbApi.getClients().then(function(data){
      setClients(data||[]);
      setLoading(false);
    }).catch(function(e){
      console.error("Błąd ładowania:",e);
      setLoading(false);
    });
  },[]);

  // Hydratuj lokalne pola Polecenie/Montaż z aktualnego klienta przy każdej zmianie klienta
  React.useEffect(function(){
    var cl=clients.find(function(c){return c.id===curClientId;});
    setCommissionInput(cl&&cl.commission!=null?String(cl.commission):"");
    setMontazInput(cl&&cl.install_fee!=null?String(cl.install_fee):"");
  },[curClientId,clients.length]);

  // Przewiń na górę przy każdym otwarciu widoku okna
  React.useEffect(function(){
    if(screen==="detail")window.scrollTo({top:0,behavior:"instant"});
  },[screen,curWin&&curWin.id]);

  // Zapisz zmiany w Supabase z debounce
  function saveClientToSb(id, data){
    if(offlineMode){
      var offlineQuotes=[];
      try{
        var stored=localStorage.getItem("pd_offline_quotes");
        if(stored)offlineQuotes=JSON.parse(stored);
      }catch(e){}
      var existing=offlineQuotes.findIndex(function(q){return q.id===id;});
      var quote={id:id,data:data,timestamp:Date.now()};
      if(existing>=0){offlineQuotes[existing]=quote;}else{offlineQuotes.push(quote);}
      try{
        localStorage.setItem("pd_offline_quotes",JSON.stringify(offlineQuotes));
        setSaveStatus("ok");
        setTimeout(function(){setSaveStatus(null);},1500);
      }catch(e){
        console.error("Błąd zapisu offline:",e);
        setSaveStatus("error");
      }
      return;
    }
    setSaveStatus("saving");
    sbApi.updateClient(id, data).then(function(){
      setSaveStatus("ok");
      setTimeout(function(){setSaveStatus(null);},1500);
    }).catch(function(e){
      console.error("Błąd zapisu:",e);
      setSaveStatus("error");
    });
  }

  function updateClient(id,fn){
    setClients(function(cs){
      var updated=cs.map(function(cl){return cl.id===id?fn(cl):cl;});
      var newCl=updated.find(function(cl){return cl.id===id;});
      if(newCl) saveClientToSb(id,{name:newCl.name,addr:newCl.addr,phone:newCl.phone||'',email:newCl.email||'',rooms:newCl.rooms,commission:newCl.commission||'',install_fee:newCl.install_fee||''});
      return updated;
    });
  }

  function addClient(name,addr,phone,email){
    sbApi.addClient(name,addr,phone,email).then(function(data){
      var newCl=data&&data[0]?data[0]:{id:Date.now(),name:name,addr:addr,rooms:[{id:1,name:"Salon",img:IMG_ROOM_SALON,windows:[]}]};
      setClients(function(cs){return [newCl].concat(cs);});
      setCurClientId(newCl.id);
      setScreen("rooms");
    }).catch(function(e){
      console.error("Błąd dodawania klienta:",e);
    });
  }

  function duplicateClient(cl){
    var copiedRooms=JSON.parse(JSON.stringify(cl.rooms||[]));
    copiedRooms=copiedRooms.map(function(r){
      return mg(r,{
        windows:(r.windows||[]).map(function(w){
          return mg(w,{
            id:"w_"+Date.now()+"_"+Math.floor(Math.random()*1e6),
            products:(w.products||[]).map(function(pr){
              return mg(pr,{id:"p_"+Date.now()+"_"+Math.floor(Math.random()*1e6)});
            })
          });
        })
      });
    });
    var payload={
      name:(cl.name||"")+" (kopia)",
      addr:cl.addr||"",
      phone:cl.phone||"",
      email:cl.email||"",
      rooms:copiedRooms,
      status:"nowe",
      commission:cl.commission||null,
      install_fee:cl.install_fee||null
    };
    sbApi.addClientFull(payload).then(function(data){
      var newCl=data&&data[0]?data[0]:mg(payload,{id:Date.now()});
      setClients(function(cs){return [newCl].concat(cs);});
      setCurClientId(newCl.id);
      setScreen("rooms");
    }).catch(function(e){alert("B\u0142\u0105d kopiowania: "+e.message);});
  }

  function openClient(id){setCurClientId(id);setScreen("rooms");}
  function openRoom(id){
    // Ensure the room has at least a default window
    updateClient(curClientId,function(cl){
      var newRooms=(cl.rooms||[]).map(function(r){
        if(r.id!==id)return r;
        if((r.windows||[]).length===0){
          return mg(r,{windows:[{id:"default_"+r.id,name:"",isDefault:true,products:[]}]});
        }
        return r;
      });
      return mg(cl,{rooms:newRooms});
    });
    setCurRoomId(id);setScreen("windows");
  }
  function openWin(w){setCurWin(JSON.parse(JSON.stringify(w)));setScreen("detail");}
  function newWin(name){setCurWin({id:Date.now(),name:name,products:[]});setScreen("detail");}

  // ── VARIANT LOGIC ──
  function duplicateWinAsVariant(win){
    updateClient(curClientId,function(cl){
      var newRooms=(cl.rooms||[]).map(function(r){
        if(r.id!==curRoomId)return r;
        var wins=r.windows||[];
        // check if this window already has a variantGroup
        var grpId=win.variantGroup||("vg_"+win.id);
        var letters="ABCDEFGHIJ";
        var isFirstVariant=!win.variantGroup;
        // rename original to Wariant A if not yet in a group
        var newWins=wins.map(function(w){
          if(w.id!==win.id)return w;
          if(!w.variantGroup){
            var baseName=w.name;
            return mg(w,{variantGroup:grpId,variantLabel:"A",variantBaseName:baseName,name:baseName+" \u2014 Wariant A"});
          }
          return w;
        });
        // count how many are now in the group (after renaming original) → next letter index
        var countInGroup=newWins.filter(function(w){return w.variantGroup===grpId;}).length;
        var nextLetter=letters[countInGroup]||"?"; // countInGroup=1 after first rename → index 1 = "B"
        // build new variant window (deep copy of source window, which is the one clicked)
        var srcWin=newWins.find(function(w){return w.id===win.id;})||win;
        var baseName=srcWin.variantBaseName||win.name;
        var newVariant=JSON.parse(JSON.stringify(srcWin));
        newVariant.id=Date.now()+"_"+Math.random().toString(36).slice(2,7);
        newVariant.variantGroup=grpId;
        newVariant.variantLabel=nextLetter;
        newVariant.variantBaseName=baseName;
        newVariant.name=baseName+" \u2014 Wariant "+nextLetter;
        newWins=newWins.concat([newVariant]);
        return mg(r,{windows:newWins});
      });
      return mg(cl,{rooms:newRooms});
    });
  }

  // Wariant Marszczenie: kopiuje okno, zmienia mars zasłon/firan na nextMars
  function duplicateWinAsVariantMarszczenie(win){
    // detect current mars of first zaslona/firana to suggest next value
    var firstCurtain=(win.products||[]).find(function(p){return p.type==="zaslona"||p.type==="firana";});
    if(!firstCurtain){alert("Brak zas\u0142ony/firany w tym oknie \u2014 Wariant Marszczenie nie ma zastosowania.");return;}
    var curMars=+(firstCurtain.c&&firstCurtain.c.mars!=null?firstCurtain.c.mars:1.5);
    // toggle: 150% → 200%, 200% → 150%
    var nextMars=(+curMars.toFixed(2)===1.5)?2.0:1.5;
    var nextMarsPct=Math.round(nextMars*100)+"%";

    updateClient(curClientId,function(cl){
      var newRooms=(cl.rooms||[]).map(function(r){
        if(r.id!==curRoomId)return r;
        var wins=r.windows||[];
        var grpId=win.variantGroup||("vg_"+win.id);
        // rename original to Wariant A if first time
        var newWins=wins.map(function(w){
          if(w.id!==win.id)return w;
          if(!w.variantGroup){
            var baseName=w.name;
            return mg(w,{variantGroup:grpId,variantLabel:"A",variantBaseName:baseName,name:baseName+" \u2014 Wariant A"});
          }
          return w;
        });
        var countInGroup=newWins.filter(function(w){return w.variantGroup===grpId;}).length;
        var letters="ABCDEFGHIJ";
        var nextLetter=letters[countInGroup]||"?";
        var srcWin=newWins.find(function(w){return w.id===win.id;})||win;
        var baseName=srcWin.variantBaseName||win.name;
        var newVariant=JSON.parse(JSON.stringify(srcWin));
        newVariant.id=Date.now()+"_"+Math.random().toString(36).slice(2,7);
        newVariant.variantGroup=grpId;
        newVariant.variantLabel=nextLetter;
        newVariant.variantBaseName=baseName;
        newVariant.name=baseName+" \u2014 Wariant "+nextLetter+" ("+nextMarsPct+")";
        // change mars on all zaslona/firana products
        newVariant.products=(newVariant.products||[]).map(function(p){
          if(p.type==="zaslona"||p.type==="firana"){
            return mg(p,{c:mg(p.c||{},{mars:nextMars.toFixed(2)})});
          }
          return p;
        });
        newWins=newWins.concat([newVariant]);
        return mg(r,{windows:newWins});
      });
      return mg(cl,{rooms:newRooms});
    });
  }

  // ── VARIANT ROOM LOGIC ──
  function duplicateRoomAsVariant(room){
    updateClient(curClientId,function(cl){
      var rooms=cl.rooms||[];
      var grpId=room.variantGroup||("rvg_"+room.id);
      var letters="ABCDEFGHIJ";
      var newRooms=rooms.map(function(r){
        if(r.id!==room.id)return r;
        if(!r.variantGroup){
          var baseName=r.name;
          return mg(r,{variantGroup:grpId,variantLabel:"A",variantBaseName:baseName,name:baseName});
        }
        return r;
      });
      var countInGroup=newRooms.filter(function(r){return r.variantGroup===grpId;}).length;
      var nextLetter=letters[countInGroup]||"?";
      var srcRoom=newRooms.find(function(r){return r.id===room.id;})||room;
      var baseName=srcRoom.variantBaseName||room.name;
      var newVariant=JSON.parse(JSON.stringify(srcRoom));
      newVariant.id=Date.now()+"_"+Math.random().toString(36).slice(2,7);
      newVariant.windows=(newVariant.windows||[]).map(function(w){
        return mg(w,{id:Date.now()+"_"+Math.random().toString(36).slice(2,7)});
      });
      newVariant.variantGroup=grpId;
      newVariant.variantLabel=nextLetter;
      newVariant.variantBaseName=baseName;
      newVariant.name=baseName;
      return mg(cl,{rooms:newRooms.concat([newVariant])});
    });
  }

  function addRoom(name,img){
    var newRoom={id:Date.now(),name:name,img:img||null,windows:[]};
    updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).concat([newRoom])});});
  }

  function saveWin(){
    updateClient(curClientId,function(cl){
      var newRooms=(cl.rooms||[]).map(function(r){
        if(r.id!==curRoomId)return r;
        var found=(r.windows||[]).find(function(w){return w.id===curWin.id;});
        var newWins=found?(r.windows||[]).map(function(w){return w.id===curWin.id?curWin:w;}):(r.windows||[]).concat([curWin]);
        return mg(r,{windows:newWins});
      });
      return mg(cl,{rooms:newRooms});
    });
    setScreen("windows");
  }

  function addProd(){setCurWin(function(w){return mg(w,{products:(w.products||[]).concat([{id:Date.now(),type:"zaslona",c:{},par:{},panels:[{side:"Zasłona lewa",w:""}],mp:null,fabName:null,fabP:null,fabW:null,fabMan:null}])});});}
  function updProd(i,p){setCurWin(function(w){return mg(w,{products:(w.products||[]).map(function(x,j){return j===i?p:x;})});});}
  function remProd(i){setCurWin(function(w){return mg(w,{products:(w.products||[]).filter(function(_,j){return j!==i;})});});}
  function dupProd(i){setCurWin(function(w){var prods=w.products||[];var src=prods[i];var copy=mg(src,{id:Date.now()});var next=prods.slice(0,i+1).concat([copy]).concat(prods.slice(i+1));return mg(w,{products:next});});}

  function Btn(label,onClick,primary){
    return ce("button",{onClick:onClick,style:{padding:"15px 24px",borderRadius:12,border:primary?"none":"1.5px solid var(--bd2)",background:primary?"var(--t1)":"transparent",color:primary?"#fff":"var(--t1)",fontSize:15,fontWeight:primary?600:500,cursor:"pointer",letterSpacing:primary?"0.03em":"0",minHeight:52,transition:"all .15s"}},label);
  }

  function BC(){
    var parts=[];
    function cr(label,oc){return ce("span",{key:label,onClick:oc,style:{cursor:oc?"pointer":"default",color:oc?"var(--t3)":"var(--t1)",fontWeight:oc?400:600,fontSize:13}},label);}
    function sep(i){return ce("span",{key:"s"+i,style:{color:"var(--bd2)",margin:"0 6px",fontSize:13}},"/");}
    parts.push(cr("Klienci",screen!=="home"?function(){setScreen("home");}:null));
    if(screen!=="home"&&curClient){parts.push(sep(1));parts.push(cr(curClient.name,screen!=="rooms"?function(){setScreen("rooms");}:null));}
    if((screen==="windows"||screen==="detail")&&curRoom){parts.push(sep(2));parts.push(cr(curRoom.name,screen==="detail"?function(){setScreen("windows");}:null));}
    if(screen==="detail"&&curWin){parts.push(sep(3));parts.push(cr(curWin.name,null));}
    if(screen==="sum"){parts.push(sep(4));parts.push(cr("Podsumowanie",null));}
    return ce("div",{style:{display:"flex",flexWrap:"wrap",alignItems:"center",marginBottom:0,paddingBottom:0,borderBottom:"none"}},parts);
  }

  var content=null;

  // ── HOME ──
  if(screen==="home"){
    if(loading){
      content=ce("div",{style:{textAlign:"center",padding:"4rem 0",color:"var(--t3)"}},
        ce("img",{src:LOGO_SRC,alt:"Porter Design",style:{width:35,opacity:0.4,marginBottom:12,display:"block",margin:"0 auto 12px"}}),
        ce("div",{style:{fontSize:12,letterSpacing:"0.08em"}},"\u0141adowanie...")
      );
    } else {

    var STATUS_CFG={
      nowe:        {label:"Aktywne",     color:"#7c3aed", bg:"rgba(124,58,237,0.12)",  dot:"#7c3aed"},
      zrealizowane:{label:"Zrealizowane",color:"#059669", bg:"rgba(5,150,105,0.12)",   dot:"#059669"},
      odrzucone:   {label:"Odrzucone",   color:"#dc2626", bg:"rgba(220,38,38,0.10)",   dot:"#dc2626"}
    };

    // ── Aggregate stats ──
    var totalValue=clients.reduce(function(a,cl){return a+clientTotal(cl);},0);
    var cl_nowe_all=clients.filter(function(cl){return (cl.status||"nowe")==="nowe";});
    var cl_zreal_all=clients.filter(function(cl){return cl.status==="zrealizowane";});
    var cl_odrz_all=clients.filter(function(cl){return cl.status==="odrzucone";});
    var activeValue=cl_nowe_all.reduce(function(a,cl){return a+clientTotal(cl);},0);

    function StatCard(sp){
      return ce("div",{className:"stat-card glass",style:{
        borderRadius:18,padding:"18px 20px",flex:1,minWidth:0,
        background:"rgba(255,255,255,0.72)",
        border:"1.5px solid rgba(255,255,255,0.88)",
        position:"relative",overflow:"hidden"
      }},
        ce("div",{style:{
          position:"absolute",top:-18,right:-18,width:60,height:60,
          borderRadius:"50%",background:sp.color,opacity:0.13,filter:"blur(8px)"
        }}),
        ce("div",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--t3)",marginBottom:8}}),
        ce("div",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--t3)",marginBottom:8}},sp.label),
        ce("div",{style:{fontSize:24,fontWeight:800,color:sp.color,lineHeight:1.1,marginBottom:4}},sp.value),
        sp.sub?ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:2}},sp.sub):null
      );
    }

    function ClientTile(tcp){
      var cl=tcp.cl;
      var total=clientTotal(cl);
      var st=cl.status||"nowe";
      var scfg=STATUS_CFG[st]||STATUS_CFG.nowe;
      // Initials
      var parts=(cl.name||"?").trim().split(/\s+/);
      var initials=(parts[0][0]+(parts[1]?parts[1][0]:"")).toUpperCase();
      return ce("div",{
        className:"client-tile glass",
        style:{
          borderRadius:16,padding:"14px 16px",position:"relative",
          display:"flex",alignItems:"center",gap:14,
          background:"rgba(255,255,255,0.72)",
          border:"1.5px solid rgba(255,255,255,0.88)"
        }},
        // Avatar
        ce("div",{
          onClick:function(){openClient(cl.id);},
          style:{
            width:44,height:44,borderRadius:14,flexShrink:0,
            background:"linear-gradient(135deg,"+scfg.color+"22,"+scfg.color+"44)",
            border:"1.5px solid "+scfg.color+"44",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:14,fontWeight:800,color:scfg.color,cursor:"pointer",letterSpacing:"0.02em"
          }
        },initials),
        // Info
        ce("div",{onClick:function(){openClient(cl.id);},style:{flex:1,cursor:"pointer",minWidth:0}},
          ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:2,lineHeight:1.2}},cl.name),
          cl.addr?ce("div",{style:{fontSize:12,color:"var(--t3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},(cl.addr||"").slice(0,40)):null
        ),
        // Right side
        ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}},
          ce("span",{style:{
            fontSize:9,fontWeight:700,letterSpacing:"0.10em",
            color:scfg.color,background:scfg.bg,
            borderRadius:20,padding:"3px 9px",
            border:"1px solid "+scfg.color+"30"
          }},scfg.label.toUpperCase()),
          total?ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t2)"}},roundTo10(total)+" z\u0142"):null
        ),
        // Actions
        ce("div",{style:{display:"flex",gap:2,flexShrink:0}},
          ce("button",{
            onClick:function(ev){ev.stopPropagation();duplicateClient(cl);},
            title:"Kopiuj klienta",
            style:{border:"none",background:"rgba(139,92,246,0.08)",cursor:"pointer",fontSize:12,color:"var(--t3)",padding:"4px 6px",lineHeight:1,borderRadius:8,transition:"background 0.15s"}
          },"\uD83D\uDCCB"),
          ce("button",{
            onClick:function(ev){
              ev.stopPropagation();
              var doDelete=function(){sbApi.deleteClient(cl.id).then(function(){setClients(function(cs){return cs.filter(function(c){return c.id!==cl.id;});});}).catch(function(e){alert("B\u0142\u0105d usuwania: "+e.message);});};
              if(hasClientData(cl)){setConfirmDelete({type:"client",label:cl.name,onConfirm:doDelete});}else{doDelete();}
            },
            title:"Usu\u0144 klienta",
            style:{border:"none",background:"rgba(220,38,38,0.06)",cursor:"pointer",fontSize:14,color:"var(--t3)",padding:"4px 6px",lineHeight:1,borderRadius:8,fontWeight:300,transition:"background 0.15s"}
          },"\u00d7")
        )
      );
    }

    var q=(homeSearch||"").toLowerCase().trim();
    var filtered=q
      ? clients.filter(function(cl){
          return (cl.name||"").toLowerCase().includes(q)||(cl.addr||"").toLowerCase().includes(q)||(cl.phone||"").toLowerCase().includes(q);
        })
      : clients;

    var cl_nowe=filtered.filter(function(cl){return (cl.status||"nowe")==="nowe";});
    var cl_zreal=filtered.filter(function(cl){return cl.status==="zrealizowane";});
    var cl_odrz=filtered.filter(function(cl){return cl.status==="odrzucone";});

    var TAB_LIST=[
      {sid:"nowe",       list:cl_nowe,  label:"Aktywne",      icon:"\u26A1",color:"#7c3aed"},
      {sid:"zrealizowane",list:cl_zreal,label:"Zrealizowane",  icon:"\u2714",color:"#059669"},
      {sid:"odrzucone",  list:cl_odrz,  label:"Odrzucone",     icon:"\u2715",color:"#dc2626"}
    ];
    var activeTab=q?"nowe":homeTab;
    var activeList=q?filtered:(TAB_LIST.find(function(t){return t.sid===activeTab;})||TAB_LIST[0]).list;

    // Today's date
    var now=new Date();
    var dateStr=now.toLocaleDateString("pl-PL",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

    content=ce(Fragment,null,
      // ── Hero Banner ──
      ce("div",{className:"hero-banner",style:{marginBottom:20,padding:"24px 24px 20px"}},
        // Orbs
        ce("div",{className:"holo-orb",style:{width:120,height:120,background:"radial-gradient(#a78bfa,#7c3aed)",top:-30,right:60,animationDelay:"0s"}}),
        ce("div",{className:"holo-orb",style:{width:80,height:80,background:"radial-gradient(#5eead4,#0d9488)",bottom:-10,right:20,animationDelay:"2.5s"}}),
        ce("div",{className:"holo-orb",style:{width:60,height:60,background:"radial-gradient(#fbbf24,#d97706)",top:10,right:180,animationDelay:"1.5s"}}),
        // Content
        ce("div",{style:{position:"relative",zIndex:1}},
          ce("div",{style:{fontSize:11,color:"rgba(199,210,254,0.8)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}},dateStr),
          ce("div",{style:{fontSize:28,fontWeight:900,color:"#fff",lineHeight:1.15,marginBottom:4}},
            "Porter Design"
          ),
          ce("div",{style:{fontSize:13,color:"rgba(199,210,254,0.75)",marginBottom:20}},"Panel sprzeda\u017cy i wycen"),
          // Stat row
          ce("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
            ce("div",{style:{
              background:"rgba(255,255,255,0.12)",backdropFilter:"blur(12px)",
              border:"1px solid rgba(255,255,255,0.22)",borderRadius:14,
              padding:"12px 18px",minWidth:110
            }},
              ce("div",{style:{fontSize:10,color:"rgba(199,210,254,0.7)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}},"Łączna wartość"),
              ce("div",{style:{fontSize:22,fontWeight:800,color:"#fff"}},formatPLN(totalValue)+" z\u0142")
            ),
            ce("div",{style:{
              background:"rgba(167,139,250,0.18)",backdropFilter:"blur(12px)",
              border:"1px solid rgba(167,139,250,0.30)",borderRadius:14,
              padding:"12px 18px",minWidth:110
            }},
              ce("div",{style:{fontSize:10,color:"rgba(199,210,254,0.7)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}},"Aktywne"),
              ce("div",{style:{fontSize:22,fontWeight:800,color:"#c4b5fd"}},(cl_nowe_all.length)+" klient\xf3w")
            ),
            ce("div",{style:{
              background:"rgba(94,234,212,0.12)",backdropFilter:"blur(12px)",
              border:"1px solid rgba(94,234,212,0.25)",borderRadius:14,
              padding:"12px 18px",minWidth:110
            }},
              ce("div",{style:{fontSize:10,color:"rgba(199,210,254,0.7)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}},"Zrealizowane"),
              ce("div",{style:{fontSize:22,fontWeight:800,color:"#5eead4"}},(cl_zreal_all.length)+" klient\xf3w")
            )
          )
        )
      ),

      // ── Search + New client ──
      ce("div",{style:{display:"flex",gap:10,marginBottom:16,alignItems:"center"}},
        ce("div",{style:{position:"relative",flex:1}},
          ce("span",{style:{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"var(--t3)",pointerEvents:"none"}},"\uD83D\uDD0D"),
          ce("input",{
            type:"text",
            className:"input-glass",
            value:homeSearch||"",
            onChange:function(e){setHomeSearch(e.target.value);},
            placeholder:"Szukaj klienta \u2014 imi\u0119, adres, telefon...",
            style:{width:"100%",padding:"11px 14px 11px 40px",fontSize:13,color:"var(--t1)",boxSizing:"border-box"}
          }),
          (homeSearch||"").length>0?ce("button",{
            onClick:function(){setHomeSearch("");},
            style:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:16,color:"var(--t3)",padding:"2px 4px",lineHeight:1}
          },"\u00d7"):null
        ),
        ce("div",{
          onClick:function(){setShowClientModal(true);},
          className:"btn-primary",
          style:{padding:"11px 20px",borderRadius:14,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:7}
        },
          ce("span",{style:{fontSize:16,lineHeight:1}},"+"),
          ce("span",null,"Nowy klient")
        )
      ),

      // ── Offline banner ──
      (function(){
        var count=0;
        try{var stored=localStorage.getItem("pd_offline_quotes");if(stored)count=JSON.parse(stored).length;}catch(e){}
        if(count===0)return null;
        return ce("div",{onClick:function(){setShowOfflineModal(true);},
          style:{border:"1.5px solid #f59e0b",background:"rgba(245,158,11,0.07)",backdropFilter:"blur(10px)",borderRadius:14,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,color:"#b45309",marginBottom:14}},
          ce("div",{style:{display:"flex",alignItems:"center",gap:10}},
            ce("span",{style:{fontSize:20}},"\uD83D\uDCBE"),
            ce("span",{style:{fontSize:13,fontWeight:600}},"Wyceny offline do synchronizacji")
          ),
          ce("span",{style:{background:"#f59e0b",color:"#fff",borderRadius:20,padding:"3px 11px",fontSize:12,fontWeight:700}},count)
        );
      })(),

      // ── Tabs ──
      !q?ce("div",{style:{display:"flex",gap:6,marginBottom:16,background:"rgba(255,255,255,0.60)",backdropFilter:"blur(12px)",borderRadius:16,padding:"5px",border:"1.5px solid rgba(139,92,246,0.12)"}},
        TAB_LIST.map(function(t){
          var act=homeTab===t.sid;
          return ce("button",{key:t.sid,onClick:function(){setHomeTab(t.sid);},style:{
            flex:1,padding:"9px 4px",borderRadius:12,border:"none",
            background:act?"linear-gradient(135deg,"+t.color+"22,"+t.color+"14)":"transparent",
            color:act?t.color:"var(--t3)",
            fontSize:11,fontWeight:act?700:500,cursor:"pointer",
            boxShadow:act?"0 2px 10px "+t.color+"25":"none",
            transition:"all 0.2s",letterSpacing:"0.04em",
            display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            borderLeft:act?"2px solid "+t.color+"55":"2px solid transparent"
          }},
            ce("span",{style:{fontSize:16,lineHeight:1}},t.icon),
            ce("span",null,t.label),
            ce("span",{style:{
              fontSize:11,fontWeight:800,
              color:act?t.color:"var(--t3)",
              background:act?t.color+"18":"transparent",
              borderRadius:10,padding:"0 6px"
            }},t.list.length)
          );
        })
      ):null,

      // ── Section label ──
      ce("div",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--t3)",marginBottom:10}},
        q?"Wyniki wyszukiwania":"Klienci"
      ),

      // ── Client list ──
      q&&filtered.length===0
        ?ce("div",{style:{textAlign:"center",padding:"3rem 0",color:"var(--t3)"}},
            ce("div",{style:{fontSize:32,marginBottom:10,opacity:0.3}},"\uD83D\uDD0D"),
            ce("div",{style:{fontSize:14}},"Brak wynik\xf3w dla \u201e"+q+"\u201d")
          )
        :ce("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            activeList.map(function(cl){return ce(ClientTile,{key:cl.id,cl:cl});})
          )
    );
    } // end else
  }

  // ── ROOMS ──
  else if(screen==="rooms"&&curClient){
    var rooms=curClient.rooms||[];
    var roomTiles=rooms.map(function(r){
      var rTotal=rt(r);
      return ce("div",{key:r.id,
        style:{background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:14,padding:"18px 16px",display:"flex",alignItems:"center",gap:16,boxShadow:"0 1px 6px rgba(0,0,0,0.04)",position:"relative"}},
        (function(){
          var _img=r.img||(r.name&&r.name.toLowerCase().includes("salon")?IMG_ROOM_SALON:r.name&&r.name.toLowerCase().includes("kuchnia")?IMG_ROOM_KUCHNIA:r.name&&r.name.toLowerCase().includes("sypialnia")?IMG_ROOM_SYPIALNIA:r.name&&r.name.toLowerCase().includes("gabinet")?IMG_ROOM_GABINET:r.name&&r.name.toLowerCase().includes("pok")?IMG_ROOM_POKÓJ:null);
          return _img
            ?ce("img",{onClick:function(ev){ev.stopPropagation();openRoom(r.id);},src:_img,style:{width:120,height:120,objectFit:"cover",borderRadius:12,cursor:"pointer",flexShrink:0}})
            :ce("div",{onClick:function(ev){ev.stopPropagation();openRoom(r.id);},style:{width:120,height:120,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg2)",borderRadius:12,cursor:"pointer",flexShrink:0,fontSize:36,color:"var(--t2)"}},r.name&&r.name[0]||"\u25a1");
        })(),
        ce("div",{onClick:function(){openRoom(r.id);},style:{flex:1,cursor:"pointer"}},
          ce("div",{style:{fontSize:15,fontWeight:500,color:"var(--t1)",display:"flex",alignItems:"center",gap:6}},
            ce(InlineEdit,{value:r.name,
              onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).map(function(x){return x.id===r.id?mg(x,{name:v,variantBaseName:x.variantGroup?v:x.variantBaseName}):x;})});});},
              inputStyle:{fontSize:13,fontWeight:500}}),
            r.variantGroup?ce("span",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.06em",background:"rgba(5,150,105,0.12)",color:"#059669",borderRadius:6,padding:"2px 4px 2px 7px",verticalAlign:"middle",display:"inline-flex",alignItems:"center",gap:2}},"Wariant ",ce("input",{value:r.variantLabel||"",onClick:function(ev){ev.stopPropagation();},onChange:function(ev){ev.stopPropagation();var v=(ev.target.value||"").toUpperCase().slice(0,1);if(!v)return;updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).map(function(x){return x.id===r.id?mg(x,{variantLabel:v,name:roomBaseName(x)}):x;})});});},style:{width:14,padding:0,border:"none",background:"transparent",color:"#059669",fontWeight:700,fontSize:10,letterSpacing:"0.06em",outline:"none",textTransform:"uppercase"}})):null
          ),
          ce("div",{onClick:function(){openRoom(r.id);},style:{fontSize:11,color:"var(--t3)",cursor:"pointer"}},(r.windows||[]).length+" okien")
        ),
        rTotal?ce("span",{onClick:function(){openRoom(r.id);},style:{fontSize:12,fontWeight:600,color:"var(--gr)",cursor:"pointer"}},roundTo10(rTotal)+" z\u0142"):null,
        ce("span",{onClick:function(){openRoom(r.id);},style:{color:"var(--t3)",fontSize:13,cursor:"pointer"}},"\u203a"),
        ce("button",{
          onClick:function(ev){ev.stopPropagation();duplicateRoomAsVariant(r);},
          title:"Utw\u00f3rz wariant tego pomieszczenia",
          style:{position:"absolute",top:8,right:40,border:"1px solid #059669",background:"rgba(5,150,105,0.10)",cursor:"pointer",fontSize:11,color:"#059669",padding:"4px 8px",borderRadius:6,fontWeight:600,whiteSpace:"nowrap"}
        },"\u2B6F Wariant"),
        ce("button",{
          onClick:function(ev){
            ev.stopPropagation();
            var doDelete=function(){updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).filter(function(x){return x.id!==r.id;})});});};
            if(hasRoomData(r)){setConfirmDelete({type:"room",label:r.name,onConfirm:doDelete});}else{doDelete();}
          },
          title:"Usu\u0144 pomieszczenie",
          style:{position:"absolute",top:8,right:8,border:"none",background:"none",cursor:"pointer",fontSize:18,color:"var(--t3)",padding:"4px 8px",lineHeight:1,opacity:0.5}
        },"\u00d7")
      );
    });
    content=ce(Fragment,null,
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:14,padding:"22px 20px",marginBottom:20}},
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}},"Klient"),
        ce("div",{style:{fontSize:20,fontWeight:700,color:"var(--t1)",marginBottom:8,lineHeight:1.3}},
          ce(InlineEdit,{value:curClient.name,
            onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{name:v});});},
            inputStyle:{fontSize:20,fontWeight:700}})
        ),
        ce("div",{style:{fontSize:16,color:"var(--t2)",lineHeight:1.4}},
          ce(InlineEdit,{value:curClient.addr||"(brak adresu)",
            onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{addr:v});});},
            inputStyle:{fontSize:16}})
        ),
        ce("div",{style:{fontSize:14,color:"var(--t2)",lineHeight:1.6,marginTop:4}},
          ce(InlineEdit,{value:curClient.phone||"(brak telefonu)",
            onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{phone:v});});},
            inputStyle:{fontSize:14}})
        ),
        ce("div",{style:{fontSize:14,color:"var(--t2)",lineHeight:1.6}},
          ce(InlineEdit,{value:curClient.email||"(brak e-mail)",
            onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{email:v});});},
            inputStyle:{fontSize:14}})
        )
      ),
      ce("div",{style:{fontSize:12,fontWeight:600,color:"var(--t2)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}},"Pomieszczenia"),
      ce("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:12}},
        roomTiles,
        ce("div",{key:"add",onClick:function(){setShowRoomModal(true);},
          style:{border:"2px dashed var(--bd2)",borderRadius:12,padding:"18px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,color:"var(--t3)"}},
          ce("span",{style:{fontSize:22,lineHeight:1,fontWeight:300}},"+"),ce("span",{style:{fontSize:14,fontWeight:500}},"Dodaj pomieszczenie")
        )
      ),
      ce("div",{style:{display:"flex",gap:10,marginTop:4}},Btn("Podsumowanie \u2197",function(){setScreen("sum");},true))
    );
  }

  // ── WINDOWS (room view) ──
  else if(screen==="windows"&&curRoom){
    var roomWins=curRoom.windows||[];
    // "single-window mode": exactly 1 window (default or named) → show products directly
    var isSingleMode=roomWins.length<=1||(roomWins.length===1&&roomWins[0].isDefault);
    var singleWin=isSingleMode?(roomWins[0]||null):null;

    // helper: add new window by splitting default into "Okno 1" + new "Okno 2"
    function addAnotherWindow(){
      updateClient(curClientId,function(cl){
        var newRooms=(cl.rooms||[]).map(function(r){
          if(r.id!==curRoomId)return r;
          var wins=r.windows||[];
          var renamedWins=wins.map(function(w,idx){
            if(w.isDefault||!w.name){return mg(w,{name:"Okno "+(idx+1),isDefault:false});}
            return w;
          });
          var newId=Date.now()+"_w";
          var nextNum=renamedWins.length+1;
          return mg(r,{windows:renamedWins.concat([{id:newId,name:"Okno "+nextNum,isDefault:false,products:[]}])});
        });
        return mg(cl,{rooms:newRooms});
      });
      // Open the newly created window after state settles
      setTimeout(function(){
        var updRoom=(clients.find(function(c){return c.id===curClientId;})||{rooms:[]}).rooms.find(function(r){return r.id===curRoomId;});
        if(updRoom&&(updRoom.windows||[]).length>0){
          var lastWin=updRoom.windows[updRoom.windows.length-1];
          openWin(lastWin);
        }
      },50);
    }

    if(isSingleMode){
      // ── Single-window mode: show products directly ──
      var sw=singleWin||{id:"default_"+curRoomId,name:"",isDefault:true,products:[]};
      // sync sw into curWin for addProd/updProd/remProd/dupProd to work
      if(!curWin||curWin.id!==sw.id){
        // set curWin lazily (avoid render loop: only if not already set)
        if(curWin===null||curWin.id!==sw.id){
          setCurWin(JSON.parse(JSON.stringify(sw)));
        }
      }
      var swProducts=curWin&&curWin.id===sw.id?(curWin.products||[]):(sw.products||[]);
      var swTotal=swProducts.reduce(function(a,p){var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;return a+(p.mp!=null?p.mp:(calc(pfc).total||0));},0);

      // auto-save swProducts back to room whenever they change
      function saveSingleWin(){
        if(!curWin)return;
        updateClient(curClientId,function(cl){
          var newRooms=(cl.rooms||[]).map(function(r){
            if(r.id!==curRoomId)return r;
            var found=(r.windows||[]).find(function(w){return w.id===curWin.id;});
            var newWins=found?(r.windows||[]).map(function(w){return w.id===curWin.id?curWin:w;}):(r.windows||[]).concat([curWin]);
            return mg(r,{windows:newWins});
          });
          return mg(cl,{rooms:newRooms});
        });
      }

      content=ce(Fragment,null,
        ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14}},
          ce(InlineEdit,{value:curRoom.name,onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).map(function(r){return r.id===curRoomId?mg(r,{name:v,variantBaseName:r.variantGroup?v:r.variantBaseName}):r;})});});},inputStyle:{fontSize:10,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--t3)"}})
        ),
        swProducts.length>=2?ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14,padding:"10px 14px",background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd3)"}},
          swProducts.map(function(p,i){
            var label=(PROD_TYPES.find(function(pt){return pt.id===p.type;})||{label:p.type}).label;
            var sameTypeBefore=swProducts.slice(0,i).filter(function(x){return x.type===p.type;}).length;
            var totalOfType=swProducts.filter(function(x){return x.type===p.type;}).length;
            var chipLabel=totalOfType>1?label+" "+(sameTypeBefore+1):label;
            return ce("button",{key:p.id,onClick:function(){var el=document.getElementById("sw-anchor-"+p.id);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});},style:{padding:"5px 12px",borderRadius:20,border:"1px solid var(--bd2)",background:"var(--bg)",color:"var(--t2)",fontSize:12,fontWeight:500,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}},chipLabel);
          })
        ):null,
        swProducts.map(function(p,i){
          return ce("div",{key:p.id,id:"sw-anchor-"+p.id},
            ce(ProdCard,{prod:p,
              onChange:function(np){setCurWin(function(w){return mg(w,{products:(w.products||[]).map(function(x,j){return j===i?np:x;})});});},
              onRemove:function(){setCurWin(function(w){return mg(w,{products:(w.products||[]).filter(function(_,j){return j!==i;})});});},
              onDuplicate:function(){setCurWin(function(w){var prods=w.products||[];var src=prods[i];var copy=mg(src,{id:Date.now()});var next=prods.slice(0,i+1).concat([copy]).concat(prods.slice(i+1));return mg(w,{products:next});});}
            })
          );
        }),
        ce("button",{
          onClick:function(){setCurWin(function(w){return mg(w,{products:(w.products||[]).concat([{id:Date.now(),type:"zaslona",c:{},par:{},panels:[{side:"Zas\u0142ona lewa",w:""}],mp:null,fabName:null,fabP:null,fabW:null,fabMan:null}])});});},
          style:{padding:"20px 18px",borderRadius:12,border:"2px dashed var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:16,cursor:"pointer",marginBottom:16,width:"100%",minHeight:62,transition:"all .15s"}
        },"+ Dodaj produkt"),
        swProducts.length>0?ce("div",{style:{background:"var(--grl)",border:"1px solid var(--grm)",borderRadius:12,padding:"16px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}},
          ce("span",{style:{fontSize:14,color:"var(--grd)"}},"\u0141\u0105cznie pomieszczenie"),
          ce("span",{style:{fontSize:20,fontWeight:700,color:"var(--grd)"}},roundTo10(swTotal)+" z\u0142")
        ):null,
        ce("button",{
          onClick:function(){saveSingleWin();},
          style:{padding:"12px 18px",borderRadius:10,border:"none",background:"var(--t1)",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:8,width:"100%"}
        },"Zapisz"),
        ce("div",{style:{borderTop:"1px solid var(--bd3)",marginTop:16,paddingTop:16}},
          ce("button",{
            onClick:addAnotherWindow,
            style:{padding:"14px 18px",borderRadius:10,border:"1.5px dashed var(--bd2)",background:"transparent",color:"var(--t3)",fontSize:13,cursor:"pointer",width:"100%",textAlign:"left"}
          },"+ Dodaj kolejne okno (wielookienny widok)")
        )
      );
    } else {
      // ── Multi-window mode: list all windows ──
      var winRows=roomWins.map(function(w){
        var t=wt(w);
        var labels=(w.products||[]).map(function(p){return(PROD_TYPES.find(function(pt){return pt.id===p.type;})||{label:p.type}).label;}).join(", ");
        var isVariant=!!w.variantGroup;
        var hasCurtain=(w.products||[]).some(function(p){return p.type==="zaslona"||p.type==="firana";});
        var variantBadge=isVariant?ce("span",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.06em",background:"#e8f0fe",color:"#3367d6",borderRadius:6,padding:"2px 7px",marginLeft:6,verticalAlign:"middle"}},"Wariant "+w.variantLabel):null;
        return ce("div",{key:w.id,
          style:{display:"flex",alignItems:"center",gap:14,padding:"16px 14px",borderBottom:"1px solid var(--bd3)",borderRadius:0,position:"relative",background:isVariant?"rgba(51,103,214,0.03)":"transparent"}},
          ce("div",{onClick:function(){openWin(w);},style:{display:"flex",alignItems:"center",gap:14,flex:1,cursor:"pointer",minWidth:0}},
            ce("img",{src:IMG_OKNO,style:{width:80,height:80,objectFit:"cover",borderRadius:10,flexShrink:0}}),
            ce("div",{style:{flex:1,minWidth:0}},
              ce("div",{style:{fontSize:15,fontWeight:600,color:"var(--t1)",marginBottom:3}},w.name||"Okno",variantBadge),
              ce("div",{style:{fontSize:12,color:"var(--t3)"}},labels||"\u2014"),
              t?ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--gr)",marginTop:4}},roundTo10(t)+" z\u0142"):null
            ),
            ce("span",{style:{color:"var(--t3)",fontSize:13}},"\u203a")
          ),
          ce("div",{style:{display:"flex",flexDirection:"column",gap:4,flexShrink:0}},
            ce("button",{
              onClick:function(ev){ev.stopPropagation();duplicateWinAsVariant(w);},
              title:"Utw\u00f3rz wariant tego okna",
              style:{border:"1px solid #3367d6",background:"#e8f0fe",cursor:"pointer",fontSize:11,color:"#3367d6",padding:"5px 9px",borderRadius:7,fontWeight:600,whiteSpace:"nowrap"}
            },"\u2B6F Wariant"),
            hasCurtain?ce("button",{
              onClick:function(ev){ev.stopPropagation();duplicateWinAsVariantMarszczenie(w);},
              title:"Wariant z innym procentem marszczenia",
              style:{border:"1px solid #7b4fa6",background:"#f3eaff",cursor:"pointer",fontSize:11,color:"#7b4fa6",padding:"5px 9px",borderRadius:7,fontWeight:600,whiteSpace:"nowrap"}
            },"\uD83E\uDDF5 Marszczenie"):null,
            ce("button",{
              onClick:function(ev){
                ev.stopPropagation();
                var doDelete=function(){updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).map(function(r){if(r.id!==curRoomId)return r;var afterDel=(r.windows||[]).filter(function(x){return x.id!==w.id;});var grp=w.variantGroup;if(grp){var remaining=afterDel.filter(function(x){return x.variantGroup===grp;});if(remaining.length===1){afterDel=afterDel.map(function(x){return x.variantGroup===grp?mg(x,{variantGroup:undefined,variantLabel:undefined,variantBaseName:undefined,name:x.variantBaseName||x.name}):x;});}}return mg(r,{windows:afterDel});})});});};
                if(hasWinData(w)){setConfirmDelete({type:"window",label:w.name,onConfirm:doDelete});}else{doDelete();}
              },
              title:"Usu\u0144 okno",
              style:{border:"none",background:"none",cursor:"pointer",fontSize:18,color:"var(--t3)",padding:"4px 8px",lineHeight:1,opacity:0.5}
            },"\u00d7")
          )
        );
      });
      content=ce(Fragment,null,
        ce("div",{style:{fontSize:10,fontWeight:600,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}},
          ce(InlineEdit,{value:curRoom.name,onSave:function(v){updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).map(function(r){return r.id===curRoomId?mg(r,{name:v,variantBaseName:r.variantGroup?v:r.variantBaseName}):r;})});});},inputStyle:{fontSize:10,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--t3)"}})
        ),
        winRows.length?ce("div",{style:{marginBottom:16,border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}},winRows):null,
        Btn("+ Dodaj okno",function(){setShowWinModal(true);},false)
      );
    }
  }

  // ── DETAIL ──
  else if(screen==="detail"&&curWin){
    var wtv=wt(curWin);
    content=ce(Fragment,null,
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--bd3)"}},
        ce("div",{style:{fontSize:18,fontWeight:600,color:"var(--t1)"}},
          ce(InlineEdit,{value:curWin.name,onSave:function(v){setCurWin(function(w){return mg(w,{name:v});});},inputStyle:{fontSize:14,fontWeight:500}})
        ),
        (curWin.products||[]).length?ce("div",{style:{fontSize:17,fontWeight:700,color:"var(--gr)",background:"var(--grl)",padding:"6px 14px",borderRadius:8}},roundTo10(wtv)+" z\u0142"):null
      ),
      (curWin.products||[]).length>=2?ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14,padding:"10px 14px",background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd3)"}},
        (curWin.products||[]).map(function(p,i){
          var label=(PROD_TYPES.find(function(pt){return pt.id===p.type;})||{label:p.type}).label;
          // count duplicates before this index for numbering
          var sameTypeBefore=(curWin.products||[]).slice(0,i).filter(function(x){return x.type===p.type;}).length;
          var totalOfType=(curWin.products||[]).filter(function(x){return x.type===p.type;}).length;
          var chipLabel=totalOfType>1?label+" "+(sameTypeBefore+1):label;
          return ce("button",{
            key:p.id,
            onClick:function(){
              var el=document.getElementById("prod-anchor-"+p.id);
              if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
            },
            style:{padding:"5px 12px",borderRadius:20,border:"1px solid var(--bd2)",background:"var(--bg)",color:"var(--t2)",fontSize:12,fontWeight:500,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}
          },chipLabel);
        })
      ):null,
      (curWin.products||[]).map(function(p,i){return ce("div",{key:p.id,id:"prod-anchor-"+p.id},ce(ProdCard,{prod:p,onChange:function(np){updProd(i,np);},onRemove:function(){remProd(i);},onDuplicate:function(){dupProd(i);}}));}),
      ce("button",{onClick:addProd,style:{padding:"20px 18px",borderRadius:12,border:"2px dashed var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:16,cursor:"pointer",marginBottom:16,width:"100%",minHeight:62,transition:"all .15s"}},"+ Dodaj produkt"),
      (curWin.products||[]).length>0?ce("div",{style:{background:"var(--grl)",border:"1px solid var(--grm)",borderRadius:12,padding:"16px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
        ce("span",{style:{fontSize:14,color:"var(--grd)"}},"Łącznie okno"),
        ce("span",{style:{fontSize:20,fontWeight:700,color:"var(--grd)"}},roundTo10(wtv)+" z\u0142")
      ):null,
      ce("div",{style:{display:"flex",gap:8}},Btn("Zapisz okno",saveWin,true),Btn("Anuluj",function(){setScreen("windows");},false))
    );
  }

  // ── SUMMARY ──
  else if(screen==="sum"&&curClient){
    var comm=(+commissionInput||0)/100;
    function withComm(price){return comm>0?roundTo10(price*(1+comm)):roundTo10(price);}
    var sRooms=sortRoomsWithVariants((curClient.rooms||[]).filter(function(r){return(r.windows||[]).length>0;}));

    // ── variant-aware room rendering ──
    function renderRoomSummary(r){
      var wins=r.windows||[];
      // separate variant groups from plain windows
      var variantGroups={};
      var plainWins=[];
      wins.forEach(function(w){
        if(w.variantGroup){
          if(!variantGroups[w.variantGroup])variantGroups[w.variantGroup]=[];
          variantGroups[w.variantGroup].push(w);
        } else {
          plainWins.push(w);
        }
      });
      var hasVariants=Object.keys(variantGroups).length>0;

      // For room total: use Variant A from each group (the "base" scenario) + plain windows
      var roomBaseTotal=plainWins.reduce(function(a,w){return a+wt(w);},0);
      Object.keys(variantGroups).forEach(function(gid){
        var sorted=variantGroups[gid].slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
        roomBaseTotal+=wt(sorted[0]);
      });

      function winCard(w,extraStyle){
        var t=wt(w);
        var desc=(w.products||[]).map(function(p){var l=(PROD_TYPES.find(function(pt){return pt.id===p.type;})||{label:p.type}).label;return p.fabName?l+" ("+p.fabName+")":l;}).join(", ");
        return ce("div",{key:w.id,style:mg({padding:"14px 16px",background:"var(--bg2)",borderRadius:12,marginBottom:6,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,border:"1px solid var(--bd3)"},extraStyle||{})},
          ce("div",{style:{flex:1,minWidth:0}},
            ce("div",{style:{fontSize:14,fontWeight:600,color:"var(--t1)",marginBottom:3}},"\uD83E\uDE9F "+w.name),
            ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:2}},desc||"\u2014")
          ),
          ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--gr)",whiteSpace:"nowrap"}},withComm(t)+" z\u0142")
        );
      }

      var rows=[];
      // plain windows first
      plainWins.forEach(function(w){rows.push(winCard(w));});
      // then each variant group
      Object.keys(variantGroups).forEach(function(gid){
        var group=variantGroups[gid].slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
        var baseName=group[0].variantBaseName||group[0].name;
        rows.push(
          ce("div",{key:"vg_"+gid,style:{border:"2px solid #3367d6",borderRadius:14,marginBottom:8,overflow:"hidden"}},
            ce("div",{style:{background:"#e8f0fe",padding:"8px 14px",fontSize:11,fontWeight:700,color:"#3367d6",letterSpacing:"0.07em",textTransform:"uppercase"}},
              "\uD83D\uDD00 Warianty \u2014 "+baseName
            ),
            group.map(function(w,gi){
              var t=wt(w);
              var desc=(w.products||[]).map(function(p){var l=(PROD_TYPES.find(function(pt){return pt.id===p.type;})||{label:p.type}).label;return p.fabName?l+" ("+p.fabName+")":l;}).join(", ");
              return ce("div",{key:w.id,style:{padding:"12px 14px",borderBottom:gi<group.length-1?"1px solid #c5d3f5":"none",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,background:gi%2===0?"rgba(255,255,255,0.7)":"rgba(232,240,254,0.4)"}},
                ce("div",{style:{flex:1}},
                  ce("div",{style:{fontSize:13,fontWeight:700,color:"#3367d6",marginBottom:2}},"Wariant "+w.variantLabel),
                  ce("div",{style:{fontSize:11,color:"var(--t3)"}},desc||"\u2014")
                ),
                ce("div",{style:{fontSize:15,fontWeight:700,color:"#3367d6",whiteSpace:"nowrap"}},withComm(t)+" z\u0142")
              );
            })
          )
        );
      });

      return ce("div",{key:r.id,style:{marginBottom:20}},
        ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:10}},
          roomBaseName(r)+(r.variantGroup?" \u2014 Wariant "+r.variantLabel:"")+(hasVariants?" \u2014 od "+withComm(roomBaseTotal)+" z\u0142":" \u2014 "+withComm(roomBaseTotal)+" z\u0142")
        ),
        rows
      );
    }

    // Compute client total (Variant A for each group)
    function clientTotalWithVariants(cl){
      var sum=0;
      (cl.rooms||[]).forEach(function(r){
        var wins=r.windows||[];
        var groups={};
        wins.forEach(function(w){
          if(w.variantGroup){if(!groups[w.variantGroup])groups[w.variantGroup]=[];groups[w.variantGroup].push(w);}
          else{sum+=wt(w);}
        });
        Object.keys(groups).forEach(function(gid){
          var sorted=groups[gid].slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
          sum+=wt(sorted[0]);
        });
      });
      return sum;
    }
    var hasAnyVariants=(curClient.rooms||[]).some(function(r){return(r.windows||[]).some(function(w){return!!w.variantGroup;});});

    content=ce(Fragment,null,
      sRooms.map(function(r){return renderRoomSummary(r);}),
      sRooms.length===0?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"12px 0"}},"Brak okien do podsumowania."):null,
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,marginTop:12,display:"flex",alignItems:"center",gap:12}},
        ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",flex:1}},"\uD83E\uDD1D Polecenie (%)"),
        ce("input",{type:"text",inputMode:"numeric",min:0,max:100,step:1,value:commissionInput,onChange:function(ev){var v=ev.target.value;setCommissionInput(v);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{commission:v});});},placeholder:"np. 7",style:{width:80,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}),
        commissionInput?ce("span",{style:{fontSize:13,color:"var(--gr)",fontWeight:600}},"+"+commissionInput+"%"):null,
        commissionInput?ce("button",{onClick:function(){setCommissionInput("");if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{commission:""});});},style:{border:"none",background:"none",cursor:"pointer",fontSize:13,color:"var(--t3)"},title:"Wyczy\u015b\u0107"},"\u2715"):null
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,marginTop:0,display:"flex",alignItems:"center",gap:12}},
        ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",flex:1}},"\uD83D\uDD28 Monta\u017c (%)"),
        ce("input",{type:"text",inputMode:"numeric",min:0,max:100,step:1,value:montazInput,onChange:function(ev){var v=ev.target.value;setMontazInput(v);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{install_fee:v});});},placeholder:"np. 10",style:{width:80,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}),
        montazInput?ce("span",{style:{fontSize:13,color:"var(--gr)",fontWeight:600}},"+"+montazInput+"%"):null,
        montazInput?ce("button",{onClick:function(){setMontazInput("");if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{install_fee:""});});},style:{border:"none",background:"none",cursor:"pointer",fontSize:13,color:"var(--t3)"},title:"Wyczy\u015b\u0107"},"\u2715"):null
      ),
      ce("div",{style:{background:"var(--t1)",borderRadius:14,padding:"20px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,marginTop:0}},
        ce("span",{style:{fontSize:14,color:"rgba(255,255,255,0.75)",letterSpacing:"0.04em"}},
          hasAnyVariants
            ?(commissionInput&&(+commissionInput)>0?"\u0141\u0105cznie od (Wariant A) + "+commissionInput+"% polecenie":"\u0141\u0105cznie od (Wariant A)")
            :(commissionInput&&(+commissionInput)>0?"\u0141\u0105cznie + "+commissionInput+"% polecenie":"\u0141\u0105cznie ca\u0142a wizyta")
        ),
        ce("span",{style:{fontSize:20,fontWeight:700,color:"#fff"}},withComm(clientTotalWithVariants(curClient))+" z\u0142")
      ),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        Btn("\u2190 Edytuj",function(){setScreen("rooms");},false),
        ce("button",{onClick:function(){generateOfferPDF(curClient,comm,(+montazInput||0)/100);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--gr)",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDCC4 Wycena PDF"),
        ce("button",{onClick:function(){setShowSimplifiedModal(true);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#c8956c",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDCCB Wycena Uproszczona"),
        ce("button",{onClick:function(){setShowEmailModal(true);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#4a7c8a",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\u2709\uFE0F Mail do klienta"),
        ce("button",{onClick:function(){setShowFabricModal(true);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--t2)",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83E\uDDF5 Zamówienie tkaniny"),
        ce("button",{onClick:function(){generateKarniszOrderPDF(curClient);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#5a7a9a",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83E\uDE9D Zamówienie karniszy"),
        ce("button",{onClick:function(){setShowSewingModal(true);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--t1)",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\u2702\uFE0F Zlecenie szycia")
      )
    );
  }

  return ce("div",{style:{padding:"1.2rem",maxWidth:"100%",margin:"0 auto",background:"transparent",minHeight:"100vh",position:"relative",transition:"background 0.3s"}},
    offlineMode?ce("div",{style:{position:"fixed",bottom:20,right:20,fontSize:10,fontWeight:700,letterSpacing:"0.10em",color:"rgba(245,158,11,0.28)",pointerEvents:"none",zIndex:1,textTransform:"uppercase"}},"Tryb offline"):null,
    // Save status
    saveStatus?ce("div",{style:{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",background:saveStatus==="ok"?"var(--gr)":saveStatus==="error"?"#dc2626":"var(--t2)",color:"#fff",fontSize:12,padding:"6px 20px",borderRadius:"0 0 12px 12px",zIndex:9999,letterSpacing:"0.04em",boxShadow:"0 4px 16px rgba(0,0,0,0.15)"}},saveStatus==="saving"?"Zapisuj\u0119...":saveStatus==="ok"?"\u2713 Zapisano":"\u26a0 B\u0142\u0105d zapisu"):null,
    // Topbar (always visible)
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:"1rem",padding:"10px 14px",borderRadius:18,background:"rgba(255,255,255,0.52)",border:"1.5px solid rgba(255,255,255,0.78)",boxShadow:"0 4px 20px rgba(99,102,241,0.10), 0 1px 0 rgba(255,255,255,0.80) inset",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)"}},
      appMode==="wyceniarka"&&screen!=="home"
        ?ce("button",{onClick:function(){setScreen("home");},style:{border:"none",background:"rgba(124,58,237,0.08)",cursor:"pointer",padding:"7px 13px",color:"var(--violet)",fontSize:13,letterSpacing:"0.04em",display:"flex",alignItems:"center",gap:5,borderRadius:10,fontWeight:600,transition:"background 0.15s"}},"\u2190","Wstecz")
        :ce("div",{style:{width:20}}),
      ce("div",{style:{display:"flex",alignItems:"center",gap:9}},
        ce("img",{src:brandLogo,alt:"logo",style:{height:22,opacity:0.9}}),
        ce("span",{style:{fontSize:10,letterSpacing:"0.13em",textTransform:"uppercase",color:"var(--t3)",fontWeight:600}},brandName)
      ),
      ce("div",{style:{display:"flex",alignItems:"center",gap:6,flexShrink:0}},
        // Offline toggle
        ce("div",{onClick:function(){setOfflineMode(function(prev){return !prev;});},style:{
          display:"flex",alignItems:"center",gap:7,cursor:"pointer",
          border:"1.5px solid "+(offlineMode?"#f59e0b":"#059669"),
          background:offlineMode?"rgba(245,158,11,0.08)":"rgba(5,150,105,0.08)",
          padding:"5px 10px",borderRadius:10,transition:"all .2s",userSelect:"none"
        }},
          ce("div",{style:{width:30,height:15,borderRadius:10,background:offlineMode?"#f59e0b":"#059669",position:"relative",transition:"all .2s"}},
            ce("div",{style:{width:11,height:11,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:offlineMode?17:2,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}})
          ),
          ce("span",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:offlineMode?"#f59e0b":"#059669"}},offlineMode?"OFFLINE":"ONLINE")
        ),
        // AI
        appMode==="wyceniarka"?ce("button",{
          onClick:function(){setShowAIModal(true);},
          disabled:offlineMode,
          style:{border:"1.5px solid rgba(124,58,237,0.25)",background:offlineMode?"var(--bd3)":"rgba(124,58,237,0.08)",cursor:offlineMode?"not-allowed":"pointer",padding:"6px 11px",borderRadius:10,color:offlineMode?"var(--t3)":"var(--violet)",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,flexShrink:0,opacity:offlineMode?0.4:1}
        },"\uD83E\uDD16 AI"):null,
        // Logout
        ce("button",{
          onClick:function(){signOut().finally(function(){onLogout();});},
          title:"Wyloguj",
          style:{border:"1.5px solid var(--bd2)",background:"var(--bg2)",cursor:"pointer",padding:"6px 10px",borderRadius:10,color:"var(--t3)",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:4,flexShrink:0}
        },"Wyloguj")
      )
    ),
    // ── Main nav tabs ──
    ce("div",{style:{display:"grid",gridTemplateColumns:(isSuperAdmin?"1fr 1fr 1fr 1fr 1fr 1fr 1fr":"1fr 1fr 1fr 1fr 1fr 1fr"),gap:4,marginBottom:"1.2rem",background:"rgba(255,255,255,0.48)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:18,padding:"5px",border:"1.5px solid rgba(255,255,255,0.72)",boxShadow:"0 4px 20px rgba(99,102,241,0.10), 0 1px 0 rgba(255,255,255,0.80) inset"}},
      [
        {id:"wyceniarka",label:"Wyceny",icon:"\uD83D\uDCCB"},
        {id:"crm",       label:"CRM",   icon:"\uD83D\uDCC8"},
        {id:"kalendarz", label:"Kalen.",icon:"\uD83D\uDCC5"},
        {id:"mail",      label:"Mail",  icon:"\u2709"},
        {id:"zadania",   label:"Zadania",icon:"\u2713"},
        {id:"faktury",   label:"Faktury", icon:"\uD83D\uDCB0"}
      ].concat(isSuperAdmin?[{id:"admin",label:"Admin",icon:"\u2699"}]:[]).map(function(tab){
        var active=appMode===tab.id;
        return ce("button",{key:tab.id,
          onClick:function(){if(!tab.soon)setAppMode(tab.id);},
          className:"nav-tab"+(active?" active":""),
          style:{
            padding:"9px 0 8px",borderRadius:12,border:"none",
            background:active?"rgba(255,255,255,0.90)":"transparent",
            color:active?"var(--violet)":tab.soon?"var(--bd2)":"var(--t3)",
            fontWeight:active?700:400,fontSize:11,cursor:tab.soon?"default":"pointer",
            boxShadow:active?"0 2px 10px rgba(124,58,237,0.13)":"none",
            transition:"all .18s",letterSpacing:"0.01em",
            display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            borderBottom:active?"2px solid var(--violet)":"2px solid transparent"
          }
        },
          ce("span",{style:{fontSize:16,lineHeight:1}},tab.icon),
          ce("span",null,tab.label),
          tab.soon?ce("span",{style:{fontSize:8,color:"var(--t3)",letterSpacing:"0.05em",opacity:0.6}},"wkr\u00f3tce"):null
        );
      })
    ),
    // Treść główna
    appMode==="crm"
      ? ce(ScreenCRM,{clients:clients,setScreen:setScreen,setAppMode:setAppMode,setCurClientId:setCurClientId,
          gcalToken:gcalToken,setGcalToken:setGcalToken,gsiReady:gsiReady,
          onClientStatusChange:function(clientId,status){
            setClients(function(cs){return cs.map(function(c){return String(c.id)===String(clientId)?Object.assign({},c,{status:status}):c;});});
          }
        })
      : appMode==="mail"
        ? ce(ScreenMail,{clients:clients,setScreen:setScreen,setCurClientId:setCurClientId})
      : appMode==="kalendarz"
        ? ce(CRMKalendarz,{deals:[],clients:clients,onDealClick:function(){},gcalToken:gcalToken,setGcalToken:setGcalToken,gsiReady:gsiReady})
      : appMode==="zadania"
        ? ce(ScreenTasks,{})
      : appMode==="faktury"
        ? ce(ScreenInvoices,{})
      : appMode==="admin"
        ? ce(ScreenAdmin,null)
        : ce(Fragment,null,
            screen!=="home"?ce(BC,{}):null,
            content
          ),
    showClientModal?ce(ModalClient,{onOk:addClient,onClose:function(){setShowClientModal(false);}}):null,
    showRoomModal?ce(ModalRoom,{onOk:addRoom,onClose:function(){setShowRoomModal(false);}}):null,
    showWinModal?ce(ModalWindow,{onOk:newWin,onClose:function(){setShowWinModal(false);}}):null,
    showSewingModal?ce(ModalSewing,{client:curClient,onClose:function(){setShowSewingModal(false);}}):null,
    showFabricModal?ce(ModalFabricOrder,{client:curClient,onClose:function(){setShowFabricModal(false);}}):null,
    showSimplifiedModal?ce(ModalSimplifiedPDF,{client:curClient,comm:comm,montaz:(+montazInput||0)/100,onClose:function(){setShowSimplifiedModal(false);}}):null,
    showEmailModal?ce(ModalClientEmail,{client:curClient,onClose:function(){setShowEmailModal(false);}}):null,
    showAIModal?ce(ModalAIValuation,{onClose:function(){setShowAIModal(false);},addClient:addClient,setClients:setClients,setCurClientId:setCurClientId,setScreen:setScreen}):null,
    showOfflineModal?ce(ModalOfflineQuotes,{show:showOfflineModal,onClose:function(){setShowOfflineModal(false);},setClients:setClients}):null,
    confirmDelete?ce(ModalConfirmDelete,{
      itemType:confirmDelete.type,
      label:confirmDelete.label,
      onConfirm:function(){confirmDelete.onConfirm();setConfirmDelete(null);},
      onClose:function(){setConfirmDelete(null);}
    }):null
  );
}

function ModalOfflineQuotes(p){
  var useState=React.useState;
  var sMOQ=useState([]),offlineQuotes=sMOQ[0],setOfflineQuotes=sMOQ[1];
  var sSyncing=useState(null),syncing=sSyncing[0],setSyncing=sSyncing[1];
  
  React.useEffect(function(){
    if(!p.show)return;
    var stored=[];
    try{
      var raw=localStorage.getItem("pd_offline_quotes");
      if(raw)stored=JSON.parse(raw);
    }catch(e){}
    setOfflineQuotes(stored);
  },[p.show]);
  
  function deleteQuote(id){
    var filtered=offlineQuotes.filter(function(q){return q.id!==id;});
    setOfflineQuotes(filtered);
    try{
      localStorage.setItem("pd_offline_quotes",JSON.stringify(filtered));
    }catch(e){}
  }
  
  function syncQuote(quote){
    setSyncing(quote.id);
    sbApi.updateClient(quote.id,quote.data).then(function(){
      deleteQuote(quote.id);
      setSyncing(null);
      sbApi.getClients().then(function(data){
        p.setClients(data||[]);
      }).catch(function(e){});
    }).catch(function(e){
      alert("B\u0142\u0105d synchronizacji: "+e.message);
      setSyncing(null);
    });
  }
  
  function syncAll(){
    if(offlineQuotes.length===0)return;
    setSyncing("all");
    var promises=offlineQuotes.map(function(q){
      return sbApi.updateClient(q.id,q.data);
    });
    Promise.all(promises).then(function(){
      try{
        localStorage.removeItem("pd_offline_quotes");
      }catch(e){}
      setOfflineQuotes([]);
      setSyncing(null);
      sbApi.getClients().then(function(data){
        p.setClients(data||[]);
      }).catch(function(e){});
      p.onClose();
    }).catch(function(e){
      alert("B\u0142\u0105d synchronizacji: "+e.message);
      setSyncing(null);
    });
  }
  
  if(!p.show)return null;
  
  return ce("div",{
    style:{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.6)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:20},
    onClick:function(e){if(e.target===e.currentTarget)p.onClose();}
  },
    ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:24,maxWidth:600,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--bd2)"}},
        ce("div",{style:{display:"flex",alignItems:"center",gap:10}},
          ce("span",{style:{fontSize:20}},"\uD83D\uDCBE"),
          ce("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"var(--t1)"}},"Wyceny offline")
        ),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",cursor:"pointer",fontSize:22,color:"var(--t3)",padding:"4px"}},"\u00D7")
      ),
      ce("div",{style:{flex:1,overflowY:"auto",marginBottom:16}},
        offlineQuotes.length===0
          ?ce("div",{style:{textAlign:"center",padding:"3rem 0",color:"var(--t3)",fontSize:13}},
              ce("div",{style:{fontSize:32,marginBottom:12,opacity:0.3}},"\uD83D\uDCED"),
              "Brak zapisanych wycen offline"
            )
          :offlineQuotes.map(function(q){
              var cl=q.data;
              var date=new Date(q.timestamp);
              var dateStr=date.toLocaleDateString("pl-PL")+" "+date.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
              return ce("div",{key:q.id,style:{
                background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:14,marginBottom:10,
                display:"flex",alignItems:"center",justifyContent:"space-between",gap:10
              }},
                ce("div",{style:{flex:1}},
                  ce("div",{style:{fontSize:14,fontWeight:600,color:"var(--t1)",marginBottom:4}},cl.name||"Bez nazwy"),
                  ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Zapisano: "+dateStr)
                ),
                ce("div",{style:{display:"flex",gap:6}},
                  ce("button",{
                    onClick:function(){syncQuote(q);},
                    disabled:syncing===q.id||syncing==="all",
                    style:{
                      padding:"6px 12px",borderRadius:8,border:"none",
                      background:syncing===q.id?"var(--bd2)":"var(--gr)",
                      color:"#fff",fontSize:11,fontWeight:600,
                      cursor:syncing?"wait":"pointer",
                      whiteSpace:"nowrap"
                    }
                  },syncing===q.id?"\u23F3":"\u2601\uFE0F Przenie\u015B"),
                  ce("button",{
                    onClick:function(){
                      if(confirm("Usun\u0105\u0107 wycen\u0119 offline dla \""+cl.name+"\"?"))deleteQuote(q.id);
                    },
                    disabled:syncing===q.id||syncing==="all",
                    style:{
                      padding:"6px 10px",borderRadius:8,border:"1px solid var(--bd2)",
                      background:"transparent",color:"var(--t3)",fontSize:11,
                      cursor:syncing?"not-allowed":"pointer"
                    }
                  },"\uD83D\uDDD1")
                )
              );
            })
      ),
      offlineQuotes.length>0?ce("div",{style:{display:"flex",gap:10,paddingTop:16,borderTop:"1px solid var(--bd2)"}},
        ce("button",{
          onClick:syncAll,
          disabled:syncing==="all",
          style:{
            flex:1,padding:"10px 16px",borderRadius:10,border:"none",
            background:syncing==="all"?"var(--bd2)":"var(--t1)",
            color:"#fff",fontSize:13,fontWeight:600,
            cursor:syncing?"wait":"pointer"
          }
        },syncing==="all"?"\u23F3 Synchronizuj\u0119...":"\u2601\uFE0F Przenie\u015B wszystko do bazy ("+offlineQuotes.length+")"),
        ce("button",{
          onClick:p.onClose,
          style:{
            padding:"10px 16px",borderRadius:10,border:"1.5px solid var(--bd2)",
            background:"transparent",color:"var(--t2)",fontSize:13,fontWeight:500,
            cursor:"pointer"
          }
        },"Zamknij")
      ):null
    )
  );
}

export function ModalClientEmail(p){
  var useState=React.useState,useRef=React.useRef;
  var client=p.client||{};
  var sr1=useState(false),copied=sr1[0],setCopied=sr1[1];
  var sr2=useState("rozmowy"),kontekst=sr2[0],setKontekst=sr2[1];
  var emailRef=useRef(null);

  var total=roundTo10((client.rooms||[]).reduce(function(a,r){return a+(r.windows||[]).reduce(function(b,w){return b+(w.products||[]).reduce(function(c,prod){var pfc=(prod.type==="zaslona"||prod.type==="firana")?mg(prod,{panels:getPanelsForProd(prod)}):prod;return c+(prod.mp!=null?prod.mp:(calc(pfc).total||0));},0);},0);},0));
  var zaliczka=roundTo10(total*0.5);

  var konteksty=["rozmowy","spotkania","wysłanych wymiarów"];

  function buildMail(){
    var k=kontekst;
    var mail="Dzień dobry,\n\n"
      +"W nawiązaniu do "+k+", przesyłam w załączeniu PDF z uproszczoną, przybliżoną wyceną "+(client.gender==="male"?"Pana":"Pani")+" zamówienia."
      +(total>0?"\n\nOrientacyjna wartość realizacji: "+total+" zł brutto\n(zaliczka 50% = "+zaliczka+" zł)":"")
      +"\n\nCzas realizacji: ok. 4 tygodnie od akceptacji i wpłaty zaliczki w wysokości 50% wartości zamówienia."
      +"\n\nChętnie przyjadę z wzornikami tkanin, aby dobrać kolor i fakturę do wnętrza."
      +"\n\nKoszt pomiaru z dojazdem wynosi 250 PLN i jest w całości odliczany od wartości zamówienia przy realizacji."
      +"\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design\nTel.: "+SELLER.tel+"\nE-mail: "+SELLER.email;
    return mail;
  }

  var mailText=buildMail();

  function copyMail(){
    var el=emailRef.current;
    if(!el)return;
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(mailText).then(function(){setCopied(true);setTimeout(function(){setCopied(false);},2500);});
    } else {
      el.select();document.execCommand("copy");setCopied(true);setTimeout(function(){setCopied(false);},2500);
    }
  }

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}},
    ce("div",{style:{background:"var(--bg1)",borderRadius:18,padding:"24px",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.22)"}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}},
        ce("div",{style:{fontSize:16,fontWeight:700,color:"var(--t1)"}},"\u2709\uFE0F Mail do klienta"),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",cursor:"pointer",fontSize:22,color:"var(--t3)",lineHeight:1,padding:"0 4px"}},"\u00d7")
      ),
      ce("div",{style:{marginBottom:14}},
        ce("div",{style:{fontSize:11,fontWeight:600,color:"var(--t3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}},"Nawiązanie do:"),
        ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
          konteksty.map(function(k){
            return ce("button",{key:k,onClick:function(){setKontekst(k);},style:{padding:"8px 14px",borderRadius:8,border:"1.5px solid "+(kontekst===k?"var(--gr)":"var(--bd2)"),background:kontekst===k?"var(--grl)":"transparent",color:kontekst===k?"var(--grd)":"var(--t2)",fontSize:12,fontWeight:kontekst===k?700:400,cursor:"pointer"}},k);
          })
        )
      ),
      ce("textarea",{ref:emailRef,value:mailText,readOnly:true,style:{width:"100%",height:280,padding:"14px",borderRadius:12,border:"1px solid var(--bd2)",background:"var(--bg2)",color:"var(--t1)",fontSize:12,lineHeight:1.7,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none"}}),
      ce("div",{style:{display:"flex",gap:10,marginTop:14}},
        ce("button",{onClick:copyMail,style:{flex:1,padding:"14px",borderRadius:12,border:"none",background:copied?"var(--grd)":"var(--gr)",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}},copied?"\u2713 Skopiowano!":"\uD83D\uDCCB Kopiuj do schowka"),
        ce("button",{onClick:p.onClose,style:{padding:"14px 20px",borderRadius:12,border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:14,cursor:"pointer"}},"Zamknij")
      ),
      total>0?ce("div",{style:{marginTop:12,padding:"10px 14px",background:"var(--grl)",borderRadius:10,fontSize:11,color:"var(--grd)",textAlign:"center"}},
        "Wycena: "+total+" zł  |  Zaliczka 50%: "+zaliczka+" zł"
      ):null
    )
  );
}

export function ModalAIValuation(p){
  var useState=React.useState,useRef=React.useRef,useEffect=React.useEffect;
  var sq1=useState({}),quizAnswers=sq1[0],setQuizAnswers=sq1[1];
  var DOTS=ce("span",null,
    ce("span",{style:{animation:"pulse 1.2s ease-in-out infinite",animationDelay:"0s",display:"inline-block",marginRight:3}},"•"),
    ce("span",{style:{animation:"pulse 1.2s ease-in-out infinite",animationDelay:"0.2s",display:"inline-block",marginRight:3}},"•"),
    ce("span",{style:{animation:"pulse 1.2s ease-in-out infinite",animationDelay:"0.4s",display:"inline-block"}},"•")
  );

  // \u2500\u2500 STATE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var sc1=useState([]),messages=sc1[0],setMessages=sc1[1];
  var sc2=useState(""),inputText=sc2[0],setInputText=sc2[1];
  var sc3=useState([]),attachments=sc3[0],setAttachments=sc3[1];
  var sc4=useState(false),loading=sc4[0],setLoading=sc4[1];
  var sc5=useState(null),error=sc5[0],setError=sc5[1];
  var sc6=useState(null),lastCalc=sc6[0],setLastCalc=sc6[1];
  var sc7=useState(null),lastParsed=sc7[0],setLastParsed=sc7[1];
  var sc8=useState(false),saved=sc8[0],setSaved=sc8[1];
  var sc9=useState(null),savedClient=sc9[0],setSavedClient=sc9[1];
  var sc10=useState(false),saveLoading=sc10[0],setSaveLoading=sc10[1];
  var fileRef=useRef(null);
  var bottomRef=useRef(null);

  useEffect(function(){
    if(bottomRef.current)bottomRef.current.scrollIntoView({behavior:"smooth"});
  },[messages,loading]);

  // \u2500\u2500 SYSTEM PROMPT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function buildSystemPrompt(){
    var fabList=FABRICS.map(function(f){
      return "- "+f.name+" ("+f.brutto+" zł/mb, szer. "+(f.width||"?")+"cm)";
    }).join("\n");
    var jzList=Object.keys(JZ_LABELS).map(function(k){
      return "  "+k+": "+JZ_LABELS[k];
    }).join("\n");
    var lines=[
      "Jesteś asystentem Pauliny Porter, właścicielki pracowni Porter Design.",
      "Pracujesz z PAULINĄ — właścicielką firmy. Ona wkleja Ci maile lub opisuje zapytania klientów.",
      "ZAWSZE piszesz DO PAULINY, nigdy do klienta. Nawet jeśli mail jest od klientki w 1. osobie — Ty odpowiadasz Paulinie.",
      "Styl: roboczy, rzeczowy. Żadnych 'Dzień dobry Pani Kasiu', 'Dziękujemy za zapytanie' itp.",
      "ZŁA odpowiedź: 'Dziękuję za zapytanie, potrzebuję kilku szczegółów...'",
      "DOBRA odpowiedź: 'Brakuje wymiarów okien. Salon: ile okien? Sypialnia: szerokość 145cm — to wnęka czy całe okno?'",
      "",
      "TWOJE ZADANIE:",
      "Na podstawie informacji od Pauliny stworzysz strukturę JSON dla aplikacji:",
      "Klient > Pomieszczenia > Okna > Produkty",
      "Aplikacja sama wyliczy ceny — TY NIGDY nie podajesz żadnych kwot.",
      "",
      "CO ZBIERASZ (tylko to, nic więcej):",
      "- Imię i nazwisko klienta",
      "- Pomieszczenia (np. Salon, Sypialnia)",
      "- Liczba okien w pomieszczeniu — jeśli bez nazwy, numeruj: Okno 1, Okno 2 itd.",
      "- Dla każdego okna: typ produktu i dane poniżej",
      "",
      "TYPY PRODUKTÓW:",
      "",
      "ZASŁONA / FIRANA:",
      "  wCm = szerokość okna (cm) | hCm = wysokość (cm)",
      "  fabName = nazwa tkaniny (jeśli podana) lub pomiń pole jeśli nie podano",
      "  mars: 1.5 = wave 150% (domyślnie) | 2.3 = fałda standardowa | 2.0 = minimalna",
      "  sz: wave (domyślnie) | flex | split: equal (domyślnie) | left | right",
      '  JSON: {"type":"zaslona","par":{"wCm":200,"hCm":270},"c":{"mars":"1.5","sz":"wave","split":"equal"},"fabName":"NAZWA"}',
      "  Bez tkaniny: pomiń pole fabName (nie dodawaj null ani pustego stringa)",
      "",
      "ŻALUZJA:",
      "  wCm = szerokość (cm) | lCm = wysokość (cm) | jt = typ",
      '  JSON: {"type":"zaluzja","par":{"wCm":100,"lCm":150},"c":{"jt":"ba50"}}',
      "",
      "ROLETA RZYMSKA:",
      "  wCm, hCm, fabName (opcjonalne), rModel: relax|print|back|front|cascade|duo",
      '  JSON: {"type":"roleta","par":{"wCm":120,"hCm":180},"c":{"rModel":"relax"}}',
      "",
      "SZYNA KS:",
      "  len = długość (cm) | ks: flex | wave",
      '  JSON: {"type":"szyna","par":{"len":200},"c":{"ks":"flex"}}',
      "",
      "KIEDY PYTASZ O BRAKUJĄCE DANE — użyj formatu quizu:",
      "PORTER_QUESTIONS_START",
      "[{\"label\":\"Szerokość okna w Salonie\",\"placeholder\":\"np. 180\"},{\"label\":\"Wysokość od szyny do podłogi\",\"placeholder\":\"np. 260\"}]",
      "PORTER_QUESTIONS_END",
      "Max 4 pytania naraz. Użyj tego formatu ZAMIAST pisania pytań w tekście.",
      "Jeśli masz wystarczająco danych — nie używaj quizu, od razu generuj JSON.",
      "",
      "ZASADY:",
      "- NIE pytaj o nazwy okien — użyj Okno 1, Okno 2 jeśli brak nazwy.",
      "- NIE proponuj tkanin — użyj tylko jeśli klient poda nazwę z listy poniżej.",
      "- Jeśli brak tkaniny — dodaj produkt bez fabName, Paulina wybierze później.",
      "- NIE pytaj o styl, materiały, kolory ścian, sufit ani nic spoza listy danych.",
      "- Jeśli brakuje wymiarów — zapytaj o nie krótko.",
      "- Gdy masz dane — generuj JSON. Każdy JSON musi być kompletny.",
      "- NIGDY nie podawaj cen.",
      "- Odpowiadaj po polsku, krótko, bez zbytecznych uprzejmości.",
      "",
      "FORMAT JSON (dołączaj na końcu wiadomości):",
      "PORTER_JSON_START",
      '{"clientName":"Anna Kowalska","addr":"","rooms":[{"name":"Salon","windows":[{"name":"Okno 1","products":[]}]}]}',
      "PORTER_JSON_END",
      "",
      "DOSTĘPNE TKANINY (użyj tylko jeśli klient poda nazwę):"
    ];
    return lines.join("\n")+"\n"+fabList+"\n\nTYPY ŻALUZJI:\n"+jzList;
  }

  // \u2500\u2500 PARSOWANIE ODPOWIEDZI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function parseAIResponse(text){
    var jsonMatch=text.match(/PORTER_JSON_START\s*([\s\S]*?)\s*PORTER_JSON_END/);
    var qMatch=text.match(/PORTER_QUESTIONS_START\s*([\s\S]*?)\s*PORTER_QUESTIONS_END/);
    var chatText=text
      .replace(/PORTER_JSON_START[\s\S]*?PORTER_JSON_END/g,"")
      .replace(/PORTER_QUESTIONS_START[\s\S]*?PORTER_QUESTIONS_END/g,"")
      .trim();
    var parsed=null,calcResult=null,questions=null;
    if(jsonMatch){
      try{
        var clean=jsonMatch[1].replace(/```json|```/g,"").trim();
        parsed=JSON.parse(clean);
        calcResult=enrichWithPrices(parsed);
      }catch(e){}
    }
    if(qMatch){
      try{
        var qclean=qMatch[1].replace(/```json|```/g,"").trim();
        questions=JSON.parse(qclean);
      }catch(e){}
    }
    return{chatText:chatText,parsed:parsed,calcResult:calcResult,questions:questions};
  }

  // \u2500\u2500 PRZELICZ CENY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function enrichWithPrices(data){
    var total=0,roomSummary=[];
    (data.rooms||[]).forEach(function(room){
      var roomTotal=0,winSummary=[];
      (room.windows||[]).forEach(function(win){
        var winTotal=0,prodSummary=[];
        (win.products||[]).forEach(function(prod){
          if(prod.fabName){
            var fab=FABRICS.find(function(f){return f.name===prod.fabName;});
            if(fab){prod.fabP=fab.brutto;prod.fabW=fab.width||300;}
          }
          var prodForCalc=prod;
          if(prod.type==="zaslona"||prod.type==="firana"){
            prodForCalc=Object.assign({},prod,{panels:getPanelsForProd(prod)});
          }
          var res=calc(prodForCalc);
          prod.mp=res.total||0;
          winTotal+=prod.mp;
          var typeLabel={zaslona:"Zas\u0142ony",firana:"Firany",zaluzja:"\u017caluzje",roleta:"Roleta rzymska",szyna:"Szyna",karnisz:"Karnisz elektryczny"}[prod.type]||prod.type;
          prodSummary.push({label:typeLabel+(prod.fabName?" ("+prod.fabName+")":""),price:prod.mp,lines:(res.lines||[]),warn:res.warn||null});
        });
        roomTotal+=winTotal;
        winSummary.push({name:win.name,total:winTotal,products:prodSummary});
      });
      total+=roomTotal;
      roomSummary.push({name:room.name,total:roomTotal,windows:winSummary});
    });
    return{rooms:roomSummary,total:total,data:data};
  }

  // \u2500\u2500 WYSLIJ WIADOMOSC \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function sendMessage(){
    var text=inputText.trim();
    if(!text&&!attachments.length)return;
    if(loading)return;

    var userContent;
    if(attachments.length){
      var parts=[];
      attachments.forEach(function(att){
        if(att.fileType==="pdf"){
          parts.push({type:"document",source:{type:"base64",media_type:"application/pdf",data:att.data}});
        }else{
          parts.push({type:"image",source:{type:"base64",media_type:att.mediaType,data:att.data}});
        }
      });
      parts.push({type:"text",text:text||"Przeanalizuj za\u0142\u0105czone pliki i wycen."});
      userContent=parts;
    }else{
      userContent=text;
    }

    var userMsg={role:"user",text:text,attachments:attachments.slice()};
    var newMessages=messages.concat([userMsg]);
    setMessages(newMessages);
    setInputText("");
    setAttachments([]);
    setError(null);
    setLoading(true);

    // Pelna historia dla API
    var apiMessages=newMessages.map(function(m){
      if(m.role==="user"){
        if(m.attachments&&m.attachments.length){
          var pts=[];
          m.attachments.forEach(function(att){
            if(att.fileType==="pdf"){
              pts.push({type:"document",source:{type:"base64",media_type:"application/pdf",data:att.data}});
            }else{
              pts.push({type:"image",source:{type:"base64",media_type:att.mediaType,data:att.data}});
            }
          });
          pts.push({type:"text",text:m.text||"Przeanalizuj za\u0142\u0105czone pliki."});
          return{role:"user",content:pts};
        }
        return{role:"user",content:m.text};
      }
      return{role:"assistant",content:m.rawText||m.text};
    });

    fetch("/api/claude",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:3000,
        system:buildSystemPrompt(),
        messages:apiMessages
      })
    }).then(function(r){return r.json();}).then(function(d){
      if(d.error){setError(d.error.message||"B\u0142\u0105d API");setLoading(false);return;}
      var raw=d.content&&d.content[0]?d.content[0].text:"";
      var parsed=parseAIResponse(raw);
      var assistantMsg={role:"assistant",text:parsed.chatText,rawText:raw,calcResult:parsed.calcResult,questions:parsed.questions||null};
      setMessages(function(prev){return prev.concat([assistantMsg]);});
      if(parsed.parsed){setLastParsed(parsed.parsed);setLastCalc(parsed.calcResult);setSaved(false);}
      setLoading(false);
    }).catch(function(e){setError(e.message||"B\u0142\u0105d po\u0142\u0105czenia");setLoading(false);});
  }

  // \u2500\u2500 PLIKI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function handleFiles(files){
    var arr=Array.prototype.slice.call(files);
    arr.slice(0,3-attachments.length).forEach(function(file){
      var isPdf=file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
      var reader=new FileReader();
      reader.onload=function(ev){
        setAttachments(function(prev){
          if(prev.length>=3)return prev;
          return prev.concat([{
            name:file.name,
            mediaType:isPdf?"application/pdf":(file.type||"image/jpeg"),
            fileType:isPdf?"pdf":"image",
            data:ev.target.result.split(",")[1]
          }]);
        });
      };
      reader.readAsDataURL(file);
    });
  }
  function onDrop(e){e.preventDefault();handleFiles(e.dataTransfer.files);}
  function removeAtt(i){setAttachments(function(prev){return prev.filter(function(_,idx){return idx!==i;});});}

  // \u2500\u2500 ZAPIS KLIENTA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function doSave(){
    if(!lastParsed)return;
    setSaveLoading(true);setError(null);
    var name=(lastParsed.clientName&&lastParsed.clientName!=="Nowy klient"&&lastParsed.clientName!=="Klient")?lastParsed.clientName:window.prompt("Imię i nazwisko klienta:","") ||"Nowy klient AI";
    var now=Date.now();
    var rooms=(lastParsed.rooms||[]).map(function(r,ri){
      var roomName=r.name||"Pokój "+(ri+1);
      var roomLow=roomName.toLowerCase();
      var roomImg=roomLow.indexOf("salon")>=0?IMG_ROOM_SALON
        :roomLow.indexOf("sypial")>=0?IMG_ROOM_SYPIALNIA
        :roomLow.indexOf("kuchn")>=0?IMG_ROOM_KUCHNIA
        :roomLow.indexOf("gabinet")>=0?IMG_ROOM_GABINET
        :IMG_ROOM_SALON;
      return{
        id:now+ri,
        name:roomName,
        img:roomImg,
        windows:(r.windows||[]).map(function(w,wi){
          // Wyczysc produkty - tylko pola ktore aplikacja rozumie
          var prods=(w.products||[]).map(function(prod,pi){
            var clean={id:now+ri*1000+wi*100+pi,type:prod.type};
            if(prod.par)clean.par=prod.par;
            if(prod.c)clean.c=prod.c;
            if(prod.fabName){
              clean.fabName=prod.fabName;
              var fabObj=FABRICS.find(function(f){return f.name===prod.fabName;});
              if(fabObj){clean.fabP=fabObj.brutto;clean.fabW=fabObj.width||0;}
            }
            if(prod.variant)clean.variant=prod.variant;
            return clean;
          });
          return{id:now+ri*100+wi,name:w.name||"Okno "+(wi+1),products:prods};
        })
      };
    });
    sbApi.addClientFull({name:name,addr:lastParsed.addr||"",phone:"",email:"",rooms:rooms})
    .then(function(res){
      var cl=res&&res[0]?res[0]:null;
      if(cl){
        setSaved(true);setSavedClient(cl);
        p.setClients&&p.setClients(function(prev){return[cl].concat(prev);});
        setSaveLoading(false);
        setMessages(function(prev){return prev.concat([{role:"assistant",text:"\u2713 Klient \u201e"+cl.name+"\u201d zosta\u0142 zapisany w aplikacji. Mo\u017cesz przej\u015b\u0107 do jego karty lub kontynuowa\u0107 rozmow\u0119."}]);});
      }else{
        setError("B\u0142\u0105d zapisu do bazy");setSaveLoading(false);
      }
    }).catch(function(e){setError(e.message);setSaveLoading(false);});
  }

  function goToClient(){
    if(!savedClient)return;
    p.setCurClientId&&p.setCurClientId(savedClient.id);
    p.setScreen&&p.setScreen("rooms");
    p.onClose();
  }

  // \u2500\u2500 RENDER BABELKI WYCENY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function renderCalcResult(cr){
    if(!cr)return null;
    return ce("div",{style:{marginTop:8,background:"var(--bg)",borderRadius:10,border:"1px solid var(--bd2)",overflow:"hidden",fontSize:12}},
      cr.rooms.map(function(room,ri){
        return ce("div",{key:ri},
          cr.rooms.length>1?ce("div",{style:{padding:"6px 12px 2px",fontSize:11,fontWeight:700,color:"var(--t2)",textTransform:"uppercase",letterSpacing:"0.06em",borderTop:ri>0?"1px solid var(--bd3)":"none"}},room.name):null,
          room.windows.map(function(win,wi){
            return ce("div",{key:wi,style:{padding:"4px 12px 8px"}},
              (cr.rooms.length>1||room.windows.length>1)?ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:3}},win.name):null,
              win.products.map(function(prod,pi){
                return ce("div",{key:pi,style:{display:"flex",justifyContent:"space-between",gap:8,padding:"4px 0",borderBottom:"0.5px solid var(--bd3)"}},
                  ce("div",{style:{flex:1,color:"var(--t1)"}},
                    (pi+1)+". "+prod.label,
                    prod.warn?ce("span",{style:{color:"#b45309",marginLeft:4}},"\u26a0\ufe0f "+prod.warn):null
                  ),
                  ce("div",{style:{fontWeight:700,color:"var(--t1)",flexShrink:0}},prod.price>0?roundTo10(prod.price)+" z\u0142":"\u2013")
                );
              })
            );
          })
        );
      }),
    );
  }

  // RENDER QUIZU
  function renderQuiz(questions,msgIdx){
    if(!questions||!questions.length)return null;
    var isLast=msgIdx===messages.length-1;
    var prefix="q"+msgIdx+"_";
    function handleSend(){
      var parts=questions.map(function(q,qi){
        var key=prefix+qi;
        var val=(quizAnswers[key]||"").trim();
        return q.label+": "+(val||"(brak)");
      });
      var combined=parts.join("\n");
      setInputText("");
      var next=Object.assign({},quizAnswers);
      questions.forEach(function(_,qi){delete next[prefix+qi];});
      setQuizAnswers(next);
      var userMsg={role:"user",text:combined};
      var newMessages=messages.concat([userMsg]);
      setMessages(newMessages);
      setLoading(true);setError(null);
      var apiMessages=newMessages.filter(function(m){return !m._greeting;}).map(function(m){
        if(m.role==="user")return{role:"user",content:m.text||" "};
        return{role:"assistant",content:m.rawText||m.text||" "};
      });
      fetch("/api/claude",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",system:buildSystemPrompt(),messages:apiMessages,max_tokens:3000})
      }).then(function(r){return r.json();}).then(function(d){
        if(d.error){setError(d.error.message||"B\u0142\u0105d API");setLoading(false);return;}
        var raw=d.content&&d.content[0]?d.content[0].text:"";
        var resp=parseAIResponse(raw);
        var aMsg={role:"assistant",text:resp.chatText,rawText:raw,calcResult:resp.calcResult,questions:resp.questions||null};
        setMessages(function(prev){return prev.concat([aMsg]);});
        if(resp.parsed){setLastParsed(resp.parsed);setLastCalc(resp.calcResult);setSaved(false);}
        setLoading(false);
      }).catch(function(e){setError(e.message||"B\u0142\u0105d po\u0142\u0105czenia");setLoading(false);});
    }
    return ce("div",{style:{marginTop:8,background:"var(--bg)",border:"1.5px solid var(--bd2)",borderRadius:12,overflow:"hidden",maxWidth:"85%"}},
      questions.map(function(q,qi){
        var key=prefix+qi;
        return ce("div",{key:qi,style:{padding:"10px 14px",borderBottom:qi<questions.length-1?"1px solid var(--bd3)":"none"}},
          ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t2)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"}},q.label),
          ce("input",{
            type:"text",
            placeholder:q.placeholder||"",
            value:quizAnswers[key]||"",
            disabled:!isLast||loading,
            onChange:function(ev){
              var v=ev.target.value;
              var ki=key;
              setQuizAnswers(function(prev){var n=Object.assign({},prev);n[ki]=v;return n;});
            },
            onKeyDown:function(ev){if(ev.key==="Enter"){ev.preventDefault();handleSend();}},
            style:{
              width:"100%",boxSizing:"border-box",
              padding:"7px 10px",borderRadius:7,
              border:"1.5px solid var(--bd2)",
              background:"var(--bg2)",color:"var(--t1)",
              fontSize:13,outline:"none",
              opacity:(!isLast||loading)?0.5:1
            }
          })
        );
      }),
      isLast&&!loading?ce("div",{style:{padding:"8px 14px",background:"var(--bg2)",borderTop:"1px solid var(--bd3)"}},
        ce("button",{
          onClick:handleSend,
          style:{width:"100%",padding:"9px",borderRadius:8,border:"none",
            background:"var(--t1)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}
        },"Wy\u015blij \u2192")
      ):null
    );
  }

  // \u2500\u2500 RENDER POJEDYNCZEJ WIADOMOSCI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function renderMessage(msg,idx){
    var isUser=msg.role==="user";
    return ce("div",{key:idx,style:{display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",gap:4,marginBottom:14}},
      msg.attachments&&msg.attachments.length>0
        ?ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",marginBottom:4}},
            msg.attachments.map(function(att,ai){
              if(att.fileType==="pdf"){
                return ce("div",{key:ai,style:{width:60,height:60,borderRadius:8,border:"1px solid var(--bd2)",background:"var(--bg2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}},
                  ce("span",{style:{fontSize:22}},"\uD83D\uDCC4"),
                  ce("span",{style:{fontSize:9,color:"var(--t3)",textAlign:"center",overflow:"hidden",maxWidth:52,textOverflow:"ellipsis",whiteSpace:"nowrap"}},"PDF")
                );
              }
              return ce("img",{key:ai,src:"data:"+att.mediaType+";base64,"+att.data,style:{width:60,height:60,objectFit:"cover",borderRadius:8,border:"1px solid var(--bd2)"}});
            })
          )
        :null,
      msg.text?ce("div",{style:{
        maxWidth:"85%",padding:"10px 14px",
        borderRadius:isUser?"16px 16px 4px 16px":"16px 16px 16px 4px",
        background:isUser?"var(--t1)":"var(--bg2)",
        color:isUser?"#fff":"var(--t1)",
        fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",
        border:isUser?"none":"1px solid var(--bd2)"
      }},msg.text):null,
      msg.calcResult?renderCalcResult(msg.calcResult):null,
      msg.questions?renderQuiz(msg.questions,idx):null
    );
  }

  var canSend=!loading&&(inputText.trim().length>0||attachments.length>0);

  // \u2500\u2500 RENDER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  return ce("div",{
    style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"flex-end"},
    onClick:function(e){if(e.target===e.currentTarget)p.onClose();}
  },
  ce("div",{style:{background:"var(--bg)",width:"100%",maxWidth:620,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 40px rgba(0,0,0,0.25)"}},

    // HEADER
    ce("div",{style:{padding:"14px 18px",borderBottom:"1px solid var(--bd2)",display:"flex",alignItems:"center",gap:10,background:"var(--bg2)",flexShrink:0}},
      ce("div",{style:{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#1a1a18,#3a3a38)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}},"\uD83E\uDD16"),
      ce("div",{style:{flex:1}},
        ce("div",{style:{fontSize:14,fontWeight:700,color:"var(--t1)"}},"Asystent Wyceny AI"),
        ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:1}},"Opisz zapytanie \u2013 zapytam o brakuj\u0105ce dane i wylicz\u0119 wycen\u0119")
      ),
      lastCalc&&!saved
        ?ce("button",{onClick:doSave,disabled:saveLoading,
            style:{padding:"6px 12px",borderRadius:8,border:"none",background:"var(--t1)",color:"#fff",fontSize:12,fontWeight:600,cursor:saveLoading?"wait":"pointer",flexShrink:0,whiteSpace:"nowrap"}
          },saveLoading?"\u23F3 Zapisuj\u0119...":"\uD83D\uDCBE Zapisz klienta")
        :null,
      saved&&savedClient
        ?ce("button",{onClick:goToClient,
            style:{padding:"6px 12px",borderRadius:8,border:"none",background:"#15803d",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}
          },"\u2192 Przejd\u017A do wyceny")
        :null,
      ce("button",{onClick:p.onClose,style:{border:"none",background:"none",cursor:"pointer",fontSize:22,color:"var(--t3)",padding:"4px 6px",flexShrink:0}},"\u00D7")
    ),

    // OBSZAR CZATU
    ce("div",{style:{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column"}},
      messages.length===0
        ?ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-start",marginBottom:14}},
            ce("div",{style:{maxWidth:"85%",padding:"10px 14px",borderRadius:"16px 16px 16px 4px",background:"var(--bg2)",color:"var(--t1)",fontSize:13,lineHeight:1.6,border:"1px solid var(--bd2)"}},
              "Jestem Twoim Asystentem AI \u2014 wklej mail od klienta, opisz zapytanie b\u0105d\u017a wklej rzut, ja przygotuję klienta w aplikacji. Zadam pytania o brakuj\u0105ce dane, je\u015bli b\u0119dzie taka potrzeba."
            )
          )
        :null,
      messages.map(renderMessage),
      loading?ce("div",{style:{display:"flex",alignItems:"flex-start",marginBottom:12}},
          ce("div",{style:{padding:"10px 14px",borderRadius:"16px 16px 16px 4px",background:"var(--bg2)",border:"1px solid var(--bd2)"}},DOTS)
        ):null,
      error?ce("div",{style:{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,fontSize:12,color:"#b91c1c",margin:"0 0 12px",whiteSpace:"pre-wrap"}},"\u26A0\uFE0F "+error):null,
      ce("div",{ref:bottomRef})
    ),

    // STOPKA: INPUT
    ce("div",{style:{flexShrink:0,borderTop:"1px solid var(--bd2)",background:"var(--bg2)",padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}},
      attachments.length>0
        ?ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
            attachments.map(function(att,i){
              return ce("div",{key:i,style:{position:"relative"}},
                att.fileType==="pdf"
                  ?ce("div",{style:{width:48,height:48,borderRadius:8,border:"1px solid var(--bd2)",background:"var(--bg2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}},
                      ce("span",{style:{fontSize:20}},"\uD83D\uDCC4"),
                      ce("span",{style:{fontSize:8,color:"var(--t3)",maxWidth:44,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"center"}},att.name)
                    )
                  :ce("img",{src:"data:"+att.mediaType+";base64,"+att.data,style:{width:48,height:48,objectFit:"cover",borderRadius:8,border:"1px solid var(--bd2)"}}),
                ce("button",{onClick:function(){removeAtt(i);},
                  style:{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",border:"none",background:"var(--t1)",color:"#fff",cursor:"pointer",fontSize:11,lineHeight:"18px",textAlign:"center",padding:0}
                },"\u00D7")
              );
            })
          )
        :null,
      ce("div",{style:{display:"flex",gap:8,alignItems:"flex-end"}},
        ce("button",{
          onClick:function(){fileRef.current&&fileRef.current.click();},
          disabled:attachments.length>=3,
          title:"Do\u0142\u0105cz zdj\u0119cie lub PDF",
          style:{padding:"9px 10px",borderRadius:10,border:"1.5px solid var(--bd2)",background:"var(--bg)",color:attachments.length>=3?"var(--t3)":"var(--t2)",cursor:attachments.length>=3?"not-allowed":"pointer",fontSize:16,flexShrink:0,alignSelf:"flex-end"}
        },"\uD83D\uDDBC\uFE0F"),
        ce("input",{ref:fileRef,type:"file",accept:"image/*,application/pdf,.pdf",multiple:true,style:{display:"none"},onChange:function(ev){handleFiles(ev.target.files);ev.target.value="";}}),
        ce("textarea",{
          value:inputText,
          onChange:function(ev){setInputText(ev.target.value);},
          onKeyDown:function(ev){if(ev.key==="Enter"&&!ev.shiftKey){ev.preventDefault();sendMessage();}},
          placeholder:"Napisz wiadomo\u015b\u0107... (Enter = wy\u015blij, Shift+Enter = nowa linia)",
          rows:2,
          style:{flex:1,padding:"9px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:10,background:"var(--bg)",color:"var(--t1)",fontFamily:"inherit",lineHeight:1.5,outline:"none",resize:"none",boxSizing:"border-box"}
        }),
        ce("button",{
          onClick:sendMessage,disabled:!canSend,
          style:{padding:"9px 14px",borderRadius:10,border:"none",background:canSend?"var(--t1)":"var(--bd2)",color:canSend?"#fff":"var(--t3)",fontSize:16,cursor:canSend?"pointer":"not-allowed",flexShrink:0,alignSelf:"flex-end"}
        },loading?"\u23F3":"\u2191")
      )
    )
  ));
}

function roomBaseName(room){
  var n=room.variantBaseName||room.name||'';
  return n.replace(/ — Wariant [A-Z\.]+$/,'').replace(/ — Wariant [A-Z\.]+$/,'');
}

function sortRoomsWithVariants(rooms){
  var seen={};var sorted=[];
  (rooms||[]).forEach(function(room){
    if(room.variantGroup){
      if(!seen[room.variantGroup]){
        seen[room.variantGroup]=true;
        var grp=(rooms||[]).filter(function(r){return r.variantGroup===room.variantGroup;});
        grp.sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
        grp.forEach(function(r){sorted.push(r);});
      }
    } else {
      sorted.push(room);
    }
  });
  return sorted;
}

// -- MODAL WYCENA UPROSZCZONA -- ZESTAWY
function ModalSimplifiedPDF(p){
  var client=p.client||{};
  var comm=p.comm||0;
  var montaz=p.montaz||0;

  function buildRoomChoices(room){
    var wins=room.windows||[];var groups={};var order=[];
    wins.forEach(function(w){var key=w.variantGroup||("solo_"+w.id);if(!groups[key]){groups[key]={isVariant:!!w.variantGroup,wins:[],baseName:w.variantBaseName||w.name};order.push(key);}groups[key].wins.push(w);});
    return {groups:groups,order:order};
  }

  function makeInitSel(){
    var init={};
    var roomGroupFirst={};
    (client.rooms||[]).forEach(function(room){
      if(room.variantGroup){
        if(!roomGroupFirst[room.variantGroup])roomGroupFirst[room.variantGroup]=room.variantLabel||"A";
        else if((room.variantLabel||"A")<roomGroupFirst[room.variantGroup])roomGroupFirst[room.variantGroup]=room.variantLabel||"A";
      }
    });
    (client.rooms||[]).forEach(function(room){
      var isRoomVariant=!!room.variantGroup;
      var isFirstRV=!isRoomVariant||(room.variantLabel===roomGroupFirst[room.variantGroup]);
      var wins=room.windows||[];var groups={};
      wins.forEach(function(w){var key=w.variantGroup||("solo_"+w.id);if(!groups[key])groups[key]=[];groups[key].push(w);});
      Object.keys(groups).forEach(function(key){
        var gWins=groups[key];
        if(key.indexOf("solo_")===0){init[room.id+"__"+key]=isFirstRV;}
        else{var sorted=gWins.slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});init[room.id+"__"+key]=isFirstRV?sorted[0].id:false;}
      });
    });
    return init;
  }

  var ss=useState(function(){return [{id:"set1",name:"Zestaw 1",sel:makeInitSel()}];});
  var sets=ss[0],setSets=ss[1];
  var sai=useState(0),activeIdx=sai[0],setActiveIdx=sai[1];

  function addSet(){var newSel=JSON.parse(JSON.stringify(sets[sets.length-1].sel));setSets(function(s){return s.concat([{id:"set"+Date.now(),name:"Zestaw "+(s.length+1),sel:newSel}]);});setActiveIdx(sets.length);}
  function removeSet(i){setSets(function(s){return s.filter(function(_,idx){return idx!==i;});});setActiveIdx(function(a){return(a>=i&&a>0)?a-1:a;});}
  function updateName(i,v){setSets(function(s){return s.map(function(st,idx){return idx===i?mg(st,{name:v}):st;});});}
  function setSel(i,key,val){setSets(function(s){return s.map(function(st,idx){if(idx!==i)return st;var ns=Object.assign({},st.sel);ns[key]=val;return mg(st,{sel:ns});});});}

  function calcTotal(sel){
    var total=0;
    sortRoomsWithVariants(client.rooms||[]).forEach(function(room){
      var wins=room.windows||[];var groups={};
      wins.forEach(function(w){var k=w.variantGroup||("solo_"+w.id);if(!groups[k])groups[k]=[];groups[k].push(w);});
      Object.keys(groups).forEach(function(key){
        var selKey=room.id+"__"+key;var selVal=sel[selKey];
        if(!selVal&&selVal!==true)return;
        var gWins=groups[key];
        var chosen=key.indexOf("solo_")===0?(selVal===true?gWins[0]:null):gWins.find(function(w){return w.id===selVal;});
        if(!chosen)return;
        (chosen.products||[]).forEach(function(prod){
          var pfc=(prod.type==="zaslona"||prod.type==="firana")?mg(prod,{panels:getPanelsForProd(prod)}):prod;
          var base=prod.mp!=null?prod.mp:(calc(pfc).total||0);
          total+=(comm>0?base*(1+comm):base);
        });
      });
    });
    return total;
  }

  function doGenerate(setIdx){
    var set=sets[setIdx];var selection=[];
    sortRoomsWithVariants(client.rooms||[]).forEach(function(room){
      var wins=room.windows||[];var groups={};
      wins.forEach(function(w){var k=w.variantGroup||("solo_"+w.id);if(!groups[k])groups[k]=[];groups[k].push(w);});
      var chosenWins=[];
      Object.keys(groups).forEach(function(key){
        var selKey=room.id+"__"+key;var selVal=set.sel[selKey];
        if(!selVal&&selVal!==true)return;
        var gWins=groups[key];
        var chosen=key.indexOf("solo_")===0?(selVal===true?gWins[0]:null):gWins.find(function(w){return w.id===selVal;});
        if(chosen)chosenWins.push(chosen);
      });
      if(chosenWins.length)selection.push({room:room,windows:chosenWins});
    });
    var h=buildSimplifiedPDFFromSelection(client,comm,montaz,selection,set.name);
    if(!h){alert("Brak pozycji do wyceny.");return;}
    openPDFWindow(h,(client.name||"")+" - "+set.name);
  }

  var activeSet=sets[Math.min(activeIdx,sets.length-1)];

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:"16px"}},
    ce("div",{style:{background:"var(--bg)",borderRadius:18,width:580,maxWidth:"100%",maxHeight:"92vh",display:"flex",flexDirection:"column",border:"1px solid var(--bd2)",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}},
      ce("div",{style:{padding:"16px 20px 12px",borderBottom:"1px solid var(--bd2)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}},
        ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)"}},"\uD83D\uDCCB Wycena Uproszczona \u2014 zestawy"),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",fontSize:20,cursor:"pointer",color:"var(--t3)",lineHeight:1}},"\u00d7")
      ),
      ce("div",{style:{display:"flex",padding:"0 20px",borderBottom:"1px solid var(--bd2)",flexShrink:0,overflowX:"auto",alignItems:"flex-end"}},
        sets.map(function(set,i){
          var isA=i===activeIdx;
          return ce("div",{key:set.id,style:{position:"relative",marginRight:4}},
            ce("button",{onClick:function(){setActiveIdx(i);},style:{padding:"9px 28px 9px 14px",borderRadius:"8px 8px 0 0",border:"1px solid var(--bd2)",borderBottom:isA?"1px solid var(--bg)":"1px solid var(--bd2)",background:isA?"var(--bg)":"var(--bg2)",color:isA?"var(--t1)":"var(--t2)",fontSize:13,fontWeight:isA?600:400,cursor:"pointer",whiteSpace:"nowrap",marginBottom:isA?-1:0}},set.name),
            sets.length>1?ce("button",{onClick:function(ev){ev.stopPropagation();removeSet(i);},style:{position:"absolute",top:4,right:6,border:"none",background:"none",cursor:"pointer",fontSize:11,color:"var(--t3)",padding:"1px 3px",lineHeight:1}},"\u00d7"):null
          );
        }),
        ce("button",{onClick:addSet,style:{padding:"8px 12px",border:"none",background:"transparent",color:"var(--t3)",fontSize:13,cursor:"pointer",whiteSpace:"nowrap",alignSelf:"center"}},"\uff0b Nowy")
      ),
      ce("div",{style:{flex:1,overflowY:"auto",padding:"16px 20px"}},
        ce("div",{style:{marginBottom:14,display:"flex",alignItems:"center",gap:8}},
          ce("span",{style:{fontSize:12,color:"var(--t3)",fontWeight:600,whiteSpace:"nowrap"}},"Nazwa:"),
          ce("input",{value:activeSet.name,onChange:function(ev){updateName(activeIdx,ev.target.value);},style:{flex:1,padding:"6px 10px",fontSize:13,border:"1px solid var(--bd2)",borderRadius:7,background:"var(--bg)",color:"var(--t1)"}})
        ),
        (function(){
          // Sort: group room variants together (A then B then C), preserve original order for non-variants
          var allRooms=client.rooms||[];
          var seen={};var sorted=[];
          allRooms.forEach(function(room,origIdx){
            if(room.variantGroup){
              if(!seen[room.variantGroup]){
                seen[room.variantGroup]=true;
                var group=allRooms.filter(function(r){return r.variantGroup===room.variantGroup;});
                group.sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
                group.forEach(function(r){sorted.push(r);});
              }
            } else {
              sorted.push(room);
            }
          });
          return sorted;
        })().map(function(room){
          var rc=buildRoomChoices(room);
          if(!rc.order.length)return null;
          var roomLabel=roomBaseName(room)+(room.variantGroup?" \u2014 Wariant "+room.variantLabel:"");
          return ce("div",{key:room.id,style:{marginBottom:10,border:"1px solid var(--bd2)",borderRadius:10,overflow:"hidden"}},
            ce("div",{style:{padding:"8px 12px",background:"var(--bg2)",fontSize:11,fontWeight:700,color:"var(--t1)",letterSpacing:"0.05em",textTransform:"uppercase",borderBottom:"1px solid var(--bd2)"}},roomLabel),
            rc.order.map(function(key,ki){
              var group=rc.groups[key];var selKey=room.id+"__"+key;var selVal=activeSet.sel[selKey];var isLast=ki===rc.order.length-1;
              if(group.isVariant){
                var sortedWins=group.wins.slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
                return ce("div",{key:key,style:{padding:"10px 12px",borderBottom:isLast?"none":"1px solid var(--bd3)"}},
                  ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:7,fontWeight:600}},group.baseName+" \u2014 wybierz wariant:"),
                  ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                    sortedWins.map(function(w){var isC=selVal===w.id;
                      return ce("label",{key:w.id,style:{display:"flex",alignItems:"center",gap:5,cursor:"pointer",padding:"5px 12px",borderRadius:7,border:"1px solid "+(isC?"#3367d6":"var(--bd2)"),background:isC?"#e8f0fe":"transparent",fontSize:12,fontWeight:isC?600:400,color:isC?"#3367d6":"var(--t2)",userSelect:"none"}},
                        ce("input",{type:"radio",name:selKey+"_"+activeIdx,checked:isC,onChange:function(){setSel(activeIdx,selKey,w.id);},style:{margin:0}}),
                        "Wariant "+w.variantLabel
                      );
                    }),
                    ce("label",{style:{display:"flex",alignItems:"center",gap:5,cursor:"pointer",padding:"5px 12px",borderRadius:7,border:"1px solid "+(selVal===false?"#dc2626":"var(--bd2)"),background:selVal===false?"rgba(220,38,38,0.08)":"transparent",fontSize:12,color:selVal===false?"#dc2626":"var(--t3)",userSelect:"none"}},
                      ce("input",{type:"radio",name:selKey+"_"+activeIdx,checked:selVal===false,onChange:function(){setSel(activeIdx,selKey,false);},style:{margin:0}}),
                      "Wyklucz"
                    )
                  )
                );
              } else {
                var soloWin=group.wins[0];var isChecked=selVal===true;
                return ce("label",{key:key,style:{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderBottom:isLast?"none":"1px solid var(--bd3)",cursor:"pointer",userSelect:"none"}},
                  ce("input",{type:"checkbox",checked:!!isChecked,onChange:function(ev){setSel(activeIdx,selKey,ev.target.checked);},style:{width:15,height:15,cursor:"pointer",flexShrink:0}}),
                  ce("span",{style:{fontSize:13,color:isChecked?"var(--t1)":"var(--t3)",fontWeight:isChecked?500:400}},soloWin.name||"Okno")
                );
              }
            })
          );
        })
      ),
      ce("div",{style:{padding:"14px 20px",borderTop:"1px solid var(--bd2)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:12}},
        ce("div",{style:{fontSize:13,color:"var(--t2)"}},
          "Suma: ",ce("span",{style:{fontWeight:700,color:"var(--gr)"}},roundTo10(calcTotal(activeSet.sel))+" z\u0142")
        ),
        ce("button",{onClick:function(){doGenerate(activeIdx);},style:{padding:"10px 22px",borderRadius:10,border:"none",background:"#c8956c",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}},"\uD83D\uDCCB Generuj PDF")
      )
    )
  );
}

export const CHANGELOG = [
    {
      version:"v1.2.0",
      date:"2026-04-23",
      notes:[
        "Roleta Shadow: opcja strona silnika (lewo/prawo) przy napędzie elektrycznym",
        "Roleta Shadow: opcja strona obsługi (lewo/prawo) przy wersji manualnej",
        "Poprawka: etykieta „TYP PRODUKTU” nie jest już przycinana przez zaokrąglenie ramki"
      ]
    },
    {
      version:"v1.1.0",
      date:"2026-04-22",
      notes:[
        "Nowy typ produktu: Roleta Shadow (grupy cenowe C/D/E, obciążniki, maskownice, napędy Somfy)",
        "Warianty wyceny — możliwość tworzenia wariantów okna (A/B/C…) do porównania opcji",
        "Wycena uproszczona: osobne PDF dla każdego wariantu",
        "Wycena uproszczona: liczba mnoga nazw produktów + info o marszczeniu i Flex/Wave",
        "Nagłówek karty produktu: kolor tła wyróżniający sekcje przy przewijaniu",
        "Roleta rzymska: napęd elektryczny — wybor producenta (Somfy / Premium Line) z cennikiem",
        "Szyna KS i Karnisz elektryczny: pole ilości sztuk (mnożnik ceny)",
        "Szyna KS i Karnisz elektryczny: pole głębokości łuku (widoczne w zamówieniu)",
        "Karnisz elektryczny: strona silnika (lewo/prawo) i typ (kurtyna/lewostronny/prawostronny)",
        "Roleta → przemianowana na Roleta rzymska",
        "Wykończenie: taśma obciążająca → Ołowianka",
        "Zamówienie tkanin: osobny PDF na każdego producenta, kolumna Kolor"
      ]
    },
    {
      version:"v1.0.0",
      date:"2026-04-16",
      notes:[
        "Pierwsza stabilna wersja produkcyjna",
        "Zarządzanie klientami, pokojami i oknami z zapisem w Supabase",
        "Cztery typy PDF: Wycena, Wycena uproszczona, Zamówienie tkaniny, Zlecenie do szwalni",
        "System prowizji (Polecenie %) skalujący ceny jednostkowe",
        "Obsługa żaluzji (aluminium, bamboo, basswood), rolet i zasłon",
        "Asystent AI do generowania wycen z opisu słownego",
        "Potwierdzenia przed usunięciem danych (klient, pokój, okno, produkt)",
        "Kategoria produktu „Inny” z polem nazwy i ceny ręcznej",
        "Cennik automatyki (Somfy / Premium Line) dla rolet"
      ]
    }
  ];
