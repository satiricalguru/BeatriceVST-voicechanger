'use strict';

const fs   = require('fs');
const path = require('path');

const JVS_FEMALE_NAMES = [
  "Lumine", "Raiden", "Nahida", "Furina", "Jean", "Lisa", "Amber", "Eula", "Mona", "Klee", 
  "Sucrose", "Noelle", "Fischl", "Barbara", "Rosaria", "Diona", "Ganyu", "Keqing", "Hu Tao", "Qiqi", 
  "Shenhe", "Yelan", "Ningguang", "Beidou", "Xiangling", "Xinyan", "Yun Jin", "Yanfei", "Yaoyao", "Ayaka", 
  "Yoimiya", "Kokomi", "Yae Miko", "Sayu", "Sara", "Shinobu", "Kirara", "Collei", "Dori", "Candace", 
  "Layla", "Faruzan", "Dehya", "Lynette", "Navia", "Chevreuse", "Sigewinne", "Emilie", "Paimon",
  "Tifa", "Aerith", "Zelda"
];

const JVS_MALE_NAMES = [
  "Aether", "Venti", "Zhongli", "Diluc", "Kaeya", "Albedo", "Bennett", "Razor", "Xiao", "Xingqiu", 
  "Chongyun", "Ayato", "Itto", "Kazuha", "Heizou", "Gorou", "Thoma", "Cyno", "Tighnari", "Alhaitham", 
  "Kaveh", "Mika", "Freminet", "Lyney", "Wriothesley", "Neuvillette", "Childe", "Wanderer", "Baizhu", 
  "Dainsleif", "Cloud", "Sephiroth", "Link", "Ren", "Haruto", "Yuto", "Yuki", "Kenji", 
  "Hiroshi", "Takashi", "Katsuki", "Shota", "Daiki", "Ryota", "Sora", "Kaito", "Tatsuya", "Riku"
];

const AVATAARS_MALE_HAIR = [
  'shortCurly', 'shortFlat', 'shortRound', 'shortWaved',
  'theCaesar', 'theCaesarAndSidePart', 'dreads', 'dreads01',
  'dreads02', 'fro', 'shavedSides', 'sides'
];

const AVATAARS_FEMALE_HAIR = [
  'bigHair', 'bob', 'bun', 'curly', 'curvy',
  'frida', 'frizzle', 'froBand', 'longButNotTooLong',
  'miaWallace', 'shaggy', 'shaggyMullet', 'straight01',
  'straight02', 'straightAndStrand'
];

const AVATAR_BACKGROUNDS = [
  'b6e3f4', 'c0aede', 'd1c4e9', 'ffd54f', 'ffb74d', 'ff8a65',
  'a5d6a7', '80cbc4', '80deea', '9fa8da', 'f48fb1', 'f06292'
];


// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let speakerProfiles    = [];
let activeSpeakerIndex = null;
let activeCategory     = 'all';
let voiceChangerBypass = true;
let microphoneMuted = false;
let hearSoundboard = true;
let lastPlayedSoundboardIndex = null;
let isRecordingKeybindForSlot = null;

function assignSpeakerCategories(speaker, activeModel) {
  const cats = ['all'];
  const name = speaker.name.toLowerCase();
  
  if (activeModel === 'jvs') {
    const isFemale = speaker.average_pitch > 53.0;
    if (isFemale) {
      cats.push('female');
      cats.push('human');
    } else {
      cats.push('male');
      cats.push('human');
    }
    
    if (name === "glados" || name === "evil ai") {
      cats.push('robotic');
      cats.push('sci-fi');
    }
    
    if (["sonic", "shadow", "mario", "luigi", "bowser", "goku", "luffy", "naruto", "sasuke", "paimon", "banana"].includes(name)) {
      cats.push('memes');
    }
    
    if (["furina", "hu tao", "itto", "venti", "fischl", "bennett", "kazuha", "sephiroth", "cloud", "link", "zelda", "akaryu", "akatsume"].includes(name)) {
      cats.push('roleplay');
    }
    
    if (speaker.average_pitch > 58) {
      cats.push('high-pitched');
    } else if (speaker.average_pitch < 51) {
      cats.push('deep');
    }
  } else if (activeModel === 'official_1') {
    cats.push('human');
    cats.push('female');
    if (name.includes('tsukuyomichan') || name.includes('fukuyomichan')) {
      cats.push('high-pitched');
    } else if (name.includes('tokinashigure')) {
      cats.push('roleplay');
    }
  } else if (activeModel === 'old_tts') {
    cats.push('robotic');
    cats.push('sci-fi');
    if (name.includes('mary')) {
      cats.push('female');
    } else if (name.includes('mike') || name.includes('paul') || name.includes('sam') || name.includes('male')) {
      cats.push('human');
      cats.push('male');
      cats.push('deep');
    }
  } else if (activeModel.startsWith('custom:')) {
    if (speaker.categories && Array.isArray(speaker.categories)) {
      speaker.categories.forEach(c => cats.push(c));
    } else {
      cats.push('memes');
      cats.push('human');
      cats.push('male');
      cats.push('deep');
    }
  }
  
  speaker.categories = cats;
}

function resetCategoryFilter() {
  activeCategory = 'all';
  document.querySelectorAll('.category-btn').forEach(btn => {
    const isAll = btn.dataset.category === 'all';
    btn.classList.toggle('active', isAll);
    btn.setAttribute('aria-selected', String(isAll));
  });
}
let devicesLoaded      = false;
let backendOnline      = false;
const STORAGE_KEY_THEME = 'beatrice_theme';
const STORAGE_KEY_MODE  = 'beatrice_color_mode';
const STORAGE_KEY_SB    = 'beatrice_soundboard';
const STORAGE_KEY_LANG  = 'beatrice_language';
const STORAGE_KEY_MODEL = 'beatrice_active_model';

const AVAILABLE_MODELS = {
  jvs: {
    name: "JVS Corpus (100 Voices)",
    folder: "beatrice_paraphernalia_jvs",
    toml: "beatrice_paraphernalia_jvs.toml"
  },
  official_1: {
    name: "Official Model (3 Voices)",
    folder: "beatrice_paraphernalia_official_1",
    toml: "beatrice_paraphernalia_official_1.toml"
  },
  old_tts: {
    name: "Classic Old TTS (8 Voices)",
    folder: "beatrice_paraphernalia_old_tts",
    toml: "beatrice_paraphernalia_old_tts.toml"
  }
  // User-uploaded custom models are dynamically added via scanCustomModels()
};

// When packaged, __dirname contains 'app.asar' (the virtual archive path).
// For the packaged app, static assets (built-in models, VST3) are unpacked in app.asar.unpacked.
const IS_PACKAGED = __dirname.includes('app.asar');
const APP_BASE    = IS_PACKAGED ? __dirname.replace('app.asar', 'app.asar.unpacked') : __dirname;

const { ipcRenderer }   = require('electron');
const USER_DATA_PATH    = ipcRenderer.sendSync('get-user-data-path');
const SOUNDBOARD_DIR    = path.join(USER_DATA_PATH, 'soundboard_audio');
const CUSTOM_MODELS_DIR = path.join(USER_DATA_PATH, 'custom_models');
if (!fs.existsSync(SOUNDBOARD_DIR))    fs.mkdirSync(SOUNDBOARD_DIR,    { recursive: true });

// Permanently delete any legacy cache folder
const legacyCacheDir = path.join(SOUNDBOARD_DIR, 'cache');
if (fs.existsSync(legacyCacheDir)) {
  try {
    fs.rmSync(legacyCacheDir, { recursive: true, force: true });
  } catch (err) {
    console.warn('[Legacy Cache Cleanup Failed]', err);
  }
}

if (!fs.existsSync(CUSTOM_MODELS_DIR)) fs.mkdirSync(CUSTOM_MODELS_DIR, { recursive: true });

