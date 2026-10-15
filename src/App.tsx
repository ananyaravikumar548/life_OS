import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Bell, BookOpen, Brain, BriefcaseBusiness, Check, ChevronRight, Dumbbell, GraduationCap, Heart,
  LayoutDashboard, Menu, Pencil, Plus, Search, Settings,
  Target, Trash2, Utensils, X,
} from 'lucide-react'
import './App.css'
import FitnessPage from './fitness/FitnessPage'
import NutritionPage from './nutrition/NutritionPage'
import ThinkSpacePage from './thinkspace/ThinkSpacePage'
import { migrateResource, readLocalSnapshot, writeLocalSnapshot, writeResource } from './data/api'
import { localDateString, normalizeCategory, parseWorkspaceTasks, removeTask, setTaskCompletion, tasksAvailableOnDate, upsertTask } from './tasks/model'
import type { Category, Task } from './tasks/model'

type AcademicContainer = { id: string; title: string; createdAt?: string; updatedAt?: string }
type CareerProject = { id: string; title: string; createdAt?: string; updatedAt?: string }
type Destination = 'Today' | 'Think Space' | 'Fitness' | 'Nutrition' | 'Career' | 'Academics' | 'Progress' | 'Settings'
type NavItem = { label: Destination; icon: typeof LayoutDashboard }

const navigation: NavItem[] = [
  { label: 'Today', icon: LayoutDashboard }, { label: 'Think Space', icon: Brain },
  { label: 'Fitness', icon: Dumbbell }, { label: 'Nutrition', icon: Utensils },
  { label: 'Career', icon: BriefcaseBusiness }, { label: 'Academics', icon: GraduationCap }, { label: 'Progress', icon: Activity },
]

type Workspace = { tasks: Task[]; academicContainers: AcademicContainer[]; careerProjects: CareerProject[] }

const categoryIcons = { Academics: BookOpen, Career: BriefcaseBusiness, Personal: Heart }
const categories: Category[] = ['Academics', 'Career', 'Personal']
const createId = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

function loadWorkspaceBackup(): Workspace {
  const saved = readLocalSnapshot<Partial<Workspace>>('workspace')
  return {
    tasks: parseWorkspaceTasks(saved?.tasks),
    academicContainers: Array.isArray(saved?.academicContainers) ? saved.academicContainers.filter((item): item is AcademicContainer => Boolean(item && typeof item.id === 'string' && typeof item.title === 'string')) : [],
    careerProjects: Array.isArray(saved?.careerProjects) ? saved.careerProjects.filter((item): item is CareerProject => Boolean(item && typeof item.id === 'string' && typeof item.title === 'string')) : [],
  }
}

