import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sbApi, ksefApi } from '../lib/supabase.js';
const ce = React.createElement;

// ── Stałe ──────────────────────────────────────────────────────────────────
var VAT_RATES = [23, 8, 5, 0, -1]; // -1 = zw
var DOC_TYPES = [
  {id:"vat",      label:"Faktura VAT"},
  {id:"proforma", label:"Faktura Proforma"},
  {id:"zaliczka", label:"Faktura Zaliczkowa"},
  {id:"korekta",  label:"Faktura Korygująca"},
];
var PAYMENT_METHODS = ["przelew","gotówka","karta","BLIK"];
var UNITS = ["szt","m","m²","mb","kpl","usługa","godz"];

// ── Style helpers ───────────────────────────────────────────────────────────
var inp = {
  padding:"9px 12px", fontSize:13, border:"1.5px solid var(--bd2)",
  borderRadius:9, background:"var(--bg)", color:"var(--t1)",
  boxSizing:"border-box", outline:"none", fontFamily:"inherit", width:"100%"
};
var inpSm = Object.assign({},inp,{padding:"7px 10px",fontSize:12});
var label = {
  fontSize:11, fontWeight:700, color:"var(--t3)", letterSpacing:"0.07em",
  textTransform:"uppercase", marginBottom:4, display:"block"
};
var card = {
  background:"var(--bg2)", border:"1px solid var(--bd2)",
  borderRadius:14, padding:"16px 18px", marginBottom:12
};
var btnPrimary = {
  border:"none", background:"var(--violet)", color:"#fff",
  borderRadius:9, padding:"9px 18px", fontSize:13,
  cursor:"pointer", fontWeight:600, letterSpacing:"0.04em"
};
var btnSecondary = {
  border:"1px solid var(--bd2)", background:"var(--bg)", color:"var(--t2)",
  borderRadius:9, padding:"9px 14px", fontSize:13, cursor:"pointer", fontWeight:500
};
var btnDanger = {
  border:"1px solid #fca5a5", background:"#fef2f2", color:"#b91c1c",
  borderRadius:9, padding:"9px 14px", fontSize:13, cursor:"pointer", fontWeight:500
};

function fmtVat(r){ return r===-1?"zw":(r+"% VAT"); }
function fmtMoney(v){ return (+(v||0)).toFixed(2).replace(".",",")+" zł"; }
function fmtDate(d){ if(!d)return "—"; var p=d.split("-"); return p[2]+"."+p[1]+"."+p[0]; }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(iso,n){
  var d=new Date(iso); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

// Oblicza linię faktury. Zawsze netto → vat → brutto.
function calcLine(unit_net, qty, vat_rate){
  var q=+(qty)||1, n=+(unit_net)||0;
  var line_net=+(n*q).toFixed(2);
  var line_vat = vat_rate===-1 ? 0 : +(line_net*(+(vat_rate)/100)).toFixed(2);
  var line_gross=+(line_net+line_vat).toFixed(2);
  return {line_net, line_vat, line_gross};
}

// Sumuje pozycje per stawka VAT. Zwraca tablicę {vat_rate, net, vat, gross}
function calcTotals(items){
  var map={};
  (items||[]).forEach(function(it){
    var k=it.vat_rate;
    if(!map[k]) map[k]={vat_rate:k,net:0,vat:0,gross:0};
    map[k].net   += +(it.line_net||0);
    map[k].vat   += +(it.line_vat||0);
    map[k].gross += +(it.line_gross||0);
  });
  return Object.values(map).sort(function(a,b){return b.vat_rate-a.vat_rate;});
}

// Format numeru faktury wg szablonu {nr} {MM} {YYYY}
function formatNumber(tmpl, nr, date){
  var d=date?new Date(date):new Date();
  var mm=String(d.getMonth()+1).padStart(2,"0");
  var yyyy=String(d.getFullYear());
  return (tmpl||"FV/{nr}/{MM}/{YYYY}")
    .replace("{nr}",String(nr).padStart(3,"0"))
    .replace("{MM}",mm)
    .replace("{YYYY}",yyyy);
}

// Klucz okresu dla licznika
function periodKey(reset, date){
  var d=date||todayISO();
  if(reset==="monthly")  return d.slice(0,7);   // "2026-06"
  if(reset==="yearly")   return d.slice(0,4);   // "2026"
  return "all";
}

// ── Komponent: pojedyncza pozycja faktury ────────────────────────────────
function ItemRow(p){
  var it=p.item, idx=p.idx, onChange=p.onChange, onRemove=p.onRemove;
  function upd(field,val){
    var next=Object.assign({},it,{[field]:val});
    if(field==="unit_net"||field==="quantity"||field==="vat_rate"){
      var nums=calcLine(
        field==="unit_net"?val:it.unit_net,
        field==="quantity"?val:it.quantity,
        field==="vat_rate"?val:it.vat_rate
      );
      next=Object.assign(next,nums);
    }
    onChange(idx,next);
  }

  return ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 60px 70px 80px 70px 90px 90px 28px",gap:6,alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--bd3)"}},
    // Nazwa
    ce("input",{style:inpSm, value:it.name||"", placeholder:"Nazwa towaru / usługi",
      onChange:function(e){upd("name",e.target.value);}}),
    // Ilość
    ce("input",{style:Object.assign({},inpSm,{textAlign:"right"}), value:it.quantity, type:"number", min:0, step:0.01,
      onChange:function(e){upd("quantity",e.target.value);}}),
    // Jm
    ce("select",{style:inpSm, value:it.unit||"szt",
      onChange:function(e){upd("unit",e.target.value);}},
      UNITS.map(function(u){return ce("option",{key:u,value:u},u);})),
    // Cena netto
    ce("input",{style:Object.assign({},inpSm,{textAlign:"right"}), value:it.unit_net, type:"number", min:0, step:0.01,
      onChange:function(e){upd("unit_net",e.target.value);}}),
    // VAT
    ce("select",{style:inpSm, value:it.vat_rate,
      onChange:function(e){upd("vat_rate",+(e.target.value));}},
      VAT_RATES.map(function(r){return ce("option",{key:r,value:r},fmtVat(r));})),
    // Netto razem
    ce("div",{style:{fontSize:12,textAlign:"right",color:"var(--t2)"}},fmtMoney(it.line_net)),
    // Brutto razem
    ce("div",{style:{fontSize:12,fontWeight:600,textAlign:"right",color:"var(--t1)"}},fmtMoney(it.line_gross)),
    // Usuń
    ce("button",{onClick:function(){onRemove(idx);},
      style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:16,padding:0,lineHeight:1}},"\u00D7")
  );
}

