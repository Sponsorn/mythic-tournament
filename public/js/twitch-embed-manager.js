(function () {
  'use strict';

  const QUALITY_FOCUS = '720p30';
  const QUALITY_OFFSCREEN = '480p30';

  // Twitch's embed runs an autoplay-visibility gate at construction time
  // (style + viewport + obscured-by-other-element checks). Pre-instantiating
  // in a hidden host fails this no matter what trick we use. So we build
  // embeds lazily INSIDE the target slot, where they're truly visible at
  // the moment Twitch.Player is constructed. Once playing, embeds can be
  // moved to the parking host without re-triggering the autoplay check.
  const embeds = {}; // teamName → { player, container, channel, lastQuality, currentParent, desiredQuality, desiredMuted, onPlaying, onReady }
  const channels = {}; // teamName → twitchChannel (tracked from syncTeams; doesn't trigger embed build)

  // Parking host for already-playing embeds. Twitch's autoplay gate has
  // already passed for these, so visibility no longer matters here.
  const parkHost = document.createElement('div');
  parkHost.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:640px;height:360px;pointer-events:none;';
  document.body.appendChild(parkHost);

  function applyDesiredState(embed) {
    try {
      const qualities = embed.player.getQualities ? embed.player.getQualities() : [];
      let match = qualities.find(q => q.group === embed.desiredQuality);
      if (!match && embed.desiredQuality === QUALITY_OFFSCREEN) {
        match = qualities.find(q => q.group === '360p30') ||
                qualities.find(q => q.group === '160p30');
      }
      if (match && embed.lastQuality !== match.group) {
        embed.player.setQuality(match.group);
        embed.lastQuality = match.group;
      }
    } catch {}
    try {
      embed.player.setMuted(embed.desiredMuted);
    } catch {}
    try { embed.player.play(); } catch {}
  }

  function buildEmbedInto(teamName, channel, slotEl) {
    const container = document.createElement('div');
    container.className = 'twitch-embed-host';
    container.style.cssText = 'width:100%;height:100%;';
    slotEl.appendChild(container);

    const player = new Twitch.Player(container, {
      channel,
      width: '100%',
      height: '100%',
      muted: true,
      autoplay: true,
      parent: [window.location.hostname],
    });

    const record = {
      player,
      container,
      channel,
      currentParent: slotEl,
      lastQuality: null,
      desiredQuality: QUALITY_OFFSCREEN,
      desiredMuted: true,
      onPlaying: null,
      onReady: null,
    };

    const onPlaying = function () {
      try {
        applyDesiredState(record);
      } catch (err) {
        console.warn('[Twitch] applyDesiredState failed for', channel, err);
      }
    };
    const onReady = function () {
      try { player.play(); } catch {}
    };
    record.onPlaying = onPlaying;
    record.onReady = onReady;
    player.addEventListener(Twitch.Player.PLAYING, onPlaying);
    player.addEventListener(Twitch.Player.READY, onReady);

    return record;
  }

  function teardownEmbed(name) {
    const embed = embeds[name];
    if (!embed) return;
    try { embed.player.removeEventListener(Twitch.Player.PLAYING, embed.onPlaying); } catch {}
    try { embed.player.removeEventListener(Twitch.Player.READY, embed.onReady); } catch {}
    try { embed.player.pause(); } catch {}
    try { embed.container.remove(); } catch {}
    delete embeds[name];
  }

  function syncTeams(teams) {
    const seen = new Set();
    teams.forEach(team => {
      if (!team.twitchChannel) return;
      seen.add(team.name);
      if (embeds[team.name] && embeds[team.name].channel !== team.twitchChannel) {
        teardownEmbed(team.name);
      }
      channels[team.name] = team.twitchChannel;
    });
    Object.keys(embeds).forEach(name => {
      if (!seen.has(name)) teardownEmbed(name);
    });
    Object.keys(channels).forEach(name => {
      if (!seen.has(name)) delete channels[name];
    });
  }

  function mountInto(teamName, slotEl, options) {
    if (!teamName || !slotEl) return;

    if (!channels[teamName]) {
      slotEl.innerHTML = `<div class="stream-tile-offline">${escapeHtml(teamName)} — no stream</div>`;
      return;
    }

    // Evict any OTHER embed currently parked in this slot
    Object.values(embeds).forEach(e => {
      if (e !== embeds[teamName] && e.currentParent === slotEl) {
        parkHost.appendChild(e.container);
        e.currentParent = parkHost;
      }
    });

    let embed = embeds[teamName];
    if (!embed) {
      // First time mounting this team — construct the player directly in
      // the visible slot so Twitch's autoplay gate passes.
      embed = buildEmbedInto(teamName, channels[teamName], slotEl);
      embeds[teamName] = embed;
    } else if (embed.currentParent !== slotEl) {
      slotEl.appendChild(embed.container);
      embed.currentParent = slotEl;
    }

    embed.desiredQuality = options && options.focused ? QUALITY_FOCUS : QUALITY_OFFSCREEN;
    applyDesiredState(embed);
  }

  function setMainAudio(unmuted, focusedTeam) {
    Object.entries(embeds).forEach(([name, e]) => {
      e.desiredMuted = !(unmuted && name === focusedTeam);
      applyDesiredState(e);
    });
  }

  function detachAll() {
    Object.values(embeds).forEach(e => {
      if (e.currentParent !== parkHost) {
        parkHost.appendChild(e.container);
        e.currentParent = parkHost;
      }
    });
  }

  function detachFrom(slotEl) {
    if (!slotEl) return;
    Object.values(embeds).forEach(e => {
      if (e.currentParent === slotEl) {
        parkHost.appendChild(e.container);
        e.currentParent = parkHost;
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.TwitchEmbedManager = { syncTeams, mountInto, setMainAudio, detachAll, detachFrom };
})();
