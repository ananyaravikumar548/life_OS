import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Apple, BookOpen, Check, ChevronDown, CupSoda, Droplets,
  Flame, GlassWater, Pencil, Plus, Search, Settings2, Trash2, Utensils,
  X,
} from 'lucide-react'
import { displayNutritionDate, getDailyLog, makeFoodEntry, mealSummary, nutritionAverages, nutritionHistory, nutritionDateString, progressPercent, replaceDailyLog, scaleNutrition, summarizeEntries, updateMeal } from './analytics'
import { createNutritionId, loadNutritionData, saveNutritionData } from './storage'
import { mealTypes } from './types'
import type { DailyNutritionLog, FoodItem, FoodLogEntry, InsightRange, MealType, NutritionBasis, NutritionData, NutritionGoals, ServingUnit, WaterEntry } from './types'
import { migrateResource, writeResource } from '../data/api'
import './NutritionPage.css'

type Section = 'today' | 'foods' | 'insights'
type FoodDialog = { meal: MealType } | null
const servingUnits: ServingUnit[] = ['g', 'ml', 'piece', 'slice', 'scoop', 'cup', 'serving']

export default function NutritionPage() {
  const [data, setData] = useState<NutritionData>(loadNutritionData)
  const [date, setDate] = useState(nutritionDateString())
  const [section, setSection] = useState<Section>('today')
  const [foodDialog, setFoodDialog] = useState<FoodDialog>(null)
  const [foodEntryEdit, setFoodEntryEdit] = useState<FoodLogEntry | null>(null)
  const [foodItemEdit, setFoodItemEdit] = useState<FoodItem | null>(null)
  const [foodItemFormOpen, setFoodItemFormOpen] = useState(false)
  const [waterFormOpen, setWaterFormOpen] = useState(false)
  const [waterEdit, setWaterEdit] = useState<WaterEntry | null>(null)
  const [goalsFormOpen, setGoalsFormOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [migrationComplete, setMigrationComplete] = useState(false)

  useEffect(() => {
    let cancelled = false
    const local = loadNutritionData()
    void migrateResource('nutrition', local).then((snapshot) => {
      if (cancelled) return
      setData(snapshot.data)
      setMigrationComplete(true)
      setCloudError('')
    }).catch((error: unknown) => {
      if (!cancelled) setCloudError(error instanceof Error ? error.message : 'MongoDB could not be reached. Your existing local records are still available.')
    }).finally(() => { if (!cancelled) setCloudReady(true) })
    return () => { cancelled = true }
  }, [])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? '' : current), 2800)
  }

  function commit(next: NutritionData, message?: string) {
    const saved = saveNutritionData(next)
    setData(next)
    if (message) notify(saved ? message : 'MongoDB save is being attempted; browser backup failed.')
    if (cloudReady) void (migrationComplete ? writeResource('nutrition', next) : migrateResource('nutrition', next).then((result) => { setMigrationComplete(true); setData(result.data) })).then(() => setCloudError('')).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'MongoDB could not save this change.'
      setCloudError(reason); notify(`Kept your change locally. MongoDB save failed: ${reason}`)
    })
  }

  const dayEntries = useMemo(() => data.entries.filter((entry) => entry.date === date), [data.entries, date])
  const dayWater = useMemo(() => data.waterEntries.filter((entry) => entry.date === date), [data.waterEntries, date])
  const totals = summarizeEntries(dayEntries)
  const waterTotal = dayWater.reduce((total, entry) => total + entry.amountMl, 0)
  const dailyLog = getDailyLog(data.dailyLogs, date)

  function addFood(food: FoodItem, portion: number, meal: MealType) {
    const entry = makeFoodEntry(food, date, meal, portion, createNutritionId())
    commit({ ...data, entries: [entry, ...data.entries] }, food.caloriesKcal === undefined || food.proteinG === undefined ? 'Food logged. Add nutrition values when you have them.' : 'Food added to your log.')
    setFoodDialog(null)
  }

  function saveFoodItem(food: FoodItem) {
    commit({ ...data, foods: [food, ...data.foods.filter((item) => item.id !== food.id)] }, 'Food saved to your library.')
    setFoodItemFormOpen(false)
    setFoodItemEdit(null)
  }

  function deleteFoodItem(food: FoodItem) {
    if (!window.confirm(`Remove “${food.name}” from your food library? Existing meal entries will stay in your log.`)) return
    commit({ ...data, foods: data.foods.filter((item) => item.id !== food.id) }, 'Food removed from your library.')
  }

  function saveFoodEntry(entry: FoodLogEntry) {
    commit({ ...data, entries: [entry, ...data.entries.filter((item) => item.id !== entry.id)] }, 'Meal entry updated.')
    setFoodEntryEdit(null)
  }

  function deleteFoodEntry(entry: FoodLogEntry) {
    if (!window.confirm(`Remove ${entry.foodName} from ${entry.meal}?`)) return
    commit({ ...data, entries: data.entries.filter((item) => item.id !== entry.id) }, 'Food entry removed.')
  }

  function saveMealLog(meal: MealType, patch: { reviewed?: boolean; note?: string }) {
    const next = updateMeal(dailyLog, meal, patch)
    commit({ ...data, dailyLogs: replaceDailyLog(data.dailyLogs, next) })
  }

  function quickWater(amountMl: number) {
    const entry: WaterEntry = { id: createNutritionId(), date, amountMl }
    commit({ ...data, waterEntries: [entry, ...data.waterEntries] }, `${amountMl} ml added to your water log.`)
  }

  function saveWater(entry: WaterEntry) {
    commit({ ...data, waterEntries: [entry, ...data.waterEntries.filter((item) => item.id !== entry.id)] }, 'Water entry saved.')
    setWaterFormOpen(false)
    setWaterEdit(null)
  }

  function deleteWater(entry: WaterEntry) {
    if (!window.confirm(`Remove ${entry.amountMl} ml from your water log?`)) return
    commit({ ...data, waterEntries: data.waterEntries.filter((item) => item.id !== entry.id) }, 'Water entry removed.')
  }

  function saveGoals(goals: NutritionGoals) {
    commit({ ...data, goals }, 'Daily goals updated.')
    setGoalsFormOpen(false)
  }

  const dayLabel = displayNutritionDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  if (!cloudReady) return <div className="page-content"><p className="nutrition-cloud-warning" role="status">Loading your nutrition records…</p></div>

  return (
    <div className="page-content nutrition-page">
      {cloudError && <p className="nutrition-cloud-warning" role="status">MongoDB is unavailable: {cloudError}. Changes are kept in this browser until the database reconnects.</p>}
      <section className="nutrition-welcome">
        <div><p className="eyebrow">NUTRITION WORKSPACE</p><h1>Nourish yourself.</h1><p className="welcome-copy">Small meals. Steady progress.</p></div>
        <div className="nutrition-header-actions">{section === 'today' && <><button className="secondary-button" onClick={() => setWaterFormOpen(true)}><Droplets size={16} />Log water</button><button className="primary-button" onClick={() => setFoodDialog({ meal: 'Breakfast' })}><Plus size={17} />Add food</button></>}<button className="nutrition-goal-button" aria-label="Edit daily goals" onClick={() => setGoalsFormOpen(true)}><Settings2 size={16} /> Goals</button></div>
      </section>

      <div className="nutrition-date-row"><label><span>Viewing day</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><strong>{dayLabel}</strong></div>

      <section className="nutrition-summary-grid" aria-label="Daily nutrition totals">
        <NutritionGoalCard icon={<Flame size={17} />} label="Calories" value={totals.caloriesKcal} goal={data.goals.caloriesKcal} unit="kcal" unknown={totals.missingCalories} hasValue={dayEntries.length > 0 && totals.missingCalories < dayEntries.length} />
        <NutritionGoalCard icon={<Apple size={17} />} label="Protein" value={totals.proteinG} goal={data.goals.proteinG} unit="g" unknown={totals.missingProtein} hasValue={dayEntries.length > 0 && totals.missingProtein < dayEntries.length} />
        <NutritionGoalCard icon={<GlassWater size={17} />} label="Water" value={waterTotal} goal={data.goals.waterMl} unit="ml" hasValue={dayWater.length > 0} />
      </section>
      <p className="nutrition-summary-note">Targets are flexible guides. Log what you have; there’s no need to make up for a missed target.</p>

      <nav className="nutrition-tabs" role="tablist" aria-label="Nutrition sections">{([
        ['today', 'Daily journal'], ['foods', 'Food library'], ['insights', 'History & insights'],
      ] as const).map(([id, label]) => <button key={id} type="button" role="tab" tabIndex={section === id ? 0 : -1} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => setSection(id)} onKeyDown={(event) => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []); const current = tabs.indexOf(event.currentTarget); const next = tabs[(current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next?.focus(); next?.click() }}>{label}</button>)}</nav>

      {section === 'today' && <DailyJournal date={date} log={dailyLog} entries={dayEntries} waterEntries={dayWater} goals={data.goals} totals={totals} waterTotal={waterTotal} onMealChange={saveMealLog} onAddFood={(meal) => setFoodDialog({ meal })} onEditEntry={setFoodEntryEdit} onDeleteEntry={deleteFoodEntry} onQuickWater={quickWater} onEditWater={(entry) => { setWaterEdit(entry); setWaterFormOpen(true) }} onDeleteWater={deleteWater} onLogWater={() => { setWaterEdit(null); setWaterFormOpen(true) }} />}
      {section === 'foods' && <FoodLibrary foods={data.foods} onAdd={() => { setFoodItemEdit(null); setFoodItemFormOpen(true) }} onEdit={(food) => { setFoodItemEdit(food); setFoodItemFormOpen(true) }} onDelete={deleteFoodItem} />}
      {section === 'insights' && <NutritionInsights data={data} />}
      <footer className="page-footer">A caring log can offer useful context without turning food into a score.</footer>

      {foodDialog && <FoodSearchDialog meal={foodDialog.meal} foods={data.foods} date={date} onClose={() => setFoodDialog(null)} onAdd={addFood} onSaveNewFood={(food, amount) => { const entry = makeFoodEntry(food, date, foodDialog.meal, amount, createNutritionId()); commit({ ...data, foods: [food, ...data.foods.filter((item) => item.id !== food.id)], entries: [entry, ...data.entries] }, 'Custom food saved and added to your log.'); setFoodDialog(null) }} />}
      {foodItemFormOpen && <FoodItemForm initialFood={foodItemEdit} onClose={() => { setFoodItemFormOpen(false); setFoodItemEdit(null) }} onSave={saveFoodItem} />}
      {foodEntryEdit && <FoodEntryForm entry={foodEntryEdit} onClose={() => setFoodEntryEdit(null)} onSave={saveFoodEntry} />}
      {waterFormOpen && <WaterForm date={date} initialEntry={waterEdit} onClose={() => { setWaterFormOpen(false); setWaterEdit(null) }} onSave={saveWater} />}
      {goalsFormOpen && <GoalsForm goals={data.goals} onClose={() => setGoalsFormOpen(false)} onSave={saveGoals} />}
      {toast && <div className="nutrition-toast" role="status"><Check size={15} />{toast}<button aria-label="Dismiss message" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  )
}

