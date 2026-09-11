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
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  calculateFuelConsumption,
  FUEL_TYPE_LABELS,
  getDocumentAlerts,
  getMaintenanceAlerts,
  vehicleLabel,
} from "@/domain/car";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { FuelLog, Maintenance, Vehicle, VehicleDocument } from "@/types/car";

export default function CarsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const fleet = await fetchFleetOverview();
    setVehicles(fleet.vehicles);
    setDocuments(fleet.documents);
    setMaintenances(fleet.maintenances);
    setFuelLogs(fleet.fuelLogs);
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
          {vehicles.length === 0 ? (
            <ThemedText themeColor="textSecondary">
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
                      style={[styles.iconWell, { backgroundColor: "#22A37A22" }]}
                    >
                      <Ionicons
                        name={
                          vehicle.kind === "motorcycle"
                            ? "bicycle-outline"
                            : "car-outline"
                        }
                        size={20}
                        color="#22A37A"
                      />
                    </View>
                    <View style={styles.copy}>
                      <ThemedText type="smallBold">
                        {vehicleLabel(vehicle)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
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
                        <ThemedText
                          type="small"
                          themeColor={overdue ? "danger" : "textSecondary"}
                        >
                          {alertCount} alerta{alertCount > 1 ? "s" : ""}
                        </ThemedText>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
});
