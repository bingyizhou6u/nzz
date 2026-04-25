import { getJson, type ApiEnvelope } from "../api";
import type { Capability, PersonRole, SessionPerson } from "./sessionTypes";

interface RawSessionPerson {
  id: string;
  name: string;
  alias: string | null;
  loginEmail?: string;
  login_email?: string;
  roles: PersonRole[];
}

interface MeResponse {
  person: RawSessionPerson;
  capabilities: Capability[];
}

function normalizePerson(person: RawSessionPerson): SessionPerson {
  return {
    id: person.id,
    name: person.name,
    alias: person.alias,
    loginEmail: person.loginEmail ?? person.login_email ?? "",
    roles: person.roles
  };
}

export async function getSession() {
  const response = await getJson<ApiEnvelope<MeResponse>>("/api/me");

  return {
    person: normalizePerson(response.data.person),
    capabilities: response.data.capabilities
  };
}
