import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['.output/', '.wxt/', '.claude/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore marks an argument kept for its position
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Components and hooks render and wire; they do not parse GraphQL.
    files: ['src/components/**', 'src/hooks/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'graphql',
              message:
                'GraphQL document logic lives in src/utils/queryDocument.ts. Ask that module instead of parsing here.',
            },
          ],
        },
      ],
    },
  },
  {
    // The interceptor patches fetch and XMLHttpRequest on the page's own
    // globals, which have no type for the fields it adds to them.
    files: ['src/entrypoints/interceptor.content.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
