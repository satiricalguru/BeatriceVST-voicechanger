import os
import sys
import ctypes
import math
import json
import threading
import queue
import time
import signal
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import sounddevice as sd
import numpy as np

try:
    import soundfile as sf
    HAS_SF = True
except ImportError:
    HAS_SF = False
    print("[!] soundfile not installed — soundboard playback disabled. Install with: pip install soundfile")

# Global configurations
class Config:
    # bypass=True means DSP is INACTIVE (raw mic passthrough).
    # bypass=False means DSP is ACTIVE (voice is being converted).
    # Start with bypass=True so the user hears their own raw mic on launch.
    bypass = True
    speaker_index = -1
    pitch_shift = 0.0  # Semitones shift
    formant_shift = 0.0  # Formant shift value
    volume = 1.0
    gate_threshold = 0.01  # Noise gate threshold
    input_meter = 0.0
    output_meter = 0.0
    
    # Advanced routing
    input_device_id = None
    output_device_id = None
    monitor_device_id = None
    hear_yourself = False
    
    # Deferred parameter updates — set by HTTP thread, consumed by audio callback
    pending_speaker_index = None
    pending_formant_shift = None
    
    # Persistent ctypes object to avoid pointer garbage collection and GC segmentation faults
    formant_val_ctypes = ctypes.c_float(0.0)
    
    # DSP ready flag — set to True after models are loaded and speaker 0 is initialised
    dsp_ready = False

# Non-blocking audio queue for local monitoring
monitor_queue = queue.Queue(maxsize=50)
monitor_stream = None
stream = None
stream_lock = threading.Lock()

def cleanup_and_exit(signum=None, frame=None):
    global stream, monitor_stream
    print("\n[*] Gracefully cleaning up resources before exit...")
    
    # 1. Stop PortAudio Streams
    with stream_lock:
        if stream:
            try:
                stream.stop()
                stream.close()
                print("[+] Main PortAudio stream closed.")
            except Exception as e:
                print("[-] Error closing main stream:", e)
            stream = None
            
        if monitor_stream:
            try:
                monitor_stream.stop()
                monitor_stream.close()
                print("[+] Monitor PortAudio stream closed.")
            except Exception as e:
                print("[-] Error closing monitor stream:", e)
            monitor_stream = None

    # 2. Destroy VST3 Contexts and Extractors
    try:
        if 'embedding_context' in globals() and embedding_context:
            lib.Beatrice20rc0_DestroyEmbeddingContext(embedding_context)
        if 'waveform_context' in globals() and waveform_context:
            lib.Beatrice20rc0_DestroyWaveformContext1(waveform_context)
        if 'pitch_context' in globals() and pitch_context:
            lib.Beatrice20rc0_DestroyPitchContext1(pitch_context)
        if 'phone_context' in globals() and phone_context:
            lib.Beatrice20rc0_DestroyPhoneContext1(phone_context)
            
        if 'embedding_setter' in globals() and embedding_setter:
            lib.Beatrice20rc0_DestroyEmbeddingSetter(embedding_setter)
        if 'waveform_generator' in globals() and waveform_generator:
            lib.Beatrice20rc0_DestroyWaveformGenerator(waveform_generator)
        if 'pitch_estimator' in globals() and pitch_estimator:
            lib.Beatrice20rc0_DestroyPitchEstimator(pitch_estimator)
        if 'phone_extractor' in globals() and phone_extractor:
            lib.Beatrice20rc0_DestroyPhoneExtractor(phone_extractor)
        print("[+] VST3 native resources destroyed cleanly.")
    except Exception as e:
        print("[-] Error destroying VST3 native resources:", e)
        
    print("[+] Cleanup complete. Exiting process.")
    sys.exit(0)

# Register signal handlers for clean exit
signal.signal(signal.SIGINT, cleanup_and_exit)
signal.signal(signal.SIGTERM, cleanup_and_exit)

