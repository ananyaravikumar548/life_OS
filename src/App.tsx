import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Bell, BookOpen, BriefcaseBusiness, Check, ChevronRight,
  Brain, Dumbbell, GraduationCap, Heart, LayoutDashboard, Menu, Plus,
  Pencil, Search, Settings, Target, Utensils, X,
} from 'lucide-react'
import './App.css'
import FitnessPage from './fitness/FitnessPage'
import NutritionPage from './nutrition/NutritionPage'
import ThinkSpacePage from './thinkspace/ThinkSpacePage'
import { migrateResource, readLocalSnapshot, writeLocalSnapshot, writeResource } from './data/api'

type Category = 'Academics' | 'Career' | 'Personal'
type Task = {
  id: string
  title: string
  category: Category
  duration?: number
  completed: boolean
  priority: boolean
  academicContainerId?: string
  careerProjectId?: string
  originThoughtId?: string
  createdAt?: string
  updatedAt?: string
}
type AcademicContainer = { id: string; title: string; createdAt?: string; updatedAt?: string }
type CareerProject = { id: string; title: string; createdAt?: string; updatedAt?: string }
type Destination = 'Today' | 'Think Space' | 'Fitness' | 'Nutrition' | 'Career' | 'Academics' | 'Progress' | 'Settings'
type NavItem = { label: Destination; icon: typeof LayoutDashboard }
type Filter = 'All' | 'Pending' | 'Completed'

const navigation: NavItem[] = [
  { label: 'Today', icon: LayoutDashboard }, { label: 'Think Space', icon: Brain },
  { label: 'Fitness', icon: Dumbbell },
  { label: 'Nutrition', icon: Utensils }, { label: 'Career', icon: BriefcaseBusiness },
  { label: 'Academics', icon: GraduationCap }, { label: 'Progress', icon: Activity },
]

type Workspace = { tasks: Task[]; academicContainers: AcademicContainer[]; careerProjects: CareerProject[] }

const categoryIcons: Record<Category, typeof BookOpen> = {
  Academics: BookOpen, Career: BriefcaseBusiness, Personal: Heart,
}
const categories: Category[] = ['Academics', 'Career', 'Personal']
const createId = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

