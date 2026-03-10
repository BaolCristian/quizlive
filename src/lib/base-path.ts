/** Base path prefix for all static assets and API calls. Reads from next.config.ts basePath. */
export const BASE_PATH = process.env.__NEXT_ROUTER_BASEPATH || "/savint";

/** Prepend basePath to an absolute path (e.g. "/logo.png" → "/savint/logo.png") */
export function withBasePath(path: string): string {
  if (path.startsWith(BASE_PATH)) return path;
  return `${BASE_PATH}${path}`;
}
