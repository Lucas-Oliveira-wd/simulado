import numpy as np


def validar_correlacao_linear():
    # 1. Criação de um vetor aleatório (simulando taxas de acerto)
    np.random.seed(42)
    x = np.random.uniform(0, 1, 10)

    # 2. Aplicação da Normalização Linear de Custo (Inversão de Escala)
    # Fórmula: y = (max - x) / (max - min)
    max_x = np.max(x)
    min_x = np.min(x)
    y = (max_x - x) / (max_x - min_x)

    # 3. Cálculo do Coeficiente de Correlação de Pearson (r)
    # np.corrcoef retorna uma matriz de covariância normalizada
    r = np.corrcoef(x, y)[0, 1]

    # 4. Resultados
    print(f"Vetor Original (x): {x.round(2)}")
    print(f"Vetor Normalizado (y): {y.round(4)}")
    print("-" * 40)
    print(f"Pearson r (x vs y): {r:.10f}")

    # Validação da inclinação (y = ax + b)
    # a = -1 / (max - min)
    # Como o denominador é positivo, 'a' é negativo, logo r deve ser -1.
    if np.isclose(r, -1):
        print("Resultado: r é exatamente -1 (Correlação Linear Perfeita e Inversa).")
    elif np.isclose(r, 1):
        print("Resultado: r é exatamente 1 (Correlação Linear Perfeita e Direta).")


if __name__ == "__main__":
    validar_correlacao_linear()