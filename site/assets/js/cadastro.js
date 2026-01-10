// --- IMPORTAÇÃO PDF & DRAG DROP ---
async function lerPDF() {
  let lista = el("imp-lista-questoes");
  if (lista && lista.children.length > 0)
    if (!confirm("Substituir lista atual?")) return;
  
  let inp = el("imp-file");
  if (inp.files.length === 0) return alert("Selecione PDF");

  let fd = new FormData();
  fd.append("file", inp.files[0]);

  /*Envia a flag do modo prova para o backend */
  let isProva = el("imp-modo-prova").checked;

  let disciplinaAlvo = el("imp-disciplina").value;
  if (!isProva && !disciplinaAlvo) return alert("Selecione a disciplina!");
  fd.append("disciplina", disciplinaAlvo);
  fd.append("is_prova", isProva);

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
    /* [CÓDIGO INSERIDO] - Define a disciplina que veio do processamento */
    let disciplinaLinha = q.disciplina || el("imp-disciplina").value;

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

/**
 * Visualização de questões ainda não salvas na aba Importar
 * CODIGO MODIFICADO: Ajustado para ler diretamente dos inputs da linha e evitar erro de 'null'
 */
function abrirPopupPreviewReal(idx) {
    const row = document.getElementById('imp-row-' + idx);
    if (!row) return;

    // CAPTURA DE DADOS DOS INPUTS (Igual à sua estrutura original de classes)
    const enunciado = row.querySelector('.imp-enunciado').value;
    const gab = row.querySelector('.imp-gabarito').value;
    const coment = row.querySelector('.imp-comentario').value;
    const fileInput = row.querySelector('.imp-imagem-file');

    // CÓDIGO INSERIDO: Inicialização da variável imgHtml
    let imgHtml = "";

    // CÓDIGO MODIFICADO: Atribuição correta do let e tratamento da imagem local
    if (fileInput && fileInput.files && fileInput.files[0]) {
        const urlTemp = URL.createObjectURL(fileInput.files[0]);
        imgHtml = `<img src="${urlTemp}" style="max-width:100%; height:auto; margin: 15px 0; border: 1px solid #ccc; display:block;" onload="URL.revokeObjectURL(this.src)">`;
    }

    // CODIGO INSERIDO: Identifica se é Certo/Errado (CE) ou Múltipla Escolha (ME)
    // Verifica se o campo da alternativa B está vazio para definir o tipo
    const campoB = row.querySelector('.imp-alt-b');
    const isCE = (gab === "C" || gab === "E") && (!campoB || campoB.value.trim() === "");

    let altsHtml = "";
    if (!isCE) {
        ['a', 'b', 'c', 'd', 'e'].forEach(l => {
            const campoAlt = row.querySelector('.imp-alt-' + l);
            if (campoAlt && campoAlt.value.trim() !== "") {
                const destaque = gab.toUpperCase() === l.toUpperCase() ? "color: var(--green); font-weight: bold;" : "";
                altsHtml += `<p style="white-space: pre-wrap; ${destaque}"><strong>${l.toUpperCase()})</strong> ${campoAlt.value}</p>`;
            }
        });
    } else {
        const gabExtenso = (gab === "C") ? "Certo" : "Errado";
        altsHtml = `<p style="color: var(--green); font-weight: bold;">Gabarito: ${gabExtenso}</p>`;
    }

    // CODIGO MODIFICADO: Garante que o modal e o container existam para evitar erro de 'null'
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

    /* CODIGO EXCLUIDO (Causa do erro de null se o ID não existir no HTML):
    el("visualiza-id-title").innerText = q.id;
    */

    el("conteudo-renderizado").innerHTML = `
        ${imgHtml}
        <div class="preview-q-enunciado" style="margin-bottom:20px; line-height:1.6; white-space: pre-wrap;">${enunciado}</div>
        <div class="preview-q-alternativas" style="margin-bottom:20px;">${altsHtml}</div>
        <div class="preview-q-comentarios" style="margin-top:20px; padding-top:10px; border-top:1px dashed #ccc;">
            <strong>Comentários:</strong><br>${coment}
        </div>
    `;

    el("modal-visualizacao-real").style.display = "flex";
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
  let disc = r.querySelector(".imp-disciplina-ind").value || el("imp-disciplina").value;

  if (!disc) return alert("Digite/Selecione a Disciplina base.");
  let assuntoFinal =
    r.querySelector(".imp-assunto-ind").value ||
    el("imp-assunto").value ||
    "Geral";

  const formData = new FormData();
  formData.append("disciplina", disc);
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