async function carrTab(pagina = 1) {
  paginaAtual = pagina; // Atualiza a global

  // Captura os filtros atuais
  let txt = el("busca-texto").value;
  let ban = el("busca-banca").value;
  let inst = el("busca-instituicao").value;
  let dis = el("busca-disciplina").value;
  let ass = el("busca-assunto").value;
  let dif = el("busca-dificuldade").value;

  // Monta Query String
  let params = new URLSearchParams({
      page: pagina,
      texto: txt,
      banca: ban,
      instituicao: inst,
      disciplina: dis,
      assunto: ass,
      dificuldade: dif
  });

  try {
      showLoader("Carregando...");
      const res = await fetch(`${API}/questoes?${params.toString()}`);
      const data = await res.json();
      
      // Se a API retornar lista pura (modo antigo), converte para objeto
      let lista = Array.isArray(data) ? data : data.items;
      let total = Array.isArray(data) ? data.length : data.total;

      // ATUALIZA O TOTAL DE PÁGINAS GLOBALMENTE
      totalPaginas = Array.isArray(data) ? 1 : data.total_paginas;

      renderizarTabela(lista);
      atualizarControlesPaginacao(total);
      
  } catch (e) {
      console.error(e);
      alert("Erro ao carregar tabela.");
  } finally {
      hideLoader();
  }
}

/**
 * Alterna entre a visão de Questões e Textos na aba Banco
 * CODIGO INSERIDO
 */
function alternarVisaoBanco(visao) {
    const contQuestoes = document.getElementById('container-questoes-banco');
    const contTextos = document.getElementById('container-gerenciador-textos');
    const btnQ = document.getElementById('btn-tab-questoes');
    const btnT = document.getElementById('btn-tab-textos');


    // Verificação de segurança para evitar erro de 'null'
    if (!contQuestoes || !contTextos) {
        console.error("Erro: Containers do banco não encontrados no HTML. Verifique os IDs 'container-questoes-banco' e 'container-gerenciador-textos'.");
        return;
    }

    if (visao === 'questoes') {
        contQuestoes.style.display = 'block';
        contTextos.style.display = 'none';
        // Adiciona classe de destaque se os botões existirem
        if (btnQ) btnQ.classList.add('active');
        if (btnT) btnT.classList.remove('active');
    } else {
        contQuestoes.style.display = 'none';
        contTextos.style.display = 'block';
        if (btnQ) btnQ.classList.remove('active');
        if (btnT) btnT.classList.add('active');
        
        // Chama a renderização da lista de textos
        if (typeof renderListaTextos === "function") {
            renderListaTextos();
        }
    }
    
}


function renderizarTabela(lista) {
  let tb = document.querySelector("#tabela-questoes tbody");
  tb.innerHTML = "";
  
  if (lista.length === 0) {
      tb.innerHTML = "<tr><td colspan='10' style='text-align:center; padding:20px'>Nenhuma questão encontrada.</td></tr>";
      return;
  }

  lista.forEach((q) => {
      let difClass = q.dificuldade === "Fácil" ? "color-facil" : q.dificuldade === "Médio" ? "color-medio" : "color-dificil";
      let dots = q.dificuldade === "Fácil" ? "●" : q.dificuldade === "Médio" ? "●●" : "●●●";
      
      tb.innerHTML += `<tr>
          <td>${q.id}</td>
          <td>${q.data_insercao || '-'}</td>
          <td>${q.banca || '-'}</td>
          <td>${q.instituicao || "-"}</td>
          <td>${q.ano || "-"}</td>
          <td>${q.disciplina || '-'}</td>
          <td title="${(q.enunciado||'').replace(/"/g, "&quot;")}">${(q.enunciado||'').substring(0, 40)}...</td>
          <td>${q.assunto || '-'}</td>
          <td style="text-align:center"><span class="dots ${difClass}">${dots}</span></td>
          <td>${q.gabarito}</td>
          <td>
            <div class="tab-action-top">
              <button class="btn-icon" onclick="visualizarQuestaoBanco('${q.id}')" title="Visualizar Renderizada">👁️</button>
              <button class="btn-icon" onclick="abrirCopy('${q.id}')" title="Copiar como Nova">📋</button>
            </div>
            <div class="tab-action-bottom">
              <button class="btn-icon" onclick="abrirEd('${q.id}')">✏️</button>
              <button class="btn-icon" onclick="del('${q.id}')">🗑️</button>
            </div>
          </td>
      </tr>`;
  });
}


