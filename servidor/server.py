from flask import Flask, request, jsonify, send_from_directory
from openpyxl import load_workbook, Workbook
from flask_cors import CORS
import os
import pdfplumber
import re
import uuid
import difflib

app = Flask(__name__)
CORS(app)

# --- CONFIGURAÇÕES ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "../banco_de_dados")
UPLOAD_FOLDER = os.path.join(DB_DIR, "img", "q_img")
ARQ_QUESTOES = os.path.join(DB_DIR, "questoes_concurso.xlsx")
ARQ_FLASHCARDS = os.path.join(DB_DIR, "flashcards.xlsx")

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# --- FUNÇÕES UTILITÁRIAS ---
def garantir_diretorio():
    if not os.path.exists(DB_DIR): os.makedirs(DB_DIR, exist_ok=True)


def limpar(texto):
    return str(texto).strip() if texto else ""


def normalizar_para_comparacao(texto):
    if not texto: return ""
    texto_sem_tags = re.sub(r'<[^>]+>', '', str(texto))
    return re.sub(r'[\W_]+', '', texto_sem_tags).lower()


def sanitizar_texto(texto):
    if not texto: return ""
    texto = re.sub(r'-\s*\n\s*', '', texto)
    texto = re.sub(r'\n\s*Gabarito:?\s*Letra\s*[A-E]\s*\n', '\n', texto, flags=re.IGNORECASE)
    linhas = [l.strip() for l in texto.split('\n') if l.strip()]
    if not linhas: return ""
    resultado = []
    for i in range(len(linhas)):
        atual = linhas[i]
        if i < len(linhas) - 1:
            proxima = linhas[i + 1]
            pontuacao_final = re.search(r'[.:?!;]$', atual)
            comeca_novo_bloco = re.match(r'^(?:[A-Z"\'\(]|\d+\.|[a-e]\))', proxima)
            if not pontuacao_final and not comeca_novo_bloco:
                resultado.append(atual + " ")
            elif pontuacao_final and comeca_novo_bloco:
                resultado.append(atual + "\n")
            else:
                resultado.append(atual + " ")
        else:
            resultado.append(atual)
    return "".join(resultado).strip()


def gerar_assinatura(q):
    return (
        normalizar_para_comparacao(q.get('enunciado')),
        normalizar_para_comparacao(q.get('alt_a')),
        normalizar_para_comparacao(q.get('alt_b')),
        normalizar_para_comparacao(q.get('alt_c'))
    )


# --- RECONSTRUÇÃO DE TEXTO ---
def reconstruir_header_logico(texto):
    pattern = r"([A-Z\s\-\–]+)\n\s*((?:UESTÕES|ISTA).*)"

    def resolver_match(m):
        raw_letras = m.group(1)
        raw_palavras = m.group(2)
        matches_guia = list(re.finditer(r'([A-Z]|-)', raw_letras))
        palavras_quebradas = raw_palavras.split()
        stopwords = ["VERBAL", "TRAIÇOEIROS", "PARA", "COM", "DE", "DA", "DO", "DOS", "DAS", "E", "EM", "QUE", "SE"]
        resultado_final = ""
        idx_p2 = 0
        for i, match in enumerate(matches_guia):
            token = match.group(1)
            termo_para_adicionar = token
            if token != '-':
                while idx_p2 < len(palavras_quebradas):
                    palavra_atual = palavras_quebradas[idx_p2]
                    if palavra_atual.upper().strip(".,:;") in stopwords:
                        resultado_final += palavra_atual + " "
                        idx_p2 += 1
                    else:
                        break
                if idx_p2 < len(palavras_quebradas):
                    termo_para_adicionar = token + palavras_quebradas[idx_p2]
                    idx_p2 += 1
            resultado_final += termo_para_adicionar
            if i < len(matches_guia) - 1:
                fim_atual = match.end()
                inicio_prox = matches_guia[i + 1].start()
                if inicio_prox > fim_atual:
                    resultado_final += " "
        if idx_p2 < len(palavras_quebradas):
            resultado_final += " " + " ".join(palavras_quebradas[idx_p2:])
        return "\n" + re.sub(r'\s+', ' ', resultado_final).strip() + "\n"

    return re.sub(pattern, resolver_match, texto)


