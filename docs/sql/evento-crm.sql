-- Fila dos eventos de CRM que vão para a Meta pela API de Conversões.
--
-- Rode uma vez, no SQL Editor do Supabase. O código em
-- src/server/fila/eventos-crm.ts espera exatamente estes nomes de coluna.
--
-- Sobre o que NÃO está aqui: telefone e e-mail legíveis. O hash acontece antes
-- da gravação, e `user_data` guarda só o SHA-256 que a Meta compara. Reenviar
-- não precisa do valor cru, então ele não precisa existir no banco -- que é o
-- que mantém este projeto sem dado pessoal de paciente armazenado.

create table if not exists public.evento_crm (
  -- Chave de deduplicação, a mesma que vai para a Meta. É `primary key` de
  -- propósito: o webhook do Kommo reenvia, e a segunda gravação do mesmo
  -- evento precisa ser um silêncio, não uma linha duplicada.
  event_id text primary key,

  -- O negócio de origem. Serve para depurar "esta venda foi enviada?" partindo
  -- do Kommo, que é como a pergunta chega na prática.
  kommo_lead_id bigint,

  -- O nome da etapa do CRM. Não é "Lead": o conjunto de dados é o mesmo do
  -- pixel da landing page, e reaproveitar o nome contaria o lead duas vezes.
  event_name text not null,

  -- Quando a etapa mudou, não quando a linha foi criada. É o que a Meta usa
  -- para atribuir, e a diferença importa quando a fila acumula.
  event_time timestamptz not null,

  -- Já hasheado. Ver o comentário no topo.
  user_data jsonb not null,

  valor numeric(12, 2),
  moeda text default 'BRL',

  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'sem_identificador', 'falhou')),

  tentativas integer not null default 0,
  ultima_resposta text,

  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

-- O índice que o despacho usa: pendentes, mais antigo primeiro. Sem ele a
-- varredura vira scan da tabela inteira assim que o histórico crescer.
create index if not exists evento_crm_pendentes
  on public.evento_crm (status, event_time)
  where status = 'pendente';

-- A tabela é lida e escrita apenas pelo servidor, com a chave `service_role`,
-- que ignora RLS. Ligar RLS sem política nenhuma é o que garante que uma chave
-- pública vazada não leia nada: sem política, o acesso anônimo não vê linha
-- alguma.
alter table public.evento_crm enable row level security;
