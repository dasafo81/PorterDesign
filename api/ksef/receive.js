// api/ksef/receive.js  (v2 — oба kierunki: sprzedażowe + kosztowe)
// POST { sessionToken, baseUrl, direction, dateFrom?, dateTo? }
//   direction: "incoming" (kosztowe, podmiot2=Twój NIP)
//            | "outgoing" (sprzedażowe, podmiot1=Twój NIP)
//            | "all"      (oba)

export const config = { runtime: 'edge' };
const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function cors(){ return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}; }
function json(d,s){ return new Response(JSON.stringify(d),{status:s||200,headers:Object.assign({'Content-Type':'application/json'},cors())}); }

async function verifyUser(req){
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

function xmlVal(xml,tag){
  const m=xml.match(new RegExp('<'+tag+'[^>]*>([^<]*)</'+tag+'>'));
  return m?m[1].trim():'';
}
function xmlValN(xml,tag,n){
  // n-te wystąpienie tagu (1-based)
  let s=0,found=0;
  const re=new RegExp('<'+tag+'[^>]*>([^<]*)</'+tag+'>','g');
  let m;
  while((m=re.exec(xml))!==null){
    found++;
    if(found===n) return m[1].trim();
  }
  return '';
}

function parseFA(xml){
  // Sprzedawca = pierwsze NIP + PelnaNazwa, Nabywca = drugie
  const nips=[];
  const names=[];
  const reN=/<NIP>([^<]+)<\/NIP>/g;
  const reP=/<PelnaNazwa>([^<]+)<\/PelnaNazwa>/g;
  let m;
  while((m=reN.exec(xml))!==null) nips.push(m[1].trim());
  while((m=reP.exec(xml))!==null) names.push(m[1].trim());
  return {
    number:      xmlVal(xml,'P_2')||xmlVal(xml,'NrFaKSeF'),
    issue_date:  xmlVal(xml,'P_1'),
    sale_date:   xmlVal(xml,'P_1M')||xmlVal(xml,'P_1'),
    due_date:    xmlVal(xml,'DataZaplaty'),
    total_gross: +(xmlVal(xml,'P_15')||0),
    total_net:   +(xmlVal(xml,'P_13_Razem')||0),
    total_vat:   +(xmlVal(xml,'P_14_Razem')||0),
    currency:    xmlVal(xml,'KodWaluty')||'PLN',
    notes:       xmlVal(xml,'P_Opis'),
    seller_nip:  nips[0]||'',
    seller_name: names[0]||'',
    buyer_nip:   nips[1]||'',
    buyer_name:  names[1]||'',
  };
}

async function queryKSeF(baseUrl, sessionToken, subjectType, from, to){
  const r=await fetch(`${baseUrl}/online/Query/Invoice/Sync?PageSize=100&PageOffset=0`,{
    method:'POST',
    headers:{'Content-Type':'application/json','SessionToken':sessionToken},
    body:JSON.stringify({queryCriteria:{
      subjectType,
      type:'incremental',
      acquisitionTimestampThresholdFrom: from+'T00:00:00.000Z',
      acquisitionTimestampThresholdTo:   to  +'T23:59:59.999Z',
    }}),
  });
  if(!r.ok) throw new Error('KSeF query failed ('+subjectType+'): '+await r.text());
  const d=await r.json();
  return d.invoiceHeaderList||[];
}

async function fetchAndSave(headers, baseUrl, sessionToken, tenantId, service, docType){
  const sbH={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=representation'};
  const saved=[]; const errors=[];

  for(const hdr of headers.slice(0,100)){
    const ksefNum=hdr.ksefReferenceNumber;
    if(!ksefNum) continue;
    try{
      // Pobierz XML
      const ir=await fetch(`${baseUrl}/online/Invoice/Get/${ksefNum}`,{headers:{'SessionToken':sessionToken}});
      if(!ir.ok){errors.push({ksefNum,err:'HTTP '+ir.status});continue;}
      const id=await ir.json();
      let xml='';
      if(id.invoiceData){
        try{ xml=decodeURIComponent(escape(atob(id.invoiceData))); }catch(e){ xml=id.invoiceData; }
      }
      const parsed=xml?parseFA(xml):{};

      // Sprawdź czy już mamy
      const ck=await fetch(`${SB_URL}/rest/v1/invoices?ksef_number=eq.${encodeURIComponent(ksefNum)}&tenant_id=eq.${tenantId}&select=id`,{headers:sbH});
      const ex=ck.ok?await ck.json():[];

      // Dla faktur kosztowych: sprzedawca = buyer_name/nip w naszym schemacie (kto nam wystawił)
      // Dla faktur sprzedażowych: nabywca = buyer_name/nip (komu wystawiliśmy)
      const isIncoming=docType==='zakup';
      const record={
        doc_type:        docType,
        status:          isIncoming?'received':'issued',
        ksef_status:     'confirmed',
        ksef_number:     ksefNum,
        ksef_mode:       'online',
        number:          parsed.number||ksefNum,
        issue_date:      parsed.issue_date||null,
        sale_date:       parsed.sale_date||null,
        due_date:        parsed.due_date||null,
        total_net:       parsed.total_net||0,
        total_vat:       parsed.total_vat||0,
        total_gross:     parsed.total_gross||0,
        currency:        parsed.currency||'PLN',
        notes:           parsed.notes||'',
        buyer_name:      isIncoming?(parsed.seller_name||hdr.subjectName||''):(parsed.buyer_name||''),
        buyer_nip:       isIncoming?(parsed.seller_nip||hdr.subjectNip||''):(parsed.buyer_nip||''),
        seller_snapshot: {},
        xml_payload:     xml||null,
        updated_at:      new Date().toISOString(),
      };

      if(ex&&ex.length>0){
        await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${ex[0].id}`,{method:'PATCH',headers:sbH,body:JSON.stringify(record)});
        saved.push({ksefNum,action:'updated',docType});
      } else {
        await fetch(`${SB_URL}/rest/v1/invoices`,{method:'POST',headers:sbH,body:JSON.stringify(record)});
        saved.push({ksefNum,action:'inserted',docType});
      }
    } catch(e){
      errors.push({ksefNum,err:e.message});
    }
  }
  return {saved,errors};
}

export default async function handler(req){
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
  if(req.method!=='POST') return json({error:'POST only'},405);

  const auth=await verifyUser(req);
  if(!auth.ok) return json({error:auth.message},auth.status);

  let body;
  try{ body=await req.json(); }catch(e){ return json({error:'invalid json'},400); }
  const {sessionToken,baseUrl,direction,dateFrom,dateTo}=body||{};
  if(!sessionToken||!baseUrl) return json({error:'sessionToken i baseUrl wymagane'},400);

  const now=new Date();
  const from=dateFrom||new Date(now.getTime()-30*24*3600*1000).toISOString().slice(0,10);
  const to=dateTo||now.toISOString().slice(0,10);
  const dir=direction||'all';

  try{
    let inHeaders=[],outHeaders=[];
    if(dir==='incoming'||dir==='all'){
      inHeaders=await queryKSeF(baseUrl,sessionToken,'subject2',from,to);
    }
    if(dir==='outgoing'||dir==='all'){
      outHeaders=await queryKSeF(baseUrl,sessionToken,'subject1',from,to);
    }

    const [inRes,outRes]=await Promise.all([
      inHeaders.length>0?fetchAndSave(inHeaders,baseUrl,sessionToken,auth.tenantId,auth.service,'zakup'):Promise.resolve({saved:[],errors:[]}),
      outHeaders.length>0?fetchAndSave(outHeaders,baseUrl,sessionToken,auth.tenantId,auth.service,'vat'):Promise.resolve({saved:[],errors:[]}),
    ]);

    return json({
      ok:true,
      incoming:{fetched:inHeaders.length,saved:inRes.saved.length,errors:inRes.errors.length>0?inRes.errors:undefined},
      outgoing:{fetched:outHeaders.length,saved:outRes.saved.length,errors:outRes.errors.length>0?outRes.errors:undefined},
    });
  } catch(e){
    return json({error:e.message},502);
  }
}
