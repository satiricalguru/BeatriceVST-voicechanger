<div align="center">

# 🎙️ Project Beatrice (Windows Version)

### Real-Time AI Voice Changer for Windows

![Windows](https://img.shields.io/badge/-Windows%2010%2F11%20(64--bit)-blue?style=flat-square&logo=windows)
![Electron](https://img.shields.io/badge/-Electron%2030-blueviolet?style=flat-square&logo=electron)
![Python](https://img.shields.io/badge/-Python%203.9%2B-3776AB?style=flat-square&logo=python)
![License](https://img.shields.io/badge/-MIT-green?style=flat-square)

<img src="beatrice_paraphernalia_jvs/noimage.png" width="140" alt="Beatrice Logo" />

**Morph your voice in real-time** using 100 AI speakers from the JVS corpus — powered by the Beatrice 2.0.0-rc.2 DSP engine with sub-10ms latency. Optimized and wrapper-compiled specifically for Windows platforms.

</div>

---

## Features

<table>
<tr>
<td width="50%">

### 🎤 Voice Conversion
- **100 target voices** — each mapped to a chemical element
- Real-time DSP pipeline at **16 kHz / 10ms latency**
- Pitch shift (−12 to +12 semitones)
- Formant shift (−1.5 to +1.5)
- Noise gate for background suppression

</td>
<td width="50%">

### 🔊 Soundboard
- Upload any audio file (WAV, MP3, FLAC, etc.)
- Click to play through your selected output device
- "Hear Yourself" mode for local monitoring
- Inline rename & delete — no empty preset slots

</td>
</tr>
<tr>
<td>

### 🔧 Audio Routing
- Separate input, output, and monitor devices
- Per-device PortAudio selection
- Real-time input/output level meters (dB)

</td>
<td>

### 🎨 Theming & Native Controls
- 6 handcrafted themes (Obsidian, Midnight, Teal, Amber, Rose, Cyberpunk)
- Adaptive Light & dark modes for each theme
- Built-in custom Windows Titlebar Controls (Minimize, Maximize, Close)
- 3 languages (English, Japanese, Chinese)

</td>
</tr>
</table>

---

## 🖥️ Requirements

| Dependency | Version | Purpose |
|---|---|---|
| OS | Windows 10 / 11 (64-bit) | Operating System |
| Node.js | 18+ | Electron Shell Runtime |
| Python | 3.9+ | Audio Backend / Rest API |
| `sounddevice` | 0.4.6+ | PortAudio I/O bindings |
| `numpy` | 1.24+ | DSP matrix processing |
| `soundfile` | 0.12+ | Soundboard file decoding |

> **Note:** The core Beatrice library (`beatrice_2.0.0-rc.2.dll`) has been wrapper-compiled specifically for Windows architectures and is included natively. No external VST hosts are required to run this standalone application.

---

## Screenshots

<img width="2918" height="1706" alt="image" src="https://github.com/user-attachments/assets/5fbb5f5c-7f48-486f-be1d-7f7d9ae86377" />
<img width="2912" height="1704" alt="image" src="https://github.com/user-attachments/assets/78250418-db4b-47b8-93c1-3711f8faf211" />
<img width="2910" height="1708" alt="image" src="https://github.com/user-attachments/assets/f5b03f93-618a-4ba8-b723-e241bf6b0d35" />

---

## Quick Start (Developer Setup)

```powershell
# 1. Clone the repository
git clone https://github.com/satiricalguru/BeatriceVST-voicechanger.git
cd BeatriceVST-voicechanger

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install Node.js dependencies
npm install

# 4. Launch the application
npm start
```

> **Usage:** Voice conversion activates on launch. Toggle the **LIVE** power button in the sidebar to switch between **LIVE** (converting) and **BYPASSED** (raw mic feed).

---

## Controls

| Sidebar Control | Description |
|---|---|
| **Power Button** | Toggle LIVE (converting) / BYPASSED (raw mic) |
| **Input Microphone** | Select your recording device |
| **Output Device** | Select playback destination |
| **Hear Yourself** | Route output to a local monitor device (e.g. headphones) |
| **Noise Gate** | Threshold below which input is silenced |
| **Pitch Shift** | Shift pitch ±12 semitones |
| **Formant Shift** | Shift vocal tract formants |
| **Output Volume** | Final output gain (0–200%) |

---

## Soundboard

Upload audio files and trigger them instantly:

1. Click **Upload Sound** or drag-and-drop an audio file onto the grid
2. **Click** a tile to play through the selected output device
3. **Click again** (pause icon) to stop playback
4. **Hover** a tile for rename and delete options

When **Hear Yourself** is enabled, soundboard audio also routes through your monitor device.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Electron UI                     │
│   index.html + index.css + renderer.js       │
│   ┌──────────────┐  ┌─────────────────────┐  │
│   │ Voice Grid   │  │ Soundboard          │  │
│   │ (100 JVS)    │  │ (upload → play)     │  │
│   └──────────────┘  └─────────────────────┘  │
│   │ Custom title window controls (WCO)    │  │
└────────────────────┬─────────────────────────┘
                     │ HTTP REST (127.0.0.1:5005)
                     ▼
 ┌─────────────────────────────────────────────┐
 │         Python Audio Backend                │
 │         beatrice_audio.py                   │
 │   ┌──────────────────────────────────────┐  │
 │   │ PortAudio I/O (sounddevice)          │  │
 │   │ Beatrice DLL ctypes wrapper          │  │
 │   │ Phone → Pitch → Waveform pipeline    │  │
 │   │ Soundboard playback (soundfile)      │  │
 │   └──────────────────────────────────────┘  │
 └───────────────────┬─────────────────────────┘
                     │ ctypes CDLL
                     ▼
┌──────────────────────────────────────────────┐
│     Beatrice 2.0.0-rc.2.dll (Wrapper)        │
│     + beatrice_paraphernalia_jvs/            │
│       (model weights & speaker embeddings)   │
└──────────────────────────────────────────────┘
```

---

## Project Structure

```
BeatriceVST-voicechanger/
├── main.js                    # Electron main process
├── renderer.js                # Frontend logic (voices, soundboard, settings)
├── index.html                 # UI layout
├── index.css                  # Design system (6 themes, light/dark)
├── beatrice_audio.py          # Python audio backend + HTTP API
├── package.json               # Node config & build targets
├── requirements.txt           # Python dependencies
├── icon.png                   # App icon
├── soundboard_audio/          # Uploaded soundboard files (gitignored)
├── build_dll/                 # Source code for wrapper library DLL
├── beatrice_2.0.0-rc.2.vst3/  # Beatrice VST3 directory
│   └── Contents/
│       └── x86_64-win/
│           └── beatrice_2.0.0-rc.2.dll  # Native Windows compiled DLL wrapper
└── beatrice_paraphernalia_jvs/
    ├── *.bin                  # Model weights
    ├── speaker_embeddings.bin # 101 speaker profiles
    └── noimage.png            # Placeholder
```

## Packaging for Windows (Executable Installer)

To compile the application into a standalone installer (`.exe`) and portable folder:
```powershell
npm run dist:win
```
This will compile and generate the output inside the `dist/` directory:
- `dist/Beatrice Voice Changer Setup 1.0.0.exe` (NSIS Installer)
- `dist/Beatrice Voice Changer-1.0.0-win.zip` (Portable Package)

---

## API Reference

The Python backend exposes a REST API on `127.0.0.1:5005`:

| Endpoint | Method | Description |
|---|---|---|
| `/status` | GET | Current state: bypass, meters, devices, params |
| `/devices` | GET | List all PortAudio devices |
| `/set_config?...` | GET | Update any parameter (see below) |
| `/play_sound?file_path=...&hear_yourself=...` | GET | Play a soundboard file |
| `/stop_sound` | GET | Stop current soundboard playback |

**`/set_config` parameters:** `bypass`, `speaker_index`, `pitch_shift`, `formant_shift`, `volume`, `gate_threshold`, `input_device_id`, `output_device_id`, `monitor_device_id`, `hear_yourself`

---

## Credits & Acknowledgements

- **Beatrice DSP engine** — [prj-beatrice/beatrice-vst](https://github.com/prj-beatrice/beatrice-vst)
- **Voice Changer UI/backend** — Inspired by [w-okada/voice-changer](https://github.com/w-okada/voice-changer)
- **JVS Corpus** — [Shinnosuke Takamichi, UTokyo](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus)
  - Non-commercial use only. See `LICENSE.txt` and `LICENSES_BUNDLED.txt`.
- **Developed by Satirical Guru, Claude & Antigravity**.

---

## License

**MIT** — Copyright (c) 2026 Jatin Pandey

Voice changer UI and backend. The Beatrice DSP engine is licensed separately under the [prj-beatrice](https://github.com/prj-beatrice/beatrice-vst) project.

> **⚠️ JVS Corpus:** The JVS speaker data is licensed for **non-commercial use only**. See `LICENSE.txt` and `LICENSES_BUNDLED.txt` for details.

---

<div align="center">

**Built with** Electron · Python · Beatrice DSP · PortAudio · JVS Corpus

</div>
