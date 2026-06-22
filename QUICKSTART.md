# 快速开始指南

## 项目已成功创建！✅

你现在拥有一个完整的 **DualSense 手柄震动控制工具** - Electron + React 桌面应用。

### 📋 项目信息

- **技术栈**: Electron 27 + React 18 + Node.js
- **目的**: Sony DualSense 5 手柄震动控制和游戏辅助
- **状态**: 已配置，可立即开发

### 🚀 启动应用

在 VS Code 中打开终端，运行以下命令：

```bash
npm run dev
```

这会同时启动：
1. **React 开发服务器** (http://localhost:3000)
2. **Electron 应用**

### 📁 项目结构

```
dualsence sounds/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.js        # 应用入口
│   │   └── preload.js     # IPC 安全通道
│   ├── renderer/          # React UI
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── components/    # React 组件
│   └── controllers/       # 业务逻辑
│       └── DualSenseController.js
├── public/                # 静态资源
├── package.json
├── README.md
└── .vscode/
    └── tasks.json         # 任务配置
```

### 🎮 功能特性

✅ **控制器检测** - 自动检测已连接的 DualSense 手柄  
✅ **自定义震动** - 独立控制左右电机 (0-100%)  
✅ **时长设置** - 调整震动持续时间  
✅ **8个预设** - 快速应用常用震动效果  
✅ **实时监听** - 监听手柄连接/断开事件  

### 🔧 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 (React + Electron) |
| `npm run react-start` | 仅运行 React 开发服务器 |
| `npm run build` | 编译生产版本 |
| `npm run electron-dev` | 仅运行 Electron |

### ⚠️ 首次使用须知

1. **连接手柄**: 将 DualSense 手柄通过 USB 或蓝牙连接到 Windows
2. **启动应用**: 运行 `npm run dev`
3. **检测手柄**: 应用会自动检测连接的手柄
4. **测试震动**: 调整强度和时长，点击"发送震动"测试

### 🐛 常见问题

**Q: 手柄无法检测?**  
A: 检查手柄是否已连接、尝试断开重新连接、或重启应用

**Q: 我是初学者，不知道从哪开始改代码?**  
A: 建议从这些文件开始：
- [src/renderer/App.jsx](src/renderer/App.jsx) - 主应用逻辑
- [src/controllers/DualSenseController.js](src/controllers/DualSenseController.js) - 手柄控制类

**Q: 如何添加新的震动预设?**  
A: 编辑 [src/renderer/components/VibrationControl.jsx](src/renderer/components/VibrationControl.jsx) 中的 `vibrationPresets` 数组

### 📚 学习资源

- [React 官方文档](https://react.dev)
- [Electron 官方文档](https://www.electronjs.org/docs)
- [DualSense 规格](https://en.wikipedia.org/wiki/DualSense)

### 🎯 后续开发建议

1. **改进 UI**: 添加更多样式和动画
2. **扩展功能**: 添加LED灯光控制、触觉反馈等
3. **游戏集成**: 开发特定游戏的震动配置
4. **打包应用**: 使用 Electron Builder 创建安装程序

### 💡 需要帮助?

查看完整文档: [README.md](README.md)

祝你开发愉快! 🎮🚀
