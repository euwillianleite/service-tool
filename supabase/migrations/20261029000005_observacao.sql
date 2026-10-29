-- 0005 — Modo observação da Cláudia: o que ela faria com cada mensagem, sem fazer

create table if not exists claudia_observacoes (
  id bigserial primary key,
  conversa_id text not null,
  mensagem_externo_id text,
  texto_mensagem text,
  intencao text not null,            -- aprovado | ajuste | demanda | nada | …
  acao_sugerida text not null,       -- frase legível: "Criaria tarefa 'Desativar anúncio: …' para Auto Sul"
  resposta_sugerida text,            -- o que ela responderia no grupo
  dados jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create index if not exists claudia_obs_conv_idx on claudia_observacoes (conversa_id, id desc);
alter table claudia_observacoes enable row level security;
create policy "ler" on claudia_observacoes for select to authenticated using (true);

create or replace function registrar_observacao(p jsonb) returns bigint
language sql security definer set search_path = public as $$
  insert into claudia_observacoes (conversa_id, mensagem_externo_id, texto_mensagem, intencao, acao_sugerida, resposta_sugerida, dados)
  values (p->>'conversa_id', p->>'mensagem_externo_id', p->>'texto_mensagem', coalesce(p->>'intencao','nada'), coalesce(p->>'acao_sugerida','—'), p->>'resposta_sugerida', coalesce(p->'dados','{}'))
  returning id;
$$;

-- API: nova ação
create or replace function api_agente(p_chave_hash text, p_acao text, p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ag usuarios%rowtype; v_res jsonb := '{}'; v_id uuid; v_n bigint;
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
  when 'registrar_observacao' then v_n := registrar_observacao(p_args); v_res := jsonb_build_object('id', v_n);
  when 'atualizar_dados' then
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
  when 'usuario' then select to_jsonb(x) into v_res from (select id, nome, telefone, email, papel from usuarios where id = (p_args->>'usuario_id')::uuid) x;
  when 'fluxos' then
    select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'etapas',(select jsonb_agg(jsonb_build_object('ordem',ordem,'nome',nome,'tipo',tipo,'responsavel_padrao_id',responsavel_padrao_id) order by ordem) from fluxo_etapas where fluxo_id = f.id))),'[]') into v_res from fluxos f where f.ativo;
  else raise exception 'ação desconhecida: %', p_acao;
  end case;
  return coalesce(v_res, '{}');
end $$;
