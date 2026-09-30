#!/bin/bash
# Arranque da Filipe App no Mac: duplo clique, ou "bash start.command"
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Falta o Node.js. Instale a versão 22 LTS em https://nodejs.org e volte a correr."
  open "https://nodejs.org"; read -r -p "Enter para sair"; exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 22 ]; then
  echo "O Node é o $(node -v); é preciso 22 ou superior. Instale em https://nodejs.org"
  open "https://nodejs.org"; read -r -p "Enter para sair"; exit 1
fi

[ -d node_modules ] || npm install || { read -r -p "npm install falhou. Enter para sair"; exit 1; }

echo "A abrir http://localhost:3000 (deixe esta janela aberta; Ctrl+C para parar)"
(sleep 4 && open "http://localhost:3000") &
npm run dev
