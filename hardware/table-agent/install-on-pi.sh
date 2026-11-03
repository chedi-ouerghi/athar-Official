#!/bin/sh
# Installe la config de l'agent sur le Pi à partir d'apps/api/.env (TABLE_ID,
# TABLE_MQTT_PASSWORD). L'URL du broker est celle du modèle (127.0.0.1) ; AGENT_MQTT_URL=...
# la remplace. Le mot de passe va dans /etc/athar/mqtt.secret, jamais dans git.
# Usage (depuis la racine du dépôt) : sh hardware/table-agent/install-on-pi.sh [chemin/.env]
set -eu

ENV_FILE="${1:-apps/api/.env}"
TEMPLATE="hardware/table-agent/agent.yaml"

[ -f "$ENV_FILE" ] || { echo "Introuvable : $ENV_FILE" >&2; exit 1; }

get() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r'; }
TABLE_ID=$(get TABLE_ID)
MQTT_URL=${AGENT_MQTT_URL:-}
PASSWORD=$(get TABLE_MQTT_PASSWORD)

[ -n "$TABLE_ID" ] && [ -n "$PASSWORD" ] || {
  echo "TABLE_ID et TABLE_MQTT_PASSWORD doivent être définis dans $ENV_FILE" >&2
  exit 1
}

# Remplace l'id et l'URL du modèle par ceux du .env.
sudo mkdir -p /etc/athar
sed -e "s#ho57btw7htrpxx7k#$TABLE_ID#g" "$TEMPLATE" > /tmp/athar-agent.yaml
if [ -n "$MQTT_URL" ]; then
  sed -i "s#^  url: .*#  url: $MQTT_URL#" /tmp/athar-agent.yaml
fi
sudo mv /tmp/athar-agent.yaml /etc/athar/agent.yaml

printf '%s' "$PASSWORD" | sudo tee /etc/athar/mqtt.secret >/dev/null
sudo chmod 600 /etc/athar/mqtt.secret

echo "agent.yaml et mqtt.secret installés pour la table $TABLE_ID."
echo "Envoyer la config de la carte : sh ./fluidterm.sh -u hardware/board/config.yaml"
echo "Puis : sudo systemctl restart athar-agent && journalctl -u athar-agent -f"
