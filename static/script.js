/**
 * ML 速查工坊 — 前端交互 v1.2
 * 支持：多文件上传 / ZIP / 跨文件分析 + 思维导图
 */

// ── Mermaid 初始化 ───────────────────────────
if (typeof mermaid !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      primaryColor: "#eef2ff",
      primaryBorderColor: "#6366f1",
      primaryTextColor: "#1e1b4b",
      lineColor: "#818cf8",
      secondaryColor: "#f0fdf4",
    },
    mindmap: {
      padding: 32,
      useMaxWidth: true,
    },
  });
}

const state = {
  mastery: localStorage.getItem("mltool_mastery") || null,   // beginner | intermediate | god
  urgency: localStorage.getItem("mltool_urgency") || null, // rush | relaxed | giveup
  currentFiles: [],       // 用户选择的 File 对象列表
  extractedFiles: [],     // 后端返回的已提取文件列表 [{filename, text, type, chars}]
  mergedText: "",         // 合并后文本
  totalChars: 0,
  fileCount: 0,
  processResult: null,    // 单文件 AI 解析结果
  crossResult: null,      // 跨文件分析结果 (含 Mermaid)
  docUrl: null,
  docFilename: null,
  relevance: null,        // {is_relevant: bool, reason: str}
  apiConfig: {
    api_url: localStorage.getItem("mltool_api_url") || "https://api.deepseek.com/v1/chat/completions",
    api_key: localStorage.getItem("mltool_api_key") || "",
    model: localStorage.getItem("mltool_model") || "deepseek-chat",
  },
};

// ── DOM ────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dropZone = $("#dropZone");
const fileInput = $("#fileInput");
const fileList = $("#fileList");
const statusBar = $("#statusBar");
const statusText = $("#statusText");
const progressFill = $("#progressFill");
const actionRow = $("#actionRow");
const resultPanel = $("#resultPanel");
const resultActions = $("#resultActions");
const badgeArea   = $("#badgeArea");
const urgencyBadge = $("#urgencyBadge");
const badgeReset = $("#badgeReset");

// ── 初始化 ─────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // ── 两步开场询问 ──
  const savedMastery  = localStorage.getItem("mltool_mastery");
  const savedUrgency = localStorage.getItem("mltool_urgency");
  const skipOnboard  = localStorage.getItem("mltool_skip_onboard");

  if (skipOnboard === "1") {
    // 用户选择过"再详细一点"或"再救一救"，跳过询问
    state.mastery = savedMastery || "intermediate";
    state.urgency = savedUrgency || "relaxed";
    $("#onboardOverlay").classList.add("hidden");
    $("#mainLayout").classList.remove("hidden");
    updateBadges();
    // 清除 skip 标志（下次刷新时如果需要再弹）
    // localStorage.removeItem("mltool_skip_onboard");
  } else if (savedMastery && savedUrgency) {
    // 两个都设置过，直接进入
    state.mastery = savedMastery;
    state.urgency = savedUrgency;
    $("#onboardOverlay").classList.add("hidden");
    $("#mainLayout").classList.remove("hidden");
    updateBadges();
  } else if (savedMastery && !savedUrgency) {
    // 旧版本升级用户：已完成第一步，直接显示第二步
    state.mastery = savedMastery;
    $("#mainLayout").classList.add("hidden");
    $("#onboardOverlay").classList.remove("hidden");
    $$("#onboardStep1 .onboard-btn").forEach(b => {
      if (b.dataset.level === state.mastery) b.classList.add("selected");
    });
    showStep2();
  } else {
    // 全新用户：从第一步开始
    $("#mainLayout").classList.add("hidden");
    $("#onboardOverlay").classList.remove("hidden");
    showStep1();
  }

  loadApiConfig();
  bindEvents();
  bindResultButtons();   // 绑定结果页额外按钮
  renderStatsCharts();
});

// ── 两步弹窗逻辑 ───────────────────────────
function showStep1() {
  $("#onboardStep1").classList.remove("hidden");
  $("#onboardStep2").classList.add("hidden");
  $$("#onboardStep1 .onboard-btn").forEach(btn => btn.classList.remove("selected"));

  // 绑定第一步按钮（只绑一次）
  const step1Btns = $$("#onboardStep1 .onboard-btn");
  if (!step1Btns[0].dataset.bound) {
    step1Btns.forEach(btn => {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        step1Btns.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.mastery = btn.dataset.level;
        // 短暂延迟后切换到第二步
        setTimeout(() => showStep2(), 300);
      });
    });
  }
}

