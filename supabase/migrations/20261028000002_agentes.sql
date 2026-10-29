-- 0002 — Agentes (Cláudia e microsserviços) como executores de etapas, API por chave, eventos e cobranças

-- 1. Agentes são linhas em `usuarios` com papel 'agente'. Não têm login no Supabase Auth,
--    então o vínculo com auth.users deixa de ser obrigatório.
-- (valor 'agente' do enum criado na migração 20261027000001_papel_agente.sql)
alter table usuarios drop constraint if exists usuarios_id_fkey;
alter table usuarios add column if not exists chave_api_hash text unique;   -- sha256 da chave; só agentes têm
alter table usuarios add column if not exists webhook_url text;            -- para onde enviar eventos (opcional)

-- 2. Quem está agindo: usuário logado (auth.uid()) ou ator definido pela API de agentes.
create or replace function ator() returns uuid language sql stable as $$
  select coalesce(auth.uid(), nullif(current_setting('app.ator', true), '')::uuid);
$$;

create or replace function eh_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = ator() and papel = 'gestor' and ativo);
$$;

create or replace function registrar_historico(p_tarefa uuid, p_texto text) returns void
language sql security definer set search_path = public as $$
  insert into tarefa_historico (tarefa_id, autor_id, texto) values (p_tarefa, ator(), p_texto);
$$;

-- 3. Campos novos
alter table clientes add column if not exists grupo_whatsapp_id text;         -- id do grupo na API de WhatsApp
alter table tarefas add column if not exists origem text not null default 'painel';  -- painel | whatsapp | servico
alter table tarefas add column if not exists referencia_externa text;          -- ex.: id do veículo no sistema de anúncios
alter table tarefas add column if not exists dados jsonb not null default '{}'; -- payload livre dos serviços (placa, modelo, link da imagem…)
create index if not exists tarefas_ref_idx on tarefas (referencia_externa);
alter table tarefa_etapas add column if not exists cobrancas smallint not null default 0;
alter table tarefa_etapas add column if not exists ultima_cobranca_em timestamptz;

-- 3b. Recria a visão para incluir as colunas novas
drop view if exists tarefas_resumo;
create view tarefas_resumo as
select t.*, e.id as etapa_id, e.nome as etapa_nome, e.tipo as etapa_tipo, e.responsavel_id, e.prazo as etapa_prazo, e.devolucoes,
       (select count(*) from tarefa_etapas x where x.tarefa_id = t.id) as total_etapas,
       (select count(*) from tarefa_etapas x where x.tarefa_id = t.id and x.status = 'concluida') as etapas_concluidas,
       coalesce(t.status = 'aberta' and (e.prazo < current_date or t.entrega_em < current_date), false) as atrasada,
       c.nome as cliente_nome, c.logo_url as cliente_logo, c.grupo_whatsapp_id, u.nome as responsavel_nome, u.foto_url as responsavel_foto, u.papel as responsavel_papel
from tarefas t
join tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual
join clientes c on c.id = t.cliente_id
left join usuarios u on u.id = e.responsavel_id;

