import React, { useState, useRef, useEffect } from 'react';
import { roundTo10 } from '../constants/data.js';
const ce = React.createElement;

// ── MOCK DATA ────────────────────────────────────────────────────────────────

export const MOCK_SENT = [
  {id:"m1", folder:"sent", to:"anna.kowalska@gmail.com", toName:"Anna Kowalska", subject:"Oferta ara\u017cacji okiennych \u2013 Salon", date:"2025-04-22T10:14:00", preview:"W nawi\u0105zaniu do naszego spotkania, przesy\u0142am PDF z wycen\u0105...", body:"Dzie\u0144 dobry,\n\nW nawi\u0105zaniu do naszego spotkania, przesy\u0142am w za\u0142\u0105czeniu PDF z wycen\u0105 Pani zam\u00f3wienia.\n\nOrientacyjna warto\u015b\u0107 realizacji: 4 800 z\u0142 brutto\n(zaliczka 50% = 2 400 z\u0142)\n\nPozdrawiam serdecznie,\nPaulina Porter", attachments:[{id:"a1",name:"Oferta_Kowalska.pdf",size:142000,type:"app"}]},
  {id:"m2", folder:"sent", to:"marek.nowak@wp.pl", toName:"Marek Nowak", subject:"Potwierdzenie zam\u00f3wienia \u2013 rolety zaciemniaj\u0105ce", date:"2025-04-18T14:32:00", preview:"Dzi\u0119kuj\u0119 za wp\u0142at\u0119 zaliczki. Potwierdzam przyj\u0119cie zam\u00f3wienia...", body:"Dzie\u0144 dobry,\n\nDzi\u0119kuj\u0119 za wp\u0142at\u0119 zaliczki. Potwierdzam przyj\u0119cie zam\u00f3wienia na rolety zaciemniaj\u0105ce.\n\nCzas realizacji: ok. 4 tygodnie.\n\nPozdrawiam,\nPaulina Porter", attachments:[]},
  {id:"m3", folder:"sent", to:"julia.wozniak@onet.pl", toName:"Julia Wo\u017aniak", subject:"Przypomnienie \u2013 wycena zas\u0142on", date:"2025-04-10T09:05:00", preview:"Pozwalam sobie przypomnie\u0107 o przes\u0142anej wycenie zas\u0142on...", body:"Dzie\u0144 dobry,\n\nPozwalam sobie przypomnie\u0107 o przes\u0142anej wycenie zas\u0142on do salonu. Je\u015bli ma Pani pytania, ch\u0119tnie si\u0119 spotkam.\n\nPozdrawiam,\nPaulina Porter", attachments:[]}
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
  var cl=client||{};
  var honorific=cl.gender==="male"?"Pana":"Pani";
  var honorific2=cl.gender==="male"?"Pan":"Pani";
  var total=0;
  if(cl.rooms){
    total=roundTo10((cl.rooms||[]).reduce(function(a,r){
      return a+(r.windows||[]).reduce(function(b,w){
        return b+(w.products||[]).reduce(function(c,p){return c+(p.mp!=null?p.mp:0);},0);
      },0);
    },0));
  }
  var zaliczka=roundTo10(total*0.5);
  return {
    subject:tpl.subject.replace("{clientName}",cl.name||"").replace("{honorific}",honorific),
    body:tpl.body.replace(/{honorific2}/g,honorific2).replace(/{honorific}/g,honorific)
      .replace(/{clientName}/g,cl.name||"").replace(/{total}/g,total>0?String(total):"___")
      .replace(/{zaliczka}/g,zaliczka>0?String(zaliczka):"___")
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
  var d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);
  var p=function(x){return String(x).padStart(2,"0");};
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":00";
}

function initials(name){
  if(!name)return "?";
  var parts=name.trim().split(" ");
  if(parts.length>=2)return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
  return name[0].toUpperCase();
}

// ── STAŁE STYLOWE ────────────────────────────────────────────────────────────

var S = {
  // Panel + karty
  panel: {background:"var(--bg1)",height:"100%",display:"flex",flexDirection:"column"},
  card: {background:"var(--bg2)",borderRadius:12,border:"1px solid var(--bd2)"},
  // Typografia
  labelSm: {fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--t3)"},
  // Inputy
  inp: {width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:13,
    border:"1px solid var(--bd2)",borderRadius:9,background:"var(--bg)",
    color:"var(--t1)",outline:"none",fontFamily:"inherit",lineHeight:1.4},
  // Avatar krąg
  avatar: function(size,bg){return {width:size,height:size,borderRadius:"50%",
    background:bg||"#c8a96a",display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:size*0.38,fontWeight:700,color:"#fff",flexShrink:0,userSelect:"none"};},
  // Przycisk główny
  btnPrimary: {padding:"10px 18px",borderRadius:9,border:"none",background:"var(--t1)",
    color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",
    display:"flex",alignItems:"center",justifyContent:"center",gap:6},
  // Przycisk ghost
  btnGhost: {padding:"8px 14px",borderRadius:9,border:"1px solid var(--bd2)",
    background:"var(--bg2)",color:"var(--t2)",fontSize:12,fontWeight:600,cursor:"pointer",
    display:"flex",alignItems:"center",gap:5},
  // Separator
  sep: {borderTop:"1px solid var(--bd2)",margin:"10px 0"}
};

