import { AuditLogRepository } from "../repositories/auditLogRepository";
import {
  ACCOUNT_TYPES,
  ACTIVE_STATUSES,
  CATEGORY_DIRECTIONS,
  CATEGORY_TYPES,
  MasterDataGovernanceRepository,
  PERSON_ROLES,
  type AccountType,
  type ActiveStatus,
  type CategoryDirection,
  type CategoryType,
  type PersonRole
} from "../repositories/masterDataGovernanceRepository";
import type { Handler } from "../worker/env";

function repo(env: { DB: D1Database }) {
  return new MasterDataGovernanceRepository(env.DB);
}

export function auditRepo(env: { DB: D1Database }) {
  return new AuditLogRepository(env.DB);
}

export const listMasterDataSnapshot: Handler = async ({ env }) => {
  const repository = repo(env);
  const [people, projects, merchants, accounts, currencies, categories] = await Promise.all([
    repository.listPeople(),
    repository.listProjects(),
    repository.listMerchants(),
    repository.listAccounts(),
    repository.listCurrencies(),
    repository.listCategories()
  ]);

  return Response.json({ data: { people, projects, merchants, accounts, currencies, categories } });
};

export const listMasterDataPeople: Handler = async ({ env }) => Response.json({ data: await repo(env).listPeople() });
export const listMasterDataProjects: Handler = async ({ env }) => Response.json({ data: await repo(env).listProjects() });
export const listMasterDataMerchants: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  return Response.json({
    data: await repo(env).listMerchants({ projectId: optionalQuery(url, "projectId") })
  });
};
export const listMasterDataAccounts: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  return Response.json({
    data: await repo(env).listAccounts({
      currencyCode: optionalQuery(url, "currencyCode"),
      accountType: optionalQuery(url, "accountType"),
      ownerPersonId: optionalQuery(url, "ownerPersonId")
    })
  });
};
export const listMasterDataCurrencies: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listCurrencies() });
export const listMasterDataCategories: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listCategories() });

export const masterDataReferenceSummary: Handler = async ({ env }) => {
  const repository = repo(env);
  const [people, projects, merchants, accounts, currencies, categories] = await Promise.all([
    repository.listPeople(),
    repository.listProjects(),
    repository.listMerchants(),
    repository.listAccounts(),
    repository.listCurrencies(),
    repository.listCategories()
  ]);

  return Response.json({
    data: {
      people: people.map((row) => ({ id: row.id, referenceCount: row.referenceCount })),
      projects: projects.map((row) => ({ id: row.id, referenceCount: row.referenceCount })),
      merchants: merchants.map((row) => ({ id: row.id, referenceCount: row.referenceCount })),
      accounts: accounts.map((row) => ({ id: row.id, referenceCount: row.referenceCount })),
      currencies: currencies.map((row) => ({ id: row.code, referenceCount: row.referenceCount })),
      categories: categories.map((row) => ({ id: row.id, referenceCount: row.referenceCount }))
    }
  });
};

