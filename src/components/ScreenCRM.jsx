import React, { useState, useRef, useEffect, Fragment } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { sbApi, SB_URL, SB_KEY } from '../lib/supabase.js';
import { LOGO_SRC, mg, calc, getPanelsForProd, roundTo10 } from '../constants/data.js';
import { gcalLogin, gcalLogout, gcalGetToken, gcalHasValidToken, gcalWaitReady, GCAL_CLIENT_ID, GCAL_SCOPES } from '../lib/gcal.js';
import { msalGetToken, msalGetActiveAccount } from '../msal.js';
import { fillTemplate, RichTextEditor } from './ScreenMail.jsx';
const ce = React.createElement;



export const CRM_STAGES =[
  {id:"zapytanie",  label:"Zapytanie",  color:"#6366f1", clientStatus:"nowe"},
  {id:"pomiar",     label:"Pomiar",     color:"#f59e0b", clientStatus:"nowe"},
  {id:"wycena",     label:"Wycena",     color:"#3b82f6", clientStatus:"nowe"},
  {id:"zamowienie", label:"Zamówienie", color:"#8b5cf6", clientStatus:"nowe"},
  {id:"realizacja", label:"Realizacja", color:"#10b981", clientStatus:"nowe"},
  {id:"montaz",     label:"Monta\u017c",     color:"#f97316", clientStatus:"nowe"},
  {id:"posprzedazowa", label:"Obs\u0142uga posprzeda\u017cowa", color:"#14b8a6", clientStatus:"zrealizowane"}
];
export const STAGE_ZAKONCZONE={id:"zakonczone",label:"Zako\u0144czone",color:"#6b7280",clientStatus:"zrealizowane"};
export const STAGE_ODRZUCONE ={id:"odrzucone",label:"Odrzucone",color:"#ef4444",clientStatus:"odrzucone"};

export function clientTotal2(cl){
  if(!cl||!cl.rooms)return 0;
  var comm=parseFloat(cl.commission)||0;
  var sum=0;
  (cl.rooms||[]).forEach(function(r){
    var wins=r.windows||[];
    var groups={};
    wins.forEach(function(w){
      var wVal=(w.products||[]).reduce(function(c,p){
        var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;
        return c+(p.mp!=null?p.mp:(calc(pfc).total||0));
      },0);
      if(w.variantGroup){
        if(!groups[w.variantGroup])groups[w.variantGroup]=[];
        groups[w.variantGroup].push({w:w,val:wVal});
      } else {
        sum+=wVal;
      }
    });
    Object.keys(groups).forEach(function(gid){
      var sorted=groups[gid].slice().sort(function(a,b){return(a.w.variantLabel||"").localeCompare(b.w.variantLabel||"");});
      sum+=sorted[0].val;
    });
  });
  return comm>0?sum*(1+comm/100):sum;
}

// Rozbicie wyceny na pomieszczenia — do podglądu w karcie deala.
// Zwraca surowe (niezaokrąglone) sumy; zaokrąglanie ma miejsce raz, na końcu,
// tak samo jak w PDF (pdf.js), żeby wartości w Kanbanie / karcie deala / PDF się zgadzały.
function dealQuoteBreakdown(cl){
  if(!cl||!cl.rooms)return {rooms:[],total:0};
  var comm=parseFloat(cl.commission)||0;
  var rooms=[];
  (cl.rooms||[]).forEach(function(r){
    var wins=r.windows||[];
    var groups={};
    var roomSum=0;
    wins.forEach(function(w){
      var wVal=(w.products||[]).reduce(function(c,p){
        var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;
        return c+(p.mp!=null?p.mp:(calc(pfc).total||0));
      },0);
      if(w.variantGroup){
        if(!groups[w.variantGroup])groups[w.variantGroup]=[];
        groups[w.variantGroup].push({w:w,val:wVal});
      } else {
        roomSum+=wVal;
      }
    });
    Object.keys(groups).forEach(function(gid){
      var sorted=groups[gid].slice().sort(function(a,b){return(a.w.variantLabel||"").localeCompare(b.w.variantLabel||"");});
      roomSum+=sorted[0].val;
    });
    if(roomSum>0){
      rooms.push({name:r.name||"Pomieszczenie",total:comm>0?roomSum*(1+comm/100):roomSum});
    }
  });
  var total=rooms.reduce(function(a,x){return a+x.total;},0);
  return {rooms:rooms,total:total};
}

export function fmtDate(iso){
  if(!iso)return null;
  var d=new Date(iso);
  return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit",year:"numeric"});
}

export function gcalLink(title,date,desc){
  if(!date)return null;
  var d=new Date(date);
  var pad=function(n){return String(n).padStart(2,"0");};
  var ymd=d.getFullYear()+""+pad(d.getMonth()+1)+""+pad(d.getDate());
  var start=ymd+"T090000";
  var end=ymd+"T100000";
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(title)+"&dates="+start+"/"+end+"&details="+encodeURIComponent(desc||"");
}

