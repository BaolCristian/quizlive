/**
 * Client minimale dell'Admin SDK Directory API per elencare i gruppi Google
 * di cui un utente è membro diretto. Autenticazione: service account con
 * delega a livello di dominio che impersona un account "Lettore gruppi".
 */
import { JWT } from "google-auth-library";
import { getStudentGateConfig } from "@/lib/config/student-gate";

const SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly";
const DIRECTORY_GROUPS_URL = "https://admin.googleapis.com/admin/directory/v1/groups";
const DEFAULT_TIMEOUT_MS = 5000;

export class GroupCheckError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GroupCheckError";
    this.cause = cause;
  }
}

export interface GoogleGroup {
  email: string;
  name: string;
}

export interface ListUserGroupsOptions {
  fetchImpl?: typeof fetch;
  tokenProvider?: () => Promise<string>;
  timeoutMs?: number;
}

let jwtClient: JWT | null = null;

/** Access token del service account (impersonando l'admin). Memoizza il client. */
async function defaultTokenProvider(): Promise<string> {
  const cfg = getStudentGateConfig();
  if (!cfg) throw new Error("Cancello studenti non attivo");
  if (!jwtClient) {
    jwtClient = new JWT({ keyFile: cfg.serviceAccountKeyFile, scopes: [SCOPE], subject: cfg.adminImpersonate });
  }
  const { token } = await jwtClient.getAccessToken();
  if (!token) throw new Error("Nessun access token ottenuto dal service account");
  return token;
}

interface GroupsPage {
  groups?: Array<{ email?: string; name?: string }>;
  nextPageToken?: string;
}

export async function listUserGroups(userEmail: string, opts: ListUserGroupsOptions = {}): Promise<GoogleGroup[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenProvider = opts.tokenProvider ?? defaultTokenProvider;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let token: string;
  try {
    token = await tokenProvider();
  } catch (e) {
    throw new GroupCheckError("Impossibile ottenere il token del service account Google", e);
  }

  const result: GoogleGroup[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(DIRECTORY_GROUPS_URL);
    url.searchParams.set("userKey", userEmail);
    url.searchParams.set("maxResults", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let page: GroupsPage;
    try {
      const res = await fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new GroupCheckError(`Admin SDK ha risposto ${res.status}: ${text.slice(0, 200)}`);
      }
      page = (await res.json()) as GroupsPage;
    } catch (e) {
      if (e instanceof GroupCheckError) throw e;
      throw new GroupCheckError("Chiamata all'Admin SDK fallita", e);
    } finally {
      clearTimeout(timer);
    }

    for (const g of page.groups ?? []) {
      if (g.email) result.push({ email: g.email.toLowerCase(), name: g.name ?? "" });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return result;
}