// ── Presets & Categories ──────────────────────────────────
const FAMOUS_PRESETS = [
  // === MEMES ===
  {
    id: 'preset-bruh',
    name: 'Bruh Sound Effect',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Facepalm.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/bruh.mp3',
    author: 'Meme Central',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-emotional-damage',
    name: 'Emotional Damage',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Facepalm.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/emotional-damage-meme.mp3',
    author: 'Steven He',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-winxp-error',
    name: 'Windows XP Error',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Windows_logo_-_2012.svg',
    url: 'https://www.myinstants.com/media/sounds/windows-xp-error.mp3',
    author: 'Microsoft',
    license: 'Copyright Microsoft'
  },
  {
    id: 'preset-gta-wasted',
    name: 'GTA Wasted',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Grand_Theft_Auto_logo_series.svg',
    url: 'https://www.myinstants.com/media/sounds/gta-v-wasted-death-sound.mp3',
    author: 'Rockstar Games',
    license: 'Copyright Rockstar'
  },
  {
    id: 'preset-sad-violin',
    name: 'Sad Violin Meme',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Violin.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/sad-violin.mp3',
    author: 'Spongememe',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-coffin-dance',
    name: 'Coffin Dance (Astronomia)',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Coffin.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/coffin-dance.mp3',
    author: 'Vicetone & Tony Igy',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-taco-bell',
    name: 'Taco Bell Bong',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bell-solid.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/taco-bell-bong.mp3',
    author: 'Taco Bell',
    license: 'Copyright Taco Bell'
  },
  {
    id: 'preset-curb-robert',
    name: 'Directed by Robert B. Weide',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Facepalm.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/directed-by-robert-b-weide-theme-meme.mp3',
    author: 'Luciano Michelini',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-fbi-open-up',
    name: 'FBI Open Up!',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Seal_of_the_Federal_Bureau_of_Investigation.svg',
    url: 'https://www.myinstants.com/media/sounds/fbi-open-up-sfx.mp3',
    author: 'Federal Meme',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-discord-call',
    name: 'Discord Call Ringtone',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-call.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-discord-join',
    name: 'Discord User Join',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-join.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-discord-leave',
    name: 'Discord User Leave',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-leave.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-discord-mute',
    name: 'Discord Mute Self',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-mute.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-discord-unmute',
    name: 'Discord Unmute Self',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-unmute.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-discord-disconnect',
    name: 'Discord Disconnect',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-disconnect.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-discord-ping',
    name: 'Discord Notification Ping',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    image: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://www.myinstants.com/media/sounds/discord-notification.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },

  // === ANIME ===
  {
    id: 'preset-nani',
    name: 'Omae Wa Mou Shindeiru (NANI?!)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Kenshiro',
    url: 'https://www.myinstants.com/media/sounds/omae-wa-mou-shindeiru.mp3',
    author: 'Fist of the North Star',
    license: 'Copyright Shonen'
  },
  {
    id: 'preset-za-warudo',
    name: 'Za Warudo! (Time Stop)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'DIO JoJo',
    url: 'https://www.myinstants.com/media/sounds/hd-stardust-crusaders-za-warudo_1.mp3',
    author: 'Jojo\'s Bizarre Adventure',
    license: 'Copyright David Production'
  },
  {
    id: 'preset-tuturu',
    name: 'Tuturu! Mayuri',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Mayuri Shiina',
    url: 'https://www.myinstants.com/media/sounds/tuturu_1.mp3',
    author: 'Steins;Gate',
    license: 'Copyright White Fox'
  },
  {
    id: 'preset-dbz-teleport',
    name: 'Dragon Ball Z Teleport',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    image: 'https://dragonball-api.com/characters/goku_normal.webp',
    url: 'https://www.myinstants.com/media/sounds/dbz-teleport.mp3',
    author: 'Toei Animation',
    license: 'Copyright Toei'
  },
  {
    id: 'preset-naruto-sad',
    name: 'Sadness and Sorrow',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Naruto Uzumaki',
    url: 'https://www.myinstants.com/media/sounds/sad-naruto.mp3',
    author: 'Toshio Masuda',
    license: 'Copyright Studio Pierrot'
  },
  {
    id: 'preset-goku-ui',
    name: 'Ultra Instinct Theme',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    image: 'https://dragonball-api.com/characters/goku_normal.webp',
    url: 'https://www.myinstants.com/media/sounds/ultra-instinct-theme-official-version.mp3',
    author: 'Dragon Ball Super',
    license: 'Copyright Toei'
  },
  {
    id: 'preset-nico-nii',
    name: 'Nico Nico Nii',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Nico Yazawa',
    url: 'https://www.myinstants.com/media/sounds/nico-nico-nii.mp3',
    author: 'Love Live!',
    license: 'Copyright Sunrise'
  },
  {
    id: 'preset-kono-dio-da',
    name: 'Kono Dio Da! (It was me, Dio)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'DIO JoJo',
    url: 'https://www.myinstants.com/media/sounds/kono-dio-da99.mp3',
    author: 'JoJo\'s Bizarre Adventure',
    license: 'Copyright David Production'
  },
  {
    id: 'preset-gomu-gomu',
    name: 'Gomu Gomu No! (Luffy)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    image: 'https://static.wikia.nocookie.net/onepiece/images/6/6d/Monkey_D._Luffy_Anime_Post_Timeskip_Infobox.png',
    url: 'https://www.myinstants.com/media/sounds/gomu-gomu-no.mp3',
    author: 'One Piece',
    license: 'Copyright Toei Animation'
  },
  {
    id: 'preset-kamehameha',
    name: 'Kamehameha! (Goku)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    image: 'https://dragonball-api.com/characters/goku_normal.webp',
    url: 'https://www.myinstants.com/media/sounds/kamehameha.swf.mp3',
    author: 'Dragon Ball Z',
    license: 'Copyright Toei Animation'
  },
  {
    id: 'preset-tatakae',
    name: 'Tatakae! (Eren Yeager)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Eren Yeager',
    url: 'https://www.myinstants.com/media/sounds/tatakae-eren.mp3',
    author: 'Attack on Titan',
    license: 'Copyright MAPPA'
  },
  {
    id: 'preset-saitama-ok',
    name: 'OK (Saitama)',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Saitama',
    url: 'https://www.myinstants.com/media/sounds/one-punch-man_1.mp3',
    author: 'One Punch Man',
    license: 'Copyright Madhouse'
  },
  {
    id: 'preset-sasageyo',
    name: 'Shinzou wo Sasageyo!',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    malCharName: 'Erwin Smith',
    url: 'https://www.myinstants.com/media/sounds/erwin-smith-shinzou-wo-sasageyo_trim.mp3',
    author: 'Attack on Titan',
    license: 'Copyright Wit Studio'
  },
  {
    id: 'preset-super-saiyan',
    name: 'Super Saiyan Scream',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    image: 'https://dragonball-api.com/characters/goku_normal.webp',
    url: 'https://www.myinstants.com/media/sounds/saiyan.mp3',
    author: 'Dragon Ball Z',
    license: 'Copyright Toei Animation'
  },
  {
    id: 'preset-anime-wow',
    name: 'Anime Girl Wow!',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    url: 'https://www.myinstants.com/media/sounds/anime-wow.mp3',
    author: 'Anime Meme',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-anime-squeak',
    name: 'Kawaii Cute Squeak',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    url: 'https://www.myinstants.com/media/sounds/squeak_Q72c7Tg.mp3',
    author: 'Anime Sound',
    license: 'CC-BY-SA'
  },

  // === MUSIC ===
  {
    id: 'preset-rickroll',
    name: 'Never Gonna Give You Up (Rickroll)',
    category: 'music',
    emoji: '🎵',
    color: '#7c3aed',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rick_Astley_Tivoli_Gardens.jpg',
    url: 'https://www.myinstants.com/media/sounds/rick-roll.mp3',
    author: 'Rick Astley',
    license: 'Copyright RCA Records'
  },
  {
    id: 'preset-gigachad',
    name: 'GigaChad Theme (Phonk)',
    category: 'music',
    emoji: '🎵',
    color: '#7c3aed',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Font_Awesome_5_solid_dumbbell.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/gigachad-theme.mp3',
    author: 'SXVXVG',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-mario-theme',
    name: 'Super Mario Bros Theme',
    category: 'music',
    emoji: '🎵',
    color: '#7c3aed',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mario_Bros._logo.svg',
    url: 'https://www.myinstants.com/media/sounds/super-mario-bros-theme.mp3',
    author: 'Koji Kondo',
    license: 'Copyright Nintendo'
  },
  {
    id: 'preset-megalovania',
    name: 'Megalovania (Sans Theme)',
    category: 'music',
    emoji: '🎵',
    color: '#7c3aed',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Undertale_logo.png',
    url: 'https://www.myinstants.com/media/sounds/megalovania.mp3',
    author: 'Toby Fox',
    license: 'Copyright Toby Fox'
  },
  {
    id: 'preset-tetris-theme',
    name: 'Tetris Korobeiniki',
    category: 'music',
    emoji: '🎵',
    color: '#7c3aed',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tetris_logo_English.svg',
    url: 'https://www.myinstants.com/media/sounds/tetris-theme.mp3',
    author: 'Traditional',
    license: 'Public Domain'
  },
  {
    id: 'preset-girl-uwu',
    name: 'Girl Uwu',
    category: 'anime',
    emoji: '🌸',
    color: '#db2777',
    url: 'https://www.myinstants.com/media/sounds/girl-uwu.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-fahhhhhhhhhhhhhh',
    name: 'Fahhhhhhhhhhhhhh',
    category: 'memes',
    emoji: '😂',
    color: '#ea580c',
    url: 'https://www.myinstants.com/media/sounds/fahhhhhhhhhhhhhh.mp3',
    author: 'Discord',
    license: 'Copyright Discord'
  },
  {
    id: 'preset-aayein',
    name: 'Aayein Meme (Aayein?)',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/aayein-meme.mp3',
    author: 'Indian Meme',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-paisa',
    name: 'Paisa Hi Paisa Hoga',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/tmp5f9yp0pe.mp3',
    author: 'Phir Hera Pheri',
    license: 'Copyright Phir Hera Pheri'
  },
  {
    id: 'preset-gunda',
    name: 'Kya Gunda Banega Re Tu',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/kya-gunda-banega-re-tu.mp3',
    author: 'Phir Hera Pheri',
    license: 'Copyright Phir Hera Pheri'
  },
  {
    id: 'preset-maro-mujhe',
    name: 'Oh Bhai Maro Mujhe Maro',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/o-bhai-maro-mujhe-maro.mp3',
    author: 'Momin Saqib',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-modi-wah',
    name: 'Wah Modi Ji Wah',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/modi-ji-wah.mp3',
    author: 'Narendra Modi',
    license: 'Copyright Narendra Modi'
  },
  {
    id: 'preset-baap-re',
    name: 'Are Baap Re Yaad Aya',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/are-baap-re-yaad-aya.mp3',
    author: 'Hera Pheri',
    license: 'Copyright Hera Pheri'
  },
  {
    id: 'preset-baburao',
    name: 'Baburao Phir Hera Pheri',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/phirherapheri.mp3',
    author: 'Hera Pheri',
    license: 'Copyright Hera Pheri'
  },
  {
    id: 'preset-gian-aap',
    name: 'Gian Hain Aap',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/gian-hain-aap.mp3',
    author: 'Doraemon',
    license: 'Copyright Shin-Ei Animation'
  },
  {
    id: 'preset-shakal-gian',
    name: 'Shakal Dekhi Hai? (Gian)',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/shakal-dekhi-hai-gian.mp3',
    author: 'Doraemon',
    license: 'Copyright Shin-Ei Animation'
  },
  {
    id: 'preset-kbc-suspense',
    name: 'KBC Question Suspense',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/kbc-question.mp3',
    author: 'KBC',
    license: 'Copyright KBC'
  },
  {
    id: 'preset-sochna-bhau',
    name: 'Sochna Padta Hai Re',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/sochna-pdta-hai-re-hindustani-bhau.mp3',
    author: 'Hindustani Bhau',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-computer-virus',
    name: 'Your Computer Has Virus',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/hello-your-computer-has-virus-sound-effect.mp3',
    author: 'Tech Support Scammer',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-angry-scammer',
    name: 'Angry Indian Scammer',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/getfromytcom-the-angriest-scamme-1.mp3',
    author: 'Tech Support Scammer',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-proud-army',
    name: 'Feeling Proud Indian Army',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/feeling-proud-indian-army.mp3',
    author: 'Indian Army Phonk',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-chalti-cocaine',
    name: 'Chalti Firti Cocaine',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/chalti-firti-cocaine.mp3',
    author: 'CarryMinati',
    license: 'Copyright CarryMinati'
  },
  {
    id: 'preset-alakh-motivation',
    name: 'Alakh Sir Hello Bacho',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/alakh-sir-motivation.mp3',
    author: 'Physics Wallah',
    license: 'Copyright Physics Wallah'
  },
  {
    id: 'preset-guy-laugh',
    name: 'Indian Guy Meme Laugh',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/indian-guy-meme-laugh.mp3',
    author: 'Indian Guy',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-indian-sorry',
    name: 'Indian Sorry Sorry',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/indian-sorry.mp3',
    author: 'Indian Meme',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-out-of-reach',
    name: '[Hindi] Phone Out of Reach',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    url: 'https://www.myinstants.com/media/sounds/hindi-phone-cannot-be-reached.mp3',
    author: 'Telecom Provider',
    license: 'Copyright Telecom'
  },
  {
    id: 'preset-sad-flute',
    name: 'Indian Sad Flute Music',
    category: 'indian',
    emoji: '🪘',
    color: '#047857',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bansuri_ancient_bamboo_flute_sanskrit_swara.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/tmpauxfo4ff.mp3',
    author: 'Indian Flute',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-nature-cricket',
    name: 'Cricket Silence Chirp',
    category: 'nature',
    emoji: '🌿',
    color: '#16a34a',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Acheta_domesticus_(common_house_cricket).jpg',
    url: 'https://www.myinstants.com/media/sounds/crickets.mp3',
    author: 'Nature Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-nature-wolf',
    name: 'Wolf Howl',
    category: 'nature',
    emoji: '🌿',
    color: '#16a34a',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Wolf_howling_on_glacial_erratic2.jpg',
    url: 'https://www.myinstants.com/media/sounds/wolf-howl.mp3',
    author: 'Nature Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-nature-rain',
    name: 'Rain Storm',
    category: 'nature',
    emoji: '🌿',
    color: '#16a34a',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Heavy_rain.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/rain.mp3',
    author: 'Nature Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-nature-wind',
    name: 'Wind Howling',
    category: 'nature',
    emoji: '🌿',
    color: '#16a34a',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Font_Awesome_5_solid_wind.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/wind-howling.mp3',
    author: 'Nature Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-nature-rooster',
    name: 'Rooster Crow',
    category: 'nature',
    emoji: '🌿',
    color: '#16a34a',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rooster.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/rooster.mp3',
    author: 'Nature Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-comedy-trombone',
    name: 'Sad Trombone (Wah Wah)',
    category: 'comedy',
    emoji: '🎭',
    color: '#d97706',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Trombone.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/sad-trombone.mp3',
    author: 'Comedy Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-comedy-whistle',
    name: 'Slide Whistle Fail',
    category: 'comedy',
    emoji: '🎭',
    color: '#d97706',
    url: 'https://www.myinstants.com/media/sounds/slide-whistle.mp3',
    author: 'Comedy Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-comedy-boowomp',
    name: 'Boo Womp (Spongebob)',
    category: 'comedy',
    emoji: '🎭',
    color: '#d97706',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Unicode_1F622.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/boowomp.mp3',
    author: 'Comedy Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-comedy-laugh',
    name: 'Sitcom Audience Laugh',
    category: 'comedy',
    emoji: '🎭',
    color: '#d97706',
    url: 'https://www.myinstants.com/media/sounds/sitcom-laughing.mp3',
    author: 'Comedy Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-comedy-drumroll',
    name: 'Ba-Dum-Tss Drumroll',
    category: 'comedy',
    emoji: '🎭',
    color: '#d97706',
    url: 'https://www.myinstants.com/media/sounds/drumroll.mp3',
    author: 'Comedy Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-game-mariojump',
    name: 'Super Mario Jump',
    category: 'games',
    emoji: '🎮',
    color: '#0891b2',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mario_Bros._logo.svg',
    url: 'https://www.myinstants.com/media/sounds/mario-jump.mp3',
    author: 'Nintendo',
    license: 'Copyright Nintendo'
  },
  {
    id: 'preset-game-minecraftoof',
    name: 'Minecraft Classic Hurt (Oof)',
    category: 'games',
    emoji: '🎮',
    color: '#0891b2',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Minecraft-creeper-face.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/classic_hurt.mp3',
    author: 'Mojang',
    license: 'Copyright Mojang'
  },
  {
    id: 'preset-game-mgsalert',
    name: 'Metal Gear Solid Alert (!)',
    category: 'games',
    emoji: '🎮',
    color: '#0891b2',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Warning.svg',
    url: 'https://www.myinstants.com/media/sounds/metal-gear-solid-alert.mp3',
    author: 'Konami',
    license: 'Copyright Konami'
  },
  {
    id: 'preset-game-gtashit',
    name: 'GTA San Andreas - Ah shit',
    category: 'games',
    emoji: '🎮',
    color: '#0891b2',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Grand_Theft_Auto_logo_series.svg',
    url: 'https://www.myinstants.com/media/sounds/gta-san-andreas-ah-shit-here-we-go-again.mp3',
    author: 'Rockstar Games',
    license: 'Copyright Rockstar'
  },
  {
    id: 'preset-game-pacman',
    name: 'Pac-Man Theme Intro',
    category: 'games',
    emoji: '🎮',
    color: '#0891b2',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pac-Man.svg',
    url: 'https://www.myinstants.com/media/sounds/pacman.mp3',
    author: 'Bandai Namco',
    license: 'Copyright Bandai Namco'
  },
  {
    id: 'preset-horror-creepylaugh',
    name: 'Creepy Ghostly Laugh',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    url: 'https://www.myinstants.com/media/sounds/creepy-laugh.mp3',
    author: 'Horror Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-horror-evillaugh',
    name: 'Sinister Evil Laugh',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    url: 'https://www.myinstants.com/media/sounds/evil-laugh_1.mp3',
    author: 'Horror Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-horror-fnaf',
    name: 'FNAF Animatronic Jumpscare',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    url: 'https://www.myinstants.com/media/sounds/fnaf-jumpscare.mp3',
    author: 'Scott Cawthon',
    license: 'Copyright Scott Cawthon'
  },
  {
    id: 'preset-horror-screamer',
    name: 'Loud Female Jumpscare',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Skull-Icon.svg',
    invertImage: true,
    url: 'https://www.myinstants.com/media/sounds/screamer.mp3',
    author: 'Horror Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-horror-jumpscare',
    name: 'Classic Jumpscare SFX',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    url: 'https://www.myinstants.com/media/sounds/jumpscare.mp3',
    author: 'Horror Sound',
    license: 'CC-BY-SA'
  },
  {
    id: 'preset-horror-toccata',
    name: 'Halloween Organ Theme',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    url: 'https://www.myinstants.com/media/sounds/toccata-and-fugue.mp3',
    author: 'J.S. Bach',
    license: 'Public Domain'
  },
  {
    id: 'preset-horror-heartbeat',
    name: 'Heartbeat Panic',
    category: 'horror',
    emoji: '👻',
    color: '#7f1d1d',
    url: 'https://www.myinstants.com/media/sounds/heartbeat.mp3',
    author: 'Horror Sound',
    license: 'CC-BY-SA'
  }
];

const LIB_CATEGORIES = [
  { id: 'all',    label: 'All',    emoji: '🌐', color: '#4b5563',
    wmQuery: 'sound effect audio',     fsQuery: 'sound effect', fsFilter: '' },
  { id: 'memes',  label: 'Memes',  emoji: '😂', color: '#ea580c',
    wmQuery: 'meme funny viral sound', fsQuery: 'meme funny',  fsFilter: '' },
  { id: 'indian', label: 'Indian', emoji: '🪘', color: '#047857',
    wmQuery: 'indian hindi',           fsQuery: 'indian hindi',  fsFilter: '' },
  { id: 'sfx',    label: 'SFX',    emoji: '💥', color: '#dc2626',
    wmQuery: 'sound effect explosion', fsQuery: 'sound effect', fsFilter: 'type:wav' },
  { id: 'music',  label: 'Music',  emoji: '🎵', color: '#7c3aed',
    wmQuery: 'music melody song audio', fsQuery: 'music melody', fsFilter: '' },
  { id: 'games',  label: 'Games',  emoji: '🎮', color: '#0891b2',
    wmQuery: 'video game sound effect retro', fsQuery: 'game retro 8bit', fsFilter: '' },
  { id: 'comedy', label: 'Comedy', emoji: '😄', color: '#d97706',
    wmQuery: 'funny laugh comedy sound', fsQuery: 'funny laugh comedy', fsFilter: '' },
  { id: 'nature', label: 'Nature', emoji: '🌿', color: '#059669',
    wmQuery: 'nature bird rain wind ambient', fsQuery: 'nature ambient outdoor', fsFilter: '' },
  { id: 'voices', label: 'Voices', emoji: '🗣️', color: '#be185d',
    wmQuery: 'voice speech human vocal', fsQuery: 'voice speech human', fsFilter: '' },
  { id: 'anime',  label: 'Anime',  emoji: '🌸', color: '#db2777',
    wmQuery: 'anime cartoon japanese audio', fsQuery: 'anime cartoon', fsFilter: '' },
  { id: 'horror', label: 'Horror', emoji: '👻', color: '#1d4ed8',
    wmQuery: 'horror scary spooky creepy sound', fsQuery: 'horror scary spooky', fsFilter: '' },
];


// Mutable map of user-uploaded custom models (populated at startup and after imports)
let DYNAMIC_CUSTOM_MODELS = {};

/**
 * Scan custom_models/ directory and populate DYNAMIC_CUSTOM_MODELS.
 * Also injects <li> elements into the model dropdown for each found model.
 */
function scanCustomModels() {
  // Remove any previously-injected custom model dropdown items
  document.querySelectorAll('.dropdown-item[data-value^="custom:"]').forEach(el => el.remove());
  DYNAMIC_CUSTOM_MODELS = {};

  const menu = document.getElementById('model-dropdown-menu');
  if (!menu) return;

  let subdirs = [];
  try {
    subdirs = fs.readdirSync(CUSTOM_MODELS_DIR).filter(n => {
      try { return fs.statSync(path.join(CUSTOM_MODELS_DIR, n)).isDirectory(); } catch { return false; }
    });
  } catch { return; }

  for (const folderName of subdirs) {
    const tomlPath = path.join(CUSTOM_MODELS_DIR, folderName, 'model.toml');
    if (!fs.existsSync(tomlPath)) continue;

    // Count voices by parsing the TOML (parseTOML is hoisted)
    let count = 1;
    try {
      const speakers = parseTOML(fs.readFileSync(tomlPath, 'utf8'));
      count = speakers.length || 1;
    } catch { /* keep count=1 */ }

    const key   = `custom:${folderName}`;
    // Use generic label — the model name is visible on the speaker cards inside
    const label = `Custom Model (${count} ${count === 1 ? 'Voice' : 'Voices'})`;

    DYNAMIC_CUSTOM_MODELS[key] = {
      name: label,
      folder: `custom_models/${folderName}`,
      toml: 'model.toml'
    };

    // Inject dropdown item
    const li = document.createElement('li');
    li.className = 'dropdown-item';
    li.dataset.value = key;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.textContent = label;
    menu.appendChild(li);
  }
}

// ════════════════════════════════════════════════════════════
// I18N TRANSLATIONS
// ════════════════════════════════════════════════════════════
const I18N = {
  en: {
    tab_voices: 'Voice Models',
    tab_soundboard: 'Soundboard',
    tab_settings: 'Settings',
    tab_library: 'Library',
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
    // Voices tab
    voice_model_label: 'Voice Model',
    upload_custom_model: 'Upload Custom Model',
    // Category pills
    cat_all: 'All',
    cat_roleplay: 'Roleplay',
    cat_memes: 'Memes',
    cat_female: 'Female',
    cat_male: 'Male',
    cat_human: 'Human',
    cat_deep: 'Deep',
    cat_high_pitched: 'High-Pitched',
    cat_sci_fi: 'Sci-Fi',
    cat_robotic: 'Robotic',
    // Sidebar slider labels
    pitch_shift: 'Pitch Shift',
    formant_shift: 'Formant Shift',
    noise_gate: 'Noise Gate',
    input_level: 'Input Level',
    output_volume: 'Output Volume',
    output_level: 'Output Level',
    connecting: 'Connecting…',
    audio_routing_desc: 'Output device receives your converted voice for other apps. Use headphones to avoid hearing yourself.',
    input_microphone: 'Input Microphone',
    output_device: 'Output Device',
    hear_yourself: 'Hear Yourself',
    monitor_device: 'Monitor Device',
    default_microphone: 'Default Microphone',
    default_speaker: 'Default Speaker',
    default_headphones: 'Default Headphones',
    refresh_btn: 'Refresh',
  },
  ja: {
    tab_voices: 'ボイスモデル',
    tab_soundboard: 'サウンドボード',
    tab_settings: '設定',
    tab_library: 'ライブラリ',
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
    // Voices tab
    voice_model_label: 'ボイスモデル',
    upload_custom_model: 'カスタムモデルをアップロード',
    // Category pills
    cat_all: 'すべて',
    cat_roleplay: 'ロールプレイ',
    cat_memes: 'ミーム',
    cat_female: '女性',
    cat_male: '男性',
    cat_human: '人間',
    cat_deep: '低音',
    cat_high_pitched: '高音',
    cat_sci_fi: 'SF',
    cat_robotic: 'ロボット',
    // Sidebar slider labels
    pitch_shift: 'ピッチシフト',
    formant_shift: 'フォルマントシフト',
    noise_gate: 'ノイズゲート',
    input_level: '入力レベル',
    output_volume: '出力音量',
    output_level: '出力レベル',
    connecting: '接続中…',
    audio_routing_desc: '出力デバイスは、他のアプリ用に変換された音声を受信します。ハウリングを防ぐためにヘッドホンを使用してください。',
    input_microphone: '入力マイク',
    output_device: '出力デバイス',
    hear_yourself: '自分の声を聴く',
    monitor_device: 'モニターデバイス',
    default_microphone: 'デフォルトマイク',
    default_speaker: 'デフォルトスピーカー',
    default_headphones: 'デフォルトヘッドホン',
    refresh_btn: '更新',
  },
  zh: {
    tab_voices: '语音模型',
    tab_soundboard: '声板',
    tab_settings: '设置',
    tab_library: '声音库',
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
    // Voices tab
    voice_model_label: '语音模型',
    upload_custom_model: '上传自定义模型',
    // Category pills
    cat_all: '全部',
    cat_roleplay: '角色扮演',
    cat_memes: '梗',
    cat_female: '女声',
    cat_male: '男声',
    cat_human: '人声',
    cat_deep: '低沉',
    cat_high_pitched: '高音',
    cat_sci_fi: '科幻',
    cat_robotic: '机器人',
    // Sidebar slider labels
    pitch_shift: '音调偏移',
    formant_shift: '共振峰偏移',
    noise_gate: '噪声门',
    input_level: '输入电平',
    output_volume: '输出音量',
    output_level: '输出电平',
    connecting: '连接中…',
    audio_routing_desc: '输出设备接收您转换后的声音以用于其他应用。请使用耳机以避免产生回音。',
    input_microphone: '输入麦克风',
    output_device: '输出设备',
    hear_yourself: '监听自己',
    monitor_device: '监听设备',
    default_microphone: '默认麦克风',
    default_speaker: '默认扬声器',
    default_headphones: '默认耳机',
    refresh_btn: '刷新',
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
  updateRegisteredKeybinds();
}

function saveSoundboard() {
  localStorage.setItem(STORAGE_KEY_SB, JSON.stringify(soundboardSounds));
  updateRegisteredKeybinds();
}

// ── Jikan API: anime character images with localStorage cache ────────────
const _jikanImgCache = {};
async function fetchJikanCharImage(charName) {
  if (Object.prototype.hasOwnProperty.call(_jikanImgCache, charName)) return _jikanImgCache[charName];
  const lsKey = 'beatrice_jikan_' + charName.replace(/\W+/g, '_');
  const stored = localStorage.getItem(lsKey);
  if (stored !== null) { _jikanImgCache[charName] = stored || null; return _jikanImgCache[charName]; }
  await new Promise(r => setTimeout(r, Math.random() * 600 + 100)); // stagger to avoid rate-limit
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(charName)}&limit=1&order_by=favorites&sort=desc`);
    if (!resp.ok) { _jikanImgCache[charName] = null; localStorage.setItem(lsKey, ''); return null; }
    const data = await resp.json();
    const url  = data?.data?.[0]?.images?.jpg?.image_url || null;
    _jikanImgCache[charName] = url;
    localStorage.setItem(lsKey, url || '');
    return url;
  } catch { _jikanImgCache[charName] = null; return null; }
}

function lightenHex(hex, amount = 55) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (n >> 16) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function getImageUrlForSound(sound) {
  if (sound.imagePath) {
    try {
      return require('url').pathToFileURL(sound.imagePath).href;
    } catch (e) {
      return sound.imagePath;
    }
  }
  if (sound.image) return sound.image;

  // Professional gradient card — each sound gets a unique background color based on name/ID
  const emoji = sound.emoji || '🔊';
  const str = sound.name || sound.id || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const sat = 70; // Vibrant saturation
  const base = `hsl(${hue}, ${sat}%, 25%)`;
  const lite = `hsl(${hue}, ${sat}%, 55%)`;

  const svgStr = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">`,
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${lite}"/>`,
    `<stop offset="100%" stop-color="${base}"/>`,
    `</linearGradient></defs>`,
    `<rect width="150" height="150" fill="url(#g)"/>`,
    `<circle cx="130" cy="20"  r="60" fill="rgba(255,255,255,0.08)"/>`,
    `<circle cx="15"  cy="138" r="48" fill="rgba(0,0,0,0.12)"/>`,
    `<text x="75" y="78" font-size="58" text-anchor="middle" dominant-baseline="middle" `,
    `font-family="system-ui,Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">`,
    emoji, `</text></svg>`
  ].join('');
  try { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr))); }
  catch (e) { return 'data:image/svg+xml;base64,' + btoa(svgStr); }
}

