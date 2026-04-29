import React, { useState, useRef, useEffect, Fragment } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sbApi } from '../lib/supabase.js';
import { LOGO_SRC } from '../constants/data.js';
const ce = React.createElement;



export const CRM_STAGES =[
  {id:"zapytanie",  label:"Zapytanie",  color:"#6366f1", clientStatus:"nowe"},
  {id:"pomiar",     label:"Pomiar",     color:"#f59e0b", clientStatus:"nowe"},
  {id:"wycena",     label:"Wycena",     color:"#3b82f6", clientStatus:"nowe"},
  {id:"zamowienie", label:"Zamówienie", color:"#8b5cf6", clientStatus:"nowe"},
  {id:"realizacja", label:"Realizacja", color:"#10b981", clientStatus:"nowe"},
  {id:"zakonczone", label:"Zakończone", color:"#6b7280", clientStatus:"zrealizowane"}
];
export const STAGE_ODRZUCONE ={id:"odrzucone",label:"Odrzucone",color:"#ef4444",clientStatus:"odrzucone"};

export function clientTotal2(cl){
  if(!cl||!cl.rooms)return 0;
  return (cl.rooms||[]).reduce(function(a,r){
    return a+(r.windows||[]).reduce(function(b,w){
      return b+(w.products||[]).reduce(function(c,p){
        var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;
        return c+(p.mp!=null?p.mp:(calc(pfc).total||0));
      },0);
    },0);
  },0);
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
  // p: deal, client, onSave(data), onDelete, onClose, onGoToClient
  var d=p.deal;
  var sn=useState(d.notes||""),notes=sn[0],setNotes=sn[1];
  var sv=useState(d.visit_date?d.visit_date.slice(0,16):""),visitDate=sv[0],setVisitDate=sv[1];
  var sdel=useState(d.delivery_date?d.delivery_date.slice(0,16):""),delivDate=sdel[0],setDelivDate=sdel[1];
  var sac=useState(d.acquisition||""),acquisition=sac[0],setAcquisition=sac[1];
  var sat=useState([]),attachments=sat[0],setAttachments=sat[1];
  var sul=useState(false),uploading=sul[0],setUploading=sul[1];
  var sbusy=useState(false),busy=sbusy[0],setBusy=sbusy[1];
  var sqv=useState(false),showQuote=sqv[0],setShowQuote=sqv[1];
  var cl=p.client;

  React.useEffect(function(){
    sbApi.getAttachments(d.id).then(function(a){setAttachments(a||[]);});
  },[d.id]);

  function save(){
    setBusy(true);
    sbApi.updateDeal(d.id,{
      notes:notes,
      visit_date:visitDate||null,
      delivery_date:delivDate||null,
      acquisition:acquisition||null,
      updated_at:new Date().toISOString()
    }).then(function(){
      p.onSave({notes:notes,visit_date:visitDate||null,delivery_date:delivDate||null,acquisition:acquisition||null});
      setBusy(false);
      p.onClose();
    }).catch(function(e){alert("B\u0142\u0105d: "+e.message);setBusy(false);});
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
    }).catch(function(e){alert("B\u0142\u0105d uploadu: "+e.message);setUploading(false);});
  }

  var IST={width:"100%",padding:"9px 11px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg)",fontSize:13,color:"var(--t1)",fontFamily:"inherit",boxSizing:"border-box"};
  var LBL={fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,display:"block"};
  var SEC={marginBottom:20};

  var clientName=cl?cl.name:"(brak klienta)";
  var total=cl?clientTotal2(cl):0;

  function CalBtn(props){
    var url=gcalLink(props.title,props.date,"Klient: "+clientName);
    if(!props.date||!url)return null;
    return ce("a",{href:url,target:"_blank",rel:"noopener noreferrer",
      style:{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#4285f4",textDecoration:"none",border:"1px solid #4285f4",borderRadius:6,padding:"2px 7px",marginLeft:8,verticalAlign:"middle",flexShrink:0}
    },"\uD83D\uDCC5 Dodaj do GCal");
  }

  // ── Wycena uproszczona inline ──
  function QuoteSection(){
    if(!cl||!(cl.rooms&&cl.rooms.length))return ce("div",{style:{fontSize:13,color:"var(--t3)",padding:"10px 0"}},"Brak wyceny");
    var rows=[];
    var grand=0;
    (cl.rooms||[]).forEach(function(r){
      var roomTot=0;
      (r.windows||[]).forEach(function(w){
        var winTot=(w.products||[]).reduce(function(a,pr){return a+(pr.mp!=null?pr.mp:0);},0);
        roomTot+=winTot;
      });
      if(!roomTot)return;
      grand+=roomTot;
      rows.push({room:r.name||"Pom\u00f3j",windows:r.windows,roomTot:roomTot});
    });
    if(!rows.length)return ce("div",{style:{fontSize:13,color:"var(--t3)",padding:"10px 0"}},"Brak wyceny");
    return ce("div",null,
      rows.map(function(row,ri){
        return ce("div",{key:ri,style:{marginBottom:12}},
          ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}},row.room),
          (row.windows||[]).filter(function(w){
            return (w.products||[]).some(function(pr){return pr.mp!=null&&pr.mp>0;});
          }).map(function(w,wi){
            var winTot=(w.products||[]).reduce(function(a,pr){return a+(pr.mp!=null?pr.mp:0);},0);
            return ce("div",{key:wi,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 10px",background:"var(--bg)",borderRadius:7,marginBottom:3}},
              ce("span",{style:{fontSize:12,color:"var(--t1)"}},(w.name||"Okno "+(wi+1))),
              ce("span",{style:{fontSize:12,fontWeight:600,color:"var(--t1)"}},Math.round(winTot/10)*10+" z\u0142")
            );
          })
        );
      }),
      ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 10px",borderTop:"2px solid var(--bd2)",marginTop:6}},
        ce("span",{style:{fontSize:13,fontWeight:700,color:"var(--t1)"}},"RAZEM"),
        ce("span",{style:{fontSize:16,fontWeight:800,color:"var(--t1)"}},Math.round(grand/10)*10+" z\u0142")
      )
    );
  }

  var ACQUISITION_OPTIONS=["","Polecenie","porterdesign.pl","kapadesign.pl","Piotr Skowro\u0144","Projektant"];

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0"}},
    ce("div",{style:{background:"var(--bg2)",width:"100%",maxWidth:540,borderRadius:"20px 20px 0 0",maxHeight:"92vh",overflowY:"auto",padding:"24px 20px 32px"}},

      // ── Header ──
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}},
        ce("div",null,
          ce("div",{style:{fontSize:17,fontWeight:700,color:"var(--t1)"}},"Karta Deala"),
          ce("div",{style:{fontSize:13,color:"var(--t3)",marginTop:2}},clientName)
        ),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",fontSize:22,cursor:"pointer",color:"var(--t3)",padding:"4px 6px"}},"\u00D7")
      ),

      // ── Dane klienta ──
      cl?ce("div",{style:{...SEC,background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:11,padding:"12px 14px"}},
        ce("div",{style:{fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}},"DANE KLIENTA"),
        cl.phone?ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
          ce("span",{style:{fontSize:12,color:"var(--t3)",width:56}},"Telefon"),
          ce("a",{href:"tel:"+cl.phone,style:{fontSize:13,color:"var(--t1)",textDecoration:"none",fontWeight:500}},cl.phone)
        ):null,
        cl.email?ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
          ce("span",{style:{fontSize:12,color:"var(--t3)",width:56}},"E-mail"),
          ce("a",{href:"mailto:"+cl.email,style:{fontSize:13,color:"var(--t1)",textDecoration:"none",fontWeight:500}},cl.email)
        ):null,
        cl.addr?ce("div",{style:{display:"flex",alignItems:"flex-start",gap:8}},
          ce("span",{style:{fontSize:12,color:"var(--t3)",width:56,paddingTop:1}},"Adres"),
          ce("span",{style:{fontSize:13,color:"var(--t1)"}},cl.addr)
        ):null,
        ce("button",{onClick:p.onGoToClient,style:{marginTop:10,width:"100%",border:"1.5px solid var(--bd2)",background:"transparent",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",color:"var(--t1)"}},"\u2192 Przej\u015b\u0107 do wyceny")
      ):null,

      // ── Sposób pozyskania ──
      ce("div",{style:SEC},
        ce("label",{style:LBL},"SPOS\u00d3B POZYSKANIA"),
        ce("select",{value:acquisition,onChange:function(e){setAcquisition(e.target.value);},style:{...IST,appearance:"none",WebkitAppearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center",paddingRight:32}},
          ACQUISITION_OPTIONS.map(function(o){
            return ce("option",{key:o,value:o},o||"— wybierz \u017ar\u00f3d\u0142o —");
          })
        )
      ),

      // ── Terminarz ──
      ce("div",{style:{...SEC,background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:11,padding:"14px 14px 10px"}},
        ce("div",{style:{fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}},"TERMINARZ"),
        ce("div",{style:{marginBottom:12}},
          ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}},
            ce("label",{style:{...LBL,marginBottom:0}},"Spotkanie / Pomiar"),
            ce(CalBtn,{title:"Spotkanie \u2014 "+clientName,date:visitDate})
          ),
          ce("input",{type:"datetime-local",value:visitDate,onChange:function(e){setVisitDate(e.target.value);},style:IST})
        ),
        ce("div",null,
          ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}},
            ce("label",{style:{...LBL,marginBottom:0}},"Monta\u017c"),
            ce(CalBtn,{title:"Monta\u017c \u2014 "+clientName,date:delivDate})
          ),
          ce("input",{type:"datetime-local",value:delivDate,onChange:function(e){setDelivDate(e.target.value);},style:IST})
        )
      ),

      // ── Wycena ──
      total>0?ce("div",{style:SEC},
        ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}},
          ce("div",{style:{fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:"0.12em",textTransform:"uppercase"}},"WYCENA"),
          ce("button",{onClick:function(){setShowQuote(function(v){return !v;});},
            style:{fontSize:11,color:"var(--t3)",background:"none",border:"1px solid var(--bd2)",borderRadius:6,padding:"2px 9px",cursor:"pointer"}
          },showQuote?"zwiń \u25b2":"rozwiń \u25bc")
        ),
        ce("div",{style:{background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:11,padding:"12px 14px"}},
          ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showQuote?12:0}},
            ce("span",{style:{fontSize:13,color:"var(--t3)"}},"Warto\u015b\u0107 zamówienia"),
            ce("span",{style:{fontSize:20,fontWeight:800,color:"var(--t1)"}},Math.round(total/10)*10+" z\u0142")
          ),
          showQuote?ce(QuoteSection,null):null
        )
      ):null,

      // ── Notatki ──
      ce("div",{style:SEC},
        ce("label",{style:LBL},"NOTATKI"),
        ce("textarea",{value:notes,onChange:function(e){setNotes(e.target.value);},rows:4,placeholder:"Historia kontaktu, uwagi...",style:{...IST,resize:"vertical",lineHeight:1.5}})
      ),

      // ── Załączniki ──
      ce("div",{style:{marginBottom:20}},
        ce("label",{style:LBL},"ZA\u0141\u0104CZNIKI"),
        attachments.length>0?ce("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:8}},
          attachments.map(function(a){
            var isImg=/\.(jpg|jpeg|png|gif|webp)$/i.test(a.name||a.url);
            return ce("div",{key:a.id,style:{display:"flex",alignItems:"center",gap:8,background:"var(--bg)",borderRadius:8,padding:"6px 10px",border:"1px solid var(--bd2)"}},
              isImg?ce("img",{src:a.url,alt:a.name,style:{width:36,height:36,borderRadius:6,objectFit:"cover",flexShrink:0}}):ce("span",{style:{fontSize:18}},"\uD83D\uDCCE"),
              ce("a",{href:a.url,target:"_blank",rel:"noopener noreferrer",style:{flex:1,fontSize:12,color:"var(--t1)",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},a.name||"Plik"),
              ce("button",{onClick:function(){deleteAttach(a.id);},style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",fontSize:16,padding:"0 2px",opacity:0.5}},"\u00D7")
            );
          })
        ):null,
        ce("label",{style:{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",border:"1.5px dashed var(--bd2)",borderRadius:9,cursor:"pointer",fontSize:13,color:"var(--t3)"}},
          uploading?"\u23F3 Wysyłanie...":"\uFF0B Dodaj zdjęcie / plik",
          ce("input",{type:"file",accept:"image/*,.pdf",style:{display:"none"},onChange:function(e){var f=e.target.files&&e.target.files[0];if(f)uploadFile(f);e.target.value="";},disabled:uploading})
        )
      ),

      // ── Przyciski ──
      ce("div",{style:{display:"flex",gap:10}},
        ce("button",{onClick:save,disabled:busy,style:{flex:1,padding:"13px",borderRadius:11,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:14,fontWeight:700,cursor:busy?"wait":"pointer"}},busy?"Zapisuję...":"Zapisz"),
        ce("button",{onClick:function(){if(window.confirm("Usun\u0105\u0107 ten deal?"))p.onDelete();},style:{padding:"13px 16px",borderRadius:11,border:"1px solid var(--bd2)",background:"none",color:"var(--t3)",fontSize:13,cursor:"pointer"}},"Usu\u0144")
      )
    )
  );
}

// ── CRM KALENDARZ ────────────────────────────────────────────────────────────
export const GCAL_CLIENT_ID ="818744143681-cab0a79h5hoo4l4cracnltnh2bldi62r.apps.googleusercontent.com";
export const GCAL_SCOPES ="https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

export function CRMKalendarz(p){
  // p: deals, clients, onDealClick
  // Token i GSI przekazywane z ScreenCRM (przeżywają przełączanie zakładek)
  var gcalToken=p.gcalToken, setGcalToken=p.setGcalToken, gsiReady=p.gsiReady;
  var sEvents=useState([]),gcalEvents=sEvents[0],setGcalEvents=sEvents[1];
  var sLoadingEv=useState(false),loadingEv=sLoadingEv[0],setLoadingEv=sLoadingEv[1];
  var sErrEv=useState(null),errEv=sErrEv[0],setErrEv=sErrEv[1];
  var sView=useState("month"),calView=sView[0],setCalView=sView[1];
  var sRefDate=useState(function(){return new Date();}),refDate=sRefDate[0],setRefDate=sRefDate[1];

  // Fetch zdarzeń gdy mamy token i zmienia się refDate/view
  React.useEffect(function(){
    if(!gcalToken) return;
    fetchEvents(gcalToken);
  },[gcalToken, refDate.getFullYear(), refDate.getMonth(), calView]);

  function login(){
    if(!gsiReady||!window.google){alert("Biblioteka Google nie załadowana. Odśwież stronę.");return;}
    var client=window.google.accounts.oauth2.initTokenClient({
      client_id:GCAL_CLIENT_ID,
      scope:GCAL_SCOPES,
      callback:function(resp){
        if(resp.error){setErrEv("Błąd logowania: "+resp.error);return;}
        var tok=resp.access_token;
        var exp=Date.now()+(resp.expires_in||3600)*1000;
        try{localStorage.setItem("pd_gcal_token",tok);localStorage.setItem("pd_gcal_token_exp",String(exp));}catch(e){}
        setGcalToken(tok);
        setErrEv(null);
      }
    });
    client.requestAccessToken();
  }

  function logout(){
    try{localStorage.removeItem("pd_gcal_token");localStorage.removeItem("pd_gcal_token_exp");}catch(e){}
    setGcalToken(null);
    setGcalEvents([]);
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
    } else {
      from=new Date(refDate.getFullYear(),refDate.getMonth(),1);
      to=new Date(refDate.getFullYear(),refDate.getMonth()+1,0,23,59,59,999);
    }
    var url="https://www.googleapis.com/calendar/v3/calendars/primary/events"
      +"?timeMin="+encodeURIComponent(from.toISOString())
      +"&timeMax="+encodeURIComponent(to.toISOString())
      +"&singleEvents=true&orderBy=startTime&maxResults=200";
    fetch(url,{headers:{Authorization:"Bearer "+token}})
      .then(function(r){
        if(r.status===401){logout();setErrEv("Sesja wygasła — zaloguj się ponownie.");throw new Error("401");}
        return r.json();
      })
      .then(function(data){
        setGcalEvents(data.items||[]);
        setLoadingEv(false);
      })
      .catch(function(e){
        if(e.message!=="401") setErrEv("Błąd pobierania kalendarza.");
        setLoadingEv(false);
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
    var pad=function(n){return String(n).padStart(2,"0");};
    var body={
      summary:ev.label+" \u2014 "+ev.client,
      description:"Klient: "+ev.client+(ev.deal&&ev.deal.title?" | Deal: "+ev.deal.title:""),
      start:{dateTime:d.toISOString(),timeZone:"Europe/Warsaw"},
      end:{dateTime:new Date(d.getTime()+60*60000).toISOString(),timeZone:"Europe/Warsaw"}
    };
    fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events",{
      method:"POST",
      headers:{Authorization:"Bearer "+gcalToken,"Content-Type":"application/json"},
      body:JSON.stringify(body)
    }).then(function(r){return r.json();}).then(function(){
      fetchEvents(gcalToken);
      alert("Dodano do Google Calendar!");
    }).catch(function(){alert("B\u0142\u0105d dodawania zdarzenia.");});
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
      if(isSameDay(d,date)) result.push({type:"gcal",title:ev.summary||"(bez tytułu)",color:"#4285f4",time:ev.start.dateTime?d:null});
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
    else d.setMonth(d.getMonth()-1);
    setRefDate(d);
  }
  function nextPeriod(){
    var d=new Date(refDate);
    if(calView==="week") d.setDate(d.getDate()+7);
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
            evs.slice(0,3).map(function(ev,ei){return ce("div",{key:ei,title:ev.title,style:{fontSize:10,padding:"1px 4px",borderRadius:3,background:ev.color+"22",color:ev.color,marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:ev.dealEv?"pointer":"default",fontWeight:600},onClick:ev.dealEv?function(){p.onDealClick&&p.onDealClick(ev.dealEv.deal);}:null},
              (ev.time?(new Date(ev.time).getHours()+":"+String(new Date(ev.time).getMinutes()).padStart(2,"0")+" "):"")+ ev.title
            );}),
            evs.length>3?ce("div",{style:{fontSize:9,color:"var(--t3)",marginTop:1}},"+"+( evs.length-3)+" więcej"):null
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
          return ce("div",{key:i,style:{textAlign:"center",padding:"6px 2px",background:"var(--bg2)",borderLeft:"1px solid var(--bd2)"}},
            ce("div",{style:{fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.07em"}},DOW_PL[i]),
            ce("div",{style:{fontSize:16,fontWeight:700,background:isToday?"var(--t1)":null,color:isToday?"var(--bg)":"var(--t2)",width:isToday?28:null,height:isToday?28:null,borderRadius:isToday?14:null,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}},d.getDate())
          );
        }),
        // Godziny
        hours.map(function(h){
          return [
            ce("div",{key:"h"+h,style:{fontSize:9,color:"var(--t3)",textAlign:"right",paddingRight:6,paddingTop:2,borderTop:"1px solid var(--bd2)"}},h+":00"),
            weekDays.map(function(d,di){
              var evs=getEventsForDay(d).filter(function(ev){return ev.time&&new Date(ev.time).getHours()===h;});
              return ce("div",{key:"d"+di,style:{borderLeft:"1px solid var(--bd2)",borderTop:"1px solid var(--bd2)",minHeight:36,padding:2,position:"relative"}},
                evs.map(function(ev,ei){return ce("div",{key:ei,title:ev.title,onClick:ev.dealEv?function(){p.onDealClick&&p.onDealClick(ev.dealEv.deal);}:null,style:{fontSize:9,padding:"2px 4px",borderRadius:3,background:ev.color,color:"#fff",marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:ev.dealEv?"pointer":"default",fontWeight:600}},ev.title);})
              );
            })
          ];
        })
      )
    );
  }

  // ── Nagłówek okresu ──
  var MONTHS_PL=["\u0161ycze\u0144","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
  var MONTHS_PL2=["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  function periodLabel(){
    if(calView==="month") return MONTHS_PL2[refDate.getMonth()]+" "+refDate.getFullYear();
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
        ?ce("button",{onClick:function(){fetchEvents(gcalToken);},disabled:loadingEv,style:{...BTN,borderColor:"#4285f4",color:"#4285f4",marginRight:4}},loadingEv?"\u23F3 Odświeżam...":"\u21BA Odśwież")
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
          ce("button",{onClick:function(){setCalView("week");},style:calView==="week"?BTN_ACT:BTN},"Tydzie\u0144")
        )
      ),

      // Legenda
      ce("div",{style:{display:"flex",gap:12,padding:"6px 14px",borderBottom:"1px solid var(--bd2)",background:"var(--bg2)",flexWrap:"wrap"}},
        ce("span",{style:{fontSize:10,color:"#4285f4",fontWeight:600}},"● Google Calendar"),
        ce("span",{style:{fontSize:10,color:"#3b82f6",fontWeight:600}},"● Pomiar"),
        ce("span",{style:{fontSize:10,color:"#10b981",fontWeight:600}},"● Realizacja"),
        ce("span",{style:{fontSize:10,color:"#f59e0b",fontWeight:600}},"● Follow-up"),
        loadingEv?ce("span",{style:{fontSize:10,color:"var(--t3)",marginLeft:"auto"}},"\u23F3 Ładuję zdarzenia..."):null
      ),

      // Kalendarz
      ce("div",{style:{padding:calView==="month"?0:0}},
        !gcalToken?ce("div",{style:{padding:"32px",textAlign:"center",color:"var(--t3)",fontSize:13}},
          "Zaloguj si\u0119 przez Google, aby zobaczy\u0107 pe\u0142ny kalendarz ze zdarzeniami.\nTerminy z deal\u00f3w widoczne powy\u017cej."
        ):
        calView==="month"?renderMonthView():renderWeekView()
      )
    )
  );
}

