const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const level = LOG_LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function log(lvl, tag, ...args) {
  if (LOG_LEVELS[lvl] < level) return;
  const prefix = `${timestamp()} [${lvl.toUpperCase()}]${tag ? ` [${tag}]` : ''}`;
  if (lvl === 'error') {
    console.error(prefix, ...args);
  } else if (lvl === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

module.exports = {
  debug: (tag, ...args) => log('debug', tag, ...args),
  info: (tag, ...args) => log('info', tag, ...args),
  warn: (tag, ...args) => log('warn', tag, ...args),
  error: (tag, ...args) => log('error', tag, ...args),
};
