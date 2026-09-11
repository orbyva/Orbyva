import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  deleteDocument,
  deleteFuelLog,
  deleteMaintenance,
  fetchFuelLogs,
  fetchVehicleAlerts,
  fetchVehicleById,
  updateVehicle,
} from "@/api/car/car";
import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
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
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { FuelLog, Maintenance, Vehicle, VehicleDocument } from "@/types/car";

type Tab = "resumo" | "manutencao" | "combustivel" | "documentos";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Veículo" },
  { id: "manutencao", label: "Manutenção" },
  { id: "combustivel", label: "Combustível" },
  { id: "documentos", label: "Documentos" },
];

export default function CarDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { fail, ok } = useFeedback();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [tab, setTab] = useState<Tab>("resumo");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [kmValue, setKmValue] = useState("");
  const [editingKm, setEditingKm] = useState(false);
  const [savingKm, setSavingKm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const row = await fetchVehicleById(id);
    setVehicle(row);
    navigation.setOptions({ title: row ? vehicleLabel(row) : "Veículo" });
    if (!row) {
      setError("Veículo não encontrado.");
      return;
    }
    setKmValue(String(row.current_km));
    const [alerts, fuels] = await Promise.all([
      fetchVehicleAlerts(id),
      fetchFuelLogs(id).catch(() => []),
    ]);
    setDocuments(alerts.documents);
    setMaintenances(alerts.maintenances);
    setFuelLogs(fuels);
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível abrir o veículo."));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const consumption = useMemo(
    () => calculateFuelConsumption(fuelLogs),
    [fuelLogs]
  );
  const maintAlerts = useMemo(
    () => (vehicle ? getMaintenanceAlerts(vehicle, maintenances) : []),
    [vehicle, maintenances]
  );
  const docAlerts = useMemo(() => getDocumentAlerts(documents), [documents]);
  const schedule = useMemo(
    () => (vehicle ? getMaintenanceSchedule(vehicle, maintenances) : []),
    [vehicle, maintenances]
  );

  async function saveKm() {
    if (!vehicle) return;
    const parsed = Number.parseInt(kmValue, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      fail("Informe uma quilometragem válida.");
      return;
    }
    setSavingKm(true);
    try {
      await updateVehicle({ id: vehicle.id, current_km: parsed });
      setVehicle({ ...vehicle, current_km: parsed });
      setEditingKm(false);
      ok("Km atualizado");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o km."));
    } finally {
      setSavingKm(false);
    }
  }

  if (loading && !vehicle) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        {vehicle ? (
          <>
            <Card style={styles.card}>
              <View style={styles.header}>
                <View style={[styles.iconWell, { backgroundColor: "#22A37A22" }]}>
                  <Ionicons
                    name={
                      vehicle.kind === "motorcycle"
                        ? "bicycle-outline"
                        : "car-outline"
                    }
                    size={22}
                    color="#22A37A"
                  />
                </View>
                <View style={styles.copy}>
                  <ThemedText type="title">{vehicleLabel(vehicle)}</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {[
                      vehicle.plate,
                      vehicle.color,
                      vehicle.fuel_type
                        ? FUEL_TYPE_LABELS[vehicle.fuel_type]
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </ThemedText>
                </View>
              </View>
              {editingKm ? (
                <View style={styles.kmRow}>
                  <TextInput
                    keyboardType="number-pad"
                    value={kmValue}
                    onChangeText={(value) =>
                      setKmValue(value.replace(/\D/g, ""))
                    }
                    style={[inputStyle, styles.kmInput]}
                  />
                  <Pressable
                    disabled={savingKm}
                    onPress={() => void saveKm()}
                    style={[styles.primary, { backgroundColor: theme.primary }]}
                  >
                    {savingKm ? (
                      <ActivityIndicator color="#0B0F1A" />
                    ) : (
                      <ThemedText type="smallBold" style={styles.primaryLabel}>
                        Salvar km
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setEditingKm(true)} style={styles.kmRow}>
                  <ThemedText type="smallBold">
                    {vehicle.current_km.toLocaleString("pt-BR")} km
                  </ThemedText>
                  <ThemedText type="linkPrimary">Editar</ThemedText>
                </Pressable>
              )}
              {consumption != null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Consumo {consumption.toFixed(1).replace(".", ",")} km/l
                </ThemedText>
              ) : null}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/cars/form",
                    params: { id: vehicle.id },
                  })
                }
              >
                <ThemedText type="linkPrimary">Editar veículo</ThemedText>
              </Pressable>
            </Card>

            <ChipBar options={TABS} value={tab} onChange={setTab} />

            {tab === "resumo" ? (
              <>
                {maintAlerts.length === 0 && docAlerts.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    Nenhum alerta no momento.
                  </ThemedText>
                ) : (
                  <>
                    {maintAlerts.map((alert) => (
                      <Card
                        key={`m-${alert.type}-${alert.message}`}
                        style={[
                          styles.card,
                          alert.status === "overdue" && {
                            borderColor: theme.danger,
                          },
                        ]}
                      >
                        <ThemedText type="smallBold">{alert.label}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {alert.message}
                        </ThemedText>
                      </Card>
                    ))}
                    {docAlerts.map((alert) => (
                      <Card
                        key={`d-${alert.document.id}`}
                        style={[
                          styles.card,
                          alert.status === "overdue" && {
                            borderColor: theme.danger,
                          },
                        ]}
                      >
                        <ThemedText type="smallBold">
                          {DOCUMENT_TYPE_LABELS[alert.document.type] ??
                            alert.document.type}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {alert.message}
                        </ThemedText>
                      </Card>
                    ))}
                  </>
                )}
              </>
            ) : null}

            {tab === "manutencao" ? (
              <>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/cars/maint-form",
                      params: { vehicleId: vehicle.id },
                    })
                  }
                >
                  <ThemedText type="linkPrimary">Registrar manutenção</ThemedText>
                </Pressable>
                {schedule
                  .filter((item) => item.status !== "ok" && item.status !== "none")
                  .map((item) => (
                    <Card key={item.type} style={styles.card}>
                      <ThemedText type="smallBold">{item.label}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.message}
                      </ThemedText>
                    </Card>
                  ))}
                {maintenances.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    Nenhuma manutenção.
                  </ThemedText>
                ) : (
                  maintenances.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() =>
                        router.push({
                          pathname: "/cars/maint-form",
                          params: { vehicleId: vehicle.id, id: item.id },
                        })
                      }
                      onLongPress={() => {
                        Alert.alert("Excluir manutenção", item.type, [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Excluir",
                            style: "destructive",
                            onPress: () => {
                              void deleteMaintenance(item.id)
                                .then(() =>
                                  setMaintenances((cur) =>
                                    cur.filter((row) => row.id !== item.id)
                                  )
                                )
                                .catch((err) =>
                                  fail(
                                    getErrorMessage(err, "Não foi possível excluir.")
                                  )
                                );
                            },
                          },
                        ]);
                      }}
                    >
                      <Card style={styles.card}>
                        <ThemedText type="smallBold">
                          {item.custom_type ||
                            MAINTENANCE_TYPE_LABELS[item.type] ||
                            item.type}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {[
                            item.service_date
                              ? formatDateBR(item.service_date)
                              : null,
                            item.km_at_service
                              ? `${item.km_at_service.toLocaleString("pt-BR")} km`
                              : null,
                            item.next_date
                              ? `próxima ${formatDateBR(item.next_date)}`
                              : null,
                            item.next_km
                              ? `próximo ${item.next_km.toLocaleString("pt-BR")} km`
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
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/cars/fuel-form",
                      params: { vehicleId: vehicle.id },
                    })
                  }
                >
                  <ThemedText type="linkPrimary">Registrar abastecimento</ThemedText>
                </Pressable>
                {fuelLogs.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    Nenhum abastecimento.
                  </ThemedText>
                ) : (
                  fuelLogs.map((log) => (
                    <Pressable
                      key={log.id}
                      onPress={() =>
                        router.push({
                          pathname: "/cars/fuel-form",
                          params: { vehicleId: vehicle.id, id: log.id },
                        })
                      }
                      onLongPress={() => {
                        Alert.alert(
                          "Excluir abastecimento",
                          formatDateBR(log.date),
                          [
                            { text: "Cancelar", style: "cancel" },
                            {
                              text: "Excluir",
                              style: "destructive",
                              onPress: () => {
                                void deleteFuelLog(log.id)
                                  .then(() =>
                                    setFuelLogs((cur) =>
                                      cur.filter((row) => row.id !== log.id)
                                    )
                                  )
                                  .catch((err) =>
                                    fail(
                                      getErrorMessage(
                                        err,
                                        "Não foi possível excluir."
                                      )
                                    )
                                  );
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Card style={styles.card}>
                        <ThemedText type="smallBold">
                          {formatDateBR(log.date)} ·{" "}
                          {log.liters.toLocaleString("pt-BR")} L
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
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
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/cars/doc-form",
                      params: { vehicleId: vehicle.id },
                    })
                  }
                >
                  <ThemedText type="linkPrimary">Novo documento</ThemedText>
                </Pressable>
                {documents.length === 0 ? (
                  <ThemedText themeColor="textSecondary">Nenhum documento.</ThemedText>
                ) : (
                  documents.map((doc) => (
                    <Pressable
                      key={doc.id}
                      onPress={() =>
                        router.push({
                          pathname: "/cars/doc-form",
                          params: { vehicleId: vehicle.id, id: doc.id },
                        })
                      }
                      onLongPress={() => {
                        Alert.alert("Excluir documento", doc.type, [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Excluir",
                            style: "destructive",
                            onPress: () => {
                              void deleteDocument(doc.id)
                                .then(() =>
                                  setDocuments((cur) =>
                                    cur.filter((row) => row.id !== doc.id)
                                  )
                                )
                                .catch((err) =>
                                  fail(
                                    getErrorMessage(err, "Não foi possível excluir.")
                                  )
                                );
                            },
                          },
                        ]);
                      }}
                    >
                      <Card style={styles.card}>
                        <ThemedText type="smallBold">
                          {DOCUMENT_TYPE_LABELS[doc.type] ??
                            doc.custom_type ??
                            doc.type}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Vence {formatDateBR(doc.due_date)}
                          {doc.paid ? " · pago" : " · em aberto"}
                        </ThemedText>
                      </Card>
                    </Pressable>
                  ))
                )}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  kmRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  kmInput: { flex: 1 },
  input: {
    height: 44,
    borderRadius: Radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  primary: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { color: "#0B0F1A" },
});