// ── SCREEN CRM ───────────────────────────────────────────────────────────────

// ── Kanban components (must be top-level for React hooks rules) ──────────────

function DealCard(cp){
  var deal=cp.deal;var stage=cp.stage;var isDragging=cp.isDragging;
  var clients=cp.clients;var openDeal=cp.openDeal;var fmtDate=cp.fmtDate;var clientTotal2=cp.clientTotal2;
  var ref=useSortable({id:String(deal.id)});
  var setNodeRef=ref.setNodeRef;var attributes=ref.attributes;
  var listeners=ref.listeners;var transform=ref.transform;var transition=ref.transition;
  var style={
    transform:CSS.Transform.toString(transform),
    transition:transition,
    opacity:isDragging?0:1,
  };
  var cl=clients.find(function(c){return String(c.id)===String(deal.client_id);})||null;
  var name=cl?cl.name:"(nieznany)";
  var total=cl?clientTotal2(cl):0;
  var hasVisit=deal.visit_date;var hasDelivery=deal.delivery_date;
  return ce("div",{
    ref:setNodeRef,style:Object.assign({},style,{
      background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:11,
      padding:"10px 11px",marginBottom:8,cursor:"grab",
      boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
      borderLeft:"3px solid "+stage.color,touchAction:"none",userSelect:"none"
    }),
    onClick:function(e){if(!ref.isDragging){openDeal(deal);}},
    ...attributes,...listeners
  },
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
}

function KanbanCol(kp){
  var stage=kp.stage;var deals=kp.deals;var activeDeal=kp.activeDeal;
  var clients=kp.clients;var openDeal=kp.openDeal;var fmtDate=kp.fmtDate;var clientTotal2=kp.clientTotal2;
  var stageDeals=(deals||[]).filter(function(d){return d.stage===stage.id;});
  var dealIds=stageDeals.map(function(d){return String(d.id);});
  var refDrop=useDroppable({id:stage.id});
  var isOver=refDrop.isOver;
  return ce("div",{
    ref:refDrop.setNodeRef,
    style:{
      minWidth:190,width:190,flexShrink:0,
      background:isOver?"rgba(99,102,241,0.05)":"var(--bg2)",
      border:isOver?"1.5px solid "+stage.color:"1px solid var(--bd2)",
      borderRadius:14,padding:"10px 8px",
      transition:"border .12s, background .12s"
    }
  },
    ce("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:10,paddingBottom:8,borderBottom:"1px solid var(--bd3)"}},
      ce("div",{style:{width:9,height:9,borderRadius:"50%",background:stage.color,flexShrink:0}}),
      ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t1)",letterSpacing:"0.06em",textTransform:"uppercase",flex:1}},stage.label),
      ce("div",{style:{fontSize:11,color:"var(--t3)",fontWeight:500}},stageDeals.length||"")
    ),
    ce(SortableContext,{items:dealIds,strategy:verticalListSortingStrategy},
      stageDeals.map(function(deal){
        return ce(DealCard,{key:deal.id,deal:deal,stage:stage,isDragging:activeDeal&&activeDeal.id===deal.id,
          clients:clients,openDeal:openDeal,fmtDate:fmtDate,clientTotal2:clientTotal2});
      }),
      stageDeals.length===0?ce("div",{style:{fontSize:11,color:"var(--t3)",textAlign:"center",padding:"18px 0",opacity:0.5}},"Brak"):null
    )
  );
}