function loadWorkspaceBackup(): Workspace {
  const saved = readLocalSnapshot<Partial<Workspace>>('workspace')
  return {
    tasks: Array.isArray(saved?.tasks) ? saved.tasks.filter((item): item is Task => Boolean(item && typeof item.id === 'string' && typeof item.title === 'string' && ['Academics', 'Career', 'Personal'].includes(item.category) && typeof item.completed === 'boolean' && typeof item.priority === 'boolean')) : [],
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
  const [filter, setFilter] = useState<Filter>('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogCategory, setDialogCategory] = useState<Category>('Personal')
  const [dialogAcademicContainerId, setDialogAcademicContainerId] = useState<string | undefined>()
  const [dialogCareerProjectId, setDialogCareerProjectId] = useState<string | undefined>()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const completedCount = tasks.filter((task) => task.completed).length
  const completion = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0
  const visibleTasks = useMemo(() => tasks.filter((task) => filter === 'All' || (filter === 'Completed' ? task.completed : !task.completed)), [tasks, filter])

  useEffect(() => {
    let cancelled = false
    const local = loadWorkspaceBackup()
    void migrateResource('workspace', local).then((snapshot) => {
      if (cancelled) return
      const workspace = snapshot.data
      setTasks(workspace.tasks); setAcademicContainers(workspace.academicContainers); setCareerProjects(workspace.careerProjects)
      setMigrationComplete(true)
      setCloudError('')
    }).catch((error: unknown) => {
      if (cancelled) return
      const local = loadWorkspaceBackup()
      setTasks(local.tasks); setAcademicContainers(local.academicContainers); setCareerProjects(local.careerProjects)
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
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed, updatedAt: new Date().toISOString() } : task))
  }

  function createTask(title: string, category: Category, duration?: number, academicContainerId?: string, careerProjectId?: string, originThoughtId?: string) {
    setWorkspaceDirty(true)
    const now = new Date().toISOString()
    setTasks((current) => [{ id: createId('task'), title, category, duration, completed: false, priority: false, createdAt: now, updatedAt: now, ...(academicContainerId ? { academicContainerId } : {}), ...(careerProjectId ? { careerProjectId } : {}), ...(originThoughtId ? { originThoughtId } : {}) }, ...current])
    setFilter('All')
  }

  function createTaskFromThought(title: string, originThoughtId: string) {
    createTask(title, 'Personal', undefined, undefined, undefined, originThoughtId)
    changeDestination('Today')
  }

  function openQuickAdd(category: Category = 'Personal', academicContainerId?: string, careerProjectId?: string) {
    setDialogCategory(category)
    setDialogAcademicContainerId(academicContainerId)
    setDialogCareerProjectId(careerProjectId)
    setDialogOpen(true)
  }

  function renameAcademicContainer(id: string, title: string) {
    setWorkspaceDirty(true)
    setAcademicContainers((current) => current.map((container) => container.id === id ? { ...container, title, updatedAt: new Date().toISOString() } : container))
  }

  function addAcademicContainer() {
    setWorkspaceDirty(true)
    const now = new Date().toISOString()
    setAcademicContainers((current) => [...current, { id: createId('academic'), title: `Untitled container ${current.length + 1}`, createdAt: now, updatedAt: now }])
  }

  function renameCareerProject(id: string, title: string) {
    setWorkspaceDirty(true)
    setCareerProjects((current) => current.map((project) => project.id === id ? { ...project, title, updatedAt: new Date().toISOString() } : project))
  }

  function addCareerProject() {
    setWorkspaceDirty(true)
    const now = new Date().toISOString()
    setCareerProjects((current) => [...current, { id: createId('career'), title: `New project ${current.length + 1}`, createdAt: now, updatedAt: now }])
  }

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
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
          <TodayPage tasks={visibleTasks} totalTasks={tasks.length} completed={completedCount} completion={completion} filter={filter} onFilter={setFilter} onToggle={toggleTask} onAdd={openQuickAdd} addButtonRef={addButtonRef} />
        ) : active === 'Academics' ? (
          <AcademicsPage containers={academicContainers} tasks={tasks.filter((task) => task.category === 'Academics')} onRename={renameAcademicContainer} onAddContainer={addAcademicContainer} onAddTask={(containerId) => openQuickAdd('Academics', containerId)} onToggle={toggleTask} />
        ) : active === 'Career' ? (
          <CareerPage projects={careerProjects} tasks={tasks.filter((task) => task.category === 'Career')} onRename={renameCareerProject} onAddProject={addCareerProject} onAddTask={(projectId) => openQuickAdd('Career', undefined, projectId)} onToggle={toggleTask} />
        ) : active === 'Think Space' ? (
          <ThinkSpacePage onCreateTask={createTaskFromThought} />
        ) : active === 'Fitness' ? (
          <FitnessPage />
        ) : active === 'Nutrition' ? (
          <NutritionPage />
        ) : <PlaceholderPage destination={active} onBack={() => changeDestination('Today')} />}
      </main>
      {dialogOpen && <QuickAddTaskDialog initialCategory={dialogCategory} initialContainerId={dialogAcademicContainerId} initialProjectId={dialogCareerProjectId} onClose={closeDialog} onCreate={createTask} />}
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

function TodayPage({ tasks, totalTasks, completed, completion, filter, onFilter, onToggle, onAdd, addButtonRef }: {
  tasks: Task[]; totalTasks: number; completed: number; completion: number; filter: Filter; onFilter: (filter: Filter) => void; onToggle: (id: string) => void; onAdd: (category?: Category) => void; addButtonRef: React.RefObject<HTMLButtonElement | null>
}) {
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())
  const remaining = totalTasks - completed
  return (
    <div className="page-content">
      <section className="welcome-row">
        <div><p className="date-label"><span className="date-dot" />{today}</p><h1>Today's plan</h1><p className="welcome-copy">Prioritize the work that moves your goals forward.</p></div>
        <button ref={addButtonRef} className="primary-button add-task-button" onClick={() => onAdd()}><Plus size={18} strokeWidth={2.3} />Add a task</button>
      </section>

      <DailyProgressCard completed={completed} total={totalTasks} completion={completion} remaining={remaining} />

      <section className="tasks-section">
        <div className="section-heading-row"><div><p className="eyebrow">YOUR WORK, BY AREA</p><h2>Today's tasks</h2></div><span className="demo-label">ILLUSTRATIVE TASKS</span></div>
        <div className="task-toolbar board-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter tasks">{(['All', 'Pending', 'Completed'] as const).map((tab) => <button role="tab" aria-selected={filter === tab} className={filter === tab ? 'selected' : ''} key={tab} onClick={() => onFilter(tab)}>{tab}{tab === 'All' && <span className="filter-count">{totalTasks}</span>}</button>)}</div><span className="task-section-meta">{completed} of {totalTasks} complete</span></div>
        <div className="category-board">{categories.map((category) => <CategoryTaskCard key={category} category={category} tasks={tasks.filter((task) => task.category === category)} filter={filter} onToggle={onToggle} onAdd={() => onAdd(category)} />)}</div>
      </section>
      <footer className="page-footer">A clear plan. Focused work. Measurable progress.</footer>
    </div>
  )
}

