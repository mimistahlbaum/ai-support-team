// Output templates and gap-question logic for Forge agent (#75)

const TEMPLATES = {
  email_draft: `## メール下書き
**宛先:**
**件名:**

**本文:**
---
（ここに本文）
---

**前提・制約:** {assumptions}
**参照元:** {sources}
**版:** {version}`,

  research_summary: `## 調査要約
**調査目的:**
**主要な発見:**
---
（ここに内容）
---
**出典リスト:**
**未解決の問い:**
**前提:** {assumptions}
**版:** {version}`,

  marketing_plan: `## マーケティング施策案
**目的:**
**対象:**
**施策:**
---
（ここに内容）
---
**KPI目安:**
**前提:** {assumptions}
**参照元:** {sources}
**版:** {version}`,

  grant_draft: `## 助成金申請骨子
**助成金名:**
**申請目的:**
**プロジェクト概要:**
---
（ここに内容）
---
**前提・条件:** {assumptions}
**参照出典:** {sources}
**未解決事項:**
**版:** {version}`,
};

const TASK_TYPE_TO_TEMPLATE = {
  admin:     'email_draft',
  research:  'research_summary',
  writing:   'marketing_plan',
  grant:     'grant_draft',
};

// Gap questions to ask when key information is missing
const GAP_QUESTIONS = {
  email_draft:      ['宛先は誰ですか？', '件名・目的は何ですか？', 'トーン（丁寧／カジュアル）の指定はありますか？'],
  research_summary: ['調査範囲の期間はありますか？', '重点的に調べる観点はありますか？'],
  marketing_plan:   ['ターゲット層は誰ですか？', '予算・リソースの制約はありますか？', '目標KPIはありますか？'],
  grant_draft:      ['対象の助成金名と締切はいつですか？', '申請対象プロジェクトは何ですか？', '申請要件（文字数・形式）はありますか？'],
};

export function getOutputTemplate(taskType, deliverableType) {
  const key = deliverableType || TASK_TYPE_TO_TEMPLATE[taskType] || null;
  return key ? (TEMPLATES[key] || null) : null;
}

export function getGapQuestions(taskType, deliverableType) {
  const key = deliverableType || TASK_TYPE_TO_TEMPLATE[taskType] || null;
  return key ? (GAP_QUESTIONS[key] || []) : [];
}

// Builds the instruction suffix injected into Forge's prompt
export function buildForgeInstruction(taskType, deliverableType, version = 1) {
  const template = getOutputTemplate(taskType, deliverableType);
  const gapQs = getGapQuestions(taskType, deliverableType);

  const lines = [];

  if (gapQs.length) {
    lines.push('\n【入力不足時の確認ポイント】');
    lines.push('以下の情報が不明な場合は本文内に "(確認必要: <質問>" と記録してください:');
    gapQs.forEach(q => lines.push(`• ${q}`));
  }

  if (template) {
    const filled = template
      .replace('{version}', `v${version}`)
      .replace('{assumptions}', '（ここに前提・制約を記載）')
      .replace('{sources}', '（ここに参照元を記載）');
    lines.push('\n【出力テンプレート — この構造に従って成果物を作成してください】');
    lines.push(filled);
  }

  lines.push('\n【版管理ルール】');
  lines.push(`現在のバージョン: v${version}。修正ごとにバージョンを上げること。`);
  lines.push('成果物の末尾に参照元と前提条件を必ず記載すること。');

  return lines.join('\n');
}