// ── MODAL: GOOGLE CALENDAR ────────────────────────────────────────────────────

function ModalCalendar(p){
  var useState=React.useState;
  var sd=useState(nextHourStr()),dtVal=sd[0],setDtVal=sd[1];
  var sdur=useState(60),dur=sdur[0],setDur=sdur[1];
  var stitle=useState("Follow-up: "+(p.mail?p.mail.toName||p.mail.to:"")),title=stitle[0],setTitle=stitle[1];
  var snote=useState(p.mail?"Temat maila: "+(p.mail.subject||""):""),note=snote[0],setNote=snote[1];
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,
    display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
    ce("div",{style:{background:"var(--bg1)",borderRadius:16,padding:28,width:"100%",maxWidth:420,
      boxShadow:"0 20px 60px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",gap:16}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:4}},
        ce("div",{style:{width:44,height:44,borderRadius:12,background:"#4285f4",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}},"\uD83D\uDCC5"),
        ce("div",{style:{flex:1}},
          ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},"Dodaj do Google Calendar"),
          ce("div",{style:{fontSize:12,color:"var(--t3)",marginTop:2}},"Zaplanuj follow-up po wys\u0142aniu maila")
        ),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",width:28,height:28,borderRadius:8,
          cursor:"pointer",color:"var(--t3)",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",
          background:"var(--bg2)"}},"\u00d7")
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Tytu\u0142 zdarzenia"),
        ce("input",{type:"text",value:title,onChange:function(e){setTitle(e.target.value);},style:S.inp})
      ),
      ce("div",{style:{display:"flex",gap:10}},
        ce("div",{style:{flex:2}},
          ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Data i godzina"),
          ce("input",{type:"datetime-local",value:dtVal,onChange:function(e){setDtVal(e.target.value);},style:S.inp})
        ),
        ce("div",{style:{flex:1}},
          ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Czas"),
          ce("select",{value:dur,onChange:function(e){setDur(Number(e.target.value));},
            style:Object.assign({},S.inp,{appearance:"none",WebkitAppearance:"none"})},
            ce("option",{value:15},"15 min"),
            ce("option",{value:30},"30 min"),
            ce("option",{value:60},"1 godz"),
            ce("option",{value:90},"1,5 godz"),
            ce("option",{value:120},"2 godz")
          )
        )
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Notatka"),
        ce("textarea",{value:note,onChange:function(e){setNote(e.target.value);},rows:3,
          style:Object.assign({},S.inp,{resize:"vertical",lineHeight:1.6})})
      ),
      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:p.onClose,style:S.btnGhost},"Anuluj"),
        ce("button",{onClick:function(){
            var evt={summary:title,description:note,
              start:{dateTime:new Date(dtVal).toISOString()},
              end:{dateTime:new Date(new Date(dtVal).getTime()+dur*60000).toISOString()}};
            p.onSave(evt);
          },
          style:Object.assign({},S.btnPrimary,{flex:1,background:"#4285f4"})},
          "\uD83D\uDCC5 Zapisz w kalendarzu"
        )
      ),
      ce("div",{style:{fontSize:10,color:"var(--t3)",textAlign:"center"}},"Prototyp \u2014 Google Calendar API OAuth2 w pe\u0142nej wersji")
    )
  );
}

// ── MODAL: NOWY FOLDER ───────────────────────────────────────────────────────