def check_parent_alive():
    """
    Monitor whether the parent Electron process is still alive.
    We check if the parent PID is still running using os.kill(pid, 0).
    If it is no longer running (throws OSError), we trigger a clean shutdown.
    On Windows, child processes are automatically cleaned up by OS Job Objects,
    so we can skip this check to avoid platform-specific os.kill issues.
    """
    if sys.platform == 'win32':
        return
    original_ppid = os.getppid()
    while True:
        time.sleep(2)
        try:
            os.kill(original_ppid, 0)
        except OSError:
            print("[-] Parent process (Electron) terminated. Triggering auto-cleanup...")
            cleanup_and_exit()

parent_monitor_thread = threading.Thread(target=check_parent_alive, daemon=True)
parent_monitor_thread.start()

def monitor_worker():
    global monitor_stream
    while True:
        try:
            data = monitor_queue.get()
            if data is None:
                break
            with stream_lock:
                if monitor_stream and not monitor_stream.closed:
                    # Resample data from 16000Hz to native_samplerate of monitor stream if they differ
                    if monitor_stream.samplerate != 16000:
                        num_output = int(round(len(data) * monitor_stream.samplerate / 16000.0))
                        resampled = np.interp(
                            np.linspace(0, len(data), num_output, endpoint=False),
                            np.arange(len(data)),
                            data
                        ).astype(np.float32)
                        monitor_stream.write(resampled)
                    else:
                        monitor_stream.write(data)
        except Exception:
            pass

monitor_thread = threading.Thread(target=monitor_worker, daemon=True)
monitor_thread.start()

# Restart the PortAudio streams dynamically on device change
def restart_audio_streams():
    global stream, monitor_stream
    with stream_lock:
        print("[*] Reconfiguring PortAudio streams...")
        
        # Stop existing main stream
        if stream:
            try:
                stream.stop()
                stream.close()
            except Exception as e:
                print("Error closing main stream:", e)
            stream = None
            
        # Stop existing monitor stream
        if monitor_stream:
            try:
                monitor_stream.stop()
                monitor_stream.close()
            except Exception as e:
                print("Error closing monitor stream:", e)
            monitor_stream = None
            
        # Clear monitor queue
        while not monitor_queue.empty():
            try:
                monitor_queue.get_nowait()
            except queue.Empty:
                break

        try:
            # Query device info
            in_dev = Config.input_device_id
            out_dev = Config.output_device_id
            mon_dev = Config.monitor_device_id
            
            # Start main stream with fallback handling
            try:
                stream = sd.Stream(
                    device=(in_dev, out_dev),
                    samplerate=16000,
                    blocksize=160,
                    channels=1,
                    dtype='float32',
                    callback=audio_callback
                )
            except Exception as first_err:
                print(f"[-] Failed to open main stream with devices Input={in_dev}, Output={out_dev}: {first_err}. Falling back to default system devices.")
                # Reset config to system defaults
                Config.input_device_id = None
                Config.output_device_id = None
                stream = sd.Stream(
                    device=(None, None),
                    samplerate=16000,
                    blocksize=160,
                    channels=1,
                    dtype='float32',
                    callback=audio_callback
                )
            
            stream.start()
            print(f"[+] Active main audio stream: Input={Config.input_device_id if Config.input_device_id is not None else 'Default'}, Output={Config.output_device_id if Config.output_device_id is not None else 'Default'}")
            
            # Start monitor stream if local feedback is enabled
            if Config.hear_yourself:
                try:
                    # Query device default sample rate to prevent "Invalid sample rate" errors
                    if mon_dev is None:
                        info = sd.query_devices(kind='output')
                    else:
                        info = sd.query_devices(mon_dev, 'output')
                    native_samplerate = int(info['default_samplerate'])
                    
                    monitor_stream = sd.OutputStream(
                        device=mon_dev,
                        samplerate=native_samplerate,
                        blocksize=0,
                        channels=1,
                        dtype='float32'
                    )
                    monitor_stream.start()
                    print(f"[+] Active monitor audio stream: Monitor={mon_dev if mon_dev is not None else 'Default'} at {native_samplerate}Hz")
                except Exception as mon_err:
                    print(f"[-] Failed to open monitor stream with device {mon_err}. Falling back to default monitor.")
                    Config.monitor_device_id = None
                    try:
                        info = sd.query_devices(kind='output')
                        native_samplerate = int(info['default_samplerate'])
                        monitor_stream = sd.OutputStream(
                            device=None,
                            samplerate=native_samplerate,
                            blocksize=0,
                            channels=1,
                            dtype='float32'
                        )
                        monitor_stream.start()
                        print(f"[+] Active monitor audio stream: Monitor=Default at {native_samplerate}Hz")
                    except Exception as fallback_err:
                        print("[-] Failed to open default monitor stream:", fallback_err)
        except Exception as e:
            print("[-] PortAudio stream configuration error:", e)