-- 4. Funções de negócio passam a usar ator() (mesma lógica da 0001)
create or replace function criar_tarefa(
  p_cliente uuid, p_titulo text, p_fluxo uuid default null, p_descricao text default null,
  p_prioridade prioridade default 'normal', p_entrega date default null, p_produto uuid default null,
  p_etapas jsonb default null, p_links jsonb default null,
  p_origem text default 'painel', p_referencia text default null, p_dados jsonb default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_acum int := 0; r record; v_i int := 0; v_fluxo_nome text;
begin
  if ator() is null then raise exception 'não autenticado'; end if;
  select nome into v_fluxo_nome from fluxos where id = p_fluxo;
  insert into tarefas (cliente_id, titulo, fluxo_id, fluxo_nome, descricao, prioridade, entrega_em, produto_id, criado_por, origem, referencia_externa, dados)
  values (p_cliente, p_titulo, p_fluxo, v_fluxo_nome, p_descricao, p_prioridade, p_entrega, p_produto, ator(), p_origem, p_referencia, coalesce(p_dados,'{}'))
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
      values (v_id, v_i, r.nome, r.tipo, r.responsavel_padrao_id, case when r.dias > 0 then current_date + v_acum else null end,
              case when v_i = 0 then 'ativa'::status_etapa else 'pendente'::status_etapa end);
      v_i := v_i + 1;
    end loop;
  end if;
  if v_i = 0 then raise exception 'a tarefa precisa de pelo menos uma etapa'; end if;
  if p_links is not null then
    insert into tarefa_links (tarefa_id, rotulo, url) select v_id, x.rotulo, x.url from jsonb_to_recordset(p_links) as x(rotulo text, url text);
  end if;
  perform registrar_historico(v_id, 'criou a tarefa' || case when p_origem <> 'painel' then ' via ' || p_origem else '' end);
  return v_id;
end $$;

create or replace function concluir_etapa(p_tarefa uuid, p_entrega_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas%rowtype; e tarefa_etapas%rowtype; v_total int;
begin
  select * into t from tarefas where id = p_tarefa for update;
  if t.status <> 'aberta' then raise exception 'tarefa já concluída'; end if;
  select * into e from tarefa_etapas where tarefa_id = p_tarefa and ordem = t.etapa_atual;
  if not (coalesce(e.responsavel_id = ator(), false) or eh_gestor()) then raise exception 'só o responsável ou um gestor conclui esta etapa'; end if;
  update tarefa_etapas set status = 'concluida', concluida_em = now(), concluida_por = ator(), entrega_url = coalesce(nullif(p_entrega_url,''), entrega_url) where id = e.id;
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

create or replace function devolver_etapa(p_tarefa uuid, p_para smallint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas%rowtype; v_de text; v_para text;
begin
  if coalesce(trim(p_motivo),'') = '' then raise exception 'informe o motivo da devolução'; end if;
  select * into t from tarefas where id = p_tarefa for update;
  if t.status <> 'aberta' or p_para >= t.etapa_atual or p_para < 0 then raise exception 'etapa de destino inválida'; end if;
  if not exists (select 1 from tarefa_etapas where tarefa_id = p_tarefa and ordem = t.etapa_atual and (responsavel_id = ator() or eh_gestor()))
    then raise exception 'só o responsável ou um gestor devolve esta etapa'; end if;
  select nome into v_de from tarefa_etapas where tarefa_id = p_tarefa and ordem = t.etapa_atual;
  select nome into v_para from tarefa_etapas where tarefa_id = p_tarefa and ordem = p_para;
  update tarefa_etapas set status = 'pendente', concluida_em = null, concluida_por = null where tarefa_id = p_tarefa and ordem between p_para and t.etapa_atual;
  update tarefa_etapas set status = 'ativa', devolucoes = devolucoes + 1 where tarefa_id = p_tarefa and ordem = p_para;
  update tarefas set etapa_atual = p_para, atualizado_em = now() where id = p_tarefa;
  perform registrar_historico(p_tarefa, 'devolveu de "' || v_de || '" para "' || v_para || '": ' || p_motivo);
end $$;

create or replace function comentar_etapa(p_tarefa uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare v_etapa uuid;
begin
  select e.id into v_etapa from tarefas t join tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual where t.id = p_tarefa;
  if v_etapa is null then raise exception 'tarefa não encontrada'; end if;
  insert into etapa_comentarios (etapa_id, autor_id, texto) values (v_etapa, ator(), left(p_texto, 400));
end $$;

-- 5. Eventos (outbox): toda mudança de etapa ativa gera um evento; os agentes consomem por webhook ou polling.
create table if not exists eventos (
  id bigserial primary key,
  tipo text not null,            -- etapa_atribuida | tarefa_concluida | etapa_devolvida
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  etapa_id uuid,
  responsavel_id uuid,           -- quem deve agir (para roteamento ao agente certo)
  payload jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  entregue_em timestamptz        -- null = pendente
);
create index if not exists eventos_pendentes_idx on eventos (responsavel_id, id) where entregue_em is null;
alter table eventos enable row level security;
create policy "ler" on eventos for select to authenticated using (true);

create or replace function emitir_evento_etapa() returns trigger language plpgsql security definer set search_path = public as $$
declare t tarefas%rowtype; c clientes%rowtype;
begin
  if new.status = 'ativa' and (old.status is distinct from 'ativa') then
    select * into t from tarefas where id = new.tarefa_id; select * into c from clientes where id = t.cliente_id;
    insert into eventos (tipo, tarefa_id, etapa_id, responsavel_id, payload) values (
      case when new.devolucoes > coalesce(old.devolucoes,0) then 'etapa_devolvida' else 'etapa_atribuida' end, t.id, new.id, new.responsavel_id,
      jsonb_build_object('tarefa_id', t.id, 'titulo', t.titulo, 'cliente_id', c.id, 'cliente', c.nome, 'grupo_whatsapp_id', c.grupo_whatsapp_id,
        'etapa', new.nome, 'ordem', new.ordem, 'tipo', new.tipo, 'prazo', new.prazo, 'prioridade', t.prioridade,
        'referencia_externa', t.referencia_externa, 'dados', t.dados, 'fluxo', t.fluxo_nome));
  end if;
  return new;
end $$;
drop trigger if exists trg_evento_etapa on tarefa_etapas;
create trigger trg_evento_etapa after insert or update of status on tarefa_etapas for each row execute procedure emitir_evento_etapa();

create or replace function emitir_evento_tarefa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluida' and old.status <> 'concluida' then
    insert into eventos (tipo, tarefa_id, responsavel_id, payload) values ('tarefa_concluida', new.id, null,
      jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'cliente_id', new.cliente_id, 'referencia_externa', new.referencia_externa, 'dados', new.dados, 'fluxo', new.fluxo_nome));
  end if;
  return new;
end $$;
drop trigger if exists trg_evento_tarefa on tarefas;
create trigger trg_evento_tarefa after update of status on tarefas for each row execute procedure emitir_evento_tarefa();

alter table usuarios add column if not exists telefone text;

-- 6. Cobranças: etapas humanas que a Cláudia deve cobrar (vencidas, ou vencendo em 1 dia, sem cobrança nas últimas 20h)
create or replace view cobrancas_pendentes as
select e.id as etapa_id, t.id as tarefa_id, t.titulo, t.prioridade, c.id as cliente_id, c.nome as cliente, c.grupo_whatsapp_id,
       e.nome as etapa, e.prazo, (e.prazo < current_date) as vencida, (current_date - e.prazo) as dias_atraso,
       u.id as responsavel_id, u.nome as responsavel, u.email as responsavel_email, u.telefone as responsavel_telefone, e.cobrancas, e.ultima_cobranca_em
from tarefa_etapas e
join tarefas t on t.id = e.tarefa_id and t.status = 'aberta' and e.ordem = t.etapa_atual
join clientes c on c.id = t.cliente_id
join usuarios u on u.id = e.responsavel_id and u.papel in ('gestor','membro')
where e.prazo is not null and e.prazo <= current_date + 1
  and (e.ultima_cobranca_em is null or e.ultima_cobranca_em < now() - interval '20 hours');


create or replace function registrar_cobranca(p_etapa uuid, p_texto text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e tarefa_etapas%rowtype;
begin
  select * into e from tarefa_etapas where id = p_etapa;
  update tarefa_etapas set cobrancas = cobrancas + 1, ultima_cobranca_em = now() where id = p_etapa;
  perform registrar_historico(e.tarefa_id, 'cobrou ' || coalesce((select nome from usuarios where id = e.responsavel_id),'o responsável') || ' pela etapa "' || e.nome || '"' || coalesce(': ' || p_texto, ''));
end $$;

-- 7. Ponto único de entrada da API de agentes: valida a chave, define o ator e executa a ação.
create or replace function api_agente(p_chave_hash text, p_acao text, p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ag usuarios%rowtype; v_res jsonb := '{}'; v_id uuid;
begin
  select * into v_ag from usuarios where chave_api_hash = p_chave_hash and papel = 'agente' and ativo;
  if v_ag.id is null then raise exception 'chave inválida' using errcode = '28000'; end if;
  perform set_config('app.ator', v_ag.id::text, true);

  case p_acao
  when 'criar_tarefa' then
    v_id := criar_tarefa((p_args->>'cliente_id')::uuid, p_args->>'titulo', (p_args->>'fluxo_id')::uuid, p_args->>'descricao',
      coalesce((p_args->>'prioridade')::prioridade,'normal'), (p_args->>'entrega_em')::date, (p_args->>'produto_id')::uuid,
      p_args->'etapas', p_args->'links', coalesce(p_args->>'origem','servico'), p_args->>'referencia_externa', coalesce(p_args->'dados','{}'));
    v_res := jsonb_build_object('tarefa_id', v_id);
  when 'concluir_etapa' then perform concluir_etapa((p_args->>'tarefa_id')::uuid, p_args->>'entrega_url');
  when 'devolver_etapa' then perform devolver_etapa((p_args->>'tarefa_id')::uuid, (p_args->>'para')::smallint, p_args->>'motivo');
  when 'comentar' then perform comentar_etapa((p_args->>'tarefa_id')::uuid, p_args->>'texto');
  when 'registrar_cobranca' then perform registrar_cobranca((p_args->>'etapa_id')::uuid, p_args->>'texto');
  when 'tarefa' then
    select jsonb_build_object('tarefa', to_jsonb(t), 'etapas', (select jsonb_agg(to_jsonb(e) order by e.ordem) from tarefa_etapas e where e.tarefa_id = t.id),
      'historico', (select jsonb_agg(to_jsonb(h) order by h.id) from tarefa_historico h where h.tarefa_id = t.id))
    into v_res from tarefas_resumo t where t.id = (p_args->>'tarefa_id')::uuid;
  when 'buscar_tarefa' then  -- por referência externa (ex.: id do veículo)
    select coalesce(jsonb_agg(to_jsonb(t)),'[]') into v_res from tarefas_resumo t where t.referencia_externa = p_args->>'referencia_externa' and t.status = 'aberta';
  when 'minha_fila' then      -- etapas ativas atribuídas a este agente
    select coalesce(jsonb_agg(to_jsonb(t)),'[]') into v_res from tarefas_resumo t where t.responsavel_id = v_ag.id and t.status = 'aberta';
  when 'cobrancas' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_res from cobrancas_pendentes x;
  when 'eventos' then         -- pendentes para este agente (ou todos, se p_args.todos = true), e marca como entregues
    with sel as (select * from eventos where entregue_em is null and (coalesce((p_args->>'todos')::boolean,false) or responsavel_id = v_ag.id) order by id limit coalesce((p_args->>'limite')::int,50)),
         upd as (update eventos set entregue_em = now() where id in (select id from sel))
    select coalesce(jsonb_agg(to_jsonb(sel) order by id),'[]') into v_res from sel;
  when 'clientes' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'grupo_whatsapp_id',grupo_whatsapp_id)),'[]') into v_res from clientes where ativo;
  when 'fluxos' then
    select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'etapas',(select jsonb_agg(jsonb_build_object('ordem',ordem,'nome',nome,'tipo',tipo,'responsavel_padrao_id',responsavel_padrao_id) order by ordem) from fluxo_etapas where fluxo_id = f.id))),'[]') into v_res from fluxos f where f.ativo;
  else raise exception 'ação desconhecida: %', p_acao;
  end case;
  return coalesce(v_res, '{}');
