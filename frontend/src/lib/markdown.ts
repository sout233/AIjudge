/**
 * 检测内容是否为 Markdown 格式
 */
export function isMarkdownContent(content: string): boolean {
  if (!content) return false;
  // 简单检测：如果内容包含 Markdown 特征且不包含 HTML 标签
  const hasMarkdownFeatures = /(^#|^\*|^- |\[.*\]\(.*\)|`{3}|`|\*\*|__)/.test(content);
  const hasHtmlTags = /<[^>]+>/g.test(content);
  return hasMarkdownFeatures && !hasHtmlTags;
}