function DealGhost(gp){
  var deal=gp.deal;var clients=gp.clients;var clientTotal2=gp.clientTotal2;
  var cl=clients.find(function(c){return String(c.id)===String(deal.client_id);})||null;
  var name=cl?cl.name:"(nieznany)";
  var allStages=CRM_STAGES.concat([STAGE_ODRZUCONE]);
  var stage=allStages.find(function(s){return s.id===deal.stage;})||CRM_STAGES[0];
  var total=cl?clientTotal2(cl):0;
  return ce("div",{style:{
    background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:11,
    padding:"10px 11px",width:190,
    boxShadow:"0 12px 40px rgba(0,0,0,0.22)",
    borderLeft:"3px solid "+stage.color,
    transform:"rotate(2deg) scale(1.04)",opacity:0.96,cursor:"grabbing"
  }},
    ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)",lineHeight:1.3}},name),
    total>0?ce("div",{style:{fontSize:12,fontWeight:700,color:stage.color,marginTop:4}},Math.round(total/10)*10+" z\u0142"):null
  );
}

function KanbanBoard(kp){
  var deals=kp.deals;var clients=kp.clients;var activeDeal=kp.activeDeal;
  var setActiveDeal=kp.setActiveDeal;var moveStage=kp.moveStage;
  var openDeal=kp.openDeal;var fmtDate=kp.fmtDate;var clientTotal2=kp.clientTotal2;

  var sensors=useSensors(
    useSensor(PointerSensor,{activationConstraint:{distance:8}}),
    useSensor(TouchSensor,{activationConstraint:{delay:0,tolerance:8}})
  );

  function handleDragStart(event){
    var deal=(deals||[]).find(function(d){return String(d.id)===String(event.active.id);});
    setActiveDeal(deal||null);
  }

  function handleDragEnd(event){
    var overId=event.over&&event.over.id;
    setActiveDeal(null);
    if(!overId||!event.active.id)return;
    var dealId=Number(event.active.id);
    var allStages=CRM_STAGES.concat([STAGE_ODRZUCONE]);
    var targetStage=allStages.find(function(s){return String(s.id)===String(overId);});
    if(!targetStage){
      var targetDeal=(deals||[]).find(function(d){return String(d.id)===String(overId);});
      if(targetDeal){targetStage=allStages.find(function(s){return s.id===targetDeal.stage;});}
    }
    var currentDeal=(deals||[]).find(function(d){return d.id===dealId;});
    if(!targetStage||!currentDeal)return;
    if(targetStage.id===currentDeal.stage)return;
    moveStage(dealId,targetStage.id);
  }

  var colProps={deals:deals,clients:clients,activeDeal:activeDeal,openDeal:openDeal,fmtDate:fmtDate,clientTotal2:clientTotal2};
  return ce(DndContext,{
    sensors:sensors,
    collisionDetection:closestCenter,
    onDragStart:handleDragStart,
    onDragEnd:handleDragEnd
  },
    ce(Fragment,null,
      ce("div",{style:{display:"flex",gap:10,overflowX:"auto",paddingBottom:12,marginLeft:-4,paddingLeft:4}},
        CRM_STAGES.map(function(stage){return ce(KanbanCol,Object.assign({key:stage.id,stage:stage},colProps));})
      ),
      ce("div",{style:{margin:"14px 0 8px",height:1,background:"var(--bd2)"}}),
      ce("div",{style:{display:"flex",gap:10,paddingBottom:4,marginLeft:-4,paddingLeft:4}},
        ce(KanbanCol,Object.assign({stage:STAGE_ODRZUCONE},colProps))
      ),
      ce(DragOverlay,null,
        activeDeal?ce(DealGhost,{deal:activeDeal,clients:clients,clientTotal2:clientTotal2}):null
      )
    )
  );
}

