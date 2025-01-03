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

// 添加提醒管理
let activeReminders = new Map(); // 存储活动的提醒

// 统一处理铃铛状态改变的函数
async function handleBellStateChange(tabId, isActive) {
    console.log(`Changing bell state for tab ${tabId} to ${isActive}`);
    
    // 清理旧状态
    await initializeBellState(tabId);
    
    if (isActive) {
        // 设置新的激活状态
        reminderData.customReminderTabs.add(tabId);
        if (reminderData.interval > 0) {
            const nextReminderTime = Date.now() + reminderData.interval;
            reminderData.reminderTimes[tabId] = nextReminderTime;
            await chrome.storage.local.set({
                [`reminder_${tabId}`]: true,
                [`reminderEnd_${tabId}`]: nextReminderTime
            });
        }
    } else {
        // 明确设置为未激活状态
        await chrome.storage.local.set({
            [`reminder_${tabId}`]: false
        });
        reminderData.customReminderTabs.delete(tabId);
        delete reminderData.reminderTimes[tabId];
    }
    
    await saveReminderData();
}

// 统一的消息监听器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    switch(message.type) {
        case 'toggleCustomReminder':
            const { tabId, isActive } = message;
            handleBellStateChange(tabId, isActive);
            break;

        case 'startReminder':
            const { tabId: reminderTabId } = message;
            // 先处理状态变化
            handleBellStateChange(reminderTabId, false).then(() => {
                // 然后创建提醒窗口
                chrome.tabs.get(reminderTabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.error('Failed to get tab:', chrome.runtime.lastError);
                        return;
                    }
                    chrome.windows.create({
                        url: `reminder.html?tabId=${reminderTabId}&message=${encodeURIComponent('Time to check this tab!')}&title=${encodeURIComponent(tab.title)}`,
                        type: 'popup',
                        width: 400,
                        height: 500
                    });
                });
            });
            break;
    }
});

// 删除其他重复的消息监听器和事件处理
// 保留必要的事件监听器
chrome.tabs.onRemoved.addListener((tabId) => {
    handleBellStateChange(tabId, false);
});

// 修改存储变化监听器
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let key in changes) {
        if (key.startsWith('reminder_')) {
            const tabId = key.split('_')[1];
            const newValue = changes[key].newValue;
            console.log(`Reminder state changed for tab ${tabId}:`, newValue);
        }
    }
});

// 修改初始化铃铛状态的函数
async function initializeBellState(tabId) {
    console.log(`Initializing bell state for tab ${tabId}`);
    
    // 清除所有相关状态
    await chrome.storage.local.remove([
        `reminder_${tabId}`,
        `reminderEnd_${tabId}`,
        `reminderTime_${tabId}`
    ]);
    
    // 清理内存中的状态
    reminderData.customReminderTabs.delete(tabId);
    delete reminderData.reminderTimes[tabId];
    if (activeReminders.has(tabId)) {
        clearTimeout(activeReminders.get(tabId));
        activeReminders.delete(tabId);
    }
}

// 在初始化函数中也使用它
async function initializeReminderData() {
    try {
        const data = await chrome.storage.local.get(null);
        const tabs = await chrome.tabs.query({});
        
        // 对所有标签页进行初始化
        for (const tab of tabs) {
            await initializeBellState(tab.id);
        }
        
        console.log('Initialized all reminder data');
    } catch (err) {
        console.error('Error initializing reminder data:', err);
    }
}

// 添加消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'stopTimer') {
        // 停止指定标签页的计时并清理提醒记录
        if (reminderData.customReminderTabs.has(message.tabId)) {
            delete reminderData.reminderTimes[message.tabId];
            activeReminders.delete(message.tabId); // 清理提醒记录
            saveReminderData();
        }
    }
    else if (message.type === 'updateReminderInterval') {
        // 设置新的提醒时间
        const multiplier = {
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };
        
        const interval = message.value * multiplier[message.unit];
        reminderData.reminderTimes[message.tabId] = Date.now() + interval;
        
        if (!reminderData.customReminderTabs.has(message.tabId)) {
            reminderData.customReminderTabs.add(message.tabId);
        }
        
        saveReminderData();
    }
});

// 格式化时间
function formatTimeLeft(ms) {
    const minutes = Math.floor(ms / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}

// 保存提醒数据到存储
async function saveReminderData() {
    const dataToSave = {
        interval: reminderData.interval,
        reminderTimes: reminderData.reminderTimes,
        customReminderTabs: Array.from(reminderData.customReminderTabs)
    };
    
    await chrome.storage.local.set({
        reminderData: dataToSave
    });

    // 更新每个标签页的状态
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        const isActive = reminderData.customReminderTabs.has(tab.id);
        await chrome.storage.local.set({
            [`reminder_${tab.id}`]: isActive
        });
    }
}

