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
