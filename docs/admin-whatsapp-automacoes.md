# Admin WhatsApp — Agenda de Lives

## Objetivo
Criar uma área administrativa em `admin.focoemcanto.com` para gerenciar disparos automáticos dos grupos de lives da Foco em Canto, substituindo a operação manual no Google Apps Script.

## Visão do produto
O painel deve permitir que Marcos peça a criação de uma semana de disparos, revise as mensagens e envie/agende tudo para os grupos corretos.

Exemplo de comando operacional desejado:

> Crie os disparos da semana sobre afinação.

O sistema deverá gerar mensagens para domingo, segunda, terça, quarta, quinta e sexta, com horários e grupos definidos.

## Rotas sugeridas

- `/admin` — painel inicial
- `/admin/whatsapp` — dashboard de automações WhatsApp
- `/admin/whatsapp/agenda` — lista de disparos agendados
- `/admin/whatsapp/grupos` — cadastro e sincronização de grupos
- `/admin/whatsapp/templates` — mensagens-base por dia da semana
- `/admin/whatsapp/gerar-semana` — geração rápida da agenda semanal

## Funcionalidades do MVP

### 1. Cadastro de grupos
Grupos iniciais:

```ts
const LIVE_GROUPS = [
  {
    id: '120363404674461725@g.us',
    name: 'LIVE - FOCO EM CANTO',
    type: 'live'
  },
  {
    id: '120363428159310476@g.us',
    name: '#2 LIVE - FOCO EM CANTO',
    type: 'live'
  }
]
```

### 2. Agenda de disparos
Campos necessários:

- id
- data
- hora
- tipo: `LIVE`, `GERAL`, `TESTE`, `AQUECIMENTO`
- grupoDestino
- mensagem
- midiaUrl opcional
- status: `PENDENTE`, `ENVIADO`, `ERRO`
- enviadoEm
- erro

### 3. Geração de semana
Botão: **Gerar semana da Quarta Vocal**

Entradas:

- tema da semana
- link da live
- link do replay
- data da quarta-feira

Saída automática:

- Domingo 19:00 — enquete da próxima aula
- Segunda 19:00 — grupo aberto / plantão vocal
- Terça 20:00 — esquenta da aula
- Quarta 10:00 — lembrete da aula
- Quarta 19:30 — pré-live / grupo aberto
- Quarta 20:00 — link da aula ao vivo
- Quinta 10:00 — replay
- Sexta 19:00 — desafio da semana

### 4. Envio imediato
Botão em cada mensagem:

- Enviar agora
- Duplicar
- Editar
- Excluir

### 5. Agendamento automático
Opções possíveis:

- Vercel Cron / Cloudflare Scheduled Worker
- Supabase Edge Functions Cron
- servidor próprio com cron

O cron deve verificar mensagens pendentes a cada minuto ou a cada 5 minutos e enviar as que estiverem no horário.

## Integração Wasender

Variáveis de ambiente:

```env
WASENDER_API_KEY=
WASENDER_API_URL=https://app.wasenderapi.com/api/send-message
```

Nunca salvar API key diretamente no repositório.

Endpoint sugerido:

```ts
POST /api/admin/whatsapp/send
```

Payload:

```json
{
  "to": "120363404674461725@g.us",
  "text": "Mensagem de teste"
}
```

## Banco de dados sugerido

Como o projeto deve permitir preenchimento/agendamento remoto, o ideal é usar Supabase.

Tabela `whatsapp_groups`:

```sql
create table whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  name text not null,
  type text not null default 'live',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

Tabela `whatsapp_scheduled_messages`:

```sql
create table whatsapp_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  scheduled_time time not null,
  type text not null default 'LIVE',
  message text not null,
  media_url text,
  status text not null default 'PENDENTE',
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Tabela de relação `whatsapp_message_groups`:

```sql
create table whatsapp_message_groups (
  message_id uuid references whatsapp_scheduled_messages(id) on delete cascade,
  group_id uuid references whatsapp_groups(id) on delete cascade,
  primary key (message_id, group_id)
);
```

## UI desejada

Estética premium, escura, semelhante a SaaS moderno:

- fundo preto/roxo
- cards com bordas suaves
- chips de status
- botões por tipo de disparo em vez de select nativo
- destaque para mensagens da quarta-feira
- contador de pendentes, enviados e erros

## Mensagens-base

### Domingo 19h — Enquete
```text
🎤 Pessoal, passando para preparar nossa semana!

Qual desses temas você mais gostaria de ver na próxima Quarta Vocal?

1️⃣ Afinação
2️⃣ Extensão vocal
3️⃣ Segunda voz
4️⃣ Respiração
5️⃣ Segurança para cantar

Responde aqui com o número do tema que você mais precisa agora 👇
```

### Segunda 19h — Grupo aberto
```text
💬 Grupo aberto até 21h!

Hoje é nosso Plantão Vocal. Mande sua principal dúvida sobre canto, técnica vocal, afinação, extensão ou segunda voz.

Vou acompanhar as mensagens e separar algumas dúvidas para nossa aula de quarta. 🎤
```

### Terça 20h — Esquenta
```text
🔥 Amanhã temos Quarta Vocal às 20h!

O tema da aula será: {{TEMA_DA_SEMANA}}

Se você sente que precisa evoluir com mais direção, já separa esse horário.

Vai ser uma aula prática, direta e com aplicação para sua voz. 🎙️
```

### Quarta 10h — Lembrete
```text
🚨 É hoje!

Nossa Quarta Vocal acontece hoje às 20h.

Tema: {{TEMA_DA_SEMANA}}

Já coloca o alarme para não esquecer. Essa aula pode clarear muita coisa sobre sua evolução vocal. 🎤🔥
```

### Quarta 19h30 — Pré-live
```text
🎙️ Grupo aberto!

Daqui a pouco começamos nossa Quarta Vocal, às 20h.

Entra no clima, separa seu fone, água e já manda aqui:
qual sua maior dificuldade com o tema de hoje?
```

### Quarta 20h — Link
```text
🔴 COMEÇAMOS AGORA!

A Quarta Vocal já está ao vivo.

👉 Acesse aqui: {{LINK_DA_LIVE}}

Entra agora para acompanhar a aula desde o início. 🎤
```

### Quinta 10h — Replay
```text
📚 Replay disponível!

Quem não conseguiu assistir ontem, ou quer rever com calma, pode acessar aqui:

👉 {{LINK_DO_REPLAY}}

Minha sugestão: assista anotando os pontos que você precisa aplicar ainda essa semana.
```

### Sexta 19h — Desafio
```text
🎯 Desafio da semana!

Com base na aula de quarta, grave um áudio ou vídeo curto aplicando o que foi ensinado.

Não precisa estar perfeito. O importante é praticar.

Quem quiser, pode mandar aqui no grupo até 21h. 🎤
```

## Próximo passo técnico

1. Confirmar stack de deploy do domínio `admin.focoemcanto.com`.
2. Adicionar Supabase ou outro storage persistente.
3. Criar páginas admin.
4. Criar endpoints de envio Wasender.
5. Criar cron de envio.
6. Migrar os grupos atuais do Apps Script.
