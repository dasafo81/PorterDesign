import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sbApi, ksefApi } from '../lib/supabase.js';
import { msalGetToken, msalGetActiveAccount } from '../msal.js';
import { InlineEdit } from '../constants/data.js';
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
// Typy dostępne w FILTRZE listy — to NIE to samo co DOC_TYPES (lista wyboru w edytorze).
// doc_type='zakup' to stary model, w którym kierunek faktury był zakodowany w typie
// dokumentu. Migracja 0021 przepisała te rekordy na właściwy typ (vat/korekta/zaliczka)
// + direction='zakup', a ksef-receive już takich nie tworzy. Zostawiamy tu ten wpis jako
// siatkę bezpieczeństwa: gdyby gdziekolwiek został niezmigrowany rekord, filtr ma go
// pokazać, a nie ukryć (wcześniej brak 'zakup' w tej liście ukrywał WSZYSTKIE faktury
// zakupowe z KSeF — były w bazie, ale nigdy nie pojawiały się na liście Wydatków).
var FILTER_DOC_TYPES = DOC_TYPES.concat([{id:"zakup", label:"Zakupowa (stary model)"}]);
var PAYMENT_METHODS = ["przelew","gotówka","karta","BLIK"];
var UNITS = ["szt","m","m²","mb","kpl","usługa","godz"];
// Opcje menu statusu płatności (kolumna "Zapłacono" na liście faktur) — id "issued" mapuje
// się na payment_status="unpaid" (istniejąca wartość), pozostałe id odpowiadają wprost
// wartościom payment_status w bazie. Kolejność = kolejność w rozwijanym menu.
var PAY_STATUS_OPTIONS = [
  {id:"issued",   label:"Wystawiona"},
  {id:"paid",     label:"Opłacona"},
  {id:"partial",  label:"Częściowo opł."},
  {id:"rejected", label:"Odrzucona"},
  {id:"sent",     label:"Wysłana"}
];

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
  border:"none", background:"var(--violet)", color:"var(--bg)",
  borderRadius:9, padding:"9px 18px", fontSize:13,
  cursor:"pointer", fontWeight:600, letterSpacing:"0.04em"
};
var btnSecondary = {
  border:"1px solid var(--bd2)", background:"var(--bg)", color:"var(--t2)",
  borderRadius:9, padding:"9px 14px", fontSize:13, cursor:"pointer", fontWeight:500
};
var btnDanger = {
  border:"1px solid var(--red-border)", background:"var(--red-l)", color:"var(--red)",
  borderRadius:9, padding:"9px 14px", fontSize:13, cursor:"pointer", fontWeight:500
};

