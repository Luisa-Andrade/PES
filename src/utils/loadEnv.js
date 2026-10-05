const fs = require('fs');
const path = require('path');

const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/;

function parseValue(rawValue = '') {
  let value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, '').trim();
  }
  return value.replace(/\\n/g, '\n');
}

function loadEnv(envPath = path.resolve(__dirname, '../../.env')) {
  if (!fs.existsSync(envPath)) return { loaded: false, path: envPath };

  const contents = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  let count = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(ENV_LINE);
    if (!match) continue;
    const [, name, rawValue = ''] = match;
    if (process.env[name] === undefined) {
      process.env[name] = parseValue(rawValue);
      count += 1;
    }
  }
  return { loaded: true, path: envPath, count };
}

module.exports = loadEnv;
