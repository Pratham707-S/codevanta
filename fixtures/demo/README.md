# RepoGuard Demo Fixture

This small sample repository contains inert text patterns for SEC-001 through SEC-004. The patterns are never executed; the credential-shaped value is synthetic and is redacted in generated report evidence.

From the project root, run `npm run build` followed by `node scripts/generate-demo-reports.mjs`. The generator scans this directory once and writes HTML, Markdown, and JSON reports from the same scan record to `artifacts/demo-reports/`.

The report files use stable names and are replaced on each run. Run identifiers, timestamps, durations, and absolute repository paths reflect the current environment and will vary.