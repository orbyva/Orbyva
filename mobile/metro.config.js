const { getDefaultConfig } = require("expo/metro-config");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Pasta `mobile/` vive dentro do Vite. Sem isto o Metro sobe até a raiz, lê o
// `@/*` do web (`./src/*`) e não acha `mobile/src/lib/auth-user.ts`.
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

const sourceExts = ["", ".ts", ".tsx", ".js", ".jsx", ".json"];

function existingFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of sourceExts) {
    if (!ext) continue;
    const withExt = base + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) return withExt;
    const indexFile = path.join(base, `index${ext}`);
    if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
      return indexFile;
    }
  }
  return null;
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/")) {
    const rest = moduleName.slice(2);
    const mapped = rest.startsWith("assets/")
      ? path.join(projectRoot, rest)
      : path.join(projectRoot, "src", rest);
    const filePath = existingFile(mapped);
    if (filePath) {
      return { type: "sourceFile", filePath };
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
