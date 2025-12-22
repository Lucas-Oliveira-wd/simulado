// --- FLASHCARDS ---
function initFC() {
  toggleModeFC("estudo");
}

function toggleModeFC(modo) {
  el("fc-modo-gerenciar").style.display =
    modo === "gerenciar" ? "block" : "none";
  el("fc-modo-estudo").style.display = modo === "estudo" ? "block" : "none";
  if (modo === "gerenciar") renderListaFC();
}

function renderListaFC() {
  let div = el("fc-lista"),
    filtro = el("fc-filtro-ger").value.toLowerCase();
  div.innerHTML = "";
  flashDb
    .filter(
      (f) =>
        f.frente.toLowerCase().includes(filtro) ||
        f.verso.toLowerCase().includes(filtro)
    )
    .forEach((f) => {
      div.innerHTML += `<div class="fc-item-lista"><div style="flex-grow:1" onclick="editarFC('${
        f.id
      }')"><div style="font-weight:bold; font-size:0.85em; color:var(--sec)">${
        f.disciplina
      } > ${f.assunto}</div><div>${f.frente.substring(
        0,
        40
      )}...</div></div><button class="btn-icon" style="color:red" onclick="delFC('${
        f.id
      }')">✖</button></div>`;
    });
}

function editarFC(id) {
  let f = flashDb.find((x) => String(x.id) === String(id));
  if (!f) return;
  el("fc-id").value = f.id;
  el("fc-disciplina").value = f.disciplina;
  carregarAssuntos("fc");
  el("fc-assunto").value = f.assunto;
  el("fc-frente").value = f.frente;
  el("fc-verso").value = f.verso;
  el("fc-titulo-form").innerText = "Editar Cartão";
}

