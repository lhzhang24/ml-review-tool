# ML 速查工坊

课件上传 → AI 解析 → 公式速查卡 + 考点重点 + 思维导图

支持格式：PDF / PPTX / 图片 (PNG, JPG, WEBP) / ZIP 压缩包

## 功能

- **多文件上传**：支持拖拽上传多个课件，ZIP 自动解压
- **AI 公式速查卡**：自动提取课件中的数学公式，KaTeX 渲染
- **考点重点整理**：根据掌握程度和时间紧迫度智能调整输出风格
- **思维导图**：Mermaid.js 渲染知识体系结构图
- **完整文档导出**：一键生成包含所有公式的 HTML 速查文档
- **跨文件关联分析**：多文件上传时自动发现知识点关联
- **选择统计**：雷达图可视化用户的选择偏好

## 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env 填入你的 DeepSeek API Key

# 3. 启动
export $(cat .env | xargs) && python app.py

# 4. 打开浏览器
# 访问 http://localhost:8080
```

## 环境变量

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | https://platform.deepseek.com/ |

## 技术栈

- **后端**：Flask + Python
- **AI**：DeepSeek API (OpenAI 兼容格式)
- **前端**：原生 JS + KaTeX (公式渲染) + Mermaid.js (思维导图) + Chart.js (统计图表)
- **文本提取**：PyPDF2 / pdfplumber (PDF) / python-pptx (PPTX) / pytesseract (OCR)

## 项目结构

```
ml-review-tool/
├── app.py              # 主后端 (上传、AI解析、文档生成)
├── extra_routes.py     # 挂科文档 + 本地ZIP分析路由
├── analyze_zip.py      # ZIP 文件分析工具
├── requirements.txt    # Python 依赖
├── .env.example        # 环境变量模板
├── templates/
│   ├── index.html      # 主页面
│   └── cheatsheet.html # 完整速查文档模板
└── static/
    ├── script.js       # 前端逻辑
    └── style.css       # 样式
```

## License

MIT
