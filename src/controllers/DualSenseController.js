const HID = require('node-hid');

class DualSenseController {
  constructor() {
    this.devices = {};
    this.watchers = [];
    this.vibrationTimeouts = {};
  }

  // 获取所有连接的 DualSense 控制器
  getConnectedControllers() {
    const devices = HID.devices();
    const dualSenseDevices = devices.filter(device => {
      // Sony VID: 0x054C, DualSense PID: 0x0CE6 (USB) 或 0x0DF2 (Bluetooth)
      return device.vendorId === 0x054C && 
             (device.productId === 0x0CE6 || device.productId === 0x0DF2);
    });

    const controllers = dualSenseDevices.map(device => ({
      path: device.path,
      vendorId: device.vendorId,
      productId: device.productId,
      manufacturer: device.manufacturer,
      product: device.product,
      serialNumber: device.serialNumber,
      connected: true,
    }));

    return controllers;
  }

  // 获取控制器信息
  getControllerInfo(devicePath) {
    const devices = HID.devices();
    const device = devices.find(d => d.path === devicePath);
    
    if (!device) {
      return null;
    }

    return {
      path: device.path,
      manufacturer: device.manufacturer,
      product: device.product,
      serialNumber: device.serialNumber,
      vendorId: device.vendorId,
      productId: device.productId,
    };
  }

  // 发送震动命令给 DualSense 手柄
  vibrate(devicePath, leftMotor, rightMotor, duration = 100) {
    try {
      // 清除之前的超时（如果有）
      if (this.vibrationTimeouts[devicePath]) {
        clearTimeout(this.vibrationTimeouts[devicePath]);
      }

      // 打开设备
      if (!this.devices[devicePath]) {
        this.devices[devicePath] = new HID.HID(devicePath);
      }

      const device = this.devices[devicePath];
      
      // DualSense 震动命令格式
      // 报告 ID: 0x09（输出报告）
      const report = Buffer.alloc(78);
      report[0] = 0x09; // 报告 ID
      
      // 设置标志
      report[1] = 0x00;
      report[2] = 0x00;
      report[3] = 0x09;
      
      // 右侧电机强度 (0-255)
      report[4] = Math.min(255, Math.round(rightMotor * 255));
      
      // 左侧电机强度 (0-255)  
      report[5] = Math.min(255, Math.round(leftMotor * 255));

      device.write(report);

      // 自动停止震动
      this.vibrationTimeouts[devicePath] = setTimeout(() => {
        this.stopVibration(devicePath);
      }, duration);

      return { success: true, message: `正在震动 ${duration}ms` };
    } catch (error) {
      console.error('震动出错:', error);
      return { success: false, error: error.message };
    }
  }

  // 停止震动
  stopVibration(devicePath) {
    try {
      if (this.vibrationTimeouts[devicePath]) {
        clearTimeout(this.vibrationTimeouts[devicePath]);
      }

      if (!this.devices[devicePath]) {
        return { success: true, message: '设备未连接' };
      }

      const device = this.devices[devicePath];
      const report = Buffer.alloc(78);
      report[0] = 0x09;
      report[1] = 0x00;
      report[2] = 0x00;
      report[3] = 0x09;
      report[4] = 0x00; // 右侧关闭
      report[5] = 0x00; // 左侧关闭

      device.write(report);
      return { success: true, message: '震动已停止' };
    } catch (error) {
      console.error('停止震动出错:', error);
      return { success: false, error: error.message };
    }
  }

  // 监听控制器连接/断开
  watchControllers(callback) {
    const checkInterval = setInterval(() => {
      const currentControllers = this.getConnectedControllers();
      callback(currentControllers);
    }, 1000);

    this.watchers.push(checkInterval);
  }

  // 清理资源
  cleanup() {
    // 关闭所有设备
    Object.values(this.devices).forEach(device => {
      try {
        device.close();
      } catch (e) {
        console.error('关闭设备错误:', e);
      }
    });

    // 停止所有监听
    this.watchers.forEach(interval => clearInterval(interval));

    // 清除超时
    Object.values(this.vibrationTimeouts).forEach(timeout => clearTimeout(timeout));
  }

  // 创建自定义震动模式
  playPattern(devicePath, pattern) {
    // pattern: [{ intensity: 0-1, duration: ms }, ...]
    return new Promise((resolve) => {
      const playNext = (index) => {
        if (index >= pattern.length) {
          resolve({ success: true, message: '模式播放完成' });
          return;
        }

        const { intensity, duration } = pattern[index];
        this.vibrate(devicePath, intensity, intensity, duration);

        setTimeout(() => {
          playNext(index + 1);
        }, duration + 50);
      };

      playNext(0);
    });
  }
}

module.exports = DualSenseController;
