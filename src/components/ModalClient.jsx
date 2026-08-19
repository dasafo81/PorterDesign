import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';
import { generateFabricOrderPDF, generateClientEmail,


  generateSewingOrderPDF, generateSewingOrderPDFFromRows
} from '../lib/pdf.js';
const ce = React.createElement;

export function ModalClient(p){
  var ns=useState(""),name=ns[0],setName=ns[1];
  var as=useState(""),addr=as[0],setAddr=as[1];
  var pcs=useState(""),postal=pcs[0],setPostal=pcs[1];
  var cts=useState(""),city=cts[0],setCity=cts[1];
  var ps=useState(""),phone=ps[0],setPhone=ps[1];
  var es=useState(""),email=es[0],setEmail=es[1];
  // Powiązanie z bazą kontrahentów (Faza 2)
  var cos=useState([]),contacts=cos[0],setContacts=cos[1];
  var cis=useState(null),contactId=cis[0],setContactId=cis[1];
  var css=useState(""),cSearch=css[0],setCSearch=css[1];
  var cds=useState(false),cDrop=cds[0],setCDrop=cds[1];
  var sns=useState(true),saveAsNew=sns[0],setSaveAsNew=sns[1];
  var bs=useState(false),busy=bs[0],setBusy=bs[1];

  useEffect(function(){
    sbApi.getContacts().then(function(rows){setContacts(rows||[]);}).catch(function(){});
  },[]);

  var filtered=cSearch.trim()
    ? contacts.filter(function(c){
        var q=cSearch.toLowerCase();
        return (c.name||"").toLowerCase().includes(q)
          || (c.nip||"").includes(q)
          || (c.phone||"").includes(q)
          || (c.city||"").toLowerCase().includes(q);
      })
    : contacts;

  function pickContact(c){
    setContactId(c.id);
    setName(c.name||"");
    setAddr(c.street||"");
    setPostal(c.postal||"");
    setCity(c.city||"");
    setPhone(c.phone||"");
    setEmail(c.email||"");
    setCSearch(c.name||"");
    setCDrop(false);
    setSaveAsNew(false);
  }
  function clearContact(){
    setContactId(null); setCSearch("");
  }

  function finish(cid){ p.onOk(name.trim(),addr.trim(),phone.trim(),email.trim(),postal.trim(),city.trim(),cid||null); p.onClose(); }

  function submit(){
    if(!name.trim()||busy)return;
    if(contactId){ finish(contactId); return; }
    if(saveAsNew){
      setBusy(true);
      var payload={
        kind: name.trim().indexOf(" ")>0 && !/(sp\.|s\.c\.|sp\.z|z o\.o|s\.a|firma|studio|salon|fhu|p\.h\.u)/i.test(name) ? "osoba" : "firma",
        role:"klient",
        name:name.trim(), street:addr.trim(), postal:postal.trim(), city:city.trim(),
        email:email.trim(), phone:phone.trim(),
        default_vat:23, default_payment_days:14, tags:[]
      };
      sbApi.addContact(payload)
        .then(function(data){ var id=data&&data[0]?data[0].id:null; finish(id); })
        .catch(function(){ finish(null); }); // baza kontrahenta się nie udała — utwórz samą wycenę
      return;
    }
    finish(null);
  }

  var INP={width:"100%",padding:"14px 16px",fontSize:15,border:"1px solid var(--bd2)",borderRadius:10,marginBottom:10,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block",minHeight:52};
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}},
    ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:"2rem",width:"min(380px, 92vw)",border:"1px solid var(--bd2)",boxShadow:"0 12px 40px rgba(0,0,0,0.15)",maxHeight:"92vh",overflowY:"auto"}},
      ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--t1)",letterSpacing:"0.02em"}},"Nowy klient"),

      // ── Kontrahent z bazy (Faza 2) ──
      ce("div",{style:{position:"relative",marginBottom:12}},
        ce("div",{style:{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}},"Kontrahent z bazy (opcjonalnie)"),
        ce("div",{style:{display:"flex",gap:8}},
          ce("input",{value:cSearch,placeholder:"Szukaj: nazwa, NIP, telefon\u2026",
            onChange:function(ev){setCSearch(ev.target.value);setCDrop(true);if(!ev.target.value)clearContact();},
            onFocus:function(){setCDrop(true);},
            onBlur:function(){setTimeout(function(){setCDrop(false);},150);},
            style:Object.assign({},INP,{marginBottom:0,minHeight:46,flex:1})}),
          contactId&&ce("button",{type:"button",onClick:clearContact,style:{padding:"0 14px",borderRadius:10,border:"1px solid var(--bd2)",background:"transparent",color:"var(--t2)",cursor:"pointer",fontSize:16}},"\u00D7")
        ),
        cDrop&&filtered.length>0&&ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:60,background:"var(--bg)",border:"1px solid var(--bd2)",borderRadius:10,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.18)",marginTop:4}},
          filtered.slice(0,30).map(function(c){
            return ce("div",{key:c.id,onMouseDown:function(){pickContact(c);},
              style:{padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--bd3)",color:"var(--t1)"}},
              ce("div",{style:{fontWeight:600}},c.name),
              ce("div",{style:{fontSize:11,color:"var(--t3)"}}, [c.nip?"NIP "+c.nip:null,c.city||null,c.phone||null].filter(Boolean).join(" \u00B7 ")||"\u2014"));
          })
        ),
        contactId&&ce("div",{style:{fontSize:11,color:"var(--violet)",marginTop:5}},"\u2713 Powi\u0105zano z kontrahentem z bazy")
      ),

      ce("input",{autoFocus:true,value:name,onChange:function(ev){setName(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Imi\u0119 i nazwisko *",style:Object.assign({},INP,{fontSize:17,minHeight:56})}),
      ce("div",{style:{fontSize:12,color:"var(--t3)",marginTop:-4,marginBottom:12,lineHeight:1.4}},"Dane adresowe i kontaktowe s\u0105 wykorzystywane przy wystawianiu faktur. Uzupe\u0142nienie nie jest obowi\u0105zkowe \u2014 mo\u017cna to zrobi\u0107 w dowolnym momencie."),
      ce("input",{value:addr,onChange:function(ev){setAddr(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Ulica i numer",style:INP}),
      ce("div",{style:{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,marginBottom:10}},
        ce("input",{value:postal,onChange:function(ev){setPostal(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"00-000",style:Object.assign({},INP,{marginBottom:0})}),
        ce("input",{value:city,onChange:function(ev){setCity(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Miejscowo\u015b\u0107",style:Object.assign({},INP,{marginBottom:0})})
      ),
      ce("input",{type:"tel",value:phone,onChange:function(ev){setPhone(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Telefon",style:INP}),
      ce("input",{type:"email",value:email,onChange:function(ev){setEmail(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"E-mail",style:Object.assign({},INP,{marginBottom:12})}),

      // Zapisz jako nowego kontrahenta (gdy nie wybrano z bazy)
      !contactId&&ce("label",{style:{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--t2)",marginBottom:14,cursor:"pointer"}},
        ce("input",{type:"checkbox",checked:saveAsNew,onChange:function(ev){setSaveAsNew(ev.target.checked);},style:{width:15,height:15,cursor:"pointer"}}),
        "Zapisz te dane jako nowego kontrahenta w bazie"),

      ce("div",{style:{display:"flex",gap:10,marginTop:4}},
        ce("button",{onClick:submit,disabled:busy,style:{flex:1,padding:"8px",borderRadius:7,border:"none",background:"var(--t1)",color:"var(--bg)",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em",opacity:busy?0.6:1}},busy?"ZAPISUJ\u0118\u2026":"DODAJ"),
        ce("button",{onClick:p.onClose,style:{padding:"8px 14px",borderRadius:7,border:"0.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:12,cursor:"pointer"}},"Anuluj")
      )
    )
  );
}
