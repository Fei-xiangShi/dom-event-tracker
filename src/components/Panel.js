/**
 * 面板组件
 */
export class Panel {
  constructor() {
    this.element = null;
    this.outputElement = null;
    this.isVisible = false;
    this.preserveLogsCheckbox = null;
    this.selectedElementInfo = null;
    this.onSelectElement = null;
    this.onSelectNewElement = null;
    this.onSelectEvents = null;
    this.onLogLevelChange = null;
    this.init();
  }

  /**
   * 初始化面板
   */
  init() {
    // 创建面板元素
    this.element = document.createElement('div');
    this.element.className = 'event-tracker-panel hidden';
    
    // 设置面板内容
    this.element.innerHTML = `
      <div class="event-tracker-panel-header">
        <div class="event-tracker-panel-title">DOM事件追踪器</div>
        <div class="event-tracker-panel-close">×</div>
      </div>
      <div class="event-tracker-panel-body">
        <div class="event-tracker-controls">
          <button class="event-tracker-btn event-tracker-btn-primary" id="event-tracker-select-btn">选择元素</button>
          <div id="event-tracker-selected-element" style="display: none;">
            <span id="event-tracker-element-info"></span>
            <button class="event-tracker-btn event-tracker-btn-secondary" id="event-tracker-reselect-btn">重新选择</button>
          </div>
          <button class="event-tracker-btn event-tracker-btn-primary" id="event-tracker-select-events-btn">选择事件</button>
          <button class="event-tracker-btn event-tracker-btn-primary" id="event-tracker-log-settings-btn">日志设置</button>
        </div>
        <div class="event-tracker-stack-controls">
          <button class="event-tracker-btn event-tracker-btn-secondary" id="event-tracker-collapse-all-btn">折叠全部堆栈</button>
          <button class="event-tracker-btn event-tracker-btn-secondary" id="event-tracker-expand-all-btn">展开全部堆栈</button>
        </div>
        <div id="event-tracker-log-filter" style="display: none; margin-bottom: 10px; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
          <h4 style="margin-top: 0; margin-bottom: 8px;">日志过滤设置</h4>
          <div class="event-tracker-log-options" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-log-level-event" checked> 事件触发
            </label>
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-log-level-info" checked> 一般信息
            </label>
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-log-level-action" checked> 用户操作
            </label>
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-log-level-popup" checked> 弹窗相关
            </label>
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-log-level-navigation" checked> 导航相关
            </label>
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-log-level-stack" checked> 堆栈信息
            </label>
          </div>
          <div style="margin-top: 8px;">
            <label class="event-tracker-checkbox">
              <input type="checkbox" id="event-tracker-show-inline-stacks" checked> 显示内联事件堆栈
            </label>
          </div>
          <div style="margin-top: 10px; text-align: right;">
            <button class="event-tracker-btn event-tracker-btn-primary" id="event-tracker-apply-log-settings">应用设置</button>
          </div>
        </div>
        <div class="event-tracker-panel-output"></div>
      </div>
      <div class="event-tracker-panel-status">
        <label class="event-tracker-checkbox">
          <input type="checkbox" id="event-tracker-preserve-logs"> 保留日志
        </label>
        <button class="event-tracker-btn event-tracker-btn-danger" id="event-tracker-clear-btn">清空日志</button>
      </div>
    `;
    
    // 添加到页面
    document.body.appendChild(this.element);
    
    // 获取输出元素引用
    this.outputElement = this.element.querySelector('.event-tracker-panel-output');
    
    // 获取保留日志复选框引用
    this.preserveLogsCheckbox = this.element.querySelector('#event-tracker-preserve-logs');
    
    // 获取已选元素信息显示区域
    this.selectedElementInfo = this.element.querySelector('#event-tracker-element-info');
    
    // 添加事件监听器
    this.addEventListeners();
  }

  /**
   * 添加事件监听器
   */
  addEventListeners() {
    // 关闭按钮
    const closeBtn = this.element.querySelector('.event-tracker-panel-close');
    closeBtn.addEventListener('click', () => this.hide());
    
    // 选择元素按钮
    const selectBtn = this.element.querySelector('#event-tracker-select-btn');
    selectBtn.addEventListener('click', () => {
      if (this.onSelectElement) {
        this.onSelectElement();
      }
    });
    
    // 重新选择按钮
    const reselectBtn = this.element.querySelector('#event-tracker-reselect-btn');
    reselectBtn.addEventListener('click', () => {
      if (this.onSelectNewElement) {
        this.onSelectNewElement();
      }
    });
    
    // 选择事件按钮
    const selectEventsBtn = this.element.querySelector('#event-tracker-select-events-btn');
    selectEventsBtn.addEventListener('click', () => {
      if (this.onSelectEvents) {
        this.onSelectEvents();
      }
    });
    
    // 日志设置按钮
    const logSettingsBtn = this.element.querySelector('#event-tracker-log-settings-btn');
    logSettingsBtn.addEventListener('click', () => {
      const logFilter = this.element.querySelector('#event-tracker-log-filter');
      if (logFilter.style.display === 'none') {
        logFilter.style.display = 'block';
      } else {
        logFilter.style.display = 'none';
      }
    });
    
    // 应用日志设置按钮
    const applyLogSettingsBtn = this.element.querySelector('#event-tracker-apply-log-settings');
    applyLogSettingsBtn.addEventListener('click', () => {
      this.applyLogSettings();
      // 隐藏设置面板
      this.element.querySelector('#event-tracker-log-filter').style.display = 'none';
    });
    
    // 清空日志按钮
    const clearBtn = this.element.querySelector('#event-tracker-clear-btn');
    clearBtn.addEventListener('click', () => this.clearOutput());
    
    // 折叠全部堆栈按钮
    const collapseAllBtn = this.element.querySelector('#event-tracker-collapse-all-btn');
    collapseAllBtn.addEventListener('click', () => this.collapseAllStacks());
    
    // 展开全部堆栈按钮
    const expandAllBtn = this.element.querySelector('#event-tracker-expand-all-btn');
    expandAllBtn.addEventListener('click', () => this.expandAllStacks());
  }