function App() {
  const [active, setActive] = useState<Destination>('Today')
  const [tasks, setTasks] = useState<Task[]>([])
  const [academicContainers, setAcademicContainers] = useState<AcademicContainer[]>([])
  const [careerProjects, setCareerProjects] = useState<CareerProject[]>([])
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceDirty, setWorkspaceDirty] = useState(false)
  const [migrationComplete, setMigrationComplete] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null)
  const [dialogCategory, setDialogCategory] = useState<Category>('Personal')
  const [dialogAcademicContainerId, setDialogAcademicContainerId] = useState<string | undefined>()
  const [dialogCareerProjectId, setDialogCareerProjectId] = useState<string | undefined>()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [today, setToday] = useState(localDateString())
  const addButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const refreshDate = () => setToday(localDateString())
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshDate() }
    const interval = window.setInterval(refreshDate, 60_000)
    window.addEventListener('focus', refreshDate)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshDate)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  const personalTasks = useMemo(() => tasksAvailableOnDate(tasks, today).filter((task) => task.category === 'Personal'), [tasks, today])
  const pendingTasks = useMemo(() => personalTasks.filter((task) => !task.completed), [personalTasks])
  const completedTasks = useMemo(() => personalTasks.filter((task) => task.completed), [personalTasks])
  const completedCount = completedTasks.length
  const completion = personalTasks.length ? Math.round((completedCount / personalTasks.length) * 100) : 0

  useEffect(() => {
    let cancelled = false
    const local = loadWorkspaceBackup()
    void migrateResource('workspace', local).then((snapshot) => {
      if (cancelled) return
      const workspace = snapshot.data
      setTasks(workspace.tasks)
      setAcademicContainers(workspace.academicContainers)
      setCareerProjects(workspace.careerProjects)
      setMigrationComplete(true)
      setCloudError('')
    }).catch((error: unknown) => {
      if (cancelled) return
      const backup = loadWorkspaceBackup()
      setTasks(backup.tasks); setAcademicContainers(backup.academicContainers); setCareerProjects(backup.careerProjects)
      setCloudError(error instanceof Error ? error.message : 'MongoDB could not load your workspace.')
    }).finally(() => { if (!cancelled) setWorkspaceReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!workspaceReady) return
    const workspace = { tasks, academicContainers, careerProjects }
    writeLocalSnapshot('workspace', workspace)
    if (!workspaceDirty) return
    const save = migrationComplete ? writeResource('workspace', workspace) : migrateResource('workspace', workspace).then((result) => {
      setMigrationComplete(true); setTasks(result.data.tasks); setAcademicContainers(result.data.academicContainers); setCareerProjects(result.data.careerProjects)
    })
    void save.then(() => { setCloudError(''); setWorkspaceDirty(false) }).catch((error: unknown) => {
      setCloudError(error instanceof Error ? error.message : 'MongoDB could not save your workspace. Your browser backup is intact.')
    })
  }, [workspaceReady, workspaceDirty, migrationComplete, tasks, academicContainers, careerProjects])

  function changeDestination(destination: Destination) {
    setActive(destination)
    setMobileNavOpen(false)
  }

  function toggleTask(id: string) {
    setWorkspaceDirty(true)
    setTasks((current) => setTaskCompletion(current, id, !current.find((task) => task.id === id)?.completed))
  }

  function saveTask(details: { title: string; category: Category; duration?: number; priority: boolean; academicContainerId?: string; careerProjectId?: string }, initialTask?: Task) {
    const now = new Date().toISOString()
    const task: Task = initialTask
      ? { ...initialTask, ...details, category: normalizeCategory(details.category), updatedAt: now }
      : { id: createId('task'), ...details, category: normalizeCategory(details.category), completed: false, createdAt: now, updatedAt: now }
    setWorkspaceDirty(true)
    setTasks((current) => upsertTask(current, task))
  }

  function createTaskFromThought(title: string, originThoughtId: string) {
    const now = new Date().toISOString()
    const task: Task = { id: createId('task'), title, category: 'Personal', completed: false, priority: false, originThoughtId, createdAt: now, updatedAt: now }
    setWorkspaceDirty(true)
    setTasks((current) => upsertTask(current, task))
    changeDestination('Today')
  }

  function deleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    setWorkspaceDirty(true)
    setTasks((current) => removeTask(current, task.id))
  }

  function openQuickAdd(category: Category = 'Personal', academicContainerId?: string, careerProjectId?: string) {
    setTaskToEdit(null)
    setDialogCategory(category)
    setDialogAcademicContainerId(academicContainerId)
    setDialogCareerProjectId(careerProjectId)
    setDialogOpen(true)
  }

  function openTaskEdit(task: Task) {
    setTaskToEdit(task)
    setDialogCategory(task.category)
    setDialogAcademicContainerId(task.academicContainerId)
    setDialogCareerProjectId(task.careerProjectId)
    setDialogOpen(true)
  }

  function renameAcademicContainer(id: string, title: string) {
    const now = new Date().toISOString()
    setWorkspaceDirty(true)
    setAcademicContainers((current) => current.map((item) => item.id === id ? { ...item, title, updatedAt: now } : item))
  }

  function renameCareerProject(id: string, title: string) {
    const now = new Date().toISOString()
    setWorkspaceDirty(true)
    setCareerProjects((current) => current.map((item) => item.id === id ? { ...item, title, updatedAt: now } : item))
  }

  function addAcademicContainer() {
    setWorkspaceDirty(true)
    const now = new Date().toISOString()
    setAcademicContainers((current) => [...current, { id: createId('academic'), title: `Untitled container ${current.length + 1}`, createdAt: now, updatedAt: now }])
  }

  function addCareerProject() {
    setWorkspaceDirty(true)
    const now = new Date().toISOString()
    setCareerProjects((current) => [...current, { id: createId('career'), title: `New project ${current.length + 1}`, createdAt: now, updatedAt: now }])
  }

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setTaskToEdit(null)
    setDialogAcademicContainerId(undefined)
    setDialogCareerProjectId(undefined)
    window.setTimeout(() => addButtonRef.current?.focus(), 0)
  }, [])

  if (!workspaceReady) return <div className="app-loading"><span className="brand-mark"><Activity size={19} /></span><p>Loading your Life OS data…</p></div>

  return (
    <div className="app-shell">
      {cloudError && <div className="app-cloud-warning" role="status">MongoDB is unavailable: {cloudError}. Changes are kept in this browser and retried after another edit.</div>}
      {mobileNavOpen && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <AppSidebar active={active} onNavigate={changeDestination} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main className="main-area">
        <AppHeader active={active} onMenu={() => setMobileNavOpen(true)} />
        {active === 'Today' ? (
          <TodayPage tasks={pendingTasks} completedTasks={completedTasks} totalTasks={personalTasks.length} completed={completedCount} completion={completion} onToggle={toggleTask} onDelete={deleteTask} onEdit={openTaskEdit} onAdd={() => openQuickAdd('Personal')} addButtonRef={addButtonRef} />
        ) : active === 'Think Space' ? (
          <ThinkSpacePage onCreateTask={createTaskFromThought} />
        ) : active === 'Fitness' ? (
          <FitnessPage />
        ) : active === 'Nutrition' ? (
          <NutritionPage />
        ) : active === 'Academics' ? (
          <AcademicsPage containers={academicContainers} tasks={tasks.filter((task) => task.category === 'Academics')} onRename={renameAcademicContainer} onAddContainer={addAcademicContainer} onAddTask={(id) => openQuickAdd('Academics', id)} onToggle={toggleTask} onDelete={deleteTask} onEdit={openTaskEdit} />
        ) : active === 'Career' ? (
          <CareerPage projects={careerProjects} tasks={tasks.filter((task) => task.category === 'Career')} onRename={renameCareerProject} onAddProject={addCareerProject} onAddTask={(id) => openQuickAdd('Career', undefined, id)} onToggle={toggleTask} onDelete={deleteTask} onEdit={openTaskEdit} />
        ) : <PlaceholderPage destination={active} onBack={() => changeDestination('Today')} />}
      </main>
      {dialogOpen && <TaskDialog initialTask={taskToEdit} initialCategory={dialogCategory} academicContainerId={dialogAcademicContainerId} careerProjectId={dialogCareerProjectId} onClose={closeDialog} onSave={(details) => saveTask(details, taskToEdit ?? undefined)} />}
    </div>
  )
}