// Função para abrir o modal em modo Cópia
function abrirCopy(id) {
    // 1. Usa a lógica de preenchimento que você já tem para edição
    abrirEd(id);

    // 2. Pequeno delay para garantir que abrirEd terminou de preencher
    setTimeout(() => {
        // Altera o Título do Modal e a cor do Botão
        const modal = el("modal-edicao");
        modal.querySelector("h2").innerText = "Copiar Questão (Nova)";
        modal.querySelector(".btn-acao").innerText = "Salvar como Nova";
        modal.querySelector(".btn-acao").style.background = "#27ae60"; // Verde para novo

        // Trava de Segurança: Limpa ID, Gabarito e Comentários
        el("edit-id").value = ""; 
        el("edit-gabarito").value = ""; 
        el("edit-comentario-form").value = ""; 
        
        console.log("Modo cópia ativado: ID removido, pronto para salvar como nova.");
    }, 150);
}

function atualizarControlesPaginacao(totalItens) {
    el("total-db").innerText = `${totalItens} questões encontradas`;
    
    let divPag = el("paginacao-container");
    if(!divPag) return; // Se não criou a div no HTML, ignora

    divPag.innerHTML = `
        <button class="btn-pag" onclick="mudarPag(-1)" ${paginaAtual <= 1 ? 'disabled' : ''}>◀ Anterior</button>
        <span style="margin: 0 15px">Página <b>${paginaAtual}</b> de <b>${totalPaginas}</b></span>
        <button class="btn-pag" onclick="mudarPag(1)" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima ▶</button>
    `;
}

function mudarPag(delta) {
    let nova = paginaAtual + delta;
    if(nova >= 1 && nova <= totalPaginas) {
        carrTab(nova);
    }
}

function filtrar() {
  carrTab(1); // Recarrega do servidor aplicando os filtros na página 1
}

function del(id) {
  if (confirm("Excluir Questão?"))
    fetch(`${API}/questoes/${id}`, { method: "DELETE" }).then(init);
}
function ord(c) {
  ordCol.d = ordCol.c === c && ordCol.d === "asc" ? "desc" : "asc";
  ordCol.c = c;
  aplOrd();
  filtrar();
}
function aplOrd() {
  let { c, d } = ordCol;
  let m = d === "asc" ? 1 : -1;
  db.sort((a, b) => {
    let va = a[c] ? a[c].toString().toLowerCase() : "",
      vb = b[c] ? b[c].toString().toLowerCase() : "";
    if (c === "id") {
      va = parseInt(a[c]);
      vb = parseInt(b[c]);
    }
    return va < vb ? -1 * m : va > vb ? 1 * m : 0;
  });
}