function NutritionGoalCard({ icon, label, value, goal, unit, unknown = 0, hasValue = true }: { icon: ReactNode; label: string; value: number; goal: number; unit: string; unknown?: number; hasValue?: boolean }) {
  const remaining = Math.max(0, goal - value)
  const percent = progressPercent(value, goal)
  return <article className="nutrition-goal-card"><div className="nutrition-goal-top"><span className={`nutrition-goal-icon ${label.toLowerCase()}`}>{icon}</span><span>{label}</span></div><div className="nutrition-goal-numbers"><strong>{hasValue ? `${Math.round(value).toLocaleString()}${unknown ? '+' : ''}` : '—'}</strong><span>of {goal.toLocaleString()} {unit}</span></div><div className="nutrition-meter" role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(value, goal)}><i style={{ width: `${percent}%` }} /></div><div className="nutrition-goal-bottom"><span>{unknown ? hasValue ? 'Known values only; some entries need details' : 'Some entries need nutrition details' : !hasValue ? 'No entries recorded for this day' : value >= goal ? 'Goal guide reached' : `${Math.round(remaining).toLocaleString()} ${unit} to goal`}</span><span>{hasValue ? `${percent}%` : '—'}</span></div></article>
}

function DailyJournal({ date, log, entries, waterEntries, goals, totals, waterTotal, onMealChange, onAddFood, onEditEntry, onDeleteEntry, onQuickWater, onEditWater, onDeleteWater, onLogWater }: {
  date: string; log: DailyNutritionLog; entries: FoodLogEntry[]; waterEntries: WaterEntry[]; goals: NutritionGoals; totals: ReturnType<typeof summarizeEntries>; waterTotal: number;
  onMealChange: (meal: MealType, patch: { reviewed?: boolean; note?: string }) => void; onAddFood: (meal: MealType) => void; onEditEntry: (entry: FoodLogEntry) => void; onDeleteEntry: (entry: FoodLogEntry) => void; onQuickWater: (amountMl: number) => void; onEditWater: (entry: WaterEntry) => void; onDeleteWater: (entry: WaterEntry) => void; onLogWater: () => void
}) {
  const checkedMeals = Object.values(log.meals).filter((meal) => meal?.reviewed).length
  const support = !entries.length ? 'Start with anything you’ve had. Even one entry offers a clearer picture.' : totals.unknownNutrition ? 'Your food log is a reference, not a grade. Some nutrition values are still to be filled in.' : checkedMeals ? 'Thanks for checking in with yourself today.' : 'Your log is here to inform, not grade you.'
  return <div className="nutrition-daily-layout"><section className="nutrition-main-column"><section className="nutrition-panel meal-journal-panel"><header className="nutrition-panel-header"><div><p className="eyebrow">{displayNutritionDate(date, { month: 'short', day: 'numeric' }).toUpperCase()} · FOOD JOURNAL</p><h2>Meals & snacks</h2><p>Add items as you go; portions and meal types stay editable.</p></div><span className="meal-check-count">{checkedMeals} reviewed</span></header>
      <div className="meal-list">{mealTypes.map((meal) => <MealSection key={meal} meal={meal} entries={entries.filter((entry) => entry.meal === meal)} state={log.meals[meal]} onAdd={() => onAddFood(meal)} onEdit={onEditEntry} onDelete={onDeleteEntry} onStateChange={(patch) => onMealChange(meal, patch)} />)}</div>
      <div className="nutrition-daily-total"><div><span>Daily total</span>{totals.estimatedNutrition > 0 && <small>Includes estimated food values</small>}{totals.unknownNutrition > 0 && <small>{totals.unknownNutrition} {totals.unknownNutrition === 1 ? 'entry needs' : 'entries need'} nutrition values</small>}</div><strong>{dailyMacroDisplay(totals.caloriesKcal, totals.missingCalories, entries.length)} <small>kcal</small></strong><strong>{dailyMacroDisplay(totals.proteinG, totals.missingProtein, entries.length, true)} <small>g protein</small></strong></div>
    </section><p className="nutrition-support-note"><span>✳</span>{support}</p></section>
    <aside className="nutrition-side-column"><WaterTracker date={date} entries={waterEntries} total={waterTotal} goal={goals.waterMl} onQuickAdd={onQuickWater} onLogCustom={onLogWater} onEdit={onEditWater} onDelete={onDeleteWater} /><section className="nutrition-checklist-card"><div className="nutrition-checklist-heading"><span className="checklist-mark"><Check size={15} /></span><div><strong>Gentle check-in</strong><small>Mark meals you’ve reviewed, if helpful.</small></div></div><div className="checklist-progress"><i style={{ width: `${checkedMeals / mealTypes.length * 100}%` }} /></div><span className="checklist-caption">{checkedMeals} of {mealTypes.length} meals reviewed · optional</span></section></aside>
  </div>
}