// Kierunek faktury (sprzedaż/zakup) jest niezależny od typu dokumentu (vat/proforma/eko itd.) —
// pozwala to na faktury kosztowe będące jednocześnie np. EKO lub proformą.
// Fallback do starego modelu (doc_type==="zakup") dla rekordów sprzed dodania kolumny `direction`.
function invDirection(inv){
  return (inv&&inv.direction) || (inv&&inv.doc_type==="zakup" ? "zakup" : "sprzedaz");
}
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
    // Cena netto — bez type:number (jak Cena brutto): natywne pole number odrzuca
    // przecinek jako separator dziesiętny (szczególnie z klawiatury numerycznej na
    // telefonie/tablecie, gdzie przecinek jest domyślny w PL), więc wpisanie kwoty
    // w formacie "1350,00" efektywnie zerowało wartość — stąd 0 zł po zapisie.
    ce("input",{style:Object.assign({},inpSm,{textAlign:"right"}),
      value:(it.unit_net==null||it.unit_net===""||+(it.unit_net)===0)?"":(typeof it.unit_net==="string"?it.unit_net:+(+(it.unit_net)).toFixed(2)),
      inputMode:"decimal", placeholder:"0,00",
      onChange:function(e){upd("unit_net",e.target.value.replace(",","."));}}),
    // Cena brutto — bez type:number (brak strzalek), puste zamiast 0. Bez szarego tła:
    // to pole w pełni edytowalne (wpisanie tu przelicza netto), szare tło sugerowało
    // pole tylko do odczytu i myliło przy wpisywaniu kwoty brutto.
    ce("input",{style:Object.assign({},inpSm,{textAlign:"right"}),
      value:(it.unit_gross==null||it.unit_gross===""||+(it.unit_gross)===0)?"":(typeof it.unit_gross==="string"?it.unit_gross:+(+(it.unit_gross)).toFixed(2)),
      inputMode:"decimal", placeholder:"0,00",
      onChange:function(e){upd("unit_gross",e.target.value.replace(",","."));}}),
    // VAT — zablokowany na 0% dla EKO (dokument gotówkowy bez rozbicia netto/brutto,
    // patrz p.vatLocked z rodzica), żeby nie dało się przypadkiem wybrać innej stawki
    // i wygenerować sztuczny rozjazd netto/brutto.
    p.vatLocked
      ? ce("div",{style:Object.assign({},inpSm,{textAlign:"center",color:"var(--t3)",background:"var(--bd3)"})},"0% (EKO)")
      : ce("select",{style:inpSm, value:it.vat_rate,
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
  // Podmiot (multi-podmiot): sprzedawca i numeracja pochodza z aktywnego podmiotu.
  // Fallback do invoice_settings dla wstecznej zgodnosci.
  var ent=p.entity||{};
  var sellerName=ent.name||settings.seller_name||"";
  var sellerNip=ent.nip||settings.seller_nip||"";
  var sellerAddress=ent.address||settings.seller_address||"";
  var sellerPostal=ent.postal||settings.seller_postal||"";
  var sellerCity=ent.city||settings.seller_city||"";
  var sellerEmail=ent.email||settings.seller_email||"";
  var sellerPhone=ent.phone||settings.seller_phone||"";
  var sellerBank=ent.bank||settings.seller_bank||"";
  var entVatExempt=ent.vat_status==="zwolniony";
  var numberingFormat=ent.numbering_format||settings.numbering_format||"{nr}/{MM}/{YYYY}";
  var numberingReset=ent.numbering_reset||settings.numbering_reset||"monthly";
  // Podmiot zwolniony z VAT -> domyslna stawka "zw" (-1).
  var defaultVat=entVatExempt?-1:(+(settings.default_vat)||23);
  var defaultDays=+(settings.default_payment_days)||14;

  function freshItem(){
    // Dla EKO nie ma rozróżnienia netto/brutto — to jeden dokument gotówkowy na jedną
    // kwotę. Zerowanie VAT już przy tworzeniu pozycji (a nie dopiero przy zapisie)
    // eliminuje możliwość rozjazdu netto/brutto, bo calcLine z vat_rate=0 zawsze daje
    // line_gross===line_net, niezależnie od tego, w które pole (netto czy brutto)
    // ktoś wpisze kwotę.
    var vr=docType==="eko"?0:defaultVat;
    var n=calcLine(0,1,vr);
    return Object.assign({name:"",quantity:1,unit:settings.default_unit||"szt",unit_net:0,vat_rate:vr},n,{position:1,pkwiu:""});
  }

  // Inicjalizacja stanu nagłówka
  var today=todayISO();
  var initInv=p.invoice||{};
  var [docType,setDocType]=useState(initInv.doc_type||"vat");
  // Kierunek: sprzedażowa (domyślnie) lub zakupowa (faktura kosztowa od dostawcy).
  // Niezależny od docType — faktura zakupowa też może być np. EKO albo proformą.
  var [direction,setDirection]=useState(initInv.direction||(initInv.doc_type==="zakup"?"zakup":"sprzedaz"));
  // Dla zwykłych faktur zakupowych numer nadaje dostawca. Proforma i EKO są
  // dokumentami wewnętrznymi w naszym obiegu — ich numer nadajemy automatycznie.
  var [purchaseNumber,setPurchaseNumber]=useState(direction==="zakup"?(initInv.number||""):"");
  var [issueDate,setIssueDate]=useState(initInv.issue_date||today);
  var [saleDate,setSaleDate]=useState(initInv.sale_date||today);
  var [dueDate,setDueDate]=useState(initInv.due_date||addDays(today,defaultDays));
  var [payMethod,setPayMethod]=useState(initInv.payment_method||settings.default_payment_method||"przelew");
  // Metoda kasowa: dla NOWEJ faktury domyslna wartosc bierzemy z ustawien tenanta
  // (invoice_settings.kasowa_default). PD Porter Design rozlicza sie metoda kasowa,
  // wiec kazda faktura sprzedazowa musi miec te adnotacje — inaczej robi sie
  // rozjazd miedzy PDF-em a FA(3) (Adnotacje/P_16), zglaszany przez ksiegowa.
  // Dokumenty EKO i faktury zakupowe (dokument dostawcy) sa z tego wylaczone.
  // Podmiot zwolniony z VAT (np. PD Porter Design Damian Porter — zwolnienie
  // podmiotowe z art. 113 ust. 1) nigdy nie rozlicza sie metoda kasowa — to
  // adnotacja P_16 zarezerwowana dla malych podatnikow czynnych VAT, wiec
  // nadpisuje kasowa_default niezaleznie od jego wartosci.
  // Dla istniejacej faktury zostaje to, co zapisano przy jej wystawieniu.
  var [kasowa,setKasowa]=useState(isNew
    ? (!entVatExempt && !!settings.kasowa_default && direction!=="zakup" && docType!=="eko")
    : !!(initInv.kasowa));
  // Uwagi: nowa faktura sprzedazowa podmiotu zwolnionego z VAT dostaje domyslnie
  // adnotacje o podstawie zwolnienia (art. 113 ust. 1) — wymagana na fakturze,
  // a bez tego bywala pomijana recznie. Nie dotyczy faktur zakupowych (tam w
  // Uwagach nie opisujemy statusu VAT wlasnego podmiotu) ani edycji istniejacej
  // faktury — tam notatka zostaje taka, jaka zapisano przy wystawieniu.
  var [notes,setNotes]=useState(isNew&&entVatExempt&&direction!=="zakup"
    ? "Zwolnienie z VAT na podstawie art. 113 ust. 1 ustawy o VAT"
    : (initInv.notes||""));
  var initSnap=initInv.seller_snapshot||{};
  var initContractor=(direction==="zakup"&&(initSnap.name||initSnap.nip))?initSnap:null;
  var [buyerName,setBuyerName]=useState(initContractor?(initContractor.name||""):(initInv.buyer_name||""));
  var [buyerNip,setBuyerNip]=useState(initContractor?(initContractor.nip||""):(initInv.buyer_nip||""));
  var [buyerAddr,setBuyerAddr]=useState(initContractor?(initContractor.address||""):(initInv.buyer_address||""));
  var [buyerPostal,setBuyerPostal]=useState(initContractor?(initContractor.postal||""):(initInv.buyer_postal||""));
  var [buyerCity,setBuyerCity]=useState(initContractor?(initContractor.city||""):(initInv.buyer_city||""));
  var [buyerEmail,setBuyerEmail]=useState(initContractor?(initContractor.email||""):(initInv.buyer_email||""));
  var [clientId,setClientId]=useState(initInv.client_id||null);
  var [dealId,setDealId]=useState(initInv.deal_id||null);
  // Faktura zakupowa -> zlecenie: deal_id istnieje w schemacie od migracji 0001,
  // ale dotad byl zerowany dla kierunku "zakup", wiec kosztow z KSeF nie dalo sie
  // przypisac do konkretnej realizacji. Ten selektor to odblokowuje.
  var [createDealCost,setCreateDealCost]=useState(false);
  var [dealCostKind,setDealCostKind]=useState("tkanina");
  // Powiązanie z ofertą — łączy fakturę z wcześniej wygenerowaną wyceną klienta
  var [clientOffers,setClientOffers]=useState([]);
  var [offerId,setOfferId]=useState(initInv.offer_id||null);
  var [offerNumber,setOfferNumber]=useState(initInv.offer_number||"");
  var [offerDiscount,setOfferDiscount]=useState(initInv.offer_discount||0);
  // Zwykle fakturujemy 50% wartości oferty (zaliczka) — stąd domyślny wybór,
  // ale "100" i "custom" (dowolny %) pozostają dostępne jednym klikiem.
  var [offerPctChoice,setOfferPctChoice]=useState("50");
  var [offerPctCustom,setOfferPctCustom]=useState("");
  var [clientSearch,setClientSearch]=useState("");
  var [clientDropOpen,setClientDropOpen]=useState(false);
  // Powiązanie z bazą kontrahentów (Faza 2)
  var [contacts,setContacts]=useState([]);
  var [contactId,setContactId]=useState(initInv.contact_id||null);
  var [contactSearch,setContactSearch]=useState("");
  var [contactDropOpen,setContactDropOpen]=useState(false);
  var [saveAsContact,setSaveAsContact]=useState(false);
  useEffect(function(){
    sbApi.getContacts().then(function(rows){setContacts(rows||[]);}).catch(function(){});
  },[]);
  // Lista ofert wybranego klienta (do powiązania faktury z konkretną ofertą)
  useEffect(function(){
    if(!clientId||direction==="zakup"){setClientOffers([]);return;}
    sbApi.getClientOffers(clientId).then(function(rows){setClientOffers(rows||[]);}).catch(function(){setClientOffers([]);});
  },[clientId,direction]);
  var [items,setItems]=useState(
    (initInv.invoice_items&&initInv.invoice_items.length>0)
      ? initInv.invoice_items
      : [freshItem()]
  );
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState(null);

  // Gdy ktoś przełącza "Typ dokumentu" na EKO już po dodaniu pozycji (z inną stawką
  // VAT), zerujemy VAT na wszystkich pozycjach zachowując kwotę BRUTTO jako prawdziwą
  // (to realna gotówka, którą ktoś wpłacił/wypłacił) — a nie netto, które przy 23%
  // VAT byłoby tylko sztucznym, pomniejszonym wyliczeniem.
  useEffect(function(){
    if(docType!=="eko") return;
    setItems(function(prev){
      var changed=false;
      var next=prev.map(function(it){
        if(+(it.vat_rate)===0) return it;
        changed=true;
        var g=+(it.line_gross)||0;
        var q=+(it.quantity)||1;
        var perUnit=+(g/q).toFixed(4);
        return Object.assign({},it,{vat_rate:0,unit_net:perUnit,unit_gross:perUnit,line_net:g,line_vat:0,line_gross:g});
      });
      return changed?next:prev;
    });
  },[docType]);

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
        // Adres może być złożony i nie zawsze ma przecinek między ulicą a kodem —
        // miejscowości bez nazwy ulicy Biała Lista zwraca jako samo "00-000 Miasto".
        // Szukamy kodu pocztowego w dowolnym miejscu ciągu zamiast zakładać przecinek.
        var adr=s.workingAddress||s.residenceAddress||"";
        var pm=adr.match(/(\d{2}-\d{3})\s*,?\s*(.*)$/);
        if(pm){
          setBuyerAddr(adr.slice(0,pm.index).replace(/,\s*$/,"").trim());
          setBuyerPostal(pm[1]);
          setBuyerCity(pm[2].trim());
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
  // Lista zlecen do selektora na fakturze zakupowej — najswiezsze na gorze.
  var zakupDealOptions=dealsList.map(function(dl){
    var cli=(p.clients||[]).find(function(x){return String(x.id)===String(dl.client_id);});
    return {
      id:dl.id,
      label:(cli&&cli.name?cli.name:"(bez klienta)")+(dl.stage?" \u00B7 "+dl.stage:""),
      created:dl.created_at||""
    };
  }).sort(function(a,b){return String(b.created).localeCompare(String(a.created));});
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
    // Zmiana klienta unieważnia wcześniej wybraną ofertę (należała do innego klienta)
    setOfferId(null); setOfferNumber(""); setOfferDiscount(0);
  }
  function clearClient(){
    setClientId(null); setDealId(null); setClientSearch("");
    setOfferId(null); setOfferNumber(""); setOfferDiscount(0);
  }
  function pickOffer(id){
    var o=clientOffers.find(function(x){return String(x.id)===String(id);});
    setOfferId(o?o.id:null);
    setOfferNumber(o?o.number:"");
    setOfferPctChoice("50");
    setOfferPctCustom("");
    var disc=o?(+o.discount_amount||0):0;
    setOfferDiscount(disc);
    // Rabat z oferty nie może trafić na fakturę jako osobna (ujemna) pozycja —
    // patrz uzasadnienie przy "Rabat kwotowy" niżej — więc dopisujemy go do Uwag,
    // żeby był widoczny na wydruku faktury.
    if(disc>0){
      var noteLine="Przyznany rabat z oferty "+o.number+": "+fmtMoney(disc)+".";
      setNotes(function(prev){
        if(prev&&prev.indexOf(noteLine)>=0)return prev;
        return (prev?prev.replace(/\s*$/,"")+"\n":"")+noteLine;
      });
    }
  }

  // Nadaje/poprawia numer wybranej (juz istniejacej) oferty klienta — zarowno
  // w bazie (offers.number), jak i lokalnie w selektorze/etykiecie ponizej,
  // zeby faktura powiazana z ta oferta od razu pokazywala nowy numer.
  function renameOffer(newNumber){
    var num=(newNumber||"").trim();
    if(!num||!offerId)return;
    var prevNumber=offerNumber;
    setOfferNumber(num);
    setClientOffers(function(prev){return prev.map(function(o){return String(o.id)===String(offerId)?Object.assign({},o,{number:num}):o;});});
    sbApi.updateOffer(offerId,{number:num}).catch(function(e){
      setOfferNumber(prevNumber);
      setClientOffers(function(prev){return prev.map(function(o){return String(o.id)===String(offerId)?Object.assign({},o,{number:prevNumber}):o;});});
      alert("Błąd zapisu numeru oferty: "+(e.message||e));
    });
  }
  // Wstawia pozycję faktury na X% wartości brutto powiązanej oferty (domyślnie 50% —
  // typowa zaliczka). Jeśli faktura ma jeszcze tylko świeżą, pustą pozycję — zastępuje
  // ją; w przeciwnym razie dopisuje nową, żeby nie skasować już wpisanych danych.
  function applyOfferAmount(){
    var o=clientOffers.find(function(x){return String(x.id)===String(offerId);});
    if(!o){setErr("Najpierw wybierz ofertę");return;}
    var pct=offerPctChoice==="100"?100:offerPctChoice==="50"?50:Math.max(0,+(String(offerPctCustom).replace(",","."))||0);
    if(pct<=0){setErr("Podaj poprawny procent");return;}
    setErr(null);
    var vr=docType==="eko"?0:defaultVat;
    var gross=+((+(o.total_gross||0)*pct/100).toFixed(2));
    var nums=calcLineFromGross(gross,1,vr);
    var itemName=(pct>=100?"Realizacja zamówienia wg oferty ":"Zaliczka "+pct+"% na poczet realizacji zamówienia wg oferty ")+o.number;
    var newItem=Object.assign({name:itemName,quantity:1,unit:settings.default_unit||"szt",vat_rate:vr},nums,{unit_gross:gross,position:1,pkwiu:""});
    setItems(function(prev){
      if(prev.length===1&&!prev[0].name.trim()&&(+prev[0].line_gross||0)===0)return [newItem];
      return prev.concat([Object.assign({},newItem,{position:prev.length+1})]);
    });
  }

  // ── Kontrahenci (baza) — picker autouzupełniający dane nabywcy/sprzedawcy ──
  var filteredContacts=(function(){
    var wantRole=direction==="zakup"?"dostawca":"klient";
    var base=contacts.filter(function(c){return c.role===wantRole||c.role==="oba";});
    var pool=base.length?base:contacts; // gdy brak trafień po roli, pokaż wszystkich
    var q=contactSearch.trim().toLowerCase();
    if(!q)return pool;
    return pool.filter(function(c){
      return (c.name||"").toLowerCase().includes(q)
        || (c.nip||"").includes(q)
        || (c.phone||"").includes(q)
        || (c.city||"").toLowerCase().includes(q);
    });
  })();
  function pickContact(c){
    setContactId(c.id);
    setBuyerName(c.name||"");
    setBuyerNip(c.nip||"");
    setBuyerAddr(c.street||"");
    setBuyerPostal(c.postal||"");
    setBuyerCity(c.city||"");
    setBuyerEmail(c.email||"");
    setContactSearch(c.name||"");
    setContactDropOpen(false);
    setSaveAsContact(false);
  }
  function clearContact(){ setContactId(null); setContactSearch(""); }

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

  // Dla EKO VAT jest zawsze 0% — liczymy sumy z pozycji już "wyzerowanych", tak samo
  // jak są potem zapisywane do invoice_items. Wcześniej totalsPerRate liczyło się z
  // surowych items (z oryginalną stawką VAT wybraną w wierszu), a dopiero zapis do bazy
  // zerował VAT na poziomie invoice_items — to rozjeżdżało wyświetlaną sumę (i zapisywane
  // invoices.total_vat/total_gross) z rzeczywistymi kwotami na pozycjach, zawyżając
  // total_gross o VAT, którego faktycznie nie ma.
  var effItems=docType==="eko"
    ? items.map(function(it){
        var net=+(it.line_net)||0;
        return Object.assign({},it,{vat_rate:0,line_vat:0,line_gross:net});
      })
    : items;
  var totalsPerRate=calcTotals(effItems);
  var totalNet=totalsPerRate.reduce(function(a,r){return a+r.net;},0);
  var totalVat=totalsPerRate.reduce(function(a,r){return a+r.vat;},0);
  var totalGross=totalsPerRate.reduce(function(a,r){return a+r.gross;},0);

  // \u2500\u2500 Rabat kwotowy \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Rabat podawany jest jako kwota BRUTTO i rozk\u0142adany proporcjonalnie na wszystkie
  // pozycje (obni\u017ca ceny jednostkowe). \u015awiadomie NIE dodajemy osobnej pozycji ujemnej:
  // FA(3) dopuszcza warto\u015bci ujemne wy\u0142\u0105cznie dla faktur koryguj\u0105cych, wi\u0119c rabat jako
  // osobny wiersz wywraca\u0142by walidacj\u0119 KSeF. Przy rozbiciu proporcjonalnym sumy
  // netto/VAT/brutto, invoice_items, PDF i XML FA(3) zostaj\u0105 sp\u00f3jne bez zmian schematu.
  var [discountInput,setDiscountInput]=useState("");
  var discountVal=Math.max(0,+(String(discountInput).replace(",","."))||0);

  function applyDiscount(){
    if(items.length===0){setErr("Najpierw dodaj pozycje faktury");return;}
    if(discountVal<=0){setErr("Podaj kwot\u0119 rabatu");return;}
    var baseGross=+(items.reduce(function(a,it){return a+(+it.line_gross||0);},0).toFixed(2));
    if(baseGross<=0){setErr("Pozycje faktury maj\u0105 zerow\u0105 warto\u015b\u0107");return;}
    if(discountVal>=baseGross){setErr("Rabat nie mo\u017ce by\u0107 r\u00f3wny ani wi\u0119kszy ni\u017c warto\u015b\u0107 faktury");return;}
    setErr(null);

    var targetGross=+((baseGross-discountVal).toFixed(2));
    var factor=targetGross/baseGross;

    function reprice(it,newLineGross){
      var q=+(it.quantity)||1;
      var ug=+((newLineGross/q).toFixed(4));
      var nums=calcLineFromGross(ug,q,it.vat_rate);
      return Object.assign({},it,nums,{unit_gross:ug});
    }

    var next=items.map(function(it){
      return reprice(it,+(((+it.line_gross||0)*factor).toFixed(2)));
    });

    // Korekta zaokr\u0105gle\u0144 \u2014 r\u00f3\u017cnic\u0119 groszow\u0105 dorzucamy do pozycji o najwi\u0119kszej warto\u015bci
    var sumGross=+(next.reduce(function(a,it){return a+(+it.line_gross||0);},0).toFixed(2));
    var diff=+((targetGross-sumGross).toFixed(2));
    if(diff!==0&&next.length){
      var bi=0;
      next.forEach(function(it,i){if((+it.line_gross||0)>(+next[bi].line_gross||0))bi=i;});
      next[bi]=reprice(next[bi],+(((+next[bi].line_gross||0)+diff).toFixed(2)));
    }

    setItems(next);
    var noteLine="Uwzgl\u0119dniono rabat "+fmtMoney(discountVal)+" (ceny pozycji obni\u017cone proporcjonalnie).";
    setNotes(function(prev){
      if(prev&&prev.indexOf(noteLine)>=0)return prev;
      return (prev?prev.replace(/\s*$/,"")+"\n":"")+noteLine;
    });
    setDiscountInput("");
  }

  function validate(){
    if(!buyerName.trim()) return direction==="zakup"?"Brak nazwy sprzedawcy (kontrahenta)":"Brak nazwy nabywcy";
    // Proforma i EKO (niezależnie od kierunku) mają własną automatyczną numerację.
    // Ręczny numer pozostaje wymagany wyłącznie dla rzeczywistej faktury zakupowej
    // otrzymanej od dostawcy.
    var isSupplierNumberedPurchase=direction==="zakup"&&docType!=="proforma"&&docType!=="eko";
    if(isSupplierNumberedPurchase&&!purchaseNumber.trim()) return "Podaj numer faktury nadany przez dostawcę";
    if(items.length===0) return "Brak pozycji";
    if(items.some(function(it){return !it.name.trim();})) return "Każda pozycja musi mieć nazwę";
    return null;
  }

  function save(){
    var vErr=validate();
    if(vErr){setErr(vErr);return;}
    setBusy(true); setErr(null);

    var isZakupDir=direction==="zakup";

    var header={
      doc_type:docType, direction:direction,
      issue_date:issueDate, sale_date:saleDate, due_date:dueDate,
      payment_method:payMethod, kasowa:kasowa,
      // client_id zostaje pusty na zakupie (to link do NABYWCY), ale deal_id juz nie —
      // faktura zakupowa moze i powinna wskazywac zlecenie, ktorego dotyczy koszt.
      client_id:isZakupDir?null:clientId, deal_id:dealId||null,
      offer_id:isZakupDir?null:(offerId||null), offer_number:isZakupDir?"":(offerNumber||""),
      offer_discount:isZakupDir?0:(+offerDiscount||0),
      contact_id: contactId||null,
      // Dla faktur zakupowych my (Porter Design) jesteśmy nabywcą — buyer_* wypełniamy
      // danymi sprzedawcy z Ustawień, a prawdziwy kontrahent (wpisany w formularzu w polach
      // "Nabywca") ląduje w seller_snapshot. Zgodne z konwencją synchronizacji KSeF/PDF.
      buyer_name: isZakupDir?sellerName:buyerName,
      buyer_nip:  isZakupDir?sellerNip:buyerNip,
      buyer_address: isZakupDir?sellerAddress:buyerAddr,
      buyer_postal:  isZakupDir?sellerPostal:buyerPostal,
      buyer_city:    isZakupDir?sellerCity:buyerCity,
      buyer_email:   isZakupDir?sellerEmail:buyerEmail,
      notes:notes,
      total_net:totalNet, total_vat:totalVat, total_gross:totalGross,
      // Przypisz fakture do podmiotu: dla istniejacej zachowaj jej podmiot,
      // dla nowej uzyj aktywnego (gdy brak — trigger DB ustawi domyslny).
      entity_id: (initInv.entity_id)||(ent.id)||undefined,
      seller_snapshot: isZakupDir
        ? {name:buyerName, nip:buyerNip, address:buyerAddr, postal:buyerPostal, city:buyerCity, email:buyerEmail, phone:"", bank:""}
        : {
          name:sellerName, nip:sellerNip,
          address:sellerAddress, postal:sellerPostal,
          city:sellerCity, email:sellerEmail,
          phone:sellerPhone, bank:sellerBank
        }
    };
    if(isZakupDir&&docType!=="proforma"&&docType!=="eko") header.number=purchaseNumber.trim();

    var isRealPurchaseDoc=isZakupDir&&docType!=="proforma"&&docType!=="eko";
    // Pobierz numer przed utworzeniem nagłówka. Dzięki temu błąd RPC nie zostawi
    // w bazie nowej faktury bez numeru.
    var numberPromise=isNew&&!isRealPurchaseDoc
      ? sbApi.nextInvoiceNumber(docType,periodKey(numberingReset,issueDate||todayISO()),ent.id)
      : Promise.resolve(null);

    // Faza 2: gdy nie wybrano kontrahenta z bazy, a zaznaczono "zapisz jako nowego" —
    // najpierw utwórz kontrahenta i podepnij jego id do faktury (contact_id).
    var contactPromise=(!contactId&&saveAsContact&&buyerName.trim())
      ? sbApi.addContact({
          kind: buyerNip.trim()?"firma":"osoba",
          role: isZakupDir?"dostawca":"klient",
          name:buyerName.trim(), nip:buyerNip.trim(),
          street:buyerAddr.trim(), postal:buyerPostal.trim(), city:buyerCity.trim(),
          email:buyerEmail.trim(), phone:"", default_vat:23, default_payment_days:14, tags:[]
        }).then(function(data){return data&&data[0]?data[0].id:null;}).catch(function(){return null;})
      : Promise.resolve(contactId||null);

    contactPromise.then(function(_cid){
      if(_cid)header.contact_id=_cid;
      return numberPromise;
    }).then(function(nr){
      if(nr!==null){
        var nrNum=Array.isArray(nr)?+(nr[0]):+(nr)||0;
        // Proforma/faktura korzysta z formatu numeracji aktywnego podmiotu, EKO ma format EKO/nr/MM.
        header.number=docType==="eko"
          ? formatNumber("EKO/{nr}/{MM}",nrNum,issueDate||todayISO())
          : formatNumber(numberingFormat,nrNum,issueDate||todayISO());
      }
      var prom;
      if(isNew){
        // Zwykła faktura zakupowa: numer nadaje dostawca i zapisujemy ją jako otrzymaną.
        // Proforma/EKO w obu kierunkach dostają nasz numer automatyczny.
        prom=sbApi.addInvoice(Object.assign({status:isRealPurchaseDoc?"received":(isZakupDir?"received":"draft")},header));
      } else {
        prom=sbApi.updateInvoice(p.invoice.id,header).then(function(){return {id:p.invoice.id};});
      }
      return prom;
    }).then(function(inv){
      var invId=inv.id||inv[0]&&inv[0].id;
      // effItems (policzone wyżej) ma VAT już wyzerowany dla EKO — jedno źródło prawdy
      // zarówno dla sumy pokazywanej na ekranie, jak i dla zapisu (bez rozjazdu jak wcześniej).
      var itemsToSave=effItems.map(function(it,i){
        var effNet=+(it.line_net)||0;
        var effVatAmt=+(it.line_vat)||0;
        return {
          position:i+1, name:it.name, quantity:+(it.quantity)||1,
          unit:it.unit||"szt", unit_net:+(it.unit_net)||0,
          vat_rate:+(it.vat_rate), line_net:effNet,
          line_vat:effVatAmt, line_gross:effNet+effVatAmt,
          pkwiu:it.pkwiu||""
        };
      });
      return sbApi.replaceInvoiceItems(invId,itemsToSave).then(function(){
        // Sprzedażowe dokumenty są wystawione od razu; zakupowe proformy/EKO
        // pozostają oznaczone jako otrzymane.
        if(isNew&&!isZakupDir&&!isRealPurchaseDoc){
          return sbApi.updateInvoice(invId,{status:"issued"}).then(function(){
            return Object.assign({},inv,{id:invId,status:"issued"});
          });
        }
        return Object.assign({},inv,{id:invId});
      });
    })
    .then(function(result){
      // Dopisanie kosztu do zlecenia. Blad tutaj nie moze cofnac zapisanej faktury —
      // faktura jest juz w bazie, wiec awarie logujemy i idziemy dalej.
      if(!(isZakupDir&&dealId&&createDealCost))return result;
      return sbApi.addDealCost({
        deal_id:dealId,
        kind:dealCostKind,
        amount:totalNet,
        supplier:buyerName.trim(),
        paid_at:null,
        invoice_id:result.id||null,
        note:"Z faktury "+(header.number||purchaseNumber||"").trim()
      }).then(function(){return result;})
        .catch(function(ex){
          console.warn("Nie uda\u0142o si\u0119 dopisa\u0107 kosztu do zlecenia:",ex);
          return result;
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
        ce("span",{style:{fontSize:11,fontWeight:700,background:"var(--pink-l)",color:"var(--pink)",borderRadius:20,padding:"3px 10px"}},"WYSTAWIONA")
    ),

    err&&ce("div",{style:{background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--red)",marginBottom:14}},"\u26A0\uFE0F "+err),

    // ── SEKCJA: Rodzaj / daty ──
    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\uD83D\uDCC4 Dokument"),
      fldRow("Kierunek",
        ce("select",{style:inp,value:direction,onChange:function(e){setDirection(e.target.value);}},
          ce("option",{value:"sprzedaz"},"\uD83D\uDCE4 Sprzeda\u017cowa (wystawiamy)"),
          ce("option",{value:"zakup"},"\uD83D\uDCE5 Zakupowa / kosztowa (od dostawcy)"))),
      fldRow("Typ dokumentu",
        ce("select",{style:inp,value:docType,onChange:function(e){setDocType(e.target.value);}},
          DOC_TYPES.map(function(d){return ce("option",{key:d.id,value:d.id},d.label);}))),
      direction==="zakup"&&docType!=="proforma"&&docType!=="eko"&&ce("div",{style:{background:"var(--violet-l)",border:"1px solid var(--violet)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--violet)",marginTop:4,marginBottom:10}},
        "\uD83D\uDCE5 Faktura kosztowa — rejestrujemy dokument otrzymany od dostawcy. Numer nadaje dostawca (wpisz poni\u017cej), nie generujemy w\u0142asnej numeracji."),
      direction==="zakup"&&docType!=="proforma"&&docType!=="eko"&&fldRow("Numer faktury",
        ce("input",{style:inp,value:purchaseNumber,placeholder:"Np. FV/123/2026 (numer od dostawcy)",onChange:function(e){setPurchaseNumber(e.target.value);}})),
      docType==="eko"&&ce("div",{style:{background:"var(--grl)",border:"1px solid var(--gr)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--gr)",marginTop:4}},
        direction==="zakup"
          ? "🟢 Dokument EKO (kosztowy) — 0% VAT, wewnętrzny wydatek gotówkowy. Numer nadajemy sami (EKO/nr/miesiąc), nigdy nie wychodzi poza aplikację (bez KSeF)."
          : "🟢 Dokument EKO — 0% VAT, wydatki gotówkowe, wystawiany od razu (bez KSeF). Numer własny (EKO/nr/miesiąc)."),
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

    // ── SEKCJA: Nabywca / Sprzedawca (zależnie od kierunku) ──
    ce("div",{style:card},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:12,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},
        direction==="zakup"?"\uD83D\uDE9A Sprzedawca (dostawca)":"\uD83C\uDFE2 Nabywca"),

      // ── Kontrahent z bazy (Faza 2) — autouzupełnia dane poniżej ──
      ce("div",{style:{marginBottom:14,position:"relative"}},
        ce("span",{style:label},(direction==="zakup"?"Dostawca":"Klient")+" z bazy kontrahent\u00f3w (opcjonalnie)"),
        ce("div",{style:{display:"flex",gap:8}},
          ce("input",{style:Object.assign({},inp,{flex:1}),
            value:contactSearch,
            placeholder:"Szukaj: nazwa, NIP, telefon, miasto...",
            onChange:function(e){setContactSearch(e.target.value);setContactDropOpen(true);if(!e.target.value)clearContact();},
            onFocus:function(){setContactDropOpen(true);},
            onBlur:function(){setTimeout(function(){setContactDropOpen(false);},150);},
            onKeyDown:function(e){if(e.key==="Escape")setContactDropOpen(false);}}),
          contactId&&ce("button",{onClick:clearContact,type:"button",
            style:Object.assign({},btnSecondary,{padding:"8px 12px"})},"\u00D7")
        ),
        contactDropOpen&&filteredContacts.length>0&&ce("div",{
          style:{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
            background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:8,
            maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.15)",marginTop:4}},
          filteredContacts.slice(0,30).map(function(c){
            return ce("div",{key:c.id,
              onMouseDown:function(){pickContact(c);},
              style:{padding:"8px 12px",cursor:"pointer",fontSize:13,
                borderBottom:"1px solid var(--bd3)",color:"var(--t1)"}},
              ce("div",{style:{fontWeight:600}},c.name),
              ce("div",{style:{fontSize:11,color:"var(--t3)"}}, [c.nip?"NIP "+c.nip:null,c.city||null,c.phone||null].filter(Boolean).join(" \u00B7 ")||"\u2014")
            );
          })
        ),
        contactId
          ? ce("div",{style:{fontSize:11,color:"var(--violet)",marginTop:4}},"\u2713 Powi\u0105zano z kontrahentem z bazy")
          : (buyerName.trim()?ce("label",{style:{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"var(--t2)",marginTop:7,cursor:"pointer"}},
              ce("input",{type:"checkbox",checked:saveAsContact,onChange:function(e){setSaveAsContact(e.target.checked);},style:{width:14,height:14,cursor:"pointer"}}),
              "Zapisz jako nowego kontrahenta w bazie"):null)
      ),

      direction!=="zakup"&&ce("div",{style:{marginBottom:14,position:"relative"}},
        ce("span",{style:label},"Klient z CRM (opcjonalnie)"),
        ce("div",{style:{display:"flex",gap:8}},
          ce("input",{style:Object.assign({},inp,{flex:1}),
            value:clientSearch,
            placeholder:"Szukaj klienta po imieniu i nazwisku...",
            onChange:function(e){setClientSearch(e.target.value);setClientDropOpen(true);if(!e.target.value)clearClient();},
            onFocus:function(){setClientDropOpen(true);},
            onBlur:function(){setTimeout(function(){setClientDropOpen(false);},150);},
            onKeyDown:function(e){if(e.key==="Escape")setClientDropOpen(false);}}),
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

      direction==="zakup"&&ce("div",{style:{marginBottom:14}},
        ce("span",{style:label},"Zlecenie, kt\u00f3rego dotyczy koszt (opcjonalnie)"),
        ce("select",{style:inp,value:dealId||"",
          onChange:function(e){
            var v=e.target.value||null;
            setDealId(v);
            if(!v)setCreateDealCost(false);
          }},
          ce("option",{value:""},"\u2014 nie przypisuj do zlecenia \u2014"),
          zakupDealOptions.map(function(o){
            return ce("option",{key:o.id,value:o.id},o.label);
          })
        ),
        dealId&&ce("label",{style:{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"var(--t2)",marginTop:9,cursor:"pointer"}},
          ce("input",{type:"checkbox",checked:createDealCost,
            onChange:function(e){setCreateDealCost(e.target.checked);},
            style:{width:14,height:14,cursor:"pointer"}}),
          "Dopisz koszt do zlecenia (kwota netto: "+fmtMoney(totalNet)+")"
        ),
        dealId&&createDealCost&&ce("select",{style:Object.assign({},inp,{marginTop:7}),
          value:dealCostKind,onChange:function(e){setDealCostKind(e.target.value);}},
          ce("option",{value:"tkanina"},"\uD83E\uDDF5 Tkanina"),
          ce("option",{value:"osprzet"},"\uD83D\uDD29 Karnisz / osprz\u0119t"),
          ce("option",{value:"szycie"},"\u2702\uFE0F Szycie"),
          ce("option",{value:"transport"},"\uD83D\uDE9A Transport"),
          ce("option",{value:"inne"},"\uD83D\uDCCE Inne")
        ),
        dealId&&createDealCost&&ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:5,lineHeight:1.5}},
          "Powstanie wpis w \u201eEkonomii zlecenia\u201d powi\u0105zany z t\u0105 faktur\u0105. Zapisywana jest kwota NETTO."
        )
      ),

      direction!=="zakup"&&clientId&&ce("div",{style:{marginBottom:14}},
        ce("span",{style:label},"Powi\u0105zana oferta (opcjonalnie)"),
        ce("select",{style:inp,value:offerId||"",onChange:function(e){pickOffer(e.target.value);}},
          ce("option",{value:""},clientOffers.length?"\u2014 brak (nie dotyczy) \u2014":"\u2014 klient nie ma jeszcze \u017cadnej wygenerowanej oferty \u2014"),
          clientOffers.map(function(o){
            return ce("option",{key:o.id,value:o.id},
              o.number+" \u2014 "+fmtDate((o.created_at||"").slice(0,10))+" \u2014 "+fmtMoney(o.total_gross||0));
          })
        ),
        offerId&&ce("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:4,flexWrap:"wrap"}},
          ce("span",{style:{fontSize:11,color:"var(--violet)"}},"\u2713 Faktura wystawiana na podstawie oferty"),
          ce(InlineEdit,{value:offerNumber,onSave:renameOffer,style:{fontSize:11,color:"var(--violet)",fontWeight:700},inputStyle:{fontSize:11,minWidth:140}})
        ),
        offerId&&offerDiscount>0&&ce("div",{style:{fontSize:11,color:"var(--amber)",marginTop:4}},"\uD83C\uDFF7\uFE0F Przyznany rabat z tej oferty: \u2212"+fmtMoney(offerDiscount)+" (dopisany do Uwag faktury)"),
        offerId&&ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:10,flexWrap:"wrap"}},
          ce("span",{style:{fontSize:11,color:"var(--t3)"}},"Kwota faktury:"),
          ["50","100"].map(function(v){
            var active=offerPctChoice===v;
            return ce("button",{key:v,type:"button",onClick:function(){setOfferPctChoice(v);},
              style:Object.assign({},btnSecondary,{padding:"5px 12px",fontSize:12},active?{background:"var(--t1)",color:"var(--bg)",borderColor:"var(--t1)"}:{})
            },v+"%");
          }),
          ce("button",{type:"button",onClick:function(){setOfferPctChoice("custom");},
            style:Object.assign({},btnSecondary,{padding:"5px 12px",fontSize:12},offerPctChoice==="custom"?{background:"var(--t1)",color:"var(--bg)",borderColor:"var(--t1)"}:{})
          },"Inna"),
          offerPctChoice==="custom"&&ce("input",{style:Object.assign({},inpSm,{width:60,textAlign:"right"}),value:offerPctCustom,inputMode:"decimal",placeholder:"np. 30",
            onChange:function(e){setOfferPctCustom(e.target.value);}}),
          offerPctChoice==="custom"&&ce("span",{style:{fontSize:12,color:"var(--t3)"}},"%"),
          ce("button",{type:"button",onClick:applyOfferAmount,
            style:Object.assign({},btnSecondary,{padding:"5px 14px",fontSize:12,fontWeight:700})},"\u2192 Wstaw pozycj\u0119")
        )
      ),

      ce("div",{style:{display:"flex",gap:8,marginBottom:10}},
        ce("div",{style:{flex:1}},
          ce("span",{style:label},direction==="zakup"?"NIP sprzedawcy":"NIP nabywcy"),
          ce("input",{style:inp,value:buyerNip,placeholder:"0000000000",
            onChange:function(e){setBuyerNip(e.target.value);},
            onKeyDown:function(e){if(e.key==="Enter")lookupNip();}})),
        ce("button",{
          onClick:lookupNip, disabled:nipLoading,
          style:Object.assign({},btnSecondary,{alignSelf:"flex-end",whiteSpace:"nowrap"})
        },nipLoading?"\u23F3 Szukam...":"\uD83D\uDD0D Pobierz z GUS")
      ),
      fldRow("Nazwa",ce("input",{style:inp,value:buyerName,placeholder:direction==="zakup"?"Pełna nazwa dostawcy":"Pełna nazwa firmy / imię nazwisko",onChange:function(e){setBuyerName(e.target.value);}})),
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
        return ce(ItemRow,{key:i,item:it,idx:i,onChange:updateItem,onRemove:removeItem,vatLocked:docType==="eko"});
      }),

      ce("button",{onClick:addItem,
        style:Object.assign({},btnSecondary,{marginTop:10,fontSize:12})
      },"+ Dodaj pozycję"),

      // Rabat kwotowy \u2014 obni\u017ca ceny pozycji proporcjonalnie (patrz applyDiscount)
      ce("div",{style:{marginTop:14,paddingTop:12,borderTop:"1px dashed var(--bd2)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}},
        ce("span",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em"}},"\uD83C\uDFF7\uFE0F Rabat kwotowy"),
        ce("input",{style:Object.assign({},inpSm,{width:110,textAlign:"right"}),value:discountInput,inputMode:"decimal",placeholder:"0,00",
          onChange:function(e){setDiscountInput(e.target.value);}}),
        ce("span",{style:{fontSize:12,color:"var(--t3)"}},"zł brutto"),
        ce("button",{onClick:applyDiscount,disabled:discountVal<=0||items.length===0,
          style:Object.assign({},btnSecondary,{fontSize:12,padding:"6px 14px"},(discountVal<=0||items.length===0)?{opacity:0.5,cursor:"not-allowed"}:{})},"Zastosuj"),
        discountVal>0&&discountVal<totalGross
          ?ce("span",{style:{fontSize:11,color:"var(--t3)"}},"po rabacie: "+fmtMoney(totalGross-discountVal))
          :null
      ),

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
        busy?"\u23F3 Zapisuję...":(isNew?(direction==="zakup"?"\u2705 Zapisz fakturę kosztową":"\u2705 Wystaw fakturę"):"\uD83D\uDCBE Zapisz zmiany"))
    )
  );
}

// ── KARTA PODMIOTU (multi-podmiot) ──────────────────────────────────────────
function EntityCard(p){
  // p: entity, onSaved, onDeleted, startOpen
  var [form,setForm]=useState(p.entity||{});
  var [open,setOpen]=useState(!!p.startOpen);
  var [busy,setBusy]=useState(false);
  var [ok,setOk]=useState(false);
  var [err,setErr]=useState(null);
  function upd(k,v){setForm(function(f){return Object.assign({},f,{[k]:v});});}
  var isDefault=!!form.is_default;

  function save(){
    setBusy(true);setErr(null);setOk(false);
    var data={
      name:form.name||"",nip:form.nip||"",address:form.address||"",postal:form.postal||"",
      city:form.city||"",email:form.email||"",phone:form.phone||"",bank:form.bank||"",
      vat_status:form.vat_status||"czynny",
      numbering_format:form.numbering_format||"FV/{nr}/{MM}/{YYYY}",
      numbering_reset:form.numbering_reset||"monthly"
    };
    sbApi.saveEntity(form.id,data)
      .then(function(){
        // Podmiot domyslny: zsynchronizuj invoice_settings (legacy fallbacky PDF/KSeF).
        if(isDefault){
          return sbApi.saveInvoiceSettings({
            seller_name:data.name,seller_nip:data.nip,seller_address:data.address,
            seller_postal:data.postal,seller_city:data.city,seller_email:data.email,
            seller_phone:data.phone,seller_bank:data.bank,
            numbering_format:data.numbering_format,numbering_reset:data.numbering_reset
          });
        }
      })
      .then(function(){setOk(true);setTimeout(function(){setOk(false);},2000);p.onSaved&&p.onSaved();})
      .catch(function(e){setErr(e.message||"B\u0142\u0105d zapisu");})
      .finally(function(){setBusy(false);});
  }
  function del(){
    if(!confirm("Usun\u0105\u0107 podmiot \u201e"+(form.name||"")+"\u201d? Nie zadzia\u0142a, je\u015bli s\u0105 do niego przypisane faktury."))return;
    setBusy(true);setErr(null);
    sbApi.deleteEntity(form.id)
      .then(function(){p.onDeleted&&p.onDeleted();})
      .catch(function(e){setErr("Nie mo\u017cna usun\u0105\u0107 (prawdopodobnie s\u0105 przypisane faktury/liczniki).");setBusy(false);});
  }
  var row=function(lbl,el,note){return ce("div",{style:{marginBottom:14}},
    ce("span",{style:label},lbl),el,
    note&&ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:3}},note));};

  return ce("div",{style:Object.assign({},card,{border:isDefault?"1px solid var(--violet)":card.border})},
    ce("div",{style:{display:"flex",alignItems:"center",gap:10,cursor:"pointer"},onClick:function(){setOpen(!open);}},
      ce("span",{style:{fontSize:18}},"\uD83C\uDFE2"),
      ce("div",{style:{flex:1}},
        ce("div",{style:{fontSize:14,fontWeight:700,color:"var(--t1)"}},form.name||"(bez nazwy)"),
        ce("div",{style:{fontSize:11,color:"var(--t3)"}},"NIP: "+(form.nip||"\u2014")+"  \u2022  "+(form.vat_status==="zwolniony"?"zwolniony z VAT":"VAT czynny"))),
      isDefault&&ce("span",{style:{fontSize:10,fontWeight:700,color:"var(--violet)",background:"var(--bg)",border:"1px solid var(--violet)",borderRadius:20,padding:"2px 8px"}},"DOMY\u015aLNY"),
      ce("span",{style:{fontSize:14,color:"var(--t3)"}},open?"\u25be":"\u25b8")
    ),

    open&&ce("div",{style:{marginTop:14,borderTop:"1px solid var(--bd3)",paddingTop:14}},
      err&&ce("div",{style:{background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--red)",marginBottom:10}},"\u26A0\uFE0F "+err),
      ok&&ce("div",{style:{background:"var(--grl)",border:"1px solid var(--gr)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--gr)",marginBottom:10}},"\u2713 Zapisano"),

      row("Nazwa firmy / imi\u0119 nazwisko",ce("input",{style:inp,value:form.name||"",onChange:function(e){upd("name",e.target.value);}})),
      row("NIP",ce("input",{style:inp,value:form.nip||"",placeholder:"0000000000",onChange:function(e){upd("nip",e.target.value);}})),
      row("Adres",ce("input",{style:inp,value:form.address||"",onChange:function(e){upd("address",e.target.value);}})),
      ce("div",{style:{display:"grid",gridTemplateColumns:"120px 1fr",gap:10,marginBottom:14}},
        ce("div",null,ce("span",{style:label},"Kod pocztowy"),ce("input",{style:inp,value:form.postal||"",placeholder:"00-000",onChange:function(e){upd("postal",e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Miasto"),ce("input",{style:inp,value:form.city||"",onChange:function(e){upd("city",e.target.value);}}))),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}},
        ce("div",null,ce("span",{style:label},"E-mail"),ce("input",{style:inp,type:"email",value:form.email||"",onChange:function(e){upd("email",e.target.value);}})),
        ce("div",null,ce("span",{style:label},"Telefon"),ce("input",{style:inp,value:form.phone||"",onChange:function(e){upd("phone",e.target.value);}}))),
      row("Numer konta (IBAN)",ce("input",{style:inp,value:form.bank||"",placeholder:"PL00 0000 0000 0000 0000 0000 0000",onChange:function(e){upd("bank",e.target.value);}})),
      row("Status VAT",
        ce("select",{style:inp,value:form.vat_status||"czynny",onChange:function(e){upd("vat_status",e.target.value);}},
          ce("option",{value:"czynny"},"Czynny podatnik VAT"),
          ce("option",{value:"zwolniony"},"Zwolniony z VAT")),
        "Zwolniony \u2192 nowe faktury tego podmiotu domy\u015blnie ze stawk\u0105 \u201ezw\u201d."),
      row("Szablon numeru",
        ce("input",{style:inp,value:form.numbering_format||"FV/{nr}/{MM}/{YYYY}",onChange:function(e){upd("numbering_format",e.target.value);}}),
        "Zmienne: {nr}, {MM}, {YYYY}. Osobny licznik dla ka\u017cdego podmiotu \u2014 u\u017cyj r\u00f3\u017cnych szablon\u00f3w, np. FV/PD/{nr}/{MM}/{YYYY}."),
      row("Reset licznika",
        ce("select",{style:inp,value:form.numbering_reset||"monthly",onChange:function(e){upd("numbering_reset",e.target.value);}},
          ce("option",{value:"monthly"},"Co miesi\u0105c"),
          ce("option",{value:"yearly"},"Co rok"),
          ce("option",{value:"never"},"Nigdy (ci\u0105g\u0142y)"))),

      ce("div",{style:{display:"flex",justifyContent:"space-between",gap:10,marginBottom:16}},
        (!isDefault)&&ce("button",{onClick:del,disabled:busy,style:btnDanger},"\uD83D\uDDD1 Usu\u0144 podmiot"),
        ce("div",{style:{flex:1}}),
        ce("button",{onClick:save,disabled:busy,style:btnPrimary},busy?"\u23F3 Zapisuj\u0119...":"\u2713 Zapisz podmiot")),

      // Integracja KSeF osobno dla tego podmiotu (osobny token/certyfikat).
      ce(KsefTokenPanel,{entityId:form.id})
    )
  );
}

// ── USTAWIENIA FAKTURY ──────────────────────────────────────────────────────
function InvoiceSettings(p){
  var [form,setForm]=useState(p.settings||{});
  var [busy,setBusy]=useState(false);
  var [ok,setOk]=useState(false);
  var [err,setErr]=useState(null);
  var [adding,setAdding]=useState(false);
  var entities=p.entities||[];
  function upd(k,v){setForm(function(f){return Object.assign({},f,{[k]:v});});}

  function saveDefaults(){
    setBusy(true); setErr(null); setOk(false);
    sbApi.saveInvoiceSettings({
      default_vat:form.default_vat,default_payment_days:form.default_payment_days,
      default_payment_method:form.default_payment_method,default_unit:form.default_unit,
      kasowa_default:form.kasowa_default
    })
      .then(function(){setOk(true);setTimeout(function(){setOk(false);},2000);p.onSaved&&p.onSaved(form);})
      .catch(function(e){setErr(e.message||"B\u0142\u0105d zapisu");})
      .finally(function(){setBusy(false);});
  }

  function addEntity(){
    setAdding(true); setErr(null);
    sbApi.createEntity({name:"Nowy podmiot",vat_status:"czynny",numbering_format:"FV/{nr}/{MM}/{YYYY}",numbering_reset:"monthly",ksef_env:"prod"})
      .then(function(){return p.onEntitiesChange&&p.onEntitiesChange();})
      .catch(function(e){setErr(e.message||"Nie uda\u0142o si\u0119 doda\u0107 podmiotu");})
      .finally(function(){setAdding(false);});
  }

  var row=function(lbl,el,note){return ce("div",{style:{marginBottom:14}},
    ce("span",{style:label},lbl),el,
    note&&ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:3}},note)
  );};

  return ce("div",{style:{maxWidth:640,margin:"0 auto",paddingBottom:40}},
    ce("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:20}},
      ce("button",{onClick:p.onClose,style:Object.assign({},btnSecondary,{padding:"7px 12px"})},"\u2190 Wr\u00f3\u0107"),
      ce("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"var(--t1)"}},"Ustawienia fakturowania")),

    err&&ce("div",{style:{background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--red)",marginBottom:14}},"\u26A0\uFE0F "+err),
    ok&&ce("div",{style:{background:"var(--grl)",border:"1px solid var(--gr)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--gr)",marginBottom:14}},"\u2713 Zapisano"),

    // ── PODMIOTY ──────────────────────────────────────────────────────────────
    ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
      ce("h3",{style:{margin:0,fontSize:15,fontWeight:700,color:"var(--t1)"}},"\uD83C\uDFE2 Podmioty (dzia\u0142alno\u015bci)"),
      ce("div",{style:{flex:1}}),
      ce("button",{onClick:addEntity,disabled:adding,style:Object.assign({},btnSecondary,{fontSize:12,padding:"6px 12px"})},adding?"\u23F3 Dodaj\u0119...":"+ Dodaj podmiot")),
    ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:12}},
      "Ka\u017cdy podmiot ma w\u0142asne dane sprzedawcy, osobn\u0105 numeracj\u0119 i osobny token KSeF. W panelu faktur prze\u0142\u0105czasz si\u0119 mi\u0119dzy nimi u g\u00f3ry."),
    entities.map(function(e){
      return ce(EntityCard,{key:e.id,entity:e,startOpen:entities.length===1,
        onSaved:function(){p.onEntitiesChange&&p.onEntitiesChange();},
        onDeleted:function(){p.onEntitiesChange&&p.onEntitiesChange();}});
    }),

    // ── DOMY\u015aLNE WARTO\u015aCI (wsp\u00f3lne dla tenanta) ──────────────────────────────
    ce("div",{style:Object.assign({},card,{marginTop:8})},
      ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:14,borderBottom:"1px solid var(--bd3)",paddingBottom:8}},"\u2699\uFE0F Domy\u015blne warto\u015bci (wsp\u00f3lne)"),
      row("Domy\u015blna stawka VAT",
        ce("select",{style:inp,value:form.default_vat||23,onChange:function(e){upd("default_vat",+(e.target.value));}},
          VAT_RATES.map(function(r){return ce("option",{key:r,value:r},fmtVat(r));}))),
      row("Termin p\u0142atno\u015bci (dni)",
        ce("input",{style:inp,type:"number",min:0,value:form.default_payment_days||14,onChange:function(e){upd("default_payment_days",+(e.target.value));}})),
      row("Forma p\u0142atno\u015bci",
        ce("select",{style:inp,value:form.default_payment_method||"przelew",onChange:function(e){upd("default_payment_method",e.target.value);}},
          PAYMENT_METHODS.map(function(m){return ce("option",{key:m,value:m},m);}))),
      row("Domy\u015blna jednostka miary",
        ce("select",{style:inp,value:form.default_unit||"szt",onChange:function(e){upd("default_unit",e.target.value);}},
          UNITS.map(function(u){return ce("option",{key:u,value:u},u);}))),
      row("Metoda kasowa",
        ce("label",{style:{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--t2)",cursor:"pointer",userSelect:"none"}},
          ce("input",{type:"checkbox",checked:!!form.kasowa_default,
            onChange:function(e){upd("kasowa_default",e.target.checked);},
            style:{width:15,height:15,cursor:"pointer"}}),
          "Zaznaczaj domy\u015blnie na nowych fakturach"),
        "Dla ma\u0142ych podatnik\u00f3w rozliczaj\u0105cych VAT metod\u0105 kasow\u0105. Trafia do FA(3) jako Adnotacje/P_16 = 1 i na PDF jako napis \u201eMetoda Kasowa\u201d.")
    ),

    ce("div",{style:{display:"flex",justifyContent:"flex-end",gap:10}},
      ce("button",{onClick:p.onClose,style:btnSecondary},"Zamknij"),
      ce("button",{onClick:saveDefaults,disabled:busy,style:btnPrimary},busy?"\u23F3 Zapisuj\u0119...":"\u2713 Zapisz domy\u015blne")
    )
  );
}


// ── PANEL CERTYFIKATU KSEF (per podmiot) ──────────────────
function KsefTokenPanel(p){
  var entityId=(p&&p.entityId)||null;
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
    ksefApi.getTokenStatus(entityId)
      .then(function(s){setStatus(s);setEnv(s.env||"prod");setTokenEnv(s.env||"prod");})
      .catch(function(){setStatus({hasCert:false,env:"prod"});});
  },[entityId]);

  function readFile(file,cb){
    var r=new FileReader();
    r.onload=function(e){cb(e.target.result);};
    r.readAsText(file);
  }

  function saveCert(){
    if(!certText.trim()){setErr("Wgraj plik .crt");return;}
    if(!keyText.trim()){setErr("Wgraj plik .key");return;}
    setBusy(true);setErr(null);setMsg(null);
    ksefApi.saveCert(certText.trim(),keyText.trim(),keyPass,env,entityId)
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
    ksefApi.saveToken(t,tokenEnv,entityId)
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
    ksefApi.deleteToken(entityId)
      .then(function(){setStatus({hasCert:false,env:"prod"});setMsg("\u2713 Usuni\u0119to");})
      .catch(function(e){setErr(e.message);})
      .finally(function(){setBusy(false);});
  }

  // Testuje po\u0142\u0105czenie z KSeF bez wysy\u0142ania faktury \u2014 u\u017cywa tego samego
  // /api/ksef/session co realna wysy\u0142ka, wi\u0119c wynik jest wiarygodny.
  function testConnection(){
    setTestBusy(true);setTestErr(null);setTestMsg(null);
    ksefApi.openSession(entityId)
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
    err&&ce("div",{style:{background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--red)",marginBottom:10}},"\u26A0\uFE0F "+err),
    msg&&ce("div",{style:{background:"var(--grl)",border:"1px solid var(--gr)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--gr)",marginBottom:10}},msg),

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
            testMsg&&ce("div",{style:{background:"var(--grl)",border:"1px solid var(--gr)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--gr)",marginBottom:10}},testMsg),
            testErr&&ce("div",{style:{background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--red)",marginBottom:10}},"\u26A0\uFE0F "+testErr),
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
    draft:    {label:"Szkic",     bg:"var(--bg2)",    color:"var(--t3)", desc:"Faktura utworzona, jeszcze nie wystawiona — brak numeru, nie poszła do klienta ani do KSeF."},
    issued:   {label:"Wystawiona",bg:"var(--pink-l)", color:"var(--pink)",   desc:"Faktura sprzedażowa z nadanym numerem — gotowa do wysłania klientowi i/lub do KSeF."},
    received: {label:"Otrzymana", bg:"var(--teal-l)", color:"var(--teal)",   desc:"Faktura zakupowa (kosztowa) — odebrana od kontrahenta / zsynchronizowana z KSeF."},
    sent:     {label:"Wysłana",   bg:"var(--violet-l)",color:"var(--violet)",desc:"Faktura wysłana do KSeF, oczekuje na potwierdzenie."},
    cancelled:{label:"Anulowana", bg:"var(--red-l)",  color:"var(--red)",    desc:"Faktura anulowana / cofnięta."},
  };
  var c=cfg[p.status]||cfg.draft;
  // Faktura opłacona (checkbox "Zapłacono"/payStatus) — pokazujemy to w samym statusie
  // niezależnie od stanu dokumentu (issued=sprzedażowa, received=zakupowa itd.).
  // Nasycony ciemny zielony na bialym tekscie, zeby wyraznie odroznic od jasnego
  // mintu "Otrzymana" (Paulina zglaszala ze bledly sie ze soba w liscie).
  // inv.status w bazie zostaje bez zmian — to wylacznie nadpisanie etykiety w tym miejscu.
  if(p.paid&&p.status!=="draft"&&p.status!=="cancelled"){
    c={label:"Zapłacona",bg:"var(--grd)",color:"#fff",desc:"Faktura opłacona."};
  }
  return ce("span",{title:c.desc,style:{
    fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px",
    background:c.bg,color:c.color,whiteSpace:"nowrap",cursor:"help"
  }},c.label);
}

function KsefBadge(p){
  var cfg={
    none:      null,
    pending:   {label:"KSeF ⏳",bg:"var(--amber-l)", color:"var(--amber)"},
    sent:      {label:"KSeF →",  bg:"var(--violet-l)",color:"var(--violet)"},
    confirmed: {label:"KSeF ✓",  bg:"var(--teal-l)",  color:"var(--teal)"},
    offline:   {label:"KSeF ✗",  bg:"var(--red-l)",   color:"var(--red)"},
    error:     {label:"KSeF ERR",bg:"var(--red-l)",   color:"var(--red)"},
  };
  var c=cfg[p.status];
  if(!c)return null;
  return ce("span",{style:{
    fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px",
    background:c.bg,color:c.color,marginLeft:4
  }},c.label);
}

// ── PODSUMOWANIE OKRESU (Przychody / Wydatki) ──────────────────────────────
// Zastępuje dawny "InvoiceMonthSummary". Kluczowa różnica: kafelki stałych
// okresów (dziś / 7 dni / miesiąc / rok) poniżej to czysta informacja —
// zawsze liczą to samo, niezależnie od filtra listy — dokładnie jak w
// Fakturowni. Wcześniej ten panel miał WŁASNY, niezależny wybór miesiąca
// (strzałki ‹ ›), który w ogóle nie wpływał na listę faktur pod spodem —
// stąd wrażenie, że "wybieram miesiąc, a lista pokazuje co innego" i że
// liczniki się nie zgadzają (kafelki liczyły całą historię, panel — tylko
// bieżący miesiąc). Teraz filtrowanie samej listy ma osobny, realnie
// działający wybór okresu (patrz periodPreset w InvoiceList), a liczniki
// zakładek Sprzedaż/Zakup liczą się z TEGO SAMEGO okresu co lista.
var TYPE_COLORS={vat:"var(--violet)",proforma:"var(--teal)",zaliczka:"var(--amber)",
  korekta:"var(--pink)",eko:"var(--grd)",zakup:"var(--red)"};
var TYPE_ICONS={vat:"📄",proforma:"🧾",zaliczka:"💳",korekta:"↩️",eko:"🟢"};
function docTypeLabel(id){
  var found=DOC_TYPES.find(function(d){return d.id===id;});
  if(found) return found.label;
  if(id==="zakup") return "Zakupowa (stary model)";
  return id||"Nieznany typ";
}
function typeColorOf(id){ return TYPE_COLORS[id]||"var(--t3)"; }

// Sumy dla stałych okresów (dziś / ost. 7 dni / bieżący miesiąc / bieżący rok).
// invoices tu wchodzące są już odfiltrowane wg kierunku (zakładka Sprzedaż/Zakup)
// przez wywołującego. Pomija draft/cancelled — tak samo jak wcześniej.
function periodStats(invoices){
  var today=todayISO();
  var weekAgo=addDays(today,-6);
  var monthKey=today.slice(0,7);
  var yearKey=today.slice(0,4);
  var counted=invoices.filter(function(inv){return inv.status!=="draft"&&inv.status!=="cancelled";});
  function bucket(pred){
    var f=counted.filter(pred);
    return {count:f.length,sum:f.reduce(function(a,inv){return a+(+inv.total_gross||0);},0)};
  }
  return {
    today: bucket(function(inv){return inv.issue_date===today;}),
    week:  bucket(function(inv){return (inv.issue_date||"")>=weekAgo;}),
    month: bucket(function(inv){return (inv.issue_date||"").slice(0,7)===monthKey;}),
    year:  bucket(function(inv){return (inv.issue_date||"").slice(0,4)===yearKey;})
  };
}
function StatTile(tileLabel,stat,accent){
  return ce("div",{style:Object.assign({},card,{flex:1,minWidth:120,marginBottom:0,textAlign:"center"})},
    ce("div",{style:{fontSize:20,fontWeight:800,color:accent?"var(--violet)":"var(--t1)"}},fmtMoney(stat.sum)),
    ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:2}},tileLabel),
    ce("div",{style:{fontSize:10,color:"var(--t3)",marginTop:1}},stat.count+" dok.")
  );
}

