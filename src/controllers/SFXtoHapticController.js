/**
 * SFXtoHapticController.js - 主控制器
 * 集成 DirectSound Hook、音频分析、SFX 检测和 DualSense 输出
 */

const DirectSoundHook = require('./DirectSoundHook');
const AudioAnalyzer = require('./AudioAnalyzer');
const SFXDetector = require('./SFXDetector');
const HapticMapper = require('./HapticMapper');
const DualSenseController = require('./DualSenseController');

class SFXtoHapticController {
  constructor() {
    this.hook = new DirectSoundHook();
    this.analyzer = new AudioAnalyzer();
    this.detector = new SFXDetector();
    this.mapper = new HapticMapper();
    this.dualsense = new DualSenseController();

    this.isRunning = false;
    this.stats = {
      framesProcessed: 0,
      sfxDetected: 0,
      vibrationsTriggered: 0,
    };

    this.config = {
      enableVibration: true,
      debugMode: false,
    };
  }

  /**
   * 初始化所有模块
   */
  initialize() {
    console.log('Initializing SFXtoHaptic system...');

    // 初始化 DirectSound Hook
    if (!this.hook.initialize()) {
      console.error('Failed to initialize DirectSound Hook');
      return false;
    }

    // 初始化 DualSense
    const controllers = this.dualsense.getConnectedControllers();
    if (controllers.length === 0) {
      console.warn('No DualSense controllers found');
    } else {
      console.log(`Found ${controllers.length} DualSense controller(s)`);
    }

    console.log('SFXtoHaptic system initialized');
    return true;
  }

  /**
   * 启动系统
   */
  start() {
    if (this.isRunning) {
      console.warn('System already running');
      return;
    }

    if (!this.hook.isInitialized) {
      if (!this.initialize()) {
        return;
      }
    }

    // 启动音频捕获并处理
    this.hook.startAudioCapture((audioFrame) => {
      this.processAudioFrame(audioFrame);
    });

    this.isRunning = true;
    console.log('SFXtoHaptic system started');
  }

  /**
   * 停止系统
   */
  stop() {
    if (!this.isRunning) {
      console.warn('System not running');
      return;
    }

    this.hook.stopAudioCapture();
    this.dualsense.stopVibration();
    this.isRunning = false;

    console.log('SFXtoHaptic system stopped');
    console.log('Statistics:', this.stats);
  }

  /**
   * 处理音频帧（核心处理流程）
   */
  processAudioFrame(audioFrame) {
    try {
      // 1. 分析音频特征
      const features = this.analyzer.analyze(audioFrame);
      if (!features) {
        return;
      }

      // 2. 检测 SFX
      const detection = this.detector.detect(features);
      
      this.stats.framesProcessed++;
      if (detection.isSFX) {
        this.stats.sfxDetected++;
      }

      if (this.config.debugMode) {
        console.log('Detection:', {
          isSFX: detection.isSFX,
          score: detection.score.toFixed(3),
          peakFreq: detection.details.peakFreq.toFixed(0),
          rms: detection.details.rms.toFixed(3),
        });
      }

      // 3. 如果是 SFX，映射到震动参数
      if (detection.isSFX && this.config.enableVibration) {
        const hapticParams = this.mapper.map(features, detection.score);

        // 4. 发送到 DualSense
        if (hapticParams.intensity > 0) {
          this.triggerVibration(hapticParams);
          this.stats.vibrationsTriggered++;
        }
      }
    } catch (error) {
      console.error('Error processing audio frame:', error.message);
    }
  }

  /**
   * 触发 DualSense 震动
   */
  triggerVibration(hapticParams) {
    const controllers = this.dualsense.getConnectedControllers();
    if (controllers.length === 0) {
      return;
    }

    // 发送到第一个找到的控制器
    const controller = controllers[0];

    // DualSense 支持双马达
    // leftMotor: 低频马达
    // rightMotor: 高频马达
    // 根据 hapticParams.frequency 决定分配

    let leftMotor = 0;
    let rightMotor = 0;

    if (hapticParams.frequency) {
      // 混合模式：根据频率分配
      const freqRatio = hapticParams.frequency / 255; // 正常化到 0-1
      
      if (freqRatio < 0.5) {
        // 低频为主
        leftMotor = hapticParams.intensity;
        rightMotor = hapticParams.intensity * 0.3;
      } else {
        // 高频为主
        leftMotor = hapticParams.intensity * 0.3;
        rightMotor = hapticParams.intensity;
      }
    } else {
      // 简单模式：两个马达同时输出
      leftMotor = hapticParams.intensity;
      rightMotor = hapticParams.intensity;
    }

    this.dualsense.vibrate(
      controller.path,
      leftMotor,
      rightMotor,
      hapticParams.duration
    );
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    return {
      running: this.isRunning,
      hookStatus: this.hook.getStatus(),
      detectedControllers: this.dualsense.getConnectedControllers().length,
      stats: this.stats,
      detectorConfig: this.detector.getConfig(),
      mapperConfig: this.mapper.getConfig(),
    };
  }

  /**
   * 更新 SFX 检测器配置
   */
  updateDetectorConfig(newConfig) {
    this.detector.updateConfig(newConfig);
  }

  /**
   * 更新映射器配置
   */
  updateMapperConfig(newConfig) {
    this.mapper.updateConfig(newConfig);
  }

  /**
   * 设置调试模式
   */
  setDebugMode(enabled) {
    this.config.debugMode = enabled;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      framesProcessed: 0,
      sfxDetected: 0,
      vibrationsTriggered: 0,
    };
  }

  /**
   * 关闭系统
   */
  shutdown() {
    if (this.isRunning) {
      this.stop();
    }

    this.hook.shutdown();
  }
}

module.exports = SFXtoHapticController;