function DailyProgressCard({ completed, total, completion, remaining }: { completed: number; total: number; completion: number; remaining: number }) {
  return (
    <section className="progress-card" aria-label="Daily progress">
      <div className="progress-card-content"><p className="progress-eyebrow">DAILY COMPLETION</p><h2>{remaining === 0 && total > 0 ? 'Daily plan complete' : total === 0 ? 'Set your plan for today' : 'Keep your priorities moving'}</h2><p className="progress-description">{total === 0 ? 'Add a task to start tracking progress.' : `${completed} of ${total} ${total === 1 ? 'task' : 'tasks'} completed`}</p><div className="progress-track"><span style={{ width: `${completion}%` }} /></div></div>
      <div className="progress-summary"><strong>{completion}<small>%</small></strong><span>{total === 0 ? 'No tasks added' : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}</span></div>
    </section>
  )
}

function CategoryTaskCard({ category, tasks, filter, onToggle, onAdd }: { category: Category; tasks: Task[]; filter: Filter; onToggle: (id: string) => void; onAdd: () => void }) {
  const Icon = categoryIcons[category]
  const complete = tasks.filter((task) => task.completed).length
  const visibleTasks = tasks.filter((task) => filter === 'All' || (filter === 'Completed' ? task.completed : !task.completed))
  return (
    <section className={`category-card category-card-${category.toLowerCase()}`} aria-label={`${category} tasks`}>
      <header className="category-card-header"><div className="category-card-icon"><Icon size={17} strokeWidth={1.8} /></div><div className="category-card-title"><h3>{category}</h3><span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span></div><span className="category-card-count">{complete}/{tasks.length}</span></header>
      <div className="category-card-progress"><span><i style={{ width: `${tasks.length ? (complete / tasks.length) * 100 : 0}%` }} /></span></div>
      <div className="category-card-tasks">{visibleTasks.length ? visibleTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} />) : <p className="category-empty">{tasks.length === 0 ? 'No tasks in this area yet.' : filter === 'Completed' ? 'No completed tasks in this area.' : 'All tasks in this area are complete.'}</p>}</div>
      <button className="category-add" onClick={onAdd}><Plus size={14} />Add task</button>
    </section>
  )
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const Icon = categoryIcons[task.category]
  return (
    <div className={`task-row ${task.completed ? 'task-completed' : ''}`}>
      <button type="button" className={`task-checkbox ${task.completed ? 'checked' : ''}`} onClick={onToggle} aria-label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} aria-pressed={task.completed}>{task.completed && <Check size={13} strokeWidth={2.6} />}</button>
      <div className={`category-icon category-${task.category.toLowerCase()}`}><Icon size={16} strokeWidth={1.8} /></div>
      <div className="task-main"><span className="task-title">{task.title}</span><div className="task-meta"><span className={`category-name ${task.category.toLowerCase()}`}>{task.category}</span>{task.duration && <><i /> <span>{task.duration} min</span></>}{task.originThoughtId && <><i /> <span title={`Linked thought ${task.originThoughtId}`}>From Think Space</span></>}</div></div>
      {task.priority && <span className="priority-tag"><span />Priority</span>}
    </div>
  )
}

function AcademicsPage({ containers, tasks, onRename, onAddContainer, onAddTask, onToggle }: {
  containers: AcademicContainer[]
  tasks: Task[]
  onRename: (id: string, title: string) => void
  onAddContainer: () => void
  onAddTask: (containerId: string) => void
  onToggle: (id: string) => void
}) {
  const completed = tasks.filter((task) => task.completed).length
  return (
    <div className="page-content academics-page">
      <section className="welcome-row academics-welcome">
        <div><p className="eyebrow">ACADEMIC WORKSPACE</p><h1>Academics</h1><p className="welcome-copy">Organize coursework by subject, class, or project. Rename each container to fit your plan.</p></div>
        <button className="primary-button add-task-button" onClick={onAddContainer}><Plus size={18} />Add container</button>
      </section>
      <section className="academics-overview"><div><strong>{containers.length}</strong><span>containers</span></div><i /><div><strong>{completed} / {tasks.length}</strong><span>academic tasks complete</span></div></section>
      <div className="academic-container-grid">{containers.map((container) => <AcademicContainerCard key={container.id} container={container} tasks={tasks.filter((task) => task.academicContainerId === container.id)} onRename={onRename} onAddTask={() => onAddTask(container.id)} onToggle={onToggle} />)}</div>
      <footer className="page-footer">Academic work, organized around your priorities.</footer>
    </div>
  )
}

