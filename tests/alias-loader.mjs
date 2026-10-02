import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !path.extname(specifier)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const candidate = [`${base}.ts`, `${base}.tsx`, `${base}.js`].find((file) => fs.existsSync(file));
    if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
  }
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

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && !url.includes("/node_modules/")) {
    // Node cannot execute TSX. Compile the actual page/components for render tests.
    if (url.endsWith(".tsx")) {
      const result = ts.transpileModule(fs.readFileSync(new URL(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      });
      return { format: "module", shortCircuit: true, source: result.outputText };
    }
    // CSS does not affect server-rendered HTML; browser tests load the real styles.
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "export default {};" };
    }
  }
  return nextLoad(url, context);
}
