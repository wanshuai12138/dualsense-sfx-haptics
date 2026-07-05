// Play a 16-bit PCM WAV through the DualSense controller speaker path.
// Usage: ds_speaker_wav <file.wav> [gain=0.12] [repeats=3] [target=DualSense]
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include "miniaudio.h"

struct Clip {
    std::vector<float> left;
    std::vector<float> right;
    int sampleRate = 48000;
};

struct PlaybackState {
    Clip clip;
    double pos = 0.0;
    double step = 1.0;
    float gain = 0.12f;
    int repeats = 3;
    int played = 0;
    int gapFrames = 4800;
    int gapRemaining = 0;
    std::atomic<bool> done{false};
};

static unsigned read_u32(const unsigned char* p) {
    return (unsigned)p[0] | ((unsigned)p[1] << 8) | ((unsigned)p[2] << 16) | ((unsigned)p[3] << 24);
}

static unsigned short read_u16(const unsigned char* p) {
    return (unsigned short)((unsigned)p[0] | ((unsigned)p[1] << 8));
}

static bool load_wav_16(const char* path, Clip& clip) {
    FILE* file = nullptr;
    fopen_s(&file, path, "rb");
    if (!file) return false;
    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);
    if (size < 44) { fclose(file); return false; }
    std::vector<unsigned char> bytes((size_t)size);
    fread(bytes.data(), 1, bytes.size(), file);
    fclose(file);

    if (memcmp(bytes.data(), "RIFF", 4) != 0 || memcmp(bytes.data() + 8, "WAVE", 4) != 0) return false;
    int channels = 0;
    int sampleRate = 0;
    int bits = 0;
    unsigned dataOffset = 0;
    unsigned dataBytes = 0;
    for (unsigned pos = 12; pos + 8 <= bytes.size();) {
        const unsigned char* chunk = bytes.data() + pos;
        unsigned len = read_u32(chunk + 4);
        if (pos + 8 + len > bytes.size()) break;
        if (memcmp(chunk, "fmt ", 4) == 0 && len >= 16) {
            unsigned short format = read_u16(chunk + 8);
            channels = (int)read_u16(chunk + 10);
            sampleRate = (int)read_u32(chunk + 12);
            bits = (int)read_u16(chunk + 22);
            if (format != 1) return false;
        } else if (memcmp(chunk, "data", 4) == 0) {
            dataOffset = pos + 8;
            dataBytes = len;
        }
        pos += 8 + len + (len & 1);
    }
    if (channels < 1 || channels > 8 || sampleRate <= 0 || bits != 16 || dataOffset == 0 || dataBytes == 0) return false;

    unsigned frames = dataBytes / (unsigned)(channels * 2);
    clip.left.resize(frames);
    clip.right.resize(frames);
    clip.sampleRate = sampleRate;
    const unsigned char* data = bytes.data() + dataOffset;
    for (unsigned i = 0; i < frames; ++i) {
        short l = (short)read_u16(data + (size_t)(i * channels + 0) * 2);
        short r = channels >= 2 ? (short)read_u16(data + (size_t)(i * channels + 1) * 2) : l;
        clip.left[i] = (float)l / 32768.0f;
        clip.right[i] = (float)r / 32768.0f;
    }
    return true;
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

static bool find_device(ma_context* context, const char* target, ma_device_id* outId) {
    ma_device_info* playbackInfos = nullptr;
    ma_uint32 playbackCount = 0;
    ma_result result = ma_context_get_devices(context, &playbackInfos, &playbackCount, nullptr, nullptr);
    if (result != MA_SUCCESS) return false;
    for (ma_uint32 i = 0; i < playbackCount; ++i) {
        const char* name = playbackInfos[i].name ? playbackInfos[i].name : "";
        std::printf("device[%u]: %s\n", i, name);
        if (contains_ci(name, target)) {
            *outId = playbackInfos[i].id;
            std::printf(">> selected: %s\n", name);
            return true;
        }
    }
    return false;
}

