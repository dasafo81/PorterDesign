// api/ksef/receive.js — KSeF API 2.0
// POST { accessToken, baseUrl, direction, dateFrom?, dateTo? }
// direction: "incoming" | "outgoing" | "all"
// Używa POST /invoices/query/metadata (InvoiceQueryFilters, dateType=Issue) z paginacją pageOffset/pageSize

export const config = { runtime: 'edge' };
const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function cors() { return { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' }; }
function jsonRes(d,s){ return new Response(JSON.stringify(d),{status:s||200,headers:Object.assign({'Content-Type':'application/json'},cors())}); }

async function verifyUser(req) {
  const SVC=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!SVC) return {ok:false,status:500,message:'SUPABASE_SERVICE_ROLE_KEY not set'};
  const auth=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!auth) return {ok:false,status:401,message:'missing jwt'};
  const r=await fetch(`${SB_URL}/auth/v1/user`,{headers:{apikey:SVC,Authorization:`Bearer ${auth}`}});
  if(!r.ok) return {ok:false,status:401,message:'invalid jwt'};
  const u=await r.json();
  const tid=u&&u.app_metadata&&u.app_metadata.tenant_id;
  if(!tid) return {ok:false,status:403,message:'no tenant_id'};
  return {ok:true,tenantId:tid,service:SVC};
}

function xmlVal(xml,tag) {
  const m=xml.match(new RegExp('<(?:[\\w]+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?'+tag+'>','i'));
  return m?m[1].trim():'';
}
function xmlBlock(xml,tag) {
  const m=xml.match(new RegExp('<(?:[\\w]+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?'+tag+'>','i'));
  return m?m[0]:'';
}
function xmlAll(xml,tag) {
  const re=new RegExp('<(?:[\\w]+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?'+tag+'>','gi');
  const out=[]; let m;
  while((m=re.exec(xml))!==null) out.push(m[0]);
  return out;
}
function numVal(s) { return parseFloat(String(s||'').replace(',','.')) || 0; }

// Termin płatności — Platnosc→TerminPlatnosci→Termin, lub DataZaplaty, w kilku możliwych lokalizacjach
// (ta sama logika co supabase/functions/ksef-invoice/index.ts, żeby sync od razu zapisywał poprawny termin)
function parseDueDate(xml,fa) {
  const platnosc = xmlBlock(fa,'Platnosc') || xmlBlock(xml,'Platnosc');
  if (platnosc) {
    const tpBlock = xmlBlock(platnosc,'TerminPlatnosci');
    const termin = tpBlock ? (xmlVal(tpBlock,'Termin') || xmlVal(tpBlock,'Dni')) : '';
    if (termin) {
      if (/^\d{4}-\d{2}-\d{2}/.test(termin)) return termin.slice(0,10);
      if (/^\d+$/.test(termin)) return termin+' dni';
      return termin;
    }
    const dz = xmlVal(platnosc,'DataZaplaty');
    if (dz) return dz.slice(0,10);
  }
  const raw = xmlVal(fa,'DataZaplaty') || xmlVal(fa,'TerminPlatnosci') || '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  if (raw.includes('<')) {
    const inner = xmlVal(raw,'Termin') || xmlVal(raw,'DataZaplaty');
    if (inner && /^\d{4}-\d{2}-\d{2}/.test(inner)) return inner.slice(0,10);
  }
  return raw;
}

function parseParty(block) {
  return {
    nip: xmlVal(block,'NIP'),
    name: xmlVal(block,'PelnaNazwa')||xmlVal(block,'Nazwa'),
    address: xmlVal(block,'AdresL1')||[xmlVal(block,'Ulica'),xmlVal(block,'NrDomu'),xmlVal(block,'NrLokalu')].filter(Boolean).join(' '),
    addrLine2: xmlVal(block,'AdresL2')||[xmlVal(block,'KodPocztowy'),xmlVal(block,'Miejscowosc')].filter(Boolean).join(' '),
    postal: xmlVal(block,'KodPocztowy'),
    city: xmlVal(block,'Miejscowosc'),
    email: xmlVal(block,'Email'),
    phone: xmlVal(block,'Telefon'),
  };
}

