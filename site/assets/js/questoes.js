// --- IMPORTAÇÃO PDF & DRAG DROP ---
async function lerPDF() {
  let lista = el("imp-lista-questoes");
  if (lista && lista.children.length > 0)
    if (!confirm("Substituir lista atual?")) return;
  let inp = el("imp-file");
  if (inp.files.length === 0) return alert("Selecione PDF");
  let fd = new FormData();
  fd.append("file", inp.files[0]);
  let disciplinaAlvo = el("imp-disciplina").value;
  if (!disciplinaAlvo) return alert("Selecione a disciplina!");
  fd.append("disciplina", disciplinaAlvo);
  el("imp-preview-container").style.display = "none";
  el("imp-lista-questoes").innerHTML = "";
  showLoader("Lendo PDF...");
  try {
    let r = await fetch(`${API}/upload-pdf`, { method: "POST", body: fd });
    let questoes = await r.json();
    renderPreview(questoes);
  } catch (e) {
    alert("Erro ao ler PDF.");
  } finally {
    hideLoader();
  }
}

function renderPreview(lista) {
  let div = el("imp-lista-questoes");
  div.innerHTML = "";
  el("imp-titulo-preview").innerText = `Prévia (${lista.length})`;
  el("imp-preview-container").style.display = "block";

  let globalAssunto = el("imp-assunto").value;

  lista.forEach((q, i) => {
    let statusHtml = q.ja_cadastrada
      ? `<span class="aviso-dup">⚠️ Já Cadastrada</span>`
      : "";
    let classeRow = q.ja_cadastrada ? "imp-row ja-cadastrada" : "imp-row";
    let optionsGab = `<option value="">?</option>`;
    ["A", "B", "C", "D", "E"].forEach((l) => {
      let sel = q.gabarito === l ? "selected" : "";
      optionsGab += `<option value="${l}" ${sel}>${l}</option>`;
    });

    let areaAlternativas = "";
    if (q.tipo === "CE") {
        areaAlternativas = `<div style="padding:10px; color:#555; font-style:italic">Questão do tipo Certo/Errado (Sem alternativas A-E)</div>`;
    } else {
        areaAlternativas = `
        <div style="margin-top:5px; display:grid; gap:5px">
            <div class="input-group"><span>A)</span><input type="text" class="imp-alt-a" value="${q.alt_a}" onfocus="showToolbar(this)"></div>
            <div class="input-group"><span>B)</span><input type="text" class="imp-alt-b" value="${q.alt_b}" onfocus="showToolbar(this)"></div>
            <div class="input-group"><span>C)</span><input type="text" class="imp-alt-c" value="${q.alt_c}" onfocus="showToolbar(this)"></div>
            <div class="input-group"><span>D)</span><input type="text" class="imp-alt-d" value="${q.alt_d}" onfocus="showToolbar(this)"></div>
            <div class="input-group"><span>E)</span><input type="text" class="imp-alt-e" value="${q.alt_e}" onfocus="showToolbar(this)"></div>
        </div>`;
    };

    // Se tiver assunto global digitado, usa ele. Se não, usa o que veio do Python. Se não tiver nada, "Geral".
    let assuntoFinal = globalAssunto ? globalAssunto : (q.assunto || "Geral");

    div.innerHTML += `
<div class="${classeRow}" id="imp-row-${i}">
    <div style="width:40px; font-weight:bold; text-align:center">${i + 1}<div id="status-${i}">${statusHtml}</div></div>
    <div class="imp-meta">
        <input type="text" class="imp-banca" placeholder="Banca" value="${q.banca}" list="lista-bancas">
        <input type="text" class="imp-inst" placeholder="Instituição" value="${q.instituicao}" list="lista-instituicoes" style="font-size:0.85em">
        <input type="number" class="imp-ano" placeholder="Ano" value="${q.ano}">

        <input type="text" class="imp-assunto-ind" placeholder="Assunto" value="${assuntoFinal}" list="lista-assuntos" style="font-size:0.85em; color:var(--purple)">

        <select class="imp-dif"><option value="Médio">Médio</option><option value="Fácil">Fácil</option><option value="Difícil">Difícil</option></select>
    </div>
    <div class="imp-content">
        <textarea class="imp-textarea imp-enunciado" rows="3" onfocus="showToolbar(this)" oninput="verificarDuplicidadeDinamica(${i})">${q.enunciado}</textarea>
        <div style="margin:5px 0"><input type="file" class="imp-imagem-file" accept="image/*" style="font-size:0.8em"></div>
        ${areaAlternativas}
    </div>
    <div class="imp-gab"><select class="imp-gabarito">${optionsGab}</select></div>
    <div class="imp-acoes"><button class="btn-icon" style="color:#27ae60" onclick="salvarIndividual(${i})">💾</button><button class="btn-icon" style="color:red" onclick="el('imp-row-${i}').remove()">✖</button></div>
</div>`;
  });
}