function renderSoundboardMain() {
  const container = document.getElementById('soundboard-main-grid');
  if (!container) return;
  container.innerHTML = '';

  // Sort soundboard sounds: first show image with sound, then emoji with sound
  soundboardSounds.sort((a, b) => {
    const hasA = !!(a.image || a.imagePath || a.malCharName);
    const hasB = !!(b.image || b.imagePath || b.malCharName);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    return 0;
  });

  soundboardSounds.forEach((sound, i) => {
    const el = document.createElement('div');
    el.className = 'sb-main-slot';
    el.dataset.index = i;

    const imageUrl = getImageUrlForSound(sound);
    const isCustomImage = !!(sound.image || sound.imagePath);
    const imageStyle = isCustomImage ? 'style="object-fit: contain;"' : '';
    const imgClass = sound.invertImage ? ' class="invert-img"' : '';
    const imageHtml = `<img src="${imageUrl}" alt=""${imgClass} ${imageStyle} data-emoji="${sound.emoji || '🔊'}" data-color="${sound.color || '#1a1a2e'}" onerror="this.onerror=null;this.src=getImageUrlForSound({emoji:this.dataset.emoji,color:this.dataset.color});this.style.objectFit='cover';this.style.background='transparent';">`;

    const isListening = isRecordingKeybindForSlot === i;
    const keybindText = isListening ? 'Press keys...' : (sound.keybind || 'Add keybind');
    const keybindClass = 'sb-slot-keybind' + (isListening ? ' listening' : '') + (sound.keybind ? ' has-keybind' : '');

    el.innerHTML = `
      <div class="sb-slot-thumb">
        ${imageHtml}
        <div class="sb-play-indicator">
          <button class="sb-play-btn${playingIndex === i ? ' is-playing' : ''}" data-index="${i}">
            ${playingIndex === i
              ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
            }
          </button>
        </div>
        <div class="sb-overlay-actions">
          <button class="sb-overlay-btn sb-btn-options" title="Options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <circle cx="12" cy="5" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="sb-slot-info">
        <span class="sb-slot-name">${sound.name}</span>
        <span class="${keybindClass}">${keybindText}</span>
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

    el.querySelector('.sb-btn-options').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('.sb-btn-options');
      const rect = btn.getBoundingClientRect();
      
      const menuWidth = 150; 
      const rightPadding = 20;
      
      let left = rect.left;
      if (rect.left + menuWidth + rightPadding > window.innerWidth) {
        left = rect.right - menuWidth;
      }
      
      showSoundboardContextMenu(i, left, rect.bottom + 8);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showSoundboardContextMenu(i, e.clientX, e.clientY);
    });

    container.appendChild(el);
  });

  updateFloatingPlayButtonUI();
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
  if (sound && sound.imagePath && fs.existsSync(sound.imagePath)) {
    try { fs.unlinkSync(sound.imagePath); } catch {}
  }
  soundboardSounds.splice(index, 1);
  saveSoundboard();
  renderSoundboardMain();
  if (libInitDone) {
    loadLibrary(true);
  }
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
  lastPlayedSoundboardIndex = index;
  renderSoundboardMain();

  const hearYourself = hearYourselfToggle.checked && hearSoundboard;
  console.log('[Soundboard Play]', { index, name: sound.name, hearYourself, hearYourselfToggleChecked: hearYourselfToggle.checked, hearSoundboard });
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

    // Hide floating control bar on Settings tab
    const fcBar = document.getElementById('floating-control-bar');
    if (fcBar) {
      fcBar.style.display = btn.dataset.tab === 'settings-view' ? 'none' : '';
    }
  });
});


// ════════════════════════════════════════════════════════════
// TOML SPEAKER LOADER
// ════════════════════════════════════════════════════════════
function loadSpeakerData() {
  try {
    let activeModel = localStorage.getItem(STORAGE_KEY_MODEL) || 'jvs';
    const allModels = { ...AVAILABLE_MODELS, ...DYNAMIC_CUSTOM_MODELS };
    // If stale/deleted model key in localStorage, gracefully fall back to JVS
    if (!allModels[activeModel]) {
      console.warn(`[Beatrice] Model key "${activeModel}" not found — falling back to JVS.`);
      localStorage.setItem(STORAGE_KEY_MODEL, 'jvs');
      activeModel = 'jvs';
    }

    const modelInfo = allModels[activeModel];
    let modelBaseDir;
    if (activeModel.startsWith('custom:')) {
      const folderName = activeModel.slice(7); // strip 'custom:'
      modelBaseDir = path.join(CUSTOM_MODELS_DIR, folderName);
    } else {
      modelBaseDir = path.join(APP_BASE, modelInfo.folder);
    }

    const tomlPath = path.join(modelBaseDir, modelInfo.toml);
    if (!fs.existsSync(tomlPath)) {
      showSpeakerError(`Model config file not found. Please check ${modelBaseDir}`);
      return;
    }
    const tomlText = fs.readFileSync(tomlPath, 'utf8');
    speakerProfiles = parseTOML(tomlText);

    if (speakerProfiles.length === 0) {
      showSpeakerError('No speaker profiles found in TOML config.');
      return;
    }

    let femaleCount = 0;
    let maleCount = 0;

    speakerProfiles.forEach(speaker => {
      if (activeModel === 'jvs') {
        const isFemale = speaker.average_pitch > 53.0;
        let charName = "";
        let avatarParams = "";
        if (isFemale) {
          charName = JVS_FEMALE_NAMES[femaleCount % JVS_FEMALE_NAMES.length];
          const hair = AVATAARS_FEMALE_HAIR[femaleCount % AVATAARS_FEMALE_HAIR.length];
          const bg = AVATAR_BACKGROUNDS[femaleCount % AVATAR_BACKGROUNDS.length];
          avatarParams = `&top=${hair}&facialHairProbability=0&backgroundColor=${bg}`;
          femaleCount++;
        } else {
          charName = JVS_MALE_NAMES[maleCount % JVS_MALE_NAMES.length];
          const hair = AVATAARS_MALE_HAIR[maleCount % AVATAARS_MALE_HAIR.length];
          const bg = AVATAR_BACKGROUNDS[maleCount % AVATAR_BACKGROUNDS.length];
          avatarParams = `&top=${hair}&backgroundColor=${bg}`;
          maleCount++;
        }
        speaker.name = charName;
        speaker.avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${charName}${avatarParams}`;
      } else if (activeModel === 'old_tts') {
        let avatarParams = "";
        if (speaker.name === 'adult male 1') {
          speaker.name = 'Adult Male';
        } else if (speaker.name === 'espeak') {
          speaker.name = 'Espeak';
        } else if (speaker.name === 'mary') {
          speaker.name = 'Mary';
          avatarParams = "&eyes=hearts&mouth=smile01&baseColor=d81b60&backgroundColor=f48fb1";
        } else if (speaker.name === 'mike') {
          speaker.name = 'Mike';
        } else if (speaker.name === 'paul') {
          speaker.name = 'Paul';
        } else if (speaker.name === 'sam') {
          speaker.name = 'Sam';
        } else if (speaker.name === 'sam commodore') {
          speaker.name = 'Sam Commodore';
        } else if (speaker.name === 'speak n spell') {
          speaker.name = 'Speak N Spell';
        }

        if (speaker.name === 'Mary') {
          speaker.avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${speaker.name}${avatarParams}`;
        } else {
          const bg = AVATAR_BACKGROUNDS[speaker.index % AVATAR_BACKGROUNDS.length];
          speaker.avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${speaker.name}&backgroundColor=${bg}`;
        }
      } else if (activeModel === 'official_1') {
        if (speaker.name === 'つくよみちゃん (UTAU)') {
          speaker.name = 'Tsukuyomichan';
        } else if (speaker.name === 'つくよみちゃん (コーパス)') {
          speaker.name = 'Fukuyomichan';
          speaker.portrait_path = 'fukuyomichan.png';
        } else if (speaker.name === '刻鳴時雨') {
          speaker.name = 'Tokinashigure';
        } else if (speaker.name === 'OLUNE') {
          speaker.name = 'Olune';
        }

        if (speaker.portrait_path && speaker.portrait_path !== 'noimage.png') {
          const absPath = path.join(modelBaseDir, speaker.portrait_path);
          speaker.avatarUrl = require('url').pathToFileURL(absPath).href;
        } else {
          speaker.avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${speaker.name}`;
        }
      } else if (activeModel.startsWith('custom:')) {
        // User-uploaded custom models — name comes directly from TOML, no override
        if (speaker.portrait_path && speaker.portrait_path !== 'noimage.png') {
          const absPath = path.join(modelBaseDir, speaker.portrait_path);
          speaker.avatarUrl = require('url').pathToFileURL(absPath).href;
        } else {
          speaker.avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${speaker.name}`;
        }
      } else {
        if (speaker.portrait_path && speaker.portrait_path !== 'noimage.png') {
          const absPath = path.join(modelBaseDir, speaker.portrait_path);
          speaker.avatarUrl = require('url').pathToFileURL(absPath).href;
        } else {
          speaker.avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${speaker.name}`;
        }
      }
      assignSpeakerCategories(speaker, activeModel);
    });


    const searchBox = document.getElementById('search-box');
    if (searchBox) {
      searchBox.placeholder = `Search ${speakerProfiles.length} voices...`;
    }

    renderSpeakers(speakerProfiles);
    updateSearchCount(speakerProfiles.length, speakerProfiles.length);

    // Dynamically update dropdown label and trigger text to reflect actual voice count
    if (activeModel.startsWith('custom:')) {
      const count = speakerProfiles.length;
      const label = `Custom Model (${count} ${count === 1 ? 'Voice' : 'Voices'})`;
      const li = document.querySelector(`.dropdown-item[data-value="${CSS.escape(activeModel)}"]`);
      if (li) li.textContent = label;
      const triggerTextEl = document.querySelector('.dropdown-trigger-text');
      if (triggerTextEl) triggerTextEl.textContent = label;
    }
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

    if (line.startsWith('path =')) {
      cur.portrait_path = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
      continue;
    }

    if (line.startsWith('average_pitch =')) {
      const v = parseFloat(line.split('=')[1]);
      if (!isNaN(v)) cur.average_pitch = v;
      continue;
    }

    if (line.startsWith('categories =')) {
      const arrayStr = line.slice(line.indexOf('=') + 1).trim();
      try {
        cur.categories = JSON.parse(arrayStr.replace(/'/g, '"'));
      } catch (e) {
        console.warn('Failed to parse categories array:', arrayStr);
      }
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
  const activeModel = localStorage.getItem(STORAGE_KEY_MODEL) || 'jvs';

  profiles.forEach((speaker, i) => {
    let elemStr = extractElement(speaker.description);
    if (activeModel === 'official_1') {
      if (speaker.index === 0) elemStr = 'UTAU';
      else if (speaker.index === 1) elemStr = 'Corpus';
      else if (speaker.index === 2) elemStr = 'Character';
      else if (speaker.index === 3) elemStr = 'Character';
      else elemStr = 'Official';
    } else if (activeModel === 'old_tts') {
      const lowerName = speaker.name.toLowerCase();
      if (lowerName.includes('mary')) elemStr = 'Female';
      else if (lowerName.includes('mike') || lowerName.includes('adult male') || lowerName.includes('paul') || lowerName.includes('sam')) elemStr = 'Male';
      else if (lowerName.includes('speak')) elemStr = 'Hardware';
      else elemStr = 'TTS';
    } else if (activeModel.startsWith('custom:')) {
      elemStr = 'Custom';
    }
    const hue     = elementHue(elemStr);
    let speakerIdLabel = `JVS-${String(speaker.index + 1).padStart(3, '0')}`;
    if (activeModel === 'official_1') {
      speakerIdLabel = `OFFICIAL-${speaker.index + 1}`;
    } else if (activeModel === 'old_tts') {
      speakerIdLabel = `RETRO-${speaker.index + 1}`;
    } else if (activeModel.startsWith('custom:')) {
      speakerIdLabel = `CUSTOM-${speaker.index + 1}`;
    }
    const isActive = speaker.index === activeSpeakerIndex;
    const card = document.createElement('div');
    card.className = `speaker-card${isActive ? ' active' : ''}`;
    card.id        = `speaker-card-${speaker.index}`;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(isActive));
    card.setAttribute('tabindex', '0');
    card.style.animationDelay = `${Math.min(i * 16, 500)}ms`;

    // Determine badges
    let badgeHtml = '';
    if (speaker.index === 6 || speaker.index === 15 || speaker.index === 30) {
      badgeHtml += `<div class="avatar-badge-hot">HOT</div>`;
    }
    if (speaker.index === 7 || speaker.index === 8 || speaker.index === 9 || speaker.index % 12 === 0) {
      badgeHtml += `
        <div class="avatar-badge-clock" title="Custom model status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>`;
    }

    // User-uploaded custom: models get the delete overlay
    const isCustom = activeModel.startsWith('custom:');
    const deleteBtn = isCustom
      ? `<button class="card-delete-btn" title="Reset custom model" aria-label="Delete custom model">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
             <polyline points="3 6 5 6 21 6"/>
             <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
             <path d="M10 11v6M14 11v6"/>
             <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
           </svg>
         </button>`
      : '';

    card.innerHTML = `
      <div class="speaker-avatar-container">
        ${badgeHtml}
        <img class="speaker-avatar-img" src="${speaker.avatarUrl}" alt="${speaker.name}" loading="lazy">
        ${deleteBtn}
      </div>
      <div class="speaker-name">${speaker.name}</div>
      <div class="speaker-meta">${speakerIdLabel} · ${speaker.average_pitch.toFixed(1)} Hz</div>`;

    card.addEventListener('click', () => selectSpeaker(speaker.index));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectSpeaker(speaker.index);
      }
    });

    // Wire delete button: delete the custom_models/{name}/ subfolder entirely
    if (isCustom) {
      const deleteBtnEl = card.querySelector('.card-delete-btn');
      if (deleteBtnEl) {
        deleteBtnEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const folderName = activeModel.slice(7);
          if (!confirm(`Delete "${folderName}" permanently? This cannot be undone.`)) return;
          try {
            const modelFolder = path.join(CUSTOM_MODELS_DIR, folderName);
            fs.rmSync(modelFolder, { recursive: true, force: true });
            localStorage.setItem(STORAGE_KEY_MODEL, 'jvs');
            location.reload();
          } catch (err) {
            alert('Failed to delete custom model: ' + err.message);
          }
        });
      }
    }

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

  const activeModel = localStorage.getItem(STORAGE_KEY_MODEL) || 'jvs';
  if (activeModel === 'jvs') {
    const speaker = speakerProfiles.find(s => s.index === index);
    const isFemale = speaker ? (speaker.average_pitch > 53.0) : false;
    
    let pitch = 0.0;
    let formant = 0.0;
    
    if (isFemale) {
      pitch = 12.0;
      formant = 0.8;
    }
    
    pitchSlider.value = pitch;
    pitchValSpan.textContent = `${pitch > 0 ? '+' : ''}${pitch.toFixed(1)} st`;
    pitchSlider.setAttribute('aria-valuenow', pitch);
    
    formantSlider.value = formant;
    formantValSpan.textContent = `${formant > 0 ? '+' : ''}${formant.toFixed(1)}`;
    formantSlider.setAttribute('aria-valuenow', formant);

    setBackendConfig({ 
      speaker_index: index,
      pitch_shift: pitch,
      formant_shift: formant
    });
  } else if (activeModel === 'old_tts') {
    const speaker = speakerProfiles.find(s => s.index === index);
    const isMary = speaker ? (speaker.name === 'Mary') : false;
    
    let pitch = 0.0;
    let formant = 0.0;
    
    if (isMary) {
      pitch = 6.0;
      formant = 0.8;
    }
    
    pitchSlider.value = pitch;
    pitchValSpan.textContent = `${pitch > 0 ? '+' : ''}${pitch.toFixed(1)} st`;
    pitchSlider.setAttribute('aria-valuenow', pitch);
    
    formantSlider.value = formant;
    formantValSpan.textContent = `${formant > 0 ? '+' : ''}${formant.toFixed(1)}`;
    formantSlider.setAttribute('aria-valuenow', formant);

    setBackendConfig({ 
      speaker_index: index,
      pitch_shift: pitch,
      formant_shift: formant
    });
  } else {
    // Reset pitch and formant shifts to 0.0 on selection for other models (Official, Trump)
    pitchSlider.value = 0.0;
    pitchValSpan.textContent = "0.0 st";
    pitchSlider.setAttribute('aria-valuenow', 0.0);
    
    formantSlider.value = 0.0;
    formantValSpan.textContent = "0.0";
    formantSlider.setAttribute('aria-valuenow', 0.0);

    setBackendConfig({ 
      speaker_index: index,
      pitch_shift: 0.0,
      formant_shift: 0.0
    });
  }
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
  const fcPowerBtn = document.getElementById('fc-power-btn');
  if (bypass) {
    powerToggleBtn.classList.add('active');
    powerToggleBtn.classList.remove('live');
    powerToggleBtn.setAttribute('aria-pressed', 'false');
    bypassStatusEl.className  = 'bypass-indicator active';
    bypassStatusEl.textContent = 'BYPASSED';
    powerLabelEl.textContent  = 'BYPASSED';
    if (fcPowerBtn) {
      fcPowerBtn.classList.add('active');
      fcPowerBtn.classList.remove('live');
    }
  } else {
    powerToggleBtn.classList.remove('active');
    powerToggleBtn.classList.add('live');
    powerToggleBtn.setAttribute('aria-pressed', 'true');
    bypassStatusEl.className  = 'bypass-indicator live';
    bypassStatusEl.textContent = 'LIVE';
    powerLabelEl.textContent  = 'LIVE';
    if (fcPowerBtn) {
      fcPowerBtn.classList.remove('active');
      fcPowerBtn.classList.add('live');
    }
  }
}

