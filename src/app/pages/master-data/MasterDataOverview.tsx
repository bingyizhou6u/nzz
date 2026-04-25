import type { MasterDataSnapshot } from "./masterDataTypes";

export function MasterDataOverview({ data }: { data: MasterDataSnapshot }) {
  const activeProjects = data.projects.filter((project) => project.status === "active").length;
  const activeMerchants = data.merchants.filter((merchant) => merchant.status === "active").length;
  const companyAccounts = data.accounts.filter(
    (account) => account.status === "active" && account.is_company_account
  ).length;
  const pettyCashAccounts = data.accounts.filter(
    (account) => account.status === "active" && account.account_type === "petty_cash"
  ).length;
  const activePeople = data.people.filter((person) => person.is_enabled).length;
  const enabledCurrencies = data.currencies.filter((currency) => currency.is_enabled).length;
  const enabledCategories = data.categories.filter((category) => category.is_enabled).length;
  const entryBlockers = [
    activePeople === 0 ? "人员" : null,
    activeProjects === 0 ? "项目" : null,
    activeMerchants === 0 ? "商户" : null,
    companyAccounts === 0 ? "公司账户" : null,
    enabledCurrencies === 0 ? "币种" : null,
    enabledCategories === 0 ? "科目" : null
  ].filter(Boolean);

  return (
    <div className="master-data-overview">
      <div>
        <span>启用人员</span>
        <strong>{activePeople}</strong>
      </div>
      <div>
        <span>项目</span>
        <strong>{activeProjects}</strong>
      </div>
      <div>
        <span>商户</span>
        <strong>{activeMerchants}</strong>
      </div>
      <div>
        <span>公司账户</span>
        <strong>{companyAccounts}</strong>
      </div>
      <div>
        <span>备用金账户</span>
        <strong>{pettyCashAccounts}</strong>
      </div>
      <div>
        <span>启用科目</span>
        <strong>{enabledCategories}</strong>
      </div>
      <div>
        <span>录入状态</span>
        <strong>{entryBlockers.length === 0 ? "可录入" : `缺少${entryBlockers.join("、")}`}</strong>
      </div>
    </div>
  );
}
