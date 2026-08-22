import React, { useState, useRef, useEffect } from 'react';
import { roundTo10, buildOfferPDFHtml } from '../constants/data.js';
import { buildSimplifiedPDFHtml } from '../lib/pdf.js';
import { msalLogin, msalGetToken, msalLogout, msalGetActiveAccount } from '../msal.js';
import { consumeBrokerCallback, brokerTokenRetry } from '../lib/oauthBroker.js';
import { sbApi } from '../lib/supabase.js';
const ce = React.createElement;

export const MOCK_SENT = [];

export const MOCK_CONTACTS = [];

export const MAIL_TEMPLATES = [
  {
    id:"oferta",label:"Oferta",icon:"\uD83D\uDCCB",
    subject:"Oferta \u2013 {clientName}",
    body:"Dzie\u0144 dobry,\n\nPrzesy\u0142am wycen\u0119 {honorific} zam\u00f3wienia.\n\nWarto\u015b\u0107: {total} z\u0142\nZaliczka 50%: {zaliczka} z\u0142",
    suggestAttachments:["pdf_oferta","pdf_uproszczona"]
  },
  {
    id:"potwierdzenie",label:"Potwierdzenie",icon:"\u2705",
    subject:"Potwierdzenie zam\u00f3wienia",
    body:"Dzie\u0144 dobry,\n\nPotwierdzam zam\u00f3wienie.",
    suggestAttachments:["pdf_zlecenie"]
  },
  {
    id:"przypomnienie",label:"Przypomnienie",icon:"\uD83D\uDD14",
    subject:"Przypomnienie \u2013 wycena",
    body:"Dzie\u0144 dobry,\n\nPrzypominam o wycenie. Oferta wa\u017cna 30 dni.",
    suggestAttachments:[]
  },
  {id:"wlasny",label:"W\u0142asny",icon:"\u270F\uFE0F",subject:"",body:"",suggestAttachments:[]}
];

// ── Flagi (kolorowe oznaczenia maili) ──────────────────────────────
// Technicznie to kategorie Outlooka (message.categories) — dzięki temu oznaczenie
// jest widoczne także w samym Outlooku i synchronizuje się między urządzeniami.
// Per-tenant: każdy tenant może mieć własny zestaw — nadpisanie w localStorage
// pod kluczem "pd_mail_flags" (JSON: [{id,label,color,category,preset}]).
// preset = kolor kategorii w Outlooku (preset8 = fioletowy, preset0 = czerwony…)
export const DEFAULT_MAIL_FLAGS = [
  {id:"damian",label:"Damian",color:"#8b5cf6",category:"Damian",preset:"preset8"}
];
// Kolory dopuszczalne dla flag \u2014 celowo ograniczone do presetow Outlooka,
// zeby oznaczenie mialo ten sam kolor w aplikacji i w skrzynce Outlooka.
export const FLAG_PALETTE = [
  {preset:"preset8", color:"#8b5cf6", name:"Fioletowy"},
  {preset:"preset0", color:"#e11d48", name:"Czerwony"},
  {preset:"preset1", color:"#f97316", name:"Pomara\u0144czowy"},
  {preset:"preset3", color:"#eab308", name:"\u017b\u00f3\u0142ty"},
  {preset:"preset4", color:"#22c55e", name:"Zielony"},
  {preset:"preset5", color:"#14b8a6", name:"Turkusowy"},
  {preset:"preset7", color:"#3b82f6", name:"Niebieski"},
  {preset:"preset10",color:"#64748b", name:"Stalowy"}
];
// Slug z etykiety \u2014 stabilne id flagi (bez polskich znak\u00f3w i spacji)
export function flagSlug(label){
  var s=String(label||"").toLowerCase()
    .replace(/\u0105/g,"a").replace(/\u0107/g,"c").replace(/\u0119/g,"e").replace(/\u0142/g,"l")
    .replace(/\u0144/g,"n").replace(/\u00f3/g,"o").replace(/\u015b/g,"s").replace(/\u017a/g,"z").replace(/\u017c/g,"z")
    .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  return s||("flag_"+Date.now());
}
export function getMailFlags(){
  try{
    var raw=localStorage.getItem("pd_mail_flags");
    if(raw){var arr=JSON.parse(raw);if(Array.isArray(arr)&&arr.length)return arr;}
  }catch(e){}
  return DEFAULT_MAIL_FLAGS;
}

var APP_PDF_OPTIONS = [
  {id:"pdf_oferta",label:"Wycena pe\u0142na",icon:"\uD83D\uDCC4"},
  {id:"pdf_uproszczona",label:"Wycena uproszczona",icon:"\uD83D\uDCC3"},
  {id:"pdf_zlecenie",label:"Zlecenie szycia",icon:"\u2702\uFE0F"},
  {id:"pdf_tkanina",label:"Zam\u00f3wienie tkaniny",icon:"\uD83E\uDDF5"}
];

var SYSTEM_FOLDERS = [
  {id:"inbox",label:"Skrzynka",icon:"\uD83D\uDCE5"},
  {id:"compose",label:"Nowa wiadomo\u015b\u0107",icon:"\u270F\uFE0F"},
  {id:"sent",label:"Wys\u0142ane",icon:"\uD83D\uDCE4"},
  {id:"drafts",label:"Robocze",icon:"\uD83D\uDCDD"},
  {id:"trash",label:"Kosz",icon:"\uD83D\uDDD1\uFE0F"},
  {id:"spam",label:"Spam",icon:"\uD83D\uDEAB"},
  {id:"templates",label:"Szablony",icon:"\uD83D\uDCCB"},
  {id:"settings",label:"Ustawienia",icon:"\u2699\uFE0F"}
];

export function fillTemplate(tpl,client){
  var cl=client||{};
  var h=cl.gender==="male"?"Pana":"Pani";
  var h2=cl.gender==="male"?"Pan":"Pani";
  var total=0;
  if(cl.rooms){total=roundTo10((cl.rooms||[]).reduce(function(a,r){return a+(r.windows||[]).reduce(function(b,w){return b+(w.products||[]).reduce(function(c,p){return c+(p.mp!=null?p.mp:0);},0);},0);},0));}
  var z=roundTo10(total*0.5);
  return {
    subject:tpl.subject.replace("{clientName}",cl.name||"").replace("{honorific}",h),
    body:tpl.body.replace(/{honorific2}/g,h2).replace(/{honorific}/g,h).replace(/{clientName}/g,cl.name||"").replace(/{total}/g,total>0?String(total):"___").replace(/{zaliczka}/g,z>0?String(z):"___")
  };
}

// ── Konwersja plain text ↔ HTML dla RichTextEditora ─────────────────────────
// Szablony i drafty są zapisywane jako plain text (z \n), ale RichTextEditor
// pracuje na HTML. Te helpery konwertują w obie strony.
export function plainToHtml(s){
  if(!s)return "";
  // Escape + zachowanie pustych linii ("\n\n" → akapity)
  var escaped=String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
  // Każda linia w osobnym divie — Outlook/Gmail tak renderuje akapity
  return escaped.split("\n").map(function(line){
    return "<div>"+(line||"<br>")+"</div>";
  }).join("");
}

export function htmlToPlain(html){
  if(!html)return "";
  var tmp=document.createElement("div");
  tmp.innerHTML=html;
  return (tmp.innerText||tmp.textContent||"").replace(/\n{3,}/g,"\n\n").trim();
}

export function fmtMailDate(iso){
  if(!iso)return "";
  var d=new Date(iso),t=new Date();
  if(d.toDateString()===t.toDateString())return d.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit"});
}

// Formatuje listę odbiorców Graph (np. ccRecipients) do czytelnego stringa "Imię <adres>, ..."
function fmtRecipients(list){
  return (list||[]).map(function(r){
    var e=(r&&r.emailAddress)||{};
    if(!e.address)return "";
    return e.name&&e.name!==e.address?e.name+" <"+e.address+">":e.address;
  }).filter(Boolean).join(", ");
}

// To samo co fmtRecipients, ale jako lista {email,name} — potrzebne dla "Odpowiedz wszystkim"
function recipObjs(list){
  return (list||[]).map(function(r){
    var e=(r&&r.emailAddress)||{};
    return e.address?{email:e.address,name:e.name||e.address}:null;
  }).filter(Boolean);
}

function fmtBytes(n){
  if(!n)return "";
  if(n<1024)return n+"B";
  if(n<1048576)return Math.round(n/1024)+"KB";
  return (n/1048576).toFixed(1)+"MB";
}

function nextHourStr(){
  var d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);
  var p=function(x){return String(x).padStart(2,"0");};
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":00";
}

function initials(name){
  if(!name)return "?";
  var pts=name.trim().split(" ");
  if(pts.length>=2)return (pts[0][0]+pts[pts.length-1][0]).toUpperCase();
  return name[0].toUpperCase();
}

var INP={width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:13,
  border:"1px solid var(--bd2)",borderRadius:9,background:"var(--bg)",
  color:"var(--t1)",outline:"none",fontFamily:"inherit",lineHeight:1.4};
var LSML={fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--t3)"};
var BPRIM={padding:"10px 18px",borderRadius:9,border:"none",background:"var(--t1)",
  color:"var(--bg)",fontSize:13,fontWeight:700,cursor:"pointer",
  display:"flex",alignItems:"center",justifyContent:"center",gap:6};
var BGHOST={padding:"8px 14px",borderRadius:9,border:"1px solid var(--bd2)",
  background:"var(--bg2)",color:"var(--t2)",fontSize:12,fontWeight:600,cursor:"pointer",
  display:"flex",alignItems:"center",gap:5};

function Avatar(props){
  var size=props.size||34;
  var bg=props.bg||"#c8a96a";
  var label=props.label||"?";
  return ce("div",{style:{width:size,height:size,borderRadius:"50%",background:bg,
    display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:size*0.38,fontWeight:700,color:"#fff",flexShrink:0,userSelect:"none"}},label);
}

function ModalCalendar(p){
  var us=React.useState;
  var sd=us(nextHourStr()),dt=sd[0],setDt=sd[1];
  var sur=us(60),dur=sur[0],setDur=sur[1];
  var stit=us("Follow-up: "+(p.mail?p.mail.toName||p.mail.to:"")),title=stit[0],setTitle=stit[1];
  var snote=us(p.mail?"Temat: "+(p.mail.subject||""):""),note=snote[0],setNote=snote[1];
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,
    display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
    ce("div",{style:{background:"var(--bg2)",borderRadius:16,padding:28,width:"100%",maxWidth:420,
      boxShadow:"0 20px 60px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",gap:16}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:12}},
        ce("div",{style:{width:44,height:44,borderRadius:12,background:"#0078d4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}},"\uD83D\uDCC5"),
        ce("div",{style:{flex:1}},
          ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},"Dodaj do kalendarza Outlook"),
          ce("div",{style:{fontSize:12,color:"var(--t3)",marginTop:2}},"Zaplanuj follow-up")
        ),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"var(--bg2)",width:28,height:28,borderRadius:8,cursor:"pointer",color:"var(--t3)",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}},"\u00d7")
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Tytu\u0142"),
        ce("input",{type:"text",value:title,onChange:function(e){setTitle(e.target.value);},style:INP})
      ),
      ce("div",{style:{display:"flex",gap:10}},
        ce("div",{style:{flex:2}},
          ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Data i godzina"),
          ce("input",{type:"datetime-local",value:dt,onChange:function(e){setDt(e.target.value);},style:INP})
        ),
        ce("div",{style:{flex:1}},
          ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Czas"),
          ce("select",{value:dur,onChange:function(e){setDur(Number(e.target.value));},style:Object.assign({},INP,{appearance:"none"})},
            ce("option",{value:15},"15 min"),
            ce("option",{value:30},"30 min"),
            ce("option",{value:60},"1 godz"),
            ce("option",{value:90},"1,5 godz"),
            ce("option",{value:120},"2 godz")
          )
        )
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Notatka"),
        ce("textarea",{value:note,onChange:function(e){setNote(e.target.value);},rows:3,style:Object.assign({},INP,{resize:"vertical",lineHeight:1.6})})
      ),
      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:p.onClose,style:BGHOST},"Anuluj"),
        ce("button",{
            onClick:function(){
              var startDt=new Date(dt).toISOString();
              var endDt=new Date(new Date(dt).getTime()+dur*60000).toISOString();
              if(p.accessToken){
                fetch("https://graph.microsoft.com/v1.0/me/events",{
                  method:"POST",
                  headers:{"Authorization":"Bearer "+p.accessToken,"Content-Type":"application/json"},
                  body:JSON.stringify({subject:title,body:{contentType:"Text",content:note},start:{dateTime:startDt,timeZone:"Europe/Warsaw"},end:{dateTime:endDt,timeZone:"Europe/Warsaw"}})
                }).then(function(r){return r.json();}).then(function(evt){p.onSave({summary:evt.subject||title,description:note,start:{dateTime:startDt},end:{dateTime:endDt}});}).catch(function(){p.onSave({summary:title,description:note,start:{dateTime:startDt},end:{dateTime:endDt}});});
              } else {
                p.onSave({summary:title,description:note,start:{dateTime:startDt},end:{dateTime:endDt}});
              }
            },
            style:Object.assign({},BPRIM,{flex:1,background:"#0078d4"})
          },"\uD83D\uDCC5 Zapisz w kalendarzu"
        )
      ),
    )
  );
}

function ModalNewFolder(p){
  var us=React.useState;
  var sn=us(""),name=sn[0],setName=sn[1];
  var ICONS=["\uD83D\uDCC1","\u2B50","\uD83D\uDCBC","\uD83D\uDD14","\uD83C\uDFE0","\uD83D\uDCA1","\uD83D\uDD12","\uD83C\uDF3F","\uD83D\uDCDD","\uD83D\uDD16"];
  var si=us(ICONS[0]),icon=si[0],setIcon=si[1];
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,
    display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
    ce("div",{style:{background:"var(--bg2)",borderRadius:16,padding:28,width:"100%",maxWidth:360,
      boxShadow:"0 20px 60px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",gap:16}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
        ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},"Nowy folder"),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"var(--bg2)",width:28,height:28,borderRadius:8,cursor:"pointer",color:"var(--t3)",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}},"\u00d7")
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Nazwa"),
        ce("input",{type:"text",value:name,onChange:function(e){setName(e.target.value);},placeholder:"np. Realizacje 2025",style:INP,autoFocus:true})
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:8})},"Ikona"),
        ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
          ICONS.map(function(ic){
            var active=icon===ic;
            return ce("button",{key:ic,onClick:function(){setIcon(ic);},
              style:{width:38,height:38,borderRadius:9,fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                border:"2px solid "+(active?"var(--gr)":"var(--bd2)"),
                background:active?"var(--grl)":"var(--bg2)"}},ic);
          })
        )
      ),
      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:p.onClose,style:BGHOST},"Anuluj"),
        ce("button",{
            onClick:function(){if(name.trim())p.onSave({id:"f_"+Date.now(),label:name.trim(),icon:icon,system:false});},
            disabled:!name.trim(),
            style:Object.assign({},BPRIM,{flex:1,opacity:name.trim()?1:0.5})
          },"Utw\u00f3rz folder"
        )
      )
    )
  );
}

function AttachmentsSection(p){
  var fileRef=React.useRef();
  var us=React.useState;
  var sp=us(false),showPicker=sp[0],setShowPicker=sp[1];
  var allTpls=p.templates&&p.templates.length?p.templates:MAIL_TEMPLATES;
  var tpl=allTpls.find(function(t){return t.id===p.selTemplate;})||allTpls[0];
  var suggested=tpl?tpl.suggestAttachments||[]:[];

  function addFiles(e){
    var files=Array.from(e.target.files||[]);
    p.setAttachments(function(prev){
      return prev.concat(files.map(function(f){
        return {id:"att_"+Date.now()+"_"+f.name,name:f.name,size:f.size,type:"upload",file:f};
      }));
    });
    e.target.value="";
  }

  function addPdf(opt){
    if(p.attachments.find(function(a){return a.id===opt.id;}))return;
    p.setAttachments(function(prev){
      return prev.concat([{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}]);
    });
  }

  function remove(id){
    p.setAttachments(function(prev){return prev.filter(function(a){return a.id!==id;});});
  }

  var pickerBtnStyle={
    padding:"8px 14px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",
    display:"flex",alignItems:"center",gap:5,
    border:"1px solid "+(showPicker?"var(--gr)":"var(--bd2)"),
    background:showPicker?"var(--grl)":"var(--bg2)",
    color:showPicker?"var(--grd)":"var(--t2)"
  };

  return ce("div",{style:{marginBottom:12}},
    p.attachments.length>0?ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}},
      p.attachments.map(function(att){
        return ce("div",{key:att.id,style:{display:"flex",alignItems:"center",gap:6,
          padding:"5px 10px 5px 8px",borderRadius:20,
          background:"var(--bg3)",border:"1px solid var(--bd2)",fontSize:12}},
          ce("span",{style:{fontSize:13}},att.type==="app"?"\uD83D\uDCC4":att.type==="template"?"\uD83D\uDCCE":"\uD83D\uDCCE"),
          ce("span",{style:{color:"var(--t1)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},att.name),
          att.size
            ?ce("span",{style:{color:"var(--t3)",fontSize:10}},fmtBytes(att.size))
            :att.type==="template"
              ?ce("span",{style:{fontSize:10,color:"#7c3aed",fontWeight:600}},"z szablonu")
              :ce("span",{style:{fontSize:10,color:"var(--gr)",fontWeight:600}},"z app"),
          ce("button",{onClick:function(){remove(att.id);},
            style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",
              fontSize:14,lineHeight:1,padding:"0 2px",marginLeft:2}},"\u00d7")
        );
      })
    ):null,

    ce("div",{style:{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}},
      ce("button",{
          onClick:function(){if(fileRef.current)fileRef.current.click();},
          style:BGHOST
        },
        ce("span",{style:{fontSize:14}},"\uD83D\uDCCE"),"\u00a0Dodaj plik"
      ),
      ce("input",{ref:fileRef,type:"file",multiple:true,style:{display:"none"},onChange:addFiles}),

      p.selClient
        ?ce("div",{style:{position:"relative"}},
          ce("button",{
              onClick:function(){setShowPicker(function(v){return !v;});},
              style:pickerBtnStyle
            },
            ce("span",{style:{fontSize:14}},"\uD83D\uDCC4"),
            "\u00a0PDF z wyceny",
            ce("span",{style:{fontSize:10,marginLeft:4}},"\u25be")
          ),
          showPicker?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,
            background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:12,
            boxShadow:"0 8px 30px rgba(0,0,0,0.18)",zIndex:400,minWidth:240,overflow:"hidden"}},
            ce("div",{style:{padding:"8px 0"}},
              APP_PDF_OPTIONS.map(function(opt){
                var already=!!p.attachments.find(function(a){return a.id===opt.id;});
                return ce("div",{key:opt.id,
                    onClick:function(){if(!already){addPdf(opt);setShowPicker(false);}},
                    style:{padding:"9px 14px",fontSize:13,
                      cursor:already?"default":"pointer",
                      display:"flex",alignItems:"center",gap:10,
                      background:already?"var(--bg3)":"transparent",
                      opacity:already?0.6:1}
                  },
                  ce("span",{style:{fontSize:15}},opt.icon),
                  ce("span",{style:{color:"var(--t1)",flex:1}},opt.label),
                  already?ce("span",{style:{fontSize:10,color:"var(--gr)",fontWeight:700}},"\u2713"):null
                );
              })
            ),
            suggested.length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",padding:"8px 14px"}},
              ce("div",{style:Object.assign({},LSML,{marginBottom:6})},"Sugerowane"),
              ce("div",{style:{display:"flex",gap:5,flexWrap:"wrap"}},
                suggested.map(function(sid){
                  var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
                  if(!opt)return null;
                  var already=!!p.attachments.find(function(a){return a.id===sid;});
                  return ce("button",{key:sid,
                      onClick:function(){if(!already){addPdf(opt);setShowPicker(false);}},
                      style:{padding:"4px 10px",fontSize:11,borderRadius:20,
                        cursor:already?"default":"pointer",
                        border:"1px solid var(--gr)",
                        background:already?"var(--grl)":"transparent",
                        color:"var(--grd)",fontWeight:600,
                        display:"flex",alignItems:"center",gap:4}
                    },opt.icon," ",opt.label.split(" ")[0]
                  );
                })
              )
            ):null
          ):null
        )
        :ce("span",{style:{fontSize:11,color:"var(--t3)",padding:"6px 4px",fontStyle:"italic"}},
          "Wybierz klienta, by doda\u0107 PDF z wyceny")
    )
  );
}

