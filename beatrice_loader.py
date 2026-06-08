import os
import ctypes

class BeatriceModel:
    def __init__(self, lib_path, paraphernalia_dir):
        self.lib_path = os.path.abspath(lib_path)
        self.paraphernalia_dir = os.path.abspath(paraphernalia_dir)
        
        # Load the dynamic library
        self.lib = ctypes.CDLL(self.lib_path)
        self._setup_signatures()
        
    def _setup_signatures(self):
        # 1. Speaker Embeddings utility
        self.lib.Beatrice20rc0_ReadNSpeakers.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_int)]
        self.lib.Beatrice20rc0_ReadNSpeakers.restype = ctypes.c_int
        
        # 2. Phone Extractor
        self.lib.Beatrice20rc0_CreatePhoneExtractor.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_ReadPhoneExtractorParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.lib.Beatrice20rc0_ReadPhoneExtractorParameters.restype = ctypes.c_int
        self.lib.Beatrice20rc0_DestroyPhoneExtractor.argtypes = [ctypes.c_void_p]
        
        self.lib.Beatrice20rc0_CreatePhoneContext1.argtypes = []
        self.lib.Beatrice20rc0_CreatePhoneContext1.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_DestroyPhoneContext1.argtypes = [ctypes.c_void_p]
        
        # 3. Pitch Estimator
        self.lib.Beatrice20rc0_CreatePitchEstimator.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_ReadPitchEstimatorParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.lib.Beatrice20rc0_ReadPitchEstimatorParameters.restype = ctypes.c_int
        self.lib.Beatrice20rc0_DestroyPitchEstimator.argtypes = [ctypes.c_void_p]
        
        self.lib.Beatrice20rc0_CreatePitchContext1.argtypes = []
        self.lib.Beatrice20rc0_CreatePitchContext1.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_DestroyPitchContext1.argtypes = [ctypes.c_void_p]
        
        # 4. Waveform Generator
        self.lib.Beatrice20rc0_CreateWaveformGenerator.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_ReadWaveformGeneratorParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.lib.Beatrice20rc0_ReadWaveformGeneratorParameters.restype = ctypes.c_int
        self.lib.Beatrice20rc0_DestroyWaveformGenerator.argtypes = [ctypes.c_void_p]
        
        self.lib.Beatrice20rc0_CreateWaveformContext1.argtypes = []
        self.lib.Beatrice20rc0_CreateWaveformContext1.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_DestroyWaveformContext1.argtypes = [ctypes.c_void_p]
        
        # 5. Embedding Setter
        self.lib.Beatrice20rc0_CreateEmbeddingSetter.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_ReadEmbeddingSetterParameters.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.lib.Beatrice20rc0_ReadEmbeddingSetterParameters.restype = ctypes.c_int
        self.lib.Beatrice20rc0_ReadSpeakerEmbeddings.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.lib.Beatrice20rc0_ReadSpeakerEmbeddings.restype = ctypes.c_int
        self.lib.Beatrice20rc0_DestroyEmbeddingSetter.argtypes = [ctypes.c_void_p]
        
        self.lib.Beatrice20rc0_CreateEmbeddingContext.argtypes = []
        self.lib.Beatrice20rc0_CreateEmbeddingContext.restype = ctypes.c_void_p
        self.lib.Beatrice20rc0_DestroyEmbeddingContext.argtypes = [ctypes.c_void_p]

    def read_num_speakers(self):
        speakers_path = os.path.join(self.paraphernalia_dir, "speaker_embeddings.bin")
        out_val = ctypes.c_int(0)
        res = self.lib.Beatrice20rc0_ReadNSpeakers(speakers_path.encode(), ctypes.byref(out_val))
        if res != 0:
            raise RuntimeError(f"Failed to read speaker embeddings. Return code: {res}")
        return out_val.value

    def load_and_test_components(self):
        print("[*] Instantiating and loading parameters for Beatrice components...")
        
        # Paths
        phone_bin = os.path.join(self.paraphernalia_dir, "phone_extractor.bin").encode()
        pitch_bin = os.path.join(self.paraphernalia_dir, "pitch_estimator.bin").encode()
        waveform_bin = os.path.join(self.paraphernalia_dir, "waveform_generator.bin").encode()
        embedding_bin = os.path.join(self.paraphernalia_dir, "embedding_setter.bin").encode()
        speaker_bin = os.path.join(self.paraphernalia_dir, "speaker_embeddings.bin").encode()

        # 1. Phone Extractor
        phone_extractor = self.lib.Beatrice20rc0_CreatePhoneExtractor()
        if not phone_extractor:
            raise RuntimeError("Failed to create Phone Extractor")
        res = self.lib.Beatrice20rc0_ReadPhoneExtractorParameters(phone_extractor, phone_bin)
        print(f" -> Phone Extractor loaded from {os.path.basename(phone_bin.decode())} (status: {res})")
        
        phone_context = self.lib.Beatrice20rc0_CreatePhoneContext1(phone_extractor)
        print(f" -> Created Phone Context at: {hex(phone_context)}")
        
        # 2. Pitch Estimator
        pitch_estimator = self.lib.Beatrice20rc0_CreatePitchEstimator()
        if not pitch_estimator:
            raise RuntimeError("Failed to create Pitch Estimator")
        res = self.lib.Beatrice20rc0_ReadPitchEstimatorParameters(pitch_estimator, pitch_bin)
        print(f" -> Pitch Estimator loaded from {os.path.basename(pitch_bin.decode())} (status: {res})")
        
        pitch_context = self.lib.Beatrice20rc0_CreatePitchContext1(pitch_estimator)
        print(f" -> Created Pitch Context at: {hex(pitch_context)}")
        
        # 3. Waveform Generator
        waveform_generator = self.lib.Beatrice20rc0_CreateWaveformGenerator()
        if not waveform_generator:
            raise RuntimeError("Failed to create Waveform Generator")
        res = self.lib.Beatrice20rc0_ReadWaveformGeneratorParameters(waveform_generator, waveform_bin)
        print(f" -> Waveform Generator loaded from {os.path.basename(waveform_bin.decode())} (status: {res})")
        
        waveform_context = self.lib.Beatrice20rc0_CreateWaveformContext1(waveform_generator)
        print(f" -> Created Waveform Context at: {hex(waveform_context)}")
        
        # 4. Embedding Setter
        embedding_setter = self.lib.Beatrice20rc0_CreateEmbeddingSetter()
        if not embedding_setter:
            raise RuntimeError("Failed to create Embedding Setter")
        res = self.lib.Beatrice20rc0_ReadEmbeddingSetterParameters(embedding_setter, embedding_bin)
        print(f" -> Embedding Setter loaded from {os.path.basename(embedding_bin.decode())} (status: {res})")
        
        res_speakers = self.lib.Beatrice20rc0_ReadSpeakerEmbeddings(embedding_setter, speaker_bin)
        print(f" -> Speaker Embeddings loaded from {os.path.basename(speaker_bin.decode())} (status: {res_speakers})")
        
        embedding_context = self.lib.Beatrice20rc0_CreateEmbeddingContext(embedding_setter)
        print(f" -> Created Embedding Context at: {hex(embedding_context)}")
        
        # Safely cleanup contexts
        print("[*] Cleaning up contexts...")
        self.lib.Beatrice20rc0_DestroyPhoneContext1(phone_context)
        self.lib.Beatrice20rc0_DestroyPitchContext1(pitch_context)
        self.lib.Beatrice20rc0_DestroyWaveformContext1(waveform_context)
        self.lib.Beatrice20rc0_DestroyEmbeddingContext(embedding_context)
        
        # Safely cleanup parent components
        print("[*] Cleaning up parent components...")
        self.lib.Beatrice20rc0_DestroyPhoneExtractor(phone_extractor)
        self.lib.Beatrice20rc0_DestroyPitchEstimator(pitch_estimator)
        self.lib.Beatrice20rc0_DestroyWaveformGenerator(waveform_generator)
        self.lib.Beatrice20rc0_DestroyEmbeddingSetter(embedding_setter)
        print("[+] All components successfully tested and released.")

if __name__ == "__main__":
    _here = os.path.dirname(os.path.abspath(__file__))
    lib = os.path.join(_here, "beatrice_2.0.0-rc.2.vst3", "Contents", "MacOS", "beatrice_2.0.0-rc.2.signed")
    paraphernalia = os.path.join(_here, "beatrice_paraphernalia_jvs")
    
    print("=== Project Beatrice Model Loader ===")
    model = BeatriceModel(lib, paraphernalia)
    
    num_speakers = model.read_num_speakers()
    print(f"[*] Total speakers in model: {num_speakers}")
    
    model.load_and_test_components()
