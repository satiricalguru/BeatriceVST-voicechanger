'use strict';

const fs   = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let speakerProfiles    = [];
let activeSpeakerIndex = null;
let voiceChangerBypass = true;
let devicesLoaded      = false;
let backendOnline      = false;
const STORAGE_KEY_THEME = 'beatrice_theme';
const STORAGE_KEY_MODE  = 'beatrice_color_mode';
const STORAGE_KEY_SB    = 'beatrice_soundboard';
const STORAGE_KEY_LANG  = 'beatrice_language';

const SOUNDBOARD_DIR = path.join(__dirname, 'soundboard_audio');
if (!fs.existsSync(SOUNDBOARD_DIR)) fs.mkdirSync(SOUNDBOARD_DIR, { recursive: true });

// ════════════════════════════════════════════════════════════
// I18N TRANSLATIONS
// ════════════════════════════════════════════════════════════
const I18N = {
  en: {
    tab_voices: 'Target Voices',
    tab_soundboard: 'Soundboard',
    tab_settings: 'Settings',
    voices_title: 'Target Voices',
    voices_desc: 'Select a JVS speaker to morph your voice. Each speaker maps to a unique chemical element.',
    soundboard_title: 'Soundboard',
    soundboard_desc: 'Upload audio files, assign custom images, and play sounds. Click to play; right-click to change image or name.',
    settings_title: 'Settings',
    settings_desc: 'Appearance and preferences. Mode controls brightness; theme controls the accent palette.',
    settings_language: 'Language',
    settings_language_desc: 'Choose the display language for the app interface.',
    settings_color_mode: 'Color Mode',
    settings_color_mode_desc: 'Pick a fixed mode or let Beatrice follow your system setting.',
    settings_theme: 'Theme',
    settings_theme_desc: 'Desktop palettes only. The selected mode is applied on top.',
    settings_factory_reset: 'Factory Reset',
    settings_reset_name: 'Reset All Settings',
    settings_reset_desc: 'Reset theme, soundboard, and preferences to defaults.',
    settings_reset_btn: 'Reset',
    power_label: 'Voice Changer',
    audio_routing: 'Audio Routing',
    input_controls: 'Input Controls',
    dsp_modifiers: 'DSP Modifiers',
    output_controls: 'Output Controls',
  },
  ja: {
    tab_voices: 'ボイス',
    tab_soundboard: 'サウンドボード',
    tab_settings: '設定',
    voices_title: '対象ボイス',
    voices_desc: 'JVSスピーカーを選択して声を変換します。各スピーカーは独自の化学元素に対応します。',
    soundboard_title: 'サウンドボード',
    soundboard_desc: 'オーディオファイルをアップロードし、カスタム画像を割り当ててサウンドを再生。クリックで再生、右クリックで画像や名前を変更。',
    settings_title: '設定',
    settings_desc: '外観とプリファレンス。モードは明るさを、テーマはアクセントパレットを制御します。',
    settings_language: '言語',
    settings_language_desc: 'アプリインターフェースの表示言語を選択します。',
    settings_color_mode: 'カラーモード',
    settings_color_mode_desc: '固定モードを選択するか、システム設定に合わせます。',
    settings_theme: 'テーマ',
    settings_theme_desc: 'デスクトップ限定パレット。選択したモードが上書きされます。',
    settings_factory_reset: '工場出荷時設定に戻す',
    settings_reset_name: 'すべての設定をリセット',
    settings_reset_desc: 'テーマ、サウンドボード、プリファレンスをデフォルトにリセットします。',
    settings_reset_btn: 'リセット',
    power_label: 'ボイスチェンジャー',
    audio_routing: 'オーディオルーティング',
    input_controls: '入力コントロール',
    dsp_modifiers: 'DSPモディファイア',
    output_controls: '出力コントロール',
  },
  zh: {
    tab_voices: '语音',
    tab_soundboard: '声板',
    tab_settings: '设置',
    voices_title: '目标语音',
    voices_desc: '选择 JVS 说话人来转换您的声音。每个说话人对应一个独特的化学元素。',
    soundboard_title: '声板',
    soundboard_desc: '上传音频文件，分配自定义图片并播放声音。点击播放，右键更改图片或名称。',
    settings_title: '设置',
    settings_desc: '外观和偏好设置。模式控制亮度，主题控制强调色板。',
    settings_language: '语言',
    settings_language_desc: '选择应用程序界面的显示语言。',
    settings_color_mode: '颜色模式',
    settings_color_mode_desc: '选择固定模式或让 Beatrice 跟随系统设置。',
    settings_theme: '主题',
    settings_theme_desc: '仅限桌面调色板。所选模式将应用在其上。',
    settings_factory_reset: '恢复出厂设置',
    settings_reset_name: '重置所有设置',
    settings_reset_desc: '将主题、声板和偏好设置重置为默认值。',
    settings_reset_btn: '重置',
    power_label: '变声器',
    audio_routing: '音频路由',
    input_controls: '输入控制',
    dsp_modifiers: 'DSP 修改器',
    output_controls: '输出控制',
  },
};