function verificarDuplicidadeDinamica(index) {
  clearTimeout(checkDupTimeout);
  checkDupTimeout = setTimeout(async () => {
    let row = el(`imp-row-${index}`);
    let payload = {
      enunciado: row.querySelector(".imp-enunciado").value,
      alt_a: row.querySelector(".imp-alt-a").value,
    };
    if (!payload.enunciado) return;
    const resp = await fetch(`${API}/check-duplicidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    el(`status-${index}`).innerHTML = data.existe
      ? `<span class="aviso-dup">⚠️ Já Cadastrada</span>`
      : "";
    row.classList.toggle("ja-cadastrada", data.existe);
  }, 500);
}

async function salvarIndividual(index) {
  let r = el(`imp-row-${index}`);
  let disc = el("imp-disciplina").value;
  if (!disc) return alert("Digite/Selecione a Disciplina base.");
  let assuntoFinal =
    r.querySelector(".imp-assunto-ind").value ||
    el("imp-assunto").value ||
    "Geral";
  const formData = new FormData();
  formData.append("banca", r.querySelector(".imp-banca").value);
  formData.append("instituicao", r.querySelector(".imp-inst").value);
  formData.append("ano", r.querySelector(".imp-ano").value);
  formData.append("dificuldade", r.querySelector(".imp-dif").value);
  formData.append("enunciado", r.querySelector(".imp-enunciado").value);

  // ---  Só lê as alternativas se o input existir ---
  let iA = r.querySelector(".imp-alt-a"), iB = r.querySelector(".imp-alt-b");
  let iC = r.querySelector(".imp-alt-c"), iD = r.querySelector(".imp-alt-d"), iE = r.querySelector(".imp-alt-e");

  formData.append("alt_a", iA ? iA.value : ""); 
  formData.append("alt_b", iB ? iB.value : "");
  formData.append("alt_c", iC ? iC.value : ""); 
  formData.append("alt_d", iD ? iD.value : "");
  formData.append("alt_e", iE ? iE.value : "");

  formData.append("gabarito", r.querySelector(".imp-gabarito").value);

  let tipoDetectado = iA ? "ME" : "CE"; //Detecta o tipo de questão
  formData.append("tipo", tipoDetectado);
  
  formData.append("disciplina", disc);
  formData.append("assunto", assuntoFinal);

  let fileInput = r.querySelector(".imp-imagem-file");
  if (fileInput && fileInput.files[0])
    formData.append("imagem_file", fileInput.files[0]);
  
  if (!formData.get("enunciado") || !formData.get("gabarito"))
    return alert("Dados incompletos.");
  try {
    const response = await fetch(`${API}/questoes`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      r.classList.add("sucesso-salvo");
      r.querySelector(
        ".imp-acoes"
      ).innerHTML = `<span style="color:green; font-weight:bold">Salva!</span>`;
      init();
    } else if (response.status === 409) {
      alert("Duplicada!");
    } else {
      alert("Erro ao salvar.");
    }
  } catch (e) {
    alert("Erro conexao");
  }
}

async function salvarLote() {
  let rows = document.querySelectorAll(".imp-row");
  let disc = el("imp-disciplina").value;
  let assGlobal = el("imp-assunto").value;
  if (!disc) return alert("Informe a Disciplina base.");
  let lote = [];
  rows.forEach((r) => {
    if (
      r.classList.contains("sucesso-salvo") ||
      r.classList.contains("ja-cadastrada") ||
      r.querySelector(".imp-imagem-file").files.length > 0
    )
      return;
    let assuntoFinal =
      r.querySelector(".imp-assunto-ind").value || assGlobal || "Geral";
    let obj = {
      banca: r.querySelector(".imp-banca").value,
      instituicao: r.querySelector(".imp-inst").value,
      ano: r.querySelector(".imp-ano").value,
      dificuldade: r.querySelector(".imp-dif").value,
      enunciado: r.querySelector(".imp-enunciado").value,
      alt_a: r.querySelector(".imp-alt-a").value,
      alt_b: r.querySelector(".imp-alt-b").value,
      alt_c: r.querySelector(".imp-alt-c").value,
      alt_d: r.querySelector(".imp-alt-d").value,
      alt_e: r.querySelector(".imp-alt-e").value,
      gabarito: r.querySelector(".imp-gabarito").value,
      tipo: "ME",
      disciplina: disc,
      assunto: assuntoFinal,
    };
    if (obj.enunciado && obj.gabarito) lote.push(obj);
  });
  if (lote.length === 0) return alert("Nada para salvar em lote.");
  if (!confirm(`Salvar ${lote.length} questões?`)) return;
  showLoader("Salvando...");
  let ok = 0;
  for (let q of lote) {
    try {
      if (
        (
          await fetch(`${API}/questoes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(q),
          })
        ).ok
      )
        ok++;
    } catch (e) {}
  }
  hideLoader();
  alert(`${ok} Salvas!`);
  init();
}

