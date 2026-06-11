const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const importPlugin = require('eslint-plugin-import');
const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const reactNative = require('eslint-plugin-react-native');
const unusedImports = require('eslint-plugin-unused-imports');
const tseslint = require('typescript-eslint');

const testGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  jest: 'readonly',
  test: 'readonly',
};

const warnOnlyRules = (rules) =>
  Object.fromEntries(Object.keys(rules).map((ruleName) => [ruleName, 'warn']));

module.exports = tseslint.config(
  {
    ignores: [
      'android/**',
      'coverage/**',
      'dist/**',
      'ios/**',
      'node_modules/**',
      'server/**',
      '.expo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        __DEV__: 'readonly',
        __dirname: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        module: 'readonly',
        process: 'readonly',
        requestAnimationFrame: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        WebSocket: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-native': reactNative,
      'unused-imports': unusedImports,
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      ...warnOnlyRules(reactPlugin.configs.recommended.rules),
      ...warnOnlyRules(reactHooks.configs.recommended.rules),
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
            {
              pattern: 'react-native',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
            },
            {
              pattern: '@components/**',
              group: 'internal',
            },
            {
              pattern: '@screens/**',
              group: 'internal',
            },
            {
              pattern: '@navigation/**',
              group: 'internal',
            },
            {
              pattern: '@theme/**',
              group: 'internal',
            },
            {
              pattern: '@hooks/**',
              group: 'internal',
            },
            {
              pattern: '@utils/**',
              group: 'internal',
            },
            {
              pattern: '@context/**',
              group: 'internal',
            },
            {
              pattern: '@api/**',
              group: 'internal',
            },
            {
              pattern: '@services/**',
              group: 'internal',
            },
            {
              pattern: '@assets/**',
              group: 'internal',
            },
            {
              pattern: '@constants/**',
              group: 'internal',
            },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'no-unused-vars': 'off',
      'no-undef': 'warn',
      'no-empty': 'warn',
      'no-var': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'react/display-name': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-native/no-unused-styles': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: 'expo-haptics',
              message:
                'Use the semantic haptics service once src/services/haptics.ts owns feedback behavior.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/^#(?:[\\da-fA-F]{3}){1,2}$/]',
          message: 'Use a named color token from src/theme instead of a hardcoded hex color.',
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message:
            'Use a named color or overlay token from src/theme instead of a hardcoded rgba color.',
        },
      ],
    },
  },
  {
    files: ['src/theme/**/*.{ts,tsx}', 'src/services/haptics.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Brand/artwork palette data — documented exception to the theme-token rule.
    files: ['src/constants/covers.ts', 'src/utils/avatar.ts', 'src/components/ConfettiOverlay.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'jest.setup.ts'],
    languageOptions: {
      globals: testGlobals,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);
