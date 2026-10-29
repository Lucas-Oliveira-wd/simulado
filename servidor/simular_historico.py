import pandas as pd
import random
import os

# 1. Configura os caminhos absolutos baseados no local do script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQ_HISTORICO = os.path.join(BASE_DIR, "../banco_de_dados/historico_respostas.xlsx")
ARQ_QUESTOES = os.path.join(BASE_DIR, "../banco_de_dados/questoes_concurso.xlsx")

# 2. Carrega os dois arquivos
df_hist = pd.read_excel(ARQ_HISTORICO)
df_quest = pd.read_excel(ARQ_QUESTOES)

# 3. Remove a coluna 'gabarito' do histórico se existir
if 'gabarito' in df_hist.columns:
    df_hist = df_hist.drop(columns=['gabarito'])

# 4. Cruza os dados pelo ID da questão para pegar o gabarito e o tipo (ME ou CE)
df_merged = df_hist.merge(df_quest[['id', 'gabarito', 'tipo']], left_on='questao_id', right_on='id', how='left')


# 5. Função para simular a alternativa marcada com base no 0 ou 1
def simular_alternativa(row):
    resultado_antigo = row['alternativa_marcada']
    gabarito_real = str(row['gabarito']).strip().upper()
    tipo = str(row['tipo']).strip().upper()

    if pd.isna(gabarito_real) or gabarito_real == 'NAN':
        return resultado_antigo

    if resultado_antigo == 1 or resultado_antigo == '1':
        return gabarito_real

    elif resultado_antigo == 0 or resultado_antigo == '0':
        if tipo == 'CE':
            return 'E' if gabarito_real == 'C' else 'C'
        else:
            opcoes = ['A', 'B', 'C', 'D', 'E']
            if gabarito_real in opcoes:
                opcoes.remove(gabarito_real)
            return random.choice(opcoes)

    return resultado_antigo


# 6. Aplica a transformação
df_hist['alternativa_marcada'] = df_merged.apply(simular_alternativa, axis=1)

# 7. Salva o arquivo sobrescrevendo o original
df_hist.to_excel(ARQ_HISTORICO, index=False)
print("Histórico simulado e atualizado com sucesso!")