# Signal Chicago dashboard

The public interface for the Signal Chicago CTA Reliability Observatory.

## Local development

```bash
pnpm install
pnpm dev
```

The current interface uses a verified development snapshot. The production
milestone will replace embedded values with the read-only observatory API and
show data freshness on every screen.

## Product principles

- Explain the source and limitation beside every reliability metric.
- Never present scheduled data as a live prediction.
- Never describe a single snapshot as a long-term trend.
- Prefer graphics that clarify a transit behavior over decorative animation.
- Support keyboard navigation, mobile screens, and reduced motion.