function setupDragDrop() {
  const dropZone = el("area-drop");
  const fileInput = el("imp-file");
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => dropZone.classList.add("drag-over"),
      false
    );
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => dropZone.classList.remove("drag-over"),
      false
    );
  });
  dropZone.addEventListener("drop", handleDrop, false);
  function handleDrop(e) {
    let dt = e.dataTransfer;
    let files = dt.files;
    if (files.length > 0) {
      fileInput.files = files;
    }
  }
}

// --- LÓGICA DE FORMULÁRIOS E TABELA ---
function altTipo(p) {
  let t = el(`${p}-tipo`).value,
    d = el(`${p}-container-alt`),
    s = el(`${p}-gabarito`);
  s.innerHTML = "";
  if (t === "ME") {
    d.style.display = "block";
    ["A", "B", "C", "D", "E"].forEach(
      (l) => (s.innerHTML += `<option value="${l}">${l}</option>`)
    );
  } else {
    d.style.display = "none";
    s.innerHTML = `<option value="C">Certo</option><option value="E">Errado</option>`;
  }
}

el("form-cadastro").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append("banca", el("cad-banca").value);
  formData.append("instituicao", el("cad-instituicao").value);
  formData.append("ano", el("cad-ano").value);
  formData.append("enunciado", el("cad-enunciado").value);
  formData.append("disciplina", el("cad-disciplina").value);
  formData.append("assunto", el("cad-assunto").value);
  formData.append("dificuldade", el("cad-dificuldade").value);
  formData.append("tipo", el("cad-tipo").value);
  formData.append("gabarito", el("cad-gabarito").value);
  formData.append("alt_a", el("cad-alt-a").value);
  formData.append("alt_b", el("cad-alt-b").value);
  formData.append("alt_c", el("cad-alt-c").value);
  formData.append("alt_d", el("cad-alt-d").value);
  formData.append("alt_e", el("cad-alt-e").value);
  let fileInput = el("cad-imagem");
  if (fileInput.files[0]) formData.append("imagem_file", fileInput.files[0]);
  try {
    const r = await fetch(`${API}/questoes`, {
      method: "POST",
      body: formData,
    });
    if (r.status === 409) return alert("Duplicada!");
    if (r.ok) {
      alert("Salvo!");
      e.target.reset();
      fileInput.value = "";
      altTipo("cad");
      init();
    } else throw new Error();
  } catch (err) {
    alert("Erro ao salvar.");
  }
};

function carrTab() {
  el("total-db").innerText = `${db.length} questões`;
  filtrar();
}

