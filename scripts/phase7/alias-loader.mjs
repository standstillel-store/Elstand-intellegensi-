// Dev-only helper for scripts/phase7/*. NOT part of the app build/runtime.
// Maps the repo's tsconfig "@/*" -> "./*" alias for plain `node` execution,
// since Next's bundler normally does this mapping and a standalone script
// has no bundler. Does not touch any production file.
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "../../");

async function tryExtensions(basePath, context, nextResolve) {
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}/index.ts`];
  for (const candidate of candidates) {
    try {
      return await nextResolve(pathToFileURL(candidate).href, context);
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, specifier.slice(2));
    const result = await tryExtensions(base, context, nextResolve);
    if (result) return result;
    throw new Error(`alias-loader: could not resolve "${specifier}" under ${ROOT}`);
  }

  if (specifier.startsWith(".") && context.parentURL) {
    const parentDir = path.dirname(new URL(context.parentURL).pathname);
    const base = path.join(parentDir, specifier);
    const result = await tryExtensions(base, context, nextResolve);
    if (result) return result;
  }

  return nextResolve(specifier, context);
}
