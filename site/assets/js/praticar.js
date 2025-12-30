// VARIÁVEIS DE ESTADO
let sessaoAtiva = { pool: [], idx: 0, acertos: 0, modo: '', timer: null, tempo: 0 };

// Alterna entre Lista e Simulado na tela de configuração
function alternarInterfacePratica(modo) {
    el('prat-config-lista').style.display = modo === 'lista' ? 'block' : 'none';
    el('prat-config-simulado').style.display = modo === 'simulado' ? 'block' : 'none';
    
    if (modo === 'simulado') {
        renderizarGradeProporcao();
    }
}

// CORREÇÃO: Carrega as disciplinas para escolha de %
function renderizarGradeProporcao() {
    const div = el("lista-distribuicao-pratica");
    if (!div) return;
    div.innerHTML = "";
    opcoes.disciplinas.forEach(d => {
        div.innerHTML += `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                <label style="flex-grow:1">${d}:</label>
                <input type="number" class="inp-dist-prat" data-disc="${d}" value="0" min="0" max="100" 
                       onchange="calcTotalPorcentagemPratica()" style="width:60px"> %
            </div>`;
    });
}

function calcTotalPorcentagemPratica() {
    let t = 0;
    document.querySelectorAll(".inp-dist-prat").forEach(i => t += parseInt(i.value || 0));
    el("total-porc-pratica").innerText = `Total: ${t}%`;
    el("total-porc-pratica").style.color = t === 100 ? "var(--green)" : "var(--red)";
}


async function lancarPraticaUnificada() {
    console.log("🚀 Iniciando lançamento de estudo unificado...");
    const modoRadio = document.querySelector('input[name="modo-estudo"]:checked').value;
    let poolFinal = [];
    let tipoSessao = 'praticar';
    let tempoSegundos = 0;

    showLoader("Processando banco de dados...");

    try {
        if (modoRadio === 'lista') {
            console.log("📝 Modo: Lista de Questões");
            const filtros = {
                disciplina: el("prat-disciplina").value,
                banca: el("prat-banca").value,
                assunto: el("prat-assunto").value
            };
            const qtdTotal = parseInt(el("prat-qtd").value);

            let grade = {};
            if (filtros.disciplina) {
                grade[filtros.disciplina] = 100;
            } else {
                opcoes.disciplinas.forEach(d => grade[d] = (100 / opcoes.disciplinas.length));
            }

            console.log("📊 Grade inicial calculada. Chamando prepararPoolInteligente...");
            poolFinal = await prepararPoolInteligente(grade, qtdTotal, filtros);
            if (el("prat-modo-cego").checked) tipoSessao = 'cego';

        } else { 
            console.log("🏆 Modo: Simulado Real");
            const grade = {};
            document.querySelectorAll(".inp-dist-prat").forEach(i => {
                const p = parseInt(i.value || 0);
                if (p > 0) grade[i.dataset.disc] = p;
            });

            console.log("📊 Grade do Simulado:", grade);
            const totalPerc = Object.values(grade).reduce((a, b) => a + b, 0);
            if (totalPerc !== 100) {
                hideLoader();
                return alert("A soma das porcentagens deve ser 100%");
            }

            const qtdTotal = parseInt(el("prova-total").value);
            tempoSegundos = parseInt(el("prova-tempo").value) * 60;
            tipoSessao = 'simulado';

            poolFinal = await prepararPoolInteligente(grade, qtdTotal, { banca: "", assunto: "" });
        }

        console.log(`✅ Pool final gerado com ${poolFinal.length} questões.`);
        hideLoader();
        if (poolFinal.length === 0) return alert("Nenhuma questão encontrada.");
        iniciarSessaoExecucao(poolFinal, tipoSessao, tempoSegundos);

    } catch (err) {
        console.error("❌ Erro crítico no lançamento:", err);
        hideLoader();
        alert("Erro ao processar o banco de dados. Veja o console (F12).");
    }
}