// ── LISTA FAKTUR ────────────────────────────────────────────────────────────
// Przebudowa na wzór Fakturowni: prawdziwe zakładki Przychody (sprzedaż) /
// Wydatki (zakup) zamiast klikalnych kafelków-filtrów, oraz jeden, realnie
// działający filtr okresu, który steruje jednocześnie licznikami zakładek
// i wierszami tabeli poniżej (zamiast dwóch niezależnych, rozjeżdżających
// się źródeł jak wcześniej).
function InvoiceList(p){
  var [tab,setTab]=useState("sprzedaz"); // sprzedaz | zakup
  var [search,setSearch]=useState("");
  // Wielokrotny wybór typu dokumentu (jak w Fakturowni: checkboxy zamiast jednego selecta) —
  // domyślnie wszystkie zaznaczone (czyli brak filtrowania). Świadome odznaczenie wszystkiego
  // pokazuje pustą listę — to zgodne z semantyką checkboxów, nie "zapomniany" filtr.
  var [filterDocTypes,setFilterDocTypes]=useState(function(){return FILTER_DOC_TYPES.map(function(d){return d.id;});});
  var [typeFilterOpen,setTypeFilterOpen]=useState(false);
  var [periodPreset,setPeriodPreset]=useState("month"); // month | prevMonth | year | all | custom
  var [customFrom,setCustomFrom]=useState("");
  var [customTo,setCustomTo]=useState("");
  var [syncOpen,setSyncOpen]=useState(false);
  var [syncing,setSyncing]=useState(false);
  var [syncMsg,setSyncMsg]=useState(null);
  var [syncErr,setSyncErr]=useState(null);
  var [dateFrom,setDateFrom]=useState(function(){
    var d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10);
  });
  var [dateTo,setDateTo]=useState(function(){ return new Date().toISOString().slice(0,10); });
  var [sess,setSess]=useState(null);
  // Menu statusu płatności ("Zapłacono" na liście) — pozycjonowane na sztywno (position:fixed)
  // wg współrzędnych przycisku, żeby nie było przycinane przez overflow:hidden kontenera tabeli.
  var [payMenu,setPayMenu]=useState(null); // {invId, top, left} | null
  // Modal wpisania kwoty przy wyborze "Częściowo opł." z menu statusu płatności.
  var [partialModalInv,setPartialModalInv]=useState(null); // faktura | null
  var [partialAmountInput,setPartialAmountInput]=useState("");

  // Multi-podmiot: aktywny podmiot steruje filtrem listy oraz sesja KSeF przy synchronizacji.
  var entitiesList=p.entities||[];
  var activeEntityId=p.activeEntityId||"all";
  var defaultEntity=entitiesList.filter(function(e){return e.is_default;})[0]||entitiesList[0]||null;
  // Sesja synchronizacji: przy "wszystkie" uzyj podmiotu domyslnego.
  var sessionEntityId=(activeEntityId!=="all")?activeEntityId:(defaultEntity&&defaultEntity.id);
  var entityById=function(id){ return entitiesList.filter(function(e){return e.id===id;})[0]||null; };

  function getSession(){
    // Sesja jest zwiazana z konkretnym podmiotem — przy zmianie podmiotu otwieramy nowa.
    if(sess&&sess._entityId===sessionEntityId&&new Date(sess.expiresAt)>new Date()) return Promise.resolve(sess);
    return ksefApi.openSession(sessionEntityId).then(function(s){ s._entityId=sessionEntityId; setSess(s); return s; });
  }

  function syncKsef(){
    setSyncing(true); setSyncErr(null); setSyncMsg(null);
    getSession()
      .then(function(s){
        return ksefApi.receiveInvoices(s.accessToken,s.baseUrl,"all",dateFrom,dateTo,sessionEntityId);
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
        setSyncMsg("✓ Pobrano z KSeF: "+((r.incoming&&r.incoming.fetched)||0)+" zakupowych, "+((r.outgoing&&r.outgoing.fetched)||0)+" sprzedażowych. Nowych/zaktualizowanych: "+(inCount+outCount)+"."
          +(repaired>0?" Uzupełniono pozycje: "+repaired+".":"")
          +(skipCount>0?" Pominięto (już kompletne): "+skipCount+".":"")
          +(remaining>0?" ⏳ Pozostało "+remaining+" — kliknij \"Pobierz z KSeF\" jeszcze raz, aby dokończyć.":""));
        if(allErrs.length>0){
          setSyncErr("⚠️ "+allErrs.length+" faktur pominięto z błędem. Przykład: "
            +(allErrs[0].ksefNum||"?")+" — "+(allErrs[0].err||"nieznany błąd")
            +(allErrs.length>1?" (i "+(allErrs.length-1)+" więcej, zobacz logi Edge Function w Supabase)":""));
        } else {
          // Kontrola spojnosci: ile faktur z KSeF nie trafilo do zadnego koszyka.
          var fetchedTotal=((r.incoming&&r.incoming.fetched)||0)+((r.outgoing&&r.outgoing.fetched)||0);
          var accounted=inCount+outCount+repaired+skipCount+remaining;
          if(fetchedTotal-accounted>5){
            setSyncErr("⚠️ "+(fetchedTotal-accounted)+" faktur z KSeF nie zostało rozliczonych (brak numeru KSeF w metadanych?). Sprawdź logi Edge Function.");
          }
        }
        p.onSynced&&p.onSynced();
      })
      .catch(function(e){setSyncErr(e.message||"Błąd synchronizacji");})
      .finally(function(){setSyncing(false);});
  }

  // ── Zakres dat wynikający z wybranego okresu ──────────────────────────────
  // Jedyne miejsce decydujące, co pokazuje lista. periodPreset="all" wyłącza
  // filtr (periodRange=null) — potrzebne np. do wyszukania starej faktury.
  var today=todayISO();
  var periodRange=(function(){
    if(periodPreset==="all") return null;
    if(periodPreset==="custom") return (customFrom||customTo)?{from:customFrom||"0000-01-01",to:customTo||"9999-12-31"}:null;
    if(periodPreset==="year") return {from:today.slice(0,4)+"-01-01",to:today.slice(0,4)+"-12-31"};
    if(periodPreset==="quarter"||periodPreset==="prevQuarter"){
      var qNow=new Date();
      var qIndex=Math.floor(qNow.getMonth()/3);
      var qYear=qNow.getFullYear();
      if(periodPreset==="prevQuarter"){ qIndex--; if(qIndex<0){qIndex=3;qYear--;} }
      var qStartMonth=qIndex*3;
      var qStartDate=new Date(qYear,qStartMonth,1);
      var qEndDate=new Date(qYear,qStartMonth+3,0);
      return {from:qStartDate.toISOString().slice(0,10), to:qEndDate.toISOString().slice(0,10)};
    }
    var base=new Date();
    if(periodPreset==="prevMonth") base.setMonth(base.getMonth()-1);
    var y=base.getFullYear(), m=base.getMonth();
    var last=new Date(y,m+1,0).getDate();
    var mm=String(m+1).padStart(2,"0");
    return {from:y+"-"+mm+"-01", to:y+"-"+mm+"-"+String(last).padStart(2,"0")};
  })();
  var periodLabel={month:"bieżący miesiąc",prevMonth:"poprzedni miesiąc",quarter:"bieżący kwartał",
    prevQuarter:"poprzedni kwartał",year:"bieżący rok",all:"cały okres",custom:"zakres niestandardowy"}[periodPreset];

  // Faktury filtrowane wg aktywnego podmiotu ("all" = wszystkie podmioty razem).
  var entityInvoices=(activeEntityId==="all")
    ? (p.invoices||[])
    : (p.invoices||[]).filter(function(inv){ return inv.entity_id===activeEntityId; });

  // Faktury bieżącej zakładki (kierunek) — do kafelków stałych okresów, niezależnie od periodRange
  var tabInvoices=entityInvoices.filter(function(inv){
    var dir=invDirection(inv);
    return tab==="zakup"?dir==="zakup":dir!=="zakup";
  });
  var stats=periodStats(tabInvoices);

  // Liczniki zakładek Sprzedaż/Zakup liczone z TEGO SAMEGO okresu co filtr listy —
  // wcześniej liczyły zawsze całą historię, niezależnie od tego, co pokazywał
  // panel podsumowania nad nimi, stąd rozjazd (np. "21" zamiast "17 w tym miesiącu").
  var periodFilteredAll=entityInvoices.filter(function(inv){
    return !periodRange || ((inv.issue_date||"")>=periodRange.from && (inv.issue_date||"")<=periodRange.to);
  });
  var tabCounts=periodFilteredAll.reduce(function(acc,inv){
    if(invDirection(inv)==="zakup") acc.zakup++; else acc.sprzedaz++;
    return acc;
  },{zakup:0,sprzedaz:0});

  var list=tabInvoices.filter(function(inv){
    if(periodRange && !((inv.issue_date||"")>=periodRange.from && (inv.issue_date||"")<=periodRange.to)) return false;
    if(filterDocTypes.indexOf(inv.doc_type||"vat")<0) return false;
    if(search){
      var q=search.toLowerCase();
      return (inv.number&&inv.number.toLowerCase().includes(q))
          || (inv.buyer_name&&inv.buyer_name.toLowerCase().includes(q))
          || (inv.buyer_nip&&inv.buyer_nip.includes(q));
    }
    return true;
  });

  // Suma aktualnie wyświetlanej listy (po zastosowaniu okresu, typów i wyszukiwarki) —
  // pokazywana jako podsumowanie pod tabelą, żeby od razu było widać łączną kwotę
  // wybranej selekcji, bez ręcznego liczenia.
  var listTotals=list.reduce(function(a,inv){
    a.net+=(+inv.total_net||0); a.gross+=(+inv.total_gross||0); return a;
  },{net:0,gross:0});
  var allTypesSelected=filterDocTypes.length===FILTER_DOC_TYPES.length;
  function toggleDocType(id){
    setFilterDocTypes(function(prev){
      return prev.indexOf(id)>=0 ? prev.filter(function(x){return x!==id;}) : prev.concat([id]);
    });
  }
  function toggleAllDocTypes(){
    setFilterDocTypes(allTypesSelected?[]:FILTER_DOC_TYPES.map(function(d){return d.id;}));
  }

  // Rozbicie aktualnie wyświetlanej listy wg typu dokumentu — widać od razu,
  // ile w danym zestawie jest np. EKO, bez zgadywania czy jest wliczone.
  var typeBreakdown=(function(){
    var m={};
    list.forEach(function(inv){
      var k=inv.doc_type||"vat";
      m[k]=(m[k]||0)+1;
    });
    return Object.keys(m).map(function(k){return {key:k,count:m[k]};})
      .sort(function(a,b){return b.count-a.count;});
  })();

  // Podsumowanie ŁĄCZNE per podmiot (tylko w widoku "Wszystkie") — przychody vs koszty
  // dla wybranego okresu listy, z podziałem na podmioty i sumą zbiorczą.
  var combinedSummary=(function(){
    if(activeEntityId!=="all"||entitiesList.length<2) return null;
    var by={};
    periodFilteredAll.forEach(function(inv){
      var eid=inv.entity_id||"—";
      if(!by[eid]) by[eid]={rev:0,cost:0};
      if(invDirection(inv)==="zakup") by[eid].cost+=(+inv.total_gross||0);
      else by[eid].rev+=(+inv.total_gross||0);
    });
    var rows=entitiesList.map(function(e){
      var s=by[e.id]||{rev:0,cost:0};
      return {name:e.name||"(bez nazwy)",rev:s.rev,cost:s.cost};
    });
    var tot=rows.reduce(function(a,r){a.rev+=r.rev;a.cost+=r.cost;return a;},{rev:0,cost:0});
    return {rows:rows,tot:tot};
  })();

  var payStatus=function(inv){
    if(inv.payment_method==="gotówka"&&inv.status==="issued") return {label:"Zapłacona",color:"var(--grd)"};
    if(inv.payment_status==="paid")   return {label:"Zapłacona",color:"var(--grd)"};
    if(inv.payment_status==="partial")return {label:"Częściowa",color:"var(--amber)"};
    // Odrzucona (klient odmówił zapłaty) — ma pierwszeństwo przed sprawdzeniem terminu,
    // bo termin płatności przestaje mieć znaczenie, gdy faktura została odrzucona.
    if(inv.payment_status==="rejected")return {label:"Odrzucona",color:"var(--red)"};
    // Faktury zakupowe (wydatki) dostają status "received" zamiast "issued" —
    // bez tego warunku termin płatności wydatków nigdy nie podświetlał się na
    // czerwono, mimo że wizualnie jest do tego przygotowany (kolumna, wiersz, badge).
    if((inv.status==="issued"||inv.status==="received")&&inv.due_date&&inv.due_date<todayISO()) return {label:"Przeterminowana",color:"var(--red)"};
    if(inv.payment_status==="sent")   return {label:"Wysłana",color:"var(--violet)"};
    return {label:"Wystawiona",color:"var(--t3)"};
  };

  // Stosuje status wybrany z menu "Zapłacono". Dla "Częściowo opł." trzeba najpierw
  // zapytać o wpłaconą kwotę — otwiera modal zamiast zapisywać od razu. Reszta opcji
  // aplikuje się od razu po kliknięciu.
  function applyPayStatus(inv,optionId){
    setPayMenu(null);
    if(optionId==="partial"){
      setPartialModalInv(inv);
      setPartialAmountInput(inv.paid_amount?String(inv.paid_amount).replace(".",","):"");
      return;
    }
    // "issued" (Wystawiona) mapuje się na payment_status "unpaid" — to ta sama, już
    // istniejąca wartość domyślna, więc nie wprowadzamy dla niej osobnej kolumny w bazie.
    var statusMap={issued:"unpaid",paid:"paid",rejected:"rejected",sent:"sent"};
    var newStatus=statusMap[optionId]||"unpaid";
    var newAmount=newStatus==="paid"?(+(inv.total_gross)||0):0;
    p.onChangePayStatus&&p.onChangePayStatus(inv,newStatus,newAmount);
  }
  // Zatwierdzenie kwoty w modalu częściowej wpłaty.
  function confirmPartialPayment(){
    if(!partialModalInv)return;
    var amt=Math.max(0,+(String(partialAmountInput).replace(",",".")||0));
    p.onChangePayStatus&&p.onChangePayStatus(partialModalInv,"partial",amt);
    setPartialModalInv(null);
    setPartialAmountInput("");
  }

  var tabBtn=function(active){return {
    flex:1,cursor:"pointer",padding:"14px 18px",borderRadius:14,border:"none",textAlign:"left",
    background:active?"var(--bd3)":"var(--bg2)",
    outline:active?"2px solid var(--violet)":"1px solid var(--bd2)",
    outlineOffset:-1, transition:"all .15s", fontFamily:"inherit"
  };};
  var presetBtn=function(active){return {
    border:"1px solid var(--bd2)",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,
    cursor:"pointer",background:active?"var(--violet)":"var(--bg)",color:active?"#fff":"var(--t2)"
  };};
  var entChip=function(active){return {
    border:active?"1px solid var(--violet)":"1px solid var(--bd2)",borderRadius:20,padding:"6px 14px",
    fontSize:13,fontWeight:700,cursor:"pointer",
    background:active?"var(--violet)":"var(--bg)",color:active?"#fff":"var(--t2)",fontFamily:"inherit"
  };};

  return ce("div",null,

    // ── Przełącznik podmiotu (multi-podmiot) ─────────────────────────────────
    entitiesList.length>1&&ce("div",{style:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}},
      ce("span",{style:{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginRight:2}},"Podmiot:"),
      entitiesList.map(function(e){
        return ce("button",{key:e.id,onClick:function(){p.onEntityChange&&p.onEntityChange(e.id);},
          style:entChip(activeEntityId===e.id)}, e.name||"(bez nazwy)");
      }),
      ce("button",{onClick:function(){p.onEntityChange&&p.onEntityChange("all");},
        style:entChip(activeEntityId==="all")},"Wszystkie \u2211")
    ),

    // ── Zakładki Przychody (Sprzedaż) / Wydatki (Zakup) ──────────────────────
    ce("div",{style:{display:"flex",gap:10,marginBottom:6}},
      ce("button",{onClick:function(){setTab("sprzedaz");},style:tabBtn(tab==="sprzedaz")},
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}},"💰 Przychody (sprzedaż)"),
        ce("div",{style:{fontSize:24,fontWeight:800,color:"var(--t2)",marginTop:4}},tabCounts.sprzedaz)
      ),
      ce("button",{onClick:function(){setTab("zakup");},style:tabBtn(tab==="zakup")},
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}},"📥 Wydatki (zakup)"),
        ce("div",{style:{fontSize:24,fontWeight:800,color:"var(--t2)",marginTop:4}},tabCounts.zakup)
      )
    ),
    ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:14}},
      "Liczby w zakładkach dotyczą okresu: "+periodLabel+"."),

    // ── Kafelki stałych okresów (jak w Fakturowni: dziś / 7 dni / miesiąc / rok) ──
    // Wyłącznie informacyjne — nie filtrują listy poniżej, więc zawsze pokazują
    // to samo niezależnie od wybranego filtra okresu listy.
    ce("div",{style:{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}},
      StatTile("Dziś",stats.today),
      StatTile("Ostatnie 7 dni",stats.week),
      StatTile("Bieżący miesiąc",stats.month,true),
      StatTile("Bieżący rok",stats.year)
    ),

    // ── Podsumowanie ŁĄCZNE z wielu podmiotów (widok "Wszystkie") ─────────────
    combinedSummary&&ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:12,padding:"12px 14px",marginBottom:14}},
      ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}},
        "Podsumowanie łączne (brutto) — "+periodLabel),
      ce("div",{style:{display:"grid",gridTemplateColumns:"minmax(160px,1fr) 130px 130px 130px",gap:6,fontSize:11,fontWeight:700,color:"var(--t3)",paddingBottom:6,borderBottom:"1px solid var(--bd2)"}},
        ce("div",null,"Podmiot"),
        ce("div",{style:{textAlign:"right"}},"Przychody"),
        ce("div",{style:{textAlign:"right"}},"Koszty"),
        ce("div",{style:{textAlign:"right"}},"Saldo")),
      combinedSummary.rows.map(function(r,i){
        return ce("div",{key:i,style:{display:"grid",gridTemplateColumns:"minmax(160px,1fr) 130px 130px 130px",gap:6,fontSize:13,padding:"6px 0",borderBottom:"1px solid var(--bd3)"}},
          ce("div",{style:{color:"var(--t1)",fontWeight:600}},r.name),
          ce("div",{style:{textAlign:"right",color:"var(--gr)"}},fmtMoney(r.rev)),
          ce("div",{style:{textAlign:"right",color:"var(--t2)"}},fmtMoney(r.cost)),
          ce("div",{style:{textAlign:"right",fontWeight:700,color:(r.rev-r.cost)>=0?"var(--gr)":"var(--red)"}},fmtMoney(r.rev-r.cost)));
      }),
      ce("div",{style:{display:"grid",gridTemplateColumns:"minmax(160px,1fr) 130px 130px 130px",gap:6,fontSize:13,paddingTop:8,fontWeight:800,color:"var(--t1)"}},
        ce("div",null,"Razem"),
        ce("div",{style:{textAlign:"right",color:"var(--gr)"}},fmtMoney(combinedSummary.tot.rev)),
        ce("div",{style:{textAlign:"right"}},fmtMoney(combinedSummary.tot.cost)),
        ce("div",{style:{textAlign:"right",color:(combinedSummary.tot.rev-combinedSummary.tot.cost)>=0?"var(--gr)":"var(--red)"}},fmtMoney(combinedSummary.tot.rev-combinedSummary.tot.cost)))
    ),

    // ── Filtr okresu dla listy poniżej (realnie filtruje wiersze tabeli) ──────
    ce("div",{style:{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}},
      ce("span",{style:{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}},"Okres listy:"),
      ce("button",{onClick:function(){setPeriodPreset("month");},style:presetBtn(periodPreset==="month")},"Ten miesiąc"),
      ce("button",{onClick:function(){setPeriodPreset("prevMonth");},style:presetBtn(periodPreset==="prevMonth")},"Poprzedni miesiąc"),
      ce("button",{onClick:function(){setPeriodPreset("quarter");},style:presetBtn(periodPreset==="quarter")},"Ten kwartał"),
      ce("button",{onClick:function(){setPeriodPreset("prevQuarter");},style:presetBtn(periodPreset==="prevQuarter")},"Poprzedni kwartał"),
      ce("button",{onClick:function(){setPeriodPreset("year");},style:presetBtn(periodPreset==="year")},"Ten rok"),
      ce("button",{onClick:function(){setPeriodPreset("all");},style:presetBtn(periodPreset==="all")},"Wszystko"),
      ce("input",{type:"date",style:Object.assign({},inpSm,{maxWidth:130}),value:customFrom,
        onChange:function(e){setCustomFrom(e.target.value);setPeriodPreset("custom");}}),
      ce("span",{style:{fontSize:12,color:"var(--t3)"}},"–"),
      ce("input",{type:"date",style:Object.assign({},inpSm,{maxWidth:130}),value:customTo,
        onChange:function(e){setCustomTo(e.target.value);setPeriodPreset("custom");}})
    ),

    // Toolbar
    ce("div",{style:{display:"flex",gap:10,marginBottom:syncOpen?10:16,flexWrap:"wrap",alignItems:"center"}},
      ce("input",{style:Object.assign({},inp,{maxWidth:260,flex:1}),
        value:search,onChange:function(e){setSearch(e.target.value);},
        placeholder:"🔍 Szukaj po numerze, nabywcy, NIP..."}),
      ce("button",{onClick:function(){setTypeFilterOpen(!typeFilterOpen);},
        style:Object.assign({},btnSecondary,typeFilterOpen?{borderColor:"var(--violet)",color:"var(--violet)"}:{})},
        "🏷️ Typ dokumentu ("+filterDocTypes.length+"/"+FILTER_DOC_TYPES.length+")"),
      ce("button",{onClick:function(){p.onNew&&p.onNew(tab);},style:btnPrimary},
        tab==="zakup"?"+ Nowy wydatek":"+ Nowa faktura"),
      ce("button",{onClick:p.onSettings,style:btnSecondary},"⚙️ Ustawienia"),
      ce("button",{onClick:function(){setSyncOpen(!syncOpen);},
        style:Object.assign({},btnSecondary,syncOpen?{borderColor:"var(--violet)",color:"var(--violet)"}:{})},
        "🔄 Synchronizuj z KSeF")
    ),

    // Panel wyboru typów dokumentu (rozwijany) — checkboxy zamiast jednego selecta,
    // żeby np. podsumować tylko wybrane 3 typy naraz (jak w Fakturowni).
    typeFilterOpen&&ce("div",{style:{marginBottom:16,background:"var(--bg2)",border:"1px solid var(--bd2)",
      borderRadius:10,padding:"10px 12px",maxWidth:320}},
      ce("label",{style:{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",cursor:"pointer",
        borderBottom:"1px solid var(--bd3)",marginBottom:4,fontWeight:700,fontSize:13,color:"var(--t1)"}},
        ce("input",{type:"checkbox",checked:allTypesSelected,onChange:toggleAllDocTypes,
          style:{width:16,height:16,cursor:"pointer",accentColor:"var(--violet)"}}),
        "wszystkie"),
      FILTER_DOC_TYPES.map(function(d){
        return ce("label",{key:d.id,style:{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",cursor:"pointer",fontSize:13,color:"var(--t2)"}},
          ce("input",{type:"checkbox",checked:filterDocTypes.indexOf(d.id)>=0,onChange:function(){toggleDocType(d.id);},
            style:{width:16,height:16,cursor:"pointer",accentColor:"var(--violet)"}}),
          d.label);
      })
    ),

    // Panel synchronizacji KSeF (rozwijany) — osobny zakres dat, tylko dla pobierania z KSeF
    syncOpen&&ce("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end",
      background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,padding:"10px 12px"}},
      ce("div",null,ce("span",{style:label},"Od"),
        ce("input",{type:"date",style:Object.assign({},inp,{maxWidth:140}),value:dateFrom,
          onChange:function(e){setDateFrom(e.target.value);}})),
      ce("div",null,ce("span",{style:label},"Do"),
        ce("input",{type:"date",style:Object.assign({},inp,{maxWidth:140}),value:dateTo,
          onChange:function(e){setDateTo(e.target.value);}})),
      ce("button",{onClick:syncKsef,disabled:syncing,style:Object.assign({},btnPrimary,{alignSelf:"flex-end"})},
        syncing?"⏳ Synchronizuję...":"🔄 Pobierz z KSeF"),
      syncErr&&ce("div",{style:{fontSize:12,color:"var(--red)"}},"⚠️ "+syncErr),
      syncMsg&&ce("div",{style:{fontSize:12,color:"var(--gr)"}},syncMsg)
    ),

    // Rozbicie bieżącej listy wg typu dokumentu (widoczne od razu, ile jest np. EKO)
    list.length>0&&ce("div",{style:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}},
      typeBreakdown.map(function(t){
        return ce("span",{key:t.key,style:{fontSize:11,fontWeight:600,color:typeColorOf(t.key),
          background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:20,padding:"3px 10px"}},
          (TYPE_ICONS[t.key]||"▪")+" "+docTypeLabel(t.key)+": "+t.count);
      })
    ),

    // Brak dokumentów
    list.length===0&&ce("div",{style:{textAlign:"center",padding:"40px 0",color:"var(--t3)",fontSize:14}},
      search||!allTypesSelected?"Brak pasujących dokumentów w wybranym okresie.":"Brak dokumentów w wybranym okresie."),

    // Tabela
    list.length>0&&ce("div",{style:{background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:14,overflow:"hidden"}},
      // Nagłówek tabeli
      ce("div",{style:{display:"grid",gridTemplateColumns:"110px 130px minmax(180px,1fr) 95px 100px 90px 130px 90px 100px 90px 64px",gap:6,padding:"10px 14px",borderBottom:"1px solid var(--bd2)",background:"var(--bg)",width:"100%"}},
        ["Numer","Typ","Kontrahent","Data","Termin pł.","Płatność","Brutto / Netto","Zapłacono","Zatwierdzono","Status",""].map(function(h,i){
          return ce("div",{key:i,style:{fontSize:10,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em",textAlign:i===2?"left":(i>=7?"center":"right")}},h);
        })
      ),
      // Wiersze
      list.map(function(inv){
        var ps=payStatus(inv);
        var isOverdue=ps.label==="Przeterminowana";
        // Zapłacone faktury muszą być widoczne "na zielono" w całym wierszu, a nie
        // tylko na badge statusu — wcześniej wyglądały jak zwykły (szary) wiersz,
        // przez co lista zapłaconych i niezapłaconych była nie do odróżnienia rzutem oka.
        var isPaidRow=ps.label==="Zapłacona";
        var isPurchase=tab==="zakup";
        var typeLabelStr=(TYPE_ICONS[inv.doc_type]||"📄")+" "+docTypeLabel(inv.doc_type||"vat");
        var cb=function(checked,onToggle){
          return ce("div",{style:{textAlign:"center"}},
            ce("input",{type:"checkbox",checked:!!checked,
              onClick:function(e){e.stopPropagation();},
              onChange:function(e){onToggle(e.target.checked);},
              style:{width:16,height:16,cursor:"pointer",accentColor:"var(--violet)"}})
          );
        };
        // Kontrolka statusu płatności ("Zapłacono"): klikalna plakietka, otwiera menu z opcjami
        // Wystawiona / Opłacona / Częściowo opł. / Odrzucona / Wysłana (patrz applyPayStatus).
        // Wybranie "Częściowo opł." otwiera osobny modal do wpisania wpłaconej kwoty
        // (confirmPartialPayment) — na liście widać wtedy plakietkę pół zieloną/pół czerwoną
        // oraz kwotę pozostałą do dopłaty. Płatność gotówką zostaje zablokowana — nalicza się
        // automatycznie po wystawieniu, tak jak wcześniej (nie da się jej cofnąć z tego miejsca).
        var payControl=function(){
          var forcedPaid=inv.payment_method==="gotówka"&&inv.status==="issued";
          var isPartial=ps.label==="Częściowa";
          var remaining=isPartial?Math.max(0,(+inv.total_gross||0)-(+inv.paid_amount||0)):0;
          var tone=(forcedPaid||ps.label==="Zapłacona")?{bg:"var(--grl)",fg:"var(--grd)"}
            :(ps.label==="Odrzucona"||ps.label==="Przeterminowana")?{bg:"var(--red-l)",fg:"var(--red)"}
            :ps.label==="Wysłana"?{bg:"var(--violet-l)",fg:"var(--violet)"}
            :{bg:"var(--bg)",fg:"var(--t3)"}; // Wystawiona (domyślny)
          var pillStyle={
            fontSize:10,fontWeight:700,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap",
            border:"none",fontFamily:"inherit",outline:"none",
            cursor:forcedPaid?"not-allowed":"pointer",
            background:isPartial?"linear-gradient(90deg, var(--gr) 50%, var(--red) 50%)":tone.bg,
            color:isPartial?"#fff":tone.fg
          };
          return ce("div",{style:{textAlign:"center"}},
            ce("button",{
              type:"button",
              disabled:forcedPaid,
              title:forcedPaid?"Płatność gotówką — uznawana za zapłaconą automatycznie po wystawieniu"
                    :"Kliknij, aby zmienić status płatności",
              onClick:function(e){
                e.stopPropagation();
                if(forcedPaid)return;
                var rect=e.currentTarget.getBoundingClientRect();
                var menuWidth=170;
                setPayMenu({invId:inv.id,top:rect.bottom+4,left:Math.min(rect.left,window.innerWidth-menuWidth-8)});
              },
              style:pillStyle
            }, ps.label+(forcedPaid?"":" ▾")),
            isPartial&&ce("div",{style:{fontSize:9,fontWeight:700,marginTop:3,color:"var(--red)"}},"do dopłaty: "+fmtMoney(remaining))
          );
        };
        var snap=inv.seller_snapshot||{};
        // Fallback do buyer_* dla starych rekordów sprzed wprowadzenia seller_snapshot przy synchronizacji
        var contragentName=isPurchase?(snap.name||inv.buyer_name||"—"):(inv.buyer_name||"—");
        var contragentNip=isPurchase?(snap.nip||inv.buyer_nip||""):(inv.buyer_nip||"");
        var isBusy=p.viewBusyId===inv.id;
        var rowBg=isOverdue?"var(--red-l)":(isPaidRow?"var(--grl)":"var(--bg2)");
        var rowHoverBg=isOverdue?"var(--red-border)":(isPaidRow?"var(--grm)":"var(--bg3)");
        return ce("div",{key:inv.id,
          onClick:function(e){
            if(isBusy)return;
            // Zakończenie zaznaczania tekstu również emituje click. Nie otwieraj
            // wtedy faktury — otwarcie wiersza jest tylko dla zwykłego kliknięcia.
            var selection=window.getSelection&&window.getSelection();
            if(selection&&selection.toString()) return;
            if(e&&e.detail===0) return;
            (inv.ksef_number||inv.status==="issued")?(p.onView&&p.onView(inv)):p.onEdit(inv);
          },
          style:{display:"grid",gridTemplateColumns:"110px 130px minmax(180px,1fr) 95px 100px 90px 130px 90px 100px 90px 64px",gap:6,padding:"11px 14px",
            borderBottom:"1px solid var(--bd3)",cursor:isBusy?"wait":"pointer",transition:"background .12s",
            background:rowBg,width:"100%",opacity:isBusy?0.6:1,
            boxShadow:isPaidRow?"inset 3px 0 0 var(--gr)":"none"},
          onMouseEnter:function(e){e.currentTarget.style.background=rowHoverBg;},
          onMouseLeave:function(e){e.currentTarget.style.background=rowBg;}
        },
          ce("div",{
            // Numer faktury jest interaktywnie niezależny od wiersza: można rozpocząć
            // zaznaczanie od dowolnego miejsca numeru bez uruchamiania nawigacji wiersza.
            onPointerDown:function(e){e.stopPropagation();},
            onMouseDown:function(e){e.stopPropagation();},
            onClick:function(e){e.stopPropagation();},
            style:{fontSize:12,fontWeight:700,color:"var(--violet)",userSelect:"text",WebkitUserSelect:"text",MozUserSelect:"text",cursor:"text"}
          },
            ce("span",{style:{userSelect:"text",WebkitUserSelect:"text",MozUserSelect:"text"}},
              inv.number||ce("span",{style:{color:"var(--t3)",fontStyle:"italic"}},"(szkic)"))),
          ce("div",{style:{fontSize:11,textAlign:"right",color:typeColorOf(inv.doc_type),fontWeight:600}},typeLabelStr),
          ce("div",null,
            ce("div",{style:{fontSize:13,fontWeight:500,color:"var(--t1)"}},contragentName.slice(0,40)),
            contragentNip&&ce("div",{style:{fontSize:11,color:"var(--t3)"}},"NIP: "+contragentNip)
          ),
          ce("div",{style:{fontSize:12,textAlign:"right",color:"var(--t2)"}},fmtDate(inv.issue_date)),
          ce("div",{style:{fontSize:12,fontWeight:isOverdue?700:400,textAlign:"right",color:isOverdue?"var(--red)":"var(--t2)"}},fmtDate(inv.due_date)),
          ce("div",{style:{fontSize:11,textAlign:"right",color:"var(--t2)",textTransform:"capitalize"}},inv.payment_method||"—"),
          ce("div",{style:{textAlign:"right"}},
            // Kwota 0 zł jest podejrzana (prawdziwa faktura z pozycjami prawie nigdy nie jest
            // zerowa) — oznaczamy wizualnie, żeby łatwo znaleźć taki rekord do sprawdzenia,
            // zamiast przewijać całą listę w poszukiwaniu "0,00 zł".
            (+inv.total_gross||0)===0
              ? ce("div",{style:{fontSize:13,fontWeight:700,color:"var(--amber)"},title:"Zerowa kwota — sprawdź pozycje faktury"},"⚠ "+fmtMoney(inv.total_gross))
              : ce("div",{style:{fontSize:13,fontWeight:700,color:isPaidRow?"var(--grd)":"var(--t1)"}},fmtMoney(inv.total_gross)),
            ce("div",{style:{fontSize:10,color:"var(--t3)"}},"netto "+fmtMoney(inv.total_net))
          ),
          payControl(),
          inv.ksef_number
            ? ce("div",{style:{textAlign:"center"},title:"Zatwierdzone automatycznie przez nadanie numeru KSeF"},
                ce("input",{type:"checkbox",checked:true,disabled:true,
                  onClick:function(e){e.stopPropagation();},
                  style:{width:16,height:16,accentColor:"var(--violet)",opacity:0.6,cursor:"not-allowed"}}))
            : cb(inv.approved,function(v){p.onToggleApproved&&p.onToggleApproved(inv,v);}),
          ce("div",{style:{textAlign:"center"}},
            ce(StatusBadge,{status:inv.status,paid:ps.label==="Zapłacona"}),
            isOverdue&&ce("div",{style:{fontSize:9,fontWeight:700,color:"var(--red)",marginTop:3}},"⚠ termin minął")
          ),
          ce("div",{style:{textAlign:"right",display:"flex",gap:2,justifyContent:"flex-end"}},
            // Duplikuj — wystawia od razu nową fakturę (nowy numer, dzisiejsza data)
            // z przepisanym nabywcą i pozycjami tej faktury. Otwiera edytor, więc
            // przed zapisem można jeszcze coś poprawić.
            ce("button",{
              onClick:function(e){e.stopPropagation();p.onDuplicate&&p.onDuplicate(inv);},
              title:"Wystaw taką samą fakturę (nowy numer)",
              style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"2px 4px"}
            },"📋"),
            ce("button",{
              onClick:function(e){e.stopPropagation();if(confirm("Usunąć fakturę?"))p.onDelete(inv);},
              style:{border:"none",background:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"2px 4px"}
            },"🗑"))
        );
      })
    ),

    // Podsumowanie łącznej kwoty aktualnie wyświetlanej listy (po zastosowaniu
    // okresu, wybranych typów dokumentu i wyszukiwarki) — widać od razu sumę
    // wybranej selekcji, bez ręcznego liczenia.
    list.length>0&&ce("div",{style:{display:"flex",justifyContent:"flex-end",gap:24,
      marginTop:10,padding:"12px 18px",background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:14}},
      ce("div",{style:{textAlign:"right"}},
        ce("div",{style:{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}},"Suma netto ("+list.length+" dok.)"),
        ce("div",{style:{fontSize:16,fontWeight:700,color:"var(--t2)"}},fmtMoney(listTotals.net))
      ),
      ce("div",{style:{textAlign:"right"}},
        ce("div",{style:{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.05em"}},"Suma brutto"),
        ce("div",{style:{fontSize:18,fontWeight:800,color:"var(--violet)"}},fmtMoney(listTotals.gross))
      )
    ),

    // ── Menu statusu płatności (rozwijane po kliknięciu plakietki "Zapłacono") ──
    // position:fixed wg współrzędnych przycisku (patrz payControl) — tabela ma
    // overflow:hidden, więc zwykłe position:absolute byłoby przycinane przez
    // zaokrąglone rogi kontenera.
    payMenu&&(function(){
      var menuInv=list.find(function(i){return i.id===payMenu.invId;});
      return ce("div",null,
      // Niewidzialna nakładka na cały ekran — kliknięcie poza menu je zamyka.
      ce("div",{onClick:function(){setPayMenu(null);},style:{position:"fixed",inset:0,zIndex:300}}),
      ce("div",{style:{position:"fixed",top:payMenu.top,left:payMenu.left,zIndex:301,minWidth:170,
          background:"var(--bg2)",border:"1px solid var(--bd2)",borderRadius:10,
          boxShadow:"0 8px 24px rgba(0,0,0,0.18)",overflow:"hidden"}},
        PAY_STATUS_OPTIONS.map(function(opt,oi){
          return ce("div",{key:opt.id,
            onClick:function(e){e.stopPropagation();if(menuInv)applyPayStatus(menuInv,opt.id);},
            style:{padding:"9px 14px",fontSize:13,color:"var(--t1)",cursor:"pointer",
              borderBottom:oi<PAY_STATUS_OPTIONS.length-1?"1px solid var(--bd3)":"none"},
            onMouseEnter:function(e){e.currentTarget.style.background="var(--bg3)";},
            onMouseLeave:function(e){e.currentTarget.style.background="transparent";}
          },opt.label);
        })
      )
      );
    })(),

    // ── Modal: kwota częściowej wpłaty (otwiera się po wyborze "Częściowo opł.") ──
    partialModalInv&&ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}},
      ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:"1.8rem",width:320,
        border:"1px solid var(--bd2)",boxShadow:"0 12px 40px rgba(0,0,0,0.15)"}},
        ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:4,color:"var(--t1)",letterSpacing:"0.02em"}},
          "Częściowa wpłata"),
        ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:12}},
          "Faktura "+(partialModalInv.number||"(szkic)")+" \u2014 "+fmtMoney(partialModalInv.total_gross)+" brutto"),
        ce("span",{style:label},"Wpłacona kwota"),
        ce("input",{autoFocus:true,value:partialAmountInput,inputMode:"decimal",placeholder:"0,00",
          onChange:function(e){setPartialAmountInput(e.target.value);},
          onKeyDown:function(e){if(e.key==="Enter")confirmPartialPayment();},
          style:Object.assign({},inp,{marginBottom:14,textAlign:"right"})}),
        ce("div",{style:{display:"flex",gap:8}},
          ce("button",{onClick:confirmPartialPayment,style:Object.assign({},btnPrimary,{flex:1})},"Zapisz"),
          ce("button",{onClick:function(){setPartialModalInv(null);setPartialAmountInput("");},style:btnSecondary},"Anuluj")
        )
      )
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