export const createMasterDataPerson: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const roles = personRoles(body);
    const person = await repository.createPerson({
      name: requiredText(body, "name"),
      alias: optionalText(body, "alias"),
      roles,
      isEnabled: booleanField(body, "isEnabled", true)
    });
    await auditRepo(env).record({
      actor,
      action: "master_data.person.create",
      entityType: "person",
      entityId: person.id,
      after: person
    });
    return Response.json({ data: person }, { status: 201 });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const updateMasterDataPerson: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const before = await repository.getPerson(id);
    if (!before) throw new Error("person not found");
    const person = await repository.updatePerson(id, {
      name: requiredText(body, "name"),
      alias: optionalText(body, "alias"),
      roles: personRoles(body),
      isEnabled: booleanField(body, "isEnabled", true)
    });
    await auditRepo(env).record({
      actor,
      action: statusAction("person", before.is_enabled, person.is_enabled),
      entityType: "person",
      entityId: person.id,
      before,
      after: person
    });
    return Response.json({ data: person });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const createMasterDataProject: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await projectInput(repository, body);
    const project = await repository.createProject(input);
    await auditRepo(env).record({
      actor,
      action: "master_data.project.create",
      entityType: "project",
      entityId: project.id,
      after: project
    });
    return Response.json({ data: project }, { status: 201 });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const updateMasterDataProject: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const before = await repository.getProject(id);
    if (!before) throw new Error("project not found");
    const input = await projectInput(repository, body, before);
    const project = await repository.updateProject(id, input);
    await auditRepo(env).record({
      actor,
      action: statusAction("project", before.status, project.status),
      entityType: "project",
      entityId: project.id,
      before,
      after: project
    });
    return Response.json({ data: project });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const createMasterDataMerchant: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await merchantInput(repository, body);
    const merchant = await repository.createMerchant(input);
    await auditRepo(env).record({
      actor,
      action: "master_data.merchant.create",
      entityType: "merchant",
      entityId: merchant.id,
      after: merchant
    });
    return Response.json({ data: merchant }, { status: 201 });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const updateMasterDataMerchant: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const existing = await repository.getMerchant(id);
    if (!existing) throw new Error("merchant not found");
    const input = await merchantInput(repository, body, existing);
    const before = await repository.assertMerchantProtectedFieldsUnchanged(id, { projectId: input.projectId });
    const merchant = await repository.updateMerchant(id, input);
    await auditRepo(env).record({
      actor,
      action: statusAction("merchant", before.status, merchant.status),
      entityType: "merchant",
      entityId: merchant.id,
      before,
      after: merchant
    });
    return Response.json({ data: merchant });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const createMasterDataAccount: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await accountInput(repository, body);
    const account = await repository.createAccount(input);
    await auditRepo(env).record({
      actor,
      action: "master_data.account.create",
      entityType: "account",
      entityId: account.id,
      after: account
    });
    return Response.json({ data: account }, { status: 201 });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const updateMasterDataAccount: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const existing = await repository.getAccount(id);
    if (!existing) throw new Error("account not found");
    const input = await accountInput(repository, body, existing);
    const before = await repository.assertAccountProtectedFieldsUnchanged(id, input);
    const account = await repository.updateAccount(id, input, before);
    await auditRepo(env).record({
      actor,
      action: statusAction("account", before.status, account.status),
      entityType: "account",
      entityId: account.id,
      before,
      after: account
    });
    return Response.json({ data: account });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const createMasterDataCurrency: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = currencyInput(body);
    const currency = await repository.createCurrency(input);
    await auditRepo(env).record({
      actor,
      action: "master_data.currency.create",
      entityType: "currency",
      entityId: currency.code,
      after: currency
    });
    return Response.json({ data: currency }, { status: 201 });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const updateMasterDataCurrency: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const code = requiredParam(params, "code");
    const input = currencyInput(body, code);
    const before = await repository.assertCurrencyProtectedFieldsUnchanged(input.code, {
      minorUnits: input.minorUnits
    });
    const currency = await repository.updateCurrency(input.code, input);
    await auditRepo(env).record({
      actor,
      action: statusAction("currency", before.is_enabled, currency.is_enabled),
      entityType: "currency",
      entityId: currency.code,
      before,
      after: currency
    });
    return Response.json({ data: currency });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const createMasterDataCategory: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await categoryInput(repository, body);
    const category = await repository.createCategory(input);
    await auditRepo(env).record({
      actor,
      action: "master_data.category.create",
      entityType: "management_category",
      entityId: category.id,
      after: category
    });
    return Response.json({ data: category }, { status: 201 });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

export const updateMasterDataCategory: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const existing = await repository.getCategory(id);
    if (!existing) throw new Error("category not found");
    const input = await categoryInput(repository, body, id, existing);
    const before = await repository.assertCategoryProtectedFieldsUnchanged(id, input);
    const category = await repository.updateCategory(id, input, before);
    await auditRepo(env).record({
      actor,
      action: statusAction("category", before.is_enabled, category.is_enabled),
      entityType: "management_category",
      entityId: category.id,
      before,
      after: category
    });
    return Response.json({ data: category });
  } catch (error) {
    return badRequest(errorMessage(error));
  }
};

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function optionalQuery(url: URL, key: string) {
  const value = url.searchParams.get(key);
  const trimmed = value?.trim();
  return trimmed || null;
}

function statusAction(entity: string, before: string | number, after: string | number) {
  return before === after ? `master_data.${entity}.update` : `master_data.${entity}.status`;
}

