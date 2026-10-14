# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## MongoDB-backed development

Life OS keeps the Vite + React frontend and runs a local Express API beside it. It opens directly to the dashboard with no sign-in flow. Records are stored in MongoDB Atlas in the `workspace`, `fitness`, `nutrition`, and `think_space` collections under one local Life OS workspace.

1. In MongoDB Atlas, create a cluster, a database user, and allow your development machine's IP address in Network Access.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` and `MONGODB_DB_NAME`. Keep `.env` private; it is ignored by Git.
3. Install packages with `npm install`.
4. Run `npm run dev`. The frontend and API start together; Ctrl+C stops both. Open the Vite URL printed by Vite.
5. Check `GET /api/health` through the Vite origin. It reports `database: "connected"` when MongoDB is ready.

On first load, an idempotent migration merges existing local records by stable ID (or date for meal review logs), verifies collection counts, and leaves localStorage untouched. Subsequent reads use MongoDB; localStorage remains a browser backup. When the database is unavailable, the interface displays a warning and keeps mutations in the local backup.

The current app has no profile preferences, application tracking, academic deadlines, or independent goals/progress-review models; this integration does not invent collections for those placeholder features. Progress views derived from workout data use the persisted workout records.

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
