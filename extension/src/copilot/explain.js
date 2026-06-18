/**
 * Human-readable detection summaries for Veil copilot.
 */
(function (global) {
  function formatCategoryLabel(category) {
    return global.GoldspireVeilCopilotUI?.formatCategoryLabel?.(category)
      || String(category || 'sensitive data').replace(/_/g, ' ');
  }

  function formatDetectionLine(detection) {
    const label = formatCategoryLabel(detection.category);
    const severity = detection.severity ? ` · ${detection.severity}` : '';
    const confidence = Number(detection.confidence) >= 50
      ? ` · ${Math.round(detection.confidence)}% match`
      : '';
    const fw = detection.compliance?.length
      ? detection.compliance
      : (global.GoldspireCompliance?.frameworksFor?.(detection.category) || []);
    const compliance = fw.length ? ` · ${fw.slice(0, 2).join(', ')}` : '';
    return `${label}${severity}${confidence}${compliance}`;
  }

  function buildTriggerLabel(context = {}, alreadyInserted = false) {
    if (context.source === 'ai_prompt' || context.isAiSurface) {
      return 'Before sending to AI';
    }
    if (context.source === 'type' || (alreadyInserted && context.source !== 'paste')) {
      return 'Detected while typing';
    }
    if (context.source === 'selection') {
      return 'Highlighted text';
    }
    return alreadyInserted ? 'Sensitive content in field' : 'Sensitive data pasted';
  }

  function buildExplainSummary(detections = [], { policyMessage = '', recommendedId = '', context = {} } = {}) {
    const lines = [];
    const unique = [];
    for (const d of detections) {
      const line = formatDetectionLine(d);
      if (!unique.includes(line)) unique.push(line);
      if (unique.length >= 3) break;
    }
    lines.push(...unique);
    if (detections.length > 3) {
      lines.push(`+${detections.length - 3} more`);
    }
    if (policyMessage) lines.push(policyMessage);
    const hint = recommendedId
      ? global.GoldspireVeilActionRegistry?.recommendHint?.(recommendedId, context)
      : '';
    if (hint) lines.push(hint);
    return lines;
  }

  global.GoldspireVeilExplain = {
    formatDetectionLine,
    buildTriggerLabel,
    buildExplainSummary,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