function limparFormFC() {
  el("fc-form").reset();
  el("fc-id").value = "";
  el("fc-titulo-form").innerText = "Novo Cartão";
}
async function delFC(id) {
  if (confirm("Excluir Flashcard?")) {
    await fetch(`${API}/flashcards/${id}`, { method: "DELETE" });
    flashDb = await (await fetch(`${API}/flashcards`)).json();
    renderListaFC();
  }
}
el("fc-form").onsubmit = async (e) => {
  e.preventDefault();
  let obj = {
    id: el("fc-id").value,
    disciplina: el("fc-disciplina").value,
    assunto: el("fc-assunto").value,
    frente: el("fc-frente").value,
    verso: el("fc-verso").value,
  };
  let method = obj.id ? "PUT" : "POST";
  await fetch(`${API}/flashcards`, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  flashDb = await (await fetch(`${API}/flashcards?t=${Date.now()}`)).json();
  limparFormFC();
  renderListaFC();
  alert("Salvo!");
  init();
};

function iniciarEstudoFC() {
  let disc = el("fc-estudo-disc").value,
    ass = el("fc-estudo-assunto").value;
  flashPool = flashDb.filter(
    (f) =>
      (disc === "" || f.disciplina === disc) &&
      (ass === "" || f.assunto === ass)
  );
  if (flashPool.length === 0) return alert("Nenhum cartão encontrado.");
  flashPool = flashPool.sort(() => 0.5 - Math.random());

  // Mostra a área
  el("fc-area-jogo").style.display = "block";
  el("fc-botoes").classList.add("ocultar-botoes-globais"); // Esconde os botões de baixo

  // Renderiza a Grade
  renderGrid();

}

function renderGrid() {
  let container = el("fc-area-jogo");
  
  // Cria o cabeçalho de progresso
  let html = `<h3 id="fc-progresso" style="margin-bottom:20px; text-align:center">Revisando ${flashPool.length} cartões</h3>`;
  
  // Abre o container do Grid
  html += `<div class="fc-grid-container">`;

  flashPool.forEach((c, index) => {
      // --- Lógica do Alfinete Aleatório Inline ---
      const posicoes = ["0%", "25%", "50%", "75%", "100%"];
      const posRandom = posicoes[Math.floor(Math.random() * posicoes.length)];
      const styleAlfinete = `background-position: center ${posRandom}`;
      // -------------------------------------------

      // Formata quebras de linha
      let frente = c.frente.replace(/\n/g, "<br>");
      let verso = c.verso.replace(/\n/g, "<br>");

      html += `
      <div class="fc-card-wrapper" id="card-${index}" onclick="virarCartaGrid(this)">
          <div class="flip-card-inner">

          <div class="alfinetes" style="${styleAlfinete}"></div>    

              <div class="flip-card-front">
                  
                  <span class="fc-tag">${c.disciplina} > ${c.assunto}</span>
                  <div class="fc-content-front">${frente}</div>
                  <span style="font-size:0.8rem; color:#999; margin-top:auto; display:block; padding-top:20px">(Clique para virar)</span>
              </div>

              <div class="flip-card-back">
                  <div class="fc-content-back">${verso}</div>
                  
                  <div class="fc-botoes-internos" onclick="event.stopPropagation()">
                      <button class="btn-acao" style="background:#e74c3c; width:auto" onclick="respGrid('${c.id}', false, ${index})">Errei 😓</button>
                      <button class="btn-acao" style="background:#27ae60; width:auto" onclick="respGrid('${c.id}', true, ${index})">Acertei 🤩</button>
                  </div>
              </div>

          </div>
      </div>`;
  });

  html += `</div>`; // Fecha Grid
  container.innerHTML = html;
}

function renderCard() {
  if (flashIdx >= flashPool.length) {
    el("fc-area-jogo").style.display = "none";
    return alert("Revisão Concluída!");
  }

  // --- LÓGICA DO ALFINETE ALEATÓRIO ---
  const pinoEl = el("alfinetes"); // Certifique-se que a div tem id="alfinetes"
  if (pinoEl) {
      // As 5 posições verticais possíveis (0%, 25%, 50%, 75%, 100%)
      const posicoes = ["0%", "25%", "50%", "75%", "100%"];
      
      // Sorteia um índice de 0 a 4
      const indiceAleatorio = Math.floor(Math.random() * posicoes.length);
      
      // Aplica a posição: Center (horizontal) + Posição Sorteada (vertical)
      pinoEl.style.backgroundPosition = `center ${posicoes[indiceAleatorio]}`;
  }
  // -------------------------------------

  let c = flashPool[flashIdx];
  el("fc-progresso").innerText = `Cartão ${flashIdx + 1} de ${
    flashPool.length
  }`;
  el("fc-front-tag").innerText = `${c.disciplina} > ${c.assunto}`;
  el("fc-front-content").innerHTML = c.frente.replace(/\n/g, "<br>");
  el("fc-back-content").innerHTML = c.verso.replace(/\n/g, "<br>");
  el("card-ativo").classList.remove("virado");
  el("fc-botoes").classList.remove("visivel");
}

function virarCartaGrid(elemento) {
    let inner = elemento.querySelector(".flip-card-inner");
    elemento.classList.toggle("virado");
}

function virarCarta() {
  el("card-ativo").classList.toggle("virado");
  if (el("card-ativo").classList.contains("virado"))
    el("fc-botoes").classList.add("visivel");
}

async function respGrid(id, acertou, index) {
  // 1. Atualiza no servidor (sem await para ser rápido visualmente)
  let c = flashDb.find(x => String(x.id) === String(id));
  if(c) {
      c[acertou ? "acertos" : "erros"]++;
      fetch(`${API}/flashcards`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
      });
  }

  // 2. Efeito visual de "Concluído"
  let cardDiv = el(`card-${index}`);
  
  // Animação de saída
  cardDiv.style.transition = "all 0.5s ease";
  cardDiv.style.transform = "scale(0.8)";
  cardDiv.style.opacity = "0";

  // Remove do DOM após animação
  setTimeout(() => {
      cardDiv.remove();
      
      // Atualiza contagem
      let restantes = document.querySelectorAll('.fc-card-wrapper').length;
      // Se ainda tem cartas, atualiza o texto
      if (restantes > 0) {
        el("fc-progresso").innerText = `Restam ${restantes} cartões`;
      } else {
        alert("Revisão Concluída! 🎉");
        el("fc-area-jogo").style.display = "none"; // <--- A CORREÇÃO: Esconde a mesa
      }
  }, 500);
}

