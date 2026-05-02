import React, { useState, useRef, useEffect } from 'react';
import { roundTo10 } from '../constants/data.js';
import { msalLogin, msalGetToken, msalLogout, msalGetActiveAccount } from '../msal.js';
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

export function fmtMailDate(iso){
  if(!iso)return "";
  var d=new Date(iso),t=new Date();
  if(d.toDateString()===t.toDateString())return d.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit"});
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
  color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",
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
    ce("div",{style:{background:"var(--bg1)",borderRadius:16,padding:28,width:"100%",maxWidth:420,
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
    ce("div",{style:{background:"var(--bg1)",borderRadius:16,padding:28,width:"100%",maxWidth:360,
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
  var tpl=MAIL_TEMPLATES.find(function(t){return t.id===p.selTemplate;})||MAIL_TEMPLATES[0];
  var suggested=tpl.suggestAttachments||[];

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
          ce("span",{style:{fontSize:13}},att.type==="app"?"\uD83D\uDCC4":"\uD83D\uDCCE"),
          ce("span",{style:{color:"var(--t1)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},att.name),
          att.size
            ?ce("span",{style:{color:"var(--t3)",fontSize:10}},fmtBytes(att.size))
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
          showPicker?ce("div",{style:{position:"absolute",bottom:"calc(100% + 6px)",left:0,
            background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:12,
            boxShadow:"0 8px 30px rgba(0,0,0,0.18)",zIndex:300,minWidth:240,overflow:"hidden"}},
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
  var isInbox=p.folder==="inbox";

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
  if(p.mails&&p.mails.length){
    var byConv={};
    p.mails.forEach(function(m){
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
    if(!filter)return true;
    var q=filter.toLowerCase();
    // Pasuje jeśli którakolwiek wiadomość w wątku pasuje
    return t.mails.some(function(m){return searchableText(m).indexOf(q)>=0;});
  });

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{paddingBottom:10,flexShrink:0}},
      ce("div",{style:{position:"relative"}},
        ce("span",{style:{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"var(--t3)",pointerEvents:"none"}},"\uD83D\uDD0D"),
        ce("input",{type:"text",value:filter,onChange:function(e){setFilter(e.target.value);},
          placeholder:"Szukaj...",style:Object.assign({},INP,{paddingLeft:32,fontSize:12})})
      )
    ),
    ce("div",{style:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}},
      filtered.length===0
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
          return ce("div",{key:t.key,onClick:function(){p.onSelect(t);},
            style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",
              background:selectedInThread?"var(--wb)":"transparent",
              border:"1px solid "+(selectedInThread?"var(--wbd)":"transparent"),
              transition:"all .12s",display:"flex",gap:10,alignItems:"flex-start"}},
            ce(Avatar,{size:34,bg:selectedInThread?colors[ci]:colors[ci]+"99",label:initials(nm)}),
            ce("div",{style:{flex:1,minWidth:0}},
              ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}},
                ce("span",{style:{fontSize:13,fontWeight:(selectedInThread||unread)?700:600,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"68%"}},
                  nm,
                  t.count>1?ce("span",{style:{fontSize:11,color:"var(--t3)",fontWeight:500,marginLeft:6}},"("+t.count+")"):null
                ),
                ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},fmtMailDate(m.date))
              ),
              ce("div",{style:{fontSize:12,color:selectedInThread?"var(--wt)":"var(--t2)",fontWeight:unread?700:600,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.subject),
              ce("div",{style:{fontSize:11,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview),
              (m.attachments&&m.attachments.length>0)?ce("div",{style:{fontSize:10,color:"var(--t3)",marginTop:4}},
                "\uD83D\uDCCE ",m.attachments.length," za\u0142."
              ):null
            )
          );
        })
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
  // <br> i </p> → newline; reszta tekstu po prostu
  tmp.querySelectorAll("br").forEach(function(br){br.replaceWith("\n");});
  tmp.querySelectorAll("p,div").forEach(function(p){p.append("\n");});
  return (tmp.innerText||tmp.textContent||"").trim();
}

function MailPreview(p){
  var thread=p.thread; // {key, head, mails:[...]} albo null
  var us=React.useState, ue=React.useEffect;
  var sm=us(false),showMove=sm[0],setShowMove=sm[1];
  // Cache body per messageId — żeby przy ponownym kliknięciu nie pobierać znowu
  var sb=us({}),bodies=sb[0],setBodies=sb[1];
  var sl=us({}),loadingBody=sl[0],setLoadingBody=sl[1];
  // Zwinięte/rozwinięte wiadomości w wątku — domyślnie tylko najnowsza rozwinięta
  var se=us({}),expanded=se[0],setExpanded=se[1];

  // Pomocnicza funkcja — pobiera body wiadomości on-demand
  function fetchBody(mid){
    if(!p.accessToken||!mid)return;
    if(bodies[mid]||loadingBody[mid])return;
    setLoadingBody(function(prev){var n=Object.assign({},prev);n[mid]=true;return n;});
    fetch("https://graph.microsoft.com/v1.0/me/messages/"+mid+"?$select=body",{
      headers:{"Authorization":"Bearer "+p.accessToken}
    })
    .then(function(r){return r.ok?r.json():null;})
    .then(function(data){
      var content="";
      if(data&&data.body){
        if(data.body.contentType&&data.body.contentType.toLowerCase()==="html"){
          content=htmlToText(data.body.content||"");
        } else {
          content=data.body.content||"";
        }
      }
      setBodies(function(prev){var n=Object.assign({},prev);n[mid]=content||"(pusta tre\u015b\u0107)";return n;});
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
      // Body pobieramy tylko dla wiadomości z Inboxu (Sent ma już cały body=preview)
      if(head.folder==="inbox"&&!head.body)fetchBody(head.id);
    }
  // eslint-disable-next-line
  },[thread?thread.key:null]);

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
      // Przy rozwijaniu pobierz body jeśli to inbox i jeszcze nie ma
      var msg=mails.find(function(x){return x.id===mid;});
      if(msg&&msg.folder==="inbox"&&!msg.body&&!bodies[mid])fetchBody(mid);
    }
  }

  // Header wątku — bierze nazwę z najnowszej wiadomości
  var headPerson=displayPerson(head);

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{padding:"16px 20px 14px",borderBottom:"1px solid var(--bd2)",flexShrink:0}},
      ce("div",{style:{fontWeight:700,fontSize:16,color:"var(--t1)",marginBottom:10,lineHeight:1.3,display:"flex",alignItems:"center",gap:8}},
        head.subject,
        mails.length>1?ce("span",{style:{fontSize:11,color:"var(--t3)",fontWeight:500,padding:"2px 8px",borderRadius:10,background:"var(--bg3)"}},mails.length+" wiadomo\u015bci"):null
      ),
      ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        ce("button",{onClick:p.onCalendar,style:BGHOST},"\uD83D\uDCC5 Dodaj do kalendarza"),
        ce("div",{style:{position:"relative"}},
          ce("button",{onClick:function(){setShowMove(function(v){return !v;});},style:BGHOST},"\uD83D\uDCC1 Przenie\u015b \u25be"),
          showMove?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:300,minWidth:190,overflow:"hidden"}},
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
        var hasBody=!!(m.body||bodies[m.id]);
        var bodyText=m.body||bodies[m.id]||"";
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
              !isExp?ce("div",{style:{fontSize:12,color:"var(--t2)",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview):null
            )
          ),
          isExp?ce("div",{style:{padding:"4px 20px 18px",fontSize:13,color:"var(--t1)",lineHeight:1.85,whiteSpace:"pre-wrap",fontFamily:"inherit"}},
            (m.attachments&&m.attachments.length>0)?ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}},
              m.attachments.map(function(att,j){
                return ce("div",{key:(att.id||att.name||"")+j,style:{display:"flex",alignItems:"center",gap:6,padding:"5px 12px 5px 8px",borderRadius:20,background:"var(--bg3)",border:"1px solid var(--bd2)",fontSize:12}},
                  ce("span",null,att.type==="app"?"\uD83D\uDCC4":"\uD83D\uDCCE"),
                  ce("span",{style:{color:"var(--t1)"}},att.name||"Za\u0142\u0105cznik"),
                  att.size?ce("span",{style:{color:"var(--t3)",fontSize:10,marginLeft:2}},fmtBytes(att.size)):null
                );
              })
            ):null,
            loading
              ?ce("div",{style:{color:"var(--t3)",fontStyle:"italic"}},"\u23F3 Wczytywanie tre\u015bci\u2026")
              :hasBody?bodyText:ce("span",{style:{color:"var(--t3)",fontStyle:"italic"}},m.preview||"(brak tre\u015bci)")
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
    }).then(function(rows){
      setSaving(false);
      setMsg({type:"ok",text:"Zapisano \u2713"});
      if(p.onSaved&&rows&&rows[0])p.onSaved(rows[0]);
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
          "Tekst dopisywany automatycznie pod ka\u017cd\u0105 wysy\u0142an\u0105 wiadomo\u015bci\u0105. Mo\u017cesz u\u017cy\u0107 prostego HTML (np. ",
          ce("code",{style:{fontSize:11}},"<b>tekst</b>"),", ",ce("code",{style:{fontSize:11}},"<a href=\"...\">link</a>"),
          ")."
        ),
        ce("textarea",{value:sigHtml,onChange:function(e){setSigHtml(e.target.value);},
          placeholder:"Pozdrawiam\nPaulina Porter\nPorter Design\ntel. 600 000 000",
          style:Object.assign({},INP,{minHeight:120,fontFamily:"monospace",fontSize:12,resize:"vertical"})})
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
              ce("button",{onClick:onRemoveImage,style:Object.assign({},BGHOST,{color:"#b91c1c"})},"Usu\u0144 obrazek")
            )
          )
          :ce("button",{onClick:onPickFile,disabled:uploading,style:BGHOST},
            uploading?"\u23F3 Wgrywam\u2026":"\uD83D\uDCCE Wgraj obrazek"
          )
      ),

      // ── Sekcja: Podgląd ────────────────────────────────────────────────
      ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:16,marginBottom:16}},
        ce("h3",{style:{fontSize:14,fontWeight:700,color:"var(--t1)",marginBottom:10}},"Podgl\u0105d podpisu"),
        ce("div",{style:{padding:14,background:"#fff",borderRadius:8,border:"1px solid var(--bd2)",fontSize:13,color:"#333",fontFamily:"Arial, sans-serif"}},
          (sigHtml||sigImg)
            ?ce("div",null,
              sigHtml?ce("div",{style:{whiteSpace:"pre-wrap",marginBottom:sigImg?10:0},
                dangerouslySetInnerHTML:{__html:sigHtml}}):null,
              sigImg?ce("img",{src:sigImg,alt:"",style:{maxWidth:200,maxHeight:120,display:"block"}}):null
            )
            :ce("div",{style:{color:"#999",fontStyle:"italic"}},"(podpis pusty)")
        )
      ),

      // ── Komunikaty ─────────────────────────────────────────────────────
      msg?ce("div",{style:{marginBottom:12,padding:"10px 14px",borderRadius:8,fontSize:13,
        background:msg.type==="ok"?"#dcfce7":"#fee2e2",
        color:msg.type==="ok"?"#166534":"#991b1b",
        border:"1px solid "+(msg.type==="ok"?"#86efac":"#fca5a5")}},msg.text):null,

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
  var us=React.useState;
  var ss=us(null),selId=ss[0],setSelId=ss[1];
  var sel=p.templates.find(function(t){return t.id===selId;})||null;
  return ce("div",{style:{display:"flex",height:"100%"}},
    ce("div",{style:{width:160,borderRight:"1px solid var(--bd2)",display:"flex",flexDirection:"column",overflowY:"auto"}},
      p.templates.map(function(tpl){
        var active=selId===tpl.id;
        return ce("div",{key:tpl.id,onClick:function(){setSelId(tpl.id);},
          style:{padding:"12px 14px",cursor:"pointer",borderBottom:"1px solid var(--bd3)",
            background:active?"var(--wb)":"transparent",
            borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
          ce("div",{style:{fontSize:18,marginBottom:4}},tpl.icon),
          ce("div",{style:{fontSize:13,fontWeight:active?700:500,color:"var(--t1)"}},tpl.label)
        );
      })
    ),
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",padding:"16px 20px",gap:12,minWidth:0}},
      sel?ce(React.Fragment,null,
        ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},sel.icon+" "+sel.label),
        ce("div",{style:{fontSize:12,color:"var(--t3)",padding:"6px 10px",background:"var(--bg3)",borderRadius:8}},"Temat: "+sel.subject),
        ce("div",{style:{flex:1,padding:14,background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd2)",fontSize:13,color:"var(--t1)",lineHeight:1.8,whiteSpace:"pre-wrap",overflowY:"auto"}},sel.body||ce("em",{style:{color:"var(--t3)"}},"(pusty szablon)")),
        ce("button",{onClick:function(){p.onUseTemplate(sel);},style:Object.assign({},BPRIM,{alignSelf:"flex-start"})},"\u270F\uFE0F U\u017cyj")
      ):ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:8,color:"var(--t3)"}},
        ce("div",{style:{fontSize:36,opacity:0.2}},"\uD83D\uDCCB"),
        ce("div",{style:{fontSize:13}},"Wybierz szablon")
      )
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
  var ssel=us(null),selThread=ssel[0],setSelThread=ssel[1];
  var sdr=us([]),drafts=sdr[0],setDrafts=sdr[1];
  var sc=us(null),selClientId=sc[0],setSelClientId=sc[1];
  var st=us("oferta"),selTemplate=st[0],setSelTemplate=st[1];
  var sto=us(""),toEmail=sto[0],setToEmail=sto[1];
  var ssub=us(""),subject=ssub[0],setSubject=ssub[1];
  var sbod=us(""),body=sbod[0],setBody=sbod[1];
  var satt=us([]),attachments=satt[0],setAttachments=satt[1];
  var scon=us([]),contactSug=scon[0],setContactSug=scon[1];
  var ssent=us(false),justSent=ssent[0],setJustSent=ssent[1];
  var ssending=us(false),sending=ssending[0],setSending=ssending[1];
  var scal=us(null),calMail=scal[0],setCalMail=scal[1];
  var scalok=us(null),calSaved=scalok[0],setCalSaved=scalok[1];
  var serr=us(null),sendError=serr[0],setSendError=serr[1];
  // Per-user ustawienia z Supabase (podpis, obrazek). null = nie załadowane jeszcze
  var sset=us(null),userSettings=sset[0],setUserSettings=sset[1];

  var selClient=clients.find(function(c){return String(c.id)===String(selClientId);})||null;
  var userEmail=msAccount&&(msAccount.username||msAccount.email)||"";

  // Sprawdź czy user wraca z redirect MS lub ma aktywną sesję
  ue(function(){
    msalGetActiveAccount().then(function(acc){
      if(acc){
        setMsAccount(acc);
        return msalGetToken().then(function(token){
          if(token){
            setAccessToken(token);
            setLogged(true);
          }
        });
      }
    }).catch(function(e){console.error("MSAL session check error",e);});
  },[]);

  // Załaduj ustawienia użytkownika (podpis itp.) po zalogowaniu MS
  ue(function(){
    if(!userEmail)return;
    sbApi.getUserSettings(userEmail).then(function(row){
      // Jeśli brak rekordu — ustawiamy pusty obiekt żeby UI działał (Paulina sama zapisze)
      setUserSettings(row||{user_email:userEmail,signature_html:"",signature_image_url:""});
    }).catch(function(e){
      console.error("getUserSettings error",e);
      setUserSettings({user_email:userEmail,signature_html:"",signature_image_url:""});
    });
  },[userEmail]);

  ue(function(){
    if(!accessToken)return;
    setLoadingMails(true);

    var inboxUrl="https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$select=subject,from,toRecipients,receivedDateTime,bodyPreview,hasAttachments,conversationId,isRead&$orderby=receivedDateTime desc";
    var sentUrl="https://graph.microsoft.com/v1.0/me/mailFolders/sentItems/messages?$top=50&$select=subject,toRecipients,sentDateTime,bodyPreview,hasAttachments,conversationId&$orderby=sentDateTime desc";

    function fetchJson(url){
      return fetch(url,{headers:{"Authorization":"Bearer "+accessToken}})
        .then(function(r){return r.ok?r.json():{value:[]};})
        .catch(function(){return {value:[]};});
    }

    Promise.all([fetchJson(inboxUrl),fetchJson(sentUrl)]).then(function(results){
      var inboxData=results[0],sentData=results[1];
      var inboxMails=(inboxData.value||[]).map(function(m){
        var fromAddr=(m.from&&m.from.emailAddress)||{};
        return {
          id:m.id,folder:"inbox",
          from:fromAddr.address||"",fromName:fromAddr.name||fromAddr.address||"",
          to:"",toName:"",
          subject:m.subject||"",
          date:m.receivedDateTime||new Date().toISOString(),
          preview:m.bodyPreview||"",body:null, // body dociągamy on-demand
          attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],
          conversationId:m.conversationId||null,
          isRead:m.isRead!==false
        };
      });
      var sentMails=(sentData.value||[]).map(function(m){
        var rec=(m.toRecipients&&m.toRecipients[0]&&m.toRecipients[0].emailAddress)||{};
        return {
          id:m.id,folder:"sent",
          from:"",fromName:"",
          to:rec.address||"",toName:rec.name||rec.address||"",
          subject:m.subject||"",
          date:m.sentDateTime||new Date().toISOString(),
          preview:m.bodyPreview||"",body:m.bodyPreview||"",
          attachments:m.hasAttachments?[{name:"Za\u0142\u0105czniki"}]:[],
          conversationId:m.conversationId||null,
          isRead:true
        };
      });
      setAllMails(inboxMails.concat(sentMails));
      setLoadingMails(false);
    });
  },[accessToken]);

  ue(function(){
    var tpl=MAIL_TEMPLATES.find(function(t){return t.id===selTemplate;})||MAIL_TEMPLATES[0];
    var filled=fillTemplate(tpl,selClient);
    setSubject(filled.subject); setBody(filled.body);
    if(selClient&&selClient.email)setToEmail(selClient.email);
    if(selClient&&tpl.suggestAttachments&&tpl.suggestAttachments.length>0){
      setAttachments(tpl.suggestAttachments.map(function(sid){
        var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
        return opt?{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}:null;
      }).filter(Boolean));
    } else {setAttachments([]);}
  },[selClientId,selTemplate]);

  function onToChange(val){
    setToEmail(val);
    if(val.length<2){setContactSug([]);return;}
    var q=val.toLowerCase();
    var fc=clients.filter(function(c){return c.email&&((c.name||"").toLowerCase().includes(q)||c.email.toLowerCase().includes(q));}).map(function(c){return {email:c.email,name:c.name};});
    var merged=fc.reduce(function(acc,c){if(!acc.find(function(x){return x.email===c.email;}))acc.push(c);return acc;},[]).slice(0,5);
    setContactSug(merged);
  }

  function handleSaveDraft(){
    if(!toEmail&&!subject&&!body)return;
    var d={id:"d_"+Date.now(),to:toEmail,subject:subject,body:body,attachments:attachments.slice(),savedAt:new Date().toISOString()};
    setDrafts(function(prev){return [d].concat(prev);});
    setToEmail(""); setSubject(""); setBody(""); setAttachments([]); setSelClientId(null);
  }

  function openDraft(d){
    setToEmail(d.to||""); setSubject(d.subject||""); setBody(d.body||"");
    setAttachments(d.attachments||[]);
    setDrafts(function(prev){return prev.filter(function(x){return x.id!==d.id;});});
    setActiveFolder("compose");
  }

  // Eskejpuje znaki specjalne HTML, żeby tekst wpisany przez użytkownika
  // (plain text) nie był interpretowany jako HTML przy wysyłce.
  function escapeHtml(s){
    return String(s||"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;");
  }

  // Składa pełny HTML body wiadomości — treść użytkownika + podpis (tekst + obrazek)
  // Treść body w obecnej wersji to plain text (zostanie zamienione na bogaty edytor w Kroku 3B).
  // Konwersja: \n → <br>, escape HTML.
  function buildMailHtml(plainBody, settings){
    var bodyHtml="<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;\">"
      +escapeHtml(plainBody).replace(/\n/g,"<br>")
      +"</div>";
    var sig=settings||{};
    var sigHtml=sig.signature_html||"";
    var sigImg=sig.signature_image_url||"";
    if(!sigHtml&&!sigImg)return bodyHtml;
    var sigBlock="<br><br><div style=\"font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#444;\">";
    if(sigHtml){
      // signature_html jest zapisywany przez Paulinę z sekcji Ustawienia.
      // Zachowujemy \n jako <br>, ale nie escapujemy HTML — Paulina może użyć <b>, <a> itp.
      sigBlock+=String(sigHtml).replace(/\n/g,"<br>");
    }
    if(sigImg){
      if(sigHtml)sigBlock+="<br>";
      sigBlock+="<img src=\""+sigImg+"\" alt=\"\" style=\"max-width:300px;height:auto;display:block;margin-top:8px;\">";
    }
    sigBlock+="</div>";
    return bodyHtml+sigBlock;
  }

  function handleSend(){
    if(!toEmail||!subject||!body)return;
    setSending(true);
    setSendError(null);
    var toName=selClient?selClient.name:toEmail;
    var uploadFiles=attachments.filter(function(a){return a.type==="upload"&&a.file;}).map(function(a){return a.file;});
    var htmlBody=buildMailHtml(body, userSettings);
    function doSend(atts){
      var msgPayload={
        subject:subject,
        body:{contentType:"HTML",content:htmlBody},
        toRecipients:[{emailAddress:{address:toEmail,name:toName}}]
      };
      if(atts&&atts.length>0)msgPayload.attachments=atts;
      fetch("https://graph.microsoft.com/v1.0/me/sendMail",{
        method:"POST",
        headers:{"Authorization":"Bearer "+accessToken,"Content-Type":"application/json"},
        body:JSON.stringify({message:msgPayload,saveToSentItems:true})
      })
      .then(function(r){
        if(!r.ok)return r.json().then(function(e){throw new Error(e.error&&e.error.message?e.error.message:"B\u0142\u0105d wysy\u0142ania ("+r.status+")");});
        var nm={id:"m_"+Date.now(),folder:"sent",to:toEmail,toName:toName,
          subject:subject,date:new Date().toISOString(),preview:body.slice(0,80)+"...",
          body:body,attachments:attachments.slice()};
        setAllMails(function(prev){return [nm].concat(prev);});
        setSending(false); setJustSent(true);
        setTimeout(function(){setJustSent(false);},3000);
        setCalMail(nm);
        setToEmail(""); setSubject(""); setBody(""); setAttachments([]); setSelClientId(null);
      })
      .catch(function(e){setSending(false);setSendError(e.message||"Nieznany b\u0142\u0105d");});
    }
    if(uploadFiles.length>0){
      Promise.all(uploadFiles.map(function(file){
        return file.arrayBuffer().then(function(ab){
          var bytes=new Uint8Array(ab),binary="";
          for(var i=0;i<bytes.byteLength;i++)binary+=String.fromCharCode(bytes[i]);
          return {"@odata.type":"#microsoft.graph.fileAttachment",name:file.name,contentType:file.type||"application/octet-stream",contentBytes:btoa(binary)};
        });
      })).then(function(atts){doSend(atts);}).catch(function(){doSend([]);});
    } else {doSend([]);}
  }

  function moveMail(mail,folderId){
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{folder:folderId}):m;});});
    setSelThread(null);
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
    ce("div",{style:Object.assign({},LSML,{marginBottom:12})},"Nowa wiadomo\u015b\u0107"),
    sendError?ce("div",{style:{marginBottom:10,padding:"10px 12px",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:9,fontSize:12,color:"#b91c1c",display:"flex",alignItems:"center",gap:8}},ce("span",{style:{fontSize:16}},"\u26a0\ufe0f"),ce("span",{style:{flex:1}},sendError),ce("button",{onClick:function(){setSendError(null);},style:{border:"none",background:"none",cursor:"pointer",color:"#b91c1c",fontSize:16}},"\u00d7")):null,
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Klient"),
      ce("select",{value:selClientId||"",onChange:function(e){setSelClientId(e.target.value||null);},style:Object.assign({},INP,{appearance:"none",WebkitAppearance:"none"})},
        ce("option",{value:""},"— wybierz klienta —"),
        clients.map(function(cl){return ce("option",{key:cl.id,value:String(cl.id)},cl.name+(cl.email?" ("+cl.email+")":""));})
      )
    ),
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Szablon"),
      ce("div",{style:{display:"flex",gap:5,flexWrap:"wrap"}},
        MAIL_TEMPLATES.map(function(tpl){
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
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Do:"),
      ce("input",{type:"email",value:toEmail,onChange:function(e){onToChange(e.target.value);},placeholder:"adres@email.com",style:INP}),
      contactSug.length>0?ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:10,zIndex:200,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",overflow:"hidden",marginTop:2}},
        contactSug.map(function(c){
          return ce("div",{key:c.email,onClick:function(){setToEmail(c.email);setContactSug([]);},
            style:{padding:"9px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:10}},
            ce(Avatar,{size:28,bg:"#c8a96a",label:initials(c.name)}),
            ce("div",null,
              ce("div",{style:{fontWeight:600,color:"var(--t1)",fontSize:13}},c.name),
              ce("div",{style:{color:"var(--t3)",fontSize:11}},c.email)
            )
          );
        })
      ):null
    ),
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Temat"),
      ce("input",{type:"text",value:subject,onChange:function(e){setSubject(e.target.value);},placeholder:"Temat wiadomo\u015bci",style:INP})
    ),
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",marginBottom:10}},
      ce("label",{style:Object.assign({},LSML,{display:"block",marginBottom:6})},"Tre\u015b\u0107"),
      ce("textarea",{value:body,onChange:function(e){setBody(e.target.value);},style:Object.assign({},INP,{flex:1,minHeight:180,resize:"vertical",lineHeight:1.7})}),
      // Informacja o automatycznie doklejanym podpisie
      (userSettings&&(userSettings.signature_html||userSettings.signature_image_url))
        ?ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:6,fontStyle:"italic"}},
          "\u2139\uFE0F Podpis dopisze si\u0119 automatycznie. Zmie\u0144 go w ",
          ce("a",{href:"#",onClick:function(e){e.preventDefault();setActiveFolder("settings");},
            style:{color:"var(--t2)",textDecoration:"underline"}},"Ustawieniach"),"."
        )
        :ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:6,fontStyle:"italic"}},
          "\u2139\uFE0F Brak podpisu. Skonfiguruj go w ",
          ce("a",{href:"#",onClick:function(e){e.preventDefault();setActiveFolder("settings");},
            style:{color:"var(--t2)",textDecoration:"underline"}},"Ustawieniach"),"."
        )
    ),
    ce(AttachmentsSection,{attachments:attachments,setAttachments:setAttachments,selClient:selClient,selTemplate:selTemplate}),
    ce("div",{style:{display:"flex",gap:8,paddingTop:4,borderTop:"1px solid var(--bd2)"}},
      ce("button",{onClick:handleSaveDraft,disabled:!toEmail&&!subject&&!body,style:Object.assign({},BGHOST,{opacity:(!toEmail&&!subject&&!body)?0.4:1})},"\uD83D\uDCDD Zapisz roboczy"),
      ce("button",{onClick:handleSend,disabled:!toEmail||!subject||!body||sending,
        style:Object.assign({},BPRIM,{flex:1,
          background:justSent?"#059669":sending?"var(--bd2)":"var(--t1)",
          transition:"background .3s",
          opacity:(!toEmail||!subject||!body||sending)?0.6:1,
          cursor:(!toEmail||!subject||!body||sending)?"default":"pointer"})},
        sending?"\u2026 Wysy\u0142anie":justSent?"\u2713 Wys\u0142ano!":"\uD83D\uDCEC Wy\u015blij przez Outlook"
      )
    )
  );

  var rightContent;
  if(activeFolder==="compose"){
    rightContent=composerPanel;
  } else if(activeFolder==="drafts"){
    rightContent=ce("div",{style:{height:"100%",overflowY:"auto"}},
      ce(DraftsView,{drafts:drafts,onOpen:openDraft,onDelete:function(id){setDrafts(function(prev){return prev.filter(function(x){return x.id!==id;});});}})
    );
  } else if(activeFolder==="templates"){
    rightContent=ce(TemplatesView,{templates:MAIL_TEMPLATES,onUseTemplate:function(tpl){setSelTemplate(tpl.id);setActiveFolder("compose");}});
  } else if(activeFolder==="settings"){
    rightContent=ce(SettingsView,{
      userEmail:userEmail,
      userSettings:userSettings,
      onSaved:function(row){setUserSettings(row);}
    });
  } else {
    var folderMails=allMails.filter(function(m){return m.folder===activeFolder;});
    var loaderActive=loadingMails&&(activeFolder==="sent"||activeFolder==="inbox");
    rightContent=ce("div",{style:{display:"flex",height:"100%",minHeight:0}},
      ce("div",{style:{width:280,flexShrink:0,borderRight:"1px solid var(--bd2)",paddingRight:12,display:"flex",flexDirection:"column"}},
        loaderActive
          ?ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:8,color:"var(--t3)",fontSize:13}},"\u23F3 Wczytywanie\u2026")
          :ce(MailList,{mails:folderMails,folder:activeFolder,onSelect:setSelThread,selectedId:selThread&&selThread.head?selThread.head.id:null})
      ),
      ce("div",{style:{flex:1,minWidth:0,overflow:"hidden"}},
        ce(MailPreview,{thread:selThread,accessToken:accessToken,onCalendar:function(){if(selThread&&selThread.head)setCalMail(selThread.head);},customFolders:userFolders,onMove:moveMail})
      )
    );
  }

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",background:"var(--bg2)",borderRadius:10,marginBottom:12,border:"1px solid var(--bd2)",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:8}},
        ce("div",{style:{width:8,height:8,borderRadius:"50%",background:"#10b981",flexShrink:0,boxShadow:"0 0 0 2px rgba(16,185,129,0.2)"}}),
        ce("span",{style:{fontSize:12,color:"var(--t2)"}},"Zalogowano jako\u00a0",ce("strong",{style:{color:"var(--t1)"}},accountEmail))
      ),
      ce("button",{onClick:function(){msalLogout().catch(function(){}).finally(function(){setLogged(false);setAccessToken(null);setMsAccount(null);setAllMails([]);});},style:{fontSize:11,color:"var(--t3)",border:"none",background:"none",cursor:"pointer",padding:"4px 8px",borderRadius:6}},"Wyloguj")
    ),

    calSaved?ce("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#ecfdf5",borderRadius:10,marginBottom:10,flexShrink:0,border:"1px solid #6ee7b7",fontSize:13,color:"#065f46"}},
      ce("span",{style:{fontSize:18}},"\uD83D\uDCC5"),
      ce("div",null,"Dodano do kalendarza: ",ce("strong",null,calSaved.summary)),
      ce("button",{onClick:function(){setCalSaved(null);},style:{marginLeft:"auto",border:"none",background:"rgba(6,95,70,0.08)",borderRadius:6,cursor:"pointer",color:"#065f46",fontSize:16,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center"}},"\u00d7")
    ):null,

    ce("div",{style:{display:"flex",flex:1,minHeight:0}},
      ce("div",{style:{width:186,flexShrink:0,display:"flex",flexDirection:"column",borderRight:"1px solid var(--bd2)",paddingRight:8,marginRight:14,overflowY:"auto"}},
        SYSTEM_FOLDERS.map(function(f){
          var active=activeFolder===f.id;
          var badge=f.id==="drafts"&&drafts.length>0?drafts.length:null;
          return ce("button",{key:f.id,onClick:function(){setActiveFolder(f.id);setSelThread(null);},
            style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:9,border:"none",
              background:active?"var(--wb)":"transparent",color:active?"var(--wt)":"var(--t2)",
              fontSize:13,fontWeight:active?700:500,cursor:"pointer",
              display:"flex",alignItems:"center",gap:8,marginBottom:1,
              borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
            ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
            ce("span",{style:{flex:1}},f.label),
            badge?ce("span",{style:{background:"var(--wbd)",color:"var(--wt)",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px"}},badge):null
          );
        }),
        userFolders.length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",marginTop:8,paddingTop:8}},
          ce("div",{style:Object.assign({},LSML,{padding:"0 8px",marginBottom:6})},"Moje foldery"),
          userFolders.map(function(f){
            var active=activeFolder===f.id;
            var cnt=allMails.filter(function(m){return m.folder===f.id;}).length;
            return ce("button",{key:f.id,onClick:function(){setActiveFolder(f.id);setSelThread(null);},
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
    showNF?ce(ModalNewFolder,{onClose:function(){setShowNF(false);},onSave:function(f){setUserFolders(function(prev){return prev.concat([f]);});setShowNF(false);setActiveFolder(f.id);}}):null
  );
}
