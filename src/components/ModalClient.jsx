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
  function submit(){if(!name.trim())return;p.onOk(name.trim(),addr.trim(),phone.trim(),email.trim(),postal.trim(),city.trim());p.onClose();}
  var INP={width:"100%",padding:"14px 16px",fontSize:15,border:"1px solid var(--bd2)",borderRadius:10,marginBottom:10,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block",minHeight:52};
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}},
    ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:"2rem",width:"min(380px, 92vw)",border:"1px solid var(--bd2)",boxShadow:"0 12px 40px rgba(0,0,0,0.15)"}},
      ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--t1)",letterSpacing:"0.02em"}},"Nowy klient"),
      ce("input",{autoFocus:true,value:name,onChange:function(ev){setName(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Imi\u0119 i nazwisko *",style:Object.assign({},INP,{fontSize:17,minHeight:56})}),
      ce("div",{style:{fontSize:12,color:"var(--t3)",marginTop:-4,marginBottom:12,lineHeight:1.4}},"Dane adresowe przydadz\u0105 si\u0119 do wystawienia faktury \u2014 mo\u017cesz je uzupe\u0142ni\u0107 teraz albo p\u00f3\u017aniej."),
      ce("input",{value:addr,onChange:function(ev){setAddr(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Ulica i numer",style:INP}),
      ce("div",{style:{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,marginBottom:10}},
        ce("input",{value:postal,onChange:function(ev){setPostal(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"00-000",style:Object.assign({},INP,{marginBottom:0})}),
        ce("input",{value:city,onChange:function(ev){setCity(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Miejscowo\u015b\u0107",style:Object.assign({},INP,{marginBottom:0})})
      ),
      ce("input",{type:"tel",value:phone,onChange:function(ev){setPhone(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Telefon",style:INP}),
      ce("input",{type:"email",value:email,onChange:function(ev){setEmail(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"E-mail",style:Object.assign({},INP,{marginBottom:14})}),
      ce("div",{style:{display:"flex",gap:10,marginTop:4}},
        ce("button",{onClick:submit,style:{flex:1,padding:"8px",borderRadius:7,border:"none",background:"var(--t1)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em"}},"DODAJ"),
        ce("button",{onClick:p.onClose,style:{padding:"8px 14px",borderRadius:7,border:"0.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:12,cursor:"pointer"}},"Anuluj")
      )
    )
  );
}


