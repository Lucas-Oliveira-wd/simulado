const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
window.planoAtual = window.planoAtual || {
    grade: {},
    horas: {},
    intervalos: {
        "Segunda": [], "Terça": [], "Quarta": [], "Quinta": [], "Sexta": [], "Sábado": [], "Domingo": []
    } };


window.planConfig = window.planConfig || {};


const PALETA_CORES = [
    "#8e44ad", "#2980b9", "#27ae60", "#d35400", "#16a085", 
    "#c0392b", "#f1c40f", "#2c3e50", "#7f8c8d", "#e67e22"
];

function initPlanoEstudos() {
    if (window.opcoes.disciplinas) {
        window.opcoes.disciplinas.forEach((nome, index) => {
            if (!window.planConfig[nome]) {
                window.planConfig[nome] = {
                    cor: PALETA_CORES[index % PALETA_CORES.length], // Atribui cor da paleta
                    min: 2, // Default: 1h
                    max: 6  // Default: 2h
                };
            }
        });
    }
   
    const headerDias = el("header-dias");
    if (headerDias && headerDias.children.length === 1) {
        DIAS_SEMANA.forEach(d => {
            const th = document.createElement("th");
            th.innerText = d;
            headerDias.appendChild(th);
        });
    };

    // Renderiza a tabela de pesos para as disciplinas carregadas
    renderizarTabelaPesos();

   
    renderizarConfigIntervalos();

    // Declarar a variável 'grid' antes de usá-la no 'if'
    const grid = el("corpo-grade-estudos");

    if (grid) {
        renderizarGridPlano();
    } else {
        console.warn("Elemento 'corpo-grade-estudos' não encontrado no DOM.");
    }
}


function renderizarTabelaPesos() {
    const tbody = el("corpo-pesos-disciplinas");
    if (!tbody || !window.opcoes.disciplinas) return;

    tbody.innerHTML = "";
    window.opcoes.disciplinas.forEach(disc => {
        const meta = window.planConfig[disc] || { min: 2, max: 6, cor: "#ccc" };
        const pesoPadrao = disc.includes("Específicos") ? 0.6 : 0.14; 
        tbody.innerHTML += `
            <tr">
                <td style="border-left: 5px solid ${meta.cor}
                ">${disc}</td>
                <td><input type="number" step="0.1" value="${pesoPadrao}" class="peso-mcda" data-disc="${disc}"></td>
                <td>
                    <select class="tipo-mcda" data-disc="${disc}">
                        <option value="eliminatorio" ${disc.includes("Específicos") ? 'selected' : ''}>Elim.</option>
                        <option value="classificatorio">Class.</option>
                    </select>
                </td>
                <td><input type="number" class="sessao-min" data-disc="${disc}" value="${meta.min}" title="Mínimo de blocos seguidos (ex: 2 = 1h)"></td>
                <td><input type="number" class="sessao-max" data-disc="${disc}" value="${meta.max}" title="Máximo de blocos seguidos (ex: 4 = 2h)"></td>
            </tr>
        `;
    });
}


function renderizarConfigIntervalos() {
    const container = el("container-config-dias");
    if (!container) return;

    container.innerHTML = "";
    DIAS_SEMANA.forEach(dia => {
        const diaDiv = document.createElement("div");
        diaDiv.style = "border: 1px solid #ddd; padding: 8px; border-radius: 4px; background: #fff;";
        diaDiv.innerHTML = `
            <strong style="display:block; margin-bottom:5px; font-size:0.9em;">${dia}</strong>
            <div id="lista-intervalos-${dia}"></div>
            <button onclick="adicionarInputIntervalo('${dia}')" style="width:100%; margin-top:5px; cursor:pointer; font-size:0.7em;">+ Intervalo</button>
        `;
        container.appendChild(diaDiv);
        
        // Renderiza intervalos já salvos para este dia
        const lista = window.planoAtual.intervalos[dia] || [];
        lista.forEach((int, index) => {
            criarLinhaIntervalo(dia, index, int.inicio, int.fim);
        });
    });
    calcularHorasTotaisDisponiveis();
}

function adicionarInputIntervalo(dia) {
    if (!window.planoAtual.intervalos[dia]) window.planoAtual.intervalos[dia] = [];
    window.planoAtual.intervalos[dia].push({ inicio: "08:00", fim: "10:00" });
    renderizarConfigIntervalos();
}

function criarLinhaIntervalo(dia, index, inicio, fim) {
    const lista = el(`lista-intervalos-${dia}`);
    const item = document.createElement("div");
    item.style = "display:flex; gap:2px; margin-bottom:4px; align-items:center;";
    item.innerHTML = `
        <input type="time" value="${inicio}" onchange="atualizarIntervalo('${dia}', ${index}, 'inicio', this.value)" style="width:45%; font-size:0.8em; padding:2px;">
        <input type="time" value="${fim}" onchange="atualizarIntervalo('${dia}', ${index}, 'fim', this.value)" style="width:45%; font-size:0.8em; padding:2px;">
        <button onclick="removerIntervalo('${dia}', ${index})" style="color:red; border:none; background:none; cursor:pointer;">×</button>
    `;
    lista.appendChild(item);
}

