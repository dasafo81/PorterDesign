// api/ksef/receive.js — KSeF API 2.0
// POST { accessToken, baseUrl, direction, dateFrom?, dateTo? }
// direction: "incoming" | "outgoing" | "all"
// Używa GET /invoices z filtrem subjectType

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

function parseFA(xml) {
  const nips=[],names=[];
  const rn=/<NIP>([^<]+)<\/NIP>/g, rp=/<PelnaNazwa>([^<]+)<\/PelnaNazwa>/g;
  let m;
  while((m=rn.exec(xml))!==null) nips.push(m[1].trim());
  while((m=rp.exec(xml))!==null) names.push(m[1].trim());
  const fa = xmlBlock(xml,'Fa');
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
    seller_nip: nips[0]||'', seller_name: names[0]||'',
    buyer_nip: nips[1]||'',  buyer_name: names[1]||'',
  };
}

async function queryInvoices(baseUrl, accessToken, subjectType, dateFrom, dateTo) {
  // KSeF 2.0: GET /invoices z parametrami query
  const params = new URLSearchParams({
    pageSize: '100',
    ...(subjectType ? { subjectType } : {}),
    ...(dateFrom ? { acquisitionTimestampThresholdFrom: dateFrom + 'T00:00:00.000Z' } : {}),
    ...(dateTo   ? { acquisitionTimestampThresholdTo:   dateTo   + 'T23:59:59.999Z' } : {}),
  });
  const r = await fetch(`${baseUrl}/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error('KSeF /invoices failed HTTP ' + r.status + ': ' + await r.text());
  const d = await r.json();
  return d.invoices || d.items || [];
}

async function fetchInvoiceXml(baseUrl, accessToken, ksefNumber) {
  const r = await fetch(`${baseUrl}/invoices/${ksefNumber}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (d.invoiceData) {
    try { return decodeURIComponent(escape(atob(d.invoiceData))); } catch(e) { return d.invoiceData; }
  }
  return null;
}

async function saveInvoices(headers, baseUrl, accessToken, tenantId, service, docType) {
  const sbH = { apikey:service, Authorization:`Bearer ${service}`, 'Content-Type':'application/json', Prefer:'return=representation' };
  const saved=[], errors=[];

  for (const hdr of headers.slice(0,100)) {
    const ksefNum = hdr.ksefReferenceNumber || hdr.ksefNumber || hdr.id;
    if (!ksefNum) continue;
    try {
      const xml = await fetchInvoiceXml(baseUrl, accessToken, ksefNum);
      const parsed = xml ? parseFA(xml) : {};
      const isIncoming = docType==='zakup';

      const ck = await fetch(`${SB_URL}/rest/v1/invoices?ksef_number=eq.${encodeURIComponent(ksefNum)}&tenant_id=eq.${tenantId}&select=id`,{headers:sbH});
      const ex = ck.ok ? await ck.json() : [];

      const record = {
        doc_type: docType, status: isIncoming?'received':'issued',
        ksef_status: 'confirmed', ksef_number: ksefNum, ksef_mode: 'online',
        number: parsed.number||ksefNum,
        issue_date: parsed.issue_date||null, sale_date: parsed.sale_date||null, due_date: parsed.due_date||null,
        total_net: parsed.total_net||0, total_vat: parsed.total_vat||0, total_gross: parsed.total_gross||0,
        currency: parsed.currency||'PLN', notes: parsed.notes||'',
        buyer_name: isIncoming?(parsed.seller_name||hdr.subjectName||''):(parsed.buyer_name||''),
        buyer_nip:  isIncoming?(parsed.seller_nip ||hdr.subjectNip ||''):(parsed.buyer_nip ||''),
        seller_snapshot: {}, xml_payload: xml||null, updated_at: new Date().toISOString(),
      };

      if (ex&&ex.length>0) {
        await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${ex[0].id}`,{method:'PATCH',headers:sbH,body:JSON.stringify(record)});
        saved.push({ksefNum,action:'updated'});
      } else {
        await fetch(`${SB_URL}/rest/v1/invoices`,{method:'POST',headers:sbH,body:JSON.stringify(record)});
        saved.push({ksefNum,action:'inserted'});
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
