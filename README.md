# DualSense SFX Haptics 改进记录与实现说明

- 从 FMOD 内部识别音乐、语音和音效。
- 从“master 混音触发震动”改成“单个 FMOD Channel 捕获”。
- 把单个 Channel 的 PCM 写成 WAV，方便试听、标注、分类。
- 把捕获到的音效送到 DualSense ch3/ch4 或 VB-CABLE/DSX 做触觉。
- 用 GUI 管理安装、输出目标、录音、idx 启用状态和强度。

当前实现只读观察单机游戏音频，不包含游戏资源，不改存档，不解包游戏文件。

## 当前结论

最终稳定策略不是“所有非音乐/语音都震”。实际测试发现这样会把区域音、脚步、环境和杂项事件都带进触觉，手感会乱。

当前推荐策略是先进入“试听标注模式”：

```text
vm*              -> 语音，不震
sm##.fsb         -> 地图 BGM，不震
所有 SFX 候选     -> 默认只录不震
确认过的 idx      -> 在 GUI 手动勾选后才震
内置白名单        -> 可选开启，用旧实测 idx 快速起步
```

配置不再热更新。GUI 保存配置后，需要重启只狼才会让 DLL 重新读取配置。

## 改进总览

| 阶段 | 原状态 / 问题 | 改进 | 主要位置 |
| --- | --- | --- | --- |
| 1. FMOD 代理 | 原项目偏 GUI/原型，无法稳定知道游戏播放了什么 | 做 `fmodex64.dll` 代理，转发原 DLL 导出，只拦关键 FMOD 函数 | [src/native/fmod_probe/dllmain.cpp](src/native/fmod_probe/dllmain.cpp), [src/native/fmod_probe/thunks.asm](src/native/fmod_probe/thunks.asm) |
| 2. bank 分类 | 只知道有声音，不知道来自音乐、语音还是音效 | 记录 `Sound* -> bank`，用文件名规则区分 `vm*` 和 `sm##` | `classify`, `createSound*_detour` |
| 3. idx 识别 | `playSound` 拿到子声音时不知道它是 FSB 里的第几个 | hook `getSubSound`，记录 `subSound* -> idx` 和 `subSound* -> parent bank` | `getSubSoundCpp_detour`, `getSubSoundC_detour` |
| 4. 触觉来源 | 早期使用 master 混音门控，声音不纯 | 改成在当前 `Channel*` 上挂透明 DSP | `playSound_detour`, `attach_channel_tap`, `channel_tap_read` |
| 5. WAV 导出 | 只能感受震动，不能听单个音效 | DSP 回调中把 Channel PCM 写成 WAV | `create_channel_dump`, `write_channel_dump` |
| 6. GUI 配置 | 改参数要重新编译或手改 JSON | WinForms GUI 管理安装、录音、idx、强度和启用状态 | [src/gui/MainForm.cs](src/gui/MainForm.cs) |
| 7. 录音模式 | 只能录启用触觉的声音 | 全局录音可录遇到的 SFX，但未启用的声音不震 | `decide_haptic`, `channel_tap_read` |
| 8. 分类整理 | dumps 里全是平铺 WAV，不好查 | 根据 `seen_effects.jsonl` 把 WAV 复制到 `dumps_by_fsb` | AppData 运行数据 |
| 9. 策略收敛 | “非对白/音乐全震”实际太乱 | 改为手动白名单：先录音试听，再勾选确认 idx | `decide_haptic`, GUI 默认项 |
| 10. 触觉混音 | 多个音效按 DSP 回调顺序挤进 ring，手感会串 | 改为按输出时间轴叠加混音，并用 soft limiter 收峰值 | `push_audio_to_ring`, `haptic_pull_audio` |

## 原始问题

普通 DSX Audio-to-Haptics 会把系统里所有声音都转成触觉。对只狼来说，这会导致：

- BGM 一直在震。
- 人物对白也震。
- 音效、音乐、环境音混在一起，无法针对战斗动作调手感。

最初的目标是只让“该震的音效”进入触觉链路，尤其是弹刀、受击、处决、危攻这类瞬态声音。

后来目标进一步扩展：不仅要震，还要能把 FMOD 内部某个音效单独录成 WAV，方便人工听、分类和标注。

## 总体音频流转

