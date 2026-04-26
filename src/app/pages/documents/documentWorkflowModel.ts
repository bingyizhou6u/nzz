import type { ActionType, DocumentType } from "../../../domain/types";
import { documentFieldLabel, getVisibleFieldKeys } from "./documentEntryModel";
import type { DocumentEntryForm, DocumentFieldKey } from "./documentEntryTypes";

export type DocumentWorkflowGroupId = "income" | "funds" | "petty_cash" | "loan" | "correction";
export type DocumentWorkflowStepId = "type" | "details" | "review";
export type DocumentWorkflowStepStatus = "complete" | "current" | "blocked";

export interface DocumentScenarioCard {
  id: DocumentWorkflowGroupId;
  title: string;
  description: string;
  requiredHint: string;
  primaryDocumentType: DocumentType;
  documentTypes: DocumentType[];
}

export interface DocumentWorkflowStepState {
  id: DocumentWorkflowStepId;
  title: string;
  status: DocumentWorkflowStepStatus;
  canProceed: boolean;
  summary: string;
  missingFields: DocumentFieldKey[];
  missingFieldLabels: string[];
  validationErrors: string[];
}

const documentTypeLabels: Record<DocumentType, string> = {
  project_income: "项目收入",
  exchange: "换汇",
  account_transfer: "账户划转",
  petty_cash_issue: "备用金发放",
  petty_cash_return: "备用金退回",
  petty_cash_reimbursement: "备用金报销",
  loan_out: "借出",
  loan_repayment: "还款",
  loan_writeoff: "核销",
  manual_adjustment: "手工调整"
};

const documentTypesByGroup: Record<DocumentWorkflowGroupId, DocumentType[]> = {
  income: ["project_income"],
  funds: ["exchange", "account_transfer"],
  petty_cash: ["petty_cash_issue", "petty_cash_return", "petty_cash_reimbursement"],
  loan: ["loan_out", "loan_repayment", "loan_writeoff"],
  correction: [
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
  ]
};

const scenarioCards: DocumentScenarioCard[] = [
  {
    id: "income",
    title: "项目收入",
    description: "记录项目从商户产生的收入，沉淀商户、项目、科目和账户口径。",
    requiredHint: "必填经办人、项目、商户、科目、账户、币种、金额和摘要。",
    primaryDocumentType: "project_income",
    documentTypes: documentTypesByGroup.income
  },
  {
    id: "funds",
    title: "资金业务",
    description: "记录 USDT 换汇、储备金入账和公司账户之间的资金移动。",
    requiredHint: "换汇需要转出/转入账户和 USDT 成本；账户划转需要同币种的转出、转入账户。",
    primaryDocumentType: "exchange",
    documentTypes: documentTypesByGroup.funds
  },
  {
    id: "petty_cash",
    title: "备用金业务",
    description: "记录后勤人员备用金从领取、退回到实际报销的完整流转。",
    requiredHint: "覆盖备用金发放、退回、报销，并按人员、账户、币种、金额和摘要校验。",
    primaryDocumentType: "petty_cash_reimbursement",
    documentTypes: documentTypesByGroup.petty_cash
  },
  {
    id: "loan",
    title: "借款业务",
    description: "记录借出、还款和核销，保留借款人和原借款单据链路。",
    requiredHint: "借出需要借款人和账户；还款、核销需要关联原借款单据。",
    primaryDocumentType: "loan_out",
    documentTypes: documentTypesByGroup.loan
  },
  {
    id: "correction",
    title: "冲正/修正",
    description: "基于原单据进行冲正或修正，让错误单据通过业务类型闭环处理。",
    requiredHint: "必须选择原单据，并填写冲正或修正摘要。",
    primaryDocumentType: "manual_adjustment",
    documentTypes: documentTypesByGroup.correction
  }
];

export function documentTypeGroup(documentType: DocumentType, actionType: ActionType = "normal"): DocumentWorkflowGroupId {
  if (actionType !== "normal") return "correction";
  if (documentType === "project_income") return "income";
  if (documentType === "exchange" || documentType === "account_transfer") return "funds";
  if (
    documentType === "petty_cash_issue" ||
    documentType === "petty_cash_return" ||
    documentType === "petty_cash_reimbursement"
  ) {
    return "petty_cash";
  }
  if (documentType === "loan_out" || documentType === "loan_repayment" || documentType === "loan_writeoff") return "loan";
  return "correction";
}

export function documentScenarioCards(): DocumentScenarioCard[] {
  return scenarioCards.map((card) => ({
    ...card,
    documentTypes: [...card.documentTypes]
  }));
}

export function entryStepState(
  form: DocumentEntryForm,
  requiredFields: readonly DocumentFieldKey[] = getVisibleFieldKeys(form.documentType, form.actionType),
  validationErrors: readonly string[] = []
): DocumentWorkflowStepState[] {
  const missingFields = requiredFields.filter((field) => !form[field].trim());
  const missingFieldLabels = missingFields.map(documentFieldLabel);
  const normalizedErrors = [...validationErrors];
  const hasType = Boolean(form.documentType && form.actionType);
  const detailsReady = hasType && missingFields.length === 0 && normalizedErrors.length === 0;

  return [
    {
      id: "type",
      title: "业务场景",
      status: hasType ? "complete" : "current",
      canProceed: hasType,
      summary: hasType
        ? `${scenarioTitle(documentTypeGroup(form.documentType, form.actionType))} / ${documentTypeLabels[form.documentType]}`
        : "选择业务场景和单据类型。",
      missingFields: [],
      missingFieldLabels: [],
      validationErrors: []
    },
    {
      id: "details",
      title: "业务字段",
      status: detailsReady ? "complete" : "current",
      canProceed: detailsReady,
      summary: detailsSummary(missingFieldLabels, normalizedErrors),
      missingFields: [...missingFields],
      missingFieldLabels: [...missingFieldLabels],
      validationErrors: [...normalizedErrors]
    },
    {
      id: "review",
      title: "预览保存",
      status: detailsReady ? "current" : "blocked",
      canProceed: detailsReady,
      summary: detailsReady
        ? `预览${documentTypeLabels[form.documentType]}单据，确认后保存。`
        : "请先补齐业务字段，再进入预览。",
      missingFields: [...missingFields],
      missingFieldLabels: [...missingFieldLabels],
      validationErrors: [...normalizedErrors]
    }
  ];
}

export function nextStepLabel(
  form: DocumentEntryForm,
  requiredFields: readonly DocumentFieldKey[] = getVisibleFieldKeys(form.documentType, form.actionType),
  validationErrors: readonly string[] = []
): string {
  const steps = entryStepState(form, requiredFields, validationErrors);
  const details = steps[1];

  if (!steps[0].canProceed) return "选择业务场景";
  if (details.validationErrors.length > 0) return "处理校验提示";
  if (details.missingFieldLabels.length > 0) return `继续填写：${compactFieldLabels(details.missingFieldLabels)}`;
  return "预览并保存";
}

function scenarioTitle(groupId: DocumentWorkflowGroupId) {
  return scenarioCards.find((card) => card.id === groupId)?.title ?? "单据业务";
}

function detailsSummary(missingFieldLabels: readonly string[], validationErrors: readonly string[]) {
  if (validationErrors.length > 0) return validationErrors[0];
  if (missingFieldLabels.length > 0) return `还需要：${compactFieldLabels(missingFieldLabels)}。`;
  return "业务字段已齐，可进入预览。";
}

function compactFieldLabels(labels: readonly string[]) {
  const visibleLabels = labels.slice(0, 3).join("、");
  return labels.length > 3 ? `${visibleLabels}等` : visibleLabels;
}
