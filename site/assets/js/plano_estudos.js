// [CÓDIGO INSERIDO] - Definições globais
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
window.planoAtual = window.planoAtual || {
    grade: {},
    horas: {},
    intervalos: {
        "Segunda": [], "Terça": [], "Quarta": [], "Quinta": [], "Sexta": [], "Sábado": [], "Domingo": []
    } };

function initPlanoEstudos() {
    // [CÓDIGO MODIFICADO] - Só renderiza se a aba estiver pronta no HTML
    const headerDias = el("header-dias");
    if (headerDias && headerDias.children.length === 1) {
        DIAS_SEMANA.forEach(d => {
            const th = document.createElement("th");
            th.innerText = d;
            headerDias.appendChild(th);
        });
    };

    // [CÓDIGO INSERIDO] - Renderiza o painel de configuração de intervalos
    renderizarConfigIntervalos();

    // 2. CORREÇÃO: Declarar a variável 'grid' antes de usá-la no 'if'
    const grid = el("corpo-grade-estudos");

    if (grid) {
        renderizarGridPlano();
    } else {
        console.warn("Elemento 'corpo-grade-estudos' não encontrado no DOM.");
    }
}

// [CÓDIGO INSERIDO] - Lógica para gerenciar os inputs de horários por dia
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

// [CÓDIGO INSERIDO] - Função que realiza o cálculo matemático da carga semanal
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

// [CÓDIGO INSERIDO] - Preenche a grade automaticamente com base nos intervalos
function aplicarIntervalosNaGrade() {
    // Reseta matérias que não são "Descanso" se o usuário desejar, ou apenas marca o disponível
    DIAS_SEMANA.forEach(dia => {
        const intervalos = window.planoAtual.intervalos[dia] || [];
        
        // Varre todos os horários da grade (04:00 às 23:30)
        for(let h=4; h<24; h++) {
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

// [CÓDIGO INSERIDO] - Função para clicar e editar matéria na grade
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

    corpo.innerHTML = "";
    for(let h=3; h<=17; h++) {
        ["00", "30"].forEach(m => {
            const hora = `${h.toString().padStart(2,'0')}:${m}`;
            let row = `<tr><td class="hora-col">${hora}</td>`;
            DIAS_SEMANA.forEach(d => {
                const idCell = `cell-${d}-${hora}`;
                const preenchido = planoAtual.grade[idCell] || "";
                row += `<td id="${idCell}" onclick="setarMateria('${d}','${hora}')" class="${preenchido ? 'com-materia' : ''}">${preenchido}</td>`;
            });
            corpo.innerHTML += row + `</tr>`;
        });
    }
}

// [CÓDIGO INSERIDO] - Lógica TOPSIS para cálculo de horas
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

// [CÓDIGO MODIFICADO] - Monitor em tempo real sincronizado com os novos IDs
setInterval(() => {
    const monitorMateria = el("monitor-materia");
    const monitorRelogio = el("monitor-tempo-restante");
    const barra = el("monitor-barra-progresso");
    
    if (!monitorMateria) return;

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

// [CÓDIGO INSERIDO] - Função para o botão Salvar
function salvarPlanoEstudos() {
    localStorage.setItem("plano_estudos_user", JSON.stringify(window.planoAtual));
    alert("Plano salvo localmente com sucesso!");
}

// [CÓDIGO INSERIDO] - Carregar plano ao iniciar
window.addEventListener('load', () => {
    const salvo = localStorage.getItem("plano_estudos_user");
    if (salvo) window.planoAtual = JSON.parse(salvo);
});

// [CÓDIGO INSERIDO] - Função completa para cálculo de alocação de tempo via TOPSIS
async function calcularPlanoTopsis() {
    // [CÓDIGO MODIFICADO] - Agora utiliza o valor calculado dos intervalos
    const horasSemanais = parseFloat(calcularHorasTotaisDisponiveis());

    if (!horasSemanais || horasSemanais <= 0) {
        return alert("Defina os intervalos de disponibilidade para calcular a carga horária.");
    }

    if (!window.opcoes.disciplinas) {
        return alert("Erro: Disciplinas não carregadas.");
    }

    const criterios = window.opcoes.disciplinas.map(materia => {
        const inputPeso = document.querySelector(`.peso-prova[data-disc="${materia}"]`);
        const selectTipo = document.querySelector(`.tipo-disciplina[data-disc="${materia}"]`);
        
        return {
            disciplina: materia,
            peso_prova: inputPeso ? parseFloat(inputPeso.value) : 0.5, 
            tipo: selectTipo ? selectTipo.value : 'classificatorio'
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

// [CÓDIGO INSERIDO] - Função auxiliar para exibir as horas calculadas na lateral
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