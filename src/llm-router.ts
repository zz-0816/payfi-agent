/**
 * PayFi Agent — LLM 意图路由器
 *
 * 将用户白话输入映射到内部指令。
 * 两层策略：LLM（需 OPENAI_API_KEY）→ 正则兜底。
 *
 * 支持语义理解：
 *   "关闭" → quit
 *   "有什么论文我买了" → purchased（不是 papers）
 *   "帮我整几篇" → buy-all（不是 buy_single）
 */

// ─── 指令集 ────────────────────────────────────────────────

export type AgentIntent =
  | "buy-all"
  | "buy-single"
  | "buy-range"
  | "paper"
  | "papers"
  | "search"
  | "purchased"
  | "stats"
  | "history"
  | "reset"
  | "quit"
  | "unknown";

export interface IntentResult {
  intent: AgentIntent;
  params: {
    index?: number;       // buy-single 的编号
    from?: number;        // buy-range 的起始
    to?: number;          // buy-range 的结束
    query?: string;       // search 的搜索词
  };
  confidence: number;
  source: "llm" | "regex";
}

// ─── LLM Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 PayFi Agent 的意图路由器。分析用户输入，只输出 JSON。

## 可用意图
- buy-all: 购买全部未购论文（"全买""帮我都买了""来几篇"）
- buy-single: 购买指定编号（"买2号""购买1号论文"）→ params: {index: number}
- buy-range: 范围购买（"买1到3号""买1、2号"）→ params: {from:number, to:number}
- paper: 生成论文（"写论文""基于已购生成""帮我写一篇""使用已购论文生成新论文"）
- papers: 查看论文列表（"有什么论文""看看有哪些"）
- search: 搜索论文（"有没有关于XX的""搜一下XX"）→ params: {query:string}
- purchased: 查看已购（"我买了什么""已购""已经买了哪些"）
- stats: 统计（"花了多少""统计"）
- history: 历史记录（"交易记录""最近交易"）
- reset: 重置清空（"重置""清空所有""重新开始"）
- quit: 退出关闭（"关闭""退出""拜拜"）
- unknown: 无法理解

## 关键优先级规则
1. "生成""写""基于已购生成""合成" → paper（最高优先级，不被搜索覆盖）
2. "我买了""已购""买过" → purchased（不被论文列表覆盖）
3. "买1、2号""买1和3"中的、和 → buy-range
4. "关闭"="退出"="拜拜" → quit
5. 只输出 JSON，不要解释

## 示例
输入: "购买1、2论文"
输出: {"intent":"buy-range","params":{"from":1,"to":2},"confidence":0.9}

输入: "基于当前已购买论文生成新的论文"
输出: {"intent":"paper","params":{},"confidence":0.95}

输入: "使用已购买论文生成新的论文"
输出: {"intent":"paper","params":{},"confidence":0.95}

输入: "关闭"
输出: {"intent":"quit","params":{},"confidence":0.95}

输入: "有什么论文我买了"
输出: {"intent":"purchased","params":{},"confidence":0.9}

输入: "帮我买2号论文"
输出: {"intent":"buy-single","params":{"index":2},"confidence":0.95}

