import { useCallback, useEffect, useMemo, useState } from "react";
import { Home as HomeIcon, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS, PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import {
  createHomeMaintenance,
  createHomeProfile,
  deleteHomeMaintenance,
  fetchHomeMaintenances,
  fetchHomeProfiles,
} from "@/api/home";
import {
  getHomeMaintenanceSchedule,
  getHomeMaintenanceTypeLabel,
  HOME_MAINTENANCE_LABELS,
} from "@/domain/home";
import type { HomeMaintenanceType, HomeProfile, HomeMaintenanceCreateRequest } from "@/types/home";
import { statusBadgeStyles } from "@/lib/design-tokens";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

export default function Home() {
  const [profile, setProfile] = useState<HomeProfile | null>(null);
  const [maintenances, setMaintenances] = useState<Awaited<ReturnType<typeof fetchHomeMaintenances>>>([]);
  const [loading, setLoading] = useState(true);
  const [maintOpen, setMaintOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "Minha Casa", address: "", notes: "" });
  const [maintForm, setMaintForm] = useState<HomeMaintenanceCreateRequest>({
    home_id: "",
    type: "ac_filter",
    service_date: new Date().toISOString().split("T")[0],
    cost: null,
    provider: "",
    next_date: null,
    notes: "",
  });
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const profiles = await fetchHomeProfiles();
      const p = profiles[0] ?? null;
      setProfile(p);
      if (p) {
        setMaintenances(await fetchHomeMaintenances(p.id));
        setMaintForm((f) => ({ ...f, home_id: p.id }));
      }
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const schedule = useMemo(
    () => getHomeMaintenanceSchedule(maintenances),
    [maintenances]
  );

  async function handleCreateProfile() {
    try {
      await createHomeProfile(profileForm);
      toast({ title: "Casa cadastrada!", duration: 2000 });
      setProfileOpen(false);
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleSaveMaintenance() {
    if (!profile) return;
    try {
      await createHomeMaintenance({ ...maintForm, home_id: profile.id });
      toast({ title: "Manutenção registrada!", duration: 2000 });
      setMaintOpen(false);
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleDeleteMaint(id: string) {
    try {
      await deleteHomeMaintenance(id);
      toast({ title: "Excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  if (loading) return <main className="p-6"><p className="text-sm text-muted-foreground">Carregando...</p></main>;

  if (!profile) {
    return (
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        <h1 className="text-2xl font-bold">Casa</h1>
        <EmptyState icon={HomeIcon} title="Nenhuma casa cadastrada" description="Cadastre sua casa para registrar manutenções." />
        <div className="flex justify-center">
          <Button onClick={() => setProfileOpen(true)}>Cadastrar casa</Button>
        </div>
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
            <DialogHeader><DialogTitle>Cadastrar casa</DialogTitle></DialogHeader>
            <div className={FORM_FIELDS_CLASS}>
              <div><FormLabel required>Nome</FormLabel><Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
              <div><FormLabel optional>Endereço</FormLabel><Input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} /></div>
              <Button onClick={handleCreateProfile} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    );
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Casa</h1>
          <p className="text-sm text-muted-foreground">{profile.name}{profile.address ? ` · ${profile.address}` : ""}</p>
        </div>
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <Button onClick={() => setMaintOpen(true)}>Registrar manutenção</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {schedule.filter((s) => s.status !== "none").map((item) => (
          <article key={item.type} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.label}</h3>
              <Badge variant="outline" className={cn("text-[10px]", statusBadgeStyles[item.status === "overdue" ? "ATRASADO" : item.status === "upcoming" ? "ATENÇÃO" : "OK"])}>
                {item.status === "overdue" ? "ATRASADO" : item.status === "upcoming" ? "ATENÇÃO" : "OK"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
            {item.nextDate && <p className="mt-1 text-xs">Próxima: {formatDateBR(item.nextDate)}</p>}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico</h2>
        {maintenances.length === 0 ? (
          <EmptyState icon={Wrench} title="Sem manutenções" description="Registre serviços e próximas datas." />
        ) : (
          <div className="space-y-2">
            {maintenances.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{getHomeMaintenanceTypeLabel(m.type, m.custom_type)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(m.service_date)}{m.cost != null ? ` · ${formatBRL(m.cost)}` : ""}</p>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDeleteMaint(m.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader><DialogTitle>Registrar manutenção</DialogTitle></DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Tipo</FormLabel>
              <Select value={maintForm.type} onValueChange={(v) => setMaintForm({ ...maintForm, type: v as HomeMaintenanceType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(HOME_MAINTENANCE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FormLabel required>Data</FormLabel><DatePicker date={new Date(`${maintForm.service_date}T12:00:00`)} onSelect={(d) => setMaintForm({ ...maintForm, service_date: d ? d.toISOString().split("T")[0] : maintForm.service_date })} /></div>
              <div><FormLabel optional>Custo</FormLabel><Input type="number" value={maintForm.cost ?? ""} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value ? Number(e.target.value) : null })} /></div>
            </div>
            <div><FormLabel optional>Próxima data</FormLabel><DatePicker date={maintForm.next_date ? new Date(`${maintForm.next_date}T12:00:00`) : undefined} onSelect={(d) => setMaintForm({ ...maintForm, next_date: d ? d.toISOString().split("T")[0] : null })} /></div>
            <Button onClick={handleSaveMaintenance} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
