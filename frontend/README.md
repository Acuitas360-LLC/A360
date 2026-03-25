# Frontend Chat UI Template

This repository is prepared as a **frontend-first chat UI template** using Next.js, Tailwind, and reusable UI components.

## What this template includes

- Chat layout and message UI
- Theme support (light/dark)
- Frontend analytics response card (52-week insight view)
- Frontend-only loading behavior for product-like response timing

## What was removed for template cleanup

- E2E testing setup and Playwright files
- Deployment-specific root config files
- Instrumentation/proxy scaffold files not required for local frontend UI work

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## Build check

```bash
npm run build
```

## Using this in your real product

- Keep this repo as your UI shell
- Replace the current frontend demo message paths with your real API integration
- Reconnect auth/data providers only where needed for your production backend
