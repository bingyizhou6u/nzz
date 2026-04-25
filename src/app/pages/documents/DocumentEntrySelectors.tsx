import type {
  AccountOption,
  CategoryOption,
  CurrencyOption,
  MerchantOption,
  OriginalDocumentOption,
  PersonOption,
  ProjectOption
} from "./documentEntryTypes";

interface SelectFieldProps<T extends { id?: string; code?: string }> {
  label: string;
  value: string;
  options: T[];
  getValue: (option: T) => string;
  getLabel: (option: T) => string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}

export function SelectField<T extends { id?: string; code?: string }>({
  label,
  value,
  options,
  getValue,
  getLabel,
  onChange,
  required = false,
  disabled = false,
  emptyLabel = "请选择"
}: SelectFieldProps<T>) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => {
          const optionValue = getValue(option);
          return (
            <option key={optionValue} value={optionValue}>
              {getLabel(option)}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function personLabel(person: PersonOption) {
  return person.alias ? `${person.name} / ${person.alias}` : person.name;
}

export function projectLabel(project: ProjectOption) {
  return `${project.code} / ${project.name}`;
}

export function merchantLabel(merchant: MerchantOption) {
  return `${merchant.code} / ${merchant.name}`;
}

export function accountLabel(account: AccountOption) {
  return `${account.name} / ${account.currency_code}`;
}

export function currencyLabel(currency: CurrencyOption) {
  return `${currency.code} / ${currency.name}`;
}

export function categoryLabel(category: CategoryOption) {
  return category.name;
}

export function originalDocumentLabel(document: OriginalDocumentOption) {
  return `${document.document_no} / ${document.business_date} / ${document.summary}`;
}
