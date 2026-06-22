/**
 * test-sfx-detection.js - SFX 检测测试脚本
 * 用于验证音频分析、检测和映射的工作流程
 * 使用模拟的音频数据进行测试
 */

const AudioAnalyzer = require('./src/controllers/AudioAnalyzer');
const SFXDetector = require('./src/controllers/SFXDetector');
const HapticMapper = require('./src/controllers/HapticMapper');

/**
 * 生成测试音频（模拟拼刀音效）
 * 特征：
 * - 高频正弦波（2000-3000Hz）
 * - 快速能量上升（冲击）
 * - 短持续时间（50ms）
 */
function generateClashAudio(sampleRate = 48000, durationMs = 50, peakHz = 2500) {
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(sampleCount);

  // 生成调制的正弦波
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    
    // 快速能量包络（ADSR 的近似）
    let envelope;
    if (t < 0.01) {
      // 快速上升（Attack）
      envelope = t / 0.01;
    } else if (t < 0.03) {
      // 衰减（Decay）
      envelope = 1.0 - ((t - 0.01) / 0.02) * 0.3;
    } else {
      // 衰减持续（Release）
      envelope = Math.exp(-(t - 0.03) / 0.02);
    }

    // 高频正弦波 + 一些谐波
    const phase = 2 * Math.PI * peakHz * t;
    const fundamental = Math.sin(phase);
    const harmonic2 = 0.3 * Math.sin(phase * 2);
    const harmonic3 = 0.1 * Math.sin(phase * 3);

    // 添加噪声以模拟真实音效
    const noise = (Math.random() - 0.5) * 0.1;

    samples[i] = (fundamental + harmonic2 + harmonic3) * envelope + noise;
    samples[i] *= 0.7; // 降低幅度以避免剪裁
  }

  return samples;
}

/**
 * 生成背景音乐（低频）
 */
function generateBackgroundMusic(sampleRate = 48000, durationMs = 100) {
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(sampleCount);

  // 低频信号（模拟背景音乐）
  const lowFreq = 440; // A4 音符

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * lowFreq * t;
    
    samples[i] = Math.sin(phase) * 0.3; // 较低幅度
  }

  return samples;
}

// ============ 测试执行 ============

console.log('='.repeat(60));
console.log('DualSense SFX Detection - 测试脚本');
console.log('='.repeat(60));

const analyzer = new AudioAnalyzer();
const detector = new SFXDetector();
const mapper = new HapticMapper();

// 测试 1：拼刀音效检测
console.log('\n[测试 1] 拼刀音效检测');
console.log('-'.repeat(60));

const clashSamples = generateClashAudio(48000, 50, 2500);
const clashFrame = {
  samples: clashSamples,
  sampleCount: clashSamples.length,
  sampleRate: 48000,
  timestamp: Date.now(),
};

const clashFeatures = analyzer.analyze(clashFrame);
console.log('音频特征:');
console.log(`  RMS 能量: ${clashFeatures.rms.toFixed(3)}`);
console.log(`  峰值频率: ${clashFeatures.peakFreq.toFixed(0)} Hz`);
console.log(`  零点交叉率: ${clashFeatures.zcr.toFixed(3)}`);
console.log(`  高频能量: ${clashFeatures.highFreqEnergy.toFixed(3)}`);
console.log(`  冲击强度: ${clashFeatures.impactStrength.toFixed(3)}`);

const clashDetection = detector.detect(clashFeatures);
console.log('\n检测结果:');
console.log(`  是否为 SFX: ${clashDetection.isSFX ? '✓ 是' : '✗ 否'}`);
console.log(`  SFX 分数: ${clashDetection.score.toFixed(3)} (阈值: 0.5)`);
console.log(`  规则得分:`);
for (const [rule, score] of Object.entries(clashDetection.details)) {
  if (rule !== 'timestamp' && rule !== 'peakFreq' && rule !== 'rms') {
    console.log(`    - ${rule}: ${(score * 100).toFixed(0)}%`);
  }
}

if (clashDetection.isSFX) {
  const hapticParams = mapper.map(clashFeatures, clashDetection.score);
  console.log('\n映射到震动参数:');
  console.log(`  强度: ${(hapticParams.intensity * 100).toFixed(0)}%`);
  console.log(`  频率: ${hapticParams.frequency ?? 'N/A'} Hz`);
  console.log(`  持续时间: ${hapticParams.duration} ms`);
}

// 测试 2：背景音乐（应该被拒绝）
console.log('\n[测试 2] 背景音乐检测（应被忽略）');
console.log('-'.repeat(60));

const musicSamples = generateBackgroundMusic(48000, 100);
const musicFrame = {
  samples: musicSamples,
  sampleCount: musicSamples.length,
  sampleRate: 48000,
  timestamp: Date.now(),
};

const musicFeatures = analyzer.analyze(musicFrame);
console.log('音频特征:');
console.log(`  RMS 能量: ${musicFeatures.rms.toFixed(3)}`);
console.log(`  峰值频率: ${musicFeatures.peakFreq.toFixed(0)} Hz`);
console.log(`  冲击强度: ${musicFeatures.impactStrength.toFixed(3)}`);

const musicDetection = detector.detect(musicFeatures);
console.log('\n检测结果:');
console.log(`  是否为 SFX: ${musicDetection.isSFX ? '✓ 是' : '✗ 否'} (应为否)`);
console.log(`  SFX 分数: ${musicDetection.score.toFixed(3)} (阈值: 0.5)`);

// 测试 3：参数调整
console.log('\n[测试 3] 检测器参数调整');
console.log('-'.repeat(60));

console.log('当前配置:');
const config = detector.getConfig();
console.log(`  频率范围: ${config.minFreq}-${config.maxFreq} Hz`);
console.log(`  RMS 阈值: ${config.rmsThreshold}`);
console.log(`  冲击阈值: ${config.impactThreshold}`);

// 降低阈值以增加灵敏度
detector.updateConfig({
  minFreq: 1000,
  maxFreq: 5000,
  rmsThreshold: 0.08,
  sfxScoreThreshold: 0.4, // 更容易触发
});

console.log('\n调整后的配置:');
const newConfig = detector.getConfig();
console.log(`  频率范围: ${newConfig.minFreq}-${newConfig.maxFreq} Hz`);
console.log(`  RMS 阈值: ${newConfig.rmsThreshold}`);
console.log(`  SFX 分数阈值: ${newConfig.sfxScoreThreshold}`);

// 重新检测拼刀
const clashDetection2 = detector.detect(clashFeatures);
console.log('\n使用新参数重新检测拼刀:');
console.log(`  SFX 分数: ${clashDetection2.score.toFixed(3)}`);
console.log(`  是否为 SFX: ${clashDetection2.isSFX ? '✓ 是' : '✗ 否'}`);

// 测试 4：映射模式比较
console.log('\n[测试 4] 不同映射模式比较');
console.log('-'.repeat(60));

const modes = ['energy', 'frequency', 'hybrid'];

for (const mode of modes) {
  mapper.updateConfig({ mappingMode: mode });
  const params = mapper.map(clashFeatures, clashDetection.score);
  console.log(`\n模式: ${mode}`);
  console.log(`  强度: ${(params.intensity * 100).toFixed(0)}%`);
  console.log(`  频率: ${params.frequency ?? 'N/A'} Hz`);
  console.log(`  持续时间: ${params.duration} ms`);
}

console.log('\n' + '='.repeat(60));
console.log('✓ 测试完成');
console.log('='.repeat(60));
