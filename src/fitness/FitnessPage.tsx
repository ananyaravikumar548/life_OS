import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDown, ArrowUp, Check, Clock3, Dumbbell, Plus, Scale,
  Pencil, Trash2, TrendingUp, X,
} from 'lucide-react'
import { formatDate, isInCurrentWeek, localDateString, parseLocalDate, rangeLabel, sessionsInRange, weightsInRange, weeklyWorkoutCounts } from './analytics'
import { createId, loadFitnessData, saveFitnessData } from './storage'
import type { BodyWeightEntry, DateRange, ExerciseEntry, ExerciseSet, FitnessData, WorkoutSession, WorkoutStatus } from './types'
import { migrateResource, writeResource } from '../data/api'
import './FitnessPage.css'

type Section = 'workouts' | 'weight' | 'progress'
type ToastMessage = { id: number; message: string }
const workoutTypes = ['Upper Body', 'Lower Body', 'Full Body', 'Cardio', 'Custom']

export default function FitnessPage() {
  const [data, setData] = useState<FitnessData>(loadFitnessData)
  const [section, setSection] = useState<Section>('workouts')
  const [workoutToEdit, setWorkoutToEdit] = useState<WorkoutSession | null>(null)
  const [workoutOpen, setWorkoutOpen] = useState(false)
  const [weightToEdit, setWeightToEdit] = useState<BodyWeightEntry | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [migrationComplete, setMigrationComplete] = useState(false)

  useEffect(() => {
    let cancelled = false
    const local = loadFitnessData()
    void migrateResource('fitness', local).then((snapshot) => {
      if (cancelled) return
      setData(snapshot.data)
      setMigrationComplete(true)
      setCloudError('')
    }).catch((error: unknown) => {
      if (!cancelled) setCloudError(error instanceof Error ? error.message : 'MongoDB could not be reached. Your existing local records are still available.')
    }).finally(() => { if (!cancelled) setCloudReady(true) })
    return () => { cancelled = true }
  }, [])

  const notify = useCallback((message: string) => {
    const next = { id: Date.now(), message }
    setToast(next)
    window.setTimeout(() => setToast((current) => current?.id === next.id ? null : current), 3000)
  }, [])

  function commitData(next: FitnessData) {
    const saved = saveFitnessData(next)
    setData(next)
    if (!saved) notify('Could not save a local backup. Check this browser’s storage settings.')
    if (cloudReady) void (migrationComplete ? writeResource('fitness', next) : migrateResource('fitness', next).then((result) => { setMigrationComplete(true); setData(result.data) })).then(() => setCloudError('')).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'MongoDB could not save this change.'
      setCloudError(message); notify(`Kept your change locally. MongoDB save failed: ${message}`)
    })
  }

  function saveWorkout(session: WorkoutSession) {
    commitData({ ...data, workouts: [session, ...data.workouts.filter((item) => item.id !== session.id)] })
    setWorkoutOpen(false)
    setWorkoutToEdit(null)
    notify(session.status === 'rest' ? 'Rest day saved.' : 'Workout saved.')
  }

  function deleteWorkout(session: WorkoutSession) {
    if (!window.confirm(`Delete the ${session.workoutType.toLowerCase()} entry from ${formatDate(session.date)}? This cannot be undone.`)) return
    commitData({ ...data, workouts: data.workouts.filter((item) => item.id !== session.id) })
    notify('Workout entry deleted.')
  }

  function saveBodyWeight(entry: BodyWeightEntry, replaceId?: string) {
    commitData({ ...data, bodyWeights: [entry, ...data.bodyWeights.filter((item) => item.id !== entry.id && item.id !== replaceId)] })
    setWeightOpen(false)
    setWeightToEdit(null)
    notify(replaceId ? 'Body-weight entry replaced.' : 'Body weight saved.')
  }

  function deleteBodyWeight(entry: BodyWeightEntry) {
    if (!window.confirm(`Delete the ${entry.weightKg.toFixed(1)} kg entry from ${formatDate(entry.date)}? This cannot be undone.`)) return
    commitData({ ...data, bodyWeights: data.bodyWeights.filter((item) => item.id !== entry.id) })
    notify('Body-weight entry deleted.')
  }

  function openWorkout(session?: WorkoutSession) {
    setWorkoutToEdit(session ?? null)
    setWorkoutOpen(true)
  }

  function openWeight(entry?: BodyWeightEntry) {
    setWeightToEdit(entry ?? null)
    setWeightOpen(true)
  }

  const thisWeek = data.workouts.filter((session) => session.status === 'completed' && isInCurrentWeek(session.date))
  const thisWeekMinutes = thisWeek.reduce((total, session) => total + (session.durationMinutes ?? 0), 0)
  const latestWeight = [...data.bodyWeights].sort((a, b) => b.date.localeCompare(a.date))[0]
  const sortedWorkouts = useMemo(() => [...data.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? '')), [data.workouts])

  if (!cloudReady) return <div className="page-content"><p className="fitness-cloud-warning" role="status">Loading your fitness records…</p></div>

  return (
    <div className="page-content fitness-page">
      {cloudError && <p className="fitness-cloud-warning" role="status">MongoDB is unavailable: {cloudError}. Changes are kept in this browser until the database reconnects.</p>}
      <section className="fitness-welcome">
        <div><p className="eyebrow">FITNESS WORKSPACE</p><h1>Your strength journey.</h1><p className="welcome-copy">Build strength, one session at a time.</p></div>
        <div className="fitness-primary-actions">
          <button className="secondary-button" onClick={() => openWeight()}><Scale size={16} />Log body weight</button>
          <button className="primary-button" onClick={() => openWorkout()}><Plus size={17} />Log workout</button>
        </div>
      </section>

      <section className="fitness-summary" aria-label="Fitness summary">
        <SummaryCard icon={<Dumbbell size={17} />} label="Workouts this week" value={`${thisWeek.length}`} detail={thisWeek.length === 1 ? 'session completed' : 'sessions completed'} />
        <SummaryCard icon={<Scale size={17} />} label="Latest body weight" value={latestWeight ? `${latestWeight.weightKg.toFixed(1)} kg` : '—'} detail={latestWeight ? `Recorded ${formatDate(latestWeight.date, { month: 'short', day: 'numeric' })}` : 'Log a measurement to start'} />
        <SummaryCard icon={<Clock3 size={17} />} label="Training time this week" value={thisWeekMinutes ? `${thisWeekMinutes} min` : '—'} detail={thisWeek.length ? 'From recorded workout durations' : 'No timed sessions yet'} />
      </section>

      <nav className="fitness-tabs" role="tablist" aria-label="Fitness sections">
        {([
          ['workouts', 'Workout Log'], ['weight', 'Body Weight'], ['progress', 'Progress'],
        ] as const).map(([id, title]) => <button key={id} type="button" role="tab" tabIndex={section === id ? 0 : -1} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => setSection(id)} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []); const index = tabs.indexOf(event.currentTarget); const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[nextIndex]?.focus(); tabs[nextIndex]?.click() }}>{title}</button>)}
      </nav>

      {section === 'workouts' && <WorkoutHistory sessions={sortedWorkouts} onAdd={() => openWorkout()} onEdit={openWorkout} onDelete={deleteWorkout} />}
      {section === 'weight' && <BodyWeightLog entries={data.bodyWeights} onAdd={() => openWeight()} onEdit={openWeight} onDelete={deleteBodyWeight} />}
      {section === 'progress' && <ProgressDashboard workouts={data.workouts} bodyWeights={data.bodyWeights} />}

      <footer className="page-footer">Your progress is built from your own records, one session at a time.</footer>

      {workoutOpen && <WorkoutForm initialSession={workoutToEdit} library={data.exerciseLibrary} onClose={() => { setWorkoutOpen(false); setWorkoutToEdit(null) }} onSave={saveWorkout} onLibraryChange={(exerciseLibrary) => commitData({ ...data, exerciseLibrary })} />}
      {weightOpen && <BodyWeightForm initialEntry={weightToEdit} entries={data.bodyWeights} onClose={() => { setWeightOpen(false); setWeightToEdit(null) }} onSave={saveBodyWeight} />}
      {toast && <div className="fitness-toast" role="status"><Check size={16} />{toast.message}<button aria-label="Dismiss message" onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  )
}

function SummaryCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <article className="fitness-summary-card"><span className="fitness-summary-icon">{icon}</span><div><span className="fitness-summary-label">{label}</span><strong>{value}</strong><span className="fitness-summary-detail">{detail}</span></div></article>
}

function WorkoutHistory({ sessions, onAdd, onEdit, onDelete }: { sessions: WorkoutSession[]; onAdd: () => void; onEdit: (session: WorkoutSession) => void; onDelete: (session: WorkoutSession) => void }) {
  return (
    <section className="fitness-panel workout-history">
      <div className="fitness-panel-heading"><div><p className="eyebrow">SHOW UP, THEN BUILD</p><h2>Workout log</h2><p>Keep a clear record of the work you actually did.</p></div><button className="primary-button compact-button" onClick={onAdd}><Plus size={15} />Log workout</button></div>
      {!sessions.length ? <FitnessEmpty icon={<Dumbbell size={20} />} title="Your first session starts here" text="Log a workout or a rest day. Your history and trends will grow from what you record." action={<button className="primary-button" onClick={onAdd}><Plus size={16} />Log your first workout</button>} /> : <div className="workout-list">{sessions.map((session) => <WorkoutListItem key={session.id} session={session} onEdit={() => onEdit(session)} onDelete={() => onDelete(session)} />)}</div>}
    </section>
  )
}

