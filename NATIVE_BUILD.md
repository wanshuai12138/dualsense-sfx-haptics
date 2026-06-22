# Sekiro DualSense Vibration Tool - 原生模块编译指南

## 前置要求

1. **Visual Studio 2019 或更高版本** - 用于 C++ 编译
2. **Node.js** - 已安装（v14 或更高）
3. **Python** - node-gyp 需要
4. **minhook** - DirectSound Hook 库

## 步骤 1：下载 minhook

```bash
# 创建 external 目录
mkdir external
cd external

# 下载 minhook
git clone https://github.com/TsudaKageyu/minhook.git
cd minhook

# 编译 minhook（Visual Studio 2019）
mkdir build
cd build
cmake .. -G "Visual Studio 16 2019" -A x64
cmake --build . --config Release
```

## 步骤 2：配置路径

编辑 `src/native/CMakeLists.txt`，设置正确的 minhook 路径：

```cmake
set(MINHOOK_INCLUDE_DIR "C:\\path\\to\\minhook\\include")
set(MINHOOK_LIB_DIR "C:\\path\\to\\minhook\\build\\Release\\lib")
```

## 步骤 3：编译 C++ 模块

```bash
cd src/native
mkdir build
cd build

# 生成 Visual Studio 项目
cmake .. -G "Visual Studio 16 2019" -A x64

# 编译
cmake --build . --config Release
```

编译完成后，`dualsense_hook.dll` 将生成在 `src/native/build/Release/` 目录。

## 步骤 4：测试

### 方法 1：在 Electron 中运行

```bash
npm run dev
```

在应用 UI 中点击"启动 SFX 检测"，应该会看到：
- DirectSound Hook 初始化成功
- 开始捕获音频帧
- 实时显示检测结果

### 方法 2：独立测试（Node.js）

创建 `test-hook.js`：

```javascript
const DirectSoundHook = require('./src/controllers/DirectSoundHook');

const hook = new DirectSoundHook();

if (hook.initialize()) {
  console.log('Hook initialized');
  
  hook.startAudioCapture((frame) => {
    console.log(`Captured ${frame.sampleCount} samples`);
  });

  // 运行 30 秒
  setTimeout(() => {
    hook.stopAudioCapture();
    hook.shutdown();
    console.log('Test finished');
  }, 30000);
} else {
  console.error('Failed to initialize hook');
}
```

运行：
```bash
node test-hook.js
```

## 故障排除

### DLL 加载失败
- 确保 `minhook.dll` 在系统 PATH 中或与应用一起
- 检查 Visual C++ Runtime 是否已安装

### Hook 初始化失败
- 检查是否以管理员权限运行
- 验证只狼进程是否正在运行
- 检查 DirectSound 是否可用

### 无音频捕获
- 验证音频缓冲区是否被创建
- 检查调试输出 (OutputDebugString)
- 确保只狼正在播放音频

## 下一步

1. 在只狼中测试 Hook 的稳定性
2. 收集真实的拼刀音效样本
3. 调整 SFXDetector 的参数
4. 优化映射和震动效果

## 参考资源

- [minhook 文档](https://github.com/TsudaKageyu/minhook)
- [DirectSound API](https://docs.microsoft.com/en-us/previous-versions/windows/desktop/ee416842(v=vs.85))
- [DualSense Haptic API](https://github.com/Okunade/dualsense-js)
