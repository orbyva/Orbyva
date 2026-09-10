# Orbyva mobile (Expo)

Cliente nativo do Orbyva (iOS + Android). Usa o **mesmo projeto Supabase** do web. A UI não é o SPA: só o contrato (Auth, RLS, Edge Functions).

## Rodar

```bash
cd mobile
cp .env.example .env   # preencha URL + anon key (iguais ao VITE_SUPABASE_* do web)
npm install
npx expo start
```

Abra no simulador iOS, emulador Android ou Expo Go. Typecheck: `npx tsc --noEmit`.

O `npm run dev` / `npm run build` / `npm run lint` da **raiz** continuam sendo só o web.

## Auth (dashboard do Supabase)

**Não mude o Site URL** — continua `https://orbyva.app` (é o web).

O Google no app usa o scheme **`orbyva://auth/callback`**, não `exp://`. O
`exp://IP/--/…` do Expo Go quase sempre é recusado na allowlist e o Supabase
cai no site.

Authentication → URL Configuration → Redirect URLs:

```
orbyva://auth/callback
orbyva://**
```

Pode apagar as URLs `exp://…` que tiver colocado. Recarregue o app depois de
salvar (`r` no Metro) e tente o Google de novo.

Google já existe no web (o Client ID do Google Cloud não muda). **Sign in with
Apple** precisa estar ligado no Supabase (provider Apple) e no Apple Developer
(capability no App ID `app.orbyva`).

E-mail + senha funciona sem redirect extra (mesma conta do web).

## CORS das Edge Functions

O app manda o header `x-orbyva-client: mobile`. A mudança está em `supabase/functions/_shared/cors.ts`. **Não entra no ar até um deploy das functions** — confirmar antes de `supabase functions deploy`. Não há migration nesta fatia.

## Estrutura

```
src/app/login.tsx          login
src/app/(app)/finance.tsx  placeholder do grupo Finanças
src/app/(app)/account.tsx  e-mail, plano (leitura), sair
src/lib/supabase.ts        cliente (SecureStore, sem import.meta.env)
```

Bundle id: `app.orbyva`. Builds de loja: EAS (`eas.json`), só quando pedirem submit.
