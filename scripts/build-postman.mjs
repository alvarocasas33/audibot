// Generates docs/audibot.postman_collection.json from the sample dataset.
// Run: node scripts/build-postman.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const dataset = JSON.parse(readFileSync("data/conversaciones_prueba_fde.json", "utf8"));
const conversation = (id) => dataset.conversaciones.find((c) => c.id === id);

const test = (...lines) => [{ listen: "test", script: { type: "text/javascript", exec: lines } }];
const status = (code) => `pm.test("status ${code}", () => pm.response.to.have.status(${code}));`;

function request(name, { method = "GET", path, query = [], body, auth, tests = [] }) {
  return {
    name,
    event: test(...tests),
    request: {
      method,
      ...(auth ? { auth } : {}),
      header: body !== undefined ? [{ key: "Content-Type", value: "application/json" }] : [],
      url: {
        raw: `{{baseUrl}}${path}${query.length ? "?" + query.map((q) => `${q.key}=${q.value}`).join("&") : ""}`,
        host: ["{{baseUrl}}"],
        path: path.split("/").filter(Boolean),
        query,
      },
      ...(body !== undefined
        ? { body: { mode: "raw", raw: typeof body === "string" ? body : JSON.stringify(body, null, 2), options: { raw: { language: "json" } } } }
        : {}),
    },
  };
}

// Checks every evaluator acceptance criterion on a batch response.
const batchChecks = [
  status(200),
  "const r = pm.response.json();",
  'pm.test("20 conversations evaluated, none with error", () => { pm.expect(r.conversations).to.have.lengthOf(20); pm.expect(r.meta.errorCount).to.eql(0); });',
  'pm.test("same format in every conversation", () => { const keys = JSON.stringify(Object.keys(r.conversations[0]).sort()); r.conversations.forEach(c => pm.expect(JSON.stringify(Object.keys(c).sort())).to.eql(keys)); });',
  'pm.test("every rule verdict is passed / failed / not_applicable", () => r.conversations.forEach(c => c.rules.forEach(x => pm.expect(["passed","failed","not_applicable"]).to.include(x.verdict))));',
  'pm.test("every failed criterion has a verbatim quote and an explanation", () => r.conversations.forEach(c => c.rules.forEach(x => x.subRules.filter(s => s.verdict === "failed").forEach(s => { pm.expect(s.evidence.length, `${c.conversationId} ${s.id}`).to.be.above(0); pm.expect(s.explanation).to.be.a("string").and.not.empty; }))));',
  'pm.test("failed rules carry a severity (minor / severe)", () => r.conversations.forEach(c => c.rules.filter(x => x.verdict === "failed").forEach(x => pm.expect(["minor","severe"]).to.include(x.severity))));',
  'pm.test("aggregate: global score, compliance per rule, top failures", () => { pm.expect(r.summary.globalScore).to.be.a("number"); pm.expect(r.summary.ruleCompliance).to.have.lengthOf(10); pm.expect(r.summary.topFailures.length).to.be.at.most(3); });',
  'pm.collectionVariables.set("reportId", pm.response.headers.get("X-Report-Id"));',
  'console.log("Global score", r.summary.globalScore, "| cached", r.meta.cachedCount, "/", r.meta.conversationCount, "| report", pm.response.headers.get("X-Report-Id"));',
];

const ruleVerdict = (id) => `pm.response.json().rules.find(r => r.id === "${id}")`;
const noAuth = { type: "noauth" };
const wrongKey = { type: "bearer", bearer: [{ key: "token", value: "sk_wrong_key", type: "string" }] };

