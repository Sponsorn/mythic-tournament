const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const VALID_LAYOUTS = ['PRE', 'A', 'C', 'D', 'G', 'LB', 'BT'];
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'director-state.json');

const DEFAULTS = {
  activeLayout: 'A',
  slots: {
    main: null,
    grid: [null, null, null, null, null, null],
    quad: [null, null, null, null],
    strip: [null, null, null, null],
  },
  altCard: {
    pinnedSlide: null,
    rotationMs: 12000,
  },
  mainAudioUnmuted: false,
  commandsList: [],
  infoboxHtml: '',
  tournamentContext: {
    title: 'M+ Tournament',
    subtitle: '',
    startSE: '',
    endSE: '',
  },
};

class DirectorState extends EventEmitter {
  constructor() {
    super();
    this.filePath = process.env.DIRECTOR_STATE_PATH || DEFAULT_PATH;
    this.state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        const merged = { ...structuredClone(DEFAULTS), ...raw };
        merged.slots = { ...structuredClone(DEFAULTS.slots), ...(raw.slots || {}) };
        merged.altCard = { ...structuredClone(DEFAULTS.altCard), ...(raw.altCard || {}) };
        merged.tournamentContext = { ...structuredClone(DEFAULTS.tournamentContext), ...(raw.tournamentContext || {}) };
        return merged;
      }
    } catch (err) {
      console.warn('[DirectorState] Failed to load, using defaults:', err.message);
    }
    return structuredClone(DEFAULTS);
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.warn('[DirectorState] Failed to save:', err.message);
    }
  }

  getState() {
    return structuredClone(this.state);
  }

  setLayout(layout) {
    if (!VALID_LAYOUTS.includes(layout)) {
      throw new Error(`unknown layout: ${layout}`);
    }
    this.state.activeLayout = layout;
    this._save();
    this.emit('change', this.getState());
  }

  setSlot(key, team) {
    const match = key.match(/^(\w+)(?:\[(\d+)\])?$/);
    if (!match) throw new Error(`invalid slot key: ${key}`);
    const [, group, idx] = match;
    if (!(group in this.state.slots)) {
      throw new Error(`unknown slot group: ${group}`);
    }
    const slot = this.state.slots[group];
    if (idx !== undefined) {
      if (!Array.isArray(slot)) {
        throw new Error(`slot group ${group} is not indexable`);
      }
      const i = Number(idx);
      if (i < 0 || i >= slot.length) {
        throw new Error(`slot index ${i} out of range for ${group} (length ${slot.length})`);
      }
      slot[i] = team;
    } else {
      if (Array.isArray(slot)) {
        throw new Error(`slot group ${group} requires an index`);
      }
      this.state.slots[group] = team;
    }
    this._save();
    this.emit('change', this.getState());
  }

  setMainAudio(unmuted) {
    this.state.mainAudioUnmuted = Boolean(unmuted);
    this._save();
    this.emit('change', this.getState());
  }

  setPinnedSlide(slide) {
    const valid = [null, 'brand', 'commands', 'info'];
    if (!valid.includes(slide)) {
      throw new Error(`unknown pinned slide: ${slide}`);
    }
    this.state.altCard.pinnedSlide = slide;
    this._save();
    this.emit('change', this.getState());
  }
}

module.exports = new DirectorState();
module.exports.VALID_LAYOUTS = VALID_LAYOUTS;
