"use strict";

/* Pauta · demo visual
   Protótipo do app (gestor, funcionário, chat estilo WhatsApp e notificações) com um painel
   que mostra cada chamada de ferramenta MCP. Tudo roda no navegador e os dados ficam no
   localStorage. No produto, quem interpreta as mensagens é o modelo no Amazon Bedrock; aqui
   um intérprete local de regras faz esse papel e chama as mesmas ferramentas. */

/* ---------- Equipe e constantes ---------- */

const USUARIOS = [
  { id: "u-marina", nome: "Marina Duarte", papel: "gestor", cargo: "Secretária Municipal de Obras" },
  { id: "u-carlos", nome: "Carlos Silva", papel: "funcionario", gestorId: "u-marina", cargo: "Engenheiro civil" },
  { id: "u-beatriz", nome: "Beatriz Lima", papel: "funcionario", gestorId: "u-marina", cargo: "Fiscal de obras" },
  { id: "u-rafael", nome: "Rafael Souza", papel: "funcionario", gestorId: "u-marina", cargo: "Técnico administrativo" },
];

const MINUTO = 60e3;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ROTULO_STATUS = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída" };
const ROTULO_URGENCIA = { baixa: "baixa", media: "média", alta: "alta" };
const PROXIMOS = { aberta: ["em_andamento", "concluida"], em_andamento: ["concluida"], concluida: [] };
const ALERTAS = ["vespera", "dia_do_prazo", "atrasada"];
const PARADAS = new Set(["tarefa", "tarefas", "das", "dos", "para", "com", "que", "uma", "pela", "pelo"]);
const CHAVE = "pauta-demo-v1";

const usuarioPorId = (id) => USUARIOS.find((u) => u.id === id);
const equipeDe = (gestorId) => USUARIOS.filter((u) => u.gestorId === gestorId);
const nomes = (lista) => lista.map((u) => u.nome).join(", ");

/* ---------- Texto ---------- */

// Minúsculas e sem acentos, com o mesmo comprimento do texto em NFC: os índices batem com o original.
const alinhado = (s) => s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const normalizar = (s) => alinhado(String(s ?? "")).replace(/[^a-z0-9]+/g, " ").trim();
const palavras = (s) => normalizar(s).split(" ").filter(Boolean);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Datas ---------- */

const doisDigitos = (n) => String(n).padStart(2, "0");
const hora = (d) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diasEntre = (a, b) => Math.round((inicioDoDia(b) - inicioDoDia(a)) / DIA);
const ehFimDoDia = (d) => d.getHours() === 23 && d.getMinutes() === 59;

