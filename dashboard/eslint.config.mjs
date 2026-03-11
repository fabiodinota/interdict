import nextConfig from "eslint-config-next";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...nextConfig,
];

export default eslintConfig;