async function respFC(acertou) {
  let c = flashPool[flashIdx];
  c[acertou ? "acertos" : "erros"]++;
  await fetch(`${API}/flashcards`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(c),
  });
  flashIdx++;
  renderCard();
}

// --- MODO PRATICAR ---

function prepPratica() {
  el("config-pratica").style.display = "block";
  el("area-pratica").style.display = "none";
}

function iniciarPratica() {
  let dis = el("prat-disciplina").value,
    ban = el("prat-banca").value,
    ass = el("prat-assunto").value,
    qtd = parseInt(el("prat-qtd").value);

  let pool = db.filter(
    (q) =>
      (dis === "" || q.disciplina === dis) &&
      (ban === "" || q.banca === ban) &&
      (ass === "" || q.assunto === ass)
  );

  if (pool.length === 0) return alert("Nenhuma questão encontrada");

  // Primeiro embaralha agrupado, DEPOIS corta a quantidade
  let poolOrdenado = embaralharAgrupado(pool);

  pratPool = poolOrdenado.slice(0, qtd);

  pratIdx = 0;
  pratAcertos = 0;
  el("config-pratica").style.display = "none";
  el("area-pratica").style.display = "block";
  renPratica();
}

function renPratica() {
  let q = pratPool[pratIdx];

  // --- LÓGICA DE CONTAGEM DO TEXTO ---
  let htmlAvisoTexto = "";
  
  if (q.texto_apoio && q.texto_conteudo) {
      // Conta quantas questões NO POOL ATUAL (pratPool) pertencem a esse mesmo texto
      let questoesDoTexto = pratPool.filter(x => x.texto_apoio === q.texto_apoio);
      let totalDoTexto = questoesDoTexto.length;
      
      // Descobre qual é a posição desta questão dentro do grupo do texto
      // (Ex: Esta é a 2ª questão de 5 sobre este texto)
      let indiceNoGrupo = questoesDoTexto.findIndex(x => x.id === q.id) + 1;

      if (totalDoTexto > 1) {
          htmlAvisoTexto = `<div style="background:#e8f6f3; color:#16a085; padding:5px 10px; border-radius:4px; font-size:0.85em; margin-bottom:10px; display:inline-block; border:1px solid #a3e4d7;">
              📖 Questão <b>${indiceNoGrupo}</b> de <b>${totalDoTexto}</b> vinculadas a este texto
          </div>`;
      }
  }
  // -----------------------------------

  el("prat-progresso").innerText = `Questão ${pratIdx + 1} de ${
    pratPool.length
  }`;
  el("prat-meta").innerHTML = `<b>${q.banca}</b> (${q.ano || "-"}) | ${
    q.instituicao || "-"
  } | ${q.disciplina} > ${q.assunto}`;

  let htmlImg = q.imagem
    ? `<img src="${API}/img/q_img/${q.imagem}" class="questao-img">`
    : "";

  let htmlTexto = "";
  // Note que usamos "texto_conteudo", que foi injetado pelo backend via JOIN
  if (q.texto_conteudo) { 
      let textoFormatado = q.texto_conteudo.replace(/\n/g, '<br>');
      htmlTexto = `
          <div class="texto-apoio-box" style="background:#fdfdfd; border-left:4px solid var(--primary); padding:15px; margin-bottom:20px; border-radius:4px; box-shadow:0 2px 5px rgba(0,0,0,0.05)">
              <div class="texto-apoio-header" style="font-weight:bold; color:var(--primary); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                  <span>📄 Texto de Referência</span>
                  ${htmlAvisoTexto} </div>
              <div class="texto-apoio-content" style="max-height:300px; overflow-y:auto; line-height:1.6; font-family:'Georgia', serif; color:#444;">
                  ${textoFormatado}
              </div>
          </div>`;
  }
  
  el("prat-enunciado").innerHTML = htmlTexto + htmlImg + `<div style="font-size:1.1em; line-height:1.5">${q.enunciado}</div>`;

  let div = el("prat-alternativas");
  div.innerHTML = "";

  if (q.tipo === "CE") {
    radio(div, "C", "Certo", "prat");
    radio(div, "E", "Errado", "prat");
  } else {
    ["A", "B", "C", "D", "E"].forEach((l) => {
      if (q[`alt_${l.toLowerCase()}`])
        radio(div, l, q[`alt_${l.toLowerCase()}`], "prat");
    });
  }

  el("prat-feedback").innerHTML = "";
  el("prat-feedback").style.background = "transparent";
  el("prat-btn-confirma").style.display = "block";
  el("prat-btn-prox").style.display = "none";

  // Rola para o topo da questão suavemente (importante se o texto for longo)
  el("area-pratica").scrollIntoView({ behavior: 'smooth' });
}