function ModalNewFolder(p){
  var useState=React.useState;
  var sn=useState(""),name=sn[0],setName=sn[1];
  var ICONS=["\uD83D\uDCC1","\u2B50","\uD83D\uDCBC","\uD83D\uDD14","\uD83C\uDFE0","\uD83D\uDCA1","\uD83D\uDD12","\uD83C\uDF3F","\uD83D\uDCDD","\uD83D\uDD16"];
  var si=useState(ICONS[0]),icon=si[0],setIcon=si[1];
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,
    display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
    ce("div",{style:{background:"var(--bg1)",borderRadius:16,padding:28,width:"100%",maxWidth:360,
      boxShadow:"0 20px 60px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",gap:16}},
      ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
        ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},"Nowy folder"),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"var(--bg2)",width:28,height:28,
          borderRadius:8,cursor:"pointer",color:"var(--t3)",fontSize:18,display:"flex",
          alignItems:"center",justifyContent:"center"}},"\u00d7")
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Nazwa folderu"),
        ce("input",{type:"text",value:name,onChange:function(e){setName(e.target.value);},
          placeholder:"np. Realizacje 2025",style:S.inp,autoFocus:true})
      ),
      ce("div",null,
        ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:8})},"Ikona"),
        ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
          ICONS.map(function(ic){
            var active=icon===ic;
            return ce("button",{key:ic,onClick:function(){setIcon(ic);},
              style:{width:38,height:38,borderRadius:9,fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                border:"2px solid "+(active?"var(--gr)":"var(--bd2)"),
                background:active?"var(--grl)":"var(--bg2)",transition:"all .1s"}},ic);
          })
        )
      ),
      ce("div",{style:{display:"flex",gap:8}},
        ce("button",{onClick:p.onClose,style:S.btnGhost},"Anuluj"),
        ce("button",{onClick:function(){if(name.trim())p.onSave({id:"f_"+Date.now(),label:name.trim(),icon:icon,system:false});},
          disabled:!name.trim(),
          style:Object.assign({},S.btnPrimary,{flex:1,opacity:name.trim()?1:0.5,cursor:name.trim()?"pointer":"default"})},
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
  var sshow=useState(false),showPicker=sshow[0],setShowPicker=sshow[1];
  var tpl=MAIL_TEMPLATES.find(function(t){return t.id===p.selTemplate;})||MAIL_TEMPLATES[0];
  var suggested=tpl.suggestAttachments||[];

  function addFiles(e){
    var files=Array.from(e.target.files||[]);
    p.setAttachments(function(prev){return prev.concat(files.map(function(f){
      return {id:"att_"+Date.now()+"_"+f.name,name:f.name,size:f.size,type:"upload",file:f};
    }));});
    e.target.value="";
  }

  function addAppPdf(opt){
    if(p.attachments.find(function(a){return a.id===opt.id;}))return;
    p.setAttachments(function(prev){return prev.concat([{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}]);});
  }

  function remove(id){p.setAttachments(function(prev){return prev.filter(function(a){return a.id!==id;});});}

  return ce("div",{style:{marginBottom:12}},
    // Lista załączników
    p.attachments.length>0?ce("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}},
      p.attachments.map(function(att){
        return ce("div",{key:att.id,style:{display:"flex",alignItems:"center",gap:6,
          padding:"5px 10px 5px 8px",borderRadius:20,
          background:"var(--bg3)",border:"1px solid var(--bd2)",fontSize:12}},
          ce("span",{style:{fontSize:13}},att.type==="app"?"\uD83D\uDCC4":"\uD83D\uDCCE"),
          ce("span",{style:{color:"var(--t1)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},att.name),
          att.size?ce("span",{style:{color:"var(--t3)",fontSize:10}},fmtBytes(att.size)):
            ce("span",{style:{fontSize:10,color:"var(--gr)",fontWeight:600}},"z app"),
          ce("button",{onClick:function(){remove(att.id);},
            style:{border:"none",background:"none",cursor:"pointer",color:"var(--t3)",
              fontSize:14,lineHeight:1,padding:"0 2px",marginLeft:2,display:"flex",alignItems:"center"}},"\u00d7")
        );
      })
    ):null,

    // Przyciski
    ce("div",{style:{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}},
      ce("button",{onClick:function(){fileRef.current&&fileRef.current.click();},
        style:Object.assign({},S.btnGhost,{fontSize:12})},
        ce("span",{style:{fontSize:14}},"\uD83D\uDCCE"),"\u00a0Dodaj plik"
      ),
      ce("input",{ref:fileRef,type:"file",multiple:true,style:{display:"none"},onChange:addFiles}),

      p.selClient
        ?ce("div",{style:{position:"relative"}},
          ce("button",{onClick:function(){setShowPicker(function(v){return !v;});},
            style:Object.assign({},S.btnGhost,{fontSize:12,
              background:showPicker?"var(--grl)":"var(--bg2)",
              border:"1px solid "+(showPicker?"var(--gr)":"var(--bd2)"),
              color:showPicker?"var(--grd)":"var(--t2)"}),
            ce("span",{style:{fontSize:14}},"\uD83D\uDCC4"),"\u00a0PDF z wyceny",
            ce("span",{style:{fontSize:10,marginLeft:4}},"\u25be")
          ),
          showPicker?ce("div",{style:{position:"absolute",bottom:"calc(100% + 6px)",left:0,
            background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:12,
            boxShadow:"0 8px 30px rgba(0,0,0,0.18)",zIndex:300,minWidth:240,overflow:"hidden"}},
            ce("div",{style:{padding:"8px 0"}},
              APP_PDF_OPTIONS.map(function(opt){
                var already=!!p.attachments.find(function(a){return a.id===opt.id;});
                return ce("div",{key:opt.id,onClick:function(){if(!already){addAppPdf(opt);setShowPicker(false);}},
                  style:{padding:"9px 14px",fontSize:13,cursor:already?"default":"pointer",
                    display:"flex",alignItems:"center",gap:10,
                    background:already?"var(--bg3)":"transparent",
                    opacity:already?0.6:1,transition:"background .1s"}},
                  ce("span",{style:{fontSize:15}},opt.icon),
                  ce("span",{style:{color:"var(--t1)",flex:1}},opt.label),
                  already?ce("span",{style:{fontSize:10,color:"var(--gr)",fontWeight:700}},"✓"):null
                );
              })
            ),
            suggested.length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",padding:"8px 14px"}},
              ce("div",{style:Object.assign({},S.labelSm,{marginBottom:6})},"Sugerowane"),
              ce("div",{style:{display:"flex",gap:5,flexWrap:"wrap"}},
                suggested.map(function(sid){
                  var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
                  if(!opt)return null;
                  var already=!!p.attachments.find(function(a){return a.id===sid;});
                  return ce("button",{key:sid,onClick:function(){if(!already){addAppPdf(opt);setShowPicker(false);}},
                    style:{padding:"4px 10px",fontSize:11,borderRadius:20,cursor:already?"default":"pointer",
                      border:"1px solid var(--gr)",background:already?"var(--grl)":"transparent",
                      color:"var(--grd)",fontWeight:600,display:"flex",alignItems:"center",gap:4}},
                    opt.icon," ",opt.label.split(" ")[0]
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

// ── LISTA MAILI ──────────────────────────────────────────────────────────────

function MailList(p){
  var useState=React.useState;
  var sf=useState(""),filter=sf[0],setFilter=sf[1];
  var filtered=(p.mails||[]).filter(function(m){
    if(!filter)return true;
    var q=filter.toLowerCase();
    return (m.toName||"").toLowerCase().includes(q)||(m.to||"").toLowerCase().includes(q)||(m.subject||"").toLowerCase().includes(q);
  });

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%",gap:0}},
    // Search bar
    ce("div",{style:{padding:"0 0 10px 0",flexShrink:0}},
      ce("div",{style:{position:"relative"}},
        ce("span",{style:{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
          fontSize:13,color:"var(--t3)",pointerEvents:"none"}},"\uD83D\uDD0D"),
        ce("input",{type:"text",value:filter,onChange:function(e){setFilter(e.target.value);},
          placeholder:"Szukaj wiadomo\u015bci...",
          style:Object.assign({},S.inp,{paddingLeft:32,fontSize:12})})
      )
    ),

    // Lista
    ce("div",{style:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}},
      filtered.length===0
        ?ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          height:"100%",gap:8,color:"var(--t3)"}},
          ce("div",{style:{fontSize:32,opacity:0.4}},"\uD83D\uDCEC"),
          ce("div",{style:{fontSize:13}},"Brak wiadomo\u015bci")
        )
        :filtered.map(function(m){
          var sel=p.selectedId===m.id;
          var av=initials(m.toName||m.to);
          var colors=["#c8a96a","#8b7355","#a0956e","#7a6e52","#b8a882"];
          var colIdx=(m.toName||m.to||"").charCodeAt(0)%colors.length;
          return ce("div",{key:m.id,onClick:function(){p.onSelect(m);},
            style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",
              background:sel?"var(--wb)":"transparent",
              border:"1px solid "+(sel?"var(--wbd)":"transparent"),
              transition:"all .12s",display:"flex",gap:10,alignItems:"flex-start"}},
            // Avatar
            ce("div",S.avatar(34,sel?colors[colIdx]:colors[colIdx]+"99"),av),
            // Treść
            ce("div",{style:{flex:1,minWidth:0}},
              ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}},
                ce("span",{style:{fontSize:13,fontWeight:sel?700:600,color:"var(--t1)",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"68%"}},
                  m.toName||m.to),
                ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},fmtMailDate(m.date))
              ),
              ce("div",{style:{fontSize:12,color:sel?"var(--wt)":"var(--t2)",fontWeight:600,marginBottom:2,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.subject),
              ce("div",{style:{fontSize:11,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview),
              (m.attachments&&m.attachments.length>0)?ce("div",{style:{fontSize:10,color:"var(--t3)",marginTop:4,
                display:"flex",alignItems:"center",gap:3}},
                "\uD83D\uDCCE ",m.attachments.length," za\u0142\u0105cznik"+(m.attachments.length>1?"i":"")
              ):null
            )
          );
        })
    )
  );
}

// ── PODGLĄD MAILA ────────────────────────────────────────────────────────────

function MailPreview(p){
  var m=p.mail;
  var useState=React.useState;
  var smenu=useState(false),showMove=smenu[0],setShowMove=smenu[1];
  if(!m)return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",
    justifyContent:"center",height:"100%",gap:12,color:"var(--t3)"}},
    ce("div",{style:{fontSize:48,opacity:0.2}},"\uD83D\uDCE9"),
    ce("div",{style:{fontSize:13}},"Wybierz wiadomo\u015b\u0107 z listy")
  );

  var av=initials(m.toName||m.to);
  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%"}},
    // Header maila
    ce("div",{style:{padding:"16px 20px 14px",borderBottom:"1px solid var(--bd2)",flexShrink:0}},
      // Temat
      ce("div",{style:{fontWeight:700,fontSize:16,color:"var(--t1)",marginBottom:10,lineHeight:1.3}},m.subject),
      // Meta
      ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:12}},
        ce("div",S.avatar(36,"#c8a96a"),av),
        ce("div",{style:{flex:1}},
          ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)"}},m.toName||m.to),
          ce("div",{style:{fontSize:11,color:"var(--t3)"}},"\u2192 "+m.to)
        ),
        ce("div",{style:{fontSize:11,color:"var(--t3)"}}},
          new Date(m.date).toLocaleString("pl-PL",{day:"2-digit",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"})
        )
      ),
      // Załączniki w podglądzie
      (m.attachments&&m.attachments.length>0)?ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}},
        m.attachments.map(function(att){
          return ce("div",{key:att.id||att.name,style:{display:"flex",alignItems:"center",gap:6,
            padding:"5px 12px 5px 8px",borderRadius:20,background:"var(--bg3)",
            border:"1px solid var(--bd2)",fontSize:12}},
            ce("span",{style:{fontSize:13}},att.type==="app"?"\uD83D\uDCC4":"\uD83D\uDCCE"),
            ce("span",{style:{color:"var(--t1)"}},att.name),
            att.size?ce("span",{style:{color:"var(--t3)",fontSize:10,marginLeft:2}},fmtBytes(att.size)):null
          );
        })
      ):null,
      // Akcje
      ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        ce("button",{onClick:p.onCalendar,style:S.btnGhost},"\uD83D\uDCC5 Dodaj do kalendarza"),
        ce("div",{style:{position:"relative"}},
          ce("button",{onClick:function(){setShowMove(function(v){return !v;});},style:S.btnGhost},
            "\uD83D\uDCC1 Przenie\u015b \u25be"),
          showMove?ce("div",{style:{position:"absolute",top:"calc(100% + 4px)",left:0,
            background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:10,
            boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:300,minWidth:190,overflow:"hidden"}},
            (p.customFolders||[]).length===0
              ?ce("div",{style:{padding:"12px 14px",fontSize:12,color:"var(--t3)",fontStyle:"italic"}},"Brak w\u0142asnych folder\u00f3w")
              :(p.customFolders||[]).map(function(f){
                return ce("div",{key:f.id,onClick:function(){p.onMove(m,f.id);setShowMove(false);},
                  style:{padding:"9px 14px",fontSize:13,cursor:"pointer",
                    borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:8,
                    transition:"background .1s"}},
                  f.icon," ",f.label);
              })
          ):null
        )
      )
    ),
    // Treść
    ce("div",{style:{flex:1,overflowY:"auto",padding:"16px 20px",fontSize:13,
      color:"var(--t1)",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"inherit"}},
      m.body)
  );
}

