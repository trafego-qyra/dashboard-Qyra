-- A ponte entre o clique no anúncio e a venda no Kommo.
--
-- Rode uma vez, no SQL Editor do Supabase. O código em
-- src/server/captura/ponte.ts espera exatamente estes nomes de coluna.
--
-- Por que esta tabela existe: o identificador do clique (`fbc`) só existe no
-- navegador de quem clicou no anúncio, e o questionário não o repassa ao Kommo.
-- Mas ele repassa outra coisa -- o `cliente_id`, que fica no `localStorage` do
-- navegador E no campo `qyra_cliente_id` do negócio. Essa coincidência é a
-- chave: guardando aqui `cliente_id -> fbc`, o webhook consegue juntar os dois
-- lados na hora do GANHO, sem o questionário precisar mudar uma linha.
--
-- Sobre o que NÃO está aqui: nome, telefone, e-mail, CPF, nada de saúde. O que
-- atravessa é um identificador opaco e um identificador de clique de anúncio.
-- Ninguém que leia esta tabela descobre quem é a pessoa -- que é justamente o
-- que torna este caminho mais limpo que mandar contato para o nosso servidor.

create table if not exists public.captura_clique (
  -- O UUID que o questionário gera e grava nos dois lugares. É `primary key`
  -- porque a mesma pessoa manda de novo a cada visita, e a segunda gravação
  -- precisa atualizar a linha, não criar outra.
  cliente_id text primary key,

  -- Cookie `_fbc`: `fb.1.<ms>.<fbclid>`. Determinístico -- ou é aquela pessoa,
  -- ou não é. É o dado que faz a Meta creditar a venda à campanha.
  fbc text,

  -- Cookie `_fbp`. Sozinho não identifica ninguém; acompanha o `fbc`.
  fbp text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O expurgo diário varre por data. Sem este índice ele vira scan da tabela
-- inteira assim que o histórico crescer.
create index if not exists captura_clique_por_data
  on public.captura_clique (criado_em);

-- Mesma regra da fila: lida e escrita apenas pelo servidor, com a chave
-- `service_role`, que ignora RLS. Ligar RLS sem política nenhuma é o que
-- garante que uma chave pública vazada não leia linha alguma.
alter table public.captura_clique enable row level security;