function radio(d, v, t, n) {
  d.innerHTML += `<div class="alternativa-wrapper" onclick="selecionarAlternativa(this, '${n}', '${v}')"><span class="btn-riscar" onclick="event.stopPropagation();this.parentElement.classList.toggle('riscado-ativo')">✖</span><input type="radio" name="${n}" value="${v}" style="margin:0 10px; pointer-events:none"><span class="render-html">${v}) ${t}</span></div>`;
}
function selecionarAlternativa(elWrapper, name, val) {
  document
    .querySelectorAll(`input[name='${name}']`)
    .forEach((i) => (i.checked = false));
  document
    .querySelectorAll(`#area-${name} .alternativa-wrapper`)
    .forEach((e) => e.classList.remove("selected"));
  elWrapper.classList.add("selected");
  elWrapper.querySelector("input").checked = true;
  if (name === "prova") provaRespostas[provaIdx] = val;
}
function confirmaPratica() {
  let s = document.querySelector('input[name="prat"]:checked');
  if (!s) return alert("Selecione");

  let q = pratPool[pratIdx], acertou = s.value === q.gabarito;

  // --- LÓGICA MODO CEGO ---
  let modoCego = el("prat-modo-cego").checked;
  
  if (modoCego) {
      // No modo cego, apenas registra, não dá feedback visual
      if (acertou) pratAcertos++;
      // Pula direto para a lógica de salvar progresso silenciosamente
      salvarProgressoQuestao(q, acertou);
      proxPratica(); 
      return; // Sai da função para não mostrar feedback visual
  }
  // -------------------------

  let f = el("prat-feedback");
  let textoGab = q.gabarito;
  if (q.tipo === "CE") {
      textoGab = q.gabarito === "C" ? "Certo" : "Errado";
  }

  f.innerHTML = acertou ? "Correto! ✅" : `Errado! ❌ Gabarito: ${textoGab}`;


  f.style.background = acertou ? "#d4edda" : "#f8d7da";
  f.style.color = "#000"; // Força preto para legibilidade no feedback
  f.style.padding = "10px";
  f.style.borderRadius = "5px";

  // Botões de Ação Extras (Flashcard e Comentários)
  let htmlBotoes = "";
  
  // Botão de Comentários (sempre aparece, para ver explicação)
  htmlBotoes += `<button class="btn-padrao" onclick="abrirComentarioPratica()" style="margin-right:10px; margin-top:10px;">💬 Comentários / Ver PDF</button>`;

  // Botão de Criar Flashcard (Se errou ou se quiser revisar)
  if (!acertou) {
      htmlBotoes += `<button class="btn-padrao" onclick="criarFlashcardDoErro()" style="background:#e67e22; color:white; margin-top:10px;">⚡ Criar Flashcard do Erro</button>`;
  }

  // Insere os botões no feedback
  f.innerHTML += `<div style="margin-top:5px">${htmlBotoes}</div>`;

  if (acertou) {
    pratAcertos++;
  }

  salvarProgressoQuestao(q, acertou);

  el("prat-btn-confirma").style.display = "none";
  el("prat-btn-prox").style.display = "block";
}