function WorkoutListItem({ session, onEdit, onDelete }: { session: WorkoutSession; onEdit: () => void; onDelete: () => void }) {
  const exerciseCount = session.exercises.length
  return (
    <article className="workout-entry">
      <div className={`workout-entry-symbol ${session.status === 'rest' ? 'rest' : ''}`}>{session.status === 'rest' ? <Activity size={17} /> : <Dumbbell size={17} />}</div>
      <div className="workout-entry-main"><div className="workout-entry-title"><h3>{session.status === 'rest' ? 'Rest day' : session.workoutType}</h3><span className={`workout-status ${session.status}`}>{session.status === 'rest' ? 'Rest' : 'Completed'}</span></div>
        <div className="workout-entry-meta"><span>{formatDate(session.date)}</span>{session.startTime && <><i /> <span>{session.startTime}</span></>}{session.durationMinutes && <><i /> <span>{session.durationMinutes} min</span></>}{session.status === 'completed' && <><i /> <span>{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}</span></>}</div>
        {session.status === 'completed' && exerciseCount > 0 && <div className="workout-exercise-chips">{session.exercises.map((exercise) => <span key={exercise.id}>{exercise.exerciseName}</span>)}</div>}
        {session.notes && <p className="workout-entry-notes">{session.notes}</p>}
      </div>
      <div className="workout-entry-actions"><button className="fitness-icon-button" aria-label={`Edit ${session.workoutType} on ${formatDate(session.date)}`} onClick={onEdit}><Pencil size={15} /></button><button className="fitness-icon-button delete" aria-label={`Delete workout on ${formatDate(session.date)}`} onClick={onDelete}><Trash2 size={15} /></button></div>
    </article>
  )
}

