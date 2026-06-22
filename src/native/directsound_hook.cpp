#include <windows.h>
#include <dsound.h>
#include <minhook.h>
#include <cstring>
#include <queue>
#include <mutex>

#pragma comment(lib, "dsound.lib")
#pragma comment(lib, "dxguid.lib")
#pragma comment(lib, "winmm.lib")

// Constants
const int AUDIO_BUFFER_SIZE = 4096;
const int MAX_QUEUED_BUFFERS = 10;

// Audio data structure
struct AudioFrame {
  float samples[AUDIO_BUFFER_SIZE];
  int sampleCount;
  int sampleRate;
};

// Global state
static std::queue<AudioFrame> audioQueue;
static std::mutex audioQueueMutex;
static bool hookEnabled = false;

// Original DirectSound8 pointer (for calling original function)
typedef HRESULT(STDMETHODCALLTYPE* CreateSoundBuffer_t)(
  IDirectSound8* pThis,
  const DSBUFFERDESC* pcDSBufferDesc,
  IDirectSoundBuffer** ppDSBuffer,
  IUnknown* pUnkOuter
);

static CreateSoundBuffer_t originalCreateSoundBuffer = nullptr;

// Hook function
HRESULT STDMETHODCALLTYPE hooked_CreateSoundBuffer(
  IDirectSound8* pThis,
  const DSBUFFERDESC* pcDSBufferDesc,
  IDirectSoundBuffer** ppDSBuffer,
  IUnknown* pUnkOuter
) {
  // Call original
  HRESULT hr = originalCreateSoundBuffer(pThis, pcDSBufferDesc, ppDSBuffer, pUnkOuter);
  
  if (SUCCEEDED(hr) && hookEnabled) {
    // TODO: Wrap the buffer to intercept audio data
    // For now, just track that a buffer was created
    OutputDebugString(L"DirectSound buffer created\n");
  }
  
  return hr;
}

// Initialize Hook
extern "C" __declspec(dllexport) int Initialize() {
  if (MH_Initialize() != MH_OK) {
    OutputDebugString(L"Failed to initialize MinHook\n");
    return -1;
  }

  // Get DirectSound8 interface
  // TODO: Hook DirectSound8::CreateSoundBuffer
  // This requires finding the vtable offset and patching it

  hookEnabled = true;
  return 0;
}

// Shutdown Hook
extern "C" __declspec(dllexport) int Shutdown() {
  hookEnabled = false;
  
  if (MH_DisableHook(MH_ALL_HOOKS) != MH_OK) {
    OutputDebugString(L"Failed to disable hooks\n");
    return -1;
  }

  if (MH_Uninitialize() != MH_OK) {
    OutputDebugString(L"Failed to uninitialize MinHook\n");
    return -1;
  }

  return 0;
}

// Get audio data
extern "C" __declspec(dllexport) int GetAudioFrame(float* buffer, int* sampleCount, int bufferSize) {
  std::lock_guard<std::mutex> lock(audioQueueMutex);

  if (audioQueue.empty()) {
    *sampleCount = 0;
    return 0;
  }

  AudioFrame frame = audioQueue.front();
  audioQueue.pop();

  int copySize = (frame.sampleCount < bufferSize) ? frame.sampleCount : bufferSize;
  std::memcpy(buffer, frame.samples, copySize * sizeof(float));
  *sampleCount = copySize;

  return 1;
}

// Get queue status
extern "C" __declspec(dllexport) int GetQueueSize() {
  std::lock_guard<std::mutex> lock(audioQueueMutex);
  return audioQueue.size();
}

// DLL entry point
BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
  switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
      // Initialize on attach
      break;
    case DLL_PROCESS_DETACH:
      // Cleanup on detach
      Shutdown();
      break;
  }
  return TRUE;
}