// ════════════════════════════════════════════════════════════
// RESET CONTROLS TO DEFAULTS
// ════════════════════════════════════════════════════════════
/**
 * Resets all sliders (gate, pitch, formant, volume) to their default values
 * and pushes those values to the Python backend. Called on every model switch.
 */
function resetControlsToDefault() {
  // Noise gate → 0
  gateSlider.value = 0;
  gateValSpan.textContent = '0.000';
  gateSlider.setAttribute('aria-valuenow', 0);

  // Pitch shift → 0
  pitchSlider.value = 0;
  pitchValSpan.textContent = '+0.0 st';
  pitchSlider.setAttribute('aria-valuenow', 0);

  // Formant shift → 0
  formantSlider.value = 0;
  formantValSpan.textContent = '+0.0';
  formantSlider.setAttribute('aria-valuenow', 0);

  // Volume → 1.0 (100%)
  volumeSlider.value = 1.0;
  volumeValSpan.textContent = '100%';
  volumeSlider.setAttribute('aria-valuenow', 100);

  // Push defaults to backend in one call
  setBackendConfig({
    gate_threshold: 0,
    pitch_shift:    0,
    formant_shift:  0,
    volume:         1.0
  });
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
// SEARCH & CATEGORY FILTERING
// ════════════════════════════════════════════════════════════
let searchDebounce = null;

function filterAndRenderSpeakers() {
  const query = searchBox.value.toLowerCase().trim();
  const filtered = speakerProfiles.filter(s => {
    const id = `jvs-${String(s.index + 1).padStart(3, '0')}`;
    const matchesQuery = !query || 
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      id.includes(query);
    const matchesCategory = activeCategory === 'all' || (s.categories && s.categories.includes(activeCategory));
    return matchesQuery && matchesCategory;
  });
  renderSpeakers(filtered);
  updateSearchCount(filtered.length, speakerProfiles.length);
}

searchBox.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(filterAndRenderSpeakers, 120);
});

