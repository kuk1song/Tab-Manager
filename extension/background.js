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

// 启动全局检查器 - 这是核心函数
function startGlobalChecker() {
    if (globalCheckInterval) {
        clearInterval(globalCheckInterval);
    }

    globalCheckInterval = setInterval(async () => {
        try {
            // 获取所有存储的数据
            const data = await chrome.storage.local.get(null);
            const now = Date.now();

            // 检查所有活动的提醒
            for (const [key, value] of Object.entries(data)) {
                // 只检查激活状态的提醒
                if (key.startsWith('reminder_') && value === true) {
                    const tabId = key.split('_')[1];
                    const endTimeKey = `reminderEnd_${tabId}`;
                    const endTime = data[endTimeKey];

                    // 如果时间到了，触发提醒
                    if (endTime && endTime <= now) {
                        console.log(`Time's up for tab ${tabId}, triggering reminder...`);
                        try {
                            const tab = await chrome.tabs.get(parseInt(tabId));
                            
                            // 创建提醒窗口
                            await chrome.windows.create({
                                url: `reminder.html?tabId=${tab.id}&message=${encodeURIComponent('Time to check this tab!')}&title=${encodeURIComponent(tab.title)}`,
                                type: 'popup',
                                width: 400,
                                height: 500,
                                left: Math.floor(screen.width - 420),
                                top: 20
                            });

                            // 更新状态
                            await chrome.storage.local.set({
                                [`reminder_${tabId}`]: false
                            });
                            await chrome.storage.local.remove([
                                `reminderEnd_${tabId}`,
                                `reminderTime_${tabId}`
                            ]);

                            // 清理内存中的状态
                            reminderData.customReminderTabs.delete(tabId);
                            delete reminderData.reminderTimes[tabId];
                            await saveReminderData();

                        } catch (err) {
                            console.error(`Failed to handle countdown for tab ${tabId}:`, err);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error in global checker:', err);
        }
    }, 1000); // 每秒检查一次

    console.log('Global checker started');
}

// 确保扩展启动时立即启动全局检查器
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension starting up, initializing global checker...');
    startGlobalChecker();
});

// 确保安装时也启动全局检查器
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated, initializing global checker...');
    startGlobalChecker();
});

// 修改 startCountdown 函数 - 简化它的职责
function startCountdown(tabId, endTime) {
    console.log(`Setting countdown for tab ${tabId}, will end at ${new Date(endTime)}`);
    
    // 确保全局检查器在运行
    if (!globalCheckInterval) {
        startGlobalChecker();
    }
}

// 修改 handleBellStateChange 函数
async function handleBellStateChange(tabId, isActive) {
    console.log(`Changing bell state for tab ${tabId} to ${isActive}`);
    
    if (isActive) {
        // 激活铃铛
        const nextReminderTime = Date.now() + reminderData.interval;
        
        // 先更新存储
        await chrome.storage.local.set({
            [`reminder_${tabId}`]: true,
            [`reminderEnd_${tabId}`]: nextReminderTime
        });

        // 然后更新内存中的状态
        reminderData.customReminderTabs.add(tabId);
        reminderData.reminderTimes[tabId] = nextReminderTime;
        
        // 启动倒计时检查
        startCountdown(tabId, nextReminderTime);
    } else {
        // 停用铃铛
        await chrome.storage.local.remove([
            `reminder_${tabId}`,
            `reminderEnd_${tabId}`,
            `reminderTime_${tabId}`
        ]);
        
        reminderData.customReminderTabs.delete(tabId);
        delete reminderData.reminderTimes[tabId];
    }
    
    await saveReminderData();
}

// 统一的消息处理器
const messageHandler = (message, sender, sendResponse) => {
    console.log('Background received message:', message);

    try {
        switch (message.type) {
            case 'startReminder': {
                const { tabId, endTime, title } = message;
                // 启动倒计时
                startCountdown(tabId, endTime);
                sendResponse({ status: 'success' });
                break;
            }
            case 'stopTimer': {
                const { tabId } = message;
                // 停止倒计时
                if (reminderData.customReminderTabs.has(tabId)) {
                    handleBellStateChange(tabId, false);
                    delete reminderData.reminderTimes[tabId];
                    activeReminders.delete(tabId);
                    saveReminderData();
                }
                sendResponse({ status: 'success' });
                break;
            }
            case 'updateReminderInterval': {
                const { value, unit } = message;
                // 更新提醒间隔
                updateReminderInterval(value, unit);
                sendResponse({ status: 'success' });
                break;
            }
            case 'toggleCustomReminder': {
                const { tabId, isActive } = message;
                // 切换提醒状态
                handleBellStateChange(tabId, isActive);
                sendResponse({ status: 'success' });
                break;
            }
            default: {
                console.warn('Unknown message type:', message.type);
                sendResponse({ status: 'error', message: 'Unknown message type' });
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ status: 'error', message: error.message });
    }

    return true; // 保持消息通道开放
};

