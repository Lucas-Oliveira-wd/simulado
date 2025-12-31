// --- ESTATÍSTICAS ---

// Variável global para armazenar os parâmetros do gradiente e evitar cálculos redundantes
window.statsGradiente = { lim_inf: 0, med: 50, lim_sup: 100 };

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

  // Fallback agora retorna apenas os pontos de controle do gráfico
    if (dataset.length === 0) {
        window.statsGradiente = { lim_inf: 0, med: 50, lim_sup: 100 };
        return window.statsGradiente;
    }

  // 5. Calcula Quartis nos dados filtrados
  const q1 = dataset[Math.floor(dataset.length * 0.25)];
  const med = dataset[Math.floor(dataset.length * 0.50)];
  const q3 = dataset[Math.floor(dataset.length * 0.75)];
  const iqr = q3 - q1;

  window.statsGradiente = {
    lim_inf: Math.max(0, q1 - (0.5 * iqr)),
    med: med,
    lim_sup: Math.min(100, q3 + (0.5 * iqr))
  };

  // Retorno simplificado contendo apenas a tríade do gradiente
  return window.statsGradiente;
}

// Função para gerar cor dinâmica (Gradiente: Vermelho -> Amarelo -> Verde)
function getCorGradiente(porcentagem) {
  // Se não passar stats, usa padrão fixo (segurança)
  const { lim_inf, med, lim_sup } = window.statsGradiente;

  const vermelho = { r: 255, g: 0, b: 0 }; 
  const amarelo = { r: 255, g: 255, b: 0 };  
  const verde = { r: 0, g: 255, b: 0 };


  // 1. Abaixo do 1º Quartil: Vermelho Sólido (Zona Crítica)
  if (porcentagem <= lim_inf) return `rgb(${vermelho.r}, ${vermelho.g}, ${vermelho.b})`;

  // 2. Acima do 3º Quartil: Verde Sólido (Zona de Excelência)
  if (porcentagem >= lim_sup) return `rgb(${verde.r}, ${verde.g}, ${verde.b})`;

  let inicio, fim, fator;

  // 3. Gradiente Vermelho -> Amarelo (Entre Q1 e Mediana)
  if (porcentagem < med) {
      inicio = vermelho;
      fim = amarelo;
      // Normaliza onde a porcentagem está entre Q1 e Med
      fator = (porcentagem - lim_inf) / (med - lim_inf);
  } 
  // 4. Gradiente Amarelo -> Verde (Entre Mediana e Q3)
  else {
      inicio = amarelo;
      fim = verde;
      // Normaliza onde a porcentagem está entre Med e Q3
      fator = (porcentagem - med) / (lim_sup - med);
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

  // Chama a função para atualizar a variável global window.statsGradiente antes do loop
  calcularQuartisGlobais();

  // Atualiza a legenda na tela
  el("legenda-quartis").innerHTML = `
    <strong>Parâmetros Calculados do Banco (0.5x IQR):</strong><br>
    <span style="color:#c0392b">🔴 Crítico: < ${window.statsGradiente.lim_inf.toFixed(1)}%</span> &nbsp;|&nbsp; 
    <span style="color:#f39c12">🟡 Mediana: ${window.statsGradiente.med.toFixed(1)}%</span> &nbsp;|&nbsp; 
    <span style="color:#27ae60">🟢 Excelência: > ${window.statsGradiente.lim_sup.toFixed(1)}%</span>
`;

  for (let k of sortedKeys) {
    if (stats[k].r > 0) { // Só mostra se tiver respostas
      labels.push(k);
      let p = (stats[k].a / stats[k].r) * 100;
      data.push(p.toFixed(1));
      
      // Passa os stats para a função de cor
      colors.push(getCorGradiente(p));
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