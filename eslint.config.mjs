import eslintConfigNext from 'eslint-config-next';
import eslintConfigPrettier from 'eslint-config-prettier';

const eslintConfig = [
  ...eslintConfigNext,
  eslintConfigPrettier,
  {
    ignores: [
      '.agents/skills/ziw-*/**',
      '.claude/skills/ziw-*/**',
      '.next/',
      'node_modules/',
      'public/',
      'bench/dist/',
      'bench/results/',
    ],
  },
];

export default eslintConfig;
