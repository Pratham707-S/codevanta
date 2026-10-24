/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/report-builder.ts
 * Owner: Ayan
 * Purpose: Unified report builder: coordinates multi-format reporting and file generation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ScanRunRecord, RunSummaryItem } from '../storage/run-store.js';
import { formatMarkdownReport, MarkdownReportOptions } from './markdown-report.js';
import { formatJsonReport, JsonReportOptions } from './json-report.js';
import { formatHtmlReport, HtmlReportOptions } from './html-report.js';
import { TimelineEvent, formatEvidenceTimelineMarkdown } from './evidence-timeline.js';
import { ScanComparison } from './scan-comparison.js';

export interface ReportBuilderOptions {
  markdownOptions?: MarkdownReportOptions;
  jsonOptions?: JsonReportOptions;
  htmlOptions?: HtmlReportOptions;
  outputDir?: string;
  history?: RunSummaryItem[];
  previousRecord?: ScanRunRecord | null;
  comparison?: ScanComparison | null;
}

export interface GeneratedReports {
  markdown: string;
  json: string;
  html: string;
}

export interface SavedReportPaths {
  markdownPath?: string;
  jsonPath?: string;
  htmlPath?: string;
}

export class ReportBuilder {
  private record: ScanRunRecord;
  private timelineEvents: TimelineEvent[] = [];
  private options: ReportBuilderOptions;

  private history?: RunSummaryItem[];
  private previousRecord?: ScanRunRecord;
  private comparison?: ScanComparison;

  constructor(record: ScanRunRecord, options: ReportBuilderOptions = {}) {
    this.record = record;
    this.options = options;
    this.history = options.history;
    if (options.previousRecord) {
      this.previousRecord = options.previousRecord;
    }
    if (options.comparison) {
      this.comparison = options.comparison;
    }
  }

  /**
   * Sets scan history items to include in HTML reporting.
   */
  public withHistory(history: RunSummaryItem[]): this {
    this.history = history;
    return this;
  }

  /**
   * Sets previous scan run record for differential timeline comparison.
   */
  public withPreviousRun(previous: ScanRunRecord | null): this {
    if (previous) {
      this.previousRecord = previous;
    }
    return this;
  }

  /**
   * Directly sets precomputed scan comparison.
   */
  public withComparison(comparison: ScanComparison | null): this {
    if (comparison) {
      this.comparison = comparison;
    }
    return this;
  }

  /**
   * Appends timeline events to the audit report and embeds them into the record if needed.
   */
  public addTimelineEvent(event: TimelineEvent): this {
    this.timelineEvents.push(event);
    return this;
  }

  /**
   * Helper to get a record enriched with accumulated timeline events.
   */
  private getEnrichedRecord(): ScanRunRecord & { timeline?: TimelineEvent[] } {
    const events = this.timelineEvents.length > 0
      ? this.timelineEvents
      : (this.record.timeline as TimelineEvent[] | undefined);
    return {
      ...this.record,
      timeline: events,
    };
  }

  /**
   * Builds the Markdown formatted report.
   */
  public buildMarkdown(): string {
    const allEvents = this.timelineEvents.length > 0
      ? this.timelineEvents
      : (this.record.timeline as TimelineEvent[] | undefined);

    // If record already had timeline, strip it for initial formatting so we can place it deterministically
    const cleanRecord = { ...this.record, timeline: undefined };
    let md = formatMarkdownReport(cleanRecord, this.options.markdownOptions);

    if (allEvents && allEvents.length > 0) {
      const timelineSection = formatEvidenceTimelineMarkdown(allEvents);
      // Robustly target the final thematic break right before the footer
      const lastSeparatorIndex = md.lastIndexOf('---');
      if (lastSeparatorIndex !== -1) {
        md = 
          md.slice(0, lastSeparatorIndex) + 
          `${timelineSection}\n\n` + 
          md.slice(lastSeparatorIndex);
      } else {
        md += `\n\n${timelineSection}`;
      }
    }
    return md;
  }

  /**
   * Builds the JSON formatted report (including timeline events if present).
   */
  public buildJson(): string {
    const enriched = this.getEnrichedRecord();
    return formatJsonReport(enriched, this.options.jsonOptions);
  }

  /**
   * Builds the HTML formatted report with optional scan history and differential comparison.
   */
  public buildHtml(): string {
    const htmlOpts: HtmlReportOptions = {
      ...this.options.htmlOptions,
      history: this.history ?? this.options.history ?? this.options.htmlOptions?.history,
      previousRecord: this.previousRecord ?? this.options.previousRecord ?? this.options.htmlOptions?.previousRecord,
      comparison: this.comparison ?? this.options.comparison ?? this.options.htmlOptions?.comparison,
    };
    return formatHtmlReport(this.getEnrichedRecord(), htmlOpts);
  }

  /**
   * Generates all supported report formats in memory.
   */
  public generateAll(): GeneratedReports {
    return {
      markdown: this.buildMarkdown(),
      json: this.buildJson(),
      html: this.buildHtml(),
    };
  }

  /**
   * Writes the generated reports to an output directory safely.
   */
  public async saveReports(
    targetDir?: string,
    formats: ('markdown' | 'json' | 'html')[] = ['markdown', 'json', 'html']
  ): Promise<SavedReportPaths> {
    const dir = targetDir || this.options.outputDir || path.join(process.cwd(), '.repoguard', 'reports');
    await fs.mkdir(dir, { recursive: true });

    const rawRunId = this.record.runId || 'scan-run';
    const safeRunId = String(rawRunId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const result: SavedReportPaths = {};

    if (formats.includes('markdown')) {
      const mdPath = path.join(dir, `report-${safeRunId}.md`);
      await fs.writeFile(mdPath, this.buildMarkdown(), 'utf-8');
      result.markdownPath = mdPath;
    }

    if (formats.includes('json')) {
      const jsonPath = path.join(dir, `report-${safeRunId}.json`);
      await fs.writeFile(jsonPath, this.buildJson(), 'utf-8');
      result.jsonPath = jsonPath;
    }

    if (formats.includes('html')) {
      const htmlPath = path.join(dir, `report-${safeRunId}.html`);
      await fs.writeFile(htmlPath, this.buildHtml(), 'utf-8');
      result.htmlPath = htmlPath;
    }

    return result;
  }
}