// Category pills click handler
document.querySelectorAll('.category-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.category-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    activeCategory = btn.dataset.category;
    filterAndRenderSpeakers();
  });
});

function updateSearchCount(shown, total) {
  searchCount.textContent = shown === total ? `${total} voices` : `${shown} / ${total}`;
}

// ════════════════════════════════════════════════════════════
// AUDIO DEVICE LOADER
// ════════════════════════════════════════════════════════════
async function loadAudioDevices() {
  try {
    const res     = await fetch(`${BACKEND_URL}/devices`, { signal: AbortSignal.timeout(1000) });
    const devices = await res.json();
    if (!Array.isArray(devices) || devices.length === 0) return false;

    const prevIn  = inputDeviceSelect.value;
    const prevOut = outputDeviceSelect.value;
    const prevMon = monitorDeviceSelect.value;

    const dict = I18N[localStorage.getItem(STORAGE_KEY_LANG) || 'en'] || I18N.en;
    inputDeviceSelect.innerHTML   = `<option value="null" data-i18n="default_microphone">${dict.default_microphone || 'Default Microphone'}</option>`;
    outputDeviceSelect.innerHTML  = `<option value="null" data-i18n="default_speaker">${dict.default_speaker || 'Default Speaker'}</option>`;
    monitorDeviceSelect.innerHTML = `<option value="null" data-i18n="default_headphones">${dict.default_headphones || 'Default Headphones'}</option>`;

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

    const savedIn = localStorage.getItem('last_input_device_id');
    const savedOut = localStorage.getItem('last_output_device_id');
    const savedMon = localStorage.getItem('last_monitor_device_id');

    let selectedIn = prevIn !== "" && prevIn !== "null" ? prevIn : (savedIn || "null");
    let selectedOut = prevOut !== "" && prevOut !== "null" ? prevOut : (savedOut || "null");
    let selectedMon = prevMon !== "" && prevMon !== "null" ? prevMon : (savedMon || "null");

    // Auto-select virtual device if output is set to default
    if (selectedOut === 'null') {
      const virtualKeywords = ['cable', 'blackhole', 'loopback', 'soundflower', 'virtual'];
      const foundVirtualOpt = [...outputDeviceSelect.options].find(opt => {
        if (opt.value === 'null') return false;
        const name = opt.textContent.toLowerCase();
        return virtualKeywords.some(keyword => name.includes(keyword));
      });
      if (foundVirtualOpt) {
        selectedOut = foundVirtualOpt.value;
        localStorage.setItem('last_output_device_id', selectedOut);
      }
    }

    if ([...inputDeviceSelect.options].some(o => o.value === selectedIn)) {
      inputDeviceSelect.value = selectedIn;
      setBackendConfig({ input_device_id: selectedIn });
    }
    if ([...outputDeviceSelect.options].some(o => o.value === selectedOut)) {
      outputDeviceSelect.value = selectedOut;
      setBackendConfig({ output_device_id: selectedOut });
    }
    if ([...monitorDeviceSelect.options].some(o => o.value === selectedMon)) {
      monitorDeviceSelect.value = selectedMon;
      setBackendConfig({ monitor_device_id: selectedMon });
    }

    return true;
  } catch (err) {
    console.error('Error loading audio devices:', err);
    return false;
  }
}

