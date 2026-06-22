import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ControllerList from './components/ControllerList';
import VibrationControl from './components/VibrationControl';

function App() {
  const [controllers, setControllers] = useState([]);
  const [selectedController, setSelectedController] = useState(null);
  const [loading, setLoading] = useState(true);
  const watcherInitialized = useRef(false);

  useEffect(() => {
    // 初始化 - 获取已连接的控制器
    const initControllers = async () => {
      try {
        const result = await window.api.getControllers();
        setControllers(result);
        if (result.length > 0) {
          setSelectedController(result[0].path);
        }
      } catch (error) {
        console.error('获取控制器失败:', error);
      } finally {
        setLoading(false);
      }
    };

    initControllers();

    // 监听控制器连接状态变化
    if (!watcherInitialized.current) {
      window.api.watchControllers((updatedControllers) => {
        setControllers(updatedControllers);
        
        // 如果选中的控制器断开连接，选择第一个可用的
        if (!updatedControllers.find(c => c.path === selectedController) && updatedControllers.length > 0) {
          setSelectedController(updatedControllers[0].path);
        }
      });
      watcherInitialized.current = true;
    }

    return () => {
      window.api.removeWatchControllers();
    };
  }, [selectedController]);

  return (
    <div className="App">
      <header className="app-header">
        <h1>🎮 DualSense 震动工具</h1>
        <p>Sony PS5 手柄游戏辅助系统</p>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading">
            <p>正在加载...</p>
          </div>
        ) : controllers.length === 0 ? (
          <div className="no-controllers">
            <p>未检测到 DualSense 手柄</p>
            <p style={{ fontSize: '14px', color: '#666' }}>
              请确保手柄已通过 USB 或蓝牙连接
            </p>
          </div>
        ) : (
          <div className="content">
            <section className="controllers-section">
              <h2>已连接的手柄</h2>
              <ControllerList 
                controllers={controllers}
                selectedController={selectedController}
                onSelectController={setSelectedController}
              />
            </section>

            {selectedController && (
              <section className="control-section">
                <h2>震动控制</h2>
                <VibrationControl 
                  controllerId={selectedController}
                />
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>DualSense 手柄震动工具 v1.0.0</p>
      </footer>
    </div>
  );
}

export default App;
