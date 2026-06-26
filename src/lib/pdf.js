import React from 'react';
import { sbApi } from './supabase.js';
const ce = React.createElement;

import {
  BANNER_PDF_G, FABRICS, LOGO_PDF_G, PROD_TYPES,
  SELLER, buildFabricRows, buildSewingRows, calc,
  getPDFOfferNumber, getPanelsForProd, makeTableHTML, mg,
  openPDFWindow, pdfStyles, roundTo10
} from '../constants/data.js';

export function generateFabricOrderPDF(client,opts){
  opts=opts||{};
  var sewingHouse=opts.sewingHouse||"";
  var notes=opts.notes||"";
  var rows=buildFabricRows(client);
  if(!rows.length){alert("Brak tkanin do zamówienia.");return;}
  var now=new Date();var dateStr=now.toLocaleDateString("pl-PL");

  // Group rows by supplier (skip manual fabrics with no meters)
  var bySupplier={};
  rows.forEach(function(r){
    if(!r.metry||r.metry<=0)return; // skip zero-meter rows
    var key=r.prod||"Inny";
    if(key==="-")key="Bez producenta"; // group manual/custom fabrics under generic key
    if(!bySupplier[key])bySupplier[key]=[];
    bySupplier[key].push(r);
  });
  var suppliers=Object.keys(bySupplier).sort();
  if(!suppliers.length){alert("Brak tkanin do zamówienia (brak metrażu lub producenta).");return;}

  // Build and open one PDF window per supplier
  var extraStyles=`
    .supplier-header{background:#f2f2ef;border:0.5px solid #c8c8c4;border-radius:4px;padding:8px 12px;margin-bottom:5mm;}
    .supplier-name{font-size:14px;font-weight:700;color:#1a1a18;margin-bottom:3px;letter-spacing:0.03em;}
    .supplier-meta{font-size:9px;color:#6b6b66;margin-top:2px;}
    .ship-block{background:#f7f7f5;border:0.5px solid #c8c8c4;border-radius:4px;padding:8px 12px;margin-top:5mm;}
    .ship-block h4{font-size:9px;letter-spacing:0.07em;text-transform:uppercase;color:#6b6b66;margin:0 0 4px;}
    .ship-block .ship-val{font-size:11px;color:#1a1a18;font-weight:600;white-space:pre-line;}
    .notes-block{margin-top:4mm;font-size:10px;color:#3a3a38;}
    .notes-block .lbl{font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-size:9px;color:#6b6b66;margin-bottom:3px;}
    .notes-block .val{white-space:pre-line;line-height:1.5;}
  `;

  suppliers.forEach(function(sup){
    var supRows=bySupplier[sup];
    var tableRows=supRows.map(function(r){
      return [
        "<strong>"+sup+"</strong>",
        r.fabName,
        r.kolor||"-",
        (r.metry||0).toFixed(2).replace(".",",")+" mb",
        r.room+" / "+r.win+(r.note?(" ["+r.note+"]"):"")
      ];
    });
    var totalMetry=supRows.reduce(function(a,r){return a+r.metry;},0);
    tableRows.push(["<strong>RAZEM</strong>","","","<strong>"+totalMetry.toFixed(2).replace(".",",")+" mb</strong>",""]);

    var tableHTML=makeTableHTML(
      ["Producent","Tkanina","Kolor","Ilość (mb)","Przeznaczenie"],
      tableRows,
      "Pozycje do zamówienia"
    );

    var shipHTML=sewingHouse
      ? `<div class="ship-block"><h4>Wysyłka tkaniny — szwalnia</h4><div class="ship-val">${sewingHouse}</div></div>`
      : "";
    var notesHTML=notes
      ? `<div class="notes-block"><div class="lbl">Uwagi do zlecenia</div><div class="val">${notes}</div></div>`
      : "";

    var bodySection=`
    <div class="supplier-header">
      <div class="supplier-name">${sup}</div>
      <div class="supplier-meta">Zamawiający: <strong>${SELLER.name}</strong>  |  Tel.: ${SELLER.tel}  |  E-mail: ${SELLER.email}</div>
      <div class="supplier-meta">Klient: <strong>${client.name}</strong>  |  Data: ${dateStr}</div>
    </div>
    ${tableHTML}
    ${shipHTML}
    ${notesHTML}
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
export function buildSimplifiedPDFHtml(client,comm,montaz,variantLabel,roomVariantLabel){
  comm=comm||0;montaz=montaz||0;
  if(!(client.rooms||[]).length)return null;
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
  function pluralProd(type,count){
    if(type==="zaslona")return "Zas\u0142ony";
    if(type==="firana")return "Firany";
    if(type==="roleta")return count===1?"Roleta":"Rolety";
    if(type==="zaluzja")return count===1?"\u017baluzje":count<5?"\u017baluzje":"\u017baluzji";
    if(type==="plisa")return count===1?"Plisa":"Plisy";
    if(type==="karnisz")return count===1?"Karnisz":"Karnisze";
    if(type==="szyna")return count===1?"Szyna":"Szyny";
    var lbl=(PROD_TYPES.find(function(t){return t.id===type;})||{label:type}).label;
    return lbl;
  }
  function sewingInfo(p){
    var c=p.c||{};
    var sz;
    if(c.sz==="wave"||c.model==="wave"){
      sz="Wave";
    }else if(c.model==="falda"){
      var foldMap={pojedyncza:"Flex Pojedynczy",podwojna:"Flex Podw\xf3jny",potrojna:"Flex Potr\xf3jny",plaska:"Fa\u0142da P\u0142aska",studio:"Fa\u0142da Studio"};
      sz=c.foldType?foldMap[c.foldType]||("Fa\u0142da "+c.foldType):"Fa\u0142da";
    }else if(c.model==="tasma"){
      sz=c.typMarszczenia||"Smok";
    }else{
      sz="Flex";
    }
    var mars=c.mars?(Math.round(+(c.mars)*100))+"%":"150%";
    return sz+" "+mars;
  }
  function buildWinRows(windows){
    var typeData={};var typeOrder=[];var total=0;
    (windows||[]).forEach(function(w){
      (w.products||[]).forEach(function(p){
        var t=calcProd(p);if(!t)return;
        // Build a specific subtype label and grouping key for rail/rod types
        var subtypeLabel=null;
        if(p.type==="szyna"){
          var ksMode=(p.c||{}).ks||"flex";
          var ksLbl=ksMode==="manual"?"Szyna KS Manualna":ksMode==="flex"?"Szyna KS Flex":ksMode==="wave"?"Szyna KS Wave":("Szyna KS "+ksMode);
          subtypeLabel=ksLbl;
        }else if(p.type==="karnisz"){
          var kmMode=(p.c||{}).km||"slim";
          subtypeLabel="Karnisz elektryczny "+(kmMode==="slim"?"Slim":kmMode==="univ"?"Universal":kmMode.toUpperCase());
        }else if(p.type==="prestige_round"){
          subtypeLabel="Karnisz Prestige ROUND";
        }else if(p.type==="prestige_square"){
          subtypeLabel="Karnisz Prestige SQUARE";
        }else if(p.type==="karnisz_dek"){
          subtypeLabel="Karnisz dekoracyjny";
        }else if(p.type==="zaluzja"){
          var jt2=(p.c||{}).jt||"al25";
          var JL2={al25:"\u017baluzja Alu 25mm",al35:"\u017baluzja Alu 35mm",al50:"\u017baluzja Alu 50mm",ba35:"\u017baluzja Bamboo 35mm",ba50:"\u017baluzja Bamboo 50mm",bs50:"\u017baluzja Basswood 50mm"};
          subtypeLabel=JL2[jt2]||("\u017baluzja "+jt2);
        }else if(p.type==="roleta"){
          var rM=(p.c||{}).rModel||"relax";var RML={relax:"Relax",print:"Print",back:"Back",front:"Front",cascade:"Cascade",duo:"Duo"};
          subtypeLabel="Roleta "+(RML[rM]||rM);
        }else if(p.type==="roleta_shadow"){
          subtypeLabel="Roleta Shadow "+((p.c||{}).shadowGroup||"C");
        }
        var key=p.type==="inny"?(p.innyNazwa||"Inne"):(p.type==="zaluzja"?(subtypeLabel+"__"+p.id):(subtypeLabel||p.type));
        if(!typeData[key]){typeData[key]={count:0,total:0,type:p.type,innyNazwa:p.innyNazwa,subtypeLabel:subtypeLabel,sewings:[]};typeOrder.push(key);}
        typeData[key].count+=(p.par&&p.par.qty?p.par.qty:1);typeData[key].total+=t;
        if(p.type==="zaslona"||p.type==="firana"){var si=sewingInfo(p);if(typeData[key].sewings.indexOf(si)<0)typeData[key].sewings.push(si);}
        total+=t;
      });
    });
    var rows="";
    typeOrder.forEach(function(key){
      var d=typeData[key];
      var lbl=d.type==="inny"?(d.innyNazwa||"Inne"):(d.subtypeLabel||pluralProd(d.type,d.count));
      var extra=d.sewings.length>0?" <span style=\"font-size:9px;color:#888;font-weight:400;\">("+d.sewings.join(", ")+")</span>":"";
      var isKpl=(d.type==="zaslona"||d.type==="firana");
      var hasQty=(d.type==="szyna"||d.type==="karnisz"||d.type==="prestige_round"||d.type==="prestige_square"||d.type==="karnisz_dek");
      var qtyTag=hasQty&&d.count>1?" <span style=\"font-size:9px;color:#888;\">("+d.count+" szt.)</span>":"";
      rows+="<tr><td style=\"padding:7px 10px;font-size:11px;color:#333;\">"+lbl+(isKpl?" <span style=\"font-size:9px;color:#888;\">(kpl.)</span>":"")+qtyTag+extra+"</td><td style=\"padding:7px 10px;text-align:right;font-size:11px;font-weight:600;color:#333;\">"+roundTo10(d.total)+" z\u0142</td></tr>";
    });
    return {rows:rows,total:total};
  }

  // variantLabel=undefined/null → plain PDF; variantLabel=string → filtruj wariant
  var roomSections2="";var grandTotal2=0;
  (client.rooms||[]).forEach(function(room){
    if(!(room.windows||[]).length)return;
    // Filtruj warianty pomieszczeń
    if(room.variantGroup){
      if(roomVariantLabel){if(room.variantLabel!==roomVariantLabel)return;}
      else{return;}
    }
    var wins=room.windows||[];
    var selectedWins=wins.filter(function(w){
      if(!w.variantGroup)return true;
      return variantLabel?w.variantLabel===variantLabel:!w.variantGroup;
    });
    if(!selectedWins.length)return;
    var roomSection2="";var roomTotal2=0;
    selectedWins.forEach(function(w){
      var wr=buildWinRows([w]);if(!wr.total)return;
      var isVariantWin=!!w.variantGroup;
      var headerColor=isVariantWin?"#1a1a18":"#1a1a18";
      var totalRowBg=isVariantWin?"#eeece9":"#f5ede0";
      var winLabel=isVariantWin?(w.variantBaseName||w.name):w.name;
      var totalRow2="<tr style=\"background:"+totalRowBg+"\"><td style=\"padding:8px 10px;font-size:11px;font-weight:700;color:"+headerColor+";\">"+winLabel+"</td><td style=\"padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:"+headerColor+";\">" +roundTo10(wr.total)+" z\u0142</td></tr>";
      roomSection2+="<table style=\"width:100%;border-collapse:collapse;border:1px solid #ede3d9;margin-bottom:3mm;\"><tbody>"+wr.rows+totalRow2+"</tbody></table>";
      roomTotal2+=wr.total;
    });
    if(!roomTotal2)return;
    grandTotal2+=roomTotal2;
    roomSections2+="<div style=\"margin-bottom:8mm;\"><div style=\"font-size:13px;font-weight:700;color:#1a1a18;letter-spacing:0.04em;text-transform:uppercase;padding:8px 10px;background:#f4f4f2;border-left:3px solid #1a1a18;margin-bottom:3mm;\">"+room.name+"</div>"+roomSection2+"</div>";
  });
  if(!grandTotal2)return null;

  var variantSuffix=(roomVariantLabel?" \u2014 Wariant pom. "+roomVariantLabel:"")+(variantLabel?" \u2014 Wariant okna "+variantLabel:"");
  var h="<!DOCTYPE html><html lang=\"pl\"><head><meta charset=\"UTF-8\"><title>"+client.name+" - Oferta Aranżacji Okiennych"+variantSuffix+"</title>"+pdfStyles()+"</head><body>"
    +"<div style=\"text-align:center;margin-bottom:8mm;line-height:0;\"><img src=\""+BANNER_PDF_G+"\" style=\"width:520px;max-width:100%;height:auto;display:inline-block;\" alt=\"\"/></div>"
    +"<div class=\"header\" style=\"padding-top:2mm;\">"
    +"<div><img src=\""+LOGO_PDF_G+"\" style=\"height:54px;width:auto;\" alt=\"Porter Design\"/></div>"
    +"<div style=\"text-align:right\"><div style=\"font-size:18px;font-weight:700\">Oferta"+variantSuffix+"</div>"
    +"<div style=\"font-size:10px;color:#1a1a18;font-weight:600;margin-top:2px;\">"+client.name+"</div>"
    +"<div style=\"font-size:9px;color:#6b6b66;margin-top:4px\">Data: "+dateStr+" &nbsp;|&nbsp; Wa\u017cne do: "+validStr+"</div></div></div>"
    +roomSections2
    +(montaz>0?"<div style=\"margin-top:6mm;padding:10px 14px;background:#f5ede0;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:3mm;\"><span style=\"font-size:12px;color:#1a1a18;\">Monta\u017c dekoracji okiennych ("+Math.round(montaz*100)+"%):</span><span style=\"font-size:14px;font-weight:700;color:#1a1a18;\">"+roundTo10(grandTotal2*montaz)+" z\u0142</span></div>":"")
    +(montaz>0?"<div style=\"margin-bottom:3mm;padding:10px 14px;background:#e8e8e4;border-radius:8px;display:flex;justify-content:space-between;align-items:center;\"><span style=\"font-size:12px;color:#555;\">\u0141\u0105cznie bez monta\u017cu</span><span style=\"font-size:14px;font-weight:700;color:#555;\">"+roundTo10(grandTotal2)+" z\u0142</span></div>":"")
    +"<div style=\"margin-top:"+(montaz>0?"0":"6mm")+";padding:12px 16px;background:#1a1a18;border-radius:8px;display:flex;justify-content:space-between;align-items:center;\">"
    +"<span style=\"font-size:13px;color:#fff;letter-spacing:0.04em;\">"+(montaz>0?"\u0141\u0105cznie z monta\u017cem":"\u0141\u0105cznie ca\u0142a realizacja")+"</span>"
    +"<span style=\"font-size:20px;font-weight:700;color:#fff;\">"+(montaz>0?roundTo10(grandTotal2*(1+montaz)):roundTo10(grandTotal2))+" z\u0142</span></div>"
    +"<div class=\"sign-block\">"
    +"<div class=\"sign\">Wystawi\u0142a<br><strong>Paulina Porter</strong></div>"
    +"<div class=\"sign\">Akceptacja klienta</div>"
    +"</div>"
    +"<div class=\"footer\"><span>"+SELLER.name+" | "+SELLER.city+"</span><span>"+offerNo+"</span></div>"
    +"</body></html>";
  return h;
}

export function generateSimplifiedPDF(client,comm,montaz){
  comm=comm||0;montaz=montaz||0;
  if(!(client.rooms||[]).length){alert("Brak pomieszczeń.");return;}
  // Zbierz etykiety wariantów okien
  var allWinLabels={};
  (client.rooms||[]).forEach(function(room){
    (room.windows||[]).forEach(function(w){
      if(w.variantGroup&&w.variantLabel){allWinLabels[w.variantLabel]=true;}
    });
  });
  var winLabels=Object.keys(allWinLabels).sort();
  // Zbierz etykiety wariantów pomieszczeń
  var allRoomLabels={};
  (client.rooms||[]).forEach(function(room){
    if(room.variantGroup&&room.variantLabel){allRoomLabels[room.variantLabel]=true;}
  });
  var roomLabels=Object.keys(allRoomLabels).sort();
  var hasWinVariants=winLabels.length>0;
  var hasRoomVariants=roomLabels.length>0;
  if(!hasWinVariants&&!hasRoomVariants){
    var h=buildSimplifiedPDFHtml(client,comm,montaz,null,null);
    if(!h){alert("Brak pozycji do wyceny.");return;}
    openPDFWindow(h,(client.name||"")+" - Oferta");
    return;
  }
  var roomDim=hasRoomVariants?roomLabels:[null];
  var winDim=hasWinVariants?winLabels:[null];
  var opened=0;
  roomDim.forEach(function(rl){
    winDim.forEach(function(wl){
      var h=buildSimplifiedPDFHtml(client,comm,montaz,wl,rl);
      if(!h)return;
      var suffix="";
      if(rl)suffix+=" (pomieszczenie "+rl+")";
      if(wl)suffix+=" (okno "+wl+")";
      openPDFWindow(h,(client.name||"")+" - Oferta"+suffix);
      opened++;
    });
  });
  if(!opened){alert("Brak pozycji do wyceny.");}
}

// -- WYCENA UPROSZCZONA -- z selekcji zestawu
function roomBaseName(room){
  var n=room.variantBaseName||room.name||'';
  return n.replace(/ — Wariant [A-Z\.]+$/,'').replace(/ — Wariant [A-Z\.]+$/,'');
}

export function buildSimplifiedPDFFromSelection(client,comm,montaz,selection,setTitle){
  comm=comm||0;montaz=montaz||0;
  if(!selection||!selection.length)return null;
  var now=new Date();var dateStr=now.toLocaleDateString("pl-PL");
  var validDate=new Date(now.getTime()+30*24*60*60*1000);var validStr=validDate.toLocaleDateString("pl-PL");
  var offerNo=getPDFOfferNumber(client);
  function calcProd(p){var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;var base=p.mp!=null?p.mp:(calc(pfc).total||0);return comm>0?base*(1+comm):base;}
  function sewingInfo(p){var c=p.c||{};var sz;if(c.sz==="wave"||c.model==="wave"){sz="Wave";}else if(c.model==="falda"){var foldMap={pojedyncza:"Flex Pojedynczy",podwojna:"Flex Podwójny",potrojna:"Flex Potrójny",plaska:"Fałda Płaska",studio:"Fałda Studio"};sz=c.foldType?foldMap[c.foldType]||("Fałda "+c.foldType):"Fałda";}else if(c.model==="tasma"){sz=c.typMarszczenia||"Smok";}else{sz="Flex";}var mars=c.mars?(Math.round(+(c.mars)*100))+"%":"150%";return sz+" "+mars;}
  function buildWinRowsSel(windows){
    var typeData={};var typeOrder=[];var total=0;
    (windows||[]).forEach(function(w){(w.products||[]).forEach(function(p){
      var t=calcProd(p);if(!t)return;
      var subtypeLabel="";
      if(p.type==="roleta"){var m=(p.c||{}).rModel||"relax";var ML={relax:"Relax",print:"Print",back:"Back",front:"Front",cascade:"Cascade",duo:"Duo"};subtypeLabel="Roleta "+(ML[m]||m);}
      else if(p.type==="roleta_shadow"){subtypeLabel="Roleta Shadow "+((p.c||{}).shadowGroup||"C");}
      else if(p.type==="zaluzja"){var jt=(p.c||{}).jt||"al25";var JL={al25:"Alu 25mm",al35:"Alu 35mm",al50:"Alu 50mm",ba35:"Bamboo 35mm",ba50:"Bamboo 50mm",bs50:"Basswood 50mm"};subtypeLabel="\u017baluzja "+(JL[jt]||jt);}
      else if(p.type==="szyna"){subtypeLabel="Szyna KS "+((p.c||{}).ks==="wave"?"Wave":"Flex");}
      else if(p.type==="karnisz"){var km=(p.c||{}).km||"slim";subtypeLabel="Karnisz elektryczny "+(km==="slim"?"Slim":km==="univ"?"Universal":km.toUpperCase());}
      else if(p.type==="prestige_round")subtypeLabel="Karnisz Prestige ROUND";
      else if(p.type==="prestige_square")subtypeLabel="Karnisz Prestige SQUARE";
      else if(p.type==="karnisz_dek")subtypeLabel="Karnisz dekoracyjny";
      var key=p.type==="inny"?(p.innyNazwa||"Inne"):(p.type==="zaluzja"?(subtypeLabel+"__"+p.id):(subtypeLabel||p.type));
      if(!typeData[key]){typeData[key]={count:0,total:0,type:p.type,innyNazwa:p.innyNazwa,subtypeLabel:subtypeLabel,sewings:[]};typeOrder.push(key);}
      typeData[key].count+=(p.par&&p.par.qty?p.par.qty:1);typeData[key].total+=t;
      if(p.type==="zaslona"||p.type==="firana"){var si=sewingInfo(p);if(typeData[key].sewings.indexOf(si)<0)typeData[key].sewings.push(si);}
      total+=t;
    });});
    var rows="";
    typeOrder.forEach(function(key){var d=typeData[key];
      var lbl=d.type==="inny"?(d.innyNazwa||"Inne"):(d.subtypeLabel||(d.type==="zaslona"?"Zas\u0142ony":d.type==="firana"?"Firany":d.type));
      var extra=d.sewings.length>0?" <span style=\"font-size:9px;color:#888;\">("+d.sewings.join(", ")+")</span>":"";
      var isKpl=d.type==="zaslona"||d.type==="firana";
      var hasQty=d.type==="szyna"||d.type==="karnisz"||d.type==="prestige_round"||d.type==="prestige_square"||d.type==="karnisz_dek";
      var qtyTag=hasQty&&d.count>1?" <span style=\"font-size:9px;color:#888;\">("+d.count+" szt.)</span>":"";
      rows+="<tr><td style=\"padding:7px 10px;font-size:11px;color:#333;\">"+lbl+(isKpl?" <span style=\"font-size:9px;color:#888;\">(kpl.)</span>":"")+qtyTag+extra+"</td>"
           +"<td style=\"padding:7px 10px;text-align:right;font-size:11px;font-weight:600;color:#333;\">"+roundTo10(d.total)+" z\u0142</td></tr>";
    });
    return {rows:rows,total:total};
  }
  var roomSections="";var grandTotal=0;
  selection.forEach(function(item){
    var room=item.room;var wins=item.windows;if(!wins||!wins.length)return;
    var roomSec="";var roomTotal=0;
    wins.forEach(function(w){var wr=buildWinRowsSel([w]);if(!wr.total)return;
      var isV=!!w.variantGroup;var rb=isV?"#eeece9":"#f5ede0";var hc=isV?"#1a1a18":"#1a1a18";
      var wLabel=isV?((w.variantBaseName||w.name)+" \u2014 Wariant "+w.variantLabel):(w.name||"Okno");
      var tRow="<tr style=\"background:"+rb+"\"><td style=\"padding:8px 10px;font-size:11px;font-weight:700;color:"+hc+"\">"+wLabel+"</td>"
              +"<td style=\"padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:"+hc+"\">"+roundTo10(wr.total)+" z\u0142</td></tr>";
      roomSec+="<table style=\"width:100%;border-collapse:collapse;border:1px solid #ede3d9;margin-bottom:3mm;\"><tbody>"+wr.rows+tRow+"</tbody></table>";
      roomTotal+=wr.total;});
    if(!roomTotal)return;grandTotal+=roomTotal;
    var rName=roomBaseName(room);
    roomSections+="<div style=\"margin-bottom:8mm;\"><div style=\"font-size:13px;font-weight:700;color:#1a1a18;letter-spacing:0.04em;text-transform:uppercase;padding:8px 10px;background:#f4f4f2;border-left:3px solid #1a1a18;margin-bottom:3mm;\">"+rName+"</div>"+roomSec+"</div>";
  });
  if(!grandTotal)return null;
  var titleSuffix=setTitle?" \u2014 "+setTitle:"";
  var h="<!DOCTYPE html><html lang=\"pl\"><head><meta charset=\"UTF-8\"><title>"+client.name+" - Oferta Ara\u017c. Okiennych"+titleSuffix+"</title>"+pdfStyles()+"</head><body>"
    +"<div style=\"text-align:center;margin-bottom:8mm;line-height:0;\"><img src=\""+BANNER_PDF_G+"\" style=\"width:520px;max-width:100%;height:auto;display:inline-block;\" alt=\"\"/></div>"
    +"<div class=\"header\" style=\"padding-top:2mm;\">"
    +"<div><img src=\""+LOGO_PDF_G+"\" style=\"height:54px;width:auto;\" alt=\"Porter Design\"/></div>"
    +"<div style=\"text-align:right\"><div style=\"font-size:18px;font-weight:700\">Oferta"+titleSuffix+"</div>"
    +"<div style=\"font-size:10px;color:#1a1a18;font-weight:600;margin-top:2px;\">"+client.name+"</div>"
    +"<div style=\"font-size:9px;color:#6b6b66;margin-top:4px\">Data: "+dateStr+" &nbsp;|&nbsp; Wa\u017cne do: "+validStr+"</div></div></div>"
    +roomSections
    +(montaz>0?"<div style=\"margin-top:6mm;padding:10px 14px;background:#f5ede0;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:3mm;\"><span style=\"font-size:12px;color:#1a1a18;\">Monta\u017c dekoracji okiennych ("+Math.round(montaz*100)+"%):</span><span style=\"font-size:14px;font-weight:700;color:#1a1a18;\">"+roundTo10(grandTotal*montaz)+" z\u0142</span></div>":"")
    +(montaz>0?"<div style=\"margin-bottom:3mm;padding:10px 14px;background:#e8e8e4;border-radius:8px;display:flex;justify-content:space-between;align-items:center;\"><span style=\"font-size:12px;color:#555;font-weight:600;\">\u0141\u0105cznie bez monta\u017cu:</span><span style=\"font-size:14px;font-weight:700;color:#555;\">"+roundTo10(grandTotal)+" z\u0142</span></div>":"")
    +"<div style=\"margin-top:"+(montaz>0?"0":"6mm")+";padding:12px 16px;background:#1a1a18;border-radius:8px;display:flex;justify-content:space-between;align-items:center;\">"
    +"<span style=\"font-size:13px;color:#fff;letter-spacing:0.04em;\">"+(montaz>0?"\u0141\u0105cznie z monta\u017cem":"\u0141\u0105cznie ca\u0142a realizacja")+"</span>"
    +"<span style=\"font-size:20px;font-weight:700;color:#fff;\">"+(montaz>0?roundTo10(grandTotal*(1+montaz)):roundTo10(grandTotal))+" z\u0142</span></div>"
    +"<div class=\"sign-block\"><div class=\"sign\">Wystawi\u0142a<br><strong>Paulina Porter</strong></div><div class=\"sign\">Akceptacja klienta</div></div>"
    +"<div class=\"footer\"><span>"+SELLER.name+" | "+SELLER.city+"</span><span>"+offerNo+"</span></div>"
    +"</body></html>";
  return h;
}


// ── GENEROWANIE MAILA DO KLIENTA ──────────────────────────────────────────
export function generateClientEmail(client){
  var total=roundTo10((client.rooms||[]).reduce(function(a,r){return a+(r.windows||[]).reduce(function(b,w){return b+(w.products||[]).reduce(function(c,p){var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;return c+(p.mp!=null?p.mp:(calc(pfc).total||0));},0);},0);},0));
  var zaliczka=roundTo10(total*0.5);
  var clientTitle=client.gender==="male"?"Pana":"Pani";
  var mail="Dzień dobry,\n\nW nawiązaniu do rozmowy / spotkania / przesłanych wymiarów, przesyłam w załączeniu PDF z uproszczoną, przybliżoną wyceną "+(client.gender==="male"?"Pana":"Pani")+" zamówienia.\n\nŁączna orientacyjna wartość realizacji: "+total+" zł brutto\n(zaliczka 50% = "+zaliczka+" zł)\n\nCzas realizacji: ok. 4 tygodnie od akceptacji i wpłaty zaliczki w wysokości 50% wartości zamówienia.\n\nChętnie przyjadę z wzornikami tkanin, aby dobrać kolor i fakturę do wnętrza.\n\nKoszt pomiaru z dojazdem wynosi 250 zł brutto i jest w całości odliczany od wartości zamówienia, jeśli przekracza ono 6 000 zł brutto.\n\nPozdrawiam serdecznie,\nPaulina Porter\nPorter Design\nTel.: "+SELLER.tel+"\nE-mail: "+SELLER.email;
  return mail;
}


// ── Helper: zbiera opcje szycia zasłon i generuje blok „opcji” pod tabelą ──
// ── Helper: opcje szycia zasłon — z modalu (sewOpts) lub agregowane z wierszy ──
function buildCurtainOptionsHTML(curtainRows, sewOpts){
  if(!curtainRows.length)return '';
  var items=[];
  if(sewOpts){
    // Użyj wartości z modalu
    if(sewOpts.leadInSides)items.push('<strong>Ołów w bokach:</strong> tak');
    if(sewOpts.tasmaNaStojaco)items.push('<strong>Taśma na stojąco:</strong> tak');
    if(sewOpts.podszewka)items.push('<strong>Podszewka:</strong> '+(sewOpts.podszewkaNazwa||'tak'));
    if(sewOpts.ryszka)items.push('<strong>Wysokość ryszki:</strong> '+(sewOpts.ryszkaNazwa||''));
    if(sewOpts.tasmyH)items.push('<strong>Wysokość taśmy:</strong> '+(sewOpts.tasmyHNazwa||''));
    if(sewOpts.glide)items.push('<strong>Odstępy między ślizgami (Wave):</strong> '+(sewOpts.glideNazwa||''));
  }else{
    // Fallback: agreguj z wierszy
    var hasLead=curtainRows.some(function(r){return r.leadInSides==='tak';});
    var hasTasmaNaStojaco=curtainRows.some(function(r){return r.tasmaNaStojaco==='tak';});
    var pv=[];curtainRows.forEach(function(r){if(r.podszewka&&r.podszewka!=='nie'&&r.podszewka!=='-'){var v=r.podszewka;if(pv.indexOf(v)<0)pv.push(v);}});
    var tv=[];curtainRows.forEach(function(r){if(r.tasma&&r.tasma!=='-'){var v=r.tasma;if(tv.indexOf(v)<0)tv.push(v);}});
    var hv=[];curtainRows.forEach(function(r){if(r.haczyk&&r.haczyk!=='-'){var v=r.haczyk;if(hv.indexOf(v)<0)hv.push(v);}});
    var gv=[];curtainRows.forEach(function(r){if(r.glide&&r.glide!=='-'){var v=r.glide;if(gv.indexOf(v)<0)gv.push(v);}});
    if(hasLead)items.push('<strong>Ołów w bokach:</strong> tak');
    if(hasTasmaNaStojaco)items.push('<strong>Taśma na stojąco:</strong> tak');
    if(pv.length)items.push('<strong>Podszewka:</strong> '+pv.join(', '));
    if(hv.length)items.push('<strong>Wysokość ryszki:</strong> '+hv.join(' / '));
    if(tv.length)items.push('<strong>Wysokość taśmy:</strong> '+tv.join(' / '));
    if(gv.length)items.push('<strong>Odstępy między ślizgami (Wave):</strong> '+gv.join(' / '));
  }
  if(!items.length)return '';
  return '<div style="margin:4mm 0 6mm;padding:8px 14px;border:1px solid #c8c8c4;border-radius:5px;background:#f9f9f7;font-size:11px;line-height:1.9;">'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b6b66;margin-bottom:4px;">Dodatkowe informacje</div>'
    +items.join(' &nbsp;&bull;&nbsp; ')
    +'</div>';
}

export function generateSewingOrderPDF(client, modalData){
  var rows=buildSewingRows(client);
  if(!rows.length){alert("Brak pozycji szycia.");return;}
  var sewingHouse=modalData.sewingHouse||"";
  var notes=modalData.notes||"";
  var termStr=modalData.term||"________________";
  var termCurtainsStr=modalData.termCurtains||termStr;
  var termRoletyStr=modalData.termRolety||termStr;
  var attachB64=modalData.attachB64||null;
  var now=new Date();var dateStr=now.toLocaleDateString("pl-PL");
  var totalMetry=rows.reduce(function(a,r){return a+r.metry;},0);

  var curtainRows=rows.filter(function(r){return r._type!=="roleta";});
  var romanRows=rows.filter(function(r){return r._type==="roleta";});
  var hasBothTypes=curtainRows.length>0&&romanRows.length>0;

  // Tabela zasłon/firan — uproszczone kolumny
  var tableHeader=["Lp.","Pomieszczenie","Model szycia","Tkanina / Kolor","Producent","Szerokość","Wysokość","Podział","Uwagi"];
  var tableRows=curtainRows.map(function(r,i){
    var modelStr=r.szStyle+(r.marszczenie&&r.marszczenie!=='-'?' '+r.marszczenie:'');
    var tkaninaPlusKolor='<strong>'+r.fabric+'</strong>'+(r.kolor&&r.kolor!=='-'?'<br><span style="color:#6b6b66;font-size:10px">'+r.kolor+'</span>':'');
    return [
      String(i+1),
      r.room,
      modelStr,
      tkaninaPlusKolor,
      r.prod||'-',
      r.wCm?(r.wCm+' cm'):'-',
      r.hCm?(r.hCm+' cm'):'-',
      r.split,
      r.note||''
    ];
  });
  // RAZEM row removed
  var curtainOptionsHTML=buildCurtainOptionsHTML(curtainRows,modalData.sewOpts||null);

  // Tabela rolet rzymskich
  var romanHeader=["Lp.","Pomieszczenie","Model szycia","Tkanina / Kolor","Producent",
    "Szerokość","Wysokość","Wys. nadproża",
    "Mechanizm","Strona łańcuszka","Kolor łańcuszka","Uwagi"];
  var romanTableRows=romanRows.map(function(r,i){
    var tkR="<strong>"+r.fabric+"</strong>"+(r.kolor&&r.kolor!=="-"?"<br><span style=\"color:#6b6b66;font-size:10px\">"+r.kolor+"</span>":"");
    return [String(i+1),r.room,(r.type||"-").replace(/^[^(]+\((.+)\)$/,"$1"),tkR,r.prod||"-",
      r.wCm?(r.wCm+" cm"):"-",r.hCm?(r.hCm+" cm"):"-",
      r.nadprozeCm&&r.nadprozeCm!=="-"?(r.nadprozeCm+" cm"):"-",
      r.rSystem||"-",r.stronaObslugi||"-",r.kolorLancuszka||"-",
      r.note||""];
  });

  var rOI=["<strong>Mechanizm system zamknięty</strong>","<strong>Szprosy 6mm w opcji front</strong>","<strong>Sprawdzenie tkaniny przed szyciem</strong>","<strong>Oznaczenie DUO: ① Zasłona, ② Firana</strong>"];
  var hBcz=romanRows.some(function(r){return r.boczki&&r.boczki!=="nie"&&r.boczki!=="-";});
  if(hBcz)rOI.push("<strong>Boczki/maskownice:</strong> tak");
  var pvRr=[];romanRows.forEach(function(r){if(r.podszewka&&r.podszewka!=="nie"&&r.podszewka!=="-"){var v=r.podszewka;if(pvRr.indexOf(v)<0)pvRr.push(v);}});
  if(pvRr.length)rOI.push("<strong>Podszewka:</strong> "+pvRr.join(", "));
  var romanOptsHTML='<div style="margin:4mm 0 6mm;padding:8px 14px;border:1px solid #c8c8c4;border-radius:5px;background:#f9f9f7;font-size:11px;line-height:1.9;"><div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b6b66;margin-bottom:4px;">Dodatkowe informacje</div>'+rOI.join(" &nbsp;&bull;&nbsp; ")+'</div>';
  var notesFieldHTML=''; // uwagi są już w kolumnie tabeli — nie powielamy

  var _sh=sewingHouse||'';var _shParts=_sh.split(' — ');var _shName=_shParts[0]||_sh;var _shAddr=_shParts.slice(1).join(' — ');
  var _shAddrParts=_shAddr?_shAddr.split(', '):[]; var _shStreet=_shAddrParts[0]||''; var _shCity=_shAddrParts.slice(1).join(', ');
  var sewHouseBlock=sewingHouse
    ?('<strong style="font-size:12px;font-weight:700">'+_shName.toUpperCase().replace(/</g,'&lt;')+'</strong>'+(_shStreet?'<br><span style="font-size:12px">'+_shStreet.replace(/</g,'&lt;')+'</span>':'')+(_shCity?'<br><span style="font-size:12px">'+_shCity.replace(/</g,'&lt;')+'</span>':''))
    :'<div style="color:#a8a8a4;font-style:italic;font-size:10px">____________________________<br>____________________________<br>____________________________</div>';

  var notesBlock=notes
    ?'<div class="notes"><strong>Uwagi do zlecenia:</strong><br>'+notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div>'
    :'';

  var extraStyles=`
    body{font-size:13px;}
    table{font-size:12px;border-collapse:collapse!important;border:1.5px solid #999!important;}
    caption{font-size:11px;}
    th{font-size:10px;padding:5px 8px;border:1px solid #999!important;background:#ebebeb!important;}
    td{padding:5px 8px;font-size:12px;line-height:1.5;border:1px solid #bbb!important;vertical-align:top;}
    tr:nth-child(even) td{background:#fafaf8;}
  `;

  var html='<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Zlecenie szycia</title>'
    +pdfStyles().replace('@media print{@page{size:A4;','@media print{@page{size:A4 landscape;')
    .replace('</style>',extraStyles+'</style>')
    +'</head><body>'
    +'<div class="header"><div><img src="'+LOGO_PDF_G+'" style="height:50px;width:auto;" alt="Porter Design"/></div>'
    +'<div style="text-align:right"><div style="font-size:20px;font-weight:700">Zlecenie szycia</div>'
    +'<div style="font-size:11px;color:#6b6b66;margin-top:4px">Data: '+dateStr+' &nbsp;|&nbsp; Klient: <strong>'+client.name+'</strong></div></div></div>'
    +'<div class="meta">'
    +'<div class="meta-block"><h4>Zleceniodawca</h4><p><strong style="font-weight:700">PD PORTER DESIGN</strong><br>'+SELLER.addr+'<br>'+SELLER.city+'<br>'+SELLER.tel+'<br>'+SELLER.email+'</p></div>'
    +'<div class="meta-block"><h4>Szwalnia</h4>'+sewHouseBlock+'</div>'
    +'<div class="meta-block"><h4>Klient ko\u0144cowy</h4><p><strong>'+client.name+'</strong></p>'
    +'<p style="margin-top:6px;font-size:9px;color:#6b6b66">Termin: <strong>'+termStr+'</strong></p>'+'</div>'
    +'</div>'
    +(curtainRows.length?makeTableHTML(tableHeader,tableRows,"Zasłony i firany — specyfikacja szycia",['3%','11%','7%','14%','7%','7%','7%','13%','31%'])+curtainOptionsHTML:"")
    +(romanRows.length?makeTableHTML(romanHeader,romanTableRows,"Rolety rzymskie \u2014 specyfikacja szycia",['3%','10%','11%','12%','8%','5%','5%','6%','7%','8%','8%','17%'])+romanOptsHTML+notesFieldHTML:"")
    +notesBlock

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

  openPDFWindow(html,"Zlecenie szycia - "+(client.name||""),{landscape:true});
}


// ── UI COMPONENTS ──────────────────────────────────────────────────────────

export function generateSewingOrderPDFFromRows(rows, client, modalData){
  if(!rows.length){alert('Brak wybranych pozycji.');return;}
  var sewingHouse=modalData.sewingHouse||'';
  var notes=modalData.notes||'';
  var termStr=modalData.term||'________________';
  var termCurtainsStr2=modalData.termCurtains||termStr;
  var termRoletyStr2=modalData.termRolety||termStr;
  var attachB64=modalData.attachB64||null;
  var now=new Date();var dateStr=now.toLocaleDateString('pl-PL');
  var curtainRows2=rows.filter(function(r){return r._type!=='roleta';});
  var romanRows2=rows.filter(function(r){return r._type==='roleta';});
  var hasBothTypes2=curtainRows2.length>0&&romanRows2.length>0;
  var tableHeader=['Lp.','Pomieszczenie','Model szycia','Tkanina / Kolor','Producent','Szerokość','Wysokość','Podział','Uwagi'];
  var tableRows=curtainRows2.map(function(r,i){
    var modelStr=r.szStyle+(r.marszczenie&&r.marszczenie!=='-'?' '+r.marszczenie:'');
    var tkaninaPlusKolor='<strong>'+r.fabric+'</strong>'+(r.kolor&&r.kolor!=='-'?'<br><span style="color:#6b6b66;font-size:10px">'+r.kolor+'</span>':'');
    return [String(i+1),r.room,modelStr,tkaninaPlusKolor,r.prod||'-',
      r.wCm?(r.wCm+' cm'):'-',r.hCm?(r.hCm+' cm'):'-',
      r.split,r.note||''];
  });
  var curtainOptionsHTML2=buildCurtainOptionsHTML(curtainRows2,modalData.sewOpts||null);
  var romanHeader2=['Lp.','Pomieszczenie','Model szycia','Tkanina / Kolor','Producent',
    'Szerokość','Wysokość','Wys. nadproża',
    'Mechanizm','Strona łańcuszka','Kolor łańcuszka','Uwagi'];
  var romanTableRows2=romanRows2.map(function(r,i){
    var tkR2='<strong>'+r.fabric+'</strong>'+(r.kolor&&r.kolor!=='-'?'<br><span style="color:#6b6b66;font-size:10px">'+r.kolor+'</span>':'');
    return [String(i+1),r.room,(r.type||'-').replace(/^[^(]+\((.+)\)$/,'$1'),tkR2,r.prod||'-',
      r.wCm?(r.wCm+' cm'):'-',r.hCm?(r.hCm+' cm'):'-',
      r.nadprozeCm&&r.nadprozeCm!=='-'?(r.nadprozeCm+' cm'):'-',
      r.rSystem||'-',r.stronaObslugi||'-',r.kolorLancuszka||"-",
      r.note||''];
  });
  var rOI2=['<strong>Mechanizm system zamknięty</strong>','<strong>Szprosy 6mm w opcji front</strong>','<strong>Sprawdzenie tkaniny przed szyciem</strong>','<strong>Oznaczenie DUO: ① Zasłona, ② Firana</strong>'];
  var hBcz2=romanRows2.some(function(r){return r.boczki&&r.boczki!=='nie'&&r.boczki!=='-';});
  if(hBcz2)rOI2.push('<strong>Boczki/maskownice:</strong> tak');
  var pvRr2=[];romanRows2.forEach(function(r){if(r.podszewka&&r.podszewka!=='nie'&&r.podszewka!=='-'){var v=r.podszewka;if(pvRr2.indexOf(v)<0)pvRr2.push(v);}});
  if(pvRr2.length)rOI2.push('<strong>Podszewka:</strong> '+pvRr2.join(', '));
  var romanOptsHTML2='<div style="margin:4mm 0 6mm;padding:8px 14px;border:1px solid #c8c8c4;border-radius:5px;background:#f9f9f7;font-size:11px;line-height:1.9;"><div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b6b66;margin-bottom:4px;">Dodatkowe informacje</div>'+rOI2.join(' &nbsp;&bull;&nbsp; ')+'</div>';
  var notesFieldHTML2=''; // uwagi są już w kolumnie tabeli — nie powielamy
  var _sh2=sewingHouse||'';var _shParts2=_sh2.split(' — ');var _shName2=_shParts2[0]||_sh2;var _shAddr2=_shParts2.slice(1).join(' — ');
  var _shAddrParts2=_shAddr2?_shAddr2.split(', '):[]; var _shStreet2=_shAddrParts2[0]||''; var _shCity2=_shAddrParts2.slice(1).join(', ');
  var sewHouseBlock=sewingHouse
    ?('<strong style="font-size:12px;font-weight:700">'+_shName2.toUpperCase().replace(/</g,'&lt;')+'</strong>'+(_shStreet2?'<br><span style="font-size:12px">'+_shStreet2.replace(/</g,'&lt;')+'</span>':'')+(_shCity2?'<br><span style="font-size:12px">'+_shCity2.replace(/</g,'&lt;')+'</span>':''))
    :'<div style="color:#a8a8a4;font-style:italic;font-size:10px">____________________________<br>____________________________</div>';
  var notesBlock=notes?('<div class="notes"><strong>Uwagi:</strong><br>'+notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div>'):""; 
  var extraStyles='body{font-size:13px;}table{font-size:12px;border-collapse:collapse!important;border:1.5px solid #999!important;}caption{font-size:11px;}th{font-size:10px;padding:5px 8px;border:1px solid #999!important;background:#ebebeb!important;}td{padding:5px 8px;font-size:12px;line-height:1.5;border:1px solid #bbb!important;vertical-align:top;}tr:nth-child(even) td{background:#fafaf8;}';
  var h='<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Zlecenie szycia</title>'
    +pdfStyles().replace('@media print{@page{size:A4;','@media print{@page{size:A4 landscape;}')
    .replace('</style>',extraStyles+'</style>')
    +'</head><body>'
    +'<div class="header"><div><img src="'+LOGO_PDF_G+'" style="height:50px;width:auto;" alt="Porter Design"/></div>'
    +'<div style="text-align:right"><div style="font-size:20px;font-weight:700">Zlecenie szycia</div>'
    +'<div style="font-size:11px;color:#6b6b66;margin-top:4px">Data: '+dateStr+'</div></div></div>'
    +'<div class="meta">'
    +'<div class="meta-block"><h4>Zleceniodawca</h4><p><strong style="font-weight:700">PD PORTER DESIGN</strong><br>'+SELLER.addr+'<br>'+SELLER.city+'<br>'+SELLER.tel+'<br>'+SELLER.email+'</p></div>'
    +'<div class="meta-block"><h4>Szwalnia</h4>'+sewHouseBlock+'</div>'
    +'<div class="meta-block"><h4>Klient ko\u0144cowy</h4><p><strong>'+(client.name||'')+'</strong></p>'
    +'<p style="font-size:9px;color:#6b6b66;margin-top:4px">Termin: <strong>'+termStr+'</strong></p>'+'</div>'
    +'</div>'
    +(curtainRows2.length?makeTableHTML(tableHeader,tableRows,'Zasłony i firany — specyfikacja szycia',['3%','11%','7%','14%','7%','7%','7%','13%','31%'])+curtainOptionsHTML2:'')
    +(romanRows2.length?makeTableHTML(romanHeader2,romanTableRows2,'Rolety rzymskie \u2014 specyfikacja szycia',['3%','10%','11%','12%','8%','5%','5%','6%','7%','8%','8%','17%'])+romanOptsHTML2+notesFieldHTML2:'')
    +notesBlock
    +'</body></html>';
  openPDFWindow(h,'Zlecenie szycia - '+(client.name||''),{landscape:true});
  if(attachB64){
    setTimeout(function(){
      var w2=window.open('','_blank','width=900,height=700');
      if(w2){w2.document.open();w2.document.write('<html><body style="margin:0"><iframe src="'+attachB64+'" style="width:100%;height:100vh;border:none"></iframe></body></html>');w2.document.close();}
    },800);
  }
}
