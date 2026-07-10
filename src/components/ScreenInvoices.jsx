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
  {id:"eko",      label:"Dokument EKO (gotówkowy, 0% VAT)"},
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
// Oblicza linię faktury od strony brutto → netto.
function calcLineFromGross(unit_gross, qty, vat_rate){
  var q=+(qty)||1, g=+(unit_gross)||0;
  var line_gross=+(g*q).toFixed(2);
  var divisor = vat_rate===-1 ? 1 : (1 + (+(vat_rate)/100));
  var line_net=+(line_gross/divisor).toFixed(2);
  var line_vat=+(line_gross-line_net).toFixed(2);
  var unit_net=q?+(line_net/q).toFixed(4):0;
  return {unit_net, line_net, line_vat, line_gross};
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
  return (tmpl||"{nr}/{MM}/{YYYY}")
    .replace("{nr}",String(nr))
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
    if(field==="unit_gross"){
      // Przelicz brutto → netto
      var nums=calcLineFromGross(val,it.quantity,it.vat_rate);
      next=Object.assign(next,nums,{unit_gross:val});
    } else if(field==="unit_net"||field==="quantity"||field==="vat_rate"){
      var nums=calcLine(
        field==="unit_net"?val:it.unit_net,
        field==="quantity"?val:it.quantity,
        field==="vat_rate"?val:it.vat_rate
      );
      // Wylicz unit_gross z nowego line_gross/qty
      var q2=+(field==="quantity"?val:it.quantity)||1;
      next=Object.assign(next,nums,{unit_gross:+(nums.line_gross/q2).toFixed(4)});
    }
    onChange(idx,next);
  }

  return ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 60px 70px 80px 80px 70px 90px 90px 28px",gap:6,alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--bd3)"}},
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
    // Cena brutto — bez type:number (brak strzalek), puste zamiast 0
    ce("input",{style:Object.assign({},inpSm,{textAlign:"right",background:"#f0f7ff"}),
      value:(it.unit_gross==null||it.unit_gross===""||+(it.unit_gross)===0)?"":(typeof it.unit_gross==="string"?it.unit_gross:+(+(it.unit_gross)).toFixed(2)),
      inputMode:"decimal", placeholder:"0,00",
      onChange:function(e){upd("unit_gross",e.target.value.replace(",","."));}}),
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
  var isDraft=!isNew&&p.invoice.status==="draft";
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
  var [kasowa,setKasowa]=useState(!!(initInv.kasowa));
  var [notes,setNotes]=useState(initInv.notes||"");
  var [buyerName,setBuyerName]=useState(initInv.buyer_name||"");
  var [buyerNip,setBuyerNip]=useState(initInv.buyer_nip||"");
  var [buyerAddr,setBuyerAddr]=useState(initInv.buyer_address||"");
  var [buyerPostal,setBuyerPostal]=useState(initInv.buyer_postal||"");
  var [buyerCity,setBuyerCity]=useState(initInv.buyer_city||"");
  var [buyerEmail,setBuyerEmail]=useState(initInv.buyer_email||"");
  var [clientId,setClientId]=useState(initInv.client_id||null);
  var [dealId,setDealId]=useState(initInv.deal_id||null);
  var [clientSearch,setClientSearch]=useState("");
  var [clientDropOpen,setClientDropOpen]=useState(false);
  var [items,setItems]=useState(
    (initInv.invoice_items&&initInv.invoice_items.length>0)
      ? initInv.invoice_items
      : [freshItem()]
  );
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState(null);

  // GUS/NIP lookup — najpierw prawdziwe API GUS (REGON BIR przez /api/gus, pełna nazwa
  // i adres także dla JDG), a dopiero w razie błędu fallback na Białą Listę VAT.
  var [nipLoading,setNipLoading]=useState(false);
  function lookupNip(){
    var nip=(buyerNip||"").replace(/[\s\-]/g,"");
    if(nip.length<10){setErr("NIP musi mieć 10 cyfr");return;}
    setNipLoading(true); setErr(null);
    fetch("/api/gus?nip="+nip)
      .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
      .then(function(res){
        var d=res.d||{};
        if(res.ok&&d.name){
          setBuyerName(d.name);
          if(d.street)setBuyerAddr(d.street);
          if(d.postal)setBuyerPostal(d.postal);
          if(d.city)setBuyerCity(d.city);
          setNipLoading(false);
          return;
        }
        // GUS nie znalazł / brak klucza — spróbuj Białej Listy
        lookupNipWL(nip);
      })
      .catch(function(){lookupNipWL(nip);});
  }
  // Fallback: Biała Lista VAT (dla JDG zwraca tylko imię i nazwisko, adres często pusty)
  function lookupNipWL(nip){
    fetch("https://wl-api.mf.gov.pl/api/search/nip/"+nip+"?date="+todayISO())
      .then(function(r){return r.json();})
      .then(function(d){
        var s=d&&d.result&&d.result.subject;
        if(!s){setErr("Nie znaleziono podmiotu dla NIP: "+nip);return;}
        setBuyerName(s.name||buyerName);
        // Biała Lista dla JDG często zwraca tylko imię i nazwisko bez nazwy handlowej — to ograniczenie rejestru, nie błąd aplikacji
        if(s.name&&!/[a-zA-Z]{3,}.*\s.*[a-zA-Z]{3,}.*\s/.test(s.name)){
          setErr("Biała Lista zwróciła tylko imię i nazwisko („"+s.name+"”) — to wszystko co jest dostępne w rejestrze VAT dla tego NIP. Możesz dopisać nazwę handlową ręcznie jeśli potrzebna.");
        }
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
      .catch(function(){setErr("Błąd połączenia z GUS i Białą Listą");})
      .finally(function(){setNipLoading(false);});
  }

  // Lista klientów z CRM (przekazana z ScreenInvoices), filtrowana po wyszukiwaniu
  var clientsList=p.clients||[];
  var dealsList=p.deals||[];
  var filteredClients=clientSearch.trim()
    ? clientsList.filter(function(c){
        var q=clientSearch.toLowerCase();
        return (c.name||"").toLowerCase().includes(q);
      })
    : clientsList;

  function pickClient(c){
    setClientId(c.id);
    setBuyerName(c.name||buyerName);
    setBuyerAddr(c.addr||buyerAddr);
    setBuyerPostal(c.postal||buyerPostal);
    setBuyerCity(c.city||buyerCity);
    setBuyerEmail(c.email||buyerEmail);
    // Znajdź aktywny deal tego klienta jeśli istnieje
    var d=dealsList.find(function(x){return x.client_id===c.id;});
    setDealId(d?d.id:null);
    setClientSearch(c.name||"");
    setClientDropOpen(false);
  }
  function clearClient(){
    setClientId(null); setDealId(null); setClientSearch("");
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

  function save(){
    var vErr=validate();
    if(vErr){setErr(vErr);return;}
    setBusy(true); setErr(null);

    var header={
      doc_type:docType,
      issue_date:issueDate, sale_date:saleDate, due_date:dueDate,
      payment_method:payMethod, kasowa:kasowa,
      client_id:clientId, deal_id:dealId,
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

    var prom;
    if(isNew){
      // "draft" tu jest tylko przejściowe — chwilę niżej, zaraz po zapisaniu pozycji,
      // nadajemy numer i przestawiamy na "issued". Opcja ręcznego "Wystaw fakturę" jako
      // osobny krok została usunięta: każda nowa faktura (niezależnie od typu dokumentu)
      // jest wystawiana od razu przy zapisie, tak jak dotychczas działo się to tylko dla EKO.
      prom=sbApi.addInvoice(Object.assign({status:"draft"},header));
    } else {
      prom=sbApi.updateInvoice(p.invoice.id,header).then(function(){return {id:p.invoice.id};});
    }

    prom.then(function(inv){
      var invId=inv.id||inv[0]&&inv[0].id;
      var itemsToSave=items.map(function(it,i){
        var effVat=docType==="eko"?0:+(it.vat_rate);
        var effNet=+(it.line_net)||0;
        var effVatAmt=docType==="eko"?0:+(it.line_vat)||0;
        return {
          position:i+1, name:it.name, quantity:+(it.quantity)||1,
          unit:it.unit||"szt", unit_net:+(it.unit_net)||0,
          vat_rate:effVat, line_net:effNet,
          line_vat:effVatAmt, line_gross:effNet+effVatAmt,
          pkwiu:it.pkwiu||""
        };
      });
      return sbApi.replaceInvoiceItems(invId,itemsToSave).then(function(){
        if(isNew){
          var period2=periodKey(settings.numbering_reset||"monthly",issueDate||todayISO());
          return sbApi.nextInvoiceNumber(docType,period2).then(function(nr){
            var nrNum=Array.isArray(nr)?+(nr[0]):+(nr)||0;
            var rawNum=formatNumber(settings.numbering_format||"{nr}/{MM}/{YYYY}",nrNum,issueDate||todayISO());
            var num=docType==="eko"?("EKO/"+rawNum):rawNum;
            return sbApi.updateInvoice(invId,{status:"issued",number:num}).then(function(){
              return Object.assign({},inv,{id:invId,status:"issued",number:num});
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
      docType==="eko"&&ce("div",{style:{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#166534",marginTop:4}},
        "🟢 Dokument EKO — 0% VAT, wydatki gotówkowe, wystawiany od razu (bez KSeF). Stawka VAT zostanie wyzerowana przy zapisie."),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}},
        ce("div",null,ce("span",{style:label},"Data wystawienia"),ce("input",{style:inp,type:"date",value:issueDate,onChange:function(e){setIssueDate(e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Data sprzedaży"),ce("input",{style:inp,type:"date",value:saleDate,onChange:function(e){setSaleDate(e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Termin płatności"),ce("input",{style:inp,type:"date",value:dueDate,onChange:function(e){setDueDate(e.target.value);}}))
      ),
      ce("div",{style:{marginTop:12}},
        ce("span",{style:label},"Forma płatności"),
        ce("div",{style:{display:"flex",alignItems:"center",gap:16}},
          ce("select",{style:Object.assign({},inp,{maxWidth:220}),value:payMethod,onChange:function(e){setPayMethod(e.target.value);}},
            PAYMENT_METHODS.map(function(m){return ce("option",{key:m,value:m},m);})),
          ce("label",{style:{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--t2)",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"}},
            ce("input",{type:"checkbox",checked:kasowa,onChange:function(e){setKasowa(e.target.checked);},style:{width:15,height:15,cursor:"pointer"}}),
            "Metoda kasowa")))
    ),

    // ── SEKCJA: Nabywca ──
    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83C\uDFE2 Nabywca"),
      ce("div",{style:{marginBottom:14,position:"relative"}},
        ce("span",{style:label},"Klient z CRM (opcjonalnie)"),
        ce("div",{style:{display:"flex",gap:8}},
          ce("input",{style:Object.assign({},inp,{flex:1}),
            value:clientSearch,
            placeholder:"Szukaj klienta po imieniu i nazwisku...",
            onChange:function(e){setClientSearch(e.target.value);setClientDropOpen(true);if(!e.target.value)clearClient();},
            onFocus:function(){setClientDropOpen(true);}}),
          clientId&&ce("button",{onClick:clearClient,type:"button",
            style:Object.assign({},btnSecondary,{padding:"8px 12px"})},"\u00D7")
        ),
        clientDropOpen&&filteredClients.length>0&&ce("div",{
          style:{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
            background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:8,
            maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.15)",marginTop:4}},
          filteredClients.slice(0,30).map(function(c){
            return ce("div",{key:c.id,
              onClick:function(){pickClient(c);},
              style:{padding:"8px 12px",cursor:"pointer",fontSize:13,
                borderBottom:"1px solid var(--bd3)",color:"var(--t1)"},
              onMouseEnter:function(e){e.currentTarget.style.background="var(--bg3)";},
              onMouseLeave:function(e){e.currentTarget.style.background="transparent";}},
              c.name,
              c.addr&&ce("div",{style:{fontSize:11,color:"var(--t3)"}},c.addr)
            );
          })
        ),
        clientId&&ce("div",{style:{fontSize:11,color:"var(--violet)",marginTop:4}},
          "\u2713 Powi\u0105zano z klientem CRM"+(dealId?" \u2014 deal #"+dealId:""))
      ),
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
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 60px 70px 80px 80px 70px 90px 90px 28px",gap:6,marginBottom:4}},
        ["Nazwa towaru / usługi","Ilość","Jm","Cena netto","Cena brutto","VAT","Netto","Brutto",""].map(function(h,i){
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
      ce("button",{onClick:function(){save();},style:btnPrimary,disabled:busy},
        busy?"\u23F3 Zapisuję...":(isNew?"\u2705 Wystaw fakturę":"\uD83D\uDCBE Zapisz zmiany"))
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
        ce("input",{style:inp,value:form.numbering_format||"{nr}/{MM}/{YYYY}",onChange:function(e){upd("numbering_format",e.target.value);}}),
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
  var [testBusy,setTestBusy]=useState(false);
  var [testMsg,setTestMsg]=useState(null);
  var [testErr,setTestErr]=useState(null);
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

  // Testuje po\u0142\u0105czenie z KSeF bez wysy\u0142ania faktury \u2014 u\u017cywa tego samego
  // /api/ksef/session co realna wysy\u0142ka, wi\u0119c wynik jest wiarygodny.
  function testConnection(){
    setTestBusy(true);setTestErr(null);setTestMsg(null);
    ksefApi.openSession()
      .then(function(){setTestMsg("\u2705 Po\u0142\u0105czenie dzia\u0142a \u2014 KSeF zaakceptowa\u0142 dane uwierzytelniaj\u0105ce.");})
      .catch(function(e){setTestErr(e.message||"B\u0142\u0105d testu po\u0142\u0105czenia");})
      .finally(function(){setTestBusy(false);});
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
              ce("button",{onClick:testConnection,disabled:testBusy,
                style:Object.assign({},btnSecondary,{fontSize:11,padding:"5px 10px",marginRight:6})},
                testBusy?"\u23F3 Testuj\u0119...":"\uD83D\uDD0C Testuj po\u0142\u0105czenie"),
              ce("button",{onClick:del,disabled:busy,
                style:Object.assign({},btnDanger,{fontSize:11,padding:"5px 10px"})},
                "Usu\u0144")
            ),
            testMsg&&ce("div",{style:{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#065f46",marginBottom:10}},testMsg),
            testErr&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#b91c1c",marginBottom:10}},"\u26A0\uFE0F "+testErr),
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
    draft:    {label:"Szkic",     bg:"var(--bg2)",   color:"var(--t3)", desc:"Faktura utworzona, jeszcze nie wystawiona — brak numeru, nie poszła do klienta ani do KSeF."},
    issued:   {label:"Wystawiona",bg:"#dbeafe",      color:"#1e40af",   desc:"Faktura sprzedażowa z nadanym numerem — gotowa do wysłania klientowi i/lub do KSeF."},
    received: {label:"Otrzymana", bg:"#d1fae5",      color:"#065f46",   desc:"Faktura zakupowa (kosztowa) — odebrana od kontrahenta / zsynchronizowana z KSeF."},
    sent:     {label:"Wysłana",   bg:"#ede9fe",      color:"#5b21b6",   desc:"Faktura wysłana do KSeF, oczekuje na potwierdzenie."},
    cancelled:{label:"Anulowana", bg:"#fef2f2",      color:"#b91c1c",   desc:"Faktura anulowana / cofnięta."},
  };
  var c=cfg[p.status]||cfg.draft;
  // Faktura opłacona (checkbox "Zapłacono"/payStatus) — pokazujemy to w samym statusie
  // niezależnie od stanu dokumentu (issued=sprzedażowa, received=zakupowa itd.).
  // Nasycony ciemny zielony na bialym tekscie, zeby wyraznie odroznic od jasnego
  // mintu "Otrzymana" (Paulina zglaszala ze bledly sie ze soba w liscie).
  // inv.status w bazie zostaje bez zmian — to wylacznie nadpisanie etykiety w tym miejscu.
  if(p.paid&&p.status!=="draft"&&p.status!=="cancelled"){
    c={label:"Zapłacona",bg:"#059669",color:"#fff",desc:"Faktura opłacona."};
  }
  return ce("span",{title:c.desc,style:{
    fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px",
    background:c.bg,color:c.color,whiteSpace:"nowrap",cursor:"help"
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
  var [filterDocType,setFilterDocType]=useState("all");
  var [groupFilter,setGroupFilter]=useState("all"); // all | zakup | sprzedaz — filtr z kafelków
  var [syncOpen,setSyncOpen]=useState(false);
  var [syncing,setSyncing]=useState(false);
  var [syncMsg,setSyncMsg]=useState(null);
  var [syncErr,setSyncErr]=useState(null);
  var [dateFrom,setDateFrom]=useState(function(){
    var d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10);
  });
  var [dateTo,setDateTo]=useState(function(){ return new Date().toISOString().slice(0,10); });
  var [sess,setSess]=useState(null);

  function getSession(){
    if(sess&&new Date(sess.expiresAt)>new Date()) return Promise.resolve(sess);
    return ksefApi.openSession().then(function(s){ setSess(s); return s; });
  }

  function syncKsef(){
    setSyncing(true); setSyncErr(null); setSyncMsg(null);
    getSession()
      .then(function(s){
        return ksefApi.receiveInvoices(s.accessToken,s.baseUrl,"all",dateFrom,dateTo);
      })
      .then(function(r){
        var inCount=(r.incoming&&r.incoming.saved)||0;
        var outCount=(r.outgoing&&r.outgoing.saved)||0;
        var inErrs=(r.incoming&&r.incoming.errors)||[];
        var outErrs=(r.outgoing&&r.outgoing.errors)||[];
        var allErrs=inErrs.concat(outErrs);
        var skipCount=((r.incoming&&r.incoming.skipped)||0)+((r.outgoing&&r.outgoing.skipped)||0);
        var remaining=r.remaining||0;
        var repaired=r.repaired||0;
        setSyncMsg("\u2713 Pobrano z KSeF: "+((r.incoming&&r.incoming.fetched)||0)+" zakupowych, "+((r.outgoing&&r.outgoing.fetched)||0)+" sprzeda\u017cowych. Nowych/zaktualizowanych: "+(inCount+outCount)+"."
          +(repaired>0?" Uzupe\u0142niono pozycje: "+repaired+".":"")
          +(skipCount>0?" Pomini\u0119to (ju\u017c kompletne): "+skipCount+".":"")
          +(remaining>0?" \u23F3 Pozosta\u0142o "+remaining+" \u2014 kliknij \"Pobierz z KSeF\" jeszcze raz, aby doko\u0144czy\u0107.":""));
        if(allErrs.length>0){
          setSyncErr("\u26A0\uFE0F "+allErrs.length+" faktur pomini\u0119to z b\u0142\u0119dem. Przyk\u0142ad: "
            +(allErrs[0].ksefNum||"?")+" \u2014 "+(allErrs[0].err||"nieznany b\u0142\u0105d")
            +(allErrs.length>1?" (i "+(allErrs.length-1)+" wi\u0119cej, zobacz logi Edge Function w Supabase)":""));
        } else {
          // Kontrola spojnosci: ile faktur z KSeF nie trafilo do zadnego koszyka.
          var fetchedTotal=((r.incoming&&r.incoming.fetched)||0)+((r.outgoing&&r.outgoing.fetched)||0);
          var accounted=inCount+outCount+repaired+skipCount+remaining;
          if(fetchedTotal-accounted>5){
            setSyncErr("\u26A0\uFE0F "+(fetchedTotal-accounted)+" faktur z KSeF nie zosta\u0142o rozliczonych (brak numeru KSeF w metadanych?). Sprawd\u017a logi Edge Function.");
          }
        }
        p.onSynced&&p.onSynced();
      })
      .catch(function(e){setSyncErr(e.message||"B\u0142\u0105d synchronizacji");})
      .finally(function(){setSyncing(false);});
  }

  var list=(p.invoices||[]).filter(function(inv){
    if(groupFilter==="zakup"&&inv.doc_type!=="zakup") return false;
    if(groupFilter==="sprzedaz"&&inv.doc_type==="zakup") return false;
    if(filterDocType!=="all"&&inv.doc_type!==filterDocType) return false;
    if(search){
      var q=search.toLowerCase();
      return (inv.number&&inv.number.toLowerCase().includes(q))
          || (inv.buyer_name&&inv.buyer_name.toLowerCase().includes(q))
          || (inv.buyer_nip&&inv.buyer_nip.includes(q));
    }
    return true;
  });

  // Liczniki do kafelków Zakup / Sprzedaż (liczone z pełnej listy, nie z `list` po filtrach)
  var docTypeCounts=(p.invoices||[]).reduce(function(acc,inv){
    if(inv.doc_type==="zakup") acc.zakup++; else acc.sprzedaz++;
    return acc;
  },{zakup:0,sprzedaz:0});

  var payStatus=function(inv){
    if(inv.payment_method==="gotówka"&&inv.status==="issued") return {label:"Zapłacona",color:"#059669"};
    if(inv.payment_status==="paid")   return {label:"Zapłacona",color:"#059669"};
    if(inv.payment_status==="partial")return {label:"Częściowa",color:"#854d0e"};
    if(inv.status==="issued"&&inv.due_date&&inv.due_date<todayISO()) return {label:"Przeterminowana",color:"#b91c1c"};
    return {label:"Oczekuje",color:"var(--t3)"};
  };

  return ce("div",null,
    // Kafelki Zakup / Sprzedaż
    ce("div",{style:{display:"flex",gap:10,marginBottom:14}},
      ce("div",{
        onClick:function(){setGroupFilter(groupFilter==="sprzedaz"?"all":"sprzedaz");},
        style:{
          flex:1,cursor:"pointer",padding:"14px 18px",borderRadius:14,
          border:groupFilter==="sprzedaz"?"2px solid var(--violet)":"1px solid var(--bd2)",
          background:groupFilter==="sprzedaz"?"rgba(124,58,237,0.08)":"var(--bg2)",
          transition:"all .15s"
        }
      },
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}},"\uD83D\uDCB0 Sprzeda\u017c"),
        ce("div",{style:{fontSize:24,fontWeight:800,color:"var(--t2)",marginTop:4}},docTypeCounts.sprzedaz)
      ),
      ce("div",{
        onClick:function(){setGroupFilter(groupFilter==="zakup"?"all":"zakup");},
        style:{
          flex:1,cursor:"pointer",padding:"14px 18px",borderRadius:14,
          border:groupFilter==="zakup"?"2px solid var(--violet)":"1px solid var(--bd2)",
          background:groupFilter==="zakup"?"rgba(124,58,237,0.08)":"var(--bg2)",
          transition:"all .15s"
        }
      },
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}},"\uD83D\uDCE5 Zakup"),
        ce("div",{style:{fontSize:24,fontWeight:800,color:"var(--t2)",marginTop:4}},docTypeCounts.zakup)
      )
    ),

    // Toolbar
    ce("div",{style:{display:"flex",gap:10,marginBottom:syncOpen?10:16,flexWrap:"wrap",alignItems:"center"}},
      ce("input",{style:Object.assign({},inp,{maxWidth:260,flex:1}),
        value:search,onChange:function(e){setSearch(e.target.value);},
        placeholder:"\uD83D\uDD0D Szukaj po numerze, nabywcy, NIP..."}),
      ce("select",{style:Object.assign({},inp,{maxWidth:160}),value:filterDocType,onChange:function(e){setFilterDocType(e.target.value);}},
        ce("option",{value:"all"},"Wszystkie"),
        ce("option",{value:"vat"},"Sprzeda\u017cowa"),
        ce("option",{value:"zakup"},"Zakupowa"),
        ce("option",{value:"proforma"},"Pro forma"),
        ce("option",{value:"eko"},"EKO (gotówkowe)")),
      ce("button",{onClick:p.onNew,style:btnPrimary},"+ Nowa faktura"),
      ce("button",{onClick:p.onSettings,style:btnSecondary},"\u2699\uFE0F Ustawienia"),
      ce("button",{onClick:function(){setSyncOpen(!syncOpen);},
        style:Object.assign({},btnSecondary,syncOpen?{borderColor:"var(--violet)",color:"var(--violet)"}:{})},
        "\uD83D\uDD04 Synchronizuj z KSeF")
    ),

    // Panel synchronizacji KSeF (rozwijany)
    syncOpen&&ce("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end",
      background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,padding:"10px 12px"}},
      ce("div",null,ce("span",{style:label},"Od"),
        ce("input",{type:"date",style:Object.assign({},inp,{maxWidth:140}),value:dateFrom,
          onChange:function(e){setDateFrom(e.target.value);}})),
      ce("div",null,ce("span",{style:label},"Do"),
        ce("input",{type:"date",style:Object.assign({},inp,{maxWidth:140}),value:dateTo,
          onChange:function(e){setDateTo(e.target.value);}})),
      ce("button",{onClick:syncKsef,disabled:syncing,style:Object.assign({},btnPrimary,{alignSelf:"flex-end"})},
        syncing?"\u23F3 Synchronizuj\u0119...":"\uD83D\uDD04 Pobierz z KSeF"),
      syncErr&&ce("div",{style:{fontSize:12,color:"#b91c1c"}},"\u26A0\uFE0F "+syncErr),
      syncMsg&&ce("div",{style:{fontSize:12,color:"#065f46"}},syncMsg)
    ),

    // Brak faktur
    list.length===0&&ce("div",{style:{textAlign:"center",padding:"40px 0",color:"var(--t3)",fontSize:14}},
      search||filterDocType!=="all"?"Brak pas\u0105j\u0105cych faktur":"Brak faktur \u2014 kliknij \"+ Nowa faktura\" aby wystawi\u0107 pierwsz\u0105."),

    // Tabela
    list.length>0&&ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden"}},
      // Nagłówek tabeli
      ce("div",{style:{display:"grid",gridTemplateColumns:"110px 110px minmax(180px,1fr) 95px 100px 130px 90px 100px 90px 36px",gap:6,padding:"10px 14px",borderBottom:"1px solid var(--bd2)",background:"var(--bg)",width:"100%"}},
        ["Numer","Typ","Kontrahent","Data","Termin pł.","Brutto / Netto","Zapłacono","Zatwierdzono","Status",""].map(function(h,i){
          return ce("div",{key:i,style:{fontSize:10,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em",textAlign:i===2?"left":(i>=6?"center":"right")}},h);
        })
      ),
      // Wiersze
      list.map(function(inv){
        var ps=payStatus(inv);
        var isOverdue=ps.label==="Przeterminowana";
        var cb=function(checked,onToggle){
          return ce("div",{style:{textAlign:"center"}},
            ce("input",{type:"checkbox",checked:!!checked,
              onClick:function(e){e.stopPropagation();},
              onChange:function(e){onToggle(e.target.checked);},
              style:{width:16,height:16,cursor:"pointer",accentColor:"var(--violet)"}})
          );
        };
        // Checkbox "Zapłacono": stan liczymy z payStatus (nie z inv.paid osobno) — inaczej
        // gotówkowe faktury pokazywaly pusta kratke mimo etykiety "Zaplacona".
        // Zaplacone sa zablokowane i wyszarzone niezaleznie od zrodla (gotowka/reczne odhaczenie/KSeF),
        // zeby wyglad byl spojny. Cofniecie robi sie z edytora faktury.
        var paidCb=function(){
          var forcedPaid=inv.payment_method==="gotówka"&&inv.status==="issued";
          var isPaid=forcedPaid||ps.label==="Zapłacona";
          var lockedByCash=forcedPaid;
          return ce("div",{style:{textAlign:"center"}},
            ce("input",{type:"checkbox",checked:isPaid,
              disabled:isPaid,
              title:lockedByCash?"Płatność gotówką — uznawana za zapłaconą automatycznie po wystawieniu"
                    :isPaid?"Faktura oznaczona jako zapłacona — cofnij w edytorze faktury":undefined,
              onClick:function(e){e.stopPropagation();},
              onChange:function(e){p.onTogglePaid&&p.onTogglePaid(inv,e.target.checked);},
              style:{width:16,height:16,cursor:isPaid?"not-allowed":"pointer",accentColor:"var(--violet)",opacity:isPaid?0.55:1}}),
            ce("div",{style:{fontSize:9,fontWeight:700,marginTop:2,color:ps.color}},ps.label)
          );
        };
        var isPurchase=inv.doc_type==="zakup";
        var dirLabel=isPurchase?"📥 Zakupowa":(inv.doc_type==="proforma"?"📄 Proforma":inv.doc_type==="eko"?"🟢 EKO":"📤 Sprzedażowa");
        var snap=inv.seller_snapshot||{};
        // Fallback do buyer_* dla starych rekordów sprzed wprowadzenia seller_snapshot przy synchronizacji
        var contragentName=isPurchase?(snap.name||inv.buyer_name||"—"):(inv.buyer_name||"—");
        var contragentNip=isPurchase?(snap.nip||inv.buyer_nip||""):(inv.buyer_nip||"");
        var isBusy=p.viewBusyId===inv.id;
        var rowBg=isOverdue?"#fef2f2":"var(--bg2)";
        return ce("div",{key:inv.id,
          onClick:function(){ if(isBusy)return; (inv.ksef_number||inv.status==="issued")?(p.onView&&p.onView(inv)):p.onEdit(inv); },
          style:{display:"grid",gridTemplateColumns:"110px 110px minmax(180px,1fr) 95px 100px 130px 90px 100px 90px 36px",gap:6,padding:"11px 14px",
            borderBottom:"1px solid var(--bd3)",cursor:isBusy?"wait":"pointer",transition:"background .12s",
            background:rowBg,width:"100%",opacity:isBusy?0.6:1},
          onMouseEnter:function(e){e.currentTarget.style.background=isOverdue?"#fee2e2":"var(--bg3||var(--bg))";},
          onMouseLeave:function(e){e.currentTarget.style.background=rowBg;}
        },
          ce("div",{style:{fontSize:12,fontWeight:700,color:"var(--violet)"}},
            inv.number||ce("span",{style:{color:"var(--t3)",fontStyle:"italic"}},"(szkic)")),
          ce("div",{style:{fontSize:11,textAlign:"right",color:isPurchase?"#b45309":"var(--t2)",fontWeight:isPurchase?600:400}},dirLabel),
          ce("div",null,
            ce("div",{style:{fontSize:13,fontWeight:500,color:"var(--t1)"}},contragentName.slice(0,40)),
            contragentNip&&ce("div",{style:{fontSize:11,color:"var(--t3)"}},"NIP: "+contragentNip)
          ),
          ce("div",{style:{fontSize:12,textAlign:"right",color:"var(--t2)"}},fmtDate(inv.issue_date)),
          ce("div",{style:{fontSize:12,fontWeight:isOverdue?700:400,textAlign:"right",color:isOverdue?"#b91c1c":"var(--t2)"}},fmtDate(inv.due_date)),
          ce("div",{style:{textAlign:"right"}},
            ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)"}},fmtMoney(inv.total_gross)),
            ce("div",{style:{fontSize:10,color:"var(--t3)"}},"netto "+fmtMoney(inv.total_net))
          ),
          paidCb(),
          inv.ksef_number
            ? ce("div",{style:{textAlign:"center"},title:"Zatwierdzone automatycznie przez nadanie numeru KSeF"},
                ce("input",{type:"checkbox",checked:true,disabled:true,
                  onClick:function(e){e.stopPropagation();},
                  style:{width:16,height:16,accentColor:"var(--violet)",opacity:0.6,cursor:"not-allowed"}}))
            : cb(inv.approved,function(v){p.onToggleApproved&&p.onToggleApproved(inv,v);}),
          ce("div",{style:{textAlign:"center"}},
            ce(StatusBadge,{status:inv.status,paid:ps.label==="Zapłacona"}),
            isOverdue&&ce("div",{style:{fontSize:9,fontWeight:700,color:"#b91c1c",marginTop:3}},"⚠ termin minął")
          ),
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

// \u2500\u2500 PDF FAKTURY VAT (do druku) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function numberToWordsPL(n){
  var jed=["zero","jeden","dwa","trzy","cztery","pi\u0119\u0107","sze\u015b\u0107","siedem","osiem","dziewi\u0119\u0107"];
  var nast=["dziesi\u0119\u0107","jedena\u015bcie","dwana\u015bcie","trzyna\u015bcie","czterna\u015bcie","pi\u0119tna\u015bcie","szesna\u015bcie","siedemna\u015bcie","osiemna\u015bcie","dziewi\u0119tna\u015bcie"];
  var dzies=["","","dwadzie\u015bcia","trzydzie\u015bci","czterdzie\u015bci","pi\u0119\u0107dziesi\u0105t","sze\u015b\u0107dziesi\u0105t","siedemdziesi\u0105t","osiemdziesi\u0105t","dziewi\u0119\u0107dziesi\u0105t"];
  var set=["","sto","dwie\u015bcie","trzysta","czterysta","pi\u0119\u0107set","sze\u015b\u0107set","siedemset","osiemset","dziewi\u0119\u0107set"];
  function trzy(num){
    var s="";
    var h=Math.floor(num/100), r=num%100;
    if(h>0) s+=set[h]+" ";
    if(r>=10&&r<20) s+=nast[r-10];
    else{
      var d=Math.floor(r/10), j=r%10;
      if(d>0) s+=dzies[d]+(j>0?" ":"");
      if(j>0||r===0&&h===0) s+=jed[j];
    }
    return s.trim();
  }
  function forma(num,f1,f2,f5){
    var m10=num%10, m100=num%100;
    if(num===1) return f1;
    if(m10>=2&&m10<=4&&!(m100>=12&&m100<=14)) return f2;
    return f5;
  }
  n=Math.round(n);
  if(n===0) return "zero z\u0142otych";
  var tys=Math.floor(n/1000), reszta=n%1000;
  var parts=[];
  if(tys>0){
    parts.push(trzy(tys)+" "+forma(tys,"tysi\u0105c","tysi\u0105ce","tysi\u0119cy"));
  }
  if(reszta>0||tys===0){
    parts.push(trzy(reszta));
  }
  var slowna=parts.filter(Boolean).join(" ").trim();
  return slowna.charAt(0).toUpperCase()+slowna.slice(1)+" z\u0142otych 00/100";
}

// Formatuje adres: ulica w linii 1, kod+miasto w linii 2
function fmtAddr(street, postal, city){
  var lines=[];
  var s=(street||'').trim();
  var p=(postal||'').trim();
  var ct=(city||'').trim();
  if(s) lines.push(s);
  // city moze zawierac juz kod pocztowy (XX-XXX)
  if(ct && /\d{2}-\d{3}/.test(ct)){
    lines.push(ct);
  } else if(p||ct){
    lines.push((p+' '+ct).trim());
  }
  return lines.join('<br>');
}

function buildInvoicePDFHtml(inv,settings){
  var s=settings||{};
  var items=inv.invoice_items||[];
  var isZakup=inv.doc_type==="zakup";
  var snap=inv.seller_snapshot||{};
  var fmtM=function(v){return (+(v||0)).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2});};
  var fmtD=function(d){if(!d)return "\u2014";var p=d.split("-");return p[2]+"."+p[1]+"."+p[0];};
  var docLabel={vat:"Faktura",zakup:"Faktura zakupowa",proforma:"Faktura Proforma",zaliczka:"Faktura Zaliczkowa",korekta:"Faktura Koryguj\u0105ca",eko:"Dokument EKO"}[inv.doc_type]||"Faktura";

  // Sprzedawca/Nabywca: dla faktur zakupowych to my (Porter Design) jeste\u015bmy nabywc\u0105,
  // a kontrahent zewn\u0119trzny (zapisany w seller_snapshot przy synchronizacji z KSeF) jest sprzedawc\u0105.
  // Dla sprzeda\u017cowych/proforma jak dot\u0105d: Porter Design = sprzedawca, buyer_* = klient.
  // Fallback: starsze faktury zakupowe (zsynchronizowane przed wprowadzeniem seller_snapshot) maj\u0105
  // prawdziwego sprzedawc\u0119 zapisanego w buyer_* (stara logika) \u2014 u\u017cyj ich, je\u015bli snap jest puste.
  // UWAGA: dane z KSeF (snap.*, buyer_*) nie maj\u0105 osobnego kodu pocztowego/miasta \u2014 ca\u0142y adres
  // to AdresL1 (street) + opcjonalna druga linia AdresL2 (city pole tutaj = ta druga linia wprost).
  // Dane lokalne (s.seller_*) z Ustawie\u0144 maj\u0105 osobny kod+miasto, wi\u0119c te sklejamy jak dot\u0105d.
  var snapEmpty=!snap.name&&!snap.nip;
  var partyTop, partyBottom;
  if(isZakup){
    if(snapEmpty){
      partyTop={
        label:"Sprzedawca:",
        name:inv.buyer_name||"",
        nip:(inv.buyer_nip||"").replace(/[\s\-]/g,""),
        street:inv.buyer_address||"",
        postal:"", city:inv.buyer_city||""
      };
      partyBottom={
        label:"Nabywca:",
        name:s.seller_name||"",
        nip:s.seller_nip||"",
        street:s.seller_address||"",
        postal:s.seller_postal||"", city:s.seller_city||""
      };
    } else {
      partyTop={
        label:"Sprzedawca:",
        name:snap.name||"",
        nip:(snap.nip||"").replace(/[\s\-]/g,""),
        street:snap.address||"",
        postal:"", city:snap.city||""
      };
      partyBottom={
        label:"Nabywca:",
        name:inv.buyer_name||s.seller_name||"",
        nip:inv.buyer_nip||s.seller_nip||"",
        street:inv.buyer_address||s.seller_address||"",
        postal:inv.buyer_postal||s.seller_postal||"", city:inv.buyer_city||s.seller_city||""
      };
    }
  } else {
    partyTop={
      label:"Sprzedawca:",
      name:snap.name||s.seller_name||"",
      nip:(snap.nip||s.seller_nip||"").replace(/[\s\-]/g,""),
      street:snap.address||s.seller_address||"",
      postal:snap.postal||s.seller_postal||"", city:snap.city||s.seller_city||""
    };
    partyBottom={
      label:"Nabywca:",
      name:inv.buyer_name||"",
      nip:inv.buyer_nip||"",
      street:inv.buyer_address||"",
      postal:inv.buyer_postal||"", city:inv.buyer_city||""
    };
  }
  var selBank=snap.bank||s.seller_bank||"";

  var paid=+(inv.paid_amount||0);
  var gross=+(inv.total_gross||0);
  var remaining=gross-paid;

  // Kod QR faktury \u2014 prosty QR weryfikacyjny (numer, NIP sprzedawcy, kwota, nr KSeF jesli jest).
  // UWAGA: to NIE jest oficjalny kryptograficzny "Kod QR I/II" wg specyfikacji KSeF (ten wymaga
  // podpisu XAdES/hasha XML) \u2014 to praktyczny kod do szybkiej weryfikacji danych faktury.
  var qrPayload="Faktura "+(inv.number||"")+" | NIP: "+(partyTop.nip||"")+" | Brutto: "+fmtM(gross)+" PLN"
    +(inv.ksef_number?(" | KSeF: "+inv.ksef_number):"");
  var qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data="+encodeURIComponent(qrPayload);

  var rowsHtml=items.map(function(it,i){
    var rate=it.vat_rate;
    var vl=rate===-1?"zw":(rate+"%");
    var qty=+(it.quantity||1);
    var unitGross=qty?(+(it.line_gross||0)/qty):0;
    return "<tr>"
      +"<td>"+(i+1)+"</td>"
      +"<td style='text-align:left'>"+String(it.name||"")+"</td>"
      +"<td>"+String(qty).replace(".",",")+"</td>"
      +"<td>"+String(it.unit||"szt")+"</td>"
      +"<td>"+fmtM(unitGross)+"</td>"
      +"<td>"+fmtM(it.line_net)+"</td>"
      +"<td>"+vl+"</td>"
      +"<td>"+fmtM(it.line_vat)+"</td>"
      +"<td style='font-weight:700'>"+fmtM(it.line_gross)+"</td>"
      +"</tr>";
  }).join("");

  return "<!DOCTYPE html><html lang='pl'><head><meta charset='UTF-8'><title>"+(inv.number||docLabel)+"</title>"
    +"<style>*{margin:0;padding:0;box-sizing:border-box;}"
    +"body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;padding:16mm 14mm;}"
    +"h1{font-size:26px;font-weight:700;letter-spacing:0.02em;}"
    +".top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm;}"
    +".logo{line-height:1;}"
    +".meta-table{font-size:11px;}"
    +".meta-table tr td:first-child{font-weight:700;padding-right:10px;text-align:right;}"
    +".meta-table tr td{padding:2px 0;}"
    +".pay-row{display:flex;justify-content:space-between;margin:6mm 0;font-size:11px;}"
    +".sect-head{background:#f0f0f0;padding:6px 10px;font-weight:700;font-size:13px;margin-top:6mm;}"
    +".parties{display:flex;gap:24px;margin-top:2mm;margin-bottom:6mm;}"
    +".party{flex:1;}"
    +".party p{font-size:12px;line-height:1.7;padding:4px 10px;}"
    +"table.items{width:100%;border-collapse:collapse;margin-bottom:4mm;}"
    +"table.items th{background:#f0f0f0;font-size:10px;font-weight:700;padding:7px 6px;text-align:right;border-bottom:1px solid #ccc;}"
    +"table.items th:nth-child(1),table.items th:nth-child(2){text-align:left;}"
    +"table.items td{padding:7px 6px;text-align:right;font-size:11px;border-bottom:1px solid #eee;}"
    +"table.items td:nth-child(1),table.items td:nth-child(2){text-align:left;}"
    +"table.items tfoot td{font-weight:700;background:#f7f7f7;border-top:1px solid #ccc;}"
    +".totals{display:flex;justify-content:space-between;align-items:flex-end;margin-top:4mm;}"
    +".totals table td{padding:3px 0 3px 24px;font-size:13px;text-align:right;}"
    +".totals table td:first-child{font-weight:700;padding-left:0;}"
    +".totals .grand td{font-size:15px;}"
    +".qr-box{text-align:center;}"
    +".qr-box img{display:block;width:86px;height:86px;}"
    +".qr-box .qr-label{font-size:8px;color:#888;margin-top:3px;}"
    +".slownie{margin-top:4mm;text-align:right;font-size:11px;}"
    +".notes-box{margin-top:6mm;padding:8px 12px;background:#f7f7f7;border-radius:4px;font-size:10px;color:#444;}"
    +".kasowa{margin-top:10mm;font-size:11px;}"
    +".watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:88px;font-weight:900;color:rgba(0,0,0,0.06);pointer-events:none;z-index:0;letter-spacing:6px;white-space:nowrap;}"
    +".sign-name{text-align:right;margin-top:6mm;font-size:13px;}"
    +".sign-block{display:flex;justify-content:space-between;margin-top:16mm;}"
    +".sign{width:200px;border-top:1px solid #1a1a1a;padding-top:4px;font-size:10px;color:#444;text-align:center;}"
    +"@media print{body{padding:12mm 10mm;} @page{size:A4;margin:0;}}"
    +"</style></head><body>"
    +(inv.status==="draft"?"<div class='watermark'>SZKIC</div>":"")
    +"<div class='top'>"
    +"<div class=\'logo\'><img src=\'" + "https://rkcidwusjzvfwxszotnb.supabase.co/storage/v1/object/public/assets/porter-design-assets/logo.png?v=2" + "\'  alt=\'Porter Design\' style=\'height:54px;width:auto;display:block;\'></div>"
    +"<div style='text-align:center;flex:1;'><h1>"+docLabel+"</h1></div>"
    +"<table class='meta-table'><tr><td>Numer faktury:</td><td>"+(inv.number||"")+"</td></tr>"
    +"<tr><td>Data wystawienia:</td><td>"+fmtD(inv.issue_date)+"</td></tr>"
    +"<tr><td>Data sprzeda\u017cy:</td><td>"+fmtD(inv.sale_date)+"</td></tr></table>"
    +"</div>"
    +"<div class='pay-row'>"
    +"<div>Termin p\u0142atno\u015bci: "+fmtD(inv.due_date)+"<br>Spos\u00f3b p\u0142atno\u015bci: "+(inv.payment_method||"przelew").replace(/^./,function(c){return c.toUpperCase();})+"</div>"
    +(selBank?"<div style='text-align:right'>Bank Millennium: "+selBank+"</div>":"<div></div>")
    +"</div>"
    +"<div class='parties'>"
    +"<div class='party'><div class='sect-head'>"+partyTop.label+"</div><p><strong>"+partyTop.name+"</strong>"
    +(partyTop.street||partyTop.city?"<br>"+fmtAddr(partyTop.street,partyTop.postal,partyTop.city):"")
    +"<br>NIP: "+partyTop.nip+"</p></div>"
    +"<div class='party'><div class='sect-head'>"+partyBottom.label+"</div><p><strong>"+partyBottom.name+"</strong>"
    +(partyBottom.street||partyBottom.city?"<br>"+fmtAddr(partyBottom.street,partyBottom.postal,partyBottom.city):"")
    +(partyBottom.nip?"<br>NIP: "+partyBottom.nip:"")+"</p></div>"
    +"</div>"
    +"<table class='items'><thead><tr>"
    +"<th>Lp.</th><th>Nazwa produktu / us\u0142ugi</th><th>Ilo\u015b\u0107</th><th>Jedn.</th>"
    +"<th>Cena jedn.<br>brutto</th><th>Warto\u015b\u0107<br>netto</th><th>Stawka<br>VAT</th>"
    +"<th>Warto\u015b\u0107<br>VAT</th><th>Warto\u015b\u0107<br>brutto</th>"
    +"</tr></thead><tbody>"+rowsHtml+"</tbody>"
    +"<tfoot><tr><td colspan='5' style='text-align:right'>Suma:</td>"
    +"<td>"+fmtM(inv.total_net)+"</td><td>"+(items[0]&&items[0].vat_rate===-1?"zw":"23%")+"</td>"
    +"<td>"+fmtM(inv.total_vat)+"</td><td>"+fmtM(inv.total_gross)+"</td></tr></tfoot>"
    +"</table>"
    +"<div class='totals'>"
    +"<div class='qr-box'><img src='"+qrUrl+"' alt='Kod QR faktury'><div class='qr-label'>Weryfikacja faktury</div></div>"
    +"<table>"
    +"<tr><td>\u0141\u0105cznie:</td><td>"+fmtM(gross)+" PLN</td></tr>"
    +"<tr class='grand'><td>Do zap\u0142aty:</td><td>"+fmtM(remaining)+" PLN</td></tr>"
    +"</table></div>"
    +"<div class='slownie'><strong>S\u0142ownie:</strong> "+numberToWordsPL(gross)+"</div>"
    +(inv.notes?"<div class='notes-box'>"+String(inv.notes)+"</div>":"")
    +(inv.kasowa===true||inv.kasowa==="true"?"<div class='kasowa'>Metoda Kasowa</div>":"")
    +(isZakup?"":"<div class='sign-name'>Paulina Porter</div>"
    +"<div class='sign-block'>"
    +"<div class='sign'>Osoba uprawniona do odbioru</div>"
    +"<div class='sign'>Osoba uprawniona do wystawienia</div>"
    +"</div>")
    +"</body></html>";
}

// \u2500\u2500 EKRAN PO\u015aNIEDNI: AKCJE PO WYSTAWIENIU FAKTURY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function InvoiceDetailView(p){
  var [ksefBusy,setKsefBusy]=useState(false);
  var [ksefMsg,setKsefMsg]=useState(null);
  var [ksefErr,setKsefErr]=useState(null);
  var [currentInv,setCurrentInv]=useState(p.invoice||{});

  var isIssued=currentInv.status==="issued";
  var isEko=currentInv.doc_type==="eko";
  var ksefOk=currentInv.ksef_status==="confirmed";
  var ksefSent=currentInv.ksef_status==="sent"||currentInv.ksef_status==="pending";
  var ksefError=currentInv.ksef_status==="error";

  // Auto-polling statusu KSeF co 10s gdy faktura jest w kolejce
  useEffect(function(){
    if(!ksefSent||!currentInv.id) return;
    var interval=setInterval(function(){
      sbApi.getInvoice(currentInv.id).then(function(fresh){
        if(!fresh) return;
        setCurrentInv(fresh);
        if(fresh.ksef_status==="confirmed"){
          setKsefMsg("✅ Potwierdzona w KSeF. Nr KSeF: "+(fresh.ksef_number||""));
          clearInterval(interval);
        }
      }).catch(function(){});
    },10000);
    return function(){ clearInterval(interval); };
  },[ksefSent,currentInv.id]);

  function refreshKsefStatus(){
    setKsefBusy(true); setKsefErr(null);
    ksefApi.openSession().then(function(sess){
      return ksefApi.checkStatus(currentInv.id, sess.accessToken, sess.baseUrl);
    }).then(function(res){
      if(res.ksefStatus==="confirmed") setKsefMsg("✅ Potwierdzona w KSeF. Nr KSeF: "+(res.ksefNumber||""));
      else setKsefMsg("⏳ Faktura nadal w kolejce KSeF. Spróbuj za chwilę.");
      return sbApi.getInvoice(currentInv.id);
    }).then(function(fresh){
      if(fresh) setCurrentInv(fresh);
    }).catch(function(e){
      setKsefErr(e.message||"Błąd sprawdzania statusu");
    }).finally(function(){ setKsefBusy(false); });
  }

  function openPDF(){
    var html=buildInvoicePDFHtml(currentInv,p.settings||{});
    var w=window.open("","_blank");
    if(!w){alert("Zablokowano popup. Zezw\u00f3l na wyskakuj\u0105ce okna.");return;}
    w.document.write(html);
    w.document.close();
    setTimeout(function(){w.print();},600);
  }

  function sendToKsef(){
    setKsefBusy(true); setKsefErr(null); setKsefMsg(null);
    ksefApi.openSession()
      .then(function(sess){
        return ksefApi.sendInvoice(currentInv.id,sess.accessToken,sess.baseUrl);
      })
      .then(function(res){
        setKsefMsg(res.ksefStatus==="confirmed"
          ?"\u2705 Potwierdzona w KSeF. Nr KSeF: "+(res.ksefNumber||"")
          :"\u23F3 Faktura w kolejce KSeF (status od\u015bwie\u017cy si\u0119 automatycznie)");
        sbApi.getInvoice(currentInv.id).then(function(fresh){
          if(fresh) setCurrentInv(fresh);
        });
      })
      .catch(function(e){ setKsefErr(e.message||"B\u0142\u0105d wys\u0142ki do KSeF"); })
      .finally(function(){ setKsefBusy(false); });
  }

  var ksefStatusLabel=ksefOk?"\u2705 Potwierdzona w KSeF"
    :ksefSent?"\u23F3 W kolejce KSeF"
    :ksefError?"\u26A0\uFE0F B\u0142\u0105d KSeF"
    :"\u26AA Nie wys\u0142ano do KSeF";
  var ksefStatusColor=ksefOk?"#065f46":ksefSent?"#92400e":ksefError?"#b91c1c":"var(--t3)";

  return ce("div",{style:{maxWidth:720,margin:"0 auto",paddingBottom:40}},
    // Nag\u0142\u00f3wek
    ce("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:24}},
      ce("button",{onClick:p.onClose,style:Object.assign({},btnSecondary,{padding:"7px 12px"})},
        "\u2190 Lista faktur"),
      ce("div",{style:{flex:1}},
        ce("h2",{style:{margin:0,fontSize:20,fontWeight:800,color:"var(--t1)"}},currentInv.number||"Faktura"),
        ce("div",{style:{fontSize:13,color:"var(--t3)",marginTop:2}},
          (currentInv.buyer_name||"\u2014")+" \u2022 "+fmtDate(currentInv.issue_date)+" \u2022 "+fmtMoney(currentInv.total_gross))
      ),
      ce("button",{onClick:p.onEdit,style:btnSecondary},"\u270F\uFE0F Edytuj")
    ),
    // Baner: faktura wystawiona (opcja szkicu została usunięta z workflow)
    ce("div",{style:{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:12,
        padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12}},
        ce("span",{style:{fontSize:24}},"\u2705"),
        ce("div",null,
          ce("div",{style:{fontSize:14,fontWeight:700,color:"#065f46"}},"Faktura wystawiona"),
          ce("div",{style:{fontSize:12,color:"#047857",marginTop:2}},
            "Pobierz PDF i wy\u015blij klientowi, nast\u0119pnie wy\u015blij do KSeF.")
        )
      ),
    // Podgl\u0105d faktury \u2014 renderowany od razu, bez potrzeby pobierania PDF
    ce("div",{style:Object.assign({},card,{marginBottom:16,padding:0,overflow:"hidden"})},
      ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",
        textTransform:"uppercase",padding:"14px 18px 0"}},"Podgl\u0105d"),
      ce("iframe",{
        title:"Podgl\u0105d faktury",
        srcDoc:buildInvoicePDFHtml(currentInv,p.settings||{}),
        style:{width:"100%",height:640,border:"none",marginTop:10}
      })
    ),
    // Akcje
    ce("div",{style:Object.assign({},card,{marginBottom:16})},
      ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",
        textTransform:"uppercase",marginBottom:14}},"Akcje"),
      ce("div",{style:{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}},
        ce("button",{onClick:openPDF,
          style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            padding:"14px 18px",borderRadius:10,border:"2px solid var(--violet)",
            background:"var(--violet)",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}},
          "\uD83D\uDCC4 Pobierz / Drukuj PDF"),
        currentInv.buyer_email&&ce("button",{
          onClick:function(){
            var mailto="mailto:"+encodeURIComponent(currentInv.buyer_email)
              +"?subject="+encodeURIComponent("Faktura "+(currentInv.number||""))
              +"&body="+encodeURIComponent("Dzie\u0144 dobry,\n\nW za\u0142\u0105czeniu przesy\u0142am faktur\u0119 nr "
                +(currentInv.number||"")+" na kwot\u0119 "+fmtMoney(currentInv.total_gross)
                +".\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design");
            window.open(mailto);
          },
          style:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            padding:"14px 18px",borderRadius:10,border:"1px solid var(--bd2)",
            background:"var(--bg)",color:"var(--t2)",cursor:"pointer",fontSize:13,fontWeight:500}},
          "\uD83D\uDCE7 Otw\u00f3rz w poczcie")
      ),
      ce("div",{style:{height:1,background:"var(--bd2)",margin:"14px 0"}}),
      // KSeF (ukryty dla dok. EKO)
      !isEko&&ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}},
        ce("div",null,
          ce("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:3}},"Status KSeF"),
          ce("div",{style:{fontSize:12,color:ksefStatusColor,fontWeight:500}},ksefStatusLabel),
          currentInv.ksef_number&&ce("div",{style:{fontSize:10,color:"var(--t3)",marginTop:2}},
            "Nr KSeF: "+currentInv.ksef_number)
        ),
        !ksefOk&&isIssued&&ce("button",{
          onClick:sendToKsef,
          disabled:ksefBusy||ksefSent,
          style:Object.assign({},ksefBusy||ksefSent
            ?{border:"1px solid var(--bd2)",background:"var(--bg2)",color:"var(--t3)",cursor:"not-allowed"}
            :{border:"none",background:"#1d4ed8",color:"#fff",cursor:"pointer"},
            {borderRadius:9,padding:"10px 20px",fontSize:13,fontWeight:600})},
          ksefBusy?"\u23F3 Wysy\u0142am...":ksefSent?"\u23F3 W kolejce...":"\uD83D\uDCE4 Wy\u015blij do KSeF"),
        ksefSent&&ce("button",{onClick:refreshKsefStatus,disabled:ksefBusy,
          style:{marginTop:6,padding:"7px 14px",borderRadius:8,border:"1px solid var(--bd2)",
            background:"var(--bg)",color:"var(--t2)",cursor:"pointer",fontSize:12,fontWeight:500}},
          "\uD83D\uDD04 Sprawdź status KSeF")
      ),
      ksefMsg&&ce("div",{style:{marginTop:10,padding:"8px 12px",background:"#d1fae5",
        borderRadius:8,fontSize:12,color:"#065f46"}},ksefMsg),
      ksefErr&&ce("div",{style:{marginTop:10,padding:"8px 12px",background:"#fef2f2",
        borderRadius:8,fontSize:12,color:"#b91c1c"}},"\u26A0\uFE0F "+ksefErr)
    )
  );
}

export function ScreenInvoices(p){
  var [view,setView]=useState("list");       // list | editor | settings
  var [invoices,setInvoices]=useState([]);
  var [settings,setSettings]=useState(null);
  var [editInv,setEditInv]=useState(null);   // null = now
  var [detailInv,setDetailInv]=useState(null); // faktura po zapisaniu
  var [clientsAll,setClientsAll]=useState([]);
  var [dealsAll,setDealsAll]=useState([]);
  var [loading,setLoading]=useState(true);
  var [err,setErr]=useState(null);
  var [viewBusyId,setViewBusyId]=useState(null);

  // Ładuj faktury i ustawienia
  useEffect(function(){
    Promise.all([sbApi.getInvoices(), sbApi.getInvoiceSettings(), sbApi.getClients(), sbApi.getDeals()])
      .then(function(results){
        setInvoices(results[0]||[]);
        setSettings(results[1]||{});
        setClientsAll(results[2]||[]);
        setDealsAll(results[3]||[]);
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
    sbApi.getInvoices().then(function(data){ setInvoices(data||[]); });
    sbApi.getInvoice(result.id).then(function(full){
      setDetailInv(full||result); setView("detail");
    }).catch(function(){ setDetailInv(result); setView("detail"); });
  }
  function onSettingsSaved(newSettings){
    setSettings(newSettings);
    setView("list");
  }
  function onDelete(id){
    // Uwaga: numer NIE jest cofany do licznika (nawet dla faktur wystawionych) —
    // dekrementacja bez sprawdzenia, czy to faktycznie ostatni nadany numer w danym
    // okresie/typie, prowadziła do przydzielenia tego samego numeru dwóm różnym fakturom.
    sbApi.deleteInvoice(id)
      .then(function(){
        setInvoices(function(prev){return prev.filter(function(i){return i.id!==id;});});
      })
      .catch(function(e){ alert("B\u0142\u0105d usuwania: "+e.message); });
  }

  // Brak ustawień — banner informacyjny
  var settingsEmpty=!settings||!settings.seller_name;

  return ce("div",{style:{padding:"0 4px"}},

    loading&&ce("div",{style:{textAlign:"center",padding:"60px 0",color:"var(--t3)"}},"\u23F3 Ładowanie..."),
    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"14px",fontSize:13,color:"#b91c1c",marginBottom:16}},"\u26A0\uFE0F "+err),

    !loading&&view==="list"&&ce("div",null,
      settingsEmpty&&ce("div",{style:{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#78350f",display:"flex",alignItems:"center",gap:10}},
        ce("span",{style:{fontSize:18}},"\u26A0\uFE0F"),
        ce("span",null,"Uzupełnij dane sprzedawcy przed wystawieniem pierwszej faktury. "),
        ce("button",{onClick:openSettings,style:Object.assign({},btnSecondary,{fontSize:12,padding:"5px 10px",marginLeft:4})},"Ustawienia")
      ),
      ce(InvoiceList,{
        invoices:invoices, viewBusyId:viewBusyId,
        onNew:openNew, onEdit:openEdit, onSettings:openSettings, onDelete:onDelete,
        onSynced:function(){ sbApi.getInvoices().then(function(data){ setInvoices(data||[]); }); },
        onTogglePaid:function(inv,val){
          // Zaznaczenie jako zapłacona ustawia paid_amount na pełną kwotę brutto; odznaczenie zeruje.
          // payment_status musi iść razem z paid, inaczej etykieta statusu (payStatus) pokazuje
          // "Oczekuje" mimo zaznaczonego checkboxa — payStatus() czyta payment_status, nie paid.
          var newAmount=val?(+(inv.total_gross)||0):0;
          var newStatus=val?"paid":"unpaid";
          setInvoices(function(prev){return prev.map(function(x){return x.id===inv.id?Object.assign({},x,{paid:val,paid_amount:newAmount,payment_status:newStatus}):x;});});
          sbApi.updateInvoice(inv.id,{paid:val,paid_amount:newAmount,payment_status:newStatus}).catch(function(){
            setInvoices(function(prev){return prev.map(function(x){return x.id===inv.id?Object.assign({},x,{paid:!val,paid_amount:inv.paid_amount||0,payment_status:inv.payment_status||"unpaid"}):x;});});
          });
        },
        onToggleApproved:function(inv,val){
          setInvoices(function(prev){return prev.map(function(x){return x.id===inv.id?Object.assign({},x,{approved:val}):x;});});
          sbApi.updateInvoice(inv.id,{approved:val}).catch(function(){
            setInvoices(function(prev){return prev.map(function(x){return x.id===inv.id?Object.assign({},x,{approved:!val}):x;});});
          });
        },
        onView:function(inv){
          setViewBusyId(inv.id);
          sbApi.getInvoice(inv.id)
            .then(function(full){
              setDetailInv(full||inv);
              setView("detail");
            })
            .catch(function(e){ alert("B\u0142\u0105d wczytywania faktury: "+(e.message||e)); })
            .finally(function(){ setViewBusyId(null); });
        }
      })
    ),

    !loading&&view==="detail"&&detailInv&&ce(InvoiceDetailView,{
      invoice:detailInv,
      settings:settings||{},
      onEdit:function(){ setEditInv(detailInv); setView("editor"); },
      onClose:function(){setView("list");}
    }),

    !loading&&view==="editor"&&ce(InvoiceEditor,{
      invoice:editInv, settings:settings||{},
      clients:clientsAll, deals:dealsAll,
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
