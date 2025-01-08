// 在文件顶部添加
console.log('Background script loaded');

// 初始化数据结构
let tabData = {
    importance: {},      // 重要性分数
    categories: {},      // 标签页类别
    analysis: {},        // 分析结果
    lastAnalysis: {}     // 上次分析时间
};

let tabActivityData = {
    lastActive: {},      // 最后活跃时间
    totalActiveTime: {}, // 总活跃时间
    visitCount: {}       // 访问次数
};

// 添加这些变量的定义
let isWindowFocused = false;
let lastActiveTabId = null;
let lastActiveTime = Date.now();

const reminderData = {
    interval: 0,  // 默认为0，表示不提醒
    lastCheck: Date.now(),
    reminderTimes: {},  // 记录每个标签页的下次提醒时间
    customReminderTabs: new Set()  // 存储用户自定义要提醒的标签页ID
};

// 添加提醒消息模板
const reminderMessages = {
    work: [
        "📊 Important work tab needs attention!",
        "💼 Time to check your work progress",
        "⚡ Don't forget about this work task"
    ],
    learning: [
        "📚 Continue your learning journey!",
        "🎓 Time to study this material",
        "💡 Knowledge awaits - back to learning!"
    ],
    entertainment: [
        "🎮 Entertainment tab reminder",
        "🎬 Your entertainment is waiting",
        "🎵 Back to your entertainment"
    ],
    social: [
        "💬 Check your social updates",
        "👥 Social interaction waiting",
        "🤝 Stay connected - check this tab"
    ],
    other: [
        "📌 Tab reminder",
        "🔔 Don't forget this tab",
        "⭐ Tab needs attention"
    ]
};

// 添加标签页分类逻辑
const categoryPatterns = {
    work: [
        /docs?\.google\.com/i,
        /github\.com/i,
        /gitlab\.com/i,
        /jira/i,
        /confluence/i,
        /trello\.com/i,
        /slack\.com/i,
        /notion\.so/i,
        /linkedin\.com/i,
        /mail\.(google|yahoo|outlook)\.com/i
    ],
    learning: [
        /coursera\.org/i,
        /udemy\.com/i,
        /edx\.org/i,
        /stackoverflow\.com/i,
        /developer\./i,
        /learn/i,
        /tutorial/i,
        /documentation/i,
        /mdn/i,
        /w3schools\.com/i
    ],
    entertainment: [
        /youtube\.com/i,
        /netflix\.com/i,
        /twitch\.tv/i,
        /spotify\.com/i,
        /reddit\.com/i,
        /game/i,
        /play/i,
        /movie/i,
        /video/i,
        /music/i
    ],
    social: [
        /facebook\.com/i,
        /twitter\.com/i,
        /instagram\.com/i,
        /whatsapp\.com/i,
        /telegram\.org/i,
        /discord\.com/i,
        /messenger/i,
        /chat/i,
        /social/i,
        /wechat/i
    ]
};

// 分析标签页函数
async function analyzeTab(tab) {
    if (!tab.url) return null;

    try {
        // 基本分析结果
        const analysis = {
            category: 'other',
            importance_score: 0.5
        };

        // 根据URL和标题确定类别
        const url = tab.url.toLowerCase();
        const title = tab.title.toLowerCase();

        // 遍历类别模式进行匹配
        for (const [category, patterns] of Object.entries(categoryPatterns)) {
            if (patterns.some(pattern => 
                pattern.test(url) || pattern.test(title)
            )) {
                analysis.category = category;
                break;
            }
        }

        // 计算重要性分数
        analysis.importance_score = calculateImportanceScore(tab, analysis.category);

        // 更新分析结果
        if (!tabData.analysis[tab.id]) {
            tabData.analysis[tab.id] = {};
        }
        tabData.analysis[tab.id] = analysis;
        tabData.lastAnalysis[tab.id] = Date.now();

        // 保存更新
        await chrome.storage.local.set({ tabData });

        return analysis;
    } catch (error) {
        console.error('Tab analysis failed:', error);
        return null;
    }
}

