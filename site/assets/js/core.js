// Função do Tema Escuro
function toggleTema() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("temaEscuro", document.body.classList.contains("dark-mode"));
}
// Carregar preferência ao iniciar
if (localStorage.getItem("temaEscuro") === "true") document.body.classList.add("dark-mode");


const API = "http://localhost:5000";
let db = [], opcoes = {}, flashDb = [], flashPool = [], flashIdx = 0;
let pratPool = [], pratIdx = 0, pratAcertos = 0;
let provaPool = [], provaIdx = 0, provaRespostas = [], provaTempoTotal = 0, provaIntervalo = null;
let checkDupTimeout = null;
let foco = null, ordCol = { c: null, d: 'asc' };

const el = id => document.getElementById(id);
const header = el("main-header");
let headerOffset = 0;

const nav = n => {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    el(`secao-${n}`).style.display = 'block';
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('ativa'));
    el(`nav-${n}`).classList.add('ativa');
    if (n === 'banco') carrTab(); if (n === 'praticar') prepPratica(); if (n === 'prova') prepProva();
    if (n === 'estatisticas') graf(); if (n === 'flashcards') initFC();
    el("floating-toolbar").style.display = "none";
    window.scrollTo(0, 0);
};

const showLoader = (txt) => { el("loader-msg").innerText = txt; el("loader-overlay").style.display = "flex"; }
const hideLoader = () => { el("loader-overlay").style.display = "none"; }

const fmt = (elem, t) => {
    let c = typeof elem === 'string' ? el(elem) : elem; if (!c) return;
    let s = c.selectionStart, e = c.selectionEnd;
    c.value = c.value.substring(0, s) + `<${t}>` + c.value.substring(s, e) + `</${t}>` + c.value.substring(e);
};
const fmtUlt = (t) => { if (foco) fmt(foco, t); };
function showToolbar(elem) {
    foco = elem; const tb = el('floating-toolbar');
    const rect = elem.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    tb.style.top = (rect.top + scrollTop - 40) + 'px';
    tb.style.left = (rect.left + scrollLeft) + 'px';
    tb.style.display = 'flex';
}
document.addEventListener('click', function (e) {
    if (!e.target.closest('input') && !e.target.closest('textarea') && !e.target.closest('.floating-toolbar')) {
        el('floating-toolbar').style.display = 'none';
    }
});

async function init() {
    try {
        let [r1, r2, r3] = await Promise.all([fetch(`${API}/questoes`), fetch(`${API}/opcoes-dinamicas`), fetch(`${API}/flashcards`)]);
        db = await r1.json(); opcoes = await r2.json(); flashDb = await r3.json();
        popSelGeral();
        altTipo('cad');

        // Se estiver na tela de banco, atualiza a tabela automaticamente
        if (el('secao-banco').style.display === 'block') carrTab();
        // Se estiver gerenciando flashcards, atualiza a lista
        if (el('fc-modo-gerenciar').style.display === 'block') renderListaFC();

    } catch (e) { console.error(e); alert("Erro ao carregar dados."); }

    await carregarListaTextos();
}

function pop(elAlvo, arr, def, usarDatalist = false) {
    if (!elAlvo) return;
    let html = def && !usarDatalist ? `<option value="">${def}</option>` : "";
    if (arr && arr.length > 0) {
        arr.forEach(x => html += `<option value="${x}">${usarDatalist ? '' : x}</option>`);
    }
    elAlvo.innerHTML = html;
}

function popSelGeral() {
    pop(el("lista-bancas"), opcoes.bancas, "", true);
    pop(el("lista-instituicoes"), opcoes.instituicoes, "", true);
    pop(el("lista-disciplinas"), opcoes.disciplinas, "", true);
    ['busca', 'prat', 'prova', 'fc-estudo'].forEach(p => {
        if (el(`${p}-banca`)) pop(el(`${p}-banca`), opcoes.bancas, p === 'imp' ? "Banca Padrão..." : "Banca...");
        if (el(`${p}-instituicao`)) pop(el(`${p}-instituicao`), opcoes.instituicoes, "Instituição...");
        let idDisc = (p === 'fc-estudo') ? 'fc-estudo-disc' : `${p}-disciplina`;
        if (el(idDisc)) pop(el(idDisc), opcoes.disciplinas, "Disciplina...");
    });
}

function carregarAssuntos(prefixo) {
    let idDisc = (prefixo === 'fc-estudo') ? 'fc-estudo-disc' : `${prefixo}-disciplina`;
    let elDisc = el(idDisc);
    let disc = elDisc.value;
    if (['cad', 'imp', 'edit', 'fc'].includes(prefixo)) {
        let listaAss = el("lista-assuntos");
        let html = "";
        if (opcoes.assuntos) {
            let lista = opcoes.assuntos.filter(a => a.disciplina === disc);
            lista.forEach(a => html += `<option value="${a.nome}">`);
        }
        listaAss.innerHTML = html;
    } else {
        let selAss = el(`${prefixo}-assunto`);
        if (!selAss) return;
        let html = '<option value="">Todos Assuntos</option>';
        if (opcoes.assuntos) {
            let lista = opcoes.assuntos.filter(a => a.disciplina === disc);
            lista.forEach(a => html += `<option value="${a.nome}">${a.nome}</option>`);
        }
        selAss.innerHTML = html;
    }
}



window.onscroll = function () {
    if (window.scrollY > headerOffset) {
    header.classList.add("sticky");
    document.body.classList.add("header-espaco");
    } else {
    header.classList.remove("sticky");
    document.body.classList.remove("header-espaco");
    }
};



// --- CORREÇÃO AQUI: Forçamos a navegação para 'cadastro' SÓ ao abrir a página ---
window.onload = async () => {
    await init();
    nav('cadastro');
    headerOffset = el('secao-cadastro').offsetTop;
    setupDragDrop();
};

const fmtList = (elem, type) => {
    let c = typeof elem === 'string' ? el(elem) : elem;
    if (!c) return;

    let s = c.selectionStart;
    let e = c.selectionEnd;
    let sel = c.value.substring(s, e);

    // Se não tiver nada selecionado, aborta
    if (!sel.trim()) return;

    // 1. Identifica as quebras de linha originais (Enter)
    // O split('\n') separa exatamente onde o usuário deu Enter.
    let linhas = sel.split('\n');

    // 2. Transforma cada linha em um <li>, mantendo a formatação visual
    let itensLista = linhas
        .map(linha => {
            let textoLimpo = linha.trim();
            // Se a linha tiver texto, encapsula em <li>. Se for linha em branco, ignora.
            return textoLimpo ? `\t<li>${textoLimpo}</li>` : ''; 
        })
        .filter(item => item !== '') // Remove as linhas vazias do array
        .join('\n'); // Junta tudo colocando uma quebra de linha visual entre os <li>

    // 3. Monta o bloco final com quebras de linha para ficar legível no input
    let resultado = `<${type}>\n${itensLista}\n</${type}>`;

    // 4. Substitui a seleção pelo código formatado
    c.value = c.value.substring(0, s) + resultado + c.value.substring(e);
};

const fmtListUlt = (type) => { if (foco) fmtList(foco, type); };