function parseFA(xml) {
  const fa = xmlBlock(xml,'Fa');
  const p1 = xmlBlock(xml,'Podmiot1'); // sprzedawca na fakturze
  const p2 = xmlBlock(xml,'Podmiot2'); // nabywca na fakturze
  const seller = parseParty(p1);
  const buyer = parseParty(p2);
  // Numer konta bankowego sprzedawcy (jeśli jest w XML)
  const platnoscB = xmlBlock(fa,'Platnosc')||xmlBlock(xml,'Platnosc');
  const rachunek = platnoscB ? xmlBlock(platnoscB,'RachunekBankowy') : '';
  const bank = rachunek ? (xmlVal(rachunek,'NrRB')||xmlVal(rachunek,'IBAN')||'') : '';

  return {
    number: xmlVal(xml,'P_2')||xmlVal(xml,'NrFaKSeF'),
    issue_date: xmlVal(xml,'P_1'),
    sale_date: xmlVal(xml,'P_1M')||xmlVal(xml,'P_1'),
    due_date: parseDueDate(xml,fa),
    total_gross: +(xmlVal(xml,'P_15')||0),
    total_net: +(xmlVal(xml,'P_13_Razem')||0),
    total_vat: +(xmlVal(xml,'P_14_Razem')||0),
    currency: xmlVal(xml,'KodWaluty')||'PLN',
    notes: xmlVal(xml,'P_Opis'),
    seller_nip: seller.nip||'', seller_name: seller.name||'',
    buyer_nip: buyer.nip||'',  buyer_name: buyer.name||'',
    seller_party: seller, buyer_party: buyer, bank: bank,
  };
}

