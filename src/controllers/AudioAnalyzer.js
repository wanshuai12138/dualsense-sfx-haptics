/**
 * AudioAnalyzer.js - 音频频率分析和特征提取
 * 使用 FFT 进行频谱分析，提取 SFX 特征
 */

class AudioAnalyzer {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.fftSize = 2048; // FFT 窗口大小
    this.windowFunction = this.createHanningWindow(this.fftSize);
    
    // 特征缓存
    this.lastFeatures = null;
  }

  /**
   * 创建汉宁窗函数（用于 FFT 前处理）
   */
  createHanningWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  /**
   * 简单的 FFT 实现（使用 Cooley-Tukey 算法）
   * @param {Float32Array} input - 输入信号
   * @returns {Float32Array} 频谱幅度
   */
  fft(input) {
    const N = Math.min(input.length, this.fftSize);
    
    // 如果输入不足 FFT 大小，填充零
    const padded = new Float32Array(this.fftSize);
    for (let i = 0; i < N; i++) {
      padded[i] = input[i] * this.windowFunction[i];
    }

    // 使用简化的 FFT：这里实现一个基础版本
    // 真实应用中应使用 FFT.js 库或 Web Audio API
    return this.simpleFFT(padded);
  }

  /**
   * 简化的 FFT 实现（仅用于原型）
   * 实际应该用 FFT.js 库替换
   */
  simpleFFT(input) {
    const N = input.length;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    // 初始化实部（输入信号）
    for (let i = 0; i < N; i++) {
      real[i] = input[i];
    }

    // 基础 DFT（Discrete Fourier Transform）
    // 注意：这是 O(n²) 的低效实现，仅用于演示
    const spectrum = new Float32Array(N / 2);
    
    for (let k = 0; k < N / 2; k++) {
      let realPart = 0;
      let imagPart = 0;

      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N;
        realPart += input[n] * Math.cos(angle);
        imagPart += input[n] * Math.sin(angle);
      }

      // 计算幅度（频谱）
      spectrum[k] = Math.sqrt(realPart * realPart + imagPart * imagPart) / N;
    }

    return spectrum;
  }

  /**
   * 计算 RMS（均方根）能量
   */
  computeRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * 计算峰值频率（最强能量的频率）
   */
  computePeakFrequency(spectrum) {
    let maxEnergy = 0;
    let peakBin = 0;

    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > maxEnergy) {
        maxEnergy = spectrum[i];
        peakBin = i;
      }
    }

    // 将 Bin 转换为 Hz
    const freqPerBin = this.sampleRate / (spectrum.length * 2);
    return peakBin * freqPerBin;
  }

  /**
   * 计算频率范围内的能量
   */
  computeFreqRangeEnergy(spectrum, lowHz, highHz) {
    const freqPerBin = this.sampleRate / (spectrum.length * 2);
    const lowBin = Math.floor(lowHz / freqPerBin);
    const highBin = Math.floor(highHz / freqPerBin);

    let energy = 0;
    for (let i = lowBin; i < highBin && i < spectrum.length; i++) {
      energy += spectrum[i];
    }

    return energy;
  }

  /**
   * 计算零点交叉率（用于检测音频特征变化）
   */
  computeZeroCrossingRate(samples) {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i - 1] >= 0 && samples[i] < 0) ||
          (samples[i - 1] < 0 && samples[i] >= 0)) {
        crossings++;
      }
    }
    return crossings / samples.length;
  }

  /**
   * 主分析函数 - 提取音频特征
   * @param {AudioFrame} audioFrame - 音频帧数据
   * @returns {Object} 提取的特征
   */
  analyze(audioFrame) {
    if (!audioFrame || audioFrame.samples.length === 0) {
      return null;
    }

    const samples = audioFrame.samples;

    // 计算基本特征
    const rms = this.computeRMS(samples);
    
    // 计算 FFT 和频率特征
    const spectrum = this.fft(samples);
    const peakFreq = this.computePeakFrequency(spectrum);
    const zcr = this.computeZeroCrossingRate(samples);

    // 计算不同频率范围的能量
    const lowFreqEnergy = this.computeFreqRangeEnergy(spectrum, 0, 500);      // 低频
    const midFreqEnergy = this.computeFreqRangeEnergy(spectrum, 500, 2000);   // 中低频
    const highFreqEnergy = this.computeFreqRangeEnergy(spectrum, 2000, 8000); // 高频
    const veryHighFreqEnergy = this.computeFreqRangeEnergy(spectrum, 8000, 20000); // 极高频

    // 冲击特征（能量集中度）
    const totalEnergy = lowFreqEnergy + midFreqEnergy + highFreqEnergy + veryHighFreqEnergy;
    const impactStrength = (totalEnergy > 0) ? Math.max(highFreqEnergy, veryHighFreqEnergy) / totalEnergy : 0;

    const features = {
      timestamp: audioFrame.timestamp,
      rms: rms,
      peakFreq: peakFreq,
      zcr: zcr,
      lowFreqEnergy: lowFreqEnergy,
      midFreqEnergy: midFreqEnergy,
      highFreqEnergy: highFreqEnergy,
      veryHighFreqEnergy: veryHighFreqEnergy,
      totalEnergy: totalEnergy,
      impactStrength: impactStrength, // 0-1，1 表示纯高频冲击
      spectrum: spectrum, // 完整频谱（用于调试）
    };

    this.lastFeatures = features;
    return features;
  }

  /**
   * 获取上一次分析的结果
   */
  getLastFeatures() {
    return this.lastFeatures;
  }
}

module.exports = AudioAnalyzer;
