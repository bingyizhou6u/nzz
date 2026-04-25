import { AuthError, type AuthenticatedActor, type PersonRole } from "./types";

export const capabilities = [
  "session.view",
  "documents.view",
  "documents.create",
  "documents.submit",
  "documents.approve",
  "documents.reject",
  "documents.previewApproval",
  "masterData.view",
  "masterData.write",
  "masterData.managePeopleRoles",
  "reports.view",
  "periodLocks.view",
  "periodLocks.lock",
  "periodLocks.unlock"
] as const;

export type Capability = (typeof capabilities)[number];

const roleCapabilities: Record<PersonRole, Capability[]> = {
  admin: [...capabilities],
  finance_manager: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "documents.approve",
    "documents.reject",
    "documents.previewApproval",
    "masterData.view",
    "masterData.write",
    "reports.view",
    "periodLocks.view",
    "periodLocks.lock"
  ],
  finance_entry: ["session.view", "documents.view", "documents.create", "documents.submit", "masterData.view", "reports.view"],
  logistics: ["session.view", "documents.view", "documents.create", "documents.submit", "reports.view"],
  readonly: ["session.view", "documents.view", "masterData.view", "reports.view"],
  borrower: ["session.view"]
};

export function capabilitiesForRoles(roles: PersonRole[]): Capability[] {
  return [...new Set(roles.flatMap((role) => roleCapabilities[role] ?? []))];
}

export function can(actor: AuthenticatedActor, capability: Capability): boolean {
  return capabilitiesForRoles(actor.roles).includes(capability);
}

export function assertCan(actor: AuthenticatedActor, capability: Capability): void {
  if (!can(actor, capability)) throw new AuthError(403, "权限不足");
}