// 注册统一的消息监听器
chrome.runtime.onMessage.addListener(messageHandler);

// 只保留一个存储变化监听器
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let key in changes) {
        const { oldValue, newValue } = changes[key];
        if (key.startsWith('reminder_')) {
            const tabId = key.split('_')[1];
            console.log(`Reminder state changed for tab ${tabId}:`, { oldValue, newValue });
            
            // 处理倒计时结束
            if (oldValue === true && newValue === false) {
                handleCountdownEnd(tabId);
            }
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

// 监听标签页关闭事件，清理对应的存储
chrome.tabs.onRemoved.addListener((tabId) => {
    // 当标签页关闭时，清理相关的提醒记录
    activeReminders.delete(tabId);
    if (reminderData.customReminderTabs.has(tabId)) {
        reminderData.customReminderTabs.delete(tabId);
        delete reminderData.reminderTimes[tabId];
        saveReminderData();
    }
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

// 创建一个统一的创建提醒窗口函数
async function createReminderWindow(tab, message = 'Time to check this tab!') {
    const screenWidth = screen.width;
    const windowLeft = Math.floor(screenWidth - 420);
    
    const window = await chrome.windows.create({
        url: `reminder.html?tabId=${tab.id}&message=${encodeURIComponent(message)}&title=${encodeURIComponent(tab.title)}`,
        type: 'popup',
        width: 400,
        height: 500,
        left: windowLeft,
        top: 20
    });
    
    return window;
}

// 在扩展启动时恢复所有活动的倒计时
async function restoreCountdowns() {
    try {
        const data = await chrome.storage.local.get(null);
        const now = Date.now();
        console.log('Restoring countdowns, current data:', data);

        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('reminderEnd_')) {
                const tabId = key.split('_')[1];
                const endTime = value;

                if (data[`reminder_${tabId}`] === true) {
                    console.log(`Found active countdown for tab ${tabId}, end time: ${new Date(endTime)}`);
                    try {
                        const tab = await chrome.tabs.get(parseInt(tabId));
                        console.log(`Starting countdown for restored tab:`, tab);
                        startCountdown(tab.id, endTime);
                    } catch (err) {
                        console.error(`Failed to restore countdown for tab ${tabId}:`, err);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error restoring countdowns:', err);
    }
}

// 在文件开头添加
let isExtensionInitialized = false;

// 修改倒计时管理
async function initializeTimers() {
    if (isExtensionInitialized) return;
    isExtensionInitialized = true;

    console.log('Initializing timers...');
    
    try {
        const data = await chrome.storage.local.get(null);
        const now = Date.now();

        // 遍历所有存储的数据，找到活动的提醒
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('reminder_') && value === true) {
                const tabId = key.split('_')[1];
                const endTimeKey = `reminderEnd_${tabId}`;
                const endTime = data[endTimeKey];

                if (endTime) {
                    try {
                        const tab = await chrome.tabs.get(parseInt(tabId));
                        console.log(`Initializing timer for tab ${tabId}, end time:`, new Date(endTime));
                        startCountdown(tab.id, endTime);
                    } catch (err) {
                        console.error(`Failed to initialize timer for tab ${tabId}:`, err);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error initializing timers:', err);
    }
}

// 在扩展启动和安装时初始化
chrome.runtime.onStartup.addListener(initializeTimers);
chrome.runtime.onInstalled.addListener(initializeTimers);

// 确保浏览器启动时也会初始化
chrome.runtime.onInstalled.addListener(() => {
    chrome.runtime.getPlatformInfo(async () => {
        await initializeTimers();
    });
});

// 在文件开头添加持久化服务工作器
chrome.runtime.onStartup.addListener(initializeExtension);
chrome.runtime.onInstalled.addListener(initializeExtension);

// 创建一个统一的初始化函数
async function initializeExtension() {
    console.log('Initializing extension...');
    
    try {
        // 启动全局检查器
        startGlobalChecker();
        
        // 初始化定时器
        await initializeTimers();
        // 恢复倒计时
        await restoreCountdowns();
        
        console.log('Extension initialized successfully');
    } catch (err) {
        console.error('Error initializing extension:', err);
    }
}

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