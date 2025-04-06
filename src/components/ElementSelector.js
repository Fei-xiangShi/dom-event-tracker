/**
 * 元素选择器组件
 */
export class ElementSelector {
  constructor(onElementSelected) {
    this.overlay = null;
    this.tooltip = null;
    this.currentHighlightedElement = null;
    this.selectedElement = null;
    this.onElementSelected = onElementSelected;
    this.isActive = false;
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
    this.mouseClickHandler = this.handleMouseClick.bind(this);
  }

  /**
   * 启动选择模式
   */
  startSelection() {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // 创建蒙版
    this.overlay = document.createElement('div');
    this.overlay.className = 'event-tracker-overlay';
    document.body.appendChild(this.overlay);
    
    // 创建工具提示
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'event-tracker-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
    
    // 添加事件监听器
    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('click', this.mouseClickHandler, true);
    
    // 修改鼠标指针样式
    document.body.style.cursor = 'crosshair';
  }

  /**
   * 停止选择模式
   */
  stopSelection() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    // 移除事件监听器
    document.removeEventListener('mousemove', this.mouseMoveHandler);
    document.removeEventListener('click', this.mouseClickHandler, true);
    
    // 移除蒙版
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    
    // 移除工具提示
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    this.tooltip = null;
    
    // 移除高亮
    this.unhighlightElement();
    
    // 恢复鼠标指针样式
    document.body.style.cursor = '';
  }

  /**
   * 处理鼠标移动事件
   * @param {MouseEvent} event 鼠标事件
   */
  handleMouseMove(event) {
    if (!this.isActive) return;
    
    // 获取鼠标下的元素
    const element = document.elementFromPoint(event.clientX, event.clientY);
    
    // 如果是选择器自身的元素，则忽略
    if (this.isSelectorElement(element)) {
      this.unhighlightElement();
      this.hideTooltip();
      return;
    }
    
    // 高亮当前元素
    this.highlightElement(element);
    
    // 显示工具提示
    this.showTooltip(element, event.clientX, event.clientY);
  }

  /**
   * 处理鼠标点击事件
   * @param {MouseEvent} event 鼠标事件
   */
  handleMouseClick(event) {
    if (!this.isActive) return;
    
    // 阻止事件传播和默认行为
    event.stopPropagation();
    event.preventDefault();
    
    // 获取点击的元素
    const element = document.elementFromPoint(event.clientX, event.clientY);
    
    // 如果是选择器自身的元素，则忽略
    if (this.isSelectorElement(element)) {
      return;
    }
    
    // 设置选中的元素
    this.selectedElement = element;
    
    // 移除高亮并添加选中样式
    if (this.currentHighlightedElement) {
      this.currentHighlightedElement.classList.remove('event-tracker-highlight');
      this.currentHighlightedElement.classList.add('event-tracker-selected');
    }
    
    // 停止选择模式
    this.stopSelection();
    
    // 触发选中回调
    if (this.onElementSelected) {
      this.onElementSelected(element);
    }
  }

  /**
   * 高亮元素
   * @param {HTMLElement} element 要高亮的元素
   */
  highlightElement(element) {
    if (this.currentHighlightedElement === element) return;
    
    // 移除之前的高亮
    this.unhighlightElement();
    
    // 添加新的高亮
    if (element) {
      element.classList.add('event-tracker-highlight');
      this.currentHighlightedElement = element;
    }
  }

  /**
   * 取消高亮元素
   */
  unhighlightElement() {
    if (this.currentHighlightedElement) {
      this.currentHighlightedElement.classList.remove('event-tracker-highlight');
      this.currentHighlightedElement = null;
    }
  }

  /**
   * 显示工具提示
   * @param {HTMLElement} element 元素
   * @param {number} x 鼠标X坐标
   * @param {number} y 鼠标Y坐标
   */
  showTooltip(element, x, y) {
    if (!this.tooltip || !element) return;
    
    // 构建工具提示内容
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .filter(cls => !cls.startsWith('event-tracker-'))
      .map(cls => `.${cls}`)
      .join('');
    
    this.tooltip.textContent = `${tagName}${id}${classes}`;
    
    // 定位工具提示
    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y + 10}px`;
    this.tooltip.style.display = 'block';
  }

  /**
   * 隐藏工具提示
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  /**
   * 检查元素是否属于选择器组件
   * @param {HTMLElement} element 元素
   * @returns {boolean} 是否是选择器元素
   */
  isSelectorElement(element) {
    return element === this.overlay ||
           element === this.tooltip ||
           element.classList.contains('event-tracker-float-ball') ||
           element.classList.contains('event-tracker-panel') ||
           element.closest('.event-tracker-panel');
  }

  /**
   * 重新开始选择
   */
  resetSelection() {
    // 移除选中样式
    if (this.selectedElement) {
      this.selectedElement.classList.remove('event-tracker-selected');
    }
    
    this.selectedElement = null;
    this.startSelection();
  }

  /**
   * 销毁组件
   */
  destroy() {
    this.stopSelection();
    
    // 移除选中元素的样式
    if (this.selectedElement) {
      this.selectedElement.classList.remove('event-tracker-selected');
    }
    
    this.selectedElement = null;
  }
} 