function MealSection({ meal, entries, state, onAdd, onEdit, onDelete, onStateChange }: { meal: MealType; entries: FoodLogEntry[]; state?: DailyNutritionLog['meals'][MealType]; onAdd: () => void; onEdit: (entry: FoodLogEntry) => void; onDelete: (entry: FoodLogEntry) => void; onStateChange: (patch: { reviewed?: boolean; note?: string }) => void }) {
  const totals = mealSummary(entries, meal)
  const [expanded, setExpanded] = useState(Boolean(entries.length || state?.note))
  return <section className={`meal-section ${expanded ? 'expanded' : ''}`}><header className="meal-section-header"><button type="button" className="meal-expand-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span className="meal-dot" /><span className="meal-section-name">{meal}</span><span className="meal-entry-count">{entries.length || '—'}</span><ChevronDown size={15} className="meal-chevron" /></button><div className="meal-section-totals"><span>{dailyMacroDisplay(totals.caloriesKcal, totals.missingCalories, entries.length)} kcal</span><span>{dailyMacroDisplay(totals.proteinG, totals.missingProtein, entries.length, true)} g protein</span></div><button className="meal-add-button" aria-label={`Add food to ${meal}`} onClick={onAdd}><Plus size={15} /></button></header>
    {expanded && <div className="meal-section-content">{entries.length ? <div className="meal-food-list">{entries.map((entry) => <article className="meal-food-entry" key={entry.id}><div><strong>{entry.foodName}</strong>{entry.brand && <span className="food-brand">{entry.brand}</span>}<small>{formatPortion(entry.portionAmount, entry.servingUnit)}{entry.estimated && <em>Estimate</em>}{entry.notes && ` · ${entry.notes}`}</small></div><span className="meal-food-nutrition">{entry.caloriesKcal === undefined ? '— kcal' : `${Math.round(entry.caloriesKcal)} kcal`}<small>{entry.proteinG === undefined ? '— g protein' : `${entry.proteinG.toFixed(1)} g protein`}</small></span><div className="meal-food-actions"><button className="nutrition-icon-button" aria-label={`Edit ${entry.foodName}`} onClick={() => onEdit(entry)}><Pencil size={14} /></button><button className="nutrition-icon-button delete" aria-label={`Remove ${entry.foodName}`} onClick={() => onDelete(entry)}><Trash2 size={14} /></button></div></article>)}</div> : <p className="meal-empty">Nothing logged for this meal. Add something when you’re ready.</p>}
      <div className="meal-state-row"><label><input type="checkbox" checked={Boolean(state?.reviewed)} onChange={(event) => onStateChange({ reviewed: event.target.checked })} />Reviewed <span>optional</span></label><input value={state?.note ?? ''} onChange={(event) => onStateChange({ note: event.target.value })} onBlur={(event) => onStateChange({ note: event.target.value.trim() })} placeholder="Add a meal note" aria-label={`${meal} note`} /></div>
      <button className="meal-add-text" onClick={onAdd}><Plus size={13} />Add food</button></div>}
  </section>
}

