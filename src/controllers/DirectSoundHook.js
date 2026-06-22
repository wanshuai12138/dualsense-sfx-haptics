/**
 * DirectSoundHook.js - 管理 DirectSound Hook
 * 负责加载原生模块、初始化 Hook、读取音频数据
 */

const path = require('path');
const fs = require('fs');

class DirectSoundHook {
  constructor() {
    this.nativeModule = null;
    this.isInitialized = false;
    this.audioFrameCallback = null;
    this.pollInterval = null;
    this.pollRate = 60; // Hz（每秒轮询次数）
  }

  /**
   * 加载原生模块
   * @returns {boolean} 成功/失败
   */
  loadNativeModule() {
    try {
      // 尝试加载编译后的原生模块
      const nativePath = path.join(__dirname, '../../native/build/Release/dualsense_hook.node');
      
      if (!fs.existsSync(nativePath)) {
        console.warn('Native module not found at:', nativePath);
        console.warn('Please compile the C++ module first using CMake');
        return false;
      }

      this.nativeModule = require(nativePath);
      console.log('Native module loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load native module:', error.message);
      return false;
    }
  }

  /**
   * 初始化 Hook
   * @returns {boolean} 成功/失败
   */
  initialize() {
    if (!this.nativeModule) {
      if (!this.loadNativeModule()) {
        return false;
      }
    }

    try {
      if (typeof this.nativeModule.Initialize !== 'function') {
        console.error('Native module Initialize function not found');
        return false;
      }

      const result = this.nativeModule.Initialize();
      if (result === 0) {
        this.isInitialized = true;
        console.log('DirectSound Hook initialized');
        return true;
      } else {
        console.error('Native Initialize failed with code:', result);
        return false;
      }
    } catch (error) {
      console.error('Failed to initialize Hook:', error.message);
      return false;
    }
  }

  /**
   * 启动音频轮询
   * @param {Function} callback - 接收 AudioFrame 的回调函数
   */
  startAudioCapture(callback) {
    if (!this.isInitialized) {
      console.error('Hook not initialized');
      return false;
    }

    this.audioFrameCallback = callback;
    const pollIntervalMs = 1000 / this.pollRate;

    this.pollInterval = setInterval(() => {
      try {
        if (this.nativeModule && typeof this.nativeModule.GetAudioFrame === 'function') {
          const buffer = new Float32Array(4096);
          const sampleCountRef = new Int32Array(1);
          
          const result = this.nativeModule.GetAudioFrame(buffer, sampleCountRef, 4096);
          
          if (result === 1 && sampleCountRef[0] > 0) {
            const audioFrame = {
              samples: buffer.slice(0, sampleCountRef[0]),
              sampleCount: sampleCountRef[0],
              sampleRate: 48000, // 假设采样率为 48kHz（常见游戏设置）
              timestamp: Date.now(),
            };

            if (this.audioFrameCallback) {
              this.audioFrameCallback(audioFrame);
            }
          }
        }
      } catch (error) {
        console.error('Error in audio polling:', error.message);
      }
    }, pollIntervalMs);

    console.log(`Audio capture started (polling at ${this.pollRate}Hz)`);
    return true;
  }

  /**
   * 停止音频轮询
   */
  stopAudioCapture() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.audioFrameCallback = null;
    console.log('Audio capture stopped');
  }

  /**
   * 关闭 Hook
   */
  shutdown() {
    this.stopAudioCapture();

    if (this.nativeModule && typeof this.nativeModule.Shutdown === 'function') {
      try {
        this.nativeModule.Shutdown();
        this.isInitialized = false;
        console.log('DirectSound Hook shutdown');
      } catch (error) {
        console.error('Failed to shutdown Hook:', error.message);
      }
    }
  }

  /**
   * 获取队列中的音频帧数
   */
  getQueueSize() {
    if (this.nativeModule && typeof this.nativeModule.GetQueueSize === 'function') {
      return this.nativeModule.GetQueueSize();
    }
    return 0;
  }

  /**
   * 检查 Hook 状态
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      moduleLoaded: this.nativeModule !== null,
      capturing: this.pollInterval !== null,
      queueSize: this.getQueueSize(),
    };
  }
}

module.exports = DirectSoundHook;