function salvarProgressoQuestao(q, acertou) {
  // Busca a referência original para atualizar no banco
  let qOriginal = db.find((d) => d.id === q.id);
  if (qOriginal) {
      qOriginal.respondidas = (qOriginal.respondidas || 0) + 1;
      if (acertou) qOriginal.acertos = (qOriginal.acertos || 0) + 1;
      
      // Salva silenciosamente
      fetch(`${API}/questoes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(qOriginal),
      });
  }
}

// Lógica de Comentários
let questaoAtualComent = null;

function abrirComentarioPratica() {
  questaoAtualComent = pratPool[pratIdx]; // Pega a questão atual
  el("modal-comentario").style.display = "block";
  
  let texto = questaoAtualComent.comentarios || "Nenhum comentário registrado.";
  el("view-comentario").innerHTML = texto.replace(/\n/g, "<br>");
  
  // Reseta estado de edição
  el("view-comentario").style.display = "block";
  el("edit-comentario").style.display = "none";
  el("btn-salvar-coment").style.display = "none";
  el("btn-editar-coment").style.display = "inline-block";
}

function habilitarEdicaoComent() {
  el("view-comentario").style.display = "none";
  el("edit-comentario").style.display = "block";
  el("edit-comentario").value = questaoAtualComent.comentarios || "";
  el("btn-salvar-coment").style.display = "inline-block";
  el("btn-editar-coment").style.display = "none";
}

async function salvarComentarioApi() {
  let novoComent = el("edit-comentario").value;
  
  // Atualiza localmente
  questaoAtualComent.comentarios = novoComent;
  
  // Atualiza no DB principal (memória)
  let qNoDb = db.find(q => q.id === questaoAtualComent.id);
  if(qNoDb) qNoDb.comentarios = novoComent;

  // Envia para o servidor
  await fetch(`${API}/questoes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qNoDb || questaoAtualComent),
  });

  // Atualiza visualização
  el("view-comentario").innerHTML = novoComent.replace(/\n/g, "<br>");
  el("view-comentario").style.display = "block";
  el("edit-comentario").style.display = "none";
  el("btn-salvar-coment").style.display = "none";
  el("btn-editar-coment").style.display = "inline-block";
}

// Flashcard Rápido a partir do Erro
function criarFlashcardDoErro() {
  let q = pratPool[pratIdx];
  
  // Prepara o modal de Flashcards
  toggleModeFC('gerenciar'); // Vai para a tela de flashcards
  nav('flashcards'); // Troca a aba visualmente
  
  // Preenche o formulário automaticamente
  el("fc-disciplina").value = q.disciplina;
  carregarAssuntos("fc"); // Dispara carregamento (pode precisar de um delay pequeno)
  
  setTimeout(() => {
      el("fc-assunto").value = q.assunto;
  }, 100);
  
  // Frente: O Enunciado da Questão
  el("fc-frente").value = `[Questão de Erro]\n${q.banca} - ${q.instituicao}\n\n${q.enunciado}`;
  
  // Verso: O Gabarito + Comentário (se houver)
  let txtVerso = `Gabarito: ${q.gabarito}\n\n`;
  if(q.comentarios) txtVerso += `Comentário:\n${q.comentarios}`;
  
  el("fc-verso").value = txtVerso;
  
  el("fc-titulo-form").scrollIntoView();
}

function proxPratica() {
  pratIdx++;
  if (pratIdx < pratPool.length) renPratica();
  else {
    alert(`Fim! Acertos: ${pratAcertos}/${pratPool.length}`);
    nav("praticar");
  }
}
function cancelarPratica() {
  if (confirm("Sair?")) nav("praticar");
}