const collection = {
  info: {
    name: "Audibot — evaluación de conversaciones",
    description:
      "Pega tu API key en la variable de colección `apiKey` (pestaña Variables) y ejecuta las carpetas en orden. " +
      "Cada request trae tests automáticos con los criterios de entrega. La carpeta 5 llama al LLM de verdad (consume cuota gratuita).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }] },
  variable: [
    { key: "baseUrl", value: "https://audibot.vercel.app" },
    { key: "apiKey", value: "" },
    { key: "reportId", value: "" },
  ],
  item: [
    {
      name: "1. Descubrir",
      item: [
        request("Modelos disponibles", {
          path: "/api/models",
          tests: [status(200), 'pm.test("a default model is available", () => pm.expect(pm.response.json().models.some(m => m.isDefault && m.available)).to.be.true);'],
        }),
        request("Rúbricas", {
          path: "/api/rubrics",
          tests: [status(200), 'pm.test("Banco_Andino_01 is the default", () => pm.expect(pm.response.json().rubrics.find(r => r.isDefault).name).to.eql("Banco_Andino_01"));'],
        }),
        request("Detalle de la rúbrica", {
          path: "/api/rubrics/Banco_Andino_01",
          tests: [status(200), 'pm.test("10 rules with sub-rules", () => pm.expect(pm.response.json().content.rules).to.have.lengthOf(10));'],
        }),
      ],
    },
    {
      name: "2. Evaluar el archivo completo",
      item: [
        request("Batch — archivo del cliente tal cual", {
          method: "POST",
          path: "/api/evaluate/batch",
          body: dataset,
          tests: batchChecks,
        }),
        request("Batch — descargar como results.json", {
          method: "POST",
          path: "/api/evaluate/batch",
          query: [{ key: "download", value: "true" }],
          body: dataset,
          tests: [status(200), 'pm.test("served as results.json attachment", () => pm.expect(pm.response.headers.get("Content-Disposition")).to.include("results.json"));'],
        }),
      ],
    },
    {
      name: "3. Evaluar una conversación",
      item: [
        request("C20 — dígitos de verificación no coinciden (6295 vs 6259)", {
          method: "POST",
          path: "/api/evaluate",
          body: conversation("C20"),
          tests: [status(200), `pm.test("R2 failed as severe", () => { const r = ${ruleVerdict("R2")}; pm.expect(r.verdict).to.eql("failed"); pm.expect(r.severity).to.eql("severe"); });`],
        }),
        request("C11 — monto informado incorrecto", {
          method: "POST",
          path: "/api/evaluate",
          body: conversation("C11"),
          tests: [status(200), `pm.test("R4 failed (amount checked by code)", () => { const r = ${ruleVerdict("R4")}; pm.expect(r.verdict).to.eql("failed"); pm.expect(r.subRules.find(s => s.verdict === "failed").method).to.eql("code"); });`],
        }),
        request("C17 — fecha de pago anterior a la llamada", {
          method: "POST",
          path: "/api/evaluate",
          body: conversation("C17"),
          tests: [status(200), `pm.test("R5 failed", () => pm.expect(${ruleVerdict("R5")}.verdict).to.eql("failed"));`],
        }),
        request("C04 — atiende un tercero (R3 aplica, R4 no aplica)", {
          method: "POST",
          path: "/api/evaluate",
          body: conversation("C04"),
          tests: [
            status(200),
            `pm.test("R3 passed", () => pm.expect(${ruleVerdict("R3")}.verdict).to.eql("passed"));`,
            `pm.test("R4 not applicable", () => pm.expect(${ruleVerdict("R4")}.verdict).to.eql("not_applicable"));`,
          ],
        }),
      ],
    },
    {
      name: "4. Errores y seguridad",
      item: [
        request("Sin API key → 401", { path: "/api/models", auth: noAuth, tests: [status(401)] }),
        request("API key incorrecta → 401", { path: "/api/models", auth: wrongKey, tests: [status(401)] }),
        request("JSON inválido → 400", {
          method: "POST",
          path: "/api/evaluate/batch",
          body: "{ esto no es json",
          tests: [status(400), 'pm.test("JSON error body", () => pm.expect(pm.response.json().error).to.be.a("string"));'],
        }),
        request("Formato incorrecto → 400 con detalle", {
          method: "POST",
          path: "/api/evaluate/batch",
          body: { conversaciones: [] },
          tests: [status(400), 'pm.test("explains what is wrong", () => pm.expect(pm.response.json()).to.have.property("details"));'],
        }),
        request("Idioma no soportado → 400", {
          method: "POST",
          path: "/api/evaluate",
          query: [{ key: "language", value: "fr" }],
          body: conversation("C01"),
          tests: [status(400)],
        }),
        request("Modelo desconocido → 400", {
          method: "POST",
          path: "/api/evaluate",
          query: [{ key: "model", value: "openai/gpt-x" }],
          body: conversation("C01"),
          tests: [status(400)],
        }),
        request("Rúbrica inexistente → 404", {
          method: "POST",
          path: "/api/evaluate",
          query: [{ key: "rubric", value: "No_Existe" }],
          body: conversation("C01"),
          tests: [status(404)],
        }),
      ],
    },
    {
      name: "5. Opcional — llamadas reales al LLM (consume cuota)",
      item: [
        request("C09 en inglés, sin caché", {
          method: "POST",
          path: "/api/evaluate",
          query: [
            { key: "language", value: "en" },
            { key: "fresh", value: "true" },
          ],
          body: conversation("C09"),
          tests: [
            status(200),
            'const r = pm.response.json();',
            'pm.test("not served from cache", () => pm.expect(r.cached).to.be.false);',
            'pm.test("catches the threat (R10) and ignoring \'ya pagué\' (R8)", () => { pm.expect(r.rules.find(x => x.id === "R10").verdict).to.eql("failed"); pm.expect(r.rules.find(x => x.id === "R8").verdict).to.eql("failed"); });',
          ],
        }),
      ],
    },
  ],
};

mkdirSync("docs", { recursive: true });
writeFileSync("docs/audibot.postman_collection.json", JSON.stringify(collection, null, 2));
console.log("Wrote docs/audibot.postman_collection.json");
