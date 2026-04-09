const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
window.planoAtual = window.planoAtual || {
    grade: {},
    horas: {},
    intervalos: {
        "Segunda": [], "Terça": [], "Quarta": [], "Quinta": [], "Sexta": [], "Sábado": [], "Domingo": []
    } };


window.planConfig = window.planConfig || {};

const PALETA_CORES = [
    "var(--purple)", "var(--disc-blue)", "var(--succ)", 
    "var(--orange)", "var(--acc)", "var(--sec)",
    "var(--disc-pink)", "var(--disc-teal)",
    "var(--disc-indigo)", "var(--disc-lime)",
    "#e67e22", "#1abc9c", "#34495e"
];

const converterParaMinutos = (timeStr) => {
    const [h, m] = (timeStr || "00:00").split(':').map(Number);
    return h * 60 + m;
};

// ==========================================
// PARÂMETROS DO MOTOR DE ALOCAÇÃO (HEURÍSTICA)
// ==========================================
const MOTOR_MAX_TENTATIVAS = 5000; // Limite de exaustão do algoritmo
const MOTOR_RELAX_NIVEL_1 = 1500;  // Permite repetir matéria no dia (não sequencial)
const MOTOR_RELAX_NIVEL_2 = 3000;  // Permite repetir matéria colada (se necessário)

// [CÓDIGO INSERIDO] - Função para buscar o plano persistido no servidor Python
async function carregarPlanoServidor() {
    try {
        const response = await fetch(`${API}/plan`);
        if (response.ok) {
            const planoSalvo = await response.json();
            
            // Verifica se o plano retornado possui dados válidos antes de sobrescrever a memória
            if (planoSalvo.grade && Object.keys(planoSalvo.grade).length > 0) {
                window.planoAtual = planoSalvo;
                
                // [CÓDIGO INSERIDO] - Atualiza a interface visual com os dados carregados
                renderizarGridPlano();
                if (window.planoAtual.horas) {
                    renderizarListaSugestao(window.planoAtual.horas);
                }
            }
        }
    } catch (error) {
        console.error("Erro ao carregar plano do servidor:", error);
    }
}

