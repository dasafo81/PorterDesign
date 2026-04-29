import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';
import { FABRICS, PROD_TYPES, JZ, JZ_ZONES, JZ_LABELS, JZALUZJA_MOTORS, JZALUZJA_REMOTES,


  jzLookup, RCITY, RDUO, REL, KSLIM, KUNIV, KN, KP, RS_WIDTHS, RS_HEIGHTS,
  RS_C, RS_D, RS_E, RS_SUPP_WIDTHS, RS_PROFIL, RS_OB_B, RS_OB_C, RS_OB_D,
  RS_BASE, ROOM_PRESETS, WIN_PRESETS,
  IMG_ROOM_SALON, IMG_ROOM_KUCHNIA, IMG_ROOM_SYPIALNIA, IMG_ROOM_POKÓJ,
  IMG_ROOM_GABINET, IMG_OKNO, IMG_JZ_ALUMINIUM, IMG_JZ_BAMBOO, IMG_JZ_BASSWOOD,
  IMG_ROLETA_RELAX, IMG_ROLETA_PRINT, IMG_ROLETA_BACK, IMG_ROLETA_PODSZEWKA,
  IMG_ROLETA_DUO, IMG_ROLETA_FRONT, IMG_ROLETA_CASCADE,
  IMG_ROLETA_LANCUSZEK_BIALY, IMG_ROLETA_LANCUSZEK_METALOWY,
  IMG_FALDA_POJEDYNCZA, IMG_FALDA_PODWOJNA, IMG_FALDA_POTROJNA,
  IMG_FALDA_PLASKA, IMG_FALDA_STUDIO, IMG_MODEL_TASMA, IMG_MODEL_WAVE,
  IMG_MODEL_FALDA, LOGO_SRC, SB_STORAGE
} from '../constants/data.js';
const ce = React.createElement;

