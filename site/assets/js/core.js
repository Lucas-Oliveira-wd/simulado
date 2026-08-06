
window.API = "http://127.0.0.1:5000";

window.el = id => document.getElementById(id);

window.db = [];
window.opcoes = {};
window.flashDb = [];
window.flashPool = [];
window.flashIdx = 0;

let checkDupTimeout = null;
let sessao = { pool: [], idx: 0, acertos: 0, modo: '', timer: null, tempo: 0 };
let foco = null, ordCol = { c: null, d: 'asc' };

const header = el("main-header");
let headerOffset = 0;

const fmtListUlt = (type) => { if (foco) fmtList(foco, type); };

const nav = n => {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    el(`secao-${n}`).style.display = 'block';
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('ativa'));
    if(el(`nav-${n}`)) el(`nav-${n}`).classList.add('ativa');

    if (n === 'banco') carrTab();
    if (n === 'caderno') carregarCaderno();
    if (n === 'estatisticas') {
        graf();
        renderizarHistoricoStats()
    } 
    if (n === 'flashcards') initFC();
    if (n === 'plano' && typeof initPlanoEstudos === 'function') initPlanoEstudos();
    el("floating-toolbar").style.display = "none";
    window.scrollTo(0, 0);
};

const showLoader = (txt) => { el("loader-msg").innerText = txt; el("loader-overlay").style.display = "flex"; }
const hideLoader = () => { el("loader-overlay").style.display = "none"; }

const fmt = (elem, t) => {
    let c = typeof elem === 'string' ? el(elem) : elem; if (!c) return;
    let s = c.selectionStart, e = c.selectionEnd;
    c.value = c.value.substring(0, s) + `<${t}>` + c.value.substring(s, e) + `</${t}>` + c.value.substring(e);
};

const fmtUlt = (t) => { if (foco) fmt(foco, t); };

// Função auxiliar para normalizar textos e ignorar maiúsculas/minúsculas/espaços
const normStr = (str) => String(str || "").trim().toLowerCase();



function showToolbar(elem) {
    foco = elem; const tb = el('floating-toolbar');
    const rect = elem.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    tb.style.top = (rect.top + scrollTop - 40) + 'px';
    tb.style.left = (rect.left + scrollLeft) + 'px';
    tb.style.display = 'flex';
}
document.addEventListener('click', function (e) {
    if (!e.target.closest('input') && !e.target.closest('textarea') && !e.target.closest('.floating-toolbar')) {
        el('floating-toolbar').style.display = 'none';
    }
});

// Função do Tema Escuro
function toggleTema() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("temaEscuro", document.body.classList.contains("dark-mode"));
}
// Carregar preferência ao iniciar
if (localStorage.getItem("temaEscuro") === "true") document.body.classList.add("dark-mode");



async function init() {
    try {
        let [r1, r2, r3] = await Promise.all([fetch(`${API}/questoes`), fetch(`${API}/opcoes-dinamicas`), fetch(`${API}/flashcards`)]);
        db = await r1.json(); opcoes = await r2.json(); flashDb = await r3.json();
        popSelGeral();
        altTipo('cad');

        // [CÓDIGO INSERIDO] Inicializa os filtros múltiplos agora que 'opcoes' existe
        if (typeof initPraticarFiltros === 'function') {
            initPraticarFiltros();
        }

        // Se estiver na tela de banco, atualiza a tabela automaticamente
        if (el('secao-banco').style.display === 'block') carrTab();
        // Se estiver gerenciando flashcards, atualiza a lista
        if (el('fc-modo-gerenciar').style.display === 'block') renderListaFC();

    } catch (e) { console.error(e); alert("Erro ao carregar dados."); }

    await carregarListaTextos();
}

function pop(elAlvo, arr, def, usarDatalist = false) {
    if (!elAlvo) return;
    let html = def && !usarDatalist ? `<option value="">${def}</option>` : "";
    if (arr && arr.length > 0) {
        arr.forEach(x => html += `<option value="${x}">${usarDatalist ? '' : x}</option>`);
    }
    elAlvo.innerHTML = html;
}