async function prepararPoolInteligente(gradeDesejada, qtdTotal, filtrosGlobais) {
    const respHist = await fetch(`${API}/historico`);
    const logs = await respHist.json();

    const mapaHist = {};
    logs.forEach(log => {
        const [dia, mes, ano, hora] = log.data.split(/[\/\s:]/);
        const ts = new Date(ano, mes - 1, dia, hora.substring(0, 2), hora.substring(3)).getTime();
        if (!mapaHist[log.q_id]) mapaHist[log.q_id] = { ts: 0, count: 0 };
        mapaHist[log.q_id].count++;
        if (ts > mapaHist[log.q_id].ts) mapaHist[log.q_id].ts = ts;
    });

    let distribuicao = redistribuirCotas(gradeDesejada, qtdTotal, filtrosGlobais);
    let resultadoFinal = [];

    for (const [disc, alvo] of Object.entries(distribuicao)) {
        if (alvo <= 0) continue;
        console.log(`📦 Processando ${disc} (Alvo: ${alvo})`);

        const todasDaDisc = db.filter(q => 
            q.disciplina === disc &&
            (filtrosGlobais.banca === "" || q.banca === filtrosGlobais.banca) &&
            (filtrosGlobais.assunto === "" || q.assunto === filtrosGlobais.assunto)
        );

        // Agrupamento em Unidades Atômicas
        let unidades = [];
        let gruposPorTexto = new Map();
        let isoladas = [];

        todasDaDisc.forEach(q => {
            if (q.texto_apoio && q.texto_apoio !== "0") {
                if (!gruposPorTexto.has(q.texto_apoio)) gruposPorTexto.set(q.texto_apoio, []);
                gruposPorTexto.get(q.texto_apoio).push(q);
            } else isoladas.push(q);
        });

        gruposPorTexto.forEach((grupo) => {
            const stats = grupo.map(x => mapaHist[x.id] || { ts: 0, count: 0 });
            unidades.push({ tipo: 'bloco', questoes: grupo, ts: Math.min(...stats.map(s => s.ts)), count: Math.min(...stats.map(s => s.count)) });
        });

        isoladas.forEach(q => {
            const s = mapaHist[q.id] || { ts: 0, count: 0 };
            unidades.push({ tipo: 'isolada', questoes: [q], ts: s.ts, count: s.count });
        });

        let poolDisc = [];
        const inéditas = unidades.filter(u => u.count === 0).sort(() => 0.5 - Math.random());
        const respondidas = unidades.filter(u => u.count > 0);

        // Função auxiliar para gerenciar a entrada de uma unidade (pedra ou areia)
        const tentarAdicionarUnidade = (unidade, alvoDisc) => {
          let totalAtual = poolDisc.reduce((acc, item) => acc + item.questoes.length, 0);
          const qtdNovas = unidade.questoes.length;

          if (totalAtual + qtdNovas <= alvoDisc) {
            // Cabe perfeitamente
            poolDisc.push(unidade);
          } else {
            // Estouro detectado. Lógica de "Pedras e Areia":
            if (unidade.tipo === 'bloco') {
              // Tenta remover "areia" (isoladas) para salvar a "pedra" (bloco)
              while ((totalAtual + qtdNovas > alvoDisc) && poolDisc.some(u => u.tipo === 'isolada')) {
                  const idxIsolada = poolDisc.findIndex(u => u.tipo === 'isolada');
                  if (idxIsolada !== -1) {
                      poolDisc.splice(idxIsolada, 1);
                      totalAtual = poolDisc.reduce((acc, item) => acc + item.questoes.length, 0);
                  }
              }
            }

            // Após tentar limpar a areia, verifica se o bloco cabe ou se precisa ser quebrado
            if (totalAtual + qtdNovas <= alvoDisc) {
              poolDisc.push(unidade);
            } else {
              // Se ainda não cabe, quebra a unidade atual (seja bloco ou isolada) para fechar o pote
              const vagasRestantes = alvoDisc - totalAtual;
              if (vagasRestantes > 0) {
                const parteQuebrada = {
                    tipo: unidade.tipo,
                    questoes: unidade.questoes.slice(0, vagasRestantes)
                };
                poolDisc.push(parteQuebrada);
              }
            }
          }
        };
        
        
        // 1. Processamento de Inéditas com Gestão de Estouro
        for (let u of inéditas) {
          let total = poolDisc.reduce((acc, item) => acc + item.questoes.length, 0);
          if (total >= alvo) break;
          tentarAdicionarUnidade(u, alvo);
        }

        // 2. Processamento de Respondidas (Sorteio Ponderado)
        let totalAposIneditas = poolDisc.reduce((acc, item) => acc + item.questoes.length, 0);
        if (totalAposIneditas < alvo && respondidas.length > 0) {
            const tsValues = respondidas.map(u => u.ts);
            const tMin = Math.min(...tsValues), tMax = Math.max(...tsValues);
            const diff = tMax - tMin || 1;

            let candidatos = respondidas.map(u => ({ u, peso: 0.01 + (0.99 * (tMax - u.ts) / diff) }));

            while (poolDisc.reduce((acc, item) => acc + item.questoes.length, 0) < alvo && candidatos.length > 0) {
                const somaPesos = candidatos.reduce((a, b) => a + b.peso, 0);
                let r = Math.random() * somaPesos, acumulado = 0, selIdx = -1;

                for (let i = 0; i < candidatos.length; i++) {
                    acumulado += candidatos[i].peso;
                    if (r <= acumulado) { selIdx = i; break; }
                }
                if (selIdx === -1) selIdx = candidatos.length - 1;

                const selecionado = candidatos.splice(selIdx, 1)[0].u;
                tentarAdicionarUnidade(selecionado, alvo);
            }
        }

        // Concatena as questões extraídas das unidades selecionadas
        const questoesFinaisDisc = poolDisc.flatMap(u => u.questoes);
        resultadoFinal = resultadoFinal.concat(questoesFinaisDisc);
    }

    return resultadoFinal;
}

