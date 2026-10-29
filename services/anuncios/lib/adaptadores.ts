/**
 * Adaptadores do serviço de anúncios. Aqui entram as integrações que JÁ EXISTEM no seu microsserviço:
 * geração de imagem, Google Drive e a API de anúncios. Em MODO_SIMULACAO=1 devolvem dados fictícios,
 * para testar o fluxo inteiro no ambiente de teste sem tocar em serviços reais.
 */
const simulacao = process.env.MODO_SIMULACAO === "1";

export async function gerarArtes(a: { veiculo: Record<string, unknown>; referencia: string; pastaCliente: string | null; ajuste?: string }): Promise<{ pastaUrl: string; arquivos: string[] }> {
  if (simulacao) {
    const base = `${a.pastaCliente ?? "https://drive.google.com/drive/folders/SIMULADO"}/${a.referencia}`;
    return { pastaUrl: base, arquivos: [`${base}/feed.png`, `${base}/story.png`, `${base}/carrossel.png`] };
  }
  // TODO: chamar o gerador de imagens já existente (usar `a.ajuste` quando for regeneração após pedido do cliente),
  //       enviar os arquivos para a pasta do cliente no Drive (GOOGLE_SERVICE_ACCOUNT_JSON) dentro de uma subpasta por veículo,
  //       tornar a subpasta "qualquer pessoa com o link pode ver" e devolver o link dela + os links dos arquivos.
  throw new Error("gerarArtes: integração real não configurada (defina MODO_SIMULACAO=1 para testar)");
}

export async function publicarAnuncio(a: { veiculo: Record<string, unknown>; referencia: string; artes: string[] }): Promise<{ id: string; url?: string }[]> {
  if (simulacao) return [{ id: `an-${a.referencia}-meta`, url: `https://facebook.com/ads/simulado/${a.referencia}` }];
  // TODO: chamar a API de anúncios já existente (criar ou atualizar os anúncios do veículo com as artes aprovadas).
  throw new Error("publicarAnuncio: integração real não configurada (defina MODO_SIMULACAO=1 para testar)");
}