// Função Unificada para montar o plano completo
async function fluxoGerarPlanoCompleto() {
    try {
        if (typeof showLoader === 'function') showLoader("Calculando e distribuindo matérias...");


        /*========          chamada travada         ==================================
        // 1. Cálculo TOPSIS (Horas)
        await calcularPlanoTopsis(true); // Passei 'true' para indicar modo silencioso se necessário
        ===============================================================================*/

        // Alterada a chamada para a função renomeada
        await calcularPlanoSAW(true);

        // 2. Sincronização da Grade (Aplica "Estudar" nos slots disponíveis)
        aplicarIntervalosNaGrade();

        // 3. Distribuição Inteligente das Disciplinas
        distribuirSugestoesNaGrade();

        // 4. Alternância de Interface
        alternarVisibilidadePlano(true);

    } catch (error) {
        console.error("Erro ao gerar plano:", error);
        alert("Ocorreu um erro ao processar o plano de estudos.");
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

async function distribuirSugestoesNaGrade() {
    // [CÓDIGO INSERIDO] - Início da lógica de discretização de slots
    const restricoes = capturarRestricoesUI();
    const gradeTeste = resetarGradeParaSlotsEstudar(); 

    const totalSlotsDisponiveis = Object.values(gradeTeste).filter(v => v === "Estudar").length;
    const totalHorasTeoricas = Object.values(window.planoAtual.horas).reduce((a, b) => a + b, 0);
    
    let totalAlocado = 0;
    Object.keys(window.planoAtual.horas).forEach(materia => {
        const proporcao = window.planoAtual.horas[materia] / totalHorasTeoricas;
        let slotsDiscretos = Math.floor(proporcao * totalSlotsDisponiveis);
        
        if (slotsDiscretos > 0 && slotsDiscretos < restricoes[materia].min) {
            slotsDiscretos = restricoes[materia].min;
        }
        restricoes[materia].blocosRestantes = slotsDiscretos;
        totalAlocado += slotsDiscretos;
    });

    let saldo = totalSlotsDisponiveis - totalAlocado;
    if (saldo > 0) {
        const principal = Object.values(restricoes).sort((a,b) => b.peso - a.peso)[0].materia;
        restricoes[principal].blocosRestantes += saldo;
    }
    // [FIM DO CÓDIGO INSERIDO]

    let sucesso = false;
    let tentativas = 0;
    let nivelRelaxamento = 0;

    while (!sucesso && tentativas < MOTOR_MAX_TENTATIVAS) {
        let inventario = gerarCombinacoesAleatoriasComSlotsFixos(restricoes);
        let gradeAtual = resetarGradeParaSlotsEstudar();
        
        if (tentarEncaixeLote(inventario, gradeAtual, nivelRelaxamento, restricoes)) {
            window.planoAtual.grade = gradeAtual;
            sucesso = true;
        } else {
            tentativas++;
            if (tentativas > MOTOR_RELAX_NIVEL_1) nivelRelaxamento = 1;
            if (tentativas > MOTOR_RELAX_NIVEL_2) nivelRelaxamento = 2;
        }
    }

    if (!sucesso) {
        console.warn(`⚠️ O algoritmo exauriu o limite de ${MOTOR_MAX_TENTATIVAS} tentativas e não conseguiu gerar um encaixe válido.`);
    }
    
    renderizarGridPlano();
}

// Função para alternar entre os modos Configuração e Resultado
function alternarVisibilidadePlano(mostrarPlano) {
    const config = el("wrapper-config-inputs");
    const sugestoes = el("lista-sugestao-horas");
    const pesosGlobais = el("wrapper-pesos-globais");
    const resultStats = el("wrapper-resultado-stats");
    const resultGrade = el("wrapper-grade-resultado");
    const btnGerar = el("btn-gerar-plano");
    const btnVoltar = el("btn-voltar-config");
    const btnSalvar = el("btn-salvar-final");

    if (mostrarPlano) {
        config.style.display = "none";
        sugestoes.style.display = "none";
        pesosGlobais.style.display = "none";
        resultStats.style.display = "block";
        resultGrade.style.display = "block";
        btnGerar.style.display = "none";
        btnVoltar.style.display = "inline-block";
        btnSalvar.style.display = "inline-block";
    } else {
        config.style.display = "block";
        sugestoes.style.display = "block";
        pesosGlobais.style.display = "block";
        resultStats.style.display = "none";
        resultGrade.style.display = "none";
        btnGerar.style.display = "inline-block";
        btnVoltar.style.display = "none";
        btnSalvar.style.display = "none";
    }
}


function initPlanoEstudos() {
    if (window.opcoes.disciplinas) {
        window.opcoes.disciplinas.forEach((nome, index) => {
            if (!window.planConfig[nome]) {
                window.planConfig[nome] = {
                    corIndex: index % PALETA_CORES.length, // Atribui cor da paleta
                    min: 2, // Default: 1h
                    max: 4  // Default: 2h
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

    const isDark = document.body.classList.contains('dark-mode');

    tbody.innerHTML = "";
    window.opcoes.disciplinas.forEach(disc => {
        const meta = window.planConfig[disc] || { min: 2, max: 4, corIndex: 0};
        const idx = meta.corIndex || 0;
        const corLinha = PALETA_CORES[idx];
        const pesoPadrao = disc.includes("Específicos") ? 65 : 14; 
        tbody.innerHTML += `
            <tr">
                <td style="border-left: 5px solid ${corLinha}">${disc}</td>
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
    window.planoAtual.intervalos[dia].push({ inicio: "10:00", fim: "17:00" });
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
            if (minFim > minInicio) totalMinutos += (minFim - minInicio) + 30;
        });
    });

    const totalHoras = (totalMinutos / 60).toFixed(1);
    const display = el("carga-calculada-total");
    if (display) display.innerText = totalHoras;

    return totalHoras;
}

// Força o reset completo da grade para "Estudar" antes da distribuição
function aplicarIntervalosNaGrade() {
    const startMin = converterParaMinutos(el("plan-config-inicio").value);
    const endMin = converterParaMinutos(el("plan-config-fim").value);

    DIAS_SEMANA.forEach(dia => {
        const intervalos = window.planoAtual.intervalos[dia] || [];
        
        for (let minAtual = startMin; minAtual < endMin; minAtual += 30) {
            const h = Math.floor(minAtual / 60);
            const m = minAtual % 60;
            const horaStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
            const chave = `cell-${dia}-${horaStr}`;
            
            let estaNoIntervalo = false;
            intervalos.forEach(int => {
                const minI = converterParaMinutos(int.inicio);
                const minF = converterParaMinutos(int.fim);
                // [CÓDIGO MODIFICADO] - Uso do <= para validar o bloco que inicia no horário de término
                if (minAtual >= minI && minAtual < minF) estaNoIntervalo = true;
            });

            if (estaNoIntervalo) {
                window.planoAtual.grade[chave] = "Estudar";
            } else {
                window.planoAtual.grade[chave] = "Descanso";
            }
        }
    });
    renderizarGridPlano();
}

function capturarRestricoesUI() {
    const restricoes = {};
    document.querySelectorAll(".peso-mcda").forEach(input => {
        const disc = input.getAttribute("data-disc").trim();
        const inputMin = document.querySelector(`.sessao-min[data-disc="${disc}"]`);
        const inputMax = document.querySelector(`.sessao-max[data-disc="${disc}"]`);
        const selectTipo = document.querySelector(`.tipo-mcda[data-disc="${disc}"]`);
        
        restricoes[disc] = {
            materia: disc,
            peso: parseFloat(input.value),
            tipo: selectTipo ? selectTipo.value : 'classificatorio',
            min: parseInt(inputMin.value) || 2,
            max: parseInt(inputMax.value) || 4,
            horasOriginais: window.planoAtual.horas[disc] || 0
        };
    });
    return restricoes;
}

async function distribuirSugestoesNaGrade() {
    const restricoes = capturarRestricoesUI();
    const gradeTeste = resetarGradeParaSlotsEstudar(); // Gera a grade com "Estudar" e "Descanso"

    // 1. DISCRETIZAÇÃO: Contagem de slots físicos disponíveis
    const totalSlotsDisponiveis = Object.values(gradeTeste).filter(v => v === "Estudar").length;
    console.log(`🏭 Capacidade Total da Fábrica: ${totalSlotsDisponiveis} slots.`);

    // 2. Cálculo da Proporção baseada no output do MCDA (window.planoAtual.horas)
    const totalHorasTeoricas = Object.values(window.planoAtual.horas).reduce((a, b) => a + b, 0);
    
    // Distribuímos os slots proporcionalmente (Método de Hamilton/Resto Maior)
    let totalAlocado = 0;
    Object.keys(window.planoAtual.horas).forEach(materia => {
        const proporcao = window.planoAtual.horas[materia] / totalHorasTeoricas;
        // Força a variável a ser discreta (Inteiro)
        let slotsDiscretos = Math.floor(proporcao * totalSlotsDisponiveis);
        
        // Garante que o Sessão Min seja respeitado se houver carga mínima
        if (slotsDiscretos > 0 && slotsDiscretos < restricoes[materia].min) {
            slotsDiscretos = restricoes[materia].min;
        }

        restricoes[materia].blocosRestantes = slotsDiscretos;
        totalAlocado += slotsDiscretos;
    });

    // 3. Ajuste de Saldo (Preencher o que sobrou devido ao Math.floor)
    let saldo = totalSlotsDisponiveis - totalAlocado;
    if (saldo > 0) {
        // O "resto" vai para a disciplina com maior peso (Conhecimentos Específicos)
        const principal = Object.values(restricoes).sort((a,b) => b.peso - a.peso)[0].materia;
        restricoes[principal].blocosRestantes += saldo;
        console.log(`⚖️ Ajuste de saldo: +${saldo} slots para ${principal}`);
    }

    // 4. Início das Tentativas de Alocação
    let sucesso = false;
    let tentativas = 0;
    let nivelRelaxamento = 0;

    while (!sucesso && tentativas < 200) {
        // Gera o inventário agora baseado nos blocos discretos recalculados
        let inventario = gerarCombinacoesAleatoriasComSlotsFixos(restricoes);
        let gradeAtual = resetarGradeParaSlotsEstudar();
        
        if (tentarEncaixeLote(inventario, gradeAtual, nivelRelaxamento, restricoes)) {
            window.planoAtual.grade = gradeAtual;
            sucesso = true;
            console.log("✅ Produção Finalizada com Sucesso!");
        } else {
            tentativas++;
            if (tentativas > 50) nivelRelaxamento = 1;
            if (tentativas > 100) nivelRelaxamento = 2;
        }
    }
    renderizarGridPlano();
}

function gerarCombinacoesAleatoriasComSlotsFixos(restricoes) {
    let inventario = [];
    Object.values(restricoes).forEach(r => {
        let saldoMat = r.blocosRestantes;
        
        while (saldoMat > 0) {
            let tamanho = Math.floor(Math.random() * (r.max - r.min + 1)) + r.min;
            
            if (tamanho > saldoMat) tamanho = saldoMat;
            if (saldoMat - tamanho < r.min && saldoMat - tamanho > 0) tamanho = saldoMat;

            inventario.push({ materia: r.materia, tamanho: tamanho, peso: r.peso });
            saldoMat -= tamanho;
        }
    });
    return inventario.sort(() => Math.random() - 0.5);
}
// MODIFICAÇÃO: Ajuste no helper de reset para respeitar os intervalos salvos
function resetarGradeParaSlotsEstudar() {
    let novaGrade = {};
    const startMin = converterParaMinutos(el("plan-config-inicio").value);
    const endMin = converterParaMinutos(el("plan-config-fim").value);

    DIAS_SEMANA.forEach(dia => {
        const intervalos = window.planoAtual.intervalos[dia] || [];
        for (let minAtual = startMin; minAtual < endMin; minAtual += 30) {
            const h = Math.floor(minAtual / 60);
            const m = minAtual % 60;
            const horaStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
            const chave = `cell-${dia}-${horaStr}`;
            
            let estaNoIntervalo = false;
            intervalos.forEach(int => {
                const minI = converterParaMinutos(int.inicio);
                const minF = converterParaMinutos(int.fim);
                if (minAtual >= minI && minAtual < minF) estaNoIntervalo = true;
            });

            // AQUI ESTÁ A CHAVE: Se não está no intervalo, é DESCANSO e o motor não pode tocar.
            novaGrade[chave] = estaNoIntervalo ? "Estudar" : "Descanso";
        }
    });
    return novaGrade;
}

function tentarEncaixeLote(inventario, grade, nivel, restricoes) {
    const logDia = { "Segunda": [], "Terça": [], "Quarta": [], "Quinta": [], "Sexta": [], "Sábado": [], "Domingo": [] };
    const ultimaMateriaNoDia = { "Segunda": null, "Terça": null, "Quarta": null, "Quinta": null, "Sexta": null, "Sábado": null, "Domingo": null };

    for (let bloco of inventario) {
        let alocado = false;
        // Ordem de dias randômica para evitar saturar a Segunda-feira
        const dias = [...DIAS_SEMANA].sort(() => Math.random() - 0.5);

        for (let dia of dias) {
            const jaTeveNoDia = logDia[dia].includes(bloco.materia);
            const foiAAnterior = ultimaMateriaNoDia[dia] === bloco.materia;

            // Lógica de Relaxamento de Repetição
            if (jaTeveNoDia) {
                if (nivel === 0) continue; 
                if (nivel === 1) {
                    const maiorMateria = Object.values(restricoes).sort((a,b) => b.horasOriginais - a.horasOriginais)[0].materia;
                    if (bloco.materia !== maiorMateria || foiAAnterior) continue;
                }
                if (nivel >= 2 && foiAAnterior) continue; // Repete no dia, mas nunca em sequência direta
            }

            const slotInicio = buscarEspaçoDisponivel(bloco.tamanho, dia, grade);
            if (slotInicio) {
                aplicarBlocoNaGrade(slotInicio, bloco, dia, grade);
                logDia[dia].push(bloco.materia);
                ultimaMateriaNoDia[dia] = bloco.materia;
                alocado = true;
                break;
            }
        }
        if (!alocado) return false; 
    }
    return true;
}

function aplicarBlocoNaGrade(idInicio, bloco, dia, grade) {
    const slots = Object.keys(grade).filter(k => k.startsWith(`cell-${dia}`)).sort();
    let idx = slots.indexOf(idInicio);
    for (let i = 0; i < bloco.tamanho; i++) {
        grade[slots[idx + i]] = bloco.materia;
    }
}

function buscarEspaçoDisponivel(tamanho, dia, grade) {
    const slots = Object.keys(grade).filter(k => k.startsWith(`cell-${dia}`)).sort();
    let contagem = 0;
    for (let s of slots) {
        if (grade[s] === "Estudar") {
            contagem++;
            if (contagem === tamanho) return slots[slots.indexOf(s) - (tamanho - 1)];
        } else { contagem = 0; }
    }
    return null;
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
    if (!corpo) return;

    // Agora usa os valores definidos no cabeçalho (Início/Fim)
    const startMin = converterParaMinutos(el("plan-config-inicio").value);
    const endMin = converterParaMinutos(el("plan-config-fim").value);

    // Verificação dinâmica do tema
    const isDarkNow = document.body.classList.contains('dark-mode');

    corpo.innerHTML = "";

    for (let totalMin = startMin; totalMin < endMin; totalMin += 30) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const horaStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        
        let row = `<tr><td class="hora-col"><span>${horaStr}</span></td>`;;
        DIAS_SEMANA.forEach(d => {
            const idCell = `cell-${d}-${horaStr}`;
            const materia = window.planoAtual.grade[idCell] || "";
            
            // Cores padrão para células vazias
            let bg = isDarkNow ? "var(--dark-bg)" : "transparent";
            let text = isDarkNow ? "var(--dark-text)" : "var(--text)";
            
            if (materia === "Estudar") {
                bg = isDarkNow ? "var(--dark-surface-lighter)" : "var(--light)";
                if (!isDarkNow) text = "var(--text)";
            } else if (window.planConfig[materia]) {
                const idx = window.planConfig[materia].corIndex;
                
                bg = PALETA_CORES[idx];
        
                text = "var(--disc-text)";
            }
            
            row += `<td id="${idCell}" onclick="definirMateriaCelular('${d}','${horaStr}')" 
                        style="background-color: ${bg}; color: ${text};">
                        ${(materia === "Descanso" || materia === "Estudar") ? "" : materia}
                    </td>`;
        });
        corpo.innerHTML += row + `</tr>`;
    }

    // Linha final apenas para mostrar o horário de fechamento na divisória
    const hF = Math.floor(endMin / 60);
    const mF = endMin % 60;
    const fimStr = `${hF.toString().padStart(2, '0')}:${mF.toString().padStart(2, '0')}`;
    corpo.innerHTML += `<tr style="height:0;"><td class="hora-col"><span>${fimStr}</span></td><td colspan="7" style="border:none;"></td></tr>`;
}

// [CÓDIGO MODIFICADO] - Monitor em tempo real com detecção de sessões contínuas e contagem regressiva inteligente
setInterval(() => {
    const monitorMateria = el("monitor-materia");
    const monitorRelogio = el("monitor-tempo-restante");
    const barra = el("monitor-barra-progresso");

    const isDarkNow = document.body.classList.contains('dark-mode');
    
    if (!monitorMateria || !el("secao-plano") || el("secao-plano").style.display === "none") return;

    const agora = new Date();
    const diaNum = agora.getDay(); 
    const diaNome = DIAS_SEMANA[diaNum === 0 ? 6 : diaNum - 1];
    
    const h = agora.getHours().toString().padStart(2, '0');
    const m = agora.getMinutes() < 30 ? "00" : "30";
    const chaveAtual = `cell-${diaNome}-${h}:${m}`;
    
    const materiaAtual = window.planoAtual.grade[chaveAtual] || "Descanso";
    
    // Cálculo base: segundos restantes no bloco de 30min atual
    const segundosPassadosNoBloco = (agora.getMinutes() % 30) * 60 + agora.getSeconds();
    let segundosTotaisSessao = 1800 - segundosPassadosNoBloco;

    // [CÓDIGO INSERIDO] - Lógica de varredura para detectar blocos contínuos (Sessão Única)
    let offsetMinutos = 30;
    let proximaMateriaNome = "";
    const minutosRestantesNoBlocoAtual = 30 - (agora.getMinutes() % 30);

    while (true) {
        // Calcula o tempo exato do início do próximo bloco a ser verificado
        const dataCheck = new Date(agora.getTime() + (minutosRestantesNoBlocoAtual + (offsetMinutos - 30)) * 60000);
        const hC = dataCheck.getHours().toString().padStart(2, '0');
        const mC = dataCheck.getMinutes() < 30 ? "00" : "30";
        const diaC = DIAS_SEMANA[dataCheck.getDay() === 0 ? 6 : dataCheck.getDay() - 1];
        const chaveCheck = `cell-${diaC}-${hC}:${mC}`;
        const materiaCheck = window.planoAtual.grade[chaveCheck] || "Descanso";

        // Se estamos em uma matéria real, soma enquanto a matéria for a mesma
        if (materiaAtual !== "Descanso" && materiaAtual !== "Estudar") {
            if (materiaCheck === materiaAtual) {
                segundosTotaisSessao += 1800;
                offsetMinutos += 30;
            } else {
                break; // Fim da sessão da disciplina
            }
        } 
        // Se estamos em Descanso/Vazio, soma enquanto não houver matéria real
        else {
            if (materiaCheck === "Descanso" || materiaCheck === "Estudar") {
                segundosTotaisSessao += 1800;
                offsetMinutos += 30;
            } else {
                proximaMateriaNome = materiaCheck; // Identifica o que virá depois do descanso
                break;
            }
        }
        
        // Trava de segurança para não processar mais de 24h
        if (offsetMinutos > 10080) break;
    }

    // [CÓDIGO MODIFICADO] - Atualização da interface baseada no estado (Estudo vs Descanso)
    if (materiaAtual !== "Descanso" && materiaAtual !== "Estudar") {
        monitorMateria.innerText = materiaAtual;
        // Aplica a cor da disciplina se houver configuração
        if (window.planConfig[materiaAtual]) {
            // Acessa a paleta dinâmica via corIndex
            const idx = window.planConfig[materiaAtual].corIndex;
            monitorMateria.style.color = PALETA_CORES[idx];
        }
    } else {
        // [CÓDIGO INSERIDO] - Exibe a próxima disciplina no lugar do "Descanso" genérico
        monitorMateria.innerText = proximaMateriaNome ? `Próxima: ${proximaMateriaNome}` : "Descanso";
        monitorMateria.style.color = isDarkNow ? "var(--dark-text)" : "var(--text-muted)";
    }

    if (monitorRelogio) {
        monitorRelogio.innerText = formatarTempoRestante(segundosTotaisSessao);
    }

    if (barra) {
        // [CÓDIGO MODIFICADO] - A barra agora reflete os 30 minutos do bloco técnico para manter fluidez visual
        const pct = ((1800 - (segundosTotaisSessao % 1800)) / 1800) * 100;
        barra.style.width = `${pct || 100}%`;
    }
}, 1000);

// [CÓDIGO INSERIDO] - Função para alternar o Modo Foco e centralizar o monitor
function alternarModoFoco() {
    const monitor = el("monitor-sessao-container"); // Certifique-se de que o container do monitor tem este ID
    const configuracoes = el("wrapper-config-inputs");
    const sugestoes = el("lista-sugestao-horas");
    
    const estaAtivo = document.body.classList.toggle("modo-foco-ativo");

    if (estaAtivo) {
        if (configuracoes) configuracoes.style.display = "none";
        if (sugestoes) sugestoes.style.display = "none";
        // [CÓDIGO MODIFICADO] - Ajusta o container para ocupar a tela de forma limpa
        if (monitor) monitor.style.padding = "100px 20px";
    } else {
        // [CÓDIGO MODIFICADO] - Restaura a visibilidade original
        if (configuracoes) configuracoes.style.display = "block";
        if (sugestoes) sugestoes.style.display = "block";
        if (monitor) monitor.style.padding = "20px";
    }
}

// Função para o botão Salvar
async function salvarPlanoEstudos() {
    window.planoAtual.config = {
        inicio: el("plan-config-inicio").value,
        fim: el("plan-config-fim").value
    };

    localStorage.setItem("plano_estudos_user", JSON.stringify(window.planoAtual));
    
    try {
        // [CÓDIGO INSERIDO] - Chamada para a rota /plan do Python para persistência no arquivo
        const resp = await fetch(`${API}/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(window.planoAtual)
        });

        if (resp.ok) {
            // [CÓDIGO MODIFICADO] - Feedback visual indispensável para o usuário
            alert("✅ Plano de estudos salvo com sucesso!");
        } else {
            const erro = await resp.json();
            alert("❌ Erro ao salvar no servidor: " + (erro.status || "Falha desconhecida"));
        }
    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("❌ Falha na conexão ao tentar salvar o plano.");
    }
}

// Listener de carga unificado e assíncrono para priorizar o servidor Python
window.addEventListener('load', async () => {
    // Tenta carregar o plano_estudos.json diretamente do servidor
    try {
        const response = await fetch(`${API}/plan`);
        if (response.ok) {
            const planoSalvo = await response.json();
            
            // Verifica se o objeto retornado possui dados válidos
            if (planoSalvo.grade && Object.keys(planoSalvo.grade).length > 0) {
                window.planoAtual = planoSalvo;
                console.log("✅ Plano carregado do servidor físico.");

                // Restaura os inputs da interface com o que foi salvo
                if (planoSalvo.config) {
                    el("plan-config-inicio").value = planoSalvo.config.inicio;
                    el("plan-config-fim").value = planoSalvo.config.fim;
                }
                
                // Força a atualização da grade e dos inputs com os dados do arquivo
                if (typeof renderizarGridPlano === 'function') renderizarGridPlano();
                if (typeof renderizarTabelaPesos === 'function') renderizarTabelaPesos();
                if (typeof renderizarConfigIntervalos === 'function') renderizarConfigIntervalos();
                if (window.planoAtual.horas) renderizarListaSugestao(window.planoAtual.horas);

                alternarVisibilidadePlano(true);
                
                return; // Carregamento do servidor concluído com sucesso
            }
        }
    } catch (error) {
        console.warn("⚠️ Servidor inacessível. Tentando LocalStorage...", error);
    }

    const salvoLocal = localStorage.getItem("plano_estudos_user");
    if (salvoLocal) {
        window.planoAtual = JSON.parse(salvoLocal);
        renderizarGridPlano();
        renderizarTabelaPesos();
    }
});

// Função completa para cálculo de alocação de tempo via TOPSIS
async function calcularPlanoTopsis(silencioso = false) {
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
            peso_prova: parseFloat(input.value) || 0.14,
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

    } catch (error) {
        console.error(error);
        alert("Erro ao processar plano.");
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

// [CÓDIGO MODIFICADO] - Captura dinâmica de pesos e desempenho individual para o motor SAW
async function calcularPlanoSAW(silencioso = false) {
    const horasSemanais = parseFloat(calcularHorasTotaisDisponiveis());

    // [CÓDIGO INSERIDO] - Captura dos pesos dos inputs (W1, W2, W3)
    const w1 = parseFloat(el("input-w-prova").value) || 1;
    const w2 = parseFloat(el("input-w-desempenho").value) || 1;
    const w3 = parseFloat(el("input-w-tipo").value) || 1;

    const criterios = Array.from(document.querySelectorAll(".peso-mcda")).map(input => {
        const disc = input.getAttribute("data-disc");
        const select = document.querySelector(`.tipo-mcda[data-disc="${disc}"]`);
        
        // [CÓDIGO INSERIDO] - Captura o valor de desempenho individual da disciplina
        const inputDesempenho = document.querySelector(`.sessao-desempenho[data-disc="${disc}"]`);
        const desempenho = inputDesempenho ? parseFloat(inputDesempenho.value) : 50;
        
        return {
            disciplina: disc,
            valor_prova: parseFloat(input.value) || 0.14,
            valor_desempenho: desempenho,
            valor_tipo: (select && select.value === 'classificatorio') ? 1.0 : 0.0,
            objetivos: ["maximizacao", "minimizacao", "maximizacao"]
        };
    });

    try {
        const response = await fetch(`${API}/plan/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                horas_semanais: horasSemanais,
                criterios: criterios,
                // Envia os pesos brutos; o Python se vira para normalizar
                pesos_globais: [w1, w2, w3]
            })
        });

        /* [CÓDIGO EXCLUÍDO (Antiga chamada TOPSIS)]:
        const response = await fetch(`${API}/plan/calculate`, { ... body: JSON.stringify({ criterios: criterios }) });
        */

        const distribuicaoHoras = await response.json();
        window.planoAtual.horas = distribuicaoHoras;
        renderizarListaSugestao(distribuicaoHoras);

    } catch (error) {
        console.error("Erro no cálculo SAW:", error);
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

// Função de retorno ao modo de configuração
function voltarParaConfiguracao() {
    alternarVisibilidadePlano(false);
}

// [CÓDIGO INSERIDO] - Função para formatar segundos em D, H, M, S
function formatarTempoRestante(segundos) {
    const d = Math.floor(segundos / 86400);
    const h = Math.floor((segundos % 86400) / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;

    let partes = [];
    if (d > 0) partes.push(`${d}d`);
    
    // Formata HH:MM:SS com padStart para manter o padrão visual
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    
    partes.push(`${hh}:${mm}:${ss}`);
    return partes.join(' ') + " restante";
}