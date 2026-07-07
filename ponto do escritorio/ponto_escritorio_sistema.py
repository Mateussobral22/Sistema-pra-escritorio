import re

with open('c:/Users/Mateus/Desktop/ponto do escritorio/ponto_escritorio_sistema.js', 'r', encoding='utf-8') as f:
    src = f.read()
src = src.replace('function baixarPdfOrcamento_OLD', 'function baixarPdfOrcamento')
with open('c:/Users/Mateus/Desktop/ponto do escritorio/ponto_escritorio_sistema.js', 'w', encoding='utf-8') as f:
    f.write(src)
