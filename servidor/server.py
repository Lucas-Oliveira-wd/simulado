from flask import Flask, request, jsonify, send_from_directory
from openpyxl import load_workbook, Workbook
from flask_cors import CORS
import os
import pdfplumber
import re
import uuid

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "../banco_de_dados")
UPLOAD_FOLDER = os.path.join(DB_DIR, "img", "q_img")
ARQ_QUESTOES = os.path.join(DB_DIR, "questoes_concurso.xlsx")
ARQ_METADADOS = os.path.join(DB_DIR, "metadados.xlsx")
ARQ_FLASHCARDS = os.path.join(DB_DIR, "flashcards.xlsx")

if not os.path.exists(UPLOAD_FOLDER): os.makedirs(UPLOAD_FOLDER, exist_ok=True)

CORRECAO_ASSUNTOS = {
    "MPREGO OS EMPOS ODOS": "Emprego de Tempos e Modos", "ODO NDICATIVO": "Modo Indicativo",
    "ERBOS TRAIÇOEIROS": "Verbos Traiçoeiros", "MPREGO OS EMPOS E ODOS": "Emprego de Tempos e Modos",
    "UBSTANTIVO": "Substantivo", "DJETIVO": "Adjetivo", "DVÉRBIO": "Advérbio", "RTIGO": "Artigo",
    "NTERJEIÇÃO": "Interjeição", "UMERAL": "Numeral", "RONOME": "Pronome", "ERBO": "Verbo",
    "ONJUNÇÃO": "Conjunção", "REPOSIÇÃO": "Preposição", "ALAVRAS SPECIAIS": "Palavras Especiais",
    "OLOCAÇÃO RONOMINAL": "Colocação Pronominal", "RONOMES": "Pronomes", "OLOCAÇÃO PRONOMINAL": "Colocação Pronominal",
}

# Lista de palavras que identificam um CARGO, para não confundir com Instituição
BLACKLIST_CARGOS = [
    "ANALISTA", "TÉCNICO", "ENGENHEIRO", "MÉDICO", "ADVOGADO", "AGENTE", "ESCRITURÁRIO",
    "PROFESSOR", "ESPECIALISTA", "AUDITOR", "DEFENSOR", "PROMOTOR", "JUIZ", "DELEGADO",
    "INSPETOR", "SOLDADO", "OFICIAL", "ASSISTENTE", "CONSULTOR", "COORDENADOR", "DIRETOR",
    "GERENTE", "SUPERVISOR", "PEDAGOGO", "PSICÓLOGO", "CONTADOR", "ADMINISTRADOR", "ECONOMISTA",
    "ARQUITETO", "ENFERMEIRO", "FARMACÊUTICO", "NUTRICIONISTA", "DENTISTA", "TECNOLOGIA"
]


def garantir_diretorio():
    if not os.path.exists(DB_DIR): os.makedirs(DB_DIR, exist_ok=True)


def normalizar_para_comparacao(texto):
    if not texto: return ""
    texto_sem_tags = re.sub(r'<[^>]+>', '', str(texto))
    return re.sub(r'[\W_]+', '', texto_sem_tags).lower()


def sanitizar_texto(texto):
    if not texto: return ""
    texto = re.sub(r'-\s*\n\s*', '', texto)
    linhas = [l.strip() for l in texto.split('\n') if l.strip()]
    if not linhas: return ""
    resultado = []
    for i in range(len(linhas)):
        atual = linhas[i]
        if i < len(linhas) - 1:
            proxima = linhas[i + 1]
            pontuacao_final = re.search(r'[.:?!;]$', atual)
            comeca_novo_bloco = re.match(r'^(?:[A-Z"\'\(]|\d+\.|[a-e]\))', proxima)
            if pontuacao_final and comeca_novo_bloco:
                resultado.append(atual + "\n")
            else:
                resultado.append(atual + " ")
        else:
            resultado.append(atual)
    return "".join(resultado)