export function ScreenCRM(p){
  // p: clients, setScreen, setAppMode, setCurClientId
  var sCrmTab=useState("kanban"),crmTab=sCrmTab[0],setCrmTab=sCrmTab[1];
  // GCal token przeżywa przełączanie zakładek
  var sGcalTok=useState(function(){
    try{var t=localStorage.getItem("pd_gcal_token");var e=localStorage.getItem("pd_gcal_token_exp");if(t&&e&&Date.now()<Number(e))return t;}catch(x){}return null;
  }),gcalToken=sGcalTok[0],setGcalToken=sGcalTok[1];
  var sGsiRdy=useState(false),gsiReady=sGsiRdy[0],setGsiReady=sGsiRdy[1];
  React.useEffect(function(){
    if(window.google&&window.google.accounts){setGsiReady(true);return;}
    var sc=document.createElement("script");sc.src="https://accounts.google.com/gsi/client";sc.async=true;
    sc.onload=function(){setGsiReady(true);};document.head.appendChild(sc);
  },[]);
  var sDeals=useState(null),deals=sDeals[0],setDeals=sDeals[1];
  var sActiveDeal=useState(null),activeDeal=sActiveDeal[0],setActiveDeal=sActiveDeal[1];
  var sModal=useState(null),modalDeal=sModal[0],setModalDeal=sModal[1];
  var sLoading=useState(true),loadingDeals=sLoading[0],setLoadingDeals=sLoading[1];
  var sNewClient=useState(""),newClientId=sNewClient[0],setNewClientId=sNewClient[1];
  var sAdding=useState(false),adding=sAdding[0],setAdding=sAdding[1];

  React.useEffect(function(){
    sbApi.getDeals().then(function(data){
      setDeals(data||[]);
      setLoadingDeals(false);
    }).catch(function(){setDeals([]);setLoadingDeals(false);});
  },[]);

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
    // Znajdź deal i jego klienta
    var deal=(deals||[]).find(function(d){return d.id===dealId;});
    var stageObj=CRM_STAGES.find(function(s){return s.id===stage;});
    setDeals(function(prev){return prev.map(function(d){return d.id===dealId?Object.assign({},d,{stage:stage}):d;});});
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
    // Sub-zakładki CRM: Kanban / Kalendarz
    ce("div",{style:{display:"flex",gap:4,marginBottom:"1rem",background:"var(--bg2)",borderRadius:10,padding:3,border:"1px solid var(--bd2)",alignSelf:"flex-start"}},
      [{id:"kanban",label:"\uD83D\uDCCC Kanban"},{id:"kalendarz",label:"\uD83D\uDCC5 Kalendarz Google"}].map(function(t){
        var act=crmTab===t.id;
        return ce("button",{key:t.id,onClick:function(){setCrmTab(t.id);},style:{
          padding:"7px 14px",borderRadius:8,border:"none",fontSize:12,fontWeight:act?700:400,
          background:act?"var(--bg)":"transparent",color:act?"var(--t1)":"var(--t3)",
          cursor:"pointer",boxShadow:act?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all .15s"
        }},t.label);
      })
    ),
    // Widok zależny od sub-zakładki
    crmTab==="kalendarz"?ce(CRMKalendarz,{deals:deals||[],clients:p.clients,onDealClick:function(d){setModalDeal(d);},gcalToken:gcalToken,setGcalToken:setGcalToken,gsiReady:gsiReady}):null,
    crmTab==="kanban"?ce("div",null,
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
    // Kanban — KanbanBoard component (hooks at top level)
    ce(KanbanBoard,{
      deals:deals,clients:p.clients,activeDeal:activeDeal,
      setActiveDeal:setActiveDeal,moveStage:moveStage,
      openDeal:openDeal,fmtDate:fmtDate,clientTotal2:clientTotal2
    }),
    ):null,
    // Modal
    modalDeal?ce(ModalDeal,{
      deal:modalDeal,
      client:p.clients.find(function(c){return String(c.id)===String(modalDeal.client_id);})||null,
      onSave:function(data){onDealSave(modalDeal.id,data);},
      onDelete:function(){onDealDelete(modalDeal.id);},
      onClose:function(){setModalDeal(null);},
      onGoToClient:function(){goToClient(modalDeal.client_id);}
    }):null
  );
}

// ── APP ────────────────────────────────────────────────────────────────────