function MailList(p){
  var us=React.useState;
  var sf=us(""),filter=sf[0],setFilter=sf[1];
  var sfu=us(false),onlyUnread=sfu[0],setOnlyUnread=sfu[1];
  var sff=us([]),selFlags=sff[0],setSelFlags=sff[1];        // id-ki flag w filtrze (multi)
  var sfm=us("any"),flagMode=sfm[0],setFlagMode=sfm[1];     // "any" = dowolna, "all" = wszystkie naraz
  var sfo=us(false),filterOpen=sfo[0],setFilterOpen=sfo[1]; // rozwiniety panel filtra
  var smk=us(null),menuKey=smk[0],setMenuKey=smk[1];        // klucz watku z otwartym menu "Oznacz jako"
  var ue=React.useEffect;
  // "Wazne" (importance=high w Graph) traktujemy jak flage — dzieki temu jedno
  // menu i jeden filtr obsluguja i ja, i kategorie tenanta (Damian itd.).
  var allFlags=[{id:"__important",label:"Wa\u017cne",color:"var(--red)",important:true}].concat(p.flags||[]);
  function threadHasFlag(t,fl){
    if(fl.important)return t.mails.some(function(m){return m.isImportant;});
    return t.mails.some(function(m){return (m.categories||[]).indexOf(fl.category)>=0;});
  }
  function toggleThreadFlag(t,fl){
    if(fl.important){ if(p.onToggleImportant)p.onToggleImportant(t.head); }
    else { if(p.onToggleFlag)p.onToggleFlag(t.head,fl); }
  }
  var isInbox=p.folder==="inbox";
  var searching=filter.trim().length>0;
  var serverMatched=searching&&p.searchResults!=null;
  // Debounce: po 400 ms od ostatniego znaku → wyszukiwanie server-side (cała historia + treść)
  ue(function(){
    if(!p.onSearch)return;
    var q=filter.trim();
    var t=setTimeout(function(){ if(q.length===0||q.length>=2) p.onSearch(p.folder,q); },400);
    return function(){clearTimeout(t);};
  },[filter,p.folder]);
  // Źródło wątków: wyniki serwera gdy szukamy i już są, inaczej wczytany folder
  var sourceMails=(searching&&p.searchResults!=null)?p.searchResults:(p.mails||[]);

  // Pole do wyszukiwania zależne od folderu (Inbox: from, Sent: to)
  function searchableText(m){
    if(isInbox)return ((m.fromName||"")+" "+(m.from||"")+" "+(m.subject||"")+" "+(m.preview||"")).toLowerCase();
    return ((m.toName||"")+" "+(m.to||"")+" "+(m.subject||"")+" "+(m.preview||"")).toLowerCase();
  }
  function displayName(m){
    if(isInbox)return m.fromName||m.from||"(bez nadawcy)";
    return m.toName||m.to||"(bez adresata)";
  }

  // Grupowanie po conversationId — dla wszystkich folderów które mają tę informację
  // (Inbox + Sent z Outlooka). Drafts i custom foldery nie używają conversationId.
  var threads=[];
  if(sourceMails&&sourceMails.length){
    var byConv={};
    sourceMails.forEach(function(m){
      var key=m.conversationId||("solo_"+m.id);
      if(!byConv[key]){byConv[key]={key:key,mails:[]};}
      byConv[key].mails.push(m);
    });
    Object.keys(byConv).forEach(function(k){
      var t=byConv[k];
      // Najnowsza wiadomość z wątku reprezentuje wątek
      t.mails.sort(function(a,b){return new Date(b.date)-new Date(a.date);});
      t.head=t.mails[0];
      t.count=t.mails.length;
      threads.push(t);
    });
    threads.sort(function(a,b){return new Date(b.head.date)-new Date(a.head.date);});
  }

  var filtered=threads.filter(function(t){
    if(onlyUnread&&isInbox&&!t.mails.some(function(m){return m.isRead===false;}))return false;
    if(selFlags.length){
      // "all" = watek ma WSZYSTKIE zaznaczone flagi naraz, "any" = przynajmniej jedna
      var picked=allFlags.filter(function(f){return selFlags.indexOf(f.id)>=0;});
      var hits=picked.filter(function(f){return threadHasFlag(t,f);}).length;
      if(flagMode==="all"?hits<picked.length:hits===0)return false;
    }
    if(!searching)return true;         // przeglądanie — pokaż wszystko
    if(serverMatched)return true;      // serwer już dopasował (adres/temat/treść)
    var q=filter.toLowerCase();
    // Pasuje jeśli którakolwiek wiadomość w wątku pasuje
    return t.mails.some(function(m){return searchableText(m).indexOf(q)>=0;});
  });

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{paddingBottom:10,flexShrink:0}},
      ce("div",{style:{position:"relative",marginBottom:6}},
        ce("span",{style:{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"var(--t3)",pointerEvents:"none"}},"\uD83D\uDD0D"),
        ce("input",{type:"text",value:filter,onChange:function(e){setFilter(e.target.value);},
          placeholder:"Szukaj...",style:Object.assign({},INP,{paddingLeft:32,fontSize:12})})
      ),
      ce("div",{style:{display:"flex",gap:5,position:"relative"}},
        // Tylko nieprzeczytane — sens ma wyłącznie w Odebranych
        isInbox?ce("button",{onClick:function(){setOnlyUnread(function(v){return !v;});},
          title:onlyUnread?"Poka\u017c wszystkie":"Poka\u017c tylko nieprzeczytane",
          style:{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:8,border:"1px solid "+(onlyUnread?"var(--violet)":"var(--bd2)"),background:onlyUnread?"var(--violet-l)":"transparent",color:onlyUnread?"var(--violet)":"var(--t3)",fontSize:11,fontWeight:onlyUnread?700:500,cursor:"pointer",flex:1,justifyContent:"center"}},
          ce("span",{style:{width:7,height:7,borderRadius:"50%",background:"var(--violet)",flexShrink:0}}),
          onlyUnread?"Wszystkie":"Nieprzeczytane"
        ):null,
        // Filtr po flagach — multi-select, tryb "dowolna" / "wszystkie naraz"
        ce("button",{onClick:function(){setFilterOpen(function(v){return !v;});},
          title:"Filtruj po oznaczeniach",
          style:{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:8,border:"1px solid "+(selFlags.length?"var(--violet)":"var(--bd2)"),background:selFlags.length?"var(--violet-l)":"transparent",color:selFlags.length?"var(--violet)":"var(--t3)",fontSize:11,fontWeight:selFlags.length?700:500,cursor:"pointer",flex:1,justifyContent:"center"}},
          ce("span",{style:{fontSize:12}},"\u2691"),
          "Filtruj",
          selFlags.length?ce("span",{style:{background:"var(--violet)",color:"var(--bg)",borderRadius:9,fontSize:9,fontWeight:700,padding:"0 5px"}},selFlags.length):null,
          ce("span",{style:{fontSize:9,opacity:0.7}},"\u25be")
        ),
        filterOpen?ce("div",{style:{position:"absolute",top:"calc(100% + 5px)",right:0,zIndex:400,minWidth:210,
          background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.18)",overflow:"hidden"}},
          ce("div",{style:{padding:"8px 12px 6px",fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:"var(--t3)"}},"Poka\u017c oznaczone"),
          allFlags.map(function(fl){
            var on=selFlags.indexOf(fl.id)>=0;
            return ce("div",{key:fl.id,onClick:function(){
                setSelFlags(function(prev){return on?prev.filter(function(x){return x!==fl.id;}):prev.concat([fl.id]);});
              },
              style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",fontSize:12,cursor:"pointer",
                background:on?"var(--bd3)":"transparent",borderTop:"1px solid var(--bd3)"}},
              ce("span",{style:{width:14,height:14,borderRadius:4,flexShrink:0,fontSize:10,lineHeight:"14px",textAlign:"center",
                border:"1px solid "+(on?fl.color:"var(--bd2)"),background:on?fl.color:"transparent",color:"#fff"}},on?"\u2713":""),
              ce("span",{style:{fontSize:13,color:fl.color}},"\u2691"),
              ce("span",{style:{color:"var(--t1)",fontWeight:on?700:500}},fl.label)
            );
          }),
          // Tryb łączenia — widoczny dopiero gdy zaznaczono co najmniej dwie flagi
          selFlags.length>1?ce("div",{style:{display:"flex",gap:4,padding:"8px 10px",borderTop:"1px solid var(--bd3)"}},
            [{id:"any",label:"Dowolna"},{id:"all",label:"Wszystkie naraz"}].map(function(mo){
              var on=flagMode===mo.id;
              return ce("button",{key:mo.id,onClick:function(){setFlagMode(mo.id);},
                style:{flex:1,padding:"4px 6px",borderRadius:7,fontSize:10,cursor:"pointer",
                  border:"1px solid "+(on?"var(--violet)":"var(--bd2)"),
                  background:on?"var(--violet-l)":"transparent",
                  color:on?"var(--violet)":"var(--t3)",fontWeight:on?700:500}},mo.label);
            })
          ):null,
          ce("div",{style:{display:"flex",gap:6,padding:"8px 10px",borderTop:"1px solid var(--bd3)"}},
            ce("button",{onClick:function(){setSelFlags([]);setFlagMode("any");},
              style:{flex:1,padding:"5px 8px",borderRadius:7,fontSize:11,cursor:"pointer",border:"1px solid var(--bd2)",background:"transparent",color:"var(--t2)"}},"Wyczy\u015b\u0107"),
            ce("button",{onClick:function(){setFilterOpen(false);},
              style:{flex:1,padding:"5px 8px",borderRadius:7,fontSize:11,cursor:"pointer",border:"none",background:"var(--t1)",color:"var(--bg)",fontWeight:700}},"Gotowe")
          )
        ):null
      )
    ),
    ce("div",{style:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}},
      (filtered.length===0&&!searching)
        ?ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8,color:"var(--t3)"}},
          ce("div",{style:{fontSize:32,opacity:0.4}},"\uD83D\uDCEC"),
          ce("div",{style:{fontSize:13}},"Brak wiadomo\u015bci")
        )
        :filtered.map(function(t){
          var m=t.head;
          var selectedInThread=p.selectedId&&t.mails.some(function(x){return x.id===p.selectedId;});
          var colors=["#c8a96a","#8b7355","#a0956e","#7a6e52","#b8a882"];
          var nm=displayName(m);
          var ci=Math.abs((nm||"").charCodeAt(0)||0)%colors.length;
          var unread=isInbox&&t.mails.some(function(x){return x.isRead===false;});
          // Jedna ikona ⚑ na wątek: kolor pierwszej aktywnej flagi, licznik gdy jest ich więcej.
          // Najechanie (lub klik) otwiera menu "Oznacz jako" ze wszystkimi flagami.
          var onFlags=allFlags.filter(function(fl){return threadHasFlag(t,fl);});
          var menuOpen=menuKey===t.key;
          return ce("div",{key:t.key,onClick:function(){p.onSelect(t);},
            style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",
              background:selectedInThread?"var(--wb)":(unread?"var(--bd3)":"transparent"),
              border:"1px solid "+(selectedInThread?"var(--wbd)":(unread?"var(--bd2)":"transparent")),
              borderLeft:!selectedInThread&&unread?"3px solid var(--violet)":"1px solid "+(selectedInThread?"var(--wbd)":"transparent"),
              transition:"all .12s",display:"flex",gap:8,alignItems:"flex-start"}},
            ce("span",{style:{position:"relative",alignSelf:"center",flexShrink:0},
              onMouseEnter:function(){setMenuKey(t.key);},
              onMouseLeave:function(){setMenuKey(function(k){return k===t.key?null:k;});}},
              ce("button",{onClick:function(ev){ev.stopPropagation();setMenuKey(menuOpen?null:t.key);},
                title:onFlags.length?onFlags.map(function(f){return f.label;}).join(", "):"Oznacz jako\u2026",
                style:{border:"none",background:"transparent",cursor:"pointer",padding:"2px 4px",fontSize:16,lineHeight:1,
                  color:onFlags.length?onFlags[0].color:"var(--bd2)",opacity:onFlags.length?1:0.5,
                  display:"flex",alignItems:"center",gap:1,transition:"opacity .12s"}},
                "\u2691",
                onFlags.length>1?ce("span",{style:{fontSize:9,fontWeight:700,color:"var(--t3)"}},onFlags.length):null
              ),
              menuOpen?ce("div",{onClick:function(ev){ev.stopPropagation();},
                style:{position:"absolute",top:"100%",left:0,zIndex:350,minWidth:170,paddingTop:2}},
                ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,
                  boxShadow:"0 8px 24px rgba(0,0,0,0.18)",overflow:"hidden"}},
                  ce("div",{style:{padding:"7px 12px 5px",fontSize:9,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:"var(--t3)"}},"Oznacz jako"),
                  allFlags.map(function(fl){
                    var on=onFlags.indexOf(fl)>=0;
                    return ce("div",{key:fl.id,onClick:function(ev){ev.stopPropagation();toggleThreadFlag(t,fl);},
                      style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",fontSize:12,cursor:"pointer",
                        borderTop:"1px solid var(--bd3)",background:on?"var(--bd3)":"transparent"}},
                      ce("span",{style:{fontSize:14,color:fl.color,width:14,flexShrink:0}},"\u2691"),
                      ce("span",{style:{flex:1,color:"var(--t1)",fontWeight:on?700:500}},fl.label),
                      on?ce("span",{style:{fontSize:11,color:fl.color,fontWeight:700}},"\u2713"):null
                    );
                  })
                )
              ):null
            ),
            ce(Avatar,{size:34,bg:selectedInThread?colors[ci]:colors[ci]+"99",label:initials(nm)}),
            ce("div",{style:{flex:1,minWidth:0}},
              ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}},
                ce("span",{style:{display:"flex",alignItems:"center",gap:6,minWidth:0,maxWidth:"72%"}},
                  unread?ce("span",{style:{width:8,height:8,borderRadius:"50%",background:"var(--violet)",flexShrink:0,boxShadow:"0 0 0 2px var(--violet-l)"}}):null,
                  ce("span",{style:{fontSize:13,fontWeight:unread?800:(selectedInThread?700:500),color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
                    nm,
                    t.count>1?ce("span",{style:{fontSize:11,color:"var(--t3)",fontWeight:500,marginLeft:6}},"("+t.count+")"):null
                  )
                ),
                ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},fmtMailDate(m.date))
              ),
              ce("div",{style:{fontSize:12,color:selectedInThread?"var(--wt)":"var(--t1)",fontWeight:unread?700:500,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.subject),
              ce("div",{style:{fontSize:11,color:"var(--t2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview),
              (m.attachments&&m.attachments.length>0)?ce("div",{style:{fontSize:10,color:"var(--t3)",marginTop:4}},
                "\uD83D\uDCCE ",m.attachments.length," za\u0142."
              ):null
            )
          );
        }),
      (searching||p.hasMore||p.searchLoading||p.searchHasMore)
        ?ce("div",{style:{flexShrink:0,paddingTop:4}},
            searching
              ?(p.searchLoading
                  ?ce("div",{style:{padding:"12px",textAlign:"center",color:"var(--t3)",fontSize:12}},"\uD83D\uDD0D Szukam w całej historii…")
                  :(p.searchHasMore
                      ?ce("button",{onClick:function(){p.onLoadMoreSearch&&p.onLoadMoreSearch(p.folder);},style:{width:"100%",padding:"9px",border:"1px solid var(--bd2)",borderRadius:8,background:"transparent",color:"var(--t2)",fontSize:12,fontWeight:600,cursor:"pointer"}},"Pokaż więcej wyników")
                      :ce("div",{style:{padding:"10px",textAlign:"center",color:"var(--t3)",fontSize:11}},filtered.length?"To wszystkie wyniki":"Brak wyników")))
              :(p.hasMore
                  ?ce("button",{onClick:function(){p.onLoadMore&&p.onLoadMore(p.folder);},disabled:p.loadingMore,style:{width:"100%",padding:"9px",border:"1px solid var(--bd2)",borderRadius:8,background:"transparent",color:"var(--t2)",fontSize:12,fontWeight:600,cursor:p.loadingMore?"default":"pointer",opacity:p.loadingMore?0.6:1}},p.loadingMore?"⏳ Wczytywanie…":"↓ Załaduj starsze wiadomości")
                  :null)
          )
        :null
    )
  );
}

// Pomocnik: zamienia HTML body z Outlooka na bezpieczny tekst do wyświetlenia
// Outlook może zwracać body jako HTML lub Text. Dla widoku w aplikacji konwertujemy
// HTML do "czystego" textu (zachowujemy paragrafy/linie), bo nie chcemy XSS-a.
function htmlToText(html){
  if(!html)return "";
  var tmp=document.createElement("div");
  tmp.innerHTML=html;
  // Usuń bloki <style>/<script>/<head> — ich zawartość tekstowa (CSS/JS) nie powinna być widoczna
  tmp.querySelectorAll("style,script,head").forEach(function(el){el.remove();});
  // <br> i bloki → newline
  tmp.querySelectorAll("br").forEach(function(br){br.replaceWith("\n");});
  tmp.querySelectorAll("p,div").forEach(function(p){p.append("\n");});
  return (tmp.innerText||tmp.textContent||"").trim();
}

// Mapuje surową wiadomość Graph → wewnętrzny kształt (spójny z efektem pobierającym foldery)
function mapGraphMsg(m,folder){
  var fromAddr=(m.from&&m.from.emailAddress)||{};
  var rec=(m.toRecipients&&m.toRecipients[0]&&m.toRecipients[0].emailAddress)||{};
  var isSent=folder==="sent";
  return {
    id:m.id,folder:folder,
    from:isSent?"":(fromAddr.address||""),
    fromName:isSent?"":(fromAddr.name||fromAddr.address||""),
    to:isSent?(rec.address||""):"",
    toName:isSent?(rec.name||rec.address||""):"",
    cc:fmtRecipients(m.ccRecipients),
    toAll:recipObjs(m.toRecipients),
    ccAll:recipObjs(m.ccRecipients),
    subject:m.subject||"",
    date:m.sentDateTime||m.receivedDateTime||new Date().toISOString(),
    preview:m.bodyPreview||"",body:null,
    attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],
    hasAttachments:!!m.hasAttachments,
    conversationId:m.conversationId||null,
    isRead:isSent?true:(m.isRead!==false),
    isImportant:m.importance==="high",
    categories:m.categories||[]
  };
}

