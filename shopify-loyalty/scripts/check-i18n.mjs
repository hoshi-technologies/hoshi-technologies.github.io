#!/usr/bin/env node
/**
 * Vérifie les traductions :
 *  1. chaque clé utilisée dans le code (t("…"), T("…")) existe en anglais ;
 *  2. chaque langue contient toutes les clés anglaises (variantes de pluriel acceptées) ;
 *  3. les variables {…} sont identiques à l'anglais ;
 *  4. aucune clé inconnue de l'anglais ;
 *  5. les fichiers de schéma de l'extension de thème ont les mêmes clés.
 * Usage : node scripts/check-i18n.mjs [--strict]   (--strict : échoue aussi si une langue est incomplète)
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const localesDir = path.join(root, "app/i18n/locales");
const strict = process.argv.includes("--strict");
const PLURAL = /_(zero|one|two|few|many|other)$/;
let errors = 0;
let warnings = 0;
const err = (m) => (errors++, console.error("✗", m));
const warn = (m) => (warnings++, console.warn("!", m));

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const base = (k) => k.replace(PLURAL, "");

const en = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const enBases = new Set(Object.keys(en).map(base));

// 1. Clés utilisées dans le code
function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "generated", "build", ".react-router"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, files);
    else if (/\.(tsx?|js)$/.test(f.name)) files.push(p);
  }
  return files;
}
const used = new Set();
for (const file of [...walk(path.join(root, "app")), path.join(root, "extensions/loyalty-widget/assets/loyalty.js")]) {
  const src = fs.readFileSync(file, "utf8");
  const isWidget = file.endsWith("loyalty.js");
  for (const m of src.matchAll(/\b(?:t|TT?)\(\s*"([a-zA-Z0-9_.]+)"/g)) used.add(isWidget ? `widget.${m[1]}` : m[1]);
}
for (const key of used) {
  if (!enBases.has(key) && !(key in en)) err(`clé utilisée mais absente de en.json : ${key}`);
}

// 2-4. Chaque langue
const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json");
for (const file of files) {
  const code = file.replace(".json", "");
  let data;
  try {
    data = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8")));
  } catch (e) {
    err(`${file} : JSON invalide (${e.message})`);
    continue;
  }
  const bases = new Set(Object.keys(data).map(base));
  const missing = [...enBases].filter((b) => !bases.has(b));
  if (missing.length) (strict ? err : warn)(`${code} : ${missing.length} clé(s) manquante(s) (ex. ${missing.slice(0, 3).join(", ")})`);
  for (const [key, value] of Object.entries(data)) {
    const b = base(key);
    if (!enBases.has(b)) { err(`${code} : clé inconnue ${key}`); continue; }
    const ref = en[key] ?? en[`${b}_other`] ?? en[b];
    if (ref !== undefined && vars(ref) !== vars(value)) {
      // « count » peut être omis dans une forme « one » (ex. « un ami »)
      const withoutCount = (s) => s.split(",").filter((v) => v && v !== "count").join(",");
      if (!(PLURAL.test(key) && withoutCount(vars(ref)) === withoutCount(vars(value)))) {
        err(`${code} : variables différentes pour ${key} (attendu {${vars(ref)}}, trouvé {${vars(value)}})`);
      }
    }
    if (!value.trim()) err(`${code} : texte vide pour ${key}`);
  }
  // Pluriels : la forme « other » est obligatoire (repli automatique), les autres doivent
  // être des catégories que Intl.PluralRules utilise réellement pour cette langue.
  const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  const pluralBases = new Set(Object.keys(en).filter((k) => PLURAL.test(k)).map(base));
  for (const b of pluralBases) {
    if (!(`${b}_other` in data)) err(`${code} : forme « other » manquante pour ${b}`);
  }
  for (const key of Object.keys(data)) {
    const m = key.match(PLURAL);
    if (m && !categories.includes(m[1])) err(`${code} : forme de pluriel « ${m[1]} » inutilisée en ${code} (${key})`);
  }
}

// 5. Schémas de l'extension de thème
const schemaDir = path.join(root, "extensions/loyalty-widget/locales");
const schemaEn = flatten(JSON.parse(fs.readFileSync(path.join(schemaDir, "en.default.schema.json"), "utf8")));
for (const file of fs.readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json") && !f.startsWith("en."))) {
  const data = flatten(JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8")));
  const missing = Object.keys(schemaEn).filter((k) => !(k in data));
  if (missing.length) (strict ? err : warn)(`${file} : ${missing.length} clé(s) manquante(s)`);
  for (const k of Object.keys(data)) if (!(k in schemaEn)) err(`${file} : clé inconnue ${k}`);
}

console.log(`\n${Object.keys(en).length} textes anglais, ${used.size} clés utilisées, ${files.length} autres langues.`);
console.log(errors ? `${errors} erreur(s), ${warnings} avertissement(s)` : `OK (${warnings} avertissement(s))`);
process.exit(errors ? 1 : 0);
