require('dotenv').config();
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChannelType,
} = require('discord.js');
const JsonStore = require('./store');

const store = new JsonStore(path.join(__dirname, '..', 'data', 'store.json'));
const COMP_TZ = 'Europe/Stockholm';
const EPHEMERAL_FLAG = 1 << 6;
const EPIC_LOCALE = process.env.EPIC_LOCALE || 'en-US';
const EPIC_COUNTRY = process.env.EPIC_COUNTRY || 'US';
const EPIC_CHECK_INTERVAL_MS = Number(process.env.EPIC_CHECK_INTERVAL_MS || 21600000);
const EPIC_FREE_GAMES_URL =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  if (EPIC_CHECK_INTERVAL_MS > 0) {
    setInterval(() => {
      checkEpicFreeGames(readyClient).catch(err =>
        console.warn('Epic free games check failed', err)
      );
    }, EPIC_CHECK_INTERVAL_MS);
    checkEpicFreeGames(readyClient).catch(err =>
      console.warn('Epic free games initial check failed', err)
    );
  }
});

async function resolvePartials(reaction, user) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message?.partial) await reaction.message.fetch();
    if (user?.partial) await user.fetch();
  } catch (err) {
    console.warn('Failed to resolve partial', err);
  }
}

function getOffsetForDate(date) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: COMP_TZ,
      timeZoneName: 'shortOffset',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';
    const match = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return '+01:00'; // fallback
    const hours = match[1].padStart(match[1].startsWith('-') ? 3 : 2, '0');
    const minutes = match[2] || '00';
    return `${hours}:${minutes}`;
  } catch (err) {
    console.warn('Failed to derive timezone offset, defaulting to +01:00', err);
    return '+01:00';
  }
}

function toStockholmIso(dateStr, hour, minute) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateStr.match(dateOnly);
  if (!match) return null;
  const [, y, m, d] = match;
  const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), hour, minute));
  const offset = getOffsetForDate(probe);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const isoCandidate = `${y}-${m}-${d}T${hh}:${mm}:00${offset}`;
  const parsed = Date.parse(isoCandidate);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parseDateInput(input, defaultHour, defaultMinute) {
  if (!input) return null;
  const parsedDirect = Date.parse(input);
  if (!Number.isNaN(parsedDirect)) return new Date(parsedDirect).toISOString();
  // Treat as date-only in Stockholm with provided default time
  const withDefaults = toStockholmIso(input, defaultHour, defaultMinute);
  return withDefaults;
}

function buildEpicUrl() {
  const params = new URLSearchParams({
    locale: EPIC_LOCALE,
    country: EPIC_COUNTRY,
    allowCountries: EPIC_COUNTRY,
  });
  return `${EPIC_FREE_GAMES_URL}?${params.toString()}`;
}

function toEpicGameUrl(element) {
  const attrSlug = element.customAttributes?.find(
    attr => attr.key === 'com.epicgames.app.productSlug' && attr.value
  )?.value;
  const slug =
    element.productSlug ||
    element.urlSlug ||
    attrSlug ||
    element.catalogNs?.mappings?.[0]?.pageSlug ||
    element.offerMappings?.[0]?.pageSlug;
  return slug ? `https://store.epicgames.com/${EPIC_LOCALE}/p/${slug}` : null;
}

function toEpicImageUrl(element) {
  const images = element.keyImages || [];
  const preferredTypes = new Set([
    'OfferImageTall',
    'Thumbnail',
    'OfferImageWide',
    'DieselStoreFrontWide',
    'featuredMedia',
  ]);
  const preferred = images.find(img => preferredTypes.has(img.type) && img.url);
  return preferred?.url || images.find(img => img.url)?.url || null;
}

