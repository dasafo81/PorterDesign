import { mg, calc, getPanelsForProd, roundTo10 } from '../constants/data.js';
import { sbApi } from './supabase.js';

// ── POLECENIA / PROWIZJE ─────────────────────────────────────────────────────
// Polecający wystawiają faktury NAM. Żeby wiedzieli, na jaką kwotę, w Faktury → Wydatki
// powstaje dla każdego polecającego i miesiąca nieksięgowe "Zestawienie prowizji"
// (doc_type "prowizja"), które samo się uzupełnia w miarę jak kolejni klienci opłacają FV 50%.

export const ACQ_DIRECT="porterdesign.pl";
// Lista "Skąd klient" w karcie deala; każda pozycja poza kanałem własnym (ACQ_DIRECT) to polecający.
export const ACQUISITION_OPTIONS=["",ACQ_DIRECT,"HomeStead Spółka z Ograniczoną Odpowiedzialnością","Wnętrza Part Karina Roman","Teresa Pyszkiewicz","Maja Dembowska Studio Architektury"];
export const DOC_PROWIZJA="prowizja";
var VAT_REFERRER=23;

// Rozbicie wyceny na pomieszczenia — do podglądu w karcie deala.
// Zwraca surowe (niezaokrąglone) sumy; zaokrąglanie ma miejsce raz, na końcu,
// tak samo jak w PDF (pdf.js), żeby wartości w Kanbanie / karcie deala / PDF się zgadzały.
export function dealQuoteBreakdown(cl){
  if(!cl||!cl.rooms)return {rooms:[],total:0,base:0};
  var comm=parseFloat(cl.commission)||0;
  var rooms=[];
  var base=0;
  (cl.rooms||[]).forEach(function(r){
    var wins=r.windows||[];
    var groups={};
    var roomSum=0;
    wins.forEach(function(w){
      var wVal=(w.products||[]).reduce(function(c,p){
        var pfc=(p.type==="zaslona"||p.type==="firana")?mg(p,{panels:getPanelsForProd(p)}):p;
        return c+(p.mp!=null?p.mp:(calc(pfc).total||0));
      },0);
      if(w.variantGroup){
        if(!groups[w.variantGroup])groups[w.variantGroup]=[];
        groups[w.variantGroup].push({w:w,val:wVal});
      } else {
        roomSum+=wVal;
      }
    });
    Object.keys(groups).forEach(function(gid){
      var sorted=groups[gid].slice().sort(function(a,b){return(a.w.variantLabel||"").localeCompare(b.w.variantLabel||"");});
      roomSum+=sorted[0].val;
    });
    base+=roomSum;
    if(roomSum>0){
      rooms.push({name:r.name||"Pomieszczenie",total:comm>0?roomSum*(1+comm/100):roomSum});
    }
  });
  var total=rooms.reduce(function(a,x){return a+x.total;},0);
  return {rooms:rooms,total:total,base:base};
}


// Prowizja BRUTTO dla polecającego = wartość wiersza "Polecenie" z Podsumowania:
// Polecenie % liczy się wyłącznie od pozycji wyceny — montaż, rabat i koszt wizyty nie wchodzą do podstawy.
export function referralGross(cl){
  if(!cl||!((parseFloat(cl.commission)||0)>0))return 0;
  var b=dealQuoteBreakdown(cl);
  return Math.max(0,roundTo10(b.total)-roundTo10(b.base));
}

function normPartyName(n){
  return String(n||"").toLowerCase()
    .replace(/sp[óo]łka z ograniczon[aą] odpowiedzialno[śs]ci[aą]|sp\.?\s*z\s*o\.?\s*o\.?/g,"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l")
    .replace(/[^a-z0-9]/g,"");
}
// Kontrahent o nazwie zbliżonej do polecającego z listy "Skąd klient" (null = brak w bazie kontrahentów)
export function findReferrerContact(name,contacts){
  var key=normPartyName(name);
  if(!key)return null;
  return (contacts||[]).find(function(c){
    var ck=normPartyName(c.name);
    return ck.length>=5&&(ck===key||ck.indexOf(key)>=0||key.indexOf(ck)>=0);
  })||null;
}
function hasNip(c){return !!(c&&String(c.nip||"").replace(/\D/g,"").length>=10);}

function r2(v){return +(+v).toFixed(2);}
function lineFromGross(gross,vr){
  var net=vr>0?r2(gross/(1+vr/100)):r2(gross);
  return {unit_net:net,line_net:net,line_vat:r2(gross-net),line_gross:r2(gross)};
}
function monthEnd(ym){
  var y=+ym.slice(0,4),m=+ym.slice(5,7);
  return ym+"-"+String(new Date(y,m,0).getDate()).padStart(2,"0");
}