export function ScreenMail(p){
  var useState=React.useState, useEffect=React.useEffect, useRef=React.useRef;
  var clients = p.clients||[];

  // Auth state (zaślepka — w etapie 2 zastąpiona MSAL)
  var sa=useState(false), msalLoggedIn=sa[0], setMsalLoggedIn=sa[1];

  // Composer state
  var sc=useState(null), selClientId=sc[0], setSelClientId=sc[1];
  var st=useState("oferta"), selTemplate=st[0], setSelTemplate=st[1];
  var sto=useState(""), toEmail=sto[0], setToEmail=sto[1];
  var ssub=useState(""), subject=ssub[0], setSubject=ssub[1];
  var sbod=useState(""), body=sbod[0], setBody=sbod[1];
  var scon=useState([]), contactSug=scon[0], setContactSug=scon[1];
  var ssent=useState(false), justSent=ssent[0], setJustSent=ssent[1];
  var ssending=useState(false), sending=ssending[0], setSending=ssending[1];

  // Historia state
  var smails=useState(MOCK_SENT), sentMails=smails[0], setSentMails=smails[1];
  var sprev=useState(null), previewMail=sprev[0], setPreviewMail=sprev[1];
  var shf=useState(""), histFilter=shf[0], setHistFilter=shf[1];

  // Widok na mobile: "composer" | "historia"
  var svw=useState("composer"), mobileView=svw[0], setMobileView=svw[1];

  var selClient = clients.find(function(c){return String(c.id)===String(selClientId);})||null;

  // Aktualizuj pola gdy zmienia się klient lub szablon
  useEffect(function(){
    var tpl = MAIL_TEMPLATES.find(function(t){return t.id===selTemplate;})||MAIL_TEMPLATES[0];
    var filled = fillTemplate(tpl, selClient, clients);
    setSubject(filled.subject);
    setBody(filled.body);
    if(selClient && selClient.email) setToEmail(selClient.email);
  },[selClientId, selTemplate]);

  // Autouzupełnianie "Do:"
  function onToChange(val){
    setToEmail(val);
    if(val.length<2){setContactSug([]);return;}
    var q=val.toLowerCase();
    var matches=MOCK_CONTACTS.filter(function(c){
      return c.name.toLowerCase().includes(q)||c.email.toLowerCase().includes(q);
    }).slice(0,5);
    setContactSug(matches);
  }

  function pickContact(c){
    setToEmail(c.email);
    setContactSug([]);
  }

  function handleSend(){
    if(!toEmail||!subject||!body)return;
    setSending(true);
    // Zaślepka — Graph API POST /me/sendMail w Etapie 3
    setTimeout(function(){
      var newMail={
        id:"m_"+Date.now(),
        to:toEmail,
        toName:selClient?selClient.name:toEmail,
        subject:subject,
        date:new Date().toISOString(),
        preview:body.slice(0,80)+"...",
        body:body
      };
      setSentMails(function(prev){return [newMail].concat(prev);});
      setSending(false);
      setJustSent(true);
      setTimeout(function(){setJustSent(false);},3000);
      setMobileView("historia");
    },900);
  }

  var filteredMails = sentMails.filter(function(m){
    if(!histFilter)return true;
    var q=histFilter.toLowerCase();
    return (m.toName||"").toLowerCase().includes(q)||(m.to||"").toLowerCase().includes(q)||(m.subject||"").toLowerCase().includes(q);
  });

  // ── STYLE STAŁE ──
  var INP={width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:13,
    border:"1px solid var(--bd2)",borderRadius:8,background:"var(--bg2)",
    color:"var(--t1)",outline:"none",fontFamily:"inherit"};
  var SEC={marginBottom:10};

  // ── PANEL: EKRAN LOGOWANIA ──
  if(!msalLoggedIn){
    return ce("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",minHeight:300,gap:16,textAlign:"center"}},
      ce("div",{style:{fontSize:40,lineHeight:1}},"\u2709\uFE0F"),
      ce("div",{style:{fontSize:17,fontWeight:700,color:"var(--t1)"}}, "Moду\u0142 Mail"),
      ce("div",{style:{fontSize:13,color:"var(--t2)",maxWidth:280,lineHeight:1.6}},
        "Aby wysy\u0142a\u0107 maile przez Outlooka i pobiera\u0107 histori\u0119, zaloguj si\u0119 kontem Microsoft Pauliny Porter."
      ),
      ce("button",{
        onClick:function(){setMsalLoggedIn(true);}, // Zaślepka — MSAL loginPopup() w Etapie 2
        style:{display:"flex",alignItems:"center",gap:10,padding:"12px 24px",borderRadius:10,
          border:"1.5px solid var(--bd2)",background:"var(--bg2)",cursor:"pointer",
          fontSize:14,fontWeight:600,color:"var(--t1)",marginTop:8}
      },
        ce("svg",{width:20,height:20,viewBox:"0 0 21 21",xmlns:"http://www.w3.org/2000/svg"},
          ce("rect",{x:1,y:1,width:9,height:9,fill:"#f25022"}),
          ce("rect",{x:11,y:1,width:9,height:9,fill:"#7fba00"}),
          ce("rect",{x:1,y:11,width:9,height:9,fill:"#00a4ef"}),
          ce("rect",{x:11,y:11,width:9,height:9,fill:"#ffb900"})
        ),
        "Zaloguj si\u0119 przez Microsoft"
      ),
      ce("div",{style:{fontSize:11,color:"var(--t3)",marginTop:4}},"Prototyp \u2014 klikni\u0119cie symuluje logowanie")
    );
  }

  // ── PANEL: ZALOGOWANA ──

  // Composer panel
  var composerPanel = ce("div",{style:{flex:"1 1 320px",minWidth:0,display:"flex",flexDirection:"column",gap:0}},
    // Nagłówek
    ce("div",{style:{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}},
      "\u270F\uFE0F Nowa wiadomo\u015b\u0107"
    ),

    // Wybór klienta
    ce("div",{style:SEC},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Klient"),
      ce("select",{
        value:selClientId||"",
        onChange:function(e){setSelClientId(e.target.value||null);},
        style:Object.assign({},INP,{appearance:"none",WebkitAppearance:"none"})
      },
        ce("option",{value:""},"— wybierz klienta —"),
        clients.map(function(cl){
          return ce("option",{key:cl.id,value:String(cl.id)},cl.name+(cl.email?" ("+cl.email+")":""));
        })
      )
    ),

    // Szablony
    ce("div",{style:SEC},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Szablon"),
      ce("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        MAIL_TEMPLATES.map(function(tpl){
          var active=selTemplate===tpl.id;
          return ce("button",{key:tpl.id,
            onClick:function(){setSelTemplate(tpl.id);},
            style:{padding:"6px 11px",borderRadius:8,fontSize:12,fontWeight:active?700:400,
              border:"1.5px solid "+(active?"var(--gr)":"var(--bd2)"),
              background:active?"var(--grl)":"transparent",
              color:active?"var(--grd)":"var(--t2)",cursor:"pointer"}
          }, tpl.icon+" "+tpl.label);
        })
      )
    ),

    // Do:
    ce("div",{style:Object.assign({},SEC,{position:"relative"})},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Do:"),
      ce("input",{type:"email",value:toEmail,onChange:function(e){onToChange(e.target.value);},
        placeholder:"adres@email.com",style:INP}),
      contactSug.length>0?ce("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:"var(--bg1)",
        border:"1px solid var(--bd2)",borderRadius:8,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",overflow:"hidden"}},
        contactSug.map(function(c){
          return ce("div",{key:c.email,onClick:function(){pickContact(c);},
            style:{padding:"9px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd3)",
              display:"flex",flexDirection:"column",gap:2}
          },
            ce("span",{style:{fontWeight:600,color:"var(--t1)"}},c.name),
            ce("span",{style:{color:"var(--t3)",fontSize:11}},c.email)
          );
        })
      ):null
    ),

    // Temat
    ce("div",{style:SEC},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Temat"),
      ce("input",{type:"text",value:subject,onChange:function(e){setSubject(e.target.value);},
        placeholder:"Temat wiadomo\u015bci",style:INP})
    ),

    // Treść
    ce("div",{style:{flex:1,display:"flex",flexDirection:"column",marginBottom:10}},
      ce("label",{style:{fontSize:11,color:"var(--t3)",display:"block",marginBottom:4}},"Tre\u015b\u0107"),
      ce("textarea",{value:body,onChange:function(e){setBody(e.target.value);},
        style:Object.assign({},INP,{flex:1,minHeight:180,resize:"vertical",lineHeight:1.6})})
    ),

    // Stopka + wyślij
    ce("div",{style:{display:"flex",alignItems:"center",gap:10}},
      ce("button",{
        onClick:handleSend,
        disabled:!toEmail||!subject||!body||sending,
        style:{flex:1,padding:"12px",borderRadius:10,border:"none",
          background:justSent?"#10b981":sending?"var(--bd2)":"var(--t1)",
          color:"#fff",fontSize:14,fontWeight:700,cursor:(!toEmail||!subject||!body||sending)?"default":"pointer",
          transition:"background .3s",display:"flex",alignItems:"center",justifyContent:"center",gap:8}
      },
        sending
          ? ce("span",null,"Wysy\u0142anie\u2026")
          : justSent
            ? ce("span",null,"\u2713 Wys\u0142ano!")
            : ce("span",null,"\u2709\uFE0F Wy\u015blij przez Outlook")
      ),
      ce("div",{style:{fontSize:10,color:"var(--t3)",lineHeight:1.4,flexShrink:0}},
        "Prototyp \u2014\nGraph API\nw Etapie 3"
      )
    )
  );

  // Historia panel
  var historiaPanel = ce("div",{style:{flex:"0 0 300px",minWidth:0,display:"flex",flexDirection:"column",gap:0,
    borderLeft:"1px solid var(--bd2)",paddingLeft:16}},

    ce("div",{style:{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}},
      "\uD83D\uDCE4 Wys\u0142ane"
    ),

    // Filtr
    ce("input",{type:"text",value:histFilter,onChange:function(e){setHistFilter(e.target.value);},
      placeholder:"Szukaj w historii\u2026",
      style:Object.assign({},INP,{marginBottom:10,fontSize:12})}),

    // Lista
    ce("div",{style:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}},
      filteredMails.length===0
        ? ce("div",{style:{fontSize:13,color:"var(--t3)",textAlign:"center",padding:"32px 0"}},"Brak wys\u0142anych maili")
        : filteredMails.map(function(m){
            var sel=previewMail&&previewMail.id===m.id;
            return ce("div",{key:m.id,onClick:function(){setPreviewMail(sel?null:m);},
              style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",
                background:sel?"var(--grl)":"var(--bg2)",
                border:"1.5px solid "+(sel?"var(--gr)":"transparent"),
                transition:"all .15s"}
            },
              ce("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}},
                ce("span",{style:{fontSize:12,fontWeight:700,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"65%"}},m.toName||m.to),
                ce("span",{style:{fontSize:10,color:"var(--t3)",flexShrink:0}},fmtMailDate(m.date))
              ),
              ce("div",{style:{fontSize:11,color:"var(--t2)",marginBottom:2,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.subject),
              ce("div",{style:{fontSize:11,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.preview),
              sel?ce("div",{style:{marginTop:10,paddingTop:10,borderTop:"1px solid var(--bd2)",
                fontSize:12,color:"var(--t1)",lineHeight:1.7,whiteSpace:"pre-wrap"}},m.body):null
            );
          })
    )
  );

  // Layout desktop: obok siebie | mobile: przełącznik zakładek
  return ce("div",{style:{display:"flex",flexDirection:"column",gap:0,height:"100%"}},

    // Nagłówek z info o koncie + wyloguj
    ce("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"8px 12px",background:"var(--bg2)",borderRadius:10,marginBottom:14,
      border:"1px solid var(--bd2)"}},
      ce("div",{style:{display:"flex",alignItems:"center",gap:8}},
        ce("div",{style:{width:8,height:8,borderRadius:"50%",background:"#10b981",flexShrink:0}}),
        ce("span",{style:{fontSize:12,color:"var(--t2)"}},
          "Zalogowano: ",
          ce("strong",{style:{color:"var(--t1)"}},"paulina@porterdesisgn.pl") // Zaślepka
        )
      ),
      ce("button",{onClick:function(){setMsalLoggedIn(false);setPreviewMail(null);},
        style:{fontSize:11,color:"var(--t3)",border:"none",background:"none",cursor:"pointer",padding:"2px 6px"}},
        "Wyloguj"
      )
    ),

    // Mobile toggle
    ce("div",{style:{display:"flex",gap:4,marginBottom:12,background:"var(--bg2)",
      borderRadius:9,padding:3,border:"1px solid var(--bd2)"}},
      ["composer","historia"].map(function(v){
        var active=mobileView===v;
        return ce("button",{key:v,onClick:function(){setMobileView(v);},
          style:{flex:1,padding:"7px",borderRadius:7,border:"none",fontSize:12,fontWeight:active?700:400,
            background:active?"var(--bg)":"transparent",color:active?"var(--t1)":"var(--t3)",
            cursor:"pointer",boxShadow:active?"0 1px 4px rgba(0,0,0,0.08)":"none"}
        }, v==="composer"?"\u270F\uFE0F Composer":"\uD83D\uDCE4 Historia");
      })
    ),

    // Panele
    ce("div",{style:{display:"flex",gap:16,flex:1,minHeight:0}},
      mobileView==="composer"?composerPanel:null,
      mobileView==="historia"?historiaPanel:null
    )
  );
}

// ── CRM ─────────────────────────────────────────────────────────────────────
