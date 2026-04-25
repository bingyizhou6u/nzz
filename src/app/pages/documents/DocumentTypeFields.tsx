import type { Dispatch, SetStateAction } from "react";
import type {
  AccountOption,
  DocumentEntryForm,
  DocumentEntryOptions,
  OriginalDocumentOption
} from "./documentEntryTypes";
import {
  accountCurrencyCode,
  categoryOptionsForDocumentType,
  companyAccounts,
  getVisibleFieldKeys,
  isOriginalDocumentRequired,
  merchantOptionsForProject,
  pettyCashAccountsForPerson
} from "./documentEntryModel";
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
  options: DocumentEntryOptions;
  originalDocuments: OriginalDocumentOption[];
}

function accountsWithCurrency(accounts: AccountOption[], currencyCode: string) {
  if (!currencyCode) return accounts;
  return accounts.filter((account) => account.currency_code === currencyCode);
}

export function DocumentTypeFields({ form, setForm, options, originalDocuments }: DocumentTypeFieldsProps) {
  const fields = getVisibleFieldKeys(form.documentType, form.actionType);
  const selectedAccountCurrency = accountCurrencyCode(options, form.accountId);
  const companyAccountOptions = companyAccounts(options);
  const personPettyCashAccountOptions = pettyCashAccountsForPerson(options, form.personId);
  const accountOptions =
    form.documentType === "petty_cash_return" || form.documentType === "petty_cash_reimbursement"
      ? personPettyCashAccountOptions
      : companyAccountOptions;
  const counterpartyAccountOptions = getCounterpartyAccountOptions();
  const isProjectRequired = fields.includes("projectId") && form.documentType !== "loan_writeoff";

  function updateField<K extends keyof DocumentEntryForm>(key: K, value: DocumentEntryForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateAccount(key: "accountId" | "counterpartyAccountId", value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      currencyCode:
        key === "accountId" && value ? accountCurrencyCode(options, value) || current.currencyCode : current.currencyCode,
      counterpartyAccountId: key === "accountId" ? "" : value
    }));
  }

  function getCounterpartyAccountOptions() {
    if (form.documentType === "exchange") {
      return accountsWithCurrency(companyAccountOptions, "USDT");
    }
    if (form.documentType === "account_transfer") {
      return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency).filter(
        (account) => account.id !== form.accountId
      );
    }
    if (form.documentType === "petty_cash_issue") {
      return accountsWithCurrency(personPettyCashAccountOptions, selectedAccountCurrency);
    }
    if (form.documentType === "petty_cash_return") {
      return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency);
    }
    return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency);
  }

  return (
    <>
      {fields.includes("originalDocumentId") ? (
        <SelectField
          label="原单据"
          value={form.originalDocumentId}
          options={originalDocuments}
          getValue={(document) => document.id}
          getLabel={originalDocumentLabel}
          onChange={(value) => updateField("originalDocumentId", value)}
          required={isOriginalDocumentRequired(form.actionType)}
        />
      ) : null}

      {fields.includes("operatorPersonId") ? (
        <SelectField
          label="经办人"
          value={form.operatorPersonId}
          options={options.people}
          getValue={(person) => person.id}
          getLabel={personLabel}
          onChange={(value) => updateField("operatorPersonId", value)}
          required
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
          options={options.people}
          getValue={(person) => person.id}
          getLabel={personLabel}
          onChange={(value) =>
            setForm((current) => ({ ...current, personId: value, accountId: "", counterpartyAccountId: "" }))
          }
          required
        />
      ) : null}

      {fields.includes("borrowerPersonId") ? (
        <SelectField
          label="借款人"
          value={form.borrowerPersonId}
          options={options.people}
          getValue={(person) => person.id}
          getLabel={personLabel}
          onChange={(value) => updateField("borrowerPersonId", value)}
          required
        />
      ) : null}

      {fields.includes("projectId") ? (
        <SelectField
          label="项目"
          value={form.projectId}
          options={options.projects}
          getValue={(project) => project.id}
          getLabel={projectLabel}
          onChange={(value) => setForm((current) => ({ ...current, projectId: value, merchantId: "" }))}
          required={isProjectRequired}
        />
      ) : null}

      {fields.includes("merchantId") ? (
        <SelectField
          label="商户"
          value={form.merchantId}
          options={merchantOptionsForProject(options, form.projectId)}
          getValue={(merchant) => merchant.id}
          getLabel={merchantLabel}
          onChange={(value) => updateField("merchantId", value)}
          required={form.documentType === "project_income"}
          disabled={!form.projectId}
        />
      ) : null}

      {fields.includes("categoryId") ? (
        <SelectField
          label="科目"
          value={form.categoryId}
          options={categoryOptionsForDocumentType(options, form.documentType)}
          getValue={(category) => category.id}
          getLabel={categoryLabel}
          onChange={(value) => updateField("categoryId", value)}
          required={form.documentType !== "account_transfer"}
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
          options={accountOptions}
          getValue={(account) => account.id}
          getLabel={accountLabel}
          onChange={(value) => updateAccount("accountId", value)}
          required
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
          options={counterpartyAccountOptions}
          getValue={(account) => account.id}
          getLabel={accountLabel}
          onChange={(value) => updateAccount("counterpartyAccountId", value)}
          required
        />
      ) : null}

      {fields.includes("currencyCode") ? (
        <SelectField
          label="币种"
          value={form.currencyCode}
          options={options.currencies}
          getValue={(currency) => currency.code}
          getLabel={currencyLabel}
          onChange={(value) => updateField("currencyCode", value)}
          required
          disabled={Boolean(form.accountId)}
        />
      ) : null}

      {fields.includes("amountMajor") ? (
        <label>
          金额
          <input
            value={form.amountMajor}
            onChange={(event) => updateField("amountMajor", event.target.value)}
            required
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
            required
            maxLength={240}
          />
        </label>
      ) : null}
    </>
  );
}