// ── OFICJALNY KOD QR KSeF (Kod I / OFFLINE) ────────────────────────────────
// Zgodnie ze specyfikacja KSeF 2.0 (github.com/CIRFMF/ksef-api/blob/main/kody-qr.md):
//   https://qr[-test].ksef.mf.gov.pl/invoice/{NIP}/{DD-MM-YYYY}/{SHA256_XML_Base64Url}
// Hash bierzemy z kolumny inv.ksef_invoice_hash zapisanej przez ksef-send w chwili
// wysylki (Base64URL bez padding, gotowy do URL). NIE liczymy hasha z xml_payload,
// bo sync z KSeF (ksef-receive) potrafi go nadpisac canonical XML-em o innym hashu.
// Warunek pojawienia sie QR na fakturze:
//   - status w KSeF: confirmed (mamy numer KSeF)
//   - mamy zapisany hash z chwili wysylki (ksef_invoice_hash)
//   - dokument sprzedazowy wystawiony przez nas (nie zakupowa/EKO/proforma)
// Dla faktur wystawionych PRZED dodaniem kolumny ksef_invoice_hash (migracja 0012):
// hash bedzie null i QR sie nie pokaze — lepiej brak QR niz falszywy odrzucany
// przez skanery KSeF. Nowe faktury dostana QR automatycznie.
async function buildKsefQrUrl(inv, settings){
  if(!inv||inv.ksef_status!=="confirmed") return null;
  if(!inv.ksef_number) return null;
  if(!inv.ksef_invoice_hash) return null;
  if(invDirection(inv)==="zakup"||inv.doc_type==="eko"||inv.doc_type==="proforma") return null;

  // NIP sprzedawcy: seller_snapshot (zapisywany przy wysylce/sync) lub settings sprzedawcy
  var snap=inv.seller_snapshot||{};
  var nip=(snap.nip||(settings&&settings.seller_nip)||"").replace(/[\s\-]/g,"");
  if(!/^\d{10}$/.test(nip)) return null;

  // Data wystawienia YYYY-MM-DD -> DD-MM-YYYY (format wymagany przez MF)
  var iso=(inv.issue_date||"").slice(0,10);
  var mDate=iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!mDate) return null;
  var ddmmyyyy=mDate[3]+"-"+mDate[2]+"-"+mDate[1];

  // Srodowisko: z invoice_settings.ksef_env (per-tenant). Domyslnie prod.
  var env=(settings&&settings.ksef_env==="test")?"test":"prod";
  var host=env==="test"?"qr-test.ksef.mf.gov.pl":"qr.ksef.mf.gov.pl";
  return "https://"+host+"/invoice/"+nip+"/"+ddmmyyyy+"/"+inv.ksef_invoice_hash;
}