function atualizarIntervalo(dia, index, campo, valor) {
    window.planoAtual.intervalos[dia][index][campo] = valor;
    calcularHorasTotaisDisponiveis();
}

function removerIntervalo(dia, index) {
    window.planoAtual.intervalos[dia].splice(index, 1);
    renderizarConfigIntervalos();
}


function calcularHorasTotaisDisponiveis() {
    let totalMinutos = 0;
    
    DIAS_SEMANA.forEach(dia => {
        const intervalos = window.planoAtual.intervalos[dia] || [];
        intervalos.forEach(int => {
            const [h1, m1] = int.inicio.split(':').map(Number);
            const [h2, m2] = int.fim.split(':').map(Number);
            const minInicio = h1 * 60 + m1;
            const minFim = h2 * 60 + m2;
            if (minFim > minInicio) totalMinutos += (minFim - minInicio);
        });
    });

    const totalHoras = (totalMinutos / 60).toFixed(1);
    const display = el("carga-calculada-total");
    if (display) display.innerText = totalHoras;
    
    // Atualiza o input de horas totais para o TOPSIS usar
    const inputTopsis = el("plan-horas-totais");
    if (inputTopsis) inputTopsis.value = totalHoras;

    return totalHoras;
}

// Preenche a grade automaticamente com base nos intervalos
function aplicarIntervalosNaGrade() {
    const hInicio = parseInt(el("plan-config-inicio").value) || 3;
    const hFim = parseInt(el("plan-config-fim").value) || 17;

    // Reseta matérias que não são "Descanso" se o usuário desejar, ou apenas marca o disponível
    DIAS_SEMANA.forEach(dia => {
        const intervalos = window.planoAtual.intervalos[dia] || [];
        
        // Varre todos os horários da grade (04:00 às 23:30)
        for(let h=hInicio; h<hFim; h++) {
            ["00", "30"].forEach(m => {
                const horaStr = `${h.toString().padStart(2,'0')}:${m}`;
                const minAtual = h * 60 + parseInt(m);
                const chave = `cell-${dia}-${horaStr}`;
                
                let estaNoIntervalo = false;
                intervalos.forEach(int => {
                    const [hI, mI] = int.inicio.split(':').map(Number);
                    const [hF, mF] = int.fim.split(':').map(Number);
                    if (minAtual >= (hI * 60 + mI) && minAtual < (hF * 60 + mF)) estaNoIntervalo = true;
                });

                if (estaNoIntervalo) {
                    if (!window.planoAtual.grade[chave] || window.planoAtual.grade[chave] === "Descanso") {
                        window.planoAtual.grade[chave] = "Estudar";
                    }
                } else {
                    window.planoAtual.grade[chave] = "Descanso";
                }
            });
        }
    });
    renderizarGridPlano();
}

