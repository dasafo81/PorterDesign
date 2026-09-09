// src/components/MailShared.jsx
// Male kawalki modulu Mail wspoldzielone ze ScreenCRM. Wydzielone, bo statyczny
// import z ScreenCRM (ekran domyslny, ladowany zawsze) wciagal caly ScreenMail.jsx
// razem z MSAL do glownego bundla i kasowal efekt lazy-loadingu w App.jsx.
import React from 'react';
import { roundTo10 } from '../constants/data.js';
const ce = React.createElement;

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
          background:"var(--menu-bg)",border:"1px solid var(--bd2)",borderRadius:8,
          boxShadow:"0 10px 30px rgba(0,0,0,0.22)",zIndex:200,padding:8,
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