function buildInvoicePDFHtml(inv,settings,ksefQrUrl,previewMode){
  var s=settings||{};
  var items=inv.invoice_items||[];
  var isZakup=invDirection(inv)==="zakup";
  var snap=inv.seller_snapshot||{};
  var fmtM=function(v){return (+(v||0)).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2});};
  var fmtD=function(d){if(!d)return "\u2014";var p=d.split("-");return p[2]+"."+p[1]+"."+p[0];};
  var docLabel={vat:"Faktura",zakup:"Faktura zakupowa",proforma:"Faktura Proforma",zaliczka:"Faktura Zaliczkowa",korekta:"Faktura Koryguj\u0105ca",eko:"Dokument EKO"}[inv.doc_type]||"Faktura";
  // Kierunek zakupowy z innym niż "zakup" typem dokumentu (np. EKO/proforma wpisane ręcznie
  // jako koszt) — dopisujemy adnotację, bo sama etykieta typu tego nie pokazuje.
  if(isZakup&&inv.doc_type!=="zakup") docLabel+=" (zakupowa)";

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
        // Ustawienia są źródłem prawdy dla nabywcy przy ręcznie rejestrowanym zakupie.
        // buyer_* zostaje wyłącznie fallbackiem dla historycznych rekordów.
        name:s.seller_name||inv.buyer_name||"",
        nip:s.seller_nip||inv.buyer_nip||"",
        street:s.seller_address||inv.buyer_address||"",
        postal:s.seller_postal||inv.buyer_postal||"", city:s.seller_city||inv.buyer_city||""
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

  // Oficjalny Kod QR I (KSeF) — obrazek generowany tylko gdy z zewnatrz przyjdzie
  // gotowy URL weryfikacji (buildKsefQrUrl w InvoiceDetailView, useEffect).
  // Poprzednia wersja generowala pseudo-QR z sklejonym tekstem (numer|NIP|brutto|KSeF) —
  // to nie jest oficjalny format MF, wiec skanery KSeF go nie weryfikowaly.
  // Gdy brak URLa (draft, zakupowa, EKO, proforma, nie wyslana) — QR znika calkowicie.
  var qrUrl=null;
  if(ksefQrUrl){
    qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data="+encodeURIComponent(ksefQrUrl);
  }

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
    +".notes-box{margin-top:6mm;padding:10px 12px;background:#f7f7f7;border:1px solid #ddd;border-radius:4px;font-size:11px;color:#222;}"
    +".notes-box .notes-head{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin-bottom:4px;}"
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
    +(selBank?"<div style='text-align:right'>Numer konta: "+selBank+"</div>"
      :(previewMode?"<div style='text-align:right;color:#c0392b'>\u26A0\uFE0F Brak numeru konta w Ustawieniach</div>":"<div></div>"))
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
    +(qrUrl
      ? "<div class='qr-box'><img src='"+qrUrl+"' alt='Kod QR faktury KSeF'><div class='qr-label'>Weryfikacja KSeF</div>"
        +(inv.ksef_number?"<div class='qr-label' style='margin-top:1px'>"+String(inv.ksef_number)+"</div>":"")
        +"</div>"
      : "<div></div>")
    +"<table>"
    +"<tr><td>\u0141\u0105cznie:</td><td>"+fmtM(gross)+" PLN</td></tr>"
    +"<tr class='grand'><td>Do zap\u0142aty:</td><td>"+fmtM(remaining)+" PLN</td></tr>"
    +"</table></div>"
    +"<div class='slownie'><strong>S\u0142ownie:</strong> "+numberToWordsPL(gross)+"</div>"
    +(inv.notes?"<div class='notes-box'><div class='notes-head'>Uwagi</div>"+String(inv.notes)+"</div>"
      :(previewMode?"<div class='notes-box'><div class='notes-head'>Uwagi</div><span style='color:#999'>\u2014 brak uwag \u2014</span></div>":""))
    +(inv.kasowa===true||inv.kasowa==="true"?"<div class='kasowa'>Metoda Kasowa</div>":"")
    +"</body></html>";
}

