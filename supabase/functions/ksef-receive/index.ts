// supabase/functions/ksef-receive/index.ts
// KSeF 2.0 — pobieranie faktur (kosztowe subject2 / sprzedażowe subject1)
// POST { accessToken, baseUrl, direction, dateFrom?, dateTo? }

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

async function verifyUser(req: Request) {
  const SVC = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SVC) return { ok: false, status: 500, message: "SERVICE_ROLE_KEY not set" };
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!auth) return { ok: false, status: 401, message: "missing jwt" };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SVC, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: "invalid jwt" };
  const u = await r.json();
  const tid = u?.app_metadata?.tenant_id;
  if (!tid) return { ok: false, status: 403, message: "no tenant_id" };
  return { ok: true, tenantId: tid, service: SVC };
}

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp("<" + tag + "[^>]*>([^<]*)</" + tag + ">"));
  return m ? m[1].trim() : "";
}
function parseFA(xml: string) {
  const nips: string[] = [], names: string[] = [];
  let m;
  const rn = /<NIP>([^<]+)<\/NIP>/g, rp = /<PelnaNazwa>([^<]+)<\/PelnaNazwa>/g;
  while ((m = rn.exec(xml)) !== null) nips.push(m[1].trim());
  while ((m = rp.exec(xml)) !== null) names.push(m[1].trim());
  return {
    number: xmlVal(xml, "P_2") || xmlVal(xml, "NrFaKSeF"),
    issue_date: xmlVal(xml, "P_1"),
    sale_date: xmlVal(xml, "P_1M") || xmlVal(xml, "P_1"),
    due_date: xmlVal(xml, "DataZaplaty"),
    total_gross: +(xmlVal(xml, "P_15") || 0),
    total_net: +(xmlVal(xml, "P_13_Razem") || 0),
    total_vat: +(xmlVal(xml, "P_14_Razem") || 0),
    currency: xmlVal(xml, "KodWaluty") || "PLN",
    notes: xmlVal(xml, "P_Opis"),
    seller_nip: nips[0] || "", seller_name: names[0] || "",
    buyer_nip: nips[1] || "", buyer_name: names[1] || "",
  };
}

async function queryInvoices(baseUrl: string, accessToken: string, subjectType: string, from: string, to: string) {
  const params = new URLSearchParams({
    pageSize: "100",
    subjectType,
    dateFrom: from + "T00:00:00.000Z",
    dateTo: to + "T23:59:59.999Z",
  });
  const r = await fetch(`${baseUrl}/invoices/query?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    // fallback na /invoices
    const r2 = await fetch(`${baseUrl}/invoices?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r2.ok) throw new Error("KSeF query HTTP " + r.status + "/" + r2.status);
    const d2 = await r2.json();
    return d2.invoices || d2.items || [];
  }
  const d = await r.json();
  return d.invoices || d.items || [];
}

async function fetchXml(baseUrl: string, accessToken: string, ksefNum: string): Promise<string | null> {
  const r = await fetch(`${baseUrl}/invoices/${ksefNum}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("xml")) return await r.text();
  const d = await r.json();
  if (d.invoiceData) {
    try { return atob(d.invoiceData); } catch { return d.invoiceData; }
  }
  return null;
}

async function saveInvoices(headers: Record<string, unknown>[], baseUrl: string, accessToken: string, tenantId: string, service: string, docType: string) {
  const sbH = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const saved: unknown[] = [], errors: unknown[] = [];
  for (const hdr of headers.slice(0, 100)) {
    const ksefNum = (hdr.ksefReferenceNumber || hdr.ksefNumber || hdr.id) as string;
    if (!ksefNum) continue;
    try {
      const xml = await fetchXml(baseUrl, accessToken, ksefNum);
      const parsed = xml ? parseFA(xml) : {} as ReturnType<typeof parseFA>;
      const isIncoming = docType === "zakup";
      const ck = await fetch(`${SB_URL}/rest/v1/invoices?ksef_number=eq.${encodeURIComponent(ksefNum)}&tenant_id=eq.${tenantId}&select=id`, { headers: sbH });
      const ex = ck.ok ? await ck.json() : [];
      const record = {
        doc_type: docType, status: isIncoming ? "received" : "issued",
        ksef_status: "confirmed", ksef_number: ksefNum, ksef_mode: "online",
        number: parsed.number || ksefNum,
        issue_date: parsed.issue_date || null, sale_date: parsed.sale_date || null, due_date: parsed.due_date || null,
        total_net: parsed.total_net || 0, total_vat: parsed.total_vat || 0, total_gross: parsed.total_gross || 0,
        currency: parsed.currency || "PLN", notes: parsed.notes || "",
        buyer_name: isIncoming ? (parsed.seller_name || hdr.subjectName || "") : (parsed.buyer_name || ""),
        buyer_nip: isIncoming ? (parsed.seller_nip || hdr.subjectNip || "") : (parsed.buyer_nip || ""),
        xml_payload: xml || null, updated_at: new Date().toISOString(),
      };
      if (ex?.length > 0) {
        await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${ex[0].id}`, { method: "PATCH", headers: sbH, body: JSON.stringify(record) });
        saved.push({ ksefNum, action: "updated" });
      } else {
        await fetch(`${SB_URL}/rest/v1/invoices`, { method: "POST", headers: sbH, body: JSON.stringify(record) });
        saved.push({ ksefNum, action: "inserted" });
      }
    } catch (e) { errors.push({ ksefNum, err: e instanceof Error ? e.message : String(e) }); }
  }
  return { saved, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }
  const { accessToken, baseUrl, direction, dateFrom, dateTo } = body || {};
  if (!accessToken || !baseUrl) return jsonRes({ error: "accessToken i baseUrl wymagane" }, 400);

  const now = new Date();
  const from = dateFrom || new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = dateTo || now.toISOString().slice(0, 10);
  const dir = direction || "all";

  try {
    let inH: Record<string, unknown>[] = [], outH: Record<string, unknown>[] = [];
    if (dir === "incoming" || dir === "all") inH = await queryInvoices(baseUrl, accessToken, "subject2", from, to);
    if (dir === "outgoing" || dir === "all") outH = await queryInvoices(baseUrl, accessToken, "subject1", from, to);

    const [inRes, outRes] = await Promise.all([
      inH.length ? saveInvoices(inH, baseUrl, accessToken, auth.tenantId!, auth.service!, "zakup") : Promise.resolve({ saved: [], errors: [] }),
      outH.length ? saveInvoices(outH, baseUrl, accessToken, auth.tenantId!, auth.service!, "vat") : Promise.resolve({ saved: [], errors: [] }),
    ]);

    return jsonRes({
      ok: true,
      incoming: { fetched: inH.length, saved: inRes.saved.length, errors: inRes.errors.length ? inRes.errors : undefined },
      outgoing: { fetched: outH.length, saved: outRes.saved.length, errors: outRes.errors.length ? outRes.errors : undefined },
    });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