// CORREÇÃO: Função de redistribuição sem loop infinito
function redistribuirCotas(grade, total, filtros) {
    let dist = {};
    let ativos = Object.keys(grade);
    ativos.forEach(d => dist[d] = Math.round((grade[d] / 100) * total));

    let mudou = true;
    let limitador = 0; // Prevenção contra loops infinitos
    while (mudou && limitador < 50) {
        limitador++;
        mudou = false;
        let deficit = 0, comVagas = [];
        
        ativos.forEach(d => {
            const disponiveis = db.filter(q => 
                q.disciplina === d &&
                (filtros.banca === "" || q.banca === filtros.banca) &&
                (filtros.assunto === "" || q.assunto === filtros.assunto)
            ).length;

            if (dist[d] > disponiveis) {
                deficit += (dist[d] - disponiveis);
                dist[d] = disponiveis;
                mudou = true;
            } else if (dist[d] < disponiveis) {
                comVagas.push(d);
            }
        });

        if (deficit > 0 && comVagas.length > 0) {
            // CORREÇÃO: Usa o resto (%) para garantir que todo o déficit seja distribuído
            const extra = Math.floor(deficit / comVagas.length);
            const resto = deficit % comVagas.length;
            
            comVagas.forEach((d, index) => {
                dist[d] += extra + (index < resto ? 1 : 0);
            });
            mudou = extra > 0 || resto > 0;
        }
    }
    return dist;
}



async function iniciarSessaoExecucao(lista, modo, segundos) {
    if (!lista.length) return alert("Nenhuma questão encontrada.");
    
    // Agrupa por texto de apoio
    sessaoAtiva = { pool: lista, idx: 0, acertos: 0, modo: modo, tempo: segundos };

    // Troca de Container
    el('prat-config-container').style.display = 'none';
    el('prat-resolucao-container').style.display = 'block';

    // Configura Cronômetro
    if (modo === 'simulado') {
        el("sessao-timer").style.display = 'block';
        el("sessao-barra-tempo").style.display = 'block';
        iniciarTimerPratica();
    } else {
        el("sessao-timer").style.display = 'none';
        el("sessao-barra-tempo").style.display = 'none';
    }

    renderizarQuestaoPratica();
}