// \u2500\u2500 EKRAN PO\u015aNIEDNI: AKCJE PO WYSTAWIENIU FAKTURY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function InvoiceDetailView(p){
  var [ksefBusy,setKsefBusy]=useState(false);
  var [ksefMsg,setKsefMsg]=useState(null);
  var [ksefErr,setKsefErr]=useState(null);
  var [mailBusy,setMailBusy]=useState(false);
  var [mailMsg,setMailMsg]=useState(null);
  var [mailErr,setMailErr]=useState(null);
  var [mailModalOpen,setMailModalOpen]=useState(false);
  var [mailSubject,setMailSubject]=useState("");
  var [mailBodyText,setMailBodyText]=useState("");
  var [currentInv,setCurrentInv]=useState(p.invoice||{});
  // Oficjalny URL weryfikacji KSeF (Kod QR I). Liczony async z SHA-256 XML-a przy zmianie
  // faktury/statusu. Gdy faktura sie nie kwalifikuje (nie confirmed, brak xml, zakupowa/EKO/proforma)
  // helper zwraca null i QR znika z widoku i PDF-a.
  var [ksefQrUrl,setKsefQrUrl]=useState(null);
  useEffect(function(){
    var cancelled=false;
    buildKsefQrUrl(currentInv,p.settings||{}).then(function(url){
      if(!cancelled) setKsefQrUrl(url);
    });
    return function(){ cancelled=true; };
  },[currentInv.id,currentInv.ksef_status,currentInv.ksef_number,currentInv.ksef_invoice_hash,currentInv.doc_type,currentInv.issue_date]);

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
    ksefApi.openSession(currentInv.entity_id).then(function(sess){
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
    var html=buildInvoicePDFHtml(currentInv,p.settings||{},ksefQrUrl);
    var w=window.open("","_blank");
    if(!w){alert("Zablokowano popup. Zezw\u00f3l na wyskakuj\u0105ce okna.");return;}
    w.document.write(html);
    w.document.close();
    setTimeout(function(){w.print();},600);
  }

  // Otwiera okno z podglądem/edycją treści maila przed wysyłką.
  function openMailModal(){
    if(!currentInv.buyer_email) return;
    setMailErr(null); setMailMsg(null);
    setMailSubject("Faktura "+(currentInv.number||""));
    setMailBodyText("Dzie\u0144 dobry,\n\nW za\u0142\u0105czeniu przesy\u0142am faktur\u0119 nr "
      +(currentInv.number||"")+" na kwot\u0119 "+fmtMoney(currentInv.total_gross)
      +".\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design");
    setMailModalOpen(true);
  }

  // Wysyła fakturę mailem bezpośrednio z aplikacji, przez podłączoną skrzynkę Outlook (Microsoft Graph).
  // Wymaga wcześniejszego zalogowania w zakładce Poczta — tu tylko odświeżamy token w tle (silent).
  function sendInvoiceEmail(){
    if(!currentInv.buyer_email) return;
    setMailBusy(true); setMailErr(null); setMailMsg(null);
    msalGetActiveAccount().then(function(acc){
      if(!acc){
        var e=new Error("Zaloguj si\u0119 do poczty (zak\u0142adka Poczta), a potem spr\u00f3buj ponownie.");
        e.code="MS_NO_ACCOUNT"; throw e;
      }
      return msalGetToken();
    }).then(function(token){
      var html=buildInvoicePDFHtml(currentInv,p.settings||{},ksefQrUrl);
      var b64=btoa(unescape(encodeURIComponent(html)));
      var fileName="Faktura-"+(currentInv.number||"dokument").replace(/[^\w-]+/g,"_")+".html";
      var message={
        subject:mailSubject||("Faktura "+(currentInv.number||"")),
        body:{contentType:"Text",content:mailBodyText||""},
        toRecipients:[{emailAddress:{address:currentInv.buyer_email}}],
        attachments:[{
          "@odata.type":"#microsoft.graph.fileAttachment",
          name:fileName,
          contentType:"text/html",
          contentBytes:b64
        }]
      };
      return fetch("https://graph.microsoft.com/v1.0/me/sendMail",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({message:message,saveToSentItems:true})
      });
    }).then(function(r){
      if(!r.ok){
        return r.json().catch(function(){return{};}).then(function(e){
          throw new Error(e.error&&e.error.message?e.error.message:"B\u0142\u0105d wysy\u0142ki ("+r.status+")");
        });
      }
      setMailModalOpen(false);
      setMailMsg("\u2705 Faktura wys\u0142ana na "+currentInv.buyer_email);
    }).catch(function(e){
      if(e&&e.code==="MS_NO_ACCOUNT") setMailErr(e.message);
      else if(e&&e.code==="MS_INTERACTION_REQUIRED") setMailErr("Sesja poczty wygas\u0142a \u2014 zaloguj si\u0119 ponownie w zak\u0142adce Poczta.");
      else setMailErr(e.message||"Nieznany b\u0142\u0105d wysy\u0142ki");
    }).finally(function(){ setMailBusy(false); });
  }

  function sendToKsef(){
    setKsefBusy(true); setKsefErr(null); setKsefMsg(null);
    ksefApi.openSession(currentInv.entity_id)
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
  var ksefStatusColor=ksefOk?"var(--gr)":ksefSent?"var(--amber)":ksefError?"var(--red)":"var(--t3)";

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
    ce("div",{style:{background:"var(--grl)",border:"1px solid var(--gr)",borderRadius:12,
        padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12}},
        ce("span",{style:{fontSize:24}},"\u2705"),
        ce("div",null,
          ce("div",{style:{fontSize:14,fontWeight:700,color:"var(--gr)"}},"Faktura wystawiona"),
          ce("div",{style:{fontSize:12,color:"var(--grd)",marginTop:2}},
            "Pobierz PDF i wy\u015blij klientowi, nast\u0119pnie wy\u015blij do KSeF.")
        )
      ),
    // Podgl\u0105d faktury \u2014 renderowany od razu, bez potrzeby pobierania PDF.
    // Link do oficjalnego widoku w KSeF zosta\u0142 wycofany \u2014 dop\u00f3ki nie naprawimy
    // niezgodno\u015bci hasha w kodzie QR, portal MF i tak zg\u0142asza "nie znaleziono",
    // wi\u0119c tylko wprowadza\u0142 w b\u0142\u0105d. Trzeci parametr (true) w\u0142\u0105cza tryb podgl\u0105du:
    // puste pola (numer konta, uwagi) pokazuj\u0105 wyra\u017any placeholder zamiast znika\u0107 bez
    // \u015bladu \u2014 tylko tutaj, w PDF-ie wysy\u0142anym do klienta puste pola nadal si\u0119 chowaj\u0105.
    ce("div",{style:Object.assign({},card,{marginBottom:16,padding:0,overflow:"hidden"})},
      ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",
        textTransform:"uppercase",padding:"14px 18px 0"}},"Podgl\u0105d"),
      ce("iframe",{
        title:"Podgl\u0105d faktury",
        srcDoc:buildInvoicePDFHtml(currentInv,p.settings||{},ksefQrUrl,true),
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
            background:"var(--violet)",color:"var(--bg)",cursor:"pointer",fontSize:13,fontWeight:600}},
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
          "\uD83D\uDCE7 Otw\u00f3rz w poczcie"),
        currentInv.buyer_email&&ce("button",{
          onClick:openMailModal,
          disabled:mailBusy,
          style:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            padding:"14px 18px",borderRadius:10,border:"1px solid var(--violet)",
            background:mailBusy?"var(--bg2)":"var(--bg)",color:"var(--violet)",
            cursor:mailBusy?"not-allowed":"pointer",fontSize:13,fontWeight:600}},
          mailBusy?"\u23F3 Wysy\u0142am...":"\uD83D\uDCE4 Wy\u015blij mailem")
      ),
      mailMsg&&ce("div",{style:{marginBottom:10,padding:"8px 12px",background:"var(--grl)",
        borderRadius:8,fontSize:12,color:"var(--gr)"}},mailMsg),
      mailErr&&ce("div",{style:{marginBottom:10,padding:"8px 12px",background:"var(--red-l)",
        borderRadius:8,fontSize:12,color:"var(--red)"}},"\u26A0\uFE0F "+mailErr),
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
            :{border:"none",background:"var(--violet)",color:"var(--bg)",cursor:"pointer"},
            {borderRadius:9,padding:"10px 20px",fontSize:13,fontWeight:600})},
          ksefBusy?"\u23F3 Wysy\u0142am...":ksefSent?"\u23F3 W kolejce...":"\uD83D\uDCE4 Wy\u015blij do KSeF"),
        ksefSent&&ce("button",{onClick:refreshKsefStatus,disabled:ksefBusy,
          style:{marginTop:6,padding:"7px 14px",borderRadius:8,border:"1px solid var(--bd2)",
            background:"var(--bg)",color:"var(--t2)",cursor:"pointer",fontSize:12,fontWeight:500}},
          "\uD83D\uDD04 Sprawdź status KSeF")
      ),
      ksefMsg&&ce("div",{style:{marginTop:10,padding:"8px 12px",background:"var(--grl)",
        borderRadius:8,fontSize:12,color:"var(--gr)"}},ksefMsg),
      ksefErr&&ce("div",{style:{marginTop:10,padding:"8px 12px",background:"var(--red-l)",
        borderRadius:8,fontSize:12,color:"var(--red)"}},"\u26A0\uFE0F "+ksefErr)
    ),
    // Modal: podgląd / edycja treści maila przed wysyłką faktury
    mailModalOpen&&ce("div",{
      onClick:function(){ if(!mailBusy) setMailModalOpen(false); },
      style:{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:200,
        background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}
    },
      ce("div",{
        onClick:function(e){ e.stopPropagation(); },
        style:{background:"var(--bg)",borderRadius:16,padding:22,width:"100%",maxWidth:520,
          maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}
      },
        ce("div",{style:{fontSize:16,fontWeight:800,color:"var(--t1)",marginBottom:4}},
          "\uD83D\uDCE4 Wy\u015blij faktur\u0119 mailem"),
        ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:16}},
          "Do: "+currentInv.buyer_email),
        ce("label",{style:label},"Temat"),
        ce("input",{value:mailSubject,onChange:function(e){setMailSubject(e.target.value);},
          style:Object.assign({},inp,{marginBottom:14})}),
        ce("label",{style:label},"Tre\u015b\u0107"),
        ce("textarea",{value:mailBodyText,onChange:function(e){setMailBodyText(e.target.value);},
          style:Object.assign({},inp,{minHeight:160,resize:"vertical",marginBottom:6})}),
        ce("div",{style:{fontSize:11,color:"var(--t3)",marginBottom:16}},
          "Za\u0142\u0105cznik: podgl\u0105d faktury (HTML \u2014 odbiorca zapisze jako PDF przez Ctrl+P)."),
        mailErr&&ce("div",{style:{marginBottom:14,padding:"8px 12px",background:"var(--red-l)",
          borderRadius:8,fontSize:12,color:"var(--red)"}},"\u26A0\uFE0F "+mailErr),
        ce("div",{style:{display:"flex",gap:10,justifyContent:"flex-end"}},
          ce("button",{onClick:function(){setMailModalOpen(false);},disabled:mailBusy,
            style:btnSecondary},"Anuluj"),
          ce("button",{onClick:sendInvoiceEmail,disabled:mailBusy||!mailSubject.trim(),
            style:Object.assign({},btnPrimary,mailBusy?{opacity:0.6,cursor:"not-allowed"}:{})},
            mailBusy?"\u23F3 Wysy\u0142am...":"\uD83D\uDCE4 Wy\u015blij")
        )
      )
    )
  );
}

