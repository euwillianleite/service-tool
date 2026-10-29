-- 0004 — Histórico de WhatsApp (recebidas e enviadas), para a tela Conversas e para a Cláudia ter contexto

create table if not exists wa_conversas (
  id text primary key,                 -- id do grupo (…@g.us) ou telefone (5547999990000)
  tipo text not null check (tipo in ('grupo','privado')),
  nome text,                           -- nome do grupo ou do contato, como veio da API
  cliente_id uuid references clientes(id),      -- preenchido quando o id bate com clientes.grupo_whatsapp_id
  usuario_id uuid references usuarios(id),      -- preenchido quando o telefone bate com usuarios.telefone
  provedor text not null default 'zapi',        -- zapi | meta
  ultima_mensagem_em timestamptz,
  ultima_mensagem text,
  nao_lidas int not null default 0
);

create table if not exists wa_mensagens (
  id bigserial primary key,
  conversa_id text not null references wa_conversas(id) on delete cascade,
  externo_id text unique,              -- id da mensagem no provedor (evita duplicar em reentrega de webhook)
  direcao text not null check (direcao in ('recebida','enviada')),
  de text,                             -- telefone de quem enviou (em grupo, o participante)
  de_nome text,
  texto text,
  midia_url text,
  midia_tipo text,                     -- image | video | audio | document | sticker
  status text,                         -- enviada: sent | delivered | read | failed
  enviada_por text,                    -- 'claudia' | 'painel' | 'humano' (quando alguém respondeu pelo celular)
  tarefa_id uuid references tarefas(id),
  bruto jsonb,                         -- payload original do provedor
  criado_em timestamptz not null default now()
);
create index if not exists wa_mensagens_conv_idx on wa_mensagens (conversa_id, id desc);
create index if not exists wa_conversas_ult_idx on wa_conversas (ultima_mensagem_em desc);

alter table wa_conversas enable row level security;
alter table wa_mensagens enable row level security;
create policy "ler" on wa_conversas for select to authenticated using (true);
create policy "ler" on wa_mensagens for select to authenticated using (true);
create policy "marcar_lida" on wa_conversas for update to authenticated using (true) with check (true);

-- Vincula a conversa a cliente/usuário e atualiza o resumo
create or replace function wa_registrar(p_conversa text, p_tipo text, p_nome text, p_provedor text, p_msg jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_cli uuid; v_usr uuid; v_tel text;
begin
  v_tel := regexp_replace(p_conversa, '\D', '', 'g');
  if p_tipo = 'grupo' then select id into v_cli from clientes where grupo_whatsapp_id = p_conversa;
  else select id into v_usr from usuarios where regexp_replace(coalesce(telefone,''), '\D', '', 'g') = v_tel limit 1; end if;
  insert into wa_conversas (id, tipo, nome, cliente_id, usuario_id, provedor) values (p_conversa, p_tipo, p_nome, v_cli, v_usr, p_provedor)
  on conflict (id) do update set nome = coalesce(excluded.nome, wa_conversas.nome), cliente_id = coalesce(excluded.cliente_id, wa_conversas.cliente_id), usuario_id = coalesce(excluded.usuario_id, wa_conversas.usuario_id);
  insert into wa_mensagens (conversa_id, externo_id, direcao, de, de_nome, texto, midia_url, midia_tipo, status, enviada_por, tarefa_id, bruto)
  values (p_conversa, p_msg->>'externo_id', p_msg->>'direcao', p_msg->>'de', p_msg->>'de_nome', p_msg->>'texto', p_msg->>'midia_url', p_msg->>'midia_tipo', p_msg->>'status', p_msg->>'enviada_por', (p_msg->>'tarefa_id')::uuid, p_msg->'bruto')
  on conflict (externo_id) do update set status = coalesce(excluded.status, wa_mensagens.status)
  returning id into v_id;
  update wa_conversas set ultima_mensagem_em = now(), ultima_mensagem = left(coalesce(p_msg->>'texto', '[' || coalesce(p_msg->>'midia_tipo','mídia') || ']'), 120),
    nao_lidas = case when p_msg->>'direcao' = 'recebida' then nao_lidas + 1 else nao_lidas end where id = p_conversa;
  return v_id;
end $$;

create or replace function wa_status(p_externo_id text, p_status text) returns void
language sql security definer set search_path = public as $$
  update wa_mensagens set status = p_status where externo_id = p_externo_id;
$$;
