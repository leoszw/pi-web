export function IndustryDashboard() {
  return (
    <main className="industry-dashboard" aria-labelledby="industry-dashboard-title">
      <div className="industry-dashboard__eyebrow">控制台 · P1</div>
      <h1 id="industry-dashboard-title">行业智能体</h1>
      <p>
        控制台基础已激活。P1 使用确定性模拟夹具添加了评测工作台和意图实验；此阶段仍不连接 MySQL、OpenSearch、RAG 存储或变更基础设施。
      </p>
      <div className="industry-dashboard__grid">
        <section>
          <h2>范围</h2>
          <p>租户、用户、公司和项目上下文由服务端 BFF 解析。</p>
        </section>
        <section>
          <h2>安全</h2>
          <p>浏览器可见的密钥和审批令牌已从控制台契约中排除。</p>
        </section>
        <section>
          <h2>评测</h2>
          <p>意图数据集、Playground、批次运行、失败浏览器和对比可在评测下使用。</p>
        </section>
      </div>
    </main>
  )
}
