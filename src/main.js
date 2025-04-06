import './styles/main.css';
import { FloatBall } from './components/FloatBall';
import { Panel } from './components/Panel';
import { ElementSelector } from './components/ElementSelector';
import { EventTracker } from './components/EventTracker';
import { EventSelector } from './components/EventSelector';

/**
 * 应用主题设置
 */
function applyInitialTheme() {
  // 检查本地存储中是否有保存的主题
  const savedTheme = localStorage.getItem('event-tracker-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    return;
  }
  
  // 检查系统偏好
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  
  // 监听系统主题变化
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkModeMediaQuery.addEventListener) {
    darkModeMediaQuery.addEventListener('change', (e) => {
      // 只有在用户没有手动设置主题时才跟随系统主题
      if (!localStorage.getItem('event-tracker-theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }
}

/**
 * DOM事件追踪器应用
 */
class EventTrackerApp {
  constructor() {
    // 先应用初始主题
    applyInitialTheme();
    
    this.floatBall = null;
    this.panel = null;
    this.elementSelector = null;
    this.eventTracker = null;
    this.eventSelector = null;
    this.selectedElement = null;
    
    this.init();
  }

  /**
   * 初始化应用
   */
  init() {
    // 创建面板
    this.panel = new Panel();
    this.panel.setSelectElementCallback(() => this.startElementSelection());
    this.panel.setSelectNewElementCallback(() => this.reselectElement());
    this.panel.setSelectEventsCallback(() => this.openEventSelector());
    this.panel.setLogLevelChangeCallback((levels, showInlineStacks) => this.updateLogLevels(levels, showInlineStacks));
    
    // 创建悬浮球
    this.floatBall = new FloatBall(() => this.togglePanel());
    
    // 创建元素选择器
    this.elementSelector = new ElementSelector((element) => this.onElementSelected(element));
    
    // 创建事件追踪器
    this.eventTracker = new EventTracker(this.panel.getOutputElement());
    
    // 创建事件选择器
    this.eventSelector = new EventSelector(this.eventTracker, () => this.onEventSelectionChange());
    
    // 添加保留日志复选框变更监听
    const preserveLogsCheckbox = document.getElementById('event-tracker-preserve-logs');
    if (preserveLogsCheckbox) {
      preserveLogsCheckbox.addEventListener('change', (e) => {
        this.eventTracker.setPreserveLogs(e.target.checked);
      });
    }
    
    // 初始化日志级别控件状态
    this.panel.updateLogLevelControls(
      this.eventTracker.getLogLevels(),
      this.eventTracker.showStackForInlineEvents
    );
  }

  /**
   * 更新日志级别设置
   * @param {Object} levels 日志级别设置
   * @param {boolean} showInlineStacks 是否显示内联事件堆栈
   */
  updateLogLevels(levels, showInlineStacks) {
    // 更新事件追踪器的日志级别
    this.eventTracker.setLogLevels(levels);
    
    // 更新是否显示内联事件堆栈
    this.eventTracker.setShowStackForInlineEvents(showInlineStacks);
    
    // 清空当前日志，重新开始追踪
    if (this.selectedElement && this.eventTracker.isTracking) {
      const preserveLogs = this.panel.getPreserveLogs();
      if (!preserveLogs) {
        this.eventTracker.clearLogs();
      }
    }
  }

  /**
   * 切换面板显示状态
   */
  togglePanel() {
    this.panel.toggle();
  }

  /**
   * 开始元素选择
   */
  startElementSelection() {
    this.panel.hide();
    this.elementSelector.startSelection();
  }

  /**
   * 重新选择元素
   */
  reselectElement() {
    // 停止当前跟踪
    this.eventTracker.stopTracking();
    
    // 获取是否保留日志
    const preserveLogs = this.panel.getPreserveLogs();
    
    // 开始新的选择
    this.panel.hide();
    this.elementSelector.resetSelection();
  }

  /**
   * 打开事件选择器
   */
  openEventSelector() {
    this.eventSelector.show();
  }

  /**
   * 事件选择变更的处理函数
   */
  onEventSelectionChange() {
    // 如果当前正在追踪元素，更新追踪的事件
    if (this.selectedElement && this.eventTracker.isTracking) {
      // 重新开始追踪
      this.eventTracker.startTracking(this.selectedElement);
    }
  }

  /**
   * 元素被选中的处理函数
   * @param {HTMLElement} element 被选中的元素
   */
  onElementSelected(element) {
    if (!element) return;
    
    // 保存选中的元素
    this.selectedElement = element;
    
    // 更新面板中显示的元素信息
    this.panel.updateSelectedElement(element);
    
    // 开始追踪元素事件
    this.eventTracker.setPreserveLogs(this.panel.getPreserveLogs());
    this.eventTracker.startTracking(element);
    
    // 显示面板
    this.panel.show();
  }

  /**
   * 销毁应用
   */
  destroy() {
    // 停止追踪
    if (this.eventTracker) {
      this.eventTracker.stopTracking();
      this.eventTracker.destroy();
    }
    
    // 清理选择器
    if (this.elementSelector) {
      this.elementSelector.destroy();
    }
    
    // 清理事件选择器
    if (this.eventSelector) {
      this.eventSelector.destroy();
    }
    
    // 移除面板
    if (this.panel) {
      this.panel.destroy();
    }
    
    // 移除悬浮球
    if (this.floatBall) {
      this.floatBall.destroy();
    }
  }
}

// 等待页面加载完成后初始化应用
function initApp() {
  // 创建事件追踪器应用实例
  window.eventTrackerApp = new EventTrackerApp();
  
  // 添加卸载监听以清理资源
  window.addEventListener('beforeunload', () => {
    if (window.eventTrackerApp) {
      window.eventTrackerApp.destroy();
    }
  });
}

// 确保DOM加载完成后再初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
} 