// ── MODAL DEAL ───────────────────────────────────────────────────────────────
export function ModalDeal(p){
  var d=p.deal;
  var gcalToken=p.gcalToken||null;
  var setGcalToken=p.setGcalToken||function(){};
  var gsiReady=!!p.gsiReady;
  var calList=p.calList||[];
  var cl=p.client;

  var sn=useState(d.notes||""),notes=sn[0],setNotes=sn[1];
  var sv=useState(d.visit_date?d.visit_date.slice(0,16):""),visitDate=sv[0],setVisitDate=sv[1];
  var svd=useState(!!d.visit_done),visitDone=svd[0],setVisitDone=svd[1];
  var sdel=useState(d.delivery_date?d.delivery_date.slice(0,16):""),delivDate=sdel[0],setDelivDate=sdel[1];
  var sid=useState(!!d.install_done),installDone=sid[0],setInstallDone=sid[1];
  var sinst=useState(d.installer_name||""),installerName=sinst[0],setInstallerName=sinst[1];
  var sinstcal=useState(d.installer_calendar_id||""),installerCalId=sinstcal[0],setInstallerCalId=sinstcal[1];
  var sdel2=useState(d.delivery_date2?d.delivery_date2.slice(0,16):""),delivDate2=sdel2[0],setDelivDate2=sdel2[1];
  var sinst2=useState(d.installer_name2||""),installerName2=sinst2[0],setInstallerName2=sinst2[1];
  var sinstcal2=useState(d.installer_calendar_id2||""),installerCalId2=sinstcal2[0],setInstallerCalId2=sinstcal2[1];
  var sinslbl2=useState(d.install_label2||""),installLabel2=sinslbl2[0],setInstallLabel2=sinslbl2[1];
  var sac=useState(d.acquisition||""),acquisition=sac[0],setAcquisition=sac[1];
  var ssh=useState(d.sewing_house||""),sewingHouse=ssh[0],setSewingHouse=ssh[1];
  var ssd=useState(d.sewing_sent_date?d.sewing_sent_date.slice(0,10):""),sewingSentDate=ssd[0],setSewingSentDate=ssd[1];
  var ssc=useState(!!d.sewing_confirmed),sewingConfirmed=ssc[0],setSewingConfirmed=ssc[1];
  var srev=useState(!!d.review_sent),reviewSent=srev[0],setReviewSent=srev[1];
  var sinv=useState(!!d.invoice_sent),invoiceSent=sinv[0],setInvoiceSent=sinv[1];
  var swash=useState(!!d.washing_sent),washingSent=swash[0],setWashingSent=swash[1];
  var sat=useState([]),attachments=sat[0],setAttachments=sat[1];
  // Koszty zlecenia (deal_costs) — strona kosztowa, osobna tabela
  var scst=useState([]),costs=scst[0],setCosts=scst[1];
  var scstb=useState(false),costBusy=scstb[0],setCostBusy=scstb[1];
  var scste=useState(false),costErr=scste[0],setCostErr=scste[1];
  var scstd=useState({kind:"tkanina",amount:"",supplier:"",installer_name:"",paid_at:"",planned_delivery:"",actual_delivery:"",note:""}),
      costDraft=scstd[0],setCostDraft=scstd[1];
  var sul=useState(false),uploading=sul[0],setUploading=sul[1];
  var sbusy=useState(false),busy=sbusy[0],setBusy=sbusy[1];
  var sgcd=useState(null),gcalDraft=sgcd[0],setGcalDraft=sgcd[1];
  // Szablony maili "Opinia - swobodna" / "Instrukcja prania i czyszczenia" oraz stan modala wysyłki
  var smt=useState(null),mailTpls=smt[0],setMailTpls=smt[1];
  var smk=useState(null),mailKind=smk[0],setMailKind=smk[1]; // "opinia" | "instrukcja" | null
  var smb=useState(false),mailBusy=smb[0],setMailBusy=smb[1];
  var sme=useState(null),mailErr=sme[0],setMailErr=sme[1];
  var smm=useState(null),mailMsg=smm[0],setMailMsg=smm[1];
  var smsub=useState(""),mailSubject=smsub[0],setMailSubject=smsub[1];
  var smbod=useState(""),mailBodyText=smbod[0],setMailBodyText=smbod[1];
  var smto=useState(""),mailTo=smto[0],setMailTo=smto[1];
  var smatt=useState([]),mailAttachments=smatt[0],setMailAttachments=smatt[1];

  var SEWING_HOUSES_OPT=[
    "TRINITAS — ul. Składowa 9, 86-300 Grudziądz",
    "LaurAles — ul. Kolegialna 35 lok.1, 09-402 Płock",
    "Marcin Dekor — ul. Terespolska 75, 05-074 Halinów",
    "Szwalnia Niteczkami — Barbara Jasińska, Troszyn Polski 38B"
  ];
  var INSTALLER_OPTIONS=["","Darek","Rafał","Grzesiek","Damian"];
  // Rodzaje kosztow — te same wartosci co CHECK-lista w komentarzu migracji 0034
  var COST_KINDS=[
    {id:"tkanina",  label:"Tkanina",           icon:"🧵"},
    {id:"szycie",   label:"Szycie",            icon:"✂️"},
    {id:"osprzet",  label:"Karnisz / osprzęt", icon:"🔩"},
    {id:"montaz",   label:"Wypłata montażysty",icon:"🔧"},
    {id:"transport",label:"Transport",         icon:"🚚"},
    {id:"inne",     label:"Inne",              icon:"📎"}
  ];
  var COST_SUPPLIERS=["","Vadain","LaurAles","Szyny KS","TRINITAS","Marcin Dekor","Margo Textil","Sama Tekstil"];
  function costKindMeta(id){
    return COST_KINDS.find(function(k){return k.id===id;})||{id:id,label:id,icon:"📎"};
  }
  var ACQUISITION_OPTIONS=["","Polecenie","porterdesign.pl","kapadesign.pl","Piotr Skowroń","Projektant"];

  var clientName=cl?cl.name:"(brak klienta)";
  var quoteBreak=dealQuoteBreakdown(cl);
  var montazRateD=cl?(cl.install_fee_mode==="amount"?0:((parseFloat(cl.install_fee)||0)/100)):0;
  var montazAmountD=cl&&cl.install_fee_mode==="amount"?(parseFloat(cl.install_fee)||0):0;
  var quoteBezMontazu=roundTo10(quoteBreak.total);
  var quoteMontazVal=montazAmountD>0?roundTo10(montazAmountD):(montazRateD>0?roundTo10(quoteBreak.total*montazRateD):0);
  var clientTotal=roundTo10(quoteBreak.total+quoteMontazVal);

  React.useEffect(function(){
    sbApi.getAttachments(d.id).then(function(a){setAttachments(a||[]);});
  },[d.id]);

  // Koszty zlecenia. Blad (np. brak tabeli przed uruchomieniem migracji 0034)
  // nie moze wywalic calego modala — panel po prostu pokazuje komunikat.
  React.useEffect(function(){
    sbApi.getDealCosts(d.id)
      .then(function(rows){setCosts(rows||[]);setCostErr(false);})
      .catch(function(){setCosts([]);setCostErr(true);});
  },[d.id]);

  // Suma kosztow + marza wzgledem wartosci wyceny dla klienta (clientTotal).
  // clientTotal jest kwota BRUTTO z wyceny — marza jest wiec orientacyjna,
  // do czasu az zlecenia beda spinane z faktura sprzedazowa.
  var costsTotal=(costs||[]).reduce(function(a,x){return a+(parseFloat(x.amount)||0);},0);
  var costsByKind=(costs||[]).reduce(function(a,x){
    a[x.kind]=(a[x.kind]||0)+(parseFloat(x.amount)||0);
    return a;
  },{});
  var marzaVal=clientTotal-costsTotal;
  var marzaPct=clientTotal>0?Math.round(marzaVal/clientTotal*100):0;

  function addCost(){
    var amt=parseFloat(String(costDraft.amount).replace(",","."));
    if(!amt||amt<=0){alert("Podaj kwotę kosztu.");return;}
    setCostBusy(true);
    var row={
      deal_id:d.id,
      kind:costDraft.kind,
      amount:amt,
      supplier:costDraft.supplier||"",
      installer_name:costDraft.kind==="montaz"?(costDraft.installer_name||""):"",
      paid_at:costDraft.paid_at||null,
      planned_delivery:costDraft.planned_delivery||null,
      actual_delivery:costDraft.actual_delivery||null,
      note:costDraft.note||""
    };
    sbApi.addDealCost(row).then(function(saved){
      setCosts(function(prev){return prev.concat([saved||row]);});
      setCostDraft({kind:costDraft.kind,amount:"",supplier:"",installer_name:"",paid_at:"",planned_delivery:"",actual_delivery:"",note:""});
      setCostBusy(false);
    }).catch(function(e){alert("Błąd zapisu kosztu: "+e.message);setCostBusy(false);});
  }

  function deleteCost(id){
    if(!confirm("Usunąć ten koszt?"))return;
    sbApi.deleteDealCost(id).then(function(){
      setCosts(function(prev){return prev.filter(function(x){return x.id!==id;});});
    }).catch(function(e){alert("Błąd: "+e.message);});
  }

  // Szablony maili "Opinia - swobodna" i "Instrukcja prania i czyszczenia" — do wysyłki z karty deala,
  // analogicznie do wysyłki faktury z modułu Faktury.
  React.useEffect(function(){
    sbApi.getMailTemplates().then(function(rows){
      // Normalizacja: małe litery, pojedyncze spacje, wszystkie warianty myślnika (-, –, —) ujednolicone na "-"
      var norm=function(s){return String(s||"").trim().toLowerCase().replace(/[\u2010-\u2015]/g,"-").replace(/\s*-\s*/g," - ").replace(/\s+/g," ").trim();};
      var byLabel=function(lbl){var n=norm(lbl);return (rows||[]).find(function(r){return norm(r.label)===n;})||null;};
      setMailTpls({
        opinia:byLabel("Opinia - swobodna"),
        instrukcja:byLabel("Instrukcja prania i czyszczenia")
      });
    }).catch(function(){setMailTpls({opinia:null,instrukcja:null});});
  },[]);

  function save(){
    setBusy(true);
    var patch={
      notes:notes,
      visit_date:visitDate||null,
      visit_done:visitDone,
      delivery_date:delivDate||null,
      install_done:installDone,
      installer_name:installerName||null,
      installer_calendar_id:installerCalId||null,
      delivery_date2:delivDate2||null,
      installer_name2:installerName2||null,
      installer_calendar_id2:installerCalId2||null,
      install_label2:installLabel2||null,
      acquisition:acquisition||null,
      sewing_house:sewingHouse||null,
      sewing_sent_date:sewingSentDate||null,
      sewing_confirmed:sewingConfirmed,
      review_sent:reviewSent,
      invoice_sent:invoiceSent,
      washing_sent:washingSent,
      updated_at:new Date().toISOString()
    };
    sbApi.updateDeal(d.id,patch).then(function(){
      p.onSave(patch);
      setBusy(false);
      p.onClose();
    }).catch(function(e){alert("Błąd: "+e.message);setBusy(false);});
  }

  function deleteAttach(id){
    sbApi.deleteAttachment(id).then(function(){
      setAttachments(function(a){return a.filter(function(x){return x.id!==id;});});
    });
  }

  function uploadFile(file){
    setUploading(true);
    var path="deals/"+d.id+"/"+Date.now()+"_"+file.name.replace(/\s/g,"_");
    var uploadUrl=SB_URL+"/storage/v1/object/deal-attachments/"+path;
    fetch(uploadUrl,{
      method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":file.type,"x-upsert":"true"},
      body:file
    }).then(function(r){
      if(!r.ok)return r.text().then(function(t){throw new Error(t);});
      var publicUrl=SB_URL+"/storage/v1/object/public/deal-attachments/"+path;
      return sbApi.addAttachment(d.id,publicUrl,file.name);
    }).then(function(res){
      var att=res&&res[0]?res[0]:{id:Date.now(),url:"",name:file.name};
      setAttachments(function(a){return a.concat([att]);});
      setUploading(false);
    }).catch(function(e){alert("Błąd uploadu: "+e.message);setUploading(false);});
  }

  // Otwiera modal z podglądem/edycją treści maila wg szablonu z bazy (Opinia / Instrukcja prania)
  function openMailTplModal(kind){
    if(!cl)return;
    var tpl=mailTpls&&mailTpls[kind];
    if(!tpl){
      alert("Brak szablonu \""+(kind==="opinia"?"Opinia - swobodna":"Instrukcja prania i czyszczenia")+"\" w bazie (zakładka Mail → Szablony).");
      return;
    }
    setMailErr(null);setMailMsg(null);
    var filled=fillTemplate({subject:tpl.subject||"",body:tpl.body||""},cl);
    setMailSubject(filled.subject);
    setMailBodyText(filled.body);
    setMailTo(cl.email||"");
    // Domyślne załączniki = pliki stałe przypięte do szablonu (Storage) — użytkownik może je usunąć / dodać własne
    var tplFiles=(tpl.template_files||[]).map(function(f,idx){
      return {id:"tplf_"+idx+"_"+Date.now(),name:f.name,size:f.size||null,type:"template",url:f.url};
    });
    setMailAttachments(tplFiles);
    setMailKind(kind);
  }

  // Dodaje plik wybrany ręcznie przez użytkownika (wysyłany bezpośrednio z File, bez uploadu do Storage)
  function addManualAttachment(file){
    if(!file)return;
    setMailAttachments(function(prev){return prev.concat([{id:"up_"+Date.now(),name:file.name,size:file.size,type:"upload",file:file}]);});
  }
  function removeMailAttachment(attId){
    setMailAttachments(function(prev){return prev.filter(function(a){return a.id!==attId;});});
  }

  // Zamienia listę załączników modala (template/upload) na format Microsoft Graph fileAttachment.
  // Pliki szablonu pobiera z Storage (URL), pliki dodane ręcznie czyta bezpośrednio z obiektu File.
  function buildGraphAttachments(list){
    var proms=(list||[]).map(function(att){
      if(att.type==="upload"&&att.file){
        return att.file.arrayBuffer().then(function(ab){
          var bytes=new Uint8Array(ab),binary="";
          for(var i=0;i<bytes.byteLength;i++)binary+=String.fromCharCode(bytes[i]);
          return {"@odata.type":"#microsoft.graph.fileAttachment",name:att.name,
            contentType:att.file.type||"application/octet-stream",contentBytes:btoa(binary)};
        }).catch(function(){return null;});
      }
      if(att.type==="template"&&att.url){
        return fetch(att.url).then(function(r){
          if(!r.ok)throw new Error("Nie mo\u017cna pobra\u0107 za\u0142\u0105cznika: "+att.name);
          var ct=r.headers.get("content-type")||"application/octet-stream";
          return r.blob().then(function(blob){
            return new Promise(function(resolve,reject){
              var reader=new FileReader();
              reader.onloadend=function(){
                var b64=String(reader.result).split(",")[1]||"";
                resolve({"@odata.type":"#microsoft.graph.fileAttachment",name:att.name,contentType:ct,contentBytes:b64});
              };
              reader.onerror=function(){reject(new Error("B\u0142\u0105d odczytu: "+att.name));};
              reader.readAsDataURL(blob);
            });
          });
        }).catch(function(e){console.error("Template file fetch error:",e);return null;}); // best-effort — nie blokuj wysyłki
      }
      return Promise.resolve(null);
    });
    return Promise.all(proms).then(function(arr){return arr.filter(Boolean);});
  }

  // Wysyła mail (opinia / instrukcja prania) bezpośrednio z aplikacji przez podłączoną skrzynkę Outlook
  // (Microsoft Graph), analogicznie do wysyłki faktury w module Faktury. Wymaga wcześniejszego
  // zalogowania w zakładce Poczta — tu tylko odświeżamy token w tle (silent).
  function sendTplEmail(){
    if(!mailKind)return;
    var toList=String(mailTo||"").split(/[,;]/).map(function(s){return s.trim();}).filter(Boolean);
    if(!toList.length){setMailErr("Podaj adres e-mail odbiorcy.");return;}
    setMailBusy(true);setMailErr(null);setMailMsg(null);
    var tokenRef=null;
    msalGetActiveAccount().then(function(acc){
      if(!acc){
        var e=new Error("Zaloguj si\u0119 do poczty (zak\u0142adka Poczta), a potem spr\u00f3buj ponownie.");
        e.code="MS_NO_ACCOUNT"; throw e;
      }
      return msalGetToken();
    }).then(function(token){
      tokenRef=token;
      return buildGraphAttachments(mailAttachments);
    }).then(function(graphAtts){
      var isHtml=/<[a-z][\s\S]*>/i.test(mailBodyText||"");
      var message={
        subject:mailSubject||"",
        body:{contentType:isHtml?"HTML":"Text",content:mailBodyText||""},
        toRecipients:toList.map(function(addr){return {emailAddress:{address:addr}};})
      };
      if(graphAtts&&graphAtts.length)message.attachments=graphAtts;
      return fetch("https://graph.microsoft.com/v1.0/me/sendMail",{
        method:"POST",
        headers:{"Authorization":"Bearer "+tokenRef,"Content-Type":"application/json"},
        body:JSON.stringify({message:message,saveToSentItems:true})
      });
    }).then(function(r){
      if(!r.ok){
        return r.json().catch(function(){return{};}).then(function(e){
          throw new Error(e.error&&e.error.message?e.error.message:"B\u0142\u0105d wysy\u0142ki ("+r.status+")");
        });
      }
      if(mailKind==="opinia")setReviewSent(true);
      else if(mailKind==="instrukcja")setWashingSent(true);
      setMailMsg("\u2705 Wiadomo\u015b\u0107 wys\u0142ana na "+toList.join(", "));
      setMailKind(null);
    }).catch(function(e){
      if(e&&e.code==="MS_NO_ACCOUNT")setMailErr(e.message);
      else if(e&&e.code==="MS_INTERACTION_REQUIRED")setMailErr("Sesja poczty wygas\u0142a \u2014 zaloguj si\u0119 ponownie w zak\u0142adce Poczta.");
      else setMailErr((e&&e.message)||"B\u0142\u0105d wysy\u0142ki");
    }).finally(function(){setMailBusy(false);});
  }

  function addToGcal(title,dateStr,calIdOvr,onSave){
    if(!gcalToken){alert("Zaloguj si\u0119 najpierw do Google Calendar.");return;}
    if(!calList.length){alert("Brak dost\u0119pnych kalendarzy.");return;}
    var pad=function(n){return String(n).padStart(2,"0");};
    var baseDate=dateStr?new Date(dateStr):new Date();
    var dateVal=baseDate.getFullYear()+"-"+pad(baseDate.getMonth()+1)+"-"+pad(baseDate.getDate());
    // Czy użytkownik wybrał godzinę inną niż północ
    var hasTime=dateStr&&dateStr.includes("T")&&!dateStr.endsWith("T00:00")&&!dateStr.endsWith("T00:00:00");
    var hh=hasTime?pad(baseDate.getHours()):"09";
    var mm=hasTime?pad(baseDate.getMinutes()):"00";
    var endHH=pad(Math.min(parseInt(hh,10)+1,23));
    // Auto-dopasuj kalendarz montazysta po nazwie
    var autoCalId=(function(){
      if(calIdOvr)return calIdOvr;
      if(installerName){
        var matched=calList.find(function(c){return c.summary&&c.summary.toLowerCase().indexOf(installerName.toLowerCase())>=0;});
        if(matched)return matched.id;
      }
      return (calList.find(function(c){return c.primary;})||calList[0]||{}).id||"primary";
    })();
    var calId=autoCalId;
    setGcalDraft({title:title,date:dateVal,timeFrom:hh+":"+mm,timeTo:endHH+":"+mm,note:"",calId:calId,saving:false,onSave:onSave||null});
  }

  function submitGcalDraft(){
    var dft=gcalDraft;
    if(!dft||dft.saving)return;
    if(!dft.date){alert("Podaj datę.");return;}
    setGcalDraft(function(d){return Object.assign({},d,{saving:true});});
    var pad=function(n){return String(n).padStart(2,"0");};
    var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    var startDt=new Date(dft.date+"T"+dft.timeFrom+":00");
    var endDt=new Date(dft.date+"T"+dft.timeTo+":00");
    if(endDt<=startDt)endDt=new Date(startDt.getTime()+60*60*1000);
    function fmtLocal(dt){return dt.getFullYear()+"-"+pad(dt.getMonth()+1)+"-"+pad(dt.getDate())+"T"+pad(dt.getHours())+":"+pad(dt.getMinutes())+":00";}
    var clData=cl||null;
    var clAddr=clData?[clData.addr,[clData.postal,clData.city].filter(Boolean).join(" ")].filter(Boolean).join(", "):"";
    var descParts=[];
    if(clData&&clData.name)descParts.push("Klient: "+clData.name);
    if(clAddr)descParts.push("Adres: "+clAddr);
    if(clData&&clData.phone)descParts.push("Tel: "+clData.phone);
    if(dft.note)descParts.push(dft.note);
    var eventBody={
      summary:dft.title+(clData?" — "+clData.name:""),
      description:descParts.join("\n"),
      location:clAddr||undefined,
      start:{dateTime:fmtLocal(startDt),timeZone:tz},
      end:{dateTime:fmtLocal(endDt),timeZone:tz}
    };
    var primaryCal=(calList.find(function(c){return c.primary;})||calList[0]||{}).id||"primary";
    var targets=[dft.calId];
    if(dft.calId!==primaryCal)targets.push(primaryCal);
    function postToCalendar(calId,tok){
      return fetch("https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calId)+"/events",{
        method:"POST",
        headers:{"Authorization":"Bearer "+tok,"Content-Type":"application/json"},
        body:JSON.stringify(eventBody)
      }).then(function(r){
        if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return postToCalendar(calId,fresh);});}
        if(!r.ok)return r.text().then(function(t){throw new Error(t);});
        return r.json();
      });
    }
    Promise.all(targets.map(function(cid){return postToCalendar(cid,gcalToken);}))
      .then(function(){
        var dtStr=dft.date+"T"+dft.timeFrom;
        if(dft.onSave)dft.onSave(dtStr);
        setGcalDraft(null);
        var msg="Dodano do kalendarza! ✅"+(targets.length>1?" ("+targets.length+" kalendarze)":"");
        alert(msg);
      })
      .catch(function(e){
        setGcalDraft(function(d){return Object.assign({},d,{saving:false});});
        alert("Błąd GCal: "+e.message);
      });
  }

  var INP={padding:"10px 12px",fontSize:13,border:"1px solid var(--bd2)",borderRadius:9,background:"var(--bg)",color:"var(--t1)",width:"100%",boxSizing:"border-box",outline:"none"};

  function CheckRow(rp){
    return ce("div",{
      style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,
        background:rp.checked?"rgba(124,58,237,0.08)":"transparent",
        border:"1px solid "+(rp.checked?"var(--t1)":"var(--bd2)"),
        transition:"all .15s",userSelect:"none"}
    },
      ce("div",{
        onClick:function(){rp.onChange(!rp.checked);},
        style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flex:1,minWidth:0}
      },
        ce("div",{style:{
          width:20,height:20,borderRadius:5,flexShrink:0,
          background:rp.checked?"var(--t1)":"transparent",
          border:"1.5px solid "+(rp.checked?"var(--t1)":"var(--bd2)"),
          display:"flex",alignItems:"center",justifyContent:"center",
          transition:"all .15s"
        }},rp.checked?ce("span",{style:{color:"#fff",fontSize:13,lineHeight:1}},"✓"):null),
        ce("div",null,
          ce("div",{style:{fontSize:13,fontWeight:rp.checked?600:400,color:"var(--t1)"}},(rp.checked?"✅ ":"")+rp.label),
          rp.sublabel?ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:1}},rp.sublabel):null
        )
      ),
      rp.action||null
    );
  }

  function SectionCard(rp){
    return ce("div",{style:{
      border:"1.5px solid "+(rp.done?"var(--t1)":"var(--bd2)"),
      borderRadius:14,overflow:"hidden",marginBottom:12,
      background:rp.done?"rgba(124,58,237,0.04)":"var(--bg2,#f8f8f6)",
      transition:"all .2s"
    }},
      ce("div",{style:{
        display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
        borderBottom:"1px solid "+(rp.done?"rgba(124,58,237,0.2)":"var(--bd2)"),
        background:rp.done?"rgba(124,58,237,0.07)":"transparent"
      }},
        ce("span",{style:{fontSize:16}},rp.icon),
        ce("span",{style:{fontSize:12,fontWeight:700,letterSpacing:"0.08em",color:rp.done?"var(--t1)":"var(--t2)",textTransform:"uppercase"}},(rp.done?"✓ ":"")+rp.title),
        rp.done?ce("span",{style:{marginLeft:"auto",fontSize:10,background:"var(--t1)",color:"#fff",borderRadius:20,padding:"2px 8px",fontWeight:600}},"ZROBIONE"):null
      ),
      ce("div",{style:{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}},
        rp.children
      )
    );
  }

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px"}},
    ce("div",{style:{background:"var(--bg)",width:"100%",maxWidth:660,borderRadius:18,maxHeight:"94vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}},

      ce("div",{style:{
        background:"linear-gradient(135deg,var(--t1) 0%,#0d9488 100%)",
        padding:"20px 22px 18px",borderRadius:"18px 18px 0 0",position:"relative"
      }},
        ce("button",{onClick:p.onClose,style:{position:"absolute",top:14,right:16,border:"none",background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:8,width:30,height:30,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}},"×"),
        ce("div",{style:{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.7)",marginBottom:4}},"KARTA DEALA"),
        ce("div",{style:{fontSize:22,fontWeight:700,color:"#fff",marginBottom:2}},clientName),
        ce("div",{style:{display:"flex",alignItems:"center",gap:12,marginTop:6,flexWrap:"wrap"}},
          ce("span",{style:{background:"rgba(255,255,255,0.2)",borderRadius:20,padding:"3px 12px",fontSize:12,color:"#fff",fontWeight:600}},
            (CRM_STAGES.find(function(s){return s.id===d.stage;})||{label:d.stage}).label
          ),
          clientTotal>0?ce("span",{style:{fontSize:14,color:"rgba(255,255,255,0.9)",fontWeight:700}},
            clientTotal.toLocaleString("pl-PL")+" zł"
          ):null,
          ce("div",{style:{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}},
            ce("button",{onClick:p.onGoToClient,style:{background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.4)",borderRadius:8,color:"#fff",fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}},
              "→ Karta klienta"
            ),
            // Wyrazisty (bialy, pelny) przycisk — glowne CTA karty deala, zeby bylo
            // od razu widac skrot do wyceny bez szukania w tle nagłówka.
            ce("button",{onClick:p.onGoToSummary,style:{background:"#fff",border:"none",borderRadius:8,color:"var(--t1)",fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}},
              "\uD83D\uDCCB Podsumowanie →"
            )
          )
        )
      ),

      ce("div",{style:{padding:"18px 20px 24px"}},

        quoteBreak.rooms.length>0?ce(SectionCard,{icon:"📋",title:"Podgląd wyceny"},
          ce("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:10}},
            quoteBreak.rooms.map(function(rm,i){
              return ce("div",{key:i,style:{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--t2)"}},
                ce("span",null,rm.name),
                ce("span",{style:{fontWeight:600,color:"var(--t1)"}},roundTo10(rm.total).toLocaleString("pl-PL")+" zł")
              );
            })
          ),
          ce("div",{style:{borderTop:"1px solid var(--bd2)",paddingTop:8,display:"flex",flexDirection:"column",gap:4}},
            montazRateD>0?ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--t3)"}},
              ce("span",null,"Bez montażu"),
              ce("span",null,quoteBezMontazu.toLocaleString("pl-PL")+" zł")
            ):null,
            montazRateD>0?ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--t3)"}},
              ce("span",null,"Montaż ("+Math.round(montazRateD*100)+"%)"),
              ce("span",null,quoteMontazVal.toLocaleString("pl-PL")+" zł")
            ):null,
            ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,color:"var(--t1)"}},
              ce("span",null,montazRateD>0?"Łącznie z montażem":"Łącznie"),
              ce("span",null,clientTotal.toLocaleString("pl-PL")+" zł")
            )
          )
        ):null,

        ce(SectionCard,{icon:"💰",title:"Ekonomia zlecenia",done:costsTotal>0},
          costErr?ce("div",{style:{fontSize:12,color:"var(--t3)",lineHeight:1.5}},
            "Moduł kosztów niedostępny — uruchom migrację 0034_deal_costs.sql w Supabase."
          ):ce(Fragment,null,
            // Lista zapisanych kosztow
            (costs||[]).length>0?ce("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:10}},
              (costs||[]).map(function(x){
                var km=costKindMeta(x.kind);
                var sub=[x.supplier||null,x.installer_name||null,x.paid_at?fmtDate(x.paid_at):null,
                  (x.planned_delivery&&x.actual_delivery&&x.actual_delivery>x.planned_delivery)?"⚠ dostawa +"+Math.round((new Date(x.actual_delivery)-new Date(x.planned_delivery))/86400000)+" dni":null
                ].filter(Boolean).join(" · ");
                return ce("div",{key:x.id,style:{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:9}},
                  ce("span",{style:{fontSize:14,flexShrink:0}},km.icon),
                  ce("div",{style:{flex:1,minWidth:0}},
                    ce("div",{style:{fontSize:12,fontWeight:600,color:"var(--t1)"}},km.label),
                    sub?ce("div",{style:{fontSize:10,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},sub):null
                  ),
                  ce("span",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",flexShrink:0}},
                    (parseFloat(x.amount)||0).toLocaleString("pl-PL")+" zł"),
                  ce("button",{onClick:function(){deleteCost(x.id);},
                    style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"2px 4px",flexShrink:0}},"×")
                );
              })
            ):ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:10}},"Brak zapisanych kosztów"),

            // Podsumowanie: koszty vs marza
            (costs||[]).length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",paddingTop:8,marginBottom:12,display:"flex",flexDirection:"column",gap:4}},
              COST_KINDS.filter(function(k){return costsByKind[k.id]>0;}).map(function(k){
                return ce("div",{key:k.id,style:{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--t3)"}},
                  ce("span",null,k.label),
                  ce("span",null,costsByKind[k.id].toLocaleString("pl-PL")+" zł"));
              }),
              ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:600,color:"var(--t2)"}},
                ce("span",null,"Koszty razem"),
                ce("span",null,costsTotal.toLocaleString("pl-PL")+" zł")),
              clientTotal>0?ce("div",{style:{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,
                color:marzaVal>=0?"var(--gr)":"var(--red, #ef4444)"}},
                ce("span",null,"Marża (orientacyjnie)"),
                ce("span",null,marzaVal.toLocaleString("pl-PL")+" zł · "+marzaPct+"%")):null,
              clientTotal>0?ce("div",{style:{fontSize:10,color:"var(--t3)",lineHeight:1.4}},
                "Liczona od wartości wyceny brutto, nie od faktury sprzedażowej."):null
            ):null,

            // Formularz dodania kosztu
            ce("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:"10px 12px",border:"1px dashed var(--bd2)",borderRadius:10}},
              ce("div",{style:{display:"flex",gap:8}},
                ce("select",{value:costDraft.kind,
                  onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{kind:v});});},
                  style:Object.assign({},INP,{flex:1})},
                  COST_KINDS.map(function(k){return ce("option",{key:k.id,value:k.id},k.icon+" "+k.label);})
                ),
                ce("input",{type:"text",inputMode:"decimal",value:costDraft.amount,placeholder:"kwota zł",
                  onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{amount:v});});},
                  style:Object.assign({},INP,{width:110,textAlign:"right"})})
              ),
              costDraft.kind==="montaz"
                ?ce("select",{value:costDraft.installer_name,
                    onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{installer_name:v});});},
                    style:INP},
                    INSTALLER_OPTIONS.map(function(o,i){return ce("option",{key:i,value:o},o||"— montażysta —");}))
                :ce("select",{value:costDraft.supplier,
                    onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{supplier:v});});},
                    style:INP},
                    COST_SUPPLIERS.map(function(o,i){return ce("option",{key:i,value:o},o||"— dostawca —");})),
              ce("div",{style:{display:"flex",gap:8}},
                ce("div",{style:{flex:1}},
                  ce("label",{style:{fontSize:10,color:"var(--t3)",display:"block",marginBottom:3}},"ZAPŁACONO"),
                  ce("input",{type:"date",value:costDraft.paid_at,
                    onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{paid_at:v});});},
                    style:INP})),
                costDraft.kind!=="montaz"?ce("div",{style:{flex:1}},
                  ce("label",{style:{fontSize:10,color:"var(--t3)",display:"block",marginBottom:3}},"DOSTAWA PLAN."),
                  ce("input",{type:"date",value:costDraft.planned_delivery,
                    onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{planned_delivery:v});});},
                    style:INP})):null,
                costDraft.kind!=="montaz"?ce("div",{style:{flex:1}},
                  ce("label",{style:{fontSize:10,color:"var(--t3)",display:"block",marginBottom:3}},"DOSTAWA FAKT."),
                  ce("input",{type:"date",value:costDraft.actual_delivery,
                    onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{actual_delivery:v});});},
                    style:INP})):null
              ),
              ce("input",{type:"text",value:costDraft.note,placeholder:"Uwagi (nr zamówienia, tkanina...)",
                onChange:function(ev){var v=ev.target.value;setCostDraft(function(s){return Object.assign({},s,{note:v});});},
                style:INP}),
              ce("button",{onClick:addCost,disabled:costBusy,
                style:{padding:"9px",borderRadius:9,border:"none",background:"var(--t1)",color:"#fff",
                  fontSize:12,fontWeight:700,cursor:costBusy?"not-allowed":"pointer",opacity:costBusy?0.6:1}},
                costBusy?"⏳ Zapisuję...":"+ Dodaj koszt")
            )
          )
        ),

        ce(SectionCard,{icon:"📅",title:"Spotkanie",done:visitDone},
          ce("div",{style:{display:"flex",gap:8,alignItems:"center"}},
            visitDate?ce("div",{style:{fontSize:13,color:"var(--t1)",flex:1}},
              "📅 "+fmtDate(visitDate)+(visitDate.length>10?" "+visitDate.slice(11,16):"")
            ):ce("div",{style:{fontSize:13,color:"var(--t3)",flex:1}},"Brak terminu"),
            gcalToken?ce("button",{
              onClick:function(){addToGcal("Spotkanie pomiarowe",visitDate,"",function(dt){setVisitDate(dt);});},
              title:"Ustaw termin i dodaj do Google Calendar",
              style:{padding:"8px 14px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg)",cursor:"pointer",fontSize:13,fontWeight:600,flexShrink:0,color:"var(--t1)"}
            },"📅 "+ (visitDate?"Zmień":"Ustaw termin")):null
          ),
          ce("div",null,
            ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"SKĄD KLIENT"),
            ce("select",{value:acquisition,onChange:function(ev){setAcquisition(ev.target.value);},style:INP},
              ACQUISITION_OPTIONS.map(function(o,i){return ce("option",{key:i,value:o},o||"— wybierz —");})
            )
          ),
          ce(CheckRow,{checked:visitDone,onChange:setVisitDone,label:"Spotkanie odbyło się",sublabel:visitDate?("Zaplanowane: "+fmtDate(visitDate)):null})
        ),

        ce(SectionCard,{icon:"🔧",title:"Montaż",done:installDone},
          ce("div",{style:{display:"flex",gap:8,alignItems:"center"}},
            delivDate?ce("div",{style:{fontSize:13,color:"var(--t1)",flex:1}},
              "📅 "+fmtDate(delivDate)+(delivDate.length>10?" "+delivDate.slice(11,16):"")
            ):ce("div",{style:{fontSize:13,color:"var(--t3)",flex:1}},"Brak terminu"),
            gcalToken?ce("button",{
              onClick:function(){addToGcal("Montaż",delivDate,"",function(dt){setDelivDate(dt);});},
              title:"Ustaw termin i dodaj do Google Calendar",
              style:{padding:"8px 14px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg)",cursor:"pointer",fontSize:13,fontWeight:600,flexShrink:0,color:"var(--t1)"}
            },"📅 "+(delivDate?"Zmień":"Ustaw termin")):null
          ),
          ce("div",{style:{display:"flex",gap:8}},
            ce("div",{style:{flex:1}},
              ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"MONTAŻYSTA"),
              ce("select",{value:installerName,onChange:function(ev){setInstallerName(ev.target.value);},style:INP},
                INSTALLER_OPTIONS.map(function(o,i){return ce("option",{key:i,value:o},o||"— wybierz —");})
              )
            ),
            null
          ),
          ce(CheckRow,{checked:installDone,onChange:setInstallDone,label:"Montaż zrealizowany",sublabel:delivDate?("Zaplanowany: "+fmtDate(delivDate)+(installerName?" — "+installerName:"")):null}),

          ce("div",{style:{borderTop:"1px dashed var(--bd2)",marginTop:4,paddingTop:10}},
            ce("div",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.08em",color:"var(--t2)",textTransform:"uppercase",marginBottom:8}},"TERMIN 2 (np. elektryk / inny)"),
            ce("div",{style:{display:"flex",gap:8,alignItems:"center"}},
              delivDate2?ce("div",{style:{fontSize:13,color:"var(--t1)",flex:1}},
                "📅 "+fmtDate(delivDate2)+(delivDate2.length>10?" "+delivDate2.slice(11,16):"")
              ):ce("div",{style:{fontSize:13,color:"var(--t3)",flex:1}},"Brak terminu"),
              gcalToken?ce("button",{
                onClick:function(){addToGcal(installLabel2||"Montaż 2",delivDate2,installerCalId2||installerCalId,function(dt){setDelivDate2(dt);});},
                title:"Ustaw termin i dodaj do Google Calendar",
                style:{padding:"8px 14px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg)",cursor:"pointer",fontSize:13,fontWeight:600,flexShrink:0,color:"var(--t1)"}
              },"📅 "+(delivDate2?"Zmień":"Ustaw termin")):null
            ),
            ce("div",{style:{display:"flex",gap:8}},
              ce("div",{style:{flex:1}},
                ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"OPIS (np. elektryk, prasowanie)"),
                ce("input",{type:"text",value:installLabel2,onChange:function(ev){setInstallLabel2(ev.target.value);},placeholder:"np. Elektryk, Prasowanie...",style:INP})
              )
            ),
            ce("div",{style:{display:"flex",gap:8}},
              ce("div",{style:{flex:1}},
                ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"MONTAŻYSTA"),
                ce("select",{value:installerName2,onChange:function(ev){setInstallerName2(ev.target.value);},style:INP},
                  INSTALLER_OPTIONS.map(function(o,i){return ce("option",{key:i,value:o},o||"— wybierz —");})
                )
              ),
     null
            )
          )
        ),

        ce(SectionCard,{icon:"✂️",title:"Zamówienie szycia",done:sewingConfirmed},
          ce("div",null,
            ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"SZWALNIA"),
            ce("select",{value:sewingHouse,onChange:function(ev){setSewingHouse(ev.target.value);},style:INP},
              ce("option",{value:""},"— wybierz szwalnię —"),
              SEWING_HOUSES_OPT.map(function(o,i){return ce("option",{key:i,value:o},o);}),
              ce("option",{value:"__custom__"},"— inna (wpisz) —")
            )
          ),
          sewingHouse==="__custom__"?ce("input",{type:"text",placeholder:"Nazwa szwalni...",onChange:function(ev){setSewingHouse(ev.target.value);},style:INP}):null,
          ce("div",null,
            ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"DATA WYSŁANIA ZLECENIA"),
            ce("input",{type:"date",value:sewingSentDate,onChange:function(ev){setSewingSentDate(ev.target.value);},style:INP})
          ),
          ce(CheckRow,{checked:sewingConfirmed,onChange:setSewingConfirmed,label:"Zlecenie szycia potwierdzone przez szwalnię",sublabel:sewingHouse&&sewingHouse!=="__custom__"?sewingHouse:null})
        ),

        ce(SectionCard,{icon:"🌟",title:"Obsługa posprzedażowa",done:reviewSent&&invoiceSent&&washingSent},
          ce(CheckRow,{
            checked:reviewSent,onChange:setReviewSent,label:"Wysłano prośbę o opinię",sublabel:"Google / Facebook / referencja",
            action:cl?ce("button",{
              onClick:function(ev){ev.stopPropagation();openMailTplModal("opinia");},
              title:"Wyślij prośbę o opinię mailem",
              style:{flexShrink:0,padding:"6px 10px",borderRadius:8,border:"1px solid var(--violet, #7c3aed)",background:"var(--bg)",color:"var(--violet, #7c3aed)",cursor:"pointer",fontSize:11,fontWeight:600}
            },"✉ Wyślij"):null
          }),
          ce(CheckRow,{
            checked:washingSent,onChange:setWashingSent,label:"Wysłano instrukcję prania",sublabel:"Pielęgnacja i konserwacja tkanin",
            action:cl?ce("button",{
              onClick:function(ev){ev.stopPropagation();openMailTplModal("instrukcja");},
              title:"Wyślij instrukcję prania i czyszczenia mailem",
              style:{flexShrink:0,padding:"6px 10px",borderRadius:8,border:"1px solid var(--violet, #7c3aed)",background:"var(--bg)",color:"var(--violet, #7c3aed)",cursor:"pointer",fontSize:11,fontWeight:600}
            },"✉ Wyślij"):null
          }),
          ce(CheckRow,{checked:invoiceSent,onChange:setInvoiceSent,label:"Wysłano fakturę (FV)",sublabel:"Dokument księgowy do klienta"})
        ),

        ce("div",{style:{marginBottom:12}},
          ce("label",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"var(--t2)",textTransform:"uppercase",display:"block",marginBottom:6}},"NOTATKI"),
          ce("textarea",{value:notes,onChange:function(ev){setNotes(ev.target.value);},rows:3,placeholder:"Uwagi, szczegóły rozmowy...",style:Object.assign({},INP,{resize:"vertical",lineHeight:1.6})})
        ),

        ce("div",{style:{marginBottom:16}},
          ce("div",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"var(--t2)",textTransform:"uppercase",marginBottom:8}},"ZAŁĄCZNIKI"),
          attachments.map(function(a){
            return ce("div",{key:a.id,style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
              ce("a",{href:a.url,target:"_blank",rel:"noopener noreferrer",style:{flex:1,fontSize:12,color:"var(--t1)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},a.name||a.url),
              ce("button",{onClick:function(){deleteAttach(a.id);},style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"2px 4px"}},"×")
            );
          }),
          ce("label",{style:{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,border:"1px dashed var(--bd2)",cursor:"pointer",fontSize:12,color:"var(--t2)"}},
            ce("input",{type:"file",style:{display:"none"},onChange:function(ev){var f=ev.target.files&&ev.target.files[0];if(f)uploadFile(f);ev.target.value="";}}),
            uploading?"⏳ Wgrywam...":"⬆ Dodaj plik PDF / zdjęcie"
          )
        ),

        ce("div",{style:{display:"flex",gap:8}},
          ce("button",{
            onClick:save,disabled:busy,
            style:{flex:1,padding:"13px",borderRadius:11,border:"none",background:"var(--t1)",color:"#fff",fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer",opacity:busy?0.6:1}
          },busy?"⏳ Zapisuję...":"Zapisz zmiany"),
          ce("button",{
            onClick:function(){if(confirm("Usunąć tego deala?"))p.onDelete();},
            style:{padding:"13px 16px",borderRadius:11,border:"1px solid #fca5a5",background:"transparent",color:"#ef4444",fontSize:13,cursor:"pointer",fontWeight:600}
          },"🗑")
        )

      )
    )
    ,

    // Modal: wysyłka maila (Opinia / Instrukcja prania) wg szablonu z bazy — analogicznie do wysyłki faktury w module Faktury
    mailKind?ce("div",{
      onClick:function(){if(!mailBusy)setMailKind(null);},
      style:{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:3200,
        background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}
    },
      ce("div",{
        onClick:function(ev){ev.stopPropagation();},
        style:{background:"var(--bg)",borderRadius:18,width:"100%",maxWidth:560,
          maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}
      },
        // Nagłówek
        ce("div",{style:{
          display:"flex",alignItems:"center",gap:12,padding:"18px 22px",
          borderBottom:"1px solid var(--bd2)",position:"sticky",top:0,background:"var(--bg)",
          borderRadius:"18px 18px 0 0",zIndex:1
        }},
          ce("div",{style:{
            width:38,height:38,borderRadius:10,flexShrink:0,fontSize:18,
            background:"rgba(124,58,237,0.12)",display:"flex",alignItems:"center",justifyContent:"center"
          }},"📤"),
          ce("div",{style:{flex:1,minWidth:0}},
            ce("div",{style:{fontSize:15,fontWeight:800,color:"var(--t1)"}},
              mailKind==="opinia"?"Prośba o opinię":"Instrukcja prania i czyszczenia"
            ),
            ce("div",{style:{fontSize:12,color:"var(--t3)",marginTop:1}},"Wysyłka przez Outlooka (Microsoft Graph)")
          ),
          ce("button",{onClick:function(){setMailKind(null);},disabled:mailBusy,
            style:{border:"none",background:"var(--bg2, #f1f1ee)",color:"var(--t2)",borderRadius:8,
              width:30,height:30,fontSize:16,cursor:mailBusy?"not-allowed":"pointer",flexShrink:0,lineHeight:1}
          },"×")
        ),
        // Treść
        ce("div",{style:{padding:"18px 22px 22px",display:"flex",flexDirection:"column",gap:14}},
          ce("div",null,
            ce("label",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"var(--t2)",textTransform:"uppercase",display:"block",marginBottom:6}},"Do"),
            ce("input",{value:mailTo,onChange:function(ev){setMailTo(ev.target.value);},
              placeholder:"adres@email.pl, drugi@email.pl",style:INP}),
            ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:5}},
              "Możesz dodać kilka adresów oddzielając przecinkiem — np. mąż/żona klientki")
          ),
          ce("div",null,
            ce("label",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"var(--t2)",textTransform:"uppercase",display:"block",marginBottom:6}},"Temat"),
            ce("input",{value:mailSubject,onChange:function(ev){setMailSubject(ev.target.value);},style:INP})
          ),
          ce("div",{style:{display:"flex",flexDirection:"column",flex:1,minHeight:0}},
            ce("label",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"var(--t2)",textTransform:"uppercase",display:"block",marginBottom:6}},"Treść"),
            ce(RichTextEditor,{value:mailBodyText,onChange:setMailBodyText,minHeight:200,bg:"var(--bg2)",
              placeholder:"Wpisz treść wiadomości…"})
          ),
          ce("div",null,
            ce("label",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"var(--t2)",textTransform:"uppercase",display:"block",marginBottom:6}},"Załączniki"),
            mailAttachments.length===0?ce("div",{style:{fontSize:12,color:"var(--t3)",fontStyle:"italic",marginBottom:8}},"Brak załączników"):null,
            ce("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:8}},
              mailAttachments.map(function(a){
                return ce("div",{key:a.id,style:{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                  borderRadius:9,background:"var(--bg2, #f4f4f2)",border:"1px solid var(--bd2)"}},
                  ce("span",{style:{fontSize:14}},a.type==="upload"?"📎":"📄"),
                  ce("span",{style:{flex:1,fontSize:12,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},a.name),
                  a.size?ce("span",{style:{fontSize:11,color:"var(--t3)",flexShrink:0}},Math.round(a.size/1024)+" KB"):null,
                  ce("button",{onClick:function(){removeMailAttachment(a.id);},
                    style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:15,padding:"2px 4px",flexShrink:0}},"×")
                );
              })
            ),
            ce("label",{style:{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:9,
              border:"1px dashed var(--bd2)",cursor:"pointer",fontSize:12,color:"var(--t2)",fontWeight:600}},
              ce("input",{type:"file",style:{display:"none"},onChange:function(ev){var f=ev.target.files&&ev.target.files[0];if(f)addManualAttachment(f);ev.target.value="";}}),
              "⬆ Dodaj załącznik"
            )
          ),
          mailMsg?ce("div",{style:{padding:"10px 14px",background:"var(--grl, rgba(16,185,129,0.12))",
            borderRadius:9,fontSize:13,color:"var(--gr, #059669)"}},mailMsg):null,
          mailErr?ce("div",{style:{padding:"10px 14px",background:"var(--red-l, rgba(239,68,68,0.12))",
            borderRadius:9,fontSize:13,color:"var(--red, #dc2626)"}},"⚠️ "+mailErr):null,
          ce("div",{style:{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:6,borderTop:"1px solid var(--bd2)"}},
            ce("button",{onClick:function(){setMailKind(null);},disabled:mailBusy,
              style:{padding:"11px 20px",borderRadius:10,border:"1px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:13,fontWeight:600,cursor:mailBusy?"not-allowed":"pointer"}},"Anuluj"),
            ce("button",{onClick:sendTplEmail,disabled:mailBusy||!mailSubject.trim()||!mailTo.trim(),
              style:{padding:"11px 22px",borderRadius:10,border:"none",background:"var(--t1)",color:"#fff",fontSize:13,fontWeight:700,
                cursor:(mailBusy||!mailSubject.trim()||!mailTo.trim())?"not-allowed":"pointer",opacity:(mailBusy||!mailSubject.trim()||!mailTo.trim())?0.6:1}},
              mailBusy?"⏳ Wysyłam...":"📤 Wyślij")
          )
        )
      )
    ):null

    ,

    gcalDraft?ce("div",{
      style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:3100,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px"},
      onClick:function(ev){if(ev.target===ev.currentTarget)setGcalDraft(null);}
    },
      ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:24,width:"100%",maxWidth:380,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}},
        ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:4}},"📅 Dodaj do kalendarza"),
        // Podsumowanie terminu (tylko info, nie edytowalne)
        ce("div",{style:{marginBottom:12}},
          ce("label",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",display:"block",marginBottom:4}},"DATA"),
          ce("input",{type:"date",value:gcalDraft.date,style:Object.assign({},INP),
            onChange:function(ev){setGcalDraft(function(d){return Object.assign({},d,{date:ev.target.value});});}})
        ),
        ce("div",{style:{display:"flex",gap:8,marginBottom:12}},
          ce("div",{style:{flex:1}},
            ce("label",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",display:"block",marginBottom:4}},"OD"),
            ce("select",{value:gcalDraft.timeFrom,style:Object.assign({},INP),
              onChange:function(ev){setGcalDraft(function(d){return Object.assign({},d,{timeFrom:ev.target.value});});}},
              (function(){var opts=[];for(var h=6;h<22;h++){["00","15","30","45"].forEach(function(m){opts.push(String(h).padStart(2,"0")+":"+m);});}return opts.map(function(o){return ce("option",{key:o,value:o},o);});})())
          ),
          ce("div",{style:{flex:1}},
            ce("label",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",display:"block",marginBottom:4}},"DO"),
            ce("select",{value:gcalDraft.timeTo,style:Object.assign({},INP),
              onChange:function(ev){setGcalDraft(function(d){return Object.assign({},d,{timeTo:ev.target.value});});}},
              (function(){var opts=[];for(var h=6;h<24;h++){["00","15","30","45"].forEach(function(m){opts.push(String(h).padStart(2,"0")+":"+m);});}return opts.map(function(o){return ce("option",{key:o,value:o},o);});})())
          )
        ),
        // Uwaga
        ce("div",{style:{marginBottom:16}},
          ce("label",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",display:"block",marginBottom:4}},"UWAGA (opcjonalnie)"),
          ce("input",{type:"text",value:gcalDraft.note,placeholder:"np. dzie\u0144 wcze\u015bniej zadzwoni\u0107...",style:Object.assign({},INP),autoFocus:true,
            onChange:function(ev){setGcalDraft(function(d){return Object.assign({},d,{note:ev.target.value});});},
            onKeyDown:function(ev){if(ev.key==="Enter")submitGcalDraft();if(ev.key==="Escape")setGcalDraft(null);}})
        ),
        // Info kalendarze
        ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:16,padding:"8px 10px",background:"var(--bg2)",borderRadius:8}},
          "📅 Dodaje do: ",
          (function(){
            var primaryCal=(calList.find(function(c){return c.primary;})||calList[0]||{});
            var instCal=calList.find(function(c){return c.id===gcalDraft.calId;});
            var labels=[];
            if(instCal&&instCal.id!==primaryCal.id)labels.push(instCal.summary||installerName||gcalDraft.calId);
            labels.push(primaryCal.summary||"primary");
            return labels.join(" + ");
          })()
        ),
        // Przyciski
        ce("div",{style:{display:"flex",gap:8}},
          ce("button",{
            onClick:function(){setGcalDraft(null);},
            style:{flex:1,padding:"10px",borderRadius:9,border:"1px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:13,cursor:"pointer"}
          },"Anuluj"),
          ce("button",{
            onClick:submitGcalDraft,
            disabled:gcalDraft.saving,
            style:{flex:2,padding:"10px",borderRadius:9,border:"none",background:"#4285f4",color:"#fff",fontSize:13,fontWeight:700,cursor:gcalDraft.saving?"wait":"pointer"}
          },gcalDraft.saving?"⏳ Dodaję...":"✅ Dodaj do kalendarza")
        )
      )
    ):null
  );
}