// Przelicza wszystkie zestawienia prowizji z aktualnych zleceń. Idempotentne: dokument jest
// tworzony/aktualizowany tylko gdy się zmienił. Zwraca Promise<boolean> — czy coś zapisano.
// ctx (opcjonalnie): {invoices,deals,clients,entities} gdy wywołujący już je ma.
export function syncReferralStatements(ctx){
  ctx=ctx||{};
  return Promise.all([
    ctx.invoices||sbApi.getInvoices(),
    ctx.deals||sbApi.getDeals(),
    ctx.clients||sbApi.getClients(),
    ctx.entities||sbApi.getEntities().catch(function(){return [];}),
    sbApi.getContacts().catch(function(){return [];})
  ]).then(function(res){
    var invoices=res[0]||[],deals=res[1]||[],clients=res[2]||[],entities=res[3]||[],contacts=res[4]||[];
    var isSale=function(x){
      var dir=x.direction||(x.doc_type==="zakup"?"zakup":"sprzedaz");
      return dir!=="zakup"&&x.doc_type!=="korekta"&&x.doc_type!=="proforma"&&x.status!=="cancelled";
    };
    var sales=invoices.filter(isSale);
    var paidIn=function(x){
      var g=+x.total_gross||0;
      if(!(g>0))return false;
      var amt=(x.payment_status==="paid"||(x.paid&&x.payment_status!=="partial"))?g:(x.payment_status==="partial"?(+x.paid_amount||0):0);
      return amt>=g;
    };
    // grupy: polecający|miesiąc
    var groups={};
    deals.forEach(function(d){
      var ref=d.acquisition;
      if(!ref||ref===ACQ_DIRECT||ACQUISITION_OPTIONS.indexOf(ref)<0)return;
      var cl=clients.find(function(c){return String(c.id)===String(d.client_id);});
      var gross=referralGross(cl);
      if(!(gross>0))return;
      var mine=sales.filter(function(x){return String(x.deal_id||"")===String(d.id);});
      if(!mine.length)mine=sales.filter(function(x){return !x.deal_id&&x.client_id&&String(x.client_id)===String(cl.id);});
      mine.sort(function(a,b){return String(a.issue_date||a.created_at||"").localeCompare(String(b.issue_date||b.created_at||""));});
      var first=mine[0];
      // Do miesiąca wlicza się wg daty wystawienia FV 50% — system nie zapisuje daty jej opłacenia
      if(!first||!paidIn(first)||!first.issue_date)return;
      var month=String(first.issue_date).slice(0,7);
      var key=ref+"|"+month;
      if(!groups[key])groups[key]={ref:ref,month:month,rows:[]};
      groups[key].rows.push({cl:cl,first:first,gross:gross,pct:parseFloat(cl.commission)||0});
    });

    var ent=entities.find(function(e){return e.is_default;})||entities[0]||{};
    var writes=Object.keys(groups).map(function(key){
      var g=groups[key];
      var contact=findReferrerContact(g.ref,contacts);
      var vr=hasNip(contact)?VAT_REFERRER:0;
      g.rows.sort(function(a,b){return String(a.cl.name||"").localeCompare(String(b.cl.name||""));});
      var items=g.rows.map(function(r,i){
        return Object.assign({position:i+1,
          name:"Polecenie: "+(r.cl.name||"klient")+" (FV "+(r.first.number||"—")+", "+r.pct+"% od wyceny bez montażu)",
          quantity:1,unit:"szt",vat_rate:vr,pkwiu:""},lineFromGross(r.gross,vr));
      });
      var tNet=r2(items.reduce(function(a,it){return a+it.line_net;},0));
      var tGross=r2(items.reduce(function(a,it){return a+it.line_gross;},0));
      var tVat=r2(tGross-tNet);
      var existing=invoices.find(function(x){
        return x.doc_type===DOC_PROWIZJA&&String((x.seller_snapshot&&x.seller_snapshot.name)||"")===g.ref&&String(x.issue_date||"").slice(0,7)===g.month;
      });
      if(existing&&Math.abs((+existing.total_gross||0)-tGross)<0.005&&Math.abs((+existing.total_net||0)-tNet)<0.005)return Promise.resolve(false);
      var slug=normPartyName(g.ref).toUpperCase().slice(0,12);
      var header={
        doc_type:DOC_PROWIZJA,direction:"zakup",
        issue_date:monthEnd(g.month),sale_date:monthEnd(g.month),
        payment_method:"przelew",
        contact_id:contact?contact.id:null,
        buyer_name:ent.name||"",buyer_nip:ent.nip||"",buyer_address:ent.address||"",buyer_postal:ent.postal||"",buyer_city:ent.city||"",buyer_email:ent.email||"",
        seller_snapshot:{name:g.ref,nip:contact?contact.nip||"":"",address:contact?contact.street||"":"",postal:contact?contact.postal||"":"",city:contact?contact.city||"":"",email:contact?contact.email||"":"",phone:"",bank:contact?contact.bank||"":""},
        notes:"Zestawienie należnych prowizji za polecenia — dokument nieksięgowy"+(vr?"":" (polecający bez NIP — kwota bez VAT)"),
        total_net:tNet,total_vat:tVat,total_gross:tGross
      };
      var save;
      if(existing){
        save=sbApi.updateInvoice(existing.id,header).then(function(){return existing.id;});
      } else {
        header.number="PROW/"+g.month.slice(5,7)+"/"+g.month.slice(0,4)+"/"+slug;
        header.status="received";
        if(ent.id)header.entity_id=ent.id;
        save=sbApi.addInvoice(header).then(function(inv){return inv.id||(inv[0]&&inv[0].id);});
      }
      return save.then(function(id){return sbApi.replaceInvoiceItems(id,items);}).then(function(){return true;});
    });
    return Promise.all(writes).then(function(r){return r.some(Boolean);});
  });
}

