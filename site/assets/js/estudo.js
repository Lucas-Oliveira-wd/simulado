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
                  <span style="font-size:0.8rem; margin-top:auto; display:block; padding-top:20px">(Clique para virar)</span>
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

// Abre o modal preenchendo com os dados da questão atual
function prepararNotaFlashcard() {
    const qAtual = pratPool[pratIdx];
    if (!qAtual) return;

    // Preenche a frente com o enunciado e o verso com o comentário/gabarito
    el("fc-p-frente").value = qAtual.enunciado;
    el("fc-p-verso").value = `Gabarito: ${qAtual.gabarito}\n\n${qAtual.comentarios || ''}`;
    
    el("modal-fc-pratica").style.display = "flex";
}

// Salva via API sem mudar de página
async function salvarFlashcardRapido() {
    const payload = {
        disciplina: pratPool[pratIdx].disciplina,
        assunto: pratPool[pratIdx].assunto,
        frente: el("fc-p-frente").value,
        verso: el("fc-p-verso").value
    };

    try {
        const resp = await fetch(`${API}/flashcards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (resp.ok) {
            alert("✅ Flashcard salvo com sucesso!");
            el('modal-fc-pratica').style.display = 'none';
        }
    } catch (e) {
        alert("Erro ao salvar card.");
    }
}

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
          htmlAvisoTexto = `<div>
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
    // Mapeia linhas para parágrafos com classe CSS, mantendo quebras vazias
    let textoFormatado = q.texto_conteudo
      .split('\n')
      .map(linha => {
          if (linha.trim() !== '') {
              // Usa a classe .texto-paragrafo definida no CSS
              return `<p class="texto-paragrafo">${linha}</p>`;
          } else {
              return '<br>';
          }
      })
      .join('');
    
    htmlTexto = `
        <div class="texto-apoio-box">
            <div class="texto-apoio-header">
              <div class="texto-header-info">
                  <span class="texto-label">📄 Texto de Referência</span>
                  <span class="texto-titulo">${(q.texto_titulo || '').trim() || 'Sem Título'}</span>
              </div>
              ${htmlAvisoTexto} 
            </div>
            <div class="texto-apoio-content">
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

  // O botão de Anotar aparece SEMPRE (acerto ou erro)
  let htmlBotoes = `<div style="margin-top:10px; display:flex; gap:10px;">`;
  htmlBotoes += `<button class="btn-padrao" onclick="abrirComentarioPratica()">💬 Explicação / PDF</button>`;
  htmlBotoes += `<button class="btn-padrao" onclick="abrirModalAnotacao()" style="background:var(--purple); color:white;">📓 Anotar</button>`;
  htmlBotoes += `</div>`;
  

  // Insere os botões no feedback
  f.innerHTML += `<div style="margin-top:5px">${htmlBotoes}</div>`;

  if (acertou) {
    pratAcertos++;
  }

  salvarProgressoQuestao(q, acertou);

  el("prat-btn-confirma").style.display = "none";
  el("prat-btn-prox").style.display = "block";
}

// Funções de Suporte ao Caderno
function abrirModalAnotacao() {
    const q = pratPool[pratIdx];
    el("anotacao-info-questao").innerText = `Questão ID: ${q.id} | ${q.disciplina} > ${q.assunto}`;
    el("nota-texto").value = ""; 
    el("modal-anotacao").style.display = "flex";
    el("nota-texto").focus();
}

async function enviarParaCaderno() {
    const q = pratPool[pratIdx];
    const nota = el("nota-texto").value;

    if(!nota.trim()) return alert("Escreva algo para anotar.");

    const payload = {
        questao_id: q.id,
        disciplina: q.disciplina,
        assunto: q.assunto,
        anotacao: nota
    };

    try {
        const resp = await fetch(`${API}/anotacoes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (resp.ok) {
            alert("📓 Anotação salva com sucesso!");
            el("modal-anotacao").style.display = "none";
        }
    } catch (e) {
        alert("Erro ao salvar anotação.");
    }
};

let cacheAnotacoes = [];

async function carregarCaderno() {
    const div = el("lista-anotacoes");
    div.innerHTML = "<p>Carregando anotações...</p>";
    
    try {
        const resp = await fetch(`${API}/anotacoes`);
        cacheAnotacoes = await resp.json();
        renderizarCaderno();
    } catch (e) {
        div.innerHTML = "<p style='color:red'>Erro ao carregar o arquivo de anotações.</p>";
    }
}

function renderizarCaderno() {
    const div = el("lista-anotacoes");
    const filtro = el("busca-caderno").value.toLowerCase();
    
    const notasFiltradas = cacheAnotacoes.filter(n => 
        String(n.texto).toLowerCase().includes(filtro) || 
        String(n.assunto).toLowerCase().includes(filtro) ||
        String(n.disciplina).toLowerCase().includes(filtro)
    );

    if (notasFiltradas.length === 0) {
        div.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:#999;'>Nenhuma anotação encontrada.</p>";
        return;
    }

    const coresPinos = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71'];

    div.innerHTML = notasFiltradas.map((n, index) => {
        const corPino = coresPinos[index % coresPinos.length];
        return `
        <div class="nota-bloco" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div class="alfinete-nota" style="background: ${corPino}"></div>
            
            <div class="nota-header">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="font-weight:bold; color:var(--acc); font-size:0.9rem">#${n.id}</span>
                    <small style="color:#999; font-size:0.7rem">${n.data}</small>
                </div>
                <small style="color:var(--purple); font-weight:bold; text-transform: uppercase; display:block; margin-top:5px">${n.disciplina}</small>
                <strong style="display:block; margin-bottom:10px; font-size:1rem; color:var(--sec)">${n.assunto}</strong>
            </div>

            <div class="nota-corpo" style="flex-grow: 1; margin: 10px 0; border-top: 1px dashed #eee; padding-top:10px;">
                <div style="">${n.texto}</div>
            </div>

            <div class="nota-footer" style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid #f0f0f0; padding-top:10px; margin-top:10px">
                <small style="color:#bbb">Q-ID: ${n.q_id}</small>
                <div class="nota-acoes">
                    <button class="btn-icon" onclick="visualizarQuestaoBanco('${n.q_id}')" title="Ver Questão Original">👁️</button>
                    <button class="btn-icon" onclick="prepararEdicaoNota(${index})" title="Editar Anotação" style="color:#f39c12">✏️</button>
                    <button class="btn-icon" onclick="excluirNota('${n.id}')" title="Excluir" style="color:#e74c3c">🗑️</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function excluirNota(idUnico) {
    if(!confirm("Deseja remover esta anotação permanentemente?")) return;
    try {
        const resp = await fetch(`${API}/anotacoes`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: idUnico })
        });

        const resJson = await resp.json();

        if (resp.ok) {
            // Recarrega o quadro imediatamente após a confirmação do servidor
            await carregarCaderno(); 
            console.log("Anotação removida!");
        } else {
            alert("Erro do Servidor: " + (resJson.erro || "Falha desconhecida"));
        }
    } catch (e) {
        alert("Erro de conexão ao tentar excluir.");
    }
}

function prepararEdicaoNota(index) {
    const n = cacheAnotacoes[index];
    // Reutiliza o modal de anotação
    el("anotacao-info-questao").innerText = `Editando Nota - ID: ${n.q_id}`;
    el("nota-texto").value = n.texto;
    el("modal-anotacao").style.display = "flex";
    
    // Altera o comportamento do botão salvar para ser uma edição
    const btnSalvar = document.querySelector("#modal-anotacao .btn-prim");
    btnSalvar.onclick = async () => {
        const novoTexto = el("nota-texto").value;
        await fetch(`${API}/anotacoes`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: n.data, questao_id: n.q_id, anotacao: novoTexto })
        });
        el("modal-anotacao").style.display = "none";
        carregarCaderno();
    };
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

      // 2. Registra o log individual no histórico cronológico
      fetch(`${API}/historico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questao_id: q.id,
          disciplina: q.disciplina,
          assunto: q.assunto,
          acertou: acertou
        }),
      }).catch(err => console.error("Erro ao registrar no histórico:", err));
  }
};

