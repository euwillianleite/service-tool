# ADS_GEST — gestão de demandas com a Cláudia e microsserviços

Um repositório, quatro deploys independentes na Vercel, um banco Supabase.

| Parte | Pasta | O que é | Leia |
|---|---|---|---|
| Painel | `apps/painel` | Next.js: kanban, clientes, fluxos, equipe, API dos agentes, crons | `apps/painel/README.md` |
| Cláudia | `services/claudia` | eventos, webhook do WhatsApp, cobrança de prazos | `docs/INTEGRACAO-AGENTES.md` |
| Serviço de anúncios | `services/anuncios` | novo veículo → artes no Drive → publicação | idem |
| Serviço de desativação | `services/desativacao` | desativa anúncios a pedido | idem |
| Gateway WhatsApp | `services/whatsapp` | recebe/envia pela Z-API e Meta, grava o histórico; tela Conversas no painel | `docs/WHATSAPP.md` |
| Banco | `supabase/` | migrações 0001 → 0005 e `seed_teste.sql` | `docs/AMBIENTES.md` |

Fase atual: **`docs/FASE-1-OBSERVACAO.md`** (painel no ar, Z-API, Cláudia observando). Depois, **`docs/AMBIENTES.md`**: como montar teste e produção, variáveis de cada projeto e o `scripts/simular.sh`.

Fluxos iniciais (editáveis no painel): Datas comemorativas · Desativar anúncio · Criação de anúncios · Suporte / Manutenção (IA) · Suporte / Manutenção (ADS) · Campanha especial (ADS).