function popSelGeral() {
    pop(el("lista-bancas"), opcoes.bancas, "", true);
    pop(el("lista-instituicoes"), opcoes.instituicoes, "", true);
    pop(el("lista-disciplinas"), opcoes.disciplinas, "", true);
    ['busca', 'prat', 'prova', 'fc-estudo'].forEach(p => {
        if (el(`${p}-banca`)) pop(el(`${p}-banca`), opcoes.bancas, "Todas as Bancas");
        if (el(`${p}-instituicao`)) pop(el(`${p}-instituicao`), opcoes.instituicoes, "Instituição...");
        let idDisc = (p === 'fc-estudo') ? 'fc-estudo-disc' : `${p}-disciplina`;
        if (el(idDisc)) pop(el(idDisc), opcoes.disciplinas, "Disciplina...");
    });
}

function carregarAssuntos(prefixo, disciplinaManual = null) {
    let idDisc = (prefixo === 'fc-estudo') ? 'fc-estudo-disc' : `${prefixo}-disciplina`;
    let elDisc = el(idDisc);
    let disc = disciplinaManual || (elDisc ? elDisc.value : "");

    if (['cad', 'imp', 'edit', 'fc'].includes(prefixo)) {
        let listaAss = el("lista-assuntos");
        let html = "";
        if (opcoes.assuntos) {
            let lista = opcoes.assuntos.filter(a => a.disciplina === disc);
            lista.forEach(a => html += `<option value="${a.nome}">`);
        }
        listaAss.innerHTML = html;
    }
    /* [CÓDIGO INSERIDO] - Desvio para renderização de checkboxes múltiplos */
    else if (prefixo === 'prat' || prefixo === 'fc-estudo') {
        const containerId = prefixo === 'prat' ? "prat-assuntos-filtros" : "fc-assuntos-filtros";
        const classCheck = prefixo === 'prat' ? "chk-assunto-filtro" : "chk-fc-assunto-filtro";

        const listaNomes = opcoes.assuntos 
            ? opcoes.assuntos.filter(a => normStr(a.disciplina) === normStr(disc)).map(a => a.nome)
            : [];

        renderSeletorMultiplo(containerId, listaNomes, classCheck, "Filtrar Assuntos");
    }
    /* [FIM DO CÓDIGO INSERIDO] */
    else {
        let selAss = el(`${prefixo}-assunto`);
        if (!selAss) return;
        let html = '<option value="">Todos Assuntos</option>';
        if (opcoes.assuntos) {
            let lista = opcoes.assuntos.filter(a => a.disciplina === disc);
            lista.forEach(a => html += `<option value="${a.nome}">${a.nome}</option>`);
        }
        selAss.innerHTML = html;
    }
}

// [CÓDIGO INSERIDO] - Gera a lista de checkboxes baseada na disciplina selecionada
function renderizarCheckboxesAssuntos(disc) {
    const container = el("prat-assuntos-filtros"); // Div que deve existir na sua seção-praticar
    if (!container) return;

    container.innerHTML = "";
    if (!disc) {
        container.innerHTML = "<small style='color:var(--sec)'>Selecione uma disciplina para ver os assuntos...</small>";
        return;
    }

    if (opcoes.assuntos) {
        const lista = opcoes.assuntos.filter(a => normStr(a.disciplina) === normStr(disc));
        
        if (lista.length === 0) {
            container.innerHTML = "<small>Nenhum assunto encontrado.</small>";
            return;
        }

        lista.forEach(a => {
            container.innerHTML += `
                <label style="display:flex; gap:8px; margin-bottom:6px; font-size:0.9rem; cursor:pointer; align-items:center;">
                    <input type="checkbox" class="chk-assunto-filtro" value="${a.nome}">
                    <span>${a.nome}</span>
                </label>`;
        });
    }
}



window.onscroll = function () {
    if (window.scrollY > headerOffset) {
    header.classList.add("sticky");
    document.body.classList.add("header-espaco");
    } else {
    header.classList.remove("sticky");
    document.body.classList.remove("header-espaco");
    }
};



// MODIFICADO: Atualização do onload para inicializar as áreas específicas
window.onload = async () => {
    await init();
    nav('cadastro');
    headerOffset = el('secao-cadastro').offsetTop;
    
    // INSERIDO: Inicialização individual das áreas de importação
    initDragDropUniversal("drop-area-questoes", "imp-file");
    initDragDropUniversal("drop-area-gabarito", "imp-gabarito-file");

    // EXCLUÍDO: setupDragDrop(); 
};

