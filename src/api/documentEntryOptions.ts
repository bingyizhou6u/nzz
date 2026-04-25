import type { DocumentType } from "../domain/types";
import { DocumentRepository } from "../repositories/documentRepository";
import { MasterDataRepository } from "../repositories/masterDataRepository";
import type { Handler } from "../worker/env";

const documentTypes = new Set<DocumentType>([
  "project_income",
  "exchange",
  "account_transfer",
  "petty_cash_issue",
  "petty_cash_return",
  "petty_cash_reimbursement",
  "loan_out",
  "loan_repayment",
  "loan_writeoff",
  "manual_adjustment"
]);

function optionalDocumentType(value: string | null): DocumentType | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return documentTypes.has(trimmed as DocumentType) ? (trimmed as DocumentType) : null;
}

export const listDocumentEntryOptions: Handler = async ({ env }) => {
  const repo = new MasterDataRepository(env.DB);
  const [people, projects, merchants, accounts, currencies, categories] = await Promise.all([
    repo.listPeopleOptions(),
    repo.listProjectOptions(),
    repo.listMerchantOptions(),
    repo.listAccountOptions(),
    repo.listCurrencyOptions(),
    repo.listCategoryOptions()
  ]);

  return Response.json({ data: { people, projects, merchants, accounts, currencies, categories } });
};

export const listOriginalDocuments: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const documentType = optionalDocumentType(url.searchParams.get("documentType"));
  const repo = new DocumentRepository(env.DB);

  return Response.json({ data: await repo.listOriginalDocumentOptions({ documentType }) });
};