function extractFreeOffers(elements) {
  const now = Date.now();
  const allowedOfferTypes = new Set(['BASE_GAME', 'OTHERS']);
  return elements
    .filter(element => !element.offerType || allowedOfferTypes.has(element.offerType))
    .map(element => {
      const promos = element.promotions?.promotionalOffers || [];
      const activeOffers = promos.flatMap(promo => promo.promotionalOffers || []);
      const activePromo = activeOffers.find(offer => {
        const start = Date.parse(offer.startDate);
        const end = Date.parse(offer.endDate);
        return !Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end;
      });

      const price = element.price?.totalPrice;
      const isFreePrice = Number(price?.discountPrice) === 0;
      if (!isFreePrice) return null;

      const hasFreeCategory = (element.categories || []).some(cat =>
        typeof cat?.path === 'string' && cat.path.startsWith('freegames')
      );
      const eligibleByFlags = Boolean(activePromo || hasFreeCategory || element.isCodeRedemptionOnly);
      if (!eligibleByFlags) return null;

      const windowStart = activePromo?.startDate || element.effectiveDate;
      const windowEnd = activePromo?.endDate || element.expiryDate;
      if (windowStart) {
        const startTs = Date.parse(windowStart);
        if (!Number.isNaN(startTs) && now < startTs) return null;
      }
      if (windowEnd) {
        const endTs = Date.parse(windowEnd);
        if (!Number.isNaN(endTs) && now > endTs) return null;
      }

      return {
        id: element.id,
        title: element.title,
        description: element.description || null,
        url: toEpicGameUrl(element),
        imageUrl: toEpicImageUrl(element),
        startDate: windowStart || null,
        endDate: windowEnd || null,
      };
    })
    .filter(Boolean);
}

