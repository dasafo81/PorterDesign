// montazShare.js — publiczny link „Do montażu” dla montażysty.
// Buduje snapshot listy montażowej (bez cen) z wyceny klienta, zapisuje go w montaz_shares
// i zwraca adres /m/<token>, który trafia do opisu wydarzenia w Google Calendar.
import { sbApi } from './supabase.js';
import { buildOfferDetailRows, planRailScraps } from '../constants/data.js';

// Snapshot: tylko pola potrzebne na montażu. Świadomie bez cen i bez telefonu klienta.
export function buildMontazPayload(cl, scraps) {
  cl = cl || {};
  var rows = buildOfferDetailRows(cl).map(function (r) {
    return {
      room: r.room, name: r.name, qty: r.qty, unit: r.unit,
      modelSzycia: r.modelSzycia, szerokosc: r.szerokosc, wysokosc: r.wysokosc,
      podzial: r.podzial, note: r.note, installNote: r.installNote
    };
  });
  var plan = { needs: [], rails: [] };
  try { plan = planRailScraps(cl, scraps || []); } catch (e) { plan = { needs: [], rails: [] }; }
  return {
    name: cl.name || "",
    addr: [cl.addr || cl.street, [cl.postal, cl.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    rows: rows,
    hasRails: plan.needs.length > 0,
    rails: plan.rails.map(function (r) {
      return {
        no: r.no, length_cm: r.scrap.length_cm, color: r.scrap.color || "",
        cuts: r.cuts.map(function (c) { return c.len; }), spare: r.spare
      };
    }),
    missing: plan.needs.filter(function (n) { return !n.scrap; }).map(function (n) { return { len: n.len, room: n.room || "" }; })
  };
}

export function montazShareUrl(token) {
  return window.location.origin + "/m/" + token;
}

// Tworzy albo odświeża link dla deala i zwraca pełny URL. Rzuca błąd, gdy zapis się nie uda
// (np. migracja 0075 nie została jeszcze uruchomiona).
export function ensureMontazShare(cl, dealId) {
  if (!cl || !dealId) return Promise.reject(new Error("Brak klienta lub deala"));
  return sbApi.getRailScraps().catch(function () { return []; }).then(function (scraps) {
    return sbApi.upsertMontazShare(dealId, buildMontazPayload(cl, scraps));
  }).then(function (token) {
    if (!token) throw new Error("Nie udało się utworzyć linku");
    return montazShareUrl(token);
  });
}

// Wersja „miękka” dla synchronizacji kalendarza: zwraca null zamiast rzucać błąd,
// żeby brak linku nie blokował dodania wydarzenia.
export function montazLinkOrNull(cl, dealId) {
  return ensureMontazShare(cl, dealId).catch(function (e) {
    console.warn("[montaz] nie udało się utworzyć linku dla montażysty", e);
    return null;
  });
}