function WorkoutForm({ initialSession, library, onClose, onSave, onLibraryChange }: { initialSession: WorkoutSession | null; library: string[]; onClose: () => void; onSave: (session: WorkoutSession) => void; onLibraryChange: (library: string[]) => void }) {
  const [date, setDate] = useState(initialSession?.date ?? localDateString())
  const initialTypeIsPreset = !initialSession || workoutTypes.includes(initialSession.workoutType)
  const [workoutType, setWorkoutType] = useState(initialTypeIsPreset ? initialSession?.workoutType ?? 'Upper Body' : 'Custom')
  const [customType, setCustomType] = useState(initialTypeIsPreset ? '' : initialSession?.workoutType ?? '')
  const [startTime, setStartTime] = useState(initialSession?.startTime ?? '')
  const [duration, setDuration] = useState(initialSession?.durationMinutes?.toString() ?? '')
  const [notes, setNotes] = useState(initialSession?.notes ?? '')
  const [status, setStatus] = useState<WorkoutStatus>(initialSession?.status ?? 'completed')
  const [exercises, setExercises] = useState<ExerciseEntry[]>(initialSession?.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set })) })) ?? [])
  const [exerciseName, setExerciseName] = useState('')
  const [libraryDraft, setLibraryDraft] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function addExercise() {
    const cleanName = exerciseName.trim()
    if (!cleanName) { setError('Enter or choose an exercise name first.'); return }
    const exercise: ExerciseEntry = { id: createId(), exerciseName: cleanName, order: exercises.length, sets: [{ id: createId() }] }
    setExercises((current) => [...current, exercise])
    onLibraryChange([...new Set([...library, cleanName])].sort((a, b) => a.localeCompare(b)))
    setExerciseName('')
    setError('')
  }

  function updateExercise(id: string, update: Partial<ExerciseEntry>) {
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...update } : exercise))
  }

  function updateSet(exerciseId: string, setId: string, update: Partial<ExerciseSet>) {
    setExercises((current) => current.map((exercise) => exercise.id === exerciseId ? { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...update } : set) } : exercise))
  }

  function moveExercise(index: number, offset: number) {
    const next = [...exercises]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setExercises(next.map((exercise, order) => ({ ...exercise, order })))
  }

  function addLibraryExercise() {
    const cleanName = libraryDraft.trim()
    if (!cleanName) return
    onLibraryChange([...new Set([...library, cleanName])].sort((a, b) => a.localeCompare(b)))
    setLibraryDraft('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const minutes = Number(duration)
    if (!date) { setError('Choose the date for this entry.'); return }
    if (status === 'completed' && duration && (!Number.isFinite(minutes) || minutes <= 0)) { setError('Duration must be greater than zero minutes.'); return }
    const finalType = workoutType === 'Custom' ? customType.trim() : workoutType
    if (status === 'completed' && !finalType) { setError('Add a name for this custom workout.'); return }
    const session: WorkoutSession = {
      id: initialSession?.id ?? createId(), date, workoutType: status === 'rest' ? 'Rest day' : finalType,
      startTime: startTime || undefined,
      durationMinutes: status === 'completed' && duration ? minutes : undefined,
      notes: notes.trim() || undefined,
      status,
      exercises: status === 'rest' ? [] : exercises.map((exercise, order) => ({ ...exercise, order })),
    }
    setSaving(true)
    onSave(session)
  }

  return (
    <Dialog title={initialSession ? 'Edit workout' : 'Log workout'} description="Capture the session you completed. You can add detail as you go." onClose={onClose} wide>
      <form className="fitness-form" onSubmit={submit} noValidate>
        <div className="fitness-form-grid">
          <Field label="Date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <Field label="Session status" required><select value={status} onChange={(event) => setStatus(event.target.value as WorkoutStatus)}><option value="completed">Completed workout</option><option value="rest">Rest day</option></select></Field>
          {status === 'completed' && <><Field label="Workout focus" required><select value={workoutType} onChange={(event) => setWorkoutType(event.target.value)}>{workoutTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>{workoutType === 'Custom' && <Field label="Custom focus" required><input value={customType} onChange={(event) => setCustomType(event.target.value)} placeholder="e.g. Pull day" /></Field>}</>}
          <Field label="Start time"><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
          {status === 'completed' && <Field label="Duration" unit="minutes"><input type="number" min="1" max="1440" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="45" /></Field>}
        </div>
        {status === 'completed' && <section className="exercise-editor-section"><div className="exercise-section-heading"><div><h3>Exercises</h3><p>Add what you did; every set is optional and editable.</p></div><span>{exercises.length}</span></div>
          <div className="add-exercise-row"><label className="visually-hidden" htmlFor="exercise-picker">Exercise name</label><input id="exercise-picker" list="exercise-library" value={exerciseName} onChange={(event) => { setExerciseName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addExercise() } }} placeholder="Choose or type an exercise" /><datalist id="exercise-library">{library.map((name) => <option key={name} value={name} />)}</datalist><button type="button" className="secondary-button compact-button" onClick={addExercise}><Plus size={15} />Add exercise</button></div>
          <details className="exercise-library-manager"><summary>Edit exercise suggestions</summary><div className="library-edit-list">{library.length ? library.map((name) => <div key={name}><span>{name}</span><button type="button" className="fitness-icon-button delete" aria-label={`Remove ${name} from exercise suggestions`} onClick={() => onLibraryChange(library.filter((item) => item !== name))}><X size={14} /></button></div>) : <p>No saved suggestions. Custom exercise names still work.</p>}</div><div className="library-add-row"><input value={libraryDraft} onChange={(event) => setLibraryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLibraryExercise() } }} placeholder="Add a suggestion" aria-label="New exercise suggestion" /><button type="button" className="secondary-button compact-button" onClick={addLibraryExercise}><Plus size={14} />Add</button></div></details>
          {exercises.length ? <div className="exercise-list">{exercises.map((exercise, index) => <ExerciseEditor key={exercise.id} exercise={exercise} index={index} total={exercises.length} onUpdate={(update) => updateExercise(exercise.id, update)} onUpdateSet={(setId, update) => updateSet(exercise.id, setId, update)} onAddSet={() => updateExercise(exercise.id, { sets: [...exercise.sets, { id: createId() }] })} onRemoveSet={(setId) => updateExercise(exercise.id, { sets: exercise.sets.filter((set) => set.id !== setId) })} onMove={(offset) => moveExercise(index, offset)} onDelete={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))} />)}</div> : <p className="exercise-empty-hint">No exercises yet. Add one when you’re ready, or save the session without a list.</p>}
        </section>}
        <Field label={status === 'rest' ? 'Rest-day notes' : 'Session notes'}><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder={status === 'rest' ? 'How are you recovering?' : 'Anything worth remembering about this session?'} /></Field>
        {error && <p className="fitness-error" role="alert">{error}</p>}
        <div className="fitness-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><Check size={16} />{initialSession ? 'Save changes' : status === 'rest' ? 'Save rest day' : 'Save workout'}</button></div>
      </form>
    </Dialog>
  )
}