// Refresh devices button — lets users rescan without reopening the app
const refreshDevicesBtn = document.getElementById('refresh-devices-btn');
if (refreshDevicesBtn) {
  refreshDevicesBtn.addEventListener('click', () => loadAudioDevices());
}

// NOTE: Do NOT use 'focus' to reload devices — the native macOS <select> dropdown
// renders synchronously from the current DOM *before* the async fetch completes,
// so options added during the fetch are invisible until the next open.

inputDeviceSelect.addEventListener('change', () => {
  localStorage.setItem('last_input_device_id', inputDeviceSelect.value);
  setBackendConfig({ input_device_id: inputDeviceSelect.value });
});

outputDeviceSelect.addEventListener('change', () => {
  localStorage.setItem('last_output_device_id', outputDeviceSelect.value);
  setBackendConfig({ output_device_id: outputDeviceSelect.value });
});

monitorDeviceSelect.addEventListener('change', () => {
  localStorage.setItem('last_monitor_device_id', monitorDeviceSelect.value);
  setBackendConfig({ monitor_device_id: monitorDeviceSelect.value });
});

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
      const ok = await loadAudioDevices();
      if (ok) {
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
      // If ok===false, devicesLoaded stays false and we retry next poll cycle
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

    // Sync floating bar elements
    const fcHearBtn = document.getElementById('fc-hear-btn');
    if (fcHearBtn) {
      fcHearBtn.classList.toggle('active', !!status.hear_yourself);
    }

    const fcMicBtn = document.getElementById('fc-mic-btn');
    if (fcMicBtn) {
      const micOnIcon = fcMicBtn.querySelector('.mic-on-icon');
      const micOffIcon = fcMicBtn.querySelector('.mic-off-icon');
      if (status.muted) {
        fcMicBtn.classList.add('muted');
        micOnIcon?.classList.add('hidden');
        micOffIcon?.classList.remove('hidden');
      } else {
        fcMicBtn.classList.remove('muted');
        micOnIcon?.classList.remove('hidden');
        micOffIcon?.classList.add('hidden');
      }
      microphoneMuted = !!status.muted;
    }

    const fcMicVolSlider = document.getElementById('fc-mic-vol-slider');
    const fcHearVolSlider = document.getElementById('fc-hear-vol-slider');
    if (fcMicVolSlider && document.activeElement !== fcMicVolSlider) {
      fcMicVolSlider.value = status.volume;
    }
    if (fcHearVolSlider && document.activeElement !== fcHearVolSlider) {
      fcHearVolSlider.value = status.volume;
    }

    // Sync soundboard playback status
    if (typeof status.sb_playing === 'boolean') {
      if (!status.sb_playing && playingIndex !== null) {
        playingIndex = null;
        renderSoundboardMain();
      }
    }
    
    // Sync active speaker selection index from backend if not set locally
    if (activeSpeakerIndex === null && typeof status.speaker_index === 'number' && status.speaker_index !== -1) {
      const card = document.getElementById(`speaker-card-${status.speaker_index}`);
      if (card) {
        activeSpeakerIndex = status.speaker_index;
        card.classList.add('active');
        card.setAttribute('aria-selected', 'true');
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
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

// Initialize model selection UI and bindings (Custom Dropdown)
// Populate dynamic custom model entries FIRST so they're in the DOM before event binding
scanCustomModels();

const savedModel = localStorage.getItem(STORAGE_KEY_MODEL) || 'jvs';
const modelDropdownTrigger = document.getElementById('model-dropdown-trigger');
if (modelDropdownTrigger) {
  const triggerText = modelDropdownTrigger.querySelector('.dropdown-trigger-text');
  const dropdownMenu = document.getElementById('model-dropdown-menu');
  const dropdownContainer = document.getElementById('model-dropdown-container');
  const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');

  // Sync initial custom dropdown selection state
  dropdownItems.forEach(item => {
    const isMatch = item.dataset.value === savedModel;
    item.classList.toggle('active', isMatch);
    item.setAttribute('aria-selected', String(isMatch));
    if (isMatch && triggerText) {
      triggerText.textContent = item.textContent;
    }
  });

  // Sync the backend with the saved model selection on startup
  fetch(`${BACKEND_URL}/set_model?model=${savedModel}`).catch(() => {});

  // Toggle dropdown on click
  modelDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdownContainer.classList.contains('open');
    dropdownContainer.classList.toggle('open', !isOpen);
    modelDropdownTrigger.setAttribute('aria-expanded', String(!isOpen));
  });

  // Handle dropdown selection change
  dropdownItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = item.dataset.value;
      
      // Update UI selection classes
      dropdownItems.forEach(i => {
        i.classList.remove('active');
        i.setAttribute('aria-selected', 'false');
      });
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
      
      if (triggerText) {
        triggerText.textContent = item.textContent;
      }
      
      dropdownContainer.classList.remove('open');
      modelDropdownTrigger.setAttribute('aria-expanded', 'false');

      // Set model in storage & trigger backend update
      localStorage.setItem(STORAGE_KEY_MODEL, val);
      fetch(`${BACKEND_URL}/set_model?model=${encodeURIComponent(val)}`)
        .then(() => {
          activeSpeakerIndex = 0;
          resetCategoryFilter();
          resetControlsToDefault();
          loadSpeakerData();
        })
        .catch(err => console.error('[Beatrice] Error setting model:', err));
    });
  });

  // Close dropdown on click outside
  document.addEventListener('click', () => {
    dropdownContainer.classList.remove('open');
    modelDropdownTrigger.setAttribute('aria-expanded', 'false');
  });
}

// ════════════════════════════════════════════════════════════
// CUSTOM MODEL UPLOAD & IMPORT SYSTEM
// ════════════════════════════════════════════════════════════
const uploadCustomBtn    = document.getElementById('upload-custom-btn');
const uploadModal        = document.getElementById('upload-modal');
const modalCloseBtn      = document.getElementById('modal-close-btn');
const modalCancelBtn     = document.getElementById('modal-cancel-btn');
const modalImportBtn     = document.getElementById('modal-import-btn');
const customZipInput     = document.getElementById('custom-zip-input');
const zipDropzone        = document.getElementById('zip-dropzone');
const uploadStatusText   = document.getElementById('upload-status-text');
const customModelName    = document.getElementById('custom-model-name');
const modalCatGrid       = document.getElementById('modal-category-grid');

let selectedZipPath = null;
let selectedCategory = null;

if (uploadCustomBtn) {
  uploadCustomBtn.addEventListener('click', () => {
    selectedZipPath = null;
    selectedCategory = null;
    customZipInput.value = '';
    customModelName.value = '';
    uploadStatusText.textContent = 'Click to select a .zip file';
    zipDropzone.classList.remove('selected');
    modalCatGrid.querySelectorAll('.modal-cat-btn').forEach(btn => btn.classList.remove('active'));
    validateImportForm();
    uploadModal.style.display = 'flex';
  });
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    uploadModal.style.display = 'none';
  });
}

if (modalCancelBtn) {
  modalCancelBtn.addEventListener('click', () => {
    uploadModal.style.display = 'none';
  });
}

if (zipDropzone) {
  zipDropzone.addEventListener('click', () => {
    customZipInput.click();
  });

  zipDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zipDropzone.classList.add('dragover');
  });

  zipDropzone.addEventListener('dragleave', () => {
    zipDropzone.classList.remove('dragover');
  });

  zipDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    zipDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.zip')) {
        selectedZipPath = file.path;
        uploadStatusText.textContent = file.name;
        zipDropzone.classList.add('selected');
        validateImportForm();
      } else {
        alert('Please drop a valid .zip archive.');
      }
    }
  });
}

if (customZipInput) {
  customZipInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      selectedZipPath = file.path;
      uploadStatusText.textContent = file.name;
      zipDropzone.classList.add('selected');
      validateImportForm();
    }
  });
}

if (modalCatGrid) {
  modalCatGrid.querySelectorAll('.modal-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      if (selectedCategory === cat) {
        selectedCategory = null;
        btn.classList.remove('active');
      } else {
        selectedCategory = cat;
        modalCatGrid.querySelectorAll('.modal-cat-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.category === cat);
        });
      }
      validateImportForm();
    });
  });
}

if (customModelName) {
  customModelName.addEventListener('input', validateImportForm);
}

function validateImportForm() {
  const name = customModelName.value.trim();
  const isValid = selectedZipPath && name.length > 0 && selectedCategory !== null;
  if (modalImportBtn) {
    modalImportBtn.disabled = !isValid;
  }
}

async function fetchWikiImage(name, category) {
  async function queryWiki(q) {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
        const bestTitle = searchData.query.search[0].title;
        const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(bestTitle)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
        const imgRes = await fetch(imgUrl);
        const imgData = await imgRes.json();
        const pages = imgData.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId && pages[pageId].thumbnail && pages[pageId].thumbnail.source) {
          return pages[pageId].thumbnail.source;
        }
      }
    } catch (err) {
      console.error('Inner Wikipedia query failed for query:', q, err);
    }
    return null;
  }

  let query = name;
  if (category === 'anime') {
    query = `${name} character`;
  } else if (category === 'gaming') {
    query = `${name} video game character`;
  } else if (category === 'politician') {
    query = `${name} politician`;
  } else if (category === 'celebrity') {
    query = `${name} celebrity`;
  }

  let imageUrl = await queryWiki(query);
  if (!imageUrl && query !== name) {
    imageUrl = await queryWiki(name);
  }
  return imageUrl;
}


if (modalImportBtn) {
  modalImportBtn.addEventListener('click', async () => {
    modalImportBtn.disabled = true;
    modalImportBtn.textContent = 'Importing...';

    const name = customModelName.value.trim();
    // Sanitize folder name: strip characters invalid on macOS/Windows paths
    const safeFolderName = name.replace(/[\\/:\*?"<>|]/g, '_').trim();

    try {
      // 1. Create target folder inside custom_models/
      const targetFolder = path.join(CUSTOM_MODELS_DIR, safeFolderName);
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      // 2. Fetch portrait from Wikipedia and save as avatar.png
      let imageFilename = 'avatar.png';
      let imageUrl = await fetchWikiImage(name, selectedCategory);
      if (imageUrl) {
        try {
          const response = await fetch(imageUrl);
          const arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(path.join(targetFolder, 'avatar.png'), Buffer.from(arrayBuffer));
        } catch (err) {
          console.error('Error downloading portrait image:', err);
          imageFilename = null; // no portrait, will fallback to dicebear
        }
      } else {
        imageFilename = null;
      }

      // 3. Extract zip to a temp directory
      const tempDir = path.join(USER_DATA_PATH, 'temp_extract');
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir);

      const exec = require('child_process').execSync;
      try {
        if (process.platform === 'win32') {
          exec(`powershell -Command "Expand-Archive -Path '${selectedZipPath.replace("'", "''")}' -DestinationPath '${tempDir.replace("'", "''")}' -Force"`);
        } else {
          exec(`/usr/bin/unzip -o -q "${selectedZipPath}" -d "${tempDir}"`);
        }
      } catch (unzipErr) {
        console.error('Unzip command failed:', unzipErr);
        throw new Error('Failed to extract model zip archive.');
      }

      // 4. Scan tempDir recursively to find the bin files
      const binFilesFound = {};
      const binNames = [
        'embedding_setter.bin',
        'phone_extractor.bin',
        'pitch_estimator.bin',
        'speaker_embeddings.bin',
        'waveform_generator.bin'
      ];

      function scanDir(dir) {
        for (const item of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, item);
          if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
          } else if (binNames.includes(item)) {
            binFilesFound[item] = fullPath;
          }
        }
      }
      scanDir(tempDir);

      if (!binFilesFound['speaker_embeddings.bin'] || !binFilesFound['waveform_generator.bin']) {
        throw new Error('Required model files (speaker_embeddings.bin and/or waveform_generator.bin) are missing from the zip archive.');
      }

      // 5. Copy bin files into custom_models/{name}/
      for (const binName of binNames) {
        if (binFilesFound[binName]) {
          fs.copyFileSync(binFilesFound[binName], path.join(targetFolder, binName));
        }
      }
      fs.rmSync(tempDir, { recursive: true, force: true });

      // 6. Build category list
      const catSet = new Set(['human']);
      catSet.add(selectedCategory);
      if (selectedCategory === 'anime') {
        catSet.add('roleplay'); catSet.add('memes'); catSet.add('high-pitched');
      } else if (selectedCategory === 'celebrity') {
        catSet.add('deep');
      } else if (selectedCategory === 'gaming') {
        catSet.add('roleplay'); catSet.add('memes');
      } else if (selectedCategory === 'politician') {
        catSet.add('memes'); catSet.add('deep');
      } else {
        catSet.add('memes');
      }
      const catList = Array.from(catSet);

      // 7. Write model.toml inside custom_models/{name}/
      const portraitLine = imageFilename
        ? `path = "${imageFilename}"`
        : `path = "noimage.png"`;
      const tomlContent = `[model]
version = "2.0.0-rc.0"
name = "${safeFolderName.replace(/"/g, '\\"')}"
description = """
Imported custom voice model.
"""

[voice.0]
name = "${name.replace(/"/g, '\\"')}"
description = """
Custom imported speaker.
"""
average_pitch = 50.875
categories = ${JSON.stringify(catList)}

[voice.0.portrait]
${portraitLine}
description = """
"""
`;
      fs.writeFileSync(path.join(targetFolder, 'model.toml'), tomlContent, 'utf8');

      // 8. Switch to this new model and reload
      const modelKey = `custom:${safeFolderName}`;
      localStorage.setItem(STORAGE_KEY_MODEL, modelKey);
      // Reset all sliders to default before reloading so the new model starts clean
      resetControlsToDefault();
      alert(`"${name}" imported successfully! Reloading...`);
      uploadModal.style.display = 'none';
      location.reload();

    } catch (err) {
      alert('Error importing model: ' + err.message);
      modalImportBtn.disabled = false;
      modalImportBtn.textContent = 'Import Model';
    }
  });
}

