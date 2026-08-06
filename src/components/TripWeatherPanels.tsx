import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, CloudSun, Loader2, Shirt } from "lucide-react";
import {
  ClothingItemIcon,
} from "@/components/ClothingItemIcon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CLOTHING_META,
  LENGTH_LABELS,
  THICKNESS_LABELS,
  clothingAttrLine,
  fabricTraitsLine,
  outfitFromItems,
  primaryTypologyItem,
  suggestClothingForDay,
  suggestPackingList,
  type ClothingHourBand,
  type ClothingHourSlot,
  type ClothingItem,
  type ClothingOutfitSlot,
} from "@/domain/travel/clothing";
import {
  MapsQuotaExceededError,
  WeatherNotConfiguredError,
  WeatherUnavailableError,
  fetchDailyForecast,
  fetchHourlyForecast,
  type WeatherDayForecast,
  type WeatherHourForecast,
} from "@/lib/googleWeather";
import { useTripWeather } from "@/components/TripWeatherContext";
import { cn } from "@/lib/utils";

type PackingStop = {
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  name?: string;
};

type PackingProps = {
  /** Multi-cidade: uma previsão por parada no respectivo intervalo. */
  stops?: PackingStop[];
  /** Legado: destino único. */
  lat?: number | null;
  lng?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  className?: string;
};

function filterTripDays(
  days: WeatherDayForecast[],
  start?: string | null,
  end?: string | null
): WeatherDayForecast[] {
  if (!start || !end) return days;
  return days.filter((d) => d.date && d.date >= start && d.date <= end);
}

function weatherErrorMessage(err: unknown): string {
  if (err instanceof WeatherNotConfiguredError) {
    return "Previsão do tempo ainda não configurada.";
  }
  if (err instanceof MapsQuotaExceededError) return err.message;
  if (err instanceof WeatherUnavailableError) return err.message;
  return "Previsão do tempo indisponível.";
}

