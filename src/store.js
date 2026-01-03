const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { competitions: {}, epic: {} };
    this.ensureFile();
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.data = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to read store, resetting file', err);
      this.data = { competitions: {}, epic: {} };
      this.save();
    }
    if (!this.data.competitions) this.data.competitions = {};
    if (!this.data.epic) this.data.epic = {};
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  getCompetition(guildId) {
    return this.data.competitions[guildId] || null;
  }

  startCompetition(guildId, { name, channelId, startDate, endDate }) {
    this.data.competitions[guildId] = {
      name,
      channelId: channelId || null,
      active: true,
      startDate: startDate || null,
      endDate: endDate || null,
      messages: {},
    };
    this.save();
  }

  endCompetition(guildId) {
    const comp = this.data.competitions[guildId];
    if (!comp) return;
    comp.active = false;
    this.save();
  }

  resetCompetition(guildId) {
    delete this.data.competitions[guildId];
    this.save();
  }

  upsertMessage(guildId, messageId, url) {
    const comp = this.data.competitions[guildId];
    if (!comp) return null;
    if (!comp.messages[messageId]) {
      comp.messages[messageId] = {
        url,
        users: [],
      };
    } else if (!comp.messages[messageId].url) {
      comp.messages[messageId].url = url;
    }
    return comp.messages[messageId];
  }

  addReaction(guildId, messageId, url, userId) {
    const comp = this.data.competitions[guildId];
    if (!comp || !comp.active) return null;
    const message = this.upsertMessage(guildId, messageId, url);
    if (!message.users.includes(userId)) {
      message.users.push(userId);
      this.save();
    }
    return { count: message.users.length, url: message.url };
  }

  removeReaction(guildId, messageId, userId) {
    const comp = this.data.competitions[guildId];
    if (!comp || !comp.active) return null;
    const message = comp.messages[messageId];
    if (!message) return null;
    const before = message.users.length;
    message.users = message.users.filter(id => id !== userId);
    if (message.users.length !== before) {
      this.save();
    }
    return { count: message.users.length, url: message.url };
  }

  getTopMessages(guildId, limit) {
    const comp = this.data.competitions[guildId];
    if (!comp) return [];
    return Object.entries(comp.messages)
      .map(([id, data]) => ({
        messageId: id,
        count: data.users.length,
        url: data.url,
      }))
      .filter(entry => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getEpicConfig(guildId) {
    return this.data.epic[guildId] || null;
  }

  setEpicConfig(guildId, { channelId }) {
    const existing = this.data.epic[guildId] || {};
    this.data.epic[guildId] = {
      channelId: channelId || existing.channelId || null,
      lastNotifiedOfferIds: existing.lastNotifiedOfferIds || [],
      lastCheckedAt: existing.lastCheckedAt || null,
    };
    this.save();
  }

  updateEpicNotified(guildId, offerIds, checkedAt) {
    const existing = this.data.epic[guildId] || {};
    this.data.epic[guildId] = {
      channelId: existing.channelId || null,
      lastNotifiedOfferIds: offerIds,
      lastCheckedAt: checkedAt || new Date().toISOString(),
    };
    this.save();
  }

  getEpicGuildIds() {
    return Object.keys(this.data.epic);
  }
}

module.exports = JsonStore;
