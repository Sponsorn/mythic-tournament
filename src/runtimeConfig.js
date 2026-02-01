const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'runtime-config.json');

const DEFAULTS = {
  eventStartSE: '',
  eventEndSE: '',
  pollIntervalActiveMs: 60000,
  pollIntervalIdleMs: 300000,
  requireKill: true,
};

let config = { ...DEFAULTS };

function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const data = JSON.parse(raw);
      config = { ...DEFAULTS, ...data };
      console.log('[RuntimeConfig] Loaded from', CONFIG_FILE);
    }
  } catch (err) {
    console.warn('[RuntimeConfig] Failed to load, using defaults:', err.message);
    config = { ...DEFAULTS };
  }
  return config;
}

function save() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[RuntimeConfig] Failed to save:', err.message);
  }
}

function get(key) {
  return config[key];
}

function getAll() {
  return { ...config };
}

function set(key, value) {
  if (!(key in DEFAULTS)) return false;
  config[key] = value;
  save();
  return true;
}

function update(changes) {
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (key in DEFAULTS) {
      config[key] = value;
      changed = true;
    }
  }
  if (changed) save();
  return changed;
}

// Load on module initialization
load();

module.exports = {
  load,
  save,
  get,
  getAll,
  set,
  update,
  DEFAULTS,
};