const fmtList = (elem, type) => {
    let c = typeof elem === 'string' ? el(elem) : elem;
    if (!c) return;

    let s = c.selectionStart;
    let e = c.selectionEnd;
    let sel = c.value.substring(s, e);

    // Se não tiver nada selecionado, aborta
    if (!sel.trim()) return;

    // 1. Identifica as quebras de linha originais (Enter)
    // O split('\n') separa exatamente onde o usuário deu Enter.
    let linhas = sel.split('\n');

    // 2. Transforma cada linha em um <li>, mantendo a formatação visual
    let itensLista = linhas
        .map(linha => {
            let textoLimpo = linha.trim();
            // Se a linha tiver texto, encapsula em <li>. Se for linha em branco, ignora.
            return textoLimpo ? `\t<li>${textoLimpo}</li>` : ''; 
        })
        .filter(item => item !== '') // Remove as linhas vazias do array
        .join('\n'); // Junta tudo colocando uma quebra de linha visual entre os <li>

    // 3. Monta o bloco final com quebras de linha para ficar legível no input
    let resultado = `<${type}>\n${itensLista}\n</${type}>`;

    // 4. Substitui a seleção pelo código formatado
    c.value = c.value.substring(0, s) + resultado + c.value.substring(e);
};


function atualizarTodosSelectsTexto() {
  const selects = document.querySelectorAll('.sel-texto-apoio');
  selects.forEach(sel => {
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">-- Sem Texto de Apoio --</option>';
    cacheTextos.forEach(t => {
      let resumo = t.titulo + " - " + t.conteudo.substring(0, 50).replace(/\n/g, " ") + "...";
      sel.innerHTML += `<option value="${t.id}">${resumo}</option>`;
    });
    sel.value = valorAtual;
  });
}

// INSERIDO: Função universal para aplicar Drag and Drop em qualquer container e redirecionar para um input específico
function initDragDropUniversal(containerId, inputId) {
    const area = el(containerId);
    const input = el(inputId);
    if (!area || !input) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        area.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Modifica a área visualmente quando o arquivo está sobre ela
    ['dragenter', 'dragover'].forEach(eventName => {
        area.addEventListener(eventName, () => {
            area.style.background = "#e1f5fe"; // Cor de destaque suave
            area.style.borderColor = "var(--primary)";
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        area.addEventListener(eventName, () => {
            area.style.background = "transparent";
            area.style.borderColor = "#ccc";
        }, false);
    });

    // Redireciona o arquivo solto para o input específico
    area.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            input.files = files;
            // Dispara o evento change caso haja lógica vinculada à seleção manual
            input.dispatchEvent(new Event('change'));
        }
    }, false);
}


// --- LÓGICA DE FORMULÁRIOS E TABELA ---
function altTipo(p) {
  let t = el(`${p}-tipo`).value,
    d = el(`${p}-container-alt`),
    s = el(`${p}-gabarito`);
  s.innerHTML = "";
  if (t === "ME") {
    d.style.display = "block";
    ["A", "B", "C", "D", "E"].forEach(
      (l) => (s.innerHTML += `<option value="${l}">${l}</option>`)
    );
  } else {
    d.style.display = "none";
    s.innerHTML = `<option value="C">Certo</option><option value="E">Errado</option>`;
  }
}



/**
 * Renderiza a lista de textos no corpo da tabela
 * CODIGO INSERIDO
 */
