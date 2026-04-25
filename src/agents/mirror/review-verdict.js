// Structured review verdict logic for Mirror agent (#76)

const CRITERIA_BY_TYPE = {
  email_draft:      ['要件充足', '事実整合性', 'トーン', '実行可能性'],
  research_summary: ['要件充足', '事実整合性', '出典整合性', '網羅性'],
  marketing_plan:   ['要件充足', '実現可能性', '一貫性', '効果見込み'],
  grant_draft:      ['要件充足', '事実整合性', '出典整合性', '実行可能性'],
  default:          ['要件充足', '事実整合性', 'トーン', '実行可能性'],
};

export function getReviewCriteria(deliverableType) {
  return CRITERIA_BY_TYPE[deliverableType] || CRITERIA_BY_TYPE.default;
}

// Escalate to human review when conditions are met
export function shouldEscalate(cycleCount, verdict) {
  if (verdict === 'block') return { escalate: true, reason: '根本的な問題があるため人間のレビューが必要です' };
  if (cycleCount >= 5 && verdict === 'revise') return { escalate: true, reason: '修正が5回以上繰り返されました' };
  return { escalate: false, reason: '' };
}

// Build the review verdict instruction suffix for Mirror's prompt
export function buildMirrorReviewInstruction(deliverableType, cycleCount = 0) {
  const criteria = getReviewCriteria(deliverableType);
  const escalation = shouldEscalate(cycleCount, 'revise');

  return `
【レビュー判定モード】
評価観点: ${criteria.join(' / ')}

判定ルール:
- ✅ pass: 全項目が基準を満たしている
- ⚠️ revise: 軽微な修正が必要（具体的な修正指示を出す）
- 🚫 block: 要件を根本的に満たしていない、または事実誤認がある

出力形式:
**判定: [pass / revise / block]**
評価観点別スコア:
• 要件充足: [ok / partial / fail]
• （他の観点も同様）
修正指示:
• （具体的な修正指示を箇条書き）
変更点サマリー: （pass時は「変更なし」）
${escalation.escalate ? `\n🔴 人間レビューが必要: ${escalation.reason}` : ''}

【人間エスカレーション条件】
以下の場合は出力の末尾に「🔴 人間レビュー必須: <理由>」を追記してください:
- 事実誤認が明確にある
- ターン数が多く同じ修正が繰り返されている
- 法的・倫理的リスクが含まれる可能性がある`;
}