// ════════════════════════════════════════════════════════════
// COMMUNITY SOUND LIBRARY
// ════════════════════════════════════════════════════════════

const STORAGE_KEY_FREESOUND = 'beatrice_freesound_key';
const LIB_PAGE_SIZE = 30;
const LIB_WM_LIMIT  = 30;

// ── Library state ─────────────────────────────────────────
let libCat         = 'all';
let libSearch      = '';
let libFsPage      = 1;
let libFsHasMore   = false;
let libPreviewAudio= null;
let libPreviewId   = null;
let libMode        = 'wikimedia';  // 'wikimedia' | 'freesound'
let libSounds      = [];
let libSearchTimer = null;
let libInitDone    = false;

// ── Helpers ───────────────────────────────────────────────
function downloadUrlToLocalFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? require('https') : require('http');
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadUrlToLocalFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP status ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

function getLibKey() { return localStorage.getItem(STORAGE_KEY_FREESOUND) || ''; }
function saveLibKey(k) { localStorage.setItem(STORAGE_KEY_FREESOUND, k); }

function getCatData(id) {
  return LIB_CATEGORIES.find(c => c.id === id) || LIB_CATEGORIES[0];
}

// ── Wikimedia Commons source (no API key needed) ──────────
async function searchWikimedia(query, cat) {
  const catData = getCatData(cat);
  const q = [query, catData.wmQuery].filter(Boolean).join(' ') || 'sound effect';
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `${q} filetype:audio`,
    srnamespace: '6',
    srlimit: String(LIB_WM_LIMIT),
    srprop: 'snippet',
    format: 'json',
    origin: '*'
  });
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Wikimedia HTTP ${resp.status}`);
  const data = await resp.json();
  const audioExts = /\.(ogg|mp3|wav|flac|oga|opus|webm)$/i;
  return (data.query?.search || [])
    .filter(r => audioExts.test(r.title))
    .map((r, i) => {
      const filename = r.title.replace(/^File:/i, '');
      return {
        id: `wm-${r.pageid}`,
        name: filename.replace(audioExts, '').replace(/_/g, ' ').trim(),
        category: cat,
        emoji: catData.emoji,
        color: catData.color,
        url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`,
        author: 'Wikimedia Commons',
        tags: [],
        license: 'Free / CC',
        index: i,
      };
    });
}

// ── Freesound source (free API key) ──────────────────────
async function searchFreesound(query, cat, page) {
  const key = getLibKey();
  if (!key) return { sounds: [], hasMore: false };
  const catData = getCatData(cat);
  const q = query || catData.fsQuery || 'sound';
  const params = new URLSearchParams({
    token: key,
    query: q,
    fields: 'id,name,username,tags,previews,images',
    page: String(page),
    page_size: String(LIB_PAGE_SIZE),
  });
  if (catData.fsFilter) params.set('filter', catData.fsFilter);
  const resp = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);
  if (resp.status === 401) throw new Error('invalid_key');
  if (!resp.ok) throw new Error(`Freesound HTTP ${resp.status}`);
  const data = await resp.json();
  const sounds = (data.results || []).map((r, i) => ({
    id: `fs-${r.id}`,
    name: r.name.replace(/\.(wav|mp3|ogg|flac|aif|aiff|opus)$/i, ''),
    category: cat,
    emoji: catData.emoji,
    color: catData.color,
    url: r.previews?.['preview-hq-mp3'] || r.previews?.['preview-lq-mp3'] || '',
    image: r.images?.spectral_m || '',
    author: r.username,
    tags: (r.tags || []).slice(0, 5),
    license: 'CC',
    index: (page - 1) * LIB_PAGE_SIZE + i,
  }));
  return { sounds, hasMore: !!data.next, total: data.count };
}

// ── Core library loader ───────────────────────────────────
async function loadLibrary(resetPage = true) {
  const grid = document.getElementById('lib-grid');
  if (!grid) return;
  if (resetPage) { libFsPage = 1; libSounds = []; }

  grid.innerHTML = `<div class="lib-loading"><div class="spinner"></div><p>Loading sounds…</p></div>`;
  document.getElementById('lib-pagination').style.display = 'none';

  // Filter our famous local presets
  const query = libSearch.toLowerCase().trim();
  const matchedPresets = FAMOUS_PRESETS.filter(p => {
    const catMatch = libCat === 'all' || p.category === libCat;
    const searchMatch = !query || p.name.toLowerCase().includes(query);
    return catMatch && searchMatch;
  });

  try {
    let onlineSounds = [];
    if (libCat !== 'indian') {
      onlineSounds = await searchWikimedia(libSearch, libCat);
    }
    libSounds = [...matchedPresets, ...onlineSounds];
    renderLibGrid(libSounds);
    const statsEl = document.getElementById('lib-stats');
    if (statsEl) {
      statsEl.textContent = libCat === 'indian'
        ? `Featured Indian presets · ${libSounds.length} sounds`
        : `Featured presets & Wikimedia Commons · ${libSounds.length} sounds`;
    }
    document.getElementById('lib-pagination').style.display = 'none';
  } catch (err) {
    console.error('[Library]', err);
    // If online search fails, still show the matching presets!
    if (matchedPresets.length > 0) {
      libSounds = matchedPresets;
      renderLibGrid(libSounds);
      const statsEl = document.getElementById('lib-stats');
      if (statsEl) statsEl.textContent = `Featured presets · ${libSounds.length} sounds`;
    } else {
      grid.innerHTML = `<div class="lib-error">⚠️ Could not load sounds: ${err.message}. Check your internet connection.</div>`;
    }
  }
}

// ── Render grid ───────────────────────────────────────────
function renderLibGrid(sounds) {
  const grid = document.getElementById('lib-grid');
  if (!grid) return;
  
  const addedIds = new Set(soundboardSounds.filter(s => s.libId).map(s => s.libId));
  const availableSounds = sounds.filter(sound => !addedIds.has(sound.id));

  // Sort available sounds: first show image with sound, then emoji with sound
  availableSounds.sort((a, b) => {
    const hasA = !!(a.image || a.imagePath || a.malCharName);
    const hasB = !!(b.image || b.imagePath || b.malCharName);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    return 0;
  });

  if (!availableSounds.length) {
    grid.innerHTML = '<div class="lib-empty">No sounds found. Try a different category or search term.</div>';
    return;
  }
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  availableSounds.forEach(sound => frag.appendChild(makeLibCard(sound, false)));
  grid.appendChild(frag);
}

function makeLibCard(sound, isAdded) {
  const card = document.createElement('div');
  card.className = 'lib-card';
  card.dataset.id = sound.id;

  const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  const isPrev = libPreviewId === sound.id;

  const addIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  const imageUrl = getImageUrlForSound(sound);
  const isCustomImage = !!(sound.image || sound.imagePath);
  const imageStyle = isCustomImage ? 'style="object-fit: contain;"' : '';
  const imgClass = 'lib-card-img' + (sound.invertImage ? ' invert-img' : '');
  const thumbInner = `<img src="${imageUrl}" alt="" class="${imgClass}" ${imageStyle} loading="lazy" data-emoji="${sound.emoji || '🔊'}" data-color="${sound.color || '#1a1a2e'}" onerror="this.onerror=null;this.src=getImageUrlForSound({emoji:this.dataset.emoji,color:this.dataset.color});this.style.objectFit='cover';this.style.background='transparent';">`;

  card.innerHTML = `
    <div class="lib-card-thumb">
      ${thumbInner}
      <button class="lib-preview-btn${isPrev ? ' is-previewing' : ''}" data-id="${sound.id}" title="Preview">
        ${isPrev ? pauseIcon : playIcon}
      </button>
      <button class="lib-card-add-btn" data-id="${sound.id}" title="Add to Soundboard">
        ${addIcon}
      </button>
    </div>
    <div class="lib-card-body">
      <span class="lib-card-name" title="${sound.name}">${sound.name}</span>
      <span class="lib-card-author">${sound.author || ''}</span>
    </div>
  `;

  card.querySelector('.lib-preview-btn').addEventListener('click', e => {
    e.stopPropagation();
    togglePreview(sound);
  });
  card.querySelector('.lib-card-add-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (btn.classList.contains('loading')) return;
    await downloadToSoundboard(sound, btn);
  });

  // Lazy-load anime character image from Jikan API if malCharName is set
  if (sound.malCharName && !sound.image) {
    const libImg = card.querySelector('.lib-card-img');
    if (libImg) {
      fetchJikanCharImage(sound.malCharName).then(url => {
        if (url && libImg.isConnected) {
          libImg.src = url;
          libImg.style.objectFit = 'contain';
          libImg.style.background = '#0b0b14';
        }
      });
    }
  }

  return card;
}

// Helper to resolve PortAudio device names to Web Audio API device IDs for HTML5 Audio sink routing
async function getWebDeviceIdFromName(targetName, kind = 'audiooutput') {
  if (!targetName || targetName === 'Default Headphones' || targetName === 'Default Speaker' || targetName.toLowerCase().includes('default')) {
    return '';
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cleanTarget = targetName.toLowerCase().trim();
    const match = devices.find(d => 
      d.kind === kind && 
      d.label && 
      (d.label.toLowerCase().includes(cleanTarget) || cleanTarget.toLowerCase().includes(d.label.toLowerCase()))
    );
    return match ? match.deviceId : '';
  } catch (err) {
    console.warn('[getWebDeviceIdFromName] failed:', err);
    return '';
  }
}

// ── Preview ────────────────────────────────────────────────
// ── Preview ────────────────────────────────────────────────
async function togglePreview(sound) {
  if (libPreviewId === sound.id) { stopPreview(); return; }
  stopPreview();
  libPreviewId = sound.id;

  const card = document.querySelector(`.lib-card[data-id="${sound.id}"]`);
  const btn = card?.querySelector('.lib-preview-btn');
  if (btn) {
    btn.classList.add('is-previewing');
    btn.innerHTML = `<div class="spinner-small" style="width:12px; height:12px; border-width:2px; margin:0 auto;"></div>`;
  }

  if (libPreviewId !== sound.id) return;

  libPreviewAudio = new Audio(sound.url);
  libPreviewAudio.volume = 0.85;
  libPreviewAudio.crossOrigin = 'anonymous';

  // Explicitly route to selected monitor/headphones device so they can hear previews privately
  try {
    const selectedMonitorDeviceName = monitorDeviceSelect.options[monitorDeviceSelect.selectedIndex]?.text;
    if (selectedMonitorDeviceName && typeof libPreviewAudio.setSinkId === 'function') {
      const webDeviceId = await getWebDeviceIdFromName(selectedMonitorDeviceName);
      await libPreviewAudio.setSinkId(webDeviceId);
    }
  } catch (err) {
    console.warn('[Library Preview routing failed]', err);
  }

  libPreviewAudio.play().then(() => {
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
  }).catch(err => {
    console.warn('[Library Preview]', err.message);
    stopPreview();
  });

  libPreviewAudio.onended = () => {
    libPreviewId = null;
    libPreviewAudio = null;
    refreshPreviewBtn(sound.id, false);
  };
}

