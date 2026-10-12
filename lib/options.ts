export interface ExportOptions {
  /** Hidden reasoning ("thinking"), as a collapsed block. */
  includeThinking: boolean;
  /** Tool calls and their results (web search, code runs, MCP), as collapsed blocks. */
  includeToolCalls: boolean;
  /** Text content of uploaded files, when the site provides it. */
  includeAttachments: boolean;
  /** Title line with source, date and link at the top of the export. */
  includeMetadata: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = {
  includeThinking: false,
  includeToolCalls: false,
  includeAttachments: false,
  includeMetadata: true,
};

export const OPTION_LABELS: Record<keyof ExportOptions, { label: string; hint: string }> = {
  includeThinking: { label: 'Thinking', hint: 'Reasoning steps, collapsed' },
  includeToolCalls: { label: 'Tool calls', hint: 'Searches, code runs and results' },
  includeAttachments: { label: 'File contents', hint: 'Text of uploaded files' },
  includeMetadata: { label: 'Title and link', hint: 'Header with source and date' },
};