static float clamp1(float value) {
    if (value > 1.0f) return 1.0f;
    if (value < -1.0f) return -1.0f;
    return value;
}

static void data_callback(ma_device* device, void* output, const void*, ma_uint32 frameCount) {
    PlaybackState* state = (PlaybackState*)device->pUserData;
    float* out = (float*)output;
    ma_uint32 channels = device->playback.channels;
    if (!out || !state) return;

    for (ma_uint32 i = 0; i < frameCount; ++i) {
        float speaker = 0.0f;
        if (!state->done.load(std::memory_order_relaxed)) {
            if (state->gapRemaining > 0) {
                --state->gapRemaining;
            } else if (state->played >= state->repeats) {
                state->done.store(true, std::memory_order_relaxed);
            } else {
                size_t index = (size_t)state->pos;
                if (index >= state->clip.left.size()) {
                    ++state->played;
                    state->pos = 0.0;
                    state->gapRemaining = state->gapFrames;
                } else {
                    speaker = clamp1(state->clip.left[index] * state->gain);
                    state->pos += state->step;
                }
            }
        }

        for (ma_uint32 c = 0; c < channels; ++c) {
            float value = 0.0f;
            if (channels >= 4) {
                value = (c == 1) ? speaker : 0.0f;
            } else {
                value = (c == 0) ? speaker : 0.0f;
            }
            out[i * channels + c] = value;
        }
    }
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::printf("usage: ds_speaker_wav <file.wav> [gain=0.12] [repeats=3] [target=DualSense]\n");
        return 2;
    }
    const char* path = argv[1];
    float gain = argc > 2 ? (float)atof(argv[2]) : 0.12f;
    int repeats = argc > 3 ? atoi(argv[3]) : 3;
    const char* target = argc > 4 ? argv[4] : "DualSense";

    PlaybackState state;
    if (!load_wav_16(path, state.clip)) {
        std::printf("FAIL load wav: %s (need 16-bit PCM)\n", path);
        return 1;
    }
    state.gain = gain;
    state.repeats = repeats > 0 ? repeats : 1;
    state.gapFrames = 48000 / 4;
    state.step = (double)state.clip.sampleRate / 48000.0;
    std::printf(">> wav=%s frames=%zu rate=%d gain=%.3f repeats=%d\n", path, state.clip.left.size(), state.clip.sampleRate, state.gain, state.repeats);

    ma_backend backends[] = { ma_backend_wasapi };
    ma_context context{};
    ma_result result = ma_context_init(backends, 1, nullptr, &context);
    if (result != MA_SUCCESS) { std::printf("FAIL ma_context_init: %d\n", (int)result); return 1; }

    ma_device_id deviceId{};
    if (!find_device(&context, target, &deviceId)) {
        std::printf("FAIL target not found: %s\n", target);
        ma_context_uninit(&context);
        return 1;
    }

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.pDeviceID = &deviceId;
    config.playback.format = ma_format_f32;
    config.playback.channels = 4;
    config.sampleRate = 48000;
    config.dataCallback = data_callback;
    config.periodSizeInFrames = 128;
    config.periods = 2;
    config.pUserData = &state;

    ma_device device{};
    result = ma_device_init(&context, &config, &device);
    if (result != MA_SUCCESS) {
        std::printf("FAIL ma_device_init: %d\n", (int)result);
        ma_context_uninit(&context);
        return 1;
    }
    std::printf(">> device channels=%u rate=%u\n", device.playback.channels, device.sampleRate);
    result = ma_device_start(&device);
    if (result != MA_SUCCESS) {
        std::printf("FAIL ma_device_start: %d\n", (int)result);
        ma_device_uninit(&device);
        ma_context_uninit(&context);
        return 1;
    }

    while (!state.done.load(std::memory_order_relaxed)) {
        Sleep(10);
    }
    ma_device_uninit(&device);
    ma_context_uninit(&context);
    std::printf(">> done\n");
    return 0;
}