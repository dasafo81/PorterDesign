import React, { useState, useRef, useEffect, Fragment } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { sbApi, SB_URL, SB_KEY } from '../lib/supabase.js';
import { LOGO_SRC, mg, calc, getPanelsForProd, roundTo10 } from '../constants/data.js';
import { gcalLogin, gcalLogout, gcalGetToken, gcalHasValidToken, gcalWaitReady, GCAL_CLIENT_ID, GCAL_SCOPES } from '../lib/gcal.js';
const ce = React.createElement;



export const CRM_STAGES =[
  {id:"zapytanie",  label:"Zapytanie",  color:"#6366f1", clientStatus:"nowe"},
  {id:"pomiar",     label:"Pomiar",     color:"#f59e0b", clientStatus:"nowe"},
  {id:"wycena",     label:"Wycena",     color:"#3b82f6", clientStatus:"nowe"},
  {id:"zamowienie", label:"Zamówienie", color:"#8b5cf6", clientStatus:"nowe"},
  {id:"realizacja", label:"Realizacja", color:"#10b981", clientStatus:"nowe"},
  {id:"montaz",     label:"Monta\u017c",     color:"#f97316", clientStatus:"nowe"},
  {id:"zakonczone", label:"Zako\u0144czone", color:"#6b7280", clientStatus:"zrealizowane"}
];
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
  return comm>0?roundTo10(sum*(1+comm/100)):roundTo10(sum);
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
  var sac=useState(d.acquisition||""),acquisition=sac[0],setAcquisition=sac[1];
  var ssh=useState(d.sewing_house||""),sewingHouse=ssh[0],setSewingHouse=ssh[1];
  var ssd=useState(d.sewing_sent_date?d.sewing_sent_date.slice(0,10):""),sewingSentDate=ssd[0],setSewingSentDate=ssd[1];
  var ssc=useState(!!d.sewing_confirmed),sewingConfirmed=ssc[0],setSewingConfirmed=ssc[1];
  var srev=useState(!!d.review_sent),reviewSent=srev[0],setReviewSent=srev[1];
  var sinv=useState(!!d.invoice_sent),invoiceSent=sinv[0],setInvoiceSent=sinv[1];
  var sat=useState([]),attachments=sat[0],setAttachments=sat[1];
  var sul=useState(false),uploading=sul[0],setUploading=sul[1];
  var sbusy=useState(false),busy=sbusy[0],setBusy=sbusy[1];

  var SEWING_HOUSES_OPT=[
    "TRINITAS — ul. Składowa 9, 86-300 Grudziądz",
    "LaurAles — ul. Kolegialna 35 lok.1, 09-402 Płock",
    "Marcin Dekor — ul. Terespolska 75, 05-074 Halinów",
    "Szwalnia Niteczkami — Barbara Jasińska, Troszyn Polski 38B"
  ];
  var INSTALLER_OPTIONS=["","Darek","Rafał","Grzesiek","Damian"];
  var ACQUISITION_OPTIONS=["","Polecenie","porterdesign.pl","kapadesign.pl","Piotr Skowroń","Projektant"];

  var clientName=cl?cl.name:"(brak klienta)";
  var clientTotal=cl&&cl.rooms?(cl.rooms||[]).reduce(function(a,r){return a+(r.windows||[]).reduce(function(b,w){return b+(w.products||[]).reduce(function(c2,pr){var pfc=(pr.type==="zaslona"||pr.type==="firana")?mg(pr,{panels:getPanelsForProd(pr)}):pr;return c2+(pr.mp!=null?pr.mp:calc(pfc).total||0);},0);},0);},0):0;

  React.useEffect(function(){
    sbApi.getAttachments(d.id).then(function(a){setAttachments(a||[]);});
  },[d.id]);

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
      acquisition:acquisition||null,
      sewing_house:sewingHouse||null,
      sewing_sent_date:sewingSentDate||null,
      sewing_confirmed:sewingConfirmed,
      review_sent:reviewSent,
      invoice_sent:invoiceSent,
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

  function addToGcal(title,dateStr){
    if(!dateStr){alert("Nie wybrano daty.");return;}
    if(!gcalToken){alert("Zaloguj się najpierw do Google Calendar.");return;}
    if(!calList.length){alert("Brak dostępnych kalendarzy.");return;}
    var calId=installerCalId||(calList.find(function(c){return c.primary;})||calList[0]).id;
    var startDt=new Date(dateStr);
    var endDt=new Date(startDt.getTime()+60*60*1000);
    function pad(n){return String(n).padStart(2,"0");}
    function fmtLocal(dt){return dt.getFullYear()+"-"+pad(dt.getMonth()+1)+"-"+pad(dt.getDate())+"T"+pad(dt.getHours())+":"+pad(dt.getMinutes())+":00";}
    var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    var event={summary:title+(cl?" — "+cl.name:""),description:notes||"",start:{dateTime:fmtLocal(startDt),timeZone:tz},end:{dateTime:fmtLocal(endDt),timeZone:tz}};
    fetch("https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calId)+"/events",{
      method:"POST",headers:{"Authorization":"Bearer "+gcalToken,"Content-Type":"application/json"},body:JSON.stringify(event)
    }).then(function(r){
      if(r.status===401){return gcalGetToken().then(function(fresh){setGcalToken(fresh);alert("Token odświeżony — spróbuj ponownie.");});}
      if(!r.ok)return r.text().then(function(t){throw new Error(t);});
      return r.json();
    }).then(function(ev){
      if(ev&&ev.id)alert("Dodano do kalendarza: "+calId);
    }).catch(function(e){alert("Błąd GCal: "+e.message);});
  }

  var INP={padding:"10px 12px",fontSize:13,border:"1px solid var(--bd2)",borderRadius:9,background:"var(--bg)",color:"var(--t1)",width:"100%",boxSizing:"border-box",outline:"none"};

  function CheckRow(rp){
    return ce("div",{
      onClick:function(){rp.onChange(!rp.checked);},
      style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",borderRadius:9,
        background:rp.checked?"rgba(124,58,237,0.08)":"transparent",
        border:"1px solid "+(rp.checked?"var(--t1)":"var(--bd2)"),
        transition:"all .15s",userSelect:"none"}
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
          ce("button",{onClick:p.onGoToClient,style:{marginLeft:"auto",background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.4)",borderRadius:8,color:"#fff",fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:600}},
            "→ Karta klienta"
          )
        )
      ),

      ce("div",{style:{padding:"18px 20px 24px"}},

        ce(SectionCard,{icon:"📅",title:"Spotkanie",done:visitDone},
          ce("div",{style:{display:"flex",gap:8,alignItems:"flex-end"}},
            ce("div",{style:{flex:1}},
              ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"DATA I GODZINA"),
              ce("input",{type:"datetime-local",value:visitDate,onChange:function(ev){setVisitDate(ev.target.value);},style:INP})
            ),
            visitDate&&gcalToken?ce("button",{
              onClick:function(){addToGcal("Spotkanie pomiarowe",visitDate);},
              title:"Dodaj do Google Calendar",
              style:{padding:"10px 12px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg)",cursor:"pointer",fontSize:16,flexShrink:0}
            },"📅"):null
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
          ce("div",{style:{display:"flex",gap:8,alignItems:"flex-end"}},
            ce("div",{style:{flex:1}},
              ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"DATA I GODZINA"),
              ce("input",{type:"datetime-local",value:delivDate,onChange:function(ev){setDelivDate(ev.target.value);},style:INP})
            ),
            delivDate&&gcalToken?ce("button",{
              onClick:function(){addToGcal("Montaż",delivDate);},
              title:"Dodaj montaż do Google Calendar",
              style:{padding:"10px 12px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg)",cursor:"pointer",fontSize:16,flexShrink:0}
            },"📅"):null
          ),
          ce("div",{style:{display:"flex",gap:8}},
            ce("div",{style:{flex:1}},
              ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"MONTAŻYSTA"),
              ce("select",{value:installerName,onChange:function(ev){setInstallerName(ev.target.value);},style:INP},
                INSTALLER_OPTIONS.map(function(o,i){return ce("option",{key:i,value:o},o||"— wybierz —");})
              )
            ),
            calList.length>0?ce("div",{style:{flex:1}},
              ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"KALENDARZ"),
              ce("select",{value:installerCalId,onChange:function(ev){setInstallerCalId(ev.target.value);},style:INP},
                ce("option",{value:""},"— główny —"),
                calList.map(function(c){return ce("option",{key:c.id,value:c.id},c.summary);})
              )
            ):null
          ),
          ce(CheckRow,{checked:installDone,onChange:setInstallDone,label:"Montaż zrealizowany",sublabel:delivDate?("Zaplanowany: "+fmtDate(delivDate)+(installerName?" — "+installerName:"")):null})
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

        ce(SectionCard,{icon:"🌟",title:"Obsługa posprzedażowa",done:reviewSent&&invoiceSent},
          ce(CheckRow,{checked:reviewSent,onChange:setReviewSent,label:"Wysłano prośbę o opinię",sublabel:"Google / Facebook / referencja"}),
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
  var sView=useState("month"),calView=sView[0],setCalView=sView[1];
  var sRefDate=useState(function(){return new Date();}),refDate=sRefDate[0],setRefDate=sRefDate[1];
  var sNewEv=useState(null),newEvDraft=sNewEv[0],setNewEvDraft=sNewEv[1];
  var sCalList=useState([]),calList=sCalList[0],setCalList=sCalList[1];
  var sSelGcalEv=useState(null),selectedGcalEv=sSelGcalEv[0],setSelectedGcalEv=sSelGcalEv[1];

  // Fetch zdarzeń gdy mamy token i zmienia się refDate/view
  React.useEffect(function(){
    if(!gcalToken) return;
    fetchCalendarList(gcalToken);
    fetchEvents(gcalToken);
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
        fetchEvents(token);
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

  function fetchEvents(token){
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
    var calsToFetch = calList.length>0 ? calList : [{id:"primary",summary:"",color:"#4285f4",primary:true}];
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
            return Object.assign({},ev,{_calId:calMeta.id,_calColor:calMeta.color,_calName:calMeta.summary});
          });
        })
        .catch(function(){return [];});
    }
    Promise.all(calsToFetch.map(function(c){return doFetchOne(c,token);}))
      .then(function(arrays){
        var merged=[];
        arrays.forEach(function(a){merged=merged.concat(a);});
        setGcalEvents(merged);
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
  (p.deals||[]).forEach(function(deal){
    var cl=p.clients.find(function(c){return String(c.id)===String(deal.client_id);})||null;
    var name=cl?cl.name:"Klient";
    if(deal.visit_date){dealEvents.push({date:new Date(deal.visit_date),label:"\uD83D\uDCCF Pomiar",client:name,deal:deal,color:"#3b82f6",type:"visit"});}
    if(deal.delivery_date){dealEvents.push({date:new Date(deal.delivery_date),label:"\uD83D\uDE9A Realizacja",client:name,deal:deal,color:"#10b981",type:"delivery"});}
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
    var descParts=["Klient: "+ev.client];
    if(clData&&clData.address)descParts.push("Adres: "+clData.address);
    if(clData&&clData.phone)descParts.push("Tel: "+clData.phone);
    if(ev.deal&&ev.deal.title)descParts.push("Deal: "+ev.deal.title);
    
    if(ev.type==="delivery"&&ev.deal&&ev.deal.installer_calendar_id){
      targetCalId = ev.deal.installer_calendar_id;
      var installerCal = calList.find(function(c){return c.id===ev.deal.installer_calendar_id;});
      if(installerCal) descParts.push("Monta\u017cysta: "+installerCal.summary);
    }
    
    var body={
      summary:ev.label+" \u2014 "+ev.client,
      description:descParts.join(" | "),
      location:clData&&clData.address?clData.address:undefined,
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
    var sel=ev.selectedCals||[];
    if(sel.length===0){alert('Wybierz co najmniej jeden kalendarz.');return;}
    var start=new Date(ev.date+'T'+ev.timeFrom+':00');
    var end=new Date(ev.date+'T'+ev.timeTo+':00');
    if(end<=start){alert('Godzina zako\u0144czenia musi by\u0107 p\u00f3\u017aniejsza ni\u017c rozpocz\u0119cia.');return;}
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
      if(isSameDay(d,date)) result.push({type:"gcal",title:ev.summary||"(bez tytułu)",color:ev._calColor||"#4285f4",time:ev.start.dateTime?d:null,calName:ev._calName||"",gcalRaw:ev});
    });
    // Deal events
    dealEvents.forEach(function(ev){
      if(isSameDay(ev.date,date)) result.push({type:"deal",title:ev.label+" "+ev.client,color:ev.color,time:ev.date,dealEv:ev});
    });
    result.sort(function(a,b){return (a.time||0)-(b.time||0);});
    return result;
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
      ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:1}},
        DOW_PL.map(function(d,i){return ce("div",{key:i,style:{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--t3)",padding:"6px 0",letterSpacing:"0.07em",textTransform:"uppercase",background:"var(--bg2)"}},d);})
      ),
      // Siatka dni
      ce("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}},
        days.map(function(d,i){
          if(!d) return ce("div",{key:i,style:{background:"var(--bg2)",minHeight:80,opacity:0.3}});
          var evs=getEventsForDay(d);
          var isToday=isSameDay(d,today);
          var isCurrentMonth=d.getMonth()===month;
          return ce("div",{key:i,style:{background:"var(--bg)",minHeight:80,padding:"4px 5px",border:"1px solid var(--bd2)",borderTop:isToday?"2px solid var(--t1)":"1px solid var(--bd2)",position:"relative"}},
            ce("div",{style:{fontSize:11,fontWeight:isToday?700:400,background:isToday?"var(--t1)":null,color:isToday?"var(--bg)":"var(--t2)",width:isToday?20:null,height:isToday?20:null,borderRadius:isToday?10:null,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}},d.getDate()),
            evs.slice(0,3).map(function(ev,ei){return ce("div",{key:ei,title:ev.title,style:{fontSize:10,padding:"1px 4px",borderRadius:3,background:ev.color+"22",color:ev.color,marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer",fontWeight:600},onClick:function(){if(ev.dealEv){p.onDealClick&&p.onDealClick(ev.dealEv.deal);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}}},
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
    var hours=[];for(var h=7;h<22;h++) hours.push(h);

    return ce("div",{style:{overflowX:"auto"}},
      ce("div",{style:{display:"grid",gridTemplateColumns:"44px repeat(7,1fr)",minWidth:520}},
        // Nagłówek
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
        }),
        // Godziny
        hours.map(function(h){
          return [
            ce("div",{key:"h"+h,style:{fontSize:9,color:"var(--t3)",textAlign:"right",paddingRight:6,paddingTop:2,borderTop:"1px solid var(--bd2)"}},h+":00"),
            weekDays.map(function(d,di){
              var evs=getEventsForDay(d).filter(function(ev){return ev.time&&new Date(ev.time).getHours()===h;});
              return ce("div",{key:"d"+di,style:{borderLeft:"1px solid var(--bd2)",borderTop:"1px solid var(--bd2)",minHeight:36,padding:2,position:"relative"}},
                evs.map(function(ev,ei){return ce("div",{key:ei,title:ev.title,onClick:function(){if(ev.dealEv){p.onDealClick&&p.onDealClick(ev.dealEv.deal);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},style:{fontSize:9,padding:"2px 4px",borderRadius:3,background:ev.color,color:"#fff",marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer",fontWeight:600}},ev.title);})
              );
            })
          ];
        })
      )
    );
  }

  // ── Render widoku dziennego ──
  function renderDayView(){
    var evs=getEventsForDay(refDate);
    var today=new Date();
    var isToday=isSameDay(refDate,today);
    var hours=[];for(var h=7;h<23;h++) hours.push(h);
    return ce("div",{style:{overflowY:"auto",maxHeight:600}},
      evs.length===0?ce("div",{style:{padding:"40px 24px",textAlign:"center",color:"var(--t3)",fontSize:13}},
        ce("div",{style:{fontSize:40,marginBottom:8,opacity:0.25}},"📅"),
        "Brak wydarzeń w tym dniu"
      ):null,
      hours.map(function(h){
        var hEvs=evs.filter(function(ev){return ev.time&&new Date(ev.time).getHours()===h;});
        var allDayEvs=h===7?evs.filter(function(ev){return !ev.time;}):[];
        var hasContent=hEvs.length>0||allDayEvs.length>0;
        return ce("div",{key:h,style:{display:"flex",gap:0,borderTop:"1px solid "+(hasContent?"var(--bd2)":"var(--bd3)"),minHeight:hasContent?52:32}},
          ce("div",{style:{width:52,flexShrink:0,padding:"5px 8px 0",fontSize:10,color:hasContent?"var(--t3)":"var(--bd2)",fontWeight:hasContent?700:400,textAlign:"right",userSelect:"none"}},h+":00"),
          ce("div",{style:{flex:1,padding:"4px 8px",display:"flex",flexDirection:"column",gap:4}},
            allDayEvs.map(function(ev,ei){
              return ce("div",{key:"ad"+ei,
                onClick:function(){if(ev.dealEv){p.onDealClick&&p.onDealClick(ev.dealEv.deal);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},
                style:{padding:"5px 10px",borderRadius:6,background:ev.color+"22",borderLeft:"3px solid "+ev.color,
                  color:ev.color,fontSize:12,fontWeight:700,cursor:"pointer"}},
                "ϕ Cały dzień — ",ev.title
              );
            }),
            hEvs.map(function(ev,ei){
              var t=ev.time?new Date(ev.time):null;
              return ce("div",{key:ei,
                onClick:function(){if(ev.dealEv){p.onDealClick&&p.onDealClick(ev.dealEv.deal);}else if(ev.gcalRaw){setSelectedGcalEv(ev.gcalRaw);}},
                style:{padding:"7px 10px",borderRadius:8,background:ev.color+"18",borderLeft:"3px solid "+ev.color,
                  cursor:"pointer",display:"flex",alignItems:"flex-start",gap:8}},
                ce("div",{style:{fontSize:11,color:ev.color,fontWeight:700,flexShrink:0,minWidth:38}},
                  t?(t.getHours()+":"+String(t.getMinutes()).padStart(2,"0")):null
                ),
                ce("div",{style:{fontSize:13,color:"var(--t1)",fontWeight:600,flex:1,lineHeight:1.4}},
                  ev.title,
                  ev.gcalRaw&&ev.gcalRaw._calName
                    ?ce("div",{style:{fontSize:10,color:"var(--t3)",fontWeight:400,marginTop:2}},ev.gcalRaw._calName)
                    :null
                )
              );
            })
          )
        );
      })
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
          return ce("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd2)",borderLeft:"3px solid "+ev.color,cursor:"pointer"},onClick:function(){p.onDealClick&&p.onDealClick(ev.deal);}},
            ce("div",{style:{flexShrink:0,textAlign:"center",minWidth:32}},
              ce("div",{style:{fontSize:16,fontWeight:700,color:ev.color,lineHeight:1}},ev.date.getDate()),
              ce("div",{style:{fontSize:9,color:"var(--t3)",textTransform:"uppercase"}},ev.date.toLocaleDateString("pl-PL",{month:"short"}))
            ),
            ce("div",{style:{flex:1,fontSize:12,fontWeight:600,color:"var(--t1)"}},ev.label+" \u2014 "+ev.client),
            gcalToken?ce("button",{onClick:function(e){e.stopPropagation();addDealEventToGcal(ev);},style:{padding:"4px 9px",borderRadius:6,border:"1px solid #4285f4",background:"none",color:"#4285f4",fontSize:10,cursor:"pointer",flexShrink:0}},"\uD83D\uDCC5 Dodaj do GCal"):null
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
        ce('div',{style:{fontSize:16,fontWeight:700,color:'var(--t1)',marginBottom:16}},'\uD83D\uDCC5 Nowe zdarzenie w Google Calendar'),
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
        ce('div',{style:{marginBottom:16}},
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
        ),
        ce('div',{style:{display:'flex',gap:10}},
          ce('button',{
            onClick:function(){setNewEvDraft(null);},
            disabled:newEvDraft.saving,
            style:{flex:1,padding:'10px',borderRadius:10,border:'1px solid var(--bd2)',background:'var(--bg2)',color:'var(--t1)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}
          },'Anuluj'),
          ce('button',{
            onClick:addCustomEvent,
            disabled:newEvDraft.saving||!newEvDraft.title.trim()||!newEvDraft.date||(newEvDraft.selectedCals||[]).length===0,
            style:{flex:2,padding:'10px',borderRadius:10,border:'none',
              background:(newEvDraft.saving||!newEvDraft.title.trim()||!newEvDraft.date||(newEvDraft.selectedCals||[]).length===0)?'var(--bd2)':'#4285f4',
              color:(newEvDraft.saving||!newEvDraft.title.trim()||!newEvDraft.date||(newEvDraft.selectedCals||[]).length===0)?'var(--t3)':'#fff',
              fontSize:13,fontWeight:700,cursor:newEvDraft.saving?'wait':'pointer',fontFamily:'inherit'}
          },newEvDraft.saving?'\u23F3 Zapisuj\u0119...':((newEvDraft.selectedCals||[]).length>1?'\uD83D\uDCC5 Dodaj do '+(newEvDraft.selectedCals||[]).length+' kalendarzy':'\uD83D\uDCC5 Dodaj do Google Calendar'))
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
        selectedGcalEv.htmlLink?ce('a',{href:selectedGcalEv.htmlLink,target:'_blank',rel:'noopener noreferrer',style:{display:'block',marginTop:16,textAlign:'center',padding:'9px',borderRadius:10,border:'1px solid #4285f4',color:'#4285f4',fontSize:12,fontWeight:700,textDecoration:'none'}},'Otwórz w Google Calendar \u2197'):null,
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
    ):null
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
  var total=cl?clientTotal2(cl):0;
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
  var stageDeals=(deals||[]).filter(function(d){return d.stage===stage.id;});
  return ce("div",{style:{flex:"1 1 0",minWidth:190,maxWidth:280}},
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
      ce("div",{style:{margin:"14px 0 8px",height:1,background:"var(--bd2)"}}),
      ce("div",{style:{display:"flex",gap:10,paddingBottom:4,marginLeft:-4,paddingLeft:4,flexWrap:"wrap"}},
        ce(KanbanCol,Object.assign({stage:STAGE_ODRZUCONE},colProps))
      )
    )
  );
}


export function ScreenCRM(p){
  // p: clients, setScreen, setAppMode, setCurClientId
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
    p.setCurClientId(clientId);
    p.setScreen("rooms");
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
      onGoToClient:function(){goToClient(modalDeal.client_id);}
    }):null
  );
}

// ── APP ────────────────────────────────────────────────────────────────────