// ── CRM KALENDARZ ────────────────────────────────────────────────────────────
// Stałe re-eksportowane z gcal.js dla wstecznej kompatybilności
export { GCAL_CLIENT_ID, GCAL_SCOPES };

export function CRMKalendarz(p){
  // p: deals, clients, onDealClick
  // Token i GSI przekazywane z ScreenCRM (przeżywają przełączanie zakładek)
  var gcalToken=p.gcalToken, setGcalToken=p.setGcalToken, gsiReady=p.gsiReady;
  var sEvents=useState([]),gcalEvents=sEvents[0],setGcalEvents=sEvents[1];
  var sLoadingEv=useState(false),loadingEv=sLoadingEv[0],setLoadingEv=sLoadingEv[1];
  var sErrEv=useState(null),errEv=sErrEv[0],setErrEv=sErrEv[1];
  var sView=useState("week"),calView=sView[0],setCalView=sView[1];
  var sRefDate=useState(function(){return new Date();}),refDate=sRefDate[0],setRefDate=sRefDate[1];
  var sNewEv=useState(null),newEvDraft=sNewEv[0],setNewEvDraft=sNewEv[1];
  var sCalList=useState([]),calList=sCalList[0],setCalList=sCalList[1];
  var sSelGcalEv=useState(null),selectedGcalEv=sSelGcalEv[0],setSelectedGcalEv=sSelGcalEv[1];
  var sSelDeal=useState(null),selectedDeal=sSelDeal[0],setSelectedDeal=sSelDeal[1];
  var sCalendarDeals=useState(p.deals||[]),calendarDeals=sCalendarDeals[0],setCalendarDeals=sCalendarDeals[1];
  var sDragOver=useState(null),dragOverDay=sDragOver[0],setDragOverDay=sDragOver[1];
  var dragEvRef=React.useRef(null);
  function openDealEventPreview(ev){
    var deal=ev.deal,client=(p.clients||[]).find(function(c){return String(c.id)===String(deal.client_id);})||{};
    var address=[client.addr,[client.postal,client.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    var start=new Date(ev.date),end=new Date(start.getTime()+3600000);
    setSelectedGcalEv({id:"crm-"+deal.id+"-"+ev.type,summary:ev.label+" — "+ev.client,start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()},location:address,description:["Klient: "+(client.name||ev.client),client.phone?"Telefon: "+client.phone:null,deal.installer_name?"Montażysta: "+deal.installer_name:null].filter(Boolean).join("\n"),_calName:"Termin z CRM",_readOnly:false,_crmDealId:deal.id,_crmDateField:ev.type==="visit"?"visit_date":(ev.type==="delivery2"?"delivery_date2":(ev.type==="delivery"?"delivery_date":"followup_date"))});
  }

  // Fetch zdarzeń gdy mamy token i zmienia się refDate/view
  React.useEffect(function(){
    if(!gcalToken) return;
    fetchCalendarList(gcalToken);
  },[gcalToken, refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), calView]);

  function fetchCalendarList(token){
    function doFetch(t){
      return fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",{
        headers:{Authorization:"Bearer "+t}
      });
    }
    doFetch(token)
      .then(function(r){
        if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return doFetch(fresh);});}
        return r;
      })
      .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
      .then(function(data){
        var items=(data.items||[]).map(function(c){
          return {id:c.id,summary:c.summary,color:c.backgroundColor||"#4285f4",primary:!!c.primary};
        });
        // primary first, then alphabetic
        items.sort(function(a,b){
          if(a.primary&&!b.primary)return -1;
          if(!a.primary&&b.primary)return 1;
          return (a.summary||"").localeCompare(b.summary||"","pl");
        });
        setCalList(items);
        // Przekaż świeżo pobraną listę bezpośrednio — stan React może być
        // jeszcze nieaktualny, co wcześniej powodowało brak części wydarzeń
        // przy pierwszym wejściu do kalendarza.
        fetchEvents(token, items);
      })
      .catch(function(){});
  }

  function login(){
    if(!gsiReady){setErrEv("Biblioteka Google jeszcze się ładuje, spróbuj za chwilę.");return;}
    gcalLogin().then(function(tok){
      setGcalToken(tok);
      setErrEv(null);
    }).catch(function(e){
      setErrEv("Błąd logowania: "+(e.message||"nieznany"));
    });
  }

  function logout(){
    gcalLogout().finally(function(){
      setGcalToken(null);
      setGcalEvents([]);
    });
  }

  function fetchEvents(token, calendarsOverride){
    setLoadingEv(true);setErrEv(null);
    // Oblicz zakres dat wg widoku
    var from,to;
    if(calView==="week"){
      var dow=refDate.getDay();
      var mon=new Date(refDate);mon.setDate(refDate.getDate()-(dow===0?6:dow-1));mon.setHours(0,0,0,0);
      var sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,999);
      from=mon;to=sun;
    } else if(calView==="day"){
      from=new Date(refDate);from.setHours(0,0,0,0);
      to=new Date(refDate);to.setHours(23,59,59,999);
    } else {
      from=new Date(refDate.getFullYear(),refDate.getMonth(),1);
      to=new Date(refDate.getFullYear(),refDate.getMonth()+1,0,23,59,59,999);
    }
    // Lista kalendarzy do odpytania: jeśli mamy listę, pobierz ze wszystkich; w przeciwnym razie tylko primary
    var calsToFetch = calendarsOverride&&calendarsOverride.length
      ? calendarsOverride
      : (calList.length>0 ? calList : [{id:"primary",summary:"",color:"#4285f4",primary:true}]);
    function buildUrl(calId){
      return "https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calId)+"/events"
        +"?timeMin="+encodeURIComponent(from.toISOString())
        +"&timeMax="+encodeURIComponent(to.toISOString())
        +"&singleEvents=true&orderBy=startTime&maxResults=200";
    }
    function doFetchOne(calMeta,t){
      return fetch(buildUrl(calMeta.id),{headers:{Authorization:"Bearer "+t}})
        .then(function(r){
          if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return fetch(buildUrl(calMeta.id),{headers:{Authorization:"Bearer "+fresh}});});}
          return r;
        })
        .then(function(r){if(!r.ok)return {items:[]};return r.json();})
        .then(function(data){
          return (data.items||[]).map(function(ev){
            return Object.assign({},ev,{_calId:calMeta.id,_calColor:calMeta.color,_calName:calMeta.summary,_calPrimary:!!calMeta.primary});
          });
        })
        .catch(function(){return [];});
    }
    Promise.all(calsToFetch.map(function(c){return doFetchOne(c,token);}))
      .then(function(arrays){
        var merged=[];
        arrays.forEach(function(a){merged=merged.concat(a);});
        // Ten sam termin bywa obecny w kalendarzu głównym i kalendarzu
        // montażysty jako dwie kopie z różnymi ID. Nie pokazuj duplikatu,
        // ale preferuj wpis z kalendarza głównego.
        var unique={};
        merged.forEach(function(ev){
          var start=ev.start&&(ev.start.dateTime||ev.start.date)||"";
          var end=ev.end&&(ev.end.dateTime||ev.end.date)||"";
          var key=[ev.summary||"",start,end,ev.location||""].join("\u001f");
          var current=unique[key];
          if(!current || (ev._calPrimary && !current._calPrimary)) unique[key]=ev;
        });
        setGcalEvents(Object.keys(unique).map(function(k){return unique[k];}));
        setLoadingEv(false);
      })
      .catch(function(e){
        setLoadingEv(false);
        if(e&&e.code==="GCAL_INTERACTION_REQUIRED"){
          setGcalToken(null);
          setErrEv("Sesja Google wygasła — zaloguj się ponownie.");
        } else {
          setErrEv("Błąd pobierania kalendarza.");
        }
      });
  }

  // Zbierz terminy z dealów
  var now=new Date();
  var dealEvents=[];
  calendarDeals.forEach(function(deal){
    var cl=p.clients.find(function(c){return String(c.id)===String(deal.client_id);})||null;
    var name=cl?cl.name:"Klient";
    if(deal.visit_date){dealEvents.push({date:new Date(deal.visit_date),label:"\uD83D\uDCCF Pomiar",client:name,deal:deal,color:"#3b82f6",type:"visit"});}
    if(deal.delivery_date){dealEvents.push({date:new Date(deal.delivery_date),label:"\uD83D\uDE9A Realizacja",client:name,deal:deal,color:"#10b981",type:"delivery"});}
    if(deal.delivery_date2){dealEvents.push({date:new Date(deal.delivery_date2),label:"\uD83D\uDD27 "+(deal.install_label2||"Termin 2"),client:name,deal:deal,color:"#8b5cf6",type:"delivery2"});}
    if(deal.followup_date){dealEvents.push({date:new Date(deal.followup_date),label:"\u23F0 Follow-up",client:name,deal:deal,color:"#f59e0b",type:"followup"});}
  });
  dealEvents.sort(function(a,b){return a.date-b.date;});
  var upcoming=dealEvents.filter(function(e){return e.date>=now;});

  function addDealEventToGcal(ev){
    if(!gcalToken){alert("Zaloguj si\u0119 najpierw do Google Calendar.");return;}
    var d=ev.date;
    
    // Jeśli to montaż i deal ma przypisany kalendarz montażysty -> użyj go
    var clData=(p.clients||[]).find(function(c){return ev.deal&&String(c.id)===String(ev.deal.client_id);})||null;
    var targetCalId = "primary";
    var clAddr=clData?[clData.addr,[clData.postal,clData.city].filter(Boolean).join(" ")].filter(Boolean).join(", "):"";
    var descParts=["Klient: "+ev.client];
    if(clAddr)descParts.push("Adres: "+clAddr);
    if(clData&&clData.phone)descParts.push("Tel: "+clData.phone);
    if(ev.deal&&ev.deal.title)descParts.push("Deal: "+ev.deal.title);
    
    if(ev.type==="delivery"&&ev.deal&&ev.deal.installer_calendar_id){
      targetCalId = ev.deal.installer_calendar_id;
      var installerCal = calList.find(function(c){return c.id===ev.deal.installer_calendar_id;});
      if(installerCal) descParts.push("Monta\u017cysta: "+installerCal.summary);
    }
    if(ev.type==="delivery2"&&ev.deal&&ev.deal.installer_calendar_id2){
      targetCalId = ev.deal.installer_calendar_id2;
      var installerCal2 = calList.find(function(c){return c.id===ev.deal.installer_calendar_id2;});
      if(installerCal2) descParts.push("Monta\u017cysta: "+installerCal2.summary);
    }
    
    var body={
      summary:ev.label+" \u2014 "+ev.client,
      description:descParts.join(" | "),
      location:clAddr||undefined,
      start:{dateTime:d.toISOString(),timeZone:"Europe/Warsaw"},
      end:{dateTime:new Date(d.getTime()+60*60000).toISOString(),timeZone:"Europe/Warsaw"}
    };
    function doPost(t){
      return fetch("https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(targetCalId)+"/events",{
        method:"POST",
        headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
    }
    doPost(gcalToken)
      .then(function(r){
        if(r.status===401){
          return gcalGetToken().then(function(fresh){
            setGcalToken(fresh);
            return doPost(fresh);
          });
        }
        return r;
      })
      .then(function(r){
        if(!r.ok)throw new Error("HTTP "+r.status);
        return r.json();
      })
      .then(function(){
        fetchEvents(gcalToken);
        alert("Dodano do Google Calendar!");
      })
      .catch(function(e){
        if(e&&e.code==="GCAL_INTERACTION_REQUIRED"){
          setGcalToken(null);
          alert("Sesja Google wygasła — zaloguj się ponownie.");
        } else {
          alert("B\u0142\u0105d dodawania zdarzenia.");
        }
      });
  }

  function openNewEventModal(defaultDate){
    var d=defaultDate||new Date();
    var pad=function(n){return String(n).padStart(2,'0');};
    var dateStr=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    var h=d.getHours();
    // Domyślnie zaznaczony: primary jeśli istnieje, inaczej pierwszy z listy
    var defaultCals=[];
    var primary=calList.find(function(c){return c.primary;});
    if(primary) defaultCals=[primary.id];
    else if(calList.length>0) defaultCals=[calList[0].id];
    setNewEvDraft({title:'',date:dateStr,timeFrom:pad(h)+':00',timeTo:pad(Math.min(h+1,23))+':00',description:'',saving:false,selectedCals:defaultCals});
  }

  function openEditEventModal(ev){
    var startDT=ev.start&&(ev.start.dateTime||ev.start.date);
    var endDT=ev.end&&(ev.end.dateTime||ev.end.date);
    var isAllDay=!!(ev.start&&ev.start.date&&!ev.start.dateTime);
    var pad=function(n){return String(n).padStart(2,'0');};
    var d=startDT?new Date(startDT):new Date();
    var dateStr=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    var timeFrom=isAllDay?'09:00':pad(d.getHours())+':'+pad(d.getMinutes());
    var dEnd=endDT?new Date(endDT):new Date(d.getTime()+60*60*1000);
    var timeTo=isAllDay?'10:00':pad(dEnd.getHours())+':'+pad(dEnd.getMinutes());
    var calId=ev._calId||'primary';
    setNewEvDraft({title:ev.summary||'',date:dateStr,timeFrom:timeFrom,timeTo:timeTo,
      description:ev.description||'',saving:false,selectedCals:[calId],
      _editId:ev.id,_editCalId:calId,_crmDealId:ev._crmDealId||null,
      _crmDateField:ev._crmDateField||null});
    setSelectedGcalEv(null);
  }

  function toggleCalInDraft(calId){
    setNewEvDraft(function(d){
      if(!d) return d;
      var cur=d.selectedCals||[];
      var next=cur.indexOf(calId)>=0 ? cur.filter(function(x){return x!==calId;}) : cur.concat([calId]);
      return Object.assign({},d,{selectedCals:next});
    });
  }

  function addCustomEvent(){
    if(!gcalToken){alert('Zaloguj si\u0119 najpierw do Google Calendar.');return;}
    var ev=newEvDraft;
    if(!ev.title.trim()){alert('Podaj tytu\u0142 zdarzenia.');return;}
    if(!ev.date){alert('Podaj dat\u0119.');return;}
    var start=new Date(ev.date+'T'+ev.timeFrom+':00');
    var end=new Date(ev.date+'T'+ev.timeTo+':00');
    if(end<=start){alert('Godzina zako\u0144czenia musi by\u0107 p\u00f3\u017aniejsza ni\u017c rozpocz\u0119cia.');return;}
    // ── TRYB EDYCJI ──
    if(ev._editId){
      // Termin z CRM nie jest wydarzeniem Google — zapisujemy go w dealu.
      // Próba PATCH na sztucznym identyfikatorze "crm-..." kończyła się
      // komunikatem „Błąd edycji wydarzenia”.
      if(ev._crmDealId){
        var crmPatch={};
        // CRM terms are stored as timestamps. The previous fix sent only
        // YYYY-MM-DD, so changing the hour appeared to save but was lost.
        var crmDateTime=new Date(ev.date+"T"+ev.timeFrom+":00");
        crmPatch[ev._crmDateField||"delivery_date"]=crmDateTime.toISOString();
        setNewEvDraft(function(d){return Object.assign({},d,{saving:true});});
        sbApi.updateDeal(ev._crmDealId,crmPatch)
          .then(function(){
            setCalendarDeals(function(deals){
              return deals.map(function(deal){
                return String(deal.id)===String(ev._crmDealId)
                  ? Object.assign({},deal,crmPatch)
                  : deal;
              });
            });
            setNewEvDraft(null);
            setSelectedGcalEv(null);
          })
          .catch(function(e){
            setNewEvDraft(function(d){return Object.assign({},d,{saving:false});});
            alert("Błąd edycji wydarzenia: "+((e&&e.message)||"nie udało się zapisać terminu."));
          });
        return;
      }
      var patchCalId=ev._editCalId||'primary';
      var patchBody={summary:ev.title.trim(),description:ev.description||'',
        start:{dateTime:start.toISOString(),timeZone:'Europe/Warsaw'},
        end:{dateTime:end.toISOString(),timeZone:'Europe/Warsaw'}};
      function doPatch(t){
        return fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(patchCalId)+'/events/'+encodeURIComponent(ev._editId),{
          method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
          body:JSON.stringify(patchBody)
        });
      }
      setNewEvDraft(function(d){return Object.assign({},d,{saving:true});});
      doPatch(gcalToken)
        .then(function(r){
          if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return doPatch(fresh);});}
          return r;
        })
        .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);})
        .then(function(){setNewEvDraft(null);fetchEvents(gcalToken);})
        .catch(function(){
          setNewEvDraft(function(d){return Object.assign({},d,{saving:false});});
          alert('B\u0142\u0105d edycji wydarzenia.');
        });
      return;
    }
    var sel=ev.selectedCals||[];
    if(sel.length===0){alert('Wybierz co najmniej jeden kalendarz.');return;}
    var body={
      summary:ev.title.trim(),
      description:ev.description||'',
      start:{dateTime:start.toISOString(),timeZone:'Europe/Warsaw'},
      end:{dateTime:end.toISOString(),timeZone:'Europe/Warsaw'}
    };
    function postToCal(calId,t){
      return fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calId)+'/events',{
        method:'POST',
        headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
        body:JSON.stringify(body)
      }).then(function(r){
        if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calId)+'/events',{method:'POST',headers:{Authorization:'Bearer '+fresh,'Content-Type':'application/json'},body:JSON.stringify(body)});});}
        return r;
      }).then(function(r){
        if(!r.ok)return r.text().then(function(){return {ok:false,calId:calId};});
        return {ok:true,calId:calId};
      }).catch(function(){return {ok:false,calId:calId};});
    }
    setNewEvDraft(function(d){return Object.assign({},d,{saving:true});});
    Promise.all(sel.map(function(cid){return postToCal(cid,gcalToken);}))
      .then(function(results){
        var failed=results.filter(function(r){return !r.ok;});
        if(failed.length===0){
          setNewEvDraft(null);
          fetchEvents(gcalToken);
        } else {
          setNewEvDraft(function(d){return Object.assign({},d,{saving:false});});
          var failedNames=failed.map(function(f){var c=calList.find(function(x){return x.id===f.calId;});return c?c.summary:f.calId;}).join(', ');
          alert('Niektóre kalendarze nie przyjęły zdarzenia: '+failedNames);
          fetchEvents(gcalToken);
        }
      });
  }

  // ── Pomocniki kalendarza ──
  function isSameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}

  function getEventsForDay(date){
    var result=[];
    // GCal events
    gcalEvents.forEach(function(ev){
      var start=ev.start&&(ev.start.dateTime||ev.start.date);
      if(!start) return;
      var d=new Date(start);
      var endRaw=ev.end&&(ev.end.dateTime||ev.end.date);
      var endD=ev.start.dateTime?(endRaw?new Date(endRaw):new Date(d.getTime()+3600000)):null;
      if(isSameDay(d,date)) result.push({type:"gcal",title:ev.summary||"(bez tytułu)",color:ev._calColor||"#4285f4",time:ev.start.dateTime?d:null,end:endD,calName:ev._calName||"",gcalRaw:ev});
    });
    // Deal events
    dealEvents.forEach(function(ev){
      if(isSameDay(ev.date,date)) result.push({type:"deal",title:ev.label+" "+ev.client,color:ev.color,time:ev.date,end:new Date(ev.date.getTime()+3600000),dealEv:ev});
    });
    result.sort(function(a,b){return (a.time||0)-(b.time||0);});
    return result;
  }

  // ── Klucz dnia (porównania / podświetlenie drop) ──
  function dayKeyStr(d){var pad=function(n){return String(n).padStart(2,'0');};return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}

  // ── Układ bloków czasowych (wydarzenie zajmuje tyle miejsca, ile trwa) ──
  // Zwraca listę {ev, top, height, col, cols} w pikselach dla siatki godzin
  // od hourFrom do hourTo (hourTo wyłącznie), przy wysokości godziny hourPx.
  function layoutTimedEvents(evs, day, hourFrom, hourTo, hourPx, minPx){
    var dayStart=new Date(day);dayStart.setHours(0,0,0,0);
    var gridStart=hourFrom*60, gridEnd=hourTo*60;
    var items=[];
    evs.forEach(function(ev){
      if(!ev.time) return;
      var s=new Date(ev.time);
      var startMin=(s-dayStart)/60000;
      var e=ev.end?new Date(ev.end):new Date(s.getTime()+3600000);
      var endMin=(e-dayStart)/60000;
      if(!(endMin>startMin)) endMin=startMin+60;      // zabezpieczenie
      if(endMin>1440) endMin=1440;                    // wydarzenie przez północ – tnij do końca dnia
      if(endMin<=gridStart||startMin>=gridEnd) {      // poza widoczną siatką – przypnij do krawędzi
        startMin=Math.min(Math.max(startMin,gridStart),gridEnd-30);
        endMin=Math.min(Math.max(endMin,startMin+30),gridEnd);
      }
      var visStart=Math.max(startMin,gridStart), visEnd=Math.min(endMin,gridEnd);
      var top=(visStart-gridStart)/60*hourPx;
      var height=Math.max(((visEnd-visStart)/60)*hourPx, minPx||18);
      items.push({ev:ev,top:top,height:height,startMin:startMin,endMin:endMin,col:0,cols:1,
        clippedTop:startMin<gridStart,clippedBottom:endMin>gridEnd});
    });
    items.sort(function(a,b){return a.startMin-b.startMin||b.endMin-a.endMin;});
    // Grupy nachodzących się wydarzeń → kolumny obok siebie
    var group=[],groupEnd=-1;
    function flush(){
      if(!group.length) return;
      var colEnds=[];
      group.forEach(function(it){
        var placed=-1;
        for(var c=0;c<colEnds.length;c++){ if(it.startMin>=colEnds[c]){placed=c;break;} }
        if(placed<0){colEnds.push(it.endMin);placed=colEnds.length-1;}
        else colEnds[placed]=it.endMin;
        it.col=placed;
      });
      group.forEach(function(it){it.cols=colEnds.length;});
      group=[];groupEnd=-1;
    }
    items.forEach(function(it){
      if(group.length&&it.startMin>=groupEnd) flush();
      group.push(it);
      groupEnd=Math.max(groupEnd,it.endMin);
    });
    flush();
    return items;
  }

  function fmtHM(d){return d.getHours()+":"+String(d.getMinutes()).padStart(2,"0");}
  function evRangeLabel(ev){
    if(!ev.time) return "";
    var s=new Date(ev.time);
    var e=ev.end?new Date(ev.end):null;
    return fmtHM(s)+(e?"–"+fmtHM(e):"");
  }

  // ── Godzina odpowiadająca pozycji Y upuszczenia w siatce godzin ──
  // Zwraca początek bloku godzinowego, w który upuszczono wydarzenie (pełna
  // godzina, bez zaokrąglania do minut) — przycięty do zakresu [hourFrom, hourTo).
  function timeFromDropY(e,hourFrom,hourTo,hourPx){
    var rect=e.currentTarget.getBoundingClientRect();
    var offY=e.clientY-rect.top;
    var totalMin=hourFrom*60+(offY/hourPx)*60;
    var snappedHour=Math.max(hourFrom,Math.min(hourTo-1,Math.floor(totalMin/60)));
    return {h:snappedHour,m:0};
  }

  // ── Przeniesienie zdarzenia GCal na inny dzień i/lub godzinę (drag&drop) ──
  // targetTime: opcjonalny {h,m} wyliczony z pozycji upuszczenia w siatce
  // godzinowej (widok tygodnia/dnia) — nadpisuje godzinę zamiast zawsze
  // zachowywać oryginalną, jak to było wcześniej, i ustawia czas trwania
  // na stałe 30 minut (zamiast zachowywać oryginalny czas trwania).
  function moveEventToDate(raw,targetDate,targetTime){
    if(!raw||!gcalToken) return;
    var calId=raw._calId||'primary';
    var startDT=raw.start&&(raw.start.dateTime||raw.start.date);
    var endDT=raw.end&&(raw.end.dateTime||raw.end.date);
    if(!startDT) return;
    var isAllDay=!!(raw.start&&raw.start.date&&!raw.start.dateTime);
    var oldStart=new Date(startDT);
    var sameDay=isSameDay(oldStart,targetDate);
    var sameTime=isAllDay||!targetTime||(oldStart.getHours()===targetTime.h&&oldStart.getMinutes()===targetTime.m);
    if(sameDay&&sameTime) return;
    var pad=function(n){return String(n).padStart(2,'0');};
    var body,newStartObj,newEndObj;
    if(isAllDay){
      var oldEndDate=endDT?new Date(endDT):new Date(oldStart.getTime()+86400000);
      var durDays=Math.max(1,Math.round((oldEndDate-oldStart)/86400000));
      var ns=new Date(targetDate);ns.setHours(0,0,0,0);
      var ne=new Date(ns);ne.setDate(ne.getDate()+durDays);
      var fmtD=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
      newStartObj={date:fmtD(ns)};newEndObj={date:fmtD(ne)};
      body={start:newStartObj,end:newEndObj};
    } else {
      var oldEnd=endDT?new Date(endDT):new Date(oldStart.getTime()+3600000);
      var durMs=targetTime?(30*60000):Math.max(0,oldEnd-oldStart);
      var ns2=new Date(targetDate);ns2.setHours(targetTime?targetTime.h:oldStart.getHours(),targetTime?targetTime.m:oldStart.getMinutes(),0,0);
      var ne2=new Date(ns2.getTime()+durMs);
      newStartObj={dateTime:ns2.toISOString(),timeZone:'Europe/Warsaw'};
      newEndObj={dateTime:ne2.toISOString(),timeZone:'Europe/Warsaw'};
      body={start:newStartObj,end:newEndObj};
    }
    var prevSnapshot=gcalEvents;
    setGcalEvents(function(evs){
      return evs.map(function(e){
        return e.id===raw.id&&e._calId===raw._calId ? Object.assign({},e,{start:newStartObj,end:newEndObj}) : e;
      });
    });
    function doPatch(t){
      return fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calId)+'/events/'+encodeURIComponent(raw.id),{
        method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
    }
    doPatch(gcalToken)
      .then(function(r){
        if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return doPatch(fresh);});}
        return r;
      })
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);})
      .catch(function(){
        setGcalEvents(prevSnapshot);
        fetchEvents(gcalToken);
        alert('Nie uda\u0142o si\u0119 przenie\u015b\u0107 wydarzenia.');
      });
  }

  function prevPeriod(){
    var d=new Date(refDate);
    if(calView==="week") d.setDate(d.getDate()-7);
    else if(calView==="day") d.setDate(d.getDate()-1);
    else d.setMonth(d.getMonth()-1);
    setRefDate(d);
  }
  function nextPeriod(){
    var d=new Date(refDate);
    if(calView==="week") d.setDate(d.getDate()+7);
    else if(calView==="day") d.setDate(d.getDate()+1);
    else d.setMonth(d.getMonth()+1);
    setRefDate(d);
  }
  function goToday(){setRefDate(new Date());}

  // ── Render widoku miesięcznego ──
  function renderMonthView(){
    var year=refDate.getFullYear(),month=refDate.getMonth();
    var firstDay=new Date(year,month,1);
    var lastDay=new Date(year,month+1,0);
    var startDow=firstDay.getDay()===0?6:firstDay.getDay()-1; // Mon=0
    var totalCells=Math.ceil((startDow+lastDay.getDate())/7)*7;
    var days=[];
    for(var i=0;i<totalCells;i++){
      var dayNum=i-startDow+1;
      if(dayNum<1||dayNum>lastDay.getDate()) days.push(null);
      else days.push(new Date(year,month,dayNum));
    }
    var today=new Date();
    var DOW_LABELS=["\u2160 Pon","\u2161 Wt","\u2162 \u015ar","\u2163 Czw","\u2164 Pt","\u2165 Sob","\u2166 Nd"];
    var DOW_PL=["Pon","Wt","\u015ar","Czw","Pt","Sob","Nd"];
    return ce("div",null,
      // Nagłówki dni
      ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:1,marginBottom:1}},
        DOW_PL.map(function(d,i){return ce("div",{key:i,style:{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--t3)",padding:"6px 0",letterSpacing:"0.07em",textTransform:"uppercase",background:"var(--bg2)"}},d);})
      ),
      // Siatka dni
      ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:1}},
        days.map(function(d,i){
          if(!d) return ce("div",{key:i,style:{background:"var(--bg2)",minHeight:80,opacity:0.3}});
          var evs=getEventsForDay(d);
          var isToday=isSameDay(d,today);
          var isCurrentMonth=d.getMonth()===month;
          var dk=dayKeyStr(d);
          var isDragOver=dragOverDay===dk;
          return ce("div",{key:i,
            onDoubleClick:function(){openNewEventModal(d);},
            onDragOver:function(e){e.preventDefault();e.dataTransfer.dropEffect="move";if(dragOverDay!==dk)setDragOverDay(dk);},
            onDragLeave:function(){if(dragOverDay===dk)setDragOverDay(null);},
            onDrop:function(e){e.preventDefault();setDragOverDay(null);var raw=dragEvRef.current;dragEvRef.current=null;if(raw)moveEventToDate(raw,d);},
            style:{background:isDragOver?"rgba(124,58,237,0.08)":"var(--bg)",minHeight:80,minWidth:0,overflow:"hidden",padding:"4px 5px",border:isDragOver?"1px dashed var(--violet)":"1px solid var(--bd2)",borderTop:isToday?"2px solid var(--t1)":(isDragOver?"1px dashed var(--violet)":"1px solid var(--bd2)"),position:"relative",cursor:"default"}},
            ce("div",{style:{fontSize:11,fontWeight:isToday?700:400,background:isToday?"var(--t1)":null,color:isToday?"var(--bg)":"var(--t2)",width:isToday?20:null,height:isToday?20:null,borderRadius:isToday?10:null,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}},d.getDate()),
            evs.slice(0,3).map(function(ev,ei){var canDrag=!!ev.gcalRaw;return ce("div",{key:ei,title:ev.title,
              draggable:canDrag,
              onDragStart:canDrag?function(e){dragEvRef.current=ev.gcalRaw;e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",ev.gcalRaw.id||"");}catch(_){}}:undefined,
              onDragEnd:function(){dragEvRef.current=null;setDragOverDay(null);},
              onDoubleClick:function(e){e.stopPropagation();},
              style:{fontSize:10,padding:"1px 4px",borderRadius:3,background:ev.color+"22",color:ev.color,marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:canDrag?"grab":"pointer",fontWeight:600},onClick:function(){if(ev.dealEv){openDealEventPreview(ev.dealEv);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}}},
              (ev.time?(new Date(ev.time).getHours()+":"+String(new Date(ev.time).getMinutes()).padStart(2,"0")+" "):"")+ ev.title
            );}),
            evs.length>3?ce("div",{onClick:function(e){e.stopPropagation();setRefDate(new Date(d));setCalView("day");},
              style:{fontSize:9,color:"var(--t3)",marginTop:1,cursor:"pointer",fontWeight:600}},
              "+"+( evs.length-3)+" więcej →"):null
          );
        })
      )
    );
  }

  // ── Render widoku tygodniowego ──
  function renderWeekView(){
    var dow=refDate.getDay();
    var mon=new Date(refDate);mon.setDate(refDate.getDate()-(dow===0?6:dow-1));mon.setHours(0,0,0,0);
    var weekDays=[];
    for(var i=0;i<7;i++){var d2=new Date(mon);d2.setDate(mon.getDate()+i);weekDays.push(d2);}
    var DOW_PL=["Pon","Wt","\u015ar","Czw","Pt","Sob","Nd"];
    var today=new Date();
    var HOUR_FROM=7,HOUR_TO=22,HOUR_PX=44;
    var hours=[];for(var h=HOUR_FROM;h<HOUR_TO;h++) hours.push(h);
    var gridH=hours.length*HOUR_PX;
    var dayData=weekDays.map(function(d){
      var evs=getEventsForDay(d);
      return {date:d,allDay:evs.filter(function(e){return !e.time;}),
        blocks:layoutTimedEvents(evs,d,HOUR_FROM,HOUR_TO,HOUR_PX,16)};
    });
    var hasAllDay=dayData.some(function(x){return x.allDay.length>0;});

    function evBlock(it,key,compact){
      var ev=it.ev,canDrag=!!ev.gcalRaw;
      var w=100/it.cols;
      return ce("div",{key:key,title:evRangeLabel(ev)+" "+ev.title,
        draggable:canDrag,
        onDragStart:canDrag?function(e){e.stopPropagation();dragEvRef.current=ev.gcalRaw;e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",ev.gcalRaw.id||"");}catch(_){}}:undefined,
        onDragEnd:function(){dragEvRef.current=null;setDragOverDay(null);},
        onDoubleClick:function(e){e.stopPropagation();},
        onClick:function(e){e.stopPropagation();if(ev.dealEv){openDealEventPreview(ev.dealEv);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},
        style:{position:"absolute",top:it.top,height:it.height,
          left:"calc("+(it.col*w)+"% + 1px)",width:"calc("+w+"% - 3px)",
          boxSizing:"border-box",overflow:"hidden",
          padding:it.height>=28?"2px 4px":"0 4px",
          borderRadius:4,background:ev.color,color:"#fff",
          borderTop:it.clippedTop?"2px dotted rgba(255,255,255,0.7)":undefined,
          borderBottom:it.clippedBottom?"2px dotted rgba(255,255,255,0.7)":undefined,
          fontSize:9,lineHeight:1.15,fontWeight:600,
          cursor:canDrag?"grab":"pointer",boxShadow:"0 1px 2px rgba(0,0,0,0.15)"}},
        it.height>=28
          ?[ce("div",{key:"t",style:{opacity:0.85,fontSize:8,whiteSpace:"nowrap"}},evRangeLabel(ev)),
            ce("div",{key:"s",style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:it.height>=44?"normal":"nowrap"}},ev.title)]
          :ce("div",{style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},evRangeLabel(ev)+" "+ev.title)
      );
    }

    return ce("div",{style:{overflowX:"auto"}},
      ce("div",{style:{minWidth:560}},
        // Nagłówek dni
        ce("div",{style:{display:"grid",gridTemplateColumns:"44px repeat(7,1fr)"}},
          ce("div",{style:{background:"var(--bg2)"}}),
          weekDays.map(function(d,i){
            var isToday=isSameDay(d,today);
            return ce("div",{key:i,
              onClick:function(){setRefDate(new Date(d));setCalView("day");},
              style:{textAlign:"center",padding:"6px 2px",background:"var(--bg2)",borderLeft:"1px solid var(--bd2)",cursor:"pointer"},
              title:"Pokaż dzień"},
              ce("div",{style:{fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.07em"}},DOW_PL[i]),
              ce("div",{style:{fontSize:16,fontWeight:700,background:isToday?"var(--t1)":null,color:isToday?"var(--bg)":"var(--t2)",width:isToday?28:null,height:isToday?28:null,borderRadius:isToday?14:null,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",textDecoration:"underline dotted",textUnderlineOffset:2}},d.getDate())
            );
          })
        ),
        // Pas wydarzeń całodniowych
        hasAllDay?ce("div",{style:{display:"grid",gridTemplateColumns:"44px repeat(7,1fr)",borderTop:"1px solid var(--bd2)"}},
          ce("div",{style:{fontSize:8,color:"var(--t3)",textAlign:"right",paddingRight:6,paddingTop:4,textTransform:"uppercase"}},"ca\u0142y dzie\u0144"),
          dayData.map(function(dd,di){
            return ce("div",{key:di,style:{borderLeft:"1px solid var(--bd2)",padding:2,minHeight:20}},
              dd.allDay.map(function(ev,ei){
                return ce("div",{key:ei,title:ev.title,
                  onClick:function(){if(ev.dealEv){openDealEventPreview(ev.dealEv);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},
                  style:{fontSize:9,padding:"1px 4px",borderRadius:3,background:ev.color+"33",color:ev.color,marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer",fontWeight:600}},ev.title);
              })
            );
          })
        ):null,
        // Siatka godzin + wydarzenia
        ce("div",{style:{display:"grid",gridTemplateColumns:"44px repeat(7,1fr)"}},
          // Kolumna godzin
          ce("div",{style:{position:"relative",height:gridH}},
            hours.map(function(hh,hi){
              return ce("div",{key:hh,style:{position:"absolute",top:hi*HOUR_PX,right:6,fontSize:9,color:"var(--t3)",borderTop:"1px solid transparent"}},hh+":00");
            })
          ),
          dayData.map(function(dd,di){
            var d=dd.date,wdk=dayKeyStr(d);
            return ce("div",{key:di,
              onDragOver:function(e){e.preventDefault();e.dataTransfer.dropEffect="move";if(dragOverDay!==wdk)setDragOverDay(wdk);},
              onDragLeave:function(){if(dragOverDay===wdk)setDragOverDay(null);},
              onDrop:function(e){e.preventDefault();setDragOverDay(null);var raw=dragEvRef.current;dragEvRef.current=null;if(raw)moveEventToDate(raw,d,timeFromDropY(e,HOUR_FROM,HOUR_TO,HOUR_PX));},
              style:{position:"relative",height:gridH,borderLeft:"1px solid var(--bd2)",background:dragOverDay===wdk?"rgba(124,58,237,0.08)":undefined}},
              // linie godzin (i podwójny klik = nowe wydarzenie o tej godzinie)
              hours.map(function(hh,hi){
                return ce("div",{key:"h"+hh,
                  onDoubleClick:function(){var ddte=new Date(d);ddte.setHours(hh,0,0,0);openNewEventModal(ddte);},
                  style:{position:"absolute",top:hi*HOUR_PX,left:0,right:0,height:HOUR_PX,borderTop:"1px solid var(--bd2)",boxSizing:"border-box"}});
              }),
              dd.blocks.map(function(it,bi){return evBlock(it,bi,true);})
            );
          })
        )
      )
    );
  }

  // ── Render widoku dziennego ──
  function renderDayView(){
    var evs=getEventsForDay(refDate);
    var allDayEvs=evs.filter(function(e){return !e.time;});
    var HOUR_FROM=7,HOUR_TO=23,HOUR_PX=56;
    var hours=[];for(var h=HOUR_FROM;h<HOUR_TO;h++) hours.push(h);
    var gridH=hours.length*HOUR_PX;
    var blocks=layoutTimedEvents(evs,refDate,HOUR_FROM,HOUR_TO,HOUR_PX,22);
    var today=new Date();
    var isToday=isSameDay(refDate,today);
    var nowTop=null;
    if(isToday){
      var nowMin=today.getHours()*60+today.getMinutes();
      if(nowMin>=HOUR_FROM*60&&nowMin<=HOUR_TO*60) nowTop=(nowMin-HOUR_FROM*60)/60*HOUR_PX;
    }
    return ce("div",{style:{overflowY:"auto",maxHeight:600}},
      evs.length===0?ce("div",{style:{padding:"40px 24px",textAlign:"center",color:"var(--t3)",fontSize:13}},
        ce("div",{style:{fontSize:40,marginBottom:8,opacity:0.25}},"📅"),
        "Brak wydarzeń w tym dniu"
      ):null,
      allDayEvs.length?ce("div",{style:{display:"flex",gap:0,borderBottom:"1px solid var(--bd2)",padding:"4px 0"}},
        ce("div",{style:{width:52,flexShrink:0,fontSize:9,color:"var(--t3)",textAlign:"right",paddingRight:8,paddingTop:6,textTransform:"uppercase"}},"ca\u0142y dzie\u0144"),
        ce("div",{style:{flex:1,padding:"0 8px",display:"flex",flexDirection:"column",gap:4}},
          allDayEvs.map(function(ev,ei){
            return ce("div",{key:"ad"+ei,
              onClick:function(){if(ev.dealEv){openDealEventPreview(ev.dealEv);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},
              style:{padding:"5px 10px",borderRadius:6,background:ev.color+"22",borderLeft:"3px solid "+ev.color,
                color:ev.color,fontSize:12,fontWeight:700,cursor:"pointer"}},ev.title);
          })
        )
      ):null,
      ce("div",{style:{display:"flex"}},
        // Kolumna godzin
        ce("div",{style:{width:52,flexShrink:0,position:"relative",height:gridH}},
          hours.map(function(hh,hi){
            return ce("div",{key:hh,style:{position:"absolute",top:hi*HOUR_PX-1,right:8,fontSize:10,color:"var(--t3)",fontWeight:600}},hh+":00");
          })
        ),
        // Siatka + bloki wydarzeń
        ce("div",{style:{flex:1,position:"relative",height:gridH,borderLeft:"1px solid var(--bd2)"},
          onDragOver:function(e){e.preventDefault();e.dataTransfer.dropEffect="move";},
          onDrop:function(e){e.preventDefault();var raw=dragEvRef.current;dragEvRef.current=null;if(raw)moveEventToDate(raw,refDate,timeFromDropY(e,HOUR_FROM,HOUR_TO,HOUR_PX));}},
          hours.map(function(hh,hi){
            return ce("div",{key:"h"+hh,
              onDoubleClick:function(){var dd=new Date(refDate);dd.setHours(hh,0,0,0);openNewEventModal(dd);},
              style:{position:"absolute",top:hi*HOUR_PX,left:0,right:0,height:HOUR_PX,borderTop:"1px solid var(--bd3)",boxSizing:"border-box"}},
              ce("div",{style:{position:"absolute",top:HOUR_PX/2,left:0,right:0,borderTop:"1px dotted var(--bd3)",opacity:0.5}})
            );
          }),
          nowTop!==null?ce("div",{style:{position:"absolute",top:nowTop,left:0,right:0,borderTop:"2px solid #ef4444",zIndex:5,pointerEvents:"none"}},
            ce("div",{style:{position:"absolute",top:-4,left:-4,width:7,height:7,borderRadius:4,background:"#ef4444"}})
          ):null,
          blocks.map(function(it,bi){
            var ev=it.ev,canDrag=!!ev.gcalRaw,w=100/it.cols;
            return ce("div",{key:bi,title:evRangeLabel(ev)+" "+ev.title,
              draggable:canDrag,
              onDragStart:canDrag?function(e){dragEvRef.current=ev.gcalRaw;e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",ev.gcalRaw.id||"");}catch(_){}}:undefined,
              onDragEnd:function(){dragEvRef.current=null;setDragOverDay(null);},
              onDoubleClick:function(e){e.stopPropagation();},
              onClick:function(){if(ev.dealEv){openDealEventPreview(ev.dealEv);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},
              style:{position:"absolute",top:it.top,height:it.height,
                left:"calc("+(it.col*w)+"% + 6px)",width:"calc("+w+"% - 12px)",
                boxSizing:"border-box",overflow:"hidden",
                padding:it.height>=34?"6px 9px":"1px 9px",
                borderRadius:8,background:ev.color+"22",borderLeft:"3px solid "+ev.color,
                borderTop:it.clippedTop?"2px dotted "+ev.color:undefined,
                borderBottom:it.clippedBottom?"2px dotted "+ev.color:undefined,
                cursor:canDrag?"grab":"pointer"}},
              ce("div",{style:{fontSize:11,color:ev.color,fontWeight:700,lineHeight:1.3}},evRangeLabel(ev)),
              it.height>=34?ce("div",{style:{fontSize:13,color:"var(--t1)",fontWeight:600,lineHeight:1.35,overflow:"hidden"}},
                ev.title,
                (it.height>=60&&ev.gcalRaw&&ev.gcalRaw._calName)
                  ?ce("div",{style:{fontSize:10,color:"var(--t3)",fontWeight:400,marginTop:2}},ev.gcalRaw._calName)
                  :null
              ):ce("span",{style:{fontSize:11,color:"var(--t1)",fontWeight:600,marginLeft:6}},ev.title)
            );
          })
        )
      )
    );
  }

  // ── Nagłówek okresu ──
  var MONTHS_PL=["\u0161ycze\u0144","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
  var MONTHS_PL2=["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  function periodLabel(){
    if(calView==="month") return MONTHS_PL2[refDate.getMonth()]+" "+refDate.getFullYear();
    if(calView==="day") return refDate.toLocaleDateString("pl-PL",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    var dow=refDate.getDay();
    var mon=new Date(refDate);mon.setDate(refDate.getDate()-(dow===0?6:dow-1));
    var sun=new Date(mon);sun.setDate(mon.getDate()+6);
    return mon.getDate()+"."+(mon.getMonth()+1<10?"0":"")+(mon.getMonth()+1)+" \u2014 "+sun.getDate()+"."+(sun.getMonth()+1<10?"0":"")+(sun.getMonth()+1)+"."+sun.getFullYear();
  }

  var BTN={padding:"7px 14px",borderRadius:8,border:"1px solid var(--bd2)",background:"var(--bg)",color:"var(--t1)",fontSize:12,fontWeight:600,cursor:"pointer"};
  var BTN_ACT={padding:"7px 14px",borderRadius:8,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:12,fontWeight:600,cursor:"pointer"};

  return ce("div",null,

    // ── Pasek logowania Google ──
    ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:14,background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"10px 14px"}},
      ce("span",{style:{fontSize:13,fontWeight:700,color:"var(--t2)",flex:1}},
        gcalToken?"\u2713 Po\u0142\u0105czono z Google Calendar":"Google Calendar"
      ),
      gcalToken
        ?ce("button",{onClick:function(){fetchCalendarList(gcalToken);fetchEvents(gcalToken);},disabled:loadingEv,style:{...BTN,borderColor:"#4285f4",color:"#4285f4",marginRight:4}},loadingEv?"\u23F3 Odświeżam...":"\u21BA Odśwież")
        :null,
      gcalToken
        ?ce("button",{onClick:logout,style:{...BTN,color:"#ef4444",borderColor:"#ef4444"}},"Wyloguj")
        :ce("button",{onClick:login,style:{...BTN_ACT,background:"#4285f4"}},"\uD83D\uDD11 Zaloguj przez Google")
    ),

    errEv?ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginBottom:12}},errEv):null,

    // ── Nadchodzące terminy z dealów ──
    upcoming.length>0?ce("div",{style:{marginBottom:14}},
      ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}},"Nadchodz\u0105ce terminy ("+upcoming.length+")"),
      ce("div",{style:{display:"flex",flexDirection:"column",gap:6}},
        upcoming.slice(0,6).map(function(ev,i){
          return ce("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd2)",borderLeft:"3px solid "+ev.color,cursor:"pointer"},onClick:function(){openDealEventPreview(ev);}},
            ce("div",{style:{flexShrink:0,textAlign:"center",minWidth:32}},
              ce("div",{style:{fontSize:16,fontWeight:700,color:ev.color,lineHeight:1}},ev.date.getDate()),
              ce("div",{style:{fontSize:9,color:"var(--t3)",textTransform:"uppercase"}},ev.date.toLocaleDateString("pl-PL",{month:"short"}))
            ),
            ce("div",{style:{flex:1,fontSize:12,fontWeight:600,color:"var(--t1)"}},ev.label+" \u2014 "+ev.client),
          );
        })
      )
    ):null,

    // ── Widok kalendarza ──
    ce("div",{style:{background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:12,overflow:"hidden"}},

      // Toolbar
      ce("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:"1px solid var(--bd2)",background:"var(--bg2)"}},
        ce("button",{onClick:goToday,style:BTN},"Dzisiaj"),
        ce("button",{onClick:prevPeriod,style:{...BTN,padding:"7px 10px"}},"\u2039"),
        ce("button",{onClick:nextPeriod,style:{...BTN,padding:"7px 10px"}},"\u203a"),
        ce("span",{style:{flex:1,fontSize:14,fontWeight:700,color:"var(--t1)",textAlign:"center"}},periodLabel()),
        ce("div",{style:{display:"flex",gap:4}},
          ce("button",{onClick:function(){setCalView("month");},style:calView==="month"?BTN_ACT:BTN},"Miesi\u0105c"),
          ce("button",{onClick:function(){setCalView("week");},style:calView==="week"?BTN_ACT:BTN},"Tydzie\u0144"),
          ce("button",{onClick:function(){setCalView("day");},style:calView==="day"?BTN_ACT:BTN},"Dzie\u0144"),
          gcalToken?ce("button",{onClick:function(){if(gcalToken)fetchCalendarList(gcalToken);openNewEventModal(null);},style:Object.assign({},BTN_ACT,{background:"#4285f4",marginLeft:4})},"＋ Wydarzenie"):null
        )
      ),

      // Legenda (dynamicznie z calList + typy z dealów)
      ce("div",{style:{display:"flex",gap:12,padding:"6px 14px",borderBottom:"1px solid var(--bd2)",background:"var(--bg2)",flexWrap:"wrap"}},
        // Kalendarze Google
        calList.map(function(c){
          return ce("span",{key:c.id,style:{fontSize:10,color:c.color,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}},
            ce("span",{style:{width:8,height:8,borderRadius:"50%",background:c.color,display:"inline-block"}}),
            c.summary||"(bez nazwy)"
          );
        }),
        // Separator wizualny jeśli są kalendarze i są też terminy z dealów
        calList.length>0?ce("span",{style:{fontSize:10,color:"var(--t3)",opacity:0.4}},"|"):null,
        // Typy zdarzeń z dealów
        ce("span",{style:{fontSize:10,color:"#3b82f6",fontWeight:600}},"● Pomiar"),
        ce("span",{style:{fontSize:10,color:"#10b981",fontWeight:600}},"● Realizacja"),
        loadingEv?ce("span",{style:{fontSize:10,color:"var(--t3)",marginLeft:"auto"}},"\u23F3 Ładuję zdarzenia..."):null
      ),

      // Kalendarz
      ce("div",{style:{padding:calView==="month"?0:0}},
        !gcalToken?ce("div",{style:{padding:"32px",textAlign:"center",color:"var(--t3)",fontSize:13}},
          "Zaloguj si\u0119 przez Google, aby zobaczy\u0107 pe\u0142ny kalendarz ze zdarzeniami.\nTerminy z deal\u00f3w widoczne powy\u017cej."
        ):
        calView==="day"?renderDayView():calView==="month"?renderMonthView():renderWeekView()
      )
    )

    ,newEvDraft?ce('div',{
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'},
      onClick:function(e){if(e.target===e.currentTarget)setNewEvDraft(null);}
    },
      ce('div',{style:{background:'var(--bg)',borderRadius:16,padding:24,width:'100%',maxWidth:420,boxShadow:'0 8px 40px rgba(0,0,0,0.2)',margin:'0 16px'}},
        ce('div',{style:{fontSize:16,fontWeight:700,color:'var(--t1)',marginBottom:16}},
          newEvDraft._editId?'\u270F\uFE0F Edytuj wydarzenie':'\uD83D\uDCC5 Nowe zdarzenie w Google Calendar'
        ),
        ce('div',{style:{marginBottom:12}},
          ce('label',{style:{fontSize:11,fontWeight:700,color:'var(--t3)',display:'block',marginBottom:4}},'TYTU\u0141 *'),
          ce('input',{
            type:'text',value:newEvDraft.title,autoFocus:true,
            onChange:function(e){setNewEvDraft(function(d){return Object.assign({},d,{title:e.target.value});});},
            onKeyDown:function(e){if(e.key==='Enter')addCustomEvent();if(e.key==='Escape')setNewEvDraft(null);},
            placeholder:'np. Pomiar u klienta, Dostawa...',
            style:{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}
          })
        ),
        ce('div',{style:{marginBottom:12}},
          ce('label',{style:{fontSize:11,fontWeight:700,color:'var(--t3)',display:'block',marginBottom:4}},'DATA *'),
          ce('input',{
            type:'date',value:newEvDraft.date,
            onChange:function(e){setNewEvDraft(function(d){return Object.assign({},d,{date:e.target.value});});},
            style:{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}
          })
        ),
        ce('div',{style:{display:'flex',gap:10,marginBottom:12}},
          ce('div',{style:{flex:1}},
            ce('label',{style:{fontSize:11,fontWeight:700,color:'var(--t3)',display:'block',marginBottom:4}},'OD'),
            ce('input',{
              type:'time',value:newEvDraft.timeFrom,
              onChange:function(e){setNewEvDraft(function(d){return Object.assign({},d,{timeFrom:e.target.value});});},
              style:{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}
            })
          ),
          ce('div',{style:{flex:1}},
            ce('label',{style:{fontSize:11,fontWeight:700,color:'var(--t3)',display:'block',marginBottom:4}},'DO'),
            ce('input',{
              type:'time',value:newEvDraft.timeTo,
              onChange:function(e){setNewEvDraft(function(d){return Object.assign({},d,{timeTo:e.target.value});});},
              style:{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}
            })
          )
        ),
        ce('div',{style:{marginBottom:16}},
          ce('label',{style:{fontSize:11,fontWeight:700,color:'var(--t3)',display:'block',marginBottom:4}},'OPIS (opcjonalnie)'),
          ce('textarea',{
            value:newEvDraft.description,rows:3,
            onChange:function(e){setNewEvDraft(function(d){return Object.assign({},d,{description:e.target.value});});},
            placeholder:'Dodatkowe informacje...',
            style:{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,boxSizing:'border-box',outline:'none',resize:'none',fontFamily:'inherit'}
          })
        ),
        !newEvDraft._editId?ce('div',{style:{marginBottom:16}},
          ce('label',{style:{fontSize:11,fontWeight:700,color:'var(--t3)',display:'block',marginBottom:6}},'KALENDARZE *'),
          calList.length===0
            ?ce('div',{style:{fontSize:11,color:'var(--t3)',padding:'8px 10px',background:'var(--bg2)',borderRadius:8,border:'1.5px solid var(--bd2)'}},'\u23F3 \u0141aduj\u0119 list\u0119 kalendarzy...')
            :ce('div',{style:{display:'flex',flexDirection:'column',gap:4,maxHeight:160,overflowY:'auto',padding:6,background:'var(--bg2)',borderRadius:8,border:'1.5px solid var(--bd2)'}},
                calList.map(function(c){
                  var checked=(newEvDraft.selectedCals||[]).indexOf(c.id)>=0;
                  return ce('div',{
                    key:c.id,
                    onClick:function(){toggleCalInDraft(c.id);},
                    style:{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:6,cursor:'pointer',background:checked?'rgba(66,133,244,0.08)':'transparent',transition:'background .12s'}
                  },
                    ce('div',{style:{width:16,height:16,borderRadius:4,border:'1.5px solid '+(checked?'#4285f4':'var(--bd2)'),background:checked?'#4285f4':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},
                      checked?ce('span',{style:{color:'#fff',fontSize:10,fontWeight:700,lineHeight:1}},'\u2713'):null
                    ),
                    ce('div',{style:{width:10,height:10,borderRadius:'50%',background:c.color,flexShrink:0}}),
                    ce('span',{style:{fontSize:12,color:'var(--t1)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},c.summary||'(bez nazwy)'),
                    c.primary?ce('span',{style:{fontSize:9,color:'var(--t3)',background:'var(--bg)',padding:'2px 6px',borderRadius:4,letterSpacing:'0.05em'}},'GŁÓWNY'):null
                  );
                })
              )
        ):null,
        ce('div',{style:{display:'flex',gap:10}},
          ce('button',{
            onClick:function(){setNewEvDraft(null);},
            disabled:newEvDraft.saving,
            style:{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}
          },'Anuluj'),
          ce('button',{
            onClick:addCustomEvent,
            disabled:newEvDraft.saving||!newEvDraft.title.trim()||!newEvDraft.date||(!newEvDraft._editId&&(newEvDraft.selectedCals||[]).length===0),
            style:{flex:2,padding:'10px',borderRadius:10,border:'none',
              background:(newEvDraft.saving||!newEvDraft.title.trim()||!newEvDraft.date||(!newEvDraft._editId&&(newEvDraft.selectedCals||[]).length===0))?'var(--bd2)':'#4285f4',
              color:(newEvDraft.saving||!newEvDraft.title.trim()||!newEvDraft.date||(!newEvDraft._editId&&(newEvDraft.selectedCals||[]).length===0))?'var(--t3)':'#fff',
              fontSize:13,fontWeight:700,cursor:newEvDraft.saving?'wait':'pointer',fontFamily:'inherit'}
          },newEvDraft.saving?'\u23F3 Zapisuj\u0119...':(newEvDraft._editId?'\uD83D\uDCBE Zapisz zmiany':((newEvDraft.selectedCals||[]).length>1?'\uD83D\uDCC5 Dodaj do '+(newEvDraft.selectedCals||[]).length+' kalendarzy':'\uD83D\uDCC5 Dodaj do Google Calendar')))
        )
      )
    ):null

    ,selectedGcalEv?ce('div',{
      style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:2100,display:'flex',alignItems:'center',justifyContent:'center'},
      onClick:function(e){if(e.target===e.currentTarget)setSelectedGcalEv(null);}
    },
      ce('div',{style:{background:'var(--bg)',borderRadius:16,padding:24,width:'100%',maxWidth:420,boxShadow:'0 8px 40px rgba(0,0,0,0.2)',margin:'0 16px',position:'relative'}},
        ce('button',{onClick:function(){setSelectedGcalEv(null);},style:{position:'absolute',top:12,right:14,border:'none',background:'none',fontSize:22,cursor:'pointer',color:'var(--t3)',padding:'4px 6px'}},'\u00D7'),
        ce('div',{style:{fontSize:15,fontWeight:700,color:'var(--t1)',marginBottom:14,paddingRight:28}},
          selectedGcalEv.summary||'(bez tytułu)'
        ),
        (function(){
          var raw=selectedGcalEv;
          var startDT=raw.start&&(raw.start.dateTime||raw.start.date);
          var endDT=raw.end&&(raw.end.dateTime||raw.end.date);
          var isAllDay=!!(raw.start&&raw.start.date&&!raw.start.dateTime);
          var fmtDT=function(s){if(!s)return null;var d=new Date(s);return d.toLocaleString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:isAllDay?undefined:'2-digit',minute:isAllDay?undefined:'2-digit'});};
          var rows=[];
          if(raw._calName) rows.push(['Kalendarz',raw._calName]);
          if(startDT) rows.push([isAllDay?'Dzień':'Początek',fmtDT(startDT)]);
          if(endDT&&!isAllDay) rows.push(['Koniec',fmtDT(endDT)]);
          if(raw.location) rows.push(['Lokalizacja',raw.location]);
          if(raw.description) rows.push(['Opis',raw.description]);
          if(raw.organizer&&raw.organizer.displayName) rows.push(['Organizator',raw.organizer.displayName]);
          return rows.map(function(r,i){return ce('div',{key:i,style:{display:'flex',gap:10,marginBottom:8,alignItems:'flex-start'}},
            ce('div',{style:{fontSize:10,fontWeight:700,color:'var(--t3)',minWidth:80,paddingTop:1,textTransform:'uppercase',letterSpacing:'0.06em'}},r[0]),
            ce('div',{style:{fontSize:13,color:'var(--t1)',lineHeight:1.5,wordBreak:'break-word',whiteSpace:'pre-wrap'}},r[1])
          );});
        })(),
        (!selectedGcalEv._readOnly&&selectedGcalEv.htmlLink)?ce('a',{href:selectedGcalEv.htmlLink,target:'_blank',rel:'noopener noreferrer',style:{display:'block',marginTop:16,textAlign:'center',padding:'9px',borderRadius:10,border:'1px solid #4285f4',color:'#4285f4',fontSize:12,fontWeight:700,textDecoration:'none'}},'Otwórz w Google Calendar \u2197'):null,
        ce('div',{
          style:{marginTop:10,padding:'9px',borderRadius:10,border:'1px solid #4285f4',color:'#4285f4',fontSize:12,fontWeight:700,textAlign:'center',cursor:'pointer'},
          onClick:function(){openEditEventModal(selectedGcalEv);}
        },'\u270F\uFE0F Edytuj wydarzenie'),
        ce('div',{
          style:{marginTop:10,padding:'9px',borderRadius:10,border:'1px solid #ef4444',color:'#ef4444',fontSize:12,fontWeight:700,textAlign:'center',cursor:'pointer'},
          onClick:function(){
            if(!window.confirm('Usunąć to wydarzenie z Google Calendar?'))return;
            var ev=selectedGcalEv;
            var calId=ev._calId||'primary';
            function doDel(t){
              return fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calId)+'/events/'+encodeURIComponent(ev.id),{
                method:'DELETE',headers:{Authorization:'Bearer '+t}
              });
            }
            doDel(gcalToken)
              .then(function(r){
                if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return doDel(fresh);});}
                return r;
              })
              .then(function(r){
                if(r.status===204||r.ok){
                  setSelectedGcalEv(null);
                  setGcalEvents(function(evs){return evs.filter(function(e){return e.id!==ev.id;});});
                } else { alert('Błąd usuwania (HTTP '+r.status+').'); }
              })
              .catch(function(){alert('Błąd usuwania wydarzenia.');});
          }
        },'\uD83D\uDDD1 Usuń wydarzenie')
      )
    ):null,
    selectedDeal?ce(ModalDeal,{
      deal:selectedDeal,
      client:(p.clients||[]).find(function(c){return String(c.id)===String(selectedDeal.client_id);})||null,
      gcalToken:gcalToken,setGcalToken:setGcalToken,gsiReady:gsiReady,calList:calList,
      onClose:function(){setSelectedDeal(null);},
      onSave:function(data){
        sbApi.updateDeal(selectedDeal.id,data).then(function(){setSelectedDeal(Object.assign({},selectedDeal,data));})
          .catch(function(e){alert("Błąd zapisu: "+e.message);});
      },
      onDelete:function(){sbApi.deleteDeal(selectedDeal.id).then(function(){setSelectedDeal(null);}).catch(function(e){alert("Błąd usuwania: "+e.message);});},
      onGoToClient:function(){},onGoToSummary:function(){}
    }):null
  );
}