输入: "有没有关于隐私的论文"
输出: {"intent":"search","params":{"query":"隐私"},"confidence":0.9}`;

// ─── LLM 调用 ──────────────────────────────────────────────

async function callLLM(userInput: string): Promise<IntentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  if (!apiKey) return null;

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userInput },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent || "unknown",
      params: parsed.params || {},
      confidence: parsed.confidence || 0.5,
      source: "llm",
    };
  } catch {
    return null;
  }
}

// ─── 正则兜底路由（升级版）───────────────────────────────

function regexRoute(input: string): IntentResult | null {
  const s = input;

  // 退出
  if (/退出|关闭|结束|拜拜|再见|停止|关掉|不玩了/i.test(s)) {
    return { intent: "quit", params: {}, confidence: 0.9, source: "regex" };
  }

  // 重置
  if (/重置|清空.*所有|恢复.*初始|重新.*开始|全部.*删|删.*全部/i.test(s)) {
    return { intent: "reset", params: {}, confidence: 0.9, source: "regex" };
  }

  // 论文生成（必须在搜索前面——"生成论文"优先级 > "有没有论文"）
  if (/写.*论文|写.*报告|生成.*论文|生成.*报告|写.*一篇|写.*文章|帮我.*写|基于.*生成|使用.*生成|根据.*生成|基于.*已购.*生成|合成.*论文/i.test(s)) {
    return { intent: "paper", params: {}, confidence: 0.9, source: "regex" };
  }

  // 已购查询（必须在搜索前面——"我买了什么"优先级 > "有没有论文"）
  if (/我.*买了|已购|买过.*哪些|买了.*什么|购买.*记录|已经.*买|我.*买.*哪/i.test(s)) {
    return { intent: "purchased", params: {}, confidence: 0.85, source: "regex" };
  }

  // 搜索（"有没有关于XX的"——必须是明确问句才触发）
  const searchMatch = s.match(/(?:有没有|搜索|找一下|查找|搜一下|帮我.*找).*(?:关于|一下)?\s*(.+?)(?:\s*的?\s*(?:论文|文章|内容))?\s*$/);
  if (searchMatch && searchMatch[1] && searchMatch[1].trim().length > 0) {
    return { intent: "search", params: { query: searchMatch[1].trim() }, confidence: 0.8, source: "regex" };
  }

  // 查看论文列表（"有什么论文"——不含"我买了"）
  if (/有什么.*论文|论文.*列表|查看.*论文|列出.*论文|看看.*论文|哪些.*论文/i.test(s)) {
    return { intent: "papers", params: {}, confidence: 0.85, source: "regex" };
  }

  // 统计
  if (/花了.*多少|统计|余额|花了.*几|消费.*多少/i.test(s)) {
    return { intent: "stats", params: {}, confidence: 0.85, source: "regex" };
  }

  // 历史
  if (/交易.*记录|最近.*交易|查看.*历史|历史.*记录/i.test(s)) {
    return { intent: "history", params: {}, confidence: 0.85, source: "regex" };
  }

  // 全部购买
  if (/全部|所有|都买|全都|每篇|每个|整几篇|来几篇|搞几篇/i.test(s) && /买|购买|付费/i.test(s)) {
    return { intent: "buy-all", params: {}, confidence: 0.85, source: "regex" };
  }

  // 范围购买：支持 "1-3号" "1到3篇" "1、2、3" "1和2" "2 3"
  // 先清理双标点（"2、、3" → "2、3"）
  const cleaned = s.replace(/[、，]{2,}/g, "、").replace(/\s+/g, " ");
  const rangeMatch = cleaned.match(/(\d+)\s*[-–—到至、和\s]\s*(\d+)\s*[号篇本]?/);
  if (rangeMatch && /买|购买|付费/i.test(s)) {
    return { intent: "buy-range", params: { from: parseInt(rangeMatch[1]), to: parseInt(rangeMatch[2]) }, confidence: 0.9, source: "regex" };
  }

  // 单篇购买
  const idxMatch = s.match(/[第]?\s*(\d+)\s*[号篇本]\s*(?:论文)?/);
  if (idxMatch && /买|购买|付费/i.test(s) && !/几|所有|全部|都|、/i.test(s)) {
    return { intent: "buy-single", params: { index: parseInt(idxMatch[1]) }, confidence: 0.9, source: "regex" };
  }

  // 模糊购买（无编号）
  if (/帮我.*买.*论文|买.*几篇.*论文|买.*论文|买.*文章/i.test(s) && !/\d/.test(s)) {
    return { intent: "buy-all", params: {}, confidence: 0.7, source: "regex" };
  }

  return null;
}

// ─── 主入口 ────────────────────────────────────────────────

export async function routeIntent(userInput: string): Promise<IntentResult> {
  // 空输入
  if (!userInput.trim()) {
    return { intent: "unknown", params: {}, confidence: 1, source: "regex" };
  }

  // Tier 1: LLM（如有 API Key）
  const llmResult = await callLLM(userInput);
  if (llmResult && llmResult.confidence >= 0.7) {
    return llmResult;
  }

  // Tier 2: 正则兜底
  const regexResult = regexRoute(userInput);
  if (regexResult) return regexResult;

  // 都不匹配
  return { intent: "unknown", params: {}, confidence: 0, source: "regex" };
}

// ─── IntentResult → 字符串命令（兼容现有 repl.ts）─────────

export function intentToCommand(result: IntentResult): string {
  switch (result.intent) {
    case "buy-single":
      return `buy-idx ${result.params.index}`;
    case "buy-range":
      return `buy-range ${result.params.from} ${result.params.to}`;
    case "search":
      return `search ${result.params.query}`;
    default:
      return result.intent;
  }
}
