const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, '_site');
const DATA = path.join(ROOT, 'data');
const errors = [];
const warnings = [];
let siteFileIndex = null;

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(filename) {
  const file = path.join(DATA, filename);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${filename}: invalid JSON (${error.message})`);
    return null;
  }
}

function exists(relativePath, base = ROOT) {
  const target = path.resolve(base, relativePath);
  return path.resolve(base) === SITE ? siteContains(target) : fs.existsSync(target);
}

function walk(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, predicate, results);
    else if (predicate(absolute)) results.push(absolute);
  }
  return results;
}

function siteContains(filePath) {
  const relative = path.relative(SITE, path.resolve(filePath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  if (!siteFileIndex) {
    siteFileIndex = new Set(
      walk(SITE, () => true).map((file) => path.relative(SITE, file).split(path.sep).join('/'))
    );
  }
  return siteFileIndex.has(relative.split(path.sep).join('/'));
}

function validateJsonData() {
  const files = fs.readdirSync(DATA).filter((name) => name.endsWith('.json')).sort();
  const parsed = Object.fromEntries(files.map((name) => [name, readJson(name)]));

  const investigators = parsed['investigators.json'];
  if (Array.isArray(investigators)) {
    const names = new Set();
    for (const person of investigators) {
      if (!person.name || !person.group) fail('investigators.json: every person needs name and group');
      if (names.has(person.name)) fail(`investigators.json: duplicate person ${person.name}`);
      names.add(person.name);

      if (!person.photo) {
        fail(`investigators.json: ${person.name} has no photo or intentional portrait asset`);
      } else {
        if (!exists(person.photo)) fail(`investigators.json: source portrait missing for ${person.name}: ${person.photo}`);
        if (!exists(person.photo, SITE)) fail(`investigators.json: built portrait missing for ${person.name}: ${person.photo}`);
      }
    }

    const researchers = investigators
      .filter((person) => person.group === 'Researchers')
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    const orders = researchers.map((person) => Number(person.sort_order));
    if (orders.some((value) => !Number.isInteger(value))) {
      fail('investigators.json: every current researcher needs an integer sort_order');
    }
    if (new Set(orders).size !== orders.length) {
      fail('investigators.json: researcher sort_order values must be unique');
    }

    const investigatorsHtml = path.join(SITE, 'investigators.html');
    if (!fs.existsSync(investigatorsHtml)) {
      fail('_site/investigators.html is missing');
    } else {
      const html = fs.readFileSync(investigatorsHtml, 'utf8');
      let previous = -1;
      for (const person of researchers) {
        const current = html.indexOf(person.name);
        if (current < 0) fail(`_site/investigators.html: ${person.name} is missing`);
        if (current >= 0 && current < previous) fail(`_site/investigators.html: researcher order is wrong at ${person.name}`);
        previous = current;
      }
    }
  }

  const surveys = parsed['surveys.json'];
  if (Array.isArray(surveys)) {
    for (const survey of surveys) {
      if (!survey.id || !survey.title || !survey.report) fail('surveys.json: every survey needs id, title, and report');
      else if (!exists(survey.report, SITE)) fail(`surveys.json: missing method report ${survey.report}`);
    }
  }

  const constructs = parsed['constructs.json'];
  if (Array.isArray(constructs)) {
    const names = new Set();
    for (const construct of constructs) {
      if (!construct.name || !construct.category || !Array.isArray(construct.waves)) {
        fail('constructs.json: every construct needs name, category, and waves');
      }
      if (names.has(construct.name)) fail(`constructs.json: duplicate construct ${construct.name}`);
      names.add(construct.name);
    }
  }

  const contributions = parsed['contributions.json'];
  if (!contributions || !Array.isArray(contributions.records)) {
    fail('contributions.json: expected an object with a records array');
  } else {
    for (const record of contributions.records) {
      if (!record.full_name || !record.project_name || !Array.isArray(record.roles) || !record.roles.length) {
        fail('contributions.json: every public record needs full_name, project_name, and at least one role');
      }
      if (record.project_url && !/^https?:\/\//i.test(record.project_url)) {
        fail(`contributions.json: unsafe project URL for ${record.full_name}`);
      }
      const forbidden = ['email', 'funding', 'conflict_of_interest', 'secondary_affiliation'];
      for (const key of forbidden) {
        if (Object.hasOwn(record, key)) fail(`contributions.json: public cache must not contain ${key}`);
      }
    }
  }
}

function stripSuffix(value) {
  return value.split('#')[0].split('?')[0];
}

function isExternal(value) {
  return /^(?:[a-z]+:|\/\/|#|www\.)/i.test(value) || value.startsWith('data:');
}

function validateLocalReferences() {
  const rootPages = fs.readdirSync(SITE)
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(SITE, name));
  const methodPages = fs.existsSync(path.join(SITE, 'methods'))
    ? fs.readdirSync(path.join(SITE, 'methods'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.join(SITE, 'methods', name))
    : [];
  const reportPages = ['2016', '2018', '2020', 'comparison'].flatMap((group) => {
    const dir = path.join(SITE, 'reports', group);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.join(dir, name));
  });
  const htmlFiles = [...rootPages, ...methodPages, ...reportPages];
  const broken = new Set();
  const referencePattern = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    let match;
    while ((match = referencePattern.exec(html)) !== null) {
      const raw = match[1].trim();
      if (!raw || isExternal(raw) || raw.includes('{{') || raw.includes('<%') || raw.includes('${')) continue;
      const clean = stripSuffix(raw);
      if (!clean) continue;
      const target = clean.startsWith('/')
        ? path.join(SITE, clean.replace(/^\/+/, ''))
        : path.resolve(path.dirname(htmlFile), clean);
      if (!siteContains(target)) {
        broken.add(`${path.relative(ROOT, htmlFile)} -> ${raw}`);
      }
    }
  }

  for (const item of broken) fail(`broken local reference: ${item}`);
}

function validateExternalLinkSafety() {
  const htmlFiles = walk(SITE, (file) => file.endsWith('.html'));
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    let match;
    while ((match = anchorPattern.exec(html)) !== null) {
      const tag = match[0];
      const href = match[2];
      let destination;
      try {
        destination = new URL(href);
      } catch {
        continue;
      }
      if (destination.hostname === 'ppbs.science' || destination.hostname.endsWith('.ppbs.science')) continue;

      const target = tag.match(/\btarget\s*=\s*(["'])([^"']*)\1/i)?.[2];
      const rel = tag.match(/\brel\s*=\s*(["'])([^"']*)\1/i)?.[2].split(/\s+/) || [];
      if (target !== '_blank' || !rel.includes('noopener') || !rel.includes('noreferrer')) {
        fail(`${path.relative(ROOT, htmlFile)}: unsafe external link attributes for ${href}`);
      }
    }
  }
}

function validateBuildOutput() {
  const required = [
    'index.html', 'investigators.html', 'methodology.html', 'publications.html',
    'reports.html', 'constructs.html', 'contributions.html', 'mentorship.html', 'faq.html', 'css/l6.css',
    'js/nav.js', 'js/contributions.js'
  ];
  for (const item of required) {
    if (!exists(item, SITE)) fail(`missing build output: _site/${item}`);
  }

  const reportFiles = ['2016', '2018', '2020', 'comparison'].flatMap((group) => {
    const dir = path.join(SITE, 'reports', group);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.join(dir, name));
  });
  if (reportFiles.length < 49) {
    fail(`expected at least 49 standalone report HTML files; found ${reportFiles.length}`);
  }
  if (reportFiles.length > 49) {
    warn(`standalone report count increased from the audited baseline of 49 to ${reportFiles.length}`);
  }
}

validateJsonData();
validateBuildOutput();
validateLocalReferences();
validateExternalLinkSafety();

for (const message of warnings) console.warn(`WARNING: ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`ERROR: ${message}`);
  console.error(`\nValidation failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`Validation passed (${warnings.length} warning(s)).`);