// ── SCREEN CRM ───────────────────────────────────────────────────────────────

// ── Kanban — @hello-pangea/dnd ───────────────────────────────────────────────

function DealCard(cp){
  var deal=cp.deal; var stage=cp.stage; var index=cp.index;
  var clients=cp.clients; var openDeal=cp.openDeal;
  var fmtDate=cp.fmtDate; var clientTotal2=cp.clientTotal2;
  var cl=clients.find(function(c){return String(c.id)===String(deal.client_id);})||null;
  var name=cl?cl.name:"(nieznany)";
  var baseTotal=cl?clientTotal2(cl):0;
  var montazRate=cl?(cl.install_fee_mode==="amount"?0:((parseFloat(cl.install_fee)||0)/100)):0;
  var montazAmount=cl&&cl.install_fee_mode==="amount"?(parseFloat(cl.install_fee)||0):0;
  var total=roundTo10(baseTotal+(montazAmount>0?montazAmount:(montazRate>0?baseTotal*montazRate:0)));
  var hasVisit=deal.visit_date; var hasDelivery=deal.delivery_date;
  return ce(Draggable,{draggableId:String(deal.id),index:index},function(provided,snapshot){
    return ce("div",Object.assign({
      ref:provided.innerRef
    },provided.draggableProps,provided.dragHandleProps,{
      onClick:function(){if(!snapshot.isDragging){openDeal(deal);}},
      style:Object.assign({},provided.draggableProps.style,{
        background:"var(--bg)",
        border:"1px solid var(--bd2)",
        borderRadius:11,
        padding:"10px 11px",
        marginBottom:8,
        cursor:snapshot.isDragging?"grabbing":"grab",
        boxShadow:snapshot.isDragging?"0 8px 24px rgba(0,0,0,0.18)":"0 1px 4px rgba(0,0,0,0.05)",
        borderLeft:"3px solid "+stage.color,
        opacity:snapshot.isDragging?0.95:1,
        transform:snapshot.isDragging?provided.draggableProps.style.transform+" rotate(1deg)":provided.draggableProps.style.transform,
        userSelect:"none"
      })
    }),
      ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:4,lineHeight:1.3}},name),
      total>0?ce("div",{style:{fontSize:12,fontWeight:700,color:stage.color,marginBottom:4}},Math.round(total/10)*10+" z\u0142"):null,
      (hasVisit||hasDelivery)?ce("div",{style:{display:"flex",flexDirection:"column",gap:2,marginTop:4}},
        hasVisit?ce("div",{style:{fontSize:10,color:"var(--t3)",display:"flex",alignItems:"center",gap:3}},
          ce("span",null,"\uD83D\uDCCF"),ce("span",null,"Pomiar: "+fmtDate(deal.visit_date))
        ):null,
        hasDelivery?ce("div",{style:{fontSize:10,color:"var(--t3)",display:"flex",alignItems:"center",gap:3}},
          ce("span",null,"\uD83D\uDE9A"),ce("span",null,"Dostawa: "+fmtDate(deal.delivery_date))
        ):null
      ):null,
      deal.notes?ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:5,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}},deal.notes):null
    );
  });
}