function renderizarQuestaoPratica() {
    let q = sessaoAtiva.pool[sessaoAtiva.idx];
    el("sessao-progresso").innerText = `Questão ${sessaoAtiva.idx + 1} de ${sessaoAtiva.pool.length}`;
    
    // Busca texto de apoio no cache global
    const txt = cacheTextos.find(t => String(t.id) === String(q.texto_apoio));
    
    // Monta o cabeçalho e corpo da questão
    let htmlCorpo = `
        <div class="info-questao" style="margin-bottom:15px; font-size:0.9rem; color:var(--sec)">
            <b>${q.banca} (${q.ano || "-"})</b> | ${q.disciplina} > ${q.assunto}
        </div>
        ${txt ? `
            <div class="texto-apoio-box" style="margin-bottom:20px; border-left: 4px solid var(--purple); padding-left:15px;">
                <h4 style="margin-top:0">${txt.titulo}</h4>
                <div class="texto-conteudo">${txt.conteudo.replace(/\n/g, '<br>')}</div>
            </div>
        ` : ''}
        <div class="enunciado render-html" style="font-size:1.1rem; line-height:1.5; margin-bottom:20px;">
            ${q.imagem ? `<img src="${API}/img/q_img/${q.imagem}" class="questao-img" style="max-width:100%; display:block; margin:10px 0;">` : ''}
            ${q.enunciado}
        </div>
        <div class="alternativas" id="sessao-alternativas-container">
            ${(q.tipo === "CE" ? ["C", "E"] : ["A", "B", "C", "D", "E"]).map(l => {
                let val = q.tipo === "CE" ? (l === "C" ? "Certo" : "Errado") : q[`alt_${l.toLowerCase()}`];
                if (!val) return '';
                
                // Restaura a estrutura com Radio Button e Botão de Riscar
                return `
                    <div class="alternativa-wrapper" onclick="selecionarOpcaoPratica(this, '${l}')">
                        <span class="btn-riscar" onclick="event.stopPropagation(); this.parentElement.classList.toggle('riscado-ativo')" title="Riscar alternativa">✖</span>
                        <input type="radio" name="opt-prat" value="${l}" style="margin:0 10px; pointer-events:none">
                        <span class="render-html"><b>${l})</b> ${val}</span>
                    </div>`;
            }).join('')}
        </div>
    `;
    
    el("container-questao-pratica").innerHTML = htmlCorpo;
    
    // Reset de feedback e botões
    el("sessao-feedback").style.display = "none";
    el("sessao-btn-confirma").style.display = "block";
    el("sessao-btn-prox").style.display = "none";
    
    window.scrollTo(0, 0);
}

async function confirmarRespostaPratica() {
    const opt = document.querySelector('input[name="opt-prat"]:checked');
    if (!opt) return alert("Selecione uma alternativa.");

    const q = sessaoAtiva.pool[sessaoAtiva.idx];
    const acertou = opt.value === q.gabarito;
    if (acertou) sessaoAtiva.acertos++;

    // Salva no histórico
    await salvarProgressoQuestao(q, acertou);

    if (sessaoAtiva.modo === 'praticar') {
        const f = el("sessao-feedback");
        f.style.display = "block";
        f.className = acertou ? "feedback-correto" : "feedback-errado";

        let htmlFeedback = `<div>${acertou ? 'Correto! ✅' : 'Errado! ❌ Gabarito: ' + q.gabarito}</div>`;
        htmlFeedback += `
            <div style="margin-top:12px; display:flex; gap:10px;">
                <button class="btn-padrao" onclick="abrirComentarioSessao()">💬 Explicação / PDF</button>
                <button class="btn-padrao" onclick="abrirAnotacaoSessao()" style="background:var(--purple); color:white;">📓 Anotar</button>
            </div>`;
        
        f.innerHTML = htmlFeedback;

        el("sessao-btn-confirma").style.display = "none";
        el("sessao-btn-prox").style.display = "block";
    } else {
        proximaQuestaoPratica();
    }
}

