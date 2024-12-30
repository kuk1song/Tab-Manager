###################
# Flask API 服务器 #
###################

from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification
import torch
import logging
from pathlib import Path
from data_collector import TabDataCollector

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 模型配置
MODEL_NAME = "distilbert-base-uncased"
MODEL_PATH = Path("./model_cache")

# 确保模型缓存目录存在
MODEL_PATH.mkdir(exist_ok=True)

class TabAnalyzer:
    def __init__(self):
        logger.info("Initializing TabAnalyzer...")
        self.tokenizer = DistilBertTokenizer.from_pretrained(MODEL_NAME, cache_dir=MODEL_PATH)
        self.model = DistilBertForSequenceClassification.from_pretrained(
            MODEL_NAME, 
            num_labels=5,  # work, learning, entertainment, social, other
            cache_dir=MODEL_PATH
        )
        self.categories = ["work", "learning", "entertainment", "social", "other"]
        self.model.eval()  # 设置为评估模式

        # 定义类别和关键词
        self.category_keywords = {
            "work": ["meeting", "project", "report", "business", "email"],
            "learning": ["tutorial", "course", "learn", "study", "documentation"],
            "entertainment": ["video", "game", "music", "movie", "stream"],
            "social": ["chat", "social", "message", "friend", "network"],
            "other": []
        }

    def analyze(self, text):
        try:
            # 首先尝试基于关键词的分类
            category = self._keyword_based_classification(text.lower())
            if category:
                # 如果找到匹配的关键词，使用较高的置信度
                return {
                    "category": category,
                    "importance_score": 0.85,
                    "status": "success",
                    "method": "keyword"
                }

            # 如果关键词分类失败，使用模型分类
            inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
            
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            probs = torch.softmax(outputs.logits, dim=1)
            category_idx = torch.argmax(probs, dim=1).item()
            confidence = float(probs.max())

            return {
                "category": self.categories[category_idx],
                "importance_score": confidence,
                "status": "success",
                "method": "model"
            }
        except Exception as e:
            logger.error(f"Analysis error: {str(e)}")
            return {
                "status": "error",
                "error": str(e)
            }

    def _keyword_based_classification(self, text):
        """基于关键词的分类"""
        for category, keywords in self.category_keywords.items():
            if any(keyword in text for keyword in keywords):
                return category
        return None

# 初始化分析器
analyzer = TabAnalyzer()

@app.route('/analyze', methods=['POST'])
def analyze_tab():
    try:
        data = request.json
        if not data or 'text' not in data:
            return jsonify({"status": "error", "error": "No text provided"}), 400

        result = analyzer.analyze(data['text'])
        return jsonify(result)

    except Exception as e:
        logger.error(f"API error: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/collect', methods=['POST'])
def collect_data():
    """收集标签页数据端点"""
    try:
        data = request.json
        collector = TabDataCollector()
        collector.add_tab_data(
            title=data['title'],
            url=data['url'],
            content=data.get('content', ''),
            category=data.get('category')
        )
        return jsonify({"status": "success"})
    except Exception as e:
        logger.error(f"Data collection error: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    try:
        # 简单的模型可用性检查
        result = analyzer.analyze("test")
        return jsonify({
            "status": "healthy",
            "model_status": "ready" if result["status"] == "success" else "error"
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(port=5000)