// ── SZABLONY ─────────────────────────────────────────────────────────────────

function TemplatesView(p){
  var useState=React.useState;
  var ssel=useState(null),selId=ssel[0],setSelId=ssel[1];
  var sel=p.templates.find(function(t){return t.id===selId;})||null;
  return ce("div",{style:{display:"flex",height:"100%",gap:0}},
    ce("div",{style:{width:160,borderRight:"1px solid var(--bd2)",display:"flex",flexDirection:"column",
      paddingRight:0,overflowY:"auto"}},
      p.templates.map(function(tpl){
        var active=selId===tpl.id;
        return ce("div",{key:tpl.id,onClick:function(){setSelId(tpl.id);},
          style:{padding:"12px 14px",cursor:"pointer",borderBottom:"1px solid var(--bd3)",
            background:active?"var(--wb)":"transparent",
            borderLeft:"3px solid "+(active?"var(--wbd)":"transparent"),
            transition:"all .12s"}},
          ce("div",{style:{fontSize:18,marginBottom:4}},tpl.icon),
          ce("div",{style:{fontSize:13,fontWeight:active?700:500,color:"var(--t1)"}},tpl.label)
        );
      })
    ),
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",padding:"16px 20px",gap:12,minWidth:0}},
      sel?ce(React.Fragment,null,
        ce("div",{style:{fontWeight:700,fontSize:15,color:"var(--t1)"}},sel.icon+" "+sel.label),
        ce("div",{style:{fontSize:12,color:"var(--t3)",padding:"6px 10px",background:"var(--bg3)",
          borderRadius:8,fontFamily:"monospace"}},"Temat: "+sel.subject),
        ce("div",{style:{flex:1,padding:"14px",background:"var(--bg2)",borderRadius:10,border:"1px solid var(--bd2)",
          fontSize:13,color:"var(--t1)",lineHeight:1.8,whiteSpace:"pre-wrap",overflowY:"auto"}},
          sel.body||ce("em",{style:{color:"var(--t3)"}},"(pusty szablon)")),
        ce("button",{onClick:function(){p.onUseTemplate(sel);},
          style:Object.assign({},S.btnPrimary,{alignSelf:"flex-start"})},
          "\u270F\uFE0F U\u017cyj tego szablonu")
      ):ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        flex:1,gap:8,color:"var(--t3)"}},
        ce("div",{style:{fontSize:36,opacity:0.2}},"\uD83D\uDCCB"),
        ce("div",{style:{fontSize:13}},"Wybierz szablon z listy")
      )
    )
  );
}

