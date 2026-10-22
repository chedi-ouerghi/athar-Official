# Déployer le backend Athar sur Google Cloud (environnement de test)

> **Cloud en pause.** Les tests se font pour l'instant **sur place, sur un Raspberry Pi** avec
> `docker-compose.local.yml` : voir [`hardware/GUIDE-EQUIPE-DUBAI.md`](../hardware/GUIDE-EQUIPE-DUBAI.md).
> Ce document décrit la VM Google Cloud, à utiliser quand elle existera ; rien ici n'est supprimé.

Une seule VM `e2-micro` héberge Caddy (HTTPS) + l'API + Mosquitto.
Coût visé : 0 € (offre gratuite permanente GCP), sinon couvert par les crédits.

## 1. Créer la VM (console GCP, une seule fois)

| Réglage                 | Valeur                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| Région                  | `us-central1`, `us-east1` ou `us-west1` (seules régions gratuites) |
| Type                    | `e2-micro`                                                         |
| Image                   | Debian 12                                                          |
| Disque                  | **Standard** persistent disk, 30 Go (Balanced/SSD = payant)        |
| Réseau                  | Niveau **Standard** ; IP externe **statique**                      |
| Pare-feu                | Autoriser HTTP + HTTPS                                             |
| Sauvegardes / Ops Agent | Désactivés (RAM limitée, snapshots payants)                        |

Avant de valider, vérifie l'estimation mensuelle à droite. Elle ne doit contenir
que la VM et le disque. Une IP externe peut être facturée : avec les crédits,
c'est couvert, mais surveille la page Facturation la première semaine.

**Crédits d'une autre entreprise** : crée un **projet GCP dédié "athar-test"**.
Tu pourras le basculer plus tard sur ton propre compte de facturation sans tout réinstaller.

## 2. DNS

Chez le registrar du domaine, crée deux enregistrements A vers l'IP statique :

- `api.<domaine>`
- `mqtt.<domaine>`

## 3. Préparer la VM (SSH, une seule fois)

```bash
# Swap 2 Go : indispensable avec 1 Go de RAM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # puis se reconnecter

# Dossier de la stack
sudo mkdir -p /opt/athar/mosquitto && sudo chown -R $USER /opt/athar
```

Copie ensuite les fichiers de la stack depuis la racine du repo (l'ACL a une seule
source : `hardware/broker/acl`) :

```bash
scp deploy/docker-compose.yml deploy/Caddyfile <user>@<ip>:/opt/athar/
scp deploy/mosquitto/mosquitto.conf hardware/broker/acl <user>@<ip>:/opt/athar/mosquitto/
```

## 4. Secrets (sur la VM uniquement, jamais dans Git)

```bash
cd /opt/athar
# .env de l'API : repartir de apps/api/.env.example
nano .env      # DOMAIN=<domaine>
               # TABLE_MODE=hardware
               # MQTT_URL=wss://mqtt.<domaine>
               # MQTT_USERNAME=athar-api
               # MQTT_PASSWORD=...
               # PUBLIC_LINK_BASE_URL=https://<hôte des liens QR>   (obligatoire en production)
chmod 600 .env
# NODE_ENV, TRUST_PROXY et les chemins des fichiers JSON (/data) sont déjà fixés
# dans docker-compose.yml : ne pas les répéter ici.

# Comptes du broker
docker run --rm -it -v $PWD/mosquitto:/m eclipse-mosquitto:2 \
  mosquitto_passwd -c /m/passwd athar-api
docker run --rm -it -v $PWD/mosquitto:/m eclipse-mosquitto:2 \
  mosquitto_passwd /m/passwd <tableId>      # un compte par table
# Le broker tourne sous l'utilisateur 1883 : sans ce chown il ne peut pas lire passwd
# (créé en 0600 root) et plante au démarrage. À refaire après CHAQUE ajout de compte.
sudo chown 1883:1883 mosquitto/passwd && sudo chmod 600 mosquitto/passwd
# Broker déjà démarré : docker compose kill -s SIGHUP mosquitto
```

Le nom d'utilisateur MQTT d'une table est son `tableId` (l'ACL le lit via `%u`) ;
`POST /api/v1/admin/tables/provision` renvoie ses identifiants. Ils ne sont pas
enregistrés tout seuls sur le broker : c'est la commande ci-dessus.

## 5. Démarrer

```bash
echo "<token GitHub read:packages>" | docker login ghcr.io -u chedi-ouerghi --password-stdin

# Premier compte admin, AVANT le premier démarrage : la commande refuse si l'API tourne
# (verrou sur le fichier JSON). Sans admin, aucune table ne peut être enregistrée.
echo "<mot de passe>" | docker compose run --rm --no-deps -T api \
  node dist/cli/admin-create.js --email <email> --name "<nom>" --password-stdin

docker compose up -d
docker compose logs -f
curl https://api.<domaine>/health        # 200 ; /ready renvoie aussi tableMode
```

Ensuite, le workflow `.github/workflows/deploy-api.yml` reconstruit l'image et redéploie l'API.
Il est pour l'instant **déclenché à la main** (`workflow_dispatch`) ; son en-tête explique comment
rétablir le déclenchement automatique sur chaque push `master` qui touche l'API. Un redéploiement redémarre l'API : les dessins
en cours sont oubliés de l'API (la table, elle, continue). La suite des tests
matériel est dans [`hardware/TESTING.md`](../hardware/TESTING.md).

## 6. Sauvegarde des données (fichiers JSON)

```bash
# cron quotidien sur la VM
docker run --rm -v athar_api-data:/d -v /opt/athar/backups:/b alpine \
  tar czf /b/api-data-$(date +%F).tgz -C /d .
```