// 更新提醒间隔
async function updateReminderInterval(value, unit) {
    if (value <= 0) {
        reminderData.interval = 0;
        reminderData.reminderTimes = {};
        await saveReminderData();
        return;
    }

    const multiplier = {
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000
    };
    
    reminderData.interval = value * multiplier[unit];
    
    // 更新所有自定义提醒标签页的下次提醒时间
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
        if (reminderData.customReminderTabs.has(tab.id)) {
            reminderData.reminderTimes[tab.id] = Date.now() + reminderData.interval;
        }
    });
    
    await saveReminderData();
}

// 切换自定义提醒
async function toggleCustomReminder(tabId) {
    if (reminderData.customReminderTabs.has(tabId)) {
        reminderData.customReminderTabs.delete(tabId);
        delete reminderData.reminderTimes[tabId];
    } else {
        reminderData.customReminderTabs.add(tabId);
        if (reminderData.interval > 0) {
            reminderData.reminderTimes[tabId] = Date.now() + reminderData.interval;
        }
    }
    
    await saveReminderData();
}

// 定期检查提醒
setInterval(checkTabsForReminders, 1000); // 每秒检查一次

// 定期保存数据
setInterval(async () => {
    if (isWindowFocused && lastActiveTabId) {
        await updateActiveTime(lastActiveTabId);
    }
}, 60000);

// 清理已关闭标签页的数据
chrome.tabs.onRemoved.addListener((tabId) => {
    // 当标签页关闭时，清理相关的提醒记录
    activeReminders.delete(tabId);
    if (reminderData.customReminderTabs.has(tabId)) {
        reminderData.customReminderTabs.delete(tabId);
        delete reminderData.reminderTimes[tabId];
        saveReminderData();
    }
});

// 检查需要提醒的标签页
async function checkTabsForReminders() {
    try {
        // 如果没有设置提醒间隔，直接返回
        if (!reminderData.interval) return;

        const now = Date.now();
        const tabs = await chrome.tabs.query({});

        for (const tab of tabs) {
            // 只检查设置了自定义提醒的标签页
            if (!reminderData.customReminderTabs.has(tab.id)) continue;

            const nextReminderTime = reminderData.reminderTimes[tab.id];
            if (!nextReminderTime) continue;

            // 如果到达提醒时间
            if (now >= nextReminderTime) {
                const analysis = tabData.analysis[tab.id];
                const category = analysis?.category || 'other';
                
                // 创建提醒窗口
                await createReminderWindow(tab, category);
                
                // 更新下次提醒时间
                reminderData.reminderTimes[tab.id] = now + reminderData.interval;
            }
        }

        // 保存更新后的提醒数据
        await saveReminderData();

    } catch (err) {
        console.error('Error checking tabs for reminders:', err);
    }
}

// 监听标签页关闭事件，清理对应的存储
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(`reminder_${tabId}`);
});

// 监听标签页更新事件，保持提醒状态
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // 检查该标签页的铃铛状态
        chrome.storage.local.get(`reminder_${tabId}`, (result) => {
            const isReminderActive = result[`reminder_${tabId}`] === true;
            if (isReminderActive) {
                // 确保状态保持
                chrome.storage.local.set({
                    [`reminder_${tabId}`]: true
                });
            }
        });
    }
});

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
    // 清理关闭标签页的状态
    chrome.storage.local.remove(`reminder_${tabId}`);
});

// 添加消息监听器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.type) {
        case 'toggleCustomReminder':
            const { tabId, isActive } = message;
            if (isActive) {
                reminderData.customReminderTabs.add(tabId);
                if (reminderData.interval > 0) {
                    const nextReminderTime = Date.now() + reminderData.interval;
                    reminderData.reminderTimes[tabId] = nextReminderTime;
                }
            } else {
                reminderData.customReminderTabs.delete(tabId);
                delete reminderData.reminderTimes[tabId];
            }
            // 明确设置铃铛状态
            chrome.storage.local.set({
                [`reminder_${tabId}`]: isActive
            });
            saveReminderData();
            break;

        case 'startReminder':
            // 当倒计时结束时，明确设置铃铛状态为 false
            const { tabId: reminderTabId } = message;
            chrome.storage.local.set({
                [`reminder_${reminderTabId}`]: false
            });
            reminderData.customReminderTabs.delete(reminderTabId);
            delete reminderData.reminderTimes[reminderTabId];
            saveReminderData();
            break;
    }
});
