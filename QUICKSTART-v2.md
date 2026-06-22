# 🎮 Sekiro DualSense 拼刀震动 - 快速开始指南

## 当前状态

✅ **第一阶段完成** - 所有 JavaScript 核心模块已实现并通过测试

```
游戏音频 → DirectSound Hook (C++) → 频率分析 → SFX 检测 → 参数映射 → DualSense 震动
```

---

## 🚀 立即可运行的任务

### 1. 启动应用查看 UI

```bash
cd "c:\Users\17329\Desktop\dualsence sounds"
npm run dev
```

应该看到：
- React 开发服务器启动 (http://localhost:3000)
- Electron 主窗口打开
- 可以测试手动震动（UI 已包含）

### 2. 运行测试脚本验证逻辑

```bash
node test-sfx-detection.js
```

这会显示：
- ✓ 拼刀音效被正确检测 (SFX 分数 0.602)
- ✓ 背景音乐被正确忽略 (SFX 分数 0.032)
- ✓ 参数调整工作正常
- ✓ 映射到震动参数成功

---

## 🔧 编译 DirectSound Hook（可选，高级）

### 前置条件
- Visual Studio 2019+
- Python 3.x
- CMake 3.10+

### 步骤

1. **下载 minhook**
   ```bash
   mkdir external
   cd external
   git clone https://github.com/TsudaKageyu/minhook.git
   cd minhook
   mkdir build && cd build
   cmake .. -G "Visual Studio 16 2019" -A x64
   cmake --build . --config Release
   cd ..\..
   ```

2. **编译 C++ 模块**
   ```bash
   cd src\native
   mkdir build && cd build
   cmake .. -G "Visual Studio 16 2019" -A x64
   cmake --build . --config Release
   ```

3. **编译完成**
   - DLL 生成在：`src/native/build/Release/dualsense_hook.dll`
   - 复制到应用目录使其可被加载

详见：[NATIVE_BUILD.md](./NATIVE_BUILD.md)

---

## 📁 项目结构

```
dualsense-sounds/
├── src/
│   ├── controllers/
│   │   ├── DualSenseController.js          ← 手柄控制（现有）
│   │   ├── DirectSoundHook.js              ← Hook 管理器 ✨ 新
│   │   ├── AudioAnalyzer.js                ← 音频分析 ✨ 新
│   │   ├── SFXDetector.js                  ← SFX 检测 ✨ 新
│   │   ├── HapticMapper.js                 ← 参数映射 ✨ 新
│   │   └── SFXtoHapticController.js        ← 主集成 ✨ 新
│   ├── native/
│   │   ├── directsound_hook.cpp            ← C++ Hook ✨ 新
│   │   └── CMakeLists.txt                  ← 编译配置 ✨ 新
│   ├── main/
│   │   ├── main.js                         ← Electron 主进程（已更新）
│   │   └── preload.js                      ← IPC 暴露（已更新）
│   └── renderer/
│       └── components/                     ← React UI（现有）
├── config/
│   └── games/
│       └── sekiro.json                     ← 游戏配置 ✨ 新
├── test-sfx-detection.js                   ← 测试脚本 ✨ 新
├── NATIVE_BUILD.md                         ← 编译指南 ✨ 新
└── README.md                               ← 文档（已更新）
```

---

## 🎯 核心算法简述

### 1. 音频特征提取（AudioAnalyzer）
```
输入：原始音频样本 (48kHz, 4096 样本 ≈ 85ms)
处理：FFT 频谱分析
输出：
  - RMS 能量
  - 峰值频率
  - 零点交叉率
  - 各频段能量
  - 冲击强度（高频能量占比）
```

### 2. SFX 检测（SFXDetector）
```
6 条规则引擎：
  1. 频率范围 (800-4000 Hz) → 100%
  2. 能量检查 (RMS > 0.1) → 可变
  3. 冲击强度 (>0.4) → 可变
  4. Onset Detection (能量快速上升) → 可变
  5. 零点交叉率 (ZCR > 0.1) → 可变
  6. 频率集中度 (高频占比 >30%) → 可变

加权综合 → SFX 分数 (0-1)
阈值判定 (>0.5 认为是 SFX)
```

### 3. 参数映射（HapticMapper）
```
输入：SFX 分数 + 音频特征
输出到 DualSense：
  - 强度: RMS × SFX 分数 (20-100%)
  - 频率: 峰值频率的映射 (10-255 Hz)
  - 持续时间: 冲击强度的映射 (20-100 ms)

支持 3 种映射模式：
  - energy: 基于能量
  - frequency: 基于频率
  - hybrid: 混合（推荐）
```

---

## 🔍 参数调优指南

### 目标
获得 70-80% 的拼刀检测准确率，同时避免误触发

### 调整点

1. **提高灵敏度**（容易漏检）
   ```javascript
   detector.updateConfig({
     minFreq: 1000,           // 降低最低频率
     sfxScoreThreshold: 0.4,  // 降低分数阈值
     rmsThreshold: 0.08,      // 降低能量阈值
   });
   ```

2. **降低灵敏度**（容易误触发）
   ```javascript
   detector.updateConfig({
     maxFreq: 3500,           // 提高最高频率
     sfxScoreThreshold: 0.6,  // 提高分数阈值
     impactThreshold: 0.5,    // 提高冲击阈值
   });
   ```

3. **规则权重调整**（在 SFXDetector.js 中修改 weights）
   ```javascript
   const weights = {
     freqRange: 0.25,         // ↑ 重视频率范围
     impactStrength: 0.20,    // ↑ 重视冲击强度
     onset: 0.15,             // ↓ 降低 Onset 权重
   };
   ```

### 测试流程
```bash
1. 在只狼中启动工具
2. 进行各种拼刀操作
3. 记录误触发次数
4. 调整参数
5. 重复 2-4
```

---

## 🐛 故障排除

### Hook 不加载
```
Error: Failed to load native module
```
- 解决：确保 minhook.dll 在 PATH 或与应用一起
- 或手动编译 C++ 模块（见上面的编译步骤）

### 无音频捕获
```
Queue size: 0
```
- 检查：只狼是否正在运行？
- 检查：是否以管理员权限运行？
- 检查：DirectSound 是否可用？

### 识别准确率低
- 收集真实的拼刀音效样本
- 分析特征分布，调整参数
- 考虑添加更多规则

---

## 📚 相关文件

- 📖 [README.md](./README.md) - 完整架构文档
- 🔨 [NATIVE_BUILD.md](./NATIVE_BUILD.md) - C++ 编译指南
- 🧪 [test-sfx-detection.js](./test-sfx-detection.js) - 功能测试
- ⚙️ [config/games/sekiro.json](./config/games/sekiro.json) - 游戏配置

---

## ✨ 后续改进方向

1. **UI 增强**
   - 实时频谱显示
   - 检测结果可视化
   - 参数调整滑块

2. **算法优化**
   - 更精确的 FFT 实现
   - 机器学习训练（可选）
   - 多样本平均

3. **多游戏支持**
   - 鬼泣 5
   - 艾尔登法环
   - 其他 FromSoftware 游戏

4. **用户体验**
   - 预设保存/导出
   - 自动游戏检测
   - 高级调试面板

---

**版本**: 0.1.0-beta  
**最后更新**: 2026-06-16  
**作者**: DualSense SFX 项目团队