function applyLanguage(lang) {
  localStorage.setItem(STORAGE_KEY_LANG, lang);
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    const isActive = b.dataset.lang === lang;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });
}

function loadSavedLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY_LANG) || 'en';
  applyLanguage(saved);
}

// ════════════════════════════════════════════════════════════
// DOM REFERENCES
// ════════════════════════════════════════════════════════════
const powerToggleBtn       = document.getElementById('power-toggle');
const bypassStatusEl       = document.getElementById('bypass-status');
const powerLabelEl         = document.getElementById('power-label');

const gateSlider           = document.getElementById('gate-slider');
const gateValSpan          = document.getElementById('gate-val');
const inputMeterFill       = document.getElementById('input-meter-fill');
const inputDbVal           = document.getElementById('input-db-val');

const pitchSlider          = document.getElementById('pitch-slider');
const pitchValSpan         = document.getElementById('pitch-val');

const formantSlider        = document.getElementById('formant-slider');
const formantValSpan       = document.getElementById('formant-val');

const volumeSlider         = document.getElementById('volume-slider');
const volumeValSpan        = document.getElementById('volume-val');
const outputMeterFill      = document.getElementById('output-meter-fill');
const outputDbVal          = document.getElementById('output-db-val');

const searchBox            = document.getElementById('search-box');
const searchCount          = document.getElementById('search-count');
const speakersGrid         = document.getElementById('speakers-grid');

const inputDeviceSelect    = document.getElementById('input-device-select');
const outputDeviceSelect   = document.getElementById('output-device-select');
const monitorDeviceSelect  = document.getElementById('monitor-device-select');
const hearYourselfToggle   = document.getElementById('hear-yourself-toggle');
const monitorContainer     = document.getElementById('monitor-container');

const connDot              = document.getElementById('conn-dot');
const connLabel            = document.getElementById('conn-label');
const streamDot            = document.getElementById('stream-dot');
const streamStatusText     = document.getElementById('stream-status-text');

// Settings
const settingsResetBtn     = document.getElementById('settings-reset');
const themeGrid            = document.getElementById('theme-grid');

// ════════════════════════════════════════════════════════════
// THEME SYSTEM
// ════════════════════════════════════════════════════════════
function applyTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem(STORAGE_KEY_THEME, themeName);
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === themeName);
  });
}

function applyColorMode(mode) {
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-color-mode', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-color-mode', mode);
  }
  localStorage.setItem(STORAGE_KEY_MODE, mode);
  document.querySelectorAll('.color-mode-btn').forEach(b => {
    const isActive = b.dataset.mode === mode;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'obsidian';
  const savedMode  = localStorage.getItem(STORAGE_KEY_MODE) || 'dark';
  applyTheme(savedTheme);
  applyColorMode(savedMode);
}

// Listen for system color scheme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const currentMode = localStorage.getItem(STORAGE_KEY_MODE) || 'dark';
  if (currentMode === 'system') applyColorMode('system');
});

// ════════════════════════════════════════════════════════════
// SOUNDBOARD
// ════════════════════════════════════════════════════════════
let soundboardSounds = [];
let playingAudio  = null;   // currently playing Audio object (for stop)
let playingIndex  = null;