  /**
   * 应用日志设置
   */
  applyLogSettings() {
    if (this.onLogLevelChange) {
      const levels = {
        event: this.element.querySelector('#event-tracker-log-level-event').checked,
        info: this.element.querySelector('#event-tracker-log-level-info').checked,
        action: this.element.querySelector('#event-tracker-log-level-action').checked,
        popup: this.element.querySelector('#event-tracker-log-level-popup').checked,
        navigation: this.element.querySelector('#event-tracker-log-level-navigation').checked,
        stack: this.element.querySelector('#event-tracker-log-level-stack').checked
      };
      
      const showInlineStacks = this.element.querySelector('#event-tracker-show-inline-stacks').checked;
      
      this.onLogLevelChange(levels, showInlineStacks);
    }
  }

  /**
   * 设置日志级别变更回调
   * @param {Function} callback 日志级别变更回调
   */
  setLogLevelChangeCallback(callback) {
    this.onLogLevelChange = callback;
  }
  
  /**
   * 更新日志级别控件状态
   * @param {Object} levels 当前日志级别设置
   * @param {boolean} showInlineStacks 是否显示内联事件堆栈
   */
  updateLogLevelControls(levels, showInlineStacks) {
    Object.keys(levels).forEach(key => {
      const checkbox = this.element.querySelector(`#event-tracker-log-level-${key}`);
      if (checkbox) {
        checkbox.checked = levels[key];
      }
    });
    
    const inlineStacksCheckbox = this.element.querySelector('#event-tracker-show-inline-stacks');
    if (inlineStacksCheckbox) {
      inlineStacksCheckbox.checked = showInlineStacks;
    }
  }

  /**
   * 折叠所有堆栈
   */
  collapseAllStacks() {
    if (!this.outputElement) return;
    
    const toggleButtons = this.outputElement.querySelectorAll('.toggle-stack');
    const stackTraces = this.outputElement.querySelectorAll('.stack-trace');
    
    toggleButtons.forEach(btn => {
      btn.classList.add('collapsed');
    });
    
    stackTraces.forEach(stack => {
      stack.classList.add('collapsed');
    });
  }

  /**
   * 展开所有堆栈
   */
  expandAllStacks() {
    if (!this.outputElement) return;
    
    const toggleButtons = this.outputElement.querySelectorAll('.toggle-stack');
    const stackTraces = this.outputElement.querySelectorAll('.stack-trace');
    
    toggleButtons.forEach(btn => {
      btn.classList.remove('collapsed');
    });
    
    stackTraces.forEach(stack => {
      stack.classList.remove('collapsed');
    });
  }

  /**
   * 显示面板
   */
  show() {
    if (this.isVisible) return;
    this.isVisible = true;
    this.element.classList.remove('hidden');
  }

  /**
   * 隐藏面板
   */
  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.element.classList.add('hidden');
  }

  /**
   * 切换面板显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 设置元素选择回调
   * @param {Function} callback 选择元素的回调函数
   */
  setSelectElementCallback(callback) {
    this.onSelectElement = callback;
  }

  /**
   * 设置重新选择元素回调
   * @param {Function} callback 重新选择元素的回调函数
   */
  setSelectNewElementCallback(callback) {
    this.onSelectNewElement = callback;
  }

  /**
   * 设置选择事件回调
   * @param {Function} callback 选择事件的回调函数
   */
  setSelectEventsCallback(callback) {
    this.onSelectEvents = callback;
  }

  /**
   * 获取是否保留日志
   * @returns {boolean} 是否保留日志
   */
  getPreserveLogs() {
    return this.preserveLogsCheckbox ? this.preserveLogsCheckbox.checked : false;
  }

  /**
   * 获取输出元素
   * @returns {HTMLElement} 输出元素
   */
  getOutputElement() {
    return this.outputElement;
  }

  /**
   * 清空输出区域
   */
  clearOutput() {
    if (this.outputElement) {
      this.outputElement.innerHTML = '';
    }
  }

  /**
   * 更新已选择的元素信息
   * @param {HTMLElement} element 已选择的元素
   */
  updateSelectedElement(element) {
    if (!element) {
      this.element.querySelector('#event-tracker-selected-element').style.display = 'none';
      this.element.querySelector('#event-tracker-select-btn').style.display = 'block';
      return;
    }
    
    // 显示选中元素信息
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .filter(cls => !cls.startsWith('event-tracker-'))
      .map(cls => `.${cls}`)
      .join('');
    
    this.selectedElementInfo.textContent = `已选择: ${tagName}${id}${classes}`;
    
    // 显示已选元素区域，隐藏选择按钮
    this.element.querySelector('#event-tracker-selected-element').style.display = 'flex';
    this.element.querySelector('#event-tracker-select-btn').style.display = 'none';
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.outputElement = null;
  }
} 