// ── EDYTOR FAKTURY ──────────────────────────────────────────────────────────
function InvoiceEditor(p){
  // p: invoice (lub null = nowa), settings, clients, onSave, onClose
  var isNew=!p.invoice||!p.invoice.id;
  var settings=p.settings||{};
  var defaultVat=+(settings.default_vat)||23;
  var defaultDays=+(settings.default_payment_days)||14;

  function freshItem(){
    var n=calcLine(0,1,defaultVat);
    return Object.assign({name:"",quantity:1,unit:settings.default_unit||"szt",unit_net:0,vat_rate:defaultVat},n,{position:1,pkwiu:""});
  }

  // Inicjalizacja stanu nagłówka
  var today=todayISO();
  var initInv=p.invoice||{};
  var [docType,setDocType]=useState(initInv.doc_type||"vat");
  var [issueDate,setIssueDate]=useState(initInv.issue_date||today);
  var [saleDate,setSaleDate]=useState(initInv.sale_date||today);
  var [dueDate,setDueDate]=useState(initInv.due_date||addDays(today,defaultDays));
  var [payMethod,setPayMethod]=useState(initInv.payment_method||settings.default_payment_method||"przelew");
  var [notes,setNotes]=useState(initInv.notes||"");
  var [buyerName,setBuyerName]=useState(initInv.buyer_name||"");
  var [buyerNip,setBuyerNip]=useState(initInv.buyer_nip||"");
  var [buyerAddr,setBuyerAddr]=useState(initInv.buyer_address||"");
  var [buyerPostal,setBuyerPostal]=useState(initInv.buyer_postal||"");
  var [buyerCity,setBuyerCity]=useState(initInv.buyer_city||"");
  var [buyerEmail,setBuyerEmail]=useState(initInv.buyer_email||"");
  var [items,setItems]=useState(
    (initInv.invoice_items&&initInv.invoice_items.length>0)
      ? initInv.invoice_items
      : [freshItem()]
  );
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState(null);

  // GUS/NIP lookup (białe API gov.pl)
  var [nipLoading,setNipLoading]=useState(false);
  function lookupNip(){
    var nip=(buyerNip||"").replace(/[\s\-]/g,"");
    if(nip.length<10){setErr("NIP musi mieć 10 cyfr");return;}
    setNipLoading(true); setErr(null);
    fetch("https://wl-api.mf.gov.pl/api/search/nip/"+nip+"?date="+todayISO())
      .then(function(r){return r.json();})
      .then(function(d){
        var s=d&&d.result&&d.result.subject;
        if(!s){setErr("Nie znaleziono podmiotu dla NIP: "+nip);return;}
        setBuyerName(s.name||buyerName);
        // Adres może być złożony; wyciągamy najlepiej jak możemy
        var adr=s.workingAddress||s.residenceAddress||"";
        var parts=adr.split(",").map(function(x){return x.trim();});
        if(parts.length>=2){
          setBuyerAddr(parts[0]);
          var rest=parts[1]||"";
          var m=rest.match(/^(\d{2}-\d{3})\s+(.+)$/);
          if(m){setBuyerPostal(m[1]);setBuyerCity(m[2]);}
          else{setBuyerCity(rest);}
        } else {
          setBuyerAddr(adr);
        }
      })
      .catch(function(){setErr("Błąd połączenia z API GUS");})
      .finally(function(){setNipLoading(false);});
  }

  function addItem(){
    setItems(function(prev){
      var n=freshItem(); n.position=prev.length+1;
      return prev.concat([n]);
    });
  }
  function updateItem(idx,next){
    setItems(function(prev){return prev.map(function(it,i){return i===idx?next:it;});});
  }
  function removeItem(idx){
    setItems(function(prev){return prev.filter(function(_,i){return i!==idx;}).map(function(it,i){return Object.assign({},it,{position:i+1});});});
  }

  var totalsPerRate=calcTotals(items);
  var totalNet=totalsPerRate.reduce(function(a,r){return a+r.net;},0);
  var totalVat=totalsPerRate.reduce(function(a,r){return a+r.vat;},0);
  var totalGross=totalsPerRate.reduce(function(a,r){return a+r.gross;},0);

  function validate(){
    if(!buyerName.trim()) return "Brak nazwy nabywcy";
    if(items.length===0) return "Brak pozycji";
    if(items.some(function(it){return !it.name.trim();})) return "Każda pozycja musi mieć nazwę";
    return null;
  }

  function save(andIssue){
    var vErr=validate();
    if(vErr){setErr(vErr);return;}
    setBusy(true); setErr(null);

    var header={
      doc_type:docType,
      issue_date:issueDate, sale_date:saleDate, due_date:dueDate,
      payment_method:payMethod,
      buyer_name:buyerName, buyer_nip:buyerNip,
      buyer_address:buyerAddr, buyer_postal:buyerPostal,
      buyer_city:buyerCity, buyer_email:buyerEmail,
      notes:notes,
      total_net:totalNet, total_vat:totalVat, total_gross:totalGross,
      seller_snapshot:{
        name:settings.seller_name||"", nip:settings.seller_nip||"",
        address:settings.seller_address||"", postal:settings.seller_postal||"",
        city:settings.seller_city||"", email:settings.seller_email||"",
        phone:settings.seller_phone||"", bank:settings.seller_bank||""
      }
    };

    var doIssue=andIssue&&isNew;

    var prom;
    if(isNew){
      prom=sbApi.addInvoice(Object.assign({status:"draft"},header));
    } else {
      prom=sbApi.updateInvoice(p.invoice.id,header).then(function(){return {id:p.invoice.id};});
    }

    prom.then(function(inv){
      var invId=inv.id||inv[0]&&inv[0].id;
      var itemsToSave=items.map(function(it,i){
        return {
          position:i+1, name:it.name, quantity:+(it.quantity)||1,
          unit:it.unit||"szt", unit_net:+(it.unit_net)||0,
          vat_rate:+(it.vat_rate), line_net:+(it.line_net)||0,
          line_vat:+(it.line_vat)||0, line_gross:+(it.line_gross)||0,
          pkwiu:it.pkwiu||""
        };
      });
      return sbApi.replaceInvoiceItems(invId,itemsToSave).then(function(){
        if(doIssue){
          // Nadaj numer
          var period=periodKey(settings.numbering_reset||"monthly",issueDate);
          return sbApi.nextInvoiceNumber(docType,period).then(function(nr){
            var num=formatNumber(settings.numbering_format,nr,issueDate);
            return sbApi.updateInvoice(invId,{status:"issued",number:num}).then(function(){
              return Object.assign({},inv,{id:invId,number:num,status:"issued"});
            });
          });
        }
        return Object.assign({},inv,{id:invId});
      });
    })
    .then(function(result){
      setBusy(false);
      p.onSave(result);
    })
    .catch(function(e){
      setBusy(false);
      setErr(e.message||"Błąd zapisu");
    });
  }

  var headerCols="140px 1fr";
  var fldRow=function(lbl,el){return ce("div",{style:{display:"grid",gridTemplateColumns:headerCols,gap:10,alignItems:"center",marginBottom:10}},
    ce("span",{style:Object.assign({},label,{marginBottom:0})},lbl), el);};

  return ce("div",{style:{maxWidth:900,margin:"0 auto",paddingBottom:40}},

    // Nagłówek edytora
    ce("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:20}},
      ce("button",{onClick:p.onClose,style:Object.assign({},btnSecondary,{padding:"7px 12px"})},"\u2190 Wróć"),
      ce("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"var(--t1)",flex:1}},
        isNew?"Nowa faktura":"Edycja faktury"+(p.invoice&&p.invoice.number?" — "+p.invoice.number:"")),
      p.invoice&&p.invoice.status==="issued"&&
        ce("span",{style:{fontSize:11,fontWeight:700,background:"#d1fae5",color:"#065f46",borderRadius:20,padding:"3px 10px"}},"WYSTAWIONA")
    ),

    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#b91c1c",marginBottom:14}},"\u26A0\uFE0F "+err),

    // ── SEKCJA: Rodzaj / daty ──
    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83D\uDCC4 Dokument"),
      fldRow("Typ dokumentu",
        ce("select",{style:inp,value:docType,onChange:function(e){setDocType(e.target.value);}},
          DOC_TYPES.map(function(d){return ce("option",{key:d.id,value:d.id},d.label);}))),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}},
        ce("div",null,ce("span",{style:label},"Data wystawienia"),ce("input",{style:inp,type:"date",value:issueDate,onChange:function(e){setIssueDate(e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Data sprzedaży"),ce("input",{style:inp,type:"date",value:saleDate,onChange:function(e){setSaleDate(e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Termin płatności"),ce("input",{style:inp,type:"date",value:dueDate,onChange:function(e){setDueDate(e.target.value);}}))
      ),
      ce("div",{style:{marginTop:12}},
        ce("span",{style:label},"Forma płatności"),
        ce("select",{style:Object.assign({},inp,{maxWidth:220}),value:payMethod,onChange:function(e){setPayMethod(e.target.value);}},
          PAYMENT_METHODS.map(function(m){return ce("option",{key:m,value:m},m);})))
    ),

    // ── SEKCJA: Nabywca ──
    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83C\uDFE2 Nabywca"),
      ce("div",{style:{display:"flex",gap:8,marginBottom:10}},
        ce("div",{style:{flex:1}},
          ce("span",{style:label},"NIP nabywcy"),
          ce("input",{style:inp,value:buyerNip,placeholder:"0000000000",
            onChange:function(e){setBuyerNip(e.target.value);},
            onKeyDown:function(e){if(e.key==="Enter")lookupNip();}})),
        ce("button",{
          onClick:lookupNip, disabled:nipLoading,
          style:Object.assign({},btnSecondary,{alignSelf:"flex-end",whiteSpace:"nowrap"})
        },nipLoading?"\u23F3 Szukam...":"\uD83D\uDD0D Pobierz z GUS")
      ),
      fldRow("Nazwa",ce("input",{style:inp,value:buyerName,placeholder:"Pełna nazwa firmy / imię nazwisko",onChange:function(e){setBuyerName(e.target.value);}})),
      fldRow("Adres",ce("input",{style:inp,value:buyerAddr,placeholder:"ul. Kwiatowa 1",onChange:function(e){setBuyerAddr(e.target.value);}})),
      ce("div",{style:{display:"grid",gridTemplateColumns:"120px 1fr",gap:10,marginBottom:10,marginLeft:"150px"}},
        ce("input",{style:inp,value:buyerPostal,placeholder:"00-000",onChange:function(e){setBuyerPostal(e.target.value);}}),
        ce("input",{style:inp,value:buyerCity,placeholder:"Miasto",onChange:function(e){setBuyerCity(e.target.value);}})),
      fldRow("E-mail",ce("input",{style:inp,value:buyerEmail,type:"email",placeholder:"klient@email.pl",onChange:function(e){setBuyerEmail(e.target.value);}}))
    ),

    // ── SEKCJA: Pozycje ──
    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83D\uDCCB Pozycje"),

      // Nagłówki kolumn
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 60px 70px 80px 70px 90px 90px 28px",gap:6,marginBottom:4}},
        ["Nazwa towaru / usługi","Ilość","Jm","Cena netto","VAT","Netto","Brutto",""].map(function(h,i){
          return ce("div",{key:i,style:{fontSize:10,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:i>=5?"right":"left"}},h);
        })
      ),

      items.map(function(it,i){
        return ce(ItemRow,{key:i,item:it,idx:i,onChange:updateItem,onRemove:removeItem});
      }),

      ce("button",{onClick:addItem,
        style:Object.assign({},btnSecondary,{marginTop:10,fontSize:12})
      },"+ Dodaj pozycję"),

      // Podsumowanie VAT per stawka
      ce("div",{style:{marginTop:16,borderTop:"1px solid var(--bd2)",paddingTop:12}},
        ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}},
          totalsPerRate.map(function(r){
            return ce("div",{key:r.vat_rate,style:{display:"grid",gridTemplateColumns:"80px 110px 110px 120px",gap:10,fontSize:12,color:"var(--t2)"}},
              ce("div",{style:{textAlign:"right"}},fmtVat(r.vat_rate)),
              ce("div",{style:{textAlign:"right"}},fmtMoney(r.net)),
              ce("div",{style:{textAlign:"right"}},fmtMoney(r.vat)),
              ce("div",{style:{textAlign:"right"}},fmtMoney(r.gross))
            );
          }),
          ce("div",{style:{display:"grid",gridTemplateColumns:"80px 110px 110px 120px",gap:10,fontSize:11,color:"var(--t3)",marginBottom:4,marginTop:2}},
            ce("div",{style:{textAlign:"right"}},"Stawka"),
            ce("div",{style:{textAlign:"right"}},"Netto"),
            ce("div",{style:{textAlign:"right"}},"VAT"),
            ce("div",{style:{textAlign:"right"}},"Brutto")
          ),
          ce("div",{style:{display:"grid",gridTemplateColumns:"80px 110px 110px 120px",gap:10,borderTop:"2px solid var(--t1)",paddingTop:6,fontWeight:700,fontSize:14,color:"var(--t1)"}},
            ce("div",{style:{textAlign:"right"}},"SUMA"),
            ce("div",{style:{textAlign:"right"}},fmtMoney(totalNet)),
            ce("div",{style:{textAlign:"right"}},fmtMoney(totalVat)),
            ce("div",{style:{textAlign:"right"}},fmtMoney(totalGross))
          )
        )
      )
    ),

    // ── SEKCJA: Uwagi ──
    ce("div",{style:card},
      ce("span",{style:label},"Uwagi / dodatkowe informacje"),
      ce("textarea",{style:Object.assign({},inp,{minHeight:72,resize:"vertical"}),
        value:notes, onChange:function(e){setNotes(e.target.value);},
        placeholder:"Np. słowna kwota do zapłaty, numer umowy..."})
    ),

    // Przyciski zapisu
    ce("div",{style:{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}},
      ce("button",{onClick:p.onClose,style:btnSecondary,disabled:busy},"Anuluj"),
      ce("button",{onClick:function(){save(false);},style:btnSecondary,disabled:busy},
        busy?"\u23F3 Zapisuję...":"Zapisz szkic"),
      isNew&&ce("button",{onClick:function(){save(true);},
        style:Object.assign({},btnPrimary,{background:"#059669"}),disabled:busy},
        busy?"\u23F3 Wystawiam...":"\u2713 Wystaw fakturę")
    )
  );
}