function KanbanCol(kp){
  var stage=kp.stage; var deals=kp.deals;
  var clients=kp.clients; var openDeal=kp.openDeal;
  var fmtDate=kp.fmtDate; var clientTotal2=kp.clientTotal2;
  var wide=!!kp.wide;
  var stageDeals=(deals||[]).filter(function(d){return d.stage===stage.id;});
  return ce("div",{style:wide?{flex:"1 1 0",minWidth:280}:{flex:"1 1 0",minWidth:190,maxWidth:280}},
    ce("div",{style:{
      background:"var(--bg2)",border:"1px solid var(--bd2)",
      borderRadius:14,padding:"10px 8px",height:"100%"
    }},
      ce("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:10,paddingBottom:8,borderBottom:"1px solid var(--bd3)"}},
        ce("div",{style:{width:9,height:9,borderRadius:"50%",background:stage.color,flexShrink:0}}),
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t1)",letterSpacing:"0.06em",textTransform:"uppercase",flex:1}},stage.label),
        ce("div",{style:{fontSize:11,color:"var(--t3)",fontWeight:500}},stageDeals.length||"")
      ),
      ce(Droppable,{droppableId:stage.id},function(provided,snapshot){
        return ce("div",Object.assign({
          ref:provided.innerRef,
          style:{
            minHeight:60,
            background:snapshot.isDraggingOver?"rgba(99,102,241,0.06)":"transparent",
            borderRadius:8,
            transition:"background .15s",
            padding:"2px 0"
          }
        },provided.droppableProps),
          stageDeals.map(function(deal,i){
            return ce(DealCard,{
              key:deal.id,deal:deal,stage:stage,index:i,
              clients:clients,openDeal:openDeal,
              fmtDate:fmtDate,clientTotal2:clientTotal2
            });
          }),
          provided.placeholder,
          stageDeals.length===0&&!snapshot.isDraggingOver?
            ce("div",{style:{fontSize:11,color:"var(--t3)",textAlign:"center",padding:"18px 0",opacity:0.5}},"Brak"):null
        );
      })
    )
  );
}