```text
游戏 .fsb/.fev 资源
        |
        | createSound / createStream / createSoundInternal
        v
FMOD Sound*
        |
        | getSubSound(index)
        v
FMOD 子 Sound*
        |        记录：子 Sound* -> idx
        |        记录：子 Sound* -> parent bank
        |
        | playSound(sound)
        v
FMOD Channel*        <- 本次播放的一路声音
        |
        | FMOD_Channel_AddDSP(channel, dsp)
        v
透明 Channel DSP
        |
        | in  = 当前 Channel PCM
        | out = 原样传回 FMOD
        |
        +---- 写 WAV 到 dumps
        |
        +---- push_audio_to_ring -> haptic_out.cpp -> DualSense / VB-CABLE
        |
        v
FMOD master 混音 -> 游戏正常声音输出
```

核心区别：

```text
早期：从 master 总混音里开门取声音。
现在：在当前 FMOD Channel 上复制单路 PCM。
```

## 关键代码链路

### 1. 记录 Sound 属于哪个 FSB

入口：

```cpp
createSound_detour(...)
createStream_detour(...)
createSoundInternal_detour(...)
```

做法：

```cpp
std::string base = basename_ascii(nameOrData);
g_soundBank[*sound] = base;
```

得到映射：

```text
Sound* -> smain_jaj.fsb
Sound* -> sm11.fsb
Sound* -> vm11_jaj.fsb
```

这一步用于后续判断音乐、语音和音效。

### 2. 记录子声音 idx 和父 bank

入口：

```cpp
getSubSoundCpp_detour(...)
getSubSoundC_detour(...)
```

做法：

```cpp
g_subIndex[*subsound] = index;
g_subBank[*subsound] = it->second;
```

得到映射：

```text
子 Sound* -> idx
子 Sound* -> FSB bank
```

这一步解决了 `playSound` 播放子声音时“不知道这是 FSB 里第几个声音”的问题。

### 3. 在 playSound 中拿到 Channel

入口：

```cpp
playSound_detour(...)
```

先查询：

```cpp
std::string bank = lookup_bank(sound);
int subIdx = ... g_subIndex.find(sound) ...;
HapticDecision haptic = decide_haptic(subIdx, bank, verdict[0] == 'V');
```

再调用原 FMOD：

```cpp
FMOD_RESULT r = g_playSound(self, channelid, sound, playPaused, channel);
```

这里 `channel` 是 FMOD 为这次播放创建出来的一路声音。后面的单独 WAV 和触觉都从这个 Channel 来。

### 4. 给 Channel 挂透明 DSP

入口：

```cpp
attach_channel_tap(self, *channel, subIdx, haptic.gain, haptic.dump, shouldHaptic)
```

创建 DSP：

```cpp
FMOD_DSP_DESCRIPTION_ d{};
d.read = channel_tap_read;
d.release = channel_tap_release;
g_createDSP(system, &d, &dsp);
```

挂到当前 Channel：

```cpp
g_chAddDSP(channel, dsp, &conn);
```

这是从 master 捕获升级到 Channel 捕获的核心改动。

### 5. DSP 回调中写 WAV 和送触觉

入口：

```cpp
channel_tap_read(..., float* in, float* out, unsigned int length, int inch, int outch)
```

先透传，保证游戏声音不变：

```cpp
memcpy(out, in, (size_t)length * ch * sizeof(float));
```

如果需要录音：

```cpp
state->plugindata = ctx.dump ? create_channel_dump(ctx.idx, ch) : nullptr;
write_channel_dump((ChannelDump*)state->plugindata, in, length, inch);
```

如果需要触觉：

```cpp
push_audio_to_ring(in, length, inch, true, ctx.gain);
```

也就是说同一份 Channel PCM 分成两路：

```text
Channel PCM -> WAV 文件
Channel PCM -> haptic mixer -> soft limiter -> WASAPI -> DualSense / VB-CABLE
```

## WAV 导出实现

WAV 文件创建在：

```cpp
create_channel_dump(int idx, int channels)
```

文件名规则：

```cpp
const char* key = sound_group_key(idx);
if (key) file = key + ".wav";
else     file = "idx%d.wav";
```

例子：

```text
deathblow_break.wav
deflect_guard.wav
hurt_death.wav
idx459.wav
```