async function fetchEpicFreeGames() {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is not available; use Node 18+ or add a fetch polyfill');
  }
  const res = await fetch(buildEpicUrl());
  if (!res.ok) {
    throw new Error(`Epic API request failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const elements = body?.data?.Catalog?.searchStore?.elements || [];
  return extractFreeOffers(elements);
}

async function postEpicFreeGames(channel, offers) {
  const embeds = offers.map(offer => {
    const url = offer.url || 'https://store.epicgames.com/';
    const endTimestamp = offer.endDate ? Math.floor(Date.parse(offer.endDate) / 1000) : null;
    const endLabel = endTimestamp ? `Ends <t:${endTimestamp}:F>` : 'End time unknown';
    const description = offer.description ? `${offer.description}\n` : '';
    const embed = {
      title: offer.title || 'Free game',
      description: `${description}${url}\n${endLabel}`,
    };
    if (offer.imageUrl) {
      embed.image = { url: offer.imageUrl };
    }
    return embed;
  });
  if (!embeds.length) return;
  await channel.send({ embeds: embeds.slice(0, 10) });
}

async function checkEpicFreeGames(client, options = {}) {
  const offers = await fetchEpicFreeGames();
  const offerIds = offers.map(offer => offer.id);
  const guildIds = options.triggerGuildId
    ? [options.triggerGuildId]
    : store.getEpicGuildIds();

  for (const guildId of guildIds) {
    const config = store.getEpicConfig(guildId);
    if (!config || !config.channelId) continue;
    const channel = await client.channels.fetch(config.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    const lastIds = config.lastNotifiedOfferIds || [];
    const hasNew = offerIds.some(id => !lastIds.includes(id));
    if (offers.length && (hasNew || options.force)) {
      await postEpicFreeGames(channel, offers);
    }
    store.updateEpicNotified(guildId, offerIds, new Date().toISOString());
  }
  return offers;
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await resolvePartials(reaction, user);
  if (!reaction.message?.guildId || user?.bot) return;

  const guildId = reaction.message.guildId;
  const comp = store.getCompetition(guildId);
  if (!comp || !comp.active) return;
  if (comp.channelId && reaction.message.channelId !== comp.channelId) return;
  const now = Date.now();
  if (comp.startDate && now < Date.parse(comp.startDate)) return;
  if (comp.endDate && now > Date.parse(comp.endDate)) return;

  const url =
    reaction.message.url ||
    `https://discord.com/channels/${guildId}/${reaction.message.channelId}/${reaction.message.id}`;
  store.addReaction(guildId, reaction.message.id, url, user.id);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  await resolvePartials(reaction, user);
  if (!reaction.message?.guildId || user?.bot) return;

  const guildId = reaction.message.guildId;
  const comp = store.getCompetition(guildId);
  if (!comp || !comp.active) return;
  if (comp.channelId && reaction.message.channelId !== comp.channelId) return;
  const now = Date.now();
  if (comp.startDate && now < Date.parse(comp.startDate)) return;
  if (comp.endDate && now > Date.parse(comp.endDate)) return;

  store.removeReaction(guildId, reaction.message.id, user.id);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'top') {
    const limit = interaction.options.getInteger('limit') ?? 5;
    const entries = store.getTopMessages(interaction.guildId, limit);
    if (!entries.length) {
      await interaction.reply({
        content: 'No reactions tracked yet.',
        flags: EPHEMERAL_FLAG,
      });
      return;
    }
    const lines = entries.map((entry, idx) => {
      const suffix = idx + 1 === 1 ? 'st' : idx + 1 === 2 ? 'nd' : idx + 1 === 3 ? 'rd' : 'th';
      return `${idx + 1}${suffix}: ${entry.count} unique reactions — ${entry.url}`;
    });
    await interaction.reply(lines.join('\n'));
    return;
  }

  if (interaction.commandName === 'competition') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') {
      const name = interaction.options.getString('name', true);
      const channel = interaction.options.getChannel('channel');
      const channelId = channel ? channel.id : null;
      const startDateStr = interaction.options.getString('start_date');
      const endDateStr = interaction.options.getString('end_date');

      const startDate = parseDateInput(startDateStr, 0, 1);
      const endDate = parseDateInput(endDateStr, 23, 59);

      if (startDateStr && !startDate) {
        await interaction.reply({
          content: 'Invalid start_date. Use ISO with timezone or date-only (defaults to 00:01 Stockholm). Example: 2025-01-15 or 2025-01-15T12:00:00+01:00.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      if (endDateStr && !endDate) {
        await interaction.reply({
          content: 'Invalid end_date. Use ISO with timezone or date-only (defaults to 23:59 Stockholm). Example: 2025-01-20 or 2025-01-20T18:00:00+01:00.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
        await interaction.reply({
          content: 'start_date must be before end_date.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      if (channel && channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: 'Channel must be a text channel.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      store.startCompetition(interaction.guildId, { name, channelId, startDate, endDate });
      const target = channel ? `<#${channelId}>` : 'all channels';
      const schedule =
        startDate || endDate
          ? ` (window: ${startDate || 'now'} to ${endDate || 'no end'})`
          : '';
      await interaction.reply(
        `Competition **${name}** started. Tracking reactions in ${target}${schedule}.`
      );
      return;
    }

    if (sub === 'end') {
      store.endCompetition(interaction.guildId);
      await interaction.reply('Competition ended. Tracking paused.');
      return;
    }

    if (sub === 'status') {
      const comp = store.getCompetition(interaction.guildId);
      if (!comp) {
        await interaction.reply({
          content: 'No competition configured.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }
      const channelPart = comp.channelId ? `<#${comp.channelId}>` : 'all channels';
      const state = comp.active ? 'active' : 'inactive';
      const schedule =
        comp.startDate || comp.endDate
          ? ` Window: ${comp.startDate || 'now'} to ${comp.endDate || 'no end'}.`
          : '';
      await interaction.reply(`Competition **${comp.name}** is ${state}. Tracking in ${channelPart}.${schedule}`);
    }
  }

  if (interaction.commandName === 'epic') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('channel', true);
      if (channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: 'Channel must be a text channel.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }
      store.setEpicConfig(interaction.guildId, { channelId: channel.id });
      await interaction.reply(`Epic free games will be announced in ${channel}.`);
      return;
    }

    if (sub === 'status') {
      const config = store.getEpicConfig(interaction.guildId);
      if (!config || !config.channelId) {
        await interaction.reply({
          content: 'Epic free games announcements are not configured.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }
      const lastChecked = config.lastCheckedAt || 'never';
      await interaction.reply(
        `Epic free games are announced in <#${config.channelId}>. Last checked: ${lastChecked}.`
      );
      return;
    }

    if (sub === 'check') {
      try {
        await interaction.deferReply({ flags: EPHEMERAL_FLAG });
      } catch (err) {
        if (err?.code === 10062) {
          console.warn('Epic check interaction expired before defer', err);
          return;
        }
        throw err;
      }
      try {
        const offers = await checkEpicFreeGames(client, {
          force: true,
          triggerGuildId: interaction.guildId,
        });
        if (!offers.length) {
          await interaction.editReply('No free Epic games found right now.');
          return;
        }
        await interaction.editReply(`Found ${offers.length} free Epic game(s).`);
      } catch (err) {
        console.warn('Epic manual check failed', err);
        try {
          await interaction.editReply('Failed to check Epic free games.');
        } catch (editErr) {
          if (editErr?.code === 10062) {
            console.warn('Epic check interaction expired before edit', editErr);
            return;
          }
          throw editErr;
        }
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
