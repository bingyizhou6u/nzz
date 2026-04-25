export interface ReportFilterState {
  period: string;
  projectId: string;
  merchantId: string;
  personId: string;
  currencyCode: string;
  staleDays: string;
}

export const defaultReportFilters: ReportFilterState = {
  period: "",
  projectId: "",
  merchantId: "",
  personId: "",
  currencyCode: "",
  staleDays: "30"
};

export function buildReportQuery(filters: ReportFilterState) {
  const params = new URLSearchParams();
  append(params, "period", filters.period);
  append(params, "projectId", filters.projectId);
  append(params, "merchantId", filters.merchantId);
  append(params, "personId", filters.personId);
  append(params, "currencyCode", filters.currencyCode.toUpperCase());
  append(params, "staleDays", filters.staleDays);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function append(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}
