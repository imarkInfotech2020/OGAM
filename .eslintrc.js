module.exports = {
  root: true,
  extends: '@react-native',
  plugins: [
    'react-native',
    'react',
    'react-hooks',
  ],
  env: {
    jest: true,
    browser: true,
    node: true,
    es6: true,
  },
  rules: {
    // TypeScript
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',

    // Code quality (built-in)
    'no-empty': 'error',
    'no-else-return': 'error',
    'no-console': 'warn',
    'prefer-template': 'error',

    // React hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // React Native
    'react-native/no-unused-styles': 'error',
    'react-native/no-single-element-style-arrays': 'error',
  },
};
