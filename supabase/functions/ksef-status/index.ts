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
    // Krok 1: sprawdź status SESJI (jak waitForUpo w SDK)
    // Kod 100 = InProgress, 200 = Success, inne = błąd
    const sessR = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!sessR.ok) {
      const t = await sessR.text();
      return jsonRes({ error: `KSeF sesja HTTP ${sessR.status}`, detail: t }, 502);
    }
    const sessData = await sessR.json();
    const sessStatus = sessData.status?.code;

    if (sessStatus === 100 || sessStatus === 150) {
      // Sesja jeszcze przetwarza
      return jsonRes({ ok: true, ksefStatus: "sent", pending: true, sessionStatus: sessStatus, raw: sessData });
    }

    if (sessStatus !== 200) {
      // Sesja zakończona błędem — pobierz szczegół odrzucenia z /invoices/failed
      let detailedError = "";
      let failedRaw = null;
      try {
        const failedR = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}/invoices/failed`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (failedR.ok) {
          failedRaw = await failedR.json();
          const failedList = failedRaw.invoices || failedRaw.items || [];
          const failed = failedList[0];
          if (failed) {
            detailedError = (failed.status?.description || "")
              + (failed.status?.details ? " — " + failed.status.details.join("; ") : "");
          }
        }
      } catch { /* ignore */ }
      const sessMsg = (sessData.status?.description || "błąd nieznany")
        + (sessData.status?.details ? ": " + sessData.status.details.join("; ") : "");
      const fullMsg = detailedError || sessMsg;
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({ ksef_status: "error", ksef_error: fullMsg.slice(0,500) }),
      });
      return jsonRes({ error: "KSeF - błąd sesji/faktury", detail: fullMsg, sessDetail: sessMsg, failedRaw, statusCode: sessStatus }, 502);
    }

    // Krok 2: sesja zakończona (200) — pobierz szczegóły faktury
    const invR2 = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}/invoices`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!invR2.ok) {
      return jsonRes({ error: `KSeF faktury HTTP ${invR2.status}`, detail: await invR2.text() }, 502);
    }
    const invData = await invR2.json();
    const invoiceList = invData.invoices || invData.items || [];
    const first = invoiceList[0];

    const ksefNum = first?.ksefNumber || first?.ksefReferenceNumber;
    if (ksefNum) {
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({
          ksef_status: "confirmed",
          ksef_number: ksefNum,
          ksef_upo: first.upoDownloadUrl || null,
          ksef_error: null,
        }),
      });
      return jsonRes({ ok: true, ksefStatus: "confirmed", ksefNumber: ksefNum });
    }

    if (first?.status?.code && first.status.code !== 200) {
      const errMsg = first.status.description
        + (first.status.details ? ": " + first.status.details.join("; ") : "");
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({ ksef_status: "error", ksef_error: errMsg.slice(0,500) }),
      });
      return jsonRes({ error: "KSeF odrzucił fakturę", detail: errMsg, statusCode: first.status.code }, 502);
    }

    return jsonRes({ ok: true, ksefStatus: "sent", pending: true, raw: invData });

  } catch(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRes({ error: msg }, 500);
  }
});
