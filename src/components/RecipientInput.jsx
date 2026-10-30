import React, { useState, useRef } from 'react';
const ce = React.createElement;

// Pole z listą adresów oddzielonych przecinkiem/średnikiem. Podpowiedzi dotyczą
// ostatniego (właśnie wpisywanego) adresu, a wybór podpowiedzi podmienia tylko jego.

// Zwraca {head, token}: head = wszystko do ostatniego separatora (z separatorem), token = ostatni fragment.
export function splitLastRecipient(value){
  var s=String(value||"");
  var i=Math.max(s.lastIndexOf(","),s.lastIndexOf(";"));
  return {head:s.slice(0,i+1),token:s.slice(i+1).trim()};
}

// Podmienia ostatni fragment na wybrany adres i dopisuje ", " — od razu można wpisywać kolejny.
export function applyRecipient(value,email){
  var p=splitLastRecipient(value);
  var head=p.head.replace(/\s+$/,"");
  return (head?head+" ":"")+email+", ";
}

// Lista adresów z pola (do wysyłki / zapisu historii).
export function parseRecipientList(value){
  return String(value||"").split(/[,;]/).map(function(s){return s.trim();}).filter(Boolean);
}

// props: value, onChange(newValue), suggest(query, cb) — cb(items) może być wołany wiele razy
// (np. najpierw lokalne, potem z bazy), onPick(item) opcjonalnie, placeholder, style, minChars
export function RecipientInput(p){
  var sS=useState([]),items=sS[0],setItems=sS[1];
  var focusRef=useRef(false);
  var seqRef=useRef(0);
  var minChars=p.minChars||2;

  function refresh(value){
    var q=splitLastRecipient(value).token;
    var seq=++seqRef.current;
    if(q.length<minChars){setItems([]);return;}
    p.suggest(q.toLowerCase(),function(list){
      if(seq!==seqRef.current||!focusRef.current)return;
      setItems((list||[]).slice(0,8));
    });
  }

  function pick(c){
    seqRef.current++;
    p.onChange(applyRecipient(p.value,c.email));
    if(p.onPick)p.onPick(c);
    setItems([]);
  }

  return ce("div",{style:{position:"relative"}},
    ce("input",{type:"text",autoComplete:"off",value:p.value,placeholder:p.placeholder||"adres@email.com",style:p.style,
      onChange:function(e){focusRef.current=true;p.onChange(e.target.value);refresh(e.target.value);},
      onFocus:function(){focusRef.current=true;refresh(p.value);},
      onBlur:function(){focusRef.current=false;seqRef.current++;setTimeout(function(){setItems([]);},150);},
      onKeyDown:function(e){if(e.key==="Escape")setItems([]);}}),
    items.length>0?ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:"var(--menu-bg, var(--bg))",border:"1px solid var(--bd2)",borderRadius:10,zIndex:9999,boxShadow:"0 10px 30px rgba(0,0,0,0.22)",overflow:"hidden",marginTop:2,maxHeight:280,overflowY:"auto"}},
      items.map(function(c){
        return ce("div",{key:c.email+"|"+(c.clientId||""),
          onMouseDown:function(e){e.preventDefault();pick(c);},
          style:{padding:"9px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd3)",display:"flex",alignItems:"center",gap:10}},
          ce("div",{style:{minWidth:0}},
            ce("div",{style:{fontWeight:600,color:"var(--t1)",fontSize:13}},c.name||c.email),
            c.name?ce("div",{style:{color:"var(--t3)",fontSize:11}},c.email):null
          ),
          c.clientId?ce("span",{style:{marginLeft:"auto",fontSize:10,fontWeight:700,color:"var(--grd)",background:"var(--grl)",borderRadius:10,padding:"2px 8px",whiteSpace:"nowrap"}},"📄 "+(c.quoteNo||"wycena")):null
        );
      })
    ):null
  );
}
