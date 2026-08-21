import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi, stripeApi } from './lib/supabase.js';
import { signOut, getAccessToken } from './lib/auth.js';
import {
  FABRICS, getAllFabrics, getFabricEffective, IMG_OKNO, IMG_ROOM_GABINET, IMG_ROOM_KUCHNIA,
  IMG_ROOM_POKÓJ, IMG_ROOM_SALON, IMG_ROOM_SYPIALNIA, InlineEdit, JZ_LABELS,
  KARNISZ_SUPPLIERS, LOGO_SRC, PROD_TYPES, primeFabricOverrides, SELLER,
  buildFabricRows, buildKarniszRows, buildOfferDetailRows, buildRailsRows, buildSewingRows, calc,
  formatPLN, generateKarniszOrderPDF, generateKarniszOrderPDFFromRows, generateOfferPDF, generateOfferPDFFromRows, generateRailsInstallPDF, generateRailsInstallPDFFromRows,
  getPanelsForProd, mg, openPDFWindow, roundTo10
} from './constants/data.js';
import {
  buildSimplifiedRows, generateClientEmail, generateFabricOrderPDFFromRows, generateSewingOrderPDF, generateSimplifiedPDFFromRows
} from './lib/pdf.js';
import { ModalClient, ModalNewQuoteFromClient } from './components/ModalClient.jsx';
import { ModalSewing, ModalFabricOrder } from './components/ModalSewing.jsx';
import { ModalRoom, ModalWindow, ModalConfirmDelete, ModalConfirmRemove, ModalConfirmTypeChange, ModalSimple } from './components/ModalRoom.jsx';
import { ProdCard, Chip, Chips, Fld, Section, FabPicker } from './components/ProdCard.jsx';
import { ScreenMail } from './components/ScreenMail.jsx';
import { ScreenCRM, CRMKalendarz } from './components/ScreenCRM.jsx';
import { gcalWaitReady, gcalGetToken, gcalHasValidToken } from './lib/gcal.js';
import { ScreenTasks } from './components/ScreenTasks.jsx';
import { ScreenAdmin } from './components/ScreenAdmin.jsx';
import { ScreenInvoices } from './components/ScreenInvoices.jsx';
import { ScreenWarehouse } from './components/ScreenWarehouse.jsx';
import { ScreenContacts } from './components/ScreenContacts.jsx';
const ce = React.createElement;