def play_soundboard_audio(file_path, hear_yourself=False):
    """Play an audio file through the selected output device.
    If hear_yourself is True, also plays through the monitor device."""
    global _sb_stop_event
    _sb_stop_event.clear()
    if not HAS_SF:
        return
    try:
        data, samplerate = sf.read(file_path, dtype='float32')
        if data.ndim > 1:
            data = data.mean(axis=1)
        target_sr = 48000
        if samplerate != target_sr:
            duration = len(data) / samplerate
            new_len = int(round(duration * target_sr))
            data = np.interp(
                np.linspace(0, len(data), new_len, endpoint=False),
                np.arange(len(data)),
                data
            ).astype(np.float32)
        peak = float(np.max(np.abs(data)))
        if peak > 0:
            data = data / peak * 0.9

        out_dev = Config.output_device_id
        mon_dev = Config.monitor_device_id
        chunk_size = 4800  # 100ms chunks at 48kHz

        def _play_stream(device, sr, audio_data):
            try:
                with sd.OutputStream(device=device, samplerate=sr, channels=1, dtype='float32') as s:
                    for i in range(0, len(audio_data), chunk_size):
                        if _sb_stop_event.is_set():
                            break
                        s.write(audio_data[i:i+chunk_size])
            except Exception:
                pass

        if hear_yourself:
            try:
                mon_info = sd.query_devices(mon_dev, 'output') if mon_dev else sd.query_devices(kind='output')
                mon_sr = int(mon_info['default_samplerate'])
            except Exception:
                mon_sr = target_sr
            if mon_sr != target_sr:
                new_len = int(round(len(data) * mon_sr / target_sr))
                mon_data = np.interp(
                    np.linspace(0, len(data), new_len, endpoint=False),
                    np.arange(len(data)),
                    data
                ).astype(np.float32)
            else:
                mon_data = data
            t_out = threading.Thread(target=_play_stream, args=(out_dev, target_sr, data), daemon=True)
            t_mon = threading.Thread(target=_play_stream, args=(mon_dev, mon_sr, mon_data), daemon=True)
            t_out.start()
            t_mon.start()
            t_out.join()
            t_mon.join()
        else:
            # Wrap in a thread so the function returns immediately
            # and the HTTP handler is never stalled during playback.
            t_out = threading.Thread(target=_play_stream, args=(out_dev, target_sr, data), daemon=True)
            t_out.start()
    except Exception as e:
        print(f"[-] Soundboard playback error: {e}")
        traceback.print_exc()

_sb_stop_event = threading.Event()

def stop_soundboard_audio():
    _sb_stop_event.set()


class ControlHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress request logging for clean console

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        
        if parsed.path == '/status':
            status = {
                "bypass": Config.bypass,
                "speaker_index": Config.speaker_index,
                "pitch_shift": Config.pitch_shift,
                "formant_shift": Config.formant_shift,
                "volume": Config.volume,
                "gate_threshold": Config.gate_threshold,
                "input_meter": float(Config.input_meter),
                "output_meter": float(Config.output_meter),
                "input_device_id": Config.input_device_id,
                "output_device_id": Config.output_device_id,
                "monitor_device_id": Config.monitor_device_id,
                "hear_yourself": Config.hear_yourself
            }
            self.wfile.write(json.dumps(status).encode())
            
        elif parsed.path == '/devices':
            devices_list = []
            try:
                devs = sd.query_devices()
                for idx, dev in enumerate(devs):
                    devices_list.append({
                        "id": idx,
                        "name": dev["name"],
                        "max_input_channels": dev["max_input_channels"],
                        "max_output_channels": dev["max_output_channels"],
                        "hostapi": dev["hostapi"]
                    })
            except Exception as e:
                print("Error querying devices:", e)
            self.wfile.write(json.dumps(devices_list).encode())
            
        elif parsed.path == '/set_config':
            needs_stream_restart = False
            
            if 'bypass' in query:
                Config.bypass = query['bypass'][0].lower() == 'true'
            if 'speaker_index' in query:
                Config.pending_speaker_index = int(query['speaker_index'][0])
            if 'pitch_shift' in query:
                Config.pitch_shift = float(query['pitch_shift'][0])
            if 'formant_shift' in query:
                Config.pending_formant_shift = float(query['formant_shift'][0])
            if 'volume' in query:
                Config.volume = float(query['volume'][0])
            if 'gate_threshold' in query:
                Config.gate_threshold = float(query['gate_threshold'][0])
                
            # Device Routing updates
            if 'input_device_id' in query:
                val = query['input_device_id'][0]
                new_in = None if val.lower() == 'null' else int(val)
                if new_in != Config.input_device_id:
                    Config.input_device_id = new_in
                    needs_stream_restart = True
            if 'output_device_id' in query:
                val = query['output_device_id'][0]
                new_out = None if val.lower() == 'null' else int(val)
                if new_out != Config.output_device_id:
                    Config.output_device_id = new_out
                    needs_stream_restart = True
            if 'monitor_device_id' in query:
                val = query['monitor_device_id'][0]
                new_mon = None if val.lower() == 'null' else int(val)
                if new_mon != Config.monitor_device_id:
                    Config.monitor_device_id = new_mon
                    needs_stream_restart = True
            if 'hear_yourself' in query:
                new_hy = query['hear_yourself'][0].lower() == 'true'
                if new_hy != Config.hear_yourself:
                    Config.hear_yourself = new_hy
                    needs_stream_restart = True
                    
            if needs_stream_restart:
                threading.Thread(target=restart_audio_streams, daemon=True).start()
                
            self.wfile.write(json.dumps({"status": "success"}).encode())

        elif parsed.path == '/play_sound':
            if not HAS_SF:
                self.wfile.write(json.dumps({"error": "soundfile not installed"}).encode())
                return
            file_path = query.get('file_path', [None])[0]
            hear_yourself = query.get('hear_yourself', ['false'])[0].lower() == 'true'
            if not file_path or not os.path.isfile(file_path):
                self.wfile.write(json.dumps({"error": "File not found"}).encode())
                return
            threading.Thread(
                target=play_soundboard_audio,
                args=(file_path, hear_yourself),
                daemon=True
            ).start()
            self.wfile.write(json.dumps({"status": "playing"}).encode())

        elif parsed.path == '/stop_sound':
            stop_soundboard_audio()
            self.wfile.write(json.dumps({"status": "stopped"}).encode())

def run_http_server():
    server = HTTPServer(('127.0.0.1', 5005), ControlHandler)
    print("[*] Control API Server running at http://127.0.0.1:5005")
    server.serve_forever()

# Setup Beatrice VST3 ctypes wrapper
# Resolve all paths relative to this script's directory so the project
# works on any machine regardless of where it is cloned or extracted.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(_BASE_DIR) == "app.asar.unpacked":
    _BASE_DIR = os.path.dirname(_BASE_DIR)
if sys.platform == 'win32':
    lib_path = os.path.join(
        _BASE_DIR,
        "beatrice_2.0.0-rc.2.vst3", "Contents", "x86_64-win", "beatrice_2.0.0-rc.2.dll"
    )
else:
    lib_path = os.path.join(
        _BASE_DIR,
        "beatrice_2.0.0-rc.2.vst3", "Contents", "MacOS", "beatrice_2.0.0-rc.2.signed"
    )
if not os.path.exists(lib_path):
    print(f"[-] Library not found: {lib_path}")
    sys.exit(1)

lib = ctypes.CDLL(lib_path)
print("[+] Successfully loaded Beatrice VST3 library")

