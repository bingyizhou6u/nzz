import { useEffect, useState } from "react";
import { getJson, type ApiEnvelope } from "../api";
import { AccountsTab } from "./master-data/AccountsTab";
import { CategoriesTab } from "./master-data/CategoriesTab";
import { CurrenciesTab } from "./master-data/CurrenciesTab";
import { MasterDataOverview } from "./master-data/MasterDataOverview";
import { MerchantsTab } from "./master-data/MerchantsTab";
import { PeopleTab } from "./master-data/PeopleTab";
import { ProjectsTab } from "./master-data/ProjectsTab";
import type { MasterDataSnapshot } from "./master-data/masterDataTypes";

type TabKey = "people" | "projects" | "merchants" | "accounts" | "currencies" | "categories";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "people", label: "人员" },
  { key: "projects", label: "项目" },
  { key: "merchants", label: "商户" },
  { key: "accounts", label: "账户" },
  { key: "currencies", label: "币种" },
  { key: "categories", label: "管理科目" }
];

const emptySnapshot: MasterDataSnapshot = {
  people: [],
  projects: [],
  merchants: [],
  accounts: [],
  currencies: [],
  categories: []
};

export function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("people");
  const [data, setData] = useState<MasterDataSnapshot>(emptySnapshot);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentActorId, setCurrentActorId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getJson<ApiEnvelope<MasterDataSnapshot>>("/api/master-data");
        if (isCurrent) {
          setData(response.data);
          setCurrentActorId((current) => {
            if (response.data.people.some((person) => person.id === current && person.is_enabled)) return current;
            return response.data.people.find((person) => person.is_enabled)?.id || "";
          });
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : "读取基础资料失败");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isCurrent = false;
    };
  }, [reloadKey]);

  function refreshMasterData() {
    setReloadKey((value) => value + 1);
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>基础资料治理中心</h2>
          <div className="document-toolbar">
            <div className="status-slot" role="status" aria-live="polite">
              {isLoading ? "读取中" : error ? "读取失败" : "已读取"}
            </div>
            <button type="button" className="secondary-button" onClick={refreshMasterData} disabled={isLoading}>
              重新读取
            </button>
          </div>
        </div>
        {error ? <div className="notice error">{error}</div> : <MasterDataOverview data={data} />}
      </section>

      <section className="panel master-data-actor-panel">
        <div className="panel-header">
          <h2>当前操作人</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {isLoading ? "读取中" : currentActorId ? "已选择" : "未选择"}
          </div>
        </div>
        <div className="actor-panel">
          <label>
            当前操作人
            <select
              value={currentActorId}
              onChange={(event) => setCurrentActorId(event.target.value)}
              required
              disabled={isLoading || Boolean(error)}
            >
              <option value="">请选择操作人</option>
              {data.people
                .filter((person) => person.is_enabled)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.alias ? `${person.name} / ${person.alias}` : person.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="document-entry-notice">创建、修改、启停和归档都会使用当前操作人，并写入审计。</div>
        </div>
      </section>

      <section className="panel">
        <div className="master-data-tabs" role="tablist" aria-label="基础资料分类">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "tab active" : "tab"}
              onClick={() => setActiveTab(tab.key)}
              aria-selected={activeTab === tab.key}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "people" ? (
          <PeopleTab rows={data.people} currentActorId={currentActorId} onChanged={refreshMasterData} />
        ) : null}
        {activeTab === "projects" ? (
          <ProjectsTab
            rows={data.projects}
            people={data.people}
            currentActorId={currentActorId}
            onChanged={refreshMasterData}
          />
        ) : null}
        {activeTab === "merchants" ? (
          <MerchantsTab
            rows={data.merchants}
            people={data.people}
            projects={data.projects}
            currentActorId={currentActorId}
            onChanged={refreshMasterData}
          />
        ) : null}
        {activeTab === "accounts" ? (
          <AccountsTab
            rows={data.accounts}
            people={data.people}
            currencies={data.currencies}
            currentActorId={currentActorId}
            onChanged={refreshMasterData}
          />
        ) : null}
        {activeTab === "currencies" ? (
          <CurrenciesTab rows={data.currencies} currentActorId={currentActorId} onChanged={refreshMasterData} />
        ) : null}
        {activeTab === "categories" ? (
          <CategoriesTab rows={data.categories} currentActorId={currentActorId} onChanged={refreshMasterData} />
        ) : null}
      </section>
    </div>
  );
}