function loadSoundboard() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SB);
    soundboardSounds = saved ? JSON.parse(saved) : [];
  } catch {
    soundboardSounds = [];
  }
  // Remove any entries with missing audio files
  soundboardSounds = soundboardSounds.filter(s => s && s.audioPath && fs.existsSync(s.audioPath));
}

function saveSoundboard() {
  localStorage.setItem(STORAGE_KEY_SB, JSON.stringify(soundboardSounds));
}

function renderSoundboardMain() {
  const container = document.getElementById('soundboard-main-grid');
  if (!container) return;
  container.innerHTML = '';

  soundboardSounds.forEach((sound, i) => {
    const el = document.createElement('div');
    el.className = 'sb-main-slot';
    el.dataset.index = i;

    const imageHtml = `<svg class="sb-default-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

    el.innerHTML = `
      <div class="sb-overlay-actions">
        <button class="sb-overlay-btn sb-btn-rename" title="Rename">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="sb-overlay-btn sb-btn-delete" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
      <div class="sb-slot-image">${imageHtml}</div>
      <div class="sb-slot-info">
        <span class="sb-slot-name">${sound.name}</span>
      </div>
      <div class="sb-play-indicator">
        <button class="sb-play-btn${playingIndex === i ? ' is-playing' : ''}" data-index="${i}">
          ${playingIndex === i
            ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
          }
        </button>
      </div>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.sb-overlay-btn')) return;
      const playBtn = e.target.closest('.sb-play-btn');
      if (playBtn) {
        const idx = parseInt(playBtn.dataset.index);
        if (playingIndex === idx) {
          stopSoundboardSlot();
        } else {
          playSoundboardSlot(idx);
        }
        return;
      }
      playSoundboardSlot(i);
    });

    el.querySelector('.sb-btn-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      startRenameSlot(i, el);
    });

    el.querySelector('.sb-btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSoundboardSound(i);
    });

    container.appendChild(el);
  });
}

function addSoundboardSound(file) {
  const ext = path.extname(file.name) || '.wav';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destPath = path.join(SOUNDBOARD_DIR, `${Date.now()}_${safeName}`);

  try {
    const data = new Uint8Array(fs.readFileSync(file.path));
    fs.writeFileSync(destPath, Buffer.from(data));
  } catch (err) {
    console.error('[Beatrice] Failed to copy audio file:', err);
    return;
  }

  soundboardSounds.push({
    name: path.basename(file.name, ext),
    audioPath: destPath,
  });
  saveSoundboard();
  renderSoundboardMain();
}

function deleteSoundboardSound(index) {
  const sound = soundboardSounds[index];
  if (sound && sound.audioPath && fs.existsSync(sound.audioPath)) {
    try { fs.unlinkSync(sound.audioPath); } catch {}
  }
  soundboardSounds.splice(index, 1);
  saveSoundboard();
  renderSoundboardMain();
}

function startRenameSlot(index, el) {
  const sound = soundboardSounds[index];
  if (!sound) return;
  const nameEl = el.querySelector('.sb-slot-name');
  if (!nameEl) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sb-rename-input';
  input.value = sound.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = () => {
    const newName = input.value.trim() || sound.name;
    sound.name = newName;
    saveSoundboard();
    renderSoundboardMain();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish();
    if (e.key === 'Escape') renderSoundboardMain();
  });
}

function playSoundboardSlot(index) {
  const sound = soundboardSounds[index];
  if (!sound || !sound.audioPath) return;
  if (!fs.existsSync(sound.audioPath)) {
    soundboardSounds.splice(index, 1);
    saveSoundboard();
    renderSoundboardMain();
    return;
  }

  playingIndex = index;
  renderSoundboardMain();

  const hearYourself = hearYourselfToggle.checked;
  const qs = new URLSearchParams({
    file_path: sound.audioPath,
    hear_yourself: String(hearYourself),
  }).toString();
  fetch(`${BACKEND_URL}/play_sound?${qs}`).catch(() => {});
}