function ExerciseEditor({ exercise, index, total, onUpdate, onUpdateSet, onAddSet, onRemoveSet, onMove, onDelete }: {
  exercise: ExerciseEntry; index: number; total: number; onUpdate: (update: Partial<ExerciseEntry>) => void; onUpdateSet: (id: string, update: Partial<ExerciseSet>) => void; onAddSet: () => void; onRemoveSet: (id: string) => void; onMove: (offset: number) => void; onDelete: () => void
}) {
  return (
    <article className="exercise-editor-card">
      <header className="exercise-editor-header"><div className="exercise-title-fields"><label className="visually-hidden" htmlFor={`exercise-name-${exercise.id}`}>Exercise name</label><input id={`exercise-name-${exercise.id}`} value={exercise.exerciseName} onChange={(event) => onUpdate({ exerciseName: event.target.value })} aria-label="Exercise name" /><label className="visually-hidden" htmlFor={`muscle-${exercise.id}`}>Muscle group</label><input id={`muscle-${exercise.id}`} value={exercise.muscleGroup ?? ''} onChange={(event) => onUpdate({ muscleGroup: event.target.value || undefined })} placeholder="Muscle group" /></div><div className="exercise-tools"><button type="button" className="fitness-icon-button" disabled={index === 0} aria-label="Move exercise up" onClick={() => onMove(-1)}><ArrowUp size={15} /></button><button type="button" className="fitness-icon-button" disabled={index === total - 1} aria-label="Move exercise down" onClick={() => onMove(1)}><ArrowDown size={15} /></button><button type="button" className="fitness-icon-button delete" aria-label={`Remove ${exercise.exerciseName}`} onClick={onDelete}><Trash2 size={15} /></button></div></header>
      <div className="set-table-head"><span>Set</span><span>Reps</span><span>Weight · kg</span><span>Duration · sec</span><span>Distance · km</span><span /></div>
      <div className="exercise-sets">{exercise.sets.map((set, setIndex) => <div className="exercise-set-row" key={set.id}><strong>{setIndex + 1}</strong><NumberInput label={`Set ${setIndex + 1} repetitions`} value={set.reps} step="1" onChange={(value) => onUpdateSet(set.id, { reps: value })} /><NumberInput label={`Set ${setIndex + 1} weight in kilograms`} value={set.weightKg} step="0.5" onChange={(value) => onUpdateSet(set.id, { weightKg: value })} /><NumberInput label={`Set ${setIndex + 1} duration in seconds`} value={set.durationSeconds} step="1" onChange={(value) => onUpdateSet(set.id, { durationSeconds: value })} /><NumberInput label={`Set ${setIndex + 1} distance in kilometers`} value={set.distanceKm} step="0.1" onChange={(value) => onUpdateSet(set.id, { distanceKm: value })} /><button type="button" className="fitness-icon-button delete" disabled={exercise.sets.length === 1} aria-label={`Remove set ${setIndex + 1}`} onClick={() => onRemoveSet(set.id)}><X size={15} /></button></div>)}</div>
      <label className="set-notes-label">Exercise notes<input value={exercise.notes ?? ''} onChange={(event) => onUpdate({ notes: event.target.value || undefined })} placeholder="Optional cues or notes" /></label>
      <button type="button" className="add-set-button" onClick={onAddSet}><Plus size={13} />Add set</button>
    </article>
  )
}

function NumberInput({ label, value, step, onChange }: { label: string; value?: number; step: string; onChange: (value?: number) => void }) {
  return <input aria-label={label} type="number" min="0" step={step} value={value ?? ''} onChange={(event) => { const next = event.target.value; onChange(next === '' ? undefined : Number(next)) }} />
}