function WaterTracker({ date, entries, total, goal, onQuickAdd, onLogCustom, onEdit, onDelete }: { date: string; entries: WaterEntry[]; total: number; goal: number; onQuickAdd: (amountMl: number) => void; onLogCustom: () => void; onEdit: (entry: WaterEntry) => void; onDelete: (entry: WaterEntry) => void }) {
  return <section className="nutrition-panel water-tracker"><header className="water-header"><span className="water-mark"><Droplets size={17} /></span><div><p className="eyebrow">HYDRATION</p><h2>Water</h2></div><span className="water-date">{displayNutritionDate(date, { month: 'short', day: 'numeric' })}</span></header><div className="water-total-row"><strong>{entries.length ? waterLiters(total) : '—'}<small>{entries.length ? ' L' : ''}</small></strong>{entries.length > 0 && <span>of {waterLiters(goal)} L</span>}</div><div className="water-meter"><i style={{ width: `${progressPercent(total, goal)}%` }} /></div><span className="water-remaining">{!entries.length ? 'No water entries recorded yet' : total >= goal ? 'Daily guide reached' : `${waterLiters(Math.max(0, goal - total))} L to daily guide`}</span><p className="water-quick-label">Quick add · amounts in 500 ml steps</p><div className="water-quick-add">{[500, 1000, 1500, 2000].map((amount) => <button key={amount} onClick={() => onQuickAdd(amount)}><Plus size={12} />{amount >= 1000 ? `${waterLiters(amount)} L` : `${amount} ml`}</button>)}</div><button className="water-custom-button" onClick={onLogCustom}><Plus size={13} />Custom amount</button>
    {entries.length > 0 && <div className="water-entry-list"><div className="water-entry-list-heading"><span>Today’s water log</span><small>{entries.length} entries</small></div>{entries.map((entry) => <div className="water-entry-row" key={entry.id}><CupSoda size={14} /><span>{entry.amountMl} ml {entry.note && <small>· {entry.note}</small>}</span><button className="nutrition-icon-button" aria-label={`Edit ${entry.amountMl} ml water entry`} onClick={() => onEdit(entry)}><Pencil size={13} /></button><button className="nutrition-icon-button delete" aria-label={`Remove ${entry.amountMl} ml water entry`} onClick={() => onDelete(entry)}><X size={14} /></button></div>)}</div>}
  </section>
}

