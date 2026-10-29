-- 0003 — Decisões de 29/10: arte final pelo serviço, link do Drive, cobrança por canal, Cláudia encerra, tutor da Cláudia

-- 1. Tutor: pessoa responsável por um agente (recebe avisos e itens manuais)
alter table usuarios add column if not exists tutor_id uuid references usuarios(id);

-- 2. Pasta do Drive por cliente (as artes de cada cliente ficam numa pasta compartilhada dele)
alter table clientes add column if not exists drive_folder_url text;

-- 3. Fluxo "Criação de anúncios": o serviço gera a arte final (sem etapa humana de Design) e salva no Drive;
--    a aprovação no grupo usa o link compartilhado; a Cláudia encerra informando a publicação.
do $$
declare f uuid; cl uuid; sa uuid;
begin
  select id into f from fluxos where nome = 'Criação de anúncios';
  select id into cl from usuarios where nome = 'Cláudia' and papel = 'agente';
  select id into sa from usuarios where nome = 'Serviço de anúncios' and papel = 'agente';
  delete from fluxo_etapas where fluxo_id = f;
  insert into fluxo_etapas (fluxo_id, ordem, nome, responsavel_padrao_id, dias, tipo) values
    (f, 0, 'Novo veículo identificado',          sa, 0, 'normal'),
    (f, 1, 'Artes geradas e salvas no Drive',    sa, 1, 'normal'),
    (f, 2, 'Aprovação / Grupo de WhatsApp',      cl, 1, 'aprovacao'),
    (f, 3, 'Anúncios publicados / atualizados',  sa, 1, 'normal'),
    (f, 4, 'Informar publicação no grupo',       cl, 0, 'normal');
  -- Nos demais fluxos, "Encerrar tarefa" passa a ser da Cláudia (confirma no grupo e fecha)
  update fluxo_etapas set responsavel_padrao_id = cl where nome = 'Encerrar tarefa';
end $$;

-- 4. Canal de cobrança: tarefas internas → privado do responsável; solicitações de cliente → grupo do cliente
drop view if exists cobrancas_pendentes;
create view cobrancas_pendentes as
select e.id as etapa_id, t.id as tarefa_id, t.titulo, t.prioridade, t.origem,
       c.id as cliente_id, c.nome as cliente, c.grupo_whatsapp_id,
       e.nome as etapa, e.prazo, (e.prazo < current_date) as vencida, (current_date - e.prazo) as dias_atraso,
       u.id as responsavel_id, u.nome as responsavel, u.telefone as responsavel_telefone, u.email as responsavel_email,
       case when t.origem = 'whatsapp' and c.grupo_whatsapp_id is not null then 'grupo' else 'privado' end as canal_sugerido,
       tu.nome as tutor, tu.telefone as tutor_telefone,
       e.cobrancas, e.ultima_cobranca_em
from tarefa_etapas e
join tarefas t on t.id = e.tarefa_id and t.status = 'aberta' and e.ordem = t.etapa_atual
join clientes c on c.id = t.cliente_id
join usuarios u on u.id = e.responsavel_id and u.papel in ('gestor','membro')
left join usuarios tu on tu.id = (select tutor_id from usuarios where nome = 'Cláudia' and papel = 'agente' limit 1)
where e.prazo is not null and e.prazo <= current_date + 1
  and (e.ultima_cobranca_em is null or e.ultima_cobranca_em < now() - interval '20 hours');