function AppSidebar({ active, onNavigate, mobileOpen, onClose }: { active: Destination; onNavigate: (destination: Destination) => void; mobileOpen: boolean; onClose: () => void }) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
      <div className="brand-row">
        <div className="brand-mark"><Activity size={19} strokeWidth={2.2} /></div>
        <span className="brand-name">life os<span>.</span></span>
        <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><X size={19} /></button>
      </div>
      <p className="brand-tagline">PERSONAL OPERATING SYSTEM</p>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="navigation-list">
        {navigation.map(({ label, icon: Icon }) => (
          <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onNavigate(label)} aria-current={active === label ? 'page' : undefined}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Target size={15} /><span>TODAY'S FOCUS<br />Plan. Prioritize. Complete.</span></div>
        <button className={`nav-item settings-link ${active === 'Settings' ? 'active' : ''}`} onClick={() => onNavigate('Settings')} aria-current={active === 'Settings' ? 'page' : undefined}><Settings size={18} /><span>Settings</span></button>
        <div className="profile-mini"><div className="avatar avatar-small">A</div><div><strong>Ananya</strong><span>Your personal space</span></div><ChevronRight size={16} className="profile-chevron" /></div>
      </div>
    </aside>
  )
}

function AppHeader({ active, onMenu }: { active: Destination; onMenu: () => void }) {
  return (
    <header className="topbar">
      <div className="breadcrumb"><button className="menu-button icon-button" aria-label="Open navigation" onClick={onMenu}><Menu size={21} /></button><span>My workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div>
      <div className="topbar-actions">
        <div className="search-affordance" aria-label="Search is not available yet"><Search size={16} /><span>Search</span><kbd>⌘ K</kbd></div>
        <span className="header-divider" />
        <span className="notification-icon" aria-hidden="true"><Bell size={19} strokeWidth={1.8} /></span>
        <div className="avatar">A</div>
      </div>
    </header>
  )
}