function KanbanBoard(kp){
  var deals=kp.deals; var clients=kp.clients; var moveStage=kp.moveStage;
  var openDeal=kp.openDeal; var fmtDate=kp.fmtDate; var clientTotal2=kp.clientTotal2;

  function onDragEnd(result){
    if(!result.destination)return;
    var dealId=result.draggableId;
    var toStage=result.destination.droppableId;
    var fromStage=result.source.droppableId;
    if(toStage===fromStage)return;
    moveStage(dealId,toStage);
  }

  var colProps={deals:deals,clients:clients,openDeal:openDeal,fmtDate:fmtDate,clientTotal2:clientTotal2};
  return ce(DragDropContext,{onDragEnd:onDragEnd},
    ce(Fragment,null,
      ce("div",{style:{display:"flex",gap:10,paddingBottom:12,marginLeft:-4,paddingLeft:4,flexWrap:"wrap"}},
        CRM_STAGES.map(function(stage){
          return ce(KanbanCol,Object.assign({key:stage.id,stage:stage},colProps));
        })
      ),
      ce("div",{style:{margin:"16px 0 10px",height:1,background:"var(--bd2)"}}),
      ce("div",{style:{display:"flex",gap:10,paddingBottom:4,marginLeft:-4,paddingLeft:4}},
        ce(KanbanCol,Object.assign({stage:STAGE_ZAKONCZONE,wide:true},colProps)),
        ce(KanbanCol,Object.assign({stage:STAGE_ODRZUCONE,wide:true},colProps))
      )
    )
  );
}


