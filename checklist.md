  Pre-Event Data Reset                                                                                                             
  - Clear data/wcl_scores.csv (keep header row only)                                                                            
  - Clear seenWcl in data/wcl.json (set to {} or [])   
  - Clear leaderboardWcl in data/wcl.json (set to {})
  - Clear wclMeta in data/wcl.json (set to {})

  Environment / .env Config

  - Set EVENT_START_SE and EVENT_END_SE to new event times
  - Set EVENT_ENFORCE_WINDOW=true
  - Verify WCL_CLIENT_ID and WCL_CLIENT_SECRET are set
  - Set POLL_INTERVAL_ACTIVE_MS as desired (default 60s, can lower to 30s)
  - Set ADMIN_SECRET if using admin auth

  Team Setup

  - Verify teams in data/wcl.json have correct WCL report codes for the new event
  - Verify team brackets (A/B/C/D) are correct
  - Verify team numbers/names are up to date

  Go-Live Verification

  - Run npm start and confirm no config warnings in console
  - Open admin panel and confirm teams are listed
  - Run cloudflared tunnel run mplus-tournament in a separate console
  - Trigger a manual refresh from admin to confirm WCL API auth works
  - Confirm first poll picks up a test run (if available)

  OBS Verification

  - Check overlays in OBS
  - Clear saved recordings
  - Start stream and recording