function CareerPage({ projects, tasks, onRename, onAddProject, onAddTask, onToggle }: {
  projects: CareerProject[]
  tasks: Task[]
  onRename: (id: string, title: string) => void
  onAddProject: () => void
  onAddTask: (projectId: string) => void
  onToggle: (id: string) => void
}) {
  const completed = tasks.filter((task) => task.completed).length
  const unassignedTasks = tasks.filter((task) => !task.careerProjectId)
  return (
    <div className="page-content academics-page career-page">
      <section className="welcome-row academics-welcome">
        <div><p className="eyebrow">CAREER WORKSPACE</p><h1>Career</h1><p className="welcome-copy">Turn bigger career goals into clear projects and manageable next steps.</p></div>
        <button className="primary-button add-task-button" onClick={onAddProject}><Plus size={18} />Add project</button>
      </section>
      <section className="academics-overview"><div><strong>{projects.length}</strong><span>{projects.length === 1 ? 'project' : 'projects'}</span></div><i /><div><strong>{completed} / {tasks.length}</strong><span>career tasks complete</span></div></section>
      {projects.length ? <div className="academic-container-grid">{projects.map((project) => <CareerProjectCard key={project.id} project={project} tasks={tasks.filter((task) => task.careerProjectId === project.id)} onRename={onRename} onAddTask={() => onAddTask(project.id)} onToggle={onToggle} />)}</div> : <section className="career-empty-state"><div className="career-empty-icon"><BriefcaseBusiness size={20} /></div><h2>Start with a project</h2><p>Give a goal a name, then add the small tasks that will move it forward.</p><button className="primary-button" onClick={onAddProject}><Plus size={16} />Create your first project</button></section>}
      {unassignedTasks.length > 0 && <section className="career-unassigned"><div className="career-unassigned-heading"><h2>Other career tasks</h2><span>{unassignedTasks.length}</span></div>{unassignedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} />)}</section>}
      <footer className="page-footer">Small, visible steps make big career goals easier to finish.</footer>
    </div>
  )
}

function CareerProjectCard({ project, tasks, onRename, onAddTask, onToggle }: {
  project: CareerProject
  tasks: Task[]
  onRename: (id: string, title: string) => void
  onAddTask: () => void
  onToggle: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.title)
  const completed = tasks.filter((task) => task.completed).length
  function saveTitle() {
    onRename(project.id, draft.trim() || 'Untitled project')
    setEditing(false)
  }
  function cancelTitle() {
    setDraft(project.title)
    setEditing(false)
  }
  return (
    <section className="academic-container career-project-card">
      <header className="academic-container-header">
        <div className="academic-container-mark career-project-mark"><BriefcaseBusiness size={17} /></div>
        <div className="academic-container-heading">
          {editing ? <input autoFocus value={draft} aria-label="Project title" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') cancelTitle() }} /> : <h2>{project.title}</h2>}
          <span>{tasks.length} {tasks.length === 1 ? 'subtask' : 'subtasks'} · {completed} complete</span>
        </div>
        {editing ? <button className="academic-icon-action save-title" aria-label="Save project name" onClick={saveTitle}><Check size={16} /></button> : <button className="academic-icon-action" aria-label={`Edit ${project.title} name`} onClick={() => { setDraft(project.title); setEditing(true) }}><Pencil size={15} /></button>}
      </header>
      <div className="academic-container-progress"><span style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /></div>
      <div className="academic-container-tasks">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} />) : <p className="academic-empty">Add the first subtask that will move this project forward.</p>}</div>
      <button className="category-add academic-add-task" onClick={onAddTask}><Plus size={14} />Add subtask</button>
    </section>
  )
}