let chartEvolucao = null;

async function renderizarHistoricoStats() {
    try {
        const resp = await fetch(`${API}/historico`);
        const logs = await resp.json();

        if (!logs.length) return;

        // 1. Processamento de Dados: Agrupar por Data
        const dadosPorDia = {};
        logs.forEach(log => {
            // Extrai apenas a data (DD/MM/YYYY) descartando a hora
            const dataPura = log.data.split(' ')[0]; 
            if (!dadosPorDia[dataPura]) {
                dadosPorDia[dataPura] = { respondidas: 0, acertos: 0 };
            }
            dadosPorDia[dataPura].respondidas++;
            dadosPorDia[dataPura].acertos += log.resultado; // Soma 0 ou 1
        });

        const labels = Object.keys(dadosPorDia);
        const valores = labels.map(d => ((dadosPorDia[d].acertos / dadosPorDia[d].respondidas) * 100).toFixed(1));

        // 2. Renderizar Gráfico de Linha (Evolução)
        const ctx = document.getElementById('chart-evolucao').getContext('2d');
        if (chartEvolucao) chartEvolucao.destroy();

        chartEvolucao = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '% de Acerto Diário',
                    data: valores,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });

        // 3. Preencher Tabela de Últimas Respostas
        const tbody = document.querySelector("#tabela-historico-recente tbody");
        tbody.innerHTML = logs.slice(-10).reverse().map(log => `
            <tr>
                <td style="padding: 8px;">${log.data}</td>
                <td>${log.q_id}</td>
                <td>${log.disciplina}</td>
                <td>${log.assunto}</td>
                <td style="font-weight:bold; color: ${log.resultado ? 'var(--green)' : 'var(--red)'}">
                    ${log.resultado ? 'Acertou' : 'Errou'}
                </td>
            </tr>
        `).join('');

    } catch (e) { console.error("Erro nas estatísticas históricas:", e); }
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

