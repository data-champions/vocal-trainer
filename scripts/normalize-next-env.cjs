const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const nextEnvPath = path.join(projectRoot, 'next-env.d.ts');
const canonicalImport = 'import "./.next/types/routes.d.ts";';
const devRoutesPath = path.join(projectRoot, '.next', 'dev', 'types', 'routes.d.ts');
const prodRoutesPath = path.join(projectRoot, '.next', 'types', 'routes.d.ts');

const ensureProdRoutesFile = () => {
  if (fs.existsSync(prodRoutesPath)) {
    return;
  }
  if (!fs.existsSync(devRoutesPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(prodRoutesPath), { recursive: true });
  fs.copyFileSync(devRoutesPath, prodRoutesPath);
};

const normalizeNextEnv = () => {
  if (!fs.existsSync(nextEnvPath)) {
    return;
  }
  const content = fs.readFileSync(nextEnvPath, 'utf8');
  const importRegex =
    /^import\s+["']\.\/\.next\/.*?\/types\/routes\.d\.ts["'];?$/m;
  if (!importRegex.test(content)) {
    return;
  }
  const nextContent = content.replace(importRegex, canonicalImport);
  if (nextContent !== content) {
    fs.writeFileSync(nextEnvPath, nextContent);
  }
};

ensureProdRoutesFile();
normalizeNextEnv();
