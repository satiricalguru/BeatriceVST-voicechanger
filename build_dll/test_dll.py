import ctypes
import os

dll_path = os.path.abspath("beatrice_2.0.0-rc.2.dll")
print(f"Loading DLL from {dll_path}...")
try:
    lib = ctypes.CDLL(dll_path)
    print("DLL loaded successfully!")
    
    # Try getting address of a function
    func = lib.Beatrice20rc0_CreatePhoneExtractor
    print(f"Beatrice20rc0_CreatePhoneExtractor address: {func}")
    
    print("[+] Verification SUCCESS! DLL is ready and exports the symbols.")
except Exception as e:
    print(f"[-] Verification FAILED: {e}")