function showStep2() {
  $("#onboardStep1").classList.add("hidden");
  $("#onboardStep2").classList.remove("hidden");
  $$("#onboardStep2 .onboard-btn").forEach(btn => btn.classList.remove("selected"));

  // 绑定第二步按钮（只绑一次）
  const step2Btns = $$("#onboardStep2 .onboard-btn");
  if (!step2Btns[0].dataset.bound) {
    step2Btns.forEach(btn => {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        step2Btns.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.urgency = btn.dataset.urgency;
        localStorage.setItem("mltool_mastery", state.mastery);
        localStorage.setItem("mltool_urgency", state.urgency);
        // 上报统计
        fetch("/api/stats/increment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mastery: state.mastery, urgency: state.urgency })
        }).catch(() => {});
        setTimeout(() => {
          $("#onboardOverlay").classList.add("hidden");
          $("#mainLayout").classList.remove("hidden");
          updateBadges();
          showToast(getMasteryTip(state.mastery, state.urgency));

          // ── 根据 urgency 自动执行不同动作 ──
          if (state.urgency === "rush") {
            // 急速模式：直接打开课件总结文档
            showToast("🚀 急速模式：正在打开复习资料...", false, 2000);
            setTimeout(() => {
              window.location.href = "/api/zip-summary-doc";
            }, 800);
          } else if (state.urgency === "giveup") {
            // 佛系模式：自动打开挂科文档
            showToast("🦄 挂科了别慌，给你准备了攻略...", false, 2000);
            setTimeout(() => {
              window.location.href = "/api/hang-ke-doc";
            }, 800);
          }
          // relaxed 模式：什么都不做，等用户手动操作
        }, 350);
      });
    });
  }

  // 返回按钮
  const backBtn = $("#btnOnboardBack");
  if (!backBtn.dataset.bound) {
    backBtn.dataset.bound = "1";
    backBtn.addEventListener("click", () => showStep1());
  }
}

// ── 双徽章更新 ─────────────────────────────
function updateBadges() {
  // Mastery 徽章
  const mMap = {
    beginner:     { text: "🌱 零基础",    cls: "badge-beginner" },
    intermediate: { text: "🌿 有基础",      cls: "badge-intermediate" },
    god:          { text: "🔥 I'm GOD",   cls: "badge-god" },
  };
  const mi = mMap[state.mastery];
  if (mi) {
    masteryBadge.textContent = mi.text;
    masteryBadge.className = "mastery-badge " + mi.cls;
  }

  // Urgency 徽章
  const uMap = {
    rush:   { text: "🚨 急速复习",  cls: "badge-rush" },
    relaxed: { text: "☕ 时间充裕",  cls: "badge-relaxed" },
    giveup: { text: "🦄 爱新觉罗·哟呵", cls: "badge-giveup" },
  };
  const ui = uMap[state.urgency];
  if (ui) {
    urgencyBadge.textContent = ui.text;
    urgencyBadge.className = "urgency-badge " + ui.cls;
  }

  badgeArea.classList.remove("hidden");

  // 点击徽章区域 → 重新设置
  badgeReset.onclick = () => {
    localStorage.removeItem("mltool_mastery");
    localStorage.removeItem("mltool_urgency");
    state.mastery = null;
    state.urgency = null;
    badgeArea.classList.add("hidden");
    $("#mainLayout").classList.add("hidden");
    $("#onboardOverlay").classList.remove("hidden");
    showStep1();
  };
}

function getMasteryTip(mastery, urgency) {
  const tips = {
    rush:   "急速模式：只给最核心的公式和考点，速战速决 🚨",
    relaxed: "从容模式：详细讲解，配合例题和拓展知识 ☕",
    giveup: "佛系模式：爱新觉罗·哟呵复习策略，主打陪伴 🦄",
  };
  return tips[urgency] || "";
}

function loadApiConfig() {
  $("#apiUrl").value = state.apiConfig.api_url;
  $("#apiKey").value = state.apiConfig.api_key;
  $("#apiModel").value = state.apiConfig.model;
}

function saveApiConfig() {
  state.apiConfig.api_url = $("#apiUrl").value.trim();
  state.apiConfig.api_key = $("#apiKey").value.trim();
  state.apiConfig.model = $("#apiModel").value.trim();
  localStorage.setItem("mltool_api_url", state.apiConfig.api_url);
  localStorage.setItem("mltool_api_key", state.apiConfig.api_key);
  localStorage.setItem("mltool_model", state.apiConfig.model);
  $("#settingsModal").classList.add("hidden");
  showToast("设置已保存");
}

function bindEvents() {
  // 拖拽
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  });

  // 点击上传
  dropZone.addEventListener("click", (e) => {
    if (e.target === dropZone || (e.target.closest(".upload-zone") === dropZone && !e.target.closest(".btn-upload"))) {
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) handleFiles(fileInput.files);
  });

  // 设置
  $("#btnSettings").addEventListener("click", () => $("#settingsModal").classList.remove("hidden"));
  $("#btnCloseSettings").addEventListener("click", () => $("#settingsModal").classList.add("hidden"));
  $("#btnSaveSettings").addEventListener("click", saveApiConfig);
  $("#settingsModal").addEventListener("click", (e) => {
    if (e.target === $("#settingsModal")) $("#settingsModal").classList.add("hidden");
  });

  // 操作按钮
  $("#btnProcess").addEventListener("click", processWithAI);
  $("#btnReset").addEventListener("click", resetAll);
  $("#btnDownload").addEventListener("click", downloadDoc);
  $("#btnPrint").addEventListener("click", () => window.print());

  // 标签切换
  $$(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      $$(".tab-panel").forEach(p => p.classList.remove("active"));
      $(`#tab-${target}`).classList.add("active");

      // 切换到思维导图时尝试渲染
      if (target === "mindmap" && state.crossResult && state.crossResult.mermaid) {
        renderMindmap(state.crossResult.mermaid);
      }
    });
  });
}