function TodayPage({ tasks, completedTasks, totalTasks, completed, completion, onToggle, onDelete, onEdit, onAdd, addButtonRef }: {
  tasks: Task[]; completedTasks: Task[]; totalTasks: number; completed: number; completion: number; onToggle: (id: string) => void; onDelete: (task: Task) => void; onEdit: (task: Task) => void; onAdd: () => void; addButtonRef: React.RefObject<HTMLButtonElement | null>
}) {
  const remaining = totalTasks - completed
  return (
    <div className="page-content">
      <section className="welcome-row">
        <div><p className="date-label"><span className="date-dot" />{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}</p><h1>Today's plan</h1><p className="welcome-copy">Prioritize the work that moves your goals forward.</p></div>
        <button ref={addButtonRef} className="primary-button add-task-button" onClick={onAdd}><Plus size={18} strokeWidth={2.3} />Add a task</button>
      </section>
      <DailyProgressCard completed={completed} total={totalTasks} completion={completion} remaining={remaining} />
      <section className="tasks-section">
        <div className="section-heading-row"><div><p className="eyebrow">YOUR TASKS</p><h2>Personal</h2></div><span className="task-section-meta">{tasks.length} pending</span></div>
        <div className="task-panel">
          <div className="task-toolbar"><span className="category-name personal">Personal tasks</span><span className="task-section-meta">{completed} of {totalTasks} complete</span></div>
          <div className="task-list">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} onDelete={() => onDelete(task)} onEdit={() => onEdit(task)} />) : <p className="tasks-empty">{completedTasks.length ? 'You’re all caught up. Completed tasks are below.' : 'No pending tasks. Add one when you’re ready.'}</p>}</div>
        </div>
        <details className="completed-tasks-section"><summary><span>Completed</span><span className="completed-count">{completedTasks.length}</span></summary><div className="task-list">{completedTasks.length ? completedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} onDelete={() => onDelete(task)} onEdit={() => onEdit(task)} />) : <p className="tasks-empty">No completed tasks for this view.</p>}</div></details>
      </section>
      <footer className="page-footer">A clear plan. Focused work. Measurable progress.</footer>
    </div>
  )
}

function DailyProgressCard({ completed, total, completion, remaining }: { completed: number; total: number; completion: number; remaining: number }) {
  return <section className="progress-card" aria-label="Daily progress"><div className="progress-card-content"><p className="progress-eyebrow">DAILY COMPLETION</p><h2>{remaining === 0 && total > 0 ? 'Daily plan complete' : total === 0 ? 'Set your plan for today' : 'Keep your priorities moving'}</h2><p className="progress-description">{total === 0 ? 'Add a task to start tracking progress.' : `${completed} of ${total} ${total === 1 ? 'task' : 'tasks'} completed`}</p><div className="progress-track"><span style={{ width: `${completion}%` }} /></div></div><div className="progress-summary"><strong>{completion}<small>%</small></strong><span>{total === 0 ? 'No tasks added' : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}</span></div></section>
}