# C API declarations
lib.Beatrice20rc0_CreatePhoneExtractor.restype = ctypes.c_void_p
lib.Beatrice20rc0_ReadPhoneExtractorParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lib.Beatrice20rc0_ReadPhoneExtractorParameters.restype = ctypes.c_int
lib.Beatrice20rc0_CreatePhoneContext1.argtypes = []
lib.Beatrice20rc0_CreatePhoneContext1.restype = ctypes.c_void_p
lib.Beatrice20rc0_DestroyPhoneContext1.argtypes = [ctypes.c_void_p]
lib.Beatrice20rc0_DestroyPhoneExtractor.argtypes = [ctypes.c_void_p]

lib.Beatrice20rc0_CreatePitchEstimator.restype = ctypes.c_void_p
lib.Beatrice20rc0_ReadPitchEstimatorParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lib.Beatrice20rc0_ReadPitchEstimatorParameters.restype = ctypes.c_int
lib.Beatrice20rc0_CreatePitchContext1.argtypes = []
lib.Beatrice20rc0_CreatePitchContext1.restype = ctypes.c_void_p
lib.Beatrice20rc0_DestroyPitchContext1.argtypes = [ctypes.c_void_p]
lib.Beatrice20rc0_DestroyPitchEstimator.argtypes = [ctypes.c_void_p]

lib.Beatrice20rc0_CreateWaveformGenerator.restype = ctypes.c_void_p
lib.Beatrice20rc0_ReadWaveformGeneratorParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lib.Beatrice20rc0_ReadWaveformGeneratorParameters.restype = ctypes.c_int
lib.Beatrice20rc0_CreateWaveformContext1.argtypes = []
lib.Beatrice20rc0_CreateWaveformContext1.restype = ctypes.c_void_p
lib.Beatrice20rc0_DestroyWaveformContext1.argtypes = [ctypes.c_void_p]
lib.Beatrice20rc0_DestroyWaveformGenerator.argtypes = [ctypes.c_void_p]

lib.Beatrice20rc0_CreateEmbeddingSetter.restype = ctypes.c_void_p
lib.Beatrice20rc0_ReadEmbeddingSetterParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lib.Beatrice20rc0_ReadEmbeddingSetterParameters.restype = ctypes.c_int
lib.Beatrice20rc0_CreateEmbeddingContext.argtypes = []
lib.Beatrice20rc0_CreateEmbeddingContext.restype = ctypes.c_void_p
lib.Beatrice20rc0_DestroyEmbeddingContext.argtypes = [ctypes.c_void_p]
lib.Beatrice20rc0_DestroyEmbeddingSetter.argtypes = [ctypes.c_void_p]

# Speaker Embeddings and Setters API
lib.Beatrice20rc0_ReadNSpeakers.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_int)]
lib.Beatrice20rc0_ReadNSpeakers.restype = ctypes.c_int

lib.Beatrice20rc0_ReadSpeakerEmbeddings.argtypes = [
    ctypes.c_char_p,
    ctypes.POINTER(ctypes.c_float),
    ctypes.POINTER(ctypes.c_float),
    ctypes.POINTER(ctypes.c_float),
    ctypes.POINTER(ctypes.c_float)
]
lib.Beatrice20rc0_ReadSpeakerEmbeddings.restype = ctypes.c_int

lib.Beatrice20rc0_SetCodebook.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float)]
lib.Beatrice20rc0_SetCodebook.restype = None

lib.Beatrice20rc0_SetAdditiveSpeakerEmbedding.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_void_p, ctypes.c_void_p]
lib.Beatrice20rc0_SetAdditiveSpeakerEmbedding.restype = None

lib.Beatrice20rc0_RegisterKeyValueSpeakerEmbedding.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_void_p]
lib.Beatrice20rc0_RegisterKeyValueSpeakerEmbedding.restype = None

lib.Beatrice20rc0_SetKeyValueSpeakerEmbedding.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p]
lib.Beatrice20rc0_SetKeyValueSpeakerEmbedding.restype = None

