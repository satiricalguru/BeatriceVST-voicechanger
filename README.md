<div align="center">

# 🎙️ Project Beatrice

### Real-Time AI Voice Changer

![macOS](https://img.shields.io/badge/-macOS%2012%2B-black?style=flat-square&logo=apple)
![Electron](https://img.shields.io/badge/-Electron%2030-blueviolet?style=flat-square&logo=electron)
![Python](https://img.shields.io/badge/-Python%203.9%2B-3776AB?style=flat-square&logo=python)
![License](https://img.shields.io/badge/-MIT-green?style=flat-square)

<img src="beatrice_paraphernalia_jvs/noimage.png" width="140" alt="Beatrice Logo" />

**Morph your voice in real-time** using 100 AI speakers from the JVS corpus — powered by the Beatrice 2.0.0-rc.2 DSP engine with sub-10ms latency.

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

### 🎨 Theming
- 6 handcrafted themes (Obsidian, Midnight, Teal, Amber, Rose, Cyberpunk)
- Light & dark mode per theme
- 3 languages (English, Japanese, Chinese)

</td>
</tr>
</table>

---

## 🖥️ Requirements

| Dependency | Version |
|---|---|
| macOS | 12 Monterey or later (Apple Silicon or Intel) |
| Node.js | 18+ |
| Python | 3.9+ |
| sounddevice | `pip install sounddevice` |
| numpy | `pip install numpy` |

> **Note:** The Beatrice VST3 library (`beatrice_2.0.0-rc.2.vst3`) is a **macOS-only** native binary. Windows/Linux are not supported in this release.

---

## Screenshots

<img width="1462" height="860" alt="Screenshot 2026-05-28 at 10 29 46 PM" src="https://github.com/user-attachments/assets/61564043-ec9e-46f9-8b7d-7a6d65dce136" />

---

## Quick Start


```bash
# Clone
git clone https://github.com/satiricalguru/beatrice-voicechanger.git
cd beatrice-voicechanger

# Install dependencies
pip install -r requirements.txt
npm install

# Launch
npm start
```

> Voice conversion activates on launch. Toggle the power button in the sidebar to switch between **LIVE** (converting) and **BYPASSED** (raw mic).

---

## Requirements

| Dependency | Version | Purpose |
|---|---|---|
| macOS | 12 Monterey+ | Apple Silicon or Intel |
| Node.js | 18+ | Electron shell |
| Python | 3.9+ | Audio backend |
| `sounddevice` | 0.4.6+ | PortAudio I/O |
| `numpy` | 1.24+ | DSP math |
| `soundfile` | 0.12+ | Soundboard audio decoding |

> **Note:** The Beatrice VST3 library is a **macOS-only** signed binary. Windows/Linux are not supported.

---

## Controls

| Sidebar Control | Description |
|---|---|
| **Power Button** | Toggle LIVE (converting) / BYPASSED (raw mic) |
| **Input Microphone** | Select your mic |
| **Output Device** | Select playback destination |
| **Hear Yourself** | Route output to a monitor device |
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

When **Hear Yourself** is enabled, soundboard audio also plays through your monitor device.

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
└────────────────────┬─────────────────────────┘
                     │ HTTP REST (127.0.0.1:5005)
                     ▼
┌──────────────────────────────────────────────┐
│         Python Audio Backend                  │
│         beatrice_audio.py                    │
│   ┌──────────────────────────────────────┐   │
│   │ PortAudio I/O (sounddevice)          │   │
│   │ Beatrice VST3 ctypes wrapper         │   │
│   │ Phone → Pitch → Waveform pipeline    │   │
│   │ Soundboard playback (soundfile)      │   │
│   └──────────────────────────────────────┘   │
└────────────────────┬─────────────────────────┘
                     │ ctypes CDLL
                     ▼
┌──────────────────────────────────────────────┐
│     Beatrice 2.0.0-rc.2 VST3 Library         │
│     + beatrice_paraphernalia_jvs/            │
│       (model weights & speaker embeddings)   │
└──────────────────────────────────────────────┘
```

---

## Project Structure

```
beatrice-voicechanger/
├── main.js                    # Electron main process
├── renderer.js                # Frontend logic (voices, soundboard, settings)
├── index.html                 # UI layout
├── index.css                  # Design system (6 themes, light/dark)
├── beatrice_audio.py          # Python audio backend + HTTP API
├── package.json               # Node config
├── requirements.txt           # Python dependencies
├── icon.png                   # App icon
├── soundboard_audio/          # Uploaded soundboard files (gitignored)
├── beatrice_2.0.0-rc.2.vst3/ # Native Beatrice DSP library
└── beatrice_paraphernalia_jvs/
    ├── *.bin                  # Model weights
    ├── speaker_embeddings.bin # 101 speaker profiles
    └── noimage.png            # Placeholder
```

## Credits & Acknowledgements

- **Beatrice DSP engine** — [prj-beatrice/beatrice-vst](https://github.com/prj-beatrice/beatrice-vst)
- **Voice Changer UI/backend** — Inspired by [w-okada/voice-changer](https://github.com/w-okada/voice-changer)
- **JVS Corpus** — [Shinnosuke Takamichi, UTokyo](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus)
  - Non-commercial use only. See `LICENSE.txt` and `LICENSES_BUNDLED.txt`.
- **Developed by Satirical Guru, Claude & Antigravity**.

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

## License

**MIT** — Copyright (c) 2026 Jatin Pandey

Voice changer UI and backend. The Beatrice DSP engine is licensed separately under the [prj-beatrice](https://github.com/prj-beatrice/beatrice-vst) project.

> **⚠️ JVS Corpus:** The JVS speaker data is licensed for **non-commercial use only**. See `LICENSE.txt` and `LICENSES_BUNDLED.txt` for details.

---

<div align="center">

**Built with** Electron · Python · Beatrice DSP · PortAudio · JVS Corpus

</div>
