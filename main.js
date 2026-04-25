/*
 * Pomo Timer — Obsidian Plugin
 * Inspired by https://github.com/Bahaaio/pomo
 */

'use strict';

const { Plugin, ItemView, PluginSettingTab, Setting, Modal, Notice } = require('obsidian');

const VIEW_TYPE = 'pomo-timer-view';
const SESSION   = { WORK: 'work', BREAK: 'break', LONG_BREAK: 'long-break' };

const DEFAULT_SETTINGS = {
  workDuration:      25,
  breakDuration:      5,
  longBreakDuration: 20,
  longBreakInterval:  4,
  onSessionEnd:  'ask',
  notifications:  true,
  timePresets:    [1, 5, 25],  // user-editable quick-set chips (minutes)
  lastSetSecs:    null,        // last manually-set duration; null = use workDuration
};

function todayKey() { return new Date().toISOString().slice(0, 10); }

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function svgIcon(parent, paths, w = 18, h = 18) {
  const s = parent.createSvg('svg', {
    attr: { width: w, height: h, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', 'stroke-width': '2',
            'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  });
  paths.forEach(([tag, attr]) => s.createSvg(tag, { attr }));
  return s;
}

const ICONS = {
  reset: [['polyline',{points:'1 4 1 10 7 10'}],['path',{d:'M3.51 15a9 9 0 1 0 .49-3.51'}]],
  play:  [['polygon',{points:'5 3 19 12 5 21 5 3',fill:'currentColor',stroke:'none'}]],
  pause: [['rect',{x:'6',y:'4',width:'4',height:'16',fill:'currentColor',stroke:'none'}],
          ['rect',{x:'14',y:'4',width:'4',height:'16',fill:'currentColor',stroke:'none'}]],
  skip:  [['polygon',{points:'5 4 15 12 5 20 5 4'}],['line',{x1:'19',y1:'5',x2:'19',y2:'19'}]],
};

// ─── Confirm Modal ────────────────────────────────────────────────────────────

class PomoConfirmModal extends Modal {
  constructor(app, title, message, onYes, onNo) {
    super(app);
    this._title = title; this._message = message;
    this._onYes = onYes; this._onNo = onNo;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const wrap = contentEl.createDiv({ cls: 'pomo-confirm-modal' });
    wrap.createEl('div', { cls: 'pomo-confirm-title',   text: this._title });
    wrap.createEl('div', { cls: 'pomo-confirm-message', text: this._message });
    const btns = wrap.createDiv({ cls: 'pomo-confirm-btns' });
    btns.createEl('button', { cls: 'mod-cta', text: 'Yes, start!' })
        .addEventListener('click', () => { this.close(); this._onYes(); });
    btns.createEl('button', { text: 'Not yet' })
        .addEventListener('click', () => { this.close(); this._onNo(); });
  }
  onClose() { this.contentEl.empty(); }
}

// ─── Timer View ───────────────────────────────────────────────────────────────

class PomoTimerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin  = plugin;
    this._editing = false;
  }

  getViewType()    { return VIEW_TYPE; }
  getDisplayText() { return 'Pomo Timer'; }
  getIcon()        { return 'timer'; }

  async onOpen() {
    this._build();
    this.plugin.registerView_onTick(() => this._updateDisplay());
    this._updateDisplay();
  }

  async onClose() { this.plugin.unregisterView_onTick(); }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    const root = this.contentEl;
    root.empty();
    root.addClass('pomo-view');

    // Session label
    this._elLabel = root.createEl('div', { cls: 'pomo-session-label', text: 'WORK' });

    // ── SVG ring + embedded time text ────────────────────────────────────────
    const R = 72, CX = 96, CY = 96;
    const CIRC = 2 * Math.PI * R;
    this._CIRC = CIRC;

    const ringWrap = root.createDiv({ cls: 'pomo-ring-container' });

    const svg = ringWrap.createSvg('svg', {
      attr: { width: 192, height: 192, viewBox: '0 0 192 192' }
    });

    // Background track
    svg.createSvg('circle', {
      attr: { cx: CX, cy: CY, r: R, fill: 'none',
              stroke: 'var(--background-modifier-border)', 'stroke-width': 10 }
    });

    // Progress arc
    this._arcEl = svg.createSvg('circle', {
      attr: { cx: CX, cy: CY, r: R, fill: 'none',
              stroke: 'var(--interactive-accent)', 'stroke-width': 10,
              'stroke-linecap': 'round',
              'stroke-dasharray': CIRC, 'stroke-dashoffset': CIRC,
              transform: 'rotate(-90 96 96)' }
    });

    // Time text
    this._svgTime = svg.createSvg('text', {
      attr: { x: CX, y: CY - 8, 'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-size': '32', 'font-weight': '700',
              'font-family': 'var(--font-monospace)',
              fill: 'var(--text-normal)', 'letter-spacing': '-1' }
    });

    // Status / hint line
    this._svgStatus = svg.createSvg('text', {
      attr: { x: CX, y: CY + 20, 'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-size': '10', 'font-weight': '600',
              'letter-spacing': '2', fill: 'var(--text-muted)' }
    });

    // Transparent click-target over the time area
    svg.createSvg('rect', {
      attr: { x: CX - 60, y: CY - 28, width: 120, height: 56,
              fill: 'transparent', cursor: 'pointer', rx: 6 }
    }).addEventListener('click', () => this._startTimeEdit());

    // HTML input (hidden until edit mode)
    this._timeInput = ringWrap.createEl('input', { type: 'text' });
    this._timeInput.addClass('pomo-time-edit-input');
    this._timeInput.placeholder = 'e.g. 25 or 25:30';
    this._timeInput.style.display = 'none';
    this._timeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); this._confirmTimeEdit(); }
      if (e.key === 'Escape') { e.preventDefault(); this._cancelTimeEdit();  }
    });
    this._timeInput.addEventListener('blur', () => {
      setTimeout(() => { if (this._editing) this._confirmTimeEdit(); }, 150);
    });

    // ── Controls ─────────────────────────────────────────────────────────────
    const controls = root.createDiv({ cls: 'pomo-controls' });

    this._btnReset = controls.createEl('button', { cls: 'pomo-btn pomo-btn-secondary', title: 'Reset' });
    svgIcon(this._btnReset, ICONS.reset);
    this._btnReset.addEventListener('click', () => this.plugin.reset());

    this._btnPlay = controls.createEl('button', { cls: 'pomo-btn pomo-btn-primary', title: 'Start / Pause' });
    svgIcon(this._btnPlay, ICONS.play, 22, 22);
    this._btnPlay.addEventListener('click', () => this.plugin.togglePlayPause());

    this._btnSkip = controls.createEl('button', { cls: 'pomo-btn pomo-btn-secondary', title: 'Skip' });
    svgIcon(this._btnSkip, ICONS.skip);
    this._btnSkip.addEventListener('click', () => this.plugin.skip());

    // ── Quick-set preset chips ────────────────────────────────────────────────
    this._presetsEl = root.createDiv({ cls: 'pomo-presets' });
    this._buildPresets();

    // ── Collapsible stats sections (default: closed) ──────────────────────────
    this._statsDetails  = root.createEl('details', { cls: 'pomo-section' });
    this._weekDetails   = root.createEl('details', { cls: 'pomo-section' });
    this._heatmapDetails = root.createEl('details', { cls: 'pomo-section' });

    this._buildStats();
    this._buildWeekChart();
    this._buildHeatmap();
  }

  // ── Time edit ─────────────────────────────────────────────────────────────

  _startTimeEdit() {
    if (this.plugin.state.running && !this.plugin.state.paused) return;
    this._editing = true;
    const m = Math.floor(this.plugin.state.remaining / 60);
    const s = this.plugin.state.remaining % 60;
    this._timeInput.value = s === 0 ? String(m) : `${m}:${String(s).padStart(2,'0')}`;
    this._svgTime.setAttribute('display', 'none');
    this._svgStatus.setAttribute('display', 'none');
    this._timeInput.style.display = 'block';
    this._timeInput.select();
    this._timeInput.focus();
  }

  _confirmTimeEdit() {
    if (!this._editing) return;
    const secs = _parseTimeInput(this._timeInput.value.trim());
    if (secs > 0) this.plugin.setTimeSecs(secs);
    this._cancelTimeEdit();
  }

  _cancelTimeEdit() {
    this._editing = false;
    this._timeInput.style.display = 'none';
    this._svgTime.removeAttribute('display');
    this._svgStatus.removeAttribute('display');
    this._updateDisplay();
  }

  // ── Preset chips ──────────────────────────────────────────────────────────

  _buildPresets() {
    const el = this._presetsEl;
    el.empty();

    this.plugin.settings.timePresets.forEach((min, idx) => {
      const chip = el.createDiv({ cls: 'pomo-preset-chip' });

      chip.createEl('button', { cls: 'pomo-preset-label', text: `${min}m` })
          .addEventListener('click', () => this.plugin.setTimeSecs(min * 60));

      const del = chip.createEl('button', { cls: 'pomo-preset-del', text: '×' });
      del.title = 'Remove';
      del.addEventListener('click', () => {
        this.plugin.removePreset(idx);
        this._buildPresets();
      });
    });

    el.createEl('button', { cls: 'pomo-preset-add', text: '+', title: 'Add preset' })
      .addEventListener('click', e => this._showAddPreset(e.currentTarget));
  }

  _showAddPreset(addBtn) {
    addBtn.style.display = 'none';
    const wrap = this._presetsEl.createDiv({ cls: 'pomo-preset-new' });
    const inp  = wrap.createEl('input', { type: 'number' });
    inp.addClass('pomo-preset-new-input');
    inp.placeholder = 'min'; inp.min = '1'; inp.max = '999';

    const confirm = () => {
      const val = parseInt(inp.value);
      if (val > 0) this.plugin.addPreset(val);
      this._buildPresets();
    };
    wrap.createEl('button', { cls: 'pomo-preset-new-ok',    text: '✓' }).addEventListener('click', confirm);
    wrap.createEl('button', { cls: 'pomo-preset-new-cancel',text: '✕' }).addEventListener('click', () => this._buildPresets());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); this._buildPresets(); }
    });
    inp.focus();
  }

  // ── Collapsible section helpers ───────────────────────────────────────────

  _buildSection(detailsEl, title, builderFn) {
    detailsEl.empty();
    detailsEl.createEl('summary', { cls: 'pomo-section-summary', text: title });
    const body = detailsEl.createDiv({ cls: 'pomo-section-body' });
    builderFn(body);
  }

  _buildStats() {
    this._buildSection(this._statsDetails, 'Today', body => {
      const grid  = body.createDiv({ cls: 'pomo-stats-grid' });
      const stats = this.plugin.getTodayStats();
      const add   = (v, l) => {
        const item = grid.createDiv({ cls: 'pomo-stat-item' });
        item.createEl('span', { cls: 'pomo-stat-value', text: String(v) });
        item.createEl('span', { cls: 'pomo-stat-label', text: l });
      };
      add(stats.pomodoros,           'Pomodoros');
      add(stats.focusMinutes  + 'm', 'Focus time');
      add(stats.breakMinutes  + 'm', 'Break time');
      add(stats.streak,              'Day streak');
    });
  }

  _buildWeekChart() {
    this._buildSection(this._weekDetails, 'This week', body => {
      const data     = this.plugin.getWeekData();
      const maxVal   = Math.max(...data.map(d => d.count), 1);
      const days     = ['S','M','T','W','T','F','S'];
      const todayIdx = new Date().getDay();
      const bars     = body.createDiv({ cls: 'pomo-week-bars' });
      data.forEach(d => {
        const col  = bars.createDiv({ cls: 'pomo-week-bar-col' });
        const wrap = col.createDiv({ cls: 'pomo-week-bar-wrap' });
        const bar  = wrap.createDiv({ cls: 'pomo-week-bar' + (d.dayOfWeek === todayIdx ? ' today' : '') });
        bar.style.height = Math.max(Math.round((d.count / maxVal) * 48), 2) + 'px';
        col.createEl('span', { cls: 'pomo-week-label', text: days[d.dayOfWeek] });
      });
    });
  }

  _buildHeatmap() {
    this._buildSection(this._heatmapDetails, '4-month activity', body => {
      const grid = body.createDiv({ cls: 'pomo-heatmap-grid' });
      this.plugin.getHeatmapData().forEach(d => {
        const cell = grid.createDiv({ cls: 'pomo-heatmap-day' });
        if (d.count > 0) cell.addClass('level-' + Math.min(4, Math.ceil(d.count / 2)));
        cell.title = `${d.date}: ${d.count} pomodoros`;
      });
      const legend = body.createDiv({ cls: 'pomo-heatmap-legend' });
      legend.createEl('span', { text: 'Less' });
      [0,1,2,3,4].forEach(lv => {
        const box = legend.createDiv({ cls: 'pomo-heatmap-legend-box' });
        if (lv > 0) box.addClass('level-' + lv);
      });
      legend.createEl('span', { text: 'More' });
    });
  }

  // ── Display update ────────────────────────────────────────────────────────

  _updatePlayIcon() {
    this._btnPlay.empty();
    const { running, paused } = this.plugin.state;
    svgIcon(this._btnPlay, (running && !paused) ? ICONS.pause : ICONS.play, 22, 22);
  }

  _updateDisplay() {
    if (this._editing) return;

    const { session, remaining, totalDuration, running, paused } = this.plugin.state;

    const labels = { [SESSION.WORK]:'WORK', [SESSION.BREAK]:'SHORT BREAK', [SESSION.LONG_BREAK]:'LONG BREAK' };
    this._elLabel.textContent = labels[session] || 'WORK';

    const m = Math.floor(remaining / 60), s = remaining % 60;
    this._svgTime.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    if      (running && !paused) this._svgStatus.textContent = 'RUNNING';
    else if (paused)             this._svgStatus.textContent = 'PAUSED';
    else                         this._svgStatus.textContent = 'CLICK TO SET';

    // Arc progress
    const progress = totalDuration > 0 ? (totalDuration - remaining) / totalDuration : 0;
    this._arcEl.setAttribute('stroke-dashoffset', String(this._CIRC * (1 - progress)));

    // Arc color — all from Obsidian theme vars
    const arcColor = paused               ? 'var(--text-faint)'
      : session === SESSION.WORK          ? 'var(--interactive-accent)'
      : session === SESSION.LONG_BREAK    ? 'var(--color-blue,   #2980b9)'
      :                                     'var(--color-green,  #27ae60)';
    this._arcEl.setAttribute('stroke', arcColor);

    this._updatePlayIcon();

    // Rebuild sections only when stopped or on the minute
    if (!running || remaining % 60 === 0) {
      this._buildStats();
      this._buildWeekChart();
      this._buildHeatmap();
    }
  }
}