function stopSoundboardSlot() {
  playingIndex = null;
  playingAudio = null;
  fetch(`${BACKEND_URL}/stop_sound`).catch(() => {});
  renderSoundboardMain();
}

// Upload button
const sbUploadBtn = document.getElementById('sb-upload-btn');
if (sbUploadBtn) {
  sbUploadBtn.addEventListener('click', () => {
    document.getElementById('sb-audio-input').click();
  });
}

// Audio file input handler
const sbAudioInput = document.getElementById('sb-audio-input');
if (sbAudioInput) {
  sbAudioInput.addEventListener('change', () => {
    const files = sbAudioInput.files;
    if (!files.length) return;
    for (const file of files) {
      if (file.type.startsWith('audio/')) addSoundboardSound(file);
    }
    sbAudioInput.value = '';
  });
}

// Drag-and-drop on the grid
const sbGrid = document.getElementById('soundboard-main-grid');
if (sbGrid) {
  sbGrid.addEventListener('dragover', (e) => e.preventDefault());
  sbGrid.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.type.startsWith('audio/')) addSoundboardSound(file);
    }
  });
}

// ════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════
// Theme card clicks
themeGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.theme-card');
  if (card) applyTheme(card.dataset.theme);
});

// Color mode clicks
document.querySelectorAll('.color-mode-btn:not(.lang-btn)').forEach(btn => {
  btn.addEventListener('click', () => applyColorMode(btn.dataset.mode));
});

// Language clicks
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
});

// Factory reset
settingsResetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY_THEME);
  localStorage.removeItem(STORAGE_KEY_MODE);
  localStorage.removeItem(STORAGE_KEY_SB);
  localStorage.removeItem(STORAGE_KEY_LANG);
  applyTheme('obsidian');
  applyColorMode('dark');
  applyLanguage('en');
  loadSoundboard();
  renderSoundboardMain();
});

// ════════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.add('active');
  });
});

// ════════════════════════════════════════════════════════════
// TOML SPEAKER LOADER
// ════════════════════════════════════════════════════════════
function loadSpeakerData() {
  try {
    const tomlPath = path.join(__dirname, 'beatrice_paraphernalia_jvs', 'beatrice_paraphernalia_jvs.toml');
    if (!fs.existsSync(tomlPath)) {
      showSpeakerError('Model config file not found. Please check beatrice_paraphernalia_jvs/');
      return;
    }
    const tomlText = fs.readFileSync(tomlPath, 'utf8');
    speakerProfiles = parseTOML(tomlText);

    if (speakerProfiles.length === 0) {
      showSpeakerError('No speaker profiles found in TOML config.');
      return;
    }

    renderSpeakers(speakerProfiles);
    updateSearchCount(speakerProfiles.length, speakerProfiles.length);
  } catch (err) {
    console.error('[Beatrice] Error loading speaker config:', err);
    showSpeakerError(`Failed to load speakers: ${err.message}`);
  }
}

function parseTOML(text) {
  const speakers = [];
  let cur = null;
  let inDesc = false;
  let descLines = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (inDesc) {
      if (line.endsWith('"""')) {
        descLines.push(line.slice(0, -3));
        if (cur) cur.description = descLines.join('\n').trim();
        inDesc = false;
        descLines = [];
      } else {
        descLines.push(rawLine);
      }
      continue;
    }

    const voiceMatch = line.match(/^\[voice\.(\d+)\]$/);
    if (voiceMatch) {
      cur = { index: parseInt(voiceMatch[1], 10), name: '', description: '', average_pitch: 0 };
      speakers.push(cur);
      continue;
    }

    if (!cur) continue;

    if (line.startsWith('name =')) {
      cur.name = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
      continue;
    }

    if (line.startsWith('average_pitch =')) {
      const v = parseFloat(line.split('=')[1]);
      if (!isNaN(v)) cur.average_pitch = v;
      continue;
    }

    if (line.startsWith('description = """')) {
      const afterOpen = line.slice('description = """'.length);
      if (afterOpen.endsWith('"""')) {
        cur.description = afterOpen.slice(0, -3).trim();
      } else {
        inDesc = true;
        descLines = [afterOpen];
      }
      continue;
    }
  }

  return speakers;
}