export function App(p){
  var onLogout=p&&p.onLogout?p.onLogout:function(){};
  // Po powrocie z połączenia OAuth wróć na właściwą zakładkę. Sygnał trzymamy
  // w sessionStorage (markBrokerCallback), bo query string jest już wyczyszczony.
  // Wcześniej Google zawsze lądował na ekranie startowym i kalendarz zostawał
  // "niezalogowany" mimo udanego połączenia.
  var sMode=useState(function(){
    try {
      var landing = sessionStorage.getItem("pd_oauth_landing");
      if (landing) {
        sessionStorage.removeItem("pd_oauth_landing");
        if (landing === "google") return "kalendarz";
        if (landing === "microsoft") return "mail";
      }
    } catch (e) {}
    return "crm";
  }),appMode=sMode[0],setAppMode=sMode[1];
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
  var sIsDemo=useState(false),isDemo=sIsDemo[0],setIsDemo=sIsDemo[1];
  // Status subskrypcji tenanta (billing gate) — null dopoki nie wczytany z API (nie blokujemy przed pierwszym fetchem)
  var sBilling=useState(null),billing=sBilling[0],setBilling=sBilling[1];
  React.useEffect(function(){
    sbApi.getMyTenant().then(function(t){
      if(t&&t.config)setTenantConfig(t.config);
      if(t&&t.is_demo)setIsDemo(true);
      if(t)setBilling({status:t.subscription_status||"trialing",trialEndsAt:t.trial_ends_at||null});
    }).catch(function(){});
  },[]);
  var brandName=(tenantConfig&&tenantConfig.brand_name)||"Porter Design";
  var brandLogo=(tenantConfig&&tenantConfig.logo_url)||LOGO_SRC;
  // Motyw: jasny (domyslny) / ciemny / bezowy — zapisywany w localStorage, stosowany jako data-theme na <html>.
  // Inicjalizacja "bez mrugniecia" dzieje sie juz w index.html (inline script przed pierwszym malowaniem).
  var sTheme=useState(function(){
    try{var t=localStorage.getItem("pd_theme");if(t==="dark"||t==="beige")return t;}catch(e){}
    return "light";
  }),theme=sTheme[0],setThemeRaw=sTheme[1];
  function setTheme(t){
    setThemeRaw(t);
    try{
      if(t==="light"){localStorage.removeItem("pd_theme");document.documentElement.removeAttribute("data-theme");}
      else{localStorage.setItem("pd_theme",t);document.documentElement.setAttribute("data-theme",t);}
    }catch(e){}
  }
  // Niektore miejsca w kodzie doklejaja alpha jako sufiks hex (np. kolor+"22") do gradientow/cieni —
  // takich stringow nie da sie zbudowac z var(--x), wiec dla tych miejsc trzymamy realny hex zalezny od `theme`.
  var THEME_HEX=(theme==="dark")
    ?{violet:"#9d8cd6",gr:"#7fc4a1",red:"#e29a9a",teal:"#4a9691"}
    :(theme==="beige")
      ?{violet:"#8a5a34",gr:"#6b4a30",red:"#8a4a34",teal:"#7c6a52"}
      :{violet:"#7c3aed",gr:"#059669",red:"#dc2626",teal:"#0d9488"};
  // Blokada dostepu: trial wygasl bez konwersji na plan platny, albo subskrypcja anulowana.
  // Demo, super-admin oraz stan przed pierwszym fetchem (billing===null) nigdy nie sa blokowane.
  var trialExpired=!!(billing&&billing.status==="trialing"&&billing.trialEndsAt&&new Date(billing.trialEndsAt).getTime()<Date.now());
  var billingBlocked=!isDemo&&!isSuperAdmin&&!!billing&&(billing.status==="canceled"||trialExpired);
  // GCal token – żyje na poziomie App żeby przeżywać przełączanie zakładek
  var sGcalTok=useState(function(){
    try{var t=localStorage.getItem("pd_gcal_token");var e=localStorage.getItem("pd_gcal_token_exp");if(t&&e&&Date.now()<Number(e))return t;}catch(x){}return null;
  }),gcalToken=sGcalTok[0],setGcalToken=sGcalTok[1];
  var sGsiRdy=useState(false),gsiReady=sGsiRdy[0],setGsiReady=sGsiRdy[1];
  React.useEffect(function(){
    // Ładujemy GIS i — jeśli użytkownik wcześniej połączył konto — próbujemy
    // cichego odświeżenia. Nie pokazujemy UI ani account pickera; przy braku
    // aktywnej sesji Google pozostawiamy użytkownikowi zwykły przycisk logowania.
    gcalWaitReady().then(function(){
      setGsiReady(true);
      if(gcalHasValidToken())return null;
      // Hydratuj token gdy istnieje połączenie brokerowe (pd_oauth_google) —
      // gcalGetToken() odświeży go po stronie serwera z zapisanego refresh_tokena,
      // bez ekranu zgód. Wcześniej gate na samym pd_gcal_hint sprawiał, że po
      // świeżym połączeniu kalendarz zostawał niezalogowany aż do kolejnego
      // pełnego logowania z 3 ekranami zgód.
      try { return (localStorage.getItem("pd_oauth_google")==="1" || localStorage.getItem("pd_gcal_hint")) ? gcalGetToken() : null; }
      catch(e){ return null; }
    }).then(function(tok){
      if(tok)setGcalToken(tok);
    }).catch(function(){});
  },[]);
  var s1=useState("home"),screen=s1[0],setScreen=s1[1];
  var s2=useState([]),clients=s2[0],setClients=s2[1];
  var sDeals=useState([]),deals=sDeals[0],setDeals=sDeals[1];
  var s3=useState(null),curClientId=s3[0],setCurClientId=s3[1];
  var s4=useState(null),curRoomId=s4[0],setCurRoomId=s4[1];
  var s5=useState(null),curWin=s5[0],setCurWin=s5[1];
  var s6=useState(false),showClientModal=s6[0],setShowClientModal=s6[1];
  var s6b=useState(false),showNewQuoteModal=s6b[0],setShowNewQuoteModal=s6b[1];
  var s7=useState(false),showRoomModal=s7[0],setShowRoomModal=s7[1];
  var s8=useState(false),showWinModal=s8[0],setShowWinModal=s8[1];
  var s11b=useState(false),showFabricModal=s11b[0],setShowFabricModal=s11b[1];
  var s12=useState(false),showAIModal=s12[0],setShowAIModal=s12[1];
  var s13=useState(""),commissionInput=s13[0],setCommissionInput=s13[1];
  var s14b=useState(false),showEmailModal=s14b[0],setShowEmailModal=s14b[1];
  var s14m=useState(""),montazInput=s14m[0],setMontazInput=s14m[1];
  var s14mm=useState("percent"),montazMode=s14mm[0],setMontazMode=s14mm[1];
  var sDiscEn=useState(false),discountEnabled=sDiscEn[0],setDiscountEnabled=sDiscEn[1];
  var sDiscAmt=useState(""),discountInput=sDiscAmt[0],setDiscountInput=sDiscAmt[1];
  var sDiscMode=useState("amount"),discountMode=sDiscMode[0],setDiscountMode=sDiscMode[1];
  var sVisitFee=useState(false),visitFeeEnabled=sVisitFee[0],setVisitFeeEnabled=sVisitFee[1];
  var sVisitFeeAmt=useState(""),visitFeeInput=sVisitFeeAmt[0],setVisitFeeInput=sVisitFeeAmt[1];
  var sOfferRows=useState([]),offerPreviewRows=sOfferRows[0],setOfferPreviewRows=sOfferRows[1];
  var sOfferBase=useState([]),offerBaseRows=sOfferBase[0],setOfferBaseRows=sOfferBase[1];
  var sOfferNotes=useState(""),offerNotes=sOfferNotes[0],setOfferNotes=sOfferNotes[1];
  var sOfferValid=useState(""),offerValidUntil=sOfferValid[0],setOfferValidUntil=sOfferValid[1];
  var sKarniszRows=useState([]),karniszPreviewRows=sKarniszRows[0],setKarniszPreviewRows=sKarniszRows[1];
  var sRailsRows=useState([]),railsPreviewRows=sRailsRows[0],setRailsPreviewRows=sRailsRows[1];
  var sFabricRows=useState([]),fabricPreviewRows=sFabricRows[0],setFabricPreviewRows=sFabricRows[1];
  var sFabricHouse=useState("TRINITAS — ul. Składowa 9, 86-300 Grudziądz"),fabricSewingHouse=sFabricHouse[0],setFabricSewingHouse=sFabricHouse[1];
  var sFabricHouseC=useState(""),fabricSewingHouseCustom=sFabricHouseC[0],setFabricSewingHouseCustom=sFabricHouseC[1];
  var sFabricNotes=useState(""),fabricNotes=sFabricNotes[0],setFabricNotes=sFabricNotes[1];
  var sSimplGroups=useState([]),simplRoomGroups=sSimplGroups[0],setSimplRoomGroups=sSimplGroups[1];
  var sSimplSel=useState({}),simplSel=sSimplSel[0],setSimplSel=sSimplSel[1];
  var sSimplValid=useState(""),simplValidUntil=sSimplValid[0],setSimplValidUntil=sSimplValid[1];
  var sSimplRows=useState([]),simplEditableRows=sSimplRows[0],setSimplEditableRows=sSimplRows[1];
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
  function stripHtml(s){return String(s||"").replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();}
  function applyOfferComm(baseRows,commVal){
    return baseRows.map(function(r){
      var t=commVal>0?roundTo10(r.total*(1+commVal)):r.total;
      return mg(r,{total:t,cenaJedn:t,qtyUnit:r.qty+" "+r.unit,name:stripHtml(r.name)});
    });
  }
  function buildSimplifiedGroups(client){
    var result=[];
    var roomVariantMap={};var roomVariantOrder=[];var plainRooms=[];
    (client.rooms||[]).forEach(function(room){
      if(room.variantGroup){
        if(!roomVariantMap[room.variantGroup]){roomVariantMap[room.variantGroup]=[];roomVariantOrder.push(room.variantGroup);}
        roomVariantMap[room.variantGroup].push(room);
      } else {plainRooms.push(room);}
    });
    roomVariantOrder.forEach(function(grpId){
      var rooms=roomVariantMap[grpId].slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
      result.push({type:"roomVariant",grpId:grpId,rooms:rooms,baseName:rooms[0].variantBaseName||rooms[0].name});
    });
    plainRooms.forEach(function(room){
      var wins=room.windows||[];var groups={};var order=[];
      wins.forEach(function(w){var key=w.variantGroup||("solo_"+w.id);if(!groups[key]){groups[key]={isVariant:!!w.variantGroup,wins:[],baseName:w.variantBaseName||w.name};order.push(key);}groups[key].wins.push(w);});
      if(order.length)result.push({type:"room",room:room,groups:groups,order:order});
    });
    return result;
  }
  function makeSimplInitSel(rgs){
    var init={};
    rgs.forEach(function(item){
      if(item.type==="roomVariant"){init["rv__"+item.grpId]=item.rooms[0].id;}
      else{var room=item.room;item.order.forEach(function(key){var g=item.groups[key];if(!g.isVariant){init[room.id+"__"+key]=true;}else{var sorted=g.wins.slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});init[room.id+"__"+key]=sorted[0].id;}});}
    });
    return init;
  }
  function computeSimplSelection(rgs,sel){
    var selection=[];
    rgs.forEach(function(item){
      if(item.type==="roomVariant"){
        var selRoomId=sel["rv__"+item.grpId];if(!selRoomId)return;
        var chosenRoom=item.rooms.find(function(r){return r.id===selRoomId;});
        if(chosenRoom&&(chosenRoom.windows||[]).length){selection.push({room:chosenRoom,windows:chosenRoom.windows});}
      } else {
        var room=item.room;var chosenWins=[];
        item.order.forEach(function(key){
          var selKey=room.id+"__"+key;var selVal=sel[selKey];if(!selVal&&selVal!==true)return;
          var gWins=item.groups[key].wins;
          var chosen=!item.groups[key].isVariant?(selVal===true?gWins[0]:null):gWins.find(function(w){return w.id===selVal;});
          if(chosen)chosenWins.push(chosen);
        });
        if(chosenWins.length)selection.push({room:room,windows:chosenWins});
      }
    });
    return selection;
  }
  function hasWinData(w){return !!(w.products&&w.products.length>0);}
  function hasRoomData(r){return !!(r.windows&&r.windows.some(function(w){return hasWinData(w);}));}
  function hasClientData(cl){return !!(cl.rooms&&cl.rooms.some(function(r){return hasRoomData(r)||r.windows&&r.windows.length>0;}));}

  // Usuwa osierocone variantGroup z pokoi (pokój sam w grupie bez wariantu B)
  function migrateClients(cls){
    return (cls||[]).map(function(cl){
      var rooms=cl.rooms||[];
      var grpCount={};
      rooms.forEach(function(r){if(r.variantGroup)grpCount[r.variantGroup]=(grpCount[r.variantGroup]||0)+1;});
      var cleaned=rooms.map(function(r){
        if(r.variantGroup&&grpCount[r.variantGroup]<2){
          var c=Object.assign({},r);
          delete c.variantGroup;delete c.variantLabel;delete c.variantBaseName;
          return c;
        }
        return r;
      });
      var changed=cleaned.some(function(r,i){return r!==rooms[i];});
      return changed?Object.assign({},cl,{rooms:cleaned}):cl;
    });
  }

  // Załaduj klientów z Supabase przy starcie
  React.useEffect(function(){
    Promise.all([sbApi.getClients(),sbApi.getDeals()]).then(function(results){
      setClients(migrateClients(results[0]||[]));
      setDeals(results[1]||[]);
      setLoading(false);
    }).catch(function(e){
      console.error("Błąd ładowania:",e);
      setLoading(false);
    });
  },[]);

  // Załaduj nadpisania tkanin z Katalogu (Magazyn → Katalog) przy starcie.
  // Cicho pomijamy błąd — brak nadpisań = ceny bazowe z FABRICS, jak dotychczas.
  React.useEffect(function(){
    sbApi.getCatalogItems().then(primeFabricOverrides).catch(function(){});
  },[]);

  // Hydratuj lokalne pola Polecenie/Montaż z aktualnego klienta przy każdej zmianie klienta
  React.useEffect(function(){
    var cl=clients.find(function(c){return c.id===curClientId;});
    setCommissionInput(cl&&cl.commission!=null?String(cl.commission):"");
    setMontazInput(cl&&cl.install_fee!=null?String(cl.install_fee):"");
    setMontazMode(cl&&cl.install_fee_mode==="amount"?"amount":"percent");
  },[curClientId,clients.length]);

  // Przewiń na górę przy każdym otwarciu widoku okna
  React.useEffect(function(){
    if(screen==="detail")window.scrollTo({top:0,behavior:"instant"});
  },[screen,curWin&&curWin.id]);

  // Sync curWin do aktualnego okna w single-window mode (przez useEffect, nie podczas renderowania)
  React.useEffect(function(){
    if(screen==="windows"&&curClientId&&curRoomId){
      var cl=(clients||[]).find(function(c){return c.id===curClientId;});
      var room=cl?(cl.rooms||[]).find(function(r){return r.id===curRoomId;}):null;
      if(!room)return;
      var wins=room.windows||[];
      var isSingle=wins.length<=1;
      if(!isSingle)return;
      var sw=wins[0]||{id:"default_"+curRoomId,name:"",isDefault:true,products:[]};
      if(!curWin||curWin.id!==sw.id){
        setCurWin(JSON.parse(JSON.stringify(sw)));
      }
    }
  },[screen,curRoomId,curClientId]);

  // Przelicz edytowalne wiersze Wyceny Uproszczonej przy zmianie selekcji wariantów/prowizji
  React.useEffect(function(){
    if(!curClient)return;
    if(!simplRoomGroups.length)return;
    var c=(+commissionInput||0)/100;
    setSimplEditableRows(buildSimplifiedRows(curClient,computeSimplSelection(simplRoomGroups,simplSel),c));
  },[simplSel,simplRoomGroups,commissionInput,curClient]);

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
      if(newCl) saveClientToSb(id,{name:newCl.name,addr:newCl.addr,phone:newCl.phone||'',email:newCl.email||'',rooms:newCl.rooms,commission:newCl.commission||'',install_fee:newCl.install_fee||'',install_fee_mode:newCl.install_fee_mode||'percent'});
      return updated;
    });
  }

  function addClient(name,addr,phone,email,postal,city,contactId){
    sbApi.addClient(name,addr,phone,email,postal,city,contactId).then(function(data){
      var newCl=data&&data[0]?data[0]:{id:Date.now(),name:name,addr:addr,postal:postal||"",city:city||"",rooms:[{id:1,name:"Salon",img:IMG_ROOM_SALON,windows:[]}]};
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
      postal:cl.postal||"",
      city:cl.city||"",
      phone:cl.phone||"",
      email:cl.email||"",
      rooms:copiedRooms,
      status:"nowe",
      commission:cl.commission||null,
      install_fee:cl.install_fee||null,
      install_fee_mode:cl.install_fee_mode||"percent"
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

  function moveRoom(roomId,dir){
    updateClient(curClientId,function(cl){
      var rooms=(cl.rooms||[]).slice();
      var idx=rooms.findIndex(function(r){return r.id===roomId;});
      if(idx<0)return cl;
      var grp=rooms[idx].variantGroup;
      var blockIdxs=grp
        ?rooms.map(function(_,i){return i;}).filter(function(i){return rooms[i].variantGroup===grp;})
        :[idx];
      var blockStart=blockIdxs[0];var blockEnd=blockIdxs[blockIdxs.length-1];
      if(dir===-1&&blockStart===0)return cl;
      if(dir===1&&blockEnd===rooms.length-1)return cl;
      var before=rooms.slice(0,blockStart);
      var block=rooms.slice(blockStart,blockEnd+1);
      var after=rooms.slice(blockEnd+1);
      var pivot;
      if(dir===-1){pivot=before.pop();return mg(cl,{rooms:before.concat(block).concat([pivot]).concat(after)});}
      else{pivot=after.shift();return mg(cl,{rooms:before.concat([pivot]).concat(block).concat(after)});}
    });
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
    return ce("button",{onClick:onClick,style:{padding:"15px 24px",borderRadius:12,border:primary?"none":"1.5px solid var(--bd2)",background:primary?"var(--t1)":"transparent",color:primary?"var(--bg)":"var(--t1)",fontSize:15,fontWeight:primary?600:500,cursor:"pointer",letterSpacing:primary?"0.03em":"0",minHeight:52,transition:"all .15s"}},label);
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
    // Szybki skrót do podsumowania z dowolnego ekranu klienta (rooms/windows/detail),
    // zeby nie trzeba bylo wracac przez "rooms" zeby tam kliknac "Podsumowanie".
    // Na "detail" najpierw zapisujemy biezace okno (jak przycisk "Zapisz okno"),
    // zeby nie zgubic niezapisanych zmian w produktach.
    var quickSum=(curClient&&screen!=="home"&&screen!=="sum")
      ?ce("button",{key:"quicksum",onClick:function(){if(screen==="detail"&&curWin)saveWin();setScreen("sum");},
          style:{marginLeft:"auto",padding:"7px 16px",borderRadius:20,border:"none",background:"var(--violet)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 2px 8px var(--violet-l)"}
        },"\uD83D\uDCCB Podsumowanie \u2197")
      :null;
    return ce("div",{style:{display:"flex",flexWrap:"wrap",alignItems:"center",marginBottom:0,paddingBottom:0,borderBottom:"none"}},parts.concat([quickSum]));
  }

  // Wartość montażu (kwota lub % od bazy) — używana w kilku ekranach
  // (sum, offerPreview), więc musi być zdefiniowana poza blokami if/else if,
  // bo function declaration wewnątrz bloku jest block-scoped w strict mode
  // i nie jest widoczna w sąsiednich gałęziach.
  function installValue(base){
    var v=+montazInput||0;
    return montazMode==="amount"?roundTo10(v):(v>0?roundTo10(base*v/100):0);
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
      nowe:        {label:"Aktywne",     color:THEME_HEX.violet, bg:THEME_HEX.violet+"1F",  dot:THEME_HEX.violet},
      zrealizowane:{label:"Zrealizowane",color:THEME_HEX.gr,     bg:THEME_HEX.gr+"1F",      dot:THEME_HEX.gr},
      odrzucone:   {label:"Odrzucone",   color:THEME_HEX.red,    bg:THEME_HEX.red+"1A",     dot:THEME_HEX.red}
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
        background:"var(--bg2)",
        border:"1.5px solid var(--panel-border)",
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
          background:"var(--bg2)",
          border:"1.5px solid var(--panel-border)"
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
            style:{border:"none",background:"var(--bd3)",cursor:"pointer",fontSize:12,color:"var(--t3)",padding:"4px 6px",lineHeight:1,borderRadius:8,transition:"background 0.15s"}
          },"\uD83D\uDCCB"),
          ce("button",{
            onClick:function(ev){
              ev.stopPropagation();
              var doDelete=function(){sbApi.deleteClient(cl.id).then(function(){setClients(function(cs){return cs.filter(function(c){return c.id!==cl.id;});});}).catch(function(e){alert("B\u0142\u0105d usuwania: "+e.message);});};
              if(hasClientData(cl)){setConfirmDelete({type:"client",label:cl.name,onConfirm:doDelete});}else{doDelete();}
            },
            title:"Usu\u0144 klienta",
            style:{border:"none",background:"var(--red-l)",cursor:"pointer",fontSize:14,color:"var(--t3)",padding:"4px 6px",lineHeight:1,borderRadius:8,fontWeight:300,transition:"background 0.15s"}
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
      {sid:"nowe",       list:cl_nowe,  label:"Aktywne",      icon:"\u26A1",color:THEME_HEX.violet},
      {sid:"zrealizowane",list:cl_zreal,label:"Zrealizowane",  icon:"\u2714",color:THEME_HEX.gr},
      {sid:"odrzucone",  list:cl_odrz,  label:"Odrzucone",     icon:"\u2715",color:THEME_HEX.red}
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
        ce("div",{className:"holo-orb",style:{width:120,height:120,background:"var(--orb-1)",top:-30,right:60,animationDelay:"0s"}}),
        ce("div",{className:"holo-orb",style:{width:80,height:80,background:"var(--orb-2)",bottom:-10,right:20,animationDelay:"2.5s"}}),
        ce("div",{className:"holo-orb",style:{width:60,height:60,background:"var(--orb-3)",top:10,right:180,animationDelay:"1.5s"}}),
        // Content
        ce("div",{style:{position:"relative",zIndex:1}},
          ce("div",{style:{fontSize:11,color:"var(--hero-text-1)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}},dateStr),
          ce("div",{style:{fontSize:28,fontWeight:900,color:"#fff",lineHeight:1.15,marginBottom:4}},
            "Porter Design"
          ),
          ce("div",{style:{fontSize:13,color:"var(--hero-text-2)",marginBottom:20}},"Panel sprzeda\u017cy i wycen"),
          // Stat row
          ce("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
            ce("div",{style:{
              background:"rgba(255,255,255,0.12)",backdropFilter:"blur(12px)",
              border:"1px solid rgba(255,255,255,0.22)",borderRadius:14,
              padding:"12px 18px",minWidth:110
            }},
              ce("div",{style:{fontSize:10,color:"var(--hero-text-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}},"Łączna wartość"),
              ce("div",{style:{fontSize:22,fontWeight:800,color:"#fff"}},formatPLN(totalValue)+" z\u0142")
            ),
            ce("div",{style:{
              background:"var(--hero-stat-a-bg)",backdropFilter:"blur(12px)",
              border:"1px solid var(--hero-stat-a-border)",borderRadius:14,
              padding:"12px 18px",minWidth:110
            }},
              ce("div",{style:{fontSize:10,color:"var(--hero-text-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}},"Aktywne"),
              ce("div",{style:{fontSize:22,fontWeight:800,color:"var(--hero-stat-a-text)"}},(cl_nowe_all.length)+" klient\xf3w")
            ),
            ce("div",{style:{
              background:"var(--hero-stat-b-bg)",backdropFilter:"blur(12px)",
              border:"1px solid var(--hero-stat-b-border)",borderRadius:14,
              padding:"12px 18px",minWidth:110
            }},
              ce("div",{style:{fontSize:10,color:"var(--hero-text-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}},"Zrealizowane"),
              ce("div",{style:{fontSize:22,fontWeight:800,color:"var(--hero-stat-b-text)"}},(cl_zreal_all.length)+" klient\xf3w")
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
        ),
        ce("div",{
          onClick:function(){setShowNewQuoteModal(true);},
          style:{padding:"11px 20px",borderRadius:14,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:7,border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t1)"}
        },
          ce("span",{style:{fontSize:16,lineHeight:1}},"+"),
          ce("span",null,"Nowa wycena")
        )
      ),

      // ── Demo banner ──
      isDemo?ce("div",{style:{border:"1.5px solid var(--violet)",background:"var(--violet-l)",backdropFilter:"blur(10px)",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,color:"var(--violet)",marginBottom:14}},
        ce("div",{style:{display:"flex",alignItems:"center",gap:10}},
          ce("span",{style:{fontSize:20}},"\uD83E\uDDEA"),
          ce("span",{style:{fontSize:13,fontWeight:600}},"Tryb demo \u2014 dane przyk\u0142adowe. Wysy\u0142ka do KSeF i maile s\u0105 symulowane.")
        ),
        ce("a",{href:"/register",style:{fontSize:13,fontWeight:700,color:"var(--violet)",textDecoration:"underline",whiteSpace:"nowrap"}},"Za\u0142\u00f3\u017c konto")
      ):null,

      // ── Offline banner ──
      (function(){
        var count=0;
        try{var stored=localStorage.getItem("pd_offline_quotes");if(stored)count=JSON.parse(stored).length;}catch(e){}
        if(count===0)return null;
        return ce("div",{onClick:function(){setShowOfflineModal(true);},
          style:{border:"1.5px solid var(--amber)",background:"var(--amber-l)",backdropFilter:"blur(10px)",borderRadius:14,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,color:"var(--amber)",marginBottom:14}},
          ce("div",{style:{display:"flex",alignItems:"center",gap:10}},
            ce("span",{style:{fontSize:20}},"\uD83D\uDCBE"),
            ce("span",{style:{fontSize:13,fontWeight:600}},"Wyceny offline do synchronizacji")
          ),
          ce("span",{style:{background:"var(--amber)",color:"var(--bg)",borderRadius:20,padding:"3px 11px",fontSize:12,fontWeight:700}},count)
        );
      })(),

      // ── Tabs ──
      !q?ce("div",{style:{display:"flex",gap:6,marginBottom:16,background:"var(--panel-bg)",backdropFilter:"blur(12px)",borderRadius:16,padding:"5px",border:"1.5px solid var(--panel-border)"}},
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
    var roomGroupSizes={};rooms.forEach(function(r){if(r.variantGroup){roomGroupSizes[r.variantGroup]=(roomGroupSizes[r.variantGroup]||0)+1;}});
    var roomTiles=rooms.map(function(r,roomIdx){
      var rTotal=rt(r);
      var roomsLen=rooms.length;
      return ce("div",{key:r.id,
        style:{background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:14,padding:"18px 16px",display:"flex",alignItems:"center",gap:16,boxShadow:"0 1px 6px rgba(0,0,0,0.04)",position:"relative"}},
        ce("div",{style:{display:"flex",flexDirection:"column",gap:3,alignSelf:"center",flexShrink:0}},
          ce("button",{
            onClick:function(ev){ev.stopPropagation();moveRoom(r.id,-1);},
            disabled:roomIdx===0,
            title:"Przesuń w górę",
            style:{border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:roomIdx===0?"not-allowed":"pointer",fontSize:11,color:roomIdx===0?"var(--t3)":"var(--t1)",width:24,height:24,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,opacity:roomIdx===0?0.35:0.7}
          },"▲"),
          ce("button",{
            onClick:function(ev){ev.stopPropagation();moveRoom(r.id,1);},
            disabled:roomIdx===roomsLen-1,
            title:"Przesuń w dół",
            style:{border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:roomIdx===roomsLen-1?"not-allowed":"pointer",fontSize:11,color:roomIdx===roomsLen-1?"var(--t3)":"var(--t1)",width:24,height:24,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,opacity:roomIdx===roomsLen-1?0.35:0.7}
          },"▼")
        ),
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
            (r.variantGroup&&roomGroupSizes[r.variantGroup]>1)?ce("span",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.06em",background:"var(--grl)",color:"var(--gr)",borderRadius:6,padding:"2px 4px 2px 7px",verticalAlign:"middle",display:"inline-flex",alignItems:"center",gap:2}},"Wariant ",ce("input",{value:r.variantLabel||"",onClick:function(ev){ev.stopPropagation();},onChange:function(ev){ev.stopPropagation();var v=(ev.target.value||"").toUpperCase().slice(0,1);if(!v)return;updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).map(function(x){return x.id===r.id?mg(x,{variantLabel:v,name:roomBaseName(x)}):x;})});});},style:{width:14,padding:0,border:"none",background:"transparent",color:"var(--gr)",fontWeight:700,fontSize:10,letterSpacing:"0.06em",outline:"none",textTransform:"uppercase"}})):null
          ),
          ce("div",{onClick:function(){openRoom(r.id);},style:{fontSize:11,color:"var(--t3)",cursor:"pointer"}},(r.windows||[]).length+" okien")
        ),
        rTotal?ce("span",{onClick:function(){openRoom(r.id);},style:{fontSize:12,fontWeight:600,color:"var(--gr)",cursor:"pointer"}},roundTo10(rTotal)+" z\u0142"):null,
        ce("span",{onClick:function(){openRoom(r.id);},style:{color:"var(--t3)",fontSize:13,cursor:"pointer"}},"\u203a"),
        ce("div",{style:{position:"absolute",top:8,right:8,display:"flex",flexDirection:"row",alignItems:"center",gap:6}},
          ce("button",{
            onClick:function(ev){ev.stopPropagation();duplicateRoomAsVariant(r);},
            title:"Utw\u00f3rz wariant tego pomieszczenia",
            style:{border:"1px solid var(--gr)",background:"var(--grl)",cursor:"pointer",fontSize:11,color:"var(--gr)",padding:"4px 8px",borderRadius:6,fontWeight:600,whiteSpace:"nowrap"}
          },"Wariant"),
          ce("button",{
            onClick:function(ev){
              ev.stopPropagation();
              (function(srcRoom){
                updateClient(curClientId,function(cl){
                  var copy=JSON.parse(JSON.stringify(srcRoom));
                  copy.id=Date.now()+"_"+Math.random().toString(36).slice(2,7);
                  copy.variantGroup=undefined;copy.variantLabel=undefined;copy.variantBaseName=undefined;
                  copy.name=(srcRoom.name||"Pomieszczenie")+" (kopia)";
                  copy.windows=(copy.windows||[]).map(function(w){
                    return mg(w,{
                      id:Date.now()+"_"+Math.random().toString(36).slice(2,7),
                      products:(w.products||[]).map(function(p){return mg(p,{id:Date.now()+"_"+Math.random().toString(36).slice(2,6)});})
                    });
                  });
                  return mg(cl,{rooms:(cl.rooms||[]).concat([copy])});
                });
              }(r));
            },
            title:"Kopiuj pomieszczenie",
            style:{border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:"pointer",fontSize:11,color:"var(--t2)",padding:"4px 8px",borderRadius:6,fontWeight:500,whiteSpace:"nowrap"}
          },"Kopiuj"),
          ce("button",{
            onClick:function(ev){
              ev.stopPropagation();
              var doDelete=function(){updateClient(curClientId,function(cl){return mg(cl,{rooms:(cl.rooms||[]).filter(function(x){return x.id!==r.id;})});});};
              if(hasRoomData(r)){setConfirmDelete({type:"room",label:r.name,onConfirm:doDelete});}else{doDelete();}
            },
            title:"Usu\u0144 pomieszczenie",
            style:{border:"none",background:"none",cursor:"pointer",fontSize:18,color:"var(--t3)",padding:"4px 6px",lineHeight:1,opacity:0.5}
          },"\u00d7")
        )
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
      // sync sw into curWin handled by useEffect below (not during render)
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
              onDuplicate:function(){setCurWin(function(w){var prods=w.products||[];var src=prods[i];var copy=mg(src,{id:Date.now()});var next=prods.slice(0,i+1).concat([copy]).concat(prods.slice(i+1));return mg(w,{products:next});});},
              onMoveUp:i>0?function(){moveProd(i,-1);}:undefined,
              onMoveDown:i<swProducts.length-1?function(){moveProd(i,1);}:undefined
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
          style:{padding:"12px 18px",borderRadius:10,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:8,width:"100%"}
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
        var variantBadge=isVariant?ce("span",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.06em",background:"var(--violet-l)",color:THEME_HEX.violet,borderRadius:6,padding:"2px 7px",marginLeft:6,verticalAlign:"middle"}},"Wariant "+w.variantLabel):null;
        return ce("div",{key:w.id,
          style:{display:"flex",alignItems:"center",gap:14,padding:"16px 14px",borderBottom:"1px solid var(--bd3)",borderRadius:0,position:"relative",background:isVariant?"var(--bd3)":"transparent"}},
          ce("div",{onClick:function(){openWin(w);},style:{display:"flex",alignItems:"center",gap:14,flex:1,cursor:"pointer",minWidth:0}},
            ce("img",{src:IMG_OKNO,style:{width:80,height:80,objectFit:"cover",borderRadius:10,flexShrink:0}}),
            ce("div",{style:{flex:1,minWidth:0}},
              ce("div",{style:{fontSize:15,fontWeight:600,color:"var(--t1)",marginBottom:3,display:"flex",alignItems:"center",flexWrap:"wrap"}},
                ce(InlineEdit,{
                  value:w.name||"Okno",
                  inputStyle:{fontSize:15,fontWeight:600},
                  onSave:function(v){
                    updateClient(curClientId,function(cl){
                      return mg(cl,{rooms:(cl.rooms||[]).map(function(r){
                        if(r.id!==curRoomId)return r;
                        return mg(r,{windows:(r.windows||[]).map(function(x){
                          return x.id===w.id?mg(x,{name:v,variantBaseName:x.variantGroup?v:x.variantBaseName}):x;
                        })});
                      })});
                    });
                  }
                }),
                variantBadge
              ),
              ce("div",{style:{fontSize:12,color:"var(--t3)"}},labels||"\u2014"),
              t?ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--gr)",marginTop:4}},roundTo10(t)+" z\u0142"):null
            ),
            ce("span",{style:{color:"var(--t3)",fontSize:13}},"\u203a")
          ),
          ce("div",{style:{display:"flex",flexDirection:"column",gap:6,flexShrink:0}},
            ce("button",{
              onClick:function(ev){ev.stopPropagation();duplicateWinAsVariant(w);},
              title:"Utw\u00f3rz wariant tego okna",
              style:{border:"1px solid "+THEME_HEX.violet,background:"var(--violet-l)",cursor:"pointer",fontSize:11,color:THEME_HEX.violet,padding:"5px 9px",borderRadius:7,fontWeight:600,whiteSpace:"nowrap"}
            },"\u2B6F Wariant"),
            hasCurtain?ce("button",{
              onClick:function(ev){ev.stopPropagation();duplicateWinAsVariantMarszczenie(w);},
              title:"Wariant z innym procentem marszczenia",
              style:{border:"1px solid "+THEME_HEX.teal,background:"var(--teal-l)",cursor:"pointer",fontSize:11,color:THEME_HEX.teal,padding:"5px 9px",borderRadius:7,fontWeight:600,whiteSpace:"nowrap"}
            },"\uD83E\uDDF5 Marszczenie"):null,
            ce("button",{
              onClick:function(ev){
                ev.stopPropagation();
                (function(srcWin){
                  updateClient(curClientId,function(cl){
                    var newRooms=(cl.rooms||[]).map(function(r){
                      if(r.id!==curRoomId)return r;
                      var copy=JSON.parse(JSON.stringify(srcWin));
                      copy.id=Date.now()+"_"+Math.random().toString(36).slice(2,7);
                      copy.variantGroup=undefined;copy.variantLabel=undefined;copy.variantBaseName=undefined;
                      copy.name=(srcWin.name||"Okno")+" (kopia)";
                      copy.products=(copy.products||[]).map(function(p){return mg(p,{id:Date.now()+"_"+Math.random().toString(36).slice(2,6)});});
                      return mg(r,{windows:(r.windows||[]).concat([copy])});
                    });
                    return mg(cl,{rooms:newRooms});
                  });
                }(w));
              },
              title:"Kopiuj okno",
              style:{border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:"pointer",fontSize:11,color:"var(--t2)",padding:"5px 9px",borderRadius:7,fontWeight:500,whiteSpace:"nowrap",marginTop:8}
            },"\uD83D\uDCC4 Kopiuj"),
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
    function openOfferPreview(){
      var baseRows=buildOfferDetailRows(curClient);
      if(!baseRows.length){alert("Brak wycenionych produktów.");return;}
      setOfferBaseRows(baseRows);
      setOfferPreviewRows(applyOfferComm(baseRows,comm));
      setOfferNotes("");
      setOfferValidUntil(new Date(Date.now()+30*24*3600*1000).toISOString().slice(0,10));
      setVisitFeeEnabled(false);
      setVisitFeeInput("");
      setScreen("offerPreview");
    }
    function openKarniszPreview(){
      var rows=buildKarniszRows(curClient);
      if(!rows.length){alert("Brak karniszów / szyn do zamówienia.");return;}
      setKarniszPreviewRows(rows.map(function(r){return mg(r,{roomWin:r.room+" / "+r.win,supplier:r.supplier||"marcin_dekor"});}));
      setScreen("karniszPreview");
    }
    function openRailsPreview(){
      var rows=buildRailsRows(curClient);
      if(!rows.length){alert("Brak szyn / karniszów do wydruku.");return;}
      setRailsPreviewRows(rows);
      setScreen("railsPreview");
    }
    function openFabricPreview(){
      var rows=buildFabricRows(curClient).filter(function(r){return r.metry&&r.metry>0;});
      if(!rows.length){alert("Brak tkanin do zamówienia (brak metrażu lub producenta).");return;}
      var prepped=rows.map(function(r){
        var prod=r.prod||"Inny";
        if(prod==="-")prod="Bez producenta";
        return mg(r,{prod:prod,roomWin:r.room+" / "+r.win});
      });
      setFabricPreviewRows(prepped);
      setFabricNotes("");
      setScreen("fabricPreview");
    }
    function openSimplifiedPreview(){
      var groups=buildSimplifiedGroups(curClient);
      if(!groups.length){alert("Brak pomieszczeń z produktami.");return;}
      var initSel=makeSimplInitSel(groups);
      setSimplRoomGroups(groups);
      setSimplSel(initSel);
      setSimplValidUntil("");
      setSimplEditableRows(buildSimplifiedRows(curClient,computeSimplSelection(groups,initSel),comm));
      setScreen("simplifiedPreview");
    }
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
          ce("div",{key:"vg_"+gid,style:{border:"2px solid "+THEME_HEX.violet,borderRadius:14,marginBottom:8,overflow:"hidden"}},
            ce("div",{style:{background:"var(--violet-l)",padding:"8px 14px",fontSize:11,fontWeight:700,color:THEME_HEX.violet,letterSpacing:"0.07em",textTransform:"uppercase"}},
              "\uD83D\uDD00 Warianty \u2014 "+baseName
            ),
            group.map(function(w,gi){
              var t=wt(w);
              var desc=(w.products||[]).map(function(p){var l=(PROD_TYPES.find(function(pt){return pt.id===p.type;})||{label:p.type}).label;return p.fabName?l+" ("+p.fabName+")":l;}).join(", ");
              return ce("div",{key:w.id,style:{padding:"12px 14px",borderBottom:gi<group.length-1?"1px solid var(--bd2)":"none",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,background:gi%2===0?"var(--bg2)":"var(--bg3)"}},
                ce("div",{style:{flex:1}},
                  ce("div",{style:{fontSize:13,fontWeight:700,color:THEME_HEX.violet,marginBottom:2}},"Wariant "+w.variantLabel),
                  ce("div",{style:{fontSize:11,color:"var(--t3)"}},desc||"\u2014")
                ),
                ce("div",{style:{fontSize:15,fontWeight:700,color:THEME_HEX.violet,whiteSpace:"nowrap"}},withComm(t)+" z\u0142")
              );
            })
          )
        );
      });

      var _roomLabel=(function(){var _gs={};(curClient.rooms||[]).forEach(function(x){if(x.variantGroup){_gs[x.variantGroup]=(_gs[x.variantGroup]||0)+1;}});return roomBaseName(r)+((r.variantGroup&&_gs[r.variantGroup]>1)?" \u2014 Wariant "+r.variantLabel:"")+(hasVariants?" \u2014 od "+withComm(roomBaseTotal)+" z\u0142":" \u2014 "+withComm(roomBaseTotal)+" z\u0142");}());
      var _roomHeader=ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:10}},_roomLabel);
      return ce.apply(null,["div",{key:r.id,style:{marginBottom:20}},_roomHeader].concat(rows));
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
    var sumBaseTotal=roundTo10(withComm(clientTotalWithVariants(curClient))+installValue(withComm(clientTotalWithVariants(curClient))));
    var sumDiscountVal=(discountEnabled&&(+discountInput)>0)?(discountMode==="amount"?roundTo10(+discountInput):roundTo10(sumBaseTotal*(+discountInput)/100)):0;
    var sumFinalTotal=Math.max(0,roundTo10(sumBaseTotal-sumDiscountVal));

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
        ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",flex:1}},"\uD83D\uDD28 Montaż ("+(montazMode==="amount"?"kwota":"%")+")"),
        ce("select",{value:montazMode,onChange:function(ev){var m=ev.target.value;setMontazMode(m);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{install_fee_mode:m});});},style:{padding:"8px 10px",border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}},ce("option",{value:"percent"},"%"),ce("option",{value:"amount"},"zł")),
        ce("input",{type:"text",inputMode:"decimal",value:montazInput,onChange:function(ev){var v=ev.target.value;setMontazInput(v);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{install_fee:v,install_fee_mode:montazMode});});},placeholder:montazMode==="amount"?"np. 1200":"np. 10",style:{width:90,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}),
        montazInput?ce("span",{style:{fontSize:13,color:"var(--gr)",fontWeight:600}},"+"+montazInput+(montazMode==="amount"?" zł":"%")):null,
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,marginTop:0,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}},
        ce("label",{style:{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1}},
          ce("input",{type:"checkbox",checked:discountEnabled,onChange:function(ev){setDiscountEnabled(ev.target.checked);},style:{width:16,height:16,cursor:"pointer"}}),
          ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)"}},"\uD83C\uDFF7\uFE0F Rabat")
        ),
        discountEnabled?ce("select",{value:discountMode,onChange:function(ev){setDiscountMode(ev.target.value);},style:{padding:"8px 10px",border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}},ce("option",{value:"amount"},"zł"),ce("option",{value:"percent"},"%")):null,
        discountEnabled?ce("input",{type:"text",inputMode:"decimal",value:discountInput,onChange:function(ev){setDiscountInput(ev.target.value);},placeholder:discountMode==="amount"?"np. 300":"np. 10",style:{width:90,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}):null,
        discountEnabled&&discountInput?ce("span",{style:{fontSize:13,color:"var(--gr)",fontWeight:600}},"\u2212"+discountInput+(discountMode==="amount"?" zł":"%")):null
      ),
      ce("div",{style:{background:"var(--t1)",borderRadius:14,padding:"20px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,marginTop:0}},
        ce("span",{style:{fontSize:14,color:"var(--bg)",opacity:0.75,letterSpacing:"0.04em"}},
          (hasAnyVariants
            ?(commissionInput&&(+commissionInput)>0?"\u0141\u0105cznie od (Wariant A) + "+commissionInput+"% polecenie":"\u0141\u0105cznie od (Wariant A)")
            :(commissionInput&&(+commissionInput)>0?"\u0141\u0105cznie + "+commissionInput+"% polecenie":"\u0141\u0105cznie ca\u0142a wizyta"))
          +(sumDiscountVal>0?" \u2212 rabat":"")
        ),
        ce("span",{style:{fontSize:20,fontWeight:700,color:"var(--bg)"}},sumFinalTotal+" z\u0142")
      ),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        Btn("\u2190 Edytuj",function(){setScreen("rooms");},false),
        ce("button",{onClick:function(){openOfferPreview();},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--gr)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDCC4 Wycena szczegółowa"),
        ce("button",{onClick:function(){openSimplifiedPreview();},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#c8956c",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDCCB Wycena Uproszczona"),
        ce("button",{onClick:function(){setShowEmailModal(true);},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#4a7c8a",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\u2709\uFE0F Mail do klienta"),
        ce("button",{onClick:function(){openFabricPreview();},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--t2)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83E\uDDF5 Zamówienie tkaniny"),
        ce("button",{onClick:function(){openKarniszPreview();},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#5a7a9a",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83E\uDE9D Zamówienie karniszy"),
        ce("button",{onClick:function(){openRailsPreview();},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#6b5b8a",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDD29 Szyny do monta\u017cu"),
        ce("button",{onClick:function(){setScreen("sewingPreview");},style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\u2702\uFE0F Zlecenie szycia")
      )
    );
  }
  else if(screen==="offerPreview"&&curClient){
    var previewTotal=offerPreviewRows.reduce(function(a,r){return a+(+r.total||0);},0);
    var previewMontazPct=(+montazInput||0)/100;
    var previewMontazVal=installValue(previewTotal);
    var previewMontazParam=montazMode==="amount"?{mode:"amount",value:previewMontazVal}:{mode:"percent",value:previewMontazPct};
    var previewDiscountVal=(discountEnabled&&(+discountInput)>0)?(discountMode==="amount"?roundTo10(+discountInput):roundTo10(previewTotal*(+discountInput)/100)):0;
    var previewVisitFeeVal=(visitFeeEnabled&&(+visitFeeInput)>0)?roundTo10(+visitFeeInput):0;
    var previewFinalTotal=Math.max(0,roundTo10(previewTotal+previewMontazVal-previewDiscountVal-previewVisitFeeVal));
    function recalcOfferPricesFromCommission(){
      var c=(+commissionInput||0)/100;
      setOfferPreviewRows(applyOfferComm(offerBaseRows,c));
    }
    function setRowField(i,key,v){
      setOfferPreviewRows(function(prev){return prev.map(function(x,xi){
        if(xi!==i)return x;
        var patch={};patch[key]=v;
        return mg(x,patch);
      });});
    }
    function rowFieldInput(i,key,placeholder,width){
      return ce("input",{type:"text",value:offerPreviewRows[i][key]||"",onChange:function(ev){setRowField(i,key,ev.target.value);},placeholder:placeholder,style:{width:width,padding:"7px 9px",fontSize:12,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}});
    }

    content=ce(Fragment,null,
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:14}},"\uD83D\uDCC4 Wycena szczegółowa \u2014 podgląd przed wygenerowaniem"),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"12px 16px",marginBottom:12,fontSize:12,color:"var(--t3)",lineHeight:1.5}},
        "Każde pole poniżej jest edytowalne \u2014 ilość, produkt, model szycia, tkanina/kolor, producent, szeroko\u015b\u0107, wysoko\u015b\u0107, podzia\u0142, cena, uwagi, ważność oferty i monta\u017c. Dopiero st\u0105d generujesz PDF."
      ),
      offerPreviewRows.length===0
        ?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"12px 0"}},"Brak pozycji do wyceny.")
        :offerPreviewRows.map(function(r,i){
          var prevRoom=i>0?offerPreviewRows[i-1].room:null;
          var isNewRoom=r.room!==prevRoom;
          var roomTotal=isNewRoom?offerPreviewRows.reduce(function(a,x){return x.room===r.room?a+(+x.total||0):a;},0):0;
          return ce(Fragment,{key:i},
            isNewRoom?ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",fontSize:13,fontWeight:700,color:"var(--t1)",margin:i===0?"0 0 6px":"18px 0 6px",paddingBottom:4,borderBottom:"1.5px solid var(--bd2)"}},
              ce("span",null,"\uD83C\uDFE0 "+(r.room||"Inne")),
              ce("span",{style:{fontSize:12,fontWeight:600,color:"var(--t3)"}},roundTo10(roomTotal)+" zł")
            ):null,
          ce("div",{style:{padding:"12px 14px",background:"var(--bg2)",borderRadius:12,marginBottom:8,border:"1px solid var(--bd3)"}},
            ce("div",{style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}},
              ce("input",{type:"text",value:r.qtyUnit,onChange:function(ev){
                var v=ev.target.value;
                setOfferPreviewRows(function(prev){return prev.map(function(x,xi){return xi===i?mg(x,{qtyUnit:v}):x;});});
              },placeholder:"Ilość",style:{width:76,padding:"8px 10px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}}),
              ce("input",{type:"text",value:r.name,onChange:function(ev){
                var v=ev.target.value;
                setOfferPreviewRows(function(prev){return prev.map(function(x,xi){return xi===i?mg(x,{name:v}):x;});});
              },placeholder:"Produkt",style:{flex:1,minWidth:180,padding:"8px 10px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}}),
              ce("div",{style:{display:"flex",alignItems:"center",gap:6,flexShrink:0}},
                ce("input",{type:"text",inputMode:"decimal",value:r.total,onChange:function(ev){
                  var v=ev.target.value;
                  setOfferPreviewRows(function(prev){return prev.map(function(x,xi){return xi===i?mg(x,{total:v,cenaJedn:v}):x;});});
                },style:{width:110,padding:"8px 10px",fontSize:14,fontWeight:600,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--gr)",textAlign:"right"}}),
                ce("span",{style:{fontSize:12,color:"var(--t3)"}},"zł")
              )
            ),
            ce("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}},
              rowFieldInput(i,"modelSzycia","Model szycia",120),
              rowFieldInput(i,"tkaninaKolor","Tkanina / Kolor / Osprzęt",190),
              rowFieldInput(i,"producent","Producent",110),
              rowFieldInput(i,"szerokosc","Szerokość",90),
              rowFieldInput(i,"wysokosc","Wysokość",90),
              rowFieldInput(i,"podzial","Podział / Sterowanie",140)
            )
          )
          );
        }),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,marginTop:16}},
        ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",marginBottom:8}},"\uD83D\uDCDD Uwagi do wyceny"),
        ce("textarea",{value:offerNotes,onChange:function(ev){setOfferNotes(ev.target.value);},placeholder:"np. cena obejmuje montaż w ciągu 4 tygodni od wpłaty zaliczki...",rows:3,style:{width:"100%",padding:"10px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",resize:"vertical",fontFamily:"inherit"}})
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}},
        ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",flex:1}},"\uD83D\uDCC5 Ważne do"),
        ce("input",{type:"date",value:offerValidUntil,onChange:function(ev){setOfferValidUntil(ev.target.value);},style:{padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}})
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}},
        ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",flex:1}},"\uD83E\uDD1D Prowizja / polecenie (%)"),
        ce("input",{type:"text",inputMode:"numeric",min:0,max:100,step:1,value:commissionInput,onChange:function(ev){var v=ev.target.value;setCommissionInput(v);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{commission:v});});},placeholder:"np. 7",style:{width:80,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}),
        ce("button",{onClick:recalcOfferPricesFromCommission,style:{padding:"8px 14px",borderRadius:8,border:"1.5px solid var(--bd2)",background:"var(--bg)",color:"var(--t1)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}},"\uD83D\uDD04 Przelicz ceny")
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}},
        ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",flex:1}},"\uD83D\uDD28 Montaż ("+(montazMode==="amount"?"kwota":"%")+")"),
        ce("select",{value:montazMode,onChange:function(ev){var m=ev.target.value;setMontazMode(m);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{install_fee_mode:m});});},style:{padding:"8px 10px",border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}},ce("option",{value:"percent"},"%"),ce("option",{value:"amount"},"zł")),
        ce("input",{type:"text",inputMode:"decimal",value:montazInput,onChange:function(ev){var v=ev.target.value;setMontazInput(v);if(curClientId)updateClient(curClientId,function(cl){return mg(cl,{install_fee:v,install_fee_mode:montazMode});});},placeholder:montazMode==="amount"?"np. 1200":"np. 10",style:{width:90,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}),
        montazInput?ce("span",{style:{fontSize:13,color:"var(--gr)",fontWeight:600}},"+"+montazInput+(montazMode==="amount"?" zł":"%")):null,
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}},
        ce("label",{style:{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1}},
          ce("input",{type:"checkbox",checked:visitFeeEnabled,onChange:function(ev){setVisitFeeEnabled(ev.target.checked);},style:{width:16,height:16,cursor:"pointer"}}),
          ce("span",{style:{fontSize:13,fontWeight:600,color:"var(--t2)"}},"\uD83D\uDE97 Koszt wizyty")
        ),
        visitFeeEnabled?ce("input",{type:"text",inputMode:"decimal",value:visitFeeInput,onChange:function(ev){setVisitFeeInput(ev.target.value);},placeholder:"kwota",style:{width:100,padding:"8px 12px",fontSize:14,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right"}}):null,
        visitFeeEnabled?ce("span",{style:{fontSize:12,color:"var(--t3)"}},"zł"):null,
        visitFeeEnabled?ce("span",{style:{fontSize:12,color:"var(--t3)",flexBasis:"100%"}},"zostanie odliczony od kosztu całkowitego"):null
      ),
      ce("div",{style:{background:"var(--t1)",borderRadius:14,padding:"20px 22px",display:"flex",flexDirection:"column",gap:6,marginBottom:16}},
        previewMontazVal>0?ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--bg)",opacity:0.7}},ce("span",null,"Bez montażu"),ce("span",null,roundTo10(previewTotal)+" zł")):null,
        previewDiscountVal>0?ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--bg)",opacity:0.7}},ce("span",null,"Przyznany rabat"),ce("span",null,"\u2212"+previewDiscountVal+" zł")):null,
        previewVisitFeeVal>0?ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--bg)",opacity:0.7}},ce("span",null,"Koszt wizyty (odliczony)"),ce("span",null,"\u2212"+previewVisitFeeVal+" zł")):null,
        ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
          ce("span",{style:{fontSize:14,color:"var(--bg)",opacity:0.75,letterSpacing:"0.04em"}},previewMontazVal>0?"\u0141\u0105cznie z montażem":"\u0141\u0105cznie"),
          ce("span",{style:{fontSize:20,fontWeight:700,color:"var(--bg)"}},previewFinalTotal+" zł")
        )
      ),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        Btn("\u2190 Wstecz",function(){setScreen("sum");},false),
        ce("button",{onClick:function(){
          var vu=offerValidUntil?new Date(offerValidUntil):null;
          generateOfferPDFFromRows(curClient,offerPreviewRows,previewMontazParam,offerNotes,vu,previewDiscountVal,previewVisitFeeVal);
          setScreen("sum");
        },style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--gr)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDDA8\uFE0F Generuj PDF")
      )
    );
  }
  else if(screen==="karniszPreview"&&curClient){
    var karniszTotal=karniszPreviewRows.reduce(function(a,r){return a+(+r.total||0);},0);
    function setKarniszField(i,key,v){
      setKarniszPreviewRows(function(prev){return prev.map(function(x,xi){
        if(xi!==i)return x;
        var patch={};patch[key]=v;
        return mg(x,patch);
      });});
    }
    function karniszFieldInput(i,key,placeholder,width){
      return ce("input",{type:"text",value:karniszPreviewRows[i][key]||"",onChange:function(ev){setKarniszField(i,key,ev.target.value);},placeholder:placeholder,style:{width:width,padding:"7px 9px",fontSize:12,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}});
    }

    content=ce(Fragment,null,
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:14}},"\uD83E\uDE9D Zamówienie karniszy / szyn \u2014 podgląd przed wygenerowaniem"),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"12px 16px",marginBottom:12,fontSize:12,color:"var(--t3)",lineHeight:1.5}},
        "Każde pole poniżej jest edytowalne, w tym dostawca \u2014 dokument zostanie pogrupowany wg wybranych dostawców. Dopiero stąd generujesz PDF."
      ),
      karniszPreviewRows.length===0
        ?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"12px 0"}},"Brak pozycji do zamówienia.")
        :karniszPreviewRows.map(function(r,i){
          return ce("div",{key:i,style:{padding:"12px 14px",background:"var(--bg2)",borderRadius:12,marginBottom:8,border:"1px solid var(--bd3)"}},
            ce("div",{style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}},
              karniszFieldInput(i,"roomWin","Pomieszczenie / okno",200),
              karniszFieldInput(i,"type","Typ",180),
              ce("div",{style:{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:"auto"}},
                ce("input",{type:"text",inputMode:"decimal",value:r.total,onChange:function(ev){setKarniszField(i,"total",ev.target.value);},style:{width:100,padding:"8px 10px",fontSize:14,fontWeight:600,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--gr)",textAlign:"right"}}),
                ce("span",{style:{fontSize:12,color:"var(--t3)"}},"zł")
              )
            ),
            ce("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}},
              karniszFieldInput(i,"len","Długość (cm)",100),
              karniszFieldInput(i,"qty","Ilość",70),
              karniszFieldInput(i,"arc","Gięcie łuk (mb)",110),
              karniszFieldInput(i,"arcDepth","Głęb. łuku (cm)",110),
              karniszFieldInput(i,"pts","Gięcie pkt",90),
              karniszFieldInput(i,"motorSide","Strona silnika",110),
              karniszFieldInput(i,"motorType","Typ silnika",110)
            ),
            ce("div",{style:{display:"flex",alignItems:"center",gap:10}},
              ce("span",{style:{fontSize:12,fontWeight:600,color:"var(--t2)"}},"Dostawca:"),
              ce("select",{value:r.supplier,onChange:function(ev){setKarniszField(i,"supplier",ev.target.value);},style:{padding:"7px 10px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}},
                KARNISZ_SUPPLIERS.map(function(s){return ce("option",{key:s.key,value:s.key},s.label);})
              )
            )
          );
        }),
      ce("div",{style:{background:"var(--t1)",borderRadius:14,padding:"20px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
        ce("span",{style:{fontSize:14,color:"var(--bg)",opacity:0.75,letterSpacing:"0.04em"}},"\u0141\u0105cznie"),
        ce("span",{style:{fontSize:20,fontWeight:700,color:"var(--bg)"}},roundTo10(karniszTotal)+" zł")
      ),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        Btn("\u2190 Wstecz",function(){setScreen("sum");},false),
        ce("button",{onClick:function(){
          generateKarniszOrderPDFFromRows(curClient,karniszPreviewRows);
          setScreen("sum");
        },style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--gr)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDDA8\uFE0F Generuj PDF")
      )
    );
  }
  else if(screen==="railsPreview"&&curClient){
    function setRailsField(i,key,v){
      setRailsPreviewRows(function(prev){return prev.map(function(x,xi){
        if(xi!==i)return x;
        var patch={};patch[key]=v;
        return mg(x,patch);
      });});
    }
    function railsFieldInput(i,key,placeholder,width){
      return ce("input",{type:"text",value:railsPreviewRows[i][key]||"",onChange:function(ev){setRailsField(i,key,ev.target.value);},placeholder:placeholder,style:{width:width,padding:"7px 9px",fontSize:12,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}});
    }

    content=ce(Fragment,null,
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:14}},"\uD83D\uDD29 Szyny do montażu \u2014 podgląd przed wygenerowaniem"),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"12px 16px",marginBottom:12,fontSize:12,color:"var(--t3)",lineHeight:1.5}},
        "Każde pole poniżej jest edytowalne \u2014 pomieszczenie, okno, rodzaj, długość i ilość. Dopiero stąd generujesz PDF dla montażysty."
      ),
      railsPreviewRows.length===0
        ?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"12px 0"}},"Brak szyn / karniszów do wydruku.")
        :railsPreviewRows.map(function(r,i){
          var prevRoom=i>0?railsPreviewRows[i-1].room:null;
          var isNewRoom=r.room!==prevRoom;
          return ce(Fragment,{key:i},
            isNewRoom?ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",margin:i===0?"0 0 6px":"18px 0 6px",paddingBottom:4,borderBottom:"1.5px solid var(--bd2)"}},"\uD83C\uDFE0 "+(r.room||"Inne")):null,
            ce("div",{style:{padding:"12px 14px",background:"var(--bg2)",borderRadius:12,marginBottom:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",border:"1px solid var(--bd3)"}},
              railsFieldInput(i,"win","Okno / miejsce",150),
              railsFieldInput(i,"type","Rodzaj",180),
              railsFieldInput(i,"len","Długość (cm)",100),
              railsFieldInput(i,"qty","Ilość",70)
            )
          );
        }),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}},
        Btn("\u2190 Wstecz",function(){setScreen("sum");},false),
        ce("button",{onClick:function(){
          generateRailsInstallPDFFromRows(curClient,railsPreviewRows);
          setScreen("sum");
        },style:{padding:"14px 20px",borderRadius:12,border:"none",background:"var(--gr)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDDA8\uFE0F Generuj PDF")
      )
    );
  }
  else if(screen==="fabricPreview"&&curClient){
    var SEWING_HOUSES_LIST=[
      "TRINITAS — ul. Składowa 9, 86-300 Grudziądz",
      "LAURALES — ul. Kolegialna 35 lok.1, 09-402 Płock",
      "MARCIN DEKOR — ul. Terespolska 75, 05-074 Halinów",
      "NITECZKAMI — Troszyn Polski 38B, 09-530 Troszyn"
    ];
    function setFabricRowField(i,key,v){
      setFabricPreviewRows(function(prev){return prev.map(function(x,xi){
        if(xi!==i)return x;
        var patch={};patch[key]=v;
        return mg(x,patch);
      });});
    }
    function fabricFieldInput(i,key,placeholder,width){
      return ce("input",{type:"text",value:fabricPreviewRows[i][key]||"",onChange:function(ev){setFabricRowField(i,key,ev.target.value);},placeholder:placeholder,style:{width:width,padding:"7px 9px",fontSize:12,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}});
    }
    function generateFabricForSupplier(sup){
      var supRows=fabricPreviewRows.filter(function(r){return r.prod===sup;});
      var house=fabricSewingHouse==="__custom__"?fabricSewingHouseCustom:fabricSewingHouse;
      generateFabricOrderPDFFromRows(curClient,sup,supRows,{sewingHouse:house,notes:fabricNotes});
    }

    content=ce(Fragment,null,
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:14}},"\uD83E\uDDF5 Zamówienie tkaniny \u2014 podgląd przed wygenerowaniem"),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"12px 16px",marginBottom:12,fontSize:12,color:"var(--t3)",lineHeight:1.5}},
        "Każde pole poniżej jest edytowalne. Przeglądarka blokuje kilka okien naraz \u2014 generuj kolejno każdego dostawcę osobnym przyciskiem przy jego sekcji."
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12}},
        ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",marginBottom:8}},"Szwalnia (opcjonalnie)"),
        ce("select",{value:fabricSewingHouse,onChange:function(ev){setFabricSewingHouse(ev.target.value);},style:{width:"100%",padding:"8px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)"}},
          SEWING_HOUSES_LIST.map(function(h,hi){return ce("option",{key:hi,value:h},h);}),
          ce("option",{value:"__custom__"},"— Wpisz własne dane —")
        ),
        fabricSewingHouse==="__custom__"?ce("textarea",{value:fabricSewingHouseCustom,onChange:function(ev){setFabricSewingHouseCustom(ev.target.value);},placeholder:"Nazwa szwalni, kontakt, telefon...",rows:2,style:{width:"100%",marginTop:8,padding:"8px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",resize:"vertical",fontFamily:"inherit"}}):null
      ),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12}},
        ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",marginBottom:8}},"Uwagi do zlecenia"),
        ce("textarea",{value:fabricNotes,onChange:function(ev){setFabricNotes(ev.target.value);},placeholder:"Wpisz uwagi do zamówienia tkaniny...",rows:3,style:{width:"100%",padding:"10px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",resize:"vertical",fontFamily:"inherit"}})
      ),
      fabricPreviewRows.length===0
        ?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"12px 0"}},"Brak tkanin do zamówienia.")
        :fabricPreviewRows.map(function(r,i){
          var prevProd=i>0?fabricPreviewRows[i-1].prod:null;
          var isNewSup=r.prod!==prevProd;
          var supTotal=isNewSup?fabricPreviewRows.reduce(function(a,x){return x.prod===r.prod?a+(+x.metry||0):a;},0):0;
          return ce(Fragment,{key:i},
            isNewSup?ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,margin:i===0?"0 0 8px":"20px 0 8px"}},
              ce("div",null,
                ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)"}},"\uD83E\uDDF5 "+r.prod),
                ce("div",{style:{fontSize:11,color:"var(--t3)"}},supTotal.toFixed(2).replace(".",",")+" mb")
              ),
              ce("button",{onClick:function(){generateFabricForSupplier(r.prod);},style:{padding:"10px 16px",borderRadius:10,border:"none",background:"var(--t2)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}},"\uD83D\uDDA8\uFE0F Generuj dla "+r.prod)
            ):null,
            ce("div",{style:{padding:"12px 14px",background:"var(--bg2)",borderRadius:12,marginBottom:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",border:"1px solid var(--bd3)"}},
              fabricFieldInput(i,"fabName","Tkanina",160),
              fabricFieldInput(i,"kolor","Kolor",110),
              fabricFieldInput(i,"metry","Ilość (mb)",90),
              fabricFieldInput(i,"roomWin","Przeznaczenie",180),
              fabricFieldInput(i,"prod","Producent",150)
            )
          );
        }),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}},
        Btn("\u2190 Wstecz",function(){setScreen("sum");},false)
      )
    );
  }
  else if(screen==="simplifiedPreview"&&curClient){
    function setSimplKey(key,val){setSimplSel(function(s){var ns=Object.assign({},s);ns[key]=val;return ns;});}
    function setSimplItemField(ri,wi,ii,key,v){
      setSimplEditableRows(function(prev){
        return prev.map(function(rd,rri){
          if(rri!==ri)return rd;
          return mg(rd,{windows:rd.windows.map(function(wd,wwi){
            if(wwi!==wi)return wd;
            return mg(wd,{items:wd.items.map(function(it,iii){
              if(iii!==ii)return it;
              var patch={};patch[key]=v;
              return mg(it,patch);
            })});
          })});
        });
      });
    }
    function setSimplWinLabel(ri,wi,v){
      setSimplEditableRows(function(prev){
        return prev.map(function(rd,rri){
          if(rri!==ri)return rd;
          return mg(rd,{windows:rd.windows.map(function(wd,wwi){return wwi!==wi?wd:mg(wd,{label:v});})});
        });
      });
    }
    function simplPillStyle(active,color){
      var c=color||"var(--gr)";
      return {display:"flex",alignItems:"center",gap:5,cursor:"pointer",padding:"5px 12px",borderRadius:20,border:"1.5px solid "+(active?c:"var(--bd2)"),background:active?"color-mix(in srgb, "+c+" 18%, transparent)":"transparent",fontSize:13,color:active?c:"var(--t2)",fontWeight:active?600:400};
    }
    function doSimplGenerate(){
      var vu=null;
      if(simplValidUntil){var d=new Date(simplValidUntil+"T00:00:00");if(!isNaN(d))vu=d;}
      generateSimplifiedPDFFromRows(curClient,simplEditableRows,montazMode==="amount"?{mode:"amount",value:+montazInput||0}:{mode:"percent",value:(+montazInput||0)/100},vu,"");
      setScreen("sum");
    }
    var simplGrandTotal=simplEditableRows.reduce(function(a,rd){return a+rd.windows.reduce(function(b,wd){return b+wd.items.reduce(function(c,it){return c+(+it.total||0);},0);},0);},0);

    content=ce(Fragment,null,
      ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:14}},"\uD83D\uDCCB Wycena Uproszczona \u2014 podgląd przed wygenerowaniem"),
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"12px 16px",marginBottom:12,fontSize:12,color:"var(--t3)",lineHeight:1.5}},
        "Wybierz warianty pomieszczeń/okien poniżej, a dalej edytuj etykiety i ceny zagregowanych pozycji przed wygenerowaniem."
      ),
      simplRoomGroups.map(function(item){
        if(item.type==="roomVariant"){
          var selRoomId=simplSel["rv__"+item.grpId];
          return ce("div",{key:"rv_"+item.grpId,style:{marginBottom:10,border:"1px solid var(--bd2)",borderRadius:10,overflow:"hidden"}},
            ce("div",{style:{padding:"7px 12px",background:"var(--bg2)",fontSize:11,fontWeight:700,color:"var(--t1)",letterSpacing:"0.04em",textTransform:"uppercase"}},item.baseName),
            ce("div",{style:{padding:"10px 12px"}},
              ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:7,fontWeight:600}},"Wariant pomieszczenia:"),
              ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                item.rooms.map(function(room){
                  var isC=selRoomId===room.id;
                  return ce("label",{key:room.id,style:simplPillStyle(isC,"var(--gr)")},
                    ce("input",{type:"radio",name:"rv__"+item.grpId,checked:isC,onChange:function(){setSimplKey("rv__"+item.grpId,room.id);},style:{display:"none"}}),
                    "Wariant "+(room.variantLabel||room.name)
                  );
                }),
                ce("label",{style:simplPillStyle(selRoomId===false,"#c8956c")},
                  ce("input",{type:"radio",name:"rv__"+item.grpId,checked:selRoomId===false,onChange:function(){setSimplKey("rv__"+item.grpId,false);},style:{display:"none"}}),
                  "Wyklucz"
                )
              )
            )
          );
        } else {
          var room=item.room;
          return ce("div",{key:room.id,style:{marginBottom:10,border:"1px solid var(--bd2)",borderRadius:10,overflow:"hidden"}},
            ce("div",{style:{padding:"7px 12px",background:"var(--bg2)",fontSize:11,fontWeight:700,color:"var(--t1)",letterSpacing:"0.04em",textTransform:"uppercase"}},room.name),
            item.order.map(function(key,ki){
              var g=item.groups[key];var selKey=room.id+"__"+key;var selVal=simplSel[selKey];
              if(g.isVariant){
                var sortedWins=g.wins.slice().sort(function(a,b){return(a.variantLabel||"").localeCompare(b.variantLabel||"");});
                return ce("div",{key:key,style:{padding:"10px 12px",borderTop:"1px solid var(--bd3)"}},
                  ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:7,fontWeight:600}},g.baseName+" \u2014 wariant:"),
                  ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                    sortedWins.map(function(w){var isC=selVal===w.id;
                      return ce("label",{key:w.id,style:simplPillStyle(isC,"var(--gr)")},
                        ce("input",{type:"radio",name:selKey,checked:isC,onChange:function(){setSimplKey(selKey,w.id);},style:{display:"none"}}),
                        "Wariant "+w.variantLabel
                      );
                    }),
                    ce("label",{style:simplPillStyle(selVal===false,"#c8956c")},
                      ce("input",{type:"radio",name:selKey,checked:selVal===false,onChange:function(){setSimplKey(selKey,false);},style:{display:"none"}}),
                      "Wyklucz"
                    )
                  )
                );
              } else {
                var soloWin=g.wins[0];var isChecked=selVal===true;
                return ce("label",{key:key,style:{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderTop:ki===0?"none":"1px solid var(--bd3)",cursor:"pointer",userSelect:"none"}},
                  ce("input",{type:"checkbox",checked:!!isChecked,onChange:function(ev){setSimplKey(selKey,ev.target.checked);},style:{width:15,height:15,cursor:"pointer",flexShrink:0}}),
                  ce("span",{style:{fontSize:13,color:isChecked?"var(--t1)":"var(--t3)",fontWeight:isChecked?500:400}},soloWin.name||"Okno")
                );
              }
            })
          );
        }
      }),
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",margin:"20px 0 10px"}},"Pozycje do wyceny"),
      simplEditableRows.length===0
        ?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"12px 0"}},"Brak zaznaczonych pozycji.")
        :simplEditableRows.map(function(rd,ri){
          return ce("div",{key:rd.roomId||ri,style:{marginBottom:14}},
            ce("div",{style:{fontSize:12,fontWeight:700,color:"var(--t1)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}},"\uD83C\uDFE0 "+rd.name),
            rd.windows.map(function(wd,wi){
              var wdTotal=wd.items.reduce(function(a,it){return a+(+it.total||0);},0);
              return ce("div",{key:wd.winId||wi,style:{padding:"10px 12px",background:"var(--bg2)",borderRadius:10,marginBottom:6,border:"1px solid var(--bd3)"}},
                wd.items.map(function(it,ii){
                  return ce("div",{key:ii,style:{display:"flex",alignItems:"center",gap:8,marginBottom:4}},
                    ce("input",{type:"text",value:it.label,onChange:function(ev){setSimplItemField(ri,wi,ii,"label",ev.target.value);},style:{flex:1,padding:"6px 8px",fontSize:12,border:"1.5px solid var(--bd2)",borderRadius:6,background:"var(--bg)",color:"var(--t1)"}}),
                    ce("input",{type:"text",inputMode:"decimal",value:it.total,onChange:function(ev){setSimplItemField(ri,wi,ii,"total",ev.target.value);},style:{width:90,padding:"6px 8px",fontSize:12,fontWeight:600,border:"1.5px solid var(--bd2)",borderRadius:6,background:"var(--bg)",color:"var(--gr)",textAlign:"right"}}),
                    ce("span",{style:{fontSize:11,color:"var(--t3)"}},"zł")
                  );
                }),
                ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px dashed var(--bd2)"}},
                  ce("input",{type:"text",value:wd.label,onChange:function(ev){setSimplWinLabel(ri,wi,ev.target.value);},style:{flex:1,padding:"6px 8px",fontSize:12,fontWeight:600,border:"1.5px solid var(--bd2)",borderRadius:6,background:"var(--bg)",color:"var(--t1)"}}),
                  ce("span",{style:{fontSize:13,fontWeight:700,color:"var(--gr)",whiteSpace:"nowrap"}},roundTo10(wdTotal)+" zł")
                )
              );
            })
          );
        }),
      ce("div",{style:{background:"var(--t1)",borderRadius:14,padding:"20px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,marginTop:16}},
        ce("span",{style:{fontSize:14,color:"var(--bg)",opacity:0.75,letterSpacing:"0.04em"}},"\u0141\u0105cznie"),
        ce("span",{style:{fontSize:20,fontWeight:700,color:"var(--bg)"}},roundTo10(simplGrandTotal)+" zł")
      ),
      ce("div",{style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:16}},
        ce("label",{style:{fontSize:13,color:"var(--t2)"}},"Oferta ważna do:"),
        ce("input",{type:"date",value:simplValidUntil,onChange:function(ev){setSimplValidUntil(ev.target.value);},title:"Puste = 30 dni od dziś",style:{padding:"8px 12px",borderRadius:8,border:"1px solid var(--bd2)",fontSize:13,color:"var(--t1)",background:"var(--bg)",fontFamily:"inherit"}})
      ),
      ce("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        Btn("\u2190 Wstecz",function(){setScreen("sum");},false),
        ce("button",{onClick:doSimplGenerate,style:{padding:"14px 20px",borderRadius:12,border:"none",background:"#c8956c",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em",minHeight:52}},"\uD83D\uDCCB Generuj PDF")
      )
    );
  }
  else if(screen==="sewingPreview"&&curClient){
    content=ce(ModalSewing,{client:curClient,onClose:function(){setScreen("sum");}});
  }

  if(billingBlocked){
    return ce(ScreenBillingGate,{
      status:billing.status,
      trialEndsAt:billing.trialEndsAt,
      brandName:brandName,
      brandLogo:brandLogo,
      onLogout:function(){signOut().finally(function(){onLogout();});}
    });
  }

  return ce("div",{style:{padding:"1.2rem",maxWidth:"100%",margin:"0 auto",background:"transparent",minHeight:"100vh",position:"relative",transition:"background 0.3s"}},
    offlineMode?ce("div",{style:{position:"fixed",bottom:20,right:20,fontSize:10,fontWeight:700,letterSpacing:"0.10em",color:"rgba(245,158,11,0.28)",pointerEvents:"none",zIndex:1,textTransform:"uppercase"}},"Tryb offline"):null,
    // Save status
    saveStatus?ce("div",{style:{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",background:saveStatus==="ok"?"var(--gr)":saveStatus==="error"?"var(--red)":"var(--t2)",color:"var(--bg)",fontSize:12,padding:"6px 20px",borderRadius:"0 0 12px 12px",zIndex:9999,letterSpacing:"0.04em",boxShadow:"0 4px 16px rgba(0,0,0,0.15)"}},saveStatus==="saving"?"Zapisuj\u0119...":saveStatus==="ok"?"\u2713 Zapisano":"\u26a0 B\u0142\u0105d zapisu"):null,
    // Topbar (always visible)
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:"1rem",padding:"10px 14px",borderRadius:18,background:"var(--panel-bg)",border:"1.5px solid var(--panel-border)",boxShadow:"var(--glass-shadow)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)"}},
      appMode==="wyceniarka"&&screen!=="home"
        ?ce("button",{onClick:function(){setScreen("home");},style:{border:"none",background:"var(--bd3)",cursor:"pointer",padding:"7px 13px",color:"var(--violet)",fontSize:13,letterSpacing:"0.04em",display:"flex",alignItems:"center",gap:5,borderRadius:10,fontWeight:600,transition:"background 0.15s"}},"\u2190","Wstecz")
        :ce("div",{style:{width:20}}),
      ce("div",{style:{display:"flex",alignItems:"center",gap:9}},
        ce("img",{src:brandLogo,alt:"logo",style:{height:22,opacity:0.9}}),
        ce("span",{style:{fontSize:10,letterSpacing:"0.13em",textTransform:"uppercase",color:"var(--t3)",fontWeight:600}},brandName)
      ),
      ce("div",{style:{display:"flex",alignItems:"center",gap:6,flexShrink:0}},
        // Motyw: jasny / ciemny / bezowy
        ce("div",{style:{display:"flex",alignItems:"center",gap:2,background:"var(--bd3)",borderRadius:10,padding:2,flexShrink:0}},
          [{id:"light",icon:"\u2600\uFE0F",title:"Jasny"},{id:"dark",icon:"\uD83C\uDF19",title:"Ciemny (w trakcie dopracowywania — nie wszystkie ekrany gotowe)"},{id:"beige",icon:"\u2615",title:"Kawowy (w trakcie dopracowywania — nie wszystkie ekrany gotowe)"}].map(function(th){
            var thActive=theme===th.id;
            return ce("button",{key:th.id,onClick:function(){setTheme(th.id);},title:th.title,
              style:{border:"none",cursor:"pointer",padding:"4px 7px",borderRadius:8,fontSize:13,lineHeight:1,
                background:thActive?"var(--panel-active-bg)":"transparent",
                boxShadow:thActive?"0 1px 4px var(--violet-l)":"none",
                opacity:thActive?1:0.55,transition:"all .15s"}
            },th.icon);
          })
        ),
        // Offline toggle
        ce("div",{onClick:function(){setOfflineMode(function(prev){return !prev;});},style:{
          display:"flex",alignItems:"center",gap:7,cursor:"pointer",
          border:"1.5px solid "+(offlineMode?"var(--amber)":"var(--gr)"),
          background:offlineMode?"var(--amber-l)":"var(--grl)",
          padding:"5px 10px",borderRadius:10,transition:"all .2s",userSelect:"none"
        }},
          ce("div",{style:{width:30,height:15,borderRadius:10,background:offlineMode?"var(--amber)":"var(--gr)",position:"relative",transition:"all .2s"}},
            ce("div",{style:{width:11,height:11,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:offlineMode?17:2,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}})
          ),
          ce("span",{style:{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:offlineMode?"var(--amber)":"var(--gr)"}},offlineMode?"OFFLINE":"ONLINE")
        ),
        // AI
        appMode==="wyceniarka"?ce("button",{
          onClick:function(){setShowAIModal(true);},
          disabled:offlineMode,
          style:{border:"1.5px solid var(--violet-border)",background:offlineMode?"var(--bd3)":"var(--bd3)",cursor:offlineMode?"not-allowed":"pointer",padding:"6px 11px",borderRadius:10,color:offlineMode?"var(--t3)":"var(--violet)",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,flexShrink:0,opacity:offlineMode?0.4:1}
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
    ce("div",{style:{display:"grid",gridTemplateColumns:"repeat("+(isSuperAdmin?9:8)+",1fr)",gap:4,marginBottom:"1.2rem",background:"var(--panel-bg)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:18,padding:"5px",border:"1.5px solid var(--panel-border)",boxShadow:"var(--glass-shadow)"}},
      [
        {id:"crm",       label:"CRM",   icon:"\uD83D\uDCC8"},
        {id:"wyceniarka",label:"Wyceny",icon:"\uD83D\uDCCB"},
        {id:"kontrahenci",label:"Kontrah.",icon:"\uD83D\uDC65"},
        {id:"kalendarz", label:"Kalen.",icon:"\uD83D\uDCC5"},
        {id:"mail",      label:"Mail",  icon:"\uD83D\uDCE8"},
        {id:"zadania",   label:"Zadania",icon:"\u2705"},
        {id:"faktury",   label:"Faktury", icon:"\uD83D\uDCB0"},
        {id:"magazyn",   label:"Magazyn", icon:"\uD83D\uDCE6"}
      ].concat(isSuperAdmin?[{id:"admin",label:"Admin",icon:"\u2699"}]:[]).map(function(tab){
        var active=appMode===tab.id;
        return ce("button",{key:tab.id,
          onClick:function(){if(!tab.soon)setAppMode(tab.id);},
          className:"nav-tab"+(active?" active":""),
          style:{
            padding:"9px 0 8px",borderRadius:12,border:"none",
            background:active?"var(--panel-active-bg)":"transparent",
            color:active?"var(--violet)":tab.soon?"var(--bd2)":"var(--t3)",
            fontWeight:active?700:400,fontSize:11,cursor:tab.soon?"default":"pointer",
            boxShadow:active?"0 2px 10px var(--violet-l)":"none",
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
        ? ce("div",{style:{height:"calc(100vh - 190px)",overflow:"hidden"}},
            ce(ScreenMail,{clients:clients,setScreen:setScreen,setCurClientId:setCurClientId})
          )
      : appMode==="kalendarz"
        ? ce(CRMKalendarz,{deals:deals,clients:clients,onDealClick:function(){},gcalToken:gcalToken,setGcalToken:setGcalToken,gsiReady:gsiReady})
      : appMode==="zadania"
        ? ce(ScreenTasks,{})
      : appMode==="faktury"
        ? ce(ScreenInvoices,{})
      : appMode==="magazyn"
        ? ce(ScreenWarehouse,{})
      : appMode==="kontrahenci"
        ? ce(ScreenContacts,{})
      : appMode==="admin"
        ? ce(ScreenAdmin,null)
        : ce(Fragment,null,
            screen!=="home"?ce(BC,{}):null,
            content
          ),
    showClientModal?ce(ModalClient,{onOk:addClient,onClose:function(){setShowClientModal(false);}}):null,
    showNewQuoteModal?ce(ModalNewQuoteFromClient,{clients:clients,onOk:addClient,onClose:function(){setShowNewQuoteModal(false);}}):null,
    showRoomModal?ce(ModalRoom,{onOk:addRoom,onClose:function(){setShowRoomModal(false);}}):null,
    showWinModal?ce(ModalWindow,{onOk:newWin,onClose:function(){setShowWinModal(false);}}):null,
    showFabricModal?ce(ModalFabricOrder,{client:curClient,onClose:function(){setShowFabricModal(false);}}):null,
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

// ── Ekran blokady dostepu (trial wygasl / subskrypcja anulowana) ───────────
// Zastepuje caly render App gdy billingBlocked===true. Demo i super-admin
// omijaja ten ekran (patrz warunek billingBlocked w App).
function ScreenBillingGate(p){
  var status=p.status,trialEndsAt=p.trialEndsAt,brandName=p.brandName,brandLogo=p.brandLogo,onLogout=p.onLogout;
  var sBusy=useState(null),busyPlan=sBusy[0],setBusyPlan=sBusy[1];
  var sErr=useState(""),err=sErr[0],setErr=sErr[1];
  var isCanceled=status==="canceled";
  var title=isCanceled?"Subskrypcja zosta\u0142a anulowana":"Tw\u00f3j okres pr\u00f3bny si\u0119 sko\u0144czy\u0142";
  var sub=isCanceled
    ?"Aby dalej korzysta\u0107 z aplikacji, wybierz plan poni\u017cej."
    :"Okres pr\u00f3bny zako\u0144czy\u0142 si\u0119"+(trialEndsAt?" "+new Date(trialEndsAt).toLocaleDateString("pl-PL"):"")+". Wybierz plan, aby zachowa\u0107 dost\u0119p do wszystkich danych.";
  var plans=[
    {id:"start",label:"Start",price:"149 z\u0142/mc"},
    {id:"studio",label:"Studio",price:"279 z\u0142/mc"},
    {id:"pro",label:"Pro",price:"449 z\u0142/mc"}
  ];
  function pick(planId){
    if(busyPlan)return;
    setErr("");setBusyPlan(planId);
    stripeApi.createCheckoutSession(planId).then(function(url){
      window.location.href=url;
    }).catch(function(e){
      setErr(e.message||"B\u0142\u0105d tworzenia sesji p\u0142atno\u015bci.");
      setBusyPlan(null);
    });
  }
  return ce("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}},
    ce("div",{style:{maxWidth:520,width:"100%",background:"var(--glass-bg)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:20,border:"1.5px solid var(--glass-border)",boxShadow:"var(--glass-shadow)",padding:"32px 28px",textAlign:"center"}},
      ce("img",{src:brandLogo,alt:"logo",style:{height:26,opacity:0.9,marginBottom:14}}),
      ce("h2",{style:{fontSize:20,fontWeight:700,color:"var(--t1)",margin:"0 0 8px"}},title),
      ce("p",{style:{fontSize:13.5,color:"var(--t3)",lineHeight:1.6,margin:"0 0 22px"}},sub),
      err?ce("div",{style:{fontSize:12,color:"var(--red)",marginBottom:14}},err):null,
      ce("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:18}},
        plans.map(function(pl){
          var busy=busyPlan===pl.id;
          return ce("button",{key:pl.id,disabled:!!busyPlan,onClick:function(){pick(pl.id);},
            style:{padding:"13px 16px",borderRadius:12,border:"1.5px solid var(--bd2)",background:busy?"var(--bg2)":"var(--bg)",cursor:busyPlan?"not-allowed":"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14,fontWeight:600,color:"var(--t1)",opacity:busyPlan&&!busy?0.5:1,transition:"all .15s"}
          },ce("span",null,pl.label),ce("span",{style:{color:"var(--violet)"}},busy?"\u2026":pl.price));
        })
      ),
      ce("button",{onClick:onLogout,style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",fontSize:12,textDecoration:"underline"}},"Wyloguj si\u0119")
    )
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
                      color:"var(--bg)",fontSize:11,fontWeight:600,
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
            color:"var(--bg)",fontSize:13,fontWeight:600,
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
      +"\n\nKoszt pomiaru z dojazdem wynosi 250 zł brutto i jest w całości odliczany od wartości zamówienia, jeśli przekracza ono 6 000 zł brutto."
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
    ce("div",{style:{background:"var(--bg)",borderRadius:18,padding:"24px",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.22)"}},
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
        ce("button",{onClick:copyMail,style:{flex:1,padding:"14px",borderRadius:12,border:"none",background:copied?"var(--grd)":"var(--gr)",color:"var(--bg)",fontSize:14,fontWeight:600,cursor:"pointer"}},copied?"\u2713 Skopiowano!":"\uD83D\uDCCB Kopiuj do schowka"),
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
    var fabList=getAllFabrics().map(function(f){
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
            var fabEff=getFabricEffective(prod.fabName);
            if(fabEff){prod.fabP=fabEff.brutto;prod.fabW=fabEff.width||300;}
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
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+(getAccessToken()||"")},
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
              var fabObjEff=getFabricEffective(prod.fabName);
              if(fabObjEff){clean.fabP=fabObjEff.brutto;clean.fabW=fabObjEff.width||0;}
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
                    prod.warn?ce("span",{style:{color:"var(--amber)",marginLeft:4}},"\u26a0\ufe0f "+prod.warn):null
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
        method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(getAccessToken()||"")},
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
            background:"var(--t1)",color:"var(--bg)",fontWeight:700,fontSize:13,cursor:"pointer"}
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
        color:isUser?"var(--bg)":"var(--t1)",
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
            style:{padding:"6px 12px",borderRadius:8,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:12,fontWeight:600,cursor:saveLoading?"wait":"pointer",flexShrink:0,whiteSpace:"nowrap"}
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
      error?ce("div",{style:{padding:"10px 14px",background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:10,fontSize:12,color:"var(--red)",margin:"0 0 12px",whiteSpace:"pre-wrap"}},"\u26A0\uFE0F "+error):null,
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
                  style:{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",border:"none",background:"var(--t1)",color:"var(--bg)",cursor:"pointer",fontSize:11,lineHeight:"18px",textAlign:"center",padding:0}
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
          style:{padding:"9px 14px",borderRadius:10,border:"none",background:canSend?"var(--t1)":"var(--bd2)",color:canSend?"var(--bg)":"var(--t3)",fontSize:16,cursor:canSend?"pointer":"not-allowed",flexShrink:0,alignSelf:"flex-end"}
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

// -- MODAL WYCENA UPROSZCZONA -- WYBOR OKIEN

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