function BodyWeightLog({ entries, onAdd, onEdit, onDelete }: { entries: BodyWeightEntry[]; onAdd: () => void; onEdit: (entry: BodyWeightEntry) => void; onDelete: (entry: BodyWeightEntry) => void }) {
  const [range, setRange] = useState<DateRange>('4w')
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const chartEntries = weightsInRange(entries, range)
  return <section className="fitness-panel body-weight-panel"><div className="fitness-panel-heading"><div><p className="eyebrow">A SEPARATE CHECK-IN</p><h2>Body weight</h2><p>Log when it works for you. A daily entry is never required.</p></div><button className="primary-button compact-button" onClick={onAdd}><Plus size={15} />Log body weight</button></div>
    {entries.length >= 2 && <div className="weight-chart-wrap"><div className="chart-header"><div><strong>Weight trend</strong><span>{chartEntries.length ? `${chartEntries.length} records` : 'No records in this period'}</span></div><RangeSelector range={range} onChange={setRange} /></div>{chartEntries.length >= 2 ? <WeightChart entries={chartEntries} /> : <p className="chart-empty">Add another entry in this time period to see a trend.</p>}</div>}
    {!sorted.length ? <FitnessEmpty icon={<Scale size={20} />} title="Start your own weight log" text="Record a measurement whenever it suits you. The latest value and trend will appear here." action={<button className="primary-button" onClick={onAdd}><Plus size={16} />Log body weight</button>} /> : <div className="body-weight-list">{sorted.map((entry) => <article className="body-weight-entry" key={entry.id}><div className="body-weight-date"><strong>{formatDate(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><span>{entry.notes || 'Body-weight check-in'}</span></div><strong className="body-weight-value">{entry.weightKg.toFixed(1)} <small>kg</small></strong><div className="workout-entry-actions"><button className="fitness-icon-button" aria-label={`Edit body weight from ${formatDate(entry.date)}`} onClick={() => onEdit(entry)}><Pencil size={15} /></button><button className="fitness-icon-button delete" aria-label={`Delete body weight from ${formatDate(entry.date)}`} onClick={() => onDelete(entry)}><Trash2 size={15} /></button></div></article>)}</div>}
  </section>
}

function BodyWeightForm({ initialEntry, entries, onClose, onSave }: { initialEntry: BodyWeightEntry | null; entries: BodyWeightEntry[]; onClose: () => void; onSave: (entry: BodyWeightEntry, replaceId?: string) => void }) {
  const [date, setDate] = useState(initialEntry?.date ?? localDateString())
  const [weight, setWeight] = useState(initialEntry?.weightKg.toString() ?? '')
  const [notes, setNotes] = useState(initialEntry?.notes ?? '')
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<BodyWeightEntry | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const value = Number(weight)
    if (!date) { setError('Choose the date for this measurement.'); return }
    if (!Number.isFinite(value) || value < 1 || value > 700) { setError('Enter a body weight between 1 and 700 kg.'); return }
    const existing = entries.find((entry) => entry.date === date && entry.id !== initialEntry?.id)
    if (existing) { setDuplicate(existing); return }
    onSave({ id: initialEntry?.id ?? createId(), date, weightKg: value, notes: notes.trim() || undefined })
  }

  function replaceExisting() {
    if (!duplicate) return
    onSave({ id: initialEntry?.id ?? createId(), date, weightKg: Number(weight), notes: notes.trim() || undefined }, duplicate.id)
  }

  return <Dialog title={initialEntry ? 'Edit body weight' : 'Log body weight'} description="A private, flexible record of your check-in." onClose={onClose}>
    <form className="fitness-form" onSubmit={submit} noValidate><Field label="Date" required><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setDuplicate(null) }} /></Field><Field label="Body weight" unit="kg" required><input type="number" min="1" max="700" step="0.1" value={weight} onChange={(event) => { setWeight(event.target.value); setDuplicate(null) }} placeholder="e.g. 68.4" /></Field><Field label="Notes"><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional context" /></Field>
      <p className="duplicate-help">One entry per date keeps the trend clear. You can explicitly replace a same-day entry.</p>
      {duplicate && <div className="duplicate-confirm" role="alert"><span>{formatDate(date)} already has a {duplicate.weightKg.toFixed(1)} kg entry.</span><button type="button" className="secondary-button compact-button" onClick={replaceExisting}>Replace it</button></div>}
      {error && <p className="fitness-error" role="alert">{error}</p>}<div className="fitness-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Check size={16} />Save entry</button></div>
    </form>
  </Dialog>
}