function FoodSearchDialog({ meal, foods, date, onClose, onAdd, onSaveNewFood }: { meal: MealType; foods: FoodItem[]; date: string; onClose: () => void; onAdd: (food: FoodItem, portion: number, meal: MealType) => void; onSaveNewFood: (food: FoodItem, amount: number) => void }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(foods[0]?.id ?? '')
  const [portion, setPortion] = useState('')
  const [selectedMeal, setSelectedMeal] = useState<MealType>(meal)
  const [newFoodMode, setNewFoodMode] = useState(false)
  const [error, setError] = useState('')
  const selectedFood = foods.find((food) => food.id === selectedId)
  const filtered = foods.filter((food) => `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const amount = portion === '' ? selectedFood?.servingAmount ?? 1 : Number(portion)
  const preview = selectedFood && amount > 0 ? scaleNutrition(selectedFood, amount) : undefined
  function choose(food: FoodItem) { setSelectedId(food.id); setPortion(food.servingAmount.toString()); setError('') }
  function changeSearch(value: string) { const matches = foods.filter((food) => `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(value.toLowerCase())); setSearch(value); setSelectedId(matches[0]?.id ?? ''); setPortion(matches[0]?.servingAmount.toString() ?? '') }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selectedFood) { setError('Choose a food to add.'); return } if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a portion greater than zero.'); return } onAdd(selectedFood, amount, selectedMeal) }
  return <NutritionDialog title={newFoodMode ? 'Create a food' : `Add food · ${meal}`} description={newFoodMode ? 'Save a custom food and add it to this meal.' : displayNutritionDate(date)} onClose={onClose} wide>
    {newFoodMode ? <FoodItemFormContent onCancel={() => setNewFoodMode(false)} onSave={(food) => { const itemAmount = food.servingAmount; onSaveNewFood(food, itemAmount) }} /> : <form className="nutrition-form" onSubmit={submit} noValidate><label className="nutrition-field"><span>Search your food library</span><div className="search-input-wrap"><Search size={15} /><input autoFocus value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Try milk, paneer, fruit…" /></div></label><div className="food-search-results">{filtered.length ? filtered.map((food) => <button type="button" key={food.id} className={`food-search-result ${selectedId === food.id ? 'selected' : ''}`} onClick={() => choose(food)}><span><strong>{food.name}</strong>{food.brand && <small>{food.brand}</small>}{food.estimated && <em>Estimate</em>}{food.caloriesKcal === undefined || food.proteinG === undefined ? <small>Values needed</small> : <small>{Math.round(food.caloriesKcal)} kcal · {food.proteinG} g protein / {formatPortion(food.servingAmount, food.servingUnit)}</small>}</span><i>{selectedId === food.id && <Check size={14} />}</i></button>) : <p className="food-search-empty">No matching food. Create it for your library.</p>}</div><div className="food-add-options"><label className="nutrition-field"><span>Portion · {selectedFood?.servingUnit ?? 'serving'}</span><input type="number" min="0.01" step="any" value={portion || selectedFood?.servingAmount || ''} onChange={(event) => setPortion(event.target.value)} /></label><label className="nutrition-field"><span>Meal</span><select value={selectedMeal} onChange={(event) => setSelectedMeal(event.target.value as MealType)}>{mealTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div>{preview && <p className="food-add-preview">{preview.caloriesKcal === undefined ? 'Calories not entered' : `${Math.round(preview.caloriesKcal)} kcal`} · {preview.proteinG === undefined ? 'Protein not entered' : `${preview.proteinG.toFixed(1)} g protein`}{selectedFood?.estimated && <em>Estimate</em>}</p>}{error && <p className="nutrition-error" role="alert">{error}</p>}<div className="nutrition-dialog-actions split-actions"><button type="button" className="text-action" onClick={() => setNewFoodMode(true)}><Plus size={14} />Create custom food</button><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Plus size={15} />Add food</button></div></div></form>}
  </NutritionDialog>
}