function filtrar() {
  let txt = el("busca-texto").value.toLowerCase(),
    ban = el("busca-banca").value,
    inst = el("busca-instituicao").value, // Captura valor (vem MAIUSCULO do datalist)
    dis = el("busca-disciplina").value,
    ass = el("busca-assunto").value,
    dif = el("busca-dificuldade").value;

  let filtrados = db.filter((q) => {
    let qInst = q.instituicao ? q.instituicao.toString().toUpperCase() : "";
    let filtroInst = inst ? inst.toUpperCase() : "";

    return (
      q.enunciado.toLowerCase().includes(txt) &&
      (ban === "" || q.banca === ban) &&
      (filtroInst === "" || qInst === filtroInst) &&
      (dis === "" || q.disciplina === dis) &&
      (ass === "" || q.assunto === ass) &&
      (dif === "" || q.dificuldade === dif)
    );
  });

  let tb = document.querySelector("#tabela-questoes tbody");
  tb.innerHTML = "";
  filtrados.forEach((q) => {
    let difClass =
      q.dificuldade === "Fácil"
        ? "color-facil"
        : q.dificuldade === "Médio"
        ? "color-medio"
        : "color-dificil";
    let dots =
      q.dificuldade === "Fácil"
        ? "●"
        : q.dificuldade === "Médio"
        ? "●●"
        : "●●●";
    tb.innerHTML += `<tr>
    <td>${q.id}</td>
    <td>${q.banca}</td>
    <td style="font-size:0.85em; color:#555;">${q.instituicao || "-"}</td>
    <td>${q.ano || "-"}</td>
    <td>${q.disciplina}</td>
    <td title="${q.enunciado.replace(/"/g, "&quot;")}">${q.enunciado.substring(
      0,
      40
    )}...</td>
    <td>${q.assunto}</td>
    <td style="text-align:center"><span class="dots ${difClass}">${dots}</span></td>
    <td>${q.gabarito}</td>
    <td><button class="btn-icon" onclick="abrirEd('${
      q.id
    }')">✏️</button><button class="btn-icon" onclick="del('${
      q.id
    }')">🗑️</button></td>
</tr>`;
  });
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
  carregarAssuntos("edit");
  el("edit-assunto").value = q.assunto;
  altTipo("edit");
  if (q.tipo === "ME") {
    el("edit-alt-a").value = q.alt_a || "";
    el("edit-alt-b").value = q.alt_b || "";
    el("edit-alt-c").value = q.alt_c || "";
    el("edit-alt-d").value = q.alt_d || "";
    el("edit-alt-e").value = q.alt_e || "";
  }
  el("edit-gabarito").value = q.gabarito;
  el("edit-imagem-nome").value = q.imagem || "";
  el("edit-imagem-file").value = "";
  el("edit-img-preview-container").innerHTML = q.imagem
    ? `<a href="${API}/img/q_img/${q.imagem}" target="_blank"><img src="${API}/img/q_img/${q.imagem}" class="img-preview-mini"></a>`
    : "<span style='font-size:0.8em;color:#999'>Sem imagem</span>";
  el("modal-edicao").style.display = "block";
}

el("form-edicao").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append("id", el("edit-id").value);
  formData.append("banca", el("edit-banca").value);
  formData.append("instituicao", el("edit-instituicao").value);
  formData.append("ano", el("edit-ano").value);
  formData.append("enunciado", el("edit-enunciado").value);
  formData.append("disciplina", el("edit-disciplina").value);
  formData.append("assunto", el("edit-assunto").value);
  formData.append("dificuldade", el("edit-dificuldade").value);
  formData.append("tipo", el("edit-tipo").value);
  formData.append("gabarito", el("edit-gabarito").value);
  formData.append("alt_a", el("edit-alt-a").value);
  formData.append("alt_b", el("edit-alt-b").value);
  formData.append("alt_c", el("edit-alt-c").value);
  formData.append("alt_d", el("edit-alt-d").value);
  formData.append("alt_e", el("edit-alt-e").value);
  formData.append("imagem", el("edit-imagem-nome").value);
  let fileInput = el("edit-imagem-file");
  if (fileInput.files[0]) formData.append("imagem_file", fileInput.files[0]);
  await fetch(`${API}/questoes`, { method: "PUT", body: formData });
  el("modal-edicao").style.display = "none";
  init();
};

// Função para replicar o assunto global em tempo real
function aplicarAssuntoGlobal() {
  let valorGlobal = el("imp-assunto").value;
  let inputsIndividuais = document.querySelectorAll(".imp-assunto-ind");

  inputsIndividuais.forEach((inp) => {
    // Só sobrescreve se o global não estiver vazio
    if (valorGlobal.trim() !== "") {
      inp.value = valorGlobal;
    }
  });
}
