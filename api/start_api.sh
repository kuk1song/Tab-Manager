#!/bin/bash

# 获取脚本所在目录的绝对路径
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 初始化 conda
eval "$(conda shell.bash hook)"

# 激活 conda 环境
conda activate tab-manager

# 启动API服务
python "$DIR/app.py"
