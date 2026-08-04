/**
 * Agrega domínios do /home numa única chamada (round trips no datacenter).
 * Body: { year: number, month: number, today_iso: string }
 * Não inclui alertas TMDB (client enriquece pós first paint).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersForRequest } from "../_shared/cors.ts";

const RECURRING_SELECT =
  "id, user_id, class_id, value, description, frequency, validity, due_day, installment_count, payment_start_date, status, created_at, paid_parcels, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))";

const BUDGET_SUMMARY_SELECT =
  "id, user_id, type_id, type_name, class_id, class_name, nature_name, expense_value, income_value, budget_month, planned_value, spent_value, remaining_value, percentage_used, status";

function budgetMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function previousYearMonth(year: number, month: number) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let year: number;
  let month: number;
  let todayIso: string;
  try {
    const body = await req.json();
    year = Number(body?.year);
    month = Number(body?.month);
    todayIso = String(body?.today_iso ?? "");
    if (!year || !month || !/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) {
      throw new Error("invalid body");
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const prev = previousYearMonth(year, month);
  const userId = user.id;
  const budgetMonth = budgetMonthIso(year, month);

  const [
    goalsRes,
    habitsRes,
    tripsRes,
    placesCountRes,
    toWatchCountRes,
    watchedLatestRes,
    financeRpc,
    prevFinanceRpc,
    recurringRes,
    vehiclesRes,
    budgetsRes,
    latestTxRes,
  ] = await Promise.all([
    client
      .from("personal_goal")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    client
      .from("habit")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    client
      .from("trip")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: true }),
    client
      .from("place_visit")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    client
      .from("movie")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "to_watch"),
    client
      .from("movie")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "watched")
      .order("watched_dates", { ascending: false, nullsFirst: false })
      .limit(1),
    client.rpc("get_value_by_nature_for_month", {
      p_year: year,
      p_month: month,
    }),
    client.rpc("get_value_by_nature_for_month", {
      p_year: prev.year,
      p_month: prev.month,
    }),
    client
      .from("recurring_transaction")
      .select(RECURRING_SELECT)
      .eq("user_id", userId)
      .eq("status", true)
      .order("id", { ascending: false }),
    client.from("vehicle").select("*").eq("user_id", userId),
    client
      .from("vw_monthly_budget_summary")
      .select(BUDGET_SUMMARY_SELECT)
      .eq("budget_month", budgetMonth)
      .order("type_name", { ascending: true }),
    client
      .from("transaction")
      .select("transaction_at")
      .eq("user_id", userId)
      .order("transaction_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const habits = habitsRes.data ?? [];
  const habitIds = habits.map((h: { id: string }) => h.id);
  const habitLogsRes =
    habitIds.length > 0
      ? await client
          .from("habit_log")
          .select("id, habit_id, date, completed")
          .in("habit_id", habitIds)
          .gte("date", todayIso)
          .order("date", { ascending: false })
      : { data: [] as unknown[], error: null };

  const trips = tripsRes.data ?? [];
  const activeTripIds = trips
    .filter(
      (t: { status: string }) =>
        t.status !== "cancelled" && t.status !== "completed"
    )
    .map((t: { id: string }) => t.id);

  const vehicles = vehiclesRes.data ?? [];
  const vehicleIds = vehicles.map((v: { id: string }) => v.id);

  const [maintenancesRes, documentsRes, milestonesRes] = await Promise.all([
    vehicleIds.length
      ? client.from("maintenance").select("*").in("vehicle_id", vehicleIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    vehicleIds.length
      ? client
          .from("vehicle_document")
          .select("*")
          .in("vehicle_id", vehicleIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    activeTripIds.length
      ? client
          .from("trip_milestone")
          .select("*")
          .in("trip_id", activeTripIds)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  function financeFromRpc(raw: unknown) {
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) return null;
    return {
      year: Number((row as { year: number }).year),
      month: Number((row as { month: number }).month),
      receita_total: Number((row as { receita_total: number }).receita_total) || 0,
      despesa_total: Number((row as { despesa_total: number }).despesa_total) || 0,
    };
  }

  // Fallbacks if RPC missing: read view
  let financeMonth = !financeRpc.error
    ? financeFromRpc(financeRpc.data)
    : null;
  let prevFinance = !prevFinanceRpc.error
    ? financeFromRpc(prevFinanceRpc.data)
    : null;

  if (financeMonth == null) {
    const { data } = await client
      .from("vw_value_by_nature_year_month")
      .select("year, month, receita_total, despesa_total")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (data) {
      financeMonth = {
        year: Number(data.year),
        month: Number(data.month),
        receita_total: Number(data.receita_total) || 0,
        despesa_total: Number(data.despesa_total) || 0,
      };
    }
  }
  if (prevFinance == null) {
    const { data } = await client
      .from("vw_value_by_nature_year_month")
      .select("year, month, receita_total, despesa_total")
      .eq("year", prev.year)
      .eq("month", prev.month)
      .maybeSingle();
    if (data) {
      prevFinance = {
        year: Number(data.year),
        month: Number(data.month),
        receita_total: Number(data.receita_total) || 0,
        despesa_total: Number(data.despesa_total) || 0,
      };
    }
  }

  const payload = {
    goals: goalsRes.data ?? [],
    habits,
    habitLogs: habitLogsRes.data ?? [],
    trips,
    placesCount: placesCountRes.count ?? 0,
    toWatchTotal: toWatchCountRes.count ?? 0,
    watchedLatest: watchedLatestRes.data?.[0] ?? null,
    financeMonth,
    prevFinance,
    recurring: recurringRes.data ?? [],
    vehicles,
    maintenances: maintenancesRes.data ?? [],
    documents: documentsRes.data ?? [],
    milestones: milestonesRes.data ?? [],
    budgets: budgetsRes.data ?? [],
    latestAt: latestTxRes.data?.transaction_at ?? null,
    year,
    month,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