export function ScreenInvoices(p){
  var [view,setView]=useState("list");       // list | editor | settings
  var [invoices,setInvoices]=useState([]);
  var [settings,setSettings]=useState(null);
  var [entities,setEntities]=useState([]);   // multi-podmiot
  var [activeEntityId,setActiveEntityId]=useState(function(){
    try{ return localStorage.getItem("pd_active_entity")||"all"; }catch(e){ return "all"; }
  });
  function changeEntity(id){
    setActiveEntityId(id);
    try{ localStorage.setItem("pd_active_entity",id); }catch(e){}
  }
  var [editInv,setEditInv]=useState(null);   // null = now
  var [detailInv,setDetailInv]=useState(null); // faktura po zapisaniu
  var [clientsAll,setClientsAll]=useState([]);
  var [dealsAll,setDealsAll]=useState([]);
  var [loading,setLoading]=useState(true);
  var [err,setErr]=useState(null);
  var [viewBusyId,setViewBusyId]=useState(null);

  function invoiceNavigate(nextView){
    setView(nextView);
    try { window.history.pushState({pdInvoices:true,view:nextView}, "", window.location.href); } catch(e) {}
  }
  useEffect(function(){
    function onPop(ev){
      if(!ev.state||!ev.state.pdInvoices){ setView("list"); return; }
      setView(ev.state.view||"list");
    }
    window.addEventListener("popstate",onPop);
    return function(){window.removeEventListener("popstate",onPop);};
  },[]);

  // Ładuj faktury i ustawienia
  useEffect(function(){
    Promise.all([sbApi.getInvoices(), sbApi.getInvoiceSettings(), sbApi.getClients(), sbApi.getDeals(), sbApi.getEntities()])
      .then(function(results){
        setInvoices(results[0]||[]);
        setSettings(results[1]||{});
        setClientsAll(results[2]||[]);
        setDealsAll(results[3]||[]);
        setEntities(results[4]||[]);
        setLoading(false);
      })
      .catch(function(e){
        setErr(e.message||"Błąd ładowania");
        setLoading(false);
      });
  },[]);

  // Podmiot aktywny: przy "all" nowa faktura uzywa podmiotu domyslnego.
  var defaultEntity=entities.filter(function(e){return e.is_default;})[0]||entities[0]||null;
  var activeEntity=(activeEntityId==="all")
    ? defaultEntity
    : (entities.filter(function(e){return e.id===activeEntityId;})[0]||defaultEntity);
  function reloadEntities(){
    return sbApi.getEntities().then(function(rows){ setEntities(rows||[]); return rows||[]; });
  }

  function openNew(dir){
    // Jeśli brak danych sprzedawcy w aktywnym podmiocie — wymuś najpierw konfigurację
    var sellerReady=(activeEntity&&activeEntity.name)||(settings&&settings.seller_name);
    if(!sellerReady){
      invoiceNavigate("settings");
      return;
    }
    // dir przychodzi z aktywnej zakładki listy (Przychody/Wydatki) — dzięki temu
    // "+ Nowy wydatek" od razu otwiera edytor z direction="zakup", zamiast zawsze
    // domyślnego "sprzedaz" wewnątrz InvoiceEditor.
    setEditInv(dir==="zakup"?{direction:"zakup"}:null);
    invoiceNavigate("editor");
  }
  // Pobiera pełny rekord (z invoice_items) przed otwarciem edytora — wiersz z listy
  // (sbApi.getInvoices()) NIE zawiera pozycji, więc bez tego edytor startowałby z pustą
  // listą pozycji i zapis zastąpiłby prawdziwe pozycje jedną pustą (zerując sumy faktury).
  function openEdit(inv){
    setViewBusyId(inv.id);
    sbApi.getInvoice(inv.id)
      .then(function(full){
        setEditInv(full||inv);
        invoiceNavigate("editor");
      })
      .catch(function(e){ alert("B\u0142\u0105d wczytywania faktury do edycji: "+(e.message||e)); })
      .finally(function(){ setViewBusyId(null); });
  }
  function openSettings(){ invoiceNavigate("settings"); }

  function onSaved(result){
    sbApi.getInvoices().then(function(data){ setInvoices(data||[]); });
    sbApi.getInvoice(result.id).then(function(full){
      setDetailInv(full||result); invoiceNavigate("detail");
    }).catch(function(){ setDetailInv(result); invoiceNavigate("detail"); });
  }
  function onSettingsSaved(newSettings){
    setSettings(newSettings);
    invoiceNavigate("list");
  }
  function onDelete(inv){
    var id=(inv&&typeof inv==="object")?inv.id:inv; // zgodność wsteczna, gdyby ktoś wywołał z samym id
    // Cofnięcie numeru do licznika jest bezpieczne WYŁĄCZNIE gdy:
    //  1) faktura nigdy nie trafiła do KSeF (numer nie "wyszedł" na zewnątrz),
    //  2) numer faktycznie pochodzi z naszego licznika — nie dotyczy zwykłych faktur
    //     zakupowych, tam numer nadaje dostawca (patrz isRealPurchaseDoc w save()),
    //  3) to najświeżej wystawiona faktura w swojej grupie licznika
    //     (entity_id, doc_type, period) — inaczej cofnięcie mogłoby przydzielić
    //     ten sam numer dwóm różnym fakturom, gdyby usunięto starszą z grupy.
    var reclaim=null;
    if(inv&&typeof inv==="object"&&!inv.ksef_number&&inv.doc_type&&inv.entity_id
       &&!(inv.direction==="zakup"&&inv.doc_type!=="proforma"&&inv.doc_type!=="eko")){
      var ent2=entities.filter(function(e){return e.id===inv.entity_id;})[0];
      var reset2=ent2?ent2.numbering_reset:"monthly";
      var period2=periodKey(reset2,inv.issue_date||inv.created_at);
      var isNewest=!invoices.some(function(x){
        return x.id!==inv.id&&x.entity_id===inv.entity_id&&x.doc_type===inv.doc_type
          &&periodKey(reset2,x.issue_date||x.created_at)===period2
          &&(x.created_at||"")>(inv.created_at||"");
      });
      if(isNewest) reclaim={docType:inv.doc_type,period:period2,entityId:inv.entity_id};
    }
    sbApi.deleteInvoice(id)
      .then(function(){
        setInvoices(function(prev){return prev.filter(function(i){return i.id!==id;});});
        if(reclaim) sbApi.decrementInvoiceCounter(reclaim.docType,reclaim.period,reclaim.entityId).catch(function(){});
      })
      .catch(function(e){ alert("B\u0142\u0105d usuwania: "+e.message); });
  }
  // Duplikuj fakturę: pobiera pełny rekord (z pozycjami), zdejmuje id/numer/status/daty/
  // dane KSeF i otwiera edytor tak jak dla nowej faktury — InvoiceEditor rozpozna brak
  // id jako isNew i przy zapisie nada świeży numer oraz dzisiejsze daty (issue/sale/due),
  // a resztę (nabywca, pozycje, forma płatności) przepisze 1:1 z oryginału.
  function onDuplicate(inv){
    setViewBusyId(inv.id);
    sbApi.getInvoice(inv.id)
      .then(function(full){
        var src=full||inv;
        var itemsCopy=(src.invoice_items||[]).map(function(it){
          return {
            position:it.position, name:it.name, quantity:it.quantity,
            unit:it.unit, unit_net:it.unit_net, vat_rate:it.vat_rate,
            line_net:it.line_net, line_vat:it.line_vat, line_gross:it.line_gross,
            pkwiu:it.pkwiu||""
          };
        });
        setEditInv({
          doc_type:src.doc_type, direction:invDirection(src), payment_method:src.payment_method, kasowa:src.kasowa,
          notes:src.notes, client_id:src.client_id, deal_id:src.deal_id,
          buyer_name:src.buyer_name, buyer_nip:src.buyer_nip,
          buyer_address:src.buyer_address, buyer_postal:src.buyer_postal,
          buyer_city:src.buyer_city, buyer_email:src.buyer_email,
          seller_snapshot:src.seller_snapshot, entity_id:src.entity_id,
          invoice_items:itemsCopy
        });
        invoiceNavigate("editor");
      })
      .catch(function(e){ alert("B\u0142\u0105d wczytywania faktury do duplikacji: "+(e.message||e)); })
      .finally(function(){ setViewBusyId(null); });
  }

  // Brak ustawień — banner informacyjny
  var settingsEmpty=!(activeEntity&&activeEntity.name)&&!(settings&&settings.seller_name);

  return ce("div",{style:{padding:"0 4px"}},

    loading&&ce("div",{style:{textAlign:"center",padding:"60px 0",color:"var(--t3)"}},"\u23F3 Ładowanie..."),
    err&&ce("div",{style:{background:"var(--red-l)",border:"1px solid var(--red-border)",borderRadius:10,padding:"14px",fontSize:13,color:"var(--red)",marginBottom:16}},"\u26A0\uFE0F "+err),

    // Lista pozostaje zamontowana także podczas podglądu/edycji. Dzięki temu
    // powrót do niej zachowuje zakładkę Wydatki, wyszukiwarkę, okres i wszystkie
    // zaznaczone filtry — dokładnie tak, jak w poprzednim ekranie.
    !loading&&ce("div",{style:{display:view==="list"?"block":"none"}},
      settingsEmpty&&ce("div",{style:{background:"var(--amber-l)",border:"1px solid var(--amber)",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"var(--amber)",display:"flex",alignItems:"center",gap:10}},
        ce("span",{style:{fontSize:18}},"\u26A0\uFE0F"),
        ce("span",null,"Uzupełnij dane sprzedawcy przed wystawieniem pierwszej faktury. "),
        ce("button",{onClick:openSettings,style:Object.assign({},btnSecondary,{fontSize:12,padding:"5px 10px",marginLeft:4})},"Ustawienia")
      ),
      ce(InvoiceList,{
        invoices:invoices, viewBusyId:viewBusyId,
        entities:entities, activeEntityId:activeEntityId, onEntityChange:changeEntity,
        onNew:openNew, onEdit:openEdit, onSettings:openSettings, onDelete:onDelete, onDuplicate:onDuplicate,
        onSynced:function(){ sbApi.getInvoices().then(function(data){ setInvoices(data||[]); }); },
        onChangePayStatus:function(inv,newStatus,newAmount){
          // Uogólniony handler zmiany statusu płatności — zasila menu "Zapłacono"
          // (Wystawiona/Opłacona/Częściowo opł./Odrzucona/Wysłana), zastępuje dawny
          // checkbox onTogglePaid. `paid` (bool) trzymamy zsynchronizowane z
          // payment_status="paid" dla wstecznej zgodności ze starym schematem.
          var amount=+(newAmount)||0;
          var isPaid=newStatus==="paid";
          var prevPatch={paid:inv.paid,paid_amount:inv.paid_amount||0,payment_status:inv.payment_status||"unpaid"};
          setInvoices(function(prev){return prev.map(function(x){return x.id===inv.id?Object.assign({},x,{paid:isPaid,paid_amount:amount,payment_status:newStatus}):x;});});
          sbApi.updateInvoice(inv.id,{paid:isPaid,paid_amount:amount,payment_status:newStatus}).catch(function(){
            setInvoices(function(prev){return prev.map(function(x){return x.id===inv.id?Object.assign({},x,prevPatch):x;});});
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
              invoiceNavigate("detail");
            })
            .catch(function(e){ alert("B\u0142\u0105d wczytywania faktury: "+(e.message||e)); })
            .finally(function(){ setViewBusyId(null); });
        }
      })
    ),

    !loading&&view==="detail"&&detailInv&&ce(InvoiceDetailView,{
      invoice:detailInv,
      settings:settings||{},
      onEdit:function(){ setEditInv(detailInv); invoiceNavigate("editor"); },
      onClose:function(){invoiceNavigate("list");}
    }),

    !loading&&view==="editor"&&ce(InvoiceEditor,{
      // Edycja/duplikat istniejacej faktury -> uzyj JEJ podmiotu; nowa -> aktywny podmiot.
      invoice:editInv, settings:settings||{},
      entity:((editInv&&editInv.entity_id)?(entities.filter(function(e){return e.id===editInv.entity_id;})[0]||activeEntity):activeEntity)||{},
      clients:clientsAll, deals:dealsAll,
      onSave:onSaved,
      onClose:function(){invoiceNavigate("list");}
    }),

    !loading&&view==="settings"&&ce(InvoiceSettings,{
      settings:settings||{},
      entities:entities, activeEntityId:activeEntityId,
      onEntitiesChange:reloadEntities,
      onSaved:onSettingsSaved,
      onClose:function(){invoiceNavigate("list");}
    })
  );
}
