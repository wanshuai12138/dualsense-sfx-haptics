// ============================================================================
// fmod_probe — FMOD Ex 代理 DLL 探针（只狼 / Sekiro）
// ----------------------------------------------------------------------------
// 目的：只读地观察游戏播放了哪些声音，搞清楚每个声音来自哪个 .fsb bank，
//       从而验证"排除 sm*(音乐) / vm*(语音)、其余全震"这条过滤规则是否成立。
//
// 工作方式（纯 DLL 代理，不依赖 MinHook）：
//   1. 把游戏目录里的真 fmodex64.dll 改名为 fmodex64_orig.dll
//   2. 本 DLL 编译出来也叫 fmodex64.dll，放进游戏目录
//   3. fmodex64.def 把 706 个导出原样转发给 fmodex64_orig.dll，
//      只有 createSound / createStream / playSound 三个换成下面的实现
//   4. 我们的实现包一层日志，再调用真函数，行为对游戏完全透明
//
// 输出：日志写到  %USERPROFILE%\Desktop\fmod_probe_log.txt
//       每行形如：  PLAY ch=-1 bank=smain.fsb sub="670" -> VIBRATE
//                   PLAY ch=-1 bank=sm11.fsb  sub="3"   -> SKIP(music)
//
// ⚠️ 本探针不插手柄、不震动、不改任何游戏行为，纯打印。
// ============================================================================

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <cctype>
#include <string>
#include <unordered_map>
#include <mutex>
#include <cstdarg>

// --- FMOD 不透明类型，避免引入 FMOD 头文件 ---
typedef int FMOD_RESULT;                 // 0 == FMOD_OK
static const unsigned FMOD_OPENMEMORY       = 0x00000800;
static const unsigned FMOD_OPENMEMORY_POINT = 0x10000000;

// --- 真函数指针（从 fmodex64_orig.dll 解析）---
typedef FMOD_RESULT (*createSound_t)(void* self, const char* nameOrData, unsigned mode, void* exinfo, void** sound);
typedef FMOD_RESULT (*createStream_t)(void* self, const char* nameOrData, unsigned mode, void* exinfo, void** sound);
typedef FMOD_RESULT (*playSound_t)(void* self, int channelid, void* sound, int paused, void** channel);

// 辅助 C API（用扁平 C 导出，调用最省事）
typedef FMOD_RESULT (*Sound_GetName_t)(void* sound, char* name, int namelen);
typedef FMOD_RESULT (*Sound_GetSubSoundParent_t)(void* sound, void** parent);

static createSound_t              g_createSound  = nullptr;
static createStream_t             g_createStream = nullptr;
static playSound_t                g_playSound    = nullptr;
static Sound_GetName_t            g_getName      = nullptr;
static Sound_GetSubSoundParent_t g_getParent    = nullptr;

static HMODULE g_orig = nullptr;

// Sound* -> 来源 bank 文件名（basename）
static std::unordered_map<void*, std::string> g_soundBank;
static std::mutex g_lock;
static FILE* g_log = nullptr;

// ----------------------------------------------------------------------------
static const char* basename_ascii(const char* path) {
    if (!path) return "";
    const char* b = path;
    for (const char* p = path; *p; ++p)
        if (*p == '\\' || *p == '/') b = p + 1;
    return b;
}

// 按文件名分类：music = sm + 数字, voice = vm*, 其余 = 震动
// （smain.fsb 不是音乐：sm 后面是 'a' 不是数字）
static const char* classify(const std::string& base) {
    auto starts = [&](const char* p) {
        return base.size() >= strlen(p) && _strnicmp(base.c_str(), p, strlen(p)) == 0;
    };
    if (starts("vm")) return "SKIP(voice)";
    if (starts("sm") && base.size() > 2 && isdigit((unsigned char)base[2])) return "SKIP(music)";
    return "VIBRATE";
}

static void logf(const char* fmt, ...) {
    std::lock_guard<std::mutex> g(g_lock);
    if (!g_log) return;
    va_list ap; va_start(ap, fmt);
    vfprintf(g_log, fmt, ap);
    va_end(ap);
    fputc('\n', g_log);
    fflush(g_log);
}

// 查某个 Sound*（可能是子音）属于哪个 bank
static std::string lookup_bank(void* sound) {
    if (!sound) return "(null)";
    {
        std::lock_guard<std::mutex> g(g_lock);
        auto it = g_soundBank.find(sound);
        if (it != g_soundBank.end()) return it->second;
    }
    // 不是直接登记的 Sound：尝试反查父音
    if (g_getParent) {
        void* parent = nullptr;
        if (g_getParent(sound, &parent) == 0 && parent && parent != sound) {
            std::lock_guard<std::mutex> g(g_lock);
            auto it = g_soundBank.find(parent);
            if (it != g_soundBank.end()) return it->second;
        }
    }
    return "(unknown)";
}