def limpar_ruido(texto):
    texto = reconstruir_header_logico(texto)
    patterns_to_remove = [
        r"PETROBRAS \(Nível Superior\) Português\s*\d*", r"www\.estrategiaconcursos\.com\.br\s*\d*",
        r"\d{11}\s*-\s*Ricardo Aciole", r"Equipe Português Estratégia Concursos, Felipe Luccas",
        r"Aula \d+", r"==\w+==", r"^\.\d+\.\.\)\.",
    ]
    for pattern in patterns_to_remove:
        texto = re.sub(pattern, "", texto, flags=re.MULTILINE | re.IGNORECASE)
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto


def extrair_mapa_gabaritos(texto):
    mapa = {}
    padrao_tabela = r'(?:^|\n)\s*(\d+)\s*[\.\-]?\s*(?:[Ll][Ee][Tt][Rr][Aa])?\s+([A-E])(?=\s|$)'
    matches = re.finditer(padrao_tabela, texto, re.IGNORECASE)
    for m in matches: mapa[m.group(1)] = m.group(2).upper()
    return mapa


def parsear_questoes(texto_bruto):
    texto = limpar_ruido(texto_bruto)
    mapa_gabaritos = extrair_mapa_gabaritos(texto)
    questoes = []
    mapa_assuntos = []
    regex_linha = re.compile(r'((?:QUESTÕES\s+COMENTADAS|LISTA\s+(?:DE|E)\s+QUESTÕES).+?)(?:\n|$)', re.IGNORECASE)
    for match in regex_linha.finditer(texto):
        linha_completa = match.group(1).strip()
        idx_primeiro_hifen = linha_completa.find('-')
        idx_ultimo_hifen = linha_completa.rfind('-')
        if idx_primeiro_hifen != -1 and idx_ultimo_hifen != -1 and idx_primeiro_hifen < idx_ultimo_hifen:
            assunto_raw = linha_completa[idx_primeiro_hifen + 1: idx_ultimo_hifen].strip()
            assunto_final = re.sub(r'Cesgranrio', '', assunto_raw.title(), flags=re.IGNORECASE).strip()
            if 3 < len(assunto_final) < 80: mapa_assuntos.append({"inicio": match.start(), "assunto": assunto_final})

    if not mapa_assuntos:
        if "CORRELAÇÃO" in texto.upper()[:3000]:
            mapa_assuntos.append({"inicio": 0, "assunto": "Correlação Verbal"})
        elif "FUNÇÕES SINTÁTICAS" in texto.upper()[:3000]:
            mapa_assuntos.append({"inicio": 0, "assunto": "Funções Sintáticas"})
        elif "ORAÇÕES ADVERBIAIS" in texto.upper()[:3000]:
            mapa_assuntos.append({"inicio": 0, "assunto": "Orações Adverbiais"})
    mapa_assuntos.sort(key=lambda x: x["inicio"])

    pattern_questao = re.compile(r'^\s*(\d+)\.\s*(?:\(?)\s*(.+?)\s*(?:\)?)\s*$', re.MULTILINE)
    matches_questoes = list(pattern_questao.finditer(texto))

    for i, m in enumerate(matches_questoes):
        start_index = m.start()
        q_numero = m.group(1);
        q_meta = m.group(2)
        if not re.search(r'\d{4}|CESGRANRIO|FGV|CEBRASPE|FCC|VUNESP|INSTITUTO|BANCO|PETROBRAS',
                         q_meta.upper()): continue
        if len(q_meta) < 3: continue
        end_index = matches_questoes[i + 1].start() if i + 1 < len(matches_questoes) else len(texto)
        q_conteudo_bruto = texto[m.end():end_index]
        assunto_atual = "Geral"
        if mapa_assuntos:
            anteriores = [ma for ma in mapa_assuntos if ma["inicio"] < start_index]
            if anteriores: assunto_atual = anteriores[-1]["assunto"]
        elif mapa_assuntos:
            assunto_atual = mapa_assuntos[0]["assunto"]

        meta_limpa = q_meta.replace("–", "/").replace("-", "/")
        partes_meta = [p.strip() for p in meta_limpa.split('/') if p.strip()]
        banca = "CESGRANRIO";
        instituicao = "";
        ano = "2025"
        for idx, p in enumerate(partes_meta):
            if re.match(r'^\d{4}$', p): ano = p; partes_meta.pop(idx); break
        if len(partes_meta) > 0: banca = partes_meta[0]
        if len(partes_meta) > 1: instituicao = partes_meta[1]

        gabarito = ""
        gabarito_pattern_local = r'(?:Gabarito|Gab\.?|Letra|Correta)[:\s\.]+\s*([A-E])'
        matches_gab = list(re.finditer(gabarito_pattern_local, q_conteudo_bruto.strip(), re.IGNORECASE))
        if matches_gab: gabarito = matches_gab[-1].group(1).upper()
        if not gabarito and q_numero in mapa_gabaritos:
            if "Comentário" not in q_conteudo_bruto and "COMENTÁRIO" not in q_conteudo_bruto.upper(): gabarito = \
            mapa_gabaritos[q_numero]

        content_no_comments = \
        re.split(r"(Comentários?|Comentário:)", q_conteudo_bruto, maxsplit=1, flags=re.IGNORECASE)[0]
        content_no_comments = re.sub(r'www\.estrategia.*', '', content_no_comments)
        parts_alt = re.split(r'\b([A-E])\)', content_no_comments)
        enunciado = sanitizar_texto(parts_alt[0].strip())
        alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
        if len(parts_alt) > 1:
            for k in range(1, len(parts_alt), 2):
                letra = parts_alt[k].upper()
                if k + 1 < len(parts_alt): alts[letra] = sanitizar_texto(parts_alt[k + 1].strip())

        if enunciado and (alts["A"] or alts["B"]):
            questoes.append({
                "temp_id": q_numero, "banca": banca, "instituicao": instituicao, "ano": ano,
                "assunto": assunto_atual, "enunciado": enunciado,
                "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"], "alt_e": alts["E"],
                "gabarito": gabarito, "dificuldade": "Médio", "tipo": "ME", "imagem": ""
            })
    return questoes