/** Separa trechos com · em negrito (mais legível no resumo). */
function BoldDotList({ parts }: { parts: string[] }) {
  const flat = parts
    .flatMap((p) => p.split(" · ").map((s) => s.trim()))
    .filter(Boolean);
  return (
    <>
      {flat.map((part, i) => (
        <Fragment key={`${i}-${part}`}>
          {i > 0 ? (
            <span className="font-bold text-foreground/80"> · </span>
          ) : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function ClothingChip({ item }: { item: ClothingItem }) {
  const meta = CLOTHING_META[item];
  return (
    <li
      className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium"
      title={clothingAttrLine(item)}
    >
      <ClothingItemIcon item={item} className="h-3.5 w-3.5 text-foreground" />
      <span className="truncate">{meta.label}</span>
    </li>
  );
}

function ClothingAttrRows({ item }: { item: ClothingItem }) {
  const meta = CLOTHING_META[item];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <dt className="self-center">Comprimento</dt>
      <dd className="self-center text-right capitalize text-foreground/85">
        {LENGTH_LABELS[meta.length]}
      </dd>
      <dt className="self-center">Espessura</dt>
      <dd className="self-center text-right capitalize text-foreground/85">
        {THICKNESS_LABELS[meta.thickness]}
      </dd>
      <dt className="self-center">Tecido</dt>
      <dd className="self-center text-right capitalize text-foreground/85">
        {fabricTraitsLine(meta.fabric)}
      </dd>
    </dl>
  );
}

/** Bloco Weat: tipologia + comprimento / espessura / tecido. */
function OutfitAttributes({ slot }: { slot: ClothingOutfitSlot }) {
  return (
    <div className="space-y-1 border-b border-border/50 py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {slot.label}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <ClothingItemIcon item={slot.item} className="h-5 w-5 shrink-0" />
          <span className="truncate">{CLOTHING_META[slot.item].label}</span>
        </div>
      </div>
      <ClothingAttrRows item={slot.item} />
    </div>
  );
}

function OutfitDetailPopover({
  title,
  feelsLabel,
  items,
  rainProbabilityPercent,
}: {
  title: string;
  feelsLabel?: string | null;
  items: ClothingItem[];
  rainProbabilityPercent?: number | null;
}) {
  const outfit = outfitFromItems(items);
  return (
    <PopoverContent className="w-56 p-3" side="top" align="center">
      <p className="text-xs font-medium tabular-nums">
        {title}
        {feelsLabel ? ` · ${feelsLabel}` : ""}
      </p>
      {outfit.length > 0 ? (
        <div className="mt-1.5">
          {outfit.map((slot) => (
            <OutfitAttributes key={slot.slot} slot={slot} />
          ))}
        </div>
      ) : null}
      {rainProbabilityPercent != null && rainProbabilityPercent >= 30 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Chuva ~{rainProbabilityPercent}%
        </p>
      ) : null}
    </PopoverContent>
  );
}

function HourSlotButton({
  slot,
}: {
  slot: ClothingHourSlot;
}) {
  const feels = slot.feelsLikeC ?? slot.tempC;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-9 flex-col items-center gap-0.5 rounded-md py-0.5 text-center outline-none transition-colors hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="text-[10px] text-muted-foreground">
            {slot.localHour}h
          </span>
          {slot.primaryItem ? (
            <ClothingItemIcon item={slot.primaryItem} className="h-6 w-6" />
          ) : (
            <span className="h-6 w-6" />
          )}
          <span className="text-[11px] font-medium tabular-nums">
            {feels != null ? `${Math.round(feels)}°` : "—"}
          </span>
        </button>
      </PopoverTrigger>
      <OutfitDetailPopover
        title={`${slot.localHour}h`}
        feelsLabel={feels != null ? `~${Math.round(feels)}°C` : null}
        items={slot.items}
        rainProbabilityPercent={slot.rainProbabilityPercent}
      />
    </Popover>
  );
}

function BandSlotButton({ band }: { band: ClothingHourBand }) {
  const primary = primaryTypologyItem(band.items);
  const feels = band.feelsLikeC ?? band.tempC;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-14 flex-col items-center gap-0.5 rounded-md py-0.5 text-center outline-none transition-colors hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="text-[10px] text-muted-foreground">{band.label}</span>
          {primary ? (
            <ClothingItemIcon item={primary} className="h-6 w-6" />
          ) : (
            <span className="h-6 w-6" />
          )}
          <span className="text-[11px] font-medium tabular-nums">
            {feels != null ? `${Math.round(feels)}°` : "—"}
          </span>
        </button>
      </PopoverTrigger>
      <OutfitDetailPopover
        title={band.label}
        feelsLabel={feels != null ? `~${Math.round(feels)}°C` : null}
        items={band.items}
        rainProbabilityPercent={band.rainProbabilityPercent}
      />
    </Popover>
  );
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Mala: o que levar no(s) destino(s) no período da viagem. */
export function TripWeatherPackingPanel({
  stops: stopsProp,
  lat,
  lng,
  startDate,
  endDate,
  className,
}: PackingProps) {
  const shared = useTripWeather();
  const stops: PackingStop[] = useMemo(() => {
    if (stopsProp && stopsProp.length > 0) return stopsProp;
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return [
        {
          lat,
          lng,
          startDate: startDate ?? "",
          endDate: endDate ?? "",
        },
      ];
    }
    return [];
  }, [stopsProp, lat, lng, startDate, endDate]);

  const [days, setDays] = useState<WeatherDayForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (shared) return;
    if (stops.length === 0) {
      setDays([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const batches = await Promise.all(
          stops.map(async (stop) => {
            const fc = await fetchDailyForecast({
              lat: stop.lat,
              lng: stop.lng,
              days: 10,
              signal: controller.signal,
            });
            return filterTripDays(
              fc.days,
              stop.startDate || null,
              stop.endDate || null
            );
          })
        );
        if (controller.signal.aborted) return;
        setDays(batches.flat());
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") {
          return;
        }
        setError(weatherErrorMessage(err));
        setDays([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [stops, shared]);

  const effectiveDays = shared ? shared.packingDays(stops) : days;
  const effectiveLoading = shared ? shared.loading : loading;
  const effectiveError = shared ? shared.error : error;

  const packing = useMemo(
    () => (effectiveDays.length > 0 ? suggestPackingList(effectiveDays) : null),
    [effectiveDays]
  );

  if (stops.length === 0) return null;

  return (
    <section
      className={cn(
        "space-y-2 rounded-lg border bg-card/60 p-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Shirt className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">O que levar na mala</p>
      </div>
      {effectiveLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Consultando clima do destino…
        </p>
      ) : effectiveError ? (
        <p className="text-sm text-muted-foreground">{effectiveError}</p>
      ) : packing ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{packing.summary}</p>
          <ul className="flex flex-wrap gap-1.5">
            {packing.items.map((item) => (
              <ClothingChip key={item} item={item} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sem previsão para o período.
        </p>
      )}
    </section>
  );
}

type DayWeatherProps = {
  lat: number | null | undefined;
  lng: number | null | undefined;
  dayDate: string | null | undefined;
  stopLabel?: string | null;
  className?: string;
};

/** Horas a buscar para cobrir o dia (fallback fora do provider). */
function hoursNeededForDate(dayDate: string): number | null {
  const target = new Date(`${dayDate}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - Date.now();
  if (ms < -36 * 3600_000) return null;
  const hours = Math.ceil(ms / 3600_000) + 2;
  if (hours <= 0) return 72;
  return Math.min(Math.max(hours, 72), 240);
}

/** Roteiro: o que vestir neste dia (resumo colapsável + detalhe). */
export function ItineraryDayWeather({
  lat,
  lng,
  dayDate,
  stopLabel,
  className,
}: DayWeatherProps) {
  const shared = useTripWeather();
  const isToday = !!dayDate && dayDate === todayIsoLocal();
  const [open, setOpen] = useState(isToday);
  const [day, setDay] = useState<WeatherDayForecast | null>(null);
  const [hours, setHours] = useState<WeatherHourForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(isToday);
  }, [isToday, dayDate]);

  useEffect(() => {
    if (shared) return;
    if (
      lat == null ||
      lng == null ||
      !dayDate ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      setDay(null);
      setHours([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const hourlySpan = hoursNeededForDate(dayDate);

    void (async () => {
      try {
        const fc = await fetchDailyForecast({
          lat,
          lng,
          days: 10,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const match = fc.days.find((d) => d.date === dayDate) ?? null;
        setDay(match);
        if (!match) {
          setError("Sem previsão para este dia.");
          setHours([]);
          return;
        }

        if (hourlySpan == null) {
          setHours([]);
          return;
        }
        try {
          const hourly = await fetchHourlyForecast({
            lat,
            lng,
            hours: hourlySpan,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setHours(hourly.hours);
        } catch {
          if (!controller.signal.aborted) setHours([]);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") {
          return;
        }
        setError(weatherErrorMessage(err));
        setDay(null);
        setHours([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [lat, lng, dayDate, shared]);

  if (lat == null || lng == null || !dayDate) return null;

  const resolvedDay = shared ? shared.dayAt(lat, lng, dayDate) : day;
  const resolvedHours = shared ? shared.hoursAt(lat, lng) : hours;
  const resolvedLoading = shared ? shared.loading : loading;
  const resolvedError = shared
    ? shared.error ??
      (!shared.loading && !resolvedDay ? "Sem previsão para este dia." : null)
    : error;

  const suggestion = resolvedDay
    ? suggestClothingForDay(resolvedDay, resolvedHours, { isToday })
    : null;

  const summaryBits =
    suggestion != null
      ? [
          suggestion.conditionPhrase,
          suggestion.feelsLikeDayC != null
            ? `Sensação ~${Math.round(suggestion.feelsLikeDayC)}°C`
            : null,
          suggestion.maxC != null && suggestion.minC != null
            ? `mín ${Math.round(suggestion.minC)}° - máx ${Math.round(suggestion.maxC)}°`
            : null,
          suggestion.outfitPhrase || null,
        ].filter((b): b is string => !!b)
      : [];

  const detailBits =
    suggestion != null
      ? [
          suggestion.windSpeedKph != null && suggestion.windSpeedKph >= 20
            ? `vento ${Math.round(suggestion.windSpeedKph)} km/h`
            : null,
          suggestion.humidityPercent != null &&
          suggestion.humidityPercent >= 70
            ? `umidade ${Math.round(suggestion.humidityPercent)}%`
            : null,
          suggestion.rainProbabilityPercent != null &&
          suggestion.rainProbabilityPercent >= 40
            ? `chuva ~${suggestion.rainProbabilityPercent}%`
            : null,
        ].filter((b): b is string => !!b)
      : [];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm",
          className
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
          >
            <CloudSun className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Clima
                  {stopLabel ? ` · ${stopLabel}` : null}
                </p>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-180"
                  )}
                />
              </div>
              {resolvedLoading ? (
                <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando…
                </p>
              ) : resolvedError ? (
                <p className="mt-1 text-muted-foreground">{resolvedError}</p>
              ) : summaryBits.length > 0 ? (
                <p className="mt-0.5 text-sm leading-snug">
                  <BoldDotList parts={summaryBits} />
                </p>
              ) : null}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {suggestion ? (
            <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
              {detailBits.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  <BoldDotList parts={detailBits} />
                </p>
              ) : null}

              {suggestion.outfitSegments.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {isToday
                      ? "Sugestão para o dia de hoje:"
                      : "Sugestão para o dia:"}
                  </p>
                  {suggestion.outfitSegments.map((segment) => (
                    <div key={segment.key} className="space-y-0.5">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {segment.label}
                        </span>
                        {segment.tempC != null ? (
                          <span className="tabular-nums">
                            {" "}
                            · ~{Math.round(segment.tempC)}°C
                          </span>
                        ) : null}
                      </p>
                      <ul>
                        {segment.outfit.map((slot) => (
                          <li key={`${segment.key}-${slot.slot}`}>
                            <OutfitAttributes slot={slot} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}

              {suggestion.hourlySlots.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Hora a hora
                    <span className="font-normal text-muted-foreground/80">
                      {" "}
                      · horário local
                      {stopLabel ? ` (${stopLabel})` : ""}
                    </span>
                  </p>
                  <div className="-mx-1 overflow-x-auto pb-0.5">
                    <ul className="flex min-w-max gap-1 px-1">
                      {suggestion.hourlySlots.map((slot) => (
                        <li key={slot.localHour}>
                          <HourSlotButton slot={slot} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : suggestion.bands.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Ao longo do dia
                  </p>
                  <div className="-mx-1 overflow-x-auto pb-0.5">
                    <ul className="flex min-w-max gap-1 px-1">
                      {suggestion.bands.map((band) => (
                        <li key={band.key}>
                          <BandSlotButton band={band} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {suggestion.outfitSegments.length < 2 ? (
                <div className="flex items-center justify-center gap-6 border-t border-border/40 pt-2 text-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Dia
                    </span>
                    {primaryTypologyItem(suggestion.dayPart.items) ? (
                      <ClothingItemIcon
                        item={primaryTypologyItem(suggestion.dayPart.items)!}
                        className="h-5 w-5"
                      />
                    ) : null}
                    <span className="text-sm font-medium tabular-nums">
                      {suggestion.dayPart.tempC != null ||
                      suggestion.maxC != null
                        ? `${Math.round(suggestion.dayPart.tempC ?? suggestion.maxC!)}°`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Noite
                    </span>
                    {primaryTypologyItem(suggestion.nightPart.items) ? (
                      <ClothingItemIcon
                        item={primaryTypologyItem(suggestion.nightPart.items)!}
                        className="h-5 w-5"
                      />
                    ) : null}
                    <span className="text-sm font-medium tabular-nums">
                      {suggestion.feelsLikeNightC != null ||
                      suggestion.minC != null
                        ? `${Math.round(suggestion.feelsLikeNightC ?? suggestion.minC!)}°`
                        : "—"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
