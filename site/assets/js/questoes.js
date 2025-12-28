// VARIÁVEIS GLOBAIS DE PAGINAÇÃO
let paginaAtual = 1;
let totalPaginas = 1;

let filtroCache = {}; // Guarda o filtro atual para navegação

// Variável global para cache de textos
let cacheTextos = [];

// 1. Função para carregar textos do servidor e preencher os Selects
async function carregarListaTextos() {
  try {
      const res = await fetch(`${API}/textos`);
      cacheTextos = await res.json();

      // --- ORDENAÇÃO ALFABÉTICA (A-Z) ---
      cacheTextos.sort((a, b) => {
          let nomeA = (a.titulo || "").toLowerCase();
          let nomeB = (b.titulo || "").toLowerCase();
          return nomeA.localeCompare(nomeB); // Ordena de forma inteligente
      });
      
      // Atualiza todos os selects de texto (cadastro e edição)
      document.querySelectorAll('.sel-texto-apoio').forEach(sel => {
          let valorAtual = sel.value; // Tenta manter seleção se houver
          sel.innerHTML = `<option value="">-- Sem Texto de Apoio --</option>`;

          cacheTextos.forEach(t => {
              // Mostra os primeiros 60 caracteres no dropdown
              let resumo = t.titulo + " - " + t.conteudo.substring(0, 50).replace(/\n/g, " ") + "...";
              sel.innerHTML += `<option value="${t.id}">${resumo}</option>`;
          });

          // Restaura o valor selecionado se ele ainda existir na lista
          if(valorAtual) sel.value = valorAtual;
          
          // Adiciona evento para mostrar preview
          sel.onchange = function() {
              let txt = cacheTextos.find(x => x.id === this.value);

              // Procura a div de preview correspondente (subindo para o pai comum)
              let container = this.closest('.input-group') || this.parentElement.parentElement;
              let divPrev = container.querySelector('.preview-texto-apoio');

              if(divPrev) {
                  divPrev.innerText = txt ? txt.conteudo.substring(0, 150) + "..." : "";
              }
          }
      });
  } catch (e) { console.error("Erro ao carregar textos", e); }
}

// 2. Funções do Modal de Novo Texto
function abrirModalTexto(id = null) {
    if (id) {
        const t = cacheTextos.find(x => String(x.id) === String(id));
        if (!t) return;
        
        el("edit-texto-id").value = t.id;
        el("novo-texto-titulo").value = t.titulo;
        el("novo-texto-conteudo").value = t.conteudo;
        el("titulo-modal-texto").innerText = "Editar Texto ID: " + t.id;
    } else {
        // Limpa para novo cadastro
        el("edit-texto-id").value = "";
        el("novo-texto-titulo").value = "";
        el("novo-texto-conteudo").value = "";
        el("titulo-modal-texto").innerText = "Cadastrar Novo Texto";
    }
    el('modal-novo-texto').style.display = 'block';
}

