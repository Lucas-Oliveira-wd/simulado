
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
  let disc = el("fc-estudo-disc").value;
  // [CÓDIGO INSERIDO] Captura os assuntos selecionados nos checkboxes múltiplos
  const assuntosMarcados = Array.from(document.querySelectorAll(".chk-fc-assunto-filtro:checked"))
                                .map(chk => normStr(chk.value));

  // Filtragem inteligente
  flashPool = flashDb.filter((f) => {
      const matchDisc = (disc === "" || normStr(f.disciplina) === normStr(disc));
      // Se nenhum assunto estiver marcado, considera todos. Se houver marcados, filtra.
      const matchAssunto = (assuntosMarcados.length === 0 || assuntosMarcados.includes(normStr(f.assunto)));
      
      return matchDisc && matchAssunto;
  });
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
                  <div class="fc-content-front-recap" style="font-size: 0.85em; opacity: 0.7; border-bottom: 1px dashed #ccc; padding-bottom: 10px; margin-bottom: 10px; font-style: italic; color: var(--sec);">
                    ${frente}
                  </div>
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

  // [CÓDIGO INSERIDO] Renderiza as fórmulas após injetar o Grid no HTML
  renderizarMath();
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


  // --- MODIFICADO: O conteúdo do verso agora concatena o conteúdo da frente no topo ---
  // --- EXCLUÍDO: el("fc-back-content").innerHTML = c.verso.replace(/\n/g, "<br>"); ---
  el("fc-back-content").innerHTML = `
    <div style="font-size: 0.85em; opacity: 0.7; border-bottom: 1px dashed #ccc; padding-bottom: 10px; margin-bottom: 10px; font-style: italic;">
        ${c.frente.replace(/\n/g, "<br>")}
    </div>
    ${c.verso.replace(/\n/g, "<br>")}
  `;
  // --- FIM DA MODIFICAÇÃO ---

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