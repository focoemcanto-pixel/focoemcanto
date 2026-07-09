# Admin WhatsApp — Agenda de Lives

## Objetivo
Criar uma área administrativa em `/admin` dentro do próprio site principal da Foco em Canto para gerenciar disparos automáticos dos grupos de lives, substituindo a operação manual no Google Apps Script.

## Decisão de rota
Não usar subdomínio separado neste momento. O painel ficará no mesmo projeto, nas rotas internas:

- `/admin` — painel inicial do Foco OS
- `/admin/whatsapp` — dashboard de automações WhatsApp
- `/admin/links` — links inteligentes e UTMs
- `/admin/funis` — análise de funis futuramente

Isso evita configuração extra de DNS/subdomínio e facilita o deploy atual.

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

## Próximo passo técnico

1. Manter o painel em `/admin` no domínio principal.
2. Adicionar Supabase ou outro storage persistente.
3. Criar endpoints de envio Wasender.
4. Criar cron de envio.
5. Migrar os grupos atuais do Apps Script.
