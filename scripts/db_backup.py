#!/usr/bin/env python3
# Backup bazy Supabase przez REST API (PostgREST) -> pliki JSON.
# pg_dump nie jest wykonalny na free tier bez IPv4, wiec zrzucamy tabele
# przez service_role key (omija RLS) z paginacja offsetowa.
#
# Wymagane zmienne srodowiskowe (ustawiane przez GitHub Actions z Secrets):
#   SB_URL          - https://<ref>.supabase.co
#   SB_SERVICE_KEY  - service_role key (NIE anon)
#
# UWAGA: ksef_credentials celowo POMINIETE - zawiera zaszyfrowane sekrety,
# ktorych nie chcemy duplikowac do artefaktow CI.

import os
import json
import urllib.request
import urllib.error

SB_URL = os.environ["SB_URL"].rstrip("/")
KEY = os.environ["SB_SERVICE_KEY"]
PAGE = 1000
OUT_DIR = "backup"

# Kolumna sortujaca dla stabilnej paginacji offsetowej (musi istniec w tabeli).
TABLES = {
    "tenants": "created_at",
    "clients": "id",
    "deals": "created_at",
    "deal_attachments": "created_at",
    "invoices": "created_at",
    "invoice_items": "id",
    "invoice_settings": "tenant_id",
    "invoice_counters": "tenant_id",
    "warehouse_items": "id",
    "rail_scraps": "id",
    "mail_templates": "id",
    "user_settings": "id",
}


def fetch_all(table, order_col):
    rows = []
    offset = 0
    while True:
        url = (
            SB_URL
            + "/rest/v1/"
            + table
            + "?select=*&order="
            + order_col
            + ".asc&limit="
            + str(PAGE)
            + "&offset="
            + str(offset)
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": KEY,
                "Authorization": "Bearer " + KEY,
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req) as r:
            batch = json.load(r)
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = {}
    failed = []
    for table, order_col in TABLES.items():
        try:
            rows = fetch_all(table, order_col)
            with open(os.path.join(OUT_DIR, table + ".json"), "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False, indent=2)
            summary[table] = len(rows)
            print("OK   " + table + ": " + str(len(rows)) + " wierszy")
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            print("FAIL " + table + ": HTTP " + str(e.code) + " " + detail)
            failed.append(table)
        except Exception as e:  # noqa: BLE001
            print("FAIL " + table + ": " + repr(e))
            failed.append(table)

    with open(os.path.join(OUT_DIR, "_summary.json"), "w", encoding="utf-8") as f:
        json.dump({"counts": summary, "failed": failed}, f, ensure_ascii=False, indent=2)

    if failed:
        raise SystemExit("Backup niekompletny, nieudane tabele: " + ", ".join(failed))


if __name__ == "__main__":
    main()