// ── 多文件处理 ─────────────────────────────
function getIconForExt(ext) {
  const map = { pdf: "📕", pptx: "📊", ppt: "📊", png: "🖼", jpg: "🖼", jpeg: "🖼", webp: "🖼", zip: "🗜" };
  return map[ext] || "📄";
}

function formatSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes/1024/1024).toFixed(1)} MB` : `${(bytes/1024).toFixed(0)} KB`;
}

async function handleFiles(fileList_input) {
  const allowed = ["pdf", "pptx", "ppt", "png", "jpg", "jpeg", "webp", "bmp", "tiff", "zip"];
  const files = Array.from(fileList_input).filter(f => {
    const ext = f.name.split(".").pop().toLowerCase();
    return allowed.includes(ext);
  });

  if (files.length === 0) {
    showToast(`不支持的文件格式，请上传: ${allowed.join(", ")}`, true);
    return;
  }

  // Reset
  state.currentFiles = files;
  state.extractedFiles = [];
  state.mergedText = "";
  state.processResult = null;
  state.crossResult = null;
  state.docUrl = null;

  // 显示文件列表
  renderFileList(files, "uploading");
  dropZone.classList.add("has-file");
  resultPanel.classList.add("hidden");

  // 逐个上传提取
  let allResults = [];
  let totalChars = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pct = Math.round((i / files.length) * 100);
    showStatus(`正在提取 (${i+1}/${files.length})… ${file.name}`, pct);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/upload", { method: "POST", body: formData });

      // 处理非 JSON 响应（如 413 文件过大、500 服务器错误等）
      if (!resp.ok) {
        let errMsg = `服务器返回 ${resp.status}`;
        try {
          const text = await resp.text();
          // 尝试从 HTML 错误页面提取有用信息
          const titleMatch = text.match(/<title>([^<]+)<\/title>/);
          if (titleMatch) errMsg += ` — ${titleMatch[1]}`;
        } catch (_) {}
        showToast(`${file.name}: ${errMsg}`, true);
        continue;
      }

      const data = await resp.json();

      if (data.error) {
        // 收集后端返回的详细警告信息
        let errMsg = `${file.name}: ${data.error}`;
        if (data.warnings && data.warnings.length > 0) {
          errMsg += ` — ${data.warnings.join('; ')}`;
        }
        showToast(errMsg, true);
        continue;
      }

      // data.files 是后端返回的文件数组（ZIP 可能解出多个）
      if (data.files) {
        for (const f of data.files) {
          allResults.push(f);
          totalChars += f.chars || 0;
        }
        // 收集相关性检测结果（取第一个有效结果）
        if (data.relevance && state.relevance === null) {
          state.relevance = data.relevance;
        }
        // 显示后端警告（如跳过的文件）
        if (data.warnings && data.warnings.length > 0) {
          showToast(data.warnings.slice(0, 3).join(' · '), false, 6000);
        }
      }
    } catch (err) {
      showToast(`${file.name}: 上传失败 - ${err.message}`, true);
    }
  }

  if (allResults.length === 0) {
    hideStatus();
    // 不给泛泛的错误，让用户看到真正原因
    dropZone.classList.remove("has-file");
    fileList.innerHTML = '<div class="file-item" style="justify-content:center;color:var(--danger);">未提取到任何有效文件</div>';
    return;
  }

  // 构建合并文本
  state.extractedFiles = allResults;
  state.fileCount = allResults.length;
  state.totalChars = totalChars;

  state.mergedText = allResults.map((f, i) =>
    `\n═══ 文件 ${i+1}: ${f.filename} ═══\n${f.text}`
  ).join("\n\n");

  showStatus(`已提取 ${state.fileCount} 个文件 · ${totalChars.toLocaleString()} 字符`, 100);
  renderFileList(null, "done", allResults);

  // ── 内容相关性判断 ──
  if (state.relevance && !state.relevance.is_relevant) {
    const reason = state.relevance.reason || "内容与机器学习/计算机专业课复习无关";
    renderRelevanceBlock(reason);
    btnProcess.classList.add("hidden");
    actionRow.classList.remove("hidden");
    return;
  }

  actionRow.classList.remove("hidden");
}

function renderFileList(files, mode, results) {
  if (mode === "uploading") {
    fileList.innerHTML = files.map((f, i) => {
      const ext = f.name.split(".").pop().toLowerCase();
      return `
        <div class="file-item">
          <span class="file-icon">${getIconForExt(ext)}</span>
          <div class="file-info">
            <div class="file-name">${escHtml(f.name)}</div>
            <div class="file-meta">${formatSize(f.size)} · ${ext.toUpperCase()}</div>
          </div>
          <span class="file-badge ${ext === 'zip' ? 'zip' : ''}">⏳</span>
        </div>`;
    }).join("");
  } else if (mode === "done" && results) {
    fileList.innerHTML = results.map((f, i) => {
      const ext = (f.filename || "").split(".").pop().toLowerCase();
      const chars = (f.chars || f.text?.length || 0).toLocaleString();
      const hasError = f.text && f.text.startsWith("[");
      return `
        <div class="file-item">
          <span class="file-icon">${getIconForExt(ext)}</span>
          <div class="file-info">
            <div class="file-name">${escHtml(f.filename)}</div>
            <div class="file-meta">${f.type} · ${chars} 字符</div>
          </div>
          <span class="file-badge file-ok">✓</span>
        </div>`;
    }).join("");
    fileList.innerHTML += `<div class="file-summary">共 ${results.length} 个文件 · ${state.totalChars.toLocaleString()} 字符</div>`;
  }
}

// ── 单文件 AI 解析 ─────────────────────────
async function processWithAI() {
  if (!state.mergedText) { showToast("请先上传文件", true); return; }

  $("#btnProcess").disabled = true;
  $("#btnProcess").innerHTML = '<span class="loading-spinner"></span> 解析中…';
  showStatus("正在 AI 全解析（公式 + 考点 + 思维导图）…", 30);

  try {
    const resp = await fetch("/api/process-unified", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: state.extractedFiles,
        api_config: state.apiConfig,
        mastery: state.mastery || "intermediate",
        urgency: state.urgency || null,
        more_detail: state.moreDetail || false,
      }),
    });
    const data = await resp.json();
    if (data.error) { showToast(data.error, true); return; }

    state.processResult = data;
    state.moreDetail = false;   // 重置"再详细"标志
    hideStatus();
    showToast("AI 全解析完成！");

    // 渲染公式卡
    const formulas = data.formulas || [];
    renderFormulas(formulas.length ? formulas : []);

    // 渲染考点
    const points = data.points || [];
    renderPoints(points.length ? points : []);

    // 渲染思维导图
    if (data.mermaid) {
      renderMindmap(data.mermaid);
    } else {
      $("#mindmapContainer").innerHTML = '<div class="doc-preview-empty">未生成思维导图，可能是内容太少</div>';
    }
    if (data.summary) {
      $("#mindmapSummary").textContent = data.summary;
      $("#mindmapSummary").classList.remove("hidden");
    } else {
      $("#mindmapSummary").classList.add("hidden");
    }

    // 生成文档预览
    try {
      const docResp = await fetch("/api/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formulas: formulas,
          points: points,
          filename: state.extractedFiles[0]?.filename || "课件",
          extracted_text: "",
        }),
      });
      const docData = await docResp.json();
      if (!docData.error) {
        state.docUrl = docData.url;
        state.docFilename = docData.filename;
        renderDocPreview(docData.url, docData.filename);
      }
    } catch (_) { /* non-critical */ }

    // KaTeX 渲染
    if (typeof renderMathInElement === "function") {
      ["tab-formulas", "tab-points"].forEach(id => {
        const el = document.getElementById(id);
        if (el) renderMathInElement(el, { delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false},
          {left: "\\[", right: "\\]", display: true},
          {left: "\\(", right: "\\)", display: false}
        ], throwOnError: false });
      });
    }

    // 显示结果
    resultPanel.classList.remove("hidden");
    resultActions.classList.remove("hidden");
    // 默认切到公式卡
    $$(".tab").forEach(t => t.classList.remove("active"));
    $('[data-tab="formulas"]').classList.add("active");
    $$(".tab-panel").forEach(p => p.classList.remove("active"));
    $("#tab-formulas").classList.add("active");

  } catch (err) {
    showToast("解析失败: " + err.message, true);
  } finally {
    $("#btnProcess").disabled = false;
    $("#btnProcess").innerHTML = "🤖 AI 解析（公式 + 考点 + 思维导图）";
    hideStatus();
  }
}

// ── (已废弃：跨文件分析合并入统一解析) ────

// ── 公式清洗：确保 KaTeX 能正确渲染 ──
function cleanFormula(raw) {
  // 直接去掉所有 $ 符号，AI 可能加了 $...$ 包裹
  return raw.replace(/\$/g, "").trim();
}

// ── 将纯文本大纲转换为合法的 Mermaid mindmap ──
function textOutlineToMindmap(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length === 0) return "mindmap\n  root((\"机器学习知识体系\"))";

  // 收集所有有效内容行
  const items = [];
  for (const rawLine of lines) {
    let content = rawLine.trim();
    if (!content) continue;
    if (/^mindmap$/i.test(content)) continue;
    // 跳过 root 行（我们用自己的）
    if (/^\s*root\s*[\(\[]/i.test(content)) continue;

    // 去除 LaTeX $ 和 markdown 标记
    content = content.replace(/\$([^$]*)\$/g, "$1");
    content = content.replace(/^[*\-#>\s]+/, "").trim();

    // 将 nodeID[Label] 格式提取出 Label 部分
    const idLabelMatch = content.match(/^\w+\s*[\(\[](.*)[\)\]]$/);
    if (idLabelMatch && idLabelMatch[1]) {
      let inner = idLabelMatch[1].trim();
      // 去掉内层引号再重新包裹
      inner = inner.replace(/^["']|["']$/g, "");
      content = inner;
    }

    // 跳过太短的内容
    if (content.length < 2) continue;

    // 截断超长文本
    if (content.length > 40) content = content.substring(0, 37) + "...";
    content = content.replace(/"/g, '\\"');

    items.push(content);
  }

  // 限制最大节点数（防止挤成一团）
  const MAX_NODES = 25;
  if (items.length > MAX_NODES) items.length = MAX_NODES;

  let result = ["mindmap", "  root((\"机器学习知识体系\"))"];

  if (items.length === 0) return result.join("\n");

  // 检测是否有明显的文件名/章节名（用于做二级节点）
  const fileLikeIndices = [];
  items.forEach((item, i) => {
    if (/\.(pdf|pptx?|docx?)$/i.test(item) || /^文件\d*[:：]/i.test(item)
        || /^第\d+章|^Chap\.?\s|^Section\s/i.test(item)
        || /^【.*】/.test(item)) {
      fileLikeIndices.push(i);
    }
  });

  if (fileLikeIndices.length >= 2) {
    // 有多个文件/章节 → 用它们作为二级节点（纯引号格式！）
    let lastFileIdx = -1;
    for (let i = 0; i < items.length; i++) {
      const isFileHead = fileLikeIndices.includes(i);
      if (isFileHead) {
        lastFileIdx = i;
        result.push('    "' + items[i].replace(/\.(pdf|pptx?|docx?)$/i, "") + '"');
      } else {
        result.push('      "' + items[i] + '"');
      }
    }
  } else if (items.length <= 8) {
    // 节点少 → 全部挂在 root 下（纯引号格式）
    for (const item of items) {
      result.push('    "' + item + '"');
    }
  } else {
    // 节点多但无明确分组 → 自动分成几个组（纯引号格式）
    const GROUP_COUNT = Math.min(4, Math.ceil(items.length / 6));
    const groupSize = Math.ceil(items.length / GROUP_COUNT);
    const groupNames = ["核心概念", "算法方法", "评估指标", "实用技巧"];
    for (let g = 0; g < GROUP_COUNT; g++) {
      result.push('    "' + (groupNames[g] || ("分组" + (g+1))) + '"');
      const start = g * groupSize;
      const end = Math.min(start + groupSize, items.length);
      for (let i = start; i < end; i++) {
        result.push('      "' + items[i] + '"');
      }
    }
  }

  // 加上高频考点节点（纯引号格式）
  result.push('    "高频考点"');
  result.push('      "重点复习"');

  return result.join("\n");
}

// ── Mermaid 代码清洗：确保所有节点都是纯引号格式 ──
function sanitizeMermaidCode(code) {
  const lines = code.split("\n");
  let hasMindmap = false;
  let indents = [];

  // 检测是否有合法 mindmap 结构
  for (const line of lines) {
    const t = line.trim();
    if (/^mindmap$/i.test(t)) { hasMindmap = true; continue; }
    if (hasMindmap && t && /^\s{2,}/.test(line)) {
      indents.push(Math.floor((line.length - line.trimStart().length) / 2));
    }
  }

  // 如果没有 mindmap 关键字或没有缩进子节点 → 转换
  if (!hasMindmap || indents.length < 1) {
    console.log("[Mermaid] 非标准格式，执行转换");
    return textOutlineToMindmap(code);
  }

  // 检测是否为扁平结构（>12个节点且≤2种缩进级别）
  const uniqueIndents = [...new Set(indents)];
  const isFlat = indents.length > 12 && uniqueIndents.length <= 2;
  if (isFlat) {
    console.log("[Mermaid] 扁平结构（" + indents.length + "个节点同级别），执行重组");
    return textOutlineToMindmap(code);
  }

  // 标准清洗：逐行处理
  let result = ["mindmap"];
  for (const raw of lines) {
    let line = raw.trimEnd();
    if (!line) continue;
    if (/^mindmap$/i.test(line)) continue;

    // 计算缩进（每级2空格）
    const indent = Math.max(0, Math.floor((raw.length - raw.trimStart().length) / 2));
    let content = line.trim();
    if (!content) continue;

    // 去掉 $
    content = content.replace(/\$/g, "");

    // ★★★ 核心：将 nodeID[Label] 格式转为纯引号字符串
    // 例如: Chap_2_Part2["模型评估"] → "模型评估"
    //       root(("机器学习")) → root(("机器学习"))
    const idLabelMatch = content.match(/^([a-zA-Z_]\w*)\s*[\(\[](.*)[\)\]]$/);
    if (idLabelMatch) {
      const id = idLabelMatch[1];
      let inner = idLabelMatch[2].trim();

      // root 节点保留原样（root((...)) 是 Mermaid 特殊语法）
      if (/^root$/i.test(id)) {
        // 确保内部有引号
        if (!/^["'].*["']$/.test(inner)) {
          inner = '"' + inner.replace(/"/g, '\\"') + '"';
        }
        result.push("  ".repeat(indent) + id + "((" + inner + "))");
        continue;
      }

      // 其他 ID[label] → 提取 label 作为纯引号字符串
      inner = inner.replace(/^["']|["']$/g, "");
      if (inner.length < 1) inner = id;  // fallback 用 ID 本身
      if (inner.length > 40) inner = inner.substring(0, 37) + "...";
      inner = '"' + inner.replace(/"/g, '\\"') + '"';
      result.push("  ".repeat(indent) + inner);
      continue;
    }

    // 截断超长行
    if (content.length > 80) content = content.substring(0, 77) + "...";

    // 普通内容 → 加引号包裹
    content = quoteIfNeeded(content);

    result.push("  ".repeat(indent) + content);
  }
  return result.join("\n");
}

// 判断一个 Mermaid 节点内容是否需要引号包裹
function quoteIfNeeded(text) {
  // 已经被引号完整包裹了 → 不处理
  if (/^["'].*["']$/.test(text)) return text;

  // 纯简单标识符（字母数字下划线+括号）→ 不需要引号
  if (/^[a-zA-Z_][a-zA-Z0-9_]*[(][)]$/.test(text)) return text;
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text)) return text;
  
  // root((...)) 或 root[...] 格式 → 检查内部内容
  const rootMatch = text.match(/^(root)\s*([\(\[])(.*)([\)\]])$/);
  if (rootMatch) {
    const inner = rootMatch[3];
    // 如果内部有非安全字符，给内部加引号
    if (/[^a-zA-Z0-9_\u4e00-\u9fff]/.test(inner)) {
      return rootMatch[1] + rootMatch[2] + '"' + inner.replace(/"/g, '\\"') + '"' + rootMatch[4];
    }
    return text;
  }

  // node[label] 或 node(label) 格式 → 处理 label 部分
  const nodeMatch = text.match(/^([a-zA-Z_]\w*)\s*([\(\[])(.*)([\)\]])$/);
  if (nodeMatch) {
    const id = nodeMatch[1];
    const openBr = nodeMatch[2];
    let label = nodeMatch[3];
    const closeBr = nodeMatch[4];

    // label 内部如果有特殊字符 → 加引号
    if (!/^["'].*["']$/.test(label) && /[^a-zA-Z0-9_]/.test(label)) {
      label = '"' + label.replace(/"/g, '\\"') + '"';
    }
    return id + openBr + label + closeBr;
  }

  // 其他所有情况（中文、含空格、含符号等）→ 整体加引号
  return '"' + text.replace(/"/g, '\\"') + '"';
}

function renderMindmap(mermaidCode) {
  const container = $("#mindmapContainer");
  container.innerHTML = '<div class="loading-spinner" style="margin:60px auto;"></div>';

  if (typeof mermaid === "undefined") {
    container.innerHTML = '<div class="doc-preview-empty">Mermaid.js 未加载，请刷新页面重试</div>';
    return;
  }

  // 第1次尝试：清洗后渲染
  const cleanCode = sanitizeMermaidCode(mermaidCode);

  tryRenderMermaid(container, cleanCode, mermaidCode, 1);
}

// 封装渲染逻辑，支持多次重试
function tryRenderMermaid(container, code, originalCode, attempt) {
  const id = "mermaid-svg-" + Date.now() + "-" + attempt;

  mermaid.render(id, code).then(({ svg }) => {
    container.innerHTML = svg;
    // SVG 后处理：美化
    const svgEl = container.querySelector("svg");
    if (svgEl) {
      svgEl.style.maxWidth = "100%";
      svgEl.style.height = "auto";
      svgEl.querySelectorAll("path").forEach(p => { p.setAttribute("stroke-width", "2.5"); });
      svgEl.querySelectorAll("rect").forEach(r => {
        r.setAttribute("rx", "10"); r.setAttribute("ry", "10");
        r.setAttribute("stroke-width", "1.5");
      });
      svgEl.querySelectorAll("text").forEach(t => {
        t.setAttribute("font-weight", "600");
        t.setAttribute("font-size", t.getAttribute("font-size") || "14px");
      });
      const rootRect = svgEl.querySelector("rect");
      if (rootRect) {
        rootRect.setAttribute("fill", "#6366f1");
        rootRect.setAttribute("stroke", "#4338ca");
        rootRect.setAttribute("stroke-width", "2");
      }
      const rootTexts = svgEl.querySelectorAll("text");
      if (rootTexts.length > 0) {
        rootTexts[0].setAttribute("fill", "#ffffff");
        rootTexts[0].setAttribute("font-weight", "700");
      }
    }
  }).catch((err) => {
    console.error("[Mermaid] 第" + attempt + "次渲染失败:", err.message || err);

    if (attempt === 1) {
      // 第2次尝试：用纯文本转换
      console.log("[Mermaid] 尝试纯文本→mindmap 转换...");
      const fallbackCode = textOutlineToMindmap(originalCode);
      tryRenderMermaid(container, fallbackCode, originalCode, 2);
    } else {
      // 两次都失败 → 显示错误
      showMindmapFallback(originalCode, err.message || String(err));
    }
  });
}

function showMindmapFallback(originalCode, errMsg) {
  const container = $("#mindmapContainer");
  container.innerHTML = `
    <div style="padding:20px;color:var(--danger);">
      <p>⚠️ 思维导图渲染失败${errMsg ? '（' + errMsg + '）' : ''}，以下是原始代码：</p>
      <pre style="background:#f8f9fa;padding:16px;border-radius:8px;overflow:auto;font-size:13px;margin-top:12px;">${escHtml(originalCode)}</pre>
      <p style="margin-top:12px;font-size:13px;color:var(--text-secondary);">
        你可以将以上代码复制到 <a href="https://mermaid.live" target="_blank" style="color:var(--primary);">mermaid.live</a> 查看思维导图
      </p>
      </div>`;
}

// ── 生成文档 ───────────────────────────────
async function generateDoc() {
  try {
    const resp = await fetch("/api/generate-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formulas: state.processResult?.formulas || [],
        points: state.processResult?.points || [],
        filename: state.extractedFiles[0]?.filename || "课件",
        extracted_text: "",
      }),
    });
    const data = await resp.json();
    if (data.error) { showToast(data.error, true); return; }

    renderFormulas(state.processResult?.formulas || []);
    renderPoints(state.processResult?.points || []);
    renderDocPreview(data.url, data.filename);

    state.docUrl = data.url;
    state.docFilename = data.filename;

    resultPanel.classList.remove("hidden");
    resultActions.classList.remove("hidden");

    // KaTeX 渲染
    if (typeof renderMathInElement === "function") {
      ["tab-formulas", "tab-points"].forEach(id => {
        const el = document.getElementById(id);
        if (el) renderMathInElement(el, { delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false},
          {left: "\\[", right: "\\]", display: true},
          {left: "\\(", right: "\\)", display: false}
        ], throwOnError: false });
      });
    }

    // 切换到公式卡
    $$(".tab").forEach(t => t.classList.remove("active"));
    $('[data-tab="formulas"]').classList.add("active");
    $$(".tab-panel").forEach(p => p.classList.remove("active"));
    $("#tab-formulas").classList.add("active");
  } catch (err) {
    showToast("生成文档失败: " + err.message, true);
  }
}

function renderFormulaHtml(raw) {
  const cleaned = cleanFormula(raw);
  if (typeof katex !== "undefined") {
    try {
      return katex.renderToString(cleaned, {displayMode: true, throwOnError: false, output: "html"});
    } catch(e) { /* 降级用 $$ 包裹 */ }
  }
  return "$$" + cleaned + "$$";
}

function renderFormulas(formulas) {
  if (!formulas.length) {
    $("#formulasContent").innerHTML = '<div class="doc-preview-empty">暂无公式，请先完成 AI 解析</div>';
    return;
  }
  // 按来源分组
  const bySource = {};
  formulas.forEach(f => {
    const src = f.source || "未标注来源";
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(f);
  });
  const sources = Object.keys(bySource);
  const multiSource = sources.length > 1;

  let html = '<div class="formula-card">';
  let globalIdx = 0;
  sources.forEach(src => {
    if (multiSource) {
      html += `<div class="source-section-header">📄 来自：${escHtml(src)}</div>`;
    }
    html += bySource[src].map(f => {
      globalIdx++;
      return `
        <div class="fc-item">
          <div>
            <span class="fc-num">${globalIdx}</span>
            <span class="fc-name">${escHtml(f.name)}</span>
            ${!multiSource ? '' : `<span class="source-badge" title="来源：${escHtml(f.source)}">📎 ${escHtml(f.source)}</span>`}
          </div>
          <div class="fc-math">${renderFormulaHtml(f.formula)}</div>
          <div class="fc-meaning">💡 ${escHtml(f.meaning)}</div>
        </div>
      `;
    }).join("");
  });
  html += '</div>';
  $("#formulasContent").innerHTML = html;
}

function renderPoints(points) {
  if (!points.length) {
    $("#pointsContent").innerHTML = '<div class="doc-preview-empty">暂无考点数据，请先完成 AI 解析</div>';
    return;
  }
  // 按来源分组
  const bySource = {};
  points.forEach(p => {
    const src = p.source || "未标注来源";
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(p);
  });
  const sources = Object.keys(bySource);
  const multiSource = sources.length > 1;

  let html = '<div class="pt-list">';
  sources.forEach(src => {
    if (multiSource) {
      html += `<div class="source-section-header">📄 来自：${escHtml(src)}</div>`;
    }
    html += bySource[src].map(p => `
      <div class="pt-item">
        <div>
          <span class="pt-prio">${escHtml(p.priority)}</span>
          <span class="pt-topic">${escHtml(p.topic)}</span>
          ${!multiSource ? '' : `<span class="source-badge" title="来源：${escHtml(p.source)}">📎 ${escHtml(p.source)}</span>`}
        </div>
        <div class="pt-summary">${escHtml(p.summary)}</div>
        ${p.pitfall ? `<div class="pt-pitfall">⚠️ 易错：${escHtml(p.pitfall)}</div>` : ""}
      </div>
    `).join("");
  });
  html += '</div>';
  $("#pointsContent").innerHTML = html;
}

function renderDocPreview(url, filename) {
  $("#docPreview").innerHTML = `
    <iframe src="${url}" style="width:100%;height:500px;border:1px solid var(--border);border-radius:8px;" title="预览"></iframe>
    <p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">📄 ${escHtml(filename)} — 可直接下载或打印</p>
  `;
}

// ── 下载 ───────────────────────────────────
function downloadDoc() {
  if (!state.docUrl) {
    showToast("请先完成 AI 解析再下载", true);
    return;
  }
  const a = document.createElement("a");
  a.href = state.docUrl;
  a.download = state.docFilename || "速查卡.html";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);
}

// ── 工具函数 ───────────────────────────────
function showStatus(text, pct) {
  statusBar.classList.remove("hidden");
  statusText.textContent = text;
  progressFill.style.width = pct + "%";
}
function hideStatus() { statusBar.classList.add("hidden"); progressFill.style.width = "0"; }

function resetAll() {
  state.currentFiles = [];
  state.extractedFiles = [];
  state.mergedText = "";
  state.totalChars = 0;
  state.fileCount = 0;
  state.processResult = null;
  state.crossResult = null;
  state.docUrl = null;
  state.relevance = null;
  fileList.innerHTML = "";
  fileInput.value = "";
  dropZone.classList.remove("has-file");
  hideStatus();
  actionRow.classList.add("hidden");
  resultPanel.classList.add("hidden");
  resultActions.classList.add("hidden");
  $("#mindmapSummary").classList.add("hidden");
  $("#mindmapContainer").innerHTML = '<div class="doc-preview-empty">请上传 ≥2 份课件后，点击「🧠 跨文件分析 + 思维导图」</div>';
  // 清除拦截提示
  const existingBlock = $("#relevanceBlock");
  if (existingBlock) existingBlock.remove();
}

function renderRelevanceBlock(reason) {
  const existing = $("#relevanceBlock");
  if (existing) existing.remove();
  const block = document.createElement("div");
  block.id = "relevanceBlock";
  block.style.cssText = `
    margin: 16px 0; padding: 20px 24px;
    background: #fff3cd; border-left: 4px solid #e6a817;
    border-radius: 8px; font-size: 14px; line-height: 1.7;
  `;
  block.innerHTML = `
    <div style="font-weight:700;font-size:15px;color:#856404;margin-bottom:6px;">
      ⚠️ 内容不匹配
    </div>
    <div style="color:#856404;">${escHtml(reason)}</div>
    <div style="color:#856404;margin-top:10px;font-size:13px;">
      本工具仅支持 <b>机器学习 / 计算机专业课期末复习资料</b>（课件、笔记、习题等）。<br>
      请上传相关课件后重试，或点击「↺ 重新上传」。
    </div>
  `;
  dropZone.parentNode.insertBefore(block, actionRow);
}

function showToast(msg, isError = false, duration = 4000) {
  const existing = $(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: ${isError ? "var(--danger)" : "#1a1a2e"}; color: #fff;
    padding: 10px 24px; border-radius: 8px; font-size: 14px;
    z-index: 9999; box-shadow: var(--shadow-lg);
    animation: fadeIn .2s; max-width: 80vw; word-break: break-word;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function escHtml(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ── 结果页额外按钮 ─────────────────────────────
function bindResultButtons() {
  // 「我想要再详细一点」按钮
  const btnMore = $("#btnMoreDetail");
  if (btnMore && !btnMore.dataset.bound) {
    btnMore.dataset.bound = "1";
    btnMore.addEventListener("click", () => {
      localStorage.setItem("mltool_skip_onboard", "1");
      state.moreDetail = true;
      showToast("正在生成更详细的内容...", false, 3000);
      processWithAI();
    });
  }
}

// ── 统计雷达图 ─────────────────────────────
let chartMastery = null;
let chartUrgency = null;

function renderStatsCharts() {
  if (typeof Chart === "undefined") return;

  fetch("/api/stats/get")
    .then(r => r.json())
    .then(data => {
      // 掌握程度雷达图
      const mLabels = ["零基础", "有基础", "I'm GOD"];
      const mData = [
        data.mastery.beginner    || 0,
        data.mastery.intermediate || 0,
        data.mastery.god          || 0,
      ];

      const ctxM = document.getElementById("chartMastery");
      if (!ctxM) return;
      if (chartMastery) chartMastery.destroy();
      chartMastery = new Chart(ctxM, {
        type: "radar",
        data: {
          labels: mLabels,
          datasets: [{
            label: "选择次数",
            data: mData,
            fill: true,
            backgroundColor: "rgba(99,102,241,0.2)",
            borderColor: "rgb(99,102,241)",
            pointBackgroundColor: "rgb(99,102,241)",
            pointBorderColor: "#fff",
            pointRadius: 5,
          }]
        },
        options: {
          scales: {
            r: {
              beginAtZero: true,
              ticks: { stepSize: 1, precision: 0 },
              pointLabels: { font: { size: 13 } }
            }
          },
          plugins: { legend: { display: false } }
        }
      });

      // 时间紧迫程度雷达图
      const uLabels = ["急速复习", "时间充裕", "佛系陪伴"];
      const uData = [
        data.urgency.rush    || 0,
        data.urgency.relaxed || 0,
        data.urgency.giveup  || 0,
      ];

      const ctxU = document.getElementById("chartUrgency");
      if (!ctxU) return;
      if (chartUrgency) chartUrgency.destroy();
      chartUrgency = new Chart(ctxU, {
        type: "radar",
        data: {
          labels: uLabels,
          datasets: [{
            label: "选择次数",
            data: uData,
            fill: true,
            backgroundColor: "rgba(168,85,247,0.2)",
            borderColor: "rgb(168,85,247)",
            pointBackgroundColor: "rgb(168,85,247)",
            pointBorderColor: "#fff",
            pointRadius: 5,
          }]
        },
        options: {
          scales: {
            r: {
              beginAtZero: true,
              ticks: { stepSize: 1, precision: 0 },
              pointLabels: { font: { size: 13 } }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    })
    .catch(() => {});
}
