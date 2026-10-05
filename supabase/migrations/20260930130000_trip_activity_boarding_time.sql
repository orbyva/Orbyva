-- Feature 102: horário de embarque do deslocamento.
--
-- `activity_time` é a **partida** e `arrival_time` é a **chegada** (20260807141500). Num voo, o
-- horário que decide a hora de sair do hotel não é nenhum dos dois: é o embarque, que fecha ~20 min
-- antes da partida e não é derivável (varia por companhia, aeroporto e tipo de voo).
--
-- Coluna `text` como as outras duas, não `time`: o roteiro trata horário como `HH:mm` de parede o
-- tempo todo (`OptionalTimeInput`, `estimateArrivalHHmm`, os ordenadores de `visits.ts`), e mudar
-- de tipo só nesta coluna criaria a única que precisa de conversão.
--
-- Vale para qualquer deslocamento com embarque (voo, trem, ônibus); a UI é que esconde o campo em
-- carro e "outro", onde embarcar não quer dizer nada.
alter table public.trip_itinerary_activity
  add column if not exists boarding_time text;

comment on column public.trip_itinerary_activity.boarding_time is
  'Horário de embarque do deslocamento (ex.: 13:40) — anterior à partida (activity_time) e não '
  'derivável dela. Exibido para voo/trem/ônibus; ignorado em carro e outro.';
