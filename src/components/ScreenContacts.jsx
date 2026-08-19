import React, { useState, useEffect } from 'react';
import { sbApi } from '../lib/supabase.js';
const ce = React.createElement;

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtPLN(n){ return (Number(n)||0).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})+" zł"; }
function vatLabel(v){ return Number(v)===-1?"zw":(String(v)+"%"); }

var ROLE_LABELS = { klient:"Klient", dostawca:"Dostawca", oba:"Klient + dostawca" };
var ROLE_COLORS = {
  klient:   { bg:"var(--violet-l)", color:"var(--violet)" },
  dostawca: { bg:"rgba(5,150,105,0.12)", color:"#059669" },
  oba:      { bg:"rgba(217,119,6,0.12)", color:"#d97706" }
};

var inp = { fontSize:13, border:"1.5px solid var(--bd2)", borderRadius:9, background:"var(--bg)", color:"var(--t1)", padding:"9px 12px", width:"100%", boxSizing:"border-box", outline:"none" };
var lbl = { fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 };
var btn = function(extra){ return Object.assign({ border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }, extra); };

function field(label, node){
  return ce("div",{style:{marginBottom:12}},
    ce("div",{style:lbl},label), node);
}

// ── Modal dodaj/edytuj kontrahenta ───────────────────────────────────────────
function ModalContact(p){
  var isNew = !p.contact || !p.contact.id;
  var d = p.contact || {};
  var s;
  s=useState(d.kind||"firma");                    var kind=s[0], setKind=s[1];
  s=useState(d.role||"klient");                   var role=s[0], setRole=s[1];
  s=useState(d.name||"");                          var name=s[0], setName=s[1];
  s=useState(d.nip||"");                           var nip=s[0], setNip=s[1];
  s=useState(d.regon||"");                         var regon=s[0], setRegon=s[1];
  s=useState(d.street||"");                        var street=s[0], setStreet=s[1];
  s=useState(d.postal||"");                        var postal=s[0], setPostal=s[1];
  s=useState(d.city||"");                          var city=s[0], setCity=s[1];
  s=useState(d.email||"");                         var email=s[0], setEmail=s[1];
  s=useState(d.phone||"");                         var phone=s[0], setPhone=s[1];
  s=useState(d.bank||"");                          var bank=s[0], setBank=s[1];
  s=useState(d.default_vat!=null?String(d.default_vat):"23"); var dvat=s[0], setDvat=s[1];
  s=useState(d.default_payment_days!=null?String(d.default_payment_days):"14"); var ddays=s[0], setDdays=s[1];
  s=useState((d.tags||[]).join(", "));            var tags=s[0], setTags=s[1];
  s=useState(d.notes||"");                         var notes=s[0], setNotes=s[1];
  s=useState(false);                               var busy=s[0], setBusy=s[1];
  s=useState(null);                                var err=s[0], setErr=s[1];
  s=useState(false);                               var nipLoading=s[0], setNipLoading=s[1];

  function applyAddr(str){
    // "ul. X 1, 00-000 MIASTO" → street / postal / city
    var parts=(str||"").split(",").map(function(x){return x.trim();});
    if(parts.length>=2){
      setStreet(parts[0]);
      var rest=parts.slice(1).join(", ");
      var m=rest.match(/(\d{2}-\d{3})\s+(.+)/);
      if(m){ setPostal(m[1]); setCity(m[2]); } else { setCity(rest); }
    } else if(str){ setStreet(str); }
  }
  // NIP lookup: GUS (/api/gus) → fallback Biała Lista VAT
  function lookupNip(){
    var n=(nip||"").replace(/[\s\-]/g,"");
    if(n.length<10){ setErr("NIP musi mieć 10 cyfr"); return; }
    setNipLoading(true); setErr(null);
    fetch("/api/gus?nip="+n)
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,d:j};});})
      .then(function(res){
        var g=res.d||{};
        if(res.ok&&g.name){
          setName(g.name);
          if(g.street)setStreet(g.street);
          if(g.postal)setPostal(g.postal);
          if(g.city)setCity(g.city);
          setNipLoading(false); return;
        }
        lookupNipWL(n);
      })
      .catch(function(){ lookupNipWL(n); });
  }
  function lookupNipWL(n){
    fetch("https://wl-api.mf.gov.pl/api/search/nip/"+n+"?date="+todayISO())
      .then(function(r){return r.json();})
      .then(function(j){
        var sub=j&&j.result&&j.result.subject;
        if(!sub){ setErr("Nie znaleziono podmiotu dla NIP: "+n); return; }
        setName(sub.name||name);
        if(sub.regon)setRegon(sub.regon);
        applyAddr(sub.workingAddress||sub.residenceAddress||"");
        var accs=sub.accountNumbers||[];
        if(accs.length&&!bank)setBank(accs[0]);
      })
      .catch(function(){ setErr("Błąd połączenia z GUS i Białą Listą"); })
      .finally(function(){ setNipLoading(false); });
  }

  function save(){
    if(!name.trim()){ setErr("Podaj nazwę"); return; }
    setBusy(true); setErr(null);
    var payload={
      kind:kind, role:role, name:name.trim(),
      nip:(nip||"").trim(), regon:(regon||"").trim(),
      street:street.trim(), postal:postal.trim(), city:city.trim(),
      email:email.trim(), phone:phone.trim(), bank:bank.trim(),
      default_vat: dvat==="zw"?-1:(parseFloat(dvat)||0),
      default_payment_days: parseInt(ddays,10)||0,
      tags: tags.split(",").map(function(t){return t.trim();}).filter(Boolean),
      notes: notes.trim()
    };
    var prom=isNew?sbApi.addContact(payload):sbApi.updateContact(p.contact.id,payload);
    prom.then(function(){ p.onSave(); })
      .catch(function(e){ setErr((e&&e.message)||"Błąd zapisu"); setBusy(false); });
  }

  function seg(val,setter,opts){
    return ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
      opts.map(function(o){
        var active=val===o.id;
        return ce("button",{key:o.id,onClick:function(){setter(o.id);},
          style:btn({padding:"8px 14px",background:active?"var(--violet)":"var(--bg2)",color:active?"#fff":"var(--t2)",border:active?"none":"1.5px solid var(--bd2)"})}, o.label);
      }));
  }

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.38)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16},onClick:p.onClose},
    ce("div",{onClick:function(e){e.stopPropagation();},style:{background:"var(--bg)",borderRadius:18,padding:"24px 22px",width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.20)"}},
      ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}},
        ce("div",{style:{fontSize:16,fontWeight:700}}, isNew?"Nowy kontrahent":"Edytuj kontrahenta"),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",cursor:"pointer",fontSize:20,color:"var(--t3)"}},"\u00D7")
      ),
      err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#b91c1c",marginBottom:12}}, err),

      field("Typ", seg(kind,setKind,[{id:"firma",label:"Firma"},{id:"osoba",label:"Osoba prywatna"}])),
      field("Rola", seg(role,setRole,[{id:"klient",label:"Klient"},{id:"dostawca",label:"Dostawca"},{id:"oba",label:"Oba"}])),

      // NIP + lookup
      field("NIP",
        ce("div",{style:{display:"flex",gap:8}},
          ce("input",{value:nip,onChange:function(e){setNip(e.target.value);},placeholder:"0000000000",style:Object.assign({},inp,{flex:1}),
            onKeyDown:function(e){if(e.key==="Enter")lookupNip();}}),
          ce("button",{onClick:lookupNip,disabled:nipLoading,
            style:btn({padding:"9px 14px",whiteSpace:"nowrap",background:nipLoading?"var(--bd2)":"var(--violet)",color:"#fff"})},
            nipLoading?"Pobieram…":"Pobierz z GUS")
        )
      ),
      field("Nazwa", ce("input",{value:name,onChange:function(e){setName(e.target.value);},placeholder:kind==="osoba"?"Imię i nazwisko":"Nazwa firmy",style:inp})),
      field("REGON", ce("input",{value:regon,onChange:function(e){setRegon(e.target.value);},style:inp})),
      field("Ulica i numer", ce("input",{value:street,onChange:function(e){setStreet(e.target.value);},style:inp})),
      ce("div",{style:{display:"grid",gridTemplateColumns:"140px 1fr",gap:12}},
        field("Kod pocztowy", ce("input",{value:postal,onChange:function(e){setPostal(e.target.value);},placeholder:"00-000",style:inp})),
        field("Miasto", ce("input",{value:city,onChange:function(e){setCity(e.target.value);},style:inp}))
      ),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
        field("E-mail", ce("input",{value:email,onChange:function(e){setEmail(e.target.value);},style:inp})),
        field("Telefon", ce("input",{value:phone,onChange:function(e){setPhone(e.target.value);},style:inp}))
      ),
      field("Numer konta (IBAN)", ce("input",{value:bank,onChange:function(e){setBank(e.target.value);},style:inp})),
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
        field("Domyślny VAT",
          ce("select",{value:dvat,onChange:function(e){setDvat(e.target.value);},style:inp},
            ["23","8","5","0","zw"].map(function(v){return ce("option",{key:v,value:v},v==="zw"?"zw":v+"%");}))),
        field("Termin płatności (dni)", ce("input",{type:"number",value:ddays,onChange:function(e){setDdays(e.target.value);},style:inp}))
      ),
      field("Tagi (po przecinku)", ce("input",{value:tags,onChange:function(e){setTags(e.target.value);},placeholder:"np. VIP, hurt, montaż",style:inp})),
      field("Notatka", ce("textarea",{value:notes,onChange:function(e){setNotes(e.target.value);},rows:3,style:Object.assign({},inp,{resize:"vertical"})})),

      ce("div",{style:{display:"flex",gap:10,marginTop:8}},
        ce("button",{onClick:p.onClose,style:btn({flex:1,padding:"11px 0",background:"var(--bg2)",color:"var(--t2)",border:"1.5px solid var(--bd2)"})},"Anuluj"),
        ce("button",{onClick:save,disabled:busy,style:btn({flex:1,padding:"11px 0",background:busy?"var(--bd2)":"var(--violet)",color:"#fff"})}, busy?"Zapisuję…":"Zapisz")
      )
    )
  );
}