function renderListaTextos() {
    const campoBusca = document.getElementById("busca-texto-banco");
    const tbody = document.getElementById("corpo-tabela-textos");

    if (!campoBusca || !tbody) return;

    // Remove espaços do início/fim da busca para não falhar o filtro
    const busca = campoBusca.value.toLowerCase().trim();
    tbody.innerHTML = "";

    const filtrados = cacheTextos.filter(t => {
        const id = String(t.id || "").toLowerCase();
        const titulo = String(t.titulo || "").toLowerCase();
        const conteudo = String(t.conteudo || "").toLowerCase();

        return id.includes(busca) || titulo.includes(busca) || conteudo.includes(busca);
    });

    filtrados.forEach(t => {
        const txtConteudo = String(t.conteudo || "");
        const previa = txtConteudo.length > 100 ? txtConteudo.substring(0, 100) + "..." : txtConteudo;
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--dark-light);">
                <td style="padding: 12px;">${t.id}</td>
                <td style="font-weight: bold;">${t.titulo}</td>
                <td style="font-size: 0.85rem; color: #888;">${previa}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-icon" onclick="abrirModalTexto('${t.id}')" title="Editar">✏️</button>
                    <button class="btn-icon" onclick="excluirTextoApi('${t.id}')" title="Excluir" style="color: var(--red);">🗑️</button>
                </td>
            </tr>
        `;
    });
}



async function excluirTextoApi(id) {
    const vinculadas = db.filter(q => String(q.texto_apoio) === String(id));
    let msg = "Excluir este texto permanentemente?";
    if (vinculadas.length > 0) {
        msg = `Este texto está em ${vinculadas.length} questões. Elas ficarão sem texto. Confirmar exclusão?`;
    }

    if (!confirm(msg)) return;

    try {
        const resp = await fetch(`${API}/textos`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id })
        });

        if (resp.ok) {
            cacheTextos = cacheTextos.filter(x => String(x.id) !== String(id));
            renderListaTextos();
        } else {
            alert("Erro ao excluir do servidor.");
        }
    } catch (e) {
        console.error("Erro:", e);
    }
}



function visualizarQuestaoBanco(id) {
    const q = db.find(x => String(x.id) === String(id));
    if (!q) return alert("Questão não encontrada no banco local.");

    // CODIGO INSERIDO: Busca o texto de apoio se houver vínculo no cache global
    let txtHtml = "";
    if (q.texto_apoio && q.texto_apoio !== "0" && q.texto_apoio !== 0) {
        const textoObj = cacheTextos.find(t => String(t.id) === String(q.texto_apoio));
        if (textoObj) {
            txtHtml = `
                <div class="texto-apoio-box" style="margin-bottom:20px; padding:15px; background:#f4f4f4; border-left:4px solid var(--purple); border-radius:4px;">
                    <h4 style="margin-top:0; color:var(--purple);">${textoObj.titulo}</h4>
                    <div style="font-size:0.95rem; line-height:1.6; white-space: pre-wrap; color:#333;">${textoObj.conteudo}</div>
                </div>
            `;
        }
    }

    let imgHtml = q.imagem 
        ? `<img src="${API}/img/q_img/${q.imagem}" style="max-width:100%; height:auto; margin: 15px 0; border: 1px solid #ccc; display:block;">` 
        : "";

    // CODIGO MODIFICADO: Verificação de tipo de questão (ME ou CE)
    let altsHtml = "";
    if (q.tipo === "ME") {
        ["a", "b", "c", "d", "e"].forEach(l => {
            if (q[`alt_${l}`]) {
                const destaque = q.gabarito.toUpperCase() === l.toUpperCase() ? "color: var(--green); font-weight: bold;" : "";
                altsHtml += `<p style="white-space: pre-wrap; ${destaque}"><strong>${l.toUpperCase()})</strong> ${q['alt_'+l]}</p>`;
            }
        });
    } else {
        // Lógica para Certo/Errado
        const gabExtenso = q.gabarito === "C" ? "Certo" : "Errado";
        altsHtml = `<p style="color: var(--green); font-weight: bold;">Gabarito: ${gabExtenso}</p>`;
    }

    if (!el("modal-visualizacao-real")) {
        const m = document.createElement("div");
        m.id = "modal-visualizacao-real";
        m.className = "modal-overlay";
        m.innerHTML = `<div class="modal-content" style="max-width:800px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:10px; margin-bottom:15px;">
                <h3 style="margin:0">Visualização Banco (ID: <span id="visualiza-id-title"></span>)</h3>
                <button onclick="el('modal-visualizacao-real').style.display='none'" class="btn-icon" style="font-size:1.5rem">✖</button>
            </div>
            <div id="conteudo-renderizado"></div>
        </div>`;
        document.body.appendChild(m);
    }

    el("visualiza-id-title").innerText = q.id;

    el("conteudo-renderizado").innerHTML = `
        ${txtHtml}
        <div style="margin-bottom:20px; line-height:1.6; white-space: pre-wrap;">${q.enunciado}</div>
        ${imgHtml}
        <div style="margin-bottom:20px;">${altsHtml}</div>
        <div class="preview-q-comentarios" style="margin-top:20px; padding-top:10px; border-top:1px dashed #ccc;">
            <strong>Comentários:</strong><br>${q.comentarios || "Sem comentários registrados."}
        </div>
    `;
    el("modal-visualizacao-real").style.display = "flex";
}




function repararTextoSmart(idElemento = null) {

  let textarea = (typeof foco !== 'undefined' && foco) ? foco : document.activeElement;

  if (typeof idElemento !== 'undefined' && idElemento) {
      textarea = document.getElementById(idElemento);
  }

  // Validação: Se não for um textarea ou input de texto, para aqui
  if (!textarea || (textarea.tagName !== 'TEXTAREA' && textarea.type !== 'text')) {
      console.warn("Nenhum campo de texto selecionado para reparo. Clique dentro do campo antes de apertar o botão.");
      return;
  }

  // 2. Verifica Seleção
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const temSelecao = start !== end;

  // Define qual texto processar (Seleção ou Tudo)
  let textoOriginal = temSelecao ? textarea.value.substring(start, end) : textarea.value;

  let linhas = textoOriginal.split('\n');
  let resultado = [];
  
  for (let i = 0; i < linhas.length; i++) {
      let atual = linhas[i].trim();
      
      // Se for a última linha, salva e encerra
      if (i === linhas.length - 1) {
          if (atual) resultado.push(atual);
          break;
      }

      let proxima = linhas[i+1].trim();

      // Linha vazia = parágrafo manual intencional
      if (!atual) {
          resultado.push(""); 
          continue;
      }

      // --- LÓGICA DE DETECÇÃO ---
      // 1. Termina com pontuação forte? (. : ? ! ;)
      const pontuacaoFinal = /[.:?!;]$/.test(atual);
      
      // 2. Próxima linha começa com Maiúscula, Número, Aspas ou Marcador?
      const comecaNovoBloco = /^(?:["'“‘\(\[]*[A-Z0-9]|-[A-Z]|•)/.test(proxima);

      if (pontuacaoFinal && comecaNovoBloco) {
          // Parece um fim de frase real -> Mantém a quebra
          resultado.push(atual); 
      } else {
          // Parece quebra de PDF no meio da frase -> Junta com a próxima
          linhas[i+1] = atual + " " + proxima;
      }
  }

  let textoProcessado = resultado.join('\n');

  // 3. Aplica o resultado
  if (temSelecao) {
      // Reconstrói o valor preservando o que estava antes e depois da seleção
      const antes = textarea.value.substring(0, start);
      const depois = textarea.value.substring(end);
      textarea.value = antes + textoProcessado + depois;

      // (Opcional) Mantém a seleção no texto novo para facilitar ajustes
      textarea.selectionStart = start;
      textarea.selectionEnd = start + textoProcessado.length;
  } else {
      textarea.value = textoProcessado;
  }
  
  // Dispara evento de input para salvar alterações
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
};

document.addEventListener('DOMContentLoaded', () => {
    // Busca os elementos diretamente pelas tags e classes que você já tem
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('#main-header nav');

    if (hamburger && navMenu) {
        // Evento de clique no botão hambúrguer / X
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Evento para fechar o menu lateral ao clicar em um botão
        const navButtons = navMenu.querySelectorAll('button');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }
});

// core.js

/**
 * Transforma um container em um seletor de checkboxes múltiplo com busca.
 * @param {string} containerId - ID do elemento pai.
 * @param {Array} lista - Array de strings ou objetos.
 * @param {string} classCheck - Classe para identificar os checkboxes depois.
 * * @param {string} labelBotao - Texto que aparecerá no botão (VALOR PADRÃO ADICIONADO)
 */
function renderSeletorMultiplo(containerId, lista, classCheck, labelBotao = "Selecionar...") {
    const container = el(containerId);
    if (!container || !lista) return;

    // Estilização do container pai para permitir posicionamento absoluto do filho
    container.style.position = "relative";

    // Criar cabeçalho com Busca e "Selecionar Todos"
    container.innerHTML = `
        <button type="button" class="btn-dropdown-multi" onclick="toggleDropdownMulti('${containerId}')" 
                style="width:100%; display:flex; justify-content:space-between; align-items:center;">
            <span>${labelBotao}</span>
            <span class="seta-drop">▼</span>
        </button>

        <div class="multi-select-floating" id="drop-${containerId}" style="display:none;">
            <div class="multi-select-header">
                <input type="text" placeholder="Buscar..." oninput="filtrarCheckbox(this, '${containerId}')">
                <label>
                    <input type="checkbox" class="chk-input-reset" onchange="toggleTodosCheckboxes(this, '${containerId}')"> Todos
                </label>
            </div>
            <div class="multi-select-list">
                ${lista.map(item => `
                    <label class="chk-item-label">
                        <input type="checkbox" class="${classCheck} chk-input-reset" value="${item}">
                        <span>${item}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

// Função para abrir/fechar
function toggleDropdownMulti(id) {
    const drop = el(`drop-${id}`);
    const isVisible = drop.style.display === "block";
    
    // Fecha todos os outros abertos antes de abrir este
    document.querySelectorAll('.multi-select-floating').forEach(d =>{
        d.style.display = 'none'// [CÓDIGO INSERIDO] Remove o z-index do pai para não conflitar
        if(d.parentElement) d.parentElement.style.zIndex = "auto";
    });
    
    if (!isVisible) {
        drop.style.display = "block";
        // [CÓDIGO INSERIDO] Eleva o container pai imediato para garantir o topo
        drop.parentElement.style.zIndex = "1001"; 
    }
}

// Fechar ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.secao')) return; // ignore fora da área útil
    if (!e.target.closest('.multi-select-floating') && !e.target.closest('.btn-dropdown-multi')) {
        document.querySelectorAll('.multi-select-floating').forEach(d => d.style.display = 'none');
    }
});

// Auxiliar: Filtro em tempo real
function filtrarCheckbox(input, containerId) {
    const termo = normStr(input.value);
    const labels = el(containerId).querySelectorAll('.chk-item-label');
    labels.forEach(lbl => {
        const txt = normStr(lbl.innerText);
        lbl.style.display = txt.includes(termo) ? 'flex' : 'none';
    });
}

// Auxiliar: Toggle Global
function toggleTodosCheckboxes(master, containerId) {
    const checkboxes = el(containerId).querySelectorAll('.multi-select-list input[type="checkbox"]');
    checkboxes.forEach(chk => {
        if (chk.parentElement.style.display !== 'none') {
            chk.checked = master.checked;
        }
    });
}

// INSERIDO: Configuração global do MathJax
window.MathJax = {
    tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true
    },
    options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
    }
};

/**
 * INSERIDO: Função para renderizar o LaTeX em elementos carregados dinamicamente
 * Chame esta função sempre que o conteúdo de um card for alterado via JS.
 */
function renderizarMath() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch((err) => console.log('Erro ao renderizar Math:', err));
    }
}

function renderMarkup(str) {
    if (!str) return "";

    // 1. Definição das Tags de Bloco (Sensores de Interrupção)
    const tagsBloco = /<\/?(table|thead|tbody|tr|th|td|ul|ol|li|h[1-6]|hr|div|p|blockquote|small|section|header|footer)[^>]*>/gi;
    
    let resultado = "";
    let emParagrafo = false;
    let nivelNesting = 0;

    // 2. Split mantendo as tags. O segredo está em limpar o array de resíduos vazios.
    const partes = str.split(/(<\/?(?:table|thead|tbody|tr|th|td|ul|ol|li|h[1-6]|hr|div|p|blockquote|small|section|header|footer)[^>]*>)/gi);

    partes.forEach(parte => {
        if (parte === undefined) return;

        // Identifica se a parte atual é uma tag de bloco
        const ehTagBloco = parte.match(tagsBloco);

        if (ehTagBloco) {
            // Se detectou a tag, mata o parágrafo IMEDIATAMENTE (Interrupção Forçada)
            if (emParagrafo) {
                resultado += "</p>";
                emParagrafo = false;
            }

            // Controle de profundidade para não criar <p> dentro de tabelas/listas
            if (parte.startsWith("</")) {
                nivelNesting = Math.max(0, nivelNesting - 1);
            } else if (!parte.match(/<\s*hr[^>]*>/i)) {
                nivelNesting++;
            }
            resultado += parte;
        } else {
            // Lógica de Texto: Só processa se estivermos fora de uma estrutura (Nesting == 0)
            if (nivelNesting > 0) {
                resultado += parte;
            } else {
                // Aqui tratamos os "Alarmes Falsos":
                // Se a parte contém apenas espaços ou quebras de linha, ela NÃO deve abrir um <p>
                let linhas = parte.split("\n");
                
                linhas.forEach(linha => {
                    let conteudoLimpo = linha.trim();
                    
                    if (conteudoLimpo.length > 0) {
                        if (!emParagrafo) {
                            resultado += "<p>";
                            emParagrafo = true;
                        }
                        resultado += linha;
                        /* CÓDIGO INSERIDO: Fecha o parágrafo ao final de cada linha com conteúdo para garantir a quebra de linha no HTML */
                        resultado += "</p>";
                        emParagrafo = false;
                        /* FIM DA INSERÇÃO */
                    };
                });
            }
        }
    });

    if (emParagrafo) resultado += "</p>";

    // Limpeza final de redundâncias
    return resultado.replace(/<p>\s*<\/p>/gi, "").trim();
}