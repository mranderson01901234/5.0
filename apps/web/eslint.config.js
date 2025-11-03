import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import vitest from 'eslint-plugin-vitest'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        React: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': ['error', {
        additionalHooks: '(useMemoOne|useAsync|useDebouncedEffect)'
      }],
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/anchor-is-valid': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**'],
    plugins: {
      vitest: vitest,
    },
    languageOptions: {
      globals: {
        ...vitest.environments.globals,
      },
    },
  },
)

