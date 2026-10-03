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
    if(!g.fabs[fk]){g.fabs[fk]={fabName:r.fabName||"-",kolor:r.kolor||"-",metry:0,clients:{}};g.fabKeys.push(fk);}
    var f=g.fabs[fk]; f.metry+=r.metry; f.clients[r._client]=(f.clients[r._client]||0)+r.metry;
  });
  supKeys.sort(function(a,b){return a.localeCompare(b,"pl");});

  var pseudo={name:chosen.length+" "+(chosen.length===1?"klient":"klientów")+": "+chosen.map(function(c){return c.name;}).join(", ")};
  function docFor(sup){return buildFabricOrderHtmlFromRows(pseudo,sup,bySup[sup].rows,{notes:notes,bulkLabel:true});}
  function preview(sup){generateFabricOrderPDFFromRows(pseudo,sup,bySup[sup].rows,{notes:notes,bulkLabel:true});}
  function mail(sup){
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
              ce("div",{style:{fontSize:11,color:"var(--t3)"}},fmt(g.total)+" mb · "+g.fabKeys.length+" tkanin")
            ),
            ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
              ce("button",{onClick:function(){preview(sup);},style:Object.assign({},btn,{border:"none",background:"var(--t2)",color:"#fff"})},"👁️ Podgląd"),
              ce("button",{onClick:function(){mail(sup);},style:Object.assign({},btn,{border:"1.5px solid var(--bd2)",background:"transparent",color:"var(--t1)"})},"✉️ Wyślij mailem")
            )
          ),
          g.fabKeys.map(function(fk){
            var f=g.fabs[fk];
            var names=Object.keys(f.clients);
            return ce("div",{key:fk,style:{padding:"8px 10px",background:"var(--bg)",borderRadius:8,marginBottom:6,border:"1px solid var(--bd3)"}},
              ce("div",{style:{display:"flex",justifyContent:"space-between",gap:8,fontSize:13,color:"var(--t1)"}},
                ce("span",{style:{fontWeight:600}},f.fabName+(f.kolor&&f.kolor!=="-"?" · "+f.kolor:"")),
                ce("span",{style:{fontWeight:700,color:"var(--grd)",whiteSpace:"nowrap"}},fmt(f.metry)+" mb")),
              ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:2}},
                names.length>1?names.map(function(n){return n+" "+fmt(f.clients[n]);}).join(" · "):names[0])
            );
          })
        );
      })
    ))
  );
}