// ─── Parse helper ─────────────────────────────────────────────────────────────

function _parseTimeInput(raw) {
  if (!raw) return 0;
  if (raw.includes(':')) {
    const [a, b] = raw.split(':');
    return (parseInt(a)||0)*60 + (parseInt(b)||0);
  }
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 60);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class PomoPlugin extends Plugin {
  constructor() {
    super(...arguments);
    this._viewTickCb  = null;
    this._statusBarEl = null;
    this.state = {
      session: SESSION.WORK, running: false, paused: false,
      remaining: 25*60, totalDuration: 25*60,
      completedPomodoros: 0, waitingConfirm: false,
    };
    this.pomodoroLog = {};
  }

  async onload() {
    const saved = await this.loadData();
    this.settings    = Object.assign({}, DEFAULT_SETTINGS, saved?.settings);
    if (!Array.isArray(this.settings.timePresets))
      this.settings.timePresets = DEFAULT_SETTINGS.timePresets.slice();
    this.pomodoroLog = saved?.log || {};
    this._resetState();

    this.registerView(VIEW_TYPE, leaf => new PomoTimerView(leaf, this));
    this.addRibbonIcon('timer', 'Pomo Timer', () => this._openView());

    this._statusBarEl = this.addStatusBarItem();
    this._statusBarEl.addClass('pomo-statusbar');
    this._statusBarEl.addEventListener('click', () => this._openView());
    this._updateStatusBar();

    this.registerInterval(window.setInterval(() => this._tick(), 1000));
    this.addSettingTab(new PomoSettingTab(this.app, this));

    this.addCommand({ id:'toggle-play-pause', name:'Play / Pause',    callback:()=>this.togglePlayPause() });
    this.addCommand({ id:'skip-session',      name:'Skip session',    callback:()=>this.skip() });
    this.addCommand({ id:'reset-timer',       name:'Reset timer',     callback:()=>this.reset() });
    this.addCommand({ id:'open-view',         name:'Open Pomo panel', callback:()=>this._openView() });
  }

  async onunload() { await this._saveData(); }

  registerView_onTick(cb) { this._viewTickCb = cb; }
  unregisterView_onTick()  { this._viewTickCb = null; }

  async _openView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length) { this.app.workspace.revealLeaf(leaves[0]); return; }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  _resetState() {
    this.state.session  = SESSION.WORK;
    this.state.running  = false;
    this.state.paused   = false;
    // ④ restore last manually-set time if available, otherwise use work duration
    const init = this.settings.lastSetSecs || (this.settings.workDuration * 60);
    this.state.remaining     = init;
    this.state.totalDuration = init;
    this.state.completedPomodoros = 0;
    this.state.waitingConfirm     = false;
  }

  _durationFor(s) {
    if (s === SESSION.WORK)       return this.settings.workDuration      * 60;
    if (s === SESSION.BREAK)      return this.settings.breakDuration     * 60;
    if (s === SESSION.LONG_BREAK) return this.settings.longBreakDuration * 60;
    return this.settings.workDuration * 60;
  }

  _nextSession() {
    if (this.state.session === SESSION.WORK)
      return (this.state.completedPomodoros + 1) % this.settings.longBreakInterval === 0
        ? SESSION.LONG_BREAK : SESSION.BREAK;
    return SESSION.WORK;
  }

  _tick() {
    if (!this.state.running || this.state.paused || this.state.waitingConfirm) return;
    this.state.remaining = Math.max(0, this.state.remaining - 1);
    if (this.state.remaining === 0) this._onSessionComplete();
    this._updateStatusBar();
    if (this._viewTickCb) this._viewTickCb();
  }

  _onSessionComplete() {
    this.state.running = false;
    if (this.state.session === SESSION.WORK) {
      this.state.completedPomodoros++;
      this._logPomodoro();
      this._notify('Work finished! 🎉', 'Time to take a break.');
    } else {
      this._notify('Break over 😴', 'Back to work!');
    }
    const next  = this._nextSession();
    const names = { [SESSION.WORK]:'Work', [SESSION.BREAK]:'Short Break', [SESSION.LONG_BREAK]:'Long Break' };
    if (this.settings.onSessionEnd === 'ask') {
      this.state.waitingConfirm = true;
      new PomoConfirmModal(this.app, `Start ${names[next]}?`, 'Session complete. Ready for the next one?',
        () => { this.state.waitingConfirm = false; this._startSession(next); },
        () => { this.state.waitingConfirm = false; this._loadSession(next);  }
      ).open();
    } else {
      this._startSession(next);
    }
  }

  _loadSession(s)  {
    this.state.session = s;
    this.state.remaining = this._durationFor(s); this.state.totalDuration = this.state.remaining;
    this.state.running = false; this.state.paused = false;
    this._updateStatusBar(); if (this._viewTickCb) this._viewTickCb();
  }

  _startSession(s) {
    this.state.session = s;
    this.state.remaining = this._durationFor(s); this.state.totalDuration = this.state.remaining;
    this.state.running = true; this.state.paused = false;
    this._updateStatusBar(); if (this._viewTickCb) this._viewTickCb();
  }

  togglePlayPause() {
    if (this.state.waitingConfirm) return;
    if (!this.state.running && !this.state.paused) this.state.running = true;
    else if (this.state.running) this.state.paused = !this.state.paused;
    this._updateStatusBar(); if (this._viewTickCb) this._viewTickCb();
  }

  skip() {
    if (this.state.waitingConfirm) return;
    if (this.state.session === SESSION.WORK && this.state.running) {
      this.state.completedPomodoros++; this._logPomodoro();
    }
    this._startSession(this._nextSession());
  }

  reset() {
    this.state.running = false; this.state.paused = false; this.state.waitingConfirm = false;
    this.state.remaining = this._durationFor(this.state.session);
    this.state.totalDuration = this.state.remaining;
    this._updateStatusBar(); if (this._viewTickCb) this._viewTickCb();
  }

  /** Set the current timer to an arbitrary number of seconds and persist it as the new default. */
  setTimeSecs(secs) {
    if (secs <= 0) return;
    this.state.remaining     = secs;
    this.state.totalDuration = secs;
    this.settings.lastSetSecs = secs;   // ④ remember for next launch
    this._saveData();
    this._updateStatusBar();
    if (this._viewTickCb) this._viewTickCb();
  }

  addPreset(minutes) {
    if (!this.settings.timePresets.includes(minutes)) {
      this.settings.timePresets.push(minutes);
      this.settings.timePresets.sort((a, b) => a - b);
    }
    this._saveData();
  }

  removePreset(idx) { this.settings.timePresets.splice(idx, 1); this._saveData(); }

  _notify(title, body) {
    if (!this.settings.notifications) return;
    new Notice(`${title} — ${body}`, 6000);
    if ('Notification' in window) {
      if (Notification.permission === 'granted') new Notification(title, { body });
      else if (Notification.permission !== 'denied')
        Notification.requestPermission().then(p => { if (p==='granted') new Notification(title,{body}); });
    }
  }

  _updateStatusBar() {
    const el = this._statusBarEl;
    if (!el) return;
    el.empty();
    const { session, running, paused, remaining } = this.state;
    const dot = el.createSpan({ cls: 'pomo-statusbar-dot' });
    if (running && !paused) dot.addClass(session === SESSION.WORK ? 'running' : 'break');
    const icon = session===SESSION.WORK ? '🍅' : session===SESSION.BREAK ? '☕' : '🌿';
    const m = String(Math.floor(remaining/60)).padStart(2,'0');
    const s = String(remaining%60).padStart(2,'0');
    el.createSpan({ text: ` ${icon} ${m}:${s}` });
  }

  _logPomodoro() {
    const key = todayKey();
    this.pomodoroLog[key] = (this.pomodoroLog[key]||0) + 1;
    this._saveData();
  }

  getTodayStats() {
    const pomodoros = this.pomodoroLog[todayKey()]||0;
    let streak = 0, d = new Date();
    while ((this.pomodoroLog[d.toISOString().slice(0,10)]||0) > 0) {
      streak++; d.setDate(d.getDate()-1);
    }
    return { pomodoros,
      focusMinutes: pomodoros * this.settings.workDuration,
      breakMinutes: Math.floor(pomodoros * this.settings.breakDuration),
      streak };
  }

  getWeekData() {
    const today = new Date();
    return Array.from({length:7},(_,i)=>{
      const d = new Date(today); d.setDate(today.getDate()-(6-i));
      return { dayOfWeek:d.getDay(), count:this.pomodoroLog[d.toISOString().slice(0,10)]||0 };
    });
  }

  getHeatmapData() {
    const today = new Date();
    return Array.from({length:120},(_,i)=>{
      const d = new Date(today); d.setDate(today.getDate()-(119-i));
      const key = d.toISOString().slice(0,10);
      return { date:key, count:this.pomodoroLog[key]||0 };
    });
  }

  async _saveData() { await this.saveData({ settings:this.settings, log:this.pomodoroLog }); }

  async saveSettings() {
    if (!this.state.running && !this.state.paused) {
      this.state.remaining     = this._durationFor(this.state.session);
      this.state.totalDuration = this.state.remaining;
    }
    await this._saveData();
    this._updateStatusBar();
    if (this._viewTickCb) this._viewTickCb();
  }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class PomoSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Pomo Timer' });
    containerEl.createEl('div', { cls:'pomo-setting-header', text:'Durations' });

    new Setting(containerEl).setName('Work duration').setDesc('Minutes per work session.')
      .addSlider(sl=>sl.setLimits(1,90,1).setValue(this.plugin.settings.workDuration).setDynamicTooltip()
        .onChange(async v=>{this.plugin.settings.workDuration=v; await this.plugin.saveSettings();}));

    new Setting(containerEl).setName('Short break').setDesc('Minutes per short break.')
      .addSlider(sl=>sl.setLimits(1,30,1).setValue(this.plugin.settings.breakDuration).setDynamicTooltip()
        .onChange(async v=>{this.plugin.settings.breakDuration=v; await this.plugin.saveSettings();}));

    new Setting(containerEl).setName('Long break').setDesc('Minutes per long break.')
      .addSlider(sl=>sl.setLimits(1,60,1).setValue(this.plugin.settings.longBreakDuration).setDynamicTooltip()
        .onChange(async v=>{this.plugin.settings.longBreakDuration=v; await this.plugin.saveSettings();}));

    new Setting(containerEl).setName('Long break interval').setDesc('Sessions before a long break.')
      .addSlider(sl=>sl.setLimits(2,8,1).setValue(this.plugin.settings.longBreakInterval).setDynamicTooltip()
        .onChange(async v=>{this.plugin.settings.longBreakInterval=v; await this.plugin.saveSettings();}));

    containerEl.createEl('div', { cls:'pomo-setting-header', text:'Behaviour' });

    new Setting(containerEl).setName('On session end')
      .setDesc('"Ask me" prompts before next session; "Auto start" begins immediately.')
      .addDropdown(dd=>dd.addOption('ask','Ask me').addOption('auto','Auto start')
        .setValue(this.plugin.settings.onSessionEnd)
        .onChange(async v=>{this.plugin.settings.onSessionEnd=v; await this.plugin.saveSettings();}));

    new Setting(containerEl).setName('Desktop notifications')
      .setDesc('Show a system notification when a session ends.')
      .addToggle(tg=>tg.setValue(this.plugin.settings.notifications)
        .onChange(async v=>{this.plugin.settings.notifications=v; await this.plugin.saveSettings();}));
  }
}

module.exports = PomoPlugin;