写入在：

```cpp
write_channel_dump(ChannelDump* dump, const float* in, unsigned int length, int inch)
```

实现方式：

- 输入是 FMOD 的 float PCM。
- 写文件前转为 16-bit PCM。
- 每次写入后更新 WAV header。
- 单个 dump 默认最多保留约 3 秒，避免长音无限写文件。
- 同一分组只保留最新一个 WAV。

写 WAV header 的函数是：

```cpp
wav_write_header(FILE* f, int channels, int frames)
```

这样即使 FMOD 没有及时调用 release，文件也基本能直接播放。

## 触觉输出实现

触觉输出在 [src/native/fmod_probe/haptic_out.cpp](src/native/fmod_probe/haptic_out.cpp)。

流程：

```text
channel_tap_read
        -> push_audio_to_ring       # 按输出时间轴叠加到 mixer ring
          -> push_speaker_to_ring     # 弹刀/格挡原始 PCM 直通到手柄喇叭
  -> haptic_pull_audio
        -> soft limiter
  -> WASAPI render thread
  -> DualSense ch1/ch2 喇叭 + ch3/ch4 触觉，或 CABLE Input
```

多个启用音效同时触发时，不再按回调顺序排队串起来，而是写到同一条短延迟时间轴上叠加。`haptic_pull_audio` 读取后会清空已消费样本，并对混合结果做 soft limiter，减少削顶导致的硬、糊、怪。

弹刀/格挡组（idx 665-700）会额外复制一份原始 FMOD Channel PCM 到 DualSense ch1/ch2，用于手柄喇叭播放；这一路不做触觉整形、不截短、不低通、不空间权重处理，只做必要的 WASAPI 声道写入。CABLE/DSX 两声道路线不会混入这份喇叭音频。

每个触觉 Channel 还会先做触觉整形：约 115Hz 高通去掉低频拖尾，快速包络突出瞬态起点，再进入 mixer。事件寿命按 idx 分组压短，例如弹刀/危攻约 125ms，处决/受伤约 200ms，未知事件约 250ms；连续约 25ms 低电平后也会自动停止。这样弹刀、处决这类瞬态音效不会因为 FMOD Channel 尾巴、循环残留或低电平噪声一直震动；WAV 录音仍保持完整，方便继续试听标注。

两种输出目标：

- DualSense ch3/ch4 直驱。
- VB-CABLE，再由 DSX Audio-to-Haptics 转成手柄触觉。

实际手感上，DSX 路线更适合高频金属声，因为它会做包络提取和低频合成。

## 过滤策略的改动

### 第一版：文件名前缀过滤

只按 bank 名判断：

```text
vm*      -> 语音，跳过
sm##     -> 音乐，跳过
其它     -> 音效候选
```

实现位置：

```cpp
classify(const std::string& base)
```

这个规则能正确排除语音和 BGM，但“其它全部震”会把区域音、脚步和杂项也带进来。

### 第二版：idx 白名单

为了减少乱震，加入 `is_haptic_event(idx)`：

```text
665-700   -> 弹刀/格挡
408       -> 危攻蓄力
983-992   -> 受伤/死亡
851-853   -> 处决/破防
256-258   -> 闪避/剧烈移动
...
```

这个版本很稳，但覆盖范围偏窄。

### 第三版：非对白/音乐全震

根据“只要对白 + 音乐不震，其余一律震”的需求，尝试过：

```text
vm* 和 sm## 跳过，其余默认震
```

实际结果是震动更乱，因为 `rm##`、`xm##`、大量 `(unknown)` 会包含脚步、区域环境、杂项事件。

### 当前推荐版：手动白名单

现在的默认策略在：

```cpp
decide_haptic(int idx, const std::string& bank, bool bankAllowsHaptics)
```

核心判断仍保留内置白名单开关：

```cpp
bool enabled = g_cfg.useBuiltinDefaults &&
    (is_default_haptic_bank(bank) || (bank == "(unknown)" && is_haptic_event(idx)));
```

但新配置默认关闭 `useBuiltinDefaults`，打开 `dumpEnabled`。含义是：

```text
vm*/sm##       -> 跳过，不录不震
SFX 候选        -> 录 WAV，不震
GUI 勾选 idx    -> 下次启动游戏后震
内置白名单开启   -> 旧实测动作音自动震
```