lib.Beatrice20rc0_SetFormantShiftEmbedding.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_void_p, ctypes.c_void_p]
lib.Beatrice20rc0_SetFormantShiftEmbedding.restype = None

# DSP bindings
lib.Beatrice20rc0_ExtractPhone1.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float), ctypes.c_void_p]
lib.Beatrice20rc0_ExtractPhone1.restype = None

lib.Beatrice20rc0_EstimatePitch1.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_float), ctypes.c_void_p]
lib.Beatrice20rc0_EstimatePitch1.restype = None

lib.Beatrice20rc0_GenerateWaveform1.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float), ctypes.c_void_p]
lib.Beatrice20rc0_GenerateWaveform1.restype = None

# Load weights and contexts
paraphernalia_dir = os.path.join(_BASE_DIR, "beatrice_paraphernalia_jvs")
phone_bin = f"{paraphernalia_dir}/phone_extractor.bin".encode()
pitch_bin = f"{paraphernalia_dir}/pitch_estimator.bin".encode()
waveform_bin = f"{paraphernalia_dir}/waveform_generator.bin".encode()
embedding_bin = f"{paraphernalia_dir}/embedding_setter.bin".encode()
speaker_bin = f"{paraphernalia_dir}/speaker_embeddings.bin".encode()

print("[*] Initializing Beatrice DSP models...")
phone_extractor = lib.Beatrice20rc0_CreatePhoneExtractor()
lib.Beatrice20rc0_ReadPhoneExtractorParameters(phone_extractor, phone_bin)
phone_context = lib.Beatrice20rc0_CreatePhoneContext1()

pitch_estimator = lib.Beatrice20rc0_CreatePitchEstimator()
lib.Beatrice20rc0_ReadPitchEstimatorParameters(pitch_estimator, pitch_bin)
pitch_context = lib.Beatrice20rc0_CreatePitchContext1()

waveform_generator = lib.Beatrice20rc0_CreateWaveformGenerator()
lib.Beatrice20rc0_ReadWaveformGeneratorParameters(waveform_generator, waveform_bin)
waveform_context = lib.Beatrice20rc0_CreateWaveformContext1()

embedding_setter = lib.Beatrice20rc0_CreateEmbeddingSetter()
lib.Beatrice20rc0_ReadEmbeddingSetterParameters(embedding_setter, embedding_bin)

# Load dynamic speaker embeddings from binary
# Dynamically read how many speaker embeddings are present in the binary.
# The file ships with 100 JVS voices (indices 0–99) plus 1 neutral embedding
# at index 100, giving n_speakers = 101 total slots in the array layout.
# We read this value from the binary itself rather than hard-coding it.
_n_spk_val = ctypes.c_int(0)
lib.Beatrice20rc0_ReadNSpeakers(speaker_bin, ctypes.byref(_n_spk_val))
n_speakers = _n_spk_val.value if _n_spk_val.value > 0 else 101
print(f"[*] Speaker count from binary: {n_speakers}")
codebooks = (ctypes.c_float * (n_speakers * 512 * 128))()
additive_embeddings = (ctypes.c_float * (n_speakers * 256))()
formant_shift_embeddings = (ctypes.c_float * (9 * 256))()
kv_embeddings = (ctypes.c_float * (n_speakers * 384 * 128))()

print("[*] Loading speaker embeddings library...")
lib.Beatrice20rc0_ReadSpeakerEmbeddings(
    speaker_bin,
    ctypes.cast(codebooks, ctypes.POINTER(ctypes.c_float)),
    ctypes.cast(additive_embeddings, ctypes.POINTER(ctypes.c_float)),
    ctypes.cast(formant_shift_embeddings, ctypes.POINTER(ctypes.c_float)),
    ctypes.cast(kv_embeddings, ctypes.POINTER(ctypes.c_float))
)

embedding_context = lib.Beatrice20rc0_CreateEmbeddingContext()

