// miniaudio 输出层：统一驱动 DualSense 喇叭(ch2)和触觉音圈(ch3/ch4)。
// DualSenseY 的稳定做法是由 playback callback 连续拉取音频，而不是手写 WASAPI event loop。
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propvarutil.h>
#include <atomic>
#include <math.h>
#include <share.h>
#include <stdio.h>
#include <string.h>

#include "haptic_out.h"
#include "miniaudio.h"

static volatile bool g_started = false;
static FILE* g_hlog = nullptr;
static ma_context g_maContext{};
static ma_device g_maDevice{};
static ma_device_id g_targetDeviceId{};
static bool g_maContextReady = false;
static bool g_maDeviceReady = false;
static bool g_isCable = false;

static const double PI = 3.14159265358979;
static const float HAP_GAIN  = 1.6f;
static const float HAP_LP_HZ = 1200.0f;
static float g_lpL = 0.0f, g_lpR = 0.0f;
static std::atomic<unsigned> g_cbCount{0};
static std::atomic<unsigned> g_cbGot{0};

static void hlog(const char* fmt, ...) {
    if (!g_hlog) return;
    va_list a; va_start(a, fmt); vfprintf(g_hlog, fmt, a); va_end(a);
    fputc('\n', g_hlog); fflush(g_hlog);
}

static void get_target(char* out, int cap) {
    strncpy_s(out, cap, "DualSense", _TRUNCATE);
    char path[MAX_PATH]; char* up = nullptr; size_t n = 0;
    if (_dupenv_s(&up, &n, "USERPROFILE") == 0 && up) {
        _snprintf_s(path, sizeof(path), _TRUNCATE, "%s\\Desktop\\haptic_target.txt", up); free(up);
        FILE* f = nullptr; fopen_s(&f, path, "r");
        if (f) {
            char b[512] = "";
            if (fgets(b, sizeof(b), f)) {
                int s = 0; while (b[s] == ' ' || b[s] == '\t') s++;
                int e = (int)strlen(b); while (e > s && (b[e - 1] == '\n' || b[e - 1] == '\r' || b[e - 1] == ' ' || b[e - 1] == '\t')) e--;
                b[e] = 0; if (e > s) strncpy_s(out, cap, b + s, _TRUNCATE);
            }
            fclose(f);
        }
    }
}

static bool contains_ci(const char* text, const char* needle) {
    if (!text || !needle || !needle[0]) return true;
    size_t n = strlen(needle);
    for (const char* p = text; *p; ++p) {
        size_t i = 0;
        for (; i < n; ++i) {
            char a = p[i], b = needle[i];
            if (!a) return false;
            if (a >= 'A' && a <= 'Z') a = (char)(a - 'A' + 'a');
            if (b >= 'A' && b <= 'Z') b = (char)(b - 'A' + 'a');
            if (a != b) break;
        }
        if (i == n) return true;
    }
    return false;
}

static bool ids_equal_wasapi(const wchar_t* wasapiId, const char* targetIdUtf8) {
    if (!wasapiId || !targetIdUtf8 || targetIdUtf8[0] != '{') return false;
    wchar_t target[512];
    MultiByteToWideChar(CP_UTF8, 0, targetIdUtf8, -1, target, 512);
    return wcscmp(wasapiId, target) == 0;
}

static bool find_target_device(ma_context* context, ma_device_id* outId, bool* outIsCable) {
    char target[512]; get_target(target, sizeof(target));
    *outIsCable = contains_ci(target, "CABLE");
    hlog("target = \"%s\"", target);

    ma_device_info* playbackInfos = nullptr;
    ma_uint32 playbackCount = 0;
    ma_result r = ma_context_get_devices(context, &playbackInfos, &playbackCount, nullptr, nullptr);
    if (r != MA_SUCCESS) { hlog("ma_context_get_devices failed: %d", (int)r); return false; }

    for (ma_uint32 i = 0; i < playbackCount; ++i) {
        const char* name = playbackInfos[i].name ? playbackInfos[i].name : "";
        hlog("device[%u]: %s", i, name);
        if (target[0] == '{') {
            if (ids_equal_wasapi(playbackInfos[i].id.wasapi, target)) {
                *outId = playbackInfos[i].id;
                hlog("selected by WASAPI id: %s", name);
                return true;
            }
        } else if (contains_ci(name, target)) {
            *outId = playbackInfos[i].id;
            hlog("selected by name: %s", name);
            return true;
        }
    }
    hlog("target device not found");
    return false;
}

