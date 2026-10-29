-- Fluxo de Etapas — esquema, regras de negócio e permissões (Supabase / Postgres)
-- Aplicar com: supabase db push   (ou colar no SQL Editor do painel do Supabase)

create extension if not exists "pgcrypto";

create type papel as enum ('gestor','membro');
create type prioridade as enum ('normal','alta','urgente');
create type status_tarefa as enum ('aberta','concluida');
create type status_etapa as enum ('pendente','ativa','concluida');
create type tipo_etapa as enum ('normal','aprovacao');
create type cobranca as enum ('mensal','unico');

-- ---------- tabelas ----------
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  funcao text,
  email text unique,
  foto_url text,
  papel papel not null default 'membro',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  documento text,
  contato text,
  telefone text,
  email text,
  cliente_desde date,
  observacoes text check (char_length(observacoes) <= 600),
  logo_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table cliente_produtos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  valor_centavos integer not null default 0,
  cobranca cobranca not null default 'mensal',
  ativo boolean not null default true
);

create table cliente_acessos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null,   -- meta, bm, wpp, gads, ga, gmn, gsc, tiktok, insta, site, estoque, report, drive, outro
  rotulo text,
  url text not null,
  ordem smallint not null default 0
);

create table fluxos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true
);

create table fluxo_etapas (
  id uuid primary key default gen_random_uuid(),
  fluxo_id uuid not null references fluxos(id) on delete cascade,
  ordem smallint not null,
  nome text not null,
  responsavel_padrao_id uuid references usuarios(id),
  dias smallint not null default 0,
  tipo tipo_etapa not null default 'normal',
  unique (fluxo_id, ordem)
);

create table tarefas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  produto_id uuid references cliente_produtos(id),
  fluxo_id uuid references fluxos(id),
  fluxo_nome text,
  titulo text not null,
  descricao text check (char_length(descricao) <= 600),
  prioridade prioridade not null default 'normal',
  entrega_em date,
  status status_tarefa not null default 'aberta',
  etapa_atual smallint not null default 0,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em timestamptz
);

create table tarefa_links (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  rotulo text,
  url text not null
);

create table tarefa_etapas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  ordem smallint not null,
  nome text not null,
  tipo tipo_etapa not null default 'normal',
  responsavel_id uuid references usuarios(id),
  prazo date,
  status status_etapa not null default 'pendente',
  concluida_em timestamptz,
  concluida_por uuid references usuarios(id),
  entrega_url text,
  devolucoes smallint not null default 0,
  unique (tarefa_id, ordem)
);

create table etapa_comentarios (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references tarefa_etapas(id) on delete cascade,
  autor_id uuid references usuarios(id),
  texto text not null check (char_length(texto) <= 400),
  criado_em timestamptz not null default now()
);

create table tarefa_historico (
  id bigserial primary key,
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  autor_id uuid references usuarios(id),
  texto text not null,
  criado_em timestamptz not null default now()
);

create table recorrencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  fluxo_id uuid not null references fluxos(id),
  titulo text not null,
  prioridade prioridade not null default 'normal',
  regra text not null check (regra in ('mensal','semanal')),
  dia smallint not null,
  proxima_em date not null,
  ativo boolean not null default true
);

create index on tarefas (status, prioridade, entrega_em);
create index on tarefas (cliente_id, status);
create index on tarefa_etapas (responsavel_id, status);
create index on tarefa_etapas (tarefa_id, ordem);
create index on recorrencias (proxima_em) where ativo;

-- ---------- perfil criado automaticamente no primeiro login ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nome, email, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email,
          case when not exists (select 1 from public.usuarios) then 'gestor'::papel else 'membro'::papel end);  -- primeiro usuário vira gestor
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.eh_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and papel = 'gestor' and ativo);
$$;

-- ---------- regras de negócio (transacionais) ----------
create or replace function registrar_historico(p_tarefa uuid, p_texto text) returns void
language sql security definer set search_path = public as $$
  insert into tarefa_historico (tarefa_id, autor_id, texto) values (p_tarefa, auth.uid(), p_texto);
$$;

