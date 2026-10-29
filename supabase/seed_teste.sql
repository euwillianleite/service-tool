-- Dados de TESTE para o ambiente de homologação. Não rodar em produção.
-- Pré-requisito: ter criado no Supabase Auth os usuários gestor@teste.com e designer@teste.com (eles aparecem em `usuarios` no primeiro login
-- ou na criação, pelo trigger). Ajuste os e-mails abaixo se usar outros.

-- Chaves de API dos agentes (TESTE). Em produção gere outras: openssl rand -hex 32
update usuarios set chave_api_hash = encode(sha256('teste-claudia'::bytea),'hex'),    telefone = '+5547999990001' where nome = 'Cláudia';
update usuarios set chave_api_hash = encode(sha256('teste-anuncios'::bytea),'hex')    where nome = 'Serviço de anúncios';
update usuarios set chave_api_hash = encode(sha256('teste-desativacao'::bytea),'hex') where nome = 'Serviço de desativação';

-- Tutor da Cláudia = gestor
update usuarios set tutor_id = (select id from usuarios where email = 'gestor@teste.com') where papel = 'agente';
update usuarios set telefone = '+5547999990002', funcao = 'Gestor' where email = 'gestor@teste.com';
update usuarios set telefone = '+5547999990003', funcao = 'Design'  where email = 'designer@teste.com';

-- Clientes de teste com grupo do WhatsApp e pasta do Drive fictícios
insert into clientes (nome, contato, telefone, grupo_whatsapp_id, drive_folder_url) values
  ('Auto Sul Veículos (teste)', 'Carlos', '+5547988880001', 'grupo-teste-autosul@g.us', 'https://drive.google.com/drive/folders/TESTE-AUTOSUL'),
  ('Garagem Norte (teste)',     'Paula',  '+5547988880002', 'grupo-teste-norte@g.us',   'https://drive.google.com/drive/folders/TESTE-NORTE');

insert into cliente_produtos (cliente_id, nome, valor_centavos, cobranca)
select id, 'Gestão de anúncios', 250000, 'mensal' from clientes where nome like '%(teste)';

insert into cliente_acessos (cliente_id, tipo, url)
select id, 'meta', 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=TESTE' from clientes where nome like '%(teste)';