def extrair_texto_pdf(caminho_arquivo):
    texto = ""
    with pdfplumber.open(caminho_arquivo) as pdf:
        for page in pdf.pages: texto += (page.extract_text() or "") + "\n"
    return texto


# --- CRUD BASE ---
def verificar_questoes():
    garantir_diretorio()
    if not os.path.exists(ARQ_QUESTOES):
        wb = Workbook();
        ws = wb.active;
        ws.title = "questoes"
        ws.append(
            ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
             "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos", "imagem"])
        wb.save(ARQ_QUESTOES)


def carregar_questoes():
    verificar_questoes();
    wb = load_workbook(ARQ_QUESTOES);
    ws = wb.active;
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None: continue
        img = row[17] if len(row) > 17 else ""
        dados.append({"id": row[0], "banca": row[1], "instituicao": row[2], "ano": row[3], "enunciado": row[4],
                      "disciplina": row[5], "assunto": row[6], "dificuldade": row[7], "tipo": row[8], "alt_a": row[9],
                      "alt_b": row[10], "alt_c": row[11], "alt_d": row[12], "alt_e": row[13], "gabarito": row[14],
                      "respondidas": row[15] or 0, "acertos": row[16] or 0, "imagem": img})
    return dados


def salvar_questoes(dados):
    wb = Workbook();
    ws = wb.active
    ws.append(
        ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
         "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos", "imagem"])
    for i in dados: ws.append(
        [i["id"], i.get("banca"), i.get("instituicao"), i.get("ano"), i["enunciado"], i["disciplina"], i["assunto"],
         i["dificuldade"], i["tipo"], i.get("alt_a"), i.get("alt_b"), i.get("alt_c"), i.get("alt_d"), i.get("alt_e"),
         i["gabarito"], i["respondidas"], i["acertos"], i.get("imagem", "")])
    wb.save(ARQ_QUESTOES)