def gerar_assinatura(q):
    return (
        normalizar_para_comparacao(q.get('enunciado')),
        normalizar_para_comparacao(q.get('alt_a')),
        normalizar_para_comparacao(q.get('alt_b')),
        normalizar_para_comparacao(q.get('alt_c')),
        normalizar_para_comparacao(q.get('alt_d')),
        normalizar_para_comparacao(q.get('alt_e'))
    )


def limpar_ruido(texto):
    patterns = [
        r"PETROBRAS \(Nível Superior\) Português\s*\d*", r"www\.estrategiaconcursos\.com\.br\s*\d*",
        r"\d{11}\s*-\s*Ricardo Aciole", r"Equipe Português Estratégia Concursos, Felipe Luccas",
        r"Aula \d+", r"==\w+==", r"^\s*\d+\s*$"
    ]
    for p in patterns: texto = re.sub(p, "", texto, flags=re.MULTILINE | re.IGNORECASE)
    return re.sub(r'\n{3,}', '\n\n', texto)


def extrair_mapa_gabaritos(texto):
    mapa = {}
    matches = re.finditer(r'(?:^|\n)\s*(\d+)\.?\s*(?:[Ll][Ee][Tt][Rr][Aa])?\s+([A-E])(?=\s|$)', texto, re.IGNORECASE)
    for m in matches: mapa[m.group(1)] = m.group(2).upper()
    return mapa


def parsear_questoes(texto_bruto):
    texto = limpar_ruido(texto_bruto)
    mapa_gabaritos = extrair_mapa_gabaritos(texto)
    questoes = []
    mapa_assuntos = []

    # Mapeamento Assuntos
    for match in re.finditer(
            r'(?:UESTÕES\s+OMENTADAS|ISTA\s+E\s+UESTÕES).*?([A-ZÃÕÁÉÍÓÚÇÂÊÔÀ\s\-]+?)\s*(?:C\s*)?ESGRANRIO', texto,
            re.IGNORECASE | re.DOTALL):
        trecho = match.group(1).replace('\n', ' ').replace('-', '').strip()
        assunto = CORRECAO_ASSUNTOS.get(trecho) or CORRECAO_ASSUNTOS.get(trecho.replace("  ", " "))
        if not assunto and len(trecho) > 3: assunto = trecho.title()
        if assunto: mapa_assuntos.append({"inicio": match.start(), "assunto": assunto})
    mapa_assuntos.sort(key=lambda x: x["inicio"])

    parts = re.split(r'(\d+)\.\s*\((CESGRANRIO.*?)\)', texto)
    if len(parts) > 1:
        tracker = len(parts[0])
        for i in range(1, len(parts), 3):
            if (i + 2) >= len(parts): break
            q_num, q_meta, q_content = parts[i].strip(), parts[i + 1].strip(), parts[i + 2]
            tracker += len(q_num) + len(q_meta) + len(q_content)

            assunto = "Geral"
            if mapa_assuntos:
                anteriores = [m for m in mapa_assuntos if m["inicio"] < tracker]
                if anteriores: assunto = anteriores[-1]["assunto"]

            # --- PROCESSAMENTO INTELIGENTE DE METADADOS ---
            # Remove parênteses e traços extras
            meta_clean = q_meta.replace("–", "/").replace("-", "/")
            partes = [p.strip() for p in meta_clean.split('/') if p.strip()]

            banca = "CESGRANRIO"
            ano = "2025"
            instituicao = ""

            for p in partes:
                p_upper = p.upper()
                if re.match(r'^\d{4}$', p): ano = p; continue
                if "CESGRANRIO" in p_upper: continue
                # Filtra se for cargo
                if any(c in p_upper for c in BLACKLIST_CARGOS): continue
                # Filtra códigos curtos que não são siglas conhecidas
                if len(p) < 4 and p_upper not in ["BB", "ANP", "STJ", "STF", "AGU", "MPE", "TJ", "TRE", "TRT", "MP",
                                                  "CNJ"]: continue

                # Se sobreviveu aos filtros, é a instituição
                # Damos preferência à maior string (ex: "ELETRONUCLEAR" > "PNMO")
                if not instituicao or len(p) > len(instituicao):
                    instituicao = p

            # Gabarito
            gabarito = ""
            matches_gab = list(re.finditer(
                r'(?:Gabarito|GABARITO|Correta|Letra)(?:.{0,30}?)(?:[Ll]etra|[Oo]pção|[Aa]lternativa)?\s*([A-E])(?=[\.\s]|$)',
                q_content, re.IGNORECASE))
            if matches_gab: gabarito = matches_gab[-1].group(1).upper()
            if not gabarito and q_num in mapa_gabaritos: gabarito = mapa_gabaritos[q_num]

            # Enunciado e Alternativas
            content_limpo = re.split(r"(Comentários?|Comentário:)", q_content, maxsplit=1, flags=re.IGNORECASE)[0]
            content_limpo = re.split(r'\n\s*(?:L\s*I\s*S\s*T\s*A|GABARITO)', content_limpo, flags=re.IGNORECASE)[0]

            parts_alt = re.split(r'\b([A-E])\)', content_limpo)
            enunciado = sanitizar_texto(parts_alt[0].strip())
            alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
            if len(parts_alt) > 1:
                for k in range(1, len(parts_alt), 2):
                    letra = parts_alt[k].upper()
                    if k + 1 < len(parts_alt): alts[letra] = sanitizar_texto(parts_alt[k + 1].strip().rstrip('.;'))

            if enunciado and (alts["A"] or alts["B"]):
                questoes.append({
                    "temp_id": q_num, "banca": banca, "instituicao": instituicao, "ano": ano,
                    "assunto": assunto, "enunciado": enunciado,
                    "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"], "alt_e": alts["E"],
                    "gabarito": gabarito, "dificuldade": "Médio", "tipo": "ME", "imagem": ""
                })
    return questoes