static void data_callback(ma_device* device, void* output, const void*, ma_uint32 frameCount) {
    float* out = (float*)output;
    if (!out) return;
    const ma_uint32 channels = device->playback.channels;
    static float spkL[8192], spkR[8192], hapL[8192], hapR[8192];
    ma_uint32 offset = 0;
    while (offset < frameCount) {
        ma_uint32 chunk = frameCount - offset;
        if (chunk > 8192) chunk = 8192;
        int got = haptic_pull_audio(spkL, spkR, hapL, hapR, (int)chunk);
        g_cbCount.fetch_add(1, std::memory_order_relaxed);
        if (got) g_cbGot.fetch_add(1, std::memory_order_relaxed);
        unsigned cb = g_cbCount.load(std::memory_order_relaxed);
        if (cb % 500 == 499) {
            hlog("MA diag: callbacks=%u got=%u frameCount=%u channels=%u", cb,
                 g_cbGot.exchange(0, std::memory_order_relaxed), frameCount, channels);
        }
        float lpK = (HAP_LP_HZ > 0) ? (1.0f - expf(-2.0f * (float)PI * HAP_LP_HZ / (float)device->sampleRate)) : 1.0f;
        for (ma_uint32 i = 0; i < chunk; ++i) {
            float speaker = got ? spkL[i] : 0.0f;
            if (speaker > 1.0f) speaker = 1.0f;
            if (speaker < -1.0f) speaker = -1.0f;
            float xL = got ? hapL[i] : 0.0f;
            float xR = got ? hapR[i] : 0.0f;
            g_lpL += (xL - g_lpL) * lpK;
            g_lpR += (xR - g_lpR) * lpK;
            float yL = g_lpL * HAP_GAIN; if (yL > 1.0f) yL = 1.0f; if (yL < -1.0f) yL = -1.0f;
            float yR = g_lpR * HAP_GAIN; if (yR > 1.0f) yR = 1.0f; if (yR < -1.0f) yR = -1.0f;
            for (ma_uint32 c = 0; c < channels; ++c) {
                float s = 0.0f;
                if (channels >= 4 && !g_isCable) {
                    if (c == 0) s = 0.0f;
                    else if (c == 1) s = speaker;
                    else if (c == 2) s = yL;
                    else if (c == 3) s = yR;
                } else {
                    s = (c == 0) ? yL : yR;
                }
                out[(offset + i) * channels + c] = s;
            }
        }
        offset += chunk;
    }
}

static DWORD WINAPI render_thread(LPVOID) {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);

    ma_backend backends[] = { ma_backend_wasapi };
    ma_result r = ma_context_init(backends, 1, nullptr, &g_maContext);
    if (r != MA_SUCCESS) { hlog("ma_context_init failed: %d", (int)r); CoUninitialize(); return 1; }
    g_maContextReady = true;

    bool isCable = false;
    for (int t = 0; t < 600; ++t) {
        if (find_target_device(&g_maContext, &g_targetDeviceId, &isCable)) break;
        Sleep(100);
    }
    g_isCable = isCable;

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.pDeviceID = &g_targetDeviceId;
    config.playback.format = ma_format_f32;
    config.playback.channels = isCable ? 2 : 4;
    config.sampleRate = 48000;
    config.dataCallback = data_callback;
    config.periodSizeInFrames = 128;
    config.periods = 2;
    r = ma_device_init(&g_maContext, &config, &g_maDevice);
    if (r != MA_SUCCESS) { hlog("ma_device_init failed: %d", (int)r); ma_context_uninit(&g_maContext); CoUninitialize(); return 1; }
    g_maDeviceReady = true;
    hlog("miniaudio started init: channels=%u sampleRate=%u cable=%d", g_maDevice.playback.channels, g_maDevice.sampleRate, g_isCable ? 1 : 0);

    r = ma_device_start(&g_maDevice);
    if (r != MA_SUCCESS) { hlog("ma_device_start failed: %d", (int)r); return 1; }
    hlog("miniaudio playback started");

    while (g_started) Sleep(100);

    ma_device_uninit(&g_maDevice);
    ma_context_uninit(&g_maContext);
    g_maDeviceReady = false;
    g_maContextReady = false;
    CoUninitialize();
    return 0;
}

extern "C" void haptic_out_start() {
    if (g_started) return;
    g_started = true;
    char path[MAX_PATH] = "haptic_out_log.txt"; char* up = nullptr; size_t n = 0;
    if (_dupenv_s(&up, &n, "TEMP") == 0 && up) { _snprintf_s(path, sizeof(path), _TRUNCATE, "%s\\haptic_out_log.txt", up); free(up); }
    g_hlog = _fsopen(path, "w", _SH_DENYNO); hlog("=== haptic_out miniaudio start ===");
    CreateThread(nullptr, 0, render_thread, nullptr, 0, nullptr);
}