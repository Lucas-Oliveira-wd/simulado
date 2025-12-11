from flask import Flask, request, jsonify
from openpyxl import load_workbook, Workbook
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQUIVO = os.path.join(BASE_DIR, "../banco_de_dados/questoes_concurso.xlsx")


def verificar_arquivo():
    if not os.path.exists(ARQUIVO):
        os.makedirs(os.path.dirname(ARQUIVO), exist_ok=True)
        wb = Workbook()
        ws = wb.active
        ws.append([
            "id", "banca", "enunciado", "disciplina", "assunto", "dificuldade", "tipo",
            "alt_a", "alt_b", "alt_c", "alt_d", "alt_e",
            "gabarito", "respondidas", "acertos"
        ])
        wb.save(ARQUIVO)


def carregar_dados():
    verificar_arquivo()
    wb = load_workbook(ARQUIVO)
    ws = wb.active
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue

        dados.append({
            "id": row[0],
            "banca": row[1] if row[1] else "Indefinida",
            "enunciado": row[2],
            "disciplina": row[3],
            "assunto": row[4],
            "dificuldade": row[5],
            "tipo": row[6],
            "alt_a": row[7],
            "alt_b": row[8],
            "alt_c": row[9],
            "alt_d": row[10],
            "alt_e": row[11],
            "gabarito": row[12],
            "respondidas": row[13] if row[13] else 0,
            "acertos": row[14] if row[14] else 0
        })
    return dados


def salvar_todos_dados(dados):
    wb = Workbook()
    ws = wb.active
    ws.append([
        "id", "banca", "enunciado", "disciplina", "assunto", "dificuldade", "tipo",
        "alt_a", "alt_b", "alt_c", "alt_d", "alt_e",
        "gabarito", "respondidas", "acertos"
    ])

    for item in dados:
        ws.append([
            item["id"],
            item.get("banca", "Indefinida"),
            item["enunciado"],
            item["disciplina"],
            item["assunto"],
            item["dificuldade"],
            item["tipo"],
            item.get("alt_a", ""),
            item.get("alt_b", ""),
            item.get("alt_c", ""),
            item.get("alt_d", ""),
            item.get("alt_e", ""),
            item["gabarito"],
            item["respondidas"],
            item["acertos"]
        ])
    wb.save(ARQUIVO)


def limpar(texto):
    return str(texto).strip().lower() if texto else ""


@app.route("/questoes", methods=["GET"])
def get_questoes():
    return jsonify(carregar_dados())


@app.route("/questoes", methods=["POST"])
def post_questao():
    nova = request.json
    dados = carregar_dados()

    novo_enunciado = limpar(nova.get("enunciado"))
    novo_a = limpar(nova.get("alt_a"))

    # Validação de Duplicidade (Enunciado + Alternativa A)
    for q in dados:
        if (limpar(q["enunciado"]) == novo_enunciado and
                limpar(q["alt_a"]) == novo_a):
            return jsonify({"erro": "Duplicidade detectada: Já existe uma questão idêntica cadastrada!"}), 409

    # --- LÓGICA DE ID SEQUENCIAL (Preenche buracos) ---
    if "id" not in nova or not nova["id"]:
        # Pega todos os IDs existentes que sejam números
        ids_existentes = set()
        for q in dados:
            try:
                ids_existentes.add(int(q["id"]))
            except:
                pass  # Ignora IDs não numéricos se houver

        # Procura o menor número disponível começando de 1
        novo_id = 1
        while novo_id in ids_existentes:
            novo_id += 1

        nova["id"] = novo_id
    # --------------------------------------------------

    nova["respondidas"] = 0
    nova["acertos"] = 0
    if "banca" not in nova:
        nova["banca"] = "Indefinida"

    dados.append(nova)
    salvar_todos_dados(dados)
    return jsonify({"mensagem": "Questão cadastrada com sucesso!", "id": nova["id"]})


@app.route("/questoes", methods=["PUT"])
def atualizar_questoes():
    payload = request.json
    if isinstance(payload, list):
        salvar_todos_dados(payload)
        return jsonify({"status": "Lista completa atualizada"})

    dados = carregar_dados()
    encontrou = False
    for i, q in enumerate(dados):
        if str(q["id"]) == str(payload["id"]):
            if "respondidas" not in payload: payload["respondidas"] = q["respondidas"]
            if "acertos" not in payload: payload["acertos"] = q["acertos"]
            dados[i] = payload
            encontrou = True
            break

    if encontrou:
        salvar_todos_dados(dados)
        return jsonify({"status": "Questão atualizada"})
    else:
        return jsonify({"erro": "ID não encontrado"}), 404


@app.route("/questoes/<string:id_questao>", methods=["DELETE"])
def deletar_questao(id_questao):
    dados = carregar_dados()
    dados_filtrados = [q for q in dados if str(q["id"]) != str(id_questao)]

    if len(dados) == len(dados_filtrados):
        return jsonify({"erro": "ID não encontrado"}), 404

    salvar_todos_dados(dados_filtrados)
    return jsonify({"status": "Questão removida"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)