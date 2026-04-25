import type { Capability, NavigationItem, PersonRole, SessionState } from "./sessionTypes";

export const roleLabels: Record<PersonRole, string> = {
  admin: "管理员",
  finance_manager: "财务主管",
  finance_entry: "财务录入",
  logistics: "运营物流",
  readonly: "只读",
  borrower: "借款人"
};

const navigationItems: NavigationItem[] = [
  { key: "workspace", label: "工作台", capability: "session.view" },
  { key: "documents", label: "业务单据", capability: "documents.view" },
  { key: "review", label: "审核中心", capability: "documents.approve" },
  { key: "reports", label: "报表中心", capability: "reports.view" },
  { key: "master-data", label: "基础资料", capability: "masterData.view" },
  { key: "period-locks", label: "锁账月结", capability: "periodLocks.view" }
];

export function canUse(session: SessionState, capability: Capability): boolean {
  return session.status === "authenticated" && session.capabilities.includes(capability);
}

export function visibleNavigationItems(session: SessionState): NavigationItem[] {
  return navigationItems.filter((item) => canUse(session, item.capability));
}
