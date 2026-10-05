// src/lib/mailTemplates.js
// Szablony maili używane przez aplikację (faktury, wyceny, zamówienia) mają stały
// template_id w tabeli mail_templates, więc Paulina edytuje je w Poczta → Szablony.
// Tu leżą ich domyślne treści: używane, gdy wiersza nie ma w bazie (przed migracją 0057
// albo po jego skasowaniu), oraz przez przycisk „Przywróć treść domyślną".
import { sbApi } from './supabase.js';

function P(t){return "<div>"+t+"</div>";}
var SP="<div><br></div>";
function J(arr){return arr.filter(Boolean).join(SP);}

export var SYSTEM_TEMPLATES = {
  wycena_po_spotkaniu: {
    label:"Wycena po spotkaniu", icon:"📋",
    subject:"Oferta aranżacji okiennych",
    body:J([
      P("Dzień dobry,"),
      P("Bardzo dziękuję za niezwykle miłe spotkanie. Zgodnie z naszymi ustaleniami, w załączniku przesyłam ofertę oraz dokładne informacje dotyczące aranżacji okiennych."),
      P("Poniżej przesyłam kluczowe informacje organizacyjne:"),
      P("<b>Warunki płatności:</b> Rozpoczęcie zamówienia następuje po wpłacie zaliczki w wysokości 50% wartości zlecenia.")
        +P("<b>Czas realizacji:</b> Wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty."),
      P("Jeśli akceptują Państwo przedstawioną ofertę i przechodzimy do działania, bardzo proszę o potwierdzenie oraz przesłanie danych do wystawienia faktury na wspomnianą zaliczkę."),
      P("W razie jakichkolwiek pytań do załączonego projektu, pozostaję do dyspozycji.")
    ]),
    files:[]
  },
  wstepna: {
    label:"Wstępna wycena", icon:"📨",
    subject:"Wycena aranżacji okiennych",
    body:J([
      P("Dzień dobry,"),
      P("Dziękuję za przesłane zapytanie, w odpowiedzi przesyłam wstępną, orientacyjną wycenę oraz informacje odnośnie rodzajów szycia i rolet rzymskich w ofercie."),
      P("Podane ceny są cenami brutto, wyszczególniony jest również koszt montażu, obejmujący montaż osprzętu, powieszenie, wyprasowanie i ułożenie dekoracji."),
      P("Informacje organizacyjne:"),
      P("<b>Spotkanie:</b> W przypadku zainteresowania, umawiamy się na spotkanie u Państwa na dobór tkanin i wykonanie dokładnego pomiaru. Koszt spotkania wynosi 250 zł i jest odejmowany od całości zamówienia. Po spotkaniu przesyłam dokładną wycenę.")
        +P("<b>Warunki płatności:</b> Rozpoczęcie zamówienia następuje po wpłacie zaliczki w wysokości 50% wartości zlecenia.")
        +P("<b>Czas realizacji:</b> Wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty, od połowy października, ze względu na okres przedświąteczny, termin ten może wydłużyć się do ok. 6 tygodni."),
      P("W razie jakichkolwiek pytań, pozostaję do dyspozycji.")
    ]),
    // Pliki leżą w public/mail-att/; w bazie można je zastąpić załącznikami szablonu.
    files:[
      {name:"Zasłony-Firany_PD.pdf",url:"/mail-att/Zaslony-Firany_PD.pdf"},
      {name:"Rolety_rzymskie_PD.pdf",url:"/mail-att/Rolety_rzymskie_PD.pdf"}
    ]
  },
  faktura: {
    label:"Faktura", icon:"🧾",
    subject:"Faktura nr {numer} — {sprzedawca}",
    body:J([
      P("Dzień dobry,"),
      P("w załączeniu przesyłam fakturę nr <b>{numer}</b> na kwotę <b>{kwota}</b>{czesc}."),
      P("{terminZdanie}"),
      P("Dziękujemy za współpracę. W razie jakichkolwiek pytań pozostaję do dyspozycji."),
      P("Pozdrawiam serdecznie,<br>{podpis}")
    ]),
    files:[]
  },
  faktura_zaliczkowa: {
    label:"Faktura zaliczkowa i OWU", icon:"💶",
    subject:"Faktura zaliczkowa nr {numer} i Ogólne Warunki Umowy",
    body:J([
      P("Dzień dobry,"),
      P("w załączeniu przesyłam fakturę zaliczkową nr <b>{numer}</b> na kwotę <b>{kwota}</b> (50% wartości zamówienia) oraz Ogólne Warunki Umowy (OWU)."),
      P("<b>Rozpoczęcie zamówienia</b> następuje po wpłacie zaliczki w terminie wskazanym na fakturze. Zgodnie z OWU dokonanie zapłaty zadatku jest równoznaczne z zapoznaniem się z ich treścią i pełną akceptacją."),
      P("<b>Czas realizacji</b> wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty."),
      P("W razie jakichkolwiek pytań pozostaję do dyspozycji."),
      P("Pozdrawiam serdecznie,<br>{podpis}")
    ]),
    files:[]
  },
  zamowienie_osprzetu: {
    label:"Zamówienie osprzętu", icon:"🔩",
    subject:"Zamówienie osprzętu — {clientName}",
    body:J([
      P("Dzień dobry,"),
      P("W załączeniu przesyłam zamówienie osprzętu."),
      P("Proszę o potwierdzenie terminu dostawy.")
    ]),
    files:[]
  },
  zamowienie_tkaniny: {
    label:"Zamówienie tkaniny", icon:"🧵",
    subject:"Zamówienie tkaniny — {clientName}",
    body:J([
      P("Dzień dobry,"),
      P("W załączeniu przesyłam zamówienie tkaniny."),
      P("Proszę o potwierdzenie dostępności i terminu wysyłki.")
    ]),
    files:[]
  }
};

