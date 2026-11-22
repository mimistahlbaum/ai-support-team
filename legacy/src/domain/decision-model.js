export function taskTypeHint(taskType) {
  const hints = {
    general: '一般的な相談、整理、方向性設計、実務補助として扱ってください。',
    research: '研究テーマ、文献、理論枠組み、方法論、研究計画、論理構成を重視してください。',
    grant: '助成金、公募、申請文、審査視点、締切、要件、実現可能性を重視してください。',
    website: 'Webサイト、情報設計、掲載内容、導線、ブランド表現、構成を重視してください。',
    marketing: '発信戦略、ターゲット、訴求角度、投稿案、導線を重視してください。',
    admin: '事務処理、テンプレート、手順、抜け漏れ防止、実務整理を重視してください。',
  };
  return hints[taskType] || hints.general;
}