// ════════════════════════════════════════════════════════════
// RENDER SPEAKERS
// ════════════════════════════════════════════════════════════
function extractElement(description) {
  const m = description.match(/Element:\s*\r?\n\s*(.+)/i);
  return m ? m[1].trim() : 'JVS Voice';
}

function elementHue(elementStr) {
  const sym = (elementStr.match(/\(([^)]+)\)/) || [])[1] || elementStr;
  let hash = 0;
  for (let i = 0; i < sym.length; i++) {
    hash = (hash * 31 + sym.charCodeAt(i)) & 0xffff;
  }
  return hash % 360;
}

function renderSpeakers(profiles) {
  speakersGrid.innerHTML = '';

  if (profiles.length === 0) {
    speakersGrid.innerHTML = `
      <div class="empty-state" role="status">
        <div class="empty-state-icon" aria-hidden="true">&#x1F50D;</div>
        <p>No voices match your search.</p>
        <small>Try a different name or element.</small>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  profiles.forEach((speaker, i) => {
    const elemStr = extractElement(speaker.description);
    const hue     = elementHue(elemStr);
    const jvsId   = `JVS-${String(speaker.index + 1).padStart(3, '0')}`;
    const isActive = speaker.index === activeSpeakerIndex;
    const firstLine = speaker.description.split('\n').find(l => l.trim() && !l.trim().startsWith('Element:')) || '';

    const card = document.createElement('div');
    card.className = `speaker-card${isActive ? ' active' : ''}`;
    card.id        = `speaker-card-${speaker.index}`;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(isActive));
    card.setAttribute('tabindex', '0');
    card.style.animationDelay = `${Math.min(i * 16, 500)}ms`;

    card.innerHTML = `
      <div class="speaker-elem-tag"
           style="background:hsl(${hue},60%,50%,0.14);color:hsl(${hue},80%,72%);border-color:hsl(${hue},60%,60%,0.22);"
           aria-hidden="true">${elemStr}</div>
      <div class="speaker-id">${jvsId}</div>
      <div class="speaker-name">${speaker.name}</div>
      <div class="speaker-desc">${firstLine.trim()}</div>
      <div class="speaker-pitch">
        <span class="speaker-pitch-val">${speaker.average_pitch.toFixed(1)} Hz</span>
      </div>`;

    card.addEventListener('click', () => selectSpeaker(speaker.index));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectSpeaker(speaker.index);
      }
    });

    frag.appendChild(card);
  });

  speakersGrid.appendChild(frag);
}

function showSpeakerError(msg) {
  speakersGrid.innerHTML = `
    <div class="empty-state" role="alert">
      <div class="empty-state-icon" aria-hidden="true">&#x26A0;&#xFE0F;</div>
      <p>${msg}</p>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// BACKEND COMMUNICATION
// ════════════════════════════════════════════════════════════
const BACKEND_URL = 'http://127.0.0.1:5005';

async function setBackendConfig(params) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BACKEND_URL}/set_config?${qs}`);
    if (!res.ok) console.warn('[Beatrice] Backend returned', res.status);
  } catch {
    // Silently ignore
  }
}

// ════════════════════════════════════════════════════════════
// SPEAKER SELECTION
// ════════════════════════════════════════════════════════════
function selectSpeaker(index) {
  const prev = document.getElementById(`speaker-card-${activeSpeakerIndex}`);
  if (prev) {
    prev.classList.remove('active');
    prev.setAttribute('aria-selected', 'false');
  }

  activeSpeakerIndex = index;

  const next = document.getElementById(`speaker-card-${activeSpeakerIndex}`);
  if (next) {
    next.classList.add('active');
    next.setAttribute('aria-selected', 'true');
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  setBackendConfig({ speaker_index: index });
}

// ════════════════════════════════════════════════════════════
// POWER TOGGLE
// ════════════════════════════════════════════════════════════
powerToggleBtn.addEventListener('click', () => {
  voiceChangerBypass = !voiceChangerBypass;
  applyBypassUI(voiceChangerBypass);
  setBackendConfig({ bypass: voiceChangerBypass });
});

function applyBypassUI(bypass) {
  if (bypass) {
    powerToggleBtn.classList.add('active');
    powerToggleBtn.classList.remove('live');
    powerToggleBtn.setAttribute('aria-pressed', 'false');
    bypassStatusEl.className  = 'bypass-indicator active';
    bypassStatusEl.textContent = 'BYPASSED';
    powerLabelEl.textContent  = 'BYPASSED';
  } else {
    powerToggleBtn.classList.remove('active');
    powerToggleBtn.classList.add('live');
    powerToggleBtn.setAttribute('aria-pressed', 'true');
    bypassStatusEl.className  = 'bypass-indicator live';
    bypassStatusEl.textContent = 'LIVE';
    powerLabelEl.textContent  = 'LIVE';
  }
}

// ════════════════════════════════════════════════════════════
// SLIDER BINDINGS
// ════════════════════════════════════════════════════════════
gateSlider.addEventListener('input', () => {
  const val = parseFloat(gateSlider.value);
  gateValSpan.textContent = val.toFixed(3);
  gateSlider.setAttribute('aria-valuenow', val);
  setBackendConfig({ gate_threshold: val });
});

pitchSlider.addEventListener('input', () => {
  const val = parseFloat(pitchSlider.value);
  pitchValSpan.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} st`;
  pitchSlider.setAttribute('aria-valuenow', val);
  setBackendConfig({ pitch_shift: val });
});