// ── Karta kontrahenta (dane + historia wycen/faktur + saldo) ─────────────────
function ContactDetail(p){
  var c=p.contact;
  var s;
  s=useState([]); var quotes=s[0], setQuotes=s[1];
  s=useState([]); var invoices=s[0], setInvoices=s[1];
  s=useState(true); var loading=s[0], setLoading=s[1];

  useEffect(function(){
    setLoading(true);
    Promise.all([
      sbApi.getContactQuotes(c.id).catch(function(){return [];}),
      sbApi.getContactInvoices(c.id).catch(function(){return [];})
    ]).then(function(res){
      setQuotes(res[0]||[]); setInvoices(res[1]||[]); setLoading(false);
    });
  },[c.id]);

  // Obrót = suma brutto faktur sprzedażowych; Saldo = suma brutto niezapłaconych sprzedażowych
  var sales=invoices.filter(function(i){ return (i.direction||"sprzedaz")!=="zakup"; });
  var turnover=sales.reduce(function(a,i){return a+(Number(i.total_gross)||0);},0);
  var saldo=sales.filter(function(i){return i.payment_status!=="paid";})
    .reduce(function(a,i){return a+((Number(i.total_gross)||0)-(Number(i.paid_amount)||0));},0);

  var rc=ROLE_COLORS[c.role]||ROLE_COLORS.klient;

  function row(label,val){ return val?ce("div",{style:{display:"flex",gap:8,fontSize:13,marginBottom:4}},
    ce("span",{style:{color:"var(--t3)",minWidth:110}},label), ce("span",{style:{color:"var(--t1)"}},val)):null; }

  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.38)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16},onClick:p.onClose},
    ce("div",{onClick:function(e){e.stopPropagation();},style:{background:"var(--bg)",borderRadius:18,padding:"24px 22px",width:"100%",maxWidth:640,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.20)"}},
      ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}},
        ce("div",null,
          ce("div",{style:{fontSize:18,fontWeight:800,marginBottom:4}}, c.name||"—"),
          ce("span",{style:{display:"inline-block",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:20,background:rc.bg,color:rc.color}}, ROLE_LABELS[c.role]||c.role)
        ),
        ce("button",{onClick:p.onClose,style:{border:"none",background:"none",cursor:"pointer",fontSize:20,color:"var(--t3)"}},"\u00D7")
      ),

      // Dane
      ce("div",{style:{background:"var(--bg2)",borderRadius:12,padding:"14px 16px",marginBottom:14}},
        row("NIP", c.nip),
        row("REGON", c.regon),
        row("Adres", [c.street, [c.postal,c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")),
        row("E-mail", c.email),
        row("Telefon", c.phone),
        row("Konto", c.bank),
        row("Domyślny VAT", vatLabel(c.default_vat)),
        row("Termin płatności", (c.default_payment_days||0)+" dni"),
        (c.tags&&c.tags.length)?row("Tagi", c.tags.join(", ")):null,
        c.notes?row("Notatka", c.notes):null
      ),

      // Sumy
      ce("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}},
        ce("div",{style:{background:"var(--violet-l)",borderRadius:12,padding:"12px 14px"}},
          ce("div",{style:{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}},"Obrót (faktury sprzedaż)"),
          ce("div",{style:{fontSize:18,fontWeight:800,color:"var(--violet)",marginTop:3}}, fmtPLN(turnover))),
        ce("div",{style:{background:saldo>0?"rgba(220,38,38,0.10)":"rgba(5,150,105,0.10)",borderRadius:12,padding:"12px 14px"}},
          ce("div",{style:{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}},"Do zapłaty (saldo)"),
          ce("div",{style:{fontSize:18,fontWeight:800,color:saldo>0?"#dc2626":"#059669",marginTop:3}}, fmtPLN(saldo)))
      ),

      loading?ce("div",{style:{fontSize:13,color:"var(--t3)",padding:"8px 0"}},"Ładuję historię…"):
      ce("div",null,
        ce("div",{style:Object.assign({},lbl,{marginTop:4})}, "Wyceny ("+quotes.length+")"),
        quotes.length?ce("div",{style:{marginBottom:14}}, quotes.slice(0,15).map(function(q){
          return ce("div",{key:q.id,style:{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderBottom:"1px solid var(--bd2)"}},
            ce("span",null,q.name||"Wycena #"+q.id),
            ce("span",{style:{color:"var(--t3)"}}, (q.status||"")+(q.created_at?" · "+String(q.created_at).slice(0,10):"")));
        })):ce("div",{style:{fontSize:12,color:"var(--t3)",marginBottom:14}},"Brak powiązanych wycen."),

        ce("div",{style:lbl}, "Faktury ("+invoices.length+")"),
        invoices.length?ce("div",null, invoices.slice(0,20).map(function(i){
          var paid=i.payment_status==="paid";
          return ce("div",{key:i.id,style:{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderBottom:"1px solid var(--bd2)"}},
            ce("span",null, (i.number||"(bez numeru)")+" · "+(i.issue_date||"")),
            ce("span",{style:{color:paid?"#059669":"var(--t1)",fontWeight:600}}, fmtPLN(i.total_gross)+(paid?" ✓":"")));
        })):ce("div",{style:{fontSize:12,color:"var(--t3)"}},"Brak powiązanych faktur.")
      ),

      ce("div",{style:{display:"flex",gap:10,marginTop:18}},
        ce("button",{onClick:function(){p.onEdit(c);},style:btn({flex:1,padding:"11px 0",background:"var(--violet)",color:"#fff"})},"Edytuj"),
        ce("button",{onClick:function(){p.onDelete(c);},style:btn({padding:"11px 18px",background:"rgba(220,38,38,0.10)",color:"#dc2626",border:"1.5px solid rgba(220,38,38,0.3)"})},"Usuń")
      )
    )
  );
}

