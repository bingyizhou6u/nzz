export type Capability =
  | "session.view"
  | "documents.view"
  | "documents.create"
  | "documents.submit"
  | "documents.approve"
  | "documents.reject"
  | "documents.previewApproval"
  | "masterData.view"
  | "masterData.write"
  | "masterData.managePeopleRoles"
  | "reports.view"
  | "periodLocks.view"
  | "periodLocks.lock"
  | "periodLocks.unlock";

export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";

export interface SessionPerson {
  id: string;
  name: string;
  alias: string | null;
  loginEmail: string;
  roles: PersonRole[];
}

export type SessionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "authenticated"; person: SessionPerson; capabilities: Capability[] };

export type PageKey = "documents" | "review" | "reports" | "master-data" | "period-locks";

export interface NavigationItem {
  key: PageKey;
  label: string;
  capability: Capability;
}

export function hasCapability(capabilities: readonly Capability[], capability: Capability): boolean {
  return capabilities.includes(capability);
}
