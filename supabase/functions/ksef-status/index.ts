// supabase/functions/ksef-status/index.ts
// KSeF 2.0 — sprawdzenie statusu wysłanej faktury (osobno od ksef-send)
// POST { invoiceId, accessToken, baseUrl }
// Sprawdza czy faktura ma już przypisany ksefReferenceNumber i aktualizuje DB.

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}
function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...cors() },
  });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string,string>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { invoiceId, accessToken, baseUrl } = body;
  if (!invoiceId || !accessToken || !baseUrl)
    return jsonRes({ error: "invoiceId, accessToken i baseUrl wymagane" }, 400);

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Pobierz sessionRef z DB (zapisany w ksef_number)
  const invR = await fetch(
    `${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}&tenant_id=eq.${auth.tenantId}&select=ksef_number,ksef_status`,
    { headers: sbH }
  );
  if (!invR.ok) return jsonRes({ error: "Błąd pobierania faktury" }, 500);
  const inv = (await invR.json())?.[0];
  if (!inv) return jsonRes({ error: "Faktura nie znaleziona" }, 404);
  if (inv.ksef_status === "confirmed") return jsonRes({ ok: true, ksefStatus: "confirmed", ksefNumber: inv.ksef_number });
  const sessionRef = inv.ksef_number;
  if (!sessionRef) return jsonRes({ error: "Brak sessionRef w bazie" }, 400);

  // Zapytaj KSeF o status faktury w sesji
  try {
    const statusR = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}/invoices`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!statusR.ok) {
      const t = await statusR.text();
      return jsonRes({ error: `KSeF status HTTP ${statusR.status}`, detail: t }, 502);
    }
    const statusData = await statusR.json();
    const invoiceList = statusData.invoices || statusData.items || [];
    const first = invoiceList[0];

    if (first?.ksefReferenceNumber) {
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({
          ksef_status: "confirmed",
          ksef_number: first.ksefReferenceNumber,
          ksef_error: null,
        }),
      });
      // Zamknij sesję online w KSeF (już przetworzone)
      await fetch(`${baseUrl}/sessions/online/${encodeURIComponent(sessionRef)}/close`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
      return jsonRes({ ok: true, ksefStatus: "confirmed", ksefNumber: first.ksefReferenceNumber });
    }

    // Sprawdź czy sesja jest w stanie umożliwiającym przetworzenie
    const statusCode = first?.status?.code;
    if (statusCode && statusCode !== 100 && statusCode !== 150 && statusCode !== 200) {
      const errMsg = first.status.description
        + (first.status.details ? ": " + first.status.details.join("; ") : "");
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({ ksef_status: "error", ksef_error: errMsg.slice(0,500) }),
      });
      await fetch(`${baseUrl}/sessions/online/${encodeURIComponent(sessionRef)}/close`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
      return jsonRes({ error: "KSeF odrzucił fakturę", detail: errMsg, statusCode }, 502);
    }

    if (first?.processingCode && first.processingCode !== 200 && first.processingCode !== 100) {
      const errMsg = first.processingDescription || `processingCode: ${first.processingCode}`;
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({ ksef_status: "error", ksef_error: errMsg }),
      });
      return jsonRes({ error: "KSeF odrzucił fakturę", detail: errMsg }, 502);
    }

    return jsonRes({ ok: true, ksefStatus: "sent", pending: true, raw: statusData });

  } catch(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRes({ error: msg }, 500);
  }
});