end $$;

-- 8. Agentes iniciais. Troque as chaves antes de usar em produção (README explica como gerar e salvar o hash).
insert into usuarios (id, nome, funcao, papel) values
  (gen_random_uuid(), 'Cláudia', 'Agente de atendimento (WhatsApp)', 'agente'),
  (gen_random_uuid(), 'Serviço de anúncios', 'Gera a imagem e publica o anúncio', 'agente'),
  (gen_random_uuid(), 'Serviço de desativação', 'Desativa anúncios a pedido', 'agente')
on conflict do nothing;

-- 9. Responsável padrão das etapas automatizadas nos modelos
update fluxo_etapas fe set responsavel_padrao_id = u.id from usuarios u
where u.nome = 'Cláudia' and fe.nome in ('Aprovação / Grupo de WhatsApp', 'Confirmação no WhatsApp', 'Solicitação do cliente');
update fluxo_etapas fe set responsavel_padrao_id = u.id from usuarios u, fluxos f
where u.nome = 'Serviço de anúncios' and fe.fluxo_id = f.id and f.nome = 'Criação de anúncios' and fe.nome in ('Listagem de veículos', 'Anúncios programados / executados');
update fluxo_etapas fe set responsavel_padrao_id = u.id from usuarios u, fluxos f
where u.nome = 'Serviço de desativação' and fe.fluxo_id = f.id and f.nome = 'Desativar anúncio' and fe.nome = 'Desativação';