formantSlider.addEventListener('input', () => {
  const val = parseFloat(formantSlider.value);
  formantValSpan.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}`;
  formantSlider.setAttribute('aria-valuenow', val);
  setBackendConfig({ formant_shift: val });
});

volumeSlider.addEventListener('input', () => {
  const val = parseFloat(volumeSlider.value);
  const pct = Math.round(val * 100);
  volumeValSpan.textContent = `${pct}%`;
  volumeSlider.setAttribute('aria-valuenow', pct);
  setBackendConfig({ volume: val });
});

// ════════════════════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════════════════════
let searchDebounce = null;

searchBox.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const query = searchBox.value.toLowerCase().trim();
    if (!query) {
      renderSpeakers(speakerProfiles);
      updateSearchCount(speakerProfiles.length, speakerProfiles.length);
      return;
    }
    const filtered = speakerProfiles.filter(s => {
      const id = `jvs-${String(s.index + 1).padStart(3, '0')}`;
      return (
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        id.includes(query)
      );
    });
    renderSpeakers(filtered);
    updateSearchCount(filtered.length, speakerProfiles.length);
  }, 120);
});

function updateSearchCount(shown, total) {
  searchCount.textContent = shown === total ? `${total} voices` : `${shown} / ${total}`;
}

// ════════════════════════════════════════════════════════════
// AUDIO DEVICE LOADER
// ════════════════════════════════════════════════════════════
async function loadAudioDevices() {
  try {
    const res     = await fetch(`${BACKEND_URL}/devices`);
    const devices = await res.json();

    const prevIn  = inputDeviceSelect.value;
    const prevOut = outputDeviceSelect.value;
    const prevMon = monitorDeviceSelect.value;

    inputDeviceSelect.innerHTML   = '<option value="null">Default Microphone</option>';
    outputDeviceSelect.innerHTML  = '<option value="null">Default Speaker</option>';
    monitorDeviceSelect.innerHTML = '<option value="null">Default Monitor</option>';

    devices.forEach(dev => {
      const makeOpt = () => {
        const o = document.createElement('option');
        o.value = dev.id;
        o.textContent = dev.name;
        return o;
      };
      if (dev.max_input_channels  > 0) inputDeviceSelect.appendChild(makeOpt());
      if (dev.max_output_channels > 0) {
        outputDeviceSelect.appendChild(makeOpt());
        monitorDeviceSelect.appendChild(makeOpt());
      }
    });

    if ([...inputDeviceSelect.options].some(o => o.value === prevIn))   inputDeviceSelect.value  = prevIn;
    if ([...outputDeviceSelect.options].some(o => o.value === prevOut)) outputDeviceSelect.value = prevOut;
    if ([...monitorDeviceSelect.options].some(o => o.value === prevMon)) monitorDeviceSelect.value = prevMon;
  } catch {
    // Backend not yet available
  }
}

[inputDeviceSelect, outputDeviceSelect, monitorDeviceSelect].forEach(sel => {
  sel.addEventListener('focus', loadAudioDevices, { once: false });
});

inputDeviceSelect.addEventListener('change', () =>
  setBackendConfig({ input_device_id: inputDeviceSelect.value }));

outputDeviceSelect.addEventListener('change', () =>
  setBackendConfig({ output_device_id: outputDeviceSelect.value }));

monitorDeviceSelect.addEventListener('change', () =>
  setBackendConfig({ monitor_device_id: monitorDeviceSelect.value }));

hearYourselfToggle.addEventListener('change', () => {
  const checked = hearYourselfToggle.checked;
  monitorContainer.classList.toggle('hidden', !checked);
  monitorContainer.setAttribute('aria-hidden', String(!checked));
  setBackendConfig({ hear_yourself: checked });
});

// ════════════════════════════════════════════════════════════
// BACKEND STATUS POLLING
// ════════════════════════════════════════════════════════════
function linearToDb(linear) {
  if (linear <= 0.0001) return '\u2014';
  const db = 20 * Math.log10(linear);
  return `${db.toFixed(0)} dB`;
}

function setBackendStatus(online) {
  if (online === backendOnline) return;
  backendOnline = online;

  if (online) {
    connDot.className = 'conn-dot connected';
    connLabel.textContent = 'Backend connected';
    streamDot.className  = 'status-dot live';
    streamStatusText.textContent = 'Audio Stream Active';
    const badge = document.getElementById('backend-status-badge');
    if (badge) badge.textContent = 'CONNECTED';
  } else {
    connDot.className = 'conn-dot error';
    connLabel.textContent = 'Backend offline';
    streamDot.className  = 'status-dot error';
    streamStatusText.textContent = 'Backend Offline';
    inputMeterFill.style.width  = '0%';
    outputMeterFill.style.width = '0%';
    inputDbVal.textContent  = '\u2014';
    outputDbVal.textContent = '\u2014';
    const badge = document.getElementById('backend-status-badge');
    if (badge) badge.textContent = 'OFFLINE';
  }
}

async function pollBackendStatus() {
  try {
    const res    = await fetch(`${BACKEND_URL}/status`, { signal: AbortSignal.timeout(800) });
    const status = await res.json();

    setBackendStatus(true);

    if (!devicesLoaded) {
      await loadAudioDevices();
      if (status.input_device_id   != null) inputDeviceSelect.value  = String(status.input_device_id);
      if (status.output_device_id  != null) outputDeviceSelect.value = String(status.output_device_id);
      if (status.monitor_device_id != null) monitorDeviceSelect.value = String(status.monitor_device_id);
      if (typeof status.hear_yourself === 'boolean') {
        hearYourselfToggle.checked = status.hear_yourself;
        monitorContainer.classList.toggle('hidden', !status.hear_yourself);
        monitorContainer.setAttribute('aria-hidden', String(!status.hear_yourself));
      }
      devicesLoaded = true;
    }

    const inW  = Math.min(100, (status.input_meter  || 0) * 350);
    const outW = Math.min(100, (status.output_meter || 0) * 350);

    inputMeterFill.style.width  = `${inW}%`;
    outputMeterFill.style.width = `${outW}%`;

    inputDbVal.textContent  = linearToDb(status.input_meter  || 0);
    outputDbVal.textContent = linearToDb(status.output_meter || 0);

    if (typeof status.bypass === 'boolean' && status.bypass !== voiceChangerBypass) {
      voiceChangerBypass = status.bypass;
      applyBypassUI(voiceChangerBypass);
    }
  } catch {
    setBackendStatus(false);
  }
}

// ════════════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════════════
loadSavedTheme();
loadSavedLanguage();
loadSoundboard();
renderSoundboardMain();
loadSpeakerData();
applyBypassUI(voiceChangerBypass);
setInterval(pollBackendStatus, 250);