export function ScreenCRM(p){
  // p: clients, setScreen, setAppMode, setCurClientId, pushModeReturn
  // gcalToken/setGcalToken/gsiReady przekazywane z App
  var gcalToken=p.gcalToken||null, setGcalToken=p.setGcalToken||function(){}, gsiReady=!!p.gsiReady;
  var sDeals=useState(null),deals=sDeals[0],setDeals=sDeals[1];
  var sModal=useState(null),modalDeal=sModal[0],setModalDeal=sModal[1];
  var sLoading=useState(true),loadingDeals=sLoading[0],setLoadingDeals=sLoading[1];
  var sNewClient=useState(""),newClientId=sNewClient[0],setNewClientId=sNewClient[1];
  var sAdding=useState(false),adding=sAdding[0],setAdding=sAdding[1];
  var sCalList=useState([]),calList=sCalList[0],setCalList=sCalList[1];

  React.useEffect(function(){
    sbApi.getDeals().then(function(data){
      setDeals(data||[]);
      setLoadingDeals(false);
    }).catch(function(){setDeals([]);setLoadingDeals(false);});
  },[]);

  // Pobierz listę kalendarzy gdy mamy token
  React.useEffect(function(){
    if(!gcalToken) return;
    function doFetch(t){
      return fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",{
        headers:{Authorization:"Bearer "+t}
      });
    }
    doFetch(gcalToken)
      .then(function(r){
        if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);return doFetch(fresh);});}
        return r;
      })
      .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
      .then(function(data){
        var items=(data.items||[]).map(function(c){
          return {id:c.id,summary:c.summary,color:c.backgroundColor||"#4285f4",primary:!!c.primary};
        });
        items.sort(function(a,b){
          if(a.primary&&!b.primary)return -1;
          if(!a.primary&&b.primary)return 1;
          return (a.summary||"").localeCompare(b.summary||"","pl");
        });
        setCalList(items);
      })
      .catch(function(){});
  },[gcalToken]);

  function addDeal(){
    if(!newClientId){return;}
    setAdding(true);
    sbApi.addDeal(newClientId).then(function(res){
      var d=res&&res[0]?res[0]:null;
      if(d){setDeals(function(prev){return prev.concat([d]);});}
      setNewClientId("");
      setAdding(false);
    }).catch(function(e){alert("Błąd: "+e.message);setAdding(false);});
  }

  function moveStage(dealId,stage){
    var deal=(deals||[]).find(function(d){return String(d.id)===String(dealId);});
    var stageObj=CRM_STAGES.find(function(s){return s.id===stage;});
    setDeals(function(prev){return prev.map(function(d){return String(d.id)===String(dealId)?Object.assign({},d,{stage:stage}):d;});});
    sbApi.updateDeal(dealId,{stage:stage,updated_at:new Date().toISOString()});
    // Zaktualizuj status klienta
    if(deal&&stageObj){
      var newStatus=stageObj.clientStatus||"nowe";
      sbApi.updateClientStatus(deal.client_id,newStatus);
      p.onClientStatusChange&&p.onClientStatusChange(deal.client_id,newStatus);
    }
  }

  function openDeal(deal){setModalDeal(deal);}

  function onDealSave(dealId,data){
    setDeals(function(prev){return prev.map(function(d){return d.id===dealId?Object.assign({},d,data):d;});});
    setModalDeal(null);
  }

  function onDealDelete(dealId){
    sbApi.deleteDeal(dealId).then(function(){
      setDeals(function(prev){return prev.filter(function(d){return d.id!==dealId;});});
      setModalDeal(null);
    }).catch(function(e){alert("Błąd: "+e.message);});
  }

  function goToClient(clientId){
    p.pushModeReturn&&p.pushModeReturn();
    p.setCurClientId(clientId);
    p.setScreen("rooms");
    p.setAppMode("wyceniarka");
  }

  // Skrot z karty deala prosto do ekranu "Podsumowanie" danego klienta
  // (bez przechodzenia przez karte klienta / liste pomieszczen).
  function goToClientSummary(clientId){
    p.pushModeReturn&&p.pushModeReturn();
    p.setCurClientId(clientId);
    p.setScreen("sum");
    p.setAppMode("wyceniarka");
  }

  if(loadingDeals){
    return ce("div",{style:{textAlign:"center",padding:"3rem",color:"var(--t3)",fontSize:13}},"Ładowanie CRM...");
  }

  // Klienci bez dealu (do dodania)
  var dealClientIds=(deals||[]).map(function(d){return String(d.client_id);});
  var clientsForSelect=p.clients.filter(function(cl){return !dealClientIds.includes(String(cl.id));});

  return ce("div",null,
    // Panel dodawania dealu
    ce("div",{style:{display:"flex",gap:8,marginBottom:"1.2rem",alignItems:"center"}},
      ce("select",{
        value:newClientId,
        onChange:function(e){setNewClientId(e.target.value);},
        style:{flex:1,padding:"9px 11px",borderRadius:10,border:"1px solid var(--bd2)",background:"var(--bg)",fontSize:13,color:newClientId?"var(--t1)":"var(--t3)",fontFamily:"inherit"}
      },
        ce("option",{value:""},"Wybierz klienta…"),
        clientsForSelect.map(function(cl){
          return ce("option",{key:cl.id,value:cl.id},cl.name);
        })
      ),
      ce("button",{
        onClick:addDeal,
        disabled:!newClientId||adding,
        style:{padding:"9px 16px",borderRadius:10,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:13,fontWeight:700,cursor:!newClientId||adding?"not-allowed":"pointer",opacity:!newClientId?0.4:1,whiteSpace:"nowrap"}
      },adding?"\u23F3":"+ Deal")
    ),
    // Kanban
    ce(KanbanBoard,{
      deals:deals,clients:p.clients,moveStage:moveStage,
      openDeal:openDeal,fmtDate:fmtDate,clientTotal2:clientTotal2
    }),
    // Modall
    modalDeal?ce(ModalDeal,{
      deal:modalDeal,
      client:p.clients.find(function(c){return String(c.id)===String(modalDeal.client_id);})||null,
      gcalToken:gcalToken,
      setGcalToken:setGcalToken,
      gsiReady:gsiReady,
      calList:calList,
      onSave:function(data){onDealSave(modalDeal.id,data);},
      onDelete:function(){onDealDelete(modalDeal.id);},
      onClose:function(){setModalDeal(null);},
      onGoToClient:function(){goToClient(modalDeal.client_id);},
      onGoToSummary:function(){goToClientSummary(modalDeal.client_id);}
    }):null
  );
}

// ── APP ────────────────────────────────────────────────────────────────────
