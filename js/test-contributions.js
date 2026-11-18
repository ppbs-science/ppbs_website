const assert = require('assert');
const {
  googleCsvUrl,
  normalizeContributor,
  parseCsv,
  safeHttpUrl,
  truthy,
  validate
} = require('./sync-contributions');

const rows = parseCsv('Name,Affiliation,Role\r\n"A, B","University, City",TRUE\r\n');
assert.deepStrictEqual(rows, [{ Name: 'A, B', Affiliation: 'University, City', Role: 'TRUE' }]);
assert.strictEqual(truthy('yes'), true);
assert.strictEqual(truthy('FALSE'), false);
assert.strictEqual(
  googleCsvUrl('https://docs.google.com/spreadsheets/d/12345678901234567890/edit#gid=42'),
  'https://docs.google.com/spreadsheets/d/12345678901234567890/export?format=csv&gid=42'
);
assert.strictEqual(safeHttpUrl('javascript:alert(1)'), '');

const record = normalizeContributor(
  {
    'Project Name': 'Spanish adaptation',
    'Project URL': 'https://ppbs.science/example',
    Country: 'Spain',
    'Country Code': 'es',
    Language: 'Spanish',
    'Translation Stage': 'Validated'
  },
  {
    'First name': 'Ada',
    Surname: 'Example',
    'ORCID iD': '0000-0000-0000-000X',
    Translation: 'TRUE',
    'Political/context review': 'TRUE',
    'Primary affiliation': 'Example University',
    'Email address': 'private@example.org'
  }
);
assert.deepStrictEqual(record.roles, ['Translation', 'Political/context review']);
assert.strictEqual(record.country_code, 'ES');
assert.strictEqual(Object.hasOwn(record, 'Email address'), false);
assert.deepStrictEqual(validate([record]), []);

console.log('Contribution sync tests passed.');