function TaskRow({ task, onToggle, onDelete, onEdit }: { task: Task; onToggle: () => void; onDelete: () => void; onEdit: () => void }) {
  const Icon = categoryIcons[task.category]
  return <div className={`task-row ${task.completed ? 'task-completed' : ''}`}>
    <button type="button" className={`task-checkbox ${task.completed ? 'checked' : ''}`} onClick={onToggle} aria-label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} aria-pressed={task.completed}>{task.completed && <Check size={13} strokeWidth={2.6} />}</button>
    <div className={`category-icon category-${task.category.toLowerCase()}`}><Icon size={16} strokeWidth={1.8} /></div>
    <div className="task-main"><span className="task-title">{task.title}</span><div className="task-meta"><span className={`category-name ${task.category.toLowerCase()}`}>{task.category}</span>{task.duration && <><i /> <span>{task.duration} min</span></>}{task.originThoughtId && <><i /> <span title={`Linked thought ${task.originThoughtId}`}>From Think Space</span></>}</div></div>
    {task.priority && <span className="priority-tag"><span />Priority</span>}
    <div className="task-actions"><button type="button" className="task-action-button" aria-label={`Edit ${task.title}`} onClick={onEdit}><Pencil size={14} /></button><button type="button" className="task-action-button delete" aria-label={`Delete ${task.title}`} onClick={onDelete}><Trash2 size={14} /></button></div>
  </div>
}

function AcademicsPage({ containers, tasks, onRename, onAddContainer, onAddTask, onToggle, onDelete, onEdit }: {
  containers: AcademicContainer[]; tasks: Task[]; onRename: (id: string, title: string) => void; onAddContainer: () => void; onAddTask: (id: string) => void; onToggle: (id: string) => void; onDelete: (task: Task) => void; onEdit: (task: Task) => void
}) {
  const completed = tasks.filter((task) => task.completed).length
  return <div className="page-content academics-page">
    <section className="welcome-row academics-welcome"><div><p className="eyebrow">ACADEMIC WORKSPACE</p><h1>Academics</h1><p className="welcome-copy">Organize coursework by subject, class, or project. Rename each container to fit your plan.</p></div><button className="primary-button add-task-button" onClick={onAddContainer}><Plus size={18} />Add container</button></section>
    <section className="academics-overview"><div><strong>{containers.length}</strong><span>containers</span></div><i /><div><strong>{completed} / {tasks.length}</strong><span>academic tasks complete</span></div></section>
    <div className="academic-container-grid">{containers.map((container) => <AcademicContainerCard key={container.id} container={container} tasks={tasks.filter((task) => task.academicContainerId === container.id)} onRename={onRename} onAddTask={() => onAddTask(container.id)} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}</div>
    <footer className="page-footer">Academic work, organized around your priorities.</footer>
  </div>
}

function CareerPage({ projects, tasks, onRename, onAddProject, onAddTask, onToggle, onDelete, onEdit }: {
  projects: CareerProject[]; tasks: Task[]; onRename: (id: string, title: string) => void; onAddProject: () => void; onAddTask: (id: string) => void; onToggle: (id: string) => void; onDelete: (task: Task) => void; onEdit: (task: Task) => void
}) {
  const completed = tasks.filter((task) => task.completed).length
  const unassigned = tasks.filter((task) => !task.careerProjectId)
  return <div className="page-content academics-page career-page">
    <section className="welcome-row academics-welcome"><div><p className="eyebrow">CAREER WORKSPACE</p><h1>Career</h1><p className="welcome-copy">Turn bigger career goals into clear projects and manageable next steps.</p></div><button className="primary-button add-task-button" onClick={onAddProject}><Plus size={18} />Add project</button></section>
    <section className="academics-overview"><div><strong>{projects.length}</strong><span>{projects.length === 1 ? 'project' : 'projects'}</span></div><i /><div><strong>{completed} / {tasks.length}</strong><span>career tasks complete</span></div></section>
    {projects.length ? <div className="academic-container-grid">{projects.map((project) => <CareerProjectCard key={project.id} project={project} tasks={tasks.filter((task) => task.careerProjectId === project.id)} onRename={onRename} onAddTask={() => onAddTask(project.id)} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}</div> : <section className="career-empty-state"><div className="career-empty-icon"><BriefcaseBusiness size={20} /></div><h2>Start with a project</h2><p>Give a goal a name, then add the small tasks that will move it forward.</p><button className="primary-button" onClick={onAddProject}><Plus size={16} />Create your first project</button></section>}
    {unassigned.length > 0 && <section className="career-unassigned"><div className="career-unassigned-heading"><h2>Other career tasks</h2><span>{unassigned.length}</span></div>{unassigned.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} onDelete={() => onDelete(task)} onEdit={() => onEdit(task)} />)}</section>}
    <footer className="page-footer">Small, visible steps make big career goals easier to finish.</footer>
  </div>
}