# Helper functions to update target speaker index and formant shift coefficients
def update_target_speaker(speaker_id):
    if speaker_id < 0 or speaker_id >= n_speakers:
        return
    try:
        # 1. Set Codebook
        codebook_offset = speaker_id * (512 * 128)
        codebook_ptr = ctypes.cast(ctypes.byref(codebooks, codebook_offset * ctypes.sizeof(ctypes.c_float)), ctypes.POINTER(ctypes.c_float))
        lib.Beatrice20rc0_SetCodebook(phone_context, codebook_ptr)
        
        # 2. Set Additive Speaker Embedding
        additive_offset = speaker_id * 256
        additive_ptr = ctypes.cast(ctypes.byref(additive_embeddings, additive_offset * ctypes.sizeof(ctypes.c_float)), ctypes.POINTER(ctypes.c_float))
        lib.Beatrice20rc0_SetAdditiveSpeakerEmbedding(
            embedding_setter, additive_ptr, embedding_context, waveform_context
        )
        
        # 3. Register Key-Value Speaker Embedding
        kv_offset = speaker_id * (384 * 128)
        kv_ptr = ctypes.cast(ctypes.byref(kv_embeddings, kv_offset * ctypes.sizeof(ctypes.c_float)), ctypes.POINTER(ctypes.c_float))
        lib.Beatrice20rc0_RegisterKeyValueSpeakerEmbedding(
            embedding_setter, kv_ptr, embedding_context
        )
        
        # 4. Set Key-Value Speaker Embedding (4 blocks loop)
        for block in range(4):
            lib.Beatrice20rc0_SetKeyValueSpeakerEmbedding(
                embedding_setter, block, embedding_context, waveform_context
            )
        print(f"[+] Successfully switched target speaker to index: {speaker_id}")
    except Exception as e:
        print("Error in update_target_speaker:", e)

def update_formant_shift(formant_shift_val):
    try:
        # Map formant shift in [-2.0, 2.0] to index [0, 8]
        idx = int(round(formant_shift_val * 2.0 + 4.0))
        idx = max(0, min(8, idx))
        
        # Set Formant Shift Embedding
        formant_offset = idx * 256
        formant_ptr = ctypes.cast(ctypes.byref(formant_shift_embeddings, formant_offset * ctypes.sizeof(ctypes.c_float)), ctypes.POINTER(ctypes.c_float))
        lib.Beatrice20rc0_SetFormantShiftEmbedding(
            embedding_setter, formant_ptr, embedding_context, waveform_context
        )
    except Exception as e:
        print("Error in update_formant_shift:", e)

# Apply default speaker index and formant shift 0.0 on startup
if Config.speaker_index >= 0:
    update_target_speaker(Config.speaker_index)
update_formant_shift(Config.formant_shift)

# Mark DSP as fully ready — the audio callback checks this flag before
# engaging the DSP pipeline, so we never run the C models with uninitialised state.
Config.dsp_ready = True
print("[+] Beatrice DSP engine successfully initialized. Voice conversion is ACTIVE.")

# Persistent ctypes buffers for thread-safe real-time DSP execution to prevent real-time allocation overhead
class DSPBuffers:
    phone_features = (ctypes.c_float * 128)()
    pitch_features = (ctypes.c_float * 4)()
    out_samples   = (ctypes.c_float * 240)()

# Background speaker-update worker so the audio callback is never blocked by
# heavy C library calls (SetCodebook etc.).  The callback sets pending_speaker_index;
# this thread picks it up and applies it outside the real-time path.
_speaker_update_queue = queue.Queue(maxsize=4)

def _speaker_update_worker():
    while True:
        try:
            idx = _speaker_update_queue.get()
            if idx is None:
                break
            update_target_speaker(idx)
        except Exception as ex:
            print(f'[Beatrice] Speaker update worker error: {ex}')

_speaker_update_thread = threading.Thread(target=_speaker_update_worker, daemon=True)
_speaker_update_thread.start()

