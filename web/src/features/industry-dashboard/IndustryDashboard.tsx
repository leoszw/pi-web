export function IndustryDashboard() {
  return (
    <main className="industry-dashboard" aria-labelledby="industry-dashboard-title">
      <div className="industry-dashboard__eyebrow">Control Plane · P0</div>
      <h1 id="industry-dashboard-title">Industry Agent</h1>
      <p>
        Control Plane foundation is active. This phase uses a mock IndustryAgentClient and does not connect to
        MySQL, OpenSearch, RAG storage, or mutation infrastructure.
      </p>
      <div className="industry-dashboard__grid">
        <section>
          <h2>Scope</h2>
          <p>Tenant, user, company, and project context are resolved by the server BFF.</p>
        </section>
        <section>
          <h2>Security</h2>
          <p>Browser-visible secrets and approval tokens are excluded from the control-plane contract.</p>
        </section>
        <section>
          <h2>Next</h2>
          <p>After P0 acceptance, P1 adds the Evaluation foundation and Intent Lab.</p>
        </section>
      </div>
    </main>
  )
}
