import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import { EVENT_CODES, TRAILER_TYPES, US_STATES, SEED_CITIES, FLAT_CITY_STATES } from "../../data/constants";
import { Info, Plus, Minus, CalendarIcon, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { format, parse } from "date-fns";
import { api } from "../../lib/api";
import { toast } from "sonner";

const EVENT_LABELS = Object.fromEntries(EVENT_CODES.map((e) => [e.code, e.label]));

export default function TripSheetForm({ session, onChange }) {
  const [local, setLocal] = useState(session);
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedTrailers, setSavedTrailers] = useState([]);
  const [savedCities, setSavedCities] = useState([]);

  useEffect(() => setLocal(session), [session.session_id]);

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

  // Auto-save with debounce
  useEffect(() => {
    if (!local) return;
    const t = setTimeout(() => {
      api.put(`/trip-sessions/${local.session_id}`, {
        rows: local.rows, road_expenses: local.road_expenses, notes: local.notes,
        order_number: local.order_number, bol_number: local.bol_number,
        truck_number: local.truck_number,
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
    setLocal((p) => ({ ...p, rows: [...p.rows, { seq: p.rows.length + 1 }] }));
  };

  const bumpLocation = (name) => name && api.post("/locations/bump", { name }).catch(() => {});
  const bumpTrailer = (number, type) => number && api.post("/trailers/bump", { number, type }).catch(() => {});
  const bumpCity = (city, state) => city && state && api.post("/cities/bump", { city, state }).catch(() => {});

  const hasTemp = local.has_temperature;

  return (
    <div className="space-y-6">
      {/* Meta card */}
      <div className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-5 space-y-3 shadow-sm">
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

      {/* Rows */}
      <div className="space-y-3">
        {local.rows.map((row, idx) => (
          <RowCard
            key={idx}
            row={row}
            hasTemp={hasTemp}
            savedLocations={savedLocations}
            savedTrailers={savedTrailers}
            savedCities={savedCities}
            onChange={(patch) => updateRow(idx, patch)}
            onLocationBlur={() => bumpLocation(row.location_name)}
            onTrailerBlur={() => bumpTrailer(row.trailer_number, row.trailer_type)}
            onCityBlur={() => bumpCity(row.stop_city, row.stop_state)}
          />
        ))}

        <Button data-testid="add-row-btn" variant="outline" onClick={addRow}
          className="w-full h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)] rounded-md">
          <Plus className="mr-2 h-4 w-4" /> Add Row
        </Button>
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

function RowCard({ row, hasTemp, savedLocations, savedTrailers, savedCities, onChange, onLocationBlur, onTrailerBlur, onCityBlur }) {
  const [expanded, setExpanded] = useState(row.seq <= 1);
  const [tempWarn, setTempWarn] = useState(false);

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

  const hasData = row.event_code || row.location_name || row.stop_city || row.trailer_number;

  return (
    <div className={`bg-white border rounded-md transition-colors shadow-sm ${hasData ? "border-[var(--tm-blue)]" : "border-[var(--tm-border)]"}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        data-testid={`row-toggle-${row.seq}`}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center bg-[var(--tm-orange)] rounded-md font-black text-white">
            {row.seq}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)]">
              {row.event_code ? EVENT_LABELS[row.event_code] : "Empty stop"}
            </div>
            <div className="text-sm font-bold text-[var(--tm-navy)]">
              {row.location_name || "Tap to fill"}
              {row.stop_city && row.stop_state && <span className="text-[var(--tm-text-soft)]"> · {row.stop_city}, {row.stop_state}</span>}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-[var(--tm-text-soft)]" /> : <ChevronDown className="h-5 w-5 text-[var(--tm-text-soft)]" />}
      </button>

      {expanded && (
        <div className="p-4 pt-0 space-y-3 border-t border-[var(--tm-border)]">
          <div className="grid grid-cols-2 gap-3">
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
                  // if user typed a city in flat list, auto-set state
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
        </div>
      )}
    </div>
  );
}

function Label({ children }) {
  return <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] mb-1">{children}</div>;
}
