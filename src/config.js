require('dotenv').config();

/**
 * Parses and validates an integer environment variable
 */
function parseIntEnv(key, defaultValue, min = -Infinity, max = Infinity) {
  const value = process.env[key];
  if (!value) return defaultValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    console.warn(`Invalid ${key}="${value}", using default: ${defaultValue}`);
    return defaultValue;
  }

  if (parsed < min || parsed > max) {
    console.warn(`${key}="${value}" out of range [${min}, ${max}], using default: ${defaultValue}`);
    return defaultValue;
  }

  return parsed;
}

/**
 * Parses a boolean environment variable
 */
function parseBoolEnv(key, defaultValue) {
  const value = String(process.env[key] || '').toLowerCase().trim();
  if (!value) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Gets a string environment variable with optional default
 */
function getStringEnv(key, defaultValue = '') {
  return process.env[key] || defaultValue;
}

// Discord Configuration
const DISCORD_TOKEN = getStringEnv('DISCORD_TOKEN');
const CLIENT_ID = getStringEnv('CLIENT_ID');
const GUILD_ID = getStringEnv('GUILD_ID');
const ANNOUNCE_CHANNEL_ID = getStringEnv('ANNOUNCE_CHANNEL_ID');
const COMMANDS_CHANNEL_ID = getStringEnv('COMMANDS_CHANNEL_ID');

// Warcraft Logs Configuration
const WCL_CLIENT_ID = getStringEnv('WCL_CLIENT_ID');
const WCL_CLIENT_SECRET = getStringEnv('WCL_CLIENT_SECRET');
const WCL_POLL_INTERVAL_MINUTES = parseIntEnv('WCL_POLL_INTERVAL_MINUTES', 5, 0, 60);
const WCL_REQUIRE_KILL = parseBoolEnv('WCL_REQUIRE_KILL', true);

// Event Window Configuration
const EVENT_START_SE = getStringEnv('EVENT_START_SE');
const EVENT_END_SE = getStringEnv('EVENT_END_SE');
const EVENT_ENFORCE_WINDOW = parseBoolEnv('EVENT_ENFORCE_WINDOW', false);

// Mythic+ Scoring Configuration
const MPLUS_DEATH_PENALTY_LT12 = parseIntEnv('MPLUS_DEATH_PENALTY_LT12', 5, 0, 300);
const MPLUS_DEATH_PENALTY_GE12 = parseIntEnv('MPLUS_DEATH_PENALTY_GE12', 15, 0, 300);

// Web Server Configuration
const WEB_PORT = parseIntEnv('WEB_PORT', 3000, 1, 65535);
const WEB_HOST = getStringEnv('WEB_HOST', '0.0.0.0');
const RECAP_DURATION_MS = parseIntEnv('RECAP_DURATION_MS', 15000, 1000, 60000);
const POLL_INTERVAL_ACTIVE_MS = parseIntEnv('POLL_INTERVAL_ACTIVE_MS', 30000, 10000, 300000);
const POLL_INTERVAL_IDLE_MS = parseIntEnv('POLL_INTERVAL_IDLE_MS', 300000, 60000, 600000);

// Timezone Configuration
const REALM_TZ = getStringEnv('REALM_TZ', 'Europe/Stockholm');

// API URLs
const WCL_TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const WCL_GQL_CLIENT = 'https://www.warcraftlogs.com/api/v2/client';

// Mythic+ Constants
const MPLUS_START_OFFSET_MS = 10 * 1000; // 10 seconds - standard M+ start delay

/**
 * Validates required configuration on startup
 */
function validateConfig() {
  const required = {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file against .env.example'
    );
  }

  // Warn about optional but recommended settings
  if (!WCL_CLIENT_ID || !WCL_CLIENT_SECRET) {
    console.warn('Warning: WCL_CLIENT_ID and WCL_CLIENT_SECRET not set. WCL features will be disabled.');
  }

  if (WCL_CLIENT_ID && WCL_CLIENT_SECRET && !ANNOUNCE_CHANNEL_ID) {
    console.warn('Warning: WCL credentials set but ANNOUNCE_CHANNEL_ID not configured.');
  }
}

/**
 * Checks if WCL credentials are configured
 */
function hasWclCredentials() {
  return Boolean(WCL_CLIENT_ID && WCL_CLIENT_SECRET);
}

module.exports = {
  // Discord
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  ANNOUNCE_CHANNEL_ID,
  COMMANDS_CHANNEL_ID,

  // Warcraft Logs
  WCL_CLIENT_ID,
  WCL_CLIENT_SECRET,
  WCL_POLL_INTERVAL_MINUTES,
  WCL_REQUIRE_KILL,
  WCL_TOKEN_URL,
  WCL_GQL_CLIENT,

  // Event Window
  EVENT_START_SE,
  EVENT_END_SE,
  EVENT_ENFORCE_WINDOW,

  // M+ Scoring
  MPLUS_DEATH_PENALTY_LT12,
  MPLUS_DEATH_PENALTY_GE12,
  MPLUS_START_OFFSET_MS,

  // Web Server
  WEB_PORT,
  WEB_HOST,
  RECAP_DURATION_MS,
  POLL_INTERVAL_ACTIVE_MS,
  POLL_INTERVAL_IDLE_MS,

  // Timezones
  REALM_TZ,

  // Functions
  validateConfig,
  hasWclCredentials,
};