function MailPreview(p){
  var thread=p.thread; // {key, head, mails:[...]} albo null
  var us=React.useState, ue=React.useEffect;
  var sm=us(false),showMove=sm[0],setShowMove=sm[1];
  var sfm2=us(false),showFlags=sfm2[0],setShowFlags=sfm2[1];   // menu "Oznacz jako"
  // Cache body per messageId — żeby przy ponownym kliknięciu nie pobierać znowu
  var sb=us({}),bodies=sb[0],setBodies=sb[1];
  var sl=us({}),loadingBody=sl[0],setLoadingBody=sl[1];
  // Zwinięte/rozwinięte wiadomości w wątku — domyślnie tylko najnowsza rozwinięta
  var se=us({}),expanded=se[0],setExpanded=se[1];
  // Cache załączników per messageId — pobierane on-demand przy rozwinięciu
  var sfa=us({}),fetchedAtts=sfa[0],setFetchedAtts=sfa[1];
  var sla=us({}),loadingAtts=sla[0],setLoadingAtts=sla[1];
  // Resolved srcDoc per messageId — aktualizowany po załadowaniu obrazków cid:
  var ssd=us({}),resolvedSrcDocs=ssd[0],setResolvedSrcDocs=ssd[1];

  // Buduje pełny srcDoc z podmienionym cid:→data: i zapisuje w stanie
  // Wywoływany po każdym załadowaniu obrazka, żeby iframe się odświeżył
  function buildSrcDoc(mid,htmlContent){
    var IFRAME_STYLES="@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap');body{margin:0;padding:16px 20px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;line-height:1.75;word-break:break-word;}img{max-width:100%;height:auto;}blockquote{border-left:3px solid #ccc;padding-left:12px;color:#666;margin:8px 0;}a{color:#7c3aed;}p{margin:0 0 8px;}table{border-collapse:collapse;}td,th{padding:4px 8px;}";
    var cache=window._porterAttImgCache||{};
    // Usuń <script> i obsługę zdarzeń — sandbox i tak je blokuje, ale to ucisza ostrzeżenia w konsoli
    var clean=(htmlContent||"").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,"").replace(/\son\w+\s*=\s*"[^"]*"/gi,"").replace(/\son\w+\s*=\s*'[^']*'/gi,"");
    var resolved=clean.replace(/<img\b[^>]*\bsrc=["']cid:([^"'>]+)["'][^>]*>/gi,function(whole,cid){
      var cleanCid=cid.replace(/^<|>$/g,"").trim();
      var dataUri=cache[mid+"__cid__"+cleanCid];
      // Jeśli mamy obrazek w cache — osadź inline, inaczej usuń <img> (obrazki dostępne jako kafelki nad mailem)
      if(dataUri)return whole.replace(/src=["']cid:[^"'>]+["']/i,'src="'+dataUri+'"');
      return "";
    });
    var doc="<!DOCTYPE html><html><head><meta charset='UTF-8'><style>"+IFRAME_STYLES+"</style></head><body>"+resolved+"</body></html>";
    setResolvedSrcDocs(function(prev){var n=Object.assign({},prev);n[mid]=doc;return n;});
  }



  // Pobiera załączniki jednym GET BEZ $select — zwraca metadane + contentBytes (<3MB) + contentId.
  // $select=contentId daje 400, bo contentId nie jest polem bazowego attachment (tylko fileAttachment).
  function fetchAttachments(mid){
    if(!mid)return;
    // Placeholder \u015bwie\u017co wys\u0142anego maila (id "m_...") \u2014 Graph go jeszcze nie zna
    if(String(mid).indexOf("m_")===0)return;
    if(fetchedAtts[mid]&&fetchedAtts[mid].length>0)return;
    if(loadingAtts[mid])return;
    setLoadingAtts(function(prev){var n=Object.assign({},prev);n[mid]=true;return n;});
    msalGetToken().then(function(tok){
      if(tok&&p.onTokenRefresh)p.onTokenRefresh(tok);
      var useToken=tok||p.accessToken;
      return fetch("https://graph.microsoft.com/v1.0/me/messages/"+mid+"/attachments",{
        headers:{"Authorization":"Bearer "+useToken}
      });
    })
    .then(function(r){
      if(r.status===429){
        var wait=parseInt(r.headers.get("Retry-After")||"2",10)*1000;
        setFetchedAtts(function(prev){var n=Object.assign({},prev);n[mid]=[];return n;});
        setLoadingAtts(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
        // retry raz po throttle
        setTimeout(function(){
          setFetchedAtts(function(prev){var n=Object.assign({},prev);delete n[mid];return n;});
          fetchAttachments(mid);
        },wait);
        return null;
      }
      return r.ok?r.json():null;
    })
    .then(function(data){
      if(!data){
        setFetchedAtts(function(prev){var n=Object.assign({},prev);n[mid]=[];return n;});
        setLoadingAtts(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
        return;
      }
      var list=(data.value)||[];
      var metaList=list.map(function(a){return {id:a.id,name:a.name,size:a.size,contentType:a.contentType,contentId:a.contentId||null,isInline:!!a.isInline};});
      setFetchedAtts(function(prev){var n=Object.assign({},prev);n[mid]=metaList;return n;});
      setLoadingAtts(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
      // Cache miniatur obrazków — contentBytes już mamy z tego samego requestu (pliki <3MB)
      if(!window._porterAttImgCache)window._porterAttImgCache={};
      var gotImg=false;
      list.forEach(function(att){
        if(!att.contentType||att.contentType.indexOf("image/")!==0)return;
        if(!att.contentBytes)return; // plik >3MB — brak miniatury, ale klik pobierze osobno
        var dataUri="data:"+att.contentType+";base64,"+att.contentBytes;
        window._porterAttImgCache[mid+"__"+att.id]=dataUri;
        if(att.contentId){
          var cleanCid=att.contentId.replace(/^<|>$/g,"");
          window._porterAttImgCache[mid+"__cid__"+cleanCid]=dataUri;
        }
        gotImg=true;
      });
      if(gotImg){
        setFetchedAtts(function(prev){return Object.assign({},prev);});
        var bodyObj=bodies[mid];
        if(bodyObj&&bodyObj.isHtml&&bodyObj.content)buildSrcDoc(mid,bodyObj.content);
      }
    })
    .catch(function(){
      setFetchedAtts(function(prev){var n=Object.assign({},prev);n[mid]=[];return n;});
      setLoadingAtts(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
    });
  }

  // Otwiera plik załącznika w nowym oknie (obrazki/PDF wyświetlają się, reszta pobiera)
  function downloadAttachment(mid,attId,attName,contentType){
    // Otwórz okno OD RAZU (synchronicznie) — inaczej przeglądarka zablokuje popup po async fetch
    var win=window.open("","_blank");
    if(win){win.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>"+(attName||"Za\u0142\u0105cznik")+"</title></head><body style='margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial,sans-serif;color:#aaa;'>\u23F3 \u0141adowanie\u2026</body></html>");}
    msalGetToken().then(function(tok){
      if(tok&&p.onTokenRefresh)p.onTokenRefresh(tok);
      return fetch("https://graph.microsoft.com/v1.0/me/messages/"+mid+"/attachments/"+attId,{
        headers:{"Authorization":"Bearer "+(tok||p.accessToken)}
      });
    })
    .then(function(r){return r.ok?r.json():null;})
    .then(function(data){
      if(!data||!data.contentBytes){if(win)win.close();alert("Nie uda\u0142o si\u0119 pobra\u0107 za\u0142\u0105cznika.");return;}
      var ct=contentType||data.contentType||"application/octet-stream";
      var byteStr=atob(data.contentBytes);
      var ab=new ArrayBuffer(byteStr.length);
      var ia=new Uint8Array(ab);
      for(var i=0;i<byteStr.length;i++)ia[i]=byteStr.charCodeAt(i);
      var blob=new Blob([ab],{type:ct});
      var url=URL.createObjectURL(blob);
      var isViewable=ct.indexOf("image/")===0||ct.indexOf("pdf")>=0;
      if(win&&isViewable){
        // Obrazek/PDF — pokaż bezpośrednio w nowym oknie
        if(ct.indexOf("image/")===0){
          win.document.open();
          win.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>"+(attName||"obraz")+"</title></head><body style='margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;'><img src='"+url+"' style='max-width:100%;max-height:100vh;object-fit:contain;'/></body></html>");
          win.document.close();
        } else {
          win.location.href=url;
        }
      } else if(win){
        // Inny typ — wymuś pobranie
        var a=win.document.createElement("a");
        a.href=url; a.download=attName||"za\u0142\u0105cznik"; win.document.body.appendChild(a); a.click();
        setTimeout(function(){win.close();},500);
      } else {
        // Popup zablokowany — fallback do pobierania w bieżącej karcie
        var a2=document.createElement("a");
        a2.href=url; a2.download=attName||"za\u0142\u0105cznik"; a2.click();
      }
      setTimeout(function(){URL.revokeObjectURL(url);},60000);
    })
    .catch(function(){if(win)win.close();alert("B\u0142\u0105d pobierania za\u0142\u0105cznika.");});
  }

  function fetchBody(mid,_retry){
    if(!mid)return;
    if(bodies[mid]||loadingBody[mid])return;
    setLoadingBody(function(prev){var n=Object.assign({},prev);n[mid]=true;return n;});
    msalGetToken().then(function(tok){
      if(tok&&p.onTokenRefresh)p.onTokenRefresh(tok);
      var useToken=tok||p.accessToken;
      return fetch("https://graph.microsoft.com/v1.0/me/messages/"+mid+"?$select=body",{
        headers:{"Authorization":"Bearer "+useToken}
      });
    })
    .then(function(r){
      if(r.status===429){
        // Graph throttling — retry po Retry-After lub 2s
        var wait=parseInt(r.headers.get("Retry-After")||"2",10)*1000;
        setLoadingBody(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
        if(!_retry){setTimeout(function(){fetchBody(mid,true);},wait);}
        return null;
      }
      return r.ok?r.json():null;
    })
    .then(function(data){
      if(!data)return;
      var rawContent="";
      var isHtml=false;
      if(data&&data.body){
        isHtml=!!(data.body.contentType&&data.body.contentType.toLowerCase()==="html");
        rawContent=data.body.content||"";
      }
      setBodies(function(prev){var n=Object.assign({},prev);n[mid]={isHtml:isHtml,content:rawContent||"(pusta tre\u015b\u0107)"};return n;});
      setLoadingBody(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
    })
    .catch(function(){
      setBodies(function(prev){var n=Object.assign({},prev);n[mid]="(b\u0142\u0105d pobierania tre\u015bci)";return n;});
      setLoadingBody(function(prev){var n=Object.assign({},prev);n[mid]=false;return n;});
    });
  }

  // Przy zmianie wątku — rozwiń najnowszą wiadomość i pobierz jej body jeśli jeszcze nie ma
  ue(function(){
    if(!thread)return;
    var head=thread.head;
    if(head){
      setExpanded(function(prev){var n={};n[head.id]=true;return n;});
      if(!head.body&&!bodies[head.id])fetchBody(head.id);
      // Lokalny mail (np. dopiero wysłany) ma już body w m.body — zbuduj srcDoc od razu
      if(head.body&&/<[a-z][\s\S]*>/i.test(head.body)&&!resolvedSrcDocs[head.id])buildSrcDoc(head.id,head.body);
      // Opóźnienie 350ms — Graph throttling: body i attachments nie mogą lecieć jednocześnie
      var t=setTimeout(function(){fetchAttachments(head.id);},350);
      return function(){clearTimeout(t);};
    }
  // eslint-disable-next-line
  },[thread?thread.key:null]);

  // Gdy body załadowane — zbuduj srcDoc (pierwsze przybliżenie bez obrazków cid:)
  // Po załadowaniu każdego obrazka buildSrcDoc jest wywoływane ponownie
  ue(function(){
    var mids=Object.keys(bodies);
    mids.forEach(function(mid){
      var bodyObj=bodies[mid];
      if(bodyObj&&bodyObj.isHtml&&bodyObj.content&&!resolvedSrcDocs[mid]){
        buildSrcDoc(mid,bodyObj.content);
      }
    });
  // eslint-disable-next-line
  },[bodies]);

  if(!thread)return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,color:"var(--t3)"}},
    ce("div",{style:{fontSize:48,opacity:0.2}},"\uD83D\uDCE9"),
    ce("div",{style:{fontSize:13}},"Wybierz wiadomo\u015b\u0107")
  );

  // mails posortowane od najnowszej do najstarszej (już posortowane w MailList)
  var mails=thread.mails;
  var head=thread.head;

  function displayPerson(m){
    if(m.folder==="inbox")return {name:m.fromName||m.from||"(bez nadawcy)",addr:m.from||""};
    return {name:m.toName||m.to||"(bez adresata)",addr:m.to||""};
  }

  function toggleExpand(mid){
    setExpanded(function(prev){
      var n=Object.assign({},prev);
      n[mid]=!n[mid];
      return n;
    });
    if(!expanded[mid]){
      // Przy rozwijaniu pobierz body jeśli jeszcze nie ma
      var msg=mails.find(function(x){return x.id===mid;});
      if(msg&&!msg.body&&!bodies[mid])fetchBody(mid);
      // Zawsze próbuj — inline images dają hasAttachments=false
      fetchAttachments(mid);
    }
  }

  // Header wątku — bierze nazwę z najnowszej wiadomości
  var headPerson=displayPerson(head);
  // "Ważne" traktujemy jak flagę — jedno menu obsługuje importance i kategorie tenanta
  var previewFlags=[{id:"__important",label:"Wa\u017cne",color:"var(--red)",important:true}].concat(p.flags||[]);
  var headFlags=previewFlags.filter(function(fl){
    return fl.important?!!head.isImportant:(head.categories||[]).indexOf(fl.category)>=0;
  });

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{padding:"16px 20px 14px",borderBottom:"1px solid var(--bd2)",flexShrink:0}},
      ce("div",{style:{fontWeight:700,fontSize:16,color:"var(--t1)",marginBottom:10,lineHeight:1.3,display:"flex",alignItems:"center",gap:8}},
        head.subject,
        mails.length>1?ce("span",{style:{fontSize:11,color:"var(--t3)",fontWeight:500,padding:"2px 8px",borderRadius:10,background:"var(--bg3)"}},mails.length+" wiadomo\u015bci"):null
      ),
      ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        p.activeFolder!=="sent"&&p.activeFolder!=="trash"&&p.activeFolder!=="spam"
          ?ce("button",{onClick:function(){p.onReply&&p.onReply(head,bodies);},style:Object.assign({},BGHOST,{color:"var(--violet)",borderColor:"var(--violet)",fontWeight:600})},"\u21a9 Odpowiedz")
          :null,
        p.activeFolder!=="sent"&&p.activeFolder!=="trash"&&p.activeFolder!=="spam"
          ?ce("button",{onClick:function(){
              if(!p.onReplyAll)return;
              var senderObj=head.from?{email:head.from,name:head.fromName||head.from}:null;
              var toList=(senderObj?[senderObj]:[]).concat(head.toAll||[]);
              p.onReplyAll(head,bodies,toList,head.ccAll||[]);
            },style:Object.assign({},BGHOST,{color:"var(--violet)",opacity:0.75})},"\u21a9 Odpowiedz wszystkim")
          :null,
        ce("button",{onClick:function(){p.onForward&&p.onForward(head,bodies);},style:BGHOST},"\u27A1 Przeka\u017c"),
        p.activeFolder==="inbox"
          ?ce("button",{onClick:function(){p.onMarkRead&&p.onMarkRead(head,!head.isRead);},style:BGHOST},head.isRead?"\uD83D\uDCEC Oznacz jako nieprzeczytane":"\uD83D\uDCEC Oznacz jako przeczytane")
          :null,
        // Jedno menu "Oznacz jako": Wa\u017cne (importance) + flagi tenanta (kategorie Outlooka)
        p.activeFolder!=="trash"&&p.activeFolder!=="spam"
          ?ce("div",{style:{position:"relative"},
              onMouseEnter:function(){setShowFlags(true);},
              onMouseLeave:function(){setShowFlags(false);}},
            ce("button",{onClick:function(){setShowFlags(function(v){return !v;});},
              style:Object.assign({},BGHOST,headFlags.length?{color:headFlags[0].color,borderColor:headFlags[0].color,fontWeight:700,background:headFlags[0].color+"1f"}:{})},
              "\u2691 "+(headFlags.length?headFlags.map(function(f){return f.label;}).join(", "):"Oznacz jako")+" \u25be"),
            showFlags?ce("div",{style:{position:"absolute",top:"100%",left:0,zIndex:350,minWidth:180,paddingTop:4}},
              ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,
                boxShadow:"0 8px 24px rgba(0,0,0,0.18)",overflow:"hidden"}},
                previewFlags.map(function(fl,i){
                  var on=headFlags.indexOf(fl)>=0;
                  return ce("div",{key:fl.id,onClick:function(){
                      if(fl.important){p.onToggleImportant&&p.onToggleImportant(head);}
                      else {p.onToggleFlag&&p.onToggleFlag(head,fl);}
                    },
                    style:{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",fontSize:12,cursor:"pointer",
                      borderTop:i===0?"none":"1px solid var(--bd3)",background:on?"var(--bd3)":"transparent"}},
                    ce("span",{style:{fontSize:14,color:fl.color,width:14,flexShrink:0}},"\u2691"),
                    ce("span",{style:{flex:1,color:"var(--t1)",fontWeight:on?700:500}},fl.label),
                    on?ce("span",{style:{fontSize:11,color:fl.color,fontWeight:700}},"\u2713"):null
                  );
                })
              )
            ):null
          )
          :null,
        ce("button",{onClick:p.onCalendar,style:BGHOST},"\uD83D\uDCC5 Dodaj do kalendarza"),
        p.activeFolder==="trash"||p.activeFolder==="spam"
          ?ce("button",{onClick:function(){p.onRestore&&p.onRestore(head);},style:Object.assign({},BGHOST,{color:"var(--gr)",borderColor:"var(--gr)"})},"↩ Przywróć do skrzynki")
          :null,
        p.activeFolder!=="trash"&&p.activeFolder!=="spam"
          ?ce("button",{onClick:function(){p.onSpam&&p.onSpam(head);},style:Object.assign({},BGHOST,{color:"var(--amber)",borderColor:"var(--amber)"})},"🚫 Spam")
          :null,
        ce("button",{onClick:function(){p.onTrash&&p.onTrash(head);},style:Object.assign({},BGHOST,{color:"var(--red)",borderColor:"var(--red)"})},
          p.activeFolder==="trash"?"🗑️ Usu\u0144 na zawsze":"🗑️ Kosz"
        ),
        ce("div",{style:{position:"relative"}},
          ce("button",{onClick:function(){setShowMove(function(v){return !v;});},style:BGHOST},"\uD83D\uDCC1 Przenie\u015b \u25be"),
          showMove?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:300,minWidth:190,overflow:"hidden"}},
            (p.customFolders||[]).length===0
              ?ce("div",{style:{padding:"12px 14px",fontSize:12,color:"var(--t3)",fontStyle:"italic"}},"Brak w\u0142asnych folder\u00f3w")
              :(p.customFolders||[]).map(function(f){
                return ce("div",{key:f.id,onClick:function(){p.onMove(head,f.id);setShowMove(false);},
                  style:{padding:"9px 14px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:8}},
                  f.icon," ",f.label);
              })
          ):null
        )
      )
    ),
    ce("div",{style:{flex:1,overflowY:"auto"}},
      mails.map(function(m,idx){
        var per=displayPerson(m);
        var isExp=!!expanded[m.id];
        var bodyObj=bodies[m.id];
        var mBodyIsHtml=m.body&&/<[a-z][\s\S]*>/i.test(m.body);
        var bodyIsHtml=(bodyObj&&bodyObj.isHtml)||mBodyIsHtml;
        var bodyContent=m.body||(bodyObj&&bodyObj.content)||"";
        var hasBody=!!(m.body||bodyObj);
        var loading=!!loadingBody[m.id];
        var sentByMe=m.folder==="sent";
        return ce("div",{key:m.id,style:{borderBottom:"1px solid var(--bd2)"}},
          ce("div",{onClick:function(){toggleExpand(m.id);},
            style:{padding:"14px 20px 10px",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start",
              background:isExp?"transparent":"var(--bg2)"}},
            ce(Avatar,{size:32,bg:sentByMe?"#a0956e":"#c8a96a",label:initials(per.name)}),
            ce("div",{style:{flex:1,minWidth:0}},
              ce("div",{style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,marginBottom:2}},
                ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
                  sentByMe?ce("span",{style:{color:"var(--t3)",fontWeight:500,marginRight:4}},"Ja \u2192"):null,
                  per.name
                ),
                ce("div",{style:{display:"flex",alignItems:"center",gap:8,flexShrink:0}},
                  ce("span",{style:{fontSize:11,color:"var(--t3)"}},
                    new Date(m.date).toLocaleString("pl-PL",{day:"2-digit",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"})
                  ),
                  ce("span",{style:{fontSize:11,color:"var(--t3)"}},isExp?"\u25B4":"\u25BE")
                )
              ),
              ce("div",{style:{fontSize:11,color:"var(--t3)"}},per.addr),
              (isExp&&m.cc)?ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},"DW: "+m.cc):null,
              !isExp?ce("div",{style:{fontSize:12,color:"var(--t2)",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview):null
            )
          ),
          isExp?ce("div",{style:{padding:"8px 12px 16px",background:"transparent"}},
            // \u015awie\u017co wys\u0142any mail: mamy tylko lokalny placeholder (id "m_..."), Graph
            // nie zwr\u00f3ci dla niego za\u0142\u0105cznik\u00f3w \u2014 pokazujemy list\u0119 z kompozytora.
            (String(m.id).indexOf("m_")===0&&(m.localAttachments||[]).length>0)
              ?ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10,padding:"0 4px"}},
                  (m.localAttachments||[]).map(function(att,j){
                    return ce("div",{key:att.id||j,
                      style:{display:"flex",alignItems:"center",gap:6,padding:"7px 14px 7px 10px",borderRadius:10,
                        background:"var(--bg3)",border:"1px solid var(--bd2)",fontSize:12}},
                      ce("span",{style:{fontSize:16}},"\uD83D\uDCCE"),
                      ce("span",{style:{color:"var(--t1)",fontWeight:500}},att.name||"Za\u0142\u0105cznik"),
                      att.size?ce("span",{style:{color:"var(--t3)",fontSize:10,marginLeft:4}},fmtBytes(att.size)):null
                    );
                  })
                )
              :null,
            (loadingAtts[m.id]||(fetchedAtts[m.id]&&fetchedAtts[m.id].length>0))?ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10,padding:"0 4px"}},
              loadingAtts[m.id]
                ?ce("div",{style:{fontSize:11,color:"var(--t3)",fontStyle:"italic"}},"\u23F3 \u0141adowanie za\u0142\u0105cznik\u00f3w\u2026")
                :(fetchedAtts[m.id]||[]).map(function(att,j){
                  var isImg=att.contentType&&att.contentType.startsWith("image/");
                  var isPdf=att.contentType&&att.contentType.includes("pdf");
                  var cacheKey=m.id+"__"+att.id;
                  var imgSrc=window._porterAttImgCache&&window._porterAttImgCache[cacheKey]||null;
                  // Obrazek z miniaturą w cache — pokaż podgląd, klik otwiera w nowym oknie
                  if(isImg&&imgSrc){
                    return ce("div",{key:att.id||j,
                      title:"Kliknij, aby otworzy\u0107 w nowym oknie",
                      style:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"},
                      onClick:function(){downloadAttachment(m.id,att.id,att.name,att.contentType);}},
                      ce("img",{src:imgSrc,alt:att.name||"",
                        style:{maxWidth:140,maxHeight:140,borderRadius:8,border:"1px solid var(--bd2)",
                          objectFit:"cover",boxShadow:"0 2px 8px rgba(0,0,0,0.13)",display:"block"}}),
                      ce("div",{style:{fontSize:10,color:"var(--t3)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},(att.name||"obraz"))
                    );
                  }
                  // Obrazek bez miniatury (jeszcze nie pobrany) lub inny plik — kafelek klikalny
                  return ce("div",{key:att.id||j,
                    title:"Kliknij, aby otworzy\u0107 w nowym oknie",
                    onClick:function(){downloadAttachment(m.id,att.id,att.name,att.contentType);},
                    style:{display:"flex",alignItems:"center",gap:6,padding:"7px 14px 7px 10px",borderRadius:10,
                      background:"var(--bg3)",border:"1px solid var(--bd2)",fontSize:12,cursor:"pointer",
                      boxShadow:"0 1px 3px rgba(0,0,0,0.07)"}},
                    ce("span",{style:{fontSize:16}},isPdf?"\uD83D\uDCC4":isImg?"\uD83D\uDDBC\uFE0F":"\uD83D\uDCCE"),
                    ce("span",{style:{color:"var(--t1)",fontWeight:500}},att.name||"Za\u0142\u0105cznik"),
                    att.size?ce("span",{style:{color:"var(--t3)",fontSize:10,marginLeft:4}},fmtBytes(att.size)):null,
                    ce("span",{style:{fontSize:11,color:"var(--accent)",marginLeft:6,fontWeight:700}},"\u2197")
                  );
                })
            ):null,
            ce("div",{style:{background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd2)",
              boxShadow:"0 1px 6px rgba(0,0,0,0.08)",overflow:"hidden",minHeight:60}},
              loading
                ?ce("div",{style:{padding:"18px 20px",color:"#888",fontStyle:"italic",fontSize:13}},"\u23F3 Wczytywanie tre\u015bci\u2026")
                :hasBody
                  ?(bodyIsHtml
                    ?ce("iframe",{
                      srcDoc:resolvedSrcDocs[m.id]||"",
                      sandbox:"allow-same-origin",
                      style:{width:"100%",border:"none",minHeight:200,display:"block",background:"#fff"},
                      onLoad:function(e){
                        var fr=e.target;
                        try{fr.style.height=(fr.contentDocument.documentElement.scrollHeight+24)+"px";}catch(ex){}
                      }
                    })
                    :ce("div",{style:{padding:"16px 20px",whiteSpace:"pre-wrap",fontSize:13,color:"#1a1a1a",lineHeight:1.75}},bodyContent)
                  )
                  :ce("div",{style:{padding:"16px 20px",color:"#999",fontStyle:"italic",fontSize:13}},m.preview||"(brak tre\u015bci)")
            )
          ):null
        );
      })
    )
  );
}