function abrirEd(id) {
  const modal = el("modal-edicao");
  modal.querySelector("h2").innerText = "Editar Questão"; // Reseta o título
  modal.querySelector(".btn-acao").innerText = "Salvar Alterações";
  modal.querySelector(".btn-acao").style.background = "#f39c12"; // Cor original laranja
  
  let q = db.find((x) => String(x.id) === String(id));
  if (!q) return;
  el("edit-id").value = q.id;
  el("edit-enunciado").value = q.enunciado;
  el("edit-instituicao").value = q.instituicao || "";
  el("edit-ano").value = q.ano || "";
  el("edit-dificuldade").value = q.dificuldade;
  el("edit-tipo").value = q.tipo;
  el("edit-banca").value = q.banca;
  el("edit-disciplina").value = q.disciplina;

  // 3. Carrega assuntos e define o valor com um pequeno delay
  carregarAssuntos("edit");
  setTimeout(() => {
      el("edit-assunto").value = q.assunto;
  }, 50);

  // Seleciona o dropdown DENTRO do modal de edição
  let selTextoEdicao = document.querySelector("#form-edicao .sel-texto-apoio");
  if(selTextoEdicao) {
      selTextoEdicao.value = q.texto_apoio || ""; // Define o ID salvo ou vazio
      // Dispara evento 'change' manualmente para atualizar o preview do texto, se houver
      selTextoEdicao.dispatchEvent(new Event('change'));
  }

  altTipo("edit");
  if (q.tipo === "ME") {
    el("edit-alt-a").value = q.alt_a || "";
    el("edit-alt-b").value = q.alt_b || "";
    el("edit-alt-c").value = q.alt_c || "";
    el("edit-alt-d").value = q.alt_d || "";
    el("edit-alt-e").value = q.alt_e || "";
  }

  // Pequeno delay para garantir que o select de gabarito foi atualizado pelo altTipo
  setTimeout(() => {
      el("edit-gabarito").value = q.gabarito;
  }, 50);

  el("edit-imagem-nome").value = q.imagem || "";
  el("edit-imagem-file").value = "";
  el("edit-img-preview-container").innerHTML = q.imagem
    ? `<a href="${API}/img/q_img/${q.imagem}" target="_blank"><img src="${API}/img/q_img/${q.imagem}" class="img-preview-mini"></a>`
    : "<span style='font-size:0.8em;color:#999'>Sem imagem</span>";

  if(el("edit-comentario-form")) {
      el("edit-comentario-form").value = q.comentarios || "";
  }

  
  el("modal-edicao").style.display = "block";
}

el("form-edicao").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData();
  const idExistente = el("edit-id").value;

  // Se houver ID, enviamos (é um PUT). Se não houver, o servidor gera um novo (é um POST).
  if (idExistente) {
      formData.append("id", idExistente);
  }

  formData.append("banca", el("edit-banca").value);
  formData.append("instituicao", el("edit-instituicao").value);
  formData.append("ano", el("edit-ano").value);
  formData.append("enunciado", el("edit-enunciado").value);
  formData.append("disciplina", el("edit-disciplina").value);
  formData.append("assunto", el("edit-assunto").value);
  formData.append("dificuldade", el("edit-dificuldade").value);
  formData.append("tipo", el("edit-tipo").value);
  formData.append("gabarito", el("edit-gabarito").value);
  formData.append("comentarios", el("edit-comentario-form").value);
  formData.append("texto_apoio", document.querySelector("#form-edicao .sel-texto-apoio").value);
  formData.append("alt_a", el("edit-alt-a").value);
  formData.append("alt_b", el("edit-alt-b").value);
  formData.append("alt_c", el("edit-alt-c").value);
  formData.append("alt_d", el("edit-alt-d").value);
  formData.append("alt_e", el("edit-alt-e").value);
  formData.append("imagem", el("edit-imagem-nome").value);
  let fileInput = el("edit-imagem-file");
  if (fileInput.files[0]) formData.append("imagem_file", fileInput.files[0]);

  // DECIDE O MÉTODO: Se tem ID é PUT, se não tem é POST
  const metodo = idExistente ? "PUT" : "POST";

  try {
        const res = await fetch(`${API}/questoes`, { method: metodo, body: formData });
        if (res.ok) {
          alert(metodo === "POST" ? "Nova questão criada com sucesso!" : "Questão atualizada!");
          el("modal-edicao").style.display = "none";
          // 1. Atualiza o banco global (db) para que Praticar/Simulado vejam a mudança
          await init(); 
          
          // 2. Força a tabela a permanecer na página onde você estava
          carrTab(paginaAtual);
        } else {
          const erro = await res.json();
          alert("Erro: " + (erro.erro || "Falha na comunicação"));
        }
    } catch (err) {
        alert("Erro ao salvar.");
    }
};

// VARIÁVEIS GLOBAIS DE PAGINAÇÃO
let paginaAtual = 1;
let totalPaginas = 1;

