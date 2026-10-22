#!/usr/bin/env bash
# Prépare un Raspberry Pi (Raspberry Pi OS Lite 64-bit) pour les tests Athar sur place.
# À lancer UNE fois, en SSH, avec l'utilisateur normal (pas en root) :
#
#   bash hardware/pi/setup-pi.sh
#
# Installe : git, gh (GitHub CLI), Docker + Compose, mosquitto-clients (mosquitto_sub/pub),
# picocom (terminal série). Ajoute l'utilisateur aux groupes `docker` et `dialout`
# (accès à Docker et au port USB du DLC32). Relancer le script sans risque : il saute
# ce qui est déjà installé.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Lance ce script avec ton utilisateur normal, pas en root (il utilise sudo quand il le faut)." >&2
  exit 1
fi

if [ "$(uname -m)" != "aarch64" ]; then
  echo "Attention : architecture $(uname -m), attendu aarch64 (Raspberry Pi OS 64-bit)." >&2
fi

echo "==> Paquets système"
sudo apt-get update
sudo apt-get install -y git curl ca-certificates gh mosquitto-clients picocom

if command -v docker >/dev/null 2>&1; then
  echo "==> Docker déjà installé : $(docker --version)"
else
  echo "==> Docker (script officiel get.docker.com, le même que deploy/README.md)"
  curl -fsSL https://get.docker.com | sudo sh
fi

echo "==> Groupes docker et dialout pour $USER"
sudo usermod -aG docker,dialout "$USER"

echo
echo "Terminé. DÉCONNECTE-TOI puis reconnecte-toi en SSH pour activer les groupes, puis vérifie :"
echo "  docker --version && docker compose version && gh --version"
