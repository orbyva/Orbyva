import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchFleetOverview } from "@/api/car/car";
import { ChipBar } from "@/components/ChipBar";
import { FilterRow, FilterSelect } from "@/components/FilterSelect";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Badge, Banner, Button, Card } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  calculateFuelConsumption,
  DOCUMENT_TYPE_LABELS,
  FUEL_TYPE_LABELS,
  getDocumentAlerts,
  getMaintenanceAlerts,
  getMaintenanceSchedule,
  MAINTENANCE_TYPE_LABELS,
  vehicleLabel,
} from "@/domain/car";
import { carAlertBadge } from "@/domain/ui/semanticTone";
import { useAppShell } from "@/hooks/use-app-shell";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { FuelLog, Maintenance, Vehicle, VehicleDocument } from "@/types/car";

type FleetTab = "veiculos" | "cronograma" | "manutencao" | "combustivel" | "documentos";

const FLEET_TABS: { id: FleetTab; label: string }[] = [
  { id: "veiculos", label: "Veículos" },
  { id: "cronograma", label: "Cronograma" },
  { id: "manutencao", label: "Manutenções" },
  { id: "combustivel", label: "Abastecimentos" },
  { id: "documentos", label: "Documentos" },
];

export default function CarsScreen() {
  const theme = useTheme();
  const moduleColors = useModuleColors();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FleetTab>("veiculos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const fleet = await fetchFleetOverview();
    setVehicles(fleet.vehicles);
    setDocuments(fleet.documents);
    setMaintenances(fleet.maintenances);
    setFuelLogs(fleet.fuelLogs);
    setSelectedId((cur) => cur ?? fleet.vehicles[0]?.id ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar os veículos."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const byVehicle = useMemo(() => {
    return vehicles.map((vehicle) => {
      const docs = documents.filter((row) => row.vehicle_id === vehicle.id);
      const maint = maintenances.filter((row) => row.vehicle_id === vehicle.id);
      const fuel = fuelLogs.filter((row) => row.vehicle_id === vehicle.id);
      const maintAlerts = getMaintenanceAlerts(vehicle, maint);
      const docAlerts = getDocumentAlerts(docs);
      const consumption = calculateFuelConsumption(fuel);
      return { vehicle, maintAlerts, docAlerts, consumption };
    });
  }, [vehicles, documents, maintenances, fuelLogs]);

  const selected =
    vehicles.find((row) => row.id === selectedId) ?? vehicles[0] ?? null;
  const selectedMaint = maintenances.filter(
    (row) => row.vehicle_id === selected?.id
  );
  const selectedFuel = fuelLogs.filter((row) => row.vehicle_id === selected?.id);
  const selectedDocs = documents.filter(
    (row) => row.vehicle_id === selected?.id
  );
  const schedule = selected
    ? getMaintenanceSchedule(selected, selectedMaint)
    : [];

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && vehicles.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <ChipBar options={FLEET_TABS} value={tab} onChange={setTab} />
          {tab !== "veiculos" && vehicles.length > 1 ? (
            <FilterRow>
              <FilterSelect
                label="Veículo"
                value={selected?.id ?? "all"}
                options={vehicles.map((row) => ({
                  id: row.id,
                  label: vehicleLabel(row),
                }))}
                onChange={setSelectedId}
              />
            </FilterRow>
          ) : null}
          {tab === "veiculos" ? (
          <>
          {vehicles.length === 0 ? (
            <ThemedText themeColor="mutedForeground">
              Nenhum veículo cadastrado.
            </ThemedText>
          ) : (
            byVehicle.map(({ vehicle, maintAlerts, docAlerts, consumption }) => {
              const alertCount = maintAlerts.length + docAlerts.length;
              const overdue =
                maintAlerts.some((row) => row.status === "overdue") ||
                docAlerts.some((row) => row.status === "overdue");
              return (
                <Pressable
                  key={vehicle.id}
                  onPress={() =>
                    router.push({
                      pathname: "/cars/[id]",
                      params: { id: vehicle.id },
                    })
                  }
                >
                  <Card style={styles.card}>
                    <View
                      style={[styles.iconWell, { backgroundColor: hexAlpha(moduleColors.car, 0.13) }]}
                    >
                      <Ionicons
                        name={
                          vehicle.kind === "motorcycle"
                            ? "bicycle-outline"
                            : "car-outline"
                        }
                        size={20}
                        color={moduleColors.car}
                      />
                    </View>
                    <View style={styles.copy}>
                      <ThemedText type="smallBold">
                        {vehicleLabel(vehicle)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="mutedForeground">
                        {[
                          vehicle.plate,
                          vehicle.fuel_type
                            ? FUEL_TYPE_LABELS[vehicle.fuel_type]
                            : null,
                          `${vehicle.current_km.toLocaleString("pt-BR")} km`,
                          consumption
                            ? `${consumption.toFixed(1).replace(".", ",")} km/l`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                      {alertCount > 0 ? (
                        <Badge
                          label={`${alertCount} alerta${alertCount > 1 ? "s" : ""}`}
                          variant={carAlertBadge(overdue ? "overdue" : "upcoming")?.variant}
                          style={styles.alertBadge}
                        />
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
          </>
          ) : null}

          {tab === "cronograma" ? (
            !selected ? (
              <ThemedText themeColor="mutedForeground">
                Cadastre um veículo para ver o cronograma.
              </ThemedText>
            ) : schedule.length === 0 ? (
              <ThemedText themeColor="mutedForeground">
                Nenhum item no cronograma.
              </ThemedText>
            ) : (
              schedule.map((item) => (
                <Card key={item.type} style={styles.listCard}>
                  <ThemedText type="smallBold">{item.label}</ThemedText>
                  <ThemedText type="small" themeColor="mutedForeground">
                    {item.message}
                  </ThemedText>
                </Card>
              ))
            )
          ) : null}

          {tab === "manutencao" ? (
            <>
              {selected ? (
                <Button
                  label="Registrar manutenção"
                  onPress={() =>
                    router.push({
                      pathname: "/cars/maint-form",
                      params: { vehicleId: selected.id },
                    })
                  }
                  variant="outline"
                />
              ) : null}
              {selectedMaint.length === 0 ? (
                <ThemedText themeColor="mutedForeground">
                  Nenhuma manutenção.
                </ThemedText>
              ) : (
                selectedMaint.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      router.push({
                        pathname: "/cars/maint-form",
                        params: { vehicleId: item.vehicle_id, id: item.id },
                      })
                    }
                  >
                    <Card style={styles.listCard}>
                      <ThemedText type="smallBold">
                        {item.custom_type ||
                          MAINTENANCE_TYPE_LABELS[item.type] ||
                          item.type}
                      </ThemedText>
                      <ThemedText type="small" themeColor="mutedForeground">
                        {[
                          item.service_date
                            ? formatDateBR(item.service_date)
                            : null,
                          item.km_at_service
                            ? `${item.km_at_service.toLocaleString("pt-BR")} km`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
          ) : null}

          {tab === "combustivel" ? (
            <>
              {selected ? (
                <Button
                  label="Registrar abastecimento"
                  onPress={() =>
                    router.push({
                      pathname: "/cars/fuel-form",
                      params: { vehicleId: selected.id },
                    })
                  }
                  variant="outline"
                />
              ) : null}
              {selectedFuel.length === 0 ? (
                <ThemedText themeColor="mutedForeground">
                  Nenhum abastecimento.
                </ThemedText>
              ) : (
                selectedFuel.map((log) => (
                  <Pressable
                    key={log.id}
                    onPress={() =>
                      router.push({
                        pathname: "/cars/fuel-form",
                        params: { vehicleId: log.vehicle_id, id: log.id },
                      })
                    }
                  >
                    <Card style={styles.listCard}>
                      <ThemedText type="smallBold">
                        {formatDateBR(log.date)} ·{" "}
                        {log.liters.toLocaleString("pt-BR")} L
                      </ThemedText>
                      <ThemedText type="small" themeColor="mutedForeground">
                        {[
                          formatBRL(Number(log.total_cost)),
                          `${log.km.toLocaleString("pt-BR")} km`,
                          log.station,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
          ) : null}

          {tab === "documentos" ? (
            <>
              {selected ? (
                <Button
                  label="Novo documento"
                  onPress={() =>
                    router.push({
                      pathname: "/cars/doc-form",
                      params: { vehicleId: selected.id },
                    })
                  }
                  variant="outline"
                />
              ) : null}
              {selectedDocs.length === 0 ? (
                <ThemedText themeColor="mutedForeground">
                  Nenhum documento.
                </ThemedText>
              ) : (
                selectedDocs.map((doc) => (
                  <Pressable
                    key={doc.id}
                    onPress={() =>
                      router.push({
                        pathname: "/cars/doc-form",
                        params: { vehicleId: doc.vehicle_id, id: doc.id },
                      })
                    }
                  >
                    <Card style={styles.listCard}>
                      <ThemedText type="smallBold">
                        {DOCUMENT_TYPE_LABELS[doc.type] ??
                          doc.custom_type ??
                          doc.type}
                      </ThemedText>
                      <ThemedText type="small" themeColor="mutedForeground">
                        Vence {formatDateBR(doc.due_date)}
                        {doc.paid ? " · pago" : " · em aberto"}
                      </ThemedText>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  alertBadge: { alignSelf: "flex-start" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: {
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  listCard: { padding: Spacing.three, gap: Spacing.two },
});
