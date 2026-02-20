import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Resolve the path to a native binary.
 * Search order:
 * 1. DG_ELECTRON_BINARY_DIR environment variable
 * 2. Electron packaged app (process.resourcesPath)
 * 3. Development (relative to this package's bin/ directory)
 */
export function resolveBinaryPath(binaryName: string): string {
  // 1. Environment variable override
  const envDir = process.env.DG_ELECTRON_BINARY_DIR;
  if (envDir) {
    const envPath = join(envDir, binaryName);
    if (existsSync(envPath)) return envPath;
  }

  // 2. Packaged Electron app - binaries in extraResources
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath;
  if (resourcesPath) {
    const packagedPath = join(resourcesPath, "bin", binaryName);
    if (existsSync(packagedPath)) return packagedPath;
  }

  // 3. Development - relative to package root
  // This file is at dist/util/binary.js, so go up to package root
  const packageRoot = join(dirname(__dirname), "..");
  const devPath = join(packageRoot, "bin", binaryName);
  if (existsSync(devPath)) return devPath;

  // 4. Also check from the source location (src/util/)
  const srcPath = join(__dirname, "..", "..", "bin", binaryName);
  if (existsSync(srcPath)) return srcPath;

  throw new Error(
    `Native binary "${binaryName}" not found. ` +
      `Searched: ${[envDir, resourcesPath, packageRoot]
        .filter(Boolean)
        .join(", ")}. ` +
      `Set DG_ELECTRON_BINARY_DIR to override.`
  );
}