// 计算重要性分数
function calculateImportanceScore(tab, category) {
    let score = 0.5; // 默认分数

    // 根据类别调整基础分数
    const categoryScores = {
        work: 0.8,
        learning: 0.7,
        social: 0.4,
        entertainment: 0.3,
        other: 0.5
    };
    score = categoryScores[category] || 0.5;

    // 根据活跃度调整分数
    const lastActive = tabActivityData.lastActive[tab.id];
    const totalActive = tabActivityData.totalActiveTime[tab.id];
    const visits = tabActivityData.visitCount[tab.id];

    if (lastActive) {
        const hoursSinceLastActive = (Date.now() - lastActive) / (1000 * 60 * 60);
        score *= Math.max(0.3, Math.min(1, 1 - (hoursSinceLastActive / 24)));
    }

    if (totalActive) {
        const hoursActive = totalActive / (1000 * 60 * 60);
        score *= Math.min(1.2, 1 + (hoursActive / 24));
    }

    if (visits) {
        score *= Math.min(1.2, 1 + (visits / 10));
    }

    return Math.max(0, Math.min(1, score));
}

// 在标签页更新时进行分析
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        analyzeTab(tab);
    }
});

// 初始化时分析所有标签页
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(analyzeTab);
    });
});

// 定期重新分析所有标签页
setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(analyzeTab);
    });
}, 5 * 60 * 1000); // 每5分钟


// 加载保存的数据
chrome.storage.local.get(['tabData', 'tabActivityData', 'reminderData', 'customReminderTabs'], (result) => {
    if (result.tabData) {
        tabData = result.tabData;
    }
    if (result.tabActivityData) {
        tabActivityData = result.tabActivityData;
    }
    if (result.reminderData) {
        // 确保不覆盖 customReminderTabs
        const { customReminderTabs, ...otherData } = result.reminderData;
        Object.assign(reminderData, otherData);
    }
    // 单独处理 customReminderTabs
    if (result.customReminderTabs) {
        reminderData.customReminderTabs = new Set(Array.isArray(result.customReminderTabs) 
            ? result.customReminderTabs 
            : []);
    }
});

// 监听标签页激活
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await updateActiveTime(activeInfo.tabId);
});

// 监听窗口焦点变化
chrome.windows.onFocusChanged.addListener((windowId) => {
    isWindowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
    if (isWindowFocused) {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                await updateActiveTime(tabs[0].id);
            }
        });
    }
});

// 更新活跃时间
async function updateActiveTime(tabId) {
    const now = Date.now();
    
    if (isWindowFocused && lastActiveTabId) {
        const activeTime = now - lastActiveTime;
        if (activeTime > 0 && activeTime < 24 * 60 * 60 * 1000) {
            tabActivityData.totalActiveTime[lastActiveTabId] = 
                (tabActivityData.totalActiveTime[lastActiveTabId] || 0) + activeTime;
            await chrome.storage.local.set({ tabActivityData });
        }
    }
    
    tabActivityData.lastActive[tabId] = now;
    tabActivityData.visitCount[tabId] = (tabActivityData.visitCount[tabId] || 0) + 1;
    
    lastActiveTabId = tabId;
    lastActiveTime = now;
    
    await chrome.storage.local.set({ tabActivityData });
}

// 添加一个全局的倒计时检查器
let globalCheckInterval = null;

// 添加状态管理
const TabStateManager = {
    async setState(tabId, state) {
        try {
            await chrome.storage.local.set({
                [`reminder_${tabId}`]: state.isActive,
                [`reminderEnd_${tabId}`]: state.endTime,
                [`reminderStatus_${tabId}`]: state.status
            });
            console.log(`State updated for tab ${tabId}:`, state);
        } catch (err) {
            console.error('Failed to set state:', err);
        }
    },

    async getState(tabId) {
        try {
            const data = await chrome.storage.local.get([
                `reminder_${tabId}`,
                `reminderEnd_${tabId}`,
                `reminderStatus_${tabId}`
            ]);
            return {
                isActive: data[`reminder_${tabId}`] === true,
                endTime: data[`reminderEnd_${tabId}`],
                status: data[`reminderStatus_${tabId}`]
            };
        } catch (err) {
            console.error('Failed to get state:', err);
            return null;
        }
    },

    async clearState(tabId) {
        try {
            await chrome.storage.local.remove([
                `reminder_${tabId}`,
                `reminderEnd_${tabId}`,
                `reminderStatus_${tabId}`
            ]);
            console.log(`State cleared for tab ${tabId}`);
        } catch (err) {
            console.error('Failed to clear state:', err);
        }
    }
};

