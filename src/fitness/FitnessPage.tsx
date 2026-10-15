import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, Check, Dumbbell, Plus, Scale,
  Pencil, Trash2, X,
} from 'lucide-react'
import { formatDate, isInCurrentWeek, localDateString, rangeLabel, sessionsInRange, weightsInRange, weeklyWorkoutCounts } from './analytics'
import { createId, loadFitnessData, saveFitnessData } from './storage'
import type { BodyWeightEntry, DateRange, ExerciseEntry, FitnessData, WorkoutSession } from './types'
import { migrateResource, writeResource } from '../data/api'
import './FitnessPage.css'

type Section = 'workouts' | 'weight' | 'progress'
type ToastMessage = { id: number; message: string }

export default function FitnessPage() {
  const [data, setData] = useState<FitnessData>(loadFitnessData)
  const [section, setSection] = useState<Section>('workouts')
  const [workoutDate, setWorkoutDate] = useState(localDateString())
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

  function openWeight(entry?: BodyWeightEntry) {
    setWeightToEdit(entry ?? null)
    setWeightOpen(true)
  }

  const thisWeek = data.workouts.filter((session) => session.status === 'completed' && isInCurrentWeek(session.date))
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
          <button className="primary-button" onClick={() => { setSection('workouts'); setWorkoutDate(localDateString()) }}><Plus size={17} />Log workout</button>
        </div>
      </section>

      <section className="fitness-summary" aria-label="Fitness summary">
        <SummaryCard icon={<Dumbbell size={17} />} label="Workouts this week" value={`${thisWeek.length}`} detail={thisWeek.length === 1 ? 'session completed' : 'sessions completed'} />
        <SummaryCard icon={<Scale size={17} />} label="Latest body weight" value={latestWeight ? `${latestWeight.weightKg.toFixed(1)} kg` : '—'} detail={latestWeight ? `Recorded ${formatDate(latestWeight.date, { month: 'short', day: 'numeric' })}` : 'Log a measurement to start'} />
        <SummaryCard icon={<Dumbbell size={17} />} label="Exercises this week" value={`${thisWeek.reduce((total, session) => total + session.exercises.length, 0)}`} detail="Across completed workouts" />
      </section>

      <nav className="fitness-tabs" role="tablist" aria-label="Fitness sections">
        {([
          ['workouts', 'Workout Log'], ['weight', 'Body Weight'], ['progress', 'Progress'],
        ] as const).map(([id, title]) => <button key={id} type="button" role="tab" tabIndex={section === id ? 0 : -1} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => setSection(id)} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []); const index = tabs.indexOf(event.currentTarget); const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[nextIndex]?.focus(); tabs[nextIndex]?.click() }}>{title}</button>)}
      </nav>

      {section === 'workouts' && <WorkoutHistory sessions={sortedWorkouts} date={workoutDate} onDateChange={setWorkoutDate} onSave={saveWorkout} onDelete={deleteWorkout} library={data.exerciseLibrary} onLibraryChange={(exerciseLibrary) => commitData({ ...data, exerciseLibrary })} />}
      {section === 'weight' && <BodyWeightLog entries={data.bodyWeights} onAdd={() => openWeight()} onEdit={openWeight} onDelete={deleteBodyWeight} />}
      {section === 'progress' && <ProgressDashboard workouts={data.workouts} bodyWeights={data.bodyWeights} />}

      <footer className="page-footer">Your progress is built from your own records, one session at a time.</footer>

      {weightOpen && <BodyWeightForm initialEntry={weightToEdit} entries={data.bodyWeights} onClose={() => { setWeightOpen(false); setWeightToEdit(null) }} onSave={saveBodyWeight} />}
      {toast && <div className="fitness-toast" role="status"><Check size={16} />{toast.message}<button aria-label="Dismiss message" onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  )
}

function SummaryCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <article className="fitness-summary-card"><span className="fitness-summary-icon">{icon}</span><div><span className="fitness-summary-label">{label}</span><strong>{value}</strong><span className="fitness-summary-detail">{detail}</span></div></article>
}

