/**
 * HapticMapper.js - 音频特征映射到 DualSense 震动参数
 * 将 SFX 检测结果转换为手柄控制命令
 */

class HapticMapper {
  constructor(options = {}) {
    // DualSense 震动参数范围
    this.hapticConfig = {
      // 强度范围 (0.0 - 1.0)
      minIntensity: options.minIntensity || 0.2,
      maxIntensity: options.maxIntensity || 1.0,

      // 频率范围（Hz，可选）
      minFreq: options.minFreq || 10,
      maxFreq: options.maxFreq || 255,

      // 持续时间范围（ms）
      minDuration: options.minDuration || 20,
      maxDuration: options.maxDuration || 100,

      // 映射模式
      mappingMode: options.mappingMode || 'frequency', // 'energy', 'frequency', 'hybrid'
    };

    // 参数历史（用于平滑处理）
    this.lastHapticParams = null;
    this.smoothingFactor = 0.3; // 平滑因子（0-1）
  }

  /**
   * 将 RMS 能量映射到强度 (0-1)
   */
  energyToIntensity(rms, sfxScore) {
    // 结合 RMS 和 SFX 分数
    const baseIntensity = Math.min(rms, 1.0);
    const adjustedIntensity = baseIntensity * sfxScore;

    // 限制在配置范围内
    return Math.max(
      this.hapticConfig.minIntensity,
      Math.min(this.hapticConfig.maxIntensity, adjustedIntensity)
    );
  }

  /**
   * 将峰值频率映射到手柄频率 (Hz)
   */
  freqToHapticFreq(peakFreq) {
    // 游戏 SFX 频率（Hz） → DualSense 频率（Hz）
    // 拼刀音效 800-4000Hz → DualSense 10-255Hz
    
    // 映射公式：将输入频率范围压缩到手柄范围
    const gameFreqMin = 100;
    const gameFreqMax = 8000;
    const hapticFreqMin = this.hapticConfig.minFreq;
    const hapticFreqMax = this.hapticConfig.maxFreq;

    // 线性映射
    const normalized = (peakFreq - gameFreqMin) / (gameFreqMax - gameFreqMin);
    const clipped = Math.max(0, Math.min(1, normalized));
    const hapticFreq = hapticFreqMin + clipped * (hapticFreqMax - hapticFreqMin);

    return Math.round(hapticFreq);
  }

  /**
   * 将冲击强度映射到持续时间 (ms)
   * 冲击越强 → 持续时间越长
   */
  impactToDuration(impactStrength) {
    const minDuration = this.hapticConfig.minDuration;
    const maxDuration = this.hapticConfig.maxDuration;

    const duration = minDuration + impactStrength * (maxDuration - minDuration);
    return Math.round(duration);
  }

  /**
   * 基于能量的映射（简单）
   */
  mapByEnergy(features, sfxScore) {
    return {
      intensity: this.energyToIntensity(features.rms, sfxScore),
      duration: this.impactToDuration(features.impactStrength),
      frequency: undefined, // 不使用频率
    };
  }

  /**
   * 基于频率的映射
   */
  mapByFrequency(features, sfxScore) {
    return {
      intensity: this.energyToIntensity(features.rms, sfxScore),
      duration: this.impactToDuration(features.impactStrength),
      frequency: this.freqToHapticFreq(features.peakFreq),
    };
  }

  /**
   * 混合映射（结合频率和能量）
   */
  mapHybrid(features, sfxScore) {
    const intensity = this.energyToIntensity(features.rms, sfxScore);
    const duration = this.impactToDuration(features.impactStrength);
    const frequency = this.freqToHapticFreq(features.peakFreq);

    // 根据频率调整强度（高频减弱，低频增强）
    const freqAdjust = 1.0 - (frequency - this.hapticConfig.minFreq) / 
                       (this.hapticConfig.maxFreq - this.hapticConfig.minFreq) * 0.3;
    
    return {
      intensity: intensity * freqAdjust,
      duration: duration,
      frequency: frequency,
    };
  }

  /**
   * 平滑处理（防止参数抖动）
   */
  smoothParams(newParams) {
    if (!this.lastHapticParams) {
      this.lastHapticParams = newParams;
      return newParams;
    }

    const smoothed = {
      intensity: this.lastHapticParams.intensity * (1 - this.smoothingFactor) +
                 newParams.intensity * this.smoothingFactor,
      duration: Math.round(
        this.lastHapticParams.duration * (1 - this.smoothingFactor) +
        newParams.duration * this.smoothingFactor
      ),
    };

    if (newParams.frequency !== undefined) {
      smoothed.frequency = Math.round(
        (this.lastHapticParams.frequency || newParams.frequency) * (1 - this.smoothingFactor) +
        newParams.frequency * this.smoothingFactor
      );
    }

    this.lastHapticParams = smoothed;
    return smoothed;
  }

  /**
   * 主映射函数
   * @param {Object} features - 音频特征
   * @param {number} sfxScore - SFX 检测分数 (0-1)
   * @returns {Object} DualSense 震动参数
   */
  map(features, sfxScore) {
    if (!features || sfxScore < 0.3) {
      // SFX 分数过低，不响应
      return {
        intensity: 0,
        duration: 0,
        frequency: undefined,
      };
    }

    let hapticParams;

    switch (this.hapticConfig.mappingMode) {
      case 'energy':
        hapticParams = this.mapByEnergy(features, sfxScore);
        break;
      case 'frequency':
        hapticParams = this.mapByFrequency(features, sfxScore);
        break;
      case 'hybrid':
        hapticParams = this.mapHybrid(features, sfxScore);
        break;
      default:
        hapticParams = this.mapByEnergy(features, sfxScore);
    }

    // 应用平滑处理
    return this.smoothParams(hapticParams);
  }

  /**
   * 获取上一次映射的结果
   */
  getLastParams() {
    return this.lastHapticParams;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.hapticConfig = {
      ...this.hapticConfig,
      ...newConfig,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig() {
    return { ...this.hapticConfig };
  }

  /**
   * 设置平滑因子
   */
  setSmoothingFactor(factor) {
    this.smoothingFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * 重置映射器
   */
  reset() {
    this.lastHapticParams = null;
  }
}

module.exports = HapticMapper;
