import os
import re
import shutil
from openpyxl import load_workbook

# --- CONFIGURAÇÕES ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "../banco_de_dados")
ARQ_QUESTOES = os.path.join(DB_DIR, "questoes_concurso.xlsx")
ARQ_BACKUP = os.path.join(DB_DIR, "questoes_concurso_BACKUP.xlsx")


def limpar_texto_profundo(texto):
    if not texto or texto is None:
        return ""

    txt = str(texto)

    # 1. Remove caracteres de retorno de carro do Windows (\r)
    txt = txt.replace('\r', '')

    # 2. REGEX NUCLEAR:
    # \s* -> pega qualquer espaço (incluindo abas) antes ou depois do enter
    # \n   -> o enter em si
    # (...) + -> repete isso uma ou mais vezes
    # Resultado: Transforma "Texto \n   \n \n Texto" em "Texto\nTexto"
    txt = re.sub(r'(\s*\n\s*)+', '\n', txt)

    # 3. Garante que não tenha espaços no começo/fim da string inteira
    return txt.strip()


def executar_limpeza():
    if not os.path.exists(ARQ_QUESTOES):
        print(f"ERRO: Arquivo não encontrado em {ARQ_QUESTOES}")
        return

    print("--- INICIANDO LIMPEZA DO BANCO DE DADOS (MODO FORTE) ---")

    # 1. Cria um backup
    try:
        shutil.copy2(ARQ_QUESTOES, ARQ_BACKUP)
        print(f"Backup criado: {ARQ_BACKUP}")
    except Exception as e:
        print(f"Aviso: Não foi possível criar backup ({e})")

    # 2. Carrega a planilha
    try:
        wb = load_workbook(ARQ_QUESTOES)
        ws = wb.active
        print(f"Planilha carregada. Linhas: {ws.max_row}")
    except Exception as e:
        print(f"Erro ao abrir planilha: {e}")
        return

    # Índices das colunas (Base 1 do Excel)
    # E=Enunciado(5), J=AltA(10), K=AltB(11), L=AltC(12), M=AltD(13), N=AltE(14)
    colunas_para_limpar = [5, 10, 11, 12, 13, 14]

    contador_alteracoes = 0

    # Itera sobre as linhas
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for col_idx in colunas_para_limpar:
            celula = row[col_idx - 1]
            valor_original = celula.value

            if valor_original:
                valor_limpo = limpar_texto_profundo(valor_original)

                # Força a gravação se houver qualquer diferença ou se tiver espaços extras
                if valor_original != valor_limpo:
                    celula.value = valor_limpo
                    contador_alteracoes += 1

    # 3. Salva o arquivo
    try:
        wb.save(ARQ_QUESTOES)
        print("------------------------------------------------")
        print(f"CONCLUÍDO! Células corrigidas: {contador_alteracoes}")
        print("------------------------------------------------")
    except Exception as e:
        print(f"Erro ao salvar planilha: {e}")


if __name__ == "__main__":
    executar_limpeza()