// ── USTAWIENIA FAKTURY ──────────────────────────────────────────────────────
function InvoiceSettings(p){
  var [form,setForm]=useState(p.settings||{});
  var [busy,setBusy]=useState(false);
  var [ok,setOk]=useState(false);
  var [err,setErr]=useState(null);
  function upd(k,v){setForm(function(f){return Object.assign({},f,{[k]:v});});}

  function save(){
    setBusy(true); setErr(null); setOk(false);
    sbApi.saveInvoiceSettings(form)
      .then(function(){setOk(true);setTimeout(function(){setOk(false);},2000);p.onSaved(form);})
      .catch(function(e){setErr(e.message||"Błąd zapisu");})
      .finally(function(){setBusy(false);});
  }

  var row=function(lbl,el,note){return ce("div",{style:{marginBottom:14}},
    ce("span",{style:label},lbl),
    el,
    note&&ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:3}},note)
  );};

  return ce("div",{style:{maxWidth:640,margin:"0 auto",paddingBottom:40}},
    ce("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:20}},
      ce("button",{onClick:p.onClose,style:Object.assign({},btnSecondary,{padding:"7px 12px"})},"\u2190 Wróć"),
      ce("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"var(--t1)"}},"Ustawienia fakturowania")),

    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#b91c1c",marginBottom:14}},"\u26A0\uFE0F "+err),
    ok&&ce("div",{style:{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#065f46",marginBottom:14}},"\u2713 Zapisano"),

    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:14,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83C\uDFE2 Dane sprzedawcy"),
      row("Nazwa firmy / imię nazwisko",ce("input",{style:inp,value:form.seller_name||"",onChange:function(e){upd("seller_name",e.target.value);}})),
      row("NIP",ce("input",{style:inp,value:form.seller_nip||"",placeholder:"0000000000",onChange:function(e){upd("seller_nip",e.target.value);}})),
      row("Adres",ce("input",{style:inp,value:form.seller_address||"",onChange:function(e){upd("seller_address",e.target.value);}})),
      ce("div",{style:{display:"grid",gridTemplateColumns:"120px 1fr",gap:10,marginBottom:14}},
        ce("div",null,ce("span",{style:label},"Kod pocztowy"),ce("input",{style:inp,value:form.seller_postal||"",placeholder:"00-000",onChange:function(e){upd("seller_postal",e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Miasto"),ce("input",{style:inp,value:form.seller_city||"",onChange:function(e){upd("seller_city",e.target.value);}}))),
      row("E-mail",ce("input",{style:inp,type:"email",value:form.seller_email||"",onChange:function(e){upd("seller_email",e.target.value);}})),
      row("Telefon",ce("input",{style:inp,value:form.seller_phone||"",onChange:function(e){upd("seller_phone",e.target.value);}})),
      row("Numer konta (IBAN)",ce("input",{style:inp,value:form.seller_bank||"",placeholder:"PL00 0000 0000 0000 0000 0000 0000",onChange:function(e){upd("seller_bank",e.target.value);}}))
    ),

    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:14,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83D\uDD22 Numeracja"),
      row("Szablon numeru",
        ce("input",{style:inp,value:form.numbering_format||"FV/{nr}/{MM}/{YYYY}",onChange:function(e){upd("numbering_format",e.target.value);}}),
        "Zmienne: {nr} = kolejny numer, {MM} = miesiąc, {YYYY} = rok. Przykład: FV/{nr}/{MM}/{YYYY} → FV/001/06/2026"),
      row("Reset licznika",
        ce("select",{style:inp,value:form.numbering_reset||"monthly",onChange:function(e){upd("numbering_reset",e.target.value);}},
          ce("option",{value:"monthly"},"Co miesiąc"),
          ce("option",{value:"yearly"},"Co rok"),
          ce("option",{value:"never"},"Nigdy (ciągły)")))
    ),

    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:14,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\u2699\uFE0F Domyślne wartości"),
      row("Domyślna stawka VAT",
        ce("select",{style:inp,value:form.default_vat||23,onChange:function(e){upd("default_vat",+(e.target.value));}},
          VAT_RATES.map(function(r){return ce("option",{key:r,value:r},fmtVat(r));}))),
      row("Termin płatności (dni)",
        ce("input",{style:inp,type:"number",min:0,value:form.default_payment_days||14,onChange:function(e){upd("default_payment_days",+(e.target.value));}})),
      row("Forma płatności",
        ce("select",{style:inp,value:form.default_payment_method||"przelew",onChange:function(e){upd("default_payment_method",e.target.value);}},
          PAYMENT_METHODS.map(function(m){return ce("option",{key:m,value:m},m);}))),
      row("Domyślna jednostka miary",
        ce("select",{style:inp,value:form.default_unit||"szt",onChange:function(e){upd("default_unit",e.target.value);}},
          UNITS.map(function(u){return ce("option",{key:u,value:u},u);})))
    ),

    ce(KsefTokenPanel,null),

    ce("div",{style:{display:"flex",justifyContent:"flex-end",gap:10}},
      ce("button",{onClick:p.onClose,style:btnSecondary},"Anuluj"),
      ce("button",{onClick:save,disabled:busy,style:btnPrimary},busy?"\u23F3 Zapisuję...":"\u2713 Zapisz ustawienia")
    )
  );
}

// ── PANEL CERTYFIKATU KSEF ──────────────────
function KsefTokenPanel(){
  var [authMode,setAuthMode]=useState("cert"); // cert | token
  // -- cert state
  var [certText,setCertText]=useState("");
  var [keyText,setKeyText]=useState("");
  var [keyPass,setKeyPass]=useState("");
  var [env,setEnv]=useState("prod");
  // -- token state
  var [tokenText,setTokenText]=useState("");
  var [tokenEnv,setTokenEnv]=useState("prod");
  // -- shared
  var [status,setStatus]=useState(null);
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState(null);
  var [msg,setMsg]=useState(null);
  var certRef=React.useRef(null);
  var keyRef=React.useRef(null);

  useEffect(function(){
    ksefApi.getTokenStatus()
      .then(function(s){setStatus(s);setEnv(s.env||"prod");setTokenEnv(s.env||"prod");})
      .catch(function(){setStatus({hasCert:false,env:"prod"});});
  },[]);

  function readFile(file,cb){
    var r=new FileReader();
    r.onload=function(e){cb(e.target.result);};
    r.readAsText(file);
  }

  function saveCert(){
    if(!certText.trim()){setErr("Wgraj plik .crt");return;}
    if(!keyText.trim()){setErr("Wgraj plik .key");return;}
    setBusy(true);setErr(null);setMsg(null);
    ksefApi.saveCert(certText.trim(),keyText.trim(),keyPass,env)
      .then(function(r){
        setMsg("\u2713 Certyfikat zapisany (\u015brodowisko: "+(r.env==="prod"?"PRODUKCJA":"TEST")+")");
        setCertText("");setKeyText("");setKeyPass("");
        setStatus({hasCert:true,env:r.env,updated_at:new Date().toISOString()});
      })
      .catch(function(e){setErr(e.message||"B\u0142\u0105d zapisu");})
      .finally(function(){setBusy(false);});
  }

  function saveToken(){
    var t=(tokenText||"").trim();
    if(!t){setErr("Wklej token KSeF");return;}
    if(t.length<20){setErr("Token wygl\u0105da za kr\u00f3tki");return;}
    setBusy(true);setErr(null);setMsg(null);
    ksefApi.saveToken(t,tokenEnv)
      .then(function(r){
        setMsg("\u2713 Token zapisany (\u015brodowisko: "+(r.env==="prod"?"PRODUKCJA":"TEST")+")");
        setTokenText("");
        setStatus({hasCert:true,env:r.env,updated_at:new Date().toISOString()});
      })
      .catch(function(e){setErr(e.message||"B\u0142\u0105d zapisu");})
      .finally(function(){setBusy(false);});
  }

  function del(){
    if(!confirm("Usun\u0105\u0107 certyfikat/token KSeF?"))return;
    setBusy(true);setErr(null);setMsg(null);
    ksefApi.deleteToken()
      .then(function(){setStatus({hasCert:false,env:"prod"});setMsg("\u2713 Usuni\u0119to");})
      .catch(function(e){setErr(e.message);})
      .finally(function(){setBusy(false);});
  }

  function fmtTs(ts){
    if(!ts)return "";
    var d=new Date(ts);
    return d.toLocaleDateString("pl-PL")+" "+d.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
  }

  return ce("div",{style:card},
    ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},
      "\uD83D\uDD10 Integracja KSeF"),
    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#b91c1c",marginBottom:10}},"\u26A0\uFE0F "+err),
    msg&&ce("div",{style:{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#065f46",marginBottom:10}},msg),

    status===null
      ?ce("div",{style:{fontSize:12,color:"var(--t3)",padding:"8px 0"}},"\u23F3 \u0141adowanie...")
      :status.hasCert
        ?ce("div",null,
            ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:10}},
              ce("span",{style:{fontSize:20}},"\u2705"),
              ce("div",{style:{flex:1}},
                ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)"}},
                  "KSeF aktywny \u2014 "+(status.env==="prod"?"\uD83D\uDE80 PRODUKCJA":"\uD83E\uDDEA TEST")),
                status.updated_at&&ce("div",{style:{fontSize:11,color:"var(--t3)"}},"Zapisany: "+fmtTs(status.updated_at))
              ),
              ce("button",{onClick:del,disabled:busy,
                style:Object.assign({},btnDanger,{fontSize:11,padding:"5px 10px"})},
                "Usu\u0144")
            ),
            ce("div",{style:{background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--t2)"}},
              "\uD83D\uDCA1 Dane KSeF s\u0105 zaszyfrowane AES-256-GCM po stronie serwera.")
          )
        :ce("div",null,
            // Taby: Certyfikat / Token
            ce("div",{style:{display:"flex",gap:0,marginBottom:14,borderBottom:"1px solid var(--bd2)"}},
              [{id:"cert",lbl:"\uD83D\uDCDC Certyfikat KSeF"},{id:"token",lbl:"\uD83D\uDD11 Token KSeF"}].map(function(t){
                var a=authMode===t.id;
                return ce("button",{key:t.id,onClick:function(){setAuthMode(t.id);setErr(null);},
                  style:{border:"none",background:"none",padding:"7px 14px",fontSize:12,
                    fontWeight:a?700:400,color:a?"var(--violet)":"var(--t3)",cursor:"pointer",
                    borderBottom:a?"2px solid var(--violet)":"2px solid transparent",marginBottom:-1}},t.lbl);
              })
            ),

            // Panel certyfikatu
            authMode==="cert"&&ce("div",null,
              ce("div",{style:{fontSize:12,color:"var(--t2)",marginBottom:12,lineHeight:1.6,background:"var(--bg)",borderRadius:8,padding:"10px 14px",border:"1px solid var(--bd2)"}},
                "Wgraj pliki z ",
                ce("a",{href:"https://ksef.podatki.gov.pl",target:"_blank",style:{color:"var(--violet)",fontWeight:600}},"ksef.podatki.gov.pl"),
                " \u2192 Certyfikaty i uprawnienia \u2192 Certyfikaty KSeF."
              ),
              ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},
                ce("div",null,
                  ce("span",{style:label},"Plik certyfikatu (.crt)"),
                  ce("input",{ref:certRef,type:"file",style:{display:"none"},accept:".crt,.pem",
                    onChange:function(e){var f=e.target.files&&e.target.files[0];if(f)readFile(f,setCertText);e.target.value="";}}),
                  ce("button",{onClick:function(){certRef.current&&certRef.current.click();},
                    style:Object.assign({},btnSecondary,{fontSize:12,padding:"7px 12px",width:"100%"})},
                    certText?"\u2705 .crt wgrany":"\uD83D\uDCC2 Wybierz .crt")
                ),
                ce("div",null,
                  ce("span",{style:label},"Klucz prywatny (.key)"),
                  ce("input",{ref:keyRef,type:"file",style:{display:"none"},accept:".key,.pem",
                    onChange:function(e){var f=e.target.files&&e.target.files[0];if(f)readFile(f,setKeyText);e.target.value="";}}),
                  ce("button",{onClick:function(){keyRef.current&&keyRef.current.click();},
                    style:Object.assign({},btnSecondary,{fontSize:12,padding:"7px 12px",width:"100%"})},
                    keyText?"\u2705 .key wgrany":"\uD83D\uDCC2 Wybierz .key")
                )
              ),
              ce("div",{style:{marginBottom:12}},
                ce("span",{style:label},"Has\u0142o do klucza"),
                ce("input",{type:"password",style:inp,value:keyPass,
                  onChange:function(e){setKeyPass(e.target.value);},
                  placeholder:"Pozostaw puste je\u015bli klucz nie ma has\u0142a"})
              ),
              ce("div",{style:{display:"flex",gap:10,alignItems:"flex-end"}},
                ce("div",{style:{flex:1}},
                  ce("span",{style:label},"\u015arodowidko"),
                  ce("select",{style:inp,value:env,onChange:function(e){setEnv(e.target.value);}},
                    ce("option",{value:"prod"},"\uD83D\uDE80 PRODUKCJA"),
                    ce("option",{value:"test"},"\uD83E\uDDEA TEST")
                  )
                ),
                ce("button",{onClick:saveCert,disabled:busy||!certText||!keyText,
                  style:Object.assign({},btnPrimary,{opacity:(!certText||!keyText)?0.5:1})},
                  busy?"\u23F3 Zapisuj\u0119...":"\uD83D\uDD12 Zapisz certyfikat")
              )
            ),

            // Panel tokenu
            authMode==="token"&&ce("div",null,
              ce("div",{style:{fontSize:12,color:"var(--t2)",marginBottom:12,lineHeight:1.6,background:"var(--bg)",borderRadius:8,padding:"10px 14px",border:"1px solid var(--bd2)"}},
                "Wygeneruj token na ",
                ce("a",{href:"https://ksef.podatki.gov.pl",target:"_blank",style:{color:"var(--violet)",fontWeight:600}},"ksef.podatki.gov.pl"),
                " \u2192 Certyfikaty i uprawnienia \u2192 Tokeny \u2192 Generuj token.",
                ce("br",null),
                "Zaznacz uprawnienia: Wystawianie \u2022 Odbi\u00f3r \u2022 Odczyt."
              ),
              ce("div",{style:{marginBottom:12}},
                ce("span",{style:label},"Token KSeF"),
                ce("textarea",{
                  style:Object.assign({},inp,{minHeight:80,fontFamily:"monospace",fontSize:11,resize:"vertical"}),
                  value:tokenText,
                  onChange:function(e){setTokenText(e.target.value);},
                  placeholder:"Wklej token KSeF..."
                })
              ),
              ce("div",{style:{display:"flex",gap:10,alignItems:"flex-end"}},
                ce("div",{style:{flex:1}},
                  ce("span",{style:label},"\u015arodowidko"),
                  ce("select",{style:inp,value:tokenEnv,onChange:function(e){setTokenEnv(e.target.value);}},
                    ce("option",{value:"prod"},"\uD83D\uDE80 PRODUKCJA"),
                    ce("option",{value:"test"},"\uD83E\uDDEA TEST")
                  )
                ),
                ce("button",{onClick:saveToken,disabled:busy||!tokenText.trim(),
                  style:Object.assign({},btnPrimary,{opacity:!tokenText.trim()?0.5:1})},
                  busy?"\u23F3 Zapisuj\u0119...":"\uD83D\uDD12 Zapisz token")
              )
            )
          )
  );
}

// ── STATUS BADGE ────────────────────────────────────────────────────────────
function StatusBadge(p){
  var cfg={
    draft:    {label:"Szkic",     bg:"var(--bg2)",   color:"var(--t3)"},
    issued:   {label:"Wystawiona",bg:"#dbeafe",      color:"#1e40af"},
    sent:     {label:"Wysłana",   bg:"#ede9fe",      color:"#5b21b6"},
    cancelled:{label:"Anulowana", bg:"#fef2f2",      color:"#b91c1c"},
  };
  var c=cfg[p.status]||cfg.draft;
  return ce("span",{style:{
    fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px",
    background:c.bg,color:c.color,whiteSpace:"nowrap"
  }},c.label);
}

function KsefBadge(p){
  var cfg={
    none:      null,
    pending:   {label:"KSeF ⏳",bg:"#fef9c3",color:"#854d0e"},
    sent:      {label:"KSeF →",  bg:"#dbeafe",color:"#1e40af"},
    confirmed: {label:"KSeF ✓",  bg:"#d1fae5",color:"#065f46"},
    offline:   {label:"KSeF ✗",  bg:"#fef2f2",color:"#b91c1c"},
    error:     {label:"KSeF ERR",bg:"#fef2f2",color:"#b91c1c"},
  };
  var c=cfg[p.status];
  if(!c)return null;
  return ce("span",{style:{
    fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px",
    background:c.bg,color:c.color,marginLeft:4
  }},c.label);
}

// ── LISTA FAKTUR ────────────────────────────────────────────────────────────
function InvoiceList(p){
  var [search,setSearch]=useState("");
  var [filterStatus,setFilterStatus]=useState("all");

  var list=(p.invoices||[]).filter(function(inv){
    if(filterStatus!=="all"&&inv.status!==filterStatus) return false;
    if(search){
      var q=search.toLowerCase();
      return (inv.number&&inv.number.toLowerCase().includes(q))
          || (inv.buyer_name&&inv.buyer_name.toLowerCase().includes(q))
          || (inv.buyer_nip&&inv.buyer_nip.includes(q));
    }
    return true;
  });

  var payStatus=function(inv){
    if(inv.payment_method==="gotówka"&&inv.status==="issued") return {label:"Zapłacona",color:"#065f46"};
    if(inv.payment_status==="paid")   return {label:"Zapłacona",color:"#065f46"};
    if(inv.payment_status==="partial")return {label:"Częściowa",color:"#854d0e"};
    if(inv.status==="issued"&&inv.due_date&&inv.due_date<todayISO()) return {label:"Przeterminowana",color:"#b91c1c"};
    return {label:"Oczekuje",color:"var(--t3)"};
  };

  return ce("div",null,
    // Toolbar
    ce("div",{style:{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}},
      ce("input",{style:Object.assign({},inp,{maxWidth:260,flex:1}),
        value:search,onChange:function(e){setSearch(e.target.value);},
        placeholder:"\uD83D\uDD0D Szukaj po numerze, nabywcy, NIP..."}),
      ce("select",{style:Object.assign({},inp,{maxWidth:160}),value:filterStatus,onChange:function(e){setFilterStatus(e.target.value);}},
        ce("option",{value:"all"},"Wszystkie"),
        ce("option",{value:"draft"},"Szkice"),
        ce("option",{value:"issued"},"Wystawione"),
        ce("option",{value:"sent"},"Wysłane"),
        ce("option",{value:"cancelled"},"Anulowane")),
      ce("button",{onClick:p.onNew,style:btnPrimary},"+ Nowa faktura"),
      ce("button",{onClick:p.onSettings,style:btnSecondary},"\u2699\uFE0F Ustawienia")
    ),

    // Brak faktur
    list.length===0&&ce("div",{style:{textAlign:"center",padding:"40px 0",color:"var(--t3)",fontSize:14}},
      search||filterStatus!=="all"?"Brak pas\u0105j\u0105cych faktur":"Brak faktur \u2014 kliknij \"+ Nowa faktura\" aby wystawi\u0107 pierwsz\u0105."),

    // Tabela
    list.length>0&&ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden"}},
      // Nagłówek tabeli
      ce("div",{style:{display:"grid",gridTemplateColumns:"130px 1fr 110px 90px 90px 80px 36px",gap:8,padding:"10px 16px",borderBottom:"1px solid var(--bd2)",background:"var(--bg)"}},
        ["Numer","Nabywca","Data","Brutto","Płatność","Status",""].map(function(h,i){
          return ce("div",{key:i,style:{fontSize:10,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:i>=3?"right":"left"}},h);
        })
      ),
      // Wiersze
      list.map(function(inv){
        var ps=payStatus(inv);
        return ce("div",{key:inv.id,
          onClick:function(){p.onEdit(inv);},
          style:{display:"grid",gridTemplateColumns:"130px 1fr 110px 90px 90px 80px 36px",gap:8,padding:"11px 16px",
            borderBottom:"1px solid var(--bd3)",cursor:"pointer",transition:"background .12s",
            background:"var(--bg2)"},
          onMouseEnter:function(e){e.currentTarget.style.background="var(--bg3||var(--bg))";},
          onMouseLeave:function(e){e.currentTarget.style.background="var(--bg2)";}
        },
          ce("div",{style:{fontSize:12,fontWeight:700,color:"var(--violet)"}},
            inv.number||ce("span",{style:{color:"var(--t3)",fontStyle:"italic"}},"(szkic)")),
          ce("div",null,
            ce("div",{style:{fontSize:13,fontWeight:500,color:"var(--t1)"}},(inv.buyer_name||"—").slice(0,40)),
            inv.buyer_nip&&ce("div",{style:{fontSize:11,color:"var(--t3)"}},"NIP: "+inv.buyer_nip),
            ce(KsefBadge,{status:inv.ksef_status})
          ),
          ce("div",{style:{fontSize:12,textAlign:"right",color:"var(--t2)"}},fmtDate(inv.issue_date)),
          ce("div",{style:{fontSize:13,fontWeight:700,textAlign:"right",color:"var(--t1)"}},fmtMoney(inv.total_gross)),
          ce("div",{style:{fontSize:11,textAlign:"right",color:ps.color,fontWeight:500}},ps.label),
          ce("div",{style:{textAlign:"right"}},ce(StatusBadge,{status:inv.status})),
          ce("div",{style:{textAlign:"right"}},
            ce("button",{
              onClick:function(e){e.stopPropagation();if(confirm("Usunąć fakturę?"))p.onDelete(inv.id);},
              style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"2px 4px"}
            },"\uD83D\uDDD1"))
        );
      })
    )
  );
}

