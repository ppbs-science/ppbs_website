#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'contributions.json');
const INDEX_URL = process.env.PPBS_CONTRIBUTIONS_INDEX_URL || '';
const FOLDER_ID = process.env.PPBS_TENZING_FOLDER_ID || '';
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || '';

const ROLE_COLUMNS = [
  'Conceptualization', 'Data curation', 'Formal analysis', 'Funding acquisition',
  'Investigation', 'Methodology', 'Project administration', 'Resources', 'Software',
  'Supervision', 'Validation', 'Visualization', 'Writing - original draft',
  'Writing - review & editing', 'Translation', 'Country adaptation',
  'Political/context review', 'Back-translation', 'Mentoring',
  'Research operations', 'Data governance', 'Country coordination',
  'Community engagement', 'Funding support'
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).filter((values) => values.some((value) => value.trim())).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))
  );
}

function truthy(value) {
  return /^(?:true|yes|1|x)$/i.test(String(value || '').trim());
}

function googleCsvUrl(value) {
  const url = new URL(value);
  const match = url.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!match) return value;
  const gid = url.searchParams.get('gid') || (url.hash.match(/gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

function safeText(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeHttpUrl(value) {
  const text = safeText(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeContributor(project, person) {
  const first = safeText(person['First name']);
  const middle = safeText(person['Middle name']);
  const surname = safeText(person.Surname);
  const fullName = [first, middle, surname].filter(Boolean).join(' ');
  const roles = ROLE_COLUMNS.filter((column) => truthy(person[column]));
  return {
    full_name: fullName,
    first_name: first,
    middle_name: middle,
    surname,
    orcid: safeText(person['ORCID iD']),
    affiliation: safeText(person['Primary affiliation']),
    project_name: safeText(project['Project Name']),
    project_url: safeHttpUrl(project['Project URL']),
    contribution_area: safeText(project['Contribution Area']),
    country: safeText(project.Country),
    country_code: safeText(project['Country Code']).toUpperCase(),
    language: safeText(project.Language),
    translation_stage: safeText(project['Translation Stage']),
    funding_statement: safeText(project['Funding Statement']),
    verification_status: safeText(project['Verification Status']),
    roles
  };
}

function validate(records) {
  const errors = [];
  records.forEach((record, index) => {
    const label = `record ${index + 1}`;
    if (!record.full_name) errors.push(`${label}: contributor name is missing`);
    if (!record.project_name) errors.push(`${label}: project name is missing`);
    if (!record.roles.length) errors.push(`${label}: no public contribution role is selected`);
    if (record.orcid && !/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/.test(record.orcid)) {
      errors.push(`${label}: ORCID has an invalid format`);
    }
  });
  return errors;
}

async function fetchCsv(url) {
  const response = await fetch(googleCsvUrl(url), { headers: { 'user-agent': 'PPBS-contribution-sync/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseCsv(await response.text());
}

function rowsToObjects(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const headers = values[0].map((value) => safeText(value));
  return values.slice(1).filter((row) => row.some((value) => safeText(value))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, safeText(row[index])]))
  );
}

async function fetchGoogleJson(url) {
  if (!GOOGLE_ACCESS_TOKEN) {
    throw new Error('GOOGLE_DRIVE_ACCESS_TOKEN is required for automatic folder discovery');
  }
  const response = await fetch(url, { headers: { authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}`, 'user-agent': 'PPBS-contribution-sync/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function sheetValues(spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const payload = await fetchGoogleJson(url);
  return payload.values || [];
}

async function discoverFolderProjects(folderId) {
  const query = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name,webViewLink)');
  url.searchParams.set('pageSize', '1000');
  const payload = await fetchGoogleJson(url.href);
  const projects = [];
  for (const file of payload.files || []) {
    const metadataValues = await sheetValues(file.id, 'Project metadata!A1:B20');
    const metadata = Object.fromEntries(metadataValues.map((row) => [safeText(row[0]), safeText(row[1])]));
    metadata['Project Name'] ||= file.name.replace(/\s*\|\s*Tenzing\s*\|\s*PPBS\s*$/i, '');
    metadata['Tenzing Link'] = file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`;
    metadata.__spreadsheetId = file.id;
    if (truthy(metadata.Public)) projects.push(metadata);
  }
  return projects;
}

async function readProjectPeople(project) {
  if (project.__spreadsheetId) {
    return rowsToObjects(await sheetValues(project.__spreadsheetId, 'Contributors!A1:AJ1000'));
  }
  if (!project['Tenzing Link']) throw new Error('Tenzing Link is missing');
  return fetchCsv(project['Tenzing Link']);
}

async function sync() {
  if (!INDEX_URL && !FOLDER_ID) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    const errors = validate(existing.records || []);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PPBS_CONTRIBUTIONS_INDEX_URL is not set; validated the committed public cache.');
    return;
  }

  const projects = FOLDER_ID
    ? await discoverFolderProjects(FOLDER_ID)
    : (await fetchCsv(INDEX_URL)).filter((project) => truthy(project.Public));
  const records = [];
  const failures = [];

  for (const project of projects) {
    try {
      const people = await readProjectPeople(project);
      for (const person of people) {
        if (!truthy(person['Public profile?'])) continue;
        const record = normalizeContributor(project, person);
        if (record.full_name && record.roles.length) records.push(record);
      }
    } catch (error) {
      failures.push(`${safeText(project['Project Name']) || 'Unnamed project'}: ${error.message}`);
    }
  }

  const errors = validate(records);
  if (failures.length || errors.length) {
    throw new Error([...failures, ...errors].join('\n'));
  }

  records.sort((a, b) => a.surname.localeCompare(b.surname) || a.full_name.localeCompare(b.full_name) || a.project_name.localeCompare(b.project_name));
  fs.writeFileSync(OUTPUT, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    source: FOLDER_ID ? 'google-drive-folder' : 'google-sheets-index',
    records
  }, null, 2)}\n`);
  console.log(`Wrote ${records.length} approved public contribution records from ${projects.length} projects.`);
}

if (require.main === module) {
  sync().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { ROLE_COLUMNS, discoverFolderProjects, googleCsvUrl, normalizeContributor, parseCsv, rowsToObjects, safeHttpUrl, truthy, validate };
