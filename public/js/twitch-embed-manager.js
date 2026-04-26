(function () {
  'use strict';

  const QUALITY_FOCUS = '720p30';
  const QUALITY_OFFSCREEN = '480p30';

  const embeds = {}; // teamName → { player, container, channel, lastQuality, currentParent, onPlaying, desiredQuality, desiredMuted }
  // Twitch's embed runs its own autoplay gate (style visibility +
  // viewport visibility). Tricks like opacity:0 or clip-path fail it.
  // The host stays fully visible at the top-left of the viewport, but
  // sits behind .compositor (z-index:-1) — .compositor's opaque
  // background visually covers the parked embeds.
  const hiddenHost = document.createElement('div');
  hiddenHost.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:360px;pointer-events:none;z-index:-1;';
  document.body.appendChild(hiddenHost);

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
    // play() is idempotent on a playing stream — calling it from READY,
    // mountInto, and setMainAudio gives us multiple chances to start
    // playback if the first attempt was blocked.
    try { embed.player.play(); } catch {}
  }

  function buildEmbed(team) {
    if (!team.twitchChannel) return null;
    const container = document.createElement('div');
    container.className = 'twitch-embed-host';
    container.style.cssText = 'width:100%;height:100%;';
    hiddenHost.appendChild(container);

    const player = new Twitch.Player(container, {
      channel: team.twitchChannel,
      width: '100%',
      height: '100%',
      muted: true,
      autoplay: true,
      parent: [window.location.hostname],
    });

    const record = {
      player,
      container,
      channel: team.twitchChannel,
      currentParent: hiddenHost,
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
        console.warn('[Twitch] applyDesiredState failed for', team.twitchChannel, err);
      }
    };
    // OBS Browser Source / CEF blocks gesture-free autoplay even when muted.
    // Force playback as soon as the player is ready.
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
      if (!embeds[team.name]) {
        const embed = buildEmbed(team);
        if (embed) embeds[team.name] = embed;
      }
    });
    Object.keys(embeds).forEach(name => {
      if (!seen.has(name)) {
        teardownEmbed(name);
      }
    });
  }

  function mountInto(teamName, slotEl, options) {
    if (!teamName || !slotEl) return;
    const embed = embeds[teamName];
    if (!embed) {
      slotEl.innerHTML = `<div class="stream-tile-offline">${escapeHtml(teamName)} — no stream</div>`;
      return;
    }
    // Evict any OTHER embed currently parked in this slot
    Object.values(embeds).forEach(e => {
      if (e !== embed && e.currentParent === slotEl) {
        hiddenHost.appendChild(e.container);
        e.currentParent = hiddenHost;
      }
    });
    if (embed.currentParent !== slotEl) {
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
      if (e.currentParent !== hiddenHost) {
        hiddenHost.appendChild(e.container);
        e.currentParent = hiddenHost;
      }
    });
  }

  function detachFrom(slotEl) {
    if (!slotEl) return;
    Object.values(embeds).forEach(e => {
      if (e.currentParent === slotEl) {
        hiddenHost.appendChild(e.container);
        e.currentParent = hiddenHost;
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.TwitchEmbedManager = { syncTeams, mountInto, setMainAudio, detachAll, detachFrom };
})();
