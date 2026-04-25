import { capabilitiesForRoles } from "../auth/permissions";
import type { Handler } from "../worker/env";

export const getMe: Handler = async ({ actor }) => {
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    data: {
      person: {
        id: actor.personId,
        name: actor.name,
        alias: actor.alias,
        loginEmail: actor.email,
        roles: actor.roles
      },
      capabilities: capabilitiesForRoles(actor.roles)
    }
  });
};