// ── Ekran KONTRAHENCI ────────────────────────────────────────────────────────
export function ScreenContacts(p){
  var s;
  s=useState([]);    var contacts=s[0], setContacts=s[1];
  s=useState(true);  var loading=s[0], setLoading=s[1];
  s=useState(null);  var err=s[0], setErr=s[1];
  s=useState("");    var search=s[0], setSearch=s[1];
  s=useState("all"); var roleFilter=s[0], setRoleFilter=s[1];
  s=useState(null);  var tagFilter=s[0], setTagFilter=s[1];
  s=useState(null);  var editing=s[0], setEditing=s[1];   // contact | {} (new) | null
  s=useState(null);  var detail=s[0], setDetail=s[1];     // contact | null
  s=useState(null);  var confirmDel=s[0], setConfirmDel=s[1];

  function load(){
    setLoading(true);
    sbApi.getContacts()
      .then(function(rows){ setContacts(rows||[]); setLoading(false); })
      .catch(function(e){ setErr((e&&e.message)||"Błąd ładowania"); setLoading(false); });
  }
  useEffect(load,[]);

  var allTags=[];
  contacts.forEach(function(c){ (c.tags||[]).forEach(function(t){ if(allTags.indexOf(t)===-1)allTags.push(t); }); });

  var q=search.trim().toLowerCase();
  var filtered=contacts.filter(function(c){
    if(roleFilter!=="all"){
      if(roleFilter==="klient"&&!(c.role==="klient"||c.role==="oba"))return false;
      if(roleFilter==="dostawca"&&!(c.role==="dostawca"||c.role==="oba"))return false;
    }
    if(tagFilter&&(c.tags||[]).indexOf(tagFilter)===-1)return false;
    if(!q)return true;
    return (c.name||"").toLowerCase().includes(q)
      || (c.nip||"").includes(q)
      || (c.phone||"").includes(q)
      || (c.email||"").toLowerCase().includes(q)
      || (c.city||"").toLowerCase().includes(q);
  });

  function afterSave(){ setEditing(null); load(); }
  function doDelete(c){
    sbApi.deleteContact(c.id).then(function(){ setConfirmDel(null); setDetail(null); load(); })
      .catch(function(e){ setErr((e&&e.message)||"Błąd usuwania"); });
  }

  function chip(label,active,onClick,color){
    return ce("button",{key:label,onClick:onClick,
      style:btn({padding:"6px 13px",fontSize:12,background:active?(color||"var(--violet)"):"var(--bg2)",color:active?"#fff":"var(--t2)",border:active?"none":"1.5px solid var(--bd2)"})}, label);
  }

  return ce("div",{style:{maxWidth:1000,margin:"0 auto"}},
    // Header
    ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}},
      ce("div",null,
        ce("div",{style:{fontSize:20,fontWeight:800}},"Kontrahenci"),
        ce("div",{style:{fontSize:12,color:"var(--t3)",marginTop:2}}, contacts.length+" w bazie")),
      ce("button",{onClick:function(){setEditing({});},style:btn({padding:"10px 18px",background:"var(--violet)",color:"#fff"})},"+ Nowy kontrahent")
    ),

    err&&ce("div",{style:{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#b91c1c",marginBottom:12}}, err),

    // Wyszukiwarka + filtry
    ce("input",{value:search,onChange:function(e){setSearch(e.target.value);},placeholder:"Szukaj: nazwa, NIP, telefon, e-mail, miasto…",style:Object.assign({},inp,{marginBottom:10})}),
    ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:allTags.length?8:16}},
      chip("Wszyscy",roleFilter==="all",function(){setRoleFilter("all");}),
      chip("Klienci",roleFilter==="klient",function(){setRoleFilter("klient");}),
      chip("Dostawcy",roleFilter==="dostawca",function(){setRoleFilter("dostawca");},"#059669")
    ),
    allTags.length?ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}},
      chip("Wszystkie tagi",!tagFilter,function(){setTagFilter(null);}),
      allTags.map(function(t){ return chip("#"+t,tagFilter===t,function(){setTagFilter(tagFilter===t?null:t);}); })
    ):null,

    // Lista
    loading?ce("div",{style:{fontSize:14,color:"var(--t3)",padding:"30px 0",textAlign:"center"}},"Ładuję…"):
    filtered.length===0?ce("div",{style:{fontSize:14,color:"var(--t3)",padding:"40px 0",textAlign:"center"}},
      contacts.length===0?"Brak kontrahentów. Dodaj pierwszego przyciskiem „+ Nowy kontrahent”.":"Brak wyników dla podanych filtrów."):
    ce("div",{style:{display:"grid",gap:8}},
      filtered.map(function(c){
        var rc=ROLE_COLORS[c.role]||ROLE_COLORS.klient;
        var addr=[c.postal,c.city].filter(Boolean).join(" ");
        return ce("div",{key:c.id,onClick:function(){setDetail(c);},
          style:{background:"var(--bg)",border:"1.5px solid var(--bd2)",borderRadius:12,padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}},
          ce("div",{style:{minWidth:0,flex:1}},
            ce("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}},
              ce("span",{style:{fontSize:15,fontWeight:700,color:"var(--t1)"}}, c.name||"—"),
              ce("span",{style:{fontSize:10,fontWeight:700,padding:"1px 8px",borderRadius:20,background:rc.bg,color:rc.color}}, ROLE_LABELS[c.role]||c.role),
              (c.tags||[]).slice(0,3).map(function(t){return ce("span",{key:t,style:{fontSize:10,color:"var(--t3)",background:"var(--bg2)",padding:"1px 7px",borderRadius:20}},"#"+t);})
            ),
            ce("div",{style:{fontSize:12,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
              [c.nip?"NIP "+c.nip:null, c.phone||null, c.email||null, addr||null].filter(Boolean).join("  ·  ")||"—")
          ),
          ce("div",{style:{display:"flex",gap:6}},
            ce("button",{onClick:function(e){e.stopPropagation();setEditing(c);},style:btn({padding:"6px 10px",background:"var(--bg2)",color:"var(--t2)",border:"1.5px solid var(--bd2)",fontSize:12})},"Edytuj"),
            ce("button",{onClick:function(e){e.stopPropagation();setConfirmDel(c);},style:btn({padding:"6px 10px",background:"transparent",color:"#dc2626",fontSize:12})},"Usuń")
          )
        );
      })
    ),

    editing!==null&&ce(ModalContact,{contact:editing,onClose:function(){setEditing(null);},onSave:afterSave}),
    detail!==null&&ce(ContactDetail,{contact:detail,onClose:function(){setDetail(null);},
      onEdit:function(c){setDetail(null);setEditing(c);},
      onDelete:function(c){setConfirmDel(c);}}),
    confirmDel!==null&&ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.38)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16},onClick:function(){setConfirmDel(null);}},
      ce("div",{onClick:function(e){e.stopPropagation();},style:{background:"var(--bg)",borderRadius:16,padding:"22px 20px",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.20)"}},
        ce("div",{style:{fontSize:15,fontWeight:700,marginBottom:8}},"Usunąć kontrahenta?"),
        ce("div",{style:{fontSize:13,color:"var(--t3)",marginBottom:16}}, "„"+(confirmDel.name||"")+"” zostanie usunięty. Powiązane wyceny i faktury pozostaną (odłączone od kontrahenta)."),
        ce("div",{style:{display:"flex",gap:10}},
          ce("button",{onClick:function(){setConfirmDel(null);},style:btn({flex:1,padding:"10px 0",background:"var(--bg2)",color:"var(--t2)",border:"1.5px solid var(--bd2)"})},"Anuluj"),
          ce("button",{onClick:function(){doDelete(confirmDel);},style:btn({flex:1,padding:"10px 0",background:"#dc2626",color:"#fff"})},"Usuń")
        )
      )
    )
  );
}