function requiredParam(params: Record<string, string>, key: string) {
  const value = params[key];
  if (!value?.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function requiredText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function booleanField(body: Record<string, unknown>, key: string, fallback: boolean) {
  const value = body[key];
  return typeof value === "boolean" ? value : fallback;
}

function integerField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`);
  return parsed;
}

function personRoles(body: Record<string, unknown>) {
  const roles = Array.isArray(body.roles)
    ? body.roles.filter((role): role is PersonRole => PERSON_ROLES.includes(role as PersonRole))
    : [];
  if (roles.length === 0) throw new Error("roles must include at least one valid role");
  return roles;
}

function activeStatus(body: Record<string, unknown>) {
  const value = requiredText(body, "status");
  if (!ACTIVE_STATUSES.includes(value as ActiveStatus)) throw new Error("status must be active or archived");
  return value as ActiveStatus;
}

function optionalActiveStatus(body: Record<string, unknown>) {
  const value = optionalText(body, "status") ?? "active";
  if (!ACTIVE_STATUSES.includes(value as ActiveStatus)) throw new Error("status must be active or archived");
  return value as ActiveStatus;
}

function accountType(body: Record<string, unknown>) {
  const value = requiredText(body, "accountType");
  if (!ACCOUNT_TYPES.includes(value as AccountType)) throw new Error("accountType is invalid");
  return value as AccountType;
}

function categoryType(body: Record<string, unknown>) {
  const value = requiredText(body, "categoryType");
  if (!CATEGORY_TYPES.includes(value as CategoryType)) throw new Error("categoryType is invalid");
  return value as CategoryType;
}

function categoryDirection(body: Record<string, unknown>) {
  const value = requiredText(body, "direction");
  if (!CATEGORY_DIRECTIONS.includes(value as CategoryDirection)) throw new Error("direction is invalid");
  return value as CategoryDirection;
}

async function projectInput(
  repository: MasterDataGovernanceRepository,
  body: Record<string, unknown>,
  existing?: { owner_person_id: string | null }
) {
  const ownerPersonId = optionalText(body, "ownerPersonId");
  if (ownerPersonId && ownerPersonId !== (existing?.owner_person_id ?? null)) {
    await repository.requireEnabledPerson(ownerPersonId, "ownerPersonId");
  }
  return {
    code: normalizeCode(requiredText(body, "code")),
    name: requiredText(body, "name"),
    ownerPersonId,
    status: optionalActiveStatus(body),
    note: optionalText(body, "note")
  };
}

async function merchantInput(
  repository: MasterDataGovernanceRepository,
  body: Record<string, unknown>,
  existing?: { project_id: string; owner_person_id: string | null }
) {
  const projectId = requiredText(body, "projectId");
  if (projectId !== existing?.project_id) {
    const project = await repository.getProjectStatus(projectId);
    if (project?.status !== "active") throw new Error("projectId must reference an active project");
  }
  const ownerPersonId = optionalText(body, "ownerPersonId");
  if (ownerPersonId && ownerPersonId !== (existing?.owner_person_id ?? null)) {
    await repository.requireEnabledPerson(ownerPersonId, "ownerPersonId");
  }
  return {
    code: normalizeCode(requiredText(body, "code")),
    name: requiredText(body, "name"),
    projectId,
    merchantType: optionalText(body, "merchantType"),
    launchDate: optionalText(body, "launchDate"),
    status: optionalActiveStatus(body),
    ownerPersonId,
    note: optionalText(body, "note")
  };
}

async function accountInput(
  repository: MasterDataGovernanceRepository,
  body: Record<string, unknown>,
  existing?: { currency_code: string; owner_person_id: string | null }
) {
  const nextAccountType = accountType(body);
  const requestedCurrencyCode = requiredText(body, "currencyCode").trim().toUpperCase();
  const currencyCode =
    requestedCurrencyCode === existing?.currency_code
      ? requestedCurrencyCode
      : await repository.requireEnabledCurrency(requestedCurrencyCode);
  const ownerPersonId = optionalText(body, "ownerPersonId");
  if (ownerPersonId && ownerPersonId !== (existing?.owner_person_id ?? null)) {
    await repository.requireEnabledPerson(ownerPersonId, "ownerPersonId");
  }
  const isCompanyAccount = booleanField(body, "isCompanyAccount", false);
  const allowNegative = booleanField(body, "allowNegative", false);
  if (nextAccountType === "petty_cash" && !ownerPersonId) throw new Error("petty cash account requires ownerPersonId");
  if (nextAccountType === "petty_cash" && isCompanyAccount) {
    throw new Error("petty cash account cannot be company account");
  }
  if (nextAccountType === "petty_cash" && !allowNegative) {
    throw new Error("petty cash account must allow negative balance");
  }
  if (isCompanyAccount && ownerPersonId) throw new Error("company account cannot have ownerPersonId");
  return {
    name: requiredText(body, "name"),
    accountType: nextAccountType,
    currencyCode,
    ownerPersonId,
    isCompanyAccount,
    allowNegative,
    status: activeStatus(body)
  };
}

function currencyInput(body: Record<string, unknown>, codeFromRoute?: string) {
  const code = normalizeCode(codeFromRoute ?? requiredText(body, "code"));
  const minorUnits = integerField(body, "minorUnits");
  if (minorUnits < 0 || minorUnits > 6) throw new Error("minorUnits must be between 0 and 6");
  const isEnabled = booleanField(body, "isEnabled", true);
  if (code === "USDT" && !isEnabled) throw new Error("USDT cannot be disabled");
  return {
    code,
    name: requiredText(body, "name"),
    minorUnits,
    isEnabled
  };
}

async function categoryInput(
  repository: MasterDataGovernanceRepository,
  body: Record<string, unknown>,
  currentId?: string,
  existing?: { parent_id: string | null }
) {
  const parentId = optionalText(body, "parentId");
  if (parentId && currentId && parentId === currentId) throw new Error("parentId cannot equal category id");
  if (parentId && parentId !== (existing?.parent_id ?? null)) await repository.requireEnabledCategory(parentId);
  if (currentId) await repository.assertCategoryParentDoesNotCreateCycle(currentId, parentId);
  return {
    name: requiredText(body, "name"),
    parentId,
    categoryType: categoryType(body),
    direction: categoryDirection(body),
    affectsExpenseReport: booleanField(body, "affectsExpenseReport", false),
    affectsProjectReport: booleanField(body, "affectsProjectReport", false),
    requiresMerchant: booleanField(body, "requiresMerchant", false),
    requiresPerson: booleanField(body, "requiresPerson", false),
    requiresBorrower: booleanField(body, "requiresBorrower", false),
    isEnabled: booleanField(body, "isEnabled", true)
  };
}
