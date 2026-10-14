import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, ArrowUpRight, Brain, CalendarDays, Check, Edit3, Lightbulb, Pin, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { loadThinkSpaceData, saveThinkSpaceData } from './storage'
import { migrateResource, writeResource } from '../data/api'
import { starterCategories } from './types'
import type { ThinkSpaceData, Thought } from './types'
import './ThinkSpacePage.css'

type View = 'All thoughts' | 'Pinned' | 'Dreams & goals' | 'Ideas to explore' | 'Personal reflections' | 'Due for review' | 'Archived'
const views: View[] = ['All thoughts', 'Pinned', 'Dreams & goals', 'Ideas to explore', 'Personal reflections', 'Due for review', 'Archived']
const today = () => new Date().toISOString().slice(0, 10)
const makeId = () => `thought-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
const actionTitle = (thought: Thought) => thought.title?.trim() || thought.content.split('\n')[0].slice(0, 80) || 'A thought to explore'

export default function ThinkSpacePage({ onCreateTask }: { onCreateTask: (title: string, thoughtId: string) => void }) {
  const [data, setData] = useState<ThinkSpaceData>(() => loadThinkSpaceData())
  const [view, setView] = useState<View>('All thoughts')
  const [search, setSearch] = useState('')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [tags, setTags] = useState('')
  const [editing, setEditing] = useState<Thought | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editReviewDate, setEditReviewDate] = useState('')
  const [actionThought, setActionThought] = useState<Thought | null>(null)
  const [notice, setNotice] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [migrationComplete, setMigrationComplete] = useState(false)

  useEffect(() => {
    let cancelled = false
    const local = loadThinkSpaceData()
    void migrateResource('think_space', local).then((snapshot) => {
      if (cancelled) return
      setData(snapshot.data)
      setMigrationComplete(true)
      setCloudError('')
    }).catch((error: unknown) => {
      if (!cancelled) setCloudError(error instanceof Error ? error.message : 'MongoDB could not be reached. Your existing local thoughts are still available.')
    }).finally(() => { if (!cancelled) setCloudReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { if (cloudReady) saveThinkSpaceData(data) }, [cloudReady, data])
  useEffect(() => {
    if (!cloudReady || !dirty) return
    const timer = window.setTimeout(() => {
      const save = migrationComplete
        ? writeResource('think_space', data)
        : migrateResource('think_space', data).then((result) => { setMigrationComplete(true); setData(result.data) })
      void save.then(() => { setCloudError(''); setDirty(false) }).catch((error: unknown) => {
        setCloudError(error instanceof Error ? error.message : 'MongoDB could not save this thought.')
      })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [cloudReady, data, dirty, migrationComplete])

  const activeThoughts = data.thoughts.filter((thought) => !thought.archived)
  const counts: Record<View, number> = {
    'All thoughts': activeThoughts.length,
    Pinned: activeThoughts.filter((thought) => thought.pinned).length,
    'Dreams & goals': activeThoughts.filter((thought) => thought.category === 'Dreams & Goals').length,
    'Ideas to explore': activeThoughts.filter((thought) => thought.category === 'Ideas to Explore').length,
    'Personal reflections': activeThoughts.filter((thought) => thought.category === 'Personal Reflections').length,
    'Due for review': activeThoughts.filter((thought) => thought.reviewDate && thought.reviewDate <= today()).length,
    Archived: data.thoughts.filter((thought) => thought.archived).length,
  }
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return data.thoughts.filter((thought) => {
      const matchesView = view === 'Archived' ? thought.archived
        : thought.archived ? false
          : view === 'Pinned' ? thought.pinned
            : view === 'Dreams & goals' ? thought.category === 'Dreams & Goals'
              : view === 'Ideas to explore' ? thought.category === 'Ideas to Explore'
                : view === 'Personal reflections' ? thought.category === 'Personal Reflections'
                  : view === 'Due for review' ? Boolean(thought.reviewDate && thought.reviewDate <= today()) : true
      const text = [thought.title, thought.content, thought.category, ...thought.tags].join(' ').toLocaleLowerCase()
      return matchesView && (!query || text.includes(query))
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }, [data.thoughts, search, view])

  function updateThought(id: string, update: Partial<Thought>) {
    setDirty(true)
    setData((current) => ({ ...current, thoughts: current.thoughts.map((thought) => thought.id === id ? { ...thought, ...update, updatedAt: new Date().toISOString() } : thought) }))
  }
  function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanContent = content.trim()
    if (!cleanContent) return
    const now = new Date().toISOString()
    const chosenCategory = category === '__custom' ? customCategory.trim() : category
    const thought: Thought = { id: makeId(), ...(title.trim() ? { title: title.trim() } : {}), content: cleanContent, ...(chosenCategory ? { category: chosenCategory } : {}), tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), createdAt: now, updatedAt: now, pinned: false, archived: false }
    setDirty(true)
    setData((current) => ({ ...current, thoughts: [thought, ...current.thoughts] }))
    setContent(''); setTitle(''); setCategory(''); setCustomCategory(''); setTags(''); setView('All thoughts'); setNotice('Thought captured. Come back to it whenever you like.')
  }
  function openEdit(thought: Thought) {
    setEditing(thought); setEditTitle(thought.title ?? ''); setEditContent(thought.content); setEditCategory(thought.category ?? ''); setEditTags(thought.tags.join(', ')); setEditReviewDate(thought.reviewDate ?? '')
  }
  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !editContent.trim()) return
    const updated: Partial<Thought> = { title: editTitle.trim() || undefined, content: editContent.trim(), category: editCategory.trim() || undefined, tags: editTags.split(',').map((tag) => tag.trim()).filter(Boolean), reviewDate: editReviewDate || undefined }
    updateThought(editing.id, updated); setEditing(null)
  }
  function developGoal(thought: Thought) {
    const now = new Date().toISOString()
    const goal: Thought = { id: makeId(), title: actionTitle(thought), content: thought.content, category: 'Dreams & Goals', tags: ['Goal'], createdAt: now, updatedAt: now, pinned: false, archived: false, isGoal: true, sourceThoughtId: thought.id }
    setDirty(true)
    setData((current) => ({ ...current, thoughts: [goal, ...current.thoughts] })); setActionThought(null); setView('Dreams & goals'); setNotice('Added to Dreams & Goals and linked to the original thought.')
  }
  function createLinkedTask(thought: Thought) {
    onCreateTask(actionTitle(thought), thought.id); setActionThought(null); setNotice('Task added to Today and linked to this thought.')
  }
  function removeThought(thought: Thought) {
    const hasLinkedGoal = data.thoughts.some((item) => item.sourceThoughtId === thought.id)
    if (!window.confirm(hasLinkedGoal ? 'This thought has a linked Dreams & Goals entry. Delete both permanently?' : 'Delete this thought permanently?')) return
    setDirty(true)
    setData((current) => ({ ...current, thoughts: current.thoughts.filter((item) => item.id !== thought.id && item.sourceThoughtId !== thought.id) }))
  }

  if (!cloudReady) return <div className="page-content"><p className="think-cloud-warning" role="status">Loading your thoughts…</p></div>

  return <div className="think-page page-content">
    {cloudError && <p className="think-cloud-warning" role="status">MongoDB is unavailable: {cloudError}. Changes stay in this browser and will be retried after another edit.</p>}
    <header className="think-header"><div><p className="eyebrow">YOUR PRIVATE THOUGHT GARDEN</p><h1>A space for what&apos;s on your mind.</h1><p className="welcome-copy">Capture now. Make sense of it later.</p></div><span className="think-header-mark"><Brain size={21} /></span></header>
    <form className="think-capture" onSubmit={capture}>
      <div className="think-capture-heading"><span><Lightbulb size={17} /></span><div><strong>Let it out of your head</strong><small>No need to organize it first.</small></div></div>
      <label className="think-sr-only" htmlFor="thought-content">Thought</label><textarea id="thought-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="An idea, feeling, goal, or random thought… anything goes." rows={4} required />
      <div className="think-capture-options"><input aria-label="Optional title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a title (optional)" /><select aria-label="Optional category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">No category</option>{starterCategories.map((item) => <option key={item}>{item}</option>)}<option value="__custom">Custom category…</option></select>{category === '__custom' && <input aria-label="Custom category" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Name a category" />}</div>
      <div className="think-capture-footer"><input aria-label="Optional tags, separated by commas" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, separated by commas (optional)" /><button type="submit" className="primary-button"><Plus size={16} />Capture thought</button></div>
    </form>
    {notice && <p className="think-notice" role="status"><Check size={14} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></p>}
    <div className="think-browse"><aside className="think-sidebar" aria-label="Thought filters"><p className="eyebrow">BROWSE</p>{views.map((item) => <button key={item} className={`think-view ${view === item ? 'selected' : ''}`} onClick={() => setView(item)}><span>{item}</span><small>{counts[item]}</small></button>)}</aside>
      <section className="think-results"><div className="think-results-top"><div><p className="eyebrow">A LITTLE SPACE TO THINK</p><h2>{view}</h2></div><label className="think-search"><Search size={16} /><input aria-label="Search thoughts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search thoughts" /></label></div>
        {visible.length ? <div className="thought-grid">{visible.map((thought) => <article className={`thought-card ${thought.isGoal ? 'thought-goal' : ''}`} key={thought.id}>
          <div className="thought-card-top"><div className="thought-labels">{thought.category && <span className="thought-category">{thought.category}</span>}{thought.isGoal && <span className="thought-goal-label"><Sparkles size={11} />Goal</span>}</div><button className={`thought-icon-button ${thought.pinned ? 'is-pinned' : ''}`} aria-label={thought.pinned ? 'Unpin thought' : 'Pin thought'} title={thought.pinned ? 'Unpin' : 'Pin'} onClick={() => updateThought(thought.id, { pinned: !thought.pinned })}><Pin size={15} /></button></div>
          {thought.title && <h3>{thought.title}</h3>}<p className="thought-content">{thought.content}</p>
          {thought.sourceThoughtId && <button className="thought-origin" onClick={() => { const original = data.thoughts.find((item) => item.id === thought.sourceThoughtId); if (original) openEdit(original) }}><ArrowUpRight size={12} />View original thought</button>}
          {!!thought.tags.length && <div className="thought-tags">{thought.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          <div className="thought-date"><span>Added {dateLabel(thought.createdAt)}</span>{thought.updatedAt !== thought.createdAt && <span>Edited {dateLabel(thought.updatedAt)}</span>}{thought.reviewDate && <span className={thought.reviewDate <= today() && !thought.archived ? 'review-due' : ''}><CalendarDays size={12} />Review {dateLabel(thought.reviewDate)}</span>}</div>
          <div className="thought-actions"><button onClick={() => openEdit(thought)}><Edit3 size={13} />Edit</button>{!thought.archived && <button onClick={() => setActionThought(thought)}><ArrowUpRight size={13} />Turn into action</button>}<button aria-label={thought.archived ? 'Restore thought' : 'Archive thought'} onClick={() => updateThought(thought.id, { archived: !thought.archived })}><Archive size={13} />{thought.archived ? 'Restore' : 'Archive'}</button><button className="thought-delete" aria-label="Delete thought" onClick={() => removeThought(thought)}><Trash2 size={13} /></button></div>
        </article>)}</div> : <div className="think-empty"><span><Brain size={21} /></span><h3>{search ? 'No thoughts found' : view === 'All thoughts' ? 'Your space is ready' : `Nothing in ${view.toLowerCase()} yet`}</h3><p>{search ? 'Try another word or clear your search.' : 'Capture whatever is on your mind. It can stay a thought for as long as you like.'}</p></div>}
      </section>
    </div>
    {editing && <div className="think-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="think-modal" role="dialog" aria-modal="true" aria-labelledby="edit-thought-title"><div className="think-modal-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2 id="edit-thought-title">Edit thought</h2></div><button aria-label="Close" className="thought-icon-button" onClick={() => setEditing(null)}><X size={17} /></button></div><form onSubmit={saveEdit}><label>Title <span>Optional</span><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><label>Thought<textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={5} required /></label><label>Category <span>Optional</span><input list="think-category-options" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} placeholder="Choose or type a category" /><datalist id="think-category-options">{starterCategories.map((item) => <option key={item} value={item} />)}</datalist></label><label>Tags <span>Comma separated</span><input value={editTags} onChange={(event) => setEditTags(event.target.value)} /></label><label>Review date <span>Optional</span><input type="date" value={editReviewDate} onChange={(event) => setEditReviewDate(event.target.value)} /></label><div className="think-modal-actions"><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" type="submit"><Check size={15} />Save changes</button></div></form></section></div>}
    {actionThought && <div className="think-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActionThought(null) }}><section className="think-modal think-action-modal" role="dialog" aria-modal="true" aria-labelledby="turn-action-title"><div className="think-modal-heading"><div><p className="eyebrow">ONLY IF YOU WANT TO</p><h2 id="turn-action-title">Turn into action</h2></div><button aria-label="Close" className="thought-icon-button" onClick={() => setActionThought(null)}><X size={17} /></button></div><p className="think-action-copy">Your original thought stays here and remains linked.</p><button className="think-action-choice" onClick={() => createLinkedTask(actionThought)}><span><Check size={16} /></span><div><strong>Create a task</strong><small>Add it to Today&apos;s task list.</small></div><ArrowUpRight size={15} /></button><button className="think-action-choice" onClick={() => developGoal(actionThought)}><span><Sparkles size={16} /></span><div><strong>Develop into a goal</strong><small>Save a linked entry in Dreams &amp; Goals.</small></div><ArrowUpRight size={15} /></button><button className="think-action-keep" onClick={() => setActionThought(null)}>Keep as a thought</button></section></div>}
  </div>
}
