// supabase/functions/ksef-receive/index.ts
// KSeF 2.0 — pobieranie faktur z metadanych (bez XML per faktura)
// Pola metadanych: ksefNumber, invoiceNumber, issueDate, grossAmount, netAmount,
//   vatAmount, currency, seller{nip,name}, buyer{identifier{value},name}

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
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

async function queryMetadata(
  baseUrl: string, accessToken: string, subjectType: string, from: string, to: string
): Promise<Record<string, unknown>[]> {
  const filters = {
    subjectType: subjectType === "subject1" ? "Subject1" : "Subject2",
    dateRange: { from: from + "T00:00:00.000Z", to: to + "T23:59:59.999Z", dateType: "Issue" },
  };
  const r = await fetch(`${baseUrl}/invoices/query/metadata?pageOffset=0&pageSize=100`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(filters),
  });
  if (!r.ok) throw new Error("KSeF query/metadata HTTP " + r.status + ": " + (await r.text()).slice(0, 300));
  const d = await r.json();
  return (d.invoices || d.items || d.invoiceMetadataList || []) as Record<string, unknown>[];
}

function metaToRecord(
  meta: Record<string, unknown>, docType: string, tenantId: string
): Record<string, unknown> {
  const isIncoming = docType === "zakup";
  // Kontrahent: dla kosztowych = seller, dla sprzedażowych = buyer
  const party = isIncoming
    ? (meta.seller as Record<string, unknown> || {})
    : (meta.buyer as Record<string, unknown> || {});
  const buyerName  = String(party.name || "");
  const buyerNip   = String(
    party.nip ||
    (party.identifier as Record<string,unknown>)?.value ||
    ""
  );

  return {
    tenant_id:   tenantId,
    doc_type:    docType,
    status:      isIncoming ? "received" : "issued",
    ksef_status: "confirmed",
    ksef_number: String(meta.ksefNumber || ""),
    ksef_mode:   "online",
    number:      String(meta.invoiceNumber || meta.ksefNumber || ""),
    issue_date:  String(meta.issueDate || "").slice(0, 10) || null,
    sale_date:   String(meta.issueDate || "").slice(0, 10) || null,
    due_date:    null,
    total_net:   Number(meta.netAmount  || 0),
    total_vat:   Number(meta.vatAmount  || 0),
    total_gross: Number(meta.grossAmount || 0),
    currency:    String(meta.currency || "PLN"),
    notes:       "",
    buyer_name:  buyerName,
    buyer_nip:   buyerNip,
    xml_payload: null,
    updated_at:  new Date().toISOString(),
  };
}

async function saveInvoices(
  headers: Record<string, unknown>[],
  tenantId: string,
  service: string,
  docType: string
): Promise<{ saved: number; errors: unknown[] }> {
  const sbH = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  let saved = 0;
  const errors: unknown[] = [];

  for (const meta of headers) {
    const ksefNum = String(meta.ksefNumber || "");
    if (!ksefNum) continue;
    try {
      const record = metaToRecord(meta, docType, tenantId);
      // Sprawdź czy istnieje
      const ck = await fetch(
        `${SB_URL}/rest/v1/invoices?ksef_number=eq.${encodeURIComponent(ksefNum)}&tenant_id=eq.${tenantId}&select=id`,
        { headers: sbH }
      );
      const ex = ck.ok ? await ck.json() : [];
      if (ex?.length > 0) {
        await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${ex[0].id}`, {
          method: "PATCH", headers: sbH, body: JSON.stringify(record),
        });
      } else {
        await fetch(`${SB_URL}/rest/v1/invoices`, {
          method: "POST", headers: sbH, body: JSON.stringify(record),
        });
      }
      saved++;
    } catch (e) {
      errors.push({ ksefNum, err: e instanceof Error ? e.message : String(e) });
    }
  }
  return { saved, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { accessToken, baseUrl, direction, dateFrom, dateTo } = body;
  if (!accessToken || !baseUrl) return jsonRes({ error: "accessToken i baseUrl wymagane" }, 400);

  const now = new Date();
  const from = String(dateFrom || new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const to   = String(dateTo   || now.toISOString().slice(0, 10));
  const dir  = String(direction || "all");

  try {
    let inH: Record<string, unknown>[] = [];
    let outH: Record<string, unknown>[] = [];
    if (dir === "incoming" || dir === "all") inH  = await queryMetadata(baseUrl, String(accessToken), "subject2", from, to);
    if (dir === "outgoing" || dir === "all") outH = await queryMetadata(baseUrl, String(accessToken), "subject1", from, to);

    const [inRes, outRes] = await Promise.all([
      inH.length  ? saveInvoices(inH,  auth.tenantId!, auth.service!, "zakup") : Promise.resolve({ saved: 0, errors: [] }),
      outH.length ? saveInvoices(outH, auth.tenantId!, auth.service!, "vat")   : Promise.resolve({ saved: 0, errors: [] }),
    ]);

    return jsonRes({
      ok: true,
      incoming: { fetched: inH.length,  saved: inRes.saved,  errors: inRes.errors.length  ? inRes.errors  : undefined },
      outgoing: { fetched: outH.length, saved: outRes.saved, errors: outRes.errors.length ? outRes.errors : undefined },
    });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
