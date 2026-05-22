#!/bin/sh
# ==============================================================================
# Ollama init script — arranca o servidor e faz pull do modelo se necessário
# ==============================================================================

MODEL="${OLLAMA_TEXT_MODEL:-qwen2.5:3b-instruct}"

echo "🚀 A iniciar servidor Ollama..."
ollama serve &
OLLAMA_PID=$!

# Aguardar que o servidor esteja pronto
echo "⏳ A aguardar que o servidor Ollama esteja disponível..."
until ollama list > /dev/null 2>&1; do
    sleep 1
done
echo "✅ Servidor Ollama disponível."

# Verificar se o modelo já está instalado
if ollama list | grep -q "^${MODEL}"; then
    echo "✅ Modelo '${MODEL}' já está instalado."
else
    echo "📥 A fazer download do modelo '${MODEL}' (pode demorar alguns minutos)..."
    ollama pull "${MODEL}"
    echo "✅ Modelo '${MODEL}' instalado com sucesso."
fi

echo "🟢 Ollama pronto a servir pedidos."

# Manter o processo principal em foreground
wait $OLLAMA_PID
