import { sbApi } from './supabase.js';
import { FABRICS } from '../constants/data.js';

export function generateFabricOrderPDF(client){
  var rows=buildFabricRows(client);
  if(!rows.length){alert("Brak tkanin do zamówienia.");return;}
  var now=new Date();var dateStr=now.toLocaleDateString("pl-PL");

  // Group rows by supplier (skip manual fabrics with no meters)
  var bySupplier={};
  rows.forEach(function(r){
    if(!r.metry||r.metry<=0)return; // skip zero-meter rows
    var key=r.prod||"Inny";
    if(key==="-")return; // skip manual/custom fabrics with no supplier
    if(!bySupplier[key])bySupplier[key]=[];
    bySupplier[key].push(r);
  });
  var suppliers=Object.keys(bySupplier).sort();

  // Build and open one PDF window per supplier
  var extraStyles=`
    .supplier-header{background:#f2f2ef;border:0.5px solid #c8c8c4;border-radius:4px;padding:8px 12px;margin-bottom:5mm;}
    .supplier-name{font-size:14px;font-weight:700;color:#1a1a18;margin-bottom:3px;letter-spacing:0.03em;}
    .supplier-meta{font-size:9px;color:#6b6b66;margin-top:2px;}
  `;

  suppliers.forEach(function(sup){
    var supRows=bySupplier[sup];
    var tableRows=supRows.map(function(r){
      return [
        "<strong>"+r.fabName+"</strong>",
        r.width?r.width+"cm":"-",
        r.metry.toFixed(2).replace(".",",")+" mb",
        r.rooms.join("; ")
      ];
    });
    var totalMetry=supRows.reduce(function(a,r){return a+r.metry;},0);
    tableRows.push(["<strong>RAZEM</strong>","","<strong>"+totalMetry.toFixed(2).replace(".",",")+" mb</strong>",""]);

    var tableHTML=makeTableHTML(
      ["Tkanina","Szer. belki","Ilość (mb)","Przeznaczenie"],
      tableRows,
      "Pozycje do zamówienia"
    );

    var bodySection=`
    <div class="supplier-header">
      <div class="supplier-name">${sup}</div>
      <div class="supplier-meta">Zamawiający: <strong>${SELLER.name}</strong>  |  Tel.: ${SELLER.tel}  |  E-mail: ${SELLER.email}</div>
      <div class="supplier-meta">Klient końcowy: <strong>${client.name}</strong>${client.addr?" — "+client.addr:""}  |  Data: ${dateStr}</div>
    </div>
    ${tableHTML}
    <div class="notes" style="margin-top:4mm">Termin dostawy: _________________&nbsp;&nbsp;&nbsp; Forma płatności: _________________&nbsp;&nbsp;&nbsp; Podpis: _________________</div>
    <div class="sign-block" style="margin-top:8mm">
      <div class="sign">Zamawiający<br><strong>Paulina Porter</strong></div>
      <div class="sign">Dostawca — potwierdzenie</div>
    </div>`;

    var html='<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Zamówienie tkaniny — '+sup+' — '+client.name+'</title>'+pdfStyles().replace('</style>',extraStyles+'</style>')+'</head><body>'
      +'<div class="header"><div><div class="logo-text">PORTER<br>DESIGN</div><div class="logo-sub">Dekoracje okienne</div></div>'
      +'<div style="text-align:right"><div style="font-size:18px;font-weight:700">Zamówienie tkaniny</div>'
      +'<div style="font-size:9px;color:#6b6b66;margin-top:4px">Klient: <strong>'+client.name+'</strong> &nbsp;|&nbsp; Dostawca: <strong>'+sup+'</strong> &nbsp;|&nbsp; Data: '+dateStr+'</div></div></div>'
      +bodySection
      +'<div class="footer" style="margin-top:8mm"><span>'+SELLER.name+' | '+SELLER.city+'</span><span>Generowano: '+dateStr+'</span></div>'
      +'</body></html>';

    openPDFWindow(html,'zamowienie-tkaniny-'+sup.replace(/\s+/g,'-').toLowerCase());
  });
}

