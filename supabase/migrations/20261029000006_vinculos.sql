-- 0006 — Vínculos: contas de anúncio (Meta) e grupos de WhatsApp por cliente

-- Cache das contas de anúncio visíveis para o token da Meta (sincronizado pelo painel)
create table if not exists contas_anuncio (
  id text primary key,                 -- act_1234567890
  nome text,
  plataforma text not null default 'meta',
  moeda text,
  status smallint,                     -- account_status da Meta (1 = ativa)
  business_nome text,
  sincronizada_em timestamptz not null default now()
);

-- Cache dos grupos em que o número da Cláudia está (via gateway Z-API)
create table if not exists wa_grupos (
  id text primary key,                 -- id do grupo na Z-API
  nome text,
  participantes int,
  sincronizado_em timestamptz not null default now()
);

-- Vínculo cliente ↔ conta de anúncio (um cliente pode ter várias contas; uma conta pertence a um cliente)
create table if not exists cliente_contas_anuncio (
  conta_id text primary key references contas_anuncio(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists cliente_contas_cli_idx on cliente_contas_anuncio (cliente_id);

alter table contas_anuncio enable row level security;
alter table wa_grupos enable row level security;
alter table cliente_contas_anuncio enable row level security;
create policy "ler" on contas_anuncio for select to authenticated using (true);
create policy "ler" on wa_grupos for select to authenticated using (true);
create policy "ler" on cliente_contas_anuncio for select to authenticated using (true);
create policy "gestor" on contas_anuncio for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on wa_grupos for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on cliente_contas_anuncio for all to authenticated using (eh_gestor()) with check (eh_gestor());

-- Visão de apoio: cada cliente com grupo e contas
create or replace view clientes_vinculos as
select c.id, c.nome, c.logo_url, c.grupo_whatsapp_id, g.nome as grupo_nome,
       coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'status', a.status) order by a.nome)
                 from cliente_contas_anuncio v join contas_anuncio a on a.id = v.conta_id where v.cliente_id = c.id), '[]') as contas
from clientes c
left join wa_grupos g on g.id = c.grupo_whatsapp_id
where c.ativo;

-- API dos agentes: serviço de anúncios descobre o cliente pela conta de anúncio
create or replace function cliente_por_conta(p_conta text) returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from cliente_contas_anuncio where conta_id = p_conta;
$$;
