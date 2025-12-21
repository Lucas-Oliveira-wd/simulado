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
  flashDb = await (await fetch(`${API}/flashcards`)).json();
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
  flashIdx = 0;
  el("fc-area-jogo").style.display = "block";
  renderCard();
}

function renderCard() {
  if (flashIdx >= flashPool.length) {
    el("fc-area-jogo").style.display = "none";
    return alert("Revisão Concluída!");
  }
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

function virarCarta() {
  el("card-ativo").classList.toggle("virado");
  if (el("card-ativo").classList.contains("virado"))
    el("fc-botoes").classList.add("visivel");
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
    qtd = el("prat-qtd").value;
  let pool = db.filter(
    (q) =>
      (dis === "" || q.disciplina === dis) &&
      (ban === "" || q.banca === ban) &&
      (ass === "" || q.assunto === ass)
  );
  if (pool.length === 0) return alert("Nenhuma questão encontrada");
  pratPool = pool.sort(() => 0.5 - Math.random()).slice(0, qtd);
  pratIdx = 0;
  pratAcertos = 0;
  el("config-pratica").style.display = "none";
  el("area-pratica").style.display = "block";
  renPratica();
}

function renPratica() {
  let q = pratPool[pratIdx];
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
          <div class="texto-apoio-box">
              <div class="texto-apoio-header">📄 Texto de Referência</div>
              <div class="texto-apoio-content">${textoFormatado}</div>
          </div>`;
  }
  
  el("prat-enunciado").innerHTML = htmlTexto + (q.imagem ? `<img ...>` : "") + q.enunciado;

  // O CSS .enunciado { white-space: pre-wrap } vai fazer os \n funcionarem aqui
  el("prat-enunciado").innerHTML = htmlImg + q.enunciado;

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

  let q = pratPool[pratIdx],
    acertou = s.value === q.gabarito,
    f = el("prat-feedback");

    let textoGab = q.gabarito;
    if (q.tipo === "CE") {
        textoGab = q.gabarito === "C" ? "Certo" : "Errado";
    }

  f.innerHTML = acertou ? "Correto! ✅" : `Errado! ❌ Gabarito: ${textoGab}`;
  f.style.background = acertou ? "#d4edda" : "#f8d7da";
  f.style.padding = "10px";
    f.style.borderRadius = "5px";
  if (acertou) {
    pratAcertos++;
  }
  let qOriginal = db.find((d) => d.id === q.id);
  if (qOriginal) {
    qOriginal.respondidas = (qOriginal.respondidas || 0) + 1;
    if (acertou) qOriginal.acertos = (qOriginal.acertos || 0) + 1;
    fetch(`${API}/questoes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qOriginal),
    });
  }
  el("prat-btn-confirma").style.display = "none";
  el("prat-btn-prox").style.display = "block";
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