/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/report-builder.ts
 * Owner: Ayan
 * Purpose: Unified report builder: coordinates multi-format reporting and file generation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ScanRunRecord } from '../storage/run-store.js';
import { formatMarkdownReport, MarkdownReportOptions } from './markdown-report.js';
import { formatJsonReport, JsonReportOptions } from './json-report.js';
import { formatHtmlReport, HtmlReportOptions } from './html-report.js';
import { TimelineEvent, formatEvidenceTimelineMarkdown } from './evidence-timeline.js';

export interface ReportBuilderOptions {
  markdownOptions?: MarkdownReportOptions;
  jsonOptions?: JsonReportOptions;
  htmlOptions?: HtmlReportOptions;
  outputDir?: string;
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

  constructor(record: ScanRunRecord, options: ReportBuilderOptions = {}) {
    this.record = record;
    this.options = options;
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
    return {
      ...this.record,
      timeline: this.timelineEvents.length > 0 ? this.timelineEvents : (this.record as ScanRunRecord & { timeline?: TimelineEvent[] }).timeline,
    };
  }

  /**
   * Builds the Markdown formatted report.
   */
  public buildMarkdown(): string {
    let md = formatMarkdownReport(this.record, this.options.markdownOptions);
    if (this.timelineEvents.length > 0) {
      const timelineSection = formatEvidenceTimelineMarkdown(this.timelineEvents);
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
   * Builds the HTML formatted report.
   */
  public buildHtml(): string {
    // You can also pass enriched record or timeline options to HTML if supported
    return formatHtmlReport(this.getEnrichedRecord(), this.options.htmlOptions);
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

    // FIXED: Safe runId coercion to prevent crashes if runId is missing
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