function ProgressDashboard({ workouts, bodyWeights }: { workouts: WorkoutSession[]; bodyWeights: BodyWeightEntry[] }) {
  const [range, setRange] = useState<DateRange>('4w')
  const [exercise, setExercise] = useState('')
  const completed = sessionsInRange(workouts, range)
  const minutes = completed.reduce((total, session) => total + (session.durationMinutes ?? 0), 0)
  const weeks = weeklyWorkoutCounts(workouts, range)
  const activeWeeks = weeks.filter((week) => week.count > 0).length
  const exerciseNames = [...new Set(workouts.filter((session) => session.status === 'completed').flatMap((session) => session.exercises.map((entry) => entry.exerciseName)))].sort((a, b) => a.localeCompare(b))
  const selectedExercise = exercise || exerciseNames[0] || ''
  const history = workouts.filter((session) => session.status === 'completed' && (!startForProgress(range) || parseLocalDate(session.date) >= startForProgress(range)!)).flatMap((session) => session.exercises.filter((entry) => entry.exerciseName === selectedExercise).map((entry) => ({ session, exercise: entry }))).sort((a, b) => b.session.date.localeCompare(a.session.date))
  const best = history.flatMap(({ session, exercise: entry }) => entry.sets.filter((set) => set.weightKg !== undefined).map((set) => ({ ...set, date: session.date }))).sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0]
  const weightTrend = weightsInRange(bodyWeights, range)
  const periodLabel = rangeLabel(range)
  return <section className="progress-dashboard">
    <div className="fitness-panel progress-panel"><div className="fitness-panel-heading progress-panel-heading"><div><p className="eyebrow">YOUR RECORD, YOUR PACE</p><h2>Progress</h2><p>Summaries use only the workouts and measurements you log.</p></div><RangeSelector range={range} onChange={setRange} /></div>
      {!workouts.some((session) => session.status === 'completed') && !bodyWeights.length ? <FitnessEmpty icon={<TrendingUp size={20} />} title="Progress starts with a record" text="Once you log workouts or body weight, this view will show patterns from your actual entries." /> : <>
        <div className="progress-stat-grid"><ProgressStat label="Completed sessions" value={`${completed.length}`} detail={periodLabel} /><ProgressStat label="Active weeks" value={`${activeWeeks} / ${weeks.length}`} detail="Weeks with at least one workout" /><ProgressStat label="Training time" value={minutes ? `${minutes} min` : '—'} detail={periodLabel} /></div>
        <div className="progress-chart-grid"><section className="progress-chart-card"><div className="chart-header"><div><strong>Workouts per week</strong><span>Completed sessions · {periodLabel}</span></div></div>{completed.length ? <WorkoutBars weeks={weeks} /> : <p className="chart-empty">No completed workouts in this period.</p>}</section><section className="progress-chart-card"><div className="chart-header"><div><strong>Body-weight trend</strong><span>{weightTrend.length ? `${weightTrend.length} logged entries` : 'No entries in this period'}</span></div></div>{weightTrend.length >= 2 ? <WeightChart entries={weightTrend} /> : <p className="chart-empty">Log at least two body-weight entries in this period to see a trend.</p>}</section></div>
        <section className="exercise-history-panel"><div className="exercise-history-heading"><div><h3>Exercise history</h3><p>Compare the same exercise name across sessions.</p></div><Field label="Select exercise"><select value={selectedExercise} disabled={!exerciseNames.length} onChange={(event) => setExercise(event.target.value)}>{exerciseNames.length ? exerciseNames.map((name) => <option key={name}>{name}</option>) : <option>No exercises yet</option>}</select></Field></div>
          {selectedExercise && history.length ? <><div className="exercise-best"><span className="best-mark"><TrendingUp size={16} /></span><div><span>Highest logged set for “{selectedExercise}”</span><strong>{best ? `${best.weightKg} kg${best.reps !== undefined ? ` × ${best.reps} reps` : ''}` : 'No weighted sets yet'}</strong></div>{best && <small>{formatDate(best.date)}</small>}</div><div className="exercise-history-list">{history.map(({ session, exercise: entry }) => <article key={`${session.id}-${entry.id}`} className="exercise-history-entry"><div><strong>{formatDate(session.date)}</strong><span>{session.workoutType}</span></div><div className="history-set-values">{entry.sets.length ? entry.sets.map((set, index) => <span key={set.id}>Set {index + 1}: {set.weightKg !== undefined ? `${set.weightKg} kg` : '—'}{set.reps !== undefined ? ` × ${set.reps}` : ''}{set.durationSeconds ? ` · ${formatDuration(set.durationSeconds)}` : ''}{set.distanceKm ? ` · ${set.distanceKm} km` : ''}</span>) : <span>No set details recorded</span>}</div></article>)}</div><p className="comparison-note">These are recorded values for the same exercise name; they don’t account for technique or variations.</p></> : <p className="chart-empty">No history for this exercise in the selected period.</p>}
        </section>
      </>}
    </div>
  </section>
}