// ── WYCENA UPROSZCZONA PDF ─────────────────────────────────────────────────
export function generateSimplifiedPDF(client,comm,montaz){
  comm=comm||0;
  montaz=montaz||0;
  if(!(client.rooms||[]).length){alert("Brak pomieszczeń.");return;}
  var now=new Date();
  var dateStr=now.toLocaleDateString("pl-PL");
  var validDate=new Date(now.getTime()+30*24*60*60*1000);
  var validStr=validDate.toLocaleDateString("pl-PL");
  var offerNo=getPDFOfferNumber(client);

  function calcProd(p){
    var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;
    var base=p.mp!=null?p.mp:(calc(pfc).total||0);
    return comm>0?base*(1+comm):base;
  }

  // Pomocnik: liczba mnoga dla typów produktów
  function pluralProd(type,count){
    if(type==="zaslona")return "Zas\u0142ony";
    if(type==="firana")return "Firany";
    if(type==="roleta")return count===1?"Roleta":"Rolety";
    if(type==="zaluzja")return count===1?"Żaluzje":count<5?"Żaluzje":"Żaluzji";
    if(type==="plisa")return count===1?"Plisa":"Plisy";
    if(type==="karnisz")return count===1?"Karnisz":"Karnisze";
    if(type==="szyna")return count===1?"Szyna":"Szyny";
    var lbl=(PROD_TYPES.find(function(t){return t.id===type;})||{label:type}).label;
    return lbl;
  }
  // Pomocnik: szczegóły szycia dla zasłon/firan
  function sewingInfo(p){
    var c=p.c||{};
    var sz=(c.sz==="wave"||c.model==="wave")?"Wave":"Flex";
    var mars=c.mars?(Math.round(+(c.mars)*100))+"%":"150%";
    return sz+" "+mars;
  }

  // Helper: build product rows table for a list of windows
  function buildWinRows(windows){
    var typeData={};
    var typeOrder=[];
    var total=0;
    (windows||[]).forEach(function(w){
      (w.products||[]).forEach(function(p){
        var t=calcProd(p);
        if(!t)return;
        var key=p.type==="inny"?(p.innyNazwa||"Inne"):p.type;
        if(!typeData[key]){typeData[key]={count:0,total:0,type:p.type,innyNazwa:p.innyNazwa,sewings:[]};typeOrder.push(key);}
        typeData[key].count+=1;
        typeData[key].total+=t;
        if(p.type==="zaslona"||p.type==="firana"){var si=sewingInfo(p);if(typeData[key].sewings.indexOf(si)<0)typeData[key].sewings.push(si);}
        total+=t;
      });
    });
    var rows="";
    typeOrder.forEach(function(key){
      var d=typeData[key];
      var lbl=d.type==="inny"?(d.innyNazwa||"Inne"):pluralProd(d.type,d.count);
      var extra=d.sewings.length>0?" <span style=\"font-size:9px;color:#888;font-weight:400;\">("+d.sewings.join(", ")+")</span>":"";
      var isKpl=(d.type==="zaslona"||d.type==="firana");
      rows+="<tr><td style=\"padding:7px 10px;font-size:11px;color:#333;\">"+lbl+(isKpl?" <span style=\"font-size:9px;color:#888;\">(kpl.)</span>":"")+extra+"</td><td style=\"padding:7px 10px;text-align:right;font-size:11px;font-weight:600;color:#333;\">"+roundTo10(d.total)+" z\u0142</td></tr>";
    });
    return {rows:rows,total:total};
  }

  // Zbierz wszystkie etykiety wariantow uzywane w tym kliencie
  var allVariantLabels={};
  (client.rooms||[]).forEach(function(room){
    (room.windows||[]).forEach(function(w){
      if(w.variantGroup&&w.variantLabel){allVariantLabels[w.variantLabel]=true;}
    });
  });
  var variantLabelsSorted=Object.keys(allVariantLabels).sort();
  var hasAnyVariants=variantLabelsSorted.length>0;

  // Pomocnik: buduje html jednego PDF dla danego zestawu okien (plain + wybrana etykieta wariantu)
  function buildOnePDF(variantLabel){
    var roomSections2="";
    var grandTotal2=0;

    (client.rooms||[]).forEach(function(room){
      if(!(room.windows||[]).length)return;
      var wins=room.windows||[];

      // dla tego PDF bierzemy: okna bez wariantu + okna z wybraną etykietą wariantu
      var selectedWins=wins.filter(function(w){
        if(!w.variantGroup)return true;
        return w.variantLabel===variantLabel;
      });
      if(!selectedWins.length)return;

      var roomSection2="";
      var roomTotal2=0;

      selectedWins.forEach(function(w){
        var wr=buildWinRows([w]);
        if(!wr.total)return;
        var isVariantWin=!!w.variantGroup;
        var headerColor=isVariantWin?"#3367d6":"#8B5E3C";
        var totalRowBg=isVariantWin?"#dce8f7":"#f5ede0";
        var winLabel=isVariantWin?(w.variantBaseName||w.name):w.name;
        var totalRow2="<tr style=\"background:"+totalRowBg+"\"><td style=\"padding:8px 10px;font-size:11px;font-weight:700;color:"+headerColor+";\">"+winLabel+"</td><td style=\"padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:"+headerColor+";\">" +roundTo10(wr.total)+" z\u0142</td></tr>";
        roomSection2+="<table style=\"width:100%;border-collapse:collapse;border:1px solid #ede3d9;margin-bottom:3mm;\"><tbody>"+wr.rows+totalRow2+"</tbody></table>";
        roomTotal2+=wr.total;
      });

      if(!roomTotal2)return;
      grandTotal2+=roomTotal2;
      roomSections2+="<div style=\"margin-bottom:8mm;\"><div style=\"font-size:13px;font-weight:700;color:#8B5E3C;letter-spacing:0.04em;text-transform:uppercase;padding:8px 10px;background:#fdf6ef;border-left:3px solid #8B5E3C;margin-bottom:3mm;\">"+room.name+"</div>"+roomSection2+"</div>";
    });

    if(!grandTotal2)return null;

    var variantSuffix=variantLabel?" \u2014 Wariant "+variantLabel:"";
    var h="<!DOCTYPE html><html lang=\"pl\"><head><meta charset=\"UTF-8\"><title>"+client.name+" - Oferta Ara\u0144\u017cacji Okiennych"+variantSuffix+"</title>"+pdfStyles()+"</head><body>"
      +"<div style=\"text-align:center;margin-bottom:8mm;line-height:0;\"><img src=\""+BANNER_PDF_G+"\" style=\"width:520px;max-width:100%;height:auto;display:inline-block;\" alt=\"\"/></div>"
      +"<div class=\"header\" style=\"padding-top:2mm;\">"
      +"<div><img src=\""+LOGO_PDF_G+"\" style=\"height:54px;width:auto;\" alt=\"Porter Design\"/></div>"
      +"<div style=\"text-align:right\"><div style=\"font-size:18px;font-weight:700\">Wycena Uproszczona"+variantSuffix+"</div>"
      +"<div style=\"font-size:10px;color:#8B5E3C;font-weight:600;margin-top:2px;\">"+client.name+"</div>"
      +"<div style=\"font-size:9px;color:#6b6b66;margin-top:4px\">Data: "+dateStr+" &nbsp;|&nbsp; Wa\u017cne do: "+validStr+"</div></div></div>"

      +roomSections2
      +"<div style=\"margin-top:6mm;padding:12px 16px;background:#8B5E3C;border-radius:8px;display:flex;justify-content:space-between;align-items:center;\">"
      +"<span style=\"font-size:13px;color:#fff;letter-spacing:0.04em;\">\u0141\u0105cznie ca\u0142a realizacja</span>"
      +"<span style=\"font-size:20px;font-weight:700;color:#fff;\">"+roundTo10(grandTotal2)+" z\u0142</span></div>"
      +(montaz>0?"<div style=\"margin-top:4mm;padding:10px 14px;background:#f5ede0;border-radius:8px;display:flex;justify-content:space-between;align-items:center;\"><span style=\"font-size:12px;color:#8B5E3C;\">Monta\u017c dekoracji okiennych (p\u0142atny dodatkowo)</span><span style=\"font-size:14px;font-weight:700;color:#8B5E3C;\">"+roundTo10(grandTotal2*montaz)+" z\u0142</span></div>":"")
      +"<div class=\"sign-block\">"
      +"<div class=\"sign\">Wystawi\u0142a<br><strong>Paulina Porter</strong></div>"
      +"<div class=\"sign\">Akceptacja klienta</div>"
      +"</div>"
      +"<div class=\"footer\"><span>"+SELLER.name+" | "+SELLER.city+"</span><span>"+offerNo+"</span></div>"
      +"</body></html>";
    return h;
  }

  if(hasAnyVariants){
    var opened=0;
    variantLabelsSorted.forEach(function(lbl){
      var h=buildOnePDF(lbl);
      if(h){var clientSlug2=(client.name||"");openPDFWindow(h,clientSlug2+" - Oferta Aranżacji Okiennych (wariant "+lbl+")");opened++;}
    });
    if(!opened){alert("Brak pozycji do wyceny.");}
  } else {
    var h=buildOnePDF(null);
    if(!h){alert("Brak pozycji do wyceny.");return;}
    var clientSlug3=(client.name||"");openPDFWindow(h,clientSlug3+" - Oferta Aranżacji Okiennych");
  }

}

