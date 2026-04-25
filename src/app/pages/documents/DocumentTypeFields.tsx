import type { Dispatch, SetStateAction } from "react";
import type { DocumentEntryState } from "./documentEntryRules";
import type { DocumentEntryForm, OriginalDocumentOption } from "./documentEntryTypes";
import {
  accountLabel,
  categoryLabel,
  currencyLabel,
  merchantLabel,
  originalDocumentLabel,
  personLabel,
  projectLabel,
  SelectField
} from "./DocumentEntrySelectors";

interface DocumentTypeFieldsProps {
  form: DocumentEntryForm;
  setForm: Dispatch<SetStateAction<DocumentEntryForm>>;
  entryState: DocumentEntryState;
  originalDocuments: OriginalDocumentOption[];
}

export function DocumentTypeFields({ form, setForm, entryState, originalDocuments }: DocumentTypeFieldsProps) {
  const fields = entryState.visibleFields;
  const optionsByField = entryState.optionsByField;

  function updateField<K extends keyof DocumentEntryForm>(key: K, value: DocumentEntryForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateProject(value: string) {
    setForm((current) => ({ ...current, projectId: value, merchantId: "" }));
  }

  function updatePerson(value: string) {
    setForm((current) => ({ ...current, personId: value, accountId: "", counterpartyAccountId: "" }));
  }

  function updateCategory(value: string) {
    const nextCategory = entryState.optionsByField.categoryId?.find((category) => category.id === value);
    setForm((current) => ({
      ...current,
      categoryId: value,
      projectId:
        current.documentType === "petty_cash_reimbursement" && !nextCategory?.requires_merchant
          ? ""
          : current.projectId,
      merchantId: "",
      borrowerPersonId: current.documentType === "petty_cash_reimbursement" ? "" : current.borrowerPersonId
    }));
  }

  function updateAccount(key: "accountId" | "counterpartyAccountId", value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      currencyCode:
        key === "accountId" && value
          ? entryState.optionsByField.accountId?.find((account) => account.id === value)?.currency_code ??
            current.currencyCode
          : current.currencyCode,
      counterpartyAccountId: key === "accountId" ? "" : value
    }));
  }

  return (
    <>
      {fields.includes("originalDocumentId") ? (
        <SelectField
          label="原单据"
          value={form.originalDocumentId}
          options={optionsByField.originalDocumentId ?? originalDocuments}
          getValue={(document) => document.id}
          getLabel={originalDocumentLabel}
          onChange={(value) => updateField("originalDocumentId", value)}
          required={entryState.requiredFields.includes("originalDocumentId")}
          disabled={entryState.disabledFields.includes("originalDocumentId")}
        />
      ) : null}

      {fields.includes("operatorPersonId") ? (
        <SelectField
          label="经办人"
          value={form.operatorPersonId}
          options={optionsByField.operatorPersonId ?? []}
          getValue={(person) => person.id}
          getLabel={personLabel}
          onChange={(value) => updateField("operatorPersonId", value)}
          required={entryState.requiredFields.includes("operatorPersonId")}
          disabled={entryState.disabledFields.includes("operatorPersonId")}
        />
      ) : null}

      {fields.includes("personId") ? (
        <SelectField
          label={
            form.documentType === "petty_cash_return"
              ? "退回人"
              : form.documentType === "petty_cash_issue"
                ? "领取人"
                : "报销人"
          }
          value={form.personId}
          options={optionsByField.personId ?? []}
          getValue={(person) => person.id}
          getLabel={personLabel}
          onChange={updatePerson}
          required={entryState.requiredFields.includes("personId")}
          disabled={entryState.disabledFields.includes("personId")}
        />
      ) : null}

      {fields.includes("borrowerPersonId") ? (
        <SelectField
          label="借款人"
          value={form.borrowerPersonId}
          options={optionsByField.borrowerPersonId ?? []}
          getValue={(person) => person.id}
          getLabel={personLabel}
          onChange={(value) => updateField("borrowerPersonId", value)}
          required={entryState.requiredFields.includes("borrowerPersonId")}
          disabled={entryState.disabledFields.includes("borrowerPersonId")}
        />
      ) : null}

      {fields.includes("projectId") ? (
        <SelectField
          label="项目"
          value={form.projectId}
          options={optionsByField.projectId ?? []}
          getValue={(project) => project.id}
          getLabel={projectLabel}
          onChange={updateProject}
          required={entryState.requiredFields.includes("projectId")}
          disabled={entryState.disabledFields.includes("projectId")}
        />
      ) : null}

      {fields.includes("merchantId") ? (
        <SelectField
          label="商户"
          value={form.merchantId}
          options={optionsByField.merchantId ?? []}
          getValue={(merchant) => merchant.id}
          getLabel={merchantLabel}
          onChange={(value) => updateField("merchantId", value)}
          required={entryState.requiredFields.includes("merchantId")}
          disabled={entryState.disabledFields.includes("merchantId") || !form.projectId}
        />
      ) : null}

      {fields.includes("categoryId") ? (
        <SelectField
          label="科目"
          value={form.categoryId}
          options={optionsByField.categoryId ?? []}
          getValue={(category) => category.id}
          getLabel={categoryLabel}
          onChange={updateCategory}
          required={entryState.requiredFields.includes("categoryId")}
          disabled={entryState.disabledFields.includes("categoryId")}
        />
      ) : null}

      {fields.includes("accountId") ? (
        <SelectField
          label={
            form.documentType === "petty_cash_return" || form.documentType === "petty_cash_reimbursement"
              ? "人员备用金账户"
              : form.documentType === "exchange"
                ? "转入账户"
                : form.documentType === "account_transfer"
                  ? "转出账户"
                  : "账户"
          }
          value={form.accountId}
          options={optionsByField.accountId ?? []}
          getValue={(account) => account.id}
          getLabel={accountLabel}
          onChange={(value) => updateAccount("accountId", value)}
          required={entryState.requiredFields.includes("accountId")}
          disabled={entryState.disabledFields.includes("accountId")}
        />
      ) : null}

      {fields.includes("counterpartyAccountId") ? (
        <SelectField
          label={
            form.documentType === "petty_cash_issue"
              ? "人员备用金账户"
              : form.documentType === "petty_cash_return"
                ? "公司收回账户"
                : form.documentType === "exchange"
                  ? "转出账户"
                  : "转入账户"
          }
          value={form.counterpartyAccountId}
          options={optionsByField.counterpartyAccountId ?? []}
          getValue={(account) => account.id}
          getLabel={accountLabel}
          onChange={(value) => updateAccount("counterpartyAccountId", value)}
          required={entryState.requiredFields.includes("counterpartyAccountId")}
          disabled={entryState.disabledFields.includes("counterpartyAccountId")}
        />
      ) : null}

      {fields.includes("currencyCode") ? (
        <SelectField
          label="币种"
          value={form.currencyCode}
          options={optionsByField.currencyCode ?? []}
          getValue={(currency) => currency.code}
          getLabel={currencyLabel}
          onChange={(value) => updateField("currencyCode", value)}
          required={entryState.requiredFields.includes("currencyCode")}
          disabled={entryState.disabledFields.includes("currencyCode")}
        />
      ) : null}

      {fields.includes("amountMajor") ? (
        <label>
          金额
          <input
            value={form.amountMajor}
            onChange={(event) => updateField("amountMajor", event.target.value)}
            required={entryState.requiredFields.includes("amountMajor")}
            disabled={entryState.disabledFields.includes("amountMajor")}
            inputMode="decimal"
            maxLength={24}
          />
        </label>
      ) : null}

      {fields.includes("usdtAmountMajor") ? (
        <label>
          USDT成本
          <input
            value={form.usdtAmountMajor}
            onChange={(event) => updateField("usdtAmountMajor", event.target.value)}
            required={entryState.requiredFields.includes("usdtAmountMajor")}
            disabled={entryState.disabledFields.includes("usdtAmountMajor")}
            inputMode="decimal"
            maxLength={24}
          />
        </label>
      ) : null}

      {fields.includes("summary") ? (
        <label className="wide-field">
          摘要
          <input
            value={form.summary}
            onChange={(event) => updateField("summary", event.target.value)}
            required={entryState.requiredFields.includes("summary")}
            disabled={entryState.disabledFields.includes("summary")}
            maxLength={240}
          />
        </label>
      ) : null}
    </>
  );
}
