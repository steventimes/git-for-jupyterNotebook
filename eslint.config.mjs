import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['out/**', 'types/**', 'node_modules/**', '.tmp/**'] },
  ...tseslint.configs.recommended,
  { files: ['scripts/**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
