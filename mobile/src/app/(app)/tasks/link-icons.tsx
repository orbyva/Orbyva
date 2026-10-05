import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import {
  createDefaultLinkIconRules,
  createLinkIconRule,
  deleteLinkIconRule,
  fetchLinkIconRules,
  reorderLinkIconRules,
  updateLinkIconRule,
} from "@/api/tasks/linkIconRules";
import { ChoiceChip } from "@/components/ChoiceChip";
import { TaskIconBadge } from "@/components/TaskIconBadge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button, Card, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  LINK_ICON_PRESETS,
  matchLinkIconRule,
  moveRuleId,
  resolveLinkAppearance,
  validateLinkIconPattern,
  type LinkIconRuleShape,
} from "@/domain/tasks/linkIconRules";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { LinkIconRule } from "@/types/tasks";

type RuleForm = {
  id: string | null;
  name: string;
  pattern: string;
  label_template: string;
  icon_key: string | null;
  icon_url: string | null;
};

const EMPTY_FORM: RuleForm = {
  id: null,
  name: "",
  pattern: "",
  label_template: "",
  icon_key: "external",
  icon_url: null,
};

export default function LinkIconRulesScreen() {
  const theme = useTheme();
  const { ok, fail } = useFeedback();
  const [rules, setRules] = useState<LinkIconRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<RuleForm | null>(null);
  const [testUrl, setTestUrl] = useState("");

  const load = useCallback(async () => {
    try {
      setRules(await fetchLinkIconRules());
      setLoadError(null);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Não foi possível carregar as regras."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      fail(getErrorMessage(err, fallback));
    } finally {
      setBusy(false);
      await load();
    }
  }

  function openEdit(rule: LinkIconRule) {
    setForm({
      id: rule.id,
      name: rule.name,
      pattern: rule.pattern,
      label_template: rule.label_template ?? "",
      icon_key: rule.icon_key,
      icon_url: rule.icon_url,
    });
    setTestUrl("");
  }

  async function save() {
    if (!form) return;
    const fields = {
      name: form.name,
      pattern: form.pattern,
      label_template: form.label_template,
      icon_key: form.icon_url ? null : form.icon_key,
      icon_url: form.icon_url,
    };
    await run(async () => {
      if (form.id) {
        await updateLinkIconRule(form.id, fields);
      } else {
        await createLinkIconRule({
          ...fields,
          position: rules.reduce((max, r) => Math.max(max, r.position + 1), 0),
          enabled: true,
        });
      }
      ok("Regra salva!");
      setForm(null);
    }, "Não foi possível salvar a regra.");
  }

  function confirmDelete(rule: LinkIconRule) {
    Alert.alert(
      "Excluir esta regra?",
      "Os links das tarefas continuam existindo — voltam a aparecer com o ícone genérico e o endereço do site.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () =>
            void run(async () => {
              await deleteLinkIconRule(rule.id);
              if (form?.id === rule.id) setForm(null);
              ok("Regra excluída");
            }, "Não foi possível excluir a regra."),
        },
      ]
    );
  }

  function move(rule: LinkIconRule, delta: -1 | 1) {
    const next = moveRuleId(
      rules.map((r) => r.id),
      rule.id,
      delta
    );
    if (!next) return;
    setRules(next.map((id) => rules.find((r) => r.id === id)!));
    void run(() => reorderLinkIconRules(next), "Não foi possível reordenar as regras.");
  }

  function toggle(rule: LinkIconRule, enabled: boolean) {
    setRules((cur) => cur.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    void run(
      () => updateLinkIconRule(rule.id, { enabled }),
      "Não foi possível atualizar a regra."
    );
  }


  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  const patternError = form?.pattern ? validateLinkIconPattern(form.pattern) : null;
  const draftShape: LinkIconRuleShape | null = form
    ? {
        pattern: form.pattern,
        label_template: form.label_template,
        icon_key: form.icon_key,
        icon_url: form.icon_url,
        position: 0,
        enabled: true,
      }
    : null;
  const trimmedTestUrl = testUrl.trim();
  const preview =
    draftShape && trimmedTestUrl ? resolveLinkAppearance(trimmedTestUrl, [draftShape]) : null;
  const previewMatched =
    draftShape && trimmedTestUrl ? matchLinkIconRule(trimmedTestUrl, [draftShape]) !== null : false;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="mutedForeground">
          Regras que decidem o ícone e o texto de cada link externo nas tarefas. A primeira regra
          que casa vence — use as setas para escolher quem vem antes.
        </ThemedText>

        {form ? (
          <Card style={styles.card}>
            <ThemedText type="smallBold">{form.id ? "Editar regra" : "Nova regra"}</ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
              Nome *
            </ThemedText>
            <Input
              placeholder="GitHub issue"
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
            />
            <ThemedText type="small" themeColor="mutedForeground">
              Expressão regular *
            </ThemedText>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="^https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)"
              value={form.pattern}
              onChangeText={(pattern) => setForm({ ...form, pattern })}
            />
            {patternError ? (
              <ThemedText type="small" style={{ color: theme.destructive }}>
                {patternError}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="mutedForeground">
              Texto do link ($1…$9 são os grupos capturados; vazio usa o site)
            </ThemedText>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="$1/$2#$3"
              value={form.label_template}
              onChangeText={(label_template) => setForm({ ...form, label_template })}
            />
            <ThemedText type="small" themeColor="mutedForeground">
              Ícone
            </ThemedText>
            {form.icon_url ? (
              <View style={styles.row}>
                <TaskIconBadge iconUrl={form.icon_url} size={18} />
                <ThemedText type="small" style={styles.flex}>
                  Ícone da sua biblioteca (escolhido na web)
                </ThemedText>
                <Button
                  label="Usar ícone pronto"
                  onPress={() => setForm({ ...form, icon_url: null })}
                  variant="outline"
                  size="sm"
                />
              </View>
            ) : (
              <View style={styles.chips}>
                {LINK_ICON_PRESETS.map((preset) => (
                  <ChoiceChip
                    key={preset.key}
                    label={preset.label}
                    active={form.icon_key === preset.key}
                    onPress={() => setForm({ ...form, icon_key: preset.key })}
                  />
                ))}
              </View>
            )}
            <ThemedText type="small" themeColor="mutedForeground">
              Testar com uma URL
            </ThemedText>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://github.com/owner/repo/issues/123"
              value={testUrl}
              onChangeText={setTestUrl}
            />
            {preview ? (
              <View style={styles.preview}>
                <ThemedText type="small" themeColor="mutedForeground">
                  {previewMatched
                    ? "A regra casou:"
                    : "A regra não casou. Sem ela, o link aparece assim:"}
                </ThemedText>
                <View style={styles.row}>
                  <TaskIconBadge
                    iconKey={preview.iconKey}
                    iconUrl={preview.iconUrl}
                    size={16}
                    color={theme.primary}
                  />
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                    {preview.label}
                  </ThemedText>
                </View>
              </View>
            ) : null}
            <View style={styles.row}>
              <Button
                label="Salvar"
                loading={busy}
                disabled={!form.name.trim() || !form.pattern.trim() || Boolean(patternError)}
                onPress={() => void save()}
                size="sm"
                style={{ flex: 1 }}
              />
              <Button
                label="Cancelar"
                onPress={() => setForm(null)}
                variant="outline"
                size="sm"
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : (
          <Button
            label="Nova regra"
            onPress={() => {
              setForm({ ...EMPTY_FORM });
              setTestUrl("");
            }}
            size="lg"
          />
        )}

        {loadError ? (
          <Card style={styles.card}>
            <ThemedText type="smallBold">{loadError}</ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
              Suas regras continuam salvas — os links só aparecem com o ícone genérico até a lista
              voltar.
            </ThemedText>
            <Button
              label="Tentar de novo"
              onPress={() => void load()}
              variant="outline"
              size="sm"
            />
          </Card>
        ) : rules.length === 0 ? (
          <Card style={styles.card}>
            <ThemedText type="smallBold">Nenhuma regra ainda</ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
              Sem regras, todo link externo aparece com o ícone genérico e o endereço do site.
              Comece pelas prontas — todas editáveis depois.
            </ThemedText>
            <Button
              label="Criar regras padrão"
              loading={busy}
              onPress={() =>
                void run(async () => {
                  await createDefaultLinkIconRules(0);
                  ok("Regras padrão criadas");
                }, "Não foi possível criar as regras padrão.")
              }
              variant="outline"
            />
          </Card>
        ) : (
          <Card style={styles.list}>
            {rules.map((rule, index) => (
              <View
                key={rule.id}
                style={[
                  styles.ruleRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                <View style={styles.row}>
                  <TaskIconBadge
                    iconKey={rule.icon_key}
                    iconUrl={rule.icon_url}
                    size={18}
                    color={rule.enabled ? theme.primary : theme.mutedForeground}
                  />
                  <View style={styles.flex}>
                    <ThemedText
                      type="smallBold"
                      numberOfLines={1}
                      themeColor={rule.enabled ? undefined : "mutedForeground"}
                    >
                      {index + 1}. {rule.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                      {rule.pattern}
                    </ThemedText>
                  </View>
                  <Switch
                    accessibilityLabel={`${rule.enabled ? "Desativar" : "Ativar"} ${rule.name}`}
                    value={rule.enabled}
                    disabled={busy}
                    onValueChange={(enabled) => toggle(rule, enabled)}
                  />
                </View>
                <View style={styles.actions}>
                  <IconButton
                    icon="arrow-up"
                    label={`Mover ${rule.name} para cima`}
                    disabled={busy || index === 0}
                    onPress={() => move(rule, -1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`Mover ${rule.name} para baixo`}
                    disabled={busy || index === rules.length - 1}
                    onPress={() => move(rule, 1)}
                  />
                  <IconButton
                    icon="pencil-outline"
                    label={`Editar ${rule.name}`}
                    onPress={() => openEdit(rule)}
                  />
                  <IconButton
                    icon="trash-outline"
                    label={`Excluir ${rule.name}`}
                    color={theme.destructive}
                    onPress={() => confirmDelete(rule)}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={[styles.iconBtn, disabled && styles.disabled]}
    >
      <Ionicons name={icon} size={18} color={color ?? theme.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  card: { gap: 10, padding: Spacing.three },
  list: { padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preview: { gap: 4 },
  ruleRow: { padding: Spacing.three, gap: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: Spacing.three },
  iconBtn: { padding: 4 },
  disabled: { opacity: 0.35 },
});
