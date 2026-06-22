/**
 * SFXDetector.js - 游戏 SFX（特效音）检测
 * 使用音频特征和规则引擎识别特定的游戏音效
 * 针对《只狼》的拼刀音效优化
 */

class SFXDetector {
  constructor(options = {}) {
    // 拼刀音效特征参数（可调）
    this.config = {
      // 频率范围（Hz）
      minFreq: options.minFreq || 800,
      maxFreq: options.maxFreq || 4000,
      
      // 能量阈值
      rmsThreshold: options.rmsThreshold || 0.1,
      impactThreshold: options.impactThreshold || 0.4,
      
      // 冲击检测（快速能量上升）
      onsetWindow: options.onsetWindow || 5, // 帧数
      onsetThreshold: options.onsetThreshold || 0.3,
      
      // SFX 分数阈值（0-1）
      sfxScoreThreshold: options.sfxScoreThreshold || 0.5,
    };

    // 能量历史（用于 Onset Detection）
    this.energyHistory = [];
    this.maxHistorySize = this.config.onsetWindow;

    // 检测结果缓存
    this.lastDetectionResult = null;
  }

  /**
   * 检查频率是否在目标范围内
   */
  isFreqInRange(peakFreq) {
    return peakFreq >= this.config.minFreq && peakFreq <= this.config.maxFreq;
  }

  /**
   * 计算能量梯度（Onset Detection）
   * 快速能量上升 → 可能是冲击音
   */
  computeOnsetStrength(currentRMS) {
    this.energyHistory.push(currentRMS);
    
    if (this.energyHistory.length > this.maxHistorySize) {
      this.energyHistory.shift();
    }

    if (this.energyHistory.length < 2) {
      return 0;
    }

    // 计算最近的能量梯度
    const current = this.energyHistory[this.energyHistory.length - 1];
    const previous = this.energyHistory[this.energyHistory.length - 2];
    const gradient = current - previous;

    // 归一化梯度
    const maxGradient = 0.5; // 假设最大能量变化为 0.5
    return Math.max(0, Math.min(1, gradient / maxGradient));
  }

  /**
   * 规则 1：频率范围检查（拼刀音效是高频）
   */
  ruleFreqRange(features) {
    if (this.isFreqInRange(features.peakFreq)) {
      return 1.0; // 满足频率范围
    }
    return 0;
  }

  /**
   * 规则 2：能量检查（需要足够的能量）
   */
  ruleEnergy(features) {
    if (features.rms < this.config.rmsThreshold) {
      return 0; // 能量太低
    }

    // 能量越高，分数越高（但有饱和点）
    const maxRMS = 1.0;
    return Math.min(1.0, features.rms / maxRMS);
  }

  /**
   * 规则 3：冲击强度（高频能量占比）
   */
  ruleImpactStrength(features) {
    if (features.impactStrength < this.config.impactThreshold) {
      return 0; // 冲击不明显
    }

    return features.impactStrength;
  }

  /**
   * 规则 4：冲击检测（能量快速上升）
   */
  ruleOnset(features) {
    const onsetStrength = this.computeOnsetStrength(features.rms);
    
    if (onsetStrength < this.config.onsetThreshold) {
      return 0; // 没有明显的能量冲击
    }

    return onsetStrength;
  }

  /**
   * 规则 5：零点交叉率（高 ZCR → 高频内容多）
   */
  ruleZeroCrossingRate(features) {
    // 拼刀音效应该有较高的 ZCR（包含高频成分）
    const minZCR = 0.1;
    const maxZCR = 0.5;

    if (features.zcr < minZCR) {
      return 0; // ZCR 太低
    }

    // 正常化 ZCR 分数
    return Math.min(1.0, features.zcr / maxZCR);
  }

  /**
   * 规则 6：频率集中度（峰值明显）
   * 拼刀音效应该有明显的主频率峰值
   */
  ruleFreqConcentration(features) {
    // 高频能量相对于总能量的比例
    const highFreqRatio = features.highFreqEnergy / (features.totalEnergy + 1e-6);
    
    // 如果高频能量占 30% 以上，认为有明显峰值
    if (highFreqRatio > 0.3) {
      return Math.min(1.0, highFreqRatio);
    }

    return 0;
  }

  /**
   * 综合所有规则进行 SFX 检测
   * @param {Object} features - 音频特征
   * @returns {Object} 检测结果
   */
  detect(features) {
    if (!features) {
      return {
        isSFX: false,
        score: 0,
        details: {},
      };
    }

    // 应用所有规则
    const ruleScores = {
      freqRange: this.ruleFreqRange(features),
      energy: this.ruleEnergy(features),
      impactStrength: this.ruleImpactStrength(features),
      onset: this.ruleOnset(features),
      zcr: this.ruleZeroCrossingRate(features),
      freqConcentration: this.ruleFreqConcentration(features),
    };

    // 加权综合（权重可根据实验调整）
    const weights = {
      freqRange: 0.25,         // 频率范围很重要
      energy: 0.15,            // 能量存在就可以
      impactStrength: 0.20,    // 冲击强度重要
      onset: 0.15,             // 能量快速上升
      zcr: 0.10,               // 零点交叉率辅助
      freqConcentration: 0.15, // 频率集中度重要
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [rule, score] of Object.entries(ruleScores)) {
      totalScore += score * weights[rule];
      totalWeight += weights[rule];
    }

    const sfxScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const isSFX = sfxScore >= this.config.sfxScoreThreshold;

    this.lastDetectionResult = {
      isSFX: isSFX,
      score: sfxScore,
      details: {
        ...ruleScores,
        timestamp: features.timestamp,
        peakFreq: features.peakFreq,
        rms: features.rms,
      },
    };

    return this.lastDetectionResult;
  }

  /**
   * 获取上次检测的结果
   */
  getLastResult() {
    return this.lastDetectionResult;
  }

  /**
   * 更新配置参数
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 重置检测器状态
   */
  reset() {
    this.energyHistory = [];
    this.lastDetectionResult = null;
  }
}

module.exports = SFXDetector;