# Real-time audio stream callback
def audio_callback(indata, outdata, frames, time_info, status):
    # Input volume meter
    in_samples = indata[:, 0]
    Config.input_meter = float(np.max(np.abs(in_samples)))

    # --- Dispatch pending speaker index to the background worker ---
    # We do NOT call update_target_speaker() directly here; that involves
    # multiple heavy C library calls and will cause callback overruns.
    if Config.pending_speaker_index is not None:
        try:
            _speaker_update_queue.put_nowait(Config.pending_speaker_index)
        except queue.Full:
            pass  # Drop if update queue is saturated; next change will catch it
        Config.speaker_index = Config.pending_speaker_index
        Config.pending_speaker_index = None

    # --- Formant shift can be updated safely here (single C call) ---
    if Config.pending_formant_shift is not None:
        Config.formant_shift = Config.pending_formant_shift
        try:
            update_formant_shift(Config.formant_shift)
        except Exception:
            pass
        Config.pending_formant_shift = None

    # --- Bypass: pass mic audio through unchanged ---
    if Config.bypass or not Config.dsp_ready:
        Config.output_meter = float(Config.input_meter * Config.volume)
        if Config.hear_yourself:
            out_numpy = in_samples * Config.volume
            outdata[:, 0] = out_numpy
            try:
                monitor_queue.put_nowait(out_numpy.copy())
            except queue.Full:
                pass
        else:
            outdata[:, 0] = 0.0
        return

    # --- Noise gate ---
    if Config.input_meter < Config.gate_threshold:
        outdata[:, 0] = 0.0
        Config.output_meter = 0.0
        return

    # --- DSP pipeline ---
    try:
        in_samples_c = np.ascontiguousarray(in_samples, dtype=np.float32)
        input_ptr = in_samples_c.ctypes.data_as(ctypes.POINTER(ctypes.c_float))

        # 1. Phone feature extraction (128 floats)
        lib.Beatrice20rc0_ExtractPhone1(
            phone_extractor, input_ptr, DSPBuffers.phone_features, phone_context
        )

        # 2. Pitch estimation (1 int bin + 4 pitch floats)
        pitch_bin_val = ctypes.c_int(0)
        lib.Beatrice20rc0_EstimatePitch1(
            pitch_estimator, input_ptr,
            ctypes.byref(pitch_bin_val), DSPBuffers.pitch_features, pitch_context
        )

        # Optional pitch shift
        if Config.pitch_shift != 0.0:
            shift_factor = 2.0 ** (Config.pitch_shift / 12.0)
            shifted = int(round(pitch_bin_val.value * shift_factor))
            pitch_bin_val.value = max(0, min(1000, shifted))

        # 3. Waveform synthesis (240 floats @ 24 kHz)
        lib.Beatrice20rc0_GenerateWaveform1(
            waveform_generator,
            DSPBuffers.phone_features,
            ctypes.byref(pitch_bin_val),
            DSPBuffers.pitch_features,
            DSPBuffers.out_samples,
            waveform_context
        )

        # Read synthesised output — .copy() is critical: np.frombuffer gives a
        # read-only view into the ctypes buffer; without copy() the interp below
        # can reference stale data if the buffer is reused before numpy is done.
        out_24k = np.frombuffer(DSPBuffers.out_samples, dtype=np.float32).copy()

        # Downsample 24 kHz (240 spl) → 16 kHz (160 spl) with linear interpolation
        out_numpy = np.interp(
            np.linspace(0, 240, 160, endpoint=False),
            np.arange(240),
            out_24k
        ).astype(np.float32) * Config.volume

        outdata[:, 0] = out_numpy
        Config.output_meter = float(np.max(np.abs(out_numpy)))

        if Config.hear_yourself:
            try:
                monitor_queue.put_nowait(out_numpy.copy())
            except queue.Full:
                pass

    except Exception as exc:
        # Log the real reason for the fallback — this helps diagnose model issues
        import traceback
        print(f'[Beatrice] DSP callback exception (falling back to passthrough): {exc}')
        traceback.print_exc()
        fallback = in_samples * Config.volume
        if Config.hear_yourself:
            outdata[:, 0] = fallback
        else:
            outdata[:, 0] = 0.0
        Config.output_meter = float(Config.input_meter * Config.volume)

# Launch HTTP service
http_thread = threading.Thread(target=run_http_server, daemon=True)
http_thread.start()

# Load default streams on start
restart_audio_streams()

# Block and run forever
threading.Event().wait()
