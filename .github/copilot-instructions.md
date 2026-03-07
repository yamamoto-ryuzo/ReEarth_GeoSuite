# ReEarth GeoSuite Plugin Development Instructions

## Project Overview
This project is a collection of plugins and widgets for Re:Earth, a GIS platform.
- **Source Code**: Located in `geo_suite/src/` (TypeScript).
- **Manifest**: Plugin configuration is in `plugin/reearth.yml`.
- **Output**: Built artifacts go to `dist/` and `release/`.

## Coding Standards
- **Language**: TypeScript. Ensure strict mode compliance as per `tsconfig.json`.
  - **New Files**: Must be strictly typed without `@ts-nocheck`.
  - **Legacy Files**: Existing files may use `@ts-nocheck` or loose typing, but avoid introducing new suppressions.
- **Documentation**: Write all comments, documentation, and commit messages in **Japanese**.
- **Type Safety**: Avoid `any` types where possible.
  - **Re:Earth Global**: If official types are missing, use `any` for the `reearth` global object but define interfaces for plugin-specific data structures.

## Re:Earth Plugin Specifics
- **Global Object**: Interact with the `reearth` global object for plugin functionality.
- **Manifest Sync**: Ensure `plugin/reearth.yml` reflects changes in entry points or widget configurations.
- **File Structure**:
  - `geo_suite/src/*.ts` -> compiled to `*.js` in root or dist.
  - Assets like images go in `image/`.

## Build & Deployment (Vercel)
- **Command**: `npm run build` handles bundling, asset copying, zipping (`release/`), and output for Vercel (`/vercel/output/static`).
- **Configuration**: `vercel.json` manages routing and CORS (essential for external plugin loading).
- **Testing**: Test locally by building and loading the plugin in a local Re:Earth instance.
