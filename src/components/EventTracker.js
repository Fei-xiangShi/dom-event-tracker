/**
 * 事件追踪器组件
 */

// 可追踪的所有事件类型
const ALL_EVENT_TYPES = {
  鼠标事件: ['click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove'],
  键盘事件: ['keydown', 'keyup', 'keypress'],
  表单事件: ['focus', 'blur', 'change', 'input', 'submit', 'reset'],
  拖拽事件: ['drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'],
  视图事件: ['scroll', 'resize', 'load', 'unload', 'beforeunload'],
  触摸事件: ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
  动画事件: ['animationstart', 'animationend', 'animationiteration', 'transitionend'],
  导航事件: ['hashchange', 'popstate', 'pagehide', 'pageshow']
};

// 原生DOM方法映射表，用于重置Proxy
const originalMethods = new Map();

// 保存所有已代理过的元素
const proxiedElements = new WeakSet();

// 保存EventTarget原型上的原始addEventListener和removeEventListener方法
const originalAddEventListener = EventTarget.prototype.addEventListener;
const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

export class EventTracker {
  constructor(outputElement) {
    this.targetElement = null;
    this.outputElement = outputElement;
    this.trackedEvents = [];
    this.isTracking = false;
    this.preserveLogs = false;
    
    // 预先绑定事件处理器方法，避免重复创建绑定函数
    this.boundHandleCaptureEvent = this.handleCaptureEvent.bind(this);
    this.boundHandleBubbleEvent = this.handleBubbleEvent.bind(this);
    this.boundHandleClickWithDetails = this.handleClickWithDetails.bind(this);
    this.boundHandleFormSubmit = this.handleFormSubmit.bind(this);
    this.boundHandleNavigationEvent = this.handleNavigationEvent.bind(this);
    this.boundHandleMouseMove = this.throttle(this.handleMouseMove.bind(this), 100); // 为鼠标移动事件添加节流
    
    // 事件处理器引用
    this.eventHandlers = {
      capture: this.boundHandleCaptureEvent,
      bubble: this.boundHandleBubbleEvent
    };
    
    // DOM 变化观察器
    this.mutationObserver = null;
    
    // 用户选择的事件类型
    this.selectedEventTypes = {};
    
    // 保存原始事件处理器的缓存
    this.originalEventHandlers = new WeakMap();
    
    // 监控拦截的内联事件类型
    this.inlineEventsToMonitor = ['click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'submit', 'change'];

    // 初始化选择所有类型的事件
    this.selectAllEventTypes();
    
    // 上次检测到的弹窗元素，用于避免重复记录
    this.lastDetectedPopups = new Set();
    
    // 设置节流时间间隔
    this.throttleTime = 100; // 毫秒
    
    // 是否已拦截全局EventTarget方法
    this.hasInterceptedEventTarget = false;
    
    // 为防止重复记录，维护一个记录追踪过的事件处理函数的WeakMap
    this.trackedHandlers = new WeakMap();
    
    // 日志级别设置
    this.logLevels = {
      event: true,       // 事件触发日志
      info: true,        // 一般信息
      action: true,      // 用户操作
      popup: true,       // 弹窗相关
      navigation: true,  // 导航相关
      stack: true        // 堆栈信息
    };
    
    // 是否在内联事件上显示堆栈
    this.showStackForInlineEvents = true;
  }

  /**
   * 节流函数，用于高频事件处理
   * @param {Function} func 需要节流的函数
   * @param {number} delay 延迟时间（毫秒）
   * @returns {Function} 节流后的函数
   */
  throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return func.apply(this, args);
      }
    };
  }

  /**
   * 获取所有可选择的事件类型
   * @returns {Object} 事件类型分组
   */
  getAllEventTypes() {
    return ALL_EVENT_TYPES;
  }

  /**
   * 获取所有已选事件类型
   * @returns {Object} 已选事件类型的对象(事件名: 是否选中)
   */
  getSelectedEventTypes() {
    return this.selectedEventTypes;
  }

  /**
   * 设置选中的事件类型
   * @param {Object} eventTypes 事件类型对象
   */
  setSelectedEventTypes(eventTypes) {
    this.selectedEventTypes = eventTypes;
    
    // 如果正在追踪，需要重新应用事件监听
    if (this.isTracking && this.targetElement) {
      this.stopTracking();
      this.startTracking(this.targetElement);
    }
  }

  /**
   * 选择所有事件类型
   */
  selectAllEventTypes() {
    const allTypes = {};
    
    // 用原生 JavaScript 替换 lodash forEach
    Object.entries(ALL_EVENT_TYPES).forEach(([groupName, types]) => {
      types.forEach(type => {
        allTypes[type] = true;
      });
    });
    
    this.selectedEventTypes = allTypes;
  }

  /**
   * 清除所有选中的事件类型
   */
  clearSelectedEventTypes() {
    this.selectedEventTypes = {};
  }

  /**
   * 只选择特定分组的事件
   * @param {string} groupName 事件分组名称
   */
  selectEventGroup(groupName) {
    if (ALL_EVENT_TYPES[groupName]) {
      const types = {};
      ALL_EVENT_TYPES[groupName].forEach(type => {
        types[type] = true;
      });
      this.selectedEventTypes = types;
    }
  }

  /**
   * 获取被选中的事件类型数组
   * @returns {Array} 事件类型数组
   */
  getActiveEventTypes() {
    return Object.keys(this.selectedEventTypes).filter(type => this.selectedEventTypes[type]);
  }

  /**
   * 开始追踪元素事件
   * @param {HTMLElement} element 要追踪的元素
   */
  startTracking(element) {
    if (this.isTracking) {
      this.stopTracking();
    }
    
    if (!element) return;
    
    this.targetElement = element;
    this.isTracking = true;
    
    // 清空日志（如果不保留）
    if (!this.preserveLogs) {
      this.clearLogs();
    }
    
    // 清空上次检测到的弹窗集合
    this.lastDetectedPopups.clear();
    
    // 添加事件监听器 - 使用配置对象来确保事件追踪器能够先于其他监听器执行
    const activeEventTypes = this.getActiveEventTypes();
    activeEventTypes.forEach(eventType => {
      // 捕获阶段
      document.addEventListener(eventType, this.eventHandlers.capture, {
        capture: true,    // 在捕获阶段
        passive: false,   // 不是被动的，允许我们阻止默认行为
      });
      
      // 冒泡阶段
      document.addEventListener(eventType, this.eventHandlers.bubble, {
        capture: false,   // 在冒泡阶段
        passive: false,   // 不是被动的，允许我们阻止默认行为
      });
    });
    
    this.addLog('info', '已设置主动事件监听（非被动模式），允许阻止事件传播');
    
    // 特殊处理链接点击
    if (activeEventTypes.includes('click')) {
      // 使用事件代理监听整个文档上的点击，用于分析链接行为
      document.addEventListener('click', this.boundHandleClickWithDetails, {
        capture: true,    // 在捕获阶段
        passive: false,   // 不是被动的，允许我们阻止默认行为
      });
    }
    
    // 特殊处理表单提交
    if (activeEventTypes.includes('submit')) {
      document.addEventListener('submit', this.boundHandleFormSubmit, {
        capture: true,    // 在捕获阶段
        passive: false,   // 不是被动的，允许我们阻止默认行为
      });
    }
    
    // 处理鼠标移动，使用节流
    if (activeEventTypes.includes('mousemove')) {
      document.addEventListener('mousemove', this.boundHandleMouseMove, {
        capture: true,    // 在捕获阶段
        passive: false,   // 不是被动的，允许我们阻止默认行为
      });
    }
    
    // 添加导航事件监听 - 导航事件不阻止传播，避免影响页面功能
    if (activeEventTypes.some(type => ['hashchange', 'popstate', 'pageshow', 'pagehide'].includes(type))) {
      window.addEventListener('hashchange', this.boundHandleNavigationEvent);
      window.addEventListener('popstate', this.boundHandleNavigationEvent);
      window.addEventListener('pageshow', this.boundHandleNavigationEvent);
      window.addEventListener('pagehide', this.boundHandleNavigationEvent);
    }
    
    // 拦截内联事件处理器
    this.monitorInlineEventHandlers(element);
    
    // 初始化 DOM 变化观察器
    this.initMutationObserver();
    
    // 检测UI框架并设置监控
    this.detectUIFrameworks();
    
    // 拦截 EventTarget 原型上的addEventListener方法
    this.interceptEventTargetMethods();
    
    // 为目标元素应用代理，拦截所有DOM事件相关方法
    this.applyDOMProxies(element);
    
    // 记录开始追踪
    this.addLog('info', `开始追踪元素: ${this.getElementSelector(element)}`);
    this.addLog('info', `追踪事件: ${activeEventTypes.join(', ')}`);
    this.addLog('info', '已开启事件拦截，防止事件冒泡到页面其他部分');
  }

  /**
   * 停止追踪元素事件
   */
  stopTracking() {
    if (!this.isTracking) return;
    
    // 移除事件监听器
    const activeEventTypes = this.getActiveEventTypes();
    activeEventTypes.forEach(eventType => {
      document.removeEventListener(eventType, this.eventHandlers.capture, true);
      document.removeEventListener(eventType, this.eventHandlers.bubble, false);
    });
    
    // 移除特殊监听器
    document.removeEventListener('click', this.boundHandleClickWithDetails, true);
    document.removeEventListener('submit', this.boundHandleFormSubmit, true);
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    
    // 移除导航事件监听
    window.removeEventListener('hashchange', this.boundHandleNavigationEvent);
    window.removeEventListener('popstate', this.boundHandleNavigationEvent);
    window.removeEventListener('pageshow', this.boundHandleNavigationEvent);
    window.removeEventListener('pagehide', this.boundHandleNavigationEvent);
    
    // 恢复被拦截的内联事件处理器
    this.restoreInlineEventHandlers();
    
    // 停止 DOM 变化观察
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    // 还原被代理的DOM方法
    this.restoreDOMProxies();
    
    // 还原EventTarget原型方法
    this.restoreEventTargetMethods();
    
    this.isTracking = false;
    this.addLog('info', '停止追踪');
  }

  /**
   * 还原 EventTarget 原型上的方法
   */
  restoreEventTargetMethods() {
    if (!this.hasInterceptedEventTarget) return;
    
    EventTarget.prototype.addEventListener = originalAddEventListener;
    EventTarget.prototype.removeEventListener = originalRemoveEventListener;
    
    this.hasInterceptedEventTarget = false;
    this.addLog('info', '已还原全局事件监听方法');
  }

  /**
   * 检查值是否为有效的 DOM 节点
   * @param {any} value 要检查的值
   * @returns {boolean} 是否为有效的 DOM 节点
   */
  isValidNode(value) {
    return value && typeof value === 'object' && 
           (value instanceof Node || (typeof value.nodeType === 'number'));
  }

  /**
   * 拦截 EventTarget 原型上的方法，包括 addEventListener 和 removeEventListener
   */
  interceptEventTargetMethods() {
    if (this.hasInterceptedEventTarget) return;
    
    const self = this;
    
    // 拦截 addEventListener
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      // 检查事件类型是否在追踪范围内
      if (self.selectedEventTypes[type] && listener) {
        // 安全检查目标元素
        const isTargetElementValid = self.targetElement && self.isValidNode(self.targetElement);
        const isThisValid = self.isValidNode(this);
        
        if (isTargetElementValid && isThisValid) {
          const isTargetElement = this === self.targetElement || self.targetElement.contains(this);
          
          // 如果是追踪目标相关元素，记录事件监听器的添加
          if (isTargetElement) {
            // 使用 WeakMap 跟踪处理函数，避免重复记录
            if (!self.trackedHandlers.has(listener)) {
              self.trackedHandlers.set(listener, true);
              
              // 记录添加事件监听器
              const elementInfo = self.getElementSelector(this);
              self.addLog('info', `添加事件监听器: ${type} 到 ${elementInfo} ${
                typeof options === 'object' ? 
                  JSON.stringify({capture: !!options.capture, once: !!options.once, passive: !!options.passive}) : 
                  (options ? '(捕获阶段)' : '(冒泡阶段)')
              }`);
              
              // 获取调用栈
              const stack = self.getStackTrace();
              if (stack) {
                self.addLog('info', `事件监听器调用栈: ${stack}`);
              }
            }
          }
        }
      }
      
      // 调用原始方法
      return originalAddEventListener.call(this, type, listener, options);
    };
    
    // 拦截 removeEventListener
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      // 检查事件类型是否在追踪范围内
      if (self.selectedEventTypes[type] && listener) {
        // 安全检查目标元素和当前元素
        const isTargetElementValid = self.targetElement && self.isValidNode(self.targetElement);
        const isThisValid = self.isValidNode(this);
        
        if (isTargetElementValid && isThisValid) {
          try {
            const isTargetElement = this === self.targetElement || self.targetElement.contains(this);
            
            // 如果是追踪目标相关元素，记录事件监听器的移除
            if (isTargetElement) {
              if (self.trackedHandlers.has(listener)) {
                // 从记录中移除，以便未来可以再次记录
                self.trackedHandlers.delete(listener);
                
                // 记录移除事件监听器
                const elementInfo = self.getElementSelector(this);
                self.addLog('info', `移除事件监听器: ${type} 从 ${elementInfo} ${
                  typeof options === 'object' ? 
                    JSON.stringify({capture: !!options.capture}) : 
                    (options ? '(捕获阶段)' : '(冒泡阶段)')
                }`);
              }
            }
          } catch (err) {
            // 捕获并记录可能的错误
            self.addLog('info', `移除事件监听器时出错: ${err.message}`);
          }
        }
      }
      
      // 调用原始方法
      return originalRemoveEventListener.call(this, type, listener, options);
    };
    
    this.hasInterceptedEventTarget = true;
    this.addLog('info', '已拦截全局事件监听方法');
  }

  /**
   * 对DOM元素应用代理，拦截所有事件相关方法和属性
   * @param {HTMLElement} rootElement 要拦截的根元素
   */
  applyDOMProxies(rootElement) {
    if (!rootElement) return;
    
    // 递归遍历元素树，对每个元素应用代理
    const processElement = (element) => {
      if (proxiedElements.has(element)) return; // 已经代理过的元素跳过
      
      this.proxyElementEvents(element);
      proxiedElements.add(element);
      
      // 递归处理所有子元素
      if (element.children && element.children.length > 0) {
        Array.from(element.children).forEach(child => {
          processElement(child);
        });
      }
    };
    
    // 从根元素开始处理
    processElement(rootElement);
    
    // 为根元素添加一个代理，拦截添加到DOM的新元素
    this.addLog('info', '已对目标元素树应用DOM事件代理');
  }

  /**
   * 为单个元素创建代理，拦截其事件处理属性
   * @param {HTMLElement} element 要代理的元素
   */
  proxyElementEvents(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    
    const self = this;
    const proto = Object.getPrototypeOf(element);
    
    // 检查该元素的原型链，拦截所有on开头的事件处理器
    let currentProto = proto;
    const processedProps = new Set(); // 避免重复处理相同的属性
    
    while (currentProto && currentProto !== Object.prototype) {
      // 获取该原型上所有属性描述符
      const descriptors = Object.getOwnPropertyDescriptors(currentProto);
      
      // 查找所有on开头的属性（事件处理器）
      Object.entries(descriptors).forEach(([prop, descriptor]) => {
        // 避免重复处理同名属性
        if (processedProps.has(prop)) return;
        processedProps.add(prop);
        
        // 检查是否是事件处理器属性（on开头）
        if (prop.startsWith('on') && prop.length > 2) {
          const eventType = prop.substring(2); // 去掉'on'前缀
          
          // 检查事件类型是否在要追踪的范围内
          if (self.selectedEventTypes[eventType]) {
            // 保存原始属性描述符
            if (!originalMethods.has(prop)) {
              originalMethods.set(prop, descriptor);
            }
            
            // 拦截属性的getter和setter
            Object.defineProperty(element, prop, {
              configurable: true,
              enumerable: true,
              get: function() {
                // 返回元素上实际存储的值
                return this[`__${prop}__`] || null;
              },
              set: function(newValue) {
                // 如果新值是一个函数
                if (typeof newValue === 'function') {
                  // 保存原始处理函数
                  const originalHandler = newValue;
                  
                  // 记录事件处理器变更
                  self.addLog('info', `元素 ${self.getElementSelector(this)} 的 ${prop} 被设置`);
                  
                  // 创建代理处理函数
                  const proxyHandler = function(event) {
                    // 阻止事件继续传播，防止触发页面上其他监听器
                    event.stopPropagation();
                    
                    self.addLog('info', `内联事件 ${prop} 在 ${self.getElementSelector(this)} 上被触发`);
                    
                    // 执行原始处理函数
                    const result = originalHandler.call(this, event);
                    
                    // 检查事件是否被阻止冒泡或默认行为
                    if (event.defaultPrevented) {
                      self.addLog('info', `${prop} 阻止了默认行为`);
                    }
                    
                    if (event.cancelBubble || !event.bubbles) {
                      self.addLog('info', `${prop} 阻止了事件冒泡`);
                    }
                    
                    return result;
                  };
                  
                  // 存储代理处理函数
                  this[`__${prop}__`] = proxyHandler;
                } else {
                  // 不是函数，直接存储
                  this[`__${prop}__`] = newValue;
                }
              }
            });
          }
        }
      });
      
      // 向上移动到父原型
      currentProto = Object.getPrototypeOf(currentProto);
    }
  }

  /**
   * 还原所有被代理的DOM方法
   */
  restoreDOMProxies() {
    if (this.targetElement) {
      // 深度遍历目标元素树，恢复所有被代理的元素
      const restoreElement = (element) => {
        if (!element || !proxiedElements.has(element)) return;
        
        // 对于每个被代理的事件属性，恢复其原始行为
        originalMethods.forEach((descriptor, prop) => {
          try {
            // 恢复原始属性描述符
            Object.defineProperty(element, prop, descriptor);
            
            // 清理存储的代理函数
            delete element[`__${prop}__`];
          } catch (e) {
            // 忽略错误，通常是因为元素已被删除或修改
          }
        });
        
        // 从代理集合中移除
        proxiedElements.delete(element);
        
        // 递归处理子元素
        if (element.children && element.children.length > 0) {
          Array.from(element.children).forEach(restoreElement);
        }
      };
      
      // 从根元素开始恢复
      restoreElement(this.targetElement);
    }
    
    this.addLog('info', '已还原DOM事件代理');
  }

  /**
   * 拦截目标元素及其子元素的内联事件处理器
   * @param {HTMLElement} rootElement 根元素
   */
  monitorInlineEventHandlers(rootElement) {
    if (!rootElement) return;
    
    // 用于跟踪已处理过的事件链，避免循环调用和重复记录
    const processedChains = new WeakMap();
    
    const processElement = (element) => {
      // 对每个支持的内联事件类型进行处理
      this.inlineEventsToMonitor.forEach(eventType => {
        const handlerName = `on${eventType}`;
        
        // 如果元素有该事件处理器
        if (element[handlerName] && typeof element[handlerName] === 'function') {
          // 保存原始处理器
          if (!this.originalEventHandlers.has(element)) {
            this.originalEventHandlers.set(element, {});
          }
          
          const elementHandlers = this.originalEventHandlers.get(element);
          if (!elementHandlers[handlerName]) {
            elementHandlers[handlerName] = element[handlerName];
            
            // 用新的处理器替换原始处理器
            element[handlerName] = (event) => {
              // 阻止事件继续传播，防止触发页面上其他监听器
              event.stopPropagation();
                
              // 创建一个唯一标识来跟踪事件调用链
              if (!event._inlineTrackerChain) {
                event._inlineTrackerChain = new Set();
              }
              
              const chainId = `${element.tagName}#${handlerName}`;
              
              // 如果该事件已经在此元素上处理过，则直接调用原始处理器，避免重复记录
              if (event._inlineTrackerChain.has(chainId)) {
                return elementHandlers[handlerName].call(element, event);
              }
              
              // 标记该事件正在此元素上处理
              event._inlineTrackerChain.add(chainId);
              
              // 获取调用堆栈
              const stack = this.getStackTrace();
              
              // 记录内联事件被触发
              const elementSelector = this.getElementSelector(element);
              this.addLog('info', `内联事件 ${handlerName} 在 ${elementSelector} 上被触发`);
              
              // 添加自定义堆栈信息的日志
              if (stack && this.logLevels.stack) {
                // 添加调用堆栈信息
                this.addLog('stack', stack);
              }
              
              // 调用原始处理器
              const result = elementHandlers[handlerName].call(element, event);
              
              // 记录事件是否被阻止默认行为或冒泡
              if (event.defaultPrevented) {
                this.addLog('info', `${handlerName} 阻止了默认行为`);
              }
              
              if (event.cancelBubble || !event.bubbles) {
                this.addLog('info', `${handlerName} 阻止了事件冒泡`);
              }
              
              // 处理完成后从调用链中移除
              event._inlineTrackerChain.delete(chainId);
              
              return result;
            };
          }
        }
      });
    };
    
    // 处理根元素
    processElement(rootElement);
    
    // 处理所有子元素
    const allChildren = rootElement.querySelectorAll('*');
    allChildren.forEach(processElement);
  }

  /**
   * 恢复被拦截的内联事件处理器
   */
  restoreInlineEventHandlers() {
    // WeakMap没有forEach方法，需要使用其他方式遍历
    // 由于WeakMap的特性，我们无法直接遍历它的所有键值对
    // 这里我们需要记录和恢复已处理过的元素
    
    // 检查是否有DOM中的元素需要恢复
    if (this.targetElement) {
      // 处理目标元素
      if (this.originalEventHandlers.has(this.targetElement)) {
        this.restoreElementHandlers(this.targetElement);
      }
      
      // 处理所有子元素
      const allChildren = this.targetElement.querySelectorAll('*');
      allChildren.forEach(child => {
        if (this.originalEventHandlers.has(child)) {
          this.restoreElementHandlers(child);
        }
      });
    }
    
    // 清空记录
    this.originalEventHandlers = new WeakMap();
  }
  
  /**
   * 恢复单个元素的内联事件处理器
   * @param {HTMLElement} element 要恢复的元素
   */
  restoreElementHandlers(element) {
    if (!element || !this.originalEventHandlers.has(element)) return;
    
    const handlers = this.originalEventHandlers.get(element);
    if (!handlers) return;
    
    // 恢复所有事件处理器
    Object.entries(handlers).forEach(([handlerName, originalHandler]) => {
      // 只有在元素仍然存在于 DOM 中时才恢复
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        element[handlerName] = originalHandler;
      }
    });
    
    // 从记录中移除
    this.originalEventHandlers.delete(element);
  }

  /**
   * 处理鼠标移动事件（已应用节流）
   * @param {MouseEvent} event 鼠标移动事件
   */
  handleMouseMove(event) {
    // 在这里处理鼠标移动，已经应用了节流
    if (this.shouldTrackEvent(event)) {
      // 阻止事件继续传播，防止触发页面上其他监听器
      event.stopPropagation();
      
      // 这里可以选择是否记录鼠标移动事件
      // this.logEvent(event, 'mousemove', '');
    }
  }

  /**
   * 检查是否是对话框或弹窗元素
   * @param {HTMLElement} node 要检查的节点
   */
  checkForDialogOrPopup(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    
    // 忽略事件追踪器自身的元素
    if (this.isEventTrackerElement(node)) return;
    
    // 判断是否可能是弹窗元素的特征
    const maybePopup = (element) => {
      // 生成唯一标识（可以使用元素选择器或其他方式）
      const elementId = this.getElementSelector(element);
      
      // 如果已经检测过这个弹窗，避免重复记录
      if (this.lastDetectedPopups.has(elementId)) return false;
      
      // 是否是 dialog 元素
      if (element.tagName === 'DIALOG') {
        this.lastDetectedPopups.add(elementId);
        return true;
      }
      
      // 检查常见的弹窗类名
      const className = element.className || '';
      if (/modal|popup|dialog|overlay|lightbox|toast/i.test(className)) {
        this.lastDetectedPopups.add(elementId);
        return true;
      }
      
      // 检查样式是否有弹窗特征
      const style = window.getComputedStyle(element);
      const isFixed = style.position === 'fixed';
      const isAbsolute = style.position === 'absolute';
      const hasHighZIndex = parseInt(style.zIndex) > 10;
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      
      const isPopup = isVisible && (isFixed || isAbsolute) && hasHighZIndex;
      
      if (isPopup) {
        this.lastDetectedPopups.add(elementId);
      }
      
      return isPopup;
    };
    
    // 检查节点本身
    if (maybePopup(node)) {
      const selector = this.getElementSelector(node);
      this.addLog('popup', `检测到弹窗显示: ${selector}`);
      
      // 额外检查内联样式和属性，帮助分析弹窗触发方式
      if (node.hasAttribute('style')) {
        this.addLog('info', `弹窗内联样式: ${node.getAttribute('style')}`);
      }
      
      // 检查是否有特定属性表明弹窗来源
      const relevantAttrs = Array.from(node.attributes)
        .filter(attr => /data|aria|role|id|class/.test(attr.name))
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(', ');
      
      if (relevantAttrs) {
        this.addLog('info', `弹窗相关属性: ${relevantAttrs}`);
      }
      
      return;
    }
    
    // 检查子节点 (限制深度为2，避免过度递归)
    this.checkChildNodesForPopups(node, 2);
  }

  /**
   * 初始化 DOM 变化观察器，使用防抖处理
   */
  initMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    
    let pendingMutations = [];
    let timeout = null;
    
    // 创建新的观察器，收集变化后批量处理
    this.mutationObserver = new MutationObserver((mutations) => {
      pendingMutations = pendingMutations.concat(mutations);
      
      // 清除之前的定时器
      if (timeout) {
        clearTimeout(timeout);
      }
      
      // 设置新的定时器，延迟处理所有收集到的变化
      timeout = setTimeout(() => {
        if (pendingMutations.length === 0) return;
        
        // 标记是否检测到了弹窗
        let popupDetected = false;
        
        // 处理收集到的所有变化
        for (let mutation of pendingMutations) {
          // 节点添加
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (let node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                this.checkForDialogOrPopup(node);
                
                // 对新添加的元素应用内联事件监控
                if (this.shouldTrackEvent({ target: node })) {
                  this.monitorInlineEventHandlers(node);
                }
              }
            }
          }
          
          // 属性变化 (可能是显示/隐藏弹窗)
          if (mutation.type === 'attributes') {
            this.checkForDialogOrPopup(mutation.target);
          }
        }
        
        // 清空待处理的变化
        pendingMutations = [];
      }, 50); // 50ms防抖时间
    });
    
    // 配置观察器
    this.mutationObserver.observe(document.body, {
      childList: true,     // 监控子节点添加或删除
      attributes: true,    // 监控属性变化
      attributeFilter: ['class', 'style', 'id', 'hidden', 'aria-hidden', 'display', 'visibility'], // 重点关注这些属性变化
      subtree: true        // 监控整个子树
    });
    
    this.addLog('info', 'DOM 变化监测已启动 (已优化)');
  }

  /**
   * 处理捕获阶段的事件
   * @param {Event} event 事件对象
   */
  handleCaptureEvent(event) {
    // 只关注与目标元素相关的事件
    if (this.shouldTrackEvent(event)) {
      const stack = this.getStackTrace();
      this.logEvent(event, 'capture', stack);
      
      // 阻止事件继续传播，防止触发页面上其他监听器
      event.stopPropagation();
    }
  }

  /**
   * 处理冒泡阶段的事件
   * @param {Event} event 事件对象
   */
  handleBubbleEvent(event) {
    // 只关注与目标元素相关的事件
    if (this.shouldTrackEvent(event)) {
      const stack = this.getStackTrace();
      this.logEvent(event, 'bubble', stack);
      
      // 阻止事件继续传播，防止触发页面上其他监听器
      event.stopPropagation();
    }
  }

  /**
   * 检查是否应该追踪该事件
   * @param {Event} event 事件对象
   * @returns {boolean} 是否追踪
   */
  shouldTrackEvent(event) {
    if (!this.targetElement) return false;
    
    // 只追踪被选中的事件类型
    if (!this.selectedEventTypes[event.type]) return false;
    
    // 如果事件目标是目标元素或其子元素，或者事件路径中包含目标元素
    return event.target === this.targetElement || 
           this.targetElement.contains(event.target) ||
           this.isTargetInPath(event);
  }

  /**
   * 检查目标元素是否在事件路径中
   * @param {Event} event 事件对象
   * @returns {boolean} 是否在路径中
   */
  isTargetInPath(event) {
    if (event.path) {
      return event.path.includes(this.targetElement);
    } else if (event.composedPath) {
      return event.composedPath().includes(this.targetElement);
    }
    return false;
  }

  /**
   * 获取当前的JavaScript调用堆栈
   * @returns {string} 堆栈信息
   */
  getStackTrace() {
    const error = new Error();
    const stack = error.stack || '';
    
    // 解析和清理堆栈信息
    let stackLines = stack.split('\n')
      .filter(line => 
        !line.includes('at EventTracker.') && 
        !line.includes('userscript.html?name=DOM') && 
        !line.includes('chrome-extension://')
      )
      .slice(2); // 去掉Error和getStackTrace本身
    
    // 如果过滤后没有剩余的堆栈信息，使用原始堆栈但限制行数
    if (stackLines.length === 0) {
      stackLines = stack.split('\n')
        .filter(line => !line.includes('at EventTracker.'))
        .slice(2, 4); // 只保留最重要的前几行
    }
    
    // 美化堆栈信息并添加源代码查看功能
    return stackLines
      .map(line => {
        // 提取文件名和行号
        const fileMatch = line.match(/\(([^)]+)\)$/) || line.match(/at\s+(.+)$/);
        if (fileMatch) {
          const filePath = fileMatch[1];
          // 提取行号和列号
          const locationMatch = filePath.match(/:(\d+):(\d+)$/);
          let lineNumber = '';
          let columnNumber = '';
          
          if (locationMatch) {
            lineNumber = locationMatch[1];
            columnNumber = locationMatch[2];
          }
          
          // 高亮文件名和行号，但去掉过长的路径
          const simplifiedPath = filePath.replace(/^.*\/userscript\.html\?.*?:/g, 'script:');
          
          // 添加查看源代码的按钮
          if (lineNumber) {
            const viewSourceBtn = `<button class="view-source-btn" data-path="${simplifiedPath}" data-line="${lineNumber}" data-column="${columnNumber}">查看源码</button>`;
            return line.replace(filePath, `<span style="color:#e91e63">${simplifiedPath}</span> ${viewSourceBtn}`);
          } else {
            return line.replace(filePath, `<span style="color:#e91e63">${simplifiedPath}</span>`);
          }
        }
        return line;
      })
      .join('\n');
  }

  /**
   * 记录事件信息
   * @param {Event} event 事件对象
   * @param {string} phase 事件阶段 ('capture' 或 'bubble')
   * @param {string} stack 调用堆栈
   */
  logEvent(event, phase, stack) {
    // 检查是否应该记录事件日志
    if (!this.logLevels.event) return;
    
    const eventInfo = {
      type: event.type,
      phase: phase,
      target: this.getElementSelector(event.target),
      timestamp: new Date().getTime(),
      stack: stack
    };
    
    this.trackedEvents.push(eventInfo);
    this.renderEventLog(eventInfo);
  }

  /**
   * 渲染事件日志到输出元素
   * @param {Object} eventInfo 事件信息
   */
  renderEventLog(eventInfo) {
    if (!this.outputElement) return;
    
    const logElement = document.createElement('div');
    logElement.className = 'event-log';
    
    const phaseText = eventInfo.phase === 'capture' ? '捕获阶段' : '冒泡阶段';
    
    // 创建日志标题区域（带折叠控制）
    const headerElement = document.createElement('div');
    headerElement.className = 'event-log-header';
    
    // 折叠/展开按钮
    const toggleButton = document.createElement('span');
    toggleButton.className = 'toggle-stack';
    toggleButton.textContent = '▼';
    toggleButton.title = '点击折叠/展开堆栈';
    
    const typeElement = document.createElement('span');
    typeElement.className = 'event-type';
    typeElement.textContent = eventInfo.type;
    // 添加data-event-type属性以支持CSS选择器
    typeElement.setAttribute('data-event-type', eventInfo.type);
    
    const phaseElement = document.createElement('span');
    phaseElement.className = 'event-phase';
    phaseElement.textContent = `(${phaseText})`;
    
    const targetElement = document.createElement('span');
    targetElement.className = 'event-target';
    targetElement.textContent = `在 ${eventInfo.target}`;
    
    headerElement.appendChild(toggleButton);
    headerElement.appendChild(typeElement);
    headerElement.appendChild(phaseElement);
    headerElement.appendChild(targetElement);
    
    // 创建堆栈区域，如果堆栈信息为空则默认折叠
    const stackElement = document.createElement('div');
    stackElement.className = 'stack-trace';
    if (!eventInfo.stack || eventInfo.stack.trim() === '') {
      stackElement.innerHTML = '<i>无堆栈信息</i>';
      stackElement.classList.add('collapsed');
      toggleButton.classList.add('collapsed');
    } else {
      stackElement.innerHTML = eventInfo.stack;
      
      // 为堆栈中的查看源码按钮添加事件监听
      this.addSourceCodeViewListeners(stackElement);
    }
    
    // 添加折叠/展开的点击事件
    headerElement.addEventListener('click', () => {
      toggleButton.classList.toggle('collapsed');
      stackElement.classList.toggle('collapsed');
    });
    
    logElement.appendChild(headerElement);
    logElement.appendChild(stackElement);
    
    this.outputElement.appendChild(logElement);
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  /**
   * 添加源代码查看监听器
   * @param {HTMLElement} container 包含查看源码按钮的容器
   */
  addSourceCodeViewListeners(container) {
    const buttons = container.querySelectorAll('.view-source-btn');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        
        const path = button.getAttribute('data-path');
        const line = button.getAttribute('data-line');
        const column = button.getAttribute('data-column');
        
        // 调用查看源码函数
        this.viewSourceCode(path, line, column);
      });
    });
  }

  /**
   * 查看源代码
   * @param {string} path 文件路径
   * @param {number} line 行号
   * @param {number} column 列号
   */
  viewSourceCode(path, line, column) {
    try {
      // 解析路径，提取有效的脚本URL
      let scriptUrl = path;
      
      // 尝试查找匹配的script标签
      const scripts = Array.from(document.scripts);
      let foundScript = null;
      
      // 查找匹配路径的脚本
      for (const script of scripts) {
        if (script.src && (script.src.includes(path) || path.includes(script.src))) {
          foundScript = script;
          scriptUrl = script.src;
          break;
        }
      }
      
      // 如果找到了外部脚本
      if (foundScript && scriptUrl) {
        // 使用fetch获取脚本内容
        fetch(scriptUrl)
          .then(response => {
            if (!response.ok) {
              throw new Error(`无法获取脚本: ${response.status} ${response.statusText}`);
            }
            return response.text();
          })
          .then(code => {
            this.showSourceCodeViewer(code, line, column, scriptUrl);
          })
          .catch(error => {
            this.addLog('info', `获取源码失败: ${error.message}`);
          });
        return;
      }
      
      // 如果是内部脚本路径（以script:开头）
      if (path.startsWith('script:')) {
        // 先尝试从内联脚本中查找
        const allInlineScripts = Array.from(document.scripts)
          .filter(s => !s.src)
          .map(s => s.textContent)
          .join('\n\n// ---- 下一个脚本 ----\n\n');
        
        if (allInlineScripts.trim()) {
          this.showSourceCodeViewer(allInlineScripts, line, column, '内联脚本');
          return;
        }
        
        // 如果没有内联脚本，再显示页面HTML
        this.showSourceCodeViewer(document.documentElement.outerHTML, line, column, '当前页面HTML');
        return;
      }
      
      // 其他情况，显示所有内联脚本
      const allScripts = Array.from(document.scripts)
        .filter(s => !s.src)
        .map(s => s.textContent)
        .join('\n\n// ---- 下一个脚本 ----\n\n');
      
      if (allScripts.trim()) {
        this.showSourceCodeViewer(allScripts, line, column, '内联脚本');
      } else {
        // 如果没有找到任何脚本，显示HTML内容
        this.showSourceCodeViewer(document.documentElement.outerHTML, line, column, '当前页面HTML');
      }
    } catch (error) {
      this.addLog('info', `查看源码时出错: ${error.message}`);
    }
  }

  /**
   * 显示源码查看器
   * @param {string} code 代码内容
   * @param {number} line 行号
   * @param {number} column 列号
   * @param {string} title 标题
   */
  showSourceCodeViewer(code, line, column, title) {
    // 创建或获取源码查看器容器
    let viewer = document.getElementById('event-tracker-source-viewer');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.id = 'event-tracker-source-viewer';
      viewer.className = 'event-tracker-source-viewer';
      document.body.appendChild(viewer);
      
      // 添加样式
      if (!document.getElementById('event-tracker-source-viewer-style')) {
        const style = document.createElement('style');
        style.id = 'event-tracker-source-viewer-style';
        style.textContent = `
          .event-tracker-source-viewer {
            position: fixed;
            top: 10%;
            left: 10%;
            width: 80%;
            height: 80%;
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-shadow: 0 0 20px rgba(0,0,0,0.3);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .source-viewer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 16px;
            background-color: #2c3e50;
            color: white;
          }
          .source-viewer-title {
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-right: 10px;
          }
          .source-viewer-close {
            cursor: pointer;
            font-size: 20px;
          }
          .source-viewer-content {
            flex: 1;
            overflow: auto;
            position: relative;
          }
          .source-viewer-code {
            font-family: monospace;
            font-size: 14px;
            line-height: 1.5;
            tab-size: 4;
            white-space: pre;
            padding: 10px;
            counter-reset: line;
          }
          .source-viewer-code .line {
            counter-increment: line;
            position: relative;
            display: block;
            white-space: pre-wrap;
          }
          .source-viewer-code .line:before {
            content: counter(line);
            display: inline-block;
            width: 3em;
            padding-right: 1em;
            margin-right: 1em;
            text-align: right;
            color: #888;
            border-right: 1px solid #ddd;
            user-select: none;
          }
          .source-viewer-code .line.highlighted {
            background-color: rgba(255, 235, 59, 0.2);
          }
          .source-viewer-editor {
            display: none;
            width: 100%;
            height: 100%;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.5;
            padding: 10px;
            border: none;
            outline: none;
            resize: none;
            tab-size: 4;
          }
          .source-viewer-toolbar {
            padding: 8px;
            display: flex;
            gap: 8px;
            background-color: #f5f5f5;
            border-top: 1px solid #ddd;
          }
          .source-viewer-btn {
            padding: 4px 8px;
            border: 1px solid #ccc;
            background-color: white;
            border-radius: 3px;
            cursor: pointer;
          }
          .source-viewer-btn:hover {
            background-color: #f0f0f0;
          }
          .source-viewer-btn-primary {
            background-color: #2c3e50;
            color: white;
            border-color: #2c3e50;
          }
          .source-viewer-btn-primary:hover {
            background-color: #1a2530;
          }
        `;
        document.head.appendChild(style);
      }
    }
    
    // 更新查看器内容
    viewer.innerHTML = `
      <div class="source-viewer-header">
        <div class="source-viewer-title">${title || '源代码查看器'}</div>
        <div class="source-viewer-close">×</div>
      </div>
      <div class="source-viewer-content">
        <div class="source-viewer-code"></div>
        <textarea class="source-viewer-editor"></textarea>
      </div>
      <div class="source-viewer-toolbar">
        <button class="source-viewer-btn" id="source-viewer-edit-btn">编辑</button>
        <button class="source-viewer-btn source-viewer-btn-primary" id="source-viewer-apply-btn" style="display:none">应用更改</button>
        <button class="source-viewer-btn" id="source-viewer-cancel-btn" style="display:none">取消</button>
        <span class="source-viewer-status"></span>
      </div>
    `;
    
    // 格式化并高亮代码
    const codeContainer = viewer.querySelector('.source-viewer-code');
    const codeLines = code.split('\n');
    
    // 生成带行号的代码
    codeLines.forEach((lineContent, index) => {
      const lineNumber = index + 1;
      const lineElement = document.createElement('div');
      lineElement.className = 'line';
      if (lineNumber == line) {
        lineElement.classList.add('highlighted');
      }
      
      // 处理HTML特殊字符
      const escapedContent = lineContent
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      lineElement.innerHTML = escapedContent;
      codeContainer.appendChild(lineElement);
    });
    
    // 添加滚动到特定行的逻辑
    if (line) {
      setTimeout(() => {
        const highlightedLine = codeContainer.querySelector('.line.highlighted');
        if (highlightedLine) {
          highlightedLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    
    // 设置编辑器内容
    const editor = viewer.querySelector('.source-viewer-editor');
    editor.value = code;
    
    // 添加事件监听器
    const closeBtn = viewer.querySelector('.source-viewer-close');
    closeBtn.addEventListener('click', () => {
      viewer.remove();
    });
    
    // 编辑按钮
    const editBtn = viewer.querySelector('#source-viewer-edit-btn');
    const applyBtn = viewer.querySelector('#source-viewer-apply-btn');
    const cancelBtn = viewer.querySelector('#source-viewer-cancel-btn');
    const statusEl = viewer.querySelector('.source-viewer-status');
    
    editBtn.addEventListener('click', () => {
      // 切换到编辑模式
      codeContainer.style.display = 'none';
      editor.style.display = 'block';
      editBtn.style.display = 'none';
      applyBtn.style.display = 'inline-block';
      cancelBtn.style.display = 'inline-block';
      statusEl.textContent = '编辑模式';
    });
    
    cancelBtn.addEventListener('click', () => {
      // 取消编辑
      codeContainer.style.display = 'block';
      editor.style.display = 'none';
      editBtn.style.display = 'inline-block';
      applyBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      statusEl.textContent = '';
    });
    
    applyBtn.addEventListener('click', () => {
      try {
        // 应用更改 - 通过创建新的脚本标签动态执行
        const newCode = editor.value;
        
        // 确认是否执行
        if (confirm('警告：修改并执行JavaScript代码可能会导致页面不稳定。是否继续？')) {
          const script = document.createElement('script');
          script.textContent = newCode;
          document.head.appendChild(script);
          
          // 在执行后删除脚本标签
          setTimeout(() => {
            script.remove();
          }, 0);
          
          statusEl.textContent = '更改已应用并执行';
          
          // 切换回查看模式并更新代码显示
          codeContainer.innerHTML = '';
          newCode.split('\n').forEach((lineContent, index) => {
            const lineNumber = index + 1;
            const lineElement = document.createElement('div');
            lineElement.className = 'line';
            if (lineNumber == line) {
              lineElement.classList.add('highlighted');
            }
            
            // 处理HTML特殊字符
            const escapedContent = lineContent
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            
            lineElement.innerHTML = escapedContent;
            codeContainer.appendChild(lineElement);
          });
          
          codeContainer.style.display = 'block';
          editor.style.display = 'none';
          editBtn.style.display = 'inline-block';
          applyBtn.style.display = 'none';
          cancelBtn.style.display = 'none';
        }
      } catch (err) {
        statusEl.textContent = `错误: ${err.message}`;
      }
    });
  }
  
  /**
   * 添加普通日志
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   */
  addLog(level, message) {
    // 检查该级别的日志是否应该记录
    if (!this.logLevels[level]) return;
    
    if (!this.outputElement) return;
    
    const logElement = document.createElement('div');
    logElement.className = `log-${level}`;
    logElement.textContent = message;
    
    // 如果是内联事件触发的日志，根据配置决定是否显示调用堆栈
    if (level === 'info' && message.includes('内联事件') && message.includes('被触发') && this.showStackForInlineEvents) {
      // 获取调用堆栈
      const stack = this.getStackTrace();
      if (stack && this.logLevels.stack) {
        // 创建堆栈区域
        const stackElement = document.createElement('div');
        stackElement.className = 'stack-trace';
        
        // 如果堆栈为空，显示一个提示
        if (!stack || stack.trim() === '') {
          stackElement.innerHTML = '<i>无堆栈信息</i>';
          stackElement.classList.add('collapsed');
        } else {
          stackElement.innerHTML = stack;
          
          // 为堆栈中的查看源码按钮添加事件监听
          this.addSourceCodeViewListeners(stackElement);
        }
        
        // 修改日志元素为可折叠样式
        logElement.className = 'event-log';
        
        // 创建标题区域
        const headerElement = document.createElement('div');
        headerElement.className = 'event-log-header';
        
        // 折叠/展开按钮
        const toggleButton = document.createElement('span');
        toggleButton.className = 'toggle-stack';
        toggleButton.textContent = '▼';
        toggleButton.title = '点击折叠/展开堆栈';
        
        // 如果堆栈为空，默认折叠
        if (!stack || stack.trim() === '') {
          toggleButton.classList.add('collapsed');
        }
        
        // 将原始消息移动到标题区域
        headerElement.appendChild(toggleButton);
        headerElement.appendChild(document.createTextNode(message));
        
        // 添加折叠/展开的点击事件
        headerElement.addEventListener('click', () => {
          toggleButton.classList.toggle('collapsed');
          stackElement.classList.toggle('collapsed');
        });
        
        // 重新组装日志元素
        logElement.innerHTML = '';
        logElement.appendChild(headerElement);
        logElement.appendChild(stackElement);
      }
    }
    
    this.outputElement.appendChild(logElement);
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  /**
   * 清空日志
   */
  clearLogs() {
    if (this.outputElement) {
      this.outputElement.innerHTML = '';
    }
    this.trackedEvents = [];
  }

  /**
   * 设置是否保留日志
   * @param {boolean} preserve 是否保留
   */
  setPreserveLogs(preserve) {
    this.preserveLogs = preserve;
  }

  /**
   * 获取元素的选择器表示
   * @param {HTMLElement} element 元素
   * @returns {string} 元素选择器
   */
  getElementSelector(element) {
    if (!element) return 'unknown';
    
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .filter(cls => !cls.startsWith('event-tracker-'))
      .map(cls => `.${cls}`)
      .join('');
    
    return `${tagName}${id}${classes}`;
  }

  /**
   * 销毁组件
   */
  destroy() {
    this.stopTracking();
    this.targetElement = null;
    this.outputElement = null;
  }

  /**
   * 处理点击事件，分析链接行为
   * @param {MouseEvent} event 点击事件
   */
  handleClickWithDetails(event) {
    // 忽略事件追踪器自身的点击
    if (this.isEventTrackerElement(event.target)) {
      return;
    }
    
    // 检查是否与目标元素相关
    if (!this.shouldTrackEvent(event)) {
      return;
    }

    // 阻止事件继续传播，防止触发页面上其他监听器
    // 但不立即阻止默认行为，我们需要先分析后决定是否要阻止默认行为
    event.stopPropagation();

    // 监视可能会触发弹窗的元素类型
    const clickedElement = event.target;
    const closestInteractive = clickedElement.closest('a, button, [role="button"], input[type="button"], input[type="submit"], .btn');
    
    if (closestInteractive) {
      // 分析元素属性，查找可能触发弹窗的迹象
      const tagName = closestInteractive.tagName.toLowerCase();
      const className = closestInteractive.className || '';
      
      // 检查潜在的弹窗触发器
      const popupIndicators = /modal|popup|dialog|lightbox|toggle|dropdown/i;
      const hasPopupClasses = popupIndicators.test(className);
      const hasPopupAttributes = closestInteractive.hasAttribute('data-toggle') || 
                                closestInteractive.hasAttribute('data-target') ||
                                closestInteractive.hasAttribute('data-modal') ||
                                closestInteractive.hasAttribute('aria-haspopup');
      
      if (hasPopupClasses || hasPopupAttributes) {
        this.addLog('info', `点击可能触发弹窗的元素: ${this.getElementSelector(closestInteractive)}`);
        
        // 记录元素相关属性
        const attributes = Array.from(closestInteractive.attributes)
          .map(attr => `${attr.name}="${attr.value}"`)
          .join(', ');
        
        if (attributes) {
          this.addLog('info', `相关属性: ${attributes}`);
        }
        
        // 监听点击后的DOM变化
        setTimeout(() => {
          this.addLog('info', '检查点击后DOM变化');
        }, 100);
      }
    }

    // 查找最近的链接父元素
    const link = event.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (href) {
        let actionType = '未知链接';
        let isModified = false;
        
        if (href.startsWith('#')) {
          actionType = '页内锚点';
          
          // 拦截页内锚点跳转，修改为新标签打开当前页面+锚点
          // 防止因页内跳转刷新页面导致日志丢失
          if (!link.getAttribute('target') || link.getAttribute('target') !== '_blank') {
            const currentUrl = window.location.href.split('#')[0];
            const fullUrl = currentUrl + href;
            
            // 阻止默认行为
            event.preventDefault();
            
            // 在新标签中打开
            window.open(fullUrl, '_blank');
            
            // 记录拦截行为
            this.addLog('action', `⚠️ 拦截页内跳转至 ${href}，已在新标签页打开`);
            isModified = true;
          }
        } else if (href.startsWith('javascript:')) {
          actionType = 'JavaScript脚本';
        } else if (href.startsWith('mailto:')) {
          actionType = '邮件链接';
        } else if (href.startsWith('tel:')) {
          actionType = '电话链接';
        } else if (href.startsWith('http') || href.startsWith('//')) {
          actionType = '外部链接';
          
          // 针对外部链接，如果没有设置target="_blank"，则修改为新标签打开
          if (!link.getAttribute('target') || link.getAttribute('target') !== '_blank') {
            // 阻止默认行为
            event.preventDefault();
            
            // 在新标签中打开
            window.open(href, '_blank');
            
            // 记录拦截行为
            this.addLog('action', `⚠️ 拦截外部链接跳转至 ${href}，已在新标签页打开`);
            isModified = true;
          }
        } else {
          actionType = '相对路径链接';
          
          // 针对相对路径链接，如果没有设置target="_blank"，则修改为新标签打开
          if (!link.getAttribute('target') || link.getAttribute('target') !== '_blank') {
            // 阻止默认行为
            event.preventDefault();
            
            // 构造完整URL
            const baseUrl = window.location.origin;
            const pathname = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            const fullUrl = href.startsWith('/') ? baseUrl + href : baseUrl + pathname + href;
            
            // 在新标签中打开
            window.open(fullUrl, '_blank');
            
            // 记录拦截行为
            this.addLog('action', `⚠️ 拦截相对路径跳转至 ${href}，已在新标签页打开`);
            isModified = true;
          }
        }
        
        // 分析链接属性
        const target = link.getAttribute('target');
        const rel = link.getAttribute('rel');
        const onclick = link.getAttribute('onclick');
        
        let detailsLog = `链接行为: ${actionType}, 目标: ${href}`;
        
        if (target) {
          detailsLog += `, 打开方式: ${target}`;
        }
        
        if (rel) {
          detailsLog += `, 关系: ${rel}`;
        }
        
        if (onclick) {
          detailsLog += `, 有onclick事件`;
          // 检查 onclick 内容是否可能触发弹窗
          if (/show|open|toggle|pop|modal|alert|confirm|prompt/i.test(onclick)) {
            this.addLog('info', `链接包含可能触发弹窗的onclick事件: ${onclick}`);
          }
        }
        
        if (!isModified) {
          this.addLog('action', detailsLog);
        }
        
        // 标记默认行为是否被阻止
        setTimeout(() => {
          if (event.defaultPrevented && !isModified) {
            this.addLog('info', '默认跳转行为被阻止');
          }
        }, 0);
      }
    }
    
    // 查找图片点击
    const isImageClick = event.target.tagName === 'IMG' || event.target.closest('img');
    if (isImageClick) {
      const img = event.target.tagName === 'IMG' ? event.target : event.target.closest('img');
      this.addLog('info', `图片点击: ${this.getElementSelector(img)}`);
      
      // 检查图片是否有父级容器可能触发弹窗
      const parentWithHandler = img.closest('[onclick], [data-toggle], [data-lightbox], [data-fancybox]');
      if (parentWithHandler) {
        this.addLog('info', `图片有可能触发弹窗的父元素: ${this.getElementSelector(parentWithHandler)}`);
      }
      
      // 检查是否是产品图片等常见会触发预览弹窗的元素
      const isProductImage = /product|gallery|preview|thumbnail/i.test(img.className) || 
                            img.closest('.product, .gallery, .carousel, .slideshow');
      if (isProductImage) {
        this.addLog('info', '图片属于产品图库，可能会触发预览弹窗');
      }
    }
  }

  /**
   * 处理表单提交
   * @param {Event} event 提交事件
   */
  handleFormSubmit(event) {
    // 检查是否与目标元素相关
    if (!this.shouldTrackEvent(event)) {
      return;
    }

    // 阻止事件继续传播，防止触发页面上其他监听器
    event.stopPropagation();

    const form = event.target;
    const action = form.getAttribute('action') || '当前页面';
    const method = form.getAttribute('method') || 'GET';
    
    let detailsLog = `表单提交: 目标=${action}, 方法=${method}`;
    
    // 获取表单包含的字段数量
    const inputCount = form.querySelectorAll('input, select, textarea').length;
    detailsLog += `, 包含${inputCount}个字段`;
    
    // 检查是否有文件上传
    const hasFiles = form.querySelector('input[type="file"]') !== null;
    if (hasFiles) {
      detailsLog += `, 包含文件上传`;
    }
    
    this.addLog('action', detailsLog);
    
    // 标记默认行为是否被阻止
    setTimeout(() => {
      if (event.defaultPrevented) {
        this.addLog('info', '默认提交行为被阻止');
      }
    }, 0);
  }

  /**
   * 处理导航相关事件
   * @param {Event} event 导航事件
   */
  handleNavigationEvent(event) {
    const eventType = event.type;
    let details = '';
    
    // 导航事件不阻止传播，因为这可能会破坏页面功能
    
    switch (eventType) {
      case 'hashchange':
        if (event.oldURL && event.newURL) {
          const oldHash = event.oldURL.split('#')[1] || '';
          const newHash = event.newURL.split('#')[1] || '';
          details = `从 #${oldHash} 变更到 #${newHash}`;
        }
        break;
      
      case 'popstate':
        details = event.state ? '有状态数据' : '无状态数据';
        break;
      
      case 'pageshow':
        details = event.persisted ? '从缓存恢复' : '页面首次加载';
        break;
      
      case 'pagehide':
        details = event.persisted ? '页面进入缓存' : '页面被卸载';
        break;
    }
    
    this.addLog('navigation', `导航事件: ${eventType}${details ? ` (${details})` : ''}`);
  }

  /**
   * 检查元素是否为事件追踪器的一部分
   * @param {HTMLElement} element 要检查的元素
   * @returns {boolean} 是否为事件追踪器元素
   */
  isEventTrackerElement(element) {
    if (!element) return false;
    
    // 检查元素类名是否包含事件追踪器前缀
    if (element.classList) {
      for (let cls of element.classList) {
        if (cls.startsWith('event-tracker-')) {
          return true;
        }
      }
    }
    
    // 检查是否在事件追踪器内部
    return element.closest('.event-tracker-panel, .event-tracker-float-ball, .event-tracker-selector') !== null;
  }

  /**
   * 检查子节点中的弹窗
   * @param {HTMLElement} node 节点
   * @param {number} depth 递归深度
   */
  checkChildNodesForPopups(node, depth) {
    if (depth <= 0 || !node.children || node.children.length === 0) return;
    
    for (let child of node.children) {
      this.checkForDialogOrPopup(child);
      this.checkChildNodesForPopups(child, depth - 1);
    }
  }

  /**
   * 检测UI框架并设置监控
   */
  detectUIFrameworks() {
    const frameworks = [];
    
    // 检测 Bootstrap
    if (
      typeof window.bootstrap !== 'undefined' || 
      document.querySelector('[data-bs-toggle], .modal.fade, .bootstrap')
    ) {
      frameworks.push('Bootstrap');
    }
    
    // 检测 jQuery
    if (typeof window.jQuery !== 'undefined') {
      frameworks.push('jQuery');
      
      // jQuery UI
      if (typeof window.jQuery.ui !== 'undefined') {
        frameworks.push('jQuery UI');
      }
    }
    
    // 检测 ElementUI/Element Plus
    if (document.querySelector('.el-dialog, .el-message-box, .el-drawer')) {
      frameworks.push('Element UI');
    }
    
    // 检测 Ant Design
    if (document.querySelector('.ant-modal, .ant-drawer, .ant-notification')) {
      frameworks.push('Ant Design');
    }
    
    // 检测 Vuetify
    if (document.querySelector('.v-dialog, .v-overlay, .v-menu')) {
      frameworks.push('Vuetify');
    }
    
    // 检测 Material UI
    if (document.querySelector('.MuiDialog-root, .MuiDrawer-root, .MuiPopover-root')) {
      frameworks.push('Material UI');
    }
    
    // 检测通用弹窗库
    if (typeof window.Swal !== 'undefined' || document.querySelector('.swal2-container')) {
      frameworks.push('SweetAlert2');
    }
    
    if (document.querySelector('.fancybox-container, [data-fancybox]')) {
      frameworks.push('Fancybox');
    }
    
    if (document.querySelector('.featherlight, [data-featherlight]')) {
      frameworks.push('Featherlight');
    }
    
    if (typeof window.lightbox !== 'undefined' || document.querySelector('[data-lightbox]')) {
      frameworks.push('Lightbox.js');
    }
    
    if (frameworks.length) {
      this.addLog('info', `检测到UI框架: ${frameworks.join(', ')}`);
      
      // 对特定框架进行增强监控
      frameworks.forEach(framework => {
        this.monitorFrameworkSpecificEvents(framework);
      });
    }
  }

  /**
   * 监控特定UI框架的弹窗事件
   * @param {string} framework 框架名称
   */
  monitorFrameworkSpecificEvents(framework) {
    switch(framework) {
      case 'Bootstrap':
        this.monitorBootstrapModals();
        break;
      case 'jQuery':
        this.monitorjQueryEvents();
        break;
      case 'SweetAlert2':
        this.monitorSweetAlert();
        break;
      case 'Fancybox':
        this.monitorFancybox();
        break;
      case 'Lightbox.js':
        this.monitorLightbox();
        break;
      default:
        // 通用 DOM 监控足以处理其他框架
        break;
    }
  }

  /**
   * 监控 Bootstrap 模态框
   */
  monitorBootstrapModals() {
    // 针对事件监控
    const modalEvents = [
      'show.bs.modal', 'shown.bs.modal', 
      'hide.bs.modal', 'hidden.bs.modal'
    ];
    
    const handleModalEvent = (event) => {
      const modal = event.target;
      if (modal && modal.classList.contains('modal')) {
        this.addLog('popup', `Bootstrap 模态框 ${event.type}: ${this.getElementSelector(modal)}`);
      }
    };
    
    modalEvents.forEach(eventName => {
      document.addEventListener(eventName, handleModalEvent);
    });
    
    this.addLog('info', '已添加 Bootstrap 模态框监控');
  }

  /**
   * 监控 jQuery 事件
   */
  monitorjQueryEvents() {
    if (typeof window.jQuery === 'undefined') return;
    
    const $ = window.jQuery;
    const self = this;
    
    // 监控常见的 jQuery 模态框/弹窗调用
    const originalFn = $.fn;
    
    // 监控 .modal() 方法
    if ($.fn.modal) {
      const originalModal = $.fn.modal;
      $.fn.modal = function(options) {
        self.addLog('popup', `jQuery 模态框调用: ${options || 'toggle'} 于 ${self.getElementSelector(this[0])}`);
        return originalModal.apply(this, arguments);
      };
    }
    
    // 监控 .dialog() 方法
    if ($.fn.dialog) {
      const originalDialog = $.fn.dialog;
      $.fn.dialog = function(options) {
        self.addLog('popup', `jQuery UI 对话框调用: ${typeof options === 'string' ? options : JSON.stringify(options)} 于 ${self.getElementSelector(this[0])}`);
        return originalDialog.apply(this, arguments);
      };
    }
    
    // 监控 .popup() 方法
    if ($.fn.popup) {
      const originalPopup = $.fn.popup;
      $.fn.popup = function(options) {
        self.addLog('popup', `jQuery 弹窗调用: ${typeof options === 'string' ? options : 'options'} 于 ${self.getElementSelector(this[0])}`);
        return originalPopup.apply(this, arguments);
      };
    }
    
    this.addLog('info', '已添加 jQuery 弹窗方法监控');
  }

  /**
   * 监控 SweetAlert2
   */
  monitorSweetAlert() {
    if (typeof window.Swal === 'undefined') return;
    
    const originalSwal = window.Swal;
    const self = this;
    
    // 重写 Swal 方法
    window.Swal = function() {
      self.addLog('popup', `SweetAlert2 弹窗显示`);
      return originalSwal.apply(this, arguments);
    };
    
    // 保留原始方法
    window.Swal.fire = function() {
      self.addLog('popup', `SweetAlert2.fire 弹窗显示`);
      return originalSwal.fire.apply(originalSwal, arguments);
    };
    
    this.addLog('info', '已添加 SweetAlert2 监控');
  }

  /**
   * 监控 Fancybox
   */
  monitorFancybox() {
    if (typeof window.$.fancybox === 'undefined') return;
    
    const originalFancybox = window.$.fancybox;
    const self = this;
    
    window.$.fancybox = function() {
      self.addLog('popup', `Fancybox 弹窗显示`);
      return originalFancybox.apply(this, arguments);
    };
    
    this.addLog('info', '已添加 Fancybox 监控');
  }

  /**
   * 监控 Lightbox
   */
  monitorLightbox() {
    if (typeof window.lightbox === 'undefined') return;
    
    const originalLightbox = window.lightbox;
    const self = this;
    
    if (window.lightbox.option) {
      const originalShow = window.lightbox.showImage || window.lightbox.show;
      if (originalShow) {
        window.lightbox.showImage = window.lightbox.show = function() {
          self.addLog('popup', `Lightbox 弹窗显示`);
          return originalShow.apply(this, arguments);
        };
      }
    }
    
    this.addLog('info', '已添加 Lightbox 监控');
  }

  /**
   * 设置日志级别
   * @param {Object} levels 日志级别配置对象
   */
  setLogLevels(levels) {
    if (levels && typeof levels === 'object') {
      Object.keys(this.logLevels).forEach(key => {
        if (typeof levels[key] === 'boolean') {
          this.logLevels[key] = levels[key];
        }
      });
    }
  }
  
  /**
   * 获取当前日志级别设置
   * @returns {Object} 日志级别配置对象
   */
  getLogLevels() {
    return {...this.logLevels};
  }
  
  /**
   * 设置是否在内联事件上显示堆栈
   * @param {boolean} show 是否显示
   */
  setShowStackForInlineEvents(show) {
    this.showStackForInlineEvents = !!show;
  }
} 