async function salvarNovoTextoApi() {
  const id = el("edit-texto-id").value;
  
  // Captura os valores brutos para salvar
  const tituloRaw = el("novo-texto-titulo").value;
  const conteudoRaw = el("novo-texto-conteudo").value;
    
  // Usa o .trim() apenas para validação, mas mantém o dado bruto
  if (!tituloRaw.trim() || !conteudoRaw.trim()) {
      return alert("Preencha o título e o conteúdo do texto.");
  }


  // O payload agora recebe as variáveis sem o tratamento de trim
  const payload = { 
      titulo: tituloRaw, 
      conteudo: conteudoRaw 
  };

  const metodo = id ? "PUT" : "POST";
  if (id) payload.id = id;

  try {
    const resp = await fetch(`${API}/textos`, {
        method: metodo,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    
    if(resp.ok) {
      alert("Texto salvo com sucesso!");
      el('modal-novo-texto').style.display = 'none';
      
      const res = await fetch(`${API}/textos`);
      cacheTextos = await res.json();
      
      if (typeof renderListaTextos === "function") renderListaTextos();

    } else {
      const err = await resp.json();
      alert("Erro: " + (err.erro || "Falha ao processar requisição"));
    }
      
  } catch(e) {
    console.error("Erro ao salvar texto:", e);
    alert("Erro de conexão com o servidor.");;
  }
}


// --- IMPORTAÇÃO PDF & DRAG DROP ---
async function lerPDF() {
  let lista = el("imp-lista-questoes");
  if (lista && lista.children.length > 0)
    if (!confirm("Substituir lista atual?")) return;
  
  let inp = el("imp-file");
  if (inp.files.length === 0) return alert("Selecione PDF");

  let fd = new FormData();
  fd.append("file", inp.files[0]);

  let disciplinaAlvo = el("imp-disciplina").value;
  if (!disciplinaAlvo) return alert("Selecione a disciplina!");
  fd.append("disciplina", disciplinaAlvo);

  el("imp-preview-container").style.display = "none";
  el("imp-lista-questoes").innerHTML = "";
  showLoader("Lendo PDF...");

  try {
    let r = await fetch(`${API}/upload-pdf`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("Erro na resposta do servidor");

    let questoes = await r.json();

    renderPreview(questoes);

    atualizarTodosSelectsTexto();

  } catch (e) {
    alert("Erro ao ler PDF.");
  } finally {
    hideLoader();
  }
}

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

function renderPreview(lista) {
  let div = el("imp-lista-questoes");
  div.innerHTML = "";
  el("imp-titulo-preview").innerText = `Prévia (${lista.length})`;
  el("imp-preview-container").style.display = "block";

  let globalAssunto = el("imp-assunto").value;

  lista.forEach((q, i) => {
    let statusHtml = q.ja_cadastrada
      ? `<span class="aviso-dup">⚠️ Já Cadastrada</span>`
      : "";
    let classeRow = q.ja_cadastrada ? "imp-row ja-cadastrada" : "imp-row";
    let optionsGab = `<option value="">?</option>`;
    let letrasGabarito = (q.tipo === "CE") ? ["C", "E"] : ["A", "B", "C", "D", "E"]

    letrasGabarito.forEach((l) => {
      let sel = q.gabarito === l ? "selected" : "";
      optionsGab += `<option value="${l}" ${sel}>${l}</option>`;
    });

    let areaAlternativas = "";
    if (q.tipo === "CE") {
        areaAlternativas = `<div class="area-alternativas-ce" style="padding:10px; color:#555; font-style:italic">Questão do tipo Certo/Errado (Sem alternativas A-E)</div>`;
    } else {
        areaAlternativas = `
        <div style="margin-top:5px; display:grid; gap:5px">
            <div class="input-group"><span>A)</span><input type="text" class="imp-alt-a" value="${q.alt_a}" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})"></div>
            <div class="input-group"><span>B)</span><input type="text" class="imp-alt-b" value="${q.alt_b}" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})"></div>
            <div class="input-group"><span>C)</span><input type="text" class="imp-alt-c" value="${q.alt_c}" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})"></div>
            <div class="input-group"><span>D)</span><input type="text" class="imp-alt-d" value="${q.alt_d}" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})"></div>
            <div class="input-group"><span>E)</span><input type="text" class="imp-alt-e" value="${q.alt_e}" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})"></div>
        </div>`;
    };

    // Se tiver assunto global digitado, usa ele. Se não, usa o que veio do Python. Se não tiver nada, "Geral".
    let assuntoFinal = globalAssunto ? globalAssunto : (q.assunto || "Geral");

    div.innerHTML += `
<div class="${classeRow}" id="imp-row-${i}">
    <div style="width:40px; font-weight:bold; text-align:center">${i + 1}<div id="status-${i}">${statusHtml}</div></div>
    <div class="imp-meta">
        <input type="text" class="imp-banca" placeholder="Banca" value="${q.banca}" list="lista-bancas">
        <input type="text" class="imp-inst" placeholder="Instituição" value="${q.instituicao}" list="lista-instituicoes" style="font-size:0.85em">
        <input type="number" class="imp-ano" placeholder="Ano" value="${q.ano}">

        <input type="text" class="imp-assunto-ind" placeholder="Assunto" value="${assuntoFinal}" list="lista-assuntos" style="font-size:0.85em; color:var(--purple)">

        <select class="imp-dif"><option value="Médio">Médio</option><option value="Fácil">Fácil</option><option value="Difícil">Difícil</option></select>

        <div class="vinculo-texto-preview" style="margin-top: 5px;">
            <select class="sel-texto-apoio imp-input" style="width:100%; font-size:0.8em; color:var(--sec);">
                <option value="">-- Vincular Texto --</option>
            </select>
        </div>
    </div>
    <div class="imp-content">
        <textarea class="imp-textarea imp-enunciado" rows="5" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})">${q.enunciado}</textarea>
        <div style="margin:5px 0"><input type="file" class="imp-imagem-file" accept="image/*" style="font-size:0.8em"></div>
        ${areaAlternativas}
        <div style="margin-top:10px">
            <label style="font-size:0.8rem; font-weight:bold; color:var(--sec)">Comentários:</label>
            <textarea class="imp-textarea imp-comentario" rows="15" style="font-size:0.85em;" onfocus="showToolbar(this)">${q.comentarios || ""}</textarea>
        </div>
    </div>
    <div class="imp-side-r">
      <div class="imp-gab"><select class="imp-gabarito">${optionsGab}</select></div>
      <div class="imp-acoes">
        <div class="imp-acoes-top">
          <button class="btn-icon" onclick="abrirPopupPreviewReal(${i})" title="Visualizar Questão Renderizada">👁️</button>
          <button class="btn-icon" style="color:#27ae60" onclick="salvarIndividual(${i})">💾</button>
          <button class="btn-icon" style="color:red" onclick="el('imp-row-${i}').remove()">✖</button>
        </div>
        <div class="imp-acoes-bottom">
          <button class="btn-icon" style="color:var(--purple); font-size: 0.7rem; font-weight: bold;" 
                  onclick="preencherPadraoFigura(${i}, 'UPPER')" title="Preencher: Figura A)">FIG</button>
          
          <button class="btn-icon" style="color:var(--purple); font-size: 0.7rem; font-weight: bold;" 
                  onclick="preencherPadraoFigura(${i}, 'lower')" title="Preencher: Figura a)">fig</button>
        </div>
        
      </div>
    </div>
    
    

</div>`;
  });
  atualizarTodosSelectsTexto();
}

function abrirPopupPreviewReal(index) {
    const row = el(`imp-row-${index}`);
    const enunciado = row.querySelector(".imp-enunciado").value;
    const comentarios = row.querySelector(".imp-comentario").value;
    const tipo = row.querySelector(".area-alternativas-ce") ? "CE" : "ME";
    const fileInput = row.querySelector(".imp-imagem-file");

    let imgHtml = "";

    // 2. Monta o HTML das alternativas
    let altsHtml = "";
    if (tipo === "ME") {
        ["a", "b", "c", "d", "e"].forEach(letra => {
            const val = row.querySelector(`.imp-alt-${letra}`).value;
            if (val && val.value) {
              altsHtml += `<p><strong>${letra.toUpperCase()})</strong> ${val}</p>`
          };
        });
    } else {
        altsHtml = `<p><em>Questão de Certo ou Errado</em></p>`;
    }

    // 3. Função interna para montar e mostrar o popup (será chamada com ou sem imagem)
    const mostrarPopup = () => {
        // Cria o container do modal se não existir
        if (!el("modal-visualizacao-real")) {
            const m = document.createElement("div");
            m.id = "modal-visualizacao-real";
            m.className = "modal-overlay";
            m.innerHTML = `
                <div class="modal-content" style="max-width:800px; max-height:90vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:10px; margin-bottom:15px;">
                        <h3 style="margin:0">Visualização Renderizada (Tags Ativas)</h3>
                        <button onclick="el('modal-visualizacao-real').style.display='none'" class="btn-icon" style="font-size:1.5rem">✖</button>
                    </div>
                    <div id="conteudo-renderizado"></div>
                </div>`;
            document.body.appendChild(m);
        }

        // Inserir o conteúdo, incluindo a imagem se houver
        el("conteudo-renderizado").innerHTML = `
            <div class="preview-q-enunciado" style="margin-bottom:20px; line-height:1.6; white-space: pre-wrap;">${enunciado}</div>
            ${imgHtml} <div class="preview-q-alternativas" style="margin-bottom:20px;">${altsHtml}</div>
            <div class="preview-q-comentarios">
                <strong>Comentários:</strong><br>${comentarios}
            </div>
        `;
        el("modal-visualizacao-real").style.display = "flex";
    };

    // 4. Lógica Principal: Verifica se há imagem para carregar
    if (fileInput && fileInput.files && fileInput.files[0]) {
        // Se houver arquivo, usa o FileReader para ler e gerar a prévia
        const reader = new FileReader();
        reader.onload = function(e) {
            // Cria a tag <img> com o resultado da leitura (data URL)
            imgHtml = `<img src="${e.target.result}" style="max-width:100%; height:auto; margin: 15px 0; border: 1px solid #ccc; display:block;">`;
            // Só mostra o popup DEPOIS que a imagem foi lida
            mostrarPopup();
        };
        // Inicia a leitura do arquivo
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        // Se não houver imagem, mostra o popup imediatamente
        mostrarPopup();
    }
}

function verificarDuplicidadeDinamica(index) {
  clearTimeout(checkDupTimeout);
  checkDupTimeout = setTimeout(async () => {
    let row = el(`imp-row-${index}`);
    let enunciado = row.querySelector(".imp-enunciado").value;
    let iA = row.querySelector(".imp-alt-a");
    let iB = row.querySelector(".imp-alt-b");
    let iC = row.querySelector(".imp-alt-c");
    let iD = row.querySelector(".imp-alt-d");
    let iE = row.querySelector(".imp-alt-e");
    let payload = {
      enunciado: enunciado,
      alt_a: iA ? iA.value : "",
      alt_b: iB ? iB.value : "",
      alt_c: iC ? iC.value : "",
      alt_d: iD ? iD.value : "",
      alt_e: iE ? iE.value : ""
    };

    if (!payload.enunciado) return;

    try {
      const resp = await fetch(`${API}/check-duplicidade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await resp.json();
      
      // Atualiza o feedback visual e textual
      el(`status-${index}`).innerHTML = data.existe
        ? `<span class="aviso-dup">⚠️ Já Cadastrada</span>`
        : "";
      
      row.classList.toggle("ja-cadastrada", data.existe);
      
    } catch (e) {
      console.error("Erro na verificação de duplicidade:", e);
    }
  }, 200);
}

function preencherPadraoFigura(index, format) {
    const row = el(`imp-row-${index}`);
    if (!row) return;

    // Define as letras de acordo com a escolha do usuário
    const letras = format === 'UPPER' 
        ? ['A', 'B', 'C', 'D', 'E'] 
        : ['a', 'b', 'c', 'd', 'e'];

    // Localiza e preenche cada campo de alternativa
    letras.forEach((letra, i) => {
        const char = String.fromCharCode(65 + i).toLowerCase(); // mapeia a, b, c, d, e para a classe CSS
        const input = row.querySelector(`.imp-alt-${char}`);
        if (input) {
            input.value = `Figura ${letra})`;
        }
    });

    // Dispara a verificação de duplicidade para atualizar a assinatura da questão
    verificarDuplicidadeDinamica(index);
}

async function salvarIndividual(index) {
  let r = el(`imp-row-${index}`);
  let disc = el("imp-disciplina").value;
  if (!disc) return alert("Digite/Selecione a Disciplina base.");
  let assuntoFinal =
    r.querySelector(".imp-assunto-ind").value ||
    el("imp-assunto").value ||
    "Geral";

  const formData = new FormData();
  formData.append("banca", r.querySelector(".imp-banca").value);
  formData.append("instituicao", r.querySelector(".imp-inst").value);
  formData.append("ano", r.querySelector(".imp-ano").value);
  formData.append("dificuldade", r.querySelector(".imp-dif").value);
  formData.append("enunciado", r.querySelector(".imp-enunciado").value);
  formData.append("comentarios", r.querySelector(".imp-comentario").value);

  // ---  Só lê as alternativas se o input existir ---
  let iA = r.querySelector(".imp-alt-a"),
    iB = r.querySelector(".imp-alt-b");
  let iC = r.querySelector(".imp-alt-c"),
    iD = r.querySelector(".imp-alt-d"),
    iE = r.querySelector(".imp-alt-e");

  formData.append("alt_a", iA ? iA.value : "");
  formData.append("alt_b", iB ? iB.value : "");
  formData.append("alt_c", iC ? iC.value : "");
  formData.append("alt_d", iD ? iD.value : "");
  formData.append("alt_e", iE ? iE.value : "");

  formData.append("gabarito", r.querySelector(".imp-gabarito").value);

  let tipoDetectado = iA ? "ME" : "CE"; //Detecta o tipo de questão
  formData.append("tipo", tipoDetectado);

  formData.append("disciplina", disc);
  formData.append("assunto", assuntoFinal);

  // Captura o texto de apoio SELECIONADO NA LINHA ATUAL
  let selectTexto = r.querySelector(".sel-texto-apoio");
  formData.append("texto_apoio", selectTexto ? selectTexto.value : "");

  let fileInput = r.querySelector(".imp-imagem-file");
  if (fileInput && fileInput.files[0])
    formData.append("imagem_file", fileInput.files[0]);

  if (!formData.get("enunciado") || !formData.get("gabarito"))
    return alert("Dados incompletos.");

  try {
    const response = await fetch(`${API}/questoes`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      r.classList.add("sucesso-salvo");
      r.querySelector(
        ".imp-acoes"
      ).innerHTML = `<span style="color:green; font-weight:bold">Salva!</span>`;
      init();
    } else if (response.status === 409) {
      alert("Duplicada!");
    } else {
      alert("Erro ao salvar.");
    }
  } catch (e) {
    alert("Erro conexao");
  }
}

function setupDragDrop() {
  const dropZone = el("area-drop");
  const fileInput = el("imp-file");
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => dropZone.classList.add("drag-over"),
      false
    );
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => dropZone.classList.remove("drag-over"),
      false
    );
  });
  dropZone.addEventListener("drop", handleDrop, false);
  function handleDrop(e) {
    let dt = e.dataTransfer;
    let files = dt.files;
    if (files.length > 0) {
      fileInput.files = files;
    }
  }
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

el("form-cadastro").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append("banca", el("cad-banca").value);
  formData.append("instituicao", el("cad-instituicao").value);
  formData.append("ano", el("cad-ano").value);
  formData.append("enunciado", el("cad-enunciado").value);
  formData.append("disciplina", el("cad-disciplina").value);
  formData.append("assunto", el("cad-assunto").value);
  formData.append("dificuldade", el("cad-dificuldade").value);
  formData.append("tipo", el("cad-tipo").value);
  formData.append("gabarito", el("cad-gabarito").value);
  formData.append("comentarios", el("cad-comentario").value);
  formData.append("texto_apoio", document.querySelector("#form-cadastro .sel-texto-apoio").value);
  formData.append("alt_a", el("cad-alt-a").value);
  formData.append("alt_b", el("cad-alt-b").value);
  formData.append("alt_c", el("cad-alt-c").value);
  formData.append("alt_d", el("cad-alt-d").value);
  formData.append("alt_e", el("cad-alt-e").value);
  let fileInput = el("cad-imagem");
  if (fileInput.files[0]) formData.append("imagem_file", fileInput.files[0]);
  try {
    const r = await fetch(`${API}/questoes`, {
      method: "POST",
      body: formData,
    });
    if (r.status === 409) return alert("Duplicada!");
    if (r.ok) {
      alert("Salvo!");
      e.target.reset();
      fileInput.value = "";
      altTipo("cad");
      init();
    } else throw new Error();
  } catch (err) {
    alert("Erro ao salvar.");
  }
};

async function carrTab(pagina = 1) {
  paginaAtual = pagina; // Atualiza a global

  // Captura os filtros atuais
  let txt = el("busca-texto").value;
  let ban = el("busca-banca").value;
  let inst = el("busca-instituicao").value;
  let dis = el("busca-disciplina").value;
  let ass = el("busca-assunto").value;
  let dif = el("busca-dificuldade").value;

  // Monta Query String
  let params = new URLSearchParams({
      page: pagina,
      texto: txt,
      banca: ban,
      instituicao: inst,
      disciplina: dis,
      assunto: ass,
      dificuldade: dif
  });

  try {
      showLoader("Carregando...");
      const res = await fetch(`${API}/questoes?${params.toString()}`);
      const data = await res.json();
      
      // Se a API retornar lista pura (modo antigo), converte para objeto
      let lista = Array.isArray(data) ? data : data.items;
      let total = Array.isArray(data) ? data.length : data.total;

      // ATUALIZA O TOTAL DE PÁGINAS GLOBALMENTE
      totalPaginas = Array.isArray(data) ? 1 : data.total_paginas;

      renderizarTabela(lista);
      atualizarControlesPaginacao(total);
      
  } catch (e) {
      console.error(e);
      alert("Erro ao carregar tabela.");
  } finally {
      hideLoader();
  }
}

/**
 * Alterna entre a visão de Questões e Textos na aba Banco
 * CODIGO INSERIDO
 */
function alternarVisaoBanco(visao) {
    const contQuestoes = document.getElementById('container-questoes-banco');
    const contTextos = document.getElementById('container-gerenciador-textos');
    const btnQ = document.getElementById('btn-tab-questoes');
    const btnT = document.getElementById('btn-tab-textos');


    // Verificação de segurança para evitar erro de 'null'
    if (!contQuestoes || !contTextos) {
        console.error("Erro: Containers do banco não encontrados no HTML. Verifique os IDs 'container-questoes-banco' e 'container-gerenciador-textos'.");
        return;
    }

    if (visao === 'questoes') {
        contQuestoes.style.display = 'block';
        contTextos.style.display = 'none';
        // Adiciona classe de destaque se os botões existirem
        if (btnQ) btnQ.classList.add('active');
        if (btnT) btnT.classList.remove('active');
    } else {
        contQuestoes.style.display = 'none';
        contTextos.style.display = 'block';
        if (btnQ) btnQ.classList.remove('active');
        if (btnT) btnT.classList.add('active');
        
        // Chama a renderização da lista de textos
        if (typeof renderListaTextos === "function") {
            renderListaTextos();
        }
    }
    
}

/**
 * Renderiza a lista de textos no corpo da tabela
 * CODIGO INSERIDO
 */
function renderListaTextos() {
    const busca = document.getElementById("busca-texto-banco").value.toLowerCase();
    const tbody = document.getElementById("corpo-tabela-textos");
    tbody.innerHTML = "";

    const filtrados = cacheTextos.filter(t => 
        String(t.id).includes(busca) || 
        t.titulo.toLowerCase().includes(busca) ||
        t.conteudo.toLowerCase().includes(busca)
    );

    filtrados.forEach(t => {
        const previa = t.conteudo.length > 100 ? t.conteudo.substring(0, 100) + "..." : t.conteudo;
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

function renderizarTabela(lista) {
  let tb = document.querySelector("#tabela-questoes tbody");
  tb.innerHTML = "";
  
  if (lista.length === 0) {
      tb.innerHTML = "<tr><td colspan='10' style='text-align:center; padding:20px'>Nenhuma questão encontrada.</td></tr>";
      return;
  }

  lista.forEach((q) => {
      let difClass = q.dificuldade === "Fácil" ? "color-facil" : q.dificuldade === "Médio" ? "color-medio" : "color-dificil";
      let dots = q.dificuldade === "Fácil" ? "●" : q.dificuldade === "Médio" ? "●●" : "●●●";
      
      tb.innerHTML += `<tr>
          <td>${q.id}</td>
          <td>${q.data_insercao || '-'}</td>
          <td>${q.banca || '-'}</td>
          <td>${q.instituicao || "-"}</td>
          <td>${q.ano || "-"}</td>
          <td>${q.disciplina || '-'}</td>
          <td title="${(q.enunciado||'').replace(/"/g, "&quot;")}">${(q.enunciado||'').substring(0, 40)}...</td>
          <td>${q.assunto || '-'}</td>
          <td style="text-align:center"><span class="dots ${difClass}">${dots}</span></td>
          <td>${q.gabarito}</td>
          <td>
            <div class="tab-action-top">
              <button class="btn-icon" onclick="visualizarQuestaoBanco('${q.id}')" title="Visualizar Renderizada">👁️</button>
              <button class="btn-icon" onclick="abrirCopy('${q.id}')" title="Copiar como Nova">📋</button>
            </div>
            <div class="tab-action-bottom">
              <button class="btn-icon" onclick="abrirEd('${q.id}')">✏️</button>
              <button class="btn-icon" onclick="del('${q.id}')">🗑️</button>
            </div>
          </td>
      </tr>`;
  });
}

function visualizarQuestaoBanco(id) {
    // Busca a questão no banco de dados local (memória)
    const q = db.find(x => String(x.id) === String(id));
    if (!q) return;

    // Monta a imagem se ela existir no servidor
    let imgHtml = q.imagem 
        ? `<img src="${API}/img/q_img/${q.imagem}" style="max-width:100%; height:auto; margin: 15px 0; border: 1px solid #ccc; display:block;">` 
        : "";

    // Monta as alternativas
    let altsHtml = "";
    if (q.tipo === "ME") {
        ["a", "b", "c", "d", "e"].forEach(l => {
            if (q[`alt_${l}`]) {
                const destaque = q.gabarito === l.toUpperCase() ? "color: var(--green); font-weight: bold;" : "";
                altsHtml += `<p style="white-space: pre-wrap; ${destaque}"><strong>${l.toUpperCase()})</strong> ${q['alt_'+l]}</p>`;
            }
        });
    } else {
        const gab = q.gabarito === "C" ? "Certo" : "Errado";
        altsHtml = `<p><em>Questão de Certo ou Errado. Gabarito: <strong>${gab}</strong></em></p>`;
    }

    // Reaproveita o modal que já criamos para a Importação
    if (!el("modal-visualizacao-real")) {
        // (O código de criação do modal é o mesmo que você já tem, o sistema apenas garante que ele exista)
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

    // ATUALIZAÇÃO DO TÍTULO: Garante que o ID mude a cada clique
    el("visualiza-id-title").innerText = q.id;

    el("conteudo-renderizado").innerHTML = `
        <div style="margin-bottom:20px; line-height:1.6; white-space: pre-wrap;">${q.enunciado}</div>
        ${imgHtml}
        <div style="margin-bottom:20px;">${altsHtml}</div>
        <div class="preview-q-comentarios" style="">
            <strong>Comentários:</strong><br>${q.comentarios || "Sem comentários registrados."}
        </div>
    `;
    el("modal-visualizacao-real").style.display = "flex";
}

// Função para abrir o modal em modo Cópia
function abrirCopy(id) {
    // 1. Usa a lógica de preenchimento que você já tem para edição
    abrirEd(id);

    // 2. Pequeno delay para garantir que abrirEd terminou de preencher
    setTimeout(() => {
        // Altera o Título do Modal e a cor do Botão
        const modal = el("modal-edicao");
        modal.querySelector("h2").innerText = "Copiar Questão (Nova)";
        modal.querySelector(".btn-acao").innerText = "Salvar como Nova";
        modal.querySelector(".btn-acao").style.background = "#27ae60"; // Verde para novo

        // Trava de Segurança: Limpa ID, Gabarito e Comentários
        el("edit-id").value = ""; 
        el("edit-gabarito").value = ""; 
        el("edit-comentario-form").value = ""; 
        
        console.log("Modo cópia ativado: ID removido, pronto para salvar como nova.");
    }, 150);
}

function atualizarControlesPaginacao(totalItens) {
    el("total-db").innerText = `${totalItens} questões encontradas`;
    
    let divPag = el("paginacao-container");
    if(!divPag) return; // Se não criou a div no HTML, ignora

    divPag.innerHTML = `
        <button class="btn-pag" onclick="mudarPag(-1)" ${paginaAtual <= 1 ? 'disabled' : ''}>◀ Anterior</button>
        <span style="margin: 0 15px">Página <b>${paginaAtual}</b> de <b>${totalPaginas}</b></span>
        <button class="btn-pag" onclick="mudarPag(1)" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima ▶</button>
    `;
}

function mudarPag(delta) {
    let nova = paginaAtual + delta;
    if(nova >= 1 && nova <= totalPaginas) {
        carrTab(nova);
    }
}

function filtrar() {
  carrTab(1); // Recarrega do servidor aplicando os filtros na página 1
}

function del(id) {
  if (confirm("Excluir Questão?"))
    fetch(`${API}/questoes/${id}`, { method: "DELETE" }).then(init);
}
function ord(c) {
  ordCol.d = ordCol.c === c && ordCol.d === "asc" ? "desc" : "asc";
  ordCol.c = c;
  aplOrd();
  filtrar();
}
function aplOrd() {
  let { c, d } = ordCol;
  let m = d === "asc" ? 1 : -1;
  db.sort((a, b) => {
    let va = a[c] ? a[c].toString().toLowerCase() : "",
      vb = b[c] ? b[c].toString().toLowerCase() : "";
    if (c === "id") {
      va = parseInt(a[c]);
      vb = parseInt(b[c]);
    }
    return va < vb ? -1 * m : va > vb ? 1 * m : 0;
  });
}

function abrirEd(id) {
  const modal = el("modal-edicao");
  modal.querySelector("h2").innerText = "Editar Questão"; // Reseta o título
  modal.querySelector(".btn-acao").innerText = "Salvar Alterações";
  modal.querySelector(".btn-acao").style.background = "#f39c12"; // Cor original laranja
  
  let q = db.find((x) => String(x.id) === String(id));
  if (!q) return;
  el("edit-id").value = q.id;
  el("edit-enunciado").value = q.enunciado;
  el("edit-instituicao").value = q.instituicao || "";
  el("edit-ano").value = q.ano || "";
  el("edit-dificuldade").value = q.dificuldade;
  el("edit-tipo").value = q.tipo;
  el("edit-banca").value = q.banca;
  el("edit-disciplina").value = q.disciplina;

  // 3. Carrega assuntos e define o valor com um pequeno delay
  carregarAssuntos("edit");
  setTimeout(() => {
      el("edit-assunto").value = q.assunto;
  }, 50);

  // Seleciona o dropdown DENTRO do modal de edição
  let selTextoEdicao = document.querySelector("#form-edicao .sel-texto-apoio");
  if(selTextoEdicao) {
      selTextoEdicao.value = q.texto_apoio || ""; // Define o ID salvo ou vazio
      // Dispara evento 'change' manualmente para atualizar o preview do texto, se houver
      selTextoEdicao.dispatchEvent(new Event('change'));
  }

  altTipo("edit");
  if (q.tipo === "ME") {
    el("edit-alt-a").value = q.alt_a || "";
    el("edit-alt-b").value = q.alt_b || "";
    el("edit-alt-c").value = q.alt_c || "";
    el("edit-alt-d").value = q.alt_d || "";
    el("edit-alt-e").value = q.alt_e || "";
  }

  // Pequeno delay para garantir que o select de gabarito foi atualizado pelo altTipo
  setTimeout(() => {
      el("edit-gabarito").value = q.gabarito;
  }, 50);

  el("edit-imagem-nome").value = q.imagem || "";
  el("edit-imagem-file").value = "";
  el("edit-img-preview-container").innerHTML = q.imagem
    ? `<a href="${API}/img/q_img/${q.imagem}" target="_blank"><img src="${API}/img/q_img/${q.imagem}" class="img-preview-mini"></a>`
    : "<span style='font-size:0.8em;color:#999'>Sem imagem</span>";

  if(el("edit-comentario-form")) {
      el("edit-comentario-form").value = q.comentarios || "";
  }

  
  el("modal-edicao").style.display = "block";
}

el("form-edicao").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData();
  const idExistente = el("edit-id").value;

  // Se houver ID, enviamos (é um PUT). Se não houver, o servidor gera um novo (é um POST).
  if (idExistente) {
      formData.append("id", idExistente);
  }

  formData.append("banca", el("edit-banca").value);
  formData.append("instituicao", el("edit-instituicao").value);
  formData.append("ano", el("edit-ano").value);
  formData.append("enunciado", el("edit-enunciado").value);
  formData.append("disciplina", el("edit-disciplina").value);
  formData.append("assunto", el("edit-assunto").value);
  formData.append("dificuldade", el("edit-dificuldade").value);
  formData.append("tipo", el("edit-tipo").value);
  formData.append("gabarito", el("edit-gabarito").value);
  formData.append("comentarios", el("edit-comentario-form").value);
  formData.append("texto_apoio", document.querySelector("#form-edicao .sel-texto-apoio").value);
  formData.append("alt_a", el("edit-alt-a").value);
  formData.append("alt_b", el("edit-alt-b").value);
  formData.append("alt_c", el("edit-alt-c").value);
  formData.append("alt_d", el("edit-alt-d").value);
  formData.append("alt_e", el("edit-alt-e").value);
  formData.append("imagem", el("edit-imagem-nome").value);
  let fileInput = el("edit-imagem-file");
  if (fileInput.files[0]) formData.append("imagem_file", fileInput.files[0]);

  // DECIDE O MÉTODO: Se tem ID é PUT, se não tem é POST
  const metodo = idExistente ? "PUT" : "POST";

  try {
        const res = await fetch(`${API}/questoes`, { method: metodo, body: formData });
        if (res.ok) {
          alert(metodo === "POST" ? "Nova questão criada com sucesso!" : "Questão atualizada!");
          el("modal-edicao").style.display = "none";
          // 1. Atualiza o banco global (db) para que Praticar/Simulado vejam a mudança
          await init(); 
          
          // 2. Força a tabela a permanecer na página onde você estava
          carrTab(paginaAtual);
        } else {
          const erro = await res.json();
          alert("Erro: " + (erro.erro || "Falha na comunicação"));
        }
    } catch (err) {
        alert("Erro ao salvar.");
    }
};

// Função para replicar o assunto global em tempo real
function aplicarAssuntoGlobal() {
  let valorGlobal = el("imp-assunto").value;
  let inputsIndividuais = document.querySelectorAll(".imp-assunto-ind");

  inputsIndividuais.forEach((inp) => {
    // Só sobrescreve se o global não estiver vazio
    if (valorGlobal.trim() !== "") {
      inp.value = valorGlobal;
    }
  });
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
}