// ── GŁÓWNY EKRAN ─────────────────────────────────────────────────────────────
// ── WIDOK KSEF ──────────────────────────────────────────────────────────────
function KsefView(){
  var [tab,setTab]=useState("incoming");
  var [invoices,setInvoices]=useState([]);
  var [loading,setLoading]=useState(false);
  var [syncing,setSyncing]=useState(false);
  var [err,setErr]=useState(null);
  var [msg,setMsg]=useState(null);
  var [dateFrom,setDateFrom]=useState(function(){
    var d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10);
  });
  var [dateTo,setDateTo]=useState(function(){ return new Date().toISOString().slice(0,10); });
  var [sess,setSess]=useState(null);

  useEffect(function(){ loadLocal(); },[tab]);

  function loadLocal(){
    setLoading(true); setErr(null);
    sbApi.getInvoices().then(function(all){
      var type=tab==="incoming"?"zakup":"vat";
      setInvoices((all||[]).filter(function(i){
        return i.doc_type===type&&i.ksef_status==="confirmed";
      }));
    }).catch(function(e){setErr(e.message);}).finally(function(){setLoading(false);});
  }

  function getSession(){
    if(sess&&new Date(sess.expiresAt)>new Date()) return Promise.resolve(sess);
    return ksefApi.openSession().then(function(s){ setSess(s); return s; });
  }

  function sync(){
    setSyncing(true); setErr(null); setMsg(null);
    getSession()
      .then(function(s){
        return ksefApi.receiveInvoices(s.accessToken,s.baseUrl,
          tab==="incoming"?"incoming":"outgoing",dateFrom,dateTo);
      })
      .then(function(r){
        var dir=tab==="incoming"?r.incoming:r.outgoing;
        setMsg("\u2713 Pobrano: "+(dir.fetched||0)+" z KSeF, nowych: "+(dir.saved||0)+".");
        loadLocal();
      })
      .catch(function(e){setErr(e.message||"B\u0142\u0105d synchronizacji");})
      .finally(function(){setSyncing(false);});
  }

  var tabs=[
    {id:"incoming",lbl:"\uD83D\uDCE5 Otrzymane (kosztowe)"},
    {id:"outgoing",lbl:"\uD83D\uDCE4 Wys\u0142ane (sprzeda\u017cowe)"},
  ];

  return ce("div",null,
    ce("div",{style:{display:"flex",gap:0,marginBottom:16,borderBottom:"2px solid var(--bd2)"}},
      tabs.map(function(t){
        var a=tab===t.id;
        return ce("button",{key:t.id,onClick:function(){setTab(t.id);},
          style:{border:"none",background:"none",padding:"8px 16px",fontSize:13,
            fontWeight:a?700:400,color:a?"var(--violet)":"var(--t3)",cursor:"pointer",
            borderBottom:a?"2px solid var(--violet)":"2px solid transparent",marginBottom:-2}},t.lbl);
      })
    ),
    ce("div",{style:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}},
      ce("div",null,ce("span",{style:label},"Od"),
        ce("input",{type:"date",style:Object.assign({},inp,{maxWidth:140}),value:dateFrom,
          onChange:function(e){setDateFrom(e.target.value);}})),
      ce("div",null,ce("span",{style:label},"Do"),
        ce("input",{type:"date",style:Object.assign({},inp,{maxWidth:140}),value:dateTo,
          onChange:function(e){setDateTo(e.target.value);}})),
      ce("button",{onClick:sync,disabled:syncing,style:Object.assign({},btnPrimary,{alignSelf:"flex-end"})},
        syncing?"\u23F3 Synchronizuj\u0119...":"\uD83D\uDD04 Synchronizuj z KSeF"),
      ce("button",{onClick:loadLocal,disabled:loading,style:Object.assign({},btnSecondary,{alignSelf:"flex-end"})},
        "\uD83D\uDDD8 Od\u015bwie\u017c")
    ),
    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,
      padding:"10px 14px",fontSize:13,color:"#b91c1c",marginBottom:12}},"\u26A0\uFE0F "+err),
    msg&&ce("div",{style:{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:10,
      padding:"10px 14px",fontSize:13,color:"#065f46",marginBottom:12}},msg),
    loading&&ce("div",{style:{textAlign:"center",padding:"40px 0",color:"var(--t3)"}}),
    !loading&&invoices.length===0&&ce("div",{style:{textAlign:"center",padding:"40px 0",color:"var(--t3)",fontSize:14}},
      "Brak faktur. Kliknij \u201eSync z KSeF\u201d aby pobra\u0107 dane."),
    !loading&&invoices.length>0&&ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden"}},
      ce("div",{style:{display:"grid",gridTemplateColumns:"180px 1fr 110px 110px 90px",gap:8,
        padding:"10px 16px",borderBottom:"1px solid var(--bd2)",background:"var(--bg)"}},
        ["Numer KSeF","Kontrahent","Data","Brutto","Waluta"].map(function(h,i){
          return ce("div",{key:i,style:{fontSize:10,fontWeight:700,color:"var(--t3)",
            textTransform:"uppercase",letterSpacing:"0.06em",textAlign:i>=2?"right":"left"}},h);
        })
      ),
      invoices.map(function(inv){
        return ce("div",{key:inv.id,
          style:{display:"grid",gridTemplateColumns:"180px 1fr 110px 110px 90px",gap:8,
            padding:"11px 16px",borderBottom:"1px solid var(--bd3)",background:"var(--bg2)"}},
          ce("div",{style:{fontSize:11,fontFamily:"monospace",color:"var(--violet)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
            inv.ksef_number||inv.number||"\u2014"),
          ce("div",null,
            ce("div",{style:{fontSize:13,fontWeight:500,color:"var(--t1)"}},
              (inv.buyer_name||"\u2014").slice(0,45)),
            inv.buyer_nip&&ce("div",{style:{fontSize:11,color:"var(--t3)"}},"NIP: "+inv.buyer_nip)
          ),
          ce("div",{style:{fontSize:12,textAlign:"right",color:"var(--t2)"}},fmtDate(inv.issue_date)),
          ce("div",{style:{fontSize:13,fontWeight:700,textAlign:"right",color:"var(--t1)"}},
            fmtMoney(inv.total_gross)),
          ce("div",{style:{fontSize:12,textAlign:"right",color:"var(--t3)"}},inv.currency||"PLN")
        );
      })
    )
  );
}

