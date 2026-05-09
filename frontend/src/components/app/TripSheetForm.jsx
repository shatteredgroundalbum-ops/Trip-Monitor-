import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import { EVENT_CODES, TRAILER_TYPES, US_STATES, SEED_CITIES, FLAT_CITY_STATES } from "../../data/constants";
import { Info, Plus, Minus, CalendarIcon, AlertTriangle, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Copy, CheckCircle2, Pencil } from "lucide-react";
import { format, parse } from "date-fns";
import { api } from "../../lib/api";
import { toast } from "sonner";
import useLongPress from "../../lib/useLongPress";
import MileageCard from "./MileageCard";

const EVENT_LABELS = Object.fromEntries(EVENT_CODES.map((e) => [e.code, e.label]));

const isRowFilled = (r) =>
  !!(r && (r.event_code || r.location_name || r.stop_city || r.trailer_number || r.departure_time));

export default function TripSheetForm({ session, onChange, mileageMode = "workflow" }) {
  const [local, setLocal] = useState(session);
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedTrailers, setSavedTrailers] = useState([]);
  const [savedCities, setSavedCities] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const isSegment = mileageMode === "segment";

  useEffect(() => {
    setLocal(session);
    setActiveIdx(0);
  }, [session.session_id]);

  useEffect(() => {
    (async () => {
      try {
        const [l, t, c] = await Promise.all([
          api.get("/locations"), api.get("/trailers"), api.get("/cities"),
        ]);
        setSavedLocations(l.data || []);
        setSavedTrailers(t.data || []);
        setSavedCities(c.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // In segment mode, auto-recompute total_trip_miles from each row's segment_miles.
  useEffect(() => {
    if (!isSegment || !local) return;
    const sum = (local.rows || []).reduce(
      (acc, r) => acc + (Number(r.segment_miles) || 0),
      0
    );
    if ((Number(local.total_trip_miles) || 0) !== sum) {
      setLocal((p) => ({ ...p, total_trip_miles: sum > 0 ? sum : null }));
    }
  }, [isSegment, local]);

  // Auto-save with debounce
  useEffect(() => {
    if (!local) return;
    const t = setTimeout(() => {
      api.put(`/trip-sessions/${local.session_id}`, {
        rows: local.rows, road_expenses: local.road_expenses, notes: local.notes,
        order_number: local.order_number, bol_number: local.bol_number,
        truck_number: local.truck_number,
        total_trip_miles: local.total_trip_miles ?? null,
      }).then(() => onChange?.(local)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [local, onChange]);

  const updateRow = (idx, patch) => {
    setLocal((p) => ({
      ...p,
      rows: p.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };

  const updateExpense = (idx, patch) => {
    setLocal((p) => ({
      ...p,
      road_expenses: p.road_expenses.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };

  const addRow = () => {
    setLocal((p) => {
      const nextSeq = p.rows.length + 1;
      const next = { ...p, rows: [...p.rows, { seq: nextSeq }] };
      // jump to the newly added row
      setActiveIdx(next.rows.length - 1);
      return next;
    });
  };

  /** Duplicate a row's data into the next empty row, or append a new row if none. */
  const duplicateRow = (srcIdx) => {
    let targetIdx = null;
    setLocal((p) => {
      const src = p.rows[srcIdx];
      if (!src) return p;
      const isEmpty = (r) => !isRowFilled(r);
      const tIdx = p.rows.findIndex((r, i) => i > srcIdx && isEmpty(r));
      if (tIdx >= 0) {
        targetIdx = tIdx;
        const next = p.rows.map((r, i) =>
          i === tIdx ? { ...src, seq: r.seq, departure_time: "" } : r
        );
        return { ...p, rows: next };
      }
      const newSeq = p.rows.length + 1;
      targetIdx = p.rows.length;
      return {
        ...p,
        rows: [...p.rows, { ...src, seq: newSeq, departure_time: "" }],
      };
    });
    // Defer to after state update
    setTimeout(() => {
      if (targetIdx !== null) setActiveIdx(targetIdx);
    }, 0);
    toast.success("Stop duplicated — now editing the new stop");
  };

  const bumpLocation = (name) => name && api.post("/locations/bump", { name }).catch(() => {});
  const bumpTrailer = (number, type) => number && api.post("/trailers/bump", { number, type }).catch(() => {});
  const bumpCity = (city, state) => city && state && api.post("/cities/bump", { city, state }).catch(() => {});

  const hasTemp = local.has_temperature;
  const totalRows = local.rows.length;
  const filledCount = local.rows.filter(isRowFilled).length;

  const goToRow = (i) => {
    if (i < 0 || i >= totalRows) return;
    setActiveIdx(i);
    // Smooth-scroll the active card into view shortly after re-render
    setTimeout(() => {
      const el = document.querySelector(`[data-active-row-card="true"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleContinue = () => {
    if (activeIdx < totalRows - 1) {
      goToRow(activeIdx + 1);
    } else {
      toast.success("All stops complete. Scroll down to add expenses & notes.");
    }
  };

  const totalSegmentMiles = (local.rows || []).reduce((a, r) => a + (Number(r.segment_miles) || 0), 0);
  const totalMiles = isSegment ? totalSegmentMiles : (Number(local.total_trip_miles) || 0);

  return (
    <div className="space-y-6">
      {/* Total Trip Miles — required at finish. In WORKFLOW mode driver
          types the round-trip total. In SEGMENT mode this card is read-only
          and shows the running sum of per-stop segment miles. */}
      <div
        data-testid="trip-miles-card"
        data-mode={isSegment ? "segment" : "workflow"}
        className={`rounded-md p-5 shadow-sm border-2 ${
          totalMiles > 0
            ? "bg-[var(--tm-blue)]/5 border-[var(--tm-blue)]"
            : "bg-[var(--tm-orange)]/5 border-[var(--tm-orange)]"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold flex items-center gap-1.5">
              Required
              <span className="text-[var(--tm-text-muted)]">·</span>
              <span className="text-[var(--tm-blue)]">{isSegment ? "Segment Mode" : "Workflow Mode"}</span>
            </div>
            <div className="text-base font-bold text-[var(--tm-navy)]">
              Total Trip Miles {isSegment ? "(Auto-summed)" : "(Round Trip)"}
            </div>
            <div className="text-xs text-[var(--tm-text-soft)]">
              {isSegment
                ? "Add the miles between each stop below; we'll keep this running total."
                : "Enter total miles for the entire trip — internal only, never on the printed sheet."}
            </div>
          </div>
          {totalMiles > 0 && (
            <span className="text-[10px] uppercase tracking-wider text-[var(--tm-blue)] font-bold whitespace-nowrap">
              ✓ Saved
            </span>
          )}
        </div>
        {isSegment ? (
          <div
            data-testid="trip-miles-segment-total"
            className="h-14 flex items-center justify-center text-3xl font-black bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md tabular-nums"
          >
            {totalSegmentMiles.toLocaleString()} <span className="text-base font-bold text-[var(--tm-text-soft)] ml-2">mi</span>
          </div>
        ) : (
          <Input
            data-testid="trip-miles-input"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="e.g. 542"
            value={local.total_trip_miles ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setLocal((p) => ({ ...p, total_trip_miles: v === "" ? null : Math.max(0, Number(v)) }));
            }}
            className="h-14 text-2xl font-black bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md"
          />
        )}
      </div>

      {/* Mileage card — Real Route vs Pay vs Difference (internal only). */}
      <MileageCard session={local} />

      {/* Meta card */}
      <div data-testid="trip-meta-card" className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-5 space-y-3 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Meta label="Driver ID" value={local.driver_id} />
          <Meta label="Truck #" value={local.truck_number || "—"} />
          <MetaInput label="Order #" value={local.order_number}
            onChange={(v) => setLocal((p) => ({ ...p, order_number: v }))}
            testId="form-order" />
          <MetaInput label="BOL #" value={local.bol_number}
            onChange={(v) => setLocal((p) => ({ ...p, bol_number: v }))}
            testId="form-bol" />
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)]">
          <span>Session: <span className="text-[var(--tm-orange)] font-bold">{local.session_type}</span></span>
          <span>· Load: <span className="text-[var(--tm-orange)] font-bold">{local.load_type}</span></span>
          {!hasTemp && <span>· No temperature</span>}
        </div>
      </div>

      {/* Stops wizard */}
      <div className="space-y-3" data-testid="stops-wizard">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)]">
            Stop <span className="text-[var(--tm-orange)] font-bold">{activeIdx + 1}</span> of {totalRows}
            <span className="ml-2 opacity-70">· {filledCount} filled</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] flex items-center gap-1">
            <Copy className="h-3 w-3" />
            Long-press to duplicate
          </div>
        </div>

        {/* Stepper dots */}
        <div className="flex flex-wrap gap-1.5" data-testid="stops-stepper">
          {local.rows.map((r, i) => {
            const filled = isRowFilled(r);
            const isActive = i === activeIdx;
            return (
              <button
                type="button"
                key={i}
                data-testid={`step-dot-${i + 1}`}
                onClick={() => goToRow(i)}
                aria-label={`Go to stop ${i + 1}`}
                className={
                  `h-7 min-w-7 px-2 rounded-md text-[11px] font-bold transition-colors border ` +
                  (isActive
                    ? "bg-[var(--tm-orange)] text-white border-[var(--tm-orange)]"
                    : filled
                      ? "bg-[var(--tm-blue)]/10 text-[var(--tm-navy)] border-[var(--tm-blue)]"
                      : "bg-white text-[var(--tm-text-soft)] border-[var(--tm-border)]")
                }
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Render rows: completed summaries (before active) + active expanded card.
            Future empty rows are hidden until reached. */}
        <div className="space-y-3">
          {local.rows.map((row, idx) => {
            if (idx === activeIdx) {
              return (
                <RowCard
                  key={idx}
                  row={row}
                  hasTemp={hasTemp}
                  isSegment={isSegment}
                  rowIndex={idx}
                  savedLocations={savedLocations}
                  savedTrailers={savedTrailers}
                  savedCities={savedCities}
                  onChange={(patch) => updateRow(idx, patch)}
                  onDuplicate={() => duplicateRow(idx)}
                  onLocationBlur={() => bumpLocation(row.location_name)}
                  onTrailerBlur={() => bumpTrailer(row.trailer_number, row.trailer_type)}
                  onCityBlur={() => bumpCity(row.stop_city, row.stop_state)}
                  onContinue={handleContinue}
                  onBack={activeIdx > 0 ? () => goToRow(activeIdx - 1) : null}
                  isLast={activeIdx === totalRows - 1}
                />
              );
            }
            // Show summaries only for prior rows (already filled or skipped).
            // Hide future rows so the form stays focused on one stop at a time.
            if (idx < activeIdx) {
              return (
                <RowSummary
                  key={idx}
                  row={row}
                  onEdit={() => goToRow(idx)}
                />
              );
            }
            return null;
          })}
        </div>

        {/* Add Row only available once we've reached the last row */}
        {activeIdx === totalRows - 1 && (
          <Button data-testid="add-row-btn" variant="outline" onClick={addRow}
            className="w-full h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)] rounded-md">
            <Plus className="mr-2 h-4 w-4" /> Add another stop
          </Button>
        )}
      </div>

      {/* Road Expenses */}
      <div className="bg-white border border-[var(--tm-border)] rounded-md p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4 text-[var(--tm-orange)]">Road Expenses &amp; Reimbursement</h3>
        <div className="space-y-2">
          {local.road_expenses.map((exp, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr_110px] gap-2" data-testid={`expense-row-${i}`}>
              <Input placeholder="MM/DD"
                value={exp.date || ""} onChange={(e) => updateExpense(i, { date: e.target.value })}
                className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md text-sm" />
              <Input placeholder="Description"
                value={exp.description || ""} onChange={(e) => updateExpense(i, { description: e.target.value })}
                className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md text-sm" />
              <Input placeholder="$0.00"
                value={exp.amount || ""} onChange={(e) => updateExpense(i, { amount: e.target.value })}
                className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md text-sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white border border-[var(--tm-border)] rounded-md p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-[var(--tm-orange)]">Notes</h3>
        <Textarea data-testid="form-notes" rows={3}
          value={local.notes || ""} onChange={(e) => setLocal((p) => ({ ...p, notes: e.target.value }))}
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" />
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)]">{label}</div>
      <div className="font-bold text-[var(--tm-navy)]">{value || "—"}</div>
    </div>
  );
}

function MetaInput({ label, value, onChange, testId }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] mb-1">{label}</div>
      <Input data-testid={testId} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md text-sm" />
    </div>
  );
}

/** Compact summary for previously-filled stops. Tap to jump back and edit. */
function RowSummary({ row, onEdit }) {
  const filled = isRowFilled(row);
  return (
    <button
      type="button"
      data-testid={`row-summary-${row.seq}`}
      onClick={onEdit}
      className="w-full text-left bg-white border border-[var(--tm-border)] rounded-md p-3 flex items-center justify-between hover:bg-[var(--tm-surface)] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-9 w-9 flex items-center justify-center rounded-md font-black text-white shrink-0 ${filled ? "bg-[var(--tm-blue)]" : "bg-[var(--tm-text-soft)]"}`}>
          {row.seq}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] flex items-center gap-1">
            {filled && <CheckCircle2 className="h-3 w-3 text-[var(--tm-blue)]" />}
            {row.event_code ? EVENT_LABELS[row.event_code] : (filled ? "Stop" : "Skipped")}
          </div>
          <div className="text-sm font-bold text-[var(--tm-navy)] truncate">
            {row.location_name || "—"}
            {row.stop_city && row.stop_state && (
              <span className="text-[var(--tm-text-soft)] font-normal"> · {row.stop_city}, {row.stop_state}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[var(--tm-text-soft)] text-xs shrink-0 ml-2">
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </div>
    </button>
  );
}

function RowCard({ row, hasTemp, isSegment, rowIndex, savedLocations, savedTrailers, savedCities, onChange, onDuplicate, onLocationBlur, onTrailerBlur, onCityBlur, onContinue, onBack, isLast }) {
  const [tempWarn, setTempWarn] = useState(false);

  const longPressHandlers = useLongPress(
    () => {
      if (!hasData) {
        toast.message("Long-press a stop with data to duplicate it");
        return;
      }
      onDuplicate?.();
    },
    { delayMs: 500 }
  );

  const tempChange = (delta) => {
    const current = row.temperature ?? 35;
    const next = Math.min(45, Math.max(30, current + delta));
    onChange({ temperature: next });
    if (next >= 42) setTempWarn(true);
  };

  const stateCities = useMemo(() => {
    const seed = SEED_CITIES[row.stop_state] || [];
    const learned = savedCities.filter((c) => c.state === row.stop_state).map((c) => c.city);
    return Array.from(new Set([...learned, ...seed]));
  }, [row.stop_state, savedCities]);

  const locationSuggestions = useMemo(() => {
    const q = (row.location_name || "").toLowerCase();
    if (!q) return savedLocations.slice(0, 5);
    return savedLocations.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 5);
  }, [row.location_name, savedLocations]);

  const trailerSuggestions = useMemo(() => {
    const q = (row.trailer_number || "").toLowerCase();
    if (!q) return [];
    return savedTrailers.filter((t) => t.number.toLowerCase().includes(q)).slice(0, 5);
  }, [row.trailer_number, savedTrailers]);

  const hasData = isRowFilled(row);

  return (
    <div
      data-active-row-card="true"
      data-testid={`row-card-${row.seq}`}
      className={`bg-white border-2 rounded-md transition-colors shadow-md select-none ${hasData ? "border-[var(--tm-blue)]" : "border-[var(--tm-orange)]"}`}
    >
      {/* Header (long-press to duplicate) */}
      <div
        className="w-full flex items-center justify-between p-4 text-left"
        data-testid={`row-header-${row.seq}`}
        {...longPressHandlers}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 flex items-center justify-center bg-[var(--tm-orange)] rounded-md font-black text-white shrink-0">
            {row.seq}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)]">
              {row.event_code ? EVENT_LABELS[row.event_code] : "New stop"}
            </div>
            <div className="text-sm font-bold text-[var(--tm-navy)] truncate">
              {row.location_name || "Fill in this stop"}
              {row.stop_city && row.stop_state && (
                <span className="text-[var(--tm-text-soft)]"> · {row.stop_city}, {row.stop_state}</span>
              )}
            </div>
          </div>
        </div>
        {hasData && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
            data-testid={`row-${row.seq}-duplicate`}
            className="h-8 text-xs bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md shrink-0"
          >
            <Copy className="h-3 w-3 mr-1" /> Duplicate
          </Button>
        )}
      </div>

      <div className="p-4 pt-0 space-y-3 border-t border-[var(--tm-border)]">
        {isSegment && (
          <div
            className="bg-[var(--tm-blue)]/8 border border-[var(--tm-blue)]/40 rounded-md p-3 mt-3"
            data-testid={`row-${row.seq}-segment-card`}
          >
            <Label>
              {rowIndex === 0 ? "Miles from start to this stop" : "Miles since previous stop"}
            </Label>
            <Input
              data-testid={`row-${row.seq}-segment-miles`}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="e.g. 142"
              value={row.segment_miles ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ segment_miles: v === "" ? null : Math.max(0, Number(v)) });
              }}
              className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md text-lg font-bold tabular-nums"
            />
            <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] mt-1">
              Use your GPS / map app. Internal-only — never on the printed sheet.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-3">
          <div>
            <Label>Event Code</Label>
            <Select value={row.event_code || ""} onValueChange={(v) => onChange({ event_code: v })}>
              <SelectTrigger data-testid={`row-${row.seq}-event`} className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
                {EVENT_CODES.map((ec) => (
                  <SelectItem key={ec.code} value={ec.code}>
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-2 w-full">
                            <span className="font-bold w-12">{ec.code}</span>
                            <Info className="h-3 w-3 text-[var(--tm-orange)]" />
                            <span className="text-xs text-[var(--tm-text-soft)]">{ec.label}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white border-[var(--tm-border)]">{ec.label}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Departure Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline"
                  data-testid={`row-${row.seq}-date`}
                  className="w-full h-12 justify-start bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md hover:bg-[var(--tm-surface-2)] font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {row.departure_date || "Pick"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]" align="start">
                <Calendar mode="single"
                  selected={row.departure_date ? parse(row.departure_date, "MM/dd/yyyy", new Date()) : undefined}
                  onSelect={(d) => d && onChange({ departure_date: format(d, "MM/dd/yyyy") })} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div>
          <Label>Departure Time</Label>
          <Input data-testid={`row-${row.seq}-time`} placeholder="HH:MM"
            value={row.departure_time || ""} onChange={(e) => onChange({ departure_time: e.target.value })}
            className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" />
        </div>

        <div>
          <Label>Customer or Drop Yard Location Name</Label>
          <Input data-testid={`row-${row.seq}-location`} list={`locations-list-${row.seq}`}
            value={row.location_name || ""}
            onChange={(e) => onChange({ location_name: e.target.value })}
            onBlur={onLocationBlur}
            className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" />
          <datalist id={`locations-list-${row.seq}`}>
            {locationSuggestions.map((l) => <option key={l.name} value={l.name} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-[1fr_100px] gap-3">
          <div>
            <Label>Stop City</Label>
            <Input data-testid={`row-${row.seq}-city`} list={`cities-list-${row.seq}`}
              value={row.stop_city || ""}
              onChange={(e) => {
                const v = e.target.value;
                const match = FLAT_CITY_STATES.find((c) => c.city.toLowerCase() === v.toLowerCase());
                if (match && !row.stop_state) onChange({ stop_city: v, stop_state: match.state });
                else onChange({ stop_city: v });
              }}
              onBlur={onCityBlur}
              className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" />
            <datalist id={`cities-list-${row.seq}`}>
              {stateCities.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <Label>State</Label>
            <Select value={row.stop_state || ""} onValueChange={(v) => onChange({ stop_state: v })}>
              <SelectTrigger data-testid={`row-${row.seq}-state`} className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] max-h-60">
                {US_STATES.map((s) => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <Label>Trailer #</Label>
            <Input data-testid={`row-${row.seq}-trailer`} list={`trailers-list-${row.seq}`}
              value={row.trailer_number || ""}
              onChange={(e) => onChange({ trailer_number: e.target.value })}
              onBlur={onTrailerBlur}
              className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" />
            <datalist id={`trailers-list-${row.seq}`}>
              {trailerSuggestions.map((t) => <option key={t.number} value={t.number} />)}
            </datalist>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={row.trailer_type || ""} onValueChange={(v) => onChange({ trailer_type: v })}>
              <SelectTrigger data-testid={`row-${row.seq}-trailertype`} className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
                {TRAILER_TYPES.map((tt) => <SelectItem key={tt.code} value={tt.code}>{tt.code} · {tt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {row.trailer_type === "OTR" && (
          <Input data-testid={`row-${row.seq}-trailertype-custom`} placeholder="Custom type code"
            value={row.trailer_type_custom || ""}
            onChange={(e) => onChange({ trailer_type_custom: e.target.value })}
            className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" />
        )}

        {hasTemp && (
          <div>
            <Label>Temperature (°F)</Label>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={() => tempChange(-1)} variant="outline"
                className="h-14 w-14 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md hover:bg-[var(--tm-surface-2)]">
                <Minus className="h-5 w-5" />
              </Button>
              <div
                data-testid={`row-${row.seq}-temp`}
                className={`flex-1 h-14 flex items-center justify-center rounded-md text-2xl font-black ${
                  (row.temperature ?? 35) >= 42 ? "bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]" : "bg-white border border-[var(--tm-border)] text-[var(--tm-navy)]"
                }`}
              >
                {row.temperature ?? 35}°F
              </div>
              <Button type="button" onClick={() => tempChange(1)} variant="outline"
                className="h-14 w-14 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md hover:bg-[var(--tm-surface-2)]">
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            {tempWarn && (
              <div className="mt-2 p-3 rounded-md bg-[#FF3B30]/20 border border-[#FF3B30] text-[#FF3B30] flex items-start gap-2" data-testid="temp-warning">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="text-xs font-bold leading-tight">
                  Warning: Temperature is reaching dangerous levels. Do not transport if temperature remains above 42°F.
                  <button onClick={(e) => { e.stopPropagation(); setTempWarn(false); }} className="block mt-1 underline">Dismiss</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wizard navigation */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {onBack ? (
            <Button
              type="button"
              variant="outline"
              data-testid={`row-${row.seq}-back`}
              onClick={onBack}
              className="h-12 px-4 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)] rounded-md"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          ) : <span />}
          <Button
            type="button"
            data-testid={`row-${row.seq}-continue`}
            onClick={onContinue}
            className="h-12 px-5 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange)]/90 text-white font-bold rounded-md flex-1 max-w-[260px]"
          >
            {isLast ? "Done with stops" : "Continue to next stop"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] mb-1">{children}</div>;
}