// Abre o comentário/explicação da questão que está na tela da sessão
function abrirComentarioSessao() {
    const q = sessaoAtiva.pool[sessaoAtiva.idx];
    if (!q) return;

    // Reaproveita a lógica de comentários que já existe no seu questoes.js
    // Se quiser usar o modal simples:
    questaoAtualComent = q; 
    el("modal-comentario").style.display = "block";
    let texto = q.comentarios || "Nenhum comentário registrado.";
    el("view-comentario").innerHTML = texto.replace(/\n/g, "<br>");
    
    el("view-comentario").style.display = "block";
    el("edit-comentario").style.display = "none";
    el("btn-salvar-coment").style.display = "none";
    el("btn-editar-coment").style.display = "inline-block";
}

// Abre o modal de anotação preenchido com os dados da sessão atual
function abrirAnotacaoSessao() {
    const q = sessaoAtiva.pool[sessaoAtiva.idx];
    if (!q) return;

    el("anotacao-info-questao").innerText = `Questão ID: ${q.id} | ${q.disciplina} > ${q.assunto}`;
    el("nota-texto").value = ""; 
    el("modal-anotacao").style.display = "flex";
    el("nota-texto").focus();
}

function proximaQuestaoPratica() {
    sessaoAtiva.idx++;
    if (sessaoAtiva.idx < sessaoAtiva.pool.length) renderizarQuestaoPratica();
    else finalizarSessaoPratica();
}

function finalizarSessaoPratica() {
    if (sessaoAtiva.timer) clearInterval(sessaoAtiva.timer);
    alert(`Fim! Acertos: ${sessaoAtiva.acertos}/${sessaoAtiva.pool.length}`);
    cancelarSessaoPratica();
}

function cancelarSessaoPratica() {
    el('prat-config-container').style.display = 'block';
    el('prat-resolucao-container').style.display = 'none';
}

// Garante que o clique na div marque o radio button e mude a cor
function selecionarOpcaoPratica(elWrap, val) {
    // Remove seleção de todos
    document.querySelectorAll("#sessao-alternativas-container .alternativa-wrapper").forEach(e => e.classList.remove("selected"));
    
    // Adiciona ao clicado
    elWrap.classList.add("selected");
    
    // Marca o radio input interno
    const radioInput = elWrap.querySelector('input[type="radio"]');
    if (radioInput) radioInput.checked = true;
}

function iniciarTimerPratica() {
    let total = sessaoAtiva.tempo;
    sessaoAtiva.timer = setInterval(() => {
        sessaoAtiva.tempo--;
        let m = Math.floor(sessaoAtiva.tempo/60), s = sessaoAtiva.tempo%60;
        el("sessao-timer").innerText = `${m}:${s < 10 ? '0' + s : s}`;
        el("sessao-tempo-fill").style.width = `${(sessaoAtiva.tempo/total)*100}%`;
        if (sessaoAtiva.tempo <= 0) finalizarSessaoPratica();
    }, 1000);
}

// --- MODO PRATICAR/SIMULADO ---

let sessaoAtual = {
    questoes: [],
    indice: 0,
    acertos: 0,
    modo: '', // 'praticar', 'simulado'
    config: {} 
};

/**
 * Motor Unificado de Questões
 * @param {Array} lista - Questões filtradas ou sorteadas
 * @param {String} modo - 'praticar' ou 'simulado'
 */
async function iniciarSessaoEstudo(lista, modo) {
    if (!lista.length) return alert("Nenhuma questão encontrada.");

    // 1. Lógica de Agrupamento por Texto (Melhoria do Praticar)
    // Move questões com o mesmo texto de apoio para ficarem juntas
    lista.sort((a, b) => {
        if (a.texto_apoio && b.texto_apoio) return a.texto_apoio.localeCompare(b.texto_apoio);
        return 0;
    });

    sessaoAtual = {
        questoes: lista,
        indice: 0,
        acertos: 0,
        modo: modo,
        config: {
            mostrarFeedback: modo === 'praticar',
            tempo: modo === 'simulado' ? 240 : 0 // Exemplo: 4h para simulado
        }
    };

    renderizarQuestaoSessao();
    nav('praticar'); // Ambos usam a mesma tela de visualização agora
}

