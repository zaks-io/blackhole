import eslintConfigNext from 'eslint-config-next';
import eslintConfigPrettier from 'eslint-config-prettier';

const eslintConfig = [
  ...eslintConfigNext,
  eslintConfigPrettier,
  {
    ignores: ['.next/', 'node_modules/', 'public/'],
  },
];

export default eslintConfig;
