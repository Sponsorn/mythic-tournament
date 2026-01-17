const { WCL_CLIENT_ID, WCL_CLIENT_SECRET, WCL_TOKEN_URL, WCL_GQL_CLIENT } = require('./config');
const { fetchWithRetry } = require('./apiUtils');

const CODE_RE = /(?:^|\/reports\/)([A-Za-z0-9]{16})(?:[/?#].*)?$/;

const tokenCache = { token: null, exp: 0 };

function wclExtractCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(CODE_RE);
  if (match) return match[1];
  if (/^[A-Za-z0-9]{16}$/.test(raw)) return raw;
  return null;
}

async function wclGetToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && now < tokenCache.exp - 30) {
    return tokenCache.token;
  }
  if (!WCL_CLIENT_ID || !WCL_CLIENT_SECRET) {
    throw new Error('Missing WCL_CLIENT_ID / WCL_CLIENT_SECRET');
  }
  const auth = Buffer.from(`${WCL_CLIENT_ID}:${WCL_CLIENT_SECRET}`).toString('base64');
  const res = await fetchWithRetry(WCL_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  }, {
    maxRetries: 3,
    baseDelay: 1000,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`WCL token error ${res.status}: ${JSON.stringify(body)}`);
  }
  tokenCache.token = body.access_token;
  tokenCache.exp = now + Number(body.expires_in || 900);
  return tokenCache.token;
}

async function wclGraphql(query, variables) {
  const token = await wclGetToken();
  const res = await fetchWithRetry(WCL_GQL_CLIENT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  }, {
    maxRetries: 3,
    baseDelay: 1000,
  });
  const body = await res.json();
  if (!res.ok || body.errors || !body.data) {
    throw new Error(`WCL GQL error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

function makeAbsMs(reportStartMs, fightOffsetMs) {
  return Number(reportStartMs) + Number(fightOffsetMs);
}

async function wclFetchReportMplusFights(code) {
  const query = `
    query($code: String!) {
      reportData {
        report(code: $code) {
          code
          startTime
          endTime
          masterData { actors { id name server } }
          fights {
            id
            name
            startTime
            endTime
            keystoneLevel
            keystoneTime
            keystoneBonus
            rating
            kill
          }
        }
      }
    }`;
  const data = await wclGraphql(query, { code });
  const report = data.reportData?.report;
  if (!report) {
    throw new Error('Report not found or not publicly accessible');
  }
  const fights = (report.fights || []).filter(f => f.keystoneLevel);
  const actors = report.masterData?.actors || [];
  return { report, fights, actors };
}

async function wclCountDeathsForFight(code, fightId) {
  const eventsQuery = `
    query($code: String!, $fid: Int!) {
      reportData {
        report(code: $code) {
          events(
            dataType: Deaths,
            fightIDs: [$fid],
            hostilityType: Friendlies,
            limit: 10000
          ) { data }
        }
      }
    }`;
  try {
    const data = await wclGraphql(eventsQuery, { code, fid: Number(fightId) });
    const arr = data.reportData?.report?.events?.data;
    if (Array.isArray(arr)) {
      return arr.length;
    }
  } catch (err) {
    // fall through to table query
  }

  const tableQuery = `
    query($code: String!, $fid: Int!) {
      reportData {
        report(code: $code) {
          table(dataType: Deaths, fightIDs: [$fid], hostilityType: Friendlies)
        }
      }
    }`;
  try {
    const data = await wclGraphql(tableQuery, { code, fid: Number(fightId) });
    let payload = data.reportData?.report?.table;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (err) {
        payload = null;
      }
    }
    if (!payload || typeof payload !== 'object') return 0;
    const entries = payload.entries || [];
    let total = 0;
    for (const entry of entries) {
      if (Array.isArray(entry.deaths)) {
        total += entry.deaths.length;
      } else if (Number.isFinite(entry.deaths)) {
        total += Number(entry.deaths);
      } else if (Number.isFinite(entry.totalDeaths)) {
        total += Number(entry.totalDeaths);
      }
    }
    return total;
  } catch (err) {
    return 0;
  }
}

module.exports = {
  wclExtractCode,
  wclFetchReportMplusFights,
  wclCountDeathsForFight,
  makeAbsMs,
};