// ----------------------------------------------------------------------------
// 惰性初始化：首次进入任一拦截点时执行，避开 DllMain 的 loader-lock。
// ----------------------------------------------------------------------------
static std::once_flag g_once;
static void do_init();
static inline void ensure_init() { std::call_once(g_once, do_init); }

// ----------------------------------------------------------------------------
// 三个被拦截的导出（.def 里 alias 到这些符号；extern "C" 保证名字不被修饰）
// ----------------------------------------------------------------------------
extern "C" FMOD_RESULT createSound_detour(void* self, const char* nameOrData, unsigned mode, void* exinfo, void** sound) {
    ensure_init();
    FMOD_RESULT r = g_createSound(self, nameOrData, mode, exinfo, sound);
    bool isMem = (mode & (FMOD_OPENMEMORY | FMOD_OPENMEMORY_POINT)) != 0;
    if (r == 0 && sound && *sound && !isMem && nameOrData) {
        std::string base = basename_ascii(nameOrData);
        { std::lock_guard<std::mutex> g(g_lock); g_soundBank[*sound] = base; }
        logf("CREATE sound=%p bank=%s mode=0x%08x", *sound, base.c_str(), mode);
    }
    return r;
}

extern "C" FMOD_RESULT createStream_detour(void* self, const char* nameOrData, unsigned mode, void* exinfo, void** sound) {
    ensure_init();
    FMOD_RESULT r = g_createStream(self, nameOrData, mode, exinfo, sound);
    bool isMem = (mode & (FMOD_OPENMEMORY | FMOD_OPENMEMORY_POINT)) != 0;
    if (r == 0 && sound && *sound && !isMem && nameOrData) {
        std::string base = basename_ascii(nameOrData);
        { std::lock_guard<std::mutex> g(g_lock); g_soundBank[*sound] = base; }
        logf("STREAM sound=%p bank=%s mode=0x%08x", *sound, base.c_str(), mode);
    }
    return r;
}

extern "C" FMOD_RESULT playSound_detour(void* self, int channelid, void* sound, int paused, void** channel) {
    ensure_init();
    FMOD_RESULT r = g_playSound(self, channelid, sound, paused, channel);

    std::string bank = lookup_bank(sound);
    char subname[256] = "";
    if (g_getName && sound) {
        if (g_getName(sound, subname, sizeof(subname)) != 0) subname[0] = '\0';
    }
    const char* verdict = (bank == "(unknown)" || bank == "(null)") ? "?" : classify(bank);
    logf("PLAY  ch=%d sound=%p bank=%s sub=\"%s\" -> %s",
         channelid, sound, bank.c_str(), subname, verdict);
    return r;
}

// ----------------------------------------------------------------------------
static void do_init() {
    // 日志文件：桌面
    char path[MAX_PATH] = "fmod_probe_log.txt";
    char* up = nullptr; size_t n = 0;
    if (_dupenv_s(&up, &n, "USERPROFILE") == 0 && up) {
        _snprintf_s(path, sizeof(path), _TRUNCATE, "%s\\Desktop\\fmod_probe_log.txt", up);
        free(up);
    }
    g_log = nullptr;
    fopen_s(&g_log, path, "w");

    g_orig = LoadLibraryA("fmodex64_orig.dll");
    if (!g_orig) { logf("FATAL: cannot load fmodex64_orig.dll (err=%lu)", GetLastError()); return; }

    g_createSound  = (createSound_t)  GetProcAddress(g_orig, "?createSound@System@FMOD@@QEAA?AW4FMOD_RESULT@@PEBDIPEAUFMOD_CREATESOUNDEXINFO@@PEAPEAVSound@2@@Z");
    g_createStream = (createStream_t) GetProcAddress(g_orig, "?createStream@System@FMOD@@QEAA?AW4FMOD_RESULT@@PEBDIPEAUFMOD_CREATESOUNDEXINFO@@PEAPEAVSound@2@@Z");
    g_playSound    = (playSound_t)    GetProcAddress(g_orig, "?playSound@System@FMOD@@QEAA?AW4FMOD_RESULT@@W4FMOD_CHANNELINDEX@@PEAVSound@2@_NPEAPEAVChannel@2@@Z");
    g_getName      = (Sound_GetName_t)            GetProcAddress(g_orig, "FMOD_Sound_GetName");
    g_getParent    = (Sound_GetSubSoundParent_t)  GetProcAddress(g_orig, "FMOD_Sound_GetSubSoundParent");

    logf("=== fmod_probe loaded ===");
    logf("orig=%p createSound=%p createStream=%p playSound=%p getName=%p getParent=%p",
         g_orig, g_createSound, g_createStream, g_playSound, g_getName, g_getParent);
    if (!g_createSound || !g_playSound)
        logf("WARNING: 关键函数指针为空，导出名可能与本机 fmodex64.dll 不符，需重新核对");
}

BOOL WINAPI DllMain(HINSTANCE hInst, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) DisableThreadLibraryCalls(hInst);
    // 真正的初始化推迟到首次被调用时（ensure_init），避开 loader-lock。
    return TRUE;
}