// Função auxiliar: Calcula estatísticas globais de acerto do banco
// Função auxiliar: Calcula quartis IGNORANDO 0% e 100%
// Se não sobrar dados (só tem 0 ou 100), usa padrão 25/50/75.
function calcularQuartisGlobais() {
  let statsPorAssunto = {};

  // 1. Agrupa acertos e erros por Assunto
  db.forEach(q => {
    if (!q.respondidas || q.respondidas === 0) return;
    
    let chave = q.assunto || "Geral";
    if (!statsPorAssunto[chave]) statsPorAssunto[chave] = { r: 0, a: 0 };
    statsPorAssunto[chave].r += q.respondidas;
    statsPorAssunto[chave].a += q.acertos;
});

  // 2. Calcula as taxas brutas
  let taxasBrutas = Object.values(statsPorAssunto).map(s => (s.a / s.r) * 100);

  // 3. FILTRO DE EXTREMOS
  // Mantém apenas o que está ENTRE 0 e 100 (exclusivo)
  let dataset = taxasBrutas.filter(t => t > 0 && t < 100);

  // Ordena
  dataset.sort((a, b) => a - b);

  // 4. Lógica de Fallback Simplificada
  // Se não sobrar nada (significa que todos os assuntos eram 0% ou 100%),
  // retornamos a escala padrão visualmente agradável.
  if (dataset.length === 0) {
    return { q1: 25, med: 50, q3: 75 };
  }

  // 5. Calcula Quartis nos dados filtrados
  const q1 = dataset[Math.floor(dataset.length * 0.25)];
  const med = dataset[Math.floor(dataset.length * 0.50)];
  const q3 = dataset[Math.floor(dataset.length * 0.75)];

  return { q1, med, q3 };
}

// Função para gerar cor dinâmica (Gradiente: Vermelho -> Amarelo -> Verde)
function getCorGradiente(porcentagem, stats) {
  // Se não passar stats, usa padrão fixo (segurança)
  const q1 = stats ? stats.q1 : 25;
  const med = stats ? stats.med : 50;
  const q3 = stats ? stats.q3 : 75;

  const vermelho = { r: 255, g: 0, b: 0 }; 
  const amarelo = { r: 255, g: 255, b: 0 };  
  const verde = { r: 0, g: 255, b: 0 };    

  // 1. Abaixo do 1º Quartil: Vermelho Sólido (Zona Crítica)
  if (porcentagem <= q1) return `rgb(${vermelho.r}, ${vermelho.g}, ${vermelho.b})`;

  // 2. Acima do 3º Quartil: Verde Sólido (Zona de Excelência)
  if (porcentagem >= q3) return `rgb(${verde.r}, ${verde.g}, ${verde.b})`;

  let inicio, fim, fator;

  // 3. Gradiente Vermelho -> Amarelo (Entre Q1 e Mediana)
  if (porcentagem < med) {
      inicio = vermelho;
      fim = amarelo;
      // Normaliza onde a porcentagem está entre Q1 e Med
      fator = (porcentagem - q1) / (med - q1);
  } 
  // 4. Gradiente Amarelo -> Verde (Entre Mediana e Q3)
  else {
      inicio = amarelo;
      fim = verde;
      // Normaliza onde a porcentagem está entre Med e Q3
      fator = (porcentagem - med) / (q3 - med);
  }

  // Interpolação Linear
  const r = Math.round(inicio.r + (fim.r - inicio.r) * fator);
  const g = Math.round(inicio.g + (fim.g - inicio.g) * fator);
  const b = Math.round(inicio.b + (fim.b - inicio.b) * fator);

  return `rgb(${r}, ${g}, ${b})`;
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

  let statsGlobais = calcularQuartisGlobais();

  // Atualiza a legenda na tela
  el("legenda-quartis").innerHTML = `
    <strong>Parâmetros Calculados do Banco:</strong><br>
    <span style="color:#c0392b">🔴 Zona Crítica (Q1): Abaixo de ${statsGlobais.q1.toFixed(1)}%</span> &nbsp;|&nbsp; 
    <span style="color:#f39c12">🟡 Mediana: ${statsGlobais.med.toFixed(1)}%</span> &nbsp;|&nbsp; 
    <span style="color:#27ae60">🟢 Excelência (Q3): Acima de ${statsGlobais.q3.toFixed(1)}%</span>
`;

  for (let k of sortedKeys) {
    if (stats[k].r > 0) { // Só mostra se tiver respostas
      labels.push(k);
      let p = (stats[k].a / stats[k].r) * 100;
      data.push(p.toFixed(1));
      
      // Passa os stats para a função de cor
      colors.push(getCorGradiente(p, statsGlobais));
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