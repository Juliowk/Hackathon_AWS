/* Pauta · dados e utilitários compartilhados pelas telas do protótipo */
const H = 3600e3, D = 24 * H;
const agora = Date.now();
// Prazo em hora cheia: dias a partir de hoje + hora do dia
const dia = (dias, hora) => { const d = new Date(agora); d.setDate(d.getDate() + dias); d.setHours(hora, 0, 0, 0); return d.toISOString(); };
const horaCheia = (horas) => { const d = new Date(agora + horas * H); d.setMinutes(0, 0, 0); return d.toISOString(); };

const usuarios = [
  { id: "g1", nome: "Roberto Lima", papel: "gestor", cargo: "Secretário de Obras" },
  { id: "u1", nome: "Carlos Mendes", papel: "funcionario", cargo: "Engenheiro civil" },
  { id: "u2", nome: "Ana Souza", papel: "funcionario", cargo: "Técnica de planejamento" },
  { id: "u3", nome: "Bruno Alves", papel: "funcionario", cargo: "Fiscal de obras" },
];
const equipe = usuarios.filter(u => u.papel === "funcionario");

// Dados de exemplo, com prazos relativos a agora
const tarefasExemplo = [
  { id: 1, titulo: "Relatório de obras da regional norte", descricao: "Consolidar o andamento das obras da regional norte para a reunião de secretariado.", responsavelId: "u1", prazo: dia(4, 18), urgencia: "alta", status: "andamento", origem: "whatsapp" },
  { id: 2, titulo: "Levantamento de vias sem iluminação", descricao: "Mapear ruas sem iluminação pública no bairro Centro.", responsavelId: "u2", prazo: dia(-2, 18), urgencia: "media", status: "andamento", origem: "web" },
  { id: 3, titulo: "Ofício para a Secretaria de Saúde", descricao: "Responder sobre a reforma da UBS Vila Nova.", responsavelId: "u3", prazo: dia(-4, 18), urgencia: "", status: "concluida", concluidaEm: dia(-5, 14), origem: "web" },
  { id: 4, titulo: "Vistoria na ponte do córrego Fundo", descricao: "Registrar fotos e laudo preliminar.", responsavelId: "u1", prazo: horaCheia(3), urgencia: "alta", status: "aberta", origem: "whatsapp" },
  { id: 5, titulo: "Planilha de custos de pavimentação", descricao: "Atualizar valores com a tabela SINAPI de outubro.", responsavelId: "u2", prazo: dia(1, 11), urgencia: "baixa", status: "andamento", origem: "web" },
  { id: 6, titulo: "Cronograma de tapa-buracos", descricao: "Definir roteiro das equipes para novembro.", responsavelId: "u3", prazo: dia(-1, 12), urgencia: "media", status: "aberta", origem: "whatsapp" },
  { id: 7, titulo: "Parecer sobre licitação 014/2026", descricao: "Revisar documentação das três empresas habilitadas.", responsavelId: "u1", prazo: dia(-6, 18), urgencia: "", status: "concluida", concluidaEm: dia(-7, 15), origem: "web" },
  { id: 8, titulo: "Resposta à ouvidoria, protocolo 3321", descricao: "Morador relata calçada danificada na Rua das Flores.", responsavelId: "u2", prazo: dia(-3, 18), urgencia: "", status: "concluida", concluidaEm: dia(-4, 10), origem: "whatsapp" },
  { id: 9, titulo: "Inventário de máquinas do pátio", descricao: "Conferir estado e horas de uso das retroescavadeiras.", responsavelId: "u3", prazo: dia(-8, 18), urgencia: "baixa", status: "concluida", concluidaEm: dia(-7, 9), origem: "web" },
  { id: 10, titulo: "Apresentação para a Câmara", descricao: "Slides sobre o plano de drenagem 2027.", responsavelId: "u1", prazo: dia(6, 9), urgencia: "media", status: "aberta", origem: "web" },
  { id: 11, titulo: "Relatório mensal da frota", descricao: "Consumo de combustível e manutenções de outubro.", responsavelId: "u2", prazo: dia(2, 12), urgencia: "", status: "andamento", origem: "web" },
  { id: 12, titulo: "Notificação de obra irregular", descricao: "Lote 14 da Rua Ipê, sem alvará.", responsavelId: "u3", prazo: dia(2, 17), urgencia: "alta", status: "aberta", origem: "whatsapp" },
  { id: 13, titulo: "Reunião com associação de moradores", descricao: "Apresentar cronograma de drenagem do Jardim Sul.", responsavelId: "u1", prazo: dia(3, 10), urgencia: "media", status: "aberta", origem: "whatsapp" },
  { id: 14, titulo: "Medição da obra da creche municipal", descricao: "Conferir boletim de medição da construtora.", responsavelId: "u3", prazo: dia(-10, 18), urgencia: "", status: "concluida", concluidaEm: dia(-9, 16), origem: "web" },
  { id: 15, titulo: "Atualizar portal da transparência", descricao: "Publicar contratos de setembro.", responsavelId: "u2", prazo: dia(-9, 18), urgencia: "baixa", status: "concluida", concluidaEm: dia(-9, 11), origem: "web" },
];
// Criação de exemplo: 5 dias antes do prazo, nunca depois de agora nem da conclusão
tarefasExemplo.forEach(t => {
  const d = new Date(t.prazo); d.setDate(d.getDate() - 5); d.setHours(9, 0, 0, 0);
  const limite = Math.min(agora - 2 * H, t.concluidaEm ? new Date(t.concluidaEm) - 2 * D : Infinity);
  t.criadaEm = new Date(Math.min(d, limite)).toISOString();
});


const atrasada = (t) => t.status !== "concluida" && new Date(t.prazo) < Date.now();
const noPrazo = (t) => t.status === "concluida" && new Date(t.concluidaEm) <= new Date(t.prazo);
const nomeDe = (id) => usuarios.find(e => e.id === id)?.nome ?? "—";
const primeiroNome = (id) => nomeDe(id).split(" ")[0];
const nomeCurto = (nome) => { const [a, b] = nome.split(" "); return b ? `${a} ${b[0]}.` : a; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const porPrazo = (a, b) => (a.status === "concluida") - (b.status === "concluida") || new Date(a.prazo) - new Date(b.prazo);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtHoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const fmtDiaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

const STATUS = { aberta: "Aberta", andamento: "Em andamento", concluida: "Concluída" };
const URG = { baixa: "Baixa", media: "Média", alta: "Alta" };

function statusTag(t) {
  if (atrasada(t)) return `<span class="tag st-atrasada">Atrasada</span>`;
  return `<span class="tag st-${t.status}">${STATUS[t.status]}</span>`;
}
function urgTag(t) {
  return t.urgencia ? `<span class="urg u-${t.urgencia}"><i></i>${URG[t.urgencia]}</span>` : `<span class="origem">—</span>`;
}
function prazoTexto(t) {
  const d = new Date(t.prazo);
  const dif = d - Date.now();
  if (t.status !== "concluida" && dif > 0 && dif < 2 * D) {
    const hoje = new Date().toDateString() === d.toDateString();
    return `${hoje ? "hoje" : "amanhã"}, ${fmtHora.format(d)}`;
  }
  return fmtData.format(d);
}
function filtrar(lista, filtro) {
  if (filtro === "todas") return lista;
  if (filtro === "atrasada") return lista.filter(atrasada);
  if (filtro === "noprazo") return lista.filter(noPrazo);
  return lista.filter(t => t.status === filtro && !atrasada(t));
}

function resumoDe(lista) {
  const concl = lista.filter(t => t.status === "concluida");
  const ok = concl.filter(noPrazo).length;
  return {
    total: lista.length,
    noPrazo: ok,
    comAtraso: concl.length - ok,
    emAberto: lista.filter(t => t.status !== "concluida" && !atrasada(t)).length,
    atrasadas: lista.filter(atrasada).length,
    taxa: concl.length ? Math.round(ok / concl.length * 100) : null,
    concluidas: concl.length,
  };
}

// Persistência local: gestor e funcionário veem as mesmas tarefas, mesmo em abas diferentes
const CHAVE = "pauta:tarefas:v1";
function carregarTarefas() {
  try { const s = localStorage.getItem(CHAVE); if (s) return JSON.parse(s); } catch (e) {}
  return tarefasExemplo;
}
function salvarTarefas() {
  try { localStorage.setItem(CHAVE, JSON.stringify(tarefas)); } catch (e) {}
}
function aoMudarTarefas(fn) {
  window.addEventListener("storage", (ev) => { if (ev.key === CHAVE) { tarefas = carregarTarefas(); fn(); } });
}
let tarefas = carregarTarefas();

// Faixa de indicadores (Abertas, Em andamento, Concluídas, Atrasadas, Cumprimento)
function kpisHTML(lista, ativo, dica) {
  const r = resumoDe(lista);
  const itens = [
    { f: "aberta", k: "Abertas", v: filtrar(lista, "aberta").length },
    { f: "andamento", k: "Em andamento", v: filtrar(lista, "andamento").length },
    { f: "concluida", k: "Concluídas", v: r.concluidas },
    { f: "atrasada", k: "Atrasadas", v: r.atrasadas, cor: "var(--status-atrasada)" },
    { f: "noprazo", k: "Cumprimento de prazo", v: (r.taxa ?? 0) + "%", s: `${r.noPrazo} de ${r.concluidas} no prazo`, cor: "var(--positivo)" },
  ];
  return itens.map(i => `
    <button class="kpi" data-f="${i.f}" aria-pressed="${ativo === i.f}" title="${dica}">
      <span class="k">${i.k}</span>
      <span class="v" ${i.cor ? `style="color:${i.cor}"` : ""}>${i.v}</span>
      ${i.s ? `<span class="s">${i.s}</span>` : ""}
    </button>`).join("");
}