def verificar_flashcards():
    garantir_diretorio()
    if not os.path.exists(ARQ_FLASHCARDS):
        wb = Workbook();
        ws = wb.active;
        ws.title = "flashcards"
        ws.append(["id", "disciplina", "assunto", "frente", "verso", "acertos", "erros"]);
        wb.save(ARQ_FLASHCARDS)


def carregar_flashcards():
    verificar_flashcards();
    wb = load_workbook(ARQ_FLASHCARDS);
    ws = wb.active;
    dados = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0]: dados.append(
            {"id": r[0], "disciplina": r[1], "assunto": r[2], "frente": r[3], "verso": r[4], "acertos": r[5] or 0,
             "erros": r[6] or 0})
    return dados


def salvar_flashcards_dados(dados):
    wb = Workbook();
    ws = wb.active;
    ws.append(["id", "disciplina", "assunto", "frente", "verso", "acertos", "erros"])
    for i in dados: ws.append(
        [i["id"], i["disciplina"], i["assunto"], i["frente"], i["verso"], i["acertos"], i["erros"]])
    wb.save(ARQ_FLASHCARDS)


# --- FUNÇÃO NOVA: EXTRAÇÃO DINÂMICA DO DB ---
def extrair_opcoes_do_banco():
    questoes = carregar_questoes()
    bancas = set()
    instituicoes = set()
    disciplinas = set()
    assuntos_map = {}  # { "Portugues": ["Crase", "Sintaxe"], ... }

    for q in questoes:
        # BANCA: Normaliza para MAIÚSCULAS para evitar duplicatas (ex: Cesgranrio e CESGRANRIO viram CESGRANRIO)
        if q['banca']:
            banca_norm = str(q['banca']).strip().upper()
            bancas.add(banca_norm)

        # INSTITUIÇÃO: Normaliza para MAIÚSCULAS
        if q['instituicao']:
            inst_norm = str(q['instituicao']).strip().upper()
            instituicoes.add(inst_norm)

        # DISCIPLINA: Normaliza para Title Case (Primeira Letra Maiúscula) para padronizar a lista
        disc_raw = str(q['disciplina']).strip()
        disc_norm = disc_raw.title() if disc_raw else ""

        assunto_raw = str(q['assunto']).strip()

        if disc_norm:
            disciplinas.add(disc_norm)

            if disc_norm not in assuntos_map:
                assuntos_map[disc_norm] = set()

            # ASSUNTO: Mantido ORIGINAL (Case Sensitive) conforme solicitado
            # Apenas removemos espaços extras com strip()
            if assunto_raw:
                assuntos_map[disc_norm].add(assunto_raw)

    # Converter sets para listas ordenadas
    assuntos_final = []
    for disc, lista_assuntos in assuntos_map.items():
        # Ordena os assuntos alfabeticamente, mas mantém a caixa original
        for a in sorted(list(lista_assuntos), key=str.lower):
            assuntos_final.append({'nome': a, 'disciplina': disc})

    # Adicionar opções padrão caso a lista esteja vazia
    if not disciplinas: disciplinas.add("Geral")
    if not bancas: bancas.add("BANCA PADRÃO")

    return {
        "bancas": sorted(list(bancas)),
        "instituicoes": sorted(list(instituicoes)),
        "disciplinas": sorted(list(disciplinas)),
        "assuntos": assuntos_final  # Já ordenado no loop acima
    }

# --- ROTAS ---
@app.route('/img/q_img/<filename>')
def serve_image(filename): return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/questoes", methods=["GET"])
def get_q(): return jsonify(carregar_questoes())


@app.route("/questoes", methods=["POST"])
def post_q():
    nova = {};
    arq = None
    if request.content_type.startswith('multipart'):
        nova = request.form.to_dict(); arq = request.files.get('imagem_file')
    else:
        nova = request.json
    dados = carregar_questoes();
    nome_img = ""
    if arq and arq.filename:
        ext = arq.filename.rsplit('.', 1)[1].lower();
        nome_img = f"{uuid.uuid4()}.{ext}";
        arq.save(os.path.join(UPLOAD_FOLDER, nome_img));
        nova["imagem"] = nome_img
    else:
        nova["imagem"] = ""
    sig = gerar_assinatura(nova)
    if any(gerar_assinatura(q) == sig for q in dados): return jsonify({"erro": "Duplicada"}), 409
    if not nova.get("id"): ids = sorted([int(q["id"]) for q in dados if str(q["id"]).isdigit()]); nova[
        "id"] = 1 if not ids else (ids[-1] + 1)
    nova.update({"respondidas": 0, "acertos": 0});
    dados.append(nova);
    salvar_questoes(dados)
    return jsonify({"mensagem": "Salvo", "id": nova["id"]}), 201


