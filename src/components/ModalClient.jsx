import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';
import { generateFabricOrderPDF, generateClientEmail,


  generateSewingOrderPDF, generateSewingOrderPDFFromRows
} from '../lib/pdf.js';
const ce = React.createElement;

export function ModalClient(p){
  var ns=useState(""),name=ns[0],setName=ns[1];
  var as=useState(""),addr=as[0],setAddr=as[1];
  var ps=useState(""),phone=ps[0],setPhone=ps[1];
  var es=useState(""),email=es[0],setEmail=es[1];
  function submit(){if(!name.trim())return;p.onOk(name.trim(),addr.trim(),phone.trim(),email.trim());p.onClose();}
  var INP={width:"100%",padding:"14px 16px",fontSize:15,border:"1px solid var(--bd2)",borderRadius:10,marginBottom:10,background:"var(--bg)",color:"var(--t1)",boxSizing:"border-box",display:"block",minHeight:52};
  return ce("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}},
    ce("div",{style:{background:"var(--bg)",borderRadius:16,padding:"2rem",width:"min(380px, 92vw)",border:"1px solid var(--bd2)",boxShadow:"0 12px 40px rgba(0,0,0,0.15)"}},
      ce("div",{style:{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--t1)",letterSpacing:"0.02em"}},"Nowy klient"),
      ce("input",{autoFocus:true,value:name,onChange:function(ev){setName(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Imi\u0119 i nazwisko *",style:Object.assign({},INP,{fontSize:17,minHeight:56})}),
      ce("input",{value:addr,onChange:function(ev){setAddr(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Adres (opcjonalnie)",style:INP}),
      ce("input",{type:"tel",value:phone,onChange:function(ev){setPhone(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"Telefon (opcjonalnie)",style:INP}),
      ce("input",{type:"email",value:email,onChange:function(ev){setEmail(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter")submit();},placeholder:"E-mail (opcjonalnie)",style:Object.assign({},INP,{marginBottom:14})}),
      ce("div",{style:{display:"flex",gap:10,marginTop:4}},
        ce("button",{onClick:submit,style:{flex:1,padding:"8px",borderRadius:7,border:"none",background:"var(--t1)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em"}},"DODAJ"),
        ce("button",{onClick:p.onClose,style:{padding:"8px 14px",borderRadius:7,border:"0.5px solid var(--bd2)",background:"transparent",color:"var(--t2)",fontSize:12,cursor:"pointer"}},"Anuluj")
      )
    )
  );
}