// Wydruk/PDF zestawienia — do wysłania polecającemu na koniec miesiąca
export function buildCommissionStatementHtml(inv){
  var snap=inv.seller_snapshot||{};
  var items=inv.invoice_items||[];
  var esc=function(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");};
  var m=function(v){return (+v||0).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})+" zł";};
  var ym=String(inv.issue_date||"").slice(0,7);
  var period=ym?ym.slice(5,7)+"/"+ym.slice(0,4):"";
  var hasVat=items.some(function(it){return +it.vat_rate>0;});
  var rows=items.map(function(it,i){
    return "<tr><td>"+(i+1)+"</td><td>"+esc(it.name)+"</td><td class=r>"+m(it.line_net)+"</td><td class=r>"+m(it.line_gross)+"</td></tr>";
  }).join("");
  var buyer=[inv.buyer_name,inv.buyer_nip?"NIP "+inv.buyer_nip:"",inv.buyer_address,[inv.buyer_postal,inv.buyer_city].filter(Boolean).join(" ")].filter(Boolean).map(esc).join("<br>");
  return "<!doctype html><html><head><meta charset=utf-8><title>Zestawienie prowizji "+esc(period)+"</title><style>"
    +"body{font-family:Arial,sans-serif;color:#222;max-width:760px;margin:30px auto;padding:0 20px;font-size:13px}"
    +"h1{font-size:20px;margin:0 0 4px}.muted{color:#666}table{width:100%;border-collapse:collapse;margin:18px 0}"
    +"th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#666}.r{text-align:right}"
    +".tot td{font-weight:700;border-top:2px solid #222}.box{background:#f5f5f2;border-radius:8px;padding:12px 14px;margin-top:14px}"
    +"</style></head><body>"
    +"<h1>Zestawienie należnych prowizji — "+esc(period)+"</h1>"
    +"<div class=muted>Dokument nieksięgowy, nie jest fakturą · "+esc(inv.number||"")+"</div>"
    +"<p><b>Dla:</b> "+esc(snap.name||"")+(snap.nip?" · NIP "+esc(snap.nip):"")+"</p>"
    +"<table><thead><tr><th>#</th><th>Polecenie</th><th class=r>Netto</th><th class=r>Brutto</th></tr></thead><tbody>"+rows
    +"<tr class=tot><td></td><td>Razem do zafakturowania</td><td class=r>"+m(inv.total_net)+"</td><td class=r>"+m(inv.total_gross)+"</td></tr></tbody></table>"
    +"<div class=box>Prosimy o wystawienie faktury"+(hasVat?" na kwotę netto <b>"+m(inv.total_net)+"</b> (brutto <b>"+m(inv.total_gross)+"</b>)":" na kwotę <b>"+m(inv.total_gross)+"</b>")
    +" na dane:<br><br>"+buyer+"</div>"
    +"<p class=muted>Zestawienie jest aktualizowane na bieżąco — kolejne polecenia opłacone w miesiącu zwiększają kwotę.</p>"
    +"</body></html>";
}