function WorkoutHistory({ sessions, date, onDateChange, onSave, onDelete, library, onLibraryChange }: { sessions: WorkoutSession[]; date: string; onDateChange: (date: string) => void; onSave: (session: WorkoutSession) => void; onDelete: (session: WorkoutSession) => void; library: string[]; onLibraryChange: (library: string[]) => void }) {
  const selected = sessions.find((session) => session.date === date)
  const grouped = new Map<string, WorkoutSession[]>()
  sessions.forEach((session) => grouped.set(session.date, [...(grouped.get(session.date) ?? []), session]))
  return <div className="fitness-workout-layout">
    <section className="fitness-panel workout-editor-panel"><div className="fitness-panel-heading"><div><p className="eyebrow">WORKOUT LOG</p><h2>{selected ? 'Edit workout' : 'Log a workout'}</h2><p>Choose a date and check off each exercise as you go.</p></div></div>
      <WorkoutEditor key={`${date}:${selected?.id ?? 'new'}`} date={date} selected={selected} onDateChange={onDateChange} onSave={onSave} library={library} onLibraryChange={onLibraryChange} />
    </section>
    <section className="fitness-panel workout-history-panel"><div className="fitness-panel-heading"><div><p className="eyebrow">YOUR RECORD</p><h2>Workout history</h2><p>Past sessions grouped by date.</p></div></div>
      {!sessions.length ? <FitnessEmpty icon={<Dumbbell size={20} />} title="Your first session starts here" text="Choose a date above and add an exercise to begin." /> : <div className="workout-date-groups">{[...grouped].sort(([a], [b]) => b.localeCompare(a)).map(([groupDate, entries]) => <section className="workout-date-group" key={groupDate}><h3>{formatDate(groupDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>{entries.map((session) => <article className="workout-history-row" key={session.id}><div className="workout-history-exercises">{session.exercises.map((exercise) => <span className={(exercise.completed ?? true) ? 'done' : ''} key={exercise.id}>{(exercise.completed ?? true) && <Check size={12} />}{exercise.exerciseName}</span>)}</div><div className="workout-entry-actions"><button className="fitness-icon-button" aria-label={`Edit workout on ${formatDate(groupDate)}`} onClick={() => onDateChange(groupDate)}><Pencil size={15} /></button><button className="fitness-icon-button delete" aria-label={`Delete workout on ${formatDate(groupDate)}`} onClick={() => onDelete(session)}><Trash2 size={15} /></button></div></article>)}</section>)}</div>}
    </section>
  </div>
}

function WorkoutEditor({ date, selected, onDateChange, onSave, library, onLibraryChange }: { date: string; selected?: WorkoutSession; onDateChange: (date: string) => void; onSave: (session: WorkoutSession) => void; library: string[]; onLibraryChange: (library: string[]) => void }) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>(() => selected?.exercises.map((exercise) => ({ ...exercise, completed: exercise.completed ?? true })) ?? [])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  function addExercise() {
    const clean = name.trim()
    if (!clean) { setError('Enter an exercise name first.'); return }
    setExercises((current) => [...current, { id: createId(), exerciseName: clean, order: current.length, sets: [], completed: false }])
    if (!library.includes(clean)) onLibraryChange([...library, clean].sort((a, b) => a.localeCompare(b)))
    setName(''); setError('')
  }
  function updateExercise(id: string, update: Partial<ExerciseEntry>) { setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...update } : exercise)) }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!date) { setError('Choose a workout date.'); return }
    if (exercises.some((exercise) => !exercise.exerciseName.trim())) { setError('Each exercise needs a name.'); return }
    onSave({ ...selected, id: selected?.id ?? createId(), date, workoutType: selected?.workoutType ?? 'Workout', status: 'completed', exercises: exercises.map((exercise, order) => ({ ...exercise, exerciseName: exercise.exerciseName.trim(), order })) })
  }
  return <form className="simple-workout-form" onSubmit={save} noValidate>
    <label className="workout-date-picker"><span>Workout date</span><input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
    <div className="simple-exercise-heading"><div><h3>Exercises</h3><p>{exercises.length ? `${exercises.length} on this date` : 'No exercises for this date yet'}</p></div></div>
    <div className="simple-add-exercise"><label className="visually-hidden" htmlFor="simple-exercise-name">Exercise name</label><input id="simple-exercise-name" list="saved-exercises" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addExercise() } }} placeholder="Exercise name" /><datalist id="saved-exercises">{library.map((exercise) => <option key={exercise} value={exercise} />)}</datalist><button type="button" className="secondary-button compact-button" onClick={addExercise}><Plus size={15} />Add</button></div>
    {exercises.length > 0 && <div className="simple-exercise-list">{exercises.map((exercise) => <div className={`simple-exercise-row ${exercise.completed ? 'completed' : ''}`} key={exercise.id}><input className="exercise-check" type="checkbox" checked={exercise.completed ?? false} aria-label={`Mark ${exercise.exerciseName} complete`} onChange={(event) => updateExercise(exercise.id, { completed: event.target.checked })} /><input className="exercise-name-input" aria-label="Exercise name" value={exercise.exerciseName} onChange={(event) => updateExercise(exercise.id, { exerciseName: event.target.value })} /><label className="exercise-max-weight"><span>Max kg</span><input type="number" min="0" step="0.5" value={exercise.maxWeightKg ?? ''} onChange={(event) => updateExercise(exercise.id, { maxWeightKg: event.target.value === '' ? undefined : Number(event.target.value) })} aria-label={`Maximum weight in kg for ${exercise.exerciseName}`} placeholder="—" /></label><button type="button" className="fitness-icon-button delete" aria-label={`Delete ${exercise.exerciseName}`} onClick={() => setExercises((current) => current.filter((entry) => entry.id !== exercise.id))}><Trash2 size={15} /></button></div>)}</div>}
    {error && <p className="fitness-error" role="alert">{error}</p>}<div className="simple-workout-actions"><button type="submit" className="primary-button"><Check size={16} />Save workout</button></div>
  </form>
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
  const weeks = weeklyWorkoutCounts(workouts, range)
  const activeWeeks = weeks.filter((week) => week.count > 0).length
  const exerciseNames = [...new Set(workouts.flatMap((session) => session.exercises.map((entry) => entry.exerciseName.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b))
  const selectedExercise = exerciseNames.includes(exercise) ? exercise : exerciseNames[0] ?? ''
  const strengthEntries = workouts.flatMap((session) => session.exercises.filter((entry) => entry.exerciseName.trim() === selectedExercise).map((entry) => ({ date: session.date, id: `${session.id}-${entry.id}`, weight: maxExerciseWeight(entry) }))).filter((entry): entry is { date: string; id: string; weight: number } => entry.weight !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  const weightTrend = weightsInRange(bodyWeights, range)
  const periodLabel = rangeLabel(range)
  return <section className="progress-dashboard"><div className="fitness-panel progress-panel">
    <div className="fitness-panel-heading progress-panel-heading"><div><p className="eyebrow">YOUR RECORD, YOUR PACE</p><h2>Progress</h2><p>Charts use saved workout and body-weight records.</p></div><RangeSelector range={range} onChange={setRange} /></div>
    <div className="progress-stat-grid"><ProgressStat label="Completed workouts" value={`${completed.length}`} detail={periodLabel} /><ProgressStat label="Active weeks" value={`${activeWeeks} / ${weeks.length}`} detail="Weeks with a workout" /><ProgressStat label="Body-weight entries" value={`${weightTrend.length}`} detail={periodLabel} /></div>
    <section className="strength-progress-card"><div className="strength-progress-heading"><div><h3>Strength progress</h3><p>Maximum weight recorded for each workout date.</p></div><label className="fitness-field"><span>Select exercise</span><select value={selectedExercise} disabled={!exerciseNames.length} onChange={(event) => setExercise(event.target.value)}>{exerciseNames.length ? exerciseNames.map((name) => <option key={name}>{name}</option>) : <option>No exercises yet</option>}</select></label></div>
      {strengthEntries.length ? <StrengthChart exercise={selectedExercise} entries={strengthEntries} /> : <p className="chart-empty">{selectedExercise ? `No weight recorded for ${selectedExercise} yet.` : 'Add an exercise and record its maximum weight to see progress here.'}</p>}
    </section>
    <div className="progress-chart-grid"><section className="progress-chart-card"><div className="chart-header"><div><strong>Workouts per week</strong><span>Completed sessions · {periodLabel}</span></div></div>{completed.length ? <WorkoutBars weeks={weeks} /> : <p className="chart-empty">No completed workouts in this period.</p>}</section><section className="progress-chart-card"><div className="chart-header"><div><strong>Body-weight trend</strong><span>{weightTrend.length ? `${weightTrend.length} logged entries` : 'No entries in this period'}</span></div></div>{weightTrend.length >= 2 ? <WeightChart entries={weightTrend} /> : <p className="chart-empty">Log at least two body-weight entries in this period to see a trend.</p>}</section></div>
  </div></section>
}

function maxExerciseWeight(exercise: ExerciseEntry) {
  if (typeof exercise.maxWeightKg === 'number' && Number.isFinite(exercise.maxWeightKg)) return exercise.maxWeightKg
  const recorded = exercise.sets.map((set) => set.weightKg).filter((weight): weight is number => typeof weight === 'number' && Number.isFinite(weight))
  return recorded.length ? Math.max(...recorded) : undefined
}

function StrengthChart({ exercise, entries }: { exercise: string; entries: { date: string; id: string; weight: number }[] }) {
  const low = Math.min(...entries.map((entry) => entry.weight))
  const high = Math.max(...entries.map((entry) => entry.weight))
  const spread = high - low || Math.max(high * .1, 1)
  const points = entries.map((entry, index) => ({ ...entry, x: entries.length === 1 ? 50 : 6 + index / (entries.length - 1) * 88, y: 78 - ((entry.weight - low) / spread) * 58 }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  return <div className="strength-chart" role="img" aria-label={`${exercise} maximum weight over time: ${entries.map((entry) => `${entry.weight} kg on ${formatDate(entry.date)}`).join(', ')}`}><div className="strength-chart-values">{entries.map((entry) => <span key={entry.id}>{entry.weight} kg</span>)}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="4" y1="20" x2="96" y2="20" /><line x1="4" y1="49" x2="96" y2="49" /><line x1="4" y1="78" x2="96" y2="78" /><path d={path} />{points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="1.6" />)}</svg><div className="weight-chart-dates"><span>{formatDate(entries[0].date, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span>{formatDate(entries.at(-1)!.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div><div className="strength-record-list">{entries.map((entry) => <div key={entry.id}><span>{formatDate(entry.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><strong>{entry.weight} kg</strong></div>)}</div></div>
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

