const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function parseCsv(source) {
  const text = String(source).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length) throw new Error(`Malformed CSV quote at character ${index}`);
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(value => value.length)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unclosed quoted field');
  row.push(field);
  if (row.some(value => value.length)) rows.push(row);
  return rows;
}

function placeholders(value) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1]).sort();
}

export function buildCatalog(source, fallbackLocale = 'en') {
  const rows = parseCsv(source);
  if (rows.length < 2) throw new Error('Translation CSV must include a header and at least one translation row');
  const [header, ...translations] = rows;
  if (header[0] !== 'key') throw new Error('Translation CSV first column must be "key"');
  const locales = header.slice(1);
  if (!locales.length || !locales.includes(fallbackLocale)) throw new Error(`Translation CSV must include ${fallbackLocale}`);
  if (new Set(locales).size !== locales.length) throw new Error('Translation CSV contains duplicate locale columns');

  const catalog = new Map();
  translations.forEach((row, index) => {
    if (row.length !== header.length) throw new Error(`Translation row ${index + 2} has ${row.length} columns; expected ${header.length}`);
    const [key, ...values] = row;
    if (!key) throw new Error(`Translation row ${index + 2} has no key`);
    if (catalog.has(key)) throw new Error(`Duplicate translation key: ${key}`);
    const entry = Object.fromEntries(locales.map((locale, localeIndex) => [locale, values[localeIndex]]));
    if (!entry[fallbackLocale]) throw new Error(`Missing ${fallbackLocale} translation for ${key}`);
    const expected = placeholders(entry[fallbackLocale]).join(',');
    locales.forEach(locale => {
      if (entry[locale] && placeholders(entry[locale]).join(',') !== expected) {
        throw new Error(`Placeholder mismatch for ${key} in ${locale}`);
      }
    });
    catalog.set(key, Object.freeze(entry));
  });
  return Object.freeze({ locales: Object.freeze(locales), catalog });
}
