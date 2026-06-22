import React, { useState } from 'react';
import './VibrationControl.css';

function VibrationControl({ controllerId }) {
  const [leftMotor, setLeftMotor] = useState(0.5);
  const [rightMotor, setRightMotor] = useState(0.5);
  const [duration, setDuration] = useState(200);
  const [isVibrating, setIsVibrating] = useState(false);
  const [message, setMessage] = useState('');

  const vibrationPresets = [
    { name: '轻微震动', left: 0.3, right: 0.3, duration: 100 },
    { name: '中等震动', left: 0.6, right: 0.6, duration: 200 },
    { name: '强烈震动', left: 1.0, right: 1.0, duration: 300 },
    { name: '左侧震动', left: 1.0, right: 0.0, duration: 150 },
    { name: '右侧震动', left: 0.0, right: 1.0, duration: 150 },
    { name: '交替震动', left: 1.0, right: 0.3, duration: 200 },
    { name: '快速震动', left: 0.8, right: 0.8, duration: 50 },
    { name: '脉冲震动', left: 0.5, right: 0.5, duration: 100 },
  ];

  const sendVibration = async (left = leftMotor, right = rightMotor, dur = duration) => {
    try {
      setIsVibrating(true);
      setMessage('正在发送震动...');

      const result = await window.api.sendVibration(
        controllerId,
        left,
        right,
        dur
      );

      if (result.success) {
        setMessage(`✓ ${result.message}`);
      } else {
        setMessage(`✗ 错误: ${result.error}`);
      }

      setTimeout(() => {
        setIsVibrating(false);
      }, dur);

      setTimeout(() => {
        setMessage('');
      }, 2000);
    } catch (error) {
      console.error('震动失败:', error);
      setMessage('✗ 震动失败');
      setIsVibrating(false);
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const applyPreset = (preset) => {
    setLeftMotor(preset.left);
    setRightMotor(preset.right);
    setDuration(preset.duration);
    sendVibration(preset.left, preset.right, preset.duration);
  };

  const stopVibration = async () => {
    try {
      await window.api.stopVibration(controllerId);
      setIsVibrating(false);
      setMessage('✓ 震动已停止');
      setTimeout(() => setMessage(''), 1500);
    } catch (error) {
      console.error('停止失败:', error);
      setMessage('✗ 停止失败');
    }
  };

  return (
    <div className="vibration-control">
      <div className="control-group">
        <label>左侧电机强度</label>
        <div className="slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={leftMotor}
            onChange={(e) => setLeftMotor(parseFloat(e.target.value))}
            disabled={isVibrating}
            className="slider"
          />
          <span className="value-display">{Math.round(leftMotor * 100)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>右侧电机强度</label>
        <div className="slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={rightMotor}
            onChange={(e) => setRightMotor(parseFloat(e.target.value))}
            disabled={isVibrating}
            className="slider"
          />
          <span className="value-display">{Math.round(rightMotor * 100)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>震动时长 (ms)</label>
        <div className="slider-container">
          <input
            type="range"
            min="50"
            max="1000"
            step="50"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            disabled={isVibrating}
            className="slider"
          />
          <span className="value-display">{duration}ms</span>
        </div>
      </div>

      <div className="button-group">
        <button
          className="btn btn-primary"
          onClick={() => sendVibration()}
          disabled={isVibrating}
        >
          {isVibrating ? '正在震动中...' : '发送震动'}
        </button>
        <button
          className="btn btn-danger"
          onClick={stopVibration}
          disabled={!isVibrating}
        >
          停止
        </button>
      </div>

      {message && <div className={`message ${isVibrating ? 'loading' : ''}`}>{message}</div>}

      <div className="presets-section">
        <h3>预设</h3>
        <div className="presets-grid">
          {vibrationPresets.map((preset) => (
            <button
              key={preset.name}
              className="preset-btn"
              onClick={() => applyPreset(preset)}
              disabled={isVibrating}
              title={`左:${Math.round(preset.left * 100)}% 右:${Math.round(preset.right * 100)}%`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default VibrationControl;