// Distribui as matérias sugeridas pelo TOPSIS nos blocos marcados como "Estudar"
function distribuirSugestoesNaGrade() {
    if (!window.planoAtual.horas || Object.keys(window.planoAtual.horas).length === 0) {
        return alert("Primeiro clique em 'Calcular & Otimizar' para gerar as sugestões.");
    }

    // Captura parâmetros e prepara o Ranking TOPSIS
    const restricoes = {};

    document.querySelectorAll(".peso-mcda").forEach(input => {
        const disc = input.getAttribute("data-disc");
        restricoes[disc] = {
            materia: disc,
            peso: parseFloat(input.value),
            min: parseInt(document.querySelector(`.sessao-min[data-disc="${disc}"]`).value) || 2,
            max: parseInt(document.querySelector(`.sessao-max[data-disc="${disc}"]`).value) || 6,
            blocosRestantes: Math.round((window.planoAtual.horas[disc] || 0) * 2)
        };
    });

    // Ordena pelo peso (TOPSIS) para priorizar no início do dia
    const ranking = Object.values(restricoes).sort((a, b) => b.peso - a.peso);

    const hInicio = parseInt(el("plan-config-inicio").value) || 3;
    const hFim = parseInt(el("plan-config-fim").value) || 18;

    // Loop por Dia e Horário para aplicar as janelas de tempo
    DIAS_SEMANA.forEach(dia => {
        let materiaAtual = null;
        let contagemSessao = 0;
        let materiaUltimaSessao = null; // Para evitar repetir a mesma logo após o maxSessao

        for (let h = hInicio; h < hFim; h++) {
            ["00", "30"].forEach(m => {
                const horaStr = `${h.toString().padStart(2, '0')}:${m}`;
                const chave = `cell-${dia}-${horaStr}`;

                // Verifica se o bloco é destinado a estudo (marcado via intervalos)
                if (window.planoAtual.grade[chave] === "Descanso") {
                    materiaAtual = null;
                    contagemSessao = 0;
                    return;
                }

                let escolha = "Descanso";

                // 1. LÓGICA DE MANUTENÇÃO: Se começou uma matéria, respeita o MÍNIMO
                if (materiaAtual && contagemSessao < restricoes[materiaAtual].min && restricoes[materiaAtual].blocosRestantes > 0) {
                    escolha = materiaAtual;
                } 
                // 2. LÓGICA DE TROCA FORÇADA: Se atingiu o MÁXIMO, obriga a trocar
                else {
                    if (materiaAtual) materiaUltimaSessao = materiaAtual; // Salva para não repetir imediatamente
                    materiaAtual = null;
                    contagemSessao = 0;

                    // 3. BUSCA POR RANKING: Procura a melhor matéria disponível
                    for (let r of ranking) {
                        // Não escolhe a mesma que acabou de atingir o máximo (espaçamento)
                        if (r.materia === materiaUltimaSessao && ranking.length > 1) continue;
                        
                        if (r.blocosRestantes > 0) {
                            escolha = r.materia;
                            materiaAtual = r.materia;
                            break;
                        }
                    }
                    
                    // Se não sobrou nenhuma outra, aceita a última mesmo (para não deixar buraco)
                    if (!materiaAtual && materiaUltimaSessao && restricoes[materiaUltimaSessao].blocosRestantes > 0) {
                        escolha = materiaUltimaSessao;
                        materiaAtual = materiaUltimaSessao;
                    }
                }

                // Aplica na grade e atualiza contadores
                if (escolha !== "Estudar" && escolha !== "Descanso") {
                    window.planoAtual.grade[chave] = escolha;
                    restricoes[escolha].blocosRestantes--;
                    contagemSessao++;
                } else {
                    window.planoAtual.grade[chave] = "Descanso";
                }
            });
        }
    });

    renderizarGridPlano();
    alert("Matérias distribuídas na grade com sucesso!");
}

// Função para clicar e editar matéria na grade
function definirMateriaCelular(dia, hora) {
    const atual = window.planoAtual.grade[`cell-${dia}-${hora}`] || "";
    const nova = prompt(`Definir matéria para ${dia} às ${hora}:`, atual);
    if (nova !== null) {
        window.planoAtual.grade[`cell-${dia}-${hora}`] = nova;
        renderizarGridPlano();
    }
}

// Gera a grade de horários (30 em 30 min, 04:00 às 23:30)
function renderizarGridPlano() {
    const corpo = el("corpo-grade-estudos");
    if (!corpo) return; // [CÓDIGO INSERIDO] - Correção para o erro da linha 13

    // Agora usa os valores definidos no cabeçalho (Início/Fim)
    const hInicio = parseInt(el("plan-config-inicio").value) || 3;
    const hFim = parseInt(el("plan-config-fim").value) || 17;

    corpo.innerHTML = "";
    for(let h = hInicio; h < hFim; h++) {
        ["00", "30"].forEach(m => {
            const horaStr = `${h.toString().padStart(2,'0')}:${m}`;
            let row = `<tr><td class="hora-col">${horaStr}</td>`;
            
            DIAS_SEMANA.forEach(d => {
                const idCell = `cell-${d}-${horaStr}`;
                const materia = window.planoAtual.grade[idCell] || "";
                
                // [CÓDIGO INSERIDO] - Lógica de cores baseada no plano dinâmico
                let bg = "transparent";
                let text = "#333";
                
                if (materia === "Estudar") {
                    bg = "#ecf0f1";
                } else if (window.planConfig[materia]) {
                    bg = window.planConfig[materia].cor;
                    text = "#fff"; // Assume branco para melhor contraste em cores da paleta
                }
                
                row += `<td id="${idCell}" onclick="definirMateriaCelular('${d}','${horaStr}')"
                            style="background-color: ${bg}; color: ${text};">
                            ${(materia === "Descanso" || materia === "Estudar") ? "" : materia}
                        </td>`;
            });
            corpo.innerHTML += row + `</tr>`;
        });
    }
}

// Lógica TOPSIS para cálculo de horas
async function calcularCargaHorariaMCDA() {
    const horasTotais = parseFloat(el("horas-semanais-input").value);
    const pesosProva = {}; // Capturar inputs de % na prova
    
    // Obter desempenho do sistema
    const res = await fetch(`${API}/plan/calculate`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            horas_semanais: horasTotais,
            criterios: opcoes.disciplinas.map(d => ({
                disciplina: d,
                peso_prova: el(`peso-prova-${d}`).value || 0.1,
                tipo: el(`tipo-${d}`).value // eliminatorio/classificatorio
            }))
        })
    });
    
    const distribuicao = await res.json();
    exibirSugestaoHoras(distribuicao);
}

