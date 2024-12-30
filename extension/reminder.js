document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabId = urlParams.get('tabId');
    const message = decodeURIComponent(urlParams.get('message'));
    const title = decodeURIComponent(urlParams.get('title'));

    // 设置消息和标题
    document.getElementById('message').textContent = message;
    document.getElementById('title').textContent = title;

    // 停止当前计时
    chrome.runtime.sendMessage({
        type: 'stopTimer',
        tabId: parseInt(tabId)
    });

    // 设置新的提醒时间
    document.getElementById('startReminder').addEventListener('click', async () => {
        const time = document.getElementById('reminderTime').value;
        const unit = document.getElementById('timeUnit').value;

        await chrome.runtime.sendMessage({
            type: 'updateReminderInterval',
            tabId: parseInt(tabId),
            value: parseInt(time),
            unit: unit
        });

        window.close();
    });

    // 打开标签页
    document.getElementById('openTab').addEventListener('click', () => {
        chrome.tabs.update(parseInt(tabId), { active: true });
        window.close();
    });

    // 关闭按钮
    document.getElementById('close').addEventListener('click', () => {
        window.close();
    });
});