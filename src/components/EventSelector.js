/**
 * 事件选择器组件
 */

export class EventSelector {
  constructor(eventTracker, onSelectionChange) {
    this.eventTracker = eventTracker;
    this.element = null;
    this.onSelectionChange = onSelectionChange;
    this.isVisible = false;
    this.init();
  }

  /**
   * 初始化组件
   */
  init() {
    // 创建选择器容器
    this.element = document.createElement('div');
    this.element.className = 'event-tracker-selector hidden';
    this.element.innerHTML = `
      <div class="event-tracker-selector-header">
        <div class="event-tracker-selector-title">选择要追踪的事件</div>
        <div class="event-tracker-selector-close">×</div>
      </div>
      <div class="event-tracker-selector-body"></div>
      <div class="event-tracker-selector-footer">
        <button class="event-tracker-btn event-tracker-btn-primary" id="event-tracker-select-all-btn">全选</button>
        <button class="event-tracker-btn event-tracker-btn-danger" id="event-tracker-select-none-btn">清空</button>
        <button class="event-tracker-btn event-tracker-btn-secondary" id="event-tracker-confirm-selection-btn">确认</button>
      </div>
    `;
    
    // 添加到页面
    document.body.appendChild(this.element);
    
    // 生成事件选项
    this.renderEventOptions();
    
    // 添加事件监听器
    this.addEventListeners();
  }

  /**
   * 生成事件选项
   */
  renderEventOptions() {
    const selectorBody = this.element.querySelector('.event-tracker-selector-body');
    selectorBody.innerHTML = ''; // 清空已有内容
    
    const allEventTypes = this.eventTracker.getAllEventTypes();
    const selectedTypes = this.eventTracker.getSelectedEventTypes();
    
    // 用原生 JavaScript 替换 lodash forEach
    Object.entries(allEventTypes).forEach(([groupName, events]) => {
      const groupContainer = document.createElement('div');
      groupContainer.className = 'event-tracker-group';
      
      // 创建分组标题
      const groupHeader = document.createElement('div');
      groupHeader.className = 'event-tracker-group-header';
      
      // 创建分组复选框
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupCheckbox.id = `group-${groupName}`;
      groupCheckbox.className = 'event-tracker-group-checkbox';
      // 检查该组是否所有事件都被选中
      const isGroupSelected = events.every(type => selectedTypes[type]);
      groupCheckbox.checked = isGroupSelected;
      
      // 添加分组复选框事件
      groupCheckbox.addEventListener('change', (e) => {
        const checkboxes = groupContainer.querySelectorAll('.event-tracker-event-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
        });
      });
      
      // 创建分组标签
      const groupLabel = document.createElement('label');
      groupLabel.setAttribute('for', `group-${groupName}`);
      groupLabel.textContent = groupName;
      
      groupHeader.appendChild(groupCheckbox);
      groupHeader.appendChild(groupLabel);
      groupContainer.appendChild(groupHeader);
      
      // 创建事件列表
      const eventsList = document.createElement('div');
      eventsList.className = 'event-tracker-events-list';
      
      events.forEach(eventType => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-tracker-event-item';
        
        const eventCheckbox = document.createElement('input');
        eventCheckbox.type = 'checkbox';
        eventCheckbox.id = `event-${eventType}`;
        eventCheckbox.className = 'event-tracker-event-checkbox';
        eventCheckbox.dataset.eventType = eventType;
        eventCheckbox.checked = selectedTypes[eventType] || false;
        
        const eventLabel = document.createElement('label');
        eventLabel.setAttribute('for', `event-${eventType}`);
        eventLabel.textContent = eventType;
        
        eventItem.appendChild(eventCheckbox);
        eventItem.appendChild(eventLabel);
        eventsList.appendChild(eventItem);
      });
      
      groupContainer.appendChild(eventsList);
      selectorBody.appendChild(groupContainer);
    });
  }

  /**
   * 添加事件监听器
   */
  addEventListeners() {
    // 关闭按钮
    const closeBtn = this.element.querySelector('.event-tracker-selector-close');
    closeBtn.addEventListener('click', () => this.hide());
    
    // 全选按钮
    const selectAllBtn = this.element.querySelector('#event-tracker-select-all-btn');
    selectAllBtn.addEventListener('click', () => {
      const checkboxes = this.element.querySelectorAll('.event-tracker-event-checkbox, .event-tracker-group-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
    });
    
    // 清空按钮
    const selectNoneBtn = this.element.querySelector('#event-tracker-select-none-btn');
    selectNoneBtn.addEventListener('click', () => {
      const checkboxes = this.element.querySelectorAll('.event-tracker-event-checkbox, .event-tracker-group-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
    });
    
    // 确认按钮
    const confirmBtn = this.element.querySelector('#event-tracker-confirm-selection-btn');
    confirmBtn.addEventListener('click', () => {
      this.saveSelection();
      this.hide();
      if (this.onSelectionChange) {
        this.onSelectionChange();
      }
    });
  }

  /**
   * 保存选择
   */
  saveSelection() {
    const selectedTypes = {};
    const eventCheckboxes = this.element.querySelectorAll('.event-tracker-event-checkbox');
    
    eventCheckboxes.forEach(checkbox => {
      const eventType = checkbox.dataset.eventType;
      selectedTypes[eventType] = checkbox.checked;
    });
    
    this.eventTracker.setSelectedEventTypes(selectedTypes);
  }

  /**
   * 显示选择器
   */
  show() {
    if (this.isVisible) return;
    
    // 更新事件选项
    this.renderEventOptions();
    
    this.isVisible = true;
    this.element.classList.remove('hidden');
  }

  /**
   * 隐藏选择器
   */
  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.element.classList.add('hidden');
  }

  /**
   * 切换显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
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