function CareerProjectCard({ project, tasks, onRename, onAddTask, onToggle, onDelete, onEdit }: {
  project: CareerProject; tasks: Task[]; onRename: (id: string, title: string) => void; onAddTask: () => void; onToggle: (id: string) => void; onDelete: (task: Task) => void; onEdit: (task: Task) => void
}) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(project.title)
  const completed = tasks.filter((task) => task.completed).length
  function saveTitle() { onRename(project.id, draft.trim() || 'Untitled project'); setEditing(false) }
  return <section className="academic-container career-project-card"><header className="academic-container-header"><div className="academic-container-mark career-project-mark"><BriefcaseBusiness size={17} /></div><div className="academic-container-heading">{editing ? <input autoFocus value={draft} aria-label="Project title" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') { setDraft(project.title); setEditing(false) } }} /> : <h2>{project.title}</h2>}<span>{tasks.length} {tasks.length === 1 ? 'subtask' : 'subtasks'} · {completed} complete</span></div>{editing ? <button className="academic-icon-action save-title" aria-label="Save project name" onClick={saveTitle}><Check size={16} /></button> : <button className="academic-icon-action" aria-label={`Edit ${project.title} name`} onClick={() => { setDraft(project.title); setEditing(true) }}><Pencil size={15} /></button>}</header><div className="academic-container-progress"><span style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /></div><div className="academic-container-tasks">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} onDelete={() => onDelete(task)} onEdit={() => onEdit(task)} />) : <p className="academic-empty">Add the first subtask that will move this project forward.</p>}</div><button className="category-add academic-add-task" onClick={onAddTask}><Plus size={14} />Add subtask</button></section>
}

function AcademicContainerCard({ container, tasks, onRename, onAddTask, onToggle, onDelete, onEdit }: {
  container: AcademicContainer; tasks: Task[]; onRename: (id: string, title: string) => void; onAddTask: () => void; onToggle: (id: string) => void; onDelete: (task: Task) => void; onEdit: (task: Task) => void
}) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(container.title)
  const completed = tasks.filter((task) => task.completed).length
  function saveTitle() { onRename(container.id, draft.trim() || 'Untitled container'); setEditing(false) }
  return <section className="academic-container"><header className="academic-container-header"><div className="academic-container-mark"><BookOpen size={17} /></div><div className="academic-container-heading">{editing ? <input autoFocus value={draft} aria-label="Container title" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') { setDraft(container.title); setEditing(false) } }} /> : <h2>{container.title}</h2>}<span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · {completed} complete</span></div>{editing ? <button className="academic-icon-action save-title" aria-label="Save container name" onClick={saveTitle}><Check size={16} /></button> : <button className="academic-icon-action" aria-label={`Edit ${container.title} name`} onClick={() => { setDraft(container.title); setEditing(true) }}><Pencil size={15} /></button>}</header><div className="academic-container-progress"><span style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /></div><div className="academic-container-tasks">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} onDelete={() => onDelete(task)} onEdit={() => onEdit(task)} />) : <p className="academic-empty">No tasks here yet. Add coursework or a study task.</p>}</div><button className="category-add academic-add-task" onClick={onAddTask}><Plus size={14} />Add task</button></section>
}