def extrair_texto_pdf(path):
    txt = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages: txt += (page.extract_text() or "") + "\n"
    return txt


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
    ws = wb.active
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None: continue
        img = row[17] if len(row) > 17 else ""
        dados.append({
            "id": row[0], "banca": row[1], "instituicao": row[2], "ano": row[3],
            "enunciado": row[4], "disciplina": row[5], "assunto": row[6],
            "dificuldade": row[7], "tipo": row[8],
            "alt_a": row[9], "alt_b": row[10], "alt_c": row[11], "alt_d": row[12], "alt_e": row[13],
            "gabarito": row[14], "respondidas": row[15] or 0, "acertos": row[16] or 0, "imagem": img
        })
    return dados


def salvar_questoes(dados):
    wb = Workbook();
    ws = wb.active
    ws.append(
        ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
         "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos", "imagem"])
    for i in dados:
        ws.append(
            [i["id"], i.get("banca"), i.get("instituicao"), i.get("ano"), i["enunciado"], i["disciplina"], i["assunto"],
             i["dificuldade"], i["tipo"], i.get("alt_a"), i.get("alt_b"), i.get("alt_c"), i.get("alt_d"),
             i.get("alt_e"), i["gabarito"], i["respondidas"], i["acertos"], i.get("imagem", "")])
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


def verificar_metadados():
    garantir_diretorio()
    if not os.path.exists(ARQ_METADADOS):
        wb = Workbook();
        [wb.create_sheet(n).append(["nome"]) for n in ["bancas", "instituicoes", "disciplinas"]]
        wb.create_sheet("assuntos").append(["nome", "disciplina", "ordem"])
        wb.save(ARQ_METADADOS)


def carregar_meta_dict():
    verificar_metadados();
    wb = load_workbook(ARQ_METADADOS)
    dados = {"bancas": [], "instituicoes": [], "disciplinas": [], "assuntos": []}
    for k in ["bancas", "instituicoes", "disciplinas"]:
        if k in wb.sheetnames: [dados[k].append(str(r[0])) for r in wb[k].iter_rows(min_row=2, values_only=True) if
                                r[0]]
    if "assuntos" in wb.sheetnames: [
        dados["assuntos"].append({"nome": str(r[0]), "disciplina": str(r[1]), "ordem": int(r[2]) if r[2] else 999}) for
        r in wb["assuntos"].iter_rows(min_row=2, values_only=True) if r[0]]
    for k in dados: dados[k].sort(key=lambda x: (x["disciplina"], x["ordem"]) if isinstance(x, dict) else x)
    return dados