// ── SettingsView ────────────────────────────────────────────────────────────
// Edytor podpisu (HTML + obrazek) zapisywany w Supabase per email użytkownika MS
function SettingsView(p){
  var us=React.useState, ue=React.useEffect, ur=React.useRef;

  // Lokalny stan formularza (osobny od props.userSettings — żeby Paulina mogła
  // edytować bez auto-zapisu, dopiero przycisk "Zapisz" propaguje zmiany)
  var sH=us((p.userSettings&&p.userSettings.signature_html)||""),sigHtml=sH[0],setSigHtml=sH[1];
  var sI=us((p.userSettings&&p.userSettings.signature_image_url)||""),sigImg=sI[0],setSigImg=sI[1];
  var sUp=us(false),uploading=sUp[0],setUploading=sUp[1];
  var sSv=us(false),saving=sSv[0],setSaving=sSv[1];
  var sMsg=us(null),msg=sMsg[0],setMsg=sMsg[1];
  var fileRef=ur(null);
  // Edytor flag (kolorowych oznacze\u0144) \u2014 lokalna kopia, zapis osobnym przyciskiem
  var sFl=us((p.flags||[]).slice()),flags=sFl[0],setFlags=sFl[1];
  var sFlSv=us(false),flagsSaving=sFlSv[0],setFlagsSaving=sFlSv[1];
  var sFlMsg=us(null),flagsMsg=sFlMsg[0],setFlagsMsg=sFlMsg[1];

  ue(function(){ setFlags((p.flags||[]).slice()); },[p.flags]);

  function updFlag(idx,patch){
    setFlags(function(prev){
      return prev.map(function(f,i){return i===idx?Object.assign({},f,patch):f;});
    });
    setFlagsMsg(null);
  }
  function addFlag(){
    var pal=FLAG_PALETTE[(flags.length)%FLAG_PALETTE.length];
    setFlags(function(prev){return prev.concat([{id:"flag_"+Date.now(),label:"Nowa flaga",
      color:pal.color,preset:pal.preset,category:"Nowa flaga"}]);});
    setFlagsMsg(null);
  }
  function removeFlag(idx){
    if(!window.confirm("Usun\u0105\u0107 t\u0119 flag\u0119? Wiadomo\u015bci ju\u017c oznaczone zachowaj\u0105 kategori\u0119 w Outlooku."))return;
    setFlags(function(prev){return prev.filter(function(_,i){return i!==idx;});});
    setFlagsMsg(null);
  }
  function saveFlags(){
    // category = etykieta (to nazwa kategorii widoczna w Outlooku), id = slug
    var clean=flags
      .filter(function(f){return String(f.label||"").trim().length>0;})
      .map(function(f){
        var label=String(f.label).trim();
        return {id:f.id||flagSlug(label),label:label,color:f.color||"#8b5cf6",
          category:label,preset:f.preset||"preset8"};
      });
    setFlagsSaving(true);setFlagsMsg(null);
    Promise.resolve(p.onSaveFlags?p.onSaveFlags(clean):null).then(function(){
      setFlagsSaving(false);
      setFlagsMsg({type:"ok",text:"Flagi zapisane"});
    }).catch(function(err){
      setFlagsSaving(false);
      setFlagsMsg({type:"err",text:"B\u0142\u0105d zapisu flag: "+(err.message||"nieznany")});
    });
  }

  // Resync kiedy props się zmienią (np. po pierwszym załadowaniu z bazy)
  ue(function(){
    if(p.userSettings){
      setSigHtml(p.userSettings.signature_html||"");
      setSigImg(p.userSettings.signature_image_url||"");
    }
  // eslint-disable-next-line
  },[p.userSettings?p.userSettings.id:null]);

  function onPickFile(){
    if(fileRef.current)fileRef.current.click();
  }
  function onFileChange(e){
    var f=e.target.files&&e.target.files[0];
    if(!f)return;
    if(!p.userEmail){setMsg({type:"err",text:"Brak zalogowanego konta MS"});return;}
    if(f.size>5*1024*1024){setMsg({type:"err",text:"Plik wi\u0119kszy ni\u017c 5 MB"});return;}
    setUploading(true);setMsg(null);
    sbApi.uploadSignatureImage(p.userEmail,f).then(function(url){
      setSigImg(url);
      setUploading(false);
      setMsg({type:"ok",text:"Wgrano obrazek \u2014 nie zapomnij klikn\u0105\u0107 \"Zapisz\""});
    }).catch(function(err){
      setUploading(false);
      setMsg({type:"err",text:"B\u0142\u0105d uploadu: "+(err.message||"nieznany")});
    });
    e.target.value="";
  }
  function onRemoveImage(){
    if(!sigImg)return;
    if(!window.confirm("Usun\u0105\u0107 obrazek z podpisu?"))return;
    var oldUrl=sigImg;
    setSigImg("");
    setMsg({type:"ok",text:"Obrazek usuni\u0119ty z podpisu \u2014 nie zapomnij klikn\u0105\u0107 \"Zapisz\""});
    // Best-effort delete ze Storage (nie blokuje UI)
    sbApi.deleteSignatureImage(oldUrl);
  }
  function onSave(){
    if(!p.userEmail){setMsg({type:"err",text:"Brak zalogowanego konta MS"});return;}
    setSaving(true);setMsg(null);
    sbApi.upsertUserSettings(p.userEmail,{
      signature_html:sigHtml,
      signature_image_url:sigImg
    }).then(function(){
      // Po upsert odczytaj świeże dane — PATCH nie zwraca body, więc nie polegamy na rows
      return sbApi.getUserSettings(p.userEmail);
    }).then(function(row){
      setSaving(false);
      setMsg({type:"ok",text:"Zapisano \u2713"});
      if(p.onSaved&&row)p.onSaved(row);
    }).catch(function(err){
      setSaving(false);
      setMsg({type:"err",text:"B\u0142\u0105d zapisu: "+(err.message||"nieznany")});
    });
  }

  return ce("div",{style:{height:"100%",overflowY:"auto",padding:"4px 4px 20px"}},
    ce("div",{style:{maxWidth:720,margin:"0 auto"}},
      ce("h2",{style:{fontSize:18,fontWeight:700,color:"var(--t1)",marginBottom:6}},"Ustawienia poczty"),
      ce("p",{style:{fontSize:12,color:"var(--t3)",marginBottom:20}},
        "Konto: ",ce("strong",null,p.userEmail||"\u2014")
      ),

      // ── Sekcja: Podpis ─────────────────────────────────────────────────
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:16,marginBottom:16}},
        ce("h3",{style:{fontSize:14,fontWeight:700,color:"var(--t1)",marginBottom:4}},"Podpis"),
        ce("p",{style:{fontSize:11,color:"var(--t3)",marginBottom:12}},
          "Tekst dopisywany automatycznie pod ka\u017cd\u0105 wysy\u0142an\u0105 wiadomo\u015bci\u0105. Mo\u017cesz formatowa\u0107 tekst, dodawa\u0107 linki i zmienia\u0107 kolor."
        ),
        ce(RichTextEditor,{value:sigHtml,onChange:setSigHtml,minHeight:120,
          placeholder:"Pozdrawiam,\nPaulina Porter\nPorter Design\ntel. 600 000 000"})
      ),

      // ── Sekcja: Obrazek (logo/baner) ───────────────────────────────────
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:16,marginBottom:16}},
        ce("h3",{style:{fontSize:14,fontWeight:700,color:"var(--t1)",marginBottom:4}},"Obrazek w stopce"),
        ce("p",{style:{fontSize:11,color:"var(--t3)",marginBottom:12}},"Logo lub baner pojawiaj\u0105cy si\u0119 pod tekstem podpisu (max 5 MB)."),
        ce("input",{ref:fileRef,type:"file",accept:"image/*",style:{display:"none"},onChange:onFileChange}),
        sigImg
          ?ce("div",{style:{display:"flex",gap:14,alignItems:"flex-start"}},
            ce("div",{style:{flexShrink:0,padding:8,background:"#fff",borderRadius:8,border:"1px solid var(--bd2)"}},
              ce("img",{src:sigImg,alt:"Podpis",style:{maxWidth:200,maxHeight:120,display:"block"}})
            ),
            ce("div",{style:{display:"flex",flexDirection:"column",gap:6}},
              ce("button",{onClick:onPickFile,disabled:uploading,style:BGHOST},uploading?"\u23F3 Wgrywam\u2026":"Zmie\u0144 obrazek"),
              ce("button",{onClick:onRemoveImage,style:Object.assign({},BGHOST,{color:"var(--red)"})},"Usu\u0144 obrazek")
            )
          )
          :ce("button",{onClick:onPickFile,disabled:uploading,style:BGHOST},
            uploading?"\u23F3 Wgrywam\u2026":"\uD83D\uDCCE Wgraj obrazek"
          )
      ),

      // ── Sekcja: Podgląd ────────────────────────────────────────────────
      // RichTextEditor renderuje HTML live — podgląd pokazuje tylko obrazek (tekst widać w edytorze)
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:16,marginBottom:16}},
        ce("h3",{style:{fontSize:14,fontWeight:700,color:"var(--t1)",marginBottom:10}},"Podgl\u0105d stopki"),
        ce("div",{style:{padding:14,background:"#fff",borderRadius:8,border:"1px solid var(--bd2)",fontSize:13,color:"#333",fontFamily:"Montserrat, Arial, sans-serif"}},
          (sigHtml||sigImg)
            ?ce("div",null,
              sigHtml?ce("div",{style:{marginBottom:sigImg?10:0},
                dangerouslySetInnerHTML:{__html:sigHtml}}):null,
              sigImg?ce("img",{src:sigImg,alt:"",style:{maxWidth:250,maxHeight:100,display:"block"}}):null
            )
            :ce("div",{style:{color:"#999",fontStyle:"italic"}},"(podpis pusty)")
        )
      ),

      // ── Sekcja: Flagi (kolorowe oznaczenia) ────────────────────────────
      // Zapisywane osobno od podpisu — to ustawienie całego studia, nie użytkownika.
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:16,marginBottom:16}},
        ce("h3",{style:{fontSize:14,fontWeight:700,color:"var(--t1)",marginBottom:4}},"Flagi (kolorowe oznaczenia)"),
        ce("p",{style:{fontSize:11,color:"var(--t3)",marginBottom:12,lineHeight:1.6}},
          "Oznaczenia wiadomo\u015bci widoczne na li\u015bcie mail\u00f3w i jako filtr. Technicznie to kategorie Outlooka \u2014 "+
          "flaga postawiona tutaj jest widoczna tak\u017ce w samym Outlooku i na telefonie. Ustawienie dotyczy ca\u0142ego studia."),
        flags.length===0
          ?ce("div",{style:{fontSize:12,color:"var(--t3)",fontStyle:"italic",marginBottom:10}},"Brak flag \u2014 dodaj pierwsz\u0105 poni\u017cej.")
          :ce("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:10}},
            flags.map(function(f,idx){
              return ce("div",{key:f.id||idx,style:{display:"flex",alignItems:"center",gap:8,
                padding:"8px 10px",borderRadius:10,background:"var(--bg3)",border:"1px solid var(--bd2)"}},
                ce("span",{style:{fontSize:17,lineHeight:1,color:f.color,flexShrink:0}},"\u2691"),
                ce("input",{value:f.label||"",placeholder:"Nazwa flagi",
                  onChange:function(ev){updFlag(idx,{label:ev.target.value});},
                  style:Object.assign({},INP,{flex:1,fontSize:13,padding:"7px 10px"})}),
                ce("div",{style:{display:"flex",gap:4,flexShrink:0}},
                  FLAG_PALETTE.map(function(pal){
                    var on=(f.color||"").toLowerCase()===pal.color;
                    return ce("button",{key:pal.preset,title:pal.name,
                      onClick:function(){updFlag(idx,{color:pal.color,preset:pal.preset});},
                      style:{width:20,height:20,borderRadius:"50%",background:pal.color,cursor:"pointer",
                        border:on?"2px solid var(--t1)":"2px solid transparent",padding:0,flexShrink:0}});
                  })
                ),
                ce("button",{onClick:function(){removeFlag(idx);},title:"Usu\u0144 flag\u0119",
                  style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:16,padding:"2px 4px",flexShrink:0}},"\u00d7")
              );
            })
          ),
        ce("div",{style:{display:"flex",alignItems:"center",gap:8}},
          ce("button",{onClick:addFlag,style:BGHOST},"+ Dodaj flag\u0119"),
          ce("button",{onClick:saveFlags,disabled:flagsSaving,
            style:Object.assign({},BGHOST,flagsSaving?{opacity:0.5,cursor:"not-allowed"}:{fontWeight:700})},
            flagsSaving?"\u23F3 Zapisuj\u0119\u2026":"\uD83D\uDCBE Zapisz flagi"),
          flagsMsg?ce("span",{style:{fontSize:12,color:flagsMsg.type==="ok"?"var(--gr)":"var(--red)"}},flagsMsg.text):null
        )
      ),

      // ── Komunikaty ─────────────────────────────────────────────────────
      msg?ce("div",{style:{marginBottom:12,padding:"10px 14px",borderRadius:8,fontSize:13,
        background:msg.type==="ok"?"var(--grl)":"var(--red-l)",
        color:msg.type==="ok"?"var(--gr)":"var(--red)",
        border:"1px solid "+(msg.type==="ok"?"var(--gr)":"var(--red-border)")}},msg.text):null,

      // ── Akcje ──────────────────────────────────────────────────────────
      ce("div",{style:{display:"flex",justifyContent:"flex-end",gap:8}},
        ce("button",{onClick:onSave,disabled:saving||!p.userEmail,
          style:Object.assign({},BPRIM,saving||!p.userEmail?{opacity:0.5,cursor:"not-allowed"}:{})},
          saving?"\u23F3 Zapisuj\u0119\u2026":"\uD83D\uDCBE Zapisz")
      )
    )
  );
}

