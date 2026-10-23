#!/usr/bin/env bash
# Pré-contrôle du Pi avant les tests sur place : lecture seule, ne modifie rien.
#   bash hardware/pi/preflight.sh
# Même format que `selftest` : [OK] / [FAIL] / [--] (information). Code de sortie 1 s'il y a un [FAIL].
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail=0
ok() { echo "[OK] $1"; }
ko() { echo "[FAIL] $1 -> $2"; fail=1; }
info() { echo "[--] $1"; }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else ko "$1" "$3"; fi; }

[ "$(uname -m)" = aarch64 ] && ok "architecture aarch64" || info "architecture $(uname -m) (attendu aarch64 sur un Pi 5)"
check "agent présent dans le dépôt (branche feat/table-agent)" "test -f '$ROOT/apps/table-agent/package.json'" "git switch feat/table-agent"
check "groupe docker actif" "id -nG | grep -qw docker" "se déconnecter / reconnecter en SSH"
check "groupe dialout actif" "id -nG | grep -qw dialout" "se déconnecter / reconnecter en SSH"
check "docker compose disponible" "docker compose version" "bash hardware/pi/setup-pi.sh"
check "mosquitto_pub installé" "command -v mosquitto_pub" "bash hardware/pi/setup-pi.sh"
check "Node.js >= 20.19" "node -e 'const [a,b]=process.versions.node.split(\".\").map(Number);process.exit(a>20||(a==20&&b>=19)?0:1)'" "installer Node 20.19+ (agent et pnpm)"
check "deploy/.env avec MQTT_PASSWORD rempli" "grep -Eq '^MQTT_PASSWORD=.+' '$ROOT/deploy/.env'" "guide, étape C1"
check "deploy/mosquitto/passwd est un fichier de l'utilisateur 1883, mode 600" \
  "test -f '$ROOT/deploy/mosquitto/passwd' && [ \"\$(stat -c '%u %a' '$ROOT/deploy/mosquitto/passwd')\" = '1883 600' ]" \
  "sudo chown 1883:1883 deploy/mosquitto/passwd && sudo chmod 600 deploy/mosquitto/passwd"
check "image Docker eclipse-mosquitto:2 déjà téléchargée (utile hors ligne)" "docker image inspect eclipse-mosquitto:2" "docker pull eclipse-mosquitto:2 (en ligne)"
check "image Docker athar-api:local construite (utile hors ligne)" "docker image inspect athar-api:local" "athar build api (en ligne)"
check "carte série visible dans /dev/serial/by-id/" "ls /dev/serial/by-id/ | grep -q ." "câble de données ? carte alimentée ?"

if [ -f /etc/athar/agent.yaml ]; then
  ok "/etc/athar/agent.yaml existe"
  port="$(sed -n 's/^ *port: *\([^ #]*\).*/\1/p' /etc/athar/agent.yaml | head -1)"
  check "board.port ($port) existe" "test -e '$port'" "recopier la ligne de ls /dev/serial/by-id/ dans agent.yaml"
  check "agent.yaml sans REPLACE_" "! grep -q REPLACE_ /etc/athar/agent.yaml" "remplacer tous les REPLACE_*"
else
  info "/etc/athar/agent.yaml absent (étape F1, normal avant)"
fi
if [ -f /etc/athar/mqtt.secret ]; then
  check "/etc/athar/mqtt.secret en mode 600" "[ \"\$(stat -c %a /etc/athar/mqtt.secret)\" = 600 ]" "sudo chmod 600 /etc/athar/mqtt.secret"
else
  info "/etc/athar/mqtt.secret absent (étape F1, normal avant)"
fi

[ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = yes ] && ok "horloge synchronisée (NTP)" \
  || info "horloge non synchronisée : normal hors ligne, vérifier la date avec 'date'"
exit $fail