def salvar_meta_simples(cat, item):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb[cat];
    ws.append([item["nome"]]);
    wb.save(ARQ_METADADOS)


def gerenciar_assunto(acao, payload, nome_antigo=None):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb["assuntos"]
    todos = [{"nome": str(r[0]), "disciplina": str(r[1]), "ordem": int(r[2]) if r[2] else 999} for r in
             ws.iter_rows(min_row=2, values_only=True) if r[0]]
    if acao == 'editar': todos = [a for a in todos if a["nome"] != nome_antigo]
    todos.append(payload)
    wb.remove(wb["assuntos"]);
    ws_new = wb.create_sheet("assuntos");
    ws_new.append(["nome", "disciplina", "ordem"])
    todos.sort(key=lambda x: (x["disciplina"], x["ordem"]));
    [ws_new.append([a["nome"], a["disciplina"], a["ordem"]]) for a in todos];
    wb.save(ARQ_METADADOS)


def deletar_meta_item(cat, nome):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb[cat]
    for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if str(r[0]) == str(nome): ws.delete_rows(i); wb.save(ARQ_METADADOS); return True
    return False


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
    dados = carregar_questoes()

    if arq and arq.filename:
        ext = arq.filename.rsplit('.', 1)[1].lower();
        nome = f"{uuid.uuid4()}.{ext}"
        arq.save(os.path.join(UPLOAD_FOLDER, nome));
        nova["imagem"] = nome
    else:
        nova["imagem"] = ""

    sig = gerar_assinatura(nova)
    if any(gerar_assinatura(q) == sig for q in dados): return jsonify({"erro": "Duplicada"}), 409

    if not nova.get("id"):
        ids = sorted([int(q["id"]) for q in dados if str(q["id"]).isdigit()])
        nova["id"] = 1 if not ids else (ids[-1] + 1)

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
                nome = f"{uuid.uuid4()}.{ext}"
                arq.save(os.path.join(UPLOAD_FOLDER, nome));
                q["imagem"] = nome
            elif not load.get("imagem"):
                q["imagem"] = img_antiga
            dados[i] = q;
            salvar_questoes(dados);
            return jsonify({"status": "Atualizado"})
    return jsonify({"erro": "404"}), 404


@app.route("/check-duplicidade", methods=["POST"])
def check_dup():
    payload = request.json;
    sig = gerar_assinatura(payload)
    if not payload.get("enunciado"): return jsonify({"existe": False})
    dados = carregar_questoes()
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
        banco = carregar_questoes()
        sigs = {gerar_assinatura(q) for q in banco}
        for n in novas: n['ja_cadastrada'] = gerar_assinatura(n) in sigs
        return jsonify(novas)
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        if os.path.exists(p): os.remove(p)


@app.route("/metadados", methods=["GET"])
def get_meta(): return jsonify(carregar_meta_dict())


@app.route("/metadados/<string:cat>", methods=["POST", "PUT", "DELETE"])
def handle_meta(cat):
    if request.method == "DELETE": return jsonify({"status": "ok"}) if deletar_meta_item(cat, request.args.get(
        "nome")) else (jsonify({"erro": "404"}), 404)
    data = request.json
    if request.method == "POST":
        if cat == "assuntos":
            gerenciar_assunto('criar', data)
        else:
            salvar_meta_simples(cat, data)
    if request.method == "PUT":
        if cat == "assuntos":
            gerenciar_assunto('editar', data["novo"], data["antigo"])
        else:
            salvar_meta_simples(cat, data["novo"])
    return jsonify({"status": "ok"})


if __name__ == "__main__": app.run(debug=True, port=5000)