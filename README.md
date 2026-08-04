# Service Pulse

Service Pulse is an interactive customer service performance dashboard covering KPI monitoring, performance analysis, customer issues, AI and automation, process health, and recurring reports.

## Deployment

The repository includes a Render Blueprint (`render.yaml`) for a public static site. It also retains an optional GitHub Pages workflow.

## Key capabilities

- KPI scorecards for CSAT, response time, handling time, resolution rate, SLA attainment, first-contact resolution, and ticket volume
- Interactive trends, comparisons, hover values, filters, and ticket-level drill-downs
- Customer issue and root-cause analysis
- Chatbot and automation performance insights
- Process-health monitoring across Customer Service, Operations, and Payment
- Excel/CSV data import with validation and column mapping
- Weekly and monthly report generation and export

## Run locally

Node.js 22 or newer is required.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify and build

```bash
npm run lint
npm run build
npm run build:pages
node --test tests/foundation.test.mjs
```

The static production build is generated in `dist-pages/` and is compatible with Render. GitHub Pages builds automatically use the repository subpath.