// 添加倒计时管理器
const ReminderManager = {
    activeReminders: new Map(), // 存储所有活动的提醒

    async startReminder(tabId, endTime) {
        try {
            // 保存提醒状态
            await TabStateManager.setState(tabId, {
                isActive: true,
                endTime: endTime,
                status: 'active'
            });

            // 设置检查器
            const checkInterval = setInterval(async () => {
                const timeLeft = endTime - Date.now();
                
                if (timeLeft <= 0) {
                    // 直接触发提醒，不等待 popup 的响应
                    await this.triggerReminder(tabId);
                    clearInterval(checkInterval);
                    this.activeReminders.delete(tabId);
                }
            }, 1000);

            // 保存检查器引用
            this.activeReminders.set(tabId, checkInterval);
            
            console.log(`Started reminder for tab ${tabId}, ending at ${new Date(endTime)}`);
        } catch (err) {
            console.error(`Failed to start reminder for tab ${tabId}:`, err);
        }
    },

    async triggerReminder(tabId) {
        try {
            console.log(`Triggering reminder for tab ${tabId}`);
            
            // 1. 获取标签页信息
            const tab = await chrome.tabs.get(parseInt(tabId));
            
            // 2. 创建提醒窗口
            await chrome.windows.create({
                url: `reminder.html?tabId=${tab.id}&message=${encodeURIComponent('Time to check this tab!')}&title=${encodeURIComponent(tab.title)}`,
                type: 'popup',
                width: 400,
                height: 500,
                left: Math.floor(screen.width - 420),
                top: 20
            });

            // 3. 更新状态
            await TabStateManager.setState(tabId, {
                isActive: false,
                endTime: null,
                status: 'ended'
            });

            // 4. 如果 popup 打开，通知它更新 UI
            try {
                chrome.runtime.sendMessage({
                    type: 'reminderComplete',
                    tabId: tabId
                });
            } catch (err) {
                // popup 未打开，忽略错误
            }

        } catch (err) {
            console.error(`Failed to trigger reminder for tab ${tabId}:`, err);
        }
    }
};

// 修改初始化函数
async function initializeExtension() {
    console.log('Initializing extension...');
    
    try {
        // 恢复所有活动的提醒
        await ReminderManager.restoreActiveReminders();
        
        console.log('Extension initialized successfully');
    } catch (err) {
        console.error('Error initializing extension:', err);
    }
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener(async (tabId) => {
    // 清理提醒
    if (ReminderManager.activeReminders.has(tabId)) {
        clearInterval(ReminderManager.activeReminders.get(tabId));
        ReminderManager.activeReminders.delete(tabId);
    }
    await TabStateManager.clearState(tabId);
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'startReminder') {
        const { tabId, endTime } = message;
        ReminderManager.startReminder(tabId, endTime);
    }
});

// 确保扩展保持活动状态
chrome.runtime.onSuspend.addListener(() => {
    console.log('Extension is being suspended, saving state...');
    if (globalCheckInterval) {
        clearInterval(globalCheckInterval);
    }
    chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        if (!globalCheckInterval) {
            initializeExtension();
        }
    }
});

// 立即初始化扩展
initializeExtension();

// 在 background.js 中添加
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key.startsWith('reminder_') && oldValue === true && newValue === false) {
            const tabId = key.split('_')[1];
            handleCountdownEnd(tabId);
        }
    }
});
