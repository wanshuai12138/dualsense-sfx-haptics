<!-- DualSense 手柄震动辅助工具 项目指导 -->

- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify Project Requirements
    项目类型：Electron + React 桌面应用
    功能：Sony DualSense 5 手柄震动控制

- [x] Scaffold the Project
    - 创建项目结构和配置文件 ✓
    - 安装 npm 依赖 ✓ (1563 packages)

- [x] Customize the Project
    - 实现 DualSense 手柄检测和连接 ✓
    - 开发震动控制 UI 和功能 ✓
    - 创建震动预设 ✓

- [x] Install Required Extensions
    - 无额外 VS Code 扩展需求

- [x] Compile the Project
    - 安装依赖 ✓
    - 项目已准备就绪

- [x] Create and Run Task
    - 创建开发运行任务 ✓
    - tasks.json 已配置

- [ ] Launch the Project
    - 运行: npm run dev

- [x] Ensure Documentation is Complete
    - README.md 完成 ✓
    - QUICKSTART.md 完成 ✓

- [x] Implement Audio Analysis Modules (Phase 1)
    - AudioAnalyzer.js 完成 ✓ (FFT + 特征提取)
    - SFXDetector.js 完成 ✓ (规则引擎)
    - HapticMapper.js 完成 ✓ (参数映射)
    - SFXtoHapticController.js 完成 ✓ (核心集成)

- [x] Implement DirectSound Hook Framework (Phase 1)
    - directsound_hook.cpp 完成 ✓ (C++ Hook 框架)
    - CMakeLists.txt 完成 ✓
    - DirectSoundHook.js 完成 ✓ (JavaScript 管理器)

- [x] Integration with Main Application
    - main.js IPC 处理完成 ✓
    - preload.js IPC 对接完成 ✓

- [x] Test and Verify (Phase 1)
    - test-sfx-detection.js 创建并通过 ✓
    - 拼刀音效检测准确率: 60.2% (目标: 70-80%)
    - 背景音乐正确忽略: ✓
    - 参数调整功能验证: ✓

- [ ] Native Module Build & Test (Phase 2)
    - 获取 minhook 库
    - 配置 node-gyp / CMake
    - 编译 C++ DirectSound Hook 模块
    - 在 Sekiro 中测试

- [ ] Parameter Tuning & Optimization (Phase 3)
    - 在 Sekiro 中收集拼刀音效样本
    - 调整 SFX 检测器参数
    - 优化映射公式
    - 用户参数可视化 UI