-- Cria a tarefa copiando as etapas do fluxo. p_etapas (opcional) substitui as etapas do fluxo:
-- jsonb [{nome, responsavel_id, prazo, tipo}]
create or replace function criar_tarefa(
  p_cliente uuid, p_titulo text, p_fluxo uuid default null, p_descricao text default null,
  p_prioridade prioridade default 'normal', p_entrega date default null, p_produto uuid default null,
  p_etapas jsonb default null, p_links jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_acum int := 0; r record; v_i int := 0; v_fluxo_nome text;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select nome into v_fluxo_nome from fluxos where id = p_fluxo;
  insert into tarefas (cliente_id, titulo, fluxo_id, fluxo_nome, descricao, prioridade, entrega_em, produto_id, criado_por)
  values (p_cliente, p_titulo, p_fluxo, v_fluxo_nome, p_descricao, p_prioridade, p_entrega, p_produto, auth.uid())
  returning id into v_id;

  if p_etapas is not null then
    for r in select * from jsonb_to_recordset(p_etapas) as x(nome text, responsavel_id uuid, prazo date, tipo tipo_etapa) loop
      insert into tarefa_etapas (tarefa_id, ordem, nome, tipo, responsavel_id, prazo, status)
      values (v_id, v_i, r.nome, coalesce(r.tipo,'normal'), r.responsavel_id, r.prazo, case when v_i = 0 then 'ativa'::status_etapa else 'pendente'::status_etapa end);
      v_i := v_i + 1;
    end loop;
  else
    for r in select * from fluxo_etapas where fluxo_id = p_fluxo order by ordem loop
      v_acum := v_acum + r.dias;
      insert into tarefa_etapas (tarefa_id, ordem, nome, tipo, responsavel_id, prazo, status)
      values (v_id, v_i, r.nome, r.tipo, r.responsavel_padrao_id,
              case when r.dias > 0 then current_date + v_acum else null end,
              case when v_i = 0 then 'ativa'::status_etapa else 'pendente'::status_etapa end);
      v_i := v_i + 1;
    end loop;
  end if;
  if v_i = 0 then raise exception 'a tarefa precisa de pelo menos uma etapa'; end if;

  if p_links is not null then
    insert into tarefa_links (tarefa_id, rotulo, url)
    select v_id, x.rotulo, x.url from jsonb_to_recordset(p_links) as x(rotulo text, url text);
  end if;
  perform registrar_historico(v_id, 'criou a tarefa');
  return v_id;
end $$;

-- Conclui a etapa ativa (também usada para "Aprovado pelo cliente")
create or replace function concluir_etapa(p_tarefa uuid, p_entrega_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas%rowtype; e tarefa_etapas%rowtype; v_total int;
begin
  select * into t from tarefas where id = p_tarefa for update;
  if t.status <> 'aberta' then raise exception 'tarefa já concluída'; end if;
  select * into e from tarefa_etapas where tarefa_id = p_tarefa and ordem = t.etapa_atual;
  if not (coalesce(e.responsavel_id = auth.uid(), false) or eh_gestor()) then raise exception 'só o responsável ou um gestor conclui esta etapa'; end if;

  update tarefa_etapas set status = 'concluida', concluida_em = now(), concluida_por = auth.uid(),
         entrega_url = coalesce(nullif(p_entrega_url,''), entrega_url) where id = e.id;
  perform registrar_historico(p_tarefa, case when e.tipo = 'aprovacao' then 'registrou a aprovação em "' else 'concluiu "' end || e.nome || '"');

  select count(*) into v_total from tarefa_etapas where tarefa_id = p_tarefa;
  if t.etapa_atual + 1 >= v_total then
    update tarefas set status = 'concluida', concluida_em = now(), atualizado_em = now() where id = p_tarefa;
    perform registrar_historico(p_tarefa, 'encerrou a tarefa');
  else
    update tarefas set etapa_atual = etapa_atual + 1, atualizado_em = now() where id = p_tarefa;
    update tarefa_etapas set status = 'ativa' where tarefa_id = p_tarefa and ordem = t.etapa_atual + 1;
  end if;
end $$;

-- Devolve para uma etapa anterior ("Pedir ajuste" na aprovação)
create or replace function devolver_etapa(p_tarefa uuid, p_para smallint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas%rowtype; v_de text; v_para text;
begin
  if coalesce(trim(p_motivo),'') = '' then raise exception 'informe o motivo da devolução'; end if;
  select * into t from tarefas where id = p_tarefa for update;
  if t.status <> 'aberta' or p_para >= t.etapa_atual or p_para < 0 then raise exception 'etapa de destino inválida'; end if;
  if not exists (select 1 from tarefa_etapas where tarefa_id = p_tarefa and ordem = t.etapa_atual and (responsavel_id = auth.uid() or eh_gestor()))
    then raise exception 'só o responsável ou um gestor devolve esta etapa'; end if;
  select nome into v_de from tarefa_etapas where tarefa_id = p_tarefa and ordem = t.etapa_atual;
  select nome into v_para from tarefa_etapas where tarefa_id = p_tarefa and ordem = p_para;

  update tarefa_etapas set status = 'pendente', concluida_em = null, concluida_por = null
    where tarefa_id = p_tarefa and ordem between p_para and t.etapa_atual;
  update tarefa_etapas set status = 'ativa', devolucoes = devolucoes + 1 where tarefa_id = p_tarefa and ordem = p_para;
  update tarefas set etapa_atual = p_para, atualizado_em = now() where id = p_tarefa;
  perform registrar_historico(p_tarefa, 'devolveu de "' || v_de || '" para "' || v_para || '": ' || p_motivo);
end $$;

create or replace function reatribuir_etapa(p_etapa uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e tarefa_etapas%rowtype; v_nome text;
begin
  select * into e from tarefa_etapas where id = p_etapa;
  if e.status = 'concluida' then raise exception 'etapa já concluída'; end if;
  update tarefa_etapas set responsavel_id = p_usuario where id = p_etapa;
  select nome into v_nome from usuarios where id = p_usuario;
  perform registrar_historico(e.tarefa_id, 'definiu ' || coalesce(v_nome,'ninguém') || ' como responsável por "' || e.nome || '"');
end $$;

-- Cron diário: cria as tarefas recorrentes vencidas
create or replace function processar_recorrencias() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select * from recorrencias where ativo and proxima_em <= current_date for update loop
    perform criar_tarefa(r.cliente_id, r.titulo, r.fluxo_id, null, r.prioridade);
    update recorrencias set proxima_em = case r.regra
      when 'mensal' then (date_trunc('month', r.proxima_em) + interval '1 month' + (r.dia - 1) * interval '1 day')::date
      else r.proxima_em + 7 end where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- visão para as telas (etapa ativa junto da tarefa) ----------
create or replace view tarefas_resumo as
select t.*, e.id as etapa_id, e.nome as etapa_nome, e.tipo as etapa_tipo, e.responsavel_id, e.prazo as etapa_prazo, e.devolucoes,
       (select count(*) from tarefa_etapas x where x.tarefa_id = t.id) as total_etapas,
       (select count(*) from tarefa_etapas x where x.tarefa_id = t.id and x.status = 'concluida') as etapas_concluidas,
       coalesce(t.status = 'aberta' and (e.prazo < current_date or t.entrega_em < current_date), false) as atrasada,
       c.nome as cliente_nome, c.logo_url as cliente_logo, u.nome as responsavel_nome, u.foto_url as responsavel_foto
from tarefas t
join tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual
join clientes c on c.id = t.cliente_id
left join usuarios u on u.id = e.responsavel_id;

-- ---------- permissões (RLS) ----------
alter table usuarios enable row level security;
alter table clientes enable row level security;
alter table cliente_produtos enable row level security;
alter table cliente_acessos enable row level security;
alter table fluxos enable row level security;
alter table fluxo_etapas enable row level security;
alter table tarefas enable row level security;
alter table tarefa_links enable row level security;
alter table tarefa_etapas enable row level security;
alter table etapa_comentarios enable row level security;
alter table tarefa_historico enable row level security;
alter table recorrencias enable row level security;

-- Qualquer membro autenticado lê tudo, exceto os valores dos produtos (só gestor).
create policy "ler" on usuarios for select to authenticated using (true);
create policy "ler" on clientes for select to authenticated using (true);
create policy "ler" on cliente_acessos for select to authenticated using (true);
create policy "ler" on fluxos for select to authenticated using (true);
create policy "ler" on fluxo_etapas for select to authenticated using (true);
create policy "ler" on tarefas for select to authenticated using (true);
create policy "ler" on tarefa_links for select to authenticated using (true);
create policy "ler" on tarefa_etapas for select to authenticated using (true);
create policy "ler" on etapa_comentarios for select to authenticated using (true);
create policy "ler" on tarefa_historico for select to authenticated using (true);
create policy "ler" on recorrencias for select to authenticated using (true);
create policy "ler" on cliente_produtos for select to authenticated using (eh_gestor());

-- Gestor administra cadastros; membro edita só o próprio perfil.
create policy "gestor" on clientes for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on cliente_produtos for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on cliente_acessos for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on fluxos for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on fluxo_etapas for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on recorrencias for all to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "gestor" on usuarios for update to authenticated using (eh_gestor()) with check (eh_gestor());
create policy "proprio" on usuarios for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and papel = (select papel from usuarios where id = auth.uid()));

-- Tarefas: qualquer membro cria e edita dados gerais; etapas mudam só pelas funções acima; comentar é livre.
create policy "escrever" on tarefas for all to authenticated using (true) with check (true);
create policy "escrever" on tarefa_links for all to authenticated using (true) with check (true);
create policy "comentar" on etapa_comentarios for insert to authenticated with check (autor_id = auth.uid());
create policy "editar_etapas_abertas" on tarefa_etapas for update to authenticated
  using (status <> 'concluida') with check (status <> 'concluida');
create policy "inserir_etapas" on tarefa_etapas for insert to authenticated with check (true);
create policy "remover_etapas_pendentes" on tarefa_etapas for delete to authenticated using (status = 'pendente');

-- ---------- modelos de fluxo iniciais ----------
with f as (
  insert into fluxos (nome) values
    ('Datas comemorativas'), ('Desativar anúncio'), ('Criação de anúncios'),
    ('Suporte / Manutenção (IA)'), ('Suporte / Manutenção (ADS)'), ('Campanha especial (ADS)')
  returning id, nome
), e(fluxo, ordem, nome, tipo) as (values
  ('Datas comemorativas',0,'Demanda / Pauta','normal'),('Datas comemorativas',1,'Design','normal'),
  ('Datas comemorativas',2,'Aprovação / Grupo de WhatsApp','aprovacao'),('Datas comemorativas',3,'Agendamento / Postagem','normal'),
  ('Datas comemorativas',4,'Confirmação no WhatsApp','normal'),('Datas comemorativas',5,'Encerrar tarefa','normal'),
  ('Desativar anúncio',0,'Solicitação do cliente','normal'),('Desativar anúncio',1,'Desativação','normal'),
  ('Desativar anúncio',2,'Confirmação no WhatsApp','normal'),('Desativar anúncio',3,'Encerrar tarefa','normal'),
  ('Criação de anúncios',0,'Listagem de veículos','normal'),('Criação de anúncios',1,'Design','normal'),
  ('Criação de anúncios',2,'Aprovação / Grupo de WhatsApp','aprovacao'),('Criação de anúncios',3,'Anúncios programados / executados','normal'),
  ('Criação de anúncios',4,'Confirmação no WhatsApp','normal'),('Criação de anúncios',5,'Encerrar tarefa','normal'),
  ('Suporte / Manutenção (IA)',0,'Demanda / Pauta','normal'),('Suporte / Manutenção (IA)',1,'Estudo / Resolução','normal'),
  ('Suporte / Manutenção (IA)',2,'Teste / Validação','normal'),('Suporte / Manutenção (IA)',3,'Confirmação no WhatsApp','normal'),
  ('Suporte / Manutenção (IA)',4,'Encerrar tarefa','normal'),
  ('Suporte / Manutenção (ADS)',0,'Demanda / Pauta','normal'),('Suporte / Manutenção (ADS)',1,'Estudo / Resolução','normal'),
  ('Suporte / Manutenção (ADS)',2,'Teste / Validação','normal'),('Suporte / Manutenção (ADS)',3,'Confirmação no WhatsApp','normal'),
  ('Suporte / Manutenção (ADS)',4,'Encerrar tarefa','normal'),
  ('Campanha especial (ADS)',0,'Demanda / Pauta','normal'),('Campanha especial (ADS)',1,'Estudo / Resolução','normal'),
  ('Campanha especial (ADS)',2,'Criativos / Design','normal'),('Campanha especial (ADS)',3,'Aprovação / Grupo de WhatsApp','aprovacao'),
  ('Campanha especial (ADS)',4,'Agendamento / Postagem','normal'),('Campanha especial (ADS)',5,'Confirmação no WhatsApp','normal'),
  ('Campanha especial (ADS)',6,'Encerrar tarefa','normal')
)
insert into fluxo_etapas (fluxo_id, ordem, nome, tipo)
select f.id, e.ordem, e.nome, e.tipo::tipo_etapa from e join f on f.nome = e.fluxo;

-- ---------- storage para logotipos e fotos ----------
insert into storage.buckets (id, name, public) values ('imagens','imagens', true) on conflict do nothing;
create policy "imagens_ler" on storage.objects for select using (bucket_id = 'imagens');
create policy "imagens_enviar" on storage.objects for insert to authenticated with check (bucket_id = 'imagens');
