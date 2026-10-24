import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'preview/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'object-shorthand': 'error',
    },
  },
  { files: ['tests/**'], languageOptions: { globals: { ...globals.node } } },
];
