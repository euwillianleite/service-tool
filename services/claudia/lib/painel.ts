/**
 * Cliente da API do painel para agentes (Cláudia e microsserviços).
 * Copie este arquivo para `lib/painel.ts` do serviço (cada serviço tem a própria cópia e evolui no próprio ritmo).
 * Variáveis: PAINEL_URL (ex.: https://painel-teste.vercel.app) e PAINEL_API_KEY (chave do agente).
 */
export type Evento = { id: number; tipo: "etapa_atribuida" | "etapa_devolvida" | "tarefa_concluida" | "aviso_tutor"; tarefa_id: string | null; etapa_id: string | null;
  payload: { tarefa_id?: string; titulo?: string; cliente_id?: string; cliente?: string; grupo_whatsapp_id?: string | null; drive_folder_url?: string | null; etapa?: string; ordem?: number;
    tipo?: "normal" | "aprovacao"; prazo?: string | null; prioridade?: string; origem?: string; referencia_externa?: string | null; dados?: Record<string, unknown>; fluxo?: string; entrega_anterior?: string | null; texto?: string; de?: string } };

export class Painel {
  constructor(private url = process.env.PAINEL_URL!, private key = process.env.PAINEL_API_KEY!) {
    if (!this.url || !this.key) throw new Error("PAINEL_URL e PAINEL_API_KEY são obrigatórias");
  }
  private async call<T = unknown>(acao: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = await fetch(`${this.url}/api/agente`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": this.key }, body: JSON.stringify({ acao, args }) });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(`painel/${acao}: ${j.erro ?? r.status}`);
    return j.resultado as T;
  }
  criarTarefa(a: { cliente_id: string; titulo: string; fluxo_id?: string; descricao?: string; prioridade?: "normal" | "alta" | "urgente"; entrega_em?: string; origem?: "whatsapp" | "servico"; referencia_externa?: string; dados?: Record<string, unknown>; links?: { rotulo?: string; url: string }[] }) { return this.call<{ tarefa_id: string }>("criar_tarefa", a); }
  concluirEtapa(tarefa_id: string, entrega_url?: string) { return this.call("concluir_etapa", { tarefa_id, entrega_url }); }
  devolverEtapa(tarefa_id: string, para: number, motivo: string) { return this.call("devolver_etapa", { tarefa_id, para, motivo }); }
  comentar(tarefa_id: string, texto: string) { return this.call("comentar", { tarefa_id, texto }); }
  atualizarDados(tarefa_id: string, dados: Record<string, unknown>) { return this.call("atualizar_dados", { tarefa_id, dados }); }
  registrarCobranca(etapa_id: string, texto?: string) { return this.call("registrar_cobranca", { etapa_id, texto }); }
  registrarObservacao(o: { conversa_id: string; mensagem_externo_id?: string; texto_mensagem: string; intencao: string; acao_sugerida: string; resposta_sugerida?: string; dados?: Record<string, unknown> }) { return this.call<{ id: number }>("registrar_observacao", o); }
  avisarTutor(texto: string, tarefa_id?: string) { return this.call("avisar_tutor", { texto, tarefa_id }); }
  tarefa(tarefa_id: string) { return this.call<{ tarefa: Record<string, unknown>; etapas: Record<string, unknown>[]; historico: Record<string, unknown>[] }>("tarefa", { tarefa_id }); }
  buscarTarefa(referencia_externa: string) { return this.call<Record<string, unknown>[]>("buscar_tarefa", { referencia_externa }); }
  minhaFila() { return this.call<Record<string, unknown>[]>("minha_fila"); }
  cobrancas() { return this.call<{ etapa_id: string; tarefa_id: string; titulo: string; cliente: string; grupo_whatsapp_id: string | null; etapa: string; prazo: string; vencida: boolean; dias_atraso: number; responsavel: string; responsavel_telefone: string | null; canal_sugerido: "grupo" | "privado"; tutor: string | null; tutor_telefone: string | null }[]>("cobrancas"); }
  travadas() { return this.call<Record<string, unknown>[]>("travadas"); }
  eventos(limite = 50) { return this.call<Evento[]>("eventos", { limite }); }
  clientes() { return this.call<{ id: string; nome: string; grupo_whatsapp_id: string | null; drive_folder_url: string | null }[]>("clientes"); }
  usuario(usuario_id: string) { return this.call<{ id: string; nome: string; telefone: string | null; email: string | null }>("usuario", { usuario_id }); }
  fluxos() { return this.call<{ id: string; nome: string; etapas: { ordem: number; nome: string; tipo: string }[] }[]>("fluxos"); }
}