## 配置系统改动

配置文件：

```text
%APPDATA%\DualSenseSfxHaptics\haptics.json
```

主要字段：

```json
{
  "enabled": true,
  "defaultGain": 1.0,
        "dumpEnabled": true,
        "useBuiltinDefaults": false,
  "effects": {
    "853": { "enabled": true, "gain": 2.5, "dump": true, "name": "deathblow" }
  }
}
```

规则：

- `enabled` 是全局触觉开关。
- `defaultGain` 是默认强度。
- `dumpEnabled` 表示录遇到的所有 SFX Channel，推荐标注阶段保持开启。
- `useBuiltinDefaults` 表示启用旧实测白名单；关闭时只按 `effects` 里的手动勾选项震。
- `effects` 可按 idx 覆盖启用状态、强度、录音和名称。

曾经实现过运行时热更新，但实际体验不稳定，已经移除。现在 DLL 每个只狼进程只读取一次配置，保存后需要重启游戏生效。

相关函数：

```cpp
load_config_once
parse_config
decide_haptic
```

## GUI 改动

GUI 在 [src/gui/MainForm.cs](src/gui/MainForm.cs)。

从原来的安装/输出控制面板，扩展为：

- 选择游戏目录。
- 安装/卸载代理 DLL。
- 选择 DualSense 直驱或 VB-CABLE/DSX 输出。
- 读取 `seen_effects.jsonl`，列出已发现 idx。
- 按 idx 启用/禁用触觉。
- 调整单个 idx 的 gain。
- 勾选单个 idx 或全局录音。
- 试听已录 WAV。
- 打开录音目录。

GUI 保存配置时会先提交 DataGridView 当前编辑，避免“刚勾选但没离开格子，所以没保存”的问题。

## 运行时发现记录

发现记录文件：

```text
%APPDATA%\DualSenseSfxHaptics\seen_effects.jsonl
```

写入函数：

```cpp
record_seen_effect
```

每行大致包含：

```json
{
  "time": "2026-07-04 05:12:43",
  "idx": 57,
  "bank": "smain_jaj.fsb",
  "sub": "",
  "verdict": "VIBRATE",
  "meaning": "死亡屏幕",
  "haptic": true,
  "gain": 1.0
}
```

这个文件用于：

- GUI 展示已发现 idx。
- 以后把 WAV 按 FSB 分类。
- 分析哪些 bank 是语音、音乐、音效。

## 录音分类整理

原始录音目录：

```text
%APPDATA%\DualSenseSfxHaptics\dumps
```

按 FSB 整理后的目录：

```text
%APPDATA%\DualSenseSfxHaptics\dumps_by_fsb
```

整理方法：

1. 读取 `seen_effects.jsonl`。
2. 建立 `idx -> bank` 的投票映射。
3. 扫描 `dumps/*.wav`。
4. 从文件名解析 idx 或分组名。
5. 按 bank 复制到 `dumps_by_fsb/<bank>/`。
6. 生成 `manifest_all.tsv` 和每个 bank 的 `.tsv` 清单。

注意：早期录音里很多 `idx` 还没有准确父 bank，所以会进入 `unknown_fsb`。新版 DLL 已经记录 `subSound* -> parent bank`，后续新录音会更容易分到具体 FSB。

## 游戏资源分析结论

对 `D:\SteamLibrary\steamapps\common\Sekiro\sound` 的离线扫描结果：

- `.fev` 是 RIFF/FEV，包含可读路径，比如 `/rm11/p110100100` 和 `bank/ntc_rm11/*.wav`。
- `smain*.fsb` 不是普通明文 FSB5 头，直接扫字符串拿不到可靠样本名。
- `sm##.fsb` 对应地图 BGM。
- `vm##*.fsb` 对应语音，有 `_enu/_jaj/_ded` 等语言后缀。
- `rm##.fsb` 更像区域/通知/环境类资源。
- `xm##.fsb` 属于额外事件/地图类候选，默认不震，先录后人工判断。
- 当前 sound 目录没有发现 `c####.fsb`。

因此官方可读名字无法从 `smain*.fsb` 直接稳定恢复，目前主要靠运行时 idx、WAV 试听和人工标注。

