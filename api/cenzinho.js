// Lê a página oficial do 100zinho da Sorte e devolve campanhas e ganhadores em JSON.
// A Vercel guarda a resposta por 5 minutos (s-maxage) e serve a última boa enquanto atualiza.
const ORIGEM = 'https://www.100zinhodasorte.me/';

const original = (u) => {
  if (!u) return null;
  const k = String(u).split('/').pop().split('?')[0];
  return /^\d{8}_[0-9a-f]+\.(jpe?g|png|webp)$/i.test(k) ? 'https://incs-bucket.s3.amazonaws.com/' + k : u;
};
const valor = (t) => {
  const m = String(t || '').match(/R\$\s?[\d.]+(?:,\d{2})?/);
  return m ? m[0].replace(/R\$\s?/, 'R$ ') : null;
};
const edicao = (t) => {
  const m = String(t || '').match(/([\d.]+)\s*[º°ª]?\s*edi[cç][aãoõ]/i);
  return m ? m[1].replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '') : null;
};
const nomeCurto = (n) => {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : (p[0] || '');
};
const limpa = (t) => String(t || '').replace(/\s+/g, ' ').trim();

module.exports = async (req, res) => {
  try {
    const r = await fetch(ORIGEM, { headers: { 'user-agent': 'Mozilla/5.0 (LP Cenzinho)', accept: 'text/html' } });
    if (!r.ok) throw new Error('origem ' + r.status);
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('dados não encontrados');
    const pp = (JSON.parse(m[1]).props || {}).pageProps || {};

    const campanhas = (pp.sorteios || [])
      .filter((s) => s && s.isActive !== false && !(s.status && (s.status.acabou || s.status.concluido)))
      .map((s) => ({
        titulo: limpa(s.title),
        descricao: limpa(s.descricao),
        img: original(s.img),
        url: s.url,
        status: (s.status && s.status.mensagem) || '',
        valor: valor(s.title),
        edicao: edicao(s.title),
        federal: /federal/i.test(s.title || ''),
      }))
      // REGRA: só entram as campanhas com o selo "Adquira já!" no site oficial
      .filter((c) => c.img && c.url && /adquira\s*j[aá]/i.test(c.status));

    const ganhadores = (pp.ganhadores || [])
      .map((g) => ({
        nome: nomeCurto(g.nome),
        premio: valor(g.premio && g.premio.descricao) || limpa(g.premio && g.premio.descricao),
        campanha: limpa(g.rifa && g.rifa.title),
        data: g.dataCompra || (g.rifa && g.rifa.dtsorteio) || '',
        youtube: g.youtube || null,
      }))
      .filter((g) => g.nome);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(JSON.stringify({ atualizado: new Date().toISOString(), campanhas, ganhadores }));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ erro: String((e && e.message) || e) });
  }
};
