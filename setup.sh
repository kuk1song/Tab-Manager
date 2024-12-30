#!/bin/bash

# 获取脚本所在目录的绝对路径
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Setting up Tab Manager..."

# 创建 conda 环境
echo "Creating conda environment..."
cd "$DIR/api"
conda create -n tab-manager python=3.8 -y

# 激活 conda 环境
eval "$(conda shell.bash hook)"
conda activate tab-manager

# 安装依赖
echo "Installing dependencies..."
# 使用 conda 安装 PyTorch
conda install pytorch torchvision torchaudio -c pytorch -y

# 安装其他依赖
pip install werkzeug==2.0.1
pip install flask==2.0.1
pip install flask-cors==3.0.10
pip install transformers==4.11.3

# 创建模型缓存目录
echo "Creating model cache directory..."
mkdir -p model_cache

# 创建并写入 start_api.sh
echo "Creating start script..."
cat > start_api.sh << EOL
#!/bin/bash

# 获取脚本所在目录的绝对路径
DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"

# 初始化 conda
eval "\$(conda shell.bash hook)"

# 激活 conda 环境
conda activate tab-manager

# 启动API服务
python "\$DIR/app.py"
EOL

# 设置启动脚本权限
chmod +x start_api.sh

echo "Setup completed successfully!"
echo "To start the API server, run: cd api && ./start_api.sh"