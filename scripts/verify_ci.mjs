import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
assert.match(workflow, /npm run build/);
assert.match(workflow, /test_ksef_vat\.mjs/);
console.log("CI workflow contract tests: OK");