// --- MODO SIMULADO / PROVA ---
function prepProva() {
  el("resultado-prova").style.display = "none";
  let dis = opcoes.disciplinas,
    div = el("lista-distribuicao");
  div.innerHTML = "";
  dis.forEach((d) => {
    div.innerHTML += `<div class="config-row" style="display:flex; gap:10px; align-items:center;"><label>${d}:</label><input type="number" class="inp-dist" data-disc="${d}" value="0" min="0" max="100" onchange="calcDistribuicao()" style="width:60px"> %</div>`;
  });
  calcDistribuicao();
}
function calcDistribuicao() {
  let total = 0;
  document
    .querySelectorAll(".inp-dist")
    .forEach((i) => (total += parseInt(i.value || 0)));
  el("total-porc").innerText = `Total: ${total}%`;
  el("total-porc").style.color = total === 100 ? "green" : "red";
}
function iniciarProva() {
  let totalPerc = 0;
  document
    .querySelectorAll(".inp-dist")
    .forEach((i) => (totalPerc += parseInt(i.value || 0)));
  if (totalPerc !== 100) return alert("A soma das porcentagens deve ser 100%");
  let qtdTotal = parseInt(el("prova-total").value);
  provaTempoTotal = parseInt(el("prova-tempo").value) * 60;
  provaPool = [];
  document.querySelectorAll(".inp-dist").forEach((i) => {
    let perc = parseInt(i.value || 0);
    if (perc > 0) {
      let disc = i.dataset.disc;
      let qtdDisc = Math.round((perc / 100) * qtdTotal);
      let questoesDisc = db
        .filter((q) => q.disciplina === disc)
        .sort(() => 0.5 - Math.random())
        .slice(0, qtdDisc);
      provaPool = provaPool.concat(questoesDisc);
    }
  });
  if (provaPool.length === 0) return alert("Nenhuma questão disponível.");
  provaPool = provaPool.sort(() => 0.5 - Math.random());
  provaIdx = 0;
  provaRespostas = [];
  el("config-prova").style.display = "none";
  el("area-prova").style.display = "block";
  el("barra-tempo-container").style.display = "block";
  iniciarTimer();
  renProva();
}
function iniciarTimer() {
  let tempoRestante = provaTempoTotal;
  if (provaIntervalo) clearInterval(provaIntervalo);
  provaIntervalo = setInterval(() => {
    tempoRestante--;
    let min = Math.floor(tempoRestante / 60),
      sec = tempoRestante % 60;
    el("prova-timer").innerText = `${min}:${sec < 10 ? "0" + sec : sec}`;
    el("barra-tempo-fill").style.width = `${
      (tempoRestante / provaTempoTotal) * 100
    }%`;
    if (tempoRestante <= 0) {
      clearInterval(provaIntervalo);
      finalizarProva();
    }
  }, 1000);
}
function renProva() {
  let q = provaPool[provaIdx];
  el("prova-progresso").innerText = `Questão ${provaIdx + 1} de ${
    provaPool.length
  }`;
  el("prova-meta").innerText = `${q.banca} (${q.ano || "-"}) | ${
    q.instituicao || "-"
  } | ${q.disciplina} > ${q.assunto}`;
  let htmlImg = q.imagem
    ? `<img src="${API}/img/q_img/${q.imagem}" class="questao-img">`
    : "";
  el("prova-enunciado").innerHTML = htmlImg + q.enunciado;
  let div = el("prova-alternativas");
  div.innerHTML = "";
  let respSalva = provaRespostas[provaIdx] || null;
  if (q.tipo === "CE") {
    radioProva(div, "C", "Certo", respSalva);
    radioProva(div, "E", "Errado", respSalva);
  } else
    ["A", "B", "C", "D", "E"].forEach((l) => {
      if (q[`alt_${l.toLowerCase()}`])
        radioProva(div, l, q[`alt_${l.toLowerCase()}`], respSalva);
    });
}
function radioProva(div, val, txt, selecionado) {
  let cls = selecionado === val ? "selected" : "";
  div.innerHTML += `<div class="alternativa-wrapper ${cls}" onclick="selecionarAlternativa(this, 'prova', '${val}')"><span class="btn-riscar" onclick="event.stopPropagation();this.parentElement.classList.toggle('riscado-ativo')">✖</span><input type="radio" name="prova" value="${val}" ${
    selecionado === val ? "checked" : ""
  } style="margin:0 10px; pointer-events:none"><span class="render-html">${val}) ${txt}</span></div>`;
}
function proxProva() {
  provaIdx++;
  if (provaIdx < provaPool.length) {
    renProva();
  } else {
    if (confirm("Finalizar Prova?")) finalizarProva();
    else provaIdx--;
  }
}
function finalizarProva() {
  clearInterval(provaIntervalo);
  el("area-prova").style.display = "none";
  el("resultado-prova").style.display = "block";
  let acertos = 0;
  let html = "<ul style='list-style:none; padding:0'>";
  let acertosPorDisc = {};
  provaPool.forEach((q, i) => {
    let resp = provaRespostas[i],
      correta = q.gabarito,
      isCorrect = resp === correta;
    if (isCorrect) acertos++;
    if (!acertosPorDisc[q.disciplina])
      acertosPorDisc[q.disciplina] = { total: 0, acertos: 0 };
    acertosPorDisc[q.disciplina].total++;
    if (isCorrect) acertosPorDisc[q.disciplina].acertos++;
    let realQ = db.find((d) => d.id === q.id);
    if (realQ) {
      realQ.respondidas = (realQ.respondidas || 0) + 1;
      if (isCorrect) realQ.acertos = (realQ.acertos || 0) + 1;
      fetch(`${API}/questoes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(realQ),
      });
    }
    html += `<li style="margin-bottom:10px; border-bottom:1px solid #eee; padding:5px;"><b>Q${i+1} (${q.disciplina}):</b> Sua: <b style="color:${isCorrect ? "green" : "red"}">${resp || "-"}</b> | Gab: <b>${correta}</b></li>`;
  });
  let discHtml =
    '<h3>Desempenho por Disciplina</h3><ul style="list-style:none; padding:0;">';
  for (const disc in acertosPorDisc) {
    let stats = acertosPorDisc[disc];
    let perc = (stats.acertos / stats.total) * 100;
    discHtml += `<li style="margin-bottom:5px;"><b>${disc}:</b> ${
      stats.acertos
    } / ${stats.total} (${perc.toFixed(1)}%)</li>`;
  }
  discHtml += "</ul>";
  el("nota-prova").innerText = `${acertos}/${provaPool.length}`;
  el("msg-prova").innerText =
    acertos / provaPool.length >= 0.7
      ? "Aprovado! 🚀"
      : "Continue Estudando 📚";
  el("detalhes-prova").innerHTML = discHtml + html;
  init();
}

// --- ESTATÍSTICAS ---
function graf() {
  renderGraficoNivel("disciplina");
}

function renderGraficoNivel(nivel, filtroDisciplina = null) {
  let ctx = el("chart").getContext("2d");
  
  // Destrói gráfico anterior se existir para evitar sobreposição
  if (window.myChart) window.myChart.destroy();

  // Controle de Interface (Botão Voltar e Título)
  let btnVoltar = el("btn-voltar-estatistica");
  let titulo = el("titulo-estatistica");

  if (nivel === "disciplina") {
      btnVoltar.style.display = "none";
      titulo.innerText = "Desempenho por Disciplina";
  } else {
      btnVoltar.style.display = "block";
      titulo.innerText = `Detalhes: ${filtroDisciplina}`;
  }

  // 1. Processamento dos Dados
  let stats = {};
  
  db.forEach((q) => {
      // Se estamos vendo assuntos, ignora questões de outras disciplinas
      if (nivel === "assunto" && q.disciplina !== filtroDisciplina) return;

      // Define a chave de agrupamento (Nome da Disciplina ou Nome do Assunto)
      let chave = (nivel === "disciplina") ? q.disciplina : q.assunto;
      if (!chave) chave = "Indefinido";

      if (!stats[chave]) stats[chave] = { r: 0, a: 0 };
      stats[chave].r += (q.respondidas || 0);
      stats[chave].a += (q.acertos || 0);
  });

  // 2. Preparação para o Chart.js
  let labels = [], data = [], colors = [];
  
  // Ordena por porcentagem de acertos (opcional, mas fica melhor visualmente)
  let sortedKeys = Object.keys(stats).sort((a, b) => {
      let pA = stats[a].r > 0 ? (stats[a].a / stats[a].r) : 0;
      let pB = stats[b].r > 0 ? (stats[b].a / stats[b].r) : 0;
      return pB - pA; // Decrescente
  });

  for (let k of sortedKeys) {
      if (stats[k].r > 0) { // Só mostra se tiver respostas
          labels.push(k);
          let p = (stats[k].a / stats[k].r) * 100;
          data.push(p.toFixed(1));
          
          // Cores: Verde (>=70%), Amarelo (>=50%), Vermelho (<50%)
          if (p >= 70) colors.push("#27ae60");
          else if (p >= 50) colors.push("#f1c40f");
          else colors.push("#e74c3c");
      }
  }

  // 3. Renderização
  window.myChart = new Chart(ctx, {
      type: "bar",
      data: {
          labels: labels,
          datasets: [{ 
              label: "% de Acertos", 
              data: data, 
              backgroundColor: colors,
              borderWidth: 1
          }],
      },
      options: {
          responsive: true,
          scales: { y: { beginAtZero: true, max: 100 } },
          plugins: {
              tooltip: {
                  callbacks: {
                      label: function(context) {
                          let label = context.dataset.label || '';
                          let val = context.parsed.y;
                          let key = context.label;
                          let total = stats[key].r;
                          let acertos = stats[key].a;
                          return `${val}% (${acertos}/${total} questões)`;
                      }
                  }
              }
          },
          // EVENTO DE CLIQUE NAS BARRAS
          onClick: (e, elements) => {
              if (nivel === "disciplina" && elements.length > 0) {
                  let index = elements[0].index;
                  let disciplinaClicada = labels[index];
                  
                  // Chama a função recursivamente para o nível de assunto
                  renderGraficoNivel("assunto", disciplinaClicada);
              }
          },
          // Muda o cursor para "mãozinha" quando passa em cima de uma barra clicável
          onHover: (event, chartElement) => {
              if (nivel === "disciplina") {
                  event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
              } else {
                  event.native.target.style.cursor = 'default';
              }
          }
      }
  });
}

function abrirCriadorFlashcard(elementoBotao) {
  // 1. Limpa os campos (Manual, como você pediu)
  document.getElementById('modal-front').value = "";
  document.getElementById('modal-back').value = "";
  document.getElementById('modal-tag').value = ""; 

  // 2. Exibe o Modal
  const overlay = document.getElementById('modal-flashcard-overlay');
  overlay.style.display = 'flex';

  // 3. Inicializa o arraste (Drag)
  arrastarElemento(document.getElementById("modal-janela"));
}

// Função para tornar a janela arrastável
function arrastarElemento(elmnt) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  // O header é onde clicamos para arrastar
  if (document.getElementById("modal-header")) {
      document.getElementById("modal-header").onmousedown = dragMouseDown;
  } else {
      elmnt.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Pega posição inicial do mouse
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // Calcula nova posição
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // Define a nova posição do elemento
      elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
      
      // Remove centralização automática do flexbox ao começar a arrastar
      elmnt.style.position = "absolute"; 
      // (Opcional) Ajusta transform se necessário, mas absolute costuma bastar
  }

  function closeDragElement() {
      // Para de mover ao soltar o mouse
      document.onmouseup = null;
      document.onmousemove = null;
  }
}

// Função auxiliar para embaralhar mantendo grupos de Texto de Apoio juntos
function embaralharAgrupado(listaQuestoes) {
  let grupos = {};
  let semTexto = [];

  // 1. Separa quem tem texto de quem não tem
  listaQuestoes.forEach(q => {
      if (q.texto_apoio) {
          // Se já existe o grupo desse texto, adiciona; senão cria.
          if (!grupos[q.texto_apoio]) {
              grupos[q.texto_apoio] = [];
          }
          grupos[q.texto_apoio].push(q);
      } else {
          // Questões soltas ficam num array separado temporariamente
          semTexto.push(q);
      }
  });

  // 2. Transforma os itens sem texto em "grupos de um só" para o sorteio
  // (Para que elas se misturem entre os blocos de texto)
  semTexto.forEach(q => {
      // Usa um ID único temporário como chave
      grupos['isolada_' + q.id] = [q];
  });

  // 3. Pega as chaves (IDs dos textos e das isoladas) e embaralha AS CHAVES
  let chaves = Object.keys(grupos);
  chaves.sort(() => 0.5 - Math.random());

  // 4. Reconstrói a lista plana na nova ordem
  let listaFinal = [];
  chaves.forEach(chave => {
      // Opcional: Embaralhar as questões DENTRO do mesmo texto também?
      // Se quiser ordem aleatória dentro do texto, descomente a linha abaixo:
      // grupos[chave].sort(() => 0.5 - Math.random());
      
      listaFinal.push(...grupos[chave]);
  });

  return listaFinal;
}