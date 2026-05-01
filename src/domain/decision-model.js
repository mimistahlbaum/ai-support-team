export function taskTypeHint(taskType) {
  const hints = {
    general: '一般的な相談、整理、方向性設計、実務補助として扱ってください。',
    research: '研究テーマ、文献、理論枠組み、方法論、研究計画、論理構成を重視してください。',
    grant: '助成金、公募、申請文、審査視点、締切、要件、実現可能性を重視してください。CALD・POC・LGBQ・日本国籍・オーストラリア永住権・早期キャリアアーティスト向けの機会も積極的に検討してください。',
    admin: '事務処理、テンプレート、手順、抜け漏れ防止、実務整理を重視してください。',
    writing: '文章作成、構成、表現改善、文体、読みやすさ、説得力、編集、SNS投稿案、発信戦略、訴求角度を重視してください。',
  };
  return hints[taskType] || hints.general;
}
