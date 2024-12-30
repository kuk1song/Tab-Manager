import json
from datetime import datetime
from pathlib import Path

class TabDataCollector:
    def __init__(self):
        self.data_dir = Path("./data")
        self.dataset_file = self.data_dir / "tab_dataset.json"
        self.dataset = self._load_dataset()

        # 定义类别和关键词
        self.categories = {
            "work": {
                "keywords": ["meeting", "project", "deadline", "report", "task"],
                "urls": ["docs.google.com", "github.com", "gitlab.com", "jira.com"]
            },
            "learning": {
                "keywords": ["tutorial", "course", "learn", "study", "documentation"],
                "urls": ["coursera.org", "udemy.com", "stackoverflow.com", "medium.com"]
            },
            "entertainment": {
                "keywords": ["video", "movie", "game", "music", "stream"],
                "urls": ["youtube.com", "netflix.com", "spotify.com", "twitch.tv"]
            },
            "social": {
                "keywords": ["chat", "message", "social", "network", "friend"],
                "urls": ["facebook.com", "twitter.com", "instagram.com", "linkedin.com"]
            },
            "other": {
                "keywords": [],
                "urls": []
            }
        }

    def _load_dataset(self):
        """加载或创建数据集"""
        self.data_dir.mkdir(exist_ok=True)
        
        if self.dataset_file.exists():
            try:
                with open(self.dataset_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return []
        return []

    def save_dataset(self):
        """保存数据集"""
        with open(self.dataset_file, 'w', encoding='utf-8') as f:
            json.dump(self.dataset, f, ensure_ascii=False, indent=2)

    def add_tab_data(self, title, url, content, category=None):
        """添加标签页数据"""
        tab_data = {
            "title": title,
            "url": url,
            "content": content[:1000],  # 限制内容长度
            "category": category or self.auto_categorize(title, url, content),
            "timestamp": datetime.now().isoformat()
        }
        
        self.dataset.append(tab_data)
        self.save_dataset()
        return tab_data

    def auto_categorize(self, title, url, content):
        """自动分类标签页"""
        text = f"{title} {content}".lower()
        
        for category, rules in self.categories.items():
            # 检查 URL
            if any(domain in url.lower() for domain in rules["urls"]):
                return category
            
            # 检查关键词
            if any(keyword in text for keyword in rules["keywords"]):
                return category
        
        return "other"

    def get_training_data(self):
        """获取训练数据格式"""
        return [{
            "text": f"{item['title']} - {item['content']}",
            "label": item['category']
        } for item in self.dataset]

    def get_statistics(self):
        """获取数据集统计信息"""
        stats = {
            "total": len(self.dataset),
            "categories": {},
            "latest_update": None
        }
        
        for item in self.dataset:
            category = item['category']
            stats['categories'][category] = stats['categories'].get(category, 0) + 1
            
            timestamp = datetime.fromisoformat(item['timestamp'])
            if not stats['latest_update'] or timestamp > datetime.fromisoformat(stats['latest_update']):
                stats['latest_update'] = item['timestamp']
        
        return stats

    def clear_dataset(self):
        """清空数据集"""
        self.dataset = []
        self.save_dataset()

    def remove_item(self, index):
        """删除特定项"""
        if 0 <= index < len(self.dataset):
            self.dataset.pop(index)
            self.save_dataset()
            return True
        return False

    def update_item(self, index, updates):
        """更新特定项"""
        if 0 <= index < len(self.dataset):
            self.dataset[index].update(updates)
            self.save_dataset()
            return True
        return False