import React, { useState } from 'react';
import { buildFabricRows, mg } from '../constants/data.js';
import { buildFabricOrderHtmlFromRows, generateFabricOrderPDFFromRows } from '../lib/pdf.js';
const ce = React.createElement;

// Zbiorcze zamówienie tkanin: zaznaczamy kilku klientów z ostatnich wycen, system
// zlicza metraż tej samej tkaniny (i koloru) u jednego producenta i wystawia
// jedno zamówienie na producenta. Wiersze są tylko do odczytu — korekty robi się
// w wycenie / zamówieniu danego klienta.
function fmt(n){ return (Math.round(n*100)/100).toFixed(2).replace(".",","); }

export function ScreenFabricBulk(p){
  var clients=(p.clients||[]).filter(function(c){return c.status!=="odrzucone";});
  var ts=useState(function(){var o={};(p.initialIds||[]).forEach(function(id){o[id]=true;});return o;}),sel=ts[0],setSel=ts[1];
  var ns=useState(""),notes=ns[0],setNotes=ns[1];
  var qs=useState(""),q=qs[0],setQ=qs[1];
  // Pozycje usunięte z zamówienia i ręcznie ustawiony metraż zamówienia.
  var rs=useState({}),removed=rs[0],setRemoved=rs[1];
  var ss=useState({}),qty=ss[0],setQty=ss[1];
  var fs=useState({}),fabNote=fs[0],setFabNote=fs[1];

  var recent=clients.slice().sort(function(a,b){
    return String(b.updated_at||b.created_at||"").localeCompare(String(a.updated_at||a.created_at||""));
  });
  var ql=q.toLowerCase().trim();
  var shown=recent.filter(function(c){return !ql||(c.name||"").toLowerCase().indexOf(ql)>=0;}).slice(0,ql?100:30);
  var chosen=recent.filter(function(c){return sel[c.id];});

  // Wiersze wszystkich zaznaczonych klientów, z klientem w polu "Przeznaczenie".
  var rows=[];
  chosen.forEach(function(c){
    buildFabricRows(c).filter(function(r){return r.metry&&r.metry>0;}).forEach(function(r){
      var prod=r.prod||"Inny"; if(prod==="-")prod="Bez producenta";
      rows.push(mg(r,{prod:prod,roomWin:(c.name||"klient")+" / "+r.room+" / "+r.win,_client:c.name||"klient"}));
    });
  });
  var bySup={},supKeys=[];
  rows.forEach(function(r){
    if(!bySup[r.prod]){bySup[r.prod]={sup:r.prod,rows:[],fabs:{},fabKeys:[],total:0};supKeys.push(r.prod);}
    var g=bySup[r.prod]; g.rows.push(r); g.total+=r.metry;
    var fk=(r.fabName||"-")+"||"+(r.kolor||"-");
    if(!g.fabs[fk]){g.fabs[fk]={fabName:r.fabName||"-",kolor:r.kolor||"-",metry:0,clients:{},rows:[],key:r.prod+"##"+fk};g.fabKeys.push(fk);}
    var f=g.fabs[fk]; f.metry+=r.metry; f.clients[r._client]=(f.clients[r._client]||0)+r.metry; f.rows.push(r);
  });
  // Metraż do zamówienia: domyślnie suma z wycen, z możliwością ręcznej korekty (mniej lub więcej).
  supKeys.forEach(function(sup){
    var g=bySup[sup]; g.orderRows=[]; g.orderTotal=0;
    g.fabKeys.forEach(function(fk){
      var f=g.fabs[fk];
      var raw=qty[f.key];
      var custom=raw!==undefined&&raw!==""?parseFloat(String(raw).replace(",",".")):NaN;
      f.removed=!!removed[f.key];
      f.toOrder=isNaN(custom)||custom<0?f.metry:custom;
      if(f.removed||f.toOrder<=0)return;
      var factor=f.toOrder<f.metry?f.toOrder/f.metry:1;
      var extra=f.toOrder>f.metry?f.toOrder-f.metry:0;
      f.rows.forEach(function(r,i){
        var m=r.metry*factor+(i===f.rows.length-1?extra:0);
        g.orderRows.push(mg(r,{metry:m}));g.orderTotal+=m;
      });
    });
  });
  supKeys.sort(function(a,b){return a.localeCompare(b,"pl");});
  function setRem(k,v){setRemoved(function(s){var n=Object.assign({},s);if(v)n[k]=true;else delete n[k];return n;});}

  var pseudo={name:chosen.length+" "+(chosen.length===1?"klient":"klientów")+": "+chosen.map(function(c){return c.name;}).join(", ")};
  function optsFor(sup){
    var fn={};
    bySup[sup].fabKeys.forEach(function(fk){var f=bySup[sup].fabs[fk];var t=(fabNote[f.key]||"").trim();if(t&&!f.removed)fn[fk]=t;});
    return {notes:notes,bulkLabel:true,fabNotes:fn};
  }
  function docFor(sup){return buildFabricOrderHtmlFromRows(pseudo,sup,bySup[sup].orderRows,optsFor(sup));}
  function preview(sup){if(!bySup[sup].orderRows.length)return;generateFabricOrderPDFFromRows(pseudo,sup,bySup[sup].orderRows,optsFor(sup));}
  function mail(sup){
    if(!bySup[sup].orderRows.length)return;
    p.onMailDoc(docFor(sup),"Zamowienie zbiorcze tkaniny - "+sup+".pdf",{
      to:"",supplier:sup,subject:"Zamówienie tkaniny — zbiorcze",
      body:["Dzień dobry,","W załączeniu przesyłam zbiorcze zamówienie tkaniny.","Proszę o potwierdzenie dostępności i terminu wysyłki."]
        .map(function(t){return "<div>"+t+"</div>";}).join("<div><br></div>")
    });
  }

  var card={background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"14px 16px",marginBottom:12};
  var btn={padding:"10px 16px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer"};
  return ce("div",null,
    ce("div",{style:{fontSize:15,fontWeight:700,color:"var(--t1)",marginBottom:6}},"🧵 Zbiorcze zamówienie tkanin"),
    ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:12,lineHeight:1.5}},"Zaznacz klientów — ta sama tkanina i kolor u jednego producenta zostaną zsumowane w jedno zamówienie."),
    ce("div",{style:card},
      ce("input",{value:q,onChange:function(e){setQ(e.target.value);},placeholder:"Szukaj klienta...",style:{width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",marginBottom:8}}),
      ce("div",{style:{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}},
        shown.map(function(c){
          return ce("label",{key:c.id,style:{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",borderRadius:8,cursor:"pointer",background:sel[c.id]?"var(--grl)":"transparent",fontSize:14,color:"var(--t1)"}},
            ce("input",{type:"checkbox",checked:!!sel[c.id],onChange:function(){setSel(function(s){var n=Object.assign({},s);if(n[c.id])delete n[c.id];else n[c.id]=true;return n;});}}),
            ce("span",{style:{flex:1}},c.name||"(bez nazwy)"));
        })
      )
    ),
    chosen.length===0?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"8px 0"}},"Zaznacz co najmniej jednego klienta."):
    (supKeys.length===0?ce("div",{style:{color:"var(--t3)",fontSize:12,padding:"8px 0"}},"Zaznaczeni klienci nie mają tkanin do zamówienia."):
    ce("div",null,
      ce("div",{style:card},
        ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t2)",marginBottom:8}},"Uwagi do zamówienia"),
        ce("textarea",{value:notes,onChange:function(e){setNotes(e.target.value);},rows:2,placeholder:"Uwagi dla dostawcy...",style:{width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",resize:"vertical"}})
      ),
      supKeys.map(function(sup){
        var g=bySup[sup];
        return ce("div",{key:sup,style:card},
          ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}},
            ce("div",null,
              ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)"}},"🧵 "+sup),
              ce("div",{style:{fontSize:11,color:"var(--t3)"}},fmt(g.orderTotal)+" mb do zamówienia"+(g.orderTotal!==g.total?" (z "+fmt(g.total)+")":""))
            ),
            ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
              ce("button",{onClick:function(){preview(sup);},style:Object.assign({},btn,{border:"none",background:"var(--t2)",color:"#fff"})},"👁️ Podgląd"),
              ce("button",{onClick:function(){mail(sup);},style:Object.assign({},btn,{border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t1)"})},"✉️ Wyślij mailem")
            )
          ),
          g.fabKeys.map(function(fk){
            var f=g.fabs[fk];
            var names=Object.keys(f.clients);
            return ce("div",{key:fk,style:{padding:"8px 10px",background:"var(--bg)",borderRadius:8,marginBottom:6,border:"1px solid var(--bd3)",opacity:f.removed?0.55:1}},
              ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontSize:13,color:"var(--t1)"}},
                ce("span",{style:{fontWeight:600,textDecoration:f.removed?"line-through":"none"}},f.fabName+(f.kolor&&f.kolor!=="-"?" · "+f.kolor:"")),
                ce("span",{style:{display:"flex",alignItems:"center",gap:8}},
                  ce("span",{style:{fontWeight:700,color:"var(--grd)",whiteSpace:"nowrap"}},f.removed?"pominięta":fmt(f.toOrder)+" mb"),
                  f.removed?
                    ce("button",{onClick:function(){setRem(f.key,false);},style:{border:"none",background:"transparent",color:"var(--t2)",cursor:"pointer",fontSize:12}},"↩ Przywróć"):
                    ce("button",{title:"Usuń pozycję z zamówienia",onClick:function(){setRem(f.key,true);},style:{border:"none",background:"transparent",color:"#c0392b",cursor:"pointer",fontSize:16,lineHeight:1}},"🗑"))),
              ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:2}},
                (names.length>1?names.map(function(n){return n+" "+fmt(f.clients[n]);}).join(" · "):names[0])+""),
              f.removed?null:ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:6,fontSize:12,color:"var(--t2)"}},
                ce("span",null,"Zamawiam:"),
                ce("input",{type:"text",inputMode:"decimal",value:qty[f.key]!==undefined?qty[f.key]:fmt(f.metry),
                  onChange:function(e){var v=e.target.value;setQty(function(s){var n=Object.assign({},s);n[f.key]=v;return n;});},
                  style:{width:80,padding:"5px 8px",fontSize:13,border:"1.5px solid var(--bd2)",borderRadius:6,background:"var(--bg)",color:"var(--t1)"}}),
                ce("span",null,"mb"),
                qty[f.key]!==undefined?ce("button",{onClick:function(){setQty(function(s){var n=Object.assign({},s);delete n[f.key];return n;});},style:{border:"none",background:"transparent",color:"var(--t2)",cursor:"pointer",fontSize:11,textDecoration:"underline"}},"przywróć "+fmt(f.metry)):null),
              f.removed?null:ce("textarea",{value:fabNote[f.key]||"",rows:1,placeholder:"Uwagi do tej pozycji...",
                onChange:function(e){var v=e.target.value;setFabNote(function(s){var n=Object.assign({},s);n[f.key]=v;return n;});},
                style:{width:"100%",boxSizing:"border-box",marginTop:6,padding:"6px 8px",fontSize:12,border:"1.5px solid var(--bd2)",borderRadius:6,background:"var(--bg)",color:"var(--t1)",resize:"vertical"}})
            );
          })
        );
      })
    ))
  );
}