function TaskDialog({ initialTask, initialCategory, academicContainerId, careerProjectId, onClose, onSave }: { initialTask: Task | null; initialCategory: Category; academicContainerId?: string; careerProjectId?: string; onClose: () => void; onSave: (details: { title: string; category: Category; duration?: number; priority: boolean; academicContainerId?: string; careerProjectId?: string }) => void }) {
  const [title, setTitle] = useState(initialTask?.title ?? '')
  const [category, setCategory] = useState<Category>(initialTask?.category ?? initialCategory)
  const [duration, setDuration] = useState(initialTask?.duration?.toString() ?? '')
  const [priority, setPriority] = useState(initialTask?.priority ?? false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) { setError('Add a task name to continue.'); inputRef.current?.focus(); return }
    const parsedDuration = Number(duration)
    if (duration && (!Number.isFinite(parsedDuration) || parsedDuration < 1 || parsedDuration > 999)) { setError('Minutes must be between 1 and 999.'); return }
    onSave({ title: cleanTitle, category: normalizeCategory(category), duration: duration ? parsedDuration : undefined, priority, academicContainerId, careerProjectId })
    onClose()
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description"><div className="dialog-top"><div className="dialog-mark"><Plus size={19} /></div><button className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div><h2 id="dialog-title">{initialTask ? 'Edit task' : careerProjectId ? 'Add project subtask' : academicContainerId ? 'Add academic task' : "Add to today's plan"}</h2><p id="dialog-description">{initialTask ? 'Update the task details and category.' : careerProjectId ? 'This task will appear in the selected career project.' : academicContainerId ? 'This task will appear in the selected academic container.' : 'Capture a specific task and assign it to a life area.'}</p><form onSubmit={submit} noValidate>
    <label htmlFor="task-title">Task name <span>Required</span></label><input ref={inputRef} id="task-title" value={title} onChange={(event) => { setTitle(event.target.value); setError('') }} placeholder="e.g. Practise DSA for 30 minutes" aria-invalid={Boolean(error)} />
    {error && <span className="field-error" role="alert">{error}</span>}
    <div className="form-row"><div><label htmlFor="task-category">Category</label><select id="task-category" value={category} onChange={(event) => setCategory(normalizeCategory(event.target.value))}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="task-duration">Minutes <span>Optional</span></label><input id="task-duration" type="number" min="1" max="999" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="25" /></div></div>
    <label className="priority-control"><input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} />Mark as priority</label>
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{initialTask ? 'Save changes' : 'Create task'}</button></div>
  </form></section></div>
}

function PlaceholderPage({ destination, onBack }: { destination: Destination; onBack: () => void }) {
  const navItem = navigation.find((item) => item.label === destination)
  const Icon = destination === 'Settings' ? Settings : navItem?.icon ?? LayoutDashboard
  return <div className="placeholder-page"><div className="placeholder-card"><div className="placeholder-icon"><Icon size={23} /></div><p className="eyebrow">A SPACE FOR WHAT MATTERS</p><h1>{destination}</h1><p>This part of your Life OS is taking shape. For now, come back to Today and choose your next small step.</p><button className="primary-button" onClick={onBack}><LayoutDashboard size={17} />Back to Today</button><span className="placeholder-footnote">One calm step at a time.</span></div><footer className="page-footer">Made for your life, not the other way around.</footer></div>
}

export default App
