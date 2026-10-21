-- O funil do questionário das LPs de planos (planos.qyra.com.br).
--
-- Rode uma vez, no SQL Editor do Supabase. O código em src/server/funil/lp.ts
-- espera exatamente estes nomes de coluna.
--
-- Por que esta tabela existe: o Analytics diz quantos chegaram à LP, e o Kommo
-- diz quantos viraram negócio. O que fica no escuro é o meio -- em qual
-- pergunta do questionário as pessoas desistem. A LP manda uma linha por tela
-- vista, e a tela de Comportamento do painel desenha o funil.
--
-- Sobre o que NÃO está aqui: nome, telefone, e-mail, CEP, respostas. A sessão é
-- um UUID sorteado no navegador e esquecido quando a aba fecha; ninguém que leia
-- esta tabela descobre quem é a pessoa, nem o que ela respondeu.

create table if not exists public.funil_lp (
  -- Sorteada pela LP a cada aba (sessionStorage). Não é cookie, não atravessa
  -- visitas e não identifica ninguém.
  sessao text not null,

  -- A tela que a pessoa viu. Lista fechada em src/server/funil/lp.ts.
  etapa text not null,

  -- Em qual das três LPs: avancado, essencial ou digital.
  lp text not null,

  -- O plano indicado, a partir da tela de plano. Ajuda a ler o fim do funil,
  -- onde o Digital não passa pelas perguntas de saúde.
  plano text,

  -- O `cliente_id` da API de checkout da Qyra, quando a LP tiver a etapa de
  -- pagamento. É a mesma chave do campo `qyra_cliente_id` no Kommo: com ela,
  -- quem chegou ao cadastro e não pagou vira carrinho abandonado com nome.
  cliente_id text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,

  criado_em timestamptz not null default now(),

  -- Uma linha por sessão e etapa: voltar uma pergunta e passar por ela de novo
  -- não conta duas vezes. É isso que faz a contagem de linhas ser a contagem
  -- de pessoas.
  primary key (sessao, etapa)
);

-- O expurgo e o resumo varrem por data.
create index if not exists funil_lp_por_data on public.funil_lp (criado_em);

-- Mesma regra das outras tabelas: só o servidor lê e escreve, com a chave
-- `service_role`. RLS ligado e nenhuma política.
alter table public.funil_lp enable row level security;

-- O resumo que a tela lê: pessoas por dia, LP e etapa. Somar os dias de um
-- período dá o número de pessoas, porque cada (sessão, etapa) é uma linha só.
-- `security_invoker` faz a view respeitar o RLS da tabela.
create or replace view public.funil_lp_por_dia
  with (security_invoker = true) as
  select
    (criado_em at time zone 'America/Sao_Paulo')::date as dia,
    lp,
    etapa,
    count(*)::int as sessoes
  from public.funil_lp
  group by 1, 2, 3;

revoke all on public.funil_lp_por_dia from anon, authenticated;