function startForProgress(range: DateRange) {
  if (range === 'all') return undefined
  const date = new Date()
  date.setDate(date.getDate() - (range === '4w' ? 27 : 55))
  date.setHours(0, 0, 0, 0)
  return date
}

function ProgressStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="progress-stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function WorkoutBars({ weeks }: { weeks: { weekStart: Date; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.count))
  return <div className="workout-bars" role="img" aria-label={`Weekly completed workouts: ${weeks.map((week) => `${week.count} starting ${formatDate(localDateString(week.weekStart), { month: 'short', day: 'numeric' })}`).join(', ')}`}>
    {weeks.map((week) => <div className="workout-bar-column" key={week.weekStart.toISOString()}><strong>{week.count || ''}</strong><span className="workout-bar-track"><i style={{ height: `${week.count ? Math.max(8, week.count / max * 100) : 0}%` }} /></span><small>{formatDate(localDateString(week.weekStart), { month: 'short', day: 'numeric' })}</small></div>)}
  </div>
}

function WeightChart({ entries }: { entries: BodyWeightEntry[] }) {
  const values = entries.map((entry) => entry.weightKg)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const spread = high - low || 1
  const points = entries.map((entry, index) => ({ entry, x: entries.length === 1 ? 50 : 6 + index / (entries.length - 1) * 88, y: 78 - ((entry.weightKg - low) / spread) * 58 }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  return <div className="weight-chart" role="img" aria-label={`Body weight trend from ${entries[0] ? `${entries[0].weightKg} kilograms on ${formatDate(entries[0].date)}` : ''} to ${entries.at(-1) ? `${entries.at(-1)!.weightKg} kilograms on ${formatDate(entries.at(-1)!.date)}` : ''}`}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="4" y1="20" x2="96" y2="20" /><line x1="4" y1="49" x2="96" y2="49" /><line x1="4" y1="78" x2="96" y2="78" /><path d={path} />{points.map((point) => <circle key={point.entry.id} cx={point.x} cy={point.y} r="1.4" />)}</svg>
    <div className="weight-chart-scale"><span>{high.toFixed(1)} kg</span><span>{low.toFixed(1)} kg</span></div><div className="weight-chart-dates"><span>{formatDate(entries[0].date, { month: 'short', day: 'numeric' })}</span><span>{formatDate(entries.at(-1)!.date, { month: 'short', day: 'numeric' })}</span></div>
  </div>
}

function RangeSelector({ range, onChange }: { range: DateRange; onChange: (range: DateRange) => void }) {
  return <label className="range-selector"><span className="visually-hidden">Date range</span><select value={range} onChange={(event) => onChange(event.target.value as DateRange)}><option value="4w">4 weeks</option><option value="8w">8 weeks</option><option value="all">All time</option></select></label>
}

function FitnessEmpty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="fitness-empty"><span className="fitness-empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>
}

function Dialog({ title, description, children, onClose, wide = false }: { title: string; description: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`task-dialog fitness-dialog ${wide ? 'fitness-dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="fitness-dialog-title" aria-describedby="fitness-dialog-description" onKeyDown={(event) => { if (event.key !== 'Tab') return; const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea')).filter((element) => !element.hasAttribute('disabled')); const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } }}><div className="dialog-top"><div className="dialog-mark"><Activity size={19} /></div><button className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div><h2 id="fitness-dialog-title">{title}</h2><p id="fitness-dialog-description">{description}</p>{children}</section></div>
}

function Field({ label, children, required = false, unit }: { label: string; children: ReactNode; required?: boolean; unit?: string }) {
  return <label className="fitness-field"><span>{label}{required && <b>Required</b>}{unit && <em>{unit}</em>}</span>{children}</label>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return minutes ? `${minutes}m${remaining ? ` ${remaining}s` : ''}` : `${remaining}s`
}