// Monitor em tempo real sincronizado com os novos IDs
setInterval(() => {
    const monitorMateria = el("monitor-materia");
    const monitorRelogio = el("monitor-tempo-restante");
    const barra = el("monitor-barra-progresso");
    
    if (!monitorMateria || !el("secao-plano") || el("secao-plano").style.display === "none") return;

    const agora = new Date();
    const diaNum = agora.getDay(); // 0 = Domingo
    const diaNome = DIAS_SEMANA[diaNum === 0 ? 6 : diaNum - 1];
    
    const h = agora.getHours().toString().padStart(2, '0');
    const m = agora.getMinutes() < 30 ? "00" : "30";
    const chave = `cell-${diaNome}-${h}:${m}`;
    
    const materiaAgora = window.planoAtual.grade[chave] || "Descanso";
    monitorMateria.innerText = materiaAgora;

    // Cálculo de tempo restante para o próximo bloco de 30min
    const segundosPassados = (agora.getMinutes() % 30) * 60 + agora.getSeconds();
    const segundosRestantes = 1800 - segundosPassados;
    
    if (monitorRelogio) {
        const minR = Math.floor(segundosRestantes / 60);
        const segR = segundosRestantes % 60;
        monitorRelogio.innerText = `${minR}:${segR.toString().padStart(2, '0')} restante`;
    }

    if (barra) {
        const pct = (segundosRestantes / 1800) * 100;
        barra.style.width = `${pct}%`;
    }
}, 1000);

// Função para o botão Salvar
function salvarPlanoEstudos() {
    localStorage.setItem("plano_estudos_user", JSON.stringify(window.planoAtual));
    alert("Plano salvo localmente com sucesso!");
}

// Carregar plano ao iniciar
window.addEventListener('load', () => {
    const salvo = localStorage.getItem("plano_estudos_user");
    if (salvo) window.planoAtual = JSON.parse(salvo);
});

// Função completa para cálculo de alocação de tempo via TOPSIS
async function calcularPlanoTopsis() {
    // Agora utiliza o valor calculado dos intervalos
    const horasSemanais = parseFloat(calcularHorasTotaisDisponiveis());

    if (!horasSemanais || horasSemanais <= 0) {
        return alert("Defina os intervalos de disponibilidade para calcular a carga horária.");
    }

    if (!window.opcoes.disciplinas) {
        return alert("Erro: Disciplinas não carregadas.");
    }


    // Captura os pesos e tipos da nova tabela UI
    const criterios = Array.from(document.querySelectorAll(".peso-mcda")).map(input => {
        const disc = input.getAttribute("data-disc");
        const select = document.querySelector(`.tipo-mcda[data-disc="${disc}"]`);
        return {
            disciplina: disc,
            peso_prova: parseFloat(input.value) || 0.1,
            tipo: select ? select.value : 'classificatorio'
        };
    });

    if (typeof showLoader === 'function') showLoader("Calculando otimização MCDA...");

    try {
        const response = await fetch(`${API}/plan/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                horas_semanais: horasSemanais,
                criterios: criterios
            })
        });

        if (!response.ok) throw new Error("Erro no cálculo");
        const distribuicaoHoras = await response.json();

        window.planoAtual.horas = distribuicaoHoras;
        renderizarListaSugestao(distribuicaoHoras);
        alert("Carga horária otimizada!");

    } catch (error) {
        console.error(error);
        alert("Erro ao processar plano.");
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

// Função auxiliar para exibir as horas calculadas na lateral
function renderizarListaSugestao(dados) {
    const container = el("lista-sugestao-horas");
    if (!container) return;

    let html = `<h4>Sugestão de Carga Horária</h4><hr>`;
    
    // Ordena as disciplinas por carga horária decrescente
    const ordenadas = Object.entries(dados).sort((a, b) => b[1] - a[1]);

    ordenadas.forEach(([disc, horas]) => {
        // Cor dinâmica baseada no peso (Específicas costumam ser roxas)
        const cor = disc === "Conhecimentos Específicos" ? "var(--purple)" : "var(--acc)";
        
        html += `
            <div class="sugestao-item" style="margin-bottom:10px; padding:8px; border-left:4px solid ${cor}; background:#f9f9f9;">
                <div style="font-weight:bold; font-size:0.9em;">${disc}</div>
                <div style="color:#666; font-size:0.85em;">
                    <strong>${horas}h</strong> por semana 
                    <small>(${Math.round(horas*2)} blocos de 30min)</small>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};