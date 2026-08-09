# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Expo Router organization

- Keep the complete file-based route tree in `src/app`, including route files, nested route folders, route groups such as `(authenticated)` or `(tabs)`, and `_layout.tsx` files. Do not define or move routes into `src/screens`, `src/features`, or another directory.
- Organize route folders around user and navigation flows. Use route groups to express boundaries such as authenticated, unauthenticated, and tab-based flows without adding those group names to URLs.
- Keep route files thin: they should declare routing, layouts, redirects, and compose or import the screen UI. Put reusable components, hooks, state, services, utilities, and other non-route code outside `src/app`.
- Treat `src/app` as route-only because Expo Router interprets files inside it as pages. Each page must have a default export; `_layout.tsx` files are the routing-layout exception.
- Follow Expo Router's core concepts: https://docs.expo.dev/router/basics/core-concepts/
- Use this scalable folder-structure guidance where it does not conflict with Expo's official documentation or the rules above: https://dev.to/sachinrupani/designing-a-scalable-react-native-expo-router-folder-structure-3dnj

## Agent skills

### Issue tracker

Issues and specs live as local Markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
