import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'lib/**',
      'storybook-static/**',
      'src/routeTree.gen.ts',
      '.nitro/**',
      '.output/**',
      '.tanstack/**',
      'test-server/**',
      'coverage/**',
      'bookmarklet/**',
      'browser-extension/**',
      'extension2/**',
      'public/**/*.js',
      '*.js',
      '*.cjs',
      'scripts/**',
    ],
  }
)