// ── GENEROWANIE MAILA DO KLIENTA ──────────────────────────────────────────
export function generateClientEmail(client){
  var total=roundTo10((client.rooms||[]).reduce(function(a,r){return a+(r.windows||[]).reduce(function(b,w){return b+(w.products||[]).reduce(function(c,p){var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;return c+(p.mp!=null?p.mp:(calc(pfc).total||0));},0);},0);},0));
  var zaliczka=roundTo10(total*0.5);
  var clientTitle=client.gender==="male"?"Pana":"Pani";
  var mail="Dzień dobry,\n\nW nawiązaniu do rozmowy / spotkania / przesłanych wymiarów, przesyłam w załączeniu PDF z uproszczoną, przybliżoną wyceną "+(client.gender==="male"?"Pana":"Pani")+" zamówienia.\n\nŁączna orientacyjna wartość realizacji: "+total+" zł brutto\n(zaliczka 50% = "+zaliczka+" zł)\n\nCzas realizacji: ok. 4 tygodnie od akceptacji i wpłaty zaliczki w wysokości 50% wartości zamówienia.\n\nChętnie przyjadę z wzornikami tkanin, aby dobrać kolor i fakturę do wnętrza.\n\nKoszt pomiaru z dojazdem wynosi 250 PLN i jest w całości odliczany od wartości zamówienia przy realizacji.\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design\nTel.: "+SELLER.tel+"\nE-mail: "+SELLER.email;
  return mail;
}

