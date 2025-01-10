class TabManagerUI {
    constructor() {
        this.tabsList = document.getElementById('tabsList');
        this.categoryFilter = document.getElementById('categoryFilter');
        this.sortBy = document.getElementById('sortBy');
        this.reminderInterval = document.getElementById('reminderInterval');
        this.timeUnit = document.getElementById('timeUnit');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.initializeEventListeners();
        this.countdownIntervals = new Map();
        this.loadSavedSettings();
    }

    async loadSavedSettings() {
        try {
            const result = await chrome.storage.local.get('savedReminderSetting');
            if (result.savedReminderSetting) {
                const { value, unit } = result.savedReminderSetting;
                this.reminderInterval.value = value;
                this.timeUnit.value = unit;
            }
        } catch (error) {
            console.error('Error loading saved settings:', error);
        }
    }

    initializeEventListeners() {
        // 刷新按钮事件
        this.refreshBtn.addEventListener('click', async () => {
            this.refreshBtn.disabled = true;
            try {
                await this.refreshTabs();
            } finally {
                this.refreshBtn.disabled = false;
            }
        });

        // 提醒间隔设置事件
        this.reminderInterval.addEventListener('change', async () => {
            const value = parseInt(this.reminderInterval.value);
            const unit = this.timeUnit.value;
            
            // 直接在这里计算毫秒值
            const multiplier = {
                'm': 60 * 1000,
                'h': 60 * 60 * 1000,
                'd': 24 * 60 * 60 * 1000
            };
            const reminderInterval = value * multiplier[unit];
            
            // 发送计算好的毫秒值
            await chrome.runtime.sendMessage({
                type: 'updateReminderInterval',
                interval: reminderInterval  // 直接传递毫秒值
            });
        });

        // 时间单位变化事件
        this.timeUnit.addEventListener('change', () => {
            // 触发 reminderInterval 的 change 事件
            this.reminderInterval.dispatchEvent(new Event('change'));
        });

        // 分类过滤器事件
        this.categoryFilter.addEventListener('change', () => this.refreshTabs());
        
        // 排序方式事件
        this.sortBy.addEventListener('change', () => this.refreshTabs());
    }

    async refreshTabs() {
        try {
            this.tabsList.innerHTML = '';
            
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.textContent = 'Refreshing tabs...';
            this.tabsList.appendChild(loadingDiv);

            const tabs = await chrome.tabs.query({});
            const { tabData, tabActivityData } = await chrome.storage.local.get(['tabData', 'tabActivityData']);
            
            this.tabsList.innerHTML = '';

            // 过滤和排序标签页
            let filteredTabs = this.filterTabs(tabs, tabData);
            filteredTabs = this.sortTabs(filteredTabs, tabData, tabActivityData);

            for (const tab of filteredTabs) {
                const analysis = tabData?.analysis[tab.id];
                const idleScore = this.calculateIdleScore(tabActivityData?.lastActive[tab.id]);
                
                try {
                    const tabElement = await this.createTabElement(tab, analysis, idleScore, tabActivityData || {});
                    if (tabElement && tabElement instanceof Element) {
                        this.tabsList.appendChild(tabElement);
                    }
                } catch (err) {
                    console.error('Error creating tab element:', err);
                }
            }
        } catch (err) {
            console.error('Error refreshing tabs:', err);
            this.tabsList.innerHTML = '<div class="error">Failed to refresh tabs. Please try again.</div>';
        }
    }

    filterTabs(tabs, tabData) {
        const category = this.categoryFilter.value;
        if (category === 'all') return tabs;
        
        return tabs.filter(tab => {
            const analysis = tabData?.analysis[tab.id];
            return analysis?.category === category;
        });
    }

    sortTabs(tabs, tabData, tabActivityData) {
        const sortBy = this.sortBy.value;
        return [...tabs].sort((a, b) => {
            switch (sortBy) {
                case 'recent':
                    return (tabActivityData?.lastActive[b.id] || 0) - (tabActivityData?.lastActive[a.id] || 0);
                case 'importance':
                    const scoreA = tabData?.analysis[a.id]?.importance_score || 0;
                    const scoreB = tabData?.analysis[b.id]?.importance_score || 0;
                    return scoreB - scoreA;
                case 'title':
                    return a.title.localeCompare(b.title);
                default:
                    return 0;
            }
        });
    }

    calculateIdleScore(lastActiveTime) {
        if (!lastActiveTime) return 0;
        const now = Date.now();
        const hoursSinceLastActive = (now - lastActiveTime) / (1000 * 60 * 60);
        return Math.max(0, Math.min(1, hoursSinceLastActive / 24));
    }

    calculateCombinedScore(analysis, idleScore) {
        const importanceScore = analysis?.importance_score || 0.5;
        return (importanceScore * 0.5) + (idleScore * 0.5);
    }

    getPriorityClass(score) {
        if (score >= 0.7) return 'high';
        if (score >= 0.4) return 'medium';
        return 'low';
    }

    formatLastActive(timestamp) {
        if (!timestamp) return 'never';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'just now';
    }

    formatTotalActiveTime(milliseconds) {
        if (!milliseconds) return '0min';
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
    }

    // 更新倒计时显示
    updateCountdown(reminderContainer, endTime) {
        const countdownSpan = reminderContainer.querySelector('.countdown');
        if (!countdownSpan) return;

        const now = Date.now();
        const timeLeft = endTime - now;

        if (timeLeft <= 0) {
            countdownSpan.textContent = 'Time\'s up!';
            // 不在这里处理倒计时结束，让 background.js 处理
            return;
        }

        // 只负责显示倒计时
        const seconds = Math.floor(timeLeft / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        countdownSpan.textContent = hours > 0 
            ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
            : minutes > 0
                ? `${minutes}m ${seconds % 60}s`
                : `${seconds}s`;
    }

    async createTabElement(tab, analysis, idleScore, tabActivityData) {
        try {
            const div = document.createElement('div');
            div.className = 'tab-item';
            
            // 获取铃铛状态和倒计时信息
            const reminderData = await chrome.storage.local.get([
                `reminder_${tab.id}`,
                `reminderEnd_${tab.id}`,
                'activeReminderInterval'
            ]);
            
            // 明确检查是否为 true，如果是 false 或不存在都视为未激活
            const isActive = reminderData[`reminder_${tab.id}`] === true;
            const endTime = reminderData[`reminderEnd_${tab.id}`];
            
            console.log(`Loading tab ${tab.id} reminder status:`, { isActive, endTime });

            const combinedScore = this.calculateCombinedScore(analysis, idleScore);
            
            // 安全地获取活动数据
            const safeTabActivityData = {
                lastActive: {},
                totalActiveTime: {},
                visitCount: {},
                ...tabActivityData
            };
    
            // 安全地获取提醒数据
            const storageData = await chrome.storage.local.get(['reminderData']);
            const isCustomReminder = storageData.reminderData?.customReminderTabs?.includes(tab.id);
            const nextReminderTime = storageData.reminderData?.reminderTimes?.[tab.id];
            const hasInterval = storageData.reminderData?.interval > 0;
            
            // 计算倒计时
            let countdownText = '';
            if (isCustomReminder && hasInterval && nextReminderTime) {
                const timeLeft = nextReminderTime - Date.now();
                if (timeLeft > 0) {
                     countdownText = this.formatTimeLeft(timeLeft);
                 } else {
                  countdownText = 'Now';
                 }
             }
    
            // 安全地获取标签页数据
            const lastActive = safeTabActivityData.lastActive[tab.id];
            const totalActive = safeTabActivityData.totalActiveTime[tab.id];
            const visits = safeTabActivityData.visitCount[tab.id] || 0;
    
            div.innerHTML = `
                <img class="tab-icon" src="${tab.favIconUrl || 'icons/default-favicon.png'}" alt="">
                <div class="tab-info">
                    <div class="tab-title">${tab.title || 'Untitled'}</div>
                    <div class="tab-meta">
                        <div class="meta-row">
                            <span class="importance-badge importance-${this.getPriorityClass(combinedScore)}">
                                ${Math.round(combinedScore * 100)}%
                            </span>
                            <span class="category-badge">${analysis?.category || 'unknown'}</span>
                            <div class="reminder-container">
                                <button class="reminder-toggle ${isActive ? 'active' : ''}" title="Toggle custom reminder">
                                    ${isActive ? '🔔' : '🔕'}
                                </button>
                                ${isActive && endTime ? `<span class="countdown" data-end-time="${endTime}"></span>` : ''}
                            </div>
                        </div>
                        <div class="time-stats">
                            <span class="time-badge last-active" title="Last active time">
                                Last: ${this.formatLastActive(lastActive)}
                            </span>
                            <span class="time-badge total-time" title="Total active time">
                                Total: ${this.formatTotalActiveTime(totalActive)}
                            </span>
                            <span class="time-badge visit-count" title="Number of visits">
                                Visits: ${visits}
                            </span>
                        </div>
                    </div>
                </div>
            `;
    
            // 如果铃铛是激活状态，恢复倒计时显示
            if (isActive && endTime) {
                const reminderContainer = div.querySelector('.reminder-container');
                const countdownSpan = reminderContainer.querySelector('.countdown');
                
                if (countdownSpan) {
                    // 立即显示初始倒计时
                    const initialTimeLeft = endTime - Date.now();
                    const initialSeconds = Math.floor(initialTimeLeft / 1000);
                    const initialMinutes = Math.floor(initialSeconds / 60);
                    const initialHours = Math.floor(initialMinutes / 60);
                    
                    countdownSpan.textContent = initialHours > 0 
                        ? `${initialHours}h ${initialMinutes % 60}m ${initialSeconds % 60}s`
                        : initialMinutes > 0
                            ? `${initialMinutes}m ${initialSeconds % 60}s`
                            : `${initialSeconds}s`;

                    // 然后设置定时更新
                    const updateInterval = setInterval(async () => {
                        const timeLeft = endTime - Date.now();
                        if (timeLeft <= 0) {
                            this.handleCountdownEnd(tab.id, tab, countdownSpan, reminderContainer, updateInterval);
                            return;
                        }
                        // 正常更新倒计时显示
                        const seconds = Math.floor(timeLeft / 1000);
                        const minutes = Math.floor(seconds / 60);
                        const hours = Math.floor(minutes / 60);
                        countdownSpan.textContent = hours > 0 
                            ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
                            : minutes > 0
                                ? `${minutes}m ${seconds % 60}s`
                                : `${seconds}s`;
                    }, 1000);

                    // 保存定时器ID
                    this.countdownIntervals.set(tab.id, updateInterval);
                }
            }

            // 添加提醒切换按钮事件监听
            const reminderToggle = div.querySelector('.reminder-toggle');
            reminderToggle.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tabId = tab.id;
                const isActive = !e.target.classList.contains('active');
                
                try {
                    // 获取包含铃铛的容器元素
                    const reminderContainer = e.target.closest('.reminder-container');
                    if (!reminderContainer) {
                        console.error('Reminder container not found');
                        return;
                    }

                    if (isActive) {
                        // 激活铃铛
                        const { activeReminderInterval } = await chrome.storage.local.get('activeReminderInterval');
                        if (!activeReminderInterval) {
                            alert('Please set a reminder time and click "Go Remind!" first');
                            return;
                        }

                        const endTime = Date.now() + activeReminderInterval;
                        await chrome.storage.local.set({
                            [`reminder_${tabId}`]: true,
                            [`reminderEnd_${tabId}`]: endTime
                        });

                        // 只更新 UI 和设置倒计时
                        e.target.classList.add('active');
                        e.target.textContent = '🔔';

                        // 创建或更新倒计时显示
                        let countdownSpan = reminderContainer.querySelector('.countdown');
                        if (!countdownSpan) {
                            countdownSpan = document.createElement('span');
                            countdownSpan.className = 'countdown';
                            reminderContainer.appendChild(countdownSpan);
                        }

                        // 立即显示初始倒计时
                        const initialTimeLeft = endTime - Date.now();
                        const initialSeconds = Math.floor(initialTimeLeft / 1000);
                        const initialMinutes = Math.floor(initialSeconds / 60);
                        const initialHours = Math.floor(initialMinutes / 60);
                        
                        countdownSpan.textContent = initialHours > 0 
                            ? `${initialHours}h ${initialMinutes % 60}m ${initialSeconds % 60}s`
                            : initialMinutes > 0
                                ? `${initialMinutes}m ${initialSeconds % 60}s`
                                : `${initialSeconds}s`;

                        // 然后设置定时更新
                        const updateInterval = setInterval(async () => {
                            const timeLeft = endTime - Date.now();
                            if (timeLeft <= 0) {
                                this.handleCountdownEnd(tabId, tab, countdownSpan, reminderContainer, updateInterval);
                                return;
                            }
                            // 正常更新倒计时显示
                            const seconds = Math.floor(timeLeft / 1000);
                            const minutes = Math.floor(seconds / 60);
                            const hours = Math.floor(minutes / 60);
                            countdownSpan.textContent = hours > 0 
                                ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
                                : minutes > 0
                                    ? `${minutes}m ${seconds % 60}s`
                                    : `${seconds}s`;
                        }, 1000);

                        // 保存定时器ID
                        this.countdownIntervals.set(tabId, updateInterval);

                    } else {
                        // 取消激活铃铛
                        // 清除存储的数据
                        await chrome.storage.local.set({
                            [`reminder_${tabId}`]: false
                        });
                        
                        // 清除倒计时相关的数据
                        await chrome.storage.local.remove([
                            `reminderEnd_${tabId}`
                        ]);

                        // 更新UI
                        e.target.classList.remove('active');
                        e.target.textContent = '🔕';

                        // 清除倒计时显示
                        const countdownSpan = reminderContainer.querySelector('.countdown');
                        if (countdownSpan) {
                            countdownSpan.remove();
                        }

                        // 清除定时器
                        if (this.countdownIntervals.has(tabId)) {
                            clearInterval(this.countdownIntervals.get(tabId));
                            this.countdownIntervals.delete(tabId);
                        }

                        console.log(`Cleared reminder for tab ${tabId}`);
                    }
                } catch (error) {
                    console.error('Failed to toggle reminder:', error);
                }
            });

             // 初始化倒计时显示
             const reminderDataResult = await chrome.storage.local.get(['reminderData']);
             if (reminderDataResult.reminderData?.customReminderTabs?.includes(tab.id)) {
                 const nextReminderTime = reminderDataResult.reminderData.reminderTimes[tab.id];
                 if (nextReminderTime) {
                     const reminderContainer = div.querySelector('.reminder-container');
                     const countdownSpan = document.createElement('span');
                     countdownSpan.className = 'countdown';
                     reminderContainer.appendChild(countdownSpan);
                     
                     // 设置定时器
                     const updateInterval = setInterval(() => {
                         this.updateCountdown(reminderContainer, nextReminderTime);
                     }, 1000);
                     
                     this.countdownIntervals.set(tab.id, updateInterval);
                     this.updateCountdown(reminderContainer, nextReminderTime);
                 }
             }
    
            div.addEventListener('click', () => {
                chrome.tabs.update(tab.id, { active: true });
            });
    
            return div;
        } catch (err) {
            console.error('Error creating tab element:', err);
            return null;
        }
    }

    // 在组件销毁时清理定时器
    cleanup() {
        for (const interval of this.countdownIntervals.values()) {
            clearInterval(interval);
        }
        this.countdownIntervals.clear();
    }

    // 添加格式化时间的方法
    formatTimeLeft(ms) {
        if (ms <= 0) return 'Now';
        const minutes = Math.floor(ms / (60 * 1000));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        return `${minutes}m`;
    }

    async init() {
        try {
            await this.refreshTabs();
        } catch (err) {
            console.error('Initialization error:', err);
            this.tabsList.innerHTML = '<div class="error">Failed to initialize. Please refresh.</div>';
        }
    }

    // 在 TabManagerUI 类中添加一个方法来处理倒计时结束
    async handleCountdownEnd(tabId, tab, countdownSpan, reminderContainer, updateInterval) {
        // 显示 Time's up! 并更新 UI
        countdownSpan.textContent = 'Time\'s up!';
        
        // 恢复铃铛到未激活状态
        const reminderBtn = reminderContainer.querySelector('.reminder-toggle');
        if (reminderBtn) {
            reminderBtn.classList.remove('active');
            reminderBtn.textContent = '🔕';
        }

        // 更新存储状态
        await chrome.storage.local.set({
            [`reminder_${tabId}`]: false
        });

        // 清除倒计时相关的存储
        await chrome.storage.local.remove([
            `reminderEnd_${tabId}`
        ]);

        // 发送完整的消息给 background
        chrome.runtime.sendMessage({
            type: 'startReminder',
            tabId: tabId,
            title: tab.title,
            endTime: Date.now() // 立即触发
        });

        // 清理倒计时
        clearInterval(updateInterval);
        this.countdownIntervals.delete(tabId);
        countdownSpan.remove();
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const ui = new TabManagerUI();
    ui.init();
    
    window.addEventListener('unload', () => {
        ui.cleanup();
    });
});
