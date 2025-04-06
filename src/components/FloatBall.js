/**
 * 悬浮球组件
 */
export class FloatBall {
  constructor(onTogglePanel) {
    this.element = null;
    this.onTogglePanel = onTogglePanel;
    this.isVisible = true;
    this.init();
  }

  init() {
    // 创建悬浮球元素
    this.element = document.createElement('div');
    this.element.className = 'event-tracker-float-ball';
    
    // 添加点击事件监听器
    this.element.addEventListener('click', () => {
      if (this.onTogglePanel) {
        this.onTogglePanel();
      }
    });
    
    // 添加到页面
    document.body.appendChild(this.element);
  }

  /**
   * 设置悬浮球可见性
   * @param {boolean} visible 是否可见
   */
  setVisible(visible) {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }
} 