-- 5. Avisos ao tutor: a Cláudia (ou um serviço) registra um item manual ou um aviso geral; vira evento para o tutor
create or replace function avisar_tutor(p_texto text, p_tarefa uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_tutor uuid; v_cli uuid;
begin
  select tutor_id into v_tutor from usuarios where id = ator();
  if v_tutor is null then select tutor_id into v_tutor from usuarios where nome = 'Cláudia' and papel = 'agente'; end if;
  if v_tutor is null then raise exception 'nenhum tutor cadastrado'; end if;
  if p_tarefa is not null then select cliente_id into v_cli from tarefas where id = p_tarefa; perform registrar_historico(p_tarefa, 'avisou o tutor: ' || p_texto); end if;
  insert into eventos (tipo, tarefa_id, responsavel_id, payload)
  values ('aviso_tutor', p_tarefa, v_tutor, jsonb_build_object('texto', p_texto, 'de', (select nome from usuarios where id = ator()), 'tarefa_id', p_tarefa, 'cliente_id', v_cli));
end $$;
-- eventos.tarefa_id passa a aceitar nulo (aviso geral)
alter table eventos alter column tarefa_id drop not null;

-- 6. Etapas de agentes sem resposta: se uma etapa de agente ficar ativa por mais de 2 h, vira item manual para o tutor
create or replace view etapas_agente_travadas as
select e.id as etapa_id, t.id as tarefa_id, t.titulo, c.nome as cliente, e.nome as etapa, u.nome as agente, e.prazo,
       (select max(criado_em) from eventos ev where ev.etapa_id = e.id) as ativa_desde
from tarefa_etapas e
join tarefas t on t.id = e.tarefa_id and t.status = 'aberta' and e.ordem = t.etapa_atual
join clientes c on c.id = t.cliente_id
join usuarios u on u.id = e.responsavel_id and u.papel = 'agente'
where (select max(criado_em) from eventos ev where ev.etapa_id = e.id) < now() - interval '2 hours';

-- 7. API: ações novas
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
  when 'avisar_tutor' then perform avisar_tutor(p_args->>'texto', (p_args->>'tarefa_id')::uuid);
  when 'atualizar_dados' then  -- mescla dados livres na tarefa (ex.: links das artes no Drive)
    update tarefas set dados = dados || coalesce(p_args->'dados','{}'), atualizado_em = now() where id = (p_args->>'tarefa_id')::uuid;
    perform registrar_historico((p_args->>'tarefa_id')::uuid, 'atualizou dados da tarefa');
  when 'tarefa' then
    select jsonb_build_object('tarefa', to_jsonb(t), 'etapas', (select jsonb_agg(to_jsonb(e) order by e.ordem) from tarefa_etapas e where e.tarefa_id = t.id),
      'historico', (select jsonb_agg(to_jsonb(h) order by h.id) from tarefa_historico h where h.tarefa_id = t.id)) into v_res from tarefas_resumo t where t.id = (p_args->>'tarefa_id')::uuid;
  when 'buscar_tarefa' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into v_res from tarefas_resumo t where t.referencia_externa = p_args->>'referencia_externa' and t.status = 'aberta';
  when 'minha_fila' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into v_res from tarefas_resumo t where t.responsavel_id = v_ag.id and t.status = 'aberta';
  when 'cobrancas' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_res from cobrancas_pendentes x;
  when 'travadas' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_res from etapas_agente_travadas x;
  when 'eventos' then
    with sel as (select * from eventos where entregue_em is null and (coalesce((p_args->>'todos')::boolean,false) or responsavel_id = v_ag.id) order by id limit coalesce((p_args->>'limite')::int,50)),
         upd as (update eventos set entregue_em = now() where id in (select id from sel))
    select coalesce(jsonb_agg(to_jsonb(sel) order by id),'[]') into v_res from sel;
  when 'clientes' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'grupo_whatsapp_id',grupo_whatsapp_id,'drive_folder_url',drive_folder_url)),'[]') into v_res from clientes where ativo;
  when 'usuario' then  -- contato de uma pessoa (para cobrança no privado)
    select to_jsonb(x) into v_res from (select id, nome, telefone, email, papel from usuarios where id = (p_args->>'usuario_id')::uuid) x;
  when 'fluxos' then
    select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'etapas',(select jsonb_agg(jsonb_build_object('ordem',ordem,'nome',nome,'tipo',tipo,'responsavel_padrao_id',responsavel_padrao_id) order by ordem) from fluxo_etapas where fluxo_id = f.id))),'[]') into v_res from fluxos f where f.ativo;
  else raise exception 'ação desconhecida: %', p_acao;
  end case;
  return coalesce(v_res, '{}');
end $$;

-- 8. O evento de etapa passa a levar a pasta do Drive do cliente
create or replace function emitir_evento_etapa() returns trigger language plpgsql security definer set search_path = public as $$
declare t tarefas%rowtype; c clientes%rowtype;
begin
  if new.status = 'ativa' and (old.status is distinct from 'ativa') then
    select * into t from tarefas where id = new.tarefa_id; select * into c from clientes where id = t.cliente_id;
    insert into eventos (tipo, tarefa_id, etapa_id, responsavel_id, payload) values (
      case when new.devolucoes > coalesce(old.devolucoes,0) then 'etapa_devolvida' else 'etapa_atribuida' end, t.id, new.id, new.responsavel_id,
      jsonb_build_object('tarefa_id', t.id, 'titulo', t.titulo, 'cliente_id', c.id, 'cliente', c.nome, 'grupo_whatsapp_id', c.grupo_whatsapp_id, 'drive_folder_url', c.drive_folder_url,
        'etapa', new.nome, 'ordem', new.ordem, 'tipo', new.tipo, 'prazo', new.prazo, 'prioridade', t.prioridade, 'origem', t.origem,
        'referencia_externa', t.referencia_externa, 'dados', t.dados, 'fluxo', t.fluxo_nome,
        'entrega_anterior', (select entrega_url from tarefa_etapas where tarefa_id = t.id and ordem = new.ordem - 1)));
  end if;
  return new;
end $$;