async function queryInvoices(baseUrl, accessToken, subjectType, dateFrom, dateTo) {
  // KSeF 2.0: POST /invoices/query/metadata z body InvoiceQueryFilters.
  // dateType: "Issue" = filtrujemy po dacie wystawienia faktury (issueDate), a nie po dacie
  // technicznego przyjęcia przez KSeF (Invoicing) — to dawało wrażenie "brakujących" nowszych faktur,
  // bo invoicing date może być inna (czasem znacznie późniejsza) niż data wystawienia widoczna na dokumencie.
  const filters = {
    subjectType: subjectType,
    dateRange: {
      from: dateFrom ? (dateFrom + 'T00:00:00+00:00') : undefined,
      to:   dateTo   ? (dateTo   + 'T23:59:59+00:00') : undefined,
      dateType: 'Issue',
    },
  };

  let all = [];
  let pageOffset = 0;
  const pageSize = 100;
  for (let page = 0; page < 50; page++) { // bezpiecznik: max 5000 faktur na zakres
    const url = `${baseUrl}/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
    });
    if (!r.ok) throw new Error('KSeF query/metadata HTTP ' + r.status + ': ' + await r.text());
    const d = await r.json();
    const items = d.invoices || d.items || d.invoiceMetadataList || [];
    all = all.concat(items);
    const hasMore = d.hasMore === true || items.length === pageSize;
    if (!hasMore || items.length === 0) break;
    pageOffset += 1; // pageOffset to numer strony, nie przesuniecie rekordu
  }
  return all;
}

async function fetchInvoiceXml(baseUrl, accessToken, ksefNumber) {
  const r = await fetch(`${baseUrl}/invoices/ksef/${ksefNumber}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/xml, text/xml, */*' },
  });
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const d = await r.json();
    if (d.invoiceData) {
      try { return decodeURIComponent(escape(atob(d.invoiceData))); } catch(e) { return d.invoiceData; }
    }
    return null;
  }
  return await r.text();
}

// Pozycje faktury (FaWiersz, lub starszy wariant Wiersz) — mapowane na kształt tabeli invoice_items
// (ta sama logika ekstrakcji pól co supabase/functions/ksef-invoice/index.ts)
function parseItems(xml) {
  let blocks = xmlAll(xml,'FaWiersz');
  if (blocks.length===0) blocks = xmlAll(xml,'Wiersz');

  return blocks.map(function(w,i){
    const netP = numVal(xmlVal(w,'P_9A'));
    const vatRraw = xmlVal(w,'P_12');
    const vatNum = (vatRraw==='zw'||vatRraw==='np') ? -1 : numVal(vatRraw);
    const qty = numVal(xmlVal(w,'P_8B')||'1');
    const netV = numVal(xmlVal(w,'P_11')) || +(netP*qty).toFixed(2);
    const vatV = vatNum===-1 ? 0 : +(netV*(vatNum/100)).toFixed(2);
    const grossV = +(netV+vatV).toFixed(2);
    return {
      position: i+1,
      name: xmlVal(w,'P_7')||('Pozycja '+(i+1)),
      pkwiu: xmlVal(w,'PKWiU')||xmlVal(w,'P_2A')||'',
      unit: xmlVal(w,'P_8A')||'szt',
      quantity: qty||1,
      unit_net: netP,
      vat_rate: vatNum,
      line_net: netV,
      line_vat: vatV,
      line_gross: grossV,
    };
  });
}

async function saveInvoiceItems(invoiceId, items, sbH) {
  await fetch(`${SB_URL}/rest/v1/invoice_items?invoice_id=eq.${invoiceId}`,{method:'DELETE',headers:sbH});
  if (!items||items.length===0) return;
  await fetch(`${SB_URL}/rest/v1/invoice_items`,{method:'POST',headers:sbH,
    body:JSON.stringify(items.map(function(it){ return Object.assign({},it,{invoice_id:invoiceId}); }))});
}

async function saveInvoices(headers, baseUrl, accessToken, tenantId, service, docType) {
  const sbH = { apikey:service, Authorization:`Bearer ${service}`, 'Content-Type':'application/json', Prefer:'return=representation' };
  const saved=[], errors=[];

  for (const hdr of headers.slice(0,100)) {
    const ksefNum = hdr.ksefNumber || hdr.ksefReferenceNumber || hdr.id;
    if (!ksefNum) continue;
    try {
      const xml = await fetchInvoiceXml(baseUrl, accessToken, ksefNum);
      // Brak XML (blad sieci / KSeF chwilowo niedostepne) nie moze skutkowac zapisem "pustej"
      // faktury ani nadpisaniem juz poprawnie zapisanej: parseFA(null) dawalo {} i dalej
      // leciało do PATCH/POST z pustymi buyer_*/total_* oraz saveInvoiceItems([]) kasowal
      // istniejace pozycje bez wstawienia nowych. Stad zgloszenia "brak pozycji / danych nabywcy".
      if (!xml) { errors.push({ksefNum, err:'Nie udalo sie pobrac XML faktury z KSeF \u2014 pominieto zapis (sprobuj zsynchronizowac ponownie)'}); continue; }
      const parsed = parseFA(xml);
      const isIncoming = docType==='zakup';

      const ck = await fetch(`${SB_URL}/rest/v1/invoices?ksef_number=eq.${encodeURIComponent(ksefNum)}&tenant_id=eq.${tenantId}&select=id`,{headers:sbH});
      const ex = ck.ok ? await ck.json() : [];

      const sellerSnapshot = parsed.seller_party ? {
        name: parsed.seller_party.name||'', nip: parsed.seller_party.nip||'',
        address: parsed.seller_party.address||'',
        postal: '', city: parsed.seller_party.addrLine2||'',
        bank: parsed.bank||'', email: parsed.seller_party.email||'', phone: parsed.seller_party.phone||'',
      } : {};
      const buyerParty = parsed.buyer_party||{};

      const record = {
        doc_type: docType, status: isIncoming?'received':'issued',
        ksef_status: 'confirmed', ksef_number: ksefNum, ksef_mode: 'online',
        number: parsed.number||ksefNum,
        issue_date: parsed.issue_date||null, sale_date: parsed.sale_date||null, due_date: parsed.due_date||null,
        total_net: parsed.total_net||0, total_vat: parsed.total_vat||0, total_gross: parsed.total_gross||0,
        currency: parsed.currency||'PLN', notes: parsed.notes||'',
        // buyer_* = Podmiot2 z XML (dla faktur zakupowych to my, Porter Design).
        // Prawdziwy sprzedawca (kontrahent zewnętrzny przy zakupie) jest w seller_snapshot.
        // UWAGA: FA(3) nie wysyła osobno kodu pocztowego/miasta — adres to AdresL1 (+ opcjonalnie
        // AdresL2 jako druga linia), więc buyer_address/buyer_city trzymają te linie wprost,
        // bez sztucznego rozbijania na komponenty których w XML po prostu nie ma.
        buyer_name: buyerParty.name||hdr.subjectName||parsed.buyer_name||'',
        buyer_nip:  buyerParty.nip ||hdr.subjectNip ||parsed.buyer_nip ||'',
        buyer_address: buyerParty.address||'',
        buyer_postal:  '',
        buyer_city:    buyerParty.addrLine2||'',
        seller_snapshot: sellerSnapshot, xml_payload: xml||null, updated_at: new Date().toISOString(),
      };

      if (ex&&ex.length>0) {
        await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${ex[0].id}`,{method:'PATCH',headers:sbH,body:JSON.stringify(record)});
        saved.push({ksefNum,action:'updated'});
        await saveInvoiceItems(ex[0].id, parseItems(xml||''), sbH);
      } else {
        const ins = await fetch(`${SB_URL}/rest/v1/invoices`,{method:'POST',headers:sbH,body:JSON.stringify(record)});
        const insRows = ins.ok ? await ins.json() : [];
        const newId = insRows&&insRows[0]&&insRows[0].id;
        saved.push({ksefNum,action:'inserted'});
        if (newId) await saveInvoiceItems(newId, parseItems(xml||''), sbH);
      }
    } catch(e) { errors.push({ksefNum,err:e.message}); }
  }
  return {saved,errors};
}

export default async function handler(req) {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
  if (req.method!=='POST') return jsonRes({error:'POST only'},405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({error:auth.message},auth.status);

  let body;
  try { body=await req.json(); } catch(e) { return jsonRes({error:'invalid json'},400); }
  const {accessToken,baseUrl,direction,dateFrom,dateTo}=body||{};
  if (!accessToken||!baseUrl) return jsonRes({error:'accessToken i baseUrl wymagane'},400);

  const now=new Date();
  const from=dateFrom||new Date(now.getTime()-30*24*3600*1000).toISOString().slice(0,10);
  const to=dateTo||now.toISOString().slice(0,10);
  const dir=direction||'all';

  try {
    let inHeaders=[],outHeaders=[];
    if (dir==='incoming'||dir==='all') {
      inHeaders = await queryInvoices(baseUrl,accessToken,'subject2',from,to);
    }
    if (dir==='outgoing'||dir==='all') {
      outHeaders = await queryInvoices(baseUrl,accessToken,'subject1',from,to);
    }

    const [inRes,outRes]=await Promise.all([
      inHeaders.length>0?saveInvoices(inHeaders,baseUrl,accessToken,auth.tenantId,auth.service,'zakup'):Promise.resolve({saved:[],errors:[]}),
      outHeaders.length>0?saveInvoices(outHeaders,baseUrl,accessToken,auth.tenantId,auth.service,'vat'):Promise.resolve({saved:[],errors:[]}),
    ]);

    return jsonRes({
      ok:true,
      incoming:{fetched:inHeaders.length,saved:inRes.saved.length,errors:inRes.errors.length?inRes.errors:undefined},
      outgoing:{fetched:outHeaders.length,saved:outRes.saved.length,errors:outRes.errors.length?outRes.errors:undefined},
    });
  } catch(e) {
    return jsonRes({error:e.message},502);
  }
}
