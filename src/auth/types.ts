export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";

export interface AuthenticatedIdentity {
  email: string;
  accessSubject: string | null;
  accessIssuer: string;
  accessAudience: string[];
}

export interface AuthenticatedActor {
  personId: string;
  name: string;
  alias: string | null;
  email: string;
  roles: PersonRole[];
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}
