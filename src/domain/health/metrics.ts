import type { HealthMetric, MetricType } from "@/types/health";
import {
  bmiCategory,
  computeBmi,
} from "../../../supabase/functions/_shared/orb/domain.ts";

/**
 * Regras puras das métricas corporais (feature 063) — sem I/O, para o Vitest cobrir sem Supabase.
 * A seção "Progresso" do Health Dashboard é só a renderização do que sai daqui.
 */

/**
 * IMC e faixa do IMC moram em `supabase/functions/_shared/orb/domain.ts`: as tools da Orb (Deno na
 * Edge, Node no MCP) respondem o mesmo número que o Health Dashboard mostra, e duas contas com o
 * mesmo nome divergiriam no primeiro ajuste de arredondamento. Reexportados daqui para quem consome
 * as regras de métricas não precisar saber onde elas moram.
 */
export { bmiCategory, computeBmi };

/** Unidade de cada tipo de medição — kg só para peso, cm para o resto. */
export const METRIC_UNIT: Record<MetricType, string> = {
  weight: "kg",
  height: "cm",
  waist: "cm",
  hip: "cm",
  chest: "cm",
  arm: "cm",
};

/** Rótulo em pt-BR de cada tipo, usado no card e no seletor do diálogo. */
export const METRIC_LABEL: Record<MetricType, string> = {
  weight: "Peso",
  height: "Altura",
  waist: "Cintura",
  hip: "Quadril",
  chest: "Peito",
  arm: "Braço",
};

/** Ordem estável de exibição — peso e altura primeiro, que são os que alimentam o IMC. */
export const METRIC_TYPES: MetricType[] = [
  "weight",
  "height",
  "waist",
  "hip",
  "chest",
  "arm",
];

/**
 * Número da medição em pt-BR, sem casa decimal inútil: 78,4 kg e 176 cm (não "176,0"). Até duas
 * casas, que é o que a variação arredondada pode ter.
 */
export function formatMetricValue(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Ordena as medições de um tipo da mais recente para a mais antiga. `recorded_date` é o critério
 * (é o dia da medição); `created_at` só desempata duas medições do mesmo dia — pesar-se duas vezes
 * no mesmo dia é possível e a última registrada vale como a atual.
 */
function sortedDesc(metrics: HealthMetric[], type: MetricType): HealthMetric[] {
  return metrics
    .filter((metric) => metric.metric_type === type)
    .sort((a, b) => {
      if (a.recorded_date !== b.recorded_date) {
        return a.recorded_date < b.recorded_date ? 1 : -1;
      }
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
}

/**
 * A medição mais recente de cada tipo. A lista de entrada pode vir em qualquer ordem e misturar
 * tipos — é a janela recente que `loadHealthSummary` traz.
 */
export function latestByType(
  metrics: HealthMetric[]
): Record<MetricType, HealthMetric | undefined> {
  const result = {} as Record<MetricType, HealthMetric | undefined>;
  for (const type of METRIC_TYPES) {
    result[type] = sortedDesc(metrics, type)[0];
  }
  return result;
}

/**
 * Variação da última medição de um tipo em relação à anterior do **mesmo** tipo (positivo = subiu).
 * `null` quando não há duas medições — sem a anterior não existe variação, e mostrar 0 nesse caso
 * mentiria dizendo "não mudou".
 *
 * Arredonda a duas casas para não exibir o lixo do ponto flutuante (78.4 − 77.9 = 0.5000000000000071).
 */
export function deltaSincePrevious(
  metrics: HealthMetric[],
  type: MetricType
): number | null {
  const series = sortedDesc(metrics, type);
  if (series.length < 2) return null;
  return Math.round((series[0]!.value - series[1]!.value) * 100) / 100;
}