// Gdzie aplikacja używa szablonu (pokazywane w Poczta → Szablony) i jakie zmienne działają.
export var TEMPLATE_USAGE = {
  wycena_po_spotkaniu:{
    where:"Podsumowanie → Wyślij klientowi oraz Podgląd oferty → Wyślij mailem. W Poczcie oznaczony jako domyślny.",
    vars:"{clientName}, {honorific}, {total}, {zaliczka}"},
  wstepna:{
    where:"Wycena uproszczona → Wyślij mailem, razem z załączonymi plikami szablonu (domyślnie dwa PDF-y).",
    vars:"{clientName}, {honorific}, {total}, {zaliczka}"},
  faktura:{
    where:"Moduł Faktury → Wyślij fakturę oraz CRM, karta deala → wysyłka faktury dla klienta.",
    vars:"{numer}, {kwota}, {czesc}, {terminZdanie}, {sprzedawca}, {podpis}"},
  faktura_zaliczkowa:{
    where:"CRM, karta deala → wysyłka faktury zaliczkowej z OWU (OWU dołącza się automatycznie).",
    vars:"{numer}, {kwota}, {podpis}"},
  zamowienie_osprzetu:{
    where:"Podgląd zamówienia osprzętu → Wyślij mailem.",
    vars:"{clientName}"},
  zamowienie_tkaniny:{
    where:"Podgląd zamówienia tkaniny → Wyślij mailem do dostawcy.",
    vars:"{clientName}"},
  opinia:{
    where:"CRM, karta deala → Obsługa posprzedażowa → Prośba o opinię (✉ Wyślij).",
    vars:"{clientName}, {honorific}"},
  instrukcja_prania:{
    where:"CRM, karta deala → Obsługa posprzedażowa → Instrukcja prania (✉ Wyślij).",
    vars:"{clientName}, {honorific}"}
};

// Szablony wywoływane tylko przez aplikację: zawierają zmienne, które znają wyłącznie
// te przepływy, więc nie pokazujemy ich w liście zwykłej wiadomości w Poczcie.
export var HIDDEN_IN_COMPOSE = {
  faktura:1, faktura_zaliczkowa:1, zamowienie_osprzetu:1, zamowienie_tkaniny:1
};

// Podstawia {zmienne}. Nieznane zostają bez zmian, puste akapity (zmienna bez wartości) znikają.
export function fillVars(str, vars){
  var out=String(str==null?"":str);
  Object.keys(vars||{}).forEach(function(k){
    out=out.split("{"+k+"}").join(vars[k]==null?"":String(vars[k]));
  });
  return out;
}
export function dropEmptyParas(html){
  return String(html||"")
    .replace(/<(div|p)>\s*<\/\1>/gi,"\u0000")
    .replace(/<(div|p)><br\s*\/?><\/\1>\u0000/gi,"")
    .replace(/\u0000<(div|p)><br\s*\/?><\/\1>/gi,"")
    .replace(/\u0000/g,"");
}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
// Treść z bazy bywa zwykłym tekstem (stare szablony) albo HTML-em z edytora.
export function bodyToHtml(body){
  var b=String(body||"");
  if(/<[a-z][\s\S]*>/i.test(b))return b;
  return b.split(/\n\n+/).map(function(para){
    return "<div>"+esc(para).split("\n").join("<br>")+"</div>";
  }).join(SP);
}
// HTML → zwykły tekst (dla pól tekstowych, np. wysyłka faktury z modułu Faktury).
export function bodyToText(body){
  var s=bodyToHtml(body)
    .replace(/<(div|p)>\s*<br\s*\/?>\s*<\/\1>/gi,"\n")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(div|p)>/gi,"\n")
    .replace(/<[^>]+>/g,"")
    .replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
  return s.replace(/\n{3,}/g,"\n\n").trim();
}

// Szablon z bazy po template_id, a gdy go nie ma, domyślna treść z kodu.
// Zwraca {id,label,subject,body(html),files,fromDb} albo null, gdy nie ma żadnego z nich.
export function loadSystemTemplate(id){
  var def=SYSTEM_TEMPLATES[id]||null;
  function fallback(){
    return def?{id:id,label:def.label,subject:def.subject,body:def.body,files:def.files||[],fromDb:false}:null;
  }
  return sbApi.getMailTemplate(id).then(function(row){
    if(!row)return fallback();
    var files=(row.template_files&&row.template_files.length)?row.template_files:(def&&def.files)||[];
    return {id:id,label:row.label||(def&&def.label)||id,subject:row.subject||(def&&def.subject)||"",
      body:bodyToHtml(row.body||(def&&def.body)||""),files:files,fromDb:true};
  }).catch(function(){return fallback();});
}
