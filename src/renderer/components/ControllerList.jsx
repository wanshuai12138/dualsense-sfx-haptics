import React from 'react';
import './ControllerList.css';

function ControllerList({ controllers, selectedController, onSelectController }) {
  return (
    <div className="controller-list">
      {controllers.map((controller) => (
        <div
          key={controller.path}
          className={`controller-item ${
            selectedController === controller.path ? 'selected' : ''
          }`}
          onClick={() => onSelectController(controller.path)}
        >
          <div className="controller-icon">🎮</div>
          <div className="controller-info">
            <h3>{controller.product || 'DualSense Controller'}</h3>
            <p className="serial">{controller.serialNumber || '未知序列号'}</p>
            <p className="status">
              <span className="status-badge connected">● 已连接</span>
            </p>
          </div>
          <div className="select-indicator">
            {selectedController === controller.path && (
              <div className="checkmark">✓</div>
            )}
          </div>
        </div>
      ))}

      {controllers.length === 0 && (
        <div className="empty-state">
          <p>暂无连接的手柄</p>
        </div>
      )}
    </div>
  );
}

export default ControllerList;
