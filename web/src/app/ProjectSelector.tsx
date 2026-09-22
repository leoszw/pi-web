import { useEffect, useState } from 'react'
import { createIndustryWorkspaceApiClient, type IndustryWorkspaceApiClient } from '../api/workspace-client'

const defaultWorkspaceClient = createIndustryWorkspaceApiClient()

export interface ProjectSelectorProps {
  workspaceClient?: IndustryWorkspaceApiClient
  onProjectChanged?: (projectId: string | null) => void
}

export function ProjectSelector({ workspaceClient = defaultWorkspaceClient, onProjectChanged }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ReadonlyArray<{ projectId: string; name: string }>>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void workspaceClient.getContext()
      .then((context) => {
        if (cancelled) return
        setProjects(context.authorizedProjects)
        setCurrentProjectId(context.context.projectId)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { cancelled = true }
  }, [workspaceClient])

  async function selectProject(projectId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const previousProjectId = currentProjectId
      const context = await workspaceClient.selectProject({ projectId: projectId === '' ? null : projectId })
      const nextProjectId = context.context.projectId
      setCurrentProjectId(nextProjectId)
      if (nextProjectId !== previousProjectId) onProjectChanged?.(nextProjectId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell__context" aria-label="项目选择">
      <select
        value={currentProjectId ?? ''}
        disabled={busy}
        onChange={(event) => void selectProject(event.target.value)}
      >
        <option value="">选择项目</option>
        {projects.map((item) => <option value={item.projectId} key={item.projectId}>{item.name}</option>)}
      </select>
      {error !== null && <span className="app-shell__context-error" role="alert">{error}</span>}
    </div>
  )
}
