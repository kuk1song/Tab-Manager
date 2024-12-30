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
            await chrome.runtime.sendMessage({
                type: 'updateReminderInterval',
                value: value,
                unit: unit
            });
            // 刷新显示
            this.refreshTabs();
        });

        this.timeUnit.addEventListener('change', async () => {
            const value = parseInt(this.reminderInterval.value);
            const unit = this.timeUnit.value;
            await chrome.runtime.sendMessage({
                type: 'updateReminderInterval',
                value: value,
                unit: unit
            });
            // 刷新显示
            this.refreshTabs();
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
    updateCountdown(reminderContainer, nextReminderTime) {
        const countdownSpan = reminderContainer.querySelector('.countdown');
        if (!countdownSpan) return;

        const timeLeft = nextReminderTime - Date.now();
        if (timeLeft <= 0) {
            countdownSpan.textContent = 'Now';
            return;
        }

        // 计算秒数
        const seconds = Math.floor(timeLeft / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        // 格式化显示
        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes % 60 > 0 || hours > 0) parts.push(`${minutes % 60}m`);
        parts.push(`${seconds % 60}s`);

        countdownSpan.textContent = parts.join(' ');
    }

    async createTabElement(tab, analysis, idleScore, tabActivityData) {
        try {
            const div = document.createElement('div');
            div.className = 'tab-item';
            
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
                                <button class="reminder-toggle ${isCustomReminder ? 'active' : ''}" title="Toggle custom reminder">
                                    ${isCustomReminder ? '🔔' : '🔕'}
                                </button>
                                ${isCustomReminder ? `<span class="countdown">${countdownText}</span>` : ''}
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
    
            // 添加提醒切换按钮事件监听
            const reminderToggle = div.querySelector('.reminder-toggle');
            reminderToggle.addEventListener('click', async (e) => {
                e.stopPropagation();
                chrome.runtime.sendMessage({
                    type: 'toggleCustomReminder',
                    tabId: tab.id
                });
                
                reminderToggle.classList.toggle('active');
                const isActive = reminderToggle.classList.contains('active');
                reminderToggle.textContent = isActive ? '🔔' : '🔕';
                
                // 更新倒计时显示
                const reminderContainer = reminderToggle.parentElement;
                const countdownSpan = reminderContainer.querySelector('.countdown');
                
                if (isActive) {
                    const { reminderData } = await chrome.storage.local.get(['reminderData']);
                    const nextReminderTime = reminderData?.reminderTimes?.[tab.id];
                    if (nextReminderTime) {
                        if (!countdownSpan) {
                            const newCountdown = document.createElement('span');
                            newCountdown.className = 'countdown';
                            reminderContainer.appendChild(newCountdown);
                        }
                        
                        // 清除旧的定时器
                        if (this.countdownIntervals.has(tab.id)) {
                            clearInterval(this.countdownIntervals.get(tab.id));
                        }
                        
                        // 设置新的定时器
                        const updateInterval = setInterval(() => {
                            this.updateCountdown(reminderContainer, nextReminderTime);
                        }, 1000);
                        
                        this.countdownIntervals.set(tab.id, updateInterval);
                        this.updateCountdown(reminderContainer, nextReminderTime);
                    }
                } else {
                    if (countdownSpan) {
                        countdownSpan.remove();
                    }
                    // 清除定时器
                    if (this.countdownIntervals.has(tab.id)) {
                        clearInterval(this.countdownIntervals.get(tab.id));
                        this.countdownIntervals.delete(tab.id);
                    }
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
}

// 初始化时添加清理
document.addEventListener('DOMContentLoaded', () => {
    const ui = new TabManagerUI();
    ui.init();
    
    // 在窗口关闭时清理
    window.addEventListener('unload', () => {
        ui.cleanup();
    });
});

// 在显示标签页列表的函数中添加铃铛点击事件处理
function displayTabs(tabs) {
    const tabsList = document.getElementById('tabsList');
    tabsList.innerHTML = '';

    Promise.all(tabs.map(tab => {
        return new Promise((resolve) => {
            // 同时获取铃铛状态和提醒时间
            chrome.storage.local.get([
                `reminder_${tab.id}`, 
                `reminderTime_${tab.id}`
            ], (result) => {
                const isReminderActive = result[`reminder_${tab.id}`] === true; // 确保是布尔值
                const reminderTime = result[`reminderTime_${tab.id}`];
                
                const tabElement = document.createElement('div');
                tabElement.className = 'tab-item';
                tabElement.innerHTML = `
                    <img src="${tab.favIconUrl || 'default-icon.png'}" alt="favicon">
                    <div class="tab-info">
                        <div class="tab-title">${tab.title}</div>
                        <div class="tab-url">${tab.url}</div>
                    </div>
                    <div class="reminder-container">
                        <button class="reminder-toggle ${isReminderActive ? 'active' : ''}" 
                                data-tab-id="${tab.id}">
                            🔔
                        </button>
                        ${isReminderActive ? `<span class="countdown" data-tab-id="${tab.id}"></span>` : ''}
                    </div>
                `;

                const reminderBtn = tabElement.querySelector('.reminder-toggle');
                reminderBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const tabId = e.target.dataset.tabId;
                    const isActive = e.target.classList.toggle('active');
                    
                    // 更新存储
                    await chrome.storage.local.set({
                        [`reminder_${tabId}`]: isActive
                    });

                    // 更新倒计时显示
                    const container = e.target.closest('.reminder-container');
                    if (isActive) {
                        const countdown = document.createElement('span');
                        countdown.className = 'countdown';
                        countdown.dataset.tabId = tabId;
                        container.appendChild(countdown);
                    } else {
                        const countdown = container.querySelector('.countdown');
                        if (countdown) countdown.remove();
                    }

                    // 发送消息到 background.js
                    chrome.runtime.sendMessage({
                        type: 'toggleCustomReminder',
                        tabId: parseInt(tabId),
                        isActive: isActive
                    });
                });

                resolve(tabElement);
            });
        });
    })).then(tabElements => {
        tabElements.forEach(element => {
            tabsList.appendChild(element);
        });
        // 启动倒计时更新
        updateCountdowns();
    });
}

// 添加倒计时更新函数
function updateCountdowns() {
    const countdowns = document.querySelectorAll('.countdown');
    countdowns.forEach(countdown => {
        const tabId = countdown.dataset.tabId;
        chrome.storage.local.get(`reminderTime_${tabId}`, (result) => {
            const reminderTime = result[`reminderTime_${tabId}`];
            if (reminderTime) {
                const remaining = Math.max(0, reminderTime - Date.now());
                const seconds = Math.floor(remaining / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                
                if (seconds > 0) {
                    countdown.textContent = hours > 0 
                        ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
                        : minutes > 0
                            ? `${minutes}m ${seconds % 60}s`
                            : `${seconds}s`;
                } else {
                    countdown.textContent = 'Due';
                }
            }
        });
    });
}

// 每秒更新倒计时
setInterval(updateCountdowns, 1000);

// 添加提醒间隔设置的监听
document.getElementById('reminderInterval').addEventListener('change', async (e) => {
    const interval = parseInt(e.target.value);
    const timeUnit = document.getElementById('timeUnit').value;
    let milliseconds = interval;
    
    switch(timeUnit) {
        case 'm': milliseconds *= 60000; break;  // 分钟转毫秒
        case 'h': milliseconds *= 3600000; break; // 小时转毫秒
        case 'd': milliseconds *= 86400000; break; // 天转毫秒
    }

    // 发送消息到 background.js 更新提醒间隔
    chrome.runtime.sendMessage({
        type: 'updateReminderInterval',
        interval: milliseconds
    });
});