@app.route("/questoes", methods=["PUT"])
def put_q():
    load = {};
    arq = None
    if request.content_type and request.content_type.startswith('multipart'):
        load = request.form.to_dict(); arq = request.files.get('imagem_file')
    else:
        load = request.json;
    if isinstance(load, list): salvar_questoes(load); return jsonify({"status": "ok"})
    dados = carregar_questoes()
    for i, q in enumerate(dados):
        if str(q["id"]) == str(load["id"]):
            img_antiga = q.get("imagem", "");
            q.update(load)
            if arq and arq.filename:
                ext = arq.filename.rsplit('.', 1)[1].lower();
                nome_img = f"{uuid.uuid4()}.{ext}";
                arq.save(os.path.join(UPLOAD_FOLDER, nome_img));
                q["imagem"] = nome_img
            else:
                if not load.get("imagem"): q["imagem"] = img_antiga
            dados[i] = q;
            salvar_questoes(dados);
            return jsonify({"status": "Atualizado"})
    return jsonify({"erro": "404"}), 404


@app.route("/check-duplicidade", methods=["POST"])
def check_dup():
    payload = request.json;
    sig = gerar_assinatura(payload)
    if not payload.get("enunciado"): return jsonify({"existe": False})
    dados = carregar_questoes();
    return jsonify({"existe": any(gerar_assinatura(q) == sig for q in dados)})


@app.route("/questoes/<string:id>", methods=["DELETE"])
def del_q(id): dados = [q for q in carregar_questoes() if str(q["id"]) != str(id)]; salvar_questoes(
    dados); return jsonify({"status": "Removido"})


@app.route("/flashcards", methods=["GET", "POST", "PUT"])
def handle_fc():
    if request.method == "GET": return jsonify(carregar_flashcards())
    dados = carregar_flashcards();
    load = request.json
    if request.method == "POST":
        if not load.get("id"): ids = sorted([int(f["id"]) for f in dados if str(f["id"]).isdigit()]); load[
            "id"] = 1 if not ids else (ids[-1] + 1)
        load.update({"acertos": 0, "erros": 0});
        dados.append(load);
        salvar_flashcards_dados(dados);
        return jsonify({"mensagem": "Salvo", "id": load["id"]}), 201
    if request.method == "PUT":
        for i, f in enumerate(dados):
            if str(f["id"]) == str(load["id"]): dados[i] = load; salvar_flashcards_dados(dados); return jsonify(
                {"status": "Ok"})
    return jsonify({"erro": "404"}), 404


@app.route("/flashcards/<string:id>", methods=["DELETE"])
def del_fc(id): dados = [f for f in carregar_flashcards() if str(f["id"]) != str(id)]; salvar_flashcards_dados(
    dados); return jsonify({"status": "Ok"})


@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    f = request.files.get('file');
    if not f: return jsonify({"erro": "Sem arquivo"}), 400
    p = os.path.join(BASE_DIR, "temp.pdf");
    f.save(p)
    try:
        novas = parsear_questoes(extrair_texto_pdf(p));
        banco = carregar_questoes();
        sigs = {gerar_assinatura(q) for q in banco}
        for n in novas: n['ja_cadastrada'] = gerar_assinatura(n) in sigs
        return jsonify(novas)
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        if os.path.exists(p): os.remove(p)


# Rota de opções agora lê direto do DB, eliminando metadados.xlsx
@app.route("/opcoes-dinamicas", methods=["GET"])
def get_opcoes():
    return jsonify(extrair_opcoes_do_banco())


if __name__ == "__main__": app.run(debug=True, port=5000)