let filtroCache = {}; // Guarda o filtro atual para navegação

// Variável global para cache de textos
let cacheTextos = [];

// 1. Função para carregar textos do servidor e preencher os Selects
async function carregarListaTextos() {
  try {
      const res = await fetch(`${API}/textos`);
      cacheTextos = await res.json();

      // --- ORDENAÇÃO ALFABÉTICA (A-Z) ---
      cacheTextos.sort((a, b) => {
          let nomeA = (a.titulo || "").toLowerCase();
          let nomeB = (b.titulo || "").toLowerCase();
          return nomeA.localeCompare(nomeB); // Ordena de forma inteligente
      });
      
      // Atualiza todos os selects de texto (cadastro e edição)
      document.querySelectorAll('.sel-texto-apoio').forEach(sel => {
          let valorAtual = sel.value; // Tenta manter seleção se houver
          sel.innerHTML = `<option value="">-- Sem Texto de Apoio --</option>`;

          cacheTextos.forEach(t => {
              // Mostra os primeiros 60 caracteres no dropdown
              let resumo = t.titulo + " - " + t.conteudo.substring(0, 50).replace(/\n/g, " ") + "...";
              sel.innerHTML += `<option value="${t.id}">${resumo}</option>`;
          });

          // Restaura o valor selecionado se ele ainda existir na lista
          if(valorAtual) sel.value = valorAtual;
          
          // Adiciona evento para mostrar preview
          sel.onchange = function() {
              let txt = cacheTextos.find(x => x.id === this.value);

              // Procura a div de preview correspondente (subindo para o pai comum)
              let container = this.closest('.input-group') || this.parentElement.parentElement;
              let divPrev = container.querySelector('.preview-texto-apoio');

              if(divPrev) {
                  divPrev.innerText = txt ? txt.conteudo.substring(0, 150) + "..." : "";
              }
          }
      });
  } catch (e) { console.error("Erro ao carregar textos", e); }
}

// 2. Funções do Modal de Novo Texto
function abrirModalTexto(id = null) {
    if (id) {
        const t = cacheTextos.find(x => String(x.id) === String(id));
        if (!t) return;
        
        el("edit-texto-id").value = t.id;
        el("novo-texto-titulo").value = t.titulo;
        el("novo-texto-conteudo").value = t.conteudo;
        el("titulo-modal-texto").innerText = "Editar Texto ID: " + t.id;
    } else {
        // Limpa para novo cadastro
        el("edit-texto-id").value = "";
        el("novo-texto-titulo").value = "";
        el("novo-texto-conteudo").value = "";
        el("titulo-modal-texto").innerText = "Cadastrar Novo Texto";
    }
    el('modal-novo-texto').style.display = 'block';
}

async function salvarNovoTextoApi() {
  const id = el("edit-texto-id").value;
  
  // Captura os valores brutos para salvar
  const tituloRaw = el("novo-texto-titulo").value;
  const conteudoRaw = el("novo-texto-conteudo").value;
    
  // Usa o .trim() apenas para validação, mas mantém o dado bruto
  if (!tituloRaw.trim() || !conteudoRaw.trim()) {
      return alert("Preencha o título e o conteúdo do texto.");
  }


  // O payload agora recebe as variáveis sem o tratamento de trim
  const payload = { 
      titulo: tituloRaw, 
      conteudo: conteudoRaw 
  };

  const metodo = id ? "PUT" : "POST";
  if (id) payload.id = id;

  try {
    const resp = await fetch(`${API}/textos`, {
        method: metodo,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    
    if(resp.ok) {
      alert("Texto salvo com sucesso!");
      el('modal-novo-texto').style.display = 'none';
      
      const res = await fetch(`${API}/textos`);
      cacheTextos = await res.json();
      
      if (typeof renderListaTextos === "function") renderListaTextos();

    } else {
      const err = await resp.json();
      alert("Erro: " + (err.erro || "Falha ao processar requisição"));
    }
      
  } catch(e) {
    console.error("Erro ao salvar texto:", e);
    alert("Erro de conexão com o servidor.");;
  }
}