export function ScreenInvoices(p){
  var [view,setView]=useState("list");       // list | editor | settings
  var [mainTab,setMainTab]=useState("local");
  var [invoices,setInvoices]=useState([]);
  var [settings,setSettings]=useState(null);
  var [editInv,setEditInv]=useState(null);   // null = nowa faktura
  var [loading,setLoading]=useState(true);
  var [err,setErr]=useState(null);

  // Ładuj faktury i ustawienia
  useEffect(function(){
    Promise.all([sbApi.getInvoices(), sbApi.getInvoiceSettings()])
      .then(function(results){
        setInvoices(results[0]||[]);
        setSettings(results[1]||{});
        setLoading(false);
      })
      .catch(function(e){
        setErr(e.message||"Błąd ładowania");
        setLoading(false);
      });
  },[]);

  function openNew(){
    // Jeśli brak ustawień sprzedawcy — wymuś najpierw konfigurację
    if(!settings||!settings.seller_name){
      setView("settings");
      return;
    }
    setEditInv(null);
    setView("editor");
  }
  function openEdit(inv){ setEditInv(inv); setView("editor"); }
  function openSettings(){ setView("settings"); }

  function onSaved(result){
    // Odśwież listę
    sbApi.getInvoices().then(function(data){ setInvoices(data||[]); });
    setView("list");
  }
  function onSettingsSaved(newSettings){
    setSettings(newSettings);
    setView("list");
  }
  function onDelete(id){
    sbApi.deleteInvoice(id)
      .then(function(){ setInvoices(function(prev){return prev.filter(function(i){return i.id!==id;});}); })
      .catch(function(e){ alert("Błąd usuwania: "+e.message); });
  }

  // Brak ustawień — banner informacyjny
  var settingsEmpty=!settings||!settings.seller_name;

  return ce("div",{style:{padding:"0 4px"}},

    view==="list"&&ce("div",{style:{display:"flex",gap:0,marginBottom:20,borderBottom:"2px solid var(--bd2)"}},
      [{id:"local",lbl:"\uD83D\uDCCB Moje faktury"},{id:"ksef",lbl:"\uD83D\uDCCA KSeF"}].map(function(t){
        var a=mainTab===t.id;
        return ce("button",{key:t.id,onClick:function(){setMainTab(t.id);},
          style:{border:"none",background:"none",padding:"9px 20px",fontSize:13,
            fontWeight:a?700:400,color:a?"var(--violet)":"var(--t3)",cursor:"pointer",
            borderBottom:a?"2px solid var(--violet)":"2px solid transparent",marginBottom:-2}},t.lbl);
      })
    ),

    loading&&ce("div",{style:{textAlign:"center",padding:"60px 0",color:"var(--t3)"}},"\u23F3 Ładowanie..."),
    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"14px",fontSize:13,color:"#b91c1c",marginBottom:16}},"\u26A0\uFE0F "+err),

    !loading&&view==="list"&&mainTab==="ksef"&&ce(KsefView,null),

    !loading&&view==="list"&&mainTab==="local"&&ce("div",null,
      settingsEmpty&&ce("div",{style:{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#78350f",display:"flex",alignItems:"center",gap:10}},
        ce("span",{style:{fontSize:18}},"\u26A0\uFE0F"),
        ce("span",null,"Uzupełnij dane sprzedawcy przed wystawieniem pierwszej faktury. "),
        ce("button",{onClick:openSettings,style:Object.assign({},btnSecondary,{fontSize:12,padding:"5px 10px",marginLeft:4})},"Ustawienia")
      ),
      ce(InvoiceList,{
        invoices:invoices,
        onNew:openNew, onEdit:openEdit, onSettings:openSettings, onDelete:onDelete
      })
    ),

    !loading&&view==="editor"&&ce(InvoiceEditor,{
      invoice:editInv, settings:settings||{},
      onSave:onSaved,
      onClose:function(){setView("list");}
    }),

    !loading&&view==="settings"&&ce(InvoiceSettings,{
      settings:settings||{},
      onSaved:onSettingsSaved,
      onClose:function(){setView("list");}
    })
  );
}