function renderizarQuestaoSessao() {
    const q = sessaoAtual.questoes[sessaoAtual.indice];
    const container = el("container-questao"); // Onde a questão aparece
    
    // Resolve o problema do Texto de Apoio sumido
    const temTexto = q.texto_conteudo && q.texto_conteudo.trim() !== "";
    
    container.innerHTML = `
        <div class="header-questao">
            <span>Questão ${sessaoAtual.indice + 1} de ${sessaoAtual.questoes.length}</span>
            <small>${q.banca} (${q.ano}) | ${q.disciplina} > ${q.assunto}</small>
        </div>

        ${temTexto ? `
            <div class="tabs-texto">
                <button class="tab-btn ativa" onclick="mudarTabQuestao('texto')">Texto de Apoio</button>
                <button class="tab-btn" onclick="mudarTabQuestao('enunciado')">Enunciado</button>
            </div>
            <div id="conteudo-texto" class="texto-apoio-box">
                <h4 class="header-texto">${q.texto_titulo}</h4>
                ${q.texto_conteudo}
            </div>
        ` : ''}

        <div id="conteudo-enunciado" class="enunciado" style="${temTexto ? 'display:none' : 'display:block'}">
            <p>${q.enunciado}</p>
            <div class="alternativas">
                ${['A','B','C','D','E'].map(letra => {
                    const alt = q[`alt_${letra.toLowerCase()}`];
                    if(!alt) return '';
                    return `
                        <label class="alt-item">
                            <input type="radio" name="resp" value="${letra}">
                            <span>${letra}) ${alt}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        </div>

        <div class="footer-sessao">
            <button class="btn-prim" id="btn-confirmar" onclick="confirmarRespostaSessao()">Confirmar</button>
            <button class="btn-sec" onclick="proximaQuestaoSessao()" id="btn-proxima" style="display:none">Próxima</button>
        </div>
        <div id="feedback-sessao" style="display:none"></div>
    `;
}

async function confirmarRespostaSessao() {
    const escolhida = document.querySelector('input[name="resp"]:checked');
    if (!escolhida) return alert("Selecione uma alternativa.");

    const q = sessaoAtual.questoes[sessaoAtual.indice];
    const acertou = escolhida.value.toUpperCase() === q.gabarito.toUpperCase();

    // 1. REGISTRO NO HISTÓRICO (O que estava faltando no simulado)
    // Chama sua função já existente que grava no Excel de histórico e atualiza acumulados
    await salvarProgressoQuestao(q, acertou);

    if (sessaoAtual.config.mostrarFeedback) {
        exibirFeedbackVisual(acertou, q.gabarito, q.comentarios);
    } else {
        // No modo Simulado (cego), apenas avança ou marca como respondida
        proximaQuestaoSessao();
    }
}

function gerarSimuladoProporcional() {
    // Definição das proporções padrão (Exemplo Petrobras)
    const grade = {
        "Português": 10,
        "Inglês": 10,
        "Conhecimentos Específicos": 40,
        "Estatística": 10
    };

    let simulado = [];
    
    for (const [disc, qtd] of Object.entries(grade)) {
        const filtradas = db.filter(q => q.disciplina === disc);
        // Sorteia questões e adiciona ao bolo
        const sorteadas = filtradas.sort(() => 0.5 - Math.random()).slice(0, qtd);
        simulado = simulado.concat(sorteadas);
    }

    iniciarSessaoEstudo(simulado, 'simulado');
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

// Funções de Suporte ao Caderno
function abrirModalAnotacao() {
    const q = pratPool[pratIdx];
    el("anotacao-info-questao").innerText = `Questão ID: ${q.id} | ${q.disciplina} > ${q.assunto}`;
    el("nota-texto").value = ""; 
    el("modal-anotacao").style.display = "flex";
    el("nota-texto").focus();
}

async function enviarParaCaderno() {
    const q = sessaoAtiva.pool[sessaoAtiva.idx];
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
            if (typeof carregarCaderno === "function") carregarCaderno();
        } else {
            alert("Erro ao salvar no servidor.");
        }
    } catch (e) {
        console.error("Erro na conexão:", e);
        alert("Erro ao salvar anotação.");
    }
};

let cacheAnotacoes = [];


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