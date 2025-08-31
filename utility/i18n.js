const i18n = require('i18n');
const path = require('path');

i18n.configure({
  locales: ['en', 'sq'],
  directory: path.join(__dirname, '../locales'), // folder for JSON files
  defaultLocale: 'sq',
  queryParameter: 'lang',   // ?lang=en
  objectNotation: true
});

module.exports = i18n;
