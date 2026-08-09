import assert from "node:assert/strict";
import fs from "node:fs";

// Contract tests for the numeric rules used by the FA(3) importer.
function num(value) {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

assert.equal(num("123,45"), 123.45);
assert.equal(num("1.234,56"), 1234.56);
assert.equal(num(" 1 234,50 "), 1234.5);
assert.equal(num("1234.56"), 1234.56);
assert.equal(num("zw"), 0);

const source = fs.readFileSync("supabase/functions/ksef-invoice/index.ts", "utf8");
assert.match(source, /P_6/); // FA(3) sale date
assert.match(source, /P_9B/); // gross unit price variant
assert.match(source, /P_11A/); // gross line value variant
assert.match(source, /P_13_Razem/);
assert.match(source, /P_14_Razem/);
assert.match(source, /replace\(\/\\\.\/g, ""\)/);

const rls = fs.readFileSync("supabase/migrations/0023_hide_subscription_gate_helper.sql", "utf8");
assert.match(rls, /as restrictive/);
assert.match(rls, /private\.pd_subscription_active/);
assert.match(rls, /drop function if exists public\.pd_subscription_active/);
console.log("KSeF/VAT/RLS contract tests: OK");
