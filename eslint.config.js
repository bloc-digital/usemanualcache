import eslint from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist'] },
  eslint.configs.recommended,
  ...typescriptEslint.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  prettierRecommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'padding-line-between-statements': 'warn',
      'newline-before-return': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-else-return': 'warn',
      'prettier/prettier': 'warn',
      'no-async-promise-executor': 'off',
    },
  },
];