## 构建与部署

Native DLL 构建命令：

```powershell
& "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build build --config Release
```

GUI 构建命令：

```powershell
& "C:\Program Files\dotnet\dotnet.exe" build "src\gui\DualSenseHaptics.csproj" -c Release
```

当前 native 工程需要 MSVC `/utf-8`，否则中文注释在部分系统代码页下可能导致编译解析异常。这个配置在 [src/native/fmod_probe/CMakeLists.txt](src/native/fmod_probe/CMakeLists.txt)。

安装方式：

1. 游戏原始 `fmodex64.dll` 备份为 `fmodex64_orig.dll`。
2. 编译出的代理 DLL 放到游戏目录，文件名仍为 `fmodex64.dll`。
3. 只狼启动时加载代理 DLL。
4. 代理 DLL 再加载 `fmodex64_orig.dll` 并转发绝大多数导出。

GUI 的“安装到游戏”按钮会自动做这个过程。

## 重要运行文件

```text
%TEMP%\fmod_probe_log.txt                         # FMOD hook 日志
%TEMP%\haptic_out_log.txt                         # WASAPI/触觉输出日志
%APPDATA%\DualSenseSfxHaptics\haptics.json        # 触觉配置
%APPDATA%\DualSenseSfxHaptics\seen_effects.jsonl  # 已发现 idx/bank 记录
%APPDATA%\DualSenseSfxHaptics\dumps\              # 原始 WAV 录音
%APPDATA%\DualSenseSfxHaptics\dumps_by_fsb\       # 按 FSB 分类后的 WAV
```

## 验证方法

### 验证 Channel DSP 是否生效

查看 `%TEMP%\fmod_probe_log.txt`，应看到类似：

```text
PLAY ... bank=smain_jaj.fsb ... idx=57 ... dump=1
CHDSP: attached channel=... idx=57 gain=1.00 dump=1 haptic=1
CHDSP first read: in=... out=... length=... inch=...
CHDUMP: open ... death_screen.wav
```

### 验证不是 master 混音

关键证据是日志里有：

```text
CHDSP: attached channel=...
```

这表示 DSP 挂在本次播放的 FMOD Channel 上，而不是只靠 master fallback。

### 验证配置是否生效

因为配置是进程启动时读取，修改 GUI 后需要：

1. 保存配置。
2. 关闭只狼。
3. 重新启动只狼。
4. 查看日志里的 `CFG: loaded ...`。

## 当前已知限制

- 早期录制文件很多属于 `unknown_fsb`，因为当时还没有完整记录子声音父 bank。
- `smain*.fsb` 无法直接通过字符串扫描恢复官方样本名。
- 当前默认是手动白名单，所有未确认 SFX 都只录不震；需要通过录音试听后手动启用。
- GUI 仍然是调试工具形态，适合标注和调参，不是最终发行 UI。
- 配置不热更新，改完要重启游戏。

## 后续可改进方向

- 把 `dumps_by_fsb` 分类脚本固化进 GUI。
- 给 GUI 增加“按 bank 过滤”和“批量启用/禁用”。
- 给每个 idx 增加人工备注字段和导出表。
- 在新版本 DLL 下重新录一轮，减少 `unknown_fsb`。
- 继续补充 `sound_meaning(idx)` 的人工标注。
- 针对不同输出路线提供不同默认 gain，例如 DSX 路线和直驱路线分开调。

## 文件索引

- [src/native/fmod_probe/dllmain.cpp](src/native/fmod_probe/dllmain.cpp)：FMOD 代理、bank/idx 记录、Channel DSP、WAV dump、配置判断。
- [src/native/fmod_probe/haptic_out.cpp](src/native/fmod_probe/haptic_out.cpp)：WASAPI 触觉输出，目标设备选择。
- [src/gui/MainForm.cs](src/gui/MainForm.cs)：WinForms GUI，安装、输出选择、音效管理、试听。
- [src/gui/DualSenseHaptics.csproj](src/gui/DualSenseHaptics.csproj)：GUI 构建和 proxy DLL 打包。
- [haptics.example.json](haptics.example.json)：配置文件示例。
- [PROJECT_CHANGES.md](PROJECT_CHANGES.md)：更早期的研发记录和实验日志。
