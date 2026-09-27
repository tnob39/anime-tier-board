import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("next/")) {
    const nextSubpath = specifier.slice("next/".length);
    const nextModule = path.resolve(
      projectRoot,
      "node_modules/next",
      `${nextSubpath}.js`
    );
    if (fs.existsSync(nextModule)) {
      return nextResolve(pathToFileURL(nextModule).href, context);
    }
  }

  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const relativePath = specifier.slice(2);
  const candidates = [
    path.resolve(projectRoot, relativePath),
    path.resolve(projectRoot, `${relativePath}.ts`),
    path.resolve(projectRoot, `${relativePath}.tsx`),
    path.resolve(projectRoot, `${relativePath}.js`),
  ];
  const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolvedPath) {
    throw new Error(`Cannot resolve project alias ${specifier}`);
  }
  return nextResolve(pathToFileURL(resolvedPath).href, context);
}