function TemplatesView(p){
  var us=React.useState, ue=React.useEffect, ur=React.useRef;
  var ss=us(null),selId=ss[0],setSelId=ss[1];
  var sMode=us("view"),mode=sMode[0],setMode=sMode[1]; // "view"|"edit"|"new"
  var sLabel=us(""),editLabel=sLabel[0],setEditLabel=sLabel[1];
  var sIcon=us("\uD83D\uDCCB"),editIcon=sIcon[0],setEditIcon=sIcon[1];
  var sSubj=us(""),editSubj=sSubj[0],setEditSubj=sSubj[1];
  var sBody=us(""),editBody=sBody[0],setEditBody=sBody[1];
  var sFiles=us([]),editFiles=sFiles[0],setEditFiles=sFiles[1];
  var sSaving=us(false),saving=sSaving[0],setSaving=sSaving[1];
  var sUploading=us(false),uploading=sUploading[0],setUploading=sUploading[1];
  var sMsg=us(null),msg=sMsg[0],setMsg=sMsg[1];
  var sConfDel=us(false),confDel=sConfDel[0],setConfDel=sConfDel[1];
  var fileRef=ur(null);

  var templates=p.templates||[];
  var sel=templates.find(function(t){return t.id===selId;})||null;

  function startEdit(tpl){
    setEditLabel(tpl.label);
    setEditIcon(tpl.icon||"\uD83D\uDCCB");
    setEditSubj(tpl.subject||"");
    // Body może być plain text albo HTML — detektujemy
    var isHtml=/<[a-z][\s\S]*>/i.test(tpl.body||"");
    setEditBody(isHtml?tpl.body:plainToHtml(tpl.body||""));
    setEditFiles((tpl.templateFiles||[]).slice());
    setMsg(null);
    setConfDel(false);
    setMode("edit");
  }
  function startNew(){
    setSelId(null);
    setEditLabel("");
    setEditIcon("\uD83D\uDCCB");
    setEditSubj("");
    setEditBody("");
    setEditFiles([]);
    setMsg(null);
    setConfDel(false);
    setMode("new");
  }
  function cancelEdit(){
    setMode("view");
    setMsg(null);
    setConfDel(false);
  }

  function onPickFile(){if(fileRef.current)fileRef.current.click();}

  function onFileChange(e){
    var f=e.target.files&&e.target.files[0];
    if(!f)return;
    if(f.size>10*1024*1024){setMsg({type:"err",text:"Plik wi\u0119kszy ni\u017c 10 MB"});return;}
    setUploading(true);setMsg(null);
    var tmpId=selId||("new_"+Date.now());
    sbApi.uploadTemplateFile(tmpId,f).then(function(fileObj){
      setEditFiles(function(prev){return prev.concat([fileObj]);});
      setUploading(false);
    }).catch(function(err){
      setUploading(false);
      setMsg({type:"err",text:"B\u0142\u0105d uploadu: "+(err.message||"nieznany")});
    });
    e.target.value="";
  }

  function removeFile(url){
    setEditFiles(function(prev){return prev.filter(function(f){return f.url!==url;});});
    // Best-effort delete ze Storage
    sbApi.deleteTemplateFile(url);
  }

  function onSave(){
    if(!editLabel.trim()){setMsg({type:"err",text:"Podaj nazw\u0119 szablonu"});return;}
    setSaving(true);setMsg(null);
    var data={
      label:editLabel.trim(),
      icon:editIcon||"\uD83D\uDCCB",
      subject:editSubj||"",
      body:editBody||"",
      template_files:editFiles,
      suggest_attachments:sel&&sel.suggestAttachments||[]
    };
    var promise=mode==="new"
      ?sbApi.addMailTemplate(data)
      :sbApi.updateMailTemplate(selId,data);
    promise.then(function(){
      setSaving(false);
      setMsg({type:"ok",text:"Zapisano \u2713"});
      // Odśwież listę szablonów
      return sbApi.getMailTemplates().then(function(rows){
        var mapped=(rows||[]).map(function(r){return {
          id:r.template_id,dbId:r.id,label:r.label,icon:r.icon||"\uD83D\uDCCB",
          subject:r.subject||"",body:r.body||"",
          suggestAttachments:r.suggest_attachments||[],
          templateFiles:r.template_files||[],
          isSystem:r.is_system||false,sortOrder:r.sort_order||0
        };});
        if(p.onTemplatesChange)p.onTemplatesChange(mapped);
        // Ustaw zaznaczony na nowo dodany lub obecny
        if(mode==="new"&&mapped.length>0){
          var newest=mapped[mapped.length-1];
          setSelId(newest.id);
        }
        setMode("view");
      });
    }).catch(function(err){
      setSaving(false);
      setMsg({type:"err",text:"B\u0142\u0105d zapisu: "+(err.message||"nieznany")});
    });
  }

  function onDelete(){
    if(!selId)return;
    setSaving(true);
    sbApi.deleteMailTemplate(selId).then(function(){
      // Usuń pliki ze Storage (best-effort)
      (sel&&sel.templateFiles||[]).forEach(function(f){sbApi.deleteTemplateFile(f.url);});
      return sbApi.getMailTemplates().then(function(rows){
        var mapped=(rows||[]).map(function(r){return {
          id:r.template_id,dbId:r.id,label:r.label,icon:r.icon||"\uD83D\uDCCB",
          subject:r.subject||"",body:r.body||"",
          suggestAttachments:r.suggest_attachments||[],
          templateFiles:r.template_files||[],
          isSystem:r.is_system||false,sortOrder:r.sort_order||0
        };});
        if(p.onTemplatesChange)p.onTemplatesChange(mapped);
        setSelId(mapped.length>0?mapped[0].id:null);
        setMode("view");
        setConfDel(false);
        setSaving(false);
      });
    }).catch(function(err){
      setSaving(false);
      setMsg({type:"err",text:"B\u0142\u0105d usuwania: "+(err.message||"nieznany")});
    });
  }

  // Prawa strona — podgląd lub edytor
  var rightPane;
  if(mode==="view"){
    rightPane=sel
      ?ce("div",{style:{display:"flex",flexDirection:"column",height:"100%",gap:12}},
        ce("div",{style:{display:"flex",alignItems:"center",gap:10,flexShrink:0}},
          ce("span",{style:{fontSize:22}},sel.icon),
          ce("div",{style:{fontWeight:700,fontSize:16,color:"var(--t1)",flex:1}},sel.label),
          ce("button",{onClick:function(){startEdit(sel);},style:BGHOST},"\u270F\uFE0F Edytuj")
        ),
        ce("div",{style:{fontSize:12,color:"var(--t3)",padding:"6px 10px",background:"var(--bg3)",borderRadius:8,flexShrink:0}},
          "Temat: ",sel.subject||ce("em",null,"(brak)")),
        // Podgląd treści
        ce("div",{style:{flex:1,padding:14,background:"var(--bg2)",borderRadius:10,
          border:"1px solid var(--bd2)",overflowY:"auto",fontSize:13,color:"var(--t1)",lineHeight:1.8},
          dangerouslySetInnerHTML:{__html:sel.body||"<em style='color:var(--t3)'>(pusty szablon)</em>"}}),
        // Pliki załączone do szablonu
        (sel.templateFiles&&sel.templateFiles.length>0)?ce("div",{style:{flexShrink:0}},
          ce("div",{style:{fontSize:12,fontWeight:600,color:"var(--t2)",marginBottom:6}},"Za\u0142\u0105czniki szablonu:"),
          ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
            sel.templateFiles.map(function(f){
              return ce("div",{key:f.url,style:{display:"flex",alignItems:"center",gap:6,
                padding:"5px 12px 5px 8px",borderRadius:20,background:"var(--bg3)",
                border:"1px solid var(--bd2)",fontSize:12}},
                ce("span",null,"\uD83D\uDCCE"),
                ce("span",{style:{color:"var(--t1)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.name),
                f.size?ce("span",{style:{color:"var(--t3)",fontSize:10}},fmtBytes(f.size)):null
              );
            })
          )
        ):null,
        ce("div",{style:{display:"flex",gap:8,flexShrink:0}},
          ce("button",{onClick:function(){p.onUseTemplate(sel);},
            style:Object.assign({},BPRIM,{flex:1})},"\u270F\uFE0F U\u017cyj szablonu"),
          ce("button",{onClick:function(){startEdit(sel);},style:BGHOST},"\u2699\uFE0F Edytuj")
        )
      )
      :ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",flex:1,gap:8,color:"var(--t3)"}},
        ce("div",{style:{fontSize:40,opacity:0.2}},"\uD83D\uDCCB"),
        ce("div",{style:{fontSize:13}},"Wybierz szablon lub utw\u00f3rz nowy")
      );
  } else {
    // Tryb edycji / nowego szablonu
    rightPane=ce("div",{style:{display:"flex",flexDirection:"column",height:"100%",gap:12,overflowY:"auto"}},
      ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)",flexShrink:0}},
        mode==="new"?"+ Nowy szablon":"Edytuj: "+editLabel),
      // Nazwa + ikona
      ce("div",{style:{display:"flex",gap:8,flexShrink:0}},
        ce("input",{type:"text",value:editIcon,onChange:function(e){setEditIcon(e.target.value);},
          placeholder:"\uD83D\uDCCB",style:Object.assign({},INP,{width:52,textAlign:"center",fontSize:18,padding:"8px 4px"})}),
        ce("input",{type:"text",value:editLabel,onChange:function(e){setEditLabel(e.target.value);},
          placeholder:"Nazwa szablonu",style:Object.assign({},INP,{flex:1})})
      ),
      // Temat
      ce("input",{type:"text",value:editSubj,onChange:function(e){setEditSubj(e.target.value);},
        placeholder:"Temat wiadomo\u015bci (opcjonalne: {clientName})",style:Object.assign({},INP,{flexShrink:0})}),
      // Treść — RichTextEditor
      ce("div",{style:{flex:1,minHeight:180,display:"flex",flexDirection:"column"}},
        ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:4})},"Tre\u015b\u0107"),
        ce(RichTextEditor,{value:editBody,onChange:setEditBody,minHeight:160,
          placeholder:"Wpisz tre\u015b\u0107 szablonu\u2026 Dost\u0119pne zmienne: {clientName}, {total}, {zaliczka}"})
      ),
      // Pliki załączników
      ce("div",{style:{flexShrink:0}},
        ce("div",{style:{fontSize:12,fontWeight:600,color:"var(--t2)",marginBottom:8}},
          "\uD83D\uDCCE Za\u0142\u0105czniki sta\u0142e szablonu"),
        ce("input",{ref:fileRef,type:"file",style:{display:"none"},onChange:onFileChange}),
        editFiles.length>0?ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}},
          editFiles.map(function(f){
            return ce("div",{key:f.url,style:{display:"flex",alignItems:"center",gap:6,
              padding:"5px 10px 5px 8px",borderRadius:20,background:"var(--bg3)",
              border:"1px solid var(--bd2)",fontSize:12}},
              ce("span",null,"\uD83D\uDCCE"),
              ce("span",{style:{color:"var(--t1)",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.name),
              f.size?ce("span",{style:{color:"var(--t3)",fontSize:10}},fmtBytes(f.size)):null,
              ce("button",{onClick:function(){removeFile(f.url);},
                style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",fontSize:14,marginLeft:2}},"\u00d7")
            );
          })
        ):null,
        ce("button",{onClick:onPickFile,disabled:uploading,style:BGHOST},
          uploading?"\u23F3 Wgrywam\u2026":"\uD83D\uDCCE Za\u0142\u0105cz plik")
      ),
      // Komunikaty
      msg?ce("div",{style:{padding:"10px 14px",borderRadius:8,fontSize:13,flexShrink:0,
        background:msg.type==="ok"?"var(--grl)":"var(--red-l)",
        color:msg.type==="ok"?"var(--gr)":"var(--red)",
        border:"1px solid "+(msg.type==="ok"?"var(--gr)":"var(--red-border)")}},msg.text):null,
      // Przyciski akcji
      ce("div",{style:{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap"}},
        ce("button",{onClick:onSave,disabled:saving,
          style:Object.assign({},BPRIM,{flex:1,opacity:saving?0.6:1})},
          saving?"\u23F3 Zapisuj\u0119\u2026":"\uD83D\uDCBE Zapisz"),
        ce("button",{onClick:cancelEdit,disabled:saving,style:BGHOST},"Anuluj"),
        // Usuń szablon — tylko w trybie edycji istniejącego
        mode==="edit"?ce("div",{style:{marginLeft:"auto"}},
          !confDel
            ?ce("button",{onClick:function(){setConfDel(true);},
              style:Object.assign({},BGHOST,{color:"#b91c1c",borderColor:"#fca5a5"})},
              "\uD83D\uDDD1\uFE0F Usu\u0144 szablon")
            :ce("div",{style:{display:"flex",gap:6,alignItems:"center"}},
              ce("span",{style:{fontSize:12,color:"#b91c1c"}},"Na pewno?"),
              ce("button",{onClick:onDelete,disabled:saving,
                style:Object.assign({},BGHOST,{color:"#b91c1c",borderColor:"#fca5a5",fontWeight:700})},
                saving?"\u23F3 Usuwam\u2026":"Tak, usu\u0144"),
              ce("button",{onClick:function(){setConfDel(false);},style:BGHOST},"Anuluj")
            )
        ):null
      )
    );
  }

  return ce("div",{style:{display:"flex",height:"100%"}},
    // Lewa kolumna — lista szablonów
    ce("div",{style:{width:160,borderRight:"1px solid var(--bd2)",display:"flex",
      flexDirection:"column",overflowY:"auto",flexShrink:0}},
      templates.length===0&&mode!=="new"
        ?ce("div",{style:{padding:14,fontSize:12,color:"var(--t3)",fontStyle:"italic"}},
          "Brak szablonów")
        :null,
      templates.map(function(tpl){
        var active=selId===tpl.id&&mode==="view";
        return ce("div",{key:tpl.id,onClick:function(){setSelId(tpl.id);setMode("view");setMsg(null);setConfDel(false);},
          style:{padding:"12px 14px",cursor:"pointer",borderBottom:"1px solid var(--bd3)",
            background:active?"var(--wb)":"transparent",
            borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
          ce("div",{style:{fontSize:18,marginBottom:4}},tpl.icon),
          ce("div",{style:{fontSize:13,fontWeight:active?700:500,color:"var(--t1)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},tpl.label)
        );
      }),
      // Przycisk nowego szablonu zawsze na dole
      ce("div",{style:{marginTop:"auto",padding:10,borderTop:"1px solid var(--bd2)"}},
        ce("button",{onClick:startNew,
          style:Object.assign({},BGHOST,{width:"100%",fontSize:12,justifyContent:"center"})},
          "+ Nowy szablon")
      )
    ),
    // Prawa kolumna — podgląd/edytor
    ce("div",{style:{flex:1,minWidth:0,padding:"16px 20px",display:"flex",flexDirection:"column",overflow:"hidden"}},
      rightPane
    )
  );
}

function DraftsView(p){
  if(!p.drafts||p.drafts.length===0)return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8,color:"var(--t3)"}},
    ce("div",{style:{fontSize:40,opacity:0.2}},"\uD83D\uDCDD"),
    ce("div",{style:{fontSize:13}},"Brak projekt\u00f3w")
  );
  return ce("div",{style:{display:"flex",flexDirection:"column",gap:6}},
    p.drafts.map(function(d){
      return ce("div",{key:d.id,style:{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:12,background:"var(--bg2)",border:"1px solid var(--bd2)"}},
        ce("div",{style:{width:36,height:36,borderRadius:9,background:"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}},"\uD83D\uDCDD"),
        ce("div",{style:{flex:1,cursor:"pointer",minWidth:0},onClick:function(){p.onOpen(d);}},
          ce("div",{style:{fontWeight:600,fontSize:13,color:"var(--t1)",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},d.subject||"(bez tematu)"),
          ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Do: "+(d.to||"\u2014")+" \u00b7 "+fmtMailDate(d.savedAt))
        ),
        ce("button",{onClick:function(){p.onDelete(d.id);},style:{border:"none",background:"var(--bg3)",borderRadius:8,cursor:"pointer",color:"var(--t3)",fontSize:14,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}},"\uD83D\uDDD1\uFE0F")
      );
    })
  );
}

// ── RichTextEditor ──────────────────────────────────────────────────────────
// Edytor WYSIWYG bazujący na contentEditable + document.execCommand.
// Toolbar: B / I / U / listy (UL/OL) / link / kolor / wyczyść formatowanie.
// Wartość przekazywana jest jako HTML string (props.value/onChange).
//
// Uwaga implementacyjna: contentEditable jest "uncontrolled" z natury.
// Synchronizujemy props.value → DOM tylko gdy faktycznie się różni od bieżącego
// innerHTML (np. wczytanie szablonu, draftu). W innym przypadku zostawiamy
// edytor w spokoju, żeby nie tracić cursor position.
export function RichTextEditor(p){
  var ur=React.useRef, us=React.useState, ue=React.useEffect;
  var ref=ur(null);
  var sFocus=us(false),focused=sFocus[0],setFocused=sFocus[1];
  var sColorOpen=us(false),colorOpen=sColorOpen[0],setColorOpen=sColorOpen[1];

  // Placeholder dla pustego contentEditable — wstrzykuj styl raz na poziomie dokumentu
  ue(function(){
    var id="rte-placeholder-style";
    if(document.getElementById(id))return;
    var st=document.createElement("style");
    st.id=id;
    st.textContent=
      "[data-rte-empty='true']:before{content:attr(data-placeholder);color:var(--t3);"+
      "pointer-events:none;display:block;font-style:italic;}";
    document.head.appendChild(st);
  },[]);

  // Wykrywaj czy edytor jest pusty (do pokazania placeholdera)
  function isEmpty(html){
    if(!html)return true;
    // Outlook/Word czasem wkleja <p><br></p> jako "puste" — traktujemy to jako empty
    var stripped=html.replace(/<(p|div|br)[^>]*>/gi,"").replace(/<\/(p|div)>/gi,"").replace(/&nbsp;/gi,"").trim();
    return stripped==="";
  }

  // Synchronizacja props → DOM (tylko gdy różnica)
  ue(function(){
    if(!ref.current)return;
    var current=ref.current.innerHTML;
    var incoming=p.value||"";
    if(current!==incoming){
      ref.current.innerHTML=incoming;
    }
  // eslint-disable-next-line
  },[p.value]);

  function exec(cmd, val){
    // Zachowujemy fokus w edytorze, żeby execCommand zadziałało na zaznaczeniu
    if(ref.current)ref.current.focus();
    document.execCommand(cmd, false, val||null);
    // Po komendzie powiadom rodzica o nowym HTML
    if(ref.current&&p.onChange)p.onChange(ref.current.innerHTML);
  }

  function onInput(){
    if(ref.current&&p.onChange)p.onChange(ref.current.innerHTML);
  }

  function onAddLink(){
    var sel=window.getSelection();
    var hasText=sel&&sel.toString().length>0;
    var url=window.prompt("Wklej adres URL:","https://");
    if(!url)return;
    if(hasText){
      exec("createLink", url);
    } else {
      // Brak zaznaczenia — wstaw URL jako klikalny link
      var html='<a href="'+url.replace(/"/g,"&quot;")+'" target="_blank">'+url+'</a>';
      exec("insertHTML", html);
    }
  }

  function onPaste(e){
    // Wymuszamy wklejanie jako plain text — bez śmieci ze stylami z Worda/Gmaila,
    // ale jeśli wklejony tekst zawiera adres URL, zamieniamy go na klikalny <a>
    // (inaczej link wklejony np. do oferty trafiał do maila jako martwy tekst).
    e.preventDefault();
    var text=(e.clipboardData||window.clipboardData).getData("text/plain");
    var urlRe=/(https?:\/\/[^\s<]+)/gi;
    if(urlRe.test(text)){
      var esc=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      var html=esc.replace(/(https?:\/\/[^\s<]+)/gi,function(m){
        return '<a href="'+m+'" target="_blank">'+m+'</a>';
      }).replace(/\n/g,"<br>");
      document.execCommand("insertHTML", false, html);
    } else {
      document.execCommand("insertText", false, text);
    }
  }

  function onKeyDown(e){
    // Tab w listach — wcięcie/odznaczenie wcięcia
    if(e.key==="Tab"){
      e.preventDefault();
      exec(e.shiftKey?"outdent":"indent");
    }
  }

  // Paleta kolorów — pasująca do palety reszty aplikacji
  var COLORS=[
    {name:"Domy\u015blny",val:"#222222"},
    {name:"Czarny",val:"#000000"},
    {name:"Szary",val:"#6b7280"},
    {name:"Z\u0142oty",val:"#c8a96a"},
    {name:"Br\u0105zowy",val:"#8b5a2b"},
    {name:"Czerwony",val:"#dc2626"},
    {name:"Zielony",val:"#059669"},
    {name:"Niebieski",val:"#2563eb"},
    {name:"Fioletowy",val:"#7c3aed"}
  ];

  var btn={padding:"6px 10px",borderRadius:6,border:"1px solid var(--bd2)",
    background:"var(--bg2)",cursor:"pointer",fontSize:13,fontWeight:600,
    color:"var(--t1)",minWidth:30,height:30,display:"inline-flex",
    alignItems:"center",justifyContent:"center",userSelect:"none"};
  var btnDiv={width:1,background:"var(--bd2)",margin:"0 4px",alignSelf:"stretch"};

  return ce("div",{style:{border:"1px solid "+(focused?"var(--t2)":"var(--bd2)"),
    borderRadius:9,background:"var(--bg2)",transition:"border-color .15s",
    display:"flex",flexDirection:"column",flex:1,minHeight:p.minHeight||220,overflow:"hidden"}},

    // ── Toolbar ─────────────────────────────────────────────────────────
    ce("div",{style:{display:"flex",flexWrap:"wrap",gap:4,padding:"6px 8px",
      borderBottom:"1px solid var(--bd2)",background:"var(--bg2)",alignItems:"center"}},

      ce("button",{type:"button",onMouseDown:function(e){e.preventDefault();exec("bold");},
        title:"Pogrubienie (Ctrl+B)",style:Object.assign({},btn,{fontWeight:800})},"B"),
      ce("button",{type:"button",onMouseDown:function(e){e.preventDefault();exec("italic");},
        title:"Kursywa (Ctrl+I)",style:Object.assign({},btn,{fontStyle:"italic"})},"I"),
      ce("button",{type:"button",onMouseDown:function(e){e.preventDefault();exec("underline");},
        title:"Podkre\u015blenie (Ctrl+U)",style:Object.assign({},btn,{textDecoration:"underline"})},"U"),

      ce("div",{style:btnDiv}),

      ce("button",{type:"button",onMouseDown:function(e){e.preventDefault();exec("insertUnorderedList");},
        title:"Lista punktowana",style:btn},"\u2022 \u2022 \u2022"),
      ce("button",{type:"button",onMouseDown:function(e){e.preventDefault();exec("insertOrderedList");},
        title:"Lista numerowana",style:btn},"1. 2."),

      ce("div",{style:btnDiv}),

      ce("button",{type:"button",onMouseDown:function(e){e.preventDefault();onAddLink();},
        title:"Wstaw link",style:btn},"\uD83D\uDD17"),

      // Picker kolorów
      ce("div",{style:{position:"relative"}},
        ce("button",{type:"button",
          onMouseDown:function(e){e.preventDefault();setColorOpen(function(v){return !v;});},
          title:"Kolor tekstu",style:btn},
          ce("span",null,"A"),
          ce("span",{style:{display:"inline-block",width:10,height:3,background:"#dc2626",marginLeft:3}})
        ),
        colorOpen?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,
          background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:8,
          boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:200,padding:8,
          display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:4,minWidth:140}},
          COLORS.map(function(c){
            return ce("button",{key:c.val,type:"button",title:c.name,
              onMouseDown:function(e){e.preventDefault();exec("foreColor",c.val);setColorOpen(false);},
              style:{width:36,height:28,border:"1px solid var(--bd2)",borderRadius:5,
                background:c.val,cursor:"pointer",padding:0}});
          })
        ):null
      ),

      ce("div",{style:btnDiv}),

      ce("button",{type:"button",
        onMouseDown:function(e){e.preventDefault();exec("removeFormat");exec("foreColor","#222222");},
        title:"Wyczy\u015b\u0107 formatowanie",style:Object.assign({},btn,{fontSize:11})},"\u2715")
    ),

    // ── Pole edycji ─────────────────────────────────────────────────────
    ce("div",{
      ref:ref,
      contentEditable:true,
      suppressContentEditableWarning:true,
      onInput:onInput,
      onPaste:onPaste,
      onKeyDown:onKeyDown,
      onFocus:function(){setFocused(true);setColorOpen(false);},
      onBlur:function(){setFocused(false);},
      "data-placeholder":p.placeholder||"Wpisz tre\u015b\u0107 wiadomo\u015bci\u2026",
      "data-rte-empty":isEmpty(p.value)?"true":"false",
      style:{flex:1,padding:"12px 14px",fontSize:14,lineHeight:1.7,
        color:"var(--t1)",outline:"none",overflowY:"auto",
        background:p.bg||"transparent",
        fontFamily:"Montserrat, Arial, Helvetica, sans-serif",
        minHeight:p.minHeight||220}
    })
  );
}

export function ScreenMail(p){
  var us=React.useState, ue=React.useEffect;
  var clients=p.clients||[];

  var sa=us(false),logged=sa[0],setLogged=sa[1];
  var stok=us(null),accessToken=stok[0],setAccessToken=stok[1];
  var sacc=us(null),msAccount=sacc[0],setMsAccount=sacc[1];
  var slogging=us(false),logging=slogging[0],setLogging=slogging[1];
  var suf=us([]),userFolders=suf[0],setUserFolders=suf[1];
  var saf=us("inbox"),activeFolder=saf[0],setActiveFolder=saf[1];
  var snf=us(false),showNF=snf[0],setShowNF=snf[1];
  var smails=us([]),allMails=smails[0],setAllMails=smails[1];
  var sloadingMails=us(false),loadingMails=sloadingMails[0],setLoadingMails=sloadingMails[1];
  var srk=us(0),refreshKey=srk[0],setRefreshKey=srk[1];
  var sflg=us(getMailFlags),mailFlags=sflg[0],setMailFlags=sflg[1];   // flagi per tenant
  // ── Paginacja historii (per folder) + wyszukiwanie server-side ──
  var snl=us({}),nextLinks=snl[0],setNextLinks=snl[1];            // @odata.nextLink per folder
  var slm=us(false),loadingMore=slm[0],setLoadingMore=slm[1];
  var ssr=us(null),searchResults=ssr[0],setSearchResults=ssr[1]; // null = brak aktywnego wyszukiwania
  var ssrl=us(false),searchLoading=ssrl[0],setSearchLoading=ssrl[1];
  var ssnl=us(null),searchNextLink=ssnl[0],setSearchNextLink=ssnl[1];
  var ssel=us(null),selThread=ssel[0],setSelThread=ssel[1];
  var sdr=us(function(){try{return JSON.parse(localStorage.getItem("pd_mail_drafts")||"[]");}catch(e){return[];}}),drafts=sdr[0],setDrafts=sdr[1];
  var sc=us(null),selClientId=sc[0],setSelClientId=sc[1];
  var st=us("oferta"),selTemplate=st[0],setSelTemplate=st[1];
  var sto=us(""),toEmail=sto[0],setToEmail=sto[1];
  var scc=us(""),ccEmail=scc[0],setCcEmail=scc[1];
  var sbcc=us(""),bccEmail=sbcc[0],setBccEmail=sbcc[1];
  var sccvis=us(false),showCcBcc=sccvis[0],setShowCcBcc=sccvis[1];
  var ssub=us(""),subject=ssub[0],setSubject=ssub[1];
  var sbod=us(""),body=sbod[0],setBody=sbod[1];
  // Cytowany wątek (Odpowiedz/Odpowiedz wszystkim/Przekaż) — trzymany osobno od `body`,
  // żeby podpis dało się wstawić między własną treścią a cytatem, a nie za nim.
  var sqt=us(""),quotedHtml=sqt[0],setQuotedHtml=sqt[1];
  var satt=us([]),attachments=satt[0],setAttachments=satt[1];
  var scon=us([]),contactSug=scon[0],setContactSug=scon[1];
  var ssent=us(false),justSent=ssent[0],setJustSent=ssent[1];
  var ssending=us(false),sending=ssending[0],setSending=ssending[1];
  var scal=us(null),calMail=scal[0],setCalMail=scal[1];
  var scalok=us(null),calSaved=scalok[0],setCalSaved=scalok[1];
  var serr=us(null),sendError=serr[0],setSendError=serr[1];
  var stplpick=us(false),showTplPicker=stplpick[0],setShowTplPicker=stplpick[1];
  // Per-user ustawienia z Supabase (podpis, obrazek). null = nie załadowane jeszcze
  var sset=us(null),userSettings=sset[0],setUserSettings=sset[1];
  // Szablony z bazy — null = ładowanie, [] = puste, [...] = załadowane
  var sdbt=us(null),dbTemplates=sdbt[0],setDbTemplates=sdbt[1];
  // Kontrahenci (baza Kontrahenci) — do podpowiedzi w polu "Do:", niezależnie od wycen
  var sctc=us([]),contacts=sctc[0],setContacts=sctc[1];

  var selClient=clients.find(function(c){return String(c.id)===String(selClientId);})||null;
  var userEmail=msAccount&&(msAccount.username||msAccount.email)||"";
  // Aktywna lista szablonów — z bazy jeśli załadowane, fallback na MAIL_TEMPLATES
  var activeTemplates=dbTemplates!==null?dbTemplates:MAIL_TEMPLATES;

  // Synchronizuj widok poczty z historią przeglądarki. Dzięki temu „wstecz”
  // wraca z compose/podglądu do poprzedniego kroku zamiast do głównego ekranu.
  function mailNavigate(folder, thread){
    setActiveFolder(folder);
    setSelThread(thread||null);
    try { window.history.pushState({pdMail:true,folder:folder}, "", window.location.href); } catch(e) {}
  }
  ue(function(){
    function onPop(ev){
      if(!ev.state||!ev.state.pdMail){
        setActiveFolder("inbox");
        setSelThread(null);
        return;
      }
      setActiveFolder(ev.state.folder||"inbox");
      setSelThread(null);
    }
    window.addEventListener("popstate",onPop);
    return function(){window.removeEventListener("popstate",onPop);};
  },[]);

  // Sprawdź czy user wraca z redirect MS lub ma aktywną sesję
  ue(function(){
    var returnedFromMicrosoft = consumeBrokerCallback('microsoft');
    var finish = function(acc) {
      if(acc){
        setMsAccount(acc);
        return msalGetToken().then(function(token){
          if(token){
            setAccessToken(token);
            setLogged(true);
          }
        });
      }
      if (returnedFromMicrosoft) {
        // The callback marker confirms the redirect, but make the error visible
        // instead of silently falling back to the login card.
        console.error("Microsoft OAuth callback returned without a usable broker connection");
      }
      return null;
    };
    (returnedFromMicrosoft
      ? brokerTokenRetry('microsoft', 5).then(function(){ return msalGetActiveAccount(); })
      : msalGetActiveAccount()
    ).then(finish).catch(function(e){console.error("MSAL session check error",e);});
  },[]);

  // Załaduj szablony z bazy (nie wymaga auth — baza jest publiczna)
  ue(function(){
    sbApi.getMailTemplates().then(function(rows){
      // Mapuj kolumny bazy na format używany w app (template_id → id)
      var mapped=(rows||[]).map(function(r){return {
        id:r.template_id,
        dbId:r.id,
        label:r.label||"",
        icon:r.icon||"\uD83D\uDCCB",
        subject:r.subject||"",
        body:r.body||"",
        suggestAttachments:r.suggest_attachments||[],
        templateFiles:r.template_files||[],
        isSystem:r.is_system||false,
        sortOrder:r.sort_order||0
      };});
      setDbTemplates(mapped);
    }).catch(function(e){
      console.error("getMailTemplates error",e);
      setDbTemplates([]); // puste — Paulina może tworzyć nowe
    });
  },[]);

  // Załaduj Kontrahentów — trzecie źródło podpowiedzi w polu "Do:" (obok wycen i historii wysyłek),
  // bo kontrahent często nie ma jeszcze wyceny ani nie dostał żadnego maila.
  ue(function(){
    sbApi.getContacts().then(function(rows){setContacts(rows||[]);}).catch(function(e){
      console.error("getContacts error",e);
      setContacts([]);
    });
  },[]);

  // Załaduj ustawienia użytkownika (podpis itp.) po zalogowaniu MS
  ue(function(){
    if(!userEmail)return;
    sbApi.getUserSettings(userEmail).then(function(row){
      setUserSettings(row||{user_email:userEmail,signature_html:"",signature_image_url:""});
    }).catch(function(e){
      console.error("getUserSettings error",e);
      setUserSettings({user_email:userEmail,signature_html:"",signature_image_url:""});
    });
  },[userEmail]);

  function doLoadMails(){
    if(!accessToken)return;
    setLoadingMails(true);
  }

  ue(function(){
    if(!accessToken)return;
    setLoadingMails(true);

    var inboxUrl="https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$select=subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,categories,conversationId,isRead,importance&$orderby=receivedDateTime desc";
    var sentUrl="https://graph.microsoft.com/v1.0/me/mailFolders/sentItems/messages?$top=50&$select=subject,toRecipients,ccRecipients,sentDateTime,bodyPreview,hasAttachments,categories,conversationId,importance&$orderby=sentDateTime desc";
    var trashUrl="https://graph.microsoft.com/v1.0/me/mailFolders/deletedItems/messages?$top=50&$select=subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,categories,conversationId,isRead&$orderby=receivedDateTime desc";
    var spamUrl="https://graph.microsoft.com/v1.0/me/mailFolders/junkEmail/messages?$top=50&$select=subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,categories,conversationId,isRead&$orderby=receivedDateTime desc";

    // Odśwież token przed każdym pobraniem — stary token wygasa po ~1h
    msalGetToken().then(function(freshToken){
      if(freshToken&&freshToken!==accessToken)setAccessToken(freshToken);
      var tok=freshToken||accessToken;

      function fetchJson(url){
        return fetch(url,{headers:{"Authorization":"Bearer "+tok}})
          .then(function(r){return r.ok?r.json():{value:[]};});
      }

      return Promise.all([fetchJson(inboxUrl),fetchJson(sentUrl),fetchJson(trashUrl),fetchJson(spamUrl)]);
    }).catch(function(e){
      if(e&&e.code==="MS_INTERACTION_REQUIRED"){
        setLogged(false);setAccessToken(null);setMsAccount(null);
      }
      setLoadingMails(false);
      return null;
    }).then(function(results){
      if(!results)return;
      var inboxData=results[0],sentData=results[1],trashData=results[2],spamData=results[3];
      var inboxMails=(inboxData.value||[]).map(function(m){
        var fromAddr=(m.from&&m.from.emailAddress)||{};
        return {
          id:m.id,folder:"inbox",
          from:fromAddr.address||"",fromName:fromAddr.name||fromAddr.address||"",
          to:"",toName:"",
          cc:fmtRecipients(m.ccRecipients),
          toAll:recipObjs(m.toRecipients),
          ccAll:recipObjs(m.ccRecipients),
          subject:m.subject||"",
          date:m.receivedDateTime||new Date().toISOString(),
          preview:m.bodyPreview||"",body:null, // body dociągamy on-demand
          attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],
          hasAttachments:!!m.hasAttachments,
          conversationId:m.conversationId||null,
          isRead:m.isRead!==false,
          isImportant:m.importance==="high",
          categories:m.categories||[]
        };
      });
      var sentMails=(sentData.value||[]).map(function(m){
        var rec=(m.toRecipients&&m.toRecipients[0]&&m.toRecipients[0].emailAddress)||{};
        return {
          id:m.id,folder:"sent",
          from:"",fromName:"",
          to:rec.address||"",toName:rec.name||rec.address||"",
          cc:fmtRecipients(m.ccRecipients),
          subject:m.subject||"",
          date:m.sentDateTime||new Date().toISOString(),
          preview:m.bodyPreview||"",body:null,
          attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],
          hasAttachments:!!m.hasAttachments,
          conversationId:m.conversationId||null,
          isRead:true,
          isImportant:m.importance==="high",
          categories:m.categories||[]
        };
      });
      var trashMails=(trashData.value||[]).map(function(m){var fa=(m.from&&m.from.emailAddress)||{};return {id:m.id,folder:"trash",from:fa.address||"",fromName:fa.name||fa.address||"",to:"",toName:"",cc:fmtRecipients(m.ccRecipients),subject:m.subject||"",date:m.receivedDateTime||new Date().toISOString(),preview:m.bodyPreview||"",body:null,attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],hasAttachments:!!m.hasAttachments,conversationId:m.conversationId||null,isRead:m.isRead!==false,categories:m.categories||[]};});
      var spamMails=(spamData.value||[]).map(function(m){var fa=(m.from&&m.from.emailAddress)||{};return {id:m.id,folder:"spam",from:fa.address||"",fromName:fa.name||fa.address||"",to:"",toName:"",cc:fmtRecipients(m.ccRecipients),subject:m.subject||"",date:m.receivedDateTime||new Date().toISOString(),preview:m.bodyPreview||"",body:null,attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],hasAttachments:!!m.hasAttachments,conversationId:m.conversationId||null,isRead:m.isRead!==false,categories:m.categories||[]};});
      setAllMails(inboxMails.concat(sentMails).concat(trashMails).concat(spamMails));
      setNextLinks({
        inbox:inboxData["@odata.nextLink"]||null,
        sent:sentData["@odata.nextLink"]||null,
        trash:trashData["@odata.nextLink"]||null,
        spam:spamData["@odata.nextLink"]||null
      });
      setSearchResults(null);setSearchNextLink(null); // odświeżenie resetuje wyszukiwanie
      setLoadingMails(false);
    });
  },[accessToken,refreshKey]);

  // Flagi per tenant z Supabase. Do czasu odpowiedzi dziala fallback
  // (localStorage \u2192 DEFAULT_MAIL_FLAGS) ustawiony w inicjalizatorze stanu.
  ue(function(){
    sbApi.getMailFlags().then(function(list){
      if(list)setMailFlags(list);
    }).catch(function(){});
  },[]);

  // Zapis definicji flag (Ustawienia) \u2014 Supabase + lokalny cache offline
  function saveMailFlags(list){
    setMailFlags(list);
    try{localStorage.setItem("pd_mail_flags",JSON.stringify(list));}catch(e){}
    return sbApi.saveMailFlags(list);
  }

  // Zmiana folderu → wyczyść aktywne wyszukiwanie
  ue(function(){ setSearchResults(null); setSearchNextLink(null); }, [activeFolder]);

  ue(function(){
    if(!activeTemplates.length)return;
    var tpl=activeTemplates.find(function(t){return t.id===selTemplate;})||activeTemplates[0];
    if(!tpl)return;
    var filled=fillTemplate(tpl,selClient);
    setSubject(filled.subject);
    // Body szablonu może być plain text (stare) lub HTML (nowe z edytora) — konwertujemy jeśli plain
    var isHtml=/<[a-z][\s\S]*>/i.test(filled.body);
    setBody(isHtml?filled.body:plainToHtml(filled.body));
    if(selClient&&selClient.email)setToEmail(selClient.email);
    // Attachments: pliki PDF z app + pliki szablonu z Storage
    var appAtts=(tpl.suggestAttachments||[]).map(function(sid){
      var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
      return opt?{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}:null;
    }).filter(Boolean);
    var tplAtts=(tpl.templateFiles||[]).map(function(f){
      return {id:"tplf_"+f.url,name:f.name,size:f.size||null,type:"template",url:f.url};
    });
    // Załączniki szablonu — niezależnie od wybranego klienta
    setAttachments(appAtts.concat(tplAtts));
  },[selClientId,selTemplate,dbTemplates]);

  function onToChange(val){
    setToEmail(val);
    if(val.length<2){setContactSug([]);return;}
    var q=val.toLowerCase();
    var fc=clients.filter(function(c){return c.email&&((c.name||"").toLowerCase().includes(q)||c.email.toLowerCase().includes(q));}).map(function(c){return {email:c.email,name:c.name};});
    // Kontrahenci (baza Kontrahenci) — dopisz tych, których nie ma jeszcze wśród klientów z wycen
    contacts.filter(function(c){return c.email&&((c.name||"").toLowerCase().includes(q)||c.email.toLowerCase().includes(q));}).forEach(function(c){
      if(!fc.find(function(x){return x.email.toLowerCase()===c.email.toLowerCase();}))fc.push({email:c.email,name:c.name});
    });
    // Osoby, z którymi już była korespondencja w Outlooku (inbox/sent/trash/spam — już wczytane w allMails).
    // To realna historia maili, nie tylko to co wysłano przez Kompozytor tej appki.
    var seenMail={};
    allMails.forEach(function(m){
      var addr=m.folder==="sent"?m.to:m.from;
      var nm=m.folder==="sent"?m.toName:m.fromName;
      if(!addr)return;
      var al=addr.toLowerCase();
      if(seenMail[al])return;
      if(al.indexOf(q)===-1&&(nm||"").toLowerCase().indexOf(q)===-1)return;
      seenMail[al]=1;
      if(!fc.find(function(x){return x.email.toLowerCase()===al;}))fc.push({email:addr,name:nm||addr});
    });
    // Dociągnij historię adresów z Supabase (cross-device, cross-session)
    sbApi.searchMailRecipients(q).then(function(rows){
      // Dodatkowy filtr po stronie klienta — upewnij się że query nadal pasuje
      var hist=(rows||[]).filter(function(r){
        return r.email&&(r.email.toLowerCase().includes(q)||(r.name||"").toLowerCase().includes(q));
      }).map(function(r){return {email:r.email,name:r.name||""};});
      var combined=fc.slice();
      hist.forEach(function(h){if(!combined.find(function(x){return x.email.toLowerCase()===h.email.toLowerCase();}))combined.push(h);});
      setContactSug(combined.slice(0,8));
    }).catch(function(){
      setContactSug(fc.slice(0,8));
    });
    // Pokaż lokalnych od razu, Supabase dopełni za chwilę
    setContactSug(fc.slice(0,8));
  }

  // Czy treść maila (HTML z RichTextEditora) jest faktycznie pusta?
  // Pusty contentEditable może mieć w sobie <br>, <div><br></div> itp.
  function isBodyEmpty(html){
    if(!html)return true;
    return htmlToPlain(html).length===0;
  }
  var bodyEmpty=isBodyEmpty(body);

  function handleSaveDraft(){
    if(!toEmail&&!subject&&bodyEmpty)return;
    var d={id:"d_"+Date.now(),to:toEmail,cc:ccEmail,bcc:bccEmail,subject:subject,body:body,quote:quotedHtml,attachments:attachments.slice(),savedAt:new Date().toISOString()};
    setDrafts(function(prev){
      var next=[d].concat(prev);
      try{localStorage.setItem("pd_mail_drafts",JSON.stringify(next));}catch(e){}
      return next;
    });
    setToEmail(""); setSubject(""); setBody(""); setQuotedHtml(""); setAttachments([]); setSelClientId(null);
    setCcEmail(""); setBccEmail("");
  }

  function openDraft(d){
    setToEmail(d.to||""); setSubject(d.subject||""); setBody(d.body||"");
    setQuotedHtml(d.quote||"");
    setCcEmail(d.cc||""); setBccEmail(d.bcc||"");
    if(d.cc||d.bcc)setShowCcBcc(true);
    setAttachments(d.attachments||[]);
    setDrafts(function(prev){return prev.filter(function(x){return x.id!==d.id;});});
    mailNavigate("compose");
  }

  // Wkleja treść i załączniki szablonu do bieżącego compose
  // Treść szablonu jest wstawiana PRZED istniejącym body (cytatem z odpowiedzi)
  function applyTemplateToCompose(tpl){
    if(!tpl)return;
    var filled=fillTemplate(tpl,selClient);
    var isHtml=/<[a-z][\s\S]*>/i.test(filled.body);
    var tplHtml=isHtml?filled.body:plainToHtml(filled.body);
    setBody(tplHtml+(body?"<br><br>"+body:""));
    // Suffix Re:/Fwd: zachowaj, nie nadpisuj tematu
    if(filled.subject&&(!subject||(!subject.startsWith("Re:")&&!subject.startsWith("Fwd:")))){
      setSubject(filled.subject);
    }
    // Załączniki szablonu — dołącz bez duplikatów
    var appAtts2=(tpl.suggestAttachments||[]).map(function(sid){
      var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
      return opt?{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}:null;
    }).filter(Boolean);
    var tplAtts2=(tpl.templateFiles||[]).map(function(f){
      return {id:"tplf_"+f.url,name:f.name,size:f.size||null,type:"template",url:f.url};
    });
    var toAdd=appAtts2.concat(tplAtts2);
    setAttachments(function(prev){
      var merged=prev.slice();
      toAdd.forEach(function(a){
        if(!merged.find(function(x){return x.id===a.id;}))merged.push(a);
      });
      return merged;
    });
    setShowTplPicker(false);
  }

  // Składa pełny HTML body wiadomości — treść użytkownika (HTML z RichTextEditora)
  // + podpis (HTML + obrazek z Ustawień). Treść już jest HTML, nie escapujemy.
  // useCid=true → obrazek wstawiany jako <img src="cid:signature-image">,
  // wtedy musi być dołączony jako inline attachment w handleSend.
  function buildMailHtml(htmlBodyInput, settings, useCid, quotedHtmlInput){
    // Domyślna czcionka maila: Montserrat (spójna z marką / PDF-ami).
    // @import ładuje Montserrat w klientach, które to wspierają (np. Apple Mail);
    // pozostałe (Gmail/Outlook zwykle blokują web-fonty) użyją fallbacku Arial.
    var fontImport="<style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap');</style>";
    var bodyHtml="<div style=\"font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;color:#222;\">"
      +(htmlBodyInput||"")
      +"</div>";
    var sig=settings||{};
    var sigHtml=sig.signature_html||"";
    var sigImg=sig.signature_image_url||"";
    var sigBlock="";
    if(sigHtml||sigImg){
      // Podpis wchodzi zaraz po treści wiadomości, PRZED cytowanym wątkiem — nie na jego końcu
      sigBlock="<br><br><div style=\"font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;color:#444;\">";
      if(sigHtml){
        // signature_html jest HTML z RichTextEditora — nie konwertujemy, używamy bezpośrednio
        sigBlock+=String(sigHtml);
      }
      if(sigImg){
        if(sigHtml)sigBlock+="<br>";
        var imgSrc=useCid?"cid:signature-image":sigImg;
        sigBlock+="<img src=\""+imgSrc+"\" alt=\"\" style=\"max-width:250px;height:auto;display:block;margin-top:8px;\">";
      }
      sigBlock+="</div>";
    }
    var quotedBlock=quotedHtmlInput
      ?"<div style=\"font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;color:#222;\">"+quotedHtmlInput+"</div>"
      :"";
    return fontImport+bodyHtml+sigBlock+quotedBlock;
  }

  // Pobiera obrazek z URL i konwertuje na base64 (dla embedowania jako CID)
  // Cache na poziomie window — jeden URL pobierany raz na sesję.
  function fetchImageAsBase64(url){
    if(!url)return Promise.reject(new Error("Brak URL"));
    if(!window._porterSigImgCache)window._porterSigImgCache={};
    var cache=window._porterSigImgCache;
    if(cache[url])return Promise.resolve(cache[url]);
    return fetch(url).then(function(r){
      if(!r.ok)throw new Error("Nie uda\u0142o si\u0119 pobra\u0107 obrazka podpisu");
      var contentType=r.headers.get("content-type")||"image/png";
      return r.blob().then(function(blob){
        return new Promise(function(resolve,reject){
          var reader=new FileReader();
          reader.onloadend=function(){
            // FileReader zwraca "data:image/png;base64,XXXX" — wycinamy tylko XXXX
            var dataUrl=reader.result;
            var base64=String(dataUrl).split(",")[1]||"";
            var result={base64:base64,contentType:contentType};
            cache[url]=result;
            resolve(result);
          };
          reader.onerror=function(){reject(new Error("B\u0142\u0105d odczytu obrazka"));};
          reader.readAsDataURL(blob);
        });
      });
    });
  }

  // Wyciąga plain-text preview z HTML — używane do listy w Sent (255 znaków)
  function htmlToPreview(html){
    if(!html)return "";
    var tmp=document.createElement("div");
    tmp.innerHTML=html;
    var txt=(tmp.innerText||tmp.textContent||"").replace(/\s+/g," ").trim();
    return txt.slice(0,255);
  }

  function handleSend(){
    if(!toEmail||!subject||bodyEmpty)return;
    setSending(true);
    setSendError(null);
    var toName=selClient?selClient.name:toEmail;
    var uploadFiles=attachments.filter(function(a){return a.type==="upload"&&a.file instanceof File;}).map(function(a){return a.file;});
    var sigImgUrl=(userSettings&&userSettings.signature_image_url)||"";
    var hasSigImg=!!sigImgUrl;
    // useCid=true tylko gdy faktycznie mamy obrazek do osadzenia
    var htmlBody=buildMailHtml(body, userSettings, hasSigImg, quotedHtml);

    function doSend(atts){
      // Odśwież token tuż przed wysyłką — może wygasnąć podczas pracy w app
      msalGetToken().then(function(freshToken){
        if(freshToken)setAccessToken(freshToken);
        var tok=freshToken||accessToken;
        var parseRecips=function(str){
          return String(str||"").split(/[,;]/).map(function(s){return s.trim();}).filter(Boolean)
            .map(function(addr){return {emailAddress:{address:addr}};});
        };
        // "Do" może zawierać kilka adresów oddzielonych przecinkiem/średnikiem — tak samo jak CC/BCC
        var toList=parseRecips(toEmail);
        if(toList.length===1&&toName)toList[0].emailAddress.name=toName;
        var msgPayload={
          subject:subject,
          body:{contentType:"HTML",content:htmlBody},
          toRecipients:toList
        };
        var ccList=parseRecips(ccEmail),bccList=parseRecips(bccEmail);
        if(ccList.length)msgPayload.ccRecipients=ccList;
        if(bccList.length)msgPayload.bccRecipients=bccList;
        if(atts&&atts.length>0)msgPayload.attachments=atts;
        fetch("https://graph.microsoft.com/v1.0/me/sendMail",{
          method:"POST",
          headers:{"Authorization":"Bearer "+tok,"Content-Type":"application/json"},
          body:JSON.stringify({message:msgPayload,saveToSentItems:true})
        })
        .then(function(r){
          if(!r.ok)return r.json().then(function(e){throw new Error(e.error&&e.error.message?e.error.message:"B\u0142\u0105d wysy\u0142ania ("+r.status+")");});
          var sentAtts=attachments.slice();
          var nm={id:"m_"+Date.now(),folder:"sent",to:toEmail,toName:toName,
            subject:subject,date:new Date().toISOString(),preview:htmlToPreview(body).slice(0,80)+"...",
            body:body+(quotedHtml||""),attachments:sentAtts,
            // localAttachments \u2014 pe\u0142ne metadane z kompozytora; Graph nie zwr\u00f3ci
            // za\u0142\u0105cznik\u00f3w dla sztucznego id "m_...", wi\u0119c renderujemy je lokalnie
            localAttachments:sentAtts,
            hasAttachments:sentAtts.length>0,
            isRead:true,isImportant:false,categories:[]};
          setAllMails(function(prev){return [nm].concat(prev);});
          // Po chwili od\u015bwie\u017c foldery \u2014 placeholder zostanie zast\u0105piony prawdziw\u0105
          // wiadomo\u015bci\u0105 z Sent Items (z klikalnymi, pobieralnymi za\u0142\u0105cznikami)
          setTimeout(function(){setRefreshKey(function(k){return k+1;});},6000);
          setSending(false); setJustSent(true);
          // Zapisz adres odbiorcy w historii (Supabase — działa cross-device)
          sbApi.upsertMailRecipient(toEmail, toName).catch(function(){});
          setTimeout(function(){setJustSent(false);},3000);
          setToEmail(""); setSubject(""); setBody(""); setQuotedHtml(""); setAttachments([]); setSelClientId(null);
          setCcEmail(""); setBccEmail("");
        })
        .catch(function(e){setSending(false);setSendError(e.message||"Nieznany b\u0142\u0105d");});
      }).catch(function(e){
        setSending(false);
        setSendError("Sesja wygas\u0142a — zaloguj si\u0119 ponownie ("+(e.message||"token expired")+")");
      });
    }

    // Buduj attachments równolegle: (1) pliki uploadowane przez użytkownika, (2) pliki szablonu, (3) obrazek podpisu CID
    var promises=[];
    // Uploaded files (type="upload") — bezpośrednio z File obiektu
    promises.push(Promise.all(uploadFiles.map(function(file){
      return file.arrayBuffer().then(function(ab){
        var bytes=new Uint8Array(ab),binary="";
        for(var i=0;i<bytes.byteLength;i++)binary+=String.fromCharCode(bytes[i]);
        return {"@odata.type":"#microsoft.graph.fileAttachment",name:file.name,contentType:file.type||"application/octet-stream",contentBytes:btoa(binary)};
      });
    })));
    // Template files (type="template") — pobieramy z Supabase Storage URL
    var templateFiles=attachments.filter(function(a){return a.type==="template"&&a.url;});
    if(templateFiles.length>0){
      promises.push(Promise.all(templateFiles.map(function(att){
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
        }).catch(function(e){
          console.error("Template file fetch error:",e);
          return null; // best-effort — nie blokuj wysyłki
        });
      })).then(function(atts){return atts.filter(Boolean);}));
    }
    // App PDFs (type="app") — wysyłane jako załącznik HTML (identyczny wygląd, wszystkie obrazki działają).
    // Odbiorca otwiera w przeglądarce → Ctrl+P → Zapisz jako PDF.
    // html2canvas/html2pdf nie działa po stronie klienta z obrazkami base64 poza viewport.
    var appItems=attachments.filter(function(a){return a.type==="app";});
    if(appItems.length>0&&selClient){
      var appPdfPromises=appItems.map(function(att){
        var html=null;
        if(att.id==="pdf_uproszczona")html=buildSimplifiedPDFHtml(selClient,0,0,null);
        else if(att.id==="pdf_oferta")html=buildOfferPDFHtml(selClient,0,0,"");
        if(!html)return Promise.resolve(null);
        var finalHtml=html.replace("</head>",
          "<style>@media print{@page{size:A4;margin:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>\n</head>"
        );
        var blob=new Blob([finalHtml],{type:"text/html;charset=utf-8"});
        return new Promise(function(resolve){
          var reader=new FileReader();
          reader.onloadend=function(){
            var b64=String(reader.result).split(",")[1]||"";
            resolve({"@odata.type":"#microsoft.graph.fileAttachment",
              name:att.name.replace(/\.pdf$/i,".html"),
              contentType:"text/html",
              contentBytes:b64});
          };
          reader.onerror=function(){resolve(null);};
          reader.readAsDataURL(blob);
        });
      });
      promises.push(Promise.all(appPdfPromises).then(function(atts){return atts.filter(Boolean);}));
    }
    // Inline signature image (CID)
    if(hasSigImg){
      promises.push(
        fetchImageAsBase64(sigImgUrl).then(function(img){
          return [{
            "@odata.type":"#microsoft.graph.fileAttachment",
            name:"signature.png",
            contentType:img.contentType,
            contentBytes:img.base64,
            isInline:true,
            contentId:"signature-image"
          }];
        }).catch(function(e){
          console.error("Nie uda\u0142o si\u0119 pobra\u0107 obrazka podpisu:",e);
          return [];
        })
      );
    }

    Promise.all(promises).then(function(results){
      // Spłaszcz wyniki — każda promise zwraca tablicę attachmentów
      var allAtts=[];
      results.forEach(function(arr){if(arr&&arr.length)allAtts=allAtts.concat(arr);});
      doSend(allAtts);
    }).catch(function(){doSend([]);});
  }

  function moveMailToFolder(mailId,token,targetFolder){
    var folderMap={"trash":"deletedItems","spam":"junkEmail","inbox":"inbox","sent":"sentItems"};
    var destId=folderMap[targetFolder]||targetFolder;
    return fetch("https://graph.microsoft.com/v1.0/me/messages/"+mailId+"/move",{
      method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({destinationId:destId})
    }).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
  }
  function deleteMailPermanent(mailId,token){
    return fetch("https://graph.microsoft.com/v1.0/me/messages/"+mailId,{
      method:"DELETE",headers:{"Authorization":"Bearer "+token}
    }).then(function(){return true;}).catch(function(){return false;});
  }
  function moveMail(mail,folderId){
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{folder:folderId}):m;});});
    setSelThread(null);
    if(accessToken&&mail.id&&mail.id.indexOf("m_")!==0) moveMailToFolder(mail.id,accessToken,folderId);
  }
  function trashMail(mail){
    if(!mail)return;
    if(mail.folder==="trash"){
      if(!window.confirm("Trwale usun\u0105\u0107 t\u0119 wiadomo\u015b\u0107? Tej operacji nie mo\u017cna cofn\u0105\u0107."))return;
      setAllMails(function(prev){return prev.filter(function(m){return m.id!==mail.id;});});
      setSelThread(null);
      if(accessToken&&mail.id&&mail.id.indexOf("m_")!==0) deleteMailPermanent(mail.id,accessToken);
    } else {
      setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{folder:"trash"}):m;});});
      setSelThread(null);
      if(accessToken&&mail.id&&mail.id.indexOf("m_")!==0) moveMailToFolder(mail.id,accessToken,"trash");
    }
  }
  function spamMail(mail){
    if(!mail)return;
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{folder:"spam"}):m;});});
    setSelThread(null);
    if(accessToken&&mail.id&&mail.id.indexOf("m_")!==0) moveMailToFolder(mail.id,accessToken,"spam");
  }
  function restoreMail(mail){
    if(!mail)return;
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{folder:"inbox"}):m;});});
    setSelThread(null);
    if(accessToken&&mail.id&&mail.id.indexOf("m_")!==0) moveMailToFolder(mail.id,accessToken,"inbox");
  }
  // Świeży token (odświeża wygasający) → callback(token)
  function withFreshToken(fn){
    return msalGetToken().then(function(tok){
      if(tok&&tok!==accessToken)setAccessToken(tok);
      return fn(tok||accessToken);
    });
  }
  var GRAPH_FOLDER={inbox:"inbox",sent:"sentItems",trash:"deletedItems",spam:"junkEmail"};
  var MAIL_SELECT="subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,categories,conversationId,isRead,importance";

  // Doładuj starsze wiadomości bieżącego folderu (podąża za @odata.nextLink)
  function loadMore(folder){
    var link=nextLinks[folder];
    if(!link||loadingMore)return;
    setLoadingMore(true);
    withFreshToken(function(tok){
      return fetch(link,{headers:{"Authorization":"Bearer "+tok}}).then(function(r){return r.ok?r.json():null;});
    }).then(function(data){
      if(!data){setLoadingMore(false);return;}
      var mapped=(data.value||[]).map(function(m){return mapGraphMsg(m,folder);});
      setAllMails(function(prev){
        var seen={};prev.forEach(function(m){seen[m.id]=true;});
        return prev.concat(mapped.filter(function(m){return !seen[m.id];}));
      });
      setNextLinks(function(prev){var n=Object.assign({},prev);n[folder]=data["@odata.nextLink"]||null;return n;});
      setLoadingMore(false);
    }).catch(function(){setLoadingMore(false);});
  }

  // Wyszukiwanie server-side (Graph $search): nadawca, adresat, temat I TREŚĆ w CAŁEJ historii folderu.
  // $search nie łączy się z $orderby → sortujemy wyniki po dacie po stronie klienta.
  function runSearch(folder,query){
    var q=(query||"").trim();
    if(!q){setSearchResults(null);setSearchNextLink(null);setSearchLoading(false);return;}
    var gf=GRAPH_FOLDER[folder]||"inbox";
    var url="https://graph.microsoft.com/v1.0/me/mailFolders/"+gf+"/messages"
      +"?$search="+encodeURIComponent('"'+q+'"')
      +"&$top=25&$select="+encodeURIComponent(MAIL_SELECT);
    setSearchLoading(true);
    withFreshToken(function(tok){
      return fetch(url,{headers:{"Authorization":"Bearer "+tok}}).then(function(r){return r.ok?r.json():null;});
    }).then(function(data){
      if(!data){setSearchResults([]);setSearchNextLink(null);setSearchLoading(false);return;}
      var mapped=(data.value||[]).map(function(m){return mapGraphMsg(m,folder);});
      mapped.sort(function(a,b){return new Date(b.date)-new Date(a.date);});
      setSearchResults(mapped);
      setSearchNextLink(data["@odata.nextLink"]||null);
      setSearchLoading(false);
    }).catch(function(){setSearchResults([]);setSearchNextLink(null);setSearchLoading(false);});
  }

  // Kolejna strona wyników wyszukiwania
  function loadMoreSearch(folder){
    if(!searchNextLink||searchLoading)return;
    setSearchLoading(true);var link=searchNextLink;
    withFreshToken(function(tok){
      return fetch(link,{headers:{"Authorization":"Bearer "+tok}}).then(function(r){return r.ok?r.json():null;});
    }).then(function(data){
      if(!data){setSearchLoading(false);return;}
      var mapped=(data.value||[]).map(function(m){return mapGraphMsg(m,folder);});
      setSearchResults(function(prev){
        var base=prev||[];var seen={};base.forEach(function(m){seen[m.id]=true;});
        var merged=base.concat(mapped.filter(function(m){return !seen[m.id];}));
        merged.sort(function(a,b){return new Date(b.date)-new Date(a.date);});
        return merged;
      });
      setSearchNextLink(data["@odata.nextLink"]||null);
      setSearchLoading(false);
    }).catch(function(){setSearchLoading(false);});
  }

  function markAsRead(mail,readVal){
    if(!mail||mail.id.indexOf("m_")===0)return;
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{isRead:readVal}):m;});});
    msalGetToken().then(function(tok){
      var token=tok||accessToken;
      if(!token)return;
      fetch("https://graph.microsoft.com/v1.0/me/messages/"+mail.id,{
        method:"PATCH",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({isRead:readVal})
      }).catch(function(e){console.warn("markAsRead PATCH failed",e);});
    }).catch(function(){});
  }
  function toggleImportant(mail){
    if(!mail||mail.id.indexOf("m_")===0)return;
    var newVal=!mail.isImportant;
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{isImportant:newVal}):m;});});
    if(selThread&&selThread.head&&selThread.head.id===mail.id){
      setSelThread(function(prev){if(!prev)return prev;var newHead=Object.assign({},prev.head,{isImportant:newVal});return Object.assign({},prev,{head:newHead,mails:prev.mails.map(function(m){return m.id===mail.id?Object.assign({},m,{isImportant:newVal}):m;})});});
    }
    msalGetToken().then(function(tok){
      var token=tok||accessToken;
      if(!token)return;
      fetch("https://graph.microsoft.com/v1.0/me/messages/"+mail.id,{
        method:"PATCH",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({importance:newVal?"high":"normal"})
      }).catch(function(e){console.warn("toggleImportant PATCH failed",e);});
    }).catch(function(){});
  }

  // Flaga = kategoria Outlooka. Kolor bierze si\u0119 z master category \u2014 tworzymy j\u0105
  // raz (jednorazowo na sesj\u0119), \u017ceby oznaczenie mia\u0142o w\u0142a\u015bciwy kolor tak\u017ce w Outlooku.
  function ensureMasterCategory(flag,token){
    if(!flag||!flag.category||!token)return Promise.resolve();
    if(!window._porterMailCats)window._porterMailCats={};
    if(window._porterMailCats[flag.category])return Promise.resolve();
    window._porterMailCats[flag.category]=true;
    return fetch("https://graph.microsoft.com/v1.0/me/outlook/masterCategories",{
      method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({displayName:flag.category,color:flag.preset||"preset8"})
    }).catch(function(){});   // 409 = kategoria ju\u017c istnieje \u2014 ignorujemy
  }
  function toggleFlag(mail,flag){
    if(!mail||!flag||mail.id.indexOf("m_")===0)return;
    var cur=(mail.categories||[]).slice();
    var idx=cur.indexOf(flag.category);
    if(idx>=0)cur.splice(idx,1); else cur.push(flag.category);
    var upd=function(m){return m.id===mail.id?Object.assign({},m,{categories:cur}):m;};
    setAllMails(function(prev){return prev.map(upd);});
    setSearchResults(function(prev){return prev?prev.map(upd):prev;});
    if(selThread&&selThread.mails&&selThread.mails.some(function(m){return m.id===mail.id;})){
      setSelThread(function(prev){
        if(!prev)return prev;
        return Object.assign({},prev,{head:upd(prev.head),mails:prev.mails.map(upd)});
      });
    }
    msalGetToken().then(function(tok){
      var token=tok||accessToken;
      if(!token)return;
      return Promise.resolve(ensureMasterCategory(flag,token)).then(function(){
        return fetch("https://graph.microsoft.com/v1.0/me/messages/"+mail.id,{
          method:"PATCH",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
          body:JSON.stringify({categories:cur})
        });
      });
    }).catch(function(e){console.warn("toggleFlag PATCH failed",e);});
  }

  if(!logged){
    return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",minHeight:300,gap:16,textAlign:"center"}},
      ce("div",{style:{width:64,height:64,borderRadius:16,background:"#0078d4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:4}},"\u2709\uFE0F"),
      ce("div",{style:{fontSize:17,fontWeight:700,color:"var(--t1)"}},"Modu\u0142 Mail"),
      ce("div",{style:{fontSize:13,color:"var(--t2)",maxWidth:300,lineHeight:1.7}},"Zaloguj si\u0119 kontem Microsoft, by wysy\u0142a\u0107 maile przez Outlooka i zapisywa\u0107 zdarzenia w kalendarzu."),
      ce("button",{
        disabled:logging,
        onClick:function(){
          setLogging(true);
          msalLogin()
            .then(function(result){setMsAccount(result.account);return msalGetToken();})
            .then(function(token){setAccessToken(token);setLogged(true);setLogging(false);})
            .catch(function(e){
              setLogging(false);
              console.error("MSAL login error",e);
              if(e.errorCode!=="user_cancelled"){alert("B\u0142\u0105d logowania: "+(e.message||e.errorCode||"nieznany b\u0142\u0105d"));}
            });
        },
        style:{display:"flex",alignItems:"center",gap:12,padding:"12px 24px",borderRadius:10,border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:logging?"wait":"pointer",fontSize:14,fontWeight:600,color:"var(--t1)",marginTop:8,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",opacity:logging?0.7:1}},
        logging
          ?ce("span",{style:{fontSize:16}},"\u23F3")
          :ce("svg",{width:20,height:20,viewBox:"0 0 21 21"},
            ce("rect",{x:1,y:1,width:9,height:9,fill:"#f25022"}),
            ce("rect",{x:11,y:1,width:9,height:9,fill:"#7fba00"}),
            ce("rect",{x:1,y:11,width:9,height:9,fill:"#00a4ef"}),
            ce("rect",{x:11,y:11,width:9,height:9,fill:"#ffb900"})
          ),
        logging?"Logowanie...":"Zaloguj si\u0119 przez Microsoft"
      ),
      ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Otworzy si\u0119 okno logowania Microsoft")
    );
  }

  var accountEmail=msAccount?(msAccount.username||"paulina@porterdesign.pl"):"paulina@porterdesign.pl";

  var composerPanel=ce("div",{style:{flex:1,display:"flex",flexDirection:"column",overflowY:"auto",gap:0}},
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:10}},
      ce("div",{style:LSML},"Nowa wiadomo\u015b\u0107"),
      ce("button",{onClick:handleSend,disabled:!toEmail||!subject||bodyEmpty||sending,
        style:Object.assign({},BPRIM,{padding:"8px 18px",fontSize:13,flexShrink:0,
          background:justSent?"#059669":sending?"var(--bd2)":"var(--t1)",
          transition:"background .3s",
          opacity:(!toEmail||!subject||bodyEmpty||sending)?0.6:1,
          cursor:(!toEmail||!subject||bodyEmpty||sending)?"default":"pointer"})},
        sending?"\u2026 Wysy\u0142anie":justSent?"\u2713 Wys\u0142ano!":"\uD83D\uDCEC Wy\u015blij"
      )
    ),
    sendError?ce("div",{style:{marginBottom:10,padding:"10px 12px",background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:9,fontSize:12,color:"var(--red)",display:"flex",alignItems:"center",gap:8}},ce("span",{style:{fontSize:16}},"\u26a0\ufe0f"),ce("span",{style:{flex:1}},sendError),ce("button",{onClick:function(){setSendError(null);},style:{border:"none",background:"none",cursor:"pointer",color:"var(--red)",fontSize:16}},"\u00d7")):null,
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Szablon"),
      ce("div",{style:{display:"flex",gap:5,flexWrap:"wrap"}},
        activeTemplates.map(function(tpl){
          var active=selTemplate===tpl.id;
          return ce("button",{key:tpl.id,onClick:function(){setSelTemplate(tpl.id);},
            style:{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:active?700:500,
              border:"1px solid "+(active?"var(--wbd)":"var(--bd2)"),
              background:active?"var(--wb)":"var(--bg2)",
              color:active?"var(--wt)":"var(--t2)",cursor:"pointer"}},
            tpl.icon+" "+tpl.label);
        })
      )
    ),
    ce("div",{style:{marginBottom:10,position:"relative"}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}},
        ce("label",{style:LSML},"Do:"),
        ce("button",{onClick:function(){setShowCcBcc(function(v){return !v;});},
          style:{border:"none",background:"none",cursor:"pointer",fontSize:11,fontWeight:600,color:"var(--violet)",padding:"2px 4px"}},
          showCcBcc?"\u2212 Ukryj CC/UDW":"+ CC / UDW")
      ),
      ce("input",{type:"email",value:toEmail,onChange:function(e){onToChange(e.target.value);},onBlur:function(){setTimeout(function(){setContactSug([]);},150);},placeholder:"adres@email.com",style:INP}),
      contactSug.length>0?ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:"var(--bg2)",backdropFilter:"blur(20px)",border:"1px solid var(--bd2)",borderRadius:10,zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",overflow:"hidden",marginTop:2,maxHeight:280,overflowY:"auto"}},
        contactSug.map(function(c){
          return ce("div",{key:c.email,onClick:function(){setToEmail(c.email);setContactSug([]);},
            style:{padding:"9px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:10,background:"transparent"}},
            ce(Avatar,{size:28,bg:"#c8a96a",label:initials(c.name)}),
            ce("div",null,
              ce("div",{style:{fontWeight:600,color:"var(--t1)",fontSize:13}},c.name),
              ce("div",{style:{color:"var(--t3)",fontSize:11}},c.email)
            )
          );
        })
      ):null
    ),
    (showCcBcc||ccEmail)?ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"CC (do wiadomo\u015bci):"),
      ce("input",{type:"text",value:ccEmail,onChange:function(e){setCcEmail(e.target.value);},placeholder:"adresy oddzielone przecinkiem",style:INP})
    ):null,
    (showCcBcc||bccEmail)?ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"UDW (ukryte):"),
      ce("input",{type:"text",value:bccEmail,onChange:function(e){setBccEmail(e.target.value);},placeholder:"adresy oddzielone przecinkiem",style:INP})
    ):null,
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Temat"),
      ce("input",{type:"text",value:subject,onChange:function(e){setSubject(e.target.value);},placeholder:"Temat wiadomo\u015bci",style:INP})
    ),
    ce(AttachmentsSection,{attachments:attachments,setAttachments:setAttachments,selClient:selClient,selTemplate:selTemplate,templates:activeTemplates}),
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",marginBottom:10}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}},
        ce("label",{style:LSML},"Tre\u015b\u0107"),
        ce("div",{style:{position:"relative"}},
          ce("button",{
            onClick:function(){setShowTplPicker(function(v){return !v;});},
            style:{padding:"3px 10px",fontSize:11,fontWeight:600,borderRadius:8,cursor:"pointer",
              border:"1px solid "+(showTplPicker?"var(--wbd)":"var(--bd2)"),
              background:showTplPicker?"var(--wb)":"var(--bg2)",
              color:showTplPicker?"var(--wt)":"var(--t2)",display:"flex",alignItems:"center",gap:4}
          },"\uD83D\uDCCB Wstaw szablon \u25BE"),
          showTplPicker?ce("div",{style:{
            position:"absolute",right:0,top:"100%",marginTop:4,zIndex:300,
            background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,
            boxShadow:"0 8px 24px rgba(0,0,0,0.13)",minWidth:190,overflow:"hidden"
          }},
            activeTemplates.map(function(tpl){
              return ce("div",{key:tpl.id,
                onClick:function(){applyTemplateToCompose(tpl);},
                style:{padding:"10px 14px",cursor:"pointer",fontSize:13,
                  borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:8,
                  color:"var(--t1)"}},
                ce("span",null,tpl.icon),
                ce("span",{style:{fontWeight:500}},tpl.label)
              );
            }),
            ce("div",{
              onClick:function(){setShowTplPicker(false);},
              style:{padding:"8px 14px",fontSize:12,color:"var(--t3)",cursor:"pointer",
                textAlign:"center"}
            },"Anuluj")
          ):null
        )
      ),
      ce(RichTextEditor,{value:body,onChange:setBody,minHeight:200,bg:"var(--bg)",placeholder:"Wpisz tre\u015b\u0107 wiadomo\u015bci\u2026"}),
      // Podpis — zawsze widoczny, bezpo\u015brednio pod tre\u015bci\u0105 aktualnie pisanej wiadomo\u015bci
      // (nie na ko\u0144cu cytowanego w\u0105tku, kt\u00f3ry renderuje si\u0119 osobno ni\u017cej). Doklejany
      // automatycznie przy wysy\u0142ce — patrz buildMailHtml.
      (userSettings&&(userSettings.signature_html||userSettings.signature_image_url))
        ?ce("div",{style:{marginTop:8,padding:"10px 12px",border:"1px dashed var(--bd2)",borderRadius:8,background:"var(--bg)"}},
          ce("div",{style:{fontSize:10,color:"var(--t3)",marginBottom:6,fontStyle:"italic"}},
            "\u2139\uFE0F Podpis (doklejany automatycznie) \u2014 zmie\u0144 go w ",
            ce("a",{href:"#",onClick:function(e){e.preventDefault();mailNavigate("settings");},
              style:{color:"var(--t2)",textDecoration:"underline"}},"Ustawieniach"),"."
          ),
          userSettings.signature_html?ce("div",{style:{fontSize:13,color:"var(--t1)",lineHeight:1.6},
            dangerouslySetInnerHTML:{__html:userSettings.signature_html}}):null,
          userSettings.signature_image_url?ce("img",{src:userSettings.signature_image_url,alt:"",
            style:{maxWidth:200,maxHeight:90,display:"block",marginTop:userSettings.signature_html?8:0}}):null
        )
        :ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:6,fontStyle:"italic"}},
          "\u2139\uFE0F Brak podpisu. Skonfiguruj go w ",
          ce("a",{href:"#",onClick:function(e){e.preventDefault();mailNavigate("settings");},
            style:{color:"var(--t2)",textDecoration:"underline"}},"Ustawieniach"),"."
        ),
      // Cytowany w\u0105tek (Odpowiedz / Przeka\u017c) — pod podpisem, edytowalny osobno,
      // \u017ceby podpis zawsze zosta\u0142 mi\u0119dzy w\u0142asn\u0105 tre\u015bci\u0105 a cytatem, nie po nim.
      quotedHtml
        ?ce("div",{style:{marginTop:14}},
          ce("div",{style:{fontSize:10,color:"var(--t3)",marginBottom:4,fontStyle:"italic"}},"Poprzednia wiadomo\u015b\u0107"),
          ce(RichTextEditor,{value:quotedHtml,onChange:setQuotedHtml,minHeight:120,bg:"var(--bg)"})
        )
        :null
    ),
    ce("div",{style:{display:"flex",gap:8,paddingTop:4,borderTop:"1px solid var(--bd2)"}},
      ce("button",{onClick:handleSaveDraft,disabled:!toEmail&&!subject&&bodyEmpty,style:Object.assign({},BGHOST,{opacity:(!toEmail&&!subject&&bodyEmpty)?0.4:1})},"\uD83D\uDCDD Zapisz roboczy"),
      ce("button",{onClick:handleSend,disabled:!toEmail||!subject||bodyEmpty||sending,
        style:Object.assign({},BPRIM,{flex:1,
          background:justSent?"#059669":sending?"var(--bd2)":"var(--t1)",
          transition:"background .3s",
          opacity:(!toEmail||!subject||bodyEmpty||sending)?0.6:1,
          cursor:(!toEmail||!subject||bodyEmpty||sending)?"default":"pointer"})},
        sending?"\u2026 Wysy\u0142anie":justSent?"\u2713 Wys\u0142ano!":"\uD83D\uDCEC Wy\u015blij przez Outlook"
      )
    )
  );

  var rightContent;
  if(activeFolder==="compose"){
    rightContent=composerPanel;
  } else if(activeFolder==="drafts"){
    rightContent=ce("div",{style:{height:"100%",overflowY:"auto"}},
      ce(DraftsView,{drafts:drafts,onOpen:openDraft,onDelete:function(id){setDrafts(function(prev){
  var next=prev.filter(function(x){return x.id!==id;});
  try{localStorage.setItem("pd_mail_drafts",JSON.stringify(next));}catch(e){}
  return next;
});}})
    );
  } else if(activeFolder==="templates"){
    rightContent=ce(TemplatesView,{
      templates:activeTemplates,
      onUseTemplate:function(tpl){
        setSelTemplate(tpl.id);
        mailNavigate("compose");
      },
      onTemplatesChange:function(mapped){
        setDbTemplates(mapped);
      }
    });
  } else if(activeFolder==="settings"){
    rightContent=ce(SettingsView,{
      userEmail:userEmail,
      userSettings:userSettings,
      onSaved:function(row){setUserSettings(row);},
      flags:mailFlags,
      onSaveFlags:saveMailFlags
    });
  } else {
    var folderMails=allMails.filter(function(m){return m.folder===activeFolder;});
    var loaderActive=loadingMails&&(activeFolder==="sent"||activeFolder==="inbox"||activeFolder==="trash"||activeFolder==="spam");
    rightContent=ce("div",{style:{display:"flex",height:"100%",minHeight:0}},
      ce("div",{style:{width:280,flexShrink:0,borderRight:"1px solid var(--bd2)",paddingRight:12,display:"flex",flexDirection:"column"}},
        loaderActive
          ?ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:8,color:"var(--t3)",fontSize:13}},"\u23F3 Wczytywanie\u2026")
          :ce(MailList,{key:activeFolder,mails:folderMails,folder:activeFolder,onSelect:function(t){
              mailNavigate(activeFolder,t);
              if(t&&t.mails){t.mails.forEach(function(mm){if(mm.isRead===false)markAsRead(mm,true);});}
            },onToggleImportant:function(m){toggleImportant(m);},selectedId:selThread&&selThread.head?selThread.head.id:null,
            onLoadMore:loadMore,hasMore:!!nextLinks[activeFolder],loadingMore:loadingMore,
            onSearch:runSearch,searchResults:searchResults,searchLoading:searchLoading,
            onLoadMoreSearch:loadMoreSearch,searchHasMore:!!searchNextLink,
            flags:mailFlags,onToggleFlag:toggleFlag})
      ),
      ce("div",{style:{flex:1,minWidth:0,overflow:"hidden"}},
        ce(MailPreview,{thread:selThread,accessToken:accessToken,onTokenRefresh:function(tok){setAccessToken(tok);},onCalendar:function(){if(selThread&&selThread.head)setCalMail(selThread.head);},
          flags:mailFlags,onToggleFlag:toggleFlag,
          onReply:function(head,bodyCache){
            setToEmail(head.from||"");
            var subj=head.subject||"";
            setSubject(subj.startsWith("Re:")?subj:"Re: "+subj);
            var cachedBody=bodyCache&&bodyCache[head.id];
            var quoteHtml=cachedBody&&cachedBody.isHtml
              ?cachedBody.content
              :cachedBody&&cachedBody.content
                ?"<pre style=\"font-family:inherit;white-space:pre-wrap;margin:0\">"+String(cachedBody.content).replace(/</g,"&lt;")+"</pre>"
                :"<em style=\"color:#999\">"+(head.preview||"")+"</em>";
            var quoted="<br><br><blockquote style=\"border-left:3px solid #ccc;padding-left:14px;color:#555;margin:8px 0;font-size:13px\">"
              +"<div style=\"font-size:11px;color:#999;margin-bottom:8px;font-style:italic\">W dniu "
              +new Date(head.date||"").toLocaleDateString("pl-PL")+" "+(head.fromName||head.from)+" napisa\u0142(a):</div>"
              +quoteHtml+"</blockquote>";
            setBody("");
            setQuotedHtml(quoted);
            setAttachments([]);
            mailNavigate("compose");
          },
          onReplyAll:function(head,bodyCache,toRecipients,ccRecipients){
            var own=msAccount&&(msAccount.username||msAccount.email)||"";
            var dedupe=function(list,exclude){
              var seen={};
              return (list||[]).filter(function(r){
                if(!r.email)return false;
                var k=r.email.toLowerCase();
                if(k===own.toLowerCase())return false;
                if(seen[k])return false;
                if(exclude&&exclude[k])return false;
                seen[k]=true;
                return true;
              });
            };
            var toRecs=dedupe(toRecipients);
            var toKeys={};toRecs.forEach(function(r){toKeys[r.email.toLowerCase()]=true;});
            var ccRecs=dedupe(ccRecipients,toKeys);
            setToEmail(toRecs.length?toRecs.map(function(r){return r.email;}).join(", "):(head.from||""));
            setCcEmail(ccRecs.length?ccRecs.map(function(r){return r.email;}).join(", "):"");
            setShowCcBcc(ccRecs.length>0);
            var subj=head.subject||"";
            setSubject(subj.startsWith("Re:")?subj:"Re: "+subj);
            var cachedBody=bodyCache&&bodyCache[head.id];
            var quoteHtml=cachedBody&&cachedBody.isHtml?cachedBody.content:cachedBody&&cachedBody.content?"<pre style=\"font-family:inherit;white-space:pre-wrap;margin:0\">"+String(cachedBody.content).replace(/</g,"&lt;")+"</pre>":"<em style=\"color:#999\">"+(head.preview||"")+"</em>";
            var quoted="<br><br><blockquote style=\"border-left:3px solid #ccc;padding-left:14px;color:#555;margin:8px 0;font-size:13px\">"
              +"<div style=\"font-size:11px;color:#999;margin-bottom:8px;font-style:italic\">W dniu "+new Date(head.date||"").toLocaleDateString("pl-PL")+" "+(head.fromName||head.from)+" napisa\u0142(a):</div>"
              +quoteHtml+"</blockquote>";
            setBody("");
            setQuotedHtml(quoted);
            setAttachments([]);
            mailNavigate("compose");
          },
          onForward:function(head,bodyCache){
            setToEmail("");
            var subj=head.subject||"";
            setSubject(subj.startsWith("Fwd:")?subj:"Fwd: "+subj);
            var cachedBody=bodyCache&&bodyCache[head.id];
            var quoteHtml=cachedBody&&cachedBody.isHtml?cachedBody.content:cachedBody&&cachedBody.content?"<pre style=\"font-family:inherit;white-space:pre-wrap;margin:0\">"+String(cachedBody.content).replace(/</g,"&lt;")+"</pre>":"<em style=\"color:#999\">"+(head.preview||"")+"</em>";
            var fwdBlock="<br><br><hr style=\"border:none;border-top:1px solid #ddd;margin:8px 0\"><div style=\"font-size:11px;color:#999;margin-bottom:8px;font-style:italic\">"
              +"Od: "+(head.fromName||head.from)+" &lt;"+(head.from||"")+"&gt;<br>"
              +"Data: "+new Date(head.date||"").toLocaleString("pl-PL")+"<br>"
              +"Temat: "+subj+"</div>"
              +quoteHtml;
            setBody("");
            setQuotedHtml(fwdBlock);
            setAttachments([]);
            mailNavigate("compose");
          },
          onMarkRead:function(mail,val){markAsRead(mail,val);},
          onToggleImportant:function(mail){toggleImportant(mail);},
          customFolders:userFolders,onMove:moveMail,onTrash:function(m){trashMail(m);},onSpam:function(m){spamMail(m);},onRestore:function(m){restoreMail(m);},activeFolder:activeFolder})
      )
    );
  }

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%",background:"var(--bg2)",borderRadius:16,padding:16,border:"1px solid var(--bd2)",boxSizing:"border-box"}},
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",background:"var(--bg2)",borderRadius:10,marginBottom:12,border:"1px solid var(--bd2)",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:8}},
        ce("div",{style:{width:8,height:8,borderRadius:"50%",background:"#10b981",flexShrink:0,boxShadow:"0 0 0 2px rgba(16,185,129,0.2)"}}),
        ce("span",{style:{fontSize:12,color:"var(--t2)"}},"Zalogowano jako\u00a0",ce("strong",{style:{color:"var(--t1)"}},accountEmail))
      ),
      ce("button",{onClick:function(){setRefreshKey(function(k){return k+1;});},disabled:loadingMails,style:{fontSize:11,color:"var(--t3)",border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:loadingMails?"default":"pointer",padding:"4px 10px",borderRadius:6,opacity:loadingMails?0.5:1}},loadingMails?"⏳":"🔄 Odśwież"),
      ce("button",{onClick:function(){msalLogout().catch(function(){}).finally(function(){setLogged(false);setAccessToken(null);setMsAccount(null);setAllMails([]);});},style:{fontSize:11,color:"var(--t3)",border:"none",background:"none",cursor:"pointer",padding:"4px 8px",borderRadius:6}},"Wyloguj")
    ),

    calSaved?ce("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--grl)",borderRadius:10,marginBottom:10,flexShrink:0,border:"1px solid var(--gr)",fontSize:13,color:"var(--gr)"}},
      ce("span",{style:{fontSize:18}},"\uD83D\uDCC5"),
      ce("div",null,"Dodano do kalendarza: ",ce("strong",null,calSaved.summary)),
      ce("button",{onClick:function(){setCalSaved(null);},style:{marginLeft:"auto",border:"none",background:"var(--grl)",borderRadius:6,cursor:"pointer",color:"var(--gr)",fontSize:16,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center"}},"\u00d7")
    ):null,

    ce("div",{style:{display:"flex",flex:1,minHeight:0}},
      ce("div",{style:{width:186,flexShrink:0,display:"flex",flexDirection:"column",borderRight:"1px solid var(--bd2)",paddingRight:8,marginRight:14,overflowY:"auto"}},
        SYSTEM_FOLDERS.map(function(f){
          var active=activeFolder===f.id;
          var badge=f.id==="drafts"&&drafts.length>0?drafts.length:null;
          var unreadCnt=0;
          if(f.id==="inbox"){var _convs={};allMails.forEach(function(m){if(m.folder!=="inbox"||m.isRead!==false)return;var k=m.conversationId||("solo_"+m.id);_convs[k]=true;});unreadCnt=Object.keys(_convs).length;}
          return ce("button",{key:f.id,onClick:function(){mailNavigate(f.id);},
            style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:9,border:"none",
              background:active?"var(--wb)":"transparent",color:active?"var(--wt)":"var(--t2)",
              fontSize:13,fontWeight:(active||unreadCnt>0)?700:500,cursor:"pointer",
              display:"flex",alignItems:"center",gap:8,marginBottom:1,
              borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
            ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
            ce("span",{style:{flex:1}},f.label),
            unreadCnt>0?ce("span",{style:{background:"var(--violet)",color:"var(--bg)",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:16,textAlign:"center"}},unreadCnt):null,
            badge?ce("span",{style:{background:"var(--wbd)",color:"var(--wt)",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px"}},badge):null
          );
        }),
        userFolders.length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",marginTop:8,paddingTop:8}},
          ce("div",{style:Object.assign({},LSML,{padding:"0 8px",marginBottom:6})},"Moje foldery"),
          userFolders.map(function(f){
            var active=activeFolder===f.id;
            var cnt=allMails.filter(function(m){return m.folder===f.id;}).length;
            return ce("button",{key:f.id,onClick:function(){mailNavigate(f.id);},
              style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:9,border:"none",
                background:active?"var(--wb)":"transparent",color:active?"var(--wt)":"var(--t2)",
                fontSize:13,fontWeight:active?700:500,cursor:"pointer",
                display:"flex",alignItems:"center",gap:8,marginBottom:1,
                borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
              ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
              ce("span",{style:{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.label),
              cnt>0?ce("span",{style:{fontSize:10,color:"var(--t3)"}},cnt):null
            );
          })
        ):null,
        ce("button",{onClick:function(){setShowNF(true);},style:{marginTop:userFolders.length>0?4:12,width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:9,border:"1px dashed var(--bd2)",background:"transparent",color:"var(--t3)",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6}},"\u002B Nowy folder")
      ),
      ce("div",{style:{flex:1,minWidth:0,height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}},rightContent)
    ),

    calMail&&!calSaved?ce(ModalCalendar,{mail:calMail,onClose:function(){setCalMail(null);},onSave:function(evt){setCalSaved(evt);setCalMail(null);}}):null,
    showNF?ce(ModalNewFolder,{onClose:function(){setShowNF(false);},onSave:function(f){setUserFolders(function(prev){return prev.concat([f]);});setShowNF(false);mailNavigate(f.id);}}):null
  );
}