function stopPreview() {
  if (libPreviewAudio) { libPreviewAudio.pause(); libPreviewAudio.src = ''; libPreviewAudio = null; }
  if (libPreviewId) { refreshPreviewBtn(libPreviewId, false); libPreviewId = null; }
}
function refreshPreviewBtn(soundId, playing) {
  const card = document.querySelector(`.lib-card[data-id="${soundId}"]`);
  if (!card) return;
  const btn = card.querySelector('.lib-preview-btn');
  if (!btn) return;
  btn.classList.toggle('is-previewing', playing);
  btn.innerHTML = playing
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
}

// ── Download & add to Soundboard ──────────────────────────
async function downloadToSoundboard(sound, btn) {
  btn.classList.add('loading');
  btn.innerHTML = `<div class="spinner-small"></div>`;
  try {
    const ext  = /\.ogg/i.test(sound.url) ? '.ogg' : '.mp3';
    const safe = sound.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const dest = path.join(SOUNDBOARD_DIR, `lib_${Date.now()}_${safe}${ext}`);
    
    await downloadUrlToLocalFile(sound.url, dest);

    soundboardSounds.push({ name: sound.name, audioPath: dest, libId: sound.id, category: sound.category, image: sound.image || undefined });
    saveSoundboard();
    renderSoundboardMain();
    
    // Animate out and remove the card from the library grid
    const card = btn.closest('.lib-card');
    if (card) {
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        card.remove();
        // Check if grid is now empty
        const grid = document.getElementById('lib-grid');
        if (grid && grid.querySelectorAll('.lib-card').length === 0) {
          grid.innerHTML = '<div class="lib-empty">No sounds found. Try a different category or search term.</div>';
        }
      }, 300);
    }
  } catch (err) {
    console.error('[Library Download]', err);
    btn.classList.remove('loading');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    }, 2500);
  }
}

// ── Banner helpers ────────────────────────────────────────
function updateLibBanner() {}

// ── Library event wiring ──────────────────────────────────
function initLibraryEvents() {
  // Category bar
  document.getElementById('lib-cat-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.lib-cat-btn');
    if (!btn) return;
    document.querySelectorAll('.lib-cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    libCat = btn.dataset.cat;
    loadLibrary(true);
  });

  // Search
  document.getElementById('lib-search')?.addEventListener('input', e => {
    clearTimeout(libSearchTimer);
    libSearch = e.target.value.trim();
    libSearchTimer = setTimeout(() => loadLibrary(true), 450);
  });

  // Stop preview when switching away from Library tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab !== 'library-view') stopPreview();
    });
  });
}

let activeContextMenuSlot = null;

function showSoundboardContextMenu(index, x, y) {
  activeContextMenuSlot = index;
  const menu = document.getElementById('sb-context-menu');
  if (!menu) return;

  const sound = soundboardSounds[index];
  const clearBtn = document.getElementById('context-clear-keybind');
  if (clearBtn) {
    clearBtn.style.display = (sound && sound.keybind) ? 'block' : 'none';
  }

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'flex';
}

function hideSoundboardContextMenu() {
  const menu = document.getElementById('sb-context-menu');
  if (menu) menu.style.display = 'none';
}

function initSoundboardContextMenu() {
  const contextRename = document.getElementById('context-rename');
  const contextKeybind = document.getElementById('context-keybind');
  const contextClearKeybind = document.getElementById('context-clear-keybind');
  const contextChangeImage = document.getElementById('context-change-image');
  const contextDelete = document.getElementById('context-delete');
  const sbImageInput = document.getElementById('sb-image-input');

  if (contextRename) {
    contextRename.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSoundboardContextMenu();
      if (activeContextMenuSlot !== null) {
        const slotEl = document.querySelector(`.sb-main-slot[data-index="${activeContextMenuSlot}"]`);
        if (slotEl) startRenameSlot(activeContextMenuSlot, slotEl);
      }
    });
  }

  if (contextKeybind) {
    contextKeybind.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSoundboardContextMenu();
      if (activeContextMenuSlot !== null) {
        startRecordingKeybind(activeContextMenuSlot);
      }
    });
  }

  if (contextClearKeybind) {
    contextClearKeybind.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSoundboardContextMenu();
      if (activeContextMenuSlot !== null) {
        soundboardSounds[activeContextMenuSlot].keybind = null;
        saveSoundboard();
        renderSoundboardMain();
      }
    });
  }

  if (contextDelete) {
    contextDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSoundboardContextMenu();
      if (activeContextMenuSlot !== null) {
        deleteSoundboardSound(activeContextMenuSlot);
      }
    });
  }

  if (contextChangeImage && sbImageInput) {
    contextChangeImage.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSoundboardContextMenu();
      sbImageInput.click();
    });

    sbImageInput.addEventListener('change', () => {
      if (activeContextMenuSlot === null || sbImageInput.files.length === 0) return;
      const file = sbImageInput.files[0];
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = path.join(SOUNDBOARD_DIR, `sb_img_${Date.now()}_${safeName}`);
      
      try {
        const data = new Uint8Array(fs.readFileSync(file.path));
        fs.writeFileSync(destPath, Buffer.from(data));
        soundboardSounds[activeContextMenuSlot].imagePath = destPath;
        saveSoundboard();
        renderSoundboardMain();
      } catch (err) {
        console.error('[Soundboard Image Upload]', err);
      }
      
      // Clear input
      sbImageInput.value = '';
    });
  }

  document.addEventListener('click', hideSoundboardContextMenu);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.sb-main-slot')) {
      hideSoundboardContextMenu();
    }
  });
}

// ── Lazy-init on tab open ─────────────────────────────────
(function patchTabsForLibrary() {
  const origTabBtns = document.querySelectorAll('.tab-btn');
  origTabBtns.forEach(btn => {
    if (btn.dataset.tab === 'library-view') {
      btn.addEventListener('click', () => {
        if (!libInitDone) {
          libInitDone = true;
          initLibraryEvents();
          updateLibBanner();
          loadLibrary(true);
        }
      });
    }
  });
})();

// Bootstrap
initSoundboardContextMenu();
initFloatingControlBar();
loadSpeakerData();
applyBypassUI(voiceChangerBypass);
setInterval(pollBackendStatus, 250);

function updateFloatingPlayButtonUI() {
  const fcSbBtn = document.getElementById('fc-sb-btn');
  if (!fcSbBtn) return;
  const playIcon = fcSbBtn.querySelector('.fc-sb-play-icon');
  const stopIcon = fcSbBtn.querySelector('.fc-sb-stop-icon');
  
  if (playingIndex !== null) {
    fcSbBtn.classList.add('active');
    playIcon?.classList.add('hidden');
    stopIcon?.classList.remove('hidden');
  } else {
    fcSbBtn.classList.remove('active');
    playIcon?.classList.remove('hidden');
    stopIcon?.classList.add('hidden');
  }
}

function initFloatingControlBar() {
  const fcPowerBtn = document.getElementById('fc-power-btn');
  const fcMicBtn = document.getElementById('fc-mic-btn');
  const fcHearBtn = document.getElementById('fc-hear-btn');
  const fcSettingsTrigger = document.getElementById('fc-settings-trigger');
  const fcSettingsMenu = document.getElementById('fc-settings-menu');
  const fcMicVolSlider = document.getElementById('fc-mic-vol-slider');
  const fcHearVolSlider = document.getElementById('fc-hear-vol-slider');
  const fcSbBtn = document.getElementById('fc-sb-btn');

  updateFloatingPlayButtonUI();

  // Power Button sync click
  fcPowerBtn?.addEventListener('click', () => {
    voiceChangerBypass = !voiceChangerBypass;
    applyBypassUI(voiceChangerBypass);
    setBackendConfig({ bypass: voiceChangerBypass });
  });

  // Mic Mute click
  fcMicBtn?.addEventListener('click', () => {
    microphoneMuted = !microphoneMuted;
    setBackendConfig({ muted: microphoneMuted });
  });

  // Hear Yourself click
  fcHearBtn?.addEventListener('click', () => {
    const nextVal = !hearYourselfToggle.checked;
    hearYourselfToggle.checked = nextVal;
    hearYourselfToggle.dispatchEvent(new Event('change'));
  });

  // Settings Trigger toggle
  fcSettingsTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fcSettingsMenu) {
      fcSettingsMenu.style.display = fcSettingsMenu.style.display === 'none' ? 'flex' : 'none';
    }
  });

  // Close settings dropdown on click outside
  document.addEventListener('click', (e) => {
    if (fcSettingsMenu && !e.target.closest('.fc-mid-group')) {
      fcSettingsMenu.style.display = 'none';
    }
  });

  // Mic Volume Slider
  fcMicVolSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volumeSlider.value = val;
    volumeValSpan.textContent = `${Math.round(val * 100)}%`;
    setBackendConfig({ volume: val });
  });

  // Hear Yourself Volume Slider (syncs to same volume setting)
  fcHearVolSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volumeSlider.value = val;
    volumeValSpan.textContent = `${Math.round(val * 100)}%`;
    setBackendConfig({ volume: val });
  });

  // Soundboard play/stop recently played click
  fcSbBtn?.addEventListener('click', () => {
    if (playingIndex !== null) {
      stopSoundboardSlot();
    } else {
      const idx = lastPlayedSoundboardIndex !== null ? lastPlayedSoundboardIndex : 0;
      if (soundboardSounds.length > 0) {
        playSoundboardSlot(idx);
      }
    }
  });
}

// ── KEYBIND RECORDING SYSTEM ──────────────────────────────────
function startRecordingKeybind(index) {
  isRecordingKeybindForSlot = index;
  renderSoundboardMain();

  const handleKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Check for clear (Escape / Backspace)
    if (e.key === 'Escape' || e.key === 'Backspace') {
      soundboardSounds[index].keybind = null;
      isRecordingKeybindForSlot = null;
      document.removeEventListener('keydown', handleKeyDown, true);
      saveSoundboard();
      renderSoundboardMain();
      return;
    }

    const accel = formatAccelerator(e);
    if (accel) {
      soundboardSounds[index].keybind = accel;
      isRecordingKeybindForSlot = null;
      document.removeEventListener('keydown', handleKeyDown, true);
      saveSoundboard();
      renderSoundboardMain();
    }
  };

  document.addEventListener('keydown', handleKeyDown, true);
}

function formatAccelerator(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') {
    return null;
  }

  if (key === ' ') key = 'Space';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join('+');
}

function updateRegisteredKeybinds() {
  try {
    const shortcuts = soundboardSounds
      .map((s, idx) => ({ index: idx, keybind: s.keybind }))
      .filter(s => s && s.keybind);
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('register-sound-shortcuts', shortcuts);
  } catch (err) {
    console.error('Error sending shortcuts to main process:', err);
  }
}

// Global IPC listener for global shortcut triggers from Main process
try {
  const { ipcRenderer } = require('electron');
  ipcRenderer.on('play-sound-slot', (event, index) => {
    playSoundboardSlot(index);
  });
} catch (err) {
  console.error('Failed to bind ipcRenderer play-sound-slot listener:', err);
}

// Window controls for non-macOS (Windows/Linux)
if (process.platform !== 'darwin') {
  document.body.classList.add('is-win');
  
  const minBtn = document.getElementById('win-min');
  const maxBtn = document.getElementById('win-max');
  const closeBtn = document.getElementById('win-close');
  
  if (minBtn) minBtn.addEventListener('click', () => ipcRenderer.send('win-minimize'));
  if (maxBtn) maxBtn.addEventListener('click', () => ipcRenderer.send('win-maximize'));
  if (closeBtn) closeBtn.addEventListener('click', () => ipcRenderer.send('win-close'));
} else {
  document.body.classList.add('is-mac');
}
