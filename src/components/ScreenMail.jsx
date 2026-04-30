import React, { useState, useRef, useEffect } from 'react';
import { roundTo10 } from '../constants/data.js';
const ce = React.createElement;

// ── MOCK DATA ────────────────────────────────────────────────────────────────

export const MOCK_SENT = [
  {id:"m1", folder:"sent", to:"anna.kowalska@gmail.com", toName:"Anna Kowalska", subject:"Oferta aranżacji okiennych \u2013 Salon", date:"2025-04-22T10:14:00", preview:"W nawiązaniu do naszego spotkania, przesyłam w załączeniu PDF z wyceną...", body:"Dzień dobry,\n\nW nawiązaniu do naszego spotkania, przesyłam w załączeniu PDF z wyceną Pani zamówienia.\n\nOrientacyjna wartość realizacji: 4 800 zł brutto\n(zaliczka 50% = 2 400 zł)\n\nPozdrawiam serdecznie,\nPaulina Porter", attachments:[{id:"a1",name:"Oferta_Kowalska.pdf",size:142000,type:"app"}]},
  {id:"m2", folder:"sent", to:"marek.nowak@wp.pl", toName:"Marek Nowak", subject:"Potwierdzenie zamówienia \u2013 rolety zaciemniające", date:"2025-04-18T14:32:00", preview:"Dziękuję za wpłatę zaliczki. Potwierdzam przyjęcie zamówienia na...", body:"Dzień dobry,\n\nDziękuję za wpłatę zaliczki. Potwierdzam przyjęcie zamówienia na rolety zaciemniające.\n\nCzas realizacji: ok. 4 tygodnie.\n\nPozdrawiam,\nPaulina Porter", attachments:[]},
  {id:"m3", folder:"sent", to:"julia.wozniak@onet.pl", toName:"Julia Woźniak", subject:"Przypomnienie \u2013 wycena zasłon", date:"2025-04-10T09:05:00", preview:"Pozwalam sobie przypomnieć o przesłanej wycenie zasłon do salonu...", body:"Dzień dobry,\n\nPozwalam sobie przypomnieć o przesłanej wycenie zasłon do salonu. Jeśli ma Pani pytania, chętnie się spotkam lub porozmawiam telefonicznie.\n\nPozdrawiam,\nPaulina Porter", attachments:[]}
];

export const MOCK_CONTACTS = [
  {email:"anna.kowalska@gmail.com", name:"Anna Kowalska"},
  {email:"marek.nowak@wp.pl", name:"Marek Nowak"},
  {email:"julia.wozniak@onet.pl", name:"Julia Wo\u017aniak"},
  {email:"tomasz.lewandowski@o2.pl", name:"Tomasz Lewandowski"},
  {email:"katarzyna.wisniewska@wp.pl", name:"Katarzyna Wi\u015bniewska"}
];

export const MAIL_TEMPLATES = [
  {
    id:"oferta", label:"Oferta", icon:"\uD83D\uDCCB",
    subject:"Oferta ara\u0144\u017cacji okiennych \u2013 {clientName}",
    body:"Dzie\u0144 dobry,\n\nW nawi\u0105zaniu do naszej rozmowy, przesy\u0142am w za\u0142\u0105czeniu PDF z przybli\u017con\u0105 wycen\u0105 {honorific} zam\u00f3wienia.\n\nOrientacyjna warto\u015b\u0107 realizacji: {total} z\u0142 brutto\n(zaliczka 50% = {zaliczka} z\u0142)\n\nCzas realizacji: ok. 4 tygodnie od akceptacji i wp\u0142aty zaliczki.\n\nCh\u0119tnie przyjad\u0119 z wzornikami tkanin.\nKoszt pomiaru z dojazdem: 250 PLN (odliczane od warto\u015bci zam\u00f3wienia).\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design",
    suggestAttachments:["pdf_oferta","pdf_uproszczona"]
  },
  {
    id:"potwierdzenie", label:"Potwierdzenie", icon:"\u2705",
    subject:"Potwierdzenie zam\u00f3wienia \u2013 Porter Design",
    body:"Dzie\u0144 dobry,\n\nDzi\u0119kuj\u0119 za wp\u0142at\u0119 zaliczki. Potwierdzam przyj\u0119cie {honorific} zam\u00f3wienia do realizacji.\n\nSzacowany czas realizacji: ok. 4 tygodnie.\nO post\u0119pach b\u0119d\u0119 informowa\u0107 na bie\u017c\u0105co.\n\nPozdrawiam,\nPaulina Porter\nPorter Design",
    suggestAttachments:["pdf_zlecenie"]
  },
  {
    id:"przypomnienie", label:"Przypomnienie", icon:"\uD83D\uDD14",
    subject:"Przypomnienie \u2013 wycena Porter Design",
    body:"Dzie\u0144 dobry,\n\nPozwalam sobie przypomnie\u0107 o przes\u0142anej wycenie. Oferta wa\u017cna jest przez 30 dni.\n\nJe\u015bli ma {honorific2} pytania lub \u017cyczenia zmian \u2014 ch\u0119tnie porozmawiam.\n\nPozdrawiam,\nPaulina Porter\nPorter Design",
    suggestAttachments:[]
  },
  {
    id:"wlasny", label:"W\u0142asny", icon:"\u270F\uFE0F",
    subject:"", body:"",
    suggestAttachments:[]
  }
];

var APP_PDF_OPTIONS = [
  {id:"pdf_oferta",      label:"Wycena pe\u0142na",         icon:"\uD83D\uDCC4"},
  {id:"pdf_uproszczona", label:"Wycena uproszczona",    icon:"\uD83D\uDCC3"},
  {id:"pdf_zlecenie",    label:"Zlecenie szycia",       icon:"\u2702\uFE0F"},
  {id:"pdf_tkanina",     label:"Zam\u00f3wienie tkaniny",  icon:"\uD83E\uDDF5"}
];

var SYSTEM_FOLDERS = [
  {id:"compose",   label:"Nowa wiadomo\u015b\u0107", icon:"\u270F\uFE0F", system:true},
  {id:"sent",      label:"Wys\u0142ane",           icon:"\uD83D\uDCE4",  system:true},
  {id:"drafts",    label:"Robocze",              icon:"\uD83D\uDCDD",  system:true},
  {id:"templates", label:"Szablony",             icon:"\uD83D\uDCCB",  system:true}
];

// ── HELPERS ──────────────────────────────────────────────────────────────────

export function fillTemplate(tpl, client){
  var cl = client || {};
  var honorific  = cl.gender==="male" ? "Pana" : "Pani";
  var honorific2 = cl.gender==="male" ? "Pan"  : "Pani";
  var total = 0;
  if(cl.rooms){
    total = roundTo10((cl.rooms||[]).reduce(function(a,r){
      return a+(r.windows||[]).reduce(function(b,w){
        return b+(w.products||[]).reduce(function(c,prod){
          return c+(prod.mp!=null?prod.mp:0);
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
      .replace(/{honorific}/g,  honorific)
      .replace(/{clientName}/g, cl.name||"")
      .replace(/{total}/g,      total>0?String(total):"___")
      .replace(/{zaliczka}/g,   zaliczka>0?String(zaliczka):"___")
  };
}

export function fmtMailDate(iso){
  if(!iso)return "";
  var d=new Date(iso), today=new Date();
  if(d.toDateString()===today.toDateString())
    return d.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit"});
}

function fmtBytes(n){
  if(!n)return "";
  if(n<1024)return n+"B";
  if(n<1048576)return Math.round(n/1024)+"KB";
  return (n/1048576).toFixed(1)+"MB";
}

function nextHourStr(){
  var d=new Date();
  d.setMinutes(0,0,0);
  d.setHours(d.getHours()+1);
  var pad=function(x){return String(x).padStart(2,"0");};
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":00";
}

// ── MODAL: GOOGLE CALENDAR ───────────────────────────────────────────────────

function ModalCalendar(p){
  var useState=React.useState;
  var sd=useState(nextHourStr()), dtVal=sd[0], setDtVal=sd[1];
  var sdur=useState(60), dur=sdur[0], setDur=sdur[1];
  var stitle=useState("Follow-up: "+(p.mail?p.mail.toName||p.mail.to:"")), title=stitle[0], setTitle=stitle[1];
  var snote=useState(p.mail?"Temat maila: "+(p.mail.subject||""):""), note=snote[0], setNote=snote[1];

  var INP={width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:13,
    border:"1px solid var(--bd2)",borderRadius:8,background:"var(--bg2)",
    color:"var(--t1)",outline:"none",fontFamily:"inherit"};

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:900,
    display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
    ce("div",{style:{background:"var(--bg1)",borderRadius:14,padding:24,width:"100%",maxWidth:420,
      boxShadow:"0 8px 40px rgba(0,0,0,0.22)",display:"flex",flexDirection:"column",gap:14}},

      ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:2}},
        ce("div",{style:{fontSize:24}},"\uD83D\uDCC5"),
        ce("div",{style:{flex:1}},
          ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},"Dodaj do Google Calendar"),
          ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:1}},"Zdarzenie follow-up po wys\u0142aniu maila")
        ),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",fontSize:20,cursor:"pointer",color:"var(--t3)",padding:"0 4px",lineHeight:1}},"\u00d7")
      ),

      ce("div",null,
        ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Tytu\u0142 zdarzenia"),
        ce("input",{type:"text",value:title,onChange:function(e){setTitle(e.target.value);},style:INP})
      ),

      ce("div",null,
        ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Data i godzina"),
        ce("input",{type:"datetime-local",value:dtVal,onChange:function(e){setDtVal(e.target.value);},style:INP})
      ),

      ce("div",null,
        ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Czas trwania"),
        ce("select",{value:dur,onChange:function(e){setDur(Number(e.target.value));},
          style:Object.assign({},INP,{appearance:"none",WebkitAppearance:"none"})},
          ce("option",{value:15},"15 minut"),
          ce("option",{value:30},"30 minut"),
          ce("option",{value:60},"1 godzina"),
          ce("option",{value:90},"1,5 godziny"),
          ce("option",{value:120},"2 godziny")
        )
      ),

      ce("div",null,
        ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Notatka (opcjonalnie)"),
        ce("textarea",{value:note,onChange:function(e){setNote(e.target.value);},rows:3,
          style:Object.assign({},INP,{resize:"vertical",lineHeight:1.5})})
      ),

      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:p.onClose,
          style:{flex:1,padding:"10px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg2)",
            fontSize:13,fontWeight:600,color:"var(--t2)",cursor:"pointer"}},
          "Anuluj"
        ),
        ce("button",{onClick:function(){
            var evt={summary:title,description:note,
              start:{dateTime:new Date(dtVal).toISOString()},
              end:{dateTime:new Date(new Date(dtVal).getTime()+dur*60000).toISOString()}};
            p.onSave(evt);
          },
          style:{flex:2,padding:"10px",borderRadius:9,border:"none",background:"#4285f4",
            fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}},
          "\uD83D\uDCC5 Zapisz w kalendarzu"
        )
      ),
      ce("div",{style:{fontSize:10,color:"var(--t3)",textAlign:"center"}},
        "Prototyp \u2014 Google Calendar API OAuth2 w pe\u0142nej wersji")
    )
  );
}

// ── MODAL: NOWY FOLDER ───────────────────────────────────────────────────────

function ModalNewFolder(p){
  var useState=React.useState;
  var sn=useState(""), name=sn[0], setName=sn[1];
  var ICONS=["\uD83D\uDCC1","\u2B50","\uD83D\uDCBC","\uD83D\uDD14","\uD83C\uDFE0","\uD83D\uDCA1","\uD83D\uDD12","\uD83C\uDF3F"];
  var si=useState(ICONS[0]), icon=si[0], setIcon=si[1];
  var INP={width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:13,
    border:"1px solid var(--bd2)",borderRadius:8,background:"var(--bg2)",
    color:"var(--t1)",outline:"none",fontFamily:"inherit"};
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:900,
    display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
    ce("div",{style:{background:"var(--bg1)",borderRadius:14,padding:24,width:"100%",maxWidth:340,
      boxShadow:"0 8px 40px rgba(0,0,0,0.22)",display:"flex",flexDirection:"column",gap:14}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
        ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},"Nowy folder"),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",fontSize:20,cursor:"pointer",color:"var(--t3)",lineHeight:1}},"\u00d7")
      ),
      ce("div",null,
        ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Nazwa folderu"),
        ce("input",{type:"text",value:name,onChange:function(e){setName(e.target.value);},
          placeholder:"np. Realizacje 2025",style:INP,autoFocus:true})
      ),
      ce("div",null,
        ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:8}},"Ikona"),
        ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
          ICONS.map(function(ic){
            return ce("button",{key:ic,onClick:function(){setIcon(ic);},
              style:{width:36,height:36,borderRadius:8,fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                border:"2px solid "+(icon===ic?"var(--gr)":"var(--bd2)"),
                background:icon===ic?"var(--grl)":"var(--bg2)"}},
              ic);
          })
        )
      ),
      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:p.onClose,
          style:{flex:1,padding:"10px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg2)",
            fontSize:13,fontWeight:600,color:"var(--t2)",cursor:"pointer"}},
          "Anuluj"
        ),
        ce("button",{onClick:function(){if(name.trim())p.onSave({id:"f_"+Date.now(),label:name.trim(),icon:icon,system:false});},
          disabled:!name.trim(),
          style:{flex:2,padding:"10px",borderRadius:9,border:"none",
            background:name.trim()?"var(--t1)":"var(--bd2)",
            fontSize:13,fontWeight:700,color:"#fff",cursor:name.trim()?"pointer":"default"}},
          "Utw\u00f3rz folder"
        )
      )
    )
  );
}

// ── ZAŁĄCZNIKI ───────────────────────────────────────────────────────────────

function AttachmentsSection(p){
  var fileRef=React.useRef();
  var useState=React.useState;
  var sshow=useState(false), showAppPicker=sshow[0], setShowAppPicker=sshow[1];
  var tpl=MAIL_TEMPLATES.find(function(t){return t.id===p.selTemplate;})||MAIL_TEMPLATES[0];
  var suggested=tpl.suggestAttachments||[];

  function onFileChange(e){
    var files=Array.from(e.target.files||[]);
    var mapped=files.map(function(f){return {id:"att_"+Date.now()+"_"+f.name,name:f.name,size:f.size,type:"upload",file:f};});
    p.setAttachments(function(prev){return prev.concat(mapped);});
    e.target.value="";
  }

  function addAppPdf(opt){
    if(p.attachments.find(function(a){return a.id===opt.id;}))return;
    p.setAttachments(function(prev){return prev.concat([{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}]);});
  }

  function remove(id){p.setAttachments(function(prev){return prev.filter(function(a){return a.id!==id;});});}

  var BTN={padding:"6px 10px",fontSize:12,border:"1px solid var(--bd2)",borderRadius:7,
    background:"var(--bg2)",color:"var(--t1)",outline:"none",fontFamily:"inherit",cursor:"pointer"};

  return ce("div",{style:{marginBottom:10}},
    ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:6}},"Za\u0142\u0105czniki"),

    p.attachments.length>0?ce("div",{style:{display:"flex",flexDirection:"column",gap:4,marginBottom:8}},
      p.attachments.map(function(att){
        return ce("div",{key:att.id,style:{display:"flex",alignItems:"center",gap:8,
          padding:"6px 10px",borderRadius:7,background:"var(--bg2)",border:"1px solid var(--bd2)"}},
          ce("span",{style:{fontSize:14}},att.type==="app"?"\uD83D\uDCC4":"\uD83D\uDCCE"),
          ce("span",{style:{fontSize:12,color:"var(--t1)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},att.name),
          att.size
            ?ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},fmtBytes(att.size))
            :ce("span",{style:{fontSize:10,color:"var(--gr)",flexShrink:0}},"z app"),
          ce("button",{onClick:function(){remove(att.id);},
            style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",fontSize:16,padding:"0 2px",lineHeight:1}},
            "\u00d7")
        );
      })
    ):null,

    ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}},

      ce("button",{onClick:function(){fileRef.current&&fileRef.current.click();},style:BTN},
        "\uD83D\uDCCE Dodaj plik"
      ),
      ce("input",{ref:fileRef,type:"file",multiple:true,style:{display:"none"},onChange:onFileChange}),

      p.selClient
        ?ce("div",{style:{position:"relative"}},
          ce("button",{onClick:function(){setShowAppPicker(function(v){return !v;});},
            style:Object.assign({},BTN,{
              background:showAppPicker?"var(--grl)":"var(--bg2)",
              border:"1px solid "+(showAppPicker?"var(--gr)":"var(--bd2)"),
              color:showAppPicker?"var(--grd)":"var(--t1)",
              display:"flex",alignItems:"center",gap:5})},
            "\uD83D\uDCC4 PDF z wyceny \u25be"
          ),
          showAppPicker?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,
            background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:10,
            boxShadow:"0 4px 20px rgba(0,0,0,0.14)",zIndex:300,minWidth:230,overflow:"hidden"}},
            APP_PDF_OPTIONS.map(function(opt){
              var already=!!p.attachments.find(function(a){return a.id===opt.id;});
              return ce("div",{key:opt.id,
                onClick:function(){if(!already){addAppPdf(opt);setShowAppPicker(false);}},
                style:{padding:"10px 14px",fontSize:13,cursor:already?"default":"pointer",
                  display:"flex",alignItems:"center",gap:8,opacity:already?0.5:1,
                  borderBottom:"1px solid var(--bd3)",
                  background:"transparent"}},
                ce("span",null,opt.icon),
                ce("span",{style:{color:"var(--t1)",flex:1}},opt.label),
                already?ce("span",{style:{fontSize:10,color:"var(--gr)"}},"dodano"):null
              );
            }),
            suggested.length>0?ce("div",{style:{padding:"6px 14px 10px",borderTop:"1px solid var(--bd2)"}},
              ce("div",{style:{fontSize:10,color:"var(--t3)",marginBottom:5}},"Sugerowane dla tego szablonu:"),
              ce("div",{style:{display:"flex",gap:4,flexWrap:"wrap"}},
                suggested.map(function(sid){
                  var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
                  if(!opt)return null;
                  var already=!!p.attachments.find(function(a){return a.id===sid;});
                  return ce("button",{key:sid,
                    onClick:function(){if(!already){addAppPdf(opt);setShowAppPicker(false);}},
                    style:{padding:"4px 8px",fontSize:11,borderRadius:6,cursor:already?"default":"pointer",
                      border:"1px solid var(--gr)",background:already?"var(--grl)":"transparent",
                      color:"var(--grd)",opacity:already?0.6:1}},
                    opt.icon+" "+opt.label);
                })
              )
            ):null
          ):null
        )
        :ce("span",{style:{fontSize:11,color:"var(--t3)",padding:"4px 6px"}},
          "Wybierz klienta, by doda\u0107 PDF z wyceny")
    )
  );
}

// ── LISTA MAILI ──────────────────────────────────────────────────────────────

function MailList(p){
  var useState=React.useState;
  var sf=useState(""), filter=sf[0], setFilter=sf[1];
  var INP={width:"100%",boxSizing:"border-box",padding:"8px 12px",fontSize:12,
    border:"1px solid var(--bd2)",borderRadius:8,background:"var(--bg2)",
    color:"var(--t1)",outline:"none",fontFamily:"inherit"};
  var filtered=(p.mails||[]).filter(function(m){
    if(!filter)return true;
    var q=filter.toLowerCase();
    return (m.toName||"").toLowerCase().includes(q)||(m.to||"").toLowerCase().includes(q)||(m.subject||"").toLowerCase().includes(q);
  });
  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{paddingBottom:8}},
      ce("input",{type:"text",value:filter,onChange:function(e){setFilter(e.target.value);},
        placeholder:"Szukaj\u2026",style:INP})
    ),
    ce("div",{style:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}},
      filtered.length===0
        ?ce("div",{style:{fontSize:13,color:"var(--t3)",textAlign:"center",padding:"40px 0"}},"Brak wiadomo\u015bci")
        :filtered.map(function(m){
          var sel=p.selectedId===m.id;
          return ce("div",{key:m.id,onClick:function(){p.onSelect(m);},
            style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",
              background:sel?"var(--grl)":"var(--bg2)",
              border:"1.5px solid "+(sel?"var(--gr)":"transparent"),transition:"all .15s"}},
            ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}},
              ce("span",{style:{fontSize:12,fontWeight:700,color:"var(--t1)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"65%"}},m.toName||m.to),
              ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},fmtMailDate(m.date))
            ),
            ce("div",{style:{fontSize:11,color:"var(--t2)",fontWeight:600,marginBottom:2,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.subject),
            ce("div",{style:{fontSize:11,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview),
            (m.attachments&&m.attachments.length>0)
              ?ce("div",{style:{fontSize:10,color:"var(--t3)",marginTop:3}},
                "\uD83D\uDCCE "+m.attachments.length+" za\u0142\u0105cznik"+(m.attachments.length>1?"i":""))
              :null
          );
        })
    )
  );
}

// ── PODGLĄD MAILA ────────────────────────────────────────────────────────────

function MailPreview(p){
  var m=p.mail;
  var useState=React.useState;
  var smenu=useState(false), showMoveMenu=smenu[0], setShowMoveMenu=smenu[1];

  if(!m)return ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",
    height:"100%",color:"var(--t3)",fontSize:13,flexDirection:"column",gap:8}},
    ce("div",{style:{fontSize:32}},"\uD83D\uDCE9"),
    "Wybierz wiadomo\u015b\u0107 z listy"
  );

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    ce("div",{style:{borderBottom:"1px solid var(--bd2)",paddingBottom:12,marginBottom:14,flexShrink:0}},
      ce("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}},
        ce("div",{style:{flex:1}},
          ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)",marginBottom:4,lineHeight:1.3}},m.subject),
          ce("div",{style:{fontSize:12,color:"var(--t3)"}},"Do: ",
            ce("strong",{style:{color:"var(--t2)"}},(m.toName||m.to)+" <"+m.to+">"))
        ),
        ce("div",{style:{fontSize:11,color:"var(--t3)",flexShrink:0}},
          new Date(m.date).toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}))
      ),

      (m.attachments&&m.attachments.length>0)?ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}},
        m.attachments.map(function(att){
          return ce("div",{key:att.id||att.name,style:{display:"flex",alignItems:"center",gap:5,
            padding:"4px 10px",borderRadius:6,background:"var(--bg2)",border:"1px solid var(--bd2)",fontSize:11}},
            ce("span",null,att.type==="app"?"\uD83D\uDCC4":"\uD83D\uDCCE"),
            ce("span",{style:{color:"var(--t1)"}},att.name),
            att.size?ce("span",{style:{color:"var(--t3)",marginLeft:4}},fmtBytes(att.size)):null
          );
        })
      ):null,

      ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        ce("button",{onClick:p.onCalendar,
          style:{padding:"6px 12px",borderRadius:7,border:"1px solid var(--bd2)",background:"var(--bg2)",
            fontSize:12,cursor:"pointer",color:"var(--t1)",display:"flex",alignItems:"center",gap:5}},
          "\uD83D\uDCC5 Dodaj do kalendarza"
        ),
        ce("div",{style:{position:"relative"}},
          ce("button",{onClick:function(){setShowMoveMenu(function(v){return !v;});},
            style:{padding:"6px 12px",borderRadius:7,border:"1px solid var(--bd2)",background:"var(--bg2)",
              fontSize:12,cursor:"pointer",color:"var(--t1)"}},
            "\uD83D\uDCC1 Przenie\u015b \u25be"
          ),
          showMoveMenu?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,
            background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:10,
            boxShadow:"0 4px 20px rgba(0,0,0,0.14)",zIndex:300,minWidth:190,overflow:"hidden"}},
            (p.customFolders||[]).length===0
              ?ce("div",{style:{padding:"10px 14px",fontSize:12,color:"var(--t3)"}},"Brak w\u0142asnych folder\u00f3w")
              :(p.customFolders||[]).map(function(f){
                return ce("div",{key:f.id,onClick:function(){p.onMove(m,f.id);setShowMoveMenu(false);},
                  style:{padding:"9px 14px",fontSize:13,cursor:"pointer",
                    borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:8}},
                  ce("span",null,f.icon),
                  ce("span",{style:{color:"var(--t1)"}},f.label)
                );
              })
          ):null
        )
      )
    ),
    ce("div",{style:{flex:1,overflowY:"auto",fontSize:13,color:"var(--t1)",lineHeight:1.8,whiteSpace:"pre-wrap"}},
      m.body)
  );
}

// ── SZABLONY ─────────────────────────────────────────────────────────────────

function TemplatesView(p){
  var useState=React.useState;
  var ssel=useState(null), selId=ssel[0], setSelId=ssel[1];
  var sel=p.templates.find(function(t){return t.id===selId;})||null;
  return ce("div",{style:{display:"flex",gap:14,height:"100%"}},
    ce("div",{style:{width:160,display:"flex",flexDirection:"column",gap:4,flexShrink:0}},
      p.templates.map(function(tpl){
        var active=selId===tpl.id;
        return ce("div",{key:tpl.id,onClick:function(){setSelId(tpl.id);},
          style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",
            background:active?"var(--grl)":"var(--bg2)",
            border:"1.5px solid "+(active?"var(--gr)":"transparent")}},
          ce("div",{style:{fontSize:16,marginBottom:4}},tpl.icon),
          ce("div",{style:{fontSize:13,fontWeight:active?700:500,color:"var(--t1)"}},tpl.label)
        );
      })
    ),
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",gap:10,minWidth:0}},
      sel
        ?ce(React.Fragment,null,
          ce("div",{style:{fontWeight:700,fontSize:14,color:"var(--t1)"}},sel.icon+" "+sel.label),
          ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:4}},"Temat: "+sel.subject),
          ce("div",{style:{flex:1,padding:14,background:"var(--bg2)",borderRadius:10,
            fontSize:12,color:"var(--t1)",lineHeight:1.8,whiteSpace:"pre-wrap",overflowY:"auto"}},
            sel.body||ce("em",{style:{color:"var(--t3)"}},"(pusty szablon)")),
          ce("button",{onClick:function(){p.onUseTemplate(sel);},
            style:{padding:"10px 16px",borderRadius:9,border:"none",background:"var(--t1)",
              fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",alignSelf:"flex-start"}},
            "\u270F\uFE0F U\u017cyj tego szablonu")
        )
        :ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",
          flex:1,color:"var(--t3)",fontSize:13}},"Wybierz szablon z listy")
    )
  );
}

// ── ROBOCZE ──────────────────────────────────────────────────────────────────

function DraftsView(p){
  if(!p.drafts||p.drafts.length===0)
    return ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100%",color:"var(--t3)",fontSize:13,flexDirection:"column",gap:8}},
      ce("div",{style:{fontSize:32}},"\uD83D\uDCDD"),
      "Brak zapisanych projekt\u00f3w"
    );
  return ce("div",{style:{display:"flex",flexDirection:"column",gap:6}},
    p.drafts.map(function(d){
      return ce("div",{key:d.id,style:{padding:"12px 14px",borderRadius:10,background:"var(--bg2)",
        border:"1px solid var(--bd2)",display:"flex",alignItems:"center",gap:10}},
        ce("div",{style:{flex:1,cursor:"pointer"},onClick:function(){p.onOpen(d);}},
          ce("div",{style:{fontWeight:600,fontSize:13,color:"var(--t1)",marginBottom:2}},d.subject||"(bez tematu)"),
          ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Do: "+(d.to||"\u2014")+" \u00b7 "+fmtMailDate(d.savedAt))
        ),
        ce("button",{onClick:function(){p.onDelete(d.id);},
          style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",fontSize:16,padding:"2px 6px"}},
          "\uD83D\uDDD1\uFE0F")
      );
    })
  );
}

// ── GŁÓWNY KOMPONENT ─────────────────────────────────────────────────────────

export function ScreenMail(p){
  var useState=React.useState, useEffect=React.useEffect;
  var clients=p.clients||[];

  var sa=useState(false), msalLoggedIn=sa[0], setMsalLoggedIn=sa[1];

  var suf=useState([]), userFolders=suf[0], setUserFolders=suf[1];
  var saf=useState("compose"), activeFolder=saf[0], setActiveFolder=saf[1];
  var snf=useState(false), showNewFolder=snf[0], setShowNewFolder=snf[1];

  var smails=useState(MOCK_SENT), allMails=smails[0], setAllMails=smails[1];
  var ssel=useState(null), selMail=ssel[0], setSelMail=ssel[1];

  var sdr=useState([]), drafts=sdr[0], setDrafts=sdr[1];

  var sc=useState(null), selClientId=sc[0], setSelClientId=sc[1];
  var st=useState("oferta"), selTemplate=st[0], setSelTemplate=st[1];
  var sto=useState(""), toEmail=sto[0], setToEmail=sto[1];
  var ssub=useState(""), subject=ssub[0], setSubject=ssub[1];
  var sbod=useState(""), body=sbod[0], setBody=sbod[1];
  var satt=useState([]), attachments=satt[0], setAttachments=satt[1];
  var scon=useState([]), contactSug=scon[0], setContactSug=scon[1];
  var ssent=useState(false), justSent=ssent[0], setJustSent=ssent[1];
  var ssending=useState(false), sending=ssending[0], setSending=ssending[1];

  var scal=useState(null), calMail=scal[0], setCalMail=scal[1];
  var scalok=useState(null), calSaved=scalok[0], setCalSaved=scalok[1];

  var selClient=clients.find(function(c){return String(c.id)===String(selClientId);})||null;

  useEffect(function(){
    var tpl=MAIL_TEMPLATES.find(function(t){return t.id===selTemplate;})||MAIL_TEMPLATES[0];
    var filled=fillTemplate(tpl,selClient);
    setSubject(filled.subject);
    setBody(filled.body);
    if(selClient&&selClient.email)setToEmail(selClient.email);
    if(selClient&&tpl.suggestAttachments&&tpl.suggestAttachments.length>0){
      setAttachments(tpl.suggestAttachments.map(function(sid){
        var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
        return opt?{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}:null;
      }).filter(Boolean));
    } else {
      setAttachments([]);
    }
  },[selClientId,selTemplate]);

  function onToChange(val){
    setToEmail(val);
    if(val.length<2){setContactSug([]);return;}
    var q=val.toLowerCase();
    var fc=clients.filter(function(c){return c.email&&((c.name||"").toLowerCase().includes(q)||c.email.toLowerCase().includes(q));})
      .map(function(c){return {email:c.email,name:c.name};});
    var fm=MOCK_CONTACTS.filter(function(c){return c.name.toLowerCase().includes(q)||c.email.toLowerCase().includes(q);});
    var merged=fc.concat(fm).reduce(function(acc,c){if(!acc.find(function(x){return x.email===c.email;}))acc.push(c);return acc;},[]).slice(0,5);
    setContactSug(merged);
  }

  function pickContact(c){setToEmail(c.email);setContactSug([]);}

  function saveDraftInternal(){
    if(!toEmail&&!subject&&!body)return null;
    return {id:"d_"+Date.now(),to:toEmail,subject:subject,body:body,attachments:attachments.slice(),savedAt:new Date().toISOString()};
  }

  function handleSaveDraft(){
    var d=saveDraftInternal();
    if(!d)return;
    setDrafts(function(prev){return [d].concat(prev);});
    setToEmail(""); setSubject(""); setBody(""); setAttachments([]); setSelClientId(null);
  }

  function openDraft(d){
    setToEmail(d.to||""); setSubject(d.subject||""); setBody(d.body||"");
    setAttachments(d.attachments||[]);
    setDrafts(function(prev){return prev.filter(function(x){return x.id!==d.id;});});
    setActiveFolder("compose");
  }

  function deleteDraft(id){setDrafts(function(prev){return prev.filter(function(x){return x.id!==id;});});}

  function handleSend(){
    if(!toEmail||!subject||!body)return;
    setSending(true);
    setTimeout(function(){
      var nm={id:"m_"+Date.now(),folder:"sent",to:toEmail,
        toName:selClient?selClient.name:toEmail,subject:subject,
        date:new Date().toISOString(),preview:body.slice(0,80)+"...",
        body:body,attachments:attachments.slice()};
      setAllMails(function(prev){return [nm].concat(prev);});
      setSending(false); setJustSent(true);
      setTimeout(function(){setJustSent(false);},3000);
      setCalMail(nm);
    },900);
  }

  function moveMail(mail,folderId){
    setAllMails(function(prev){return prev.map(function(m){return m.id===mail.id?Object.assign({},m,{folder:folderId}):m;});});
    setSelMail(null);
  }

  function useTemplate(tpl){setSelTemplate(tpl.id);setActiveFolder("compose");}

  var INP={width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:13,
    border:"1px solid var(--bd2)",borderRadius:8,background:"var(--bg2)",
    color:"var(--t1)",outline:"none",fontFamily:"inherit"};
  var SEC={marginBottom:10};

  // ── LOGIN SCREEN ──
  if(!msalLoggedIn){
    return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:"40px 20px",minHeight:300,gap:16,textAlign:"center"}},
      ce("div",{style:{fontSize:40,lineHeight:1}},"\u2709\uFE0F"),
      ce("div",{style:{fontSize:17,fontWeight:700,color:"var(--t1)"}},"Modu\u0142 Mail"),
      ce("div",{style:{fontSize:13,color:"var(--t2)",maxWidth:280,lineHeight:1.6}},
        "Zaloguj si\u0119 kontem Microsoft, by wysy\u0142a\u0107 maile przez Outlooka i pobiera\u0107 histori\u0119."),
      ce("button",{onClick:function(){setMsalLoggedIn(true);},
        style:{display:"flex",alignItems:"center",gap:10,padding:"12px 24px",borderRadius:10,
          border:"1.5px solid var(--bd2)",background:"var(--bg2)",cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--t1)",marginTop:8}},
        ce("svg",{width:20,height:20,viewBox:"0 0 21 21"},
          ce("rect",{x:1,y:1,width:9,height:9,fill:"#f25022"}),
          ce("rect",{x:11,y:1,width:9,height:9,fill:"#7fba00"}),
          ce("rect",{x:1,y:11,width:9,height:9,fill:"#00a4ef"}),
          ce("rect",{x:11,y:11,width:9,height:9,fill:"#ffb900"})
        ),
        "Zaloguj si\u0119 przez Microsoft"
      ),
      ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Prototyp \u2014 klikni\u0119cie symuluje logowanie")
    );
  }

  // ── COMPOSER ──
  var composerPanel=ce("div",{style:{flex:"1 1 0",minWidth:0,display:"flex",flexDirection:"column",overflowY:"auto",paddingRight:2}},
    ce("div",{style:{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}},"\u270F\uFE0F Nowa wiadomo\u015b\u0107"),

    ce("div",{style:SEC},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Klient"),
      ce("select",{value:selClientId||"",onChange:function(e){setSelClientId(e.target.value||null);},
        style:Object.assign({},INP,{appearance:"none",WebkitAppearance:"none"})},
        ce("option",{value:""},"— wybierz klienta —"),
        clients.map(function(cl){return ce("option",{key:cl.id,value:String(cl.id)},cl.name+(cl.email?" ("+cl.email+")":""));})
      )
    ),

    ce("div",{style:SEC},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Szablon"),
      ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        MAIL_TEMPLATES.map(function(tpl){
          var active=selTemplate===tpl.id;
          return ce("button",{key:tpl.id,onClick:function(){setSelTemplate(tpl.id);},
            style:{padding:"6px 11px",borderRadius:8,fontSize:12,fontWeight:active?700:400,
              border:"1.5px solid "+(active?"var(--gr)":"var(--bd2)"),
              background:active?"var(--grl)":"transparent",
              color:active?"var(--grd)":"var(--t2)",cursor:"pointer"}},
            tpl.icon+" "+tpl.label);
        })
      )
    ),

    ce("div",{style:Object.assign({},SEC,{position:"relative"})},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Do:"),
      ce("input",{type:"email",value:toEmail,onChange:function(e){onToChange(e.target.value);},
        placeholder:"adres@email.com",style:INP}),
      contactSug.length>0?ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,
        background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:8,zIndex:200,
        boxShadow:"0 4px 16px rgba(0,0,0,0.12)",overflow:"hidden"}},
        contactSug.map(function(c){
          return ce("div",{key:c.email,onClick:function(){pickContact(c);},
            style:{padding:"9px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd3)",
              display:"flex",flexDirection:"column",gap:2}},
            ce("span",{style:{fontWeight:600,color:"var(--t1)"}},c.name),
            ce("span",{style:{color:"var(--t3)",fontSize:11}},c.email)
          );
        })
      ):null
    ),

    ce("div",{style:SEC},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Temat"),
      ce("input",{type:"text",value:subject,onChange:function(e){setSubject(e.target.value);},
        placeholder:"Temat wiadomo\u015bci",style:INP})
    ),

    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",marginBottom:10}},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Tre\u015b\u0107"),
      ce("textarea",{value:body,onChange:function(e){setBody(e.target.value);},
        style:Object.assign({},INP,{flex:1,minHeight:200,resize:"vertical",lineHeight:1.6})})
    ),

    ce(AttachmentsSection,{attachments:attachments,setAttachments:setAttachments,selClient:selClient,selTemplate:selTemplate}),

    ce("div",{style:{display:"flex",gap:8,paddingTop:4}},
      ce("button",{onClick:handleSaveDraft,
        disabled:!toEmail&&!subject&&!body,
        style:{padding:"10px 14px",borderRadius:9,border:"1px solid var(--bd2)",background:"var(--bg2)",
          fontSize:12,fontWeight:600,color:"var(--t2)",cursor:"pointer"}},
        "\uD83D\uDCDD Robocze"
      ),
      ce("button",{onClick:handleSend,disabled:!toEmail||!subject||!body||sending,
        style:{flex:1,padding:"12px",borderRadius:10,border:"none",
          background:justSent?"#10b981":sending?"var(--bd2)":"var(--t1)",
          color:"#fff",fontSize:14,fontWeight:700,
          cursor:(!toEmail||!subject||!body||sending)?"default":"pointer",
          transition:"background .3s",display:"flex",alignItems:"center",justifyContent:"center",gap:8}},
        sending?"\u2026 Wysy\u0142anie":justSent?"\u2713 Wys\u0142ano!":"\u2709\uFE0F Wy\u015blij przez Outlook"
      )
    )
  );

  // ── PANEL PRAWA ──
  var rightContent;
  if(activeFolder==="compose"){
    rightContent=composerPanel;
  } else if(activeFolder==="drafts"){
    rightContent=ce("div",{style:{height:"100%",overflowY:"auto"}},
      ce(DraftsView,{drafts:drafts,onOpen:openDraft,onDelete:deleteDraft}));
  } else if(activeFolder==="templates"){
    rightContent=ce(TemplatesView,{templates:MAIL_TEMPLATES,onUseTemplate:useTemplate});
  } else {
    var folderMails=allMails.filter(function(m){return m.folder===activeFolder;});
    rightContent=ce("div",{style:{display:"flex",gap:14,height:"100%",minHeight:0}},
      ce("div",{style:{flex:"0 0 250px",height:"100%",overflow:"hidden",display:"flex",flexDirection:"column"}},
        ce(MailList,{mails:folderMails,onSelect:function(m){setSelMail(m);},selectedId:selMail?selMail.id:null})
      ),
      ce("div",{style:{flex:1,height:"100%",overflowY:"auto"}},
        ce(MailPreview,{mail:selMail,onCalendar:function(){if(selMail)setCalMail(selMail);},
          customFolders:userFolders,onMove:moveMail})
      )
    );
  }

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%",gap:0}},

    // Topbar
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"8px 12px",background:"var(--bg2)",borderRadius:10,marginBottom:12,
      border:"1px solid var(--bd2)",flexShrink:0}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:8}},
        ce("div",{style:{width:8,height:8,borderRadius:"50%",background:"#10b981"}}),
        ce("span",{style:{fontSize:12,color:"var(--t2)"}},"Zalogowano: ",
          ce("strong",{style:{color:"var(--t1)"}},"paulina@porterdesign.pl"))
      ),
      ce("button",{onClick:function(){setMsalLoggedIn(false);},
        style:{fontSize:11,color:"var(--t3)",border:"none",background:"none",cursor:"pointer",padding:"2px 6px"}},
        "Wyloguj")
    ),

    // Banner: Calendar saved
    calSaved?ce("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",
      background:"#d1fae5",borderRadius:9,marginBottom:10,flexShrink:0,
      border:"1px solid #6ee7b7",fontSize:13,color:"#065f46"}},
      "\uD83D\uDCC5 Dodano do kalendarza: ",
      ce("strong",null,calSaved.summary),
      ce("button",{onClick:function(){setCalSaved(null);},
        style:{marginLeft:"auto",border:"none",background:"none",cursor:"pointer",color:"#065f46",fontSize:18,lineHeight:1}},"\u00d7")
    ):null,

    // Main layout
    ce("div",{style:{display:"flex",flex:1,minHeight:0,gap:0}},

      // ── SIDEBAR ──
      ce("div",{style:{width:190,flexShrink:0,display:"flex",flexDirection:"column",
        borderRight:"1px solid var(--bd2)",paddingRight:10,marginRight:14,overflowY:"auto"}},

        SYSTEM_FOLDERS.map(function(f){
          var active=activeFolder===f.id;
          var badge=f.id==="drafts"&&drafts.length>0?drafts.length:null;
          return ce("button",{key:f.id,onClick:function(){setActiveFolder(f.id);setSelMail(null);},
            style:{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:9,
              border:"none",background:active?"var(--grl)":"transparent",
              color:active?"var(--grd)":"var(--t2)",fontSize:13,fontWeight:active?700:500,
              cursor:"pointer",display:"flex",alignItems:"center",gap:8,marginBottom:2,transition:"background .12s"}},
            ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
            ce("span",{style:{flex:1}},f.label),
            badge?ce("span",{style:{background:"var(--gr)",color:"#fff",borderRadius:10,
              fontSize:10,fontWeight:700,padding:"1px 6px"}},badge):null
          );
        }),

        userFolders.length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",marginTop:8,paddingTop:8}},
          ce("div",{style:{fontSize:10,color:"var(--t3)",fontWeight:700,letterSpacing:"0.07em",
            textTransform:"uppercase",padding:"0 6px",marginBottom:6}},"Moje foldery"),
          userFolders.map(function(f){
            var active=activeFolder===f.id;
            var cnt=allMails.filter(function(m){return m.folder===f.id;}).length;
            return ce("button",{key:f.id,onClick:function(){setActiveFolder(f.id);setSelMail(null);},
              style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:9,
                border:"none",background:active?"var(--grl)":"transparent",
                color:active?"var(--grd)":"var(--t2)",fontSize:13,fontWeight:active?700:500,
                cursor:"pointer",display:"flex",alignItems:"center",gap:8,marginBottom:2}},
              ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
              ce("span",{style:{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.label),
              cnt>0?ce("span",{style:{fontSize:10,color:"var(--t3)"}},cnt):null
            );
          })
        ):null,

        ce("button",{onClick:function(){setShowNewFolder(true);},
          style:{marginTop:userFolders.length>0?4:12,width:"100%",textAlign:"left",
            padding:"7px 10px",borderRadius:9,border:"1px dashed var(--bd2)",
            background:"transparent",color:"var(--t3)",fontSize:12,cursor:"pointer",
            display:"flex",alignItems:"center",gap:6}},
          "\u002B Nowy folder")
      ),

      // ── CONTENT ──
      ce("div",{style:{flex:1,minWidth:0,height:"100%",display:"flex",flexDirection:"column"}},
        rightContent)
    ),

    // Modal: Google Calendar
    calMail&&!calSaved?ce(ModalCalendar,{
      mail:calMail,
      onClose:function(){setCalMail(null);},
      onSave:function(evt){setCalSaved(evt);setCalMail(null);}
    }):null,

    // Modal: nowy folder
    showNewFolder?ce(ModalNewFolder,{
      onClose:function(){setShowNewFolder(false);},
      onSave:function(f){
        setUserFolders(function(prev){return prev.concat([f]);});
        setShowNewFolder(false);
        setActiveFolder(f.id);
      }
    }):null
  );
}

// ── CRM ─────────────────────────────────────────────────────────────────────