// ── ROBOCZE ──────────────────────────────────────────────────────────────────

function DraftsView(p){
  if(!p.drafts||p.drafts.length===0)
    return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100%",gap:8,color:"var(--t3)"}},
      ce("div",{style:{fontSize:40,opacity:0.2}},"\uD83D\uDCDD"),
      ce("div",{style:{fontSize:13}},"Brak zapisanych projekt\u00f3w")
    );
  return ce("div",{style:{display:"flex",flexDirection:"column",gap:6,padding:"4px 0"}},
    p.drafts.map(function(d){
      return ce("div",{key:d.id,style:{display:"flex",alignItems:"center",gap:12,
        padding:"12px 16px",borderRadius:12,background:"var(--bg2)",border:"1px solid var(--bd2)",
        transition:"all .12s"}},
        ce("div",{style:{width:36,height:36,borderRadius:9,background:"var(--bg3)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}},"\uD83D\uDCDD"),
        ce("div",{style:{flex:1,cursor:"pointer",minWidth:0},onClick:function(){p.onOpen(d);}},
          ce("div",{style:{fontWeight:600,fontSize:13,color:"var(--t1)",marginBottom:2,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},d.subject||"(bez tematu)"),
          ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Do: "+(d.to||"\u2014")+" \u00b7 "+fmtMailDate(d.savedAt))
        ),
        ce("button",{onClick:function(){p.onDelete(d.id);},
          style:{border:"none",background:"var(--bg3)",borderRadius:8,cursor:"pointer",
            color:"var(--t3)",fontSize:14,width:30,height:30,display:"flex",
            alignItems:"center",justifyContent:"center"}},"\uD83D\uDDD1\uFE0F")
      );
    })
  );
}

// ── GŁÓWNY KOMPONENT ─────────────────────────────────────────────────────────

export function ScreenMail(p){
  var useState=React.useState, useEffect=React.useEffect;
  var clients=p.clients||[];

  var sa=useState(false),msalLoggedIn=sa[0],setMsalLoggedIn=sa[1];
  var suf=useState([]),userFolders=suf[0],setUserFolders=suf[1];
  var saf=useState("compose"),activeFolder=saf[0],setActiveFolder=saf[1];
  var snf=useState(false),showNewFolder=snf[0],setShowNewFolder=snf[1];
  var smails=useState(MOCK_SENT),allMails=smails[0],setAllMails=smails[1];
  var ssel=useState(null),selMail=ssel[0],setSelMail=ssel[1];
  var sdr=useState([]),drafts=sdr[0],setDrafts=sdr[1];
  var sc=useState(null),selClientId=sc[0],setSelClientId=sc[1];
  var st=useState("oferta"),selTemplate=st[0],setSelTemplate=st[1];
  var sto=useState(""),toEmail=sto[0],setToEmail=sto[1];
  var ssub=useState(""),subject=ssub[0],setSubject=ssub[1];
  var sbod=useState(""),body=sbod[0],setBody=sbod[1];
  var satt=useState([]),attachments=satt[0],setAttachments=satt[1];
  var scon=useState([]),contactSug=scon[0],setContactSug=scon[1];
  var ssent=useState(false),justSent=ssent[0],setJustSent=ssent[1];
  var ssending=useState(false),sending=ssending[0],setSending=ssending[1];
  var scal=useState(null),calMail=scal[0],setCalMail=scal[1];
  var scalok=useState(null),calSaved=scalok[0],setCalSaved=scalok[1];

  var selClient=clients.find(function(c){return String(c.id)===String(selClientId);})||null;

  useEffect(function(){
    var tpl=MAIL_TEMPLATES.find(function(t){return t.id===selTemplate;})||MAIL_TEMPLATES[0];
    var filled=fillTemplate(tpl,selClient);
    setSubject(filled.subject); setBody(filled.body);
    if(selClient&&selClient.email)setToEmail(selClient.email);
    if(selClient&&tpl.suggestAttachments&&tpl.suggestAttachments.length>0){
      setAttachments(tpl.suggestAttachments.map(function(sid){
        var opt=APP_PDF_OPTIONS.find(function(o){return o.id===sid;});
        return opt?{id:opt.id,name:opt.label+".pdf",size:null,type:"app"}:null;
      }).filter(Boolean));
    } else { setAttachments([]); }
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

  // ── COMPOSER ──
  var composerPanel=ce("div",{style:{flex:1,display:"flex",flexDirection:"column",overflowY:"auto",paddingRight:2,gap:0}},
    ce("div",{style:Object.assign({},S.labelSm,{marginBottom:12})},"Nowa wiadomo\u015b\u0107"),

    // Klient
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Klient"),
      ce("select",{value:selClientId||"",onChange:function(e){setSelClientId(e.target.value||null);},
        style:Object.assign({},S.inp,{appearance:"none",WebkitAppearance:"none"})},
        ce("option",{value:""},"— wybierz klienta —"),
        clients.map(function(cl){return ce("option",{key:cl.id,value:String(cl.id)},cl.name+(cl.email?" ("+cl.email+")":""));})
      )
    ),

    // Szablony
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Szablon"),
      ce("div",{style:{display:"flex",gap:5,flexWrap:"wrap"}},
        MAIL_TEMPLATES.map(function(tpl){
          var active=selTemplate===tpl.id;
          return ce("button",{key:tpl.id,onClick:function(){setSelTemplate(tpl.id);},
            style:{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:active?700:500,
              border:"1px solid "+(active?"var(--wbd)":"var(--bd2)"),
              background:active?"var(--wb)":"var(--bg2)",
              color:active?"var(--wt)":"var(--t2)",cursor:"pointer",transition:"all .12s"}},
            tpl.icon+" "+tpl.label);
        })
      )
    ),

    // Do:
    ce("div",{style:{marginBottom:10,position:"relative"}},
      ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Do:"),
      ce("input",{type:"email",value:toEmail,onChange:function(e){onToChange(e.target.value);},
        placeholder:"adres@email.com",style:S.inp}),
      contactSug.length>0?ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,
        background:"var(--bg1)",border:"1px solid var(--bd2)",borderRadius:10,zIndex:200,
        boxShadow:"0 8px 24px rgba(0,0,0,0.15)",overflow:"hidden",marginTop:2}},
        contactSug.map(function(c){
          return ce("div",{key:c.email,onClick:function(){pickContact(c);},
            style:{padding:"9px 12px",fontSize:13,cursor:"pointer",
              borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:10,
              transition:"background .1s"}},
            ce("div",S.avatar(28,"#c8a96a"),initials(c.name)),
            ce("div",null,
              ce("div",{style:{fontWeight:600,color:"var(--t1)",fontSize:13}},c.name),
              ce("div",{style:{color:"var(--t3)",fontSize:11}},c.email)
            )
          );
        })
      ):null
    ),

    // Temat
    ce("div",{style:{marginBottom:10}},
      ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Temat"),
      ce("input",{type:"text",value:subject,onChange:function(e){setSubject(e.target.value);},
        placeholder:"Temat wiadomo\u015bci",style:S.inp})
    ),

    // Treść
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",marginBottom:10}},
      ce("label",{style:Object.assign({},S.labelSm,{display:"block",marginBottom:6})},"Tre\u015b\u0107"),
      ce("textarea",{value:body,onChange:function(e){setBody(e.target.value);},
        style:Object.assign({},S.inp,{flex:1,minHeight:180,resize:"vertical",lineHeight:1.7})})
    ),

    // Załączniki
    ce(AttachmentsSection,{attachments:attachments,setAttachments:setAttachments,
      selClient:selClient,selTemplate:selTemplate}),

    // Akcje
    ce("div",{style:{display:"flex",gap:8,paddingTop:4,borderTop:"1px solid var(--bd2)"}},
      ce("button",{onClick:handleSaveDraft,disabled:!toEmail&&!subject&&!body,
        style:Object.assign({},S.btnGhost,{opacity:(!toEmail&&!subject&&!body)?0.4:1})},
        "\uD83D\uDCDD Zapisz roboczy"),
      ce("button",{onClick:handleSend,disabled:!toEmail||!subject||!body||sending,
        style:Object.assign({},S.btnPrimary,{flex:1,
          background:justSent?"#059669":sending?"var(--bd2)":"var(--t1)",
          transition:"background .3s",opacity:(!toEmail||!subject||!body||sending)?0.6:1,
          cursor:(!toEmail||!subject||!body||sending)?"default":"pointer"})},
        sending?"\u2026 Wysy\u0142anie":justSent?"\u2713 Wys\u0142ano!":"\uD83D\uDCEC Wy\u015blij przez Outlook"
      )
    )
  );

  // ── PRAWA CZĘŚĆ ──
  var rightContent;
  if(activeFolder==="compose"){
    rightContent=composerPanel;
  } else if(activeFolder==="drafts"){
    rightContent=ce("div",{style:{height:"100%",overflowY:"auto",padding:"2px 0"}},
      ce(DraftsView,{drafts:drafts,onOpen:openDraft,onDelete:function(id){setDrafts(function(prev){return prev.filter(function(x){return x.id!==id;});});}}));
  } else if(activeFolder==="templates"){
    rightContent=ce(TemplatesView,{templates:MAIL_TEMPLATES,onUseTemplate:function(tpl){setSelTemplate(tpl.id);setActiveFolder("compose");}});
  } else {
    var folderMails=allMails.filter(function(m){return m.folder===activeFolder;});
    rightContent=ce("div",{style:{display:"flex",height:"100%",minHeight:0}},
      ce("div",{style:{width:280,flexShrink:0,borderRight:"1px solid var(--bd2)",
        paddingRight:12,display:"flex",flexDirection:"column"}},
        ce(MailList,{mails:folderMails,onSelect:setSelMail,selectedId:selMail?selMail.id:null})),
      ce("div",{style:{flex:1,minWidth:0,overflow:"hidden"}},
        ce(MailPreview,{mail:selMail,onCalendar:function(){if(selMail)setCalMail(selMail);},
          customFolders:userFolders,onMove:moveMail}))
    );
  }

  // ── LOGIN SCREEN ──
  if(!msalLoggedIn){
    return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:"40px 20px",minHeight:300,gap:16,textAlign:"center"}},
      ce("div",{style:{width:64,height:64,borderRadius:16,background:"#0078d4",
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:4}},"\u2709\uFE0F"),
      ce("div",{style:{fontSize:17,fontWeight:700,color:"var(--t1)"}},"Modu\u0142 Mail"),
      ce("div",{style:{fontSize:13,color:"var(--t2)",maxWidth:280,lineHeight:1.7}},
        "Zaloguj si\u0119 kontem Microsoft, by wysy\u0142a\u0107 maile przez Outlooka."),
      ce("button",{onClick:function(){setMsalLoggedIn(true);},
        style:{display:"flex",alignItems:"center",gap:12,padding:"12px 24px",borderRadius:10,
          border:"1px solid var(--bd2)",background:"var(--bg2)",cursor:"pointer",
          fontSize:14,fontWeight:600,color:"var(--t1)",marginTop:8,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}},
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

  return ce("div",{style:{display:"flex",flexDirection:"column",height:"100%",gap:0}},

    // ── TOPBAR ──
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"7px 14px",background:"var(--bg2)",borderRadius:10,marginBottom:12,
      border:"1px solid var(--bd2)",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:8}},
        ce("div",{style:{width:8,height:8,borderRadius:"50%",background:"#10b981",flexShrink:0,
          boxShadow:"0 0 0 2px rgba(16,185,129,0.2)"}}),
        ce("span",{style:{fontSize:12,color:"var(--t2)"}},"Zalogowano jako\u00a0",
          ce("strong",{style:{color:"var(--t1)"}},"paulina@porterdesign.pl"))
      ),
      ce("button",{onClick:function(){setMsalLoggedIn(false);},
        style:{fontSize:11,color:"var(--t3)",border:"none",background:"none",
          cursor:"pointer",padding:"4px 8px",borderRadius:6}},
        "Wyloguj")
    ),

    // ── BANNER: Kalendarz zapisany ──
    calSaved?ce("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
      background:"#ecfdf5",borderRadius:10,marginBottom:10,flexShrink:0,
      border:"1px solid #6ee7b7",fontSize:13,color:"#065f46",
      boxShadow:"0 2px 8px rgba(16,185,129,0.12)"}},
      ce("span",{style:{fontSize:18}},"\uD83D\uDCC5"),
      ce("div",null,"Dodano do kalendarza: ",ce("strong",null,calSaved.summary)),
      ce("button",{onClick:function(){setCalSaved(null);},
        style:{marginLeft:"auto",border:"none",background:"rgba(6,95,70,0.08)",
          borderRadius:6,cursor:"pointer",color:"#065f46",fontSize:16,
          width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center"}},"\u00d7")
    ):null,

    // ── GŁÓWNY UKŁAD ──
    ce("div",{style:{display:"flex",flex:1,minHeight:0,gap:0}},

      // ── SIDEBAR ──
      ce("div",{style:{width:186,flexShrink:0,display:"flex",flexDirection:"column",
        borderRight:"1px solid var(--bd2)",paddingRight:8,marginRight:14,overflowY:"auto"}},

        // Foldery systemowe
        SYSTEM_FOLDERS.map(function(f){
          var active=activeFolder===f.id;
          var badge=f.id==="drafts"&&drafts.length>0?drafts.length:null;
          return ce("button",{key:f.id,onClick:function(){setActiveFolder(f.id);setSelMail(null);},
            style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:9,
              border:"none",
              background:active?"var(--wb)":"transparent",
              color:active?"var(--wt)":"var(--t2)",
              fontSize:13,fontWeight:active?700:500,
              cursor:"pointer",display:"flex",alignItems:"center",gap:8,marginBottom:1,
              transition:"all .1s",borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
            ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
            ce("span",{style:{flex:1}},f.label),
            badge?ce("span",{style:{background:"var(--wbd)",color:"var(--wt)",borderRadius:10,
              fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:18,textAlign:"center"}},badge):null
          );
        }),

        // Własne foldery
        userFolders.length>0?ce("div",{style:{borderTop:"1px solid var(--bd2)",marginTop:8,paddingTop:8}},
          ce("div",{style:Object.assign({},S.labelSm,{padding:"0 8px",marginBottom:6})},"Moje foldery"),
          userFolders.map(function(f){
            var active=activeFolder===f.id;
            var cnt=allMails.filter(function(m){return m.folder===f.id;}).length;
            return ce("button",{key:f.id,onClick:function(){setActiveFolder(f.id);setSelMail(null);},
              style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:9,
                border:"none",background:active?"var(--wb)":"transparent",
                color:active?"var(--wt)":"var(--t2)",fontSize:13,fontWeight:active?700:500,
                cursor:"pointer",display:"flex",alignItems:"center",gap:8,marginBottom:1,
                transition:"all .1s",borderLeft:"3px solid "+(active?"var(--wbd)":"transparent")}},
              ce("span",{style:{fontSize:15,width:20,textAlign:"center",flexShrink:0}},f.icon),
              ce("span",{style:{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.label),
              cnt>0?ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},cnt):null
            );
          })
        ):null,

        // Nowy folder
        ce("button",{onClick:function(){setShowNewFolder(true);},
          style:{marginTop:userFolders.length>0?4:12,width:"100%",textAlign:"left",
            padding:"7px 10px",borderRadius:9,border:"1px dashed var(--bd2)",
            background:"transparent",color:"var(--t3)",fontSize:12,cursor:"pointer",
            display:"flex",alignItems:"center",gap:6,transition:"all .12s"}},
          "\u002B Nowy folder")
      ),

      // ── TREŚĆ ──
      ce("div",{style:{flex:1,minWidth:0,height:"100%",display:"flex",flexDirection:"column",
        overflow:"hidden"}},
        rightContent)
    ),

    // ── MODALS ──
    calMail&&!calSaved?ce(ModalCalendar,{
      mail:calMail,onClose:function(){setCalMail(null);},
      onSave:function(evt){setCalSaved(evt);setCalMail(null);}
    }):null,

    showNewFolder?ce(ModalNewFolder,{
      onClose:function(){setShowNewFolder(false);},
      onSave:function(f){
        setUserFolders(function(prev){return prev.concat([f]);});
        setShowNewFolder(false); setActiveFolder(f.id);
      }
    }):null
  );
}

// ── CRM ─────────────────────────────────────────────────────────────────────