export function generateSewingOrderPDF(client, modalData){
  var rows=buildSewingRows(client);
  if(!rows.length){alert("Brak pozycji szycia.");return;}
  var sewingHouse=modalData.sewingHouse||"";
  var notes=modalData.notes||"";
  var termStr=modalData.term||"________________";
  var attachB64=modalData.attachB64||null;
  var now=new Date();var dateStr=now.toLocaleDateString("pl-PL");
  var totalMetry=rows.reduce(function(a,r){return a+r.metry;},0);

  var tableHeader=["Pom. / Okno","Rodzaj","Tkanina","Producent","Szer. belki","Kolor","Mb","Wys. (cm)","Szer. (cm)","Podzia\u0142","Styl szycia","Typ do\u0142u","Odst\u0119p \u015blizg.","O\u0142\xf3w w bokach","Podszewka","Uwaga"];
  var tableRows=rows.map(function(r){
    return [
      r.room+" / "+r.win,
      r.type,
      "<strong>"+r.fabric+"</strong>",
      r.prod||"-",
      r.fabW+"cm",
      r.kolor,
      r.metry.toFixed(2).replace(".",",")+"\u00a0mb",
      r.hCm?(r.hCm+"cm"):"-",
      r.wCm?(r.wCm+"cm"):"-",
      r.split,
      r.szStyle,
      r.bottom,
      r.glide,
      r.leadInSides,
      r.podszewka||"nie",
      r.note||""
    ];
  });
  tableRows.push(["<strong>RAZEM</strong>","","","","","","<strong>"+totalMetry.toFixed(2).replace(".",",")+"\u00a0mb</strong>","","","","","","","","",""]);

  var sewHouseBlock=sewingHouse
    ?'<div style="font-size:11px;line-height:1.6;white-space:pre-wrap">'+sewingHouse.replace(/</g,'&lt;')+'</div>'
    :'<div style="color:#a8a8a4;font-style:italic;font-size:10px">____________________________<br>____________________________<br>____________________________</div>';

  var notesBlock=notes
    ?'<div class="notes"><strong>Uwagi do zlecenia:</strong><br>'+notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div>'
    :'';

  var extraStyles=`
    table{font-size:8px;}
    th{font-size:7px;padding:3px 4px;}
    td{padding:3px 4px;font-size:8px;}
  `;

  var html='<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Zlecenie szycia</title>'
    +pdfStyles().replace('</style>',extraStyles+'</style>')
    +'</head><body>'
    +'<div class="header"><div><div class="logo-text">PORTER<br>DESIGN</div><div class="logo-sub">Dekoracje okienne</div></div>'
    +'<div style="text-align:right"><div style="font-size:18px;font-weight:700">Zlecenie szycia</div>'
    +'<div style="font-size:9px;color:#6b6b66;margin-top:4px">Data: '+dateStr+' &nbsp;|&nbsp; Klient: <strong>'+client.name+'</strong></div></div></div>'
    +'<div class="meta">'
    +'<div class="meta-block"><h4>Zleceniodawca</h4><p><strong>'+SELLER.name+'</strong><br>'+SELLER.addr+', '+SELLER.city+'<br>Tel.: '+SELLER.tel+'<br>E-mail: '+SELLER.email+'</p></div>'
    +'<div class="meta-block"><h4>Szwalnia</h4>'+sewHouseBlock+'</div>'
    +'<div class="meta-block"><h4>Klient ko\u0144cowy</h4><p><strong>'+client.name+'</strong><br>'+(client.addr||"")+'</p>'
    +'<p style="margin-top:6px;font-size:9px;color:#6b6b66">Termin realizacji: <strong>'+termStr+'</strong></p></div>'
    +'</div>'
    +makeTableHTML(tableHeader,tableRows,"Pozycje do szycia")
    +notesBlock
    +'<div class="sign-block" style="margin-top:14mm">'
    +'<div class="sign">Zleceniodawca<br><strong>Paulina Porter</strong></div>'
    +'<div class="sign">Szwalnia \u2014 przyj\u0119to zlecenie</div>'
    +'</div>'
    +'<div class="footer"><span>'+SELLER.name+' | '+SELLER.city+'</span><span>Strona 1</span></div>'
    +"</body></html>";

  if(attachB64){
    // Second page with the attached PDF
    var html2='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Za\u0142\u0105cznik</title>'
      +'<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#fff;}'
      +'@media print{@page{size:A4;margin:0;} body{margin:0;}}'
      +'</style></head><body>'
      +'<div style="page-break-before:always;">'
      +'<iframe src="'+attachB64+'" style="width:100%;height:297mm;border:none;"></iframe>'
      +'</div></body></html>';
    html=html.replace('</body></html>',
      '<div style="page-break-before:always;padding:10mm;">'
      +'<div style="font-size:9px;color:#6b6b66;margin-bottom:4mm;text-transform:uppercase;letter-spacing:0.08em;">Za\u0142\u0105cznik — rysunek techniczny</div>'
      +'<embed src="'+attachB64+'" type="application/pdf" style="width:100%;height:240mm;border:1px solid #e0e0e0;" />'
      +'</div></body></html>');
  }

  openPDFWindow(html,"zlecenie-szycia");
}