function AcademicContainerCard({ container, tasks, onRename, onAddTask, onToggle }: {
  container: AcademicContainer
  tasks: Task[]
  onRename: (id: string, title: string) => void
  onAddTask: () => void
  onToggle: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(container.title)
  const completed = tasks.filter((task) => task.completed).length
  function saveTitle() {
    onRename(container.id, draft.trim() || 'Untitled container')
    setEditing(false)
  }
  function cancelTitle() {
    setDraft(container.title)
    setEditing(false)
  }
  return (
    <section className="academic-container">
      <header className="academic-container-header">
        <div className="academic-container-mark"><BookOpen size={17} /></div>
        <div className="academic-container-heading">
          {editing ? <input autoFocus value={draft} aria-label="Container title" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveTitle(); if (event.key === 'Escape') cancelTitle() }} /> : <h2>{container.title}</h2>}
          <span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · {completed} complete</span>
        </div>
        {editing ? <button className="academic-icon-action save-title" aria-label="Save container name" onClick={saveTitle}><Check size={16} /></button> : <button className="academic-icon-action" aria-label={`Edit ${container.title} name`} onClick={() => { setDraft(container.title); setEditing(true) }}><Pencil size={15} /></button>}
      </header>
      <div className="academic-container-progress"><span style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /></div>
      <div className="academic-container-tasks">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} />) : <p className="academic-empty">No tasks here yet. Add coursework or a study task.</p>}</div>
      <button className="category-add academic-add-task" onClick={onAddTask}><Plus size={14} />Add task</button>
    </section>
  )
}

function QuickAddTaskDialog({ initialCategory, initialContainerId, initialProjectId, onClose, onCreate }: { initialCategory: Category; initialContainerId?: string; initialProjectId?: string; onClose: () => void; onCreate: (title: string, category: Category, duration?: number, academicContainerId?: string, careerProjectId?: string) => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>(initialCategory)
  const [duration, setDuration] = useState('')
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
    onCreate(cleanTitle, category, duration && parsedDuration > 0 ? parsedDuration : undefined, initialContainerId, initialProjectId)
    setTitle('')
    onClose()
  }
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'))
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
        <div className="dialog-top"><div className="dialog-mark"><Plus size={19} /></div><button className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
        <h2 id="dialog-title">{initialProjectId ? 'Add project subtask' : initialContainerId ? 'Add academic task' : "Add to today's plan"}</h2><p id="dialog-description">{initialProjectId ? 'This subtask will appear in this project and your Today plan.' : initialContainerId ? 'This task will appear in this container and your Today plan.' : 'Capture a specific task and assign it to a life area.'}</p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="task-title">{initialProjectId ? 'Subtask name' : 'Task name'} <span>Required</span></label><input ref={inputRef} id="task-title" value={title} onChange={(event) => { setTitle(event.target.value); setError('') }} placeholder={initialProjectId ? 'e.g. Draft the portfolio homepage' : 'e.g. Practise DSA for 30 minutes'} aria-invalid={Boolean(error)} aria-describedby={error ? 'task-error' : 'task-help'} />
          {error ? <span className="field-error" id="task-error" role="alert">{error}</span> : <span className="field-help" id="task-help">Use a clear action so it is easy to start and finish.</span>}
          <div className={`form-row ${initialProjectId ? 'project-form-row' : ''}`}>{!initialProjectId && <div><label htmlFor="task-category">Area <span>Optional</span></label><select id="task-category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>{(['Personal', 'Academics', 'Career'] as const).map((item) => <option key={item}>{item}</option>)}</select></div>}<div><label htmlFor="task-duration">Minutes <span>Optional</span></label><input id="task-duration" type="number" min="1" max="999" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="25" /></div></div>
          <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Plus size={16} />{initialProjectId ? 'Add subtask' : 'Create task'}</button></div>
        </form>
      </section>
    </div>
  )
}

function PlaceholderPage({ destination, onBack }: { destination: Destination; onBack: () => void }) {
  const navItem = navigation.find((item) => item.label === destination)
  const Icon = destination === 'Settings' ? Settings : navItem?.icon ?? LayoutDashboard
  return <div className="placeholder-page"><div className="placeholder-card"><div className="placeholder-icon"><Icon size={23} /></div><p className="eyebrow">A SPACE FOR WHAT MATTERS</p><h1>{destination}</h1><p>This part of your Life OS is taking shape. For now, come back to Today and choose your next small step.</p><button className="primary-button" onClick={onBack}><LayoutDashboard size={17} />Back to Today</button><span className="placeholder-footnote">One calm step at a time.</span></div><footer className="page-footer">Made for your life, not the other way around.</footer></div>
}

export default App