function FoodLibrary({ foods, onAdd, onEdit, onDelete }: { foods: FoodItem[]; onAdd: () => void; onEdit: (food: FoodItem) => void; onDelete: (food: FoodItem) => void }) {
  const [search, setSearch] = useState('')
  const filtered = foods.filter((food) => `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  return <section className="nutrition-panel food-library-panel"><header className="nutrition-panel-header"><div><p className="eyebrow">YOUR REUSABLE FOODS</p><h2>Food library</h2><p>Save the foods you reach for and adjust their values anytime.</p></div><button className="primary-button compact-button" onClick={onAdd}><Plus size={15} />Create food</button></header><div className="food-library-toolbar"><div className="search-input-wrap"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search foods" aria-label="Search food library" /></div><span>{foods.length} foods</span></div>{filtered.length ? <div className="food-library-grid">{filtered.map((food) => <article className="food-library-card" key={food.id}><div className="food-library-card-title"><span className="food-library-icon"><Utensils size={15} /></span><div><h3>{food.name}</h3><small>{food.brand || food.servingDescription}</small></div></div><div className="food-library-facts">{food.caloriesKcal === undefined ? 'Calories not entered' : `${food.caloriesKcal} kcal`}<i />{food.proteinG === undefined ? 'Protein not entered' : `${food.proteinG} g protein`}</div><div className="food-library-foot"><span>{food.estimated ? 'Estimated values' : food.nutritionBasis === '100g' ? 'Per 100 g/ml' : 'Per serving'}</span><div><button className="nutrition-icon-button" aria-label={`Edit ${food.name}`} onClick={() => onEdit(food)}><Pencil size={14} /></button><button className="nutrition-icon-button delete" aria-label={`Delete ${food.name}`} onClick={() => onDelete(food)}><Trash2 size={14} /></button></div></div></article>)}</div> : <NutritionEmpty title="No foods found" text={search ? 'Try a different search or add this food to your library.' : 'Create a reusable food record to make meal logging quicker.'} action={!search ? <button className="primary-button" onClick={onAdd}><Plus size={15} />Create food</button> : undefined} />}</section>
}

function FoodItemForm({ initialFood, onClose, onSave }: { initialFood: FoodItem | null; onClose: () => void; onSave: (food: FoodItem) => void }) {
  return <NutritionDialog title={initialFood ? 'Edit food' : 'Create a food'} description="Food values are editable and can be estimates when needed." onClose={onClose}><FoodItemFormContent initialFood={initialFood} onCancel={onClose} onSave={onSave} /></NutritionDialog>
}

function FoodItemFormContent({ initialFood, onCancel, onSave }: { initialFood?: FoodItem | null; onCancel: () => void; onSave: (food: FoodItem) => void }) {
  const [name, setName] = useState(initialFood?.name ?? '')
  const [brand, setBrand] = useState(initialFood?.brand ?? '')
  const [servingDescription, setServingDescription] = useState(initialFood?.servingDescription ?? '')
  const [servingAmount, setServingAmount] = useState(initialFood?.servingAmount.toString() ?? '1')
  const [servingUnit, setServingUnit] = useState<ServingUnit>(initialFood?.servingUnit ?? 'serving')
  const [basis, setBasis] = useState<NutritionBasis>(initialFood?.nutritionBasis ?? 'serving')
  const [calories, setCalories] = useState(initialFood?.caloriesKcal?.toString() ?? '')
  const [protein, setProtein] = useState(initialFood?.proteinG?.toString() ?? '')
  const [carbs, setCarbs] = useState(initialFood?.carbohydratesG?.toString() ?? '')
  const [fat, setFat] = useState(initialFood?.fatG?.toString() ?? '')
  const [notes, setNotes] = useState(initialFood?.notes ?? '')
  const [estimated, setEstimated] = useState(initialFood?.estimated ?? false)
  const [error, setError] = useState('')
  function updateUnit(value: ServingUnit) { setServingUnit(value); if (!['g', 'ml'].includes(value)) setBasis('serving') }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(servingAmount)
    const parseOptional = (value: string) => value.trim() === '' ? undefined : Number(value)
    const nutrientValues = [calories, protein, carbs, fat].map(parseOptional)
    if (!name.trim()) { setError('Add a food name.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Serving amount must be greater than zero.'); return }
    if (nutrientValues.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) { setError('Nutrition values must be zero or greater.'); return }
    onSave({ id: initialFood?.id ?? createNutritionId(), name: name.trim(), brand: brand.trim() || undefined, servingDescription: servingDescription.trim() || `${amount} ${servingUnit}`, servingAmount: amount, servingUnit, nutritionBasis: basis, caloriesKcal: nutrientValues[0], proteinG: nutrientValues[1], carbohydratesG: nutrientValues[2], fatG: nutrientValues[3], notes: notes.trim() || undefined, estimated })
  }
  return <form className="nutrition-form" onSubmit={submit} noValidate><label className="nutrition-field"><span>Food name <b>Required</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Homemade paneer wrap" /></label><div className="nutrition-form-row"><label className="nutrition-field"><span>Brand <small>optional</small></span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Product or source" /></label><label className="nutrition-field"><span>Serving description</span><input value={servingDescription} onChange={(event) => setServingDescription(event.target.value)} placeholder="e.g. 1 medium bowl" /></label></div><div className="nutrition-form-row three"><label className="nutrition-field"><span>Serving amount</span><input type="number" min="0.01" step="any" value={servingAmount} onChange={(event) => setServingAmount(event.target.value)} /></label><label className="nutrition-field"><span>Unit</span><select value={servingUnit} onChange={(event) => updateUnit(event.target.value as ServingUnit)}>{servingUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label><label className="nutrition-field"><span>Nutrition entered</span><select value={basis} onChange={(event) => setBasis(event.target.value as NutritionBasis)}><option value="serving">Per serving</option><option value="100g" disabled={!['g', 'ml'].includes(servingUnit)}>Per 100 g/ml</option></select></label></div><p className="nutrition-basis-help">{basis === '100g' ? 'Values below are per 100 g/ml and scale with the portion you log.' : `Values below are for ${servingDescription.trim() || `${servingAmount} ${servingUnit}`}.`}</p><div className="nutrition-form-row four"><label className="nutrition-field"><span>Calories · kcal</span><input type="number" min="0" step="any" value={calories} onChange={(event) => setCalories(event.target.value)} placeholder="e.g. 220" /></label><label className="nutrition-field"><span>Protein · g</span><input type="number" min="0" step="any" value={protein} onChange={(event) => setProtein(event.target.value)} placeholder="e.g. 8" /></label><label className="nutrition-field"><span>Carbs · g <small>optional</small></span><input type="number" min="0" step="any" value={carbs} onChange={(event) => setCarbs(event.target.value)} placeholder="—" /></label><label className="nutrition-field"><span>Fat · g <small>optional</small></span><input type="number" min="0" step="any" value={fat} onChange={(event) => setFat(event.target.value)} placeholder="—" /></label></div><label className="nutrition-field"><span>Notes or source</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Where did these values come from?" /></label><label className="nutrition-estimate-check"><input type="checkbox" checked={estimated} onChange={(event) => setEstimated(event.target.checked)} /><span>Mark these values as an estimate</span></label>{error && <p className="nutrition-error" role="alert">{error}</p>}<div className="nutrition-dialog-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit"><Check size={15} />Save food</button></div></form>
}

function FoodEntryForm({ entry, onClose, onSave }: { entry: FoodLogEntry; onClose: () => void; onSave: (entry: FoodLogEntry) => void }) {
  const factor = entry.nutritionBasis === '100g' ? entry.portionAmount / 100 : entry.portionAmount / entry.servingAmount
  const originalValue = (value?: number) => value === undefined || factor <= 0 ? undefined : value / factor
  const food: FoodItem = { id: entry.foodId ?? entry.id, name: entry.foodName, brand: entry.brand, servingDescription: `${entry.servingAmount} ${entry.servingUnit}`, servingAmount: entry.servingAmount, servingUnit: entry.servingUnit, nutritionBasis: entry.nutritionBasis, caloriesKcal: originalValue(entry.caloriesKcal), proteinG: originalValue(entry.proteinG), carbohydratesG: originalValue(entry.carbohydratesG), fatG: originalValue(entry.fatG), estimated: entry.estimated }
  const [amount, setAmount] = useState(entry.portionAmount.toString())
  const [meal, setMeal] = useState<MealType>(entry.meal)
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const portion = Number(amount); if (!Number.isFinite(portion) || portion <= 0) { setError('Portion must be greater than zero.'); return } onSave(makeFoodEntry(food, entry.date, meal, portion, entry.id, notes)) }
  return <NutritionDialog title={`Edit ${entry.foodName}`} description="Adjust the portion, meal, or note for this date." onClose={onClose}><form className="nutrition-form" onSubmit={submit} noValidate><label className="nutrition-field"><span>Food</span><input value={`${entry.foodName}${entry.brand ? ` · ${entry.brand}` : ''}`} readOnly /></label><div className="nutrition-form-row"><label className="nutrition-field"><span>Portion · {entry.servingUnit}</span><input type="number" min="0.01" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="nutrition-field"><span>Meal</span><select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{mealTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="nutrition-field"><span>Updated nutrition</span><p className="food-add-preview">{scaleNutrition(food, Number(amount) || 0).caloriesKcal ?? '—'} kcal · {scaleNutrition(food, Number(amount) || 0).proteinG ?? '—'} g protein{entry.estimated && ' · estimate'}</p></div><label className="nutrition-field"><span>Note</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="nutrition-error" role="alert">{error}</p>}<div className="nutrition-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Check size={15} />Save changes</button></div></form></NutritionDialog>
}

function WaterForm({ date, initialEntry, onClose, onSave }: { date: string; initialEntry: WaterEntry | null; onClose: () => void; onSave: (entry: WaterEntry) => void }) {
  const [amount, setAmount] = useState(initialEntry?.amountMl.toString() ?? '')
  const [entryDate, setEntryDate] = useState(initialEntry?.date ?? date)
  const [note, setNote] = useState(initialEntry?.note ?? '')
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = Number(amount); if (!entryDate) { setError('Choose the date for this entry.'); return } if (!Number.isFinite(value) || value <= 0 || value > 10000) { setError('Enter an amount between 1 and 10,000 ml.'); return } onSave({ id: initialEntry?.id ?? createNutritionId(), date: entryDate, amountMl: Math.round(value), note: note.trim() || undefined }) }
  return <NutritionDialog title={initialEntry ? 'Edit water entry' : 'Log water'} description="Water can be logged separately from meals, in any amount." onClose={onClose}><form className="nutrition-form" onSubmit={submit} noValidate><div className="nutrition-form-row"><label className="nutrition-field"><span>Amount · ml</span><input type="number" min="1" max="10000" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 350" /></label><label className="nutrition-field"><span>Date</span><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label></div><label className="nutrition-field"><span>Note <small>optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. After the gym" /></label>{error && <p className="nutrition-error" role="alert">{error}</p>}<div className="nutrition-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Check size={15} />Save water</button></div></form></NutritionDialog>
}

function GoalsForm({ goals, onClose, onSave }: { goals: NutritionGoals; onClose: () => void; onSave: (goals: NutritionGoals) => void }) {
  const [calories, setCalories] = useState(goals.caloriesKcal.toString())
  const [protein, setProtein] = useState(goals.proteinG.toString())
  const [water, setWater] = useState(goals.waterMl.toString())
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = [Number(calories), Number(protein), Number(water)]; if (values.some((value) => !Number.isFinite(value) || value <= 0 || value > 100000)) { setError('Each daily goal must be greater than zero.'); return } onSave({ caloriesKcal: values[0], proteinG: values[1], waterMl: values[2] }) }
  return <NutritionDialog title="Daily goals" description="Set gentle daily guides that work for you. You can change them anytime." onClose={onClose}><form className="nutrition-form" onSubmit={submit} noValidate><label className="nutrition-field"><span>Calories · kcal</span><input type="number" min="1" value={calories} onChange={(event) => setCalories(event.target.value)} /></label><label className="nutrition-field"><span>Protein · g</span><input type="number" min="1" step="any" value={protein} onChange={(event) => setProtein(event.target.value)} /></label><label className="nutrition-field"><span>Water · ml</span><input type="number" min="1" value={water} onChange={(event) => setWater(event.target.value)} /></label><p className="nutrition-basis-help">These are personal reference points, not requirements or pass/fail scores.</p>{error && <p className="nutrition-error" role="alert">{error}</p>}<div className="nutrition-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Check size={15} />Save goals</button></div></form></NutritionDialog>
}

function NutritionInsights({ data }: { data: NutritionData }) {
  const [range, setRange] = useState<InsightRange>('7d')
  const history = nutritionHistory(data, range)
  const averages = nutritionAverages(data, range)
  const last7 = nutritionHistory(data, '7d').reverse()
  const periodLabel = range === '7d' ? '7 days' : range === '4w' ? '4 weeks' : 'all time'
  const waterSufficient = averages.waterDays >= 2
  return <div className="nutrition-insights-layout"><section className="nutrition-panel nutrition-insights-panel"><header className="nutrition-panel-header"><div><p className="eyebrow">PATTERNS, NOT SCORES</p><h2>History & insights</h2><p>Days without a food log are left out of food averages, not counted as zero.</p></div><label className="nutrition-range"><span>Date range</span><select value={range} onChange={(event) => setRange(event.target.value as InsightRange)}><option value="7d">7 days</option><option value="4w">4 weeks</option><option value="all">All time</option></select></label></header>
      <div className="nutrition-average-grid"><InsightAverage label="Average calories" value={averages.calorieAverage === undefined ? '—' : `${Math.round(averages.calorieAverage).toLocaleString()} kcal`} note={averages.completeFoodDays ? `Across ${averages.completeFoodDays} fully valued food ${averages.completeFoodDays === 1 ? 'day' : 'days'}` : 'No fully valued food days'} /><InsightAverage label="Average protein" value={averages.proteinAverage === undefined ? '—' : `${averages.proteinAverage.toFixed(1)} g`} note="Days with complete calorie and protein values" /><InsightAverage label="Average water" value={!waterSufficient ? '—' : `${Math.round(averages.waterAverage ?? 0).toLocaleString()} ml`} note={waterSufficient ? `Across ${averages.waterDays} days with water entries` : 'Log water on at least two days'} /></div>
      <section className="nutrition-week-overview"><div className="insights-subheading"><div><h3>Recent days</h3><p>Only recorded days appear; bars show calorie values when available.</p></div><span>{averages.loggedFoodDays} food-log days · {averages.totalDays} total days with entries</span></div>{last7.length ? <div className="nutrition-week-bars">{last7.map((day) => { const hasCalories = day.entries.length > 0 && day.summary.missingCalories < day.entries.length; return <div key={day.date} className="nutrition-week-day"><div className="nutrition-week-bar" title={hasCalories ? `${Math.round(day.summary.caloriesKcal)}${day.summary.missingCalories ? '+' : ''} kcal logged${day.summary.missingCalories ? ' · partial values' : ''}` : day.kind}><i style={{ height: hasCalories ? `${Math.max(8, Math.min(100, day.summary.caloriesKcal / Math.max(data.goals.caloriesKcal, 1) * 100))}%` : 0 }} /></div><strong>{displayNutritionDate(day.date, { weekday: 'narrow' })}</strong><span>{day.entries.length ? 'Food' : day.water.length ? 'Water' : 'Note'}</span></div>})}</div> : <NutritionEmpty title="No recent records" text="Your history will appear here when you log food, water, or a meal note." />}</section>
      {history.length ? <div className="nutrition-history-list"><div className="nutrition-history-heading"><h3>Previous logs</h3><span>{range === 'all' ? 'All recorded dates' : `Last ${periodLabel}`}</span></div>{history.map((day) => <article className="nutrition-history-row" key={day.date}><div className="nutrition-history-date"><strong>{displayNutritionDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><span className={`history-status ${day.entries.length ? 'has-food' : ''}`}>{day.kind}</span></div>{day.entries.length ? <><div className="nutrition-history-values"><strong>{day.summary.missingCalories === day.entries.length ? '— kcal' : `${Math.round(day.summary.caloriesKcal)}${day.summary.missingCalories ? '+' : ''} kcal`}</strong><span>{day.summary.missingProtein === day.entries.length ? 'Protein unavailable' : `${day.summary.proteinG.toFixed(1)}${day.summary.missingProtein ? '+' : ''} g protein`}</span></div><div className="nutrition-history-water"><Droplets size={13} />{day.water.length ? `${day.waterMl} ml` : 'No water log'}</div></> : <><div className="nutrition-history-values"><span>No food entries recorded</span></div><div className="nutrition-history-water">{day.water.length ? <><Droplets size={13} />{day.waterMl} ml</> : `${day.mealChecks} meal checks`}</div></>}</article>)}</div> : <NutritionEmpty title="Nothing in this period yet" text="Choose a wider date range or start logging when you’re ready." />}
    </section><aside className="nutrition-gentle-card"><span className="gentle-card-icon"><BookOpen size={17} /></span><h3>Gentle by design</h3><p>A missing day is simply a day without a record. It doesn’t say anything about what you ate.</p><p>Some starter foods use editable estimates. Your product labels or recipe details will be more specific.</p></aside></div>
}

function InsightAverage({ label, value, note }: { label: string; value: string; note: string }) { return <article className="nutrition-average-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article> }

function NutritionDialog({ title, description, children, onClose, wide = false }: { title: string; description: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => { function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') onClose() } window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape) }, [onClose])
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`task-dialog nutrition-dialog ${wide ? 'nutrition-dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="nutrition-dialog-title" aria-describedby="nutrition-dialog-description" onKeyDown={(event) => { if (event.key !== 'Tab') return; const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea')).filter((element) => !element.hasAttribute('disabled')); const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } }}><div className="dialog-top"><div className="dialog-mark"><Apple size={18} /></div><button className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div><h2 id="nutrition-dialog-title">{title}</h2><p id="nutrition-dialog-description">{description}</p>{children}</section></div>
}

function NutritionEmpty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="nutrition-empty"><span><Apple size={19} /></span><h3>{title}</h3><p>{text}</p>{action}</div> }

function formatPortion(amount: number, unit: ServingUnit) { return `${Number.isInteger(amount) ? amount : Number(amount.toFixed(2))} ${unit}` }
function dailyMacroDisplay(value: number, missing: number, total: number, grams = false) { if (!total || missing === total) return '—'; return `${grams ? value.toFixed(1) : Math.round(value).toLocaleString()}${missing ? '+' : ''}` }
function waterLiters(ml: number) { return (ml / 1000).toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') }

