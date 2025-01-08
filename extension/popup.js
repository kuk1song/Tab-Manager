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

        // 添加调试按钮
        this.addDebugButton();
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
            
            const isActive = reminderData[`reminder_${tab.id}`] === true;
            const endTime = reminderData[`reminderEnd_${tab.id}`];
            
            const combinedScore = this.calculateCombinedScore(analysis, idleScore);
            
            // 安全地获取活动数据
            const safeTabActivityData = {
                lastActive: {},
                totalActiveTime: {},
                visitCount: {},
                ...tabActivityData
            };
    
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
                const isActive = !e.target.classList.contains('active');
                
                try {
                    if (isActive) {
                        const { activeReminderInterval } = await chrome.storage.local.get('activeReminderInterval');
                        if (!activeReminderInterval) {
                            alert('Please set a reminder time and click "Go Remind!" first');
                            return;
                        }

                        const endTime = Date.now() + activeReminderInterval;
                        await chrome.storage.local.set({
                            [`reminder_${tab.id}`]: true,
                            [`reminderEnd_${tab.id}`]: endTime,
                            [`reminderStatus_${tab.id}`]: 'active'
                        });

                        e.target.classList.add('active');
                        e.target.textContent = '🔔';
                    } else {
                        await chrome.storage.local.set({
                            [`reminder_${tab.id}`]: false,
                            [`reminderStatus_${tab.id}`]: 'cancelled'
                        });
                        await chrome.storage.local.remove([`reminderEnd_${tab.id}`]);

                        e.target.classList.remove('active');
                        e.target.textContent = '🔕';
                    }
                } catch (error) {
                    console.error('Failed to toggle reminder:', error);
                }
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
        try {
            // 更新存储状态以触发提醒
            await chrome.storage.local.set({
                [`reminder_${tabId}`]: true,
                [`reminderEnd_${tabId}`]: Date.now(), // 设置为当前时间，表示立即触发
                [`reminderStatus_${tabId}`]: 'timeout'  // 添加状态标记
            });

            // 清理 UI
            const reminderBtn = reminderContainer.querySelector('.reminder-toggle');
            if (reminderBtn) {
                reminderBtn.classList.remove('active');
                reminderBtn.textContent = '🔕';
            }

            // 清理定时器
            clearInterval(updateInterval);
            this.countdownIntervals.delete(tabId);
            
            if (countdownSpan) {
                countdownSpan.remove();
            }

            // 不再发送消息
            // chrome.runtime.sendMessage({
            //     type: 'startReminder',
            //     tabId: tabId
            // });

        } catch (error) {
            console.error('Failed to handle countdown end:', error);
        }
    }

    // 在 TabManagerUI 类中添加调试功能
    addDebugButton() {
        // 创建调试按钮
        const debugBtn = document.createElement('button');
        debugBtn.id = 'debugBtn';
        debugBtn.textContent = 'Debug Storage';
        debugBtn.className = 'debug-btn';

        // 添加到页面
        const container = document.querySelector('.controls') || document.body;
        container.appendChild(debugBtn);

        // 添加点击事件
        debugBtn.addEventListener('click', async () => {
            const storage = await chrome.storage.local.get(null);
            console.log('Storage contents:', storage);
            
            // 移除旧的调试信息
            const oldDebugInfo = document.querySelector('.debug-info');
            if (oldDebugInfo) {
                oldDebugInfo.remove();
            }

            // 格式化显示
            const debugInfo = document.createElement('pre');
            debugInfo.className = 'debug-info';
            debugInfo.textContent = JSON.stringify(storage, null, 2);
            container.appendChild(debugInfo);
        });
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

// 初始化时加载保存的提醒时间
document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get('savedReminderSetting');
    if (result.savedReminderSetting) {
        const { value, unit } = result.savedReminderSetting;
        document.getElementById('reminderInterval').value = value;
        document.getElementById('timeUnit').value = unit;
        
        // 恢复 reminderInterval 的值
        switch(unit) {
            case 'm': reminderInterval = value * 60 * 1000; break;
            case 'h': reminderInterval = value * 60 * 60 * 1000; break;
            case 'd': reminderInterval = value * 24 * 60 * 60 * 1000; break;
        }
    }
});

// Go Remind! 按钮点击事件
document.getElementById('refreshBtn').addEventListener('click', async () => {
    if (!reminderInterval || reminderInterval <= 0) {
        alert('Please set a valid reminder time first!');
        return;
    }

    await chrome.storage.local.set({ 
        activeReminderInterval: reminderInterval 
    });
});