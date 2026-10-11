import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'data', 'test-data'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // text sanitizers deliberately match control / non-breaking-space characters
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];