function somarDias(d, dias) {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

// "Até sexta" vale até o fim do dia: a tarefa só fica atrasada depois disso.
function comHora(dia, h, m) {
  const r = new Date(dia);
  if (h === undefined) r.setHours(23, 59, 0, 0);
  else r.setHours(Number(h), Number(m ?? 0), 0, 0);
  return Number(h ?? 0) > 23 || Number(m ?? 0) > 59 ? null : r;
}

function formatarPrazo(d) {
  const texto = `${DIAS_SEMANA[d.getDay()]}, ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
  return ehFimDoDia(d) ? texto : `${texto} às ${hora(d)}`;
}

function descreverVencimento(prazo, agora) {
  const restante = prazo - agora;
  if (restante < HORA) return `em ${Math.max(1, Math.round(restante / MINUTO))} min (às ${hora(prazo)})`;
  const sufixo = ehFimDoDia(prazo) ? "" : ` às ${hora(prazo)}`;
  const dias = diasEntre(agora, prazo);
  if (dias === 0) return `hoje${sufixo}`;
  if (dias === 1) return `amanhã${sufixo}`;
  return formatarPrazo(prazo);
}

const formatarMomento = (d) => `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} ${hora(d)}`;

const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30 };
const DIA_DA_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const HORA_OPCIONAL = String.raw`(?:\s*(?:as\s+|a\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2})))?`;
const PREFIXO = String.raw`\b(?:(?:ate|para|pra|no|na|em)\s+)?(?:(?:o|a)\s+)?`;

// Cada padrão procura um prazo dentro da frase e devolve a data correspondente.
const PADROES_PRAZO = [
  [
    new RegExp(String.raw`\b(?:em|daqui a|dentro de)\s+(\d+|${Object.keys(NUMEROS).join("|")})\s*(minutos?|min|horas?|h|dias?|semanas?)\b`),
    (m, agora) => {
      const quantidade = NUMEROS[m[1]] ?? Number(m[1]);
      if (m[2].startsWith("min")) return new Date(agora.getTime() + quantidade * MINUTO);
      if (m[2].startsWith("h")) return new Date(agora.getTime() + quantidade * HORA);
      return comHora(somarDias(agora, m[2].startsWith("semana") ? 7 * quantidade : quantidade));
    },
  ],
  [/\b(?:em|daqui a)\s+meia hora\b/, (m, agora) => new Date(agora.getTime() + 30 * MINUTO)],
  [
    new RegExp(PREFIXO + String.raw`(depois de amanha|amanha|hoje)\b` + HORA_OPCIONAL),
    (m, agora) => comHora(somarDias(agora, { hoje: 0, amanha: 1, "depois de amanha": 2 }[m[1]]), m[2], m[3] ?? m[4]),
  ],
  [
    new RegExp(PREFIXO + String.raw`(?:proxim[ao]\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira|\s+feira)?(?:\s+que vem)?\b` + HORA_OPCIONAL),
    (m, agora) => {
      // Sempre a próxima ocorrência: "até segunda" dito numa segunda é a da semana que vem.
      const dias = ((DIA_DA_SEMANA[m[1]] - agora.getDay() + 6) % 7) + 1;
      return comHora(somarDias(agora, dias), m[2], m[3] ?? m[4]);
    },
  ],
  [
    new RegExp(PREFIXO + String.raw`(?:dia\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?` + HORA_OPCIONAL),
    (m, agora) => {
      const dia = Number(m[1]);
      const mes = Number(m[2]) - 1;
      let ano = m[3] ? Number(m[3]) + (m[3].length === 2 ? 2000 : 0) : agora.getFullYear();
      if (!m[3] && new Date(ano, mes, dia) < inicioDoDia(agora)) ano += 1;
      const data = new Date(ano, mes, dia);
      return data.getMonth() === mes ? comHora(data, m[4], m[5] ?? m[6]) : null;
    },
  ],
  [
    new RegExp(String.raw`\b(?:ate|para|pra)\s+(?:o\s+)?dia\s+(\d{1,2})\b` + HORA_OPCIONAL),
    (m, agora) => {
      const dia = Number(m[1]);
      let data = new Date(agora.getFullYear(), agora.getMonth(), dia);
      if (data < inicioDoDia(agora)) data = new Date(agora.getFullYear(), agora.getMonth() + 1, dia);
      return data.getDate() === dia ? comHora(data, m[2], m[3] ?? m[4]) : null;
    },
  ],
  [/\b(?:ate|as)\s+(\d{1,2})(?:h(\d{2})?|:(\d{2}))/, (m, agora) => comHora(agora, m[1], m[2] ?? m[3])],
];

/** Procura um prazo dentro da frase. Devolve a data e onde o trecho está no texto. */
function encontrarPrazo(texto, agora = new Date()) {
  const a = alinhado(texto);
  for (const [padrao, calcular] of PADROES_PRAZO) {
    const m = padrao.exec(a);
    if (!m) continue;
    const data = calcular(m, agora);
    if (data && !Number.isNaN(data.getTime())) return { data, inicio: m.index, fim: m.index + m[0].length };
  }
  return null;
}

/** Prazo como o gestor falou ("sexta", "amanhã 17h", "em 2 minutos") ou em ISO. */
function interpretarPrazo(texto, agora = new Date()) {
  const bruto = String(texto ?? "").trim().normalize("NFC");
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    const [ano, mes, dia] = bruto.split("-").map(Number);
    return comHora(new Date(ano, mes - 1, dia));
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(bruto)) {
    const data = new Date(bruto);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  return encontrarPrazo(bruto, agora)?.data ?? null;
}

/* ---------- Estado (localStorage, compartilhado entre abas) ---------- */

function novoId(prefixo) {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function dadosIniciais(agora = new Date()) {
  const quando = (dias, h = 23, m = 59) => comHora(somarDias(agora, dias), h, m).toISOString();
  const tarefa = (id, titulo, descricao, responsavelId, prazo, status, urgencia, criadaEm, concluidaEm = null) => ({
    id, titulo, descricao, responsavelId, gestorId: "u-marina", prazo, status, urgencia, criadaEm, concluidaEm,
    atrasada: false, alertasEnviados: [], origem: "web",
  });
  return {
    tarefas: [
      tarefa("ex1", "Vistoria da ponte do Rio Claro", "Vistoriar a estrutura e fotografar as trincas apontadas pela Defesa Civil.", "u-carlos", quando(-1), "aberta", "alta", quando(-5, 10, 0)),
      tarefa("ex2", "Orçamento da reforma da Escola Monteiro Lobato", "Levantar três orçamentos para telhado e pintura.", "u-rafael", quando(1), "em_andamento", "media", quando(-3, 9, 0)),
      tarefa("ex3", "Levantamento de buracos na Avenida Central", "Mapear os buracos entre os números 100 e 900.", "u-beatriz", quando(-3), "concluida", null, quando(-7, 9, 0), quando(-4, 16, 30)),
      tarefa("ex4", "Atualizar planilha de contratos de manutenção", "Incluir os aditivos assinados em setembro.", "u-beatriz", quando(-6), "concluida", "baixa", quando(-10, 9, 0), quando(-5, 11, 0)),
      tarefa("ex5", "Agendar reunião com a Defesa Civil", "Pauta: plano de chuvas para o verão.", "u-rafael", quando(3), "aberta", null, quando(-1, 15, 0)),
      tarefa("ex6", "Relatório de medições da obra da UBS", "Consolidar as medições de outubro.", "u-carlos", quando(-2), "concluida", "media", quando(-6, 9, 0), quando(-3, 17, 0)),
    ],
    notificacoes: [],
    rascunhos: {},
    conversas: {},
    mcp: [],
    seqMcp: 0,
  };
}

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return JSON.parse(bruto);
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): a demo segue só em memória.
  }
  return dadosIniciais();
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // Idem: sem armazenamento, nada a fazer.
  }
}

let estado = carregar();

/* ---------- Regras de negócio ---------- */

class ErroPauta extends Error {}

const vencida = (t, agora) => t.status !== "concluida" && agora > new Date(t.prazo);
const concluidaComAtraso = (t) => Boolean(t.concluidaEm) && new Date(t.concluidaEm) > new Date(t.prazo);

function resolverPessoa(referencia, candidatos, onde = "na equipe") {
  const alvo = normalizar(referencia);
  if (!alvo) throw new ErroPauta(`Para quem é a tarefa? Pessoas ${onde}: ${nomes(candidatos)}.`);
  const exatos = candidatos.filter((u) => u.id === referencia || normalizar(u.nome) === alvo);
  if (exatos.length === 1) return exatos[0];
  const termos = alvo.split(" ");
  const achados = candidatos.filter((u) => {
    const partes = palavras(u.nome);
    return termos.every((termo) => partes.some((p) => p.startsWith(termo)));
  });
  if (achados.length === 1) return achados[0];
  if (!achados.length) throw new ErroPauta(`Não encontrei "${referencia}" ${onde}. Pessoas: ${nomes(candidatos)}.`);
  // Nunca escolhe por conta própria (seção 11, item 4).
  throw new ErroPauta(`Há mais de uma pessoa chamada "${referencia}" ${onde}: ${nomes(achados)}. Qual delas?`);
}

function identificar(referencia, papel) {
  const usuario = resolverPessoa(referencia, USUARIOS, "entre os usuários");
  if (papel && usuario.papel !== papel) {
    throw new ErroPauta(`Esta ação é do ${papel === "gestor" ? "gestor" : "funcionário"}, e ${usuario.nome} não tem esse papel.`);
  }
  return usuario;
}

function notificar(usuarioId, texto, tipo, tarefaId, agora = new Date()) {
  estado.notificacoes.push({ id: novoId("n"), usuarioId, texto, tipo, tarefaId, criadaEm: agora.toISOString(), lida: false });
}

function alertaDevido(tarefa, agora) {
  const prazo = new Date(tarefa.prazo);
  const restante = prazo - agora;
  if (restante < 0) return "atrasada";
  // Tarefa de demonstração (prazo em minutos): os lembretes também vêm em minutos.
  if (prazo - new Date(tarefa.criadaEm) < HORA) {
    if (restante <= MINUTO) return "dia_do_prazo";
    if (restante <= 2 * MINUTO) return "vespera";
    return null;
  }
  const dias = diasEntre(agora, prazo);
  return dias === 0 ? "dia_do_prazo" : dias === 1 ? "vespera" : null;
}

function resumoTarefa(t, agora = new Date()) {
  const prazo = new Date(t.prazo);
  return {
    tarefaId: t.id,
    titulo: t.titulo,
    responsavel: usuarioPorId(t.responsavelId)?.nome,
    status: t.status,
    atrasada: vencida(t, agora) || concluidaComAtraso(t),
    prazo: t.prazo,
    prazoFormatado: formatarPrazo(prazo),
    urgencia: t.urgencia,
    origem: t.origem,
  };
}

function linhaTarefa(t, agora, comResponsavel) {
  const partes = [`"${t.titulo}"`];
  if (comResponsavel) partes.push(usuarioPorId(t.responsavelId)?.nome);
  partes.push(ROTULO_STATUS[t.status], `prazo ${formatarPrazo(new Date(t.prazo))}`);
  if (vencida(t, agora)) partes.push("ATRASADA");
  if (t.urgencia) partes.push(`urgência ${ROTULO_URGENCIA[t.urgencia]}`);
  return `• ${partes.join(" · ")}`;
}

function desempenho(tarefas, agora) {
  const noPrazo = tarefas.filter((t) => t.status === "concluida" && !concluidaComAtraso(t)).length;
  const comAtraso = tarefas.filter((t) => t.status === "concluida" && concluidaComAtraso(t)).length;
  const pendentes = tarefas.filter((t) => t.status !== "concluida").length;
  const atrasadas = tarefas.filter((t) => vencida(t, agora)).length;
  // Taxa de cumprimento: entregas no prazo sobre tudo o que já tem desfecho de prazo.
  const base = noPrazo + comAtraso + atrasadas;
  return { concluidasNoPrazo: noPrazo, concluidasComAtraso: comAtraso, pendentes, atrasadas, taxaCumprimento: base ? noPrazo / base : null };
}

const porcentagem = (taxa) => (taxa === null ? "sem dados" : `${Math.round(taxa * 100)}%`);

const FILTROS = {
  pendentes: (t) => t.status !== "concluida",
  abertas: (t) => t.status === "aberta",
  em_andamento: (t) => t.status === "em_andamento",
  concluidas: (t) => t.status === "concluida",
  atrasadas: (t, agora) => vencida(t, agora),
  vencem_24h: (t, agora) => t.status !== "concluida" && new Date(t.prazo) >= agora && new Date(t.prazo) - agora <= DIA,
  todas: () => true,
};
const DESCRICAO_FILTRO = {
  pendentes: "pendentes", abertas: "abertas", em_andamento: "em andamento", concluidas: "concluídas",
  atrasadas: "atrasadas", vencem_24h: "que vencem nas próximas 24 h", todas: "",
};

function encontrarTarefa(referencia, tarefas, novoStatus) {
  const exata = tarefas.find((t) => t.id === referencia);
  if (exata) return exata;
  const pendentes = tarefas.filter((t) => t.status !== "concluida");
  const termos = palavras(referencia).filter((p) => p.length >= 3 && !PARADAS.has(p));
  // Prefixo ou mesmo radical de 5 letras: "revisão" encontra "revisar", "relat" encontra "relatório".
  const casa = (termo, palavra) => palavra.startsWith(termo) || (termo.length >= 5 && palavra.slice(0, 5) === termo.slice(0, 5));
  let achadas = termos.length
    ? pendentes.filter((t) => {
        const doTitulo = palavras(t.titulo);
        return termos.every((termo) => doTitulo.some((p) => casa(termo, p)));
      })
    : pendentes;
  if (achadas.length > 1) {
    const possiveis = achadas.filter((t) => PROXIMOS[t.status].includes(novoStatus));
    if (possiveis.length) achadas = possiveis;
  }
  if (achadas.length === 1) return achadas[0];
  if (!achadas.length) {
    const lista = pendentes.map((t) => `"${t.titulo}"`).join(", ");
    throw new ErroPauta(lista ? `Não encontrei tarefa pendente com "${referencia}". Suas pendentes: ${lista}.` : "Você não tem tarefas pendentes.");
  }
  throw new ErroPauta(`Qual delas? ${achadas.map((t) => `"${t.titulo}"`).join(", ")}.`);
}

/* ---------- Ferramentas MCP (o "servidor" do Pauta) ---------- */

const FERRAMENTAS = {
  contexto: {
    descricao: "Data e hora atuais, quem está usando e a equipe. O modelo usa para resolver datas relativas.",
    executar({ usuario }) {
      const agora = new Date();
      const u = identificar(usuario);
      const equipe = u.papel === "gestor" ? equipeDe(u.id).map((f) => f.nome) : undefined;
      return {
        mensagem: `Hoje é ${DIAS_SEMANA[agora.getDay()]}, ${formatarMomento(agora)}. Usuário: ${u.nome} (${u.papel}).`,
        agora: agora.toISOString(), usuario: u.nome, papel: u.papel, equipe,
      };
    },
  },
  delegar_tarefa: {
    descricao: "Prepara a tarefa e devolve a confirmação para o gestor. Não cria nada: a IA confirma antes de criar.",
    executar({ usuario, titulo, descricao, responsavel, prazo, urgencia, origem = "chat" }) {
      const gestor = identificar(usuario, "gestor");
      const tituloLimpo = String(titulo ?? "").trim();
      if (!tituloLimpo) throw new ErroPauta("Qual é a tarefa? Faltou o título.");
      const pessoa = resolverPessoa(responsavel, equipeDe(gestor.id));
      const agora = new Date();
      const quando = interpretarPrazo(prazo, agora);
      if (!quando) throw new ErroPauta('Qual é o prazo? Diga, por exemplo, "até sexta", "amanhã às 17h" ou "em 2 minutos".');
      if (quando <= agora) throw new ErroPauta(`O prazo (${formatarPrazo(quando)}) já passou. Informe um prazo futuro.`);
      const rascunho = {
        titulo: tituloLimpo, descricao: String(descricao ?? "").trim() || tituloLimpo, responsavelId: pessoa.id,
        prazo: quando.toISOString(), urgencia: urgencia || null, origem,
      };
      estado.rascunhos[gestor.id] = rascunho;
      const urg = rascunho.urgencia ? ` Urgência: ${ROTULO_URGENCIA[rascunho.urgencia]}.` : "";
      return {
        mensagem: `Tarefa para ${pessoa.nome}: ${tituloLimpo}. Prazo: ${formatarPrazo(quando)}.${urg} Confirma?`,
        rascunho: { ...rascunho, responsavel: pessoa.nome, prazoFormatado: formatarPrazo(quando) },
      };
    },
  },
  confirmar_tarefa: {
    descricao: "Cria a tarefa do rascunho depois do \"sim\" do gestor e avisa o funcionário. Com confirmar=false, descarta.",
    executar({ usuario, confirmar = true }) {
      const gestor = identificar(usuario, "gestor");
      const rascunho = estado.rascunhos[gestor.id];
      if (!rascunho) throw new ErroPauta("Não há tarefa aguardando confirmação.");
      delete estado.rascunhos[gestor.id];
      if (!confirmar) return { mensagem: "Tudo bem, descartei o rascunho. Nenhuma tarefa foi criada." };
      const agora = new Date();
      const prazo = new Date(rascunho.prazo);
      if (prazo <= agora) throw new ErroPauta("O prazo desse rascunho já passou. Mande a tarefa de novo com outro prazo.");
      const pessoa = usuarioPorId(rascunho.responsavelId);
      const tarefa = {
        id: novoId("t"), titulo: rascunho.titulo, descricao: rascunho.descricao, responsavelId: pessoa.id,
        gestorId: gestor.id, prazo: rascunho.prazo, urgencia: rascunho.urgencia, status: "aberta", atrasada: false,
        alertasEnviados: [], origem: rascunho.origem, criadaEm: agora.toISOString(), concluidaEm: null,
      };
      // O aviso de atribuição já informa o prazo: lembretes que já venceram não são repetidos.
      const devido = alertaDevido(tarefa, agora);
      if (devido) tarefa.alertasEnviados = ALERTAS.slice(0, ALERTAS.indexOf(devido) + 1);
      estado.tarefas.push(tarefa);
      const urg = tarefa.urgencia ? ` Urgência: ${ROTULO_URGENCIA[tarefa.urgencia]}.` : "";
      notificar(pessoa.id, `Nova tarefa de ${gestor.nome}: "${tarefa.titulo}". Prazo: ${formatarPrazo(prazo)}.${urg}`, "atribuida", tarefa.id, agora);
      return { mensagem: `Pronto! Tarefa criada e enviada para ${pessoa.nome}.`, tarefa: resumoTarefa(tarefa, agora) };
    },
  },
  listar_tarefas: {
    descricao: "Lista tarefas: as da equipe (gestor) ou as próprias (funcionário). Filtros: pendentes, atrasadas, vencem_24h, concluidas, todas.",
    executar({ usuario, filtro = "pendentes", responsavel }) {
      const u = identificar(usuario);
      const agora = new Date();
      let tarefas = estado.tarefas.filter((t) => (u.papel === "gestor" ? t.gestorId === u.id : t.responsavelId === u.id));
      if (responsavel && u.papel === "gestor") {
        const pessoa = resolverPessoa(responsavel, equipeDe(u.id));
        tarefas = tarefas.filter((t) => t.responsavelId === pessoa.id);
      }
      const escolhidas = tarefas.filter((t) => (FILTROS[filtro] ?? FILTROS.pendentes)(t, agora)).sort((a, b) => new Date(a.prazo) - new Date(b.prazo));
      const rotulo = DESCRICAO_FILTRO[filtro] ? ` ${DESCRICAO_FILTRO[filtro]}` : "";
      const mensagem = escolhidas.length
        ? [`${escolhidas.length} tarefa(s)${rotulo}:`, ...escolhidas.map((t) => linhaTarefa(t, agora, u.papel === "gestor"))].join("\n")
        : `Nenhuma tarefa${rotulo}.`;
      return { mensagem, filtro, total: escolhidas.length, tarefas: escolhidas.map((t) => resumoTarefa(t, agora)) };
    },
  },
  atualizar_status: {
    descricao: "O funcionário muda o status: aberta → em_andamento → concluida. Encontra a tarefa pelo título e avisa o gestor.",
    executar({ usuario, tarefa, status }) {
      const funcionario = identificar(usuario, "funcionario");
      const alvo = encontrarTarefa(tarefa, estado.tarefas.filter((t) => t.responsavelId === funcionario.id), status);
      if (alvo.status === status) throw new ErroPauta(`"${alvo.titulo}" já está ${ROTULO_STATUS[status].toLowerCase()}.`);
      if (!PROXIMOS[alvo.status].includes(status)) {
        throw new ErroPauta(`Não dá para mover "${alvo.titulo}" de ${ROTULO_STATUS[alvo.status]} para ${ROTULO_STATUS[status]}: o ciclo é Aberta → Em andamento → Concluída.`);
      }
      const agora = new Date();
      alvo.status = status;
      if (status === "concluida") alvo.concluidaEm = agora.toISOString();
      const gestor = usuarioPorId(alvo.gestorId);
      const texto = status === "concluida"
        ? `${funcionario.nome} concluiu a tarefa "${alvo.titulo}" ${concluidaComAtraso(alvo) ? "com atraso" : "no prazo"}.`
        : `${funcionario.nome} iniciou a tarefa "${alvo.titulo}".`;
      notificar(gestor.id, texto, status === "concluida" ? "concluida" : "iniciada", alvo.id, agora);
      return { mensagem: `Feito! "${alvo.titulo}" agora está ${ROTULO_STATUS[status]}. Avisei ${gestor.nome}.`, tarefa: resumoTarefa(alvo, agora) };
    },
  },
  painel: {
    descricao: "Dashboard do gestor: contagens, entregas por funcionário, taxa de cumprimento de prazo e o que vence em 24 h.",
    executar({ usuario, responsavel }) {
      const gestor = identificar(usuario, "gestor");
      const agora = new Date();
      let equipe = equipeDe(gestor.id);
      let tarefas = estado.tarefas.filter((t) => t.gestorId === gestor.id);
      if (responsavel) {
        const pessoa = resolverPessoa(responsavel, equipe);
        equipe = [pessoa];
        tarefas = tarefas.filter((t) => t.responsavelId === pessoa.id);
      }
      const geral = desempenho(tarefas, agora);
      const porFuncionario = equipe.map((f) => ({ nome: f.nome, ...desempenho(tarefas.filter((t) => t.responsavelId === f.id), agora) }));
      const vencem = tarefas.filter((t) => FILTROS.vencem_24h(t, agora));
      const linhas = responsavel
        ? [
            `${equipe[0].nome}: ${geral.concluidasNoPrazo} no prazo, ${geral.concluidasComAtraso} com atraso, ${geral.pendentes} pendente(s), ${geral.atrasadas} atrasada(s). Cumprimento: ${porcentagem(geral.taxaCumprimento)}.`,
            ...tarefas.filter((t) => t.status !== "concluida").map((t) => linhaTarefa(t, agora, false)),
          ]
        : [
            `Abertas: ${tarefas.filter((t) => t.status === "aberta").length} · Em andamento: ${tarefas.filter((t) => t.status === "em_andamento").length} · Concluídas: ${geral.concluidasNoPrazo + geral.concluidasComAtraso} · Atrasadas: ${geral.atrasadas}`,
            `Cumprimento de prazo da equipe: ${porcentagem(geral.taxaCumprimento)}`,
            ...porFuncionario.map((p) => `• ${p.nome}: ${porcentagem(p.taxaCumprimento)} (${p.pendentes} pendente(s), ${p.atrasadas} atrasada(s))`),
            vencem.length ? `Vencem em 24 h: ${vencem.map((t) => `"${t.titulo}"`).join(", ")}` : "Nada vence nas próximas 24 h.",
          ];
      return { mensagem: linhas.join("\n"), ...geral, porFuncionario, vencemEm24h: vencem.map((t) => resumoTarefa(t, agora)) };
    },
  },
  notificacoes: {
    descricao: "Últimas notificações do usuário (web e WhatsApp recebem as mesmas). Marca as novas como lidas.",
    executar({ usuario, limite = 12 }) {
      const u = identificar(usuario);
      const minhas = estado.notificacoes.filter((n) => n.usuarioId === u.id).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)).slice(0, limite);
      const itens = minhas.map((n) => ({ ...n }));
      const novas = minhas.filter((n) => !n.lida).length;
      for (const n of minhas) n.lida = true;
      return { mensagem: novas ? `${novas} notificação(ões) nova(s).` : "Nenhuma notificação nova.", notificacoes: itens };
    },
  },
  verificar_prazos: {
    descricao: "Envia os alertas devidos (véspera, dia do prazo, atrasada), cada um uma única vez. No produto roda pelo EventBridge Scheduler.",
    executar() {
      const agora = new Date();
      const enviados = [];
      for (const t of estado.tarefas.filter((x) => x.status !== "concluida")) {
        const alerta = alertaDevido(t, agora);
        if (!alerta || t.alertasEnviados.includes(alerta)) continue;
        t.alertasEnviados.push(alerta);
        const prazo = new Date(t.prazo);
        const responsavel = usuarioPorId(t.responsavelId);
        if (alerta === "atrasada") {
          t.atrasada = true;
          notificar(t.responsavelId, `A tarefa "${t.titulo}" está atrasada: o prazo era ${formatarPrazo(prazo)}.`, alerta, t.id, agora);
          notificar(t.gestorId, `A tarefa "${t.titulo}" de ${responsavel.nome} está atrasada: o prazo era ${formatarPrazo(prazo)}.`, alerta, t.id, agora);
        } else {
          const prefixo = alerta === "vespera" ? "Lembrete" : "Atenção";
          notificar(t.responsavelId, `${prefixo}: a tarefa "${t.titulo}" vence ${descreverVencimento(prazo, agora)}.`, alerta, t.id, agora);
        }
        enviados.push({ tarefa: t.titulo, alerta });
      }
      return { mensagem: enviados.length ? `${enviados.length} alerta(s) enviado(s).` : "Nenhum alerta devido.", enviados };
    },
  },
};

/** Executa a ferramenta como um servidor MCP e registra a requisição e a resposta JSON-RPC. */
function chamarFerramenta(nome, args, origem) {
  const id = (estado.seqMcp = (estado.seqMcp ?? 0) + 1);
  const pedido = { jsonrpc: "2.0", id, method: "tools/call", params: { name: nome, arguments: args } };
  let resultado;
  try {
    const dados = FERRAMENTAS[nome].executar(args);
    resultado = { content: [{ type: "text", text: dados.mensagem }], structuredContent: dados, isError: false };
  } catch (erro) {
    if (!(erro instanceof ErroPauta)) throw erro;
    resultado = { content: [{ type: "text", text: erro.message }], isError: true };
  }
  estado.mcp.unshift({ id, nome, origem, quando: new Date().toISOString(), pedido, resposta: { jsonrpc: "2.0", id, result: resultado } });
  estado.mcp = estado.mcp.slice(0, 60);
  return { id, ok: !resultado.isError, texto: resultado.content[0].text, dados: resultado.structuredContent };
}

/* ---------- Intérprete do chat (faz o papel do modelo) ---------- */

const AJUDA_GESTOR =
  'Posso delegar e acompanhar tarefas. Exemplos:\n• "Carlos, preciso do relatório de obras da regional norte até sexta, urgente"\n• "Rafael, agendar vistoria na creche em 2 minutos"\n• "O que está atrasado?" ou "Como está o Carlos?"';
const AJUDA_FUNCIONARIO = 'Me diga o que fez, por exemplo "iniciei a vistoria da ponte" ou "terminei o orçamento". Para ver tudo, peça "minhas tarefas".';

function cortar(texto, trechos) {
  let resultado = texto;
  for (const [inicio, fim] of [...trechos].sort((a, b) => b[0] - a[0])) {
    resultado = `${resultado.slice(0, inicio)} ${resultado.slice(fim)}`;
  }
  return resultado;
}

/** Extrai responsável, prazo, urgência e título de um pedido do gestor (o que o Bedrock faria). */
function extrairPedido(texto, gestor, agora = new Date()) {
  const original = texto.normalize("NFC").trim();
  const a = alinhado(original);
  const trechos = [];

  let mencao = null;
  for (const pessoa of equipeDe(gestor.id)) {
    const [primeiro, ...resto] = palavras(pessoa.nome);
    const m = new RegExp(String.raw`\b${primeiro}(?:\s+${resto.join(String.raw`\s+`)})?\b`).exec(a);
    if (m && (!mencao || m.index < mencao.inicio)) mencao = { inicio: m.index, fim: m.index + m[0].length };
  }
  if (mencao) {
    const virgula = /^\s*[,:]/.exec(a.slice(mencao.fim));
    trechos.push([mencao.inicio, mencao.fim + (virgula ? virgula[0].length : 0)]);
  }

  const prazo = encontrarPrazo(original, agora);
  if (prazo) trechos.push([prazo.inicio, prazo.fim]);

  let urgencia = null;
  for (const [nivel, padrao] of [
    ["alta", /\b(?:com urgencia|urgentissimo|urgente|urgencia|prioridade alta|o quanto antes)\b/],
    ["baixa", /\b(?:sem pressa|prioridade baixa|baixa prioridade|quando puder)\b/],
    ["media", /\b(?:prioridade media|media prioridade)\b/],
  ]) {
    const m = padrao.exec(a);
    if (m) {
      urgencia = nivel;
      trechos.push([m.index, m.index + m[0].length]);
      break;
    }
  }

  const titulo = cortar(original, trechos)
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,(\s*,)+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:!-]+|[\s,.;:!?-]+$/g, "")
    .replace(/,?\s*por favor\.?$/i, "")
    .replace(/^(?:por favor,?\s*)?(?:voc[eê]\s+)?(?:pode(?:ria)?\s+)?(?:me\s+)?(?:preciso\s+(?:que\s+(?:voc[eê]\s+)?)?|quero\s+(?:que\s+)?)?(?:(?:do|da|dos|das|de|o|a|os|as)\s+)?/i, "")
    .replace(/^[\s,.;:!-]+|[\s,.;:!?-]+$/g, "");

  return {
    responsavel: mencao ? original.slice(mencao.inicio, mencao.fim) : "",
    titulo: maiuscula(titulo),
    descricao: original,
    prazo: prazo ? original.slice(prazo.inicio, prazo.fim).trim() : "",
    urgencia,
  };
}

function interpretarGestor(texto, gestor) {
  const a = alinhado(texto.normalize("NFC")).trim();
  const quem = { usuario: gestor.nome };
  const chamar = (nome, args) => chamarFerramenta(nome, { ...quem, ...args }, "chat");

  if (estado.rascunhos[gestor.id]) {
    if (/^(sim|s|isso|confirmo|confirma|pode|ok|beleza|claro|manda)\b/.test(a)) return chamar("confirmar_tarefa", { confirmar: true });
    if (/^(nao|n|cancela|cancelar|esquece|descarta)\b/.test(a)) return chamar("confirmar_tarefa", { confirmar: false });
  }
  if (/\b(?:ajuda|como funciona|o que voce faz)\b/.test(a)) return { texto: AJUDA_GESTOR };
  // Consultas só quando a mensagem é pergunta: "Carlos, ... atrasado" continua sendo delegação.
  const pergunta = /\?\s*$/.test(a) || /^(?:o que|oque|quais|qual|como|tem|ha|quantas|quantos|mostra|mostre|liste|lista|ver)\b/.test(a);
  if (pergunta) {
    const como = /\bcomo\s+(?:esta|vai|anda)\s+(?:o\s+|a\s+)?([a-z]+)/.exec(a);
    if (como && !["equipe", "time", "todos", "tudo"].includes(como[1])) return chamar("painel", { responsavel: como[1] });
    if (/\batrasad/.test(a)) return chamar("listar_tarefas", { filtro: "atrasadas" });
    if (/\bvenc/.test(a)) return chamar("listar_tarefas", { filtro: "vencem_24h" });
    if (/\bandamento\b/.test(a)) return chamar("listar_tarefas", { filtro: "em_andamento" });
    if (/\b(?:conclu|entreg)/.test(a)) return chamar("listar_tarefas", { filtro: "concluidas" });
    if (/\b(?:painel|resumo|desempenho|dashboard|equipe|time)\b/.test(a)) return chamar("painel", {});
    if (/\b(?:tarefas?|pendentes?|abertas?)\b/.test(a)) return chamar("listar_tarefas", { filtro: "pendentes" });
  }
  if (/\b(?:painel|resumo|desempenho|dashboard)\b/.test(a)) return chamar("painel", {});

  const pedido = extrairPedido(texto, gestor);
  if (!pedido.responsavel) {
    return { texto: `Para quem é a tarefa? Comece pelo nome da pessoa. Equipe: ${nomes(equipeDe(gestor.id))}.\n\n${AJUDA_GESTOR}` };
  }
  const resultado = chamar("delegar_tarefa", pedido);
  return { ...resultado, confirmar: resultado.ok };
}

function interpretarFuncionario(texto, funcionario) {
  const original = texto.normalize("NFC").trim();
  const a = alinhado(original);
  const chamar = (nome, args) => chamarFerramenta(nome, { usuario: funcionario.nome, ...args }, "chat");

  if (/\b(?:minhas tarefas|o que (?:eu )?tenho|pendentes?|lista)\b/.test(a)) return chamar("listar_tarefas", { filtro: "pendentes" });
  for (const [status, padrao] of [
    ["concluida", /\b(?:terminei|conclui|finalizei|entreguei|acabei|ja fiz|fiz)\b/],
    ["em_andamento", /\b(?:iniciei|comecei|estou fazendo|to fazendo|vou comecar|comecando|peguei)\b/],
  ]) {
    const m = padrao.exec(a);
    if (m) return chamar("atualizar_status", { tarefa: original.slice(m.index + m[0].length).replace(/^[\s:,-]+|[\s.!]+$/g, ""), status });
  }
  if (/\b(?:painel|desempenho|como estou)\b/.test(a)) return chamar("listar_tarefas", { filtro: "todas" });
  return { texto: AJUDA_FUNCIONARIO };
}

/* ---------- Interface ---------- */

if (typeof document !== "undefined") {
  const $ = (seletor) => document.querySelector(seletor);
  const vistas = new Set(); // notificações que já viraram aviso nesta aba
  let usuarioAtualId = (() => {
    try {
      return sessionStorage.getItem("pauta-usuario") || "u-marina";
    } catch {
      return "u-marina";
    }
  })();
  let filtroGestor = "pendentes";
  let digitando = false;
  let ultimaAberta = null;

  const atual = () => usuarioPorId(usuarioAtualId) ?? USUARIOS[0];

  function mudarUsuario(id) {
    usuarioAtualId = id;
    try {
      sessionStorage.setItem("pauta-usuario", id);
    } catch {
      // Sem sessionStorage: vale só até recarregar.
    }
    marcarVistas();
    renderizarTudo();
  }

  function marcarVistas() {
    for (const n of estado.notificacoes) if (n.usuarioId === usuarioAtualId) vistas.add(n.id);
  }

  function aviso(texto, tipo = "info") {
    const el = document.createElement("div");
    el.className = `aviso ${tipo}`;
    el.textContent = texto;
    $("#avisos").append(el);
    setTimeout(() => el.classList.add("saindo"), 5200);
    setTimeout(() => el.remove(), 5600);
  }

  function anunciarNovas() {
    for (const n of estado.notificacoes) {
      if (n.usuarioId === usuarioAtualId && !n.lida && !vistas.has(n.id)) {
        vistas.add(n.id);
        aviso(n.texto, n.tipo === "atrasada" ? "erro" : "info");
      }
    }
  }

  /* Topo */

  function renderizarTopo() {
    $("#usuario").innerHTML = USUARIOS.map(
      (u) => `<option value="${u.id}"${u.id === usuarioAtualId ? " selected" : ""}>${esc(u.nome)} · ${u.papel === "gestor" ? "gestora" : "funcionário"}</option>`,
    ).join("");
    const naoLidas = estado.notificacoes.filter((n) => n.usuarioId === usuarioAtualId && !n.lida).length;
    const contador = $("#contador");
    contador.hidden = naoLidas === 0;
    contador.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
  }

  function abrirNotificacoes() {
    const lista = $("#lista-notificacoes");
    if (!lista.hidden) {
      lista.hidden = true;
      $("#sino").setAttribute("aria-expanded", "false");
      return;
    }
    const r = chamarFerramenta("notificacoes", { usuario: atual().nome }, "web");
    salvar();
    const itens = r.dados?.notificacoes ?? [];
    lista.innerHTML = `<h3>Notificações</h3>${
      itens.length
        ? `<ul>${itens.map((n) => `<li class="${n.lida ? "" : "nova"} tipo-${n.tipo}"><p>${esc(n.texto)}</p><time>${formatarMomento(new Date(n.criadaEm))}</time></li>`).join("")}</ul>`
        : '<p class="vazio">Nenhuma notificação ainda.</p>'
    }`;
    lista.hidden = false;
    $("#sino").setAttribute("aria-expanded", "true");
    renderizarTopo();
    renderizarMcp();
  }

  /* Chat */

  function sugestoes() {
    const u = atual();
    if (u.papel === "gestor") {
      return [
        "Carlos, preciso do relatório de obras da regional norte até sexta, urgente",
        "Rafael, agendar vistoria na creche em 2 minutos",
        "O que está atrasado?",
        "Como está o Carlos?",
      ];
    }
    // Sugestões com as tarefas da própria pessoa, para o "iniciei"/"terminei" sempre funcionar.
    const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
    const pendentes = estado.tarefas.filter((t) => t.responsavelId === u.id && t.status !== "concluida");
    const aberta = pendentes.find((t) => t.status === "aberta");
    const andamento = pendentes.find((t) => t.status === "em_andamento") ?? aberta;
    return [
      "Minhas tarefas",
      ...(aberta ? [`Iniciei ${minuscula(aberta.titulo)}`] : []),
      ...(andamento ? [`Terminei ${minuscula(andamento.titulo)}`] : []),
    ];
  }

  function renderizarChat() {
    const u = atual();
    const conversa = estado.conversas[u.id] ?? [];
    const boasVindas = {
      de: "pauta",
      texto: u.papel === "gestor" ? `Olá, ${u.nome.split(" ")[0]}! ${AJUDA_GESTOR}` : `Olá, ${u.nome.split(" ")[0]}! ${AJUDA_FUNCIONARIO}`,
      quando: null,
    };
    const ultimaConfirmacao = conversa.map((m) => Boolean(m.confirmar)).lastIndexOf(true);
    const pendente = Boolean(estado.rascunhos[u.id]);
    const bolhas = [boasVindas, ...conversa].map((m, i) => {
      const indice = i - 1;
      const chips = m.chamada
        ? `<button type="button" class="chip-mcp${m.erro ? " erro" : ""}" data-mcp="${m.chamada}">⚙ ${esc(m.ferramenta)}</button>`
        : "";
      const botoes = m.confirmar && indice === ultimaConfirmacao && pendente
        ? '<div class="confirmar"><button type="button" class="primario" data-responder="Sim">Confirmar</button><button type="button" class="secundario" data-responder="Não">Cancelar</button></div>'
        : "";
      return `<div class="bolha ${m.de === "eu" ? "eu" : "pauta"}${m.erro ? " erro" : ""}"><p>${esc(m.texto)}</p>${botoes}<div class="rodape-bolha">${chips}${m.quando ? `<time>${hora(new Date(m.quando))}</time>` : ""}</div></div>`;
    });
    if (digitando) bolhas.push('<div class="bolha pauta digitando"><span></span><span></span><span></span></div>');
    const mensagens = $("#mensagens");
    mensagens.innerHTML = bolhas.join("");
    mensagens.scrollTop = mensagens.scrollHeight;
    $("#sugestoes").innerHTML = sugestoes().map((s) => `<button type="button" data-sugestao="${esc(s)}">${esc(s)}</button>`).join("");
  }

  function registrarMensagem(usuarioId, mensagem) {
    const conversa = (estado.conversas[usuarioId] ??= []);
    conversa.push({ ...mensagem, quando: new Date().toISOString() });
    estado.conversas[usuarioId] = conversa.slice(-80);
  }

  function enviarMensagem(texto) {
    const limpo = texto.trim();
    if (!limpo || digitando) return;
    const u = atual();
    registrarMensagem(u.id, { de: "eu", texto: limpo });
    salvar();
    digitando = true;
    renderizarChat();
    setTimeout(() => {
      digitando = false;
      const r = u.papel === "gestor" ? interpretarGestor(limpo, u) : interpretarFuncionario(limpo, u);
      const ferramenta = r.id ? estado.mcp.find((e) => e.id === r.id)?.nome : null;
      registrarMensagem(u.id, { de: "pauta", texto: r.texto, chamada: r.id ?? null, ferramenta, erro: r.ok === false, confirmar: Boolean(r.confirmar) });
      ultimaAberta = r.id ?? ultimaAberta;
      salvar();
      renderizarTudo();
    }, 450);
  }

  /* Tela do gestor */

  function renderizarGestor(u, agora) {
    const tarefas = estado.tarefas.filter((t) => t.gestorId === u.id);
    const equipe = equipeDe(u.id);
    const geral = desempenho(tarefas, agora);
    const contar = (status) => tarefas.filter((t) => t.status === status).length;
    const vencem = tarefas.filter((t) => FILTROS.vencem_24h(t, agora)).sort((a, b) => new Date(a.prazo) - new Date(b.prazo));
    const lista = tarefas.filter((t) => FILTROS[filtroGestor](t, agora)).sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

    const linhasEquipe = equipe
      .map((f) => {
        const d = desempenho(tarefas.filter((t) => t.responsavelId === f.id), agora);
        const largura = d.taxaCumprimento === null ? 0 : Math.round(d.taxaCumprimento * 100);
        return `<tr><th scope="row">${esc(f.nome)}</th><td>${d.concluidasNoPrazo}</td><td>${d.concluidasComAtraso}</td><td>${d.pendentes}</td><td class="${d.atrasadas ? "texto-erro" : ""}">${d.atrasadas}</td>
          <td><div class="medidor" title="${porcentagem(d.taxaCumprimento)}"><span style="width:${largura}%"></span></div><small>${porcentagem(d.taxaCumprimento)}</small></td></tr>`;
      })
      .join("");

    return `
      <div class="cabecalho-papel">
        <div><h1>Painel da equipe</h1><p>${esc(u.nome)} · ${esc(u.cargo)}</p></div>
        <button type="button" class="primario" id="abrir-form">+ Nova tarefa</button>
      </div>
      <div class="contadores">
        <div class="contador"><span>Abertas</span><strong>${contar("aberta")}</strong></div>
        <div class="contador"><span>Em andamento</span><strong>${contar("em_andamento")}</strong></div>
        <div class="contador"><span>Concluídas</span><strong>${contar("concluida")}</strong></div>
        <div class="contador ${geral.atrasadas ? "alerta" : ""}"><span>Atrasadas</span><strong>${geral.atrasadas}</strong></div>
        <div class="contador destaque"><span>Cumprimento de prazo</span><strong>${porcentagem(geral.taxaCumprimento)}</strong></div>
      </div>
      <div class="duas-colunas">
        <section class="cartao">
          <h2>Entregas por funcionário</h2>
          <div class="tabela-rolagem"><table>
            <thead><tr><th scope="col">Funcionário</th><th scope="col">No prazo</th><th scope="col">Com atraso</th><th scope="col">Pendentes</th><th scope="col">Atrasadas</th><th scope="col">Cumprimento</th></tr></thead>
            <tbody>${linhasEquipe}</tbody>
          </table></div>
        </section>
        <section class="cartao">
          <h2>Vencem nas próximas 24 h</h2>
          ${vencem.length ? `<ul class="vencem">${vencem.map((t) => `<li><strong>${esc(t.titulo)}</strong><span>${esc(usuarioPorId(t.responsavelId).nome)} · ${esc(descreverVencimento(new Date(t.prazo), agora))}</span></li>`).join("")}</ul>` : '<p class="vazio">Nada vence nas próximas 24 h.</p>'}
        </section>
      </div>
      <section class="cartao">
        <div class="cartao-topo">
          <h2>Tarefas da equipe</h2>
          <div class="filtros" role="group" aria-label="Filtro">
            ${[["pendentes", "Pendentes"], ["atrasadas", "Atrasadas"], ["concluidas", "Concluídas"], ["todas", "Todas"]]
              .map(([valor, rotulo]) => `<button type="button" data-filtro="${valor}" class="${filtroGestor === valor ? "ativo" : ""}">${rotulo}</button>`)
              .join("")}
          </div>
        </div>
        ${lista.length ? `<ul class="lista-tarefas">${lista.map((t) => itemTarefa(t, agora, true)).join("")}</ul>` : '<p class="vazio">Nenhuma tarefa neste filtro.</p>'}
      </section>`;
  }

  function etiquetas(t, agora) {
    const lista = [`<span class="etiqueta status-${t.status}">${ROTULO_STATUS[t.status]}</span>`];
    if (vencida(t, agora)) lista.push('<span class="etiqueta atrasada">Atrasada</span>');
    else if (concluidaComAtraso(t)) lista.push('<span class="etiqueta atrasada suave">Entregue com atraso</span>');
    if (t.urgencia) lista.push(`<span class="etiqueta urgencia-${t.urgencia}">Urgência ${ROTULO_URGENCIA[t.urgencia]}</span>`);
    if (t.origem === "chat") lista.push('<span class="etiqueta origem">via chat</span>');
    return lista.join("");
  }

  function itemTarefa(t, agora, comResponsavel) {
    const prazo = new Date(t.prazo);
    const quando = t.status === "concluida" ? `entregue ${formatarMomento(new Date(t.concluidaEm))}` : `prazo ${formatarPrazo(prazo)}`;
    return `<li class="item-tarefa">
      <div><strong>${esc(t.titulo)}</strong><span class="meta">${comResponsavel ? `${esc(usuarioPorId(t.responsavelId).nome)} · ` : ""}${esc(quando)}</span></div>
      <div class="etiquetas">${etiquetas(t, agora)}</div>
    </li>`;
  }

  /* Tela do funcionário */

  function renderizarFuncionario(u, agora) {
    const minhas = estado.tarefas.filter((t) => t.responsavelId === u.id);
    const gestor = usuarioPorId(u.gestorId);
    const raias = ["aberta", "em_andamento", "concluida"].map((status) => {
      const cartoes = minhas.filter((t) => t.status === status).sort((a, b) => new Date(a.prazo) - new Date(b.prazo));
      return `<div class="raia" data-status="${status}">
        <h2>${ROTULO_STATUS[status]} <span>${cartoes.length}</span></h2>
        ${cartoes.map((t) => cartaoQuadro(t, agora)).join("") || '<p class="vazio">Arraste uma tarefa para cá.</p>'}
      </div>`;
    });
    return `
      <div class="cabecalho-papel">
        <div><h1>Minhas tarefas</h1><p>${esc(u.nome)} · ${esc(u.cargo)} · gestora: ${esc(gestor.nome)}</p></div>
      </div>
      <div class="quadro">${raias.join("")}</div>`;
  }

  function cartaoQuadro(t, agora) {
    const prazo = new Date(t.prazo);
    const acoes = [];
    if (t.status === "aberta") acoes.push(`<button type="button" class="secundario pequeno" data-mover="${t.id}" data-status="em_andamento">Iniciar</button>`);
    if (t.status !== "concluida") acoes.push(`<button type="button" class="primario pequeno" data-mover="${t.id}" data-status="concluida">Concluir</button>`);
    const quando = t.status === "concluida" ? `Entregue ${formatarMomento(new Date(t.concluidaEm))}` : `Vence ${descreverVencimento(prazo, agora)}`;
    return `<article class="cartao-tarefa${vencida(t, agora) ? " atrasada" : ""}" draggable="${t.status !== "concluida"}" data-id="${t.id}">
      <strong>${esc(t.titulo)}</strong>
      <p>${esc(t.descricao)}</p>
      <div class="etiquetas">${etiquetas(t, agora)}</div>
      <div class="rodape-cartao"><span class="${vencida(t, agora) ? "texto-erro" : ""}">${esc(quando)}</span><div>${acoes.join("")}</div></div>
    </article>`;
  }

  function renderizarVisao() {
    const u = atual();
    const agora = new Date();
    $("#visao").innerHTML = u.papel === "gestor" ? renderizarGestor(u, agora) : renderizarFuncionario(u, agora);
    if (u.papel !== "gestor") $("#form-tarefa").hidden = true;
  }

  function moverTarefa(id, status) {
    const r = chamarFerramenta("atualizar_status", { usuario: atual().nome, tarefa: id, status }, "web");
    ultimaAberta = r.id;
    salvar();
    if (!r.ok) aviso(r.texto, "erro");
    renderizarTudo();
  }

  /* Formulário do gestor: o mesmo par de ferramentas do chat (seção 8.2) */

  function abrirFormulario() {
    const form = $("#form-tarefa");
    form.responsavel.innerHTML = equipeDe(atual().id).map((f) => `<option value="${esc(f.nome)}">${esc(f.nome)}</option>`).join("");
    const sugestao = comHora(somarDias(new Date(), 2), 18, 0);
    form.prazo.value = `${sugestao.getFullYear()}-${doisDigitos(sugestao.getMonth() + 1)}-${doisDigitos(sugestao.getDate())}T18:00`;
    form.hidden = false;
    form.titulo.focus();
  }

  function enviarFormulario(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const usuario = atual().nome;
    const delegar = chamarFerramenta("delegar_tarefa", {
      usuario, titulo: form.titulo.value, descricao: form.descricao.value, responsavel: form.responsavel.value,
      prazo: form.prazo.value, urgencia: form.urgencia.value || null, origem: "web",
    }, "web");
    if (!delegar.ok) {
      ultimaAberta = delegar.id;
      salvar();
      aviso(delegar.texto, "erro");
      renderizarMcp();
      return;
    }
    // Na web, clicar em "Criar" já é a confirmação do gestor.
    const confirmar = chamarFerramenta("confirmar_tarefa", { usuario, confirmar: true }, "web");
    ultimaAberta = confirmar.id;
    salvar();
    aviso(confirmar.texto, confirmar.ok ? "ok" : "erro");
    form.reset();
    form.hidden = true;
    renderizarTudo();
  }

  /* Painel MCP */

  const ROTULO_ORIGEM = { chat: "chat", web: "web", agendador: "EventBridge Scheduler (simulado)" };

  function renderizarMcp() {
    $("#log-mcp").innerHTML = estado.mcp.length
      ? estado.mcp
          .map((e) => {
            const erro = e.resposta.result.isError;
            return `<li id="mcp-${e.id}"><details${e.id === ultimaAberta ? " open" : ""}>
              <summary><span class="metodo">tools/call</span><strong>${esc(e.nome)}</strong><span class="estado ${erro ? "erro" : "ok"}">${erro ? "isError" : "ok"}</span>
                <small>${esc(ROTULO_ORIGEM[e.origem] ?? e.origem)} · ${hora(new Date(e.quando))}</small></summary>
              <h4>Requisição</h4><pre>${esc(JSON.stringify(e.pedido, null, 2))}</pre>
              <h4>Resposta</h4><pre>${esc(JSON.stringify(e.resposta, null, 2))}</pre>
            </details></li>`;
          })
          .join("")
      : '<li class="vazio">As chamadas aparecem aqui quando você conversa, cria tarefas ou move cartões.</li>';
  }

  function renderizarTudo() {
    renderizarTopo();
    renderizarChat();
    renderizarVisao();
    renderizarMcp();
  }

  /* Verificação de prazos: no produto, o EventBridge Scheduler chama a cada minuto */

  function verificarPrazos() {
    const dados = FERRAMENTAS.verificar_prazos.executar();
    if (dados.enviados.length) {
      // Só registra no painel quando algo foi enviado, para não poluir o log.
      const id = (estado.seqMcp = (estado.seqMcp ?? 0) + 1);
      estado.mcp.unshift({
        id, nome: "verificar_prazos", origem: "agendador", quando: new Date().toISOString(),
        pedido: { jsonrpc: "2.0", id, method: "tools/call", params: { name: "verificar_prazos", arguments: {} } },
        resposta: { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: dados.mensagem }], structuredContent: dados, isError: false } },
      });
      estado.mcp = estado.mcp.slice(0, 60);
      salvar();
      renderizarMcp();
      renderizarTopo();
    }
    renderizarVisao();
    anunciarNovas();
  }

  /* Eventos */

  $("#usuario").addEventListener("change", (e) => mudarUsuario(e.target.value));
  $("#sino").addEventListener("click", abrirNotificacoes);
  $("#resetar").addEventListener("click", () => {
    if (!confirm("Apagar tudo e voltar aos dados de exemplo?")) return;
    estado = dadosIniciais();
    salvar();
    vistas.clear();
    marcarVistas();
    $("#form-tarefa").hidden = true;
    renderizarTudo();
    verificarPrazos();
  });
  $("#form-chat").addEventListener("submit", (e) => {
    e.preventDefault();
    enviarMensagem($("#texto").value);
    $("#texto").value = "";
  });
  $("#sugestoes").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-sugestao]");
    if (botao) enviarMensagem(botao.dataset.sugestao);
  });
  $("#mensagens").addEventListener("click", (e) => {
    const responder = e.target.closest("[data-responder]");
    if (responder) return enviarMensagem(responder.dataset.responder);
    const chip = e.target.closest("[data-mcp]");
    if (chip) {
      ultimaAberta = Number(chip.dataset.mcp);
      renderizarMcp();
      const item = document.getElementById(`mcp-${chip.dataset.mcp}`);
      item?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      item?.classList.add("piscar");
      setTimeout(() => item?.classList.remove("piscar"), 1200);
    }
  });
  $("#visao").addEventListener("click", (e) => {
    if (e.target.closest("#abrir-form")) return abrirFormulario();
    const filtro = e.target.closest("[data-filtro]");
    if (filtro) {
      filtroGestor = filtro.dataset.filtro;
      return renderizarVisao();
    }
    const mover = e.target.closest("[data-mover]");
    if (mover) moverTarefa(mover.dataset.mover, mover.dataset.status);
  });
  $("#visao").addEventListener("dragstart", (e) => {
    const cartao = e.target.closest(".cartao-tarefa");
    if (cartao) e.dataTransfer.setData("text/plain", cartao.dataset.id);
  });
  $("#visao").addEventListener("dragover", (e) => {
    const raia = e.target.closest(".raia");
    if (!raia) return;
    e.preventDefault();
    raia.classList.add("alvo");
  });
  $("#visao").addEventListener("dragleave", (e) => e.target.closest(".raia")?.classList.remove("alvo"));
  $("#visao").addEventListener("drop", (e) => {
    const raia = e.target.closest(".raia");
    if (!raia) return;
    e.preventDefault();
    raia.classList.remove("alvo");
    const id = e.dataTransfer.getData("text/plain");
    const tarefa = estado.tarefas.find((t) => t.id === id);
    if (tarefa && tarefa.status !== raia.dataset.status) moverTarefa(id, raia.dataset.status);
  });
  $("#form-tarefa").addEventListener("submit", enviarFormulario);
  $("#cancelar-form").addEventListener("click", () => {
    $("#form-tarefa").reset();
    $("#form-tarefa").hidden = true;
  });
  $("#limpar-mcp").addEventListener("click", () => {
    estado.mcp = [];
    salvar();
    renderizarMcp();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sino-envoltorio")) {
      $("#lista-notificacoes").hidden = true;
      $("#sino").setAttribute("aria-expanded", "false");
    }
  });
  // Outra aba mudou os dados (ex.: gestor numa aba, funcionário na outra): sincroniza.
  window.addEventListener("storage", (e) => {
    if (e.key !== CHAVE) return;
    estado = carregar();
    renderizarTudo();
    anunciarNovas();
  });

  $("#lista-ferramentas").innerHTML = Object.entries(FERRAMENTAS)
    .map(([nome, f]) => `<li><code>${nome}</code><span>${esc(f.descricao)}</span></li>`)
    .join("");

  marcarVistas();
  renderizarTudo();
  verificarPrazos();
  setInterval(verificarPrazos, 10e3);
}

if (typeof module !== "undefined") {
  module.exports = { interpretarPrazo, encontrarPrazo, extrairPedido, interpretarGestor, interpretarFuncionario, FERRAMENTAS, chamarFerramenta, formatarPrazo, USUARIOS, estadoAtual: () => estado };
}