// ── UI COMPONENTS ──────────────────────────────────────────────────────────

export function Chip(p){
  return ce("button",{onClick:p.onClick,style:{padding:"12px 22px",borderRadius:24,border:"1.5px solid "+(p.active?"var(--gr)":"var(--bd2)"),background:p.active?"var(--grl)":"transparent",color:p.active?"var(--grd)":"var(--t1)",fontSize:15,cursor:"pointer",marginBottom:6,transition:"all .15s",minHeight:50,fontWeight:p.active?600:400}},p.label);
}
export function Chips(p){return ce("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}},p.items.filter(Boolean));}
export function Fld(p){return ce("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:p.noMb?0:4}},ce("label",{style:{fontSize:12,color:"var(--t2)",letterSpacing:"0.06em",fontWeight:600,textTransform:"uppercase"}},(p.label||"").toUpperCase()),p.children);}
export function Section(p){
  return ce("div",{style:{borderTop:"1px solid var(--bd3)",paddingTop:20,marginTop:20}},
    ce("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:18}},
      ce("div",{style:{width:26,height:26,borderRadius:13,background:"var(--t1)",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},p.num),
      ce("span",{style:{fontSize:16,fontWeight:600,color:"var(--t1)",letterSpacing:"0.01em"}},p.title)
    ),
    p.children
  );
}

export function FabPicker(p){
  var qs=useState("");var q=qs[0],setQ=qs[1];
  var os=useState(false);var open=os[0],setOpen=os[1];
  var list=q?FABRICS.filter(function(f){return f.name.toLowerCase().includes(q.toLowerCase())||f.prod.toLowerCase().includes(q.toLowerCase());}):FABRICS;
  var sf=FABRICS.find(function(f){return f.name===p.fabName;});
  var hasSelection=p.fabName||p.fabMan!=null;
  return ce("div",{style:{border:"1.5px solid "+(open?"var(--t1)":"var(--bd2)"),borderRadius:12,overflow:"hidden",marginTop:8,marginBottom:4,transition:"border-color .15s"}},
    ce("div",{
      onClick:function(){setOpen(!open);},
      style:{padding:"14px 16px",background:open?"var(--grl)":"var(--bg2)",fontSize:13,fontWeight:500,color:"var(--t1)",display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none",transition:"background .15s"}
    },
      ce("span",{style:{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:open?"var(--grd)":"var(--t2)",textTransform:"uppercase",flexShrink:0}},"Tkanina"),
      hasSelection?ce("span",{style:{background:"var(--grl)",border:"1px solid var(--grm)",borderRadius:6,padding:"4px 10px",color:"var(--grd)",fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
        sf?(p.fabName+" · "+sf.brutto+" zł/mb"):("ręczna: "+p.fabMan+" zł/mb")
      ):ce("span",{style:{color:"var(--t3)",fontSize:13,flex:1}},
        "nie wybrano — kliknij aby wybrać"
      ),
      ce("span",{style:{color:"var(--t3)",fontSize:16,transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s",flexShrink:0,lineHeight:1,display:"inline-block"}},"⌄")
    ),
    open?ce("div",null,
      ce("input",{autoFocus:true,value:q,onChange:function(ev){setQ(ev.target.value);},placeholder:"Szukaj tkaniny po nazwie lub dostawcy...",style:{width:"100%",padding:"14px 16px",fontSize:16,border:"none",borderBottom:"1px solid var(--bd3)",background:"var(--bg)",color:"var(--t1)",outline:"none",boxSizing:"border-box",minHeight:56}}),
      ce("div",{style:{maxHeight:240,overflowY:"auto"}},
        list.map(function(f){
          var active=p.fabName===f.name;
          return ce("div",{key:f.name,
            onClick:function(){p.onSelect(f);setOpen(false);setQ("");},
            style:{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid var(--bd3)",cursor:"pointer",fontSize:15,background:active?"var(--grl)":"var(--bg)"}
          },
            active?ce("span",{style:{color:"var(--gr)",fontSize:14,flexShrink:0,width:16}},"✓"):ce("span",{style:{width:16,flexShrink:0}}),
            ce("span",{style:{flex:1,fontWeight:active?600:500,color:"var(--t1)"}},f.name),
            ce("span",{style:{fontSize:11,color:"var(--t3)",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},f.prod),
            ce("span",{style:{color:"var(--t2)",whiteSpace:"nowrap",fontSize:13}},f.width+"cm"),
            ce("span",{style:{color:"var(--grd)",fontWeight:600,whiteSpace:"nowrap",fontSize:13}},f.brutto+" zł")
          );
        })
      ),
      ce("div",{style:{padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderTop:"1px solid var(--bd3)",background:"var(--bg2)",flexWrap:"wrap"}},
        ce("label",{style:{fontSize:12,color:"var(--t2)",flex:1}},"Cena ręczna (zł/mb):"),
        ce("input",{type:"number",value:p.fabMan!=null?p.fabMan:"",onChange:function(ev){p.onManual(ev.target.value===""?null:+ev.target.value);},placeholder:"np. 180",style:{width:100,padding:"12px 12px",fontSize:15,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right",minHeight:52}}),
        ce("label",{style:{fontSize:12,color:"var(--t2)",whiteSpace:"nowrap"}},"Wys. belki (cm):"),
        ce("input",{type:"number",value:p.fabManW!=null?p.fabManW:"",onChange:function(ev){p.onManualW(ev.target.value===""?null:+ev.target.value);},placeholder:"np. 300",style:{width:90,padding:"12px 12px",fontSize:15,border:"1.5px solid var(--bd2)",borderRadius:8,background:"var(--bg)",color:"var(--t1)",textAlign:"right",minHeight:52}})
      )
    ):null
  );
}

// ── MODALS ─────────────────────────────────────────────────────────────────


export function generateSewingOrderPDFFromRows(rows, client, modalData){
  if(!rows.length){alert('Brak wybranych pozycji.');return;}
  var sewingHouse=modalData.sewingHouse||'';
  var notes=modalData.notes||'';
  var termStr=modalData.term||'________________';
  var attachB64=modalData.attachB64||null;
  var now=new Date();var dateStr=now.toLocaleDateString('pl-PL');
  var totalMetry=rows.reduce(function(a,r){return a+r.metry;},0);
  var tableHeader=['Pom. / Okno','Rodzaj','Tkanina','Producent','Szer. belki','Kolor','Mb','Wys. (cm)','Szer. (cm)','Podzia\u0142','Styl szycia','Typ do\u0142u','Odst\u0119p \u015blizg.','O\u0142\xf3w w bokach','Podszewka','Uwaga'];
  var tableRows=rows.map(function(r){
    return [r.room+' / '+r.win,r.type,'<strong>'+r.fabric+'</strong>',r.prod||'-',r.fabW+'cm',r.kolor,
      r.metry.toFixed(2).replace('.',',')+' mb',
      r.hCm?(r.hCm+'cm'):'-',r.wCm?(r.wCm+'cm'):'-',
      r.split,r.szStyle,r.bottom,r.glide,r.leadInSides,r.podszewka||"nie",r.note||''];
  });
  tableRows.push(['<strong>RAZEM</strong>','','','','','','<strong>'+totalMetry.toFixed(2).replace('.',',')+' mb</strong>','','','','','','','','','']);
  var sewHouseBlock=sewingHouse
    ?('<div style="font-size:11px;line-height:1.6;white-space:pre-wrap">'+sewingHouse.replace(/</g,'&lt;')+'</div>')
    :'<div style="color:#a8a8a4;font-style:italic;font-size:10px">____________________________<br>____________________________</div>';
  var notesBlock=notes?('<div class="notes"><strong>Uwagi:</strong><br>'+notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div>'):""; 
  var extraStyles='table{font-size:8px;}th{font-size:7px;padding:3px 4px;}td{padding:3px 4px;font-size:8px;}';
  var h='<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Zlecenie szycia</title>'
    +pdfStyles().replace('</style>',extraStyles+'</style>')
    +'</head><body>'
    +'<div class="header"><div><div class="logo-text">PORTER<br>DESIGN</div><div class="logo-sub">Dekoracje okienne</div></div>'
    +'<div style="text-align:right"><div style="font-size:18px;font-weight:700">Zlecenie szycia</div>'
    +'<div style="font-size:10px;color:#6b6b66;margin-top:4px">Data: '+dateStr+'</div></div></div>'
    +'<div class="meta">'
    +'<div class="meta-block"><h4>KLIENT</h4><p style="font-size:11px;line-height:1.6">'+((client.name||'')+' '+(client.phone||'')).trim()+'</p></div>'
    +'<div class="meta-block"><h4>SZWALNIA</h4>'+sewHouseBlock+'</div>'
    +'<div class="meta-block"><h4>TERMIN</h4><p style="font-size:13px;font-weight:600">'+termStr+'</p></div>'
    +'</div>'
    +makeTableHTML(tableHeader,tableRows,'Specyfikacja szycia')
    +notesBlock
    +'<div class="sign-block"><div class="sign">Data odbioru tkaniny</div><div class="sign">Podpis zleceniodawcy</div><div class="sign">Podpis szwalni</div></div>'
    +'</body></html>';
  openPDFWindow(h,'Zlecenie szycia');
  if(attachB64){
    setTimeout(function(){
      var w2=window.open('','_blank','width=900,height=700');
      if(w2){w2.document.open();w2.document.write('<html><body style="margin:0"><iframe src="'+attachB64+'" style="width:100%;height:100vh;border:none"></iframe></body></html>');w2.document.close();}
    },800);
  }
}
