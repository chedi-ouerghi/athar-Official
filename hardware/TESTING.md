# Méthode de test du hardware Athar

Principe : **on monte une échelle, palier par palier**. On ne passe au palier
suivant que si le précédent est 100 % vert. Chaque palier isole UNE couche :
si un test casse, on sait exactement où chercher.

L'installation (Pi, API, broker, carte) et les commandes se trouvent dans le
[**guide de l'équipe de Dubai**](GUIDE-EQUIPE-DUBAI.md) : ce fichier ne les répète pas, il dit
**quoi vérifier** à chaque palier.

```
N0  CI (GitHub)          logiciel seul, aucun matériel               → automatique
N1  ESP32 seul           vraie carte FluidNC, sans moteurs           → guide, étapes C à E4
N2  Pi + DLC32           moteurs NON alimentés                       → guide, étapes C à E4
N3  Moteurs, sans sable  mouvements, homing, calibration             → guide, étape E5
N4  Sable                vrais dessins + endurance                   → guide, étape G
N5  Pannes provoquées    Wi-Fi, courant, USB, broker, redéploiement  → guide, étape G
```

Tout se fait sur place, sur le Raspberry Pi, avec l'API et le broker locaux
(`deploy/docker-compose.local.yml`). Le cloud Google n'intervient pas.

Règle de sécurité permanente pour N3 à N5 : **une personne sur place, la main sur
l'interrupteur d'alimentation des moteurs, pendant tout le test.**

> **Dépend de l'agent.** Les cases marquées 🚫 ne peuvent pas être cochées tant que
> `apps/table-agent` n'existe pas (voir le guide, étape F1).

---

## N0 — CI : tester sans aucun matériel

L'agent Pi (à créer dans `apps/table-agent`, en TypeScript pour réutiliser
`@athar/contracts`) doit avoir deux interfaces remplaçables :

- `BoardPort` : envoie le G-code et lit les réponses. En test, on utilise un
  **FakeBoard** qui répond `ok`, simule la position et renvoie `<Idle|MPos:...>`
  à la commande `?`. Il doit aussi savoir simuler les pannes : `error:`,
  `ALARM:`, un câble débranché, une réponse lente.
- `MqttPort` : réutilise l'idée de `fake-mqtt-client.ts` qui existe déjà côté API.

Ce qu'on teste en CI :

- [ ] conversion θ/ρ → G-code : couplage, bornes `rho_margin`, calcul de `F` pour une vitesse de bille constante
- [ ] streaming : jamais plus de `planner_buffer_lines` lignes sans `ok`
- [ ] chaque message MQTT valide `device-protocol.ts` (zod), dans les deux sens
- [ ] idempotence : la même commande reçue 2 fois (QoS 1) ne lance qu'un seul dessin
- [ ] erreurs : une `ALARM` de la carte remonte en `status` d'erreur vers l'API
- [ ] **test de bout en bout** : API (driver MQTT) + broker Mosquitto en Docker + agent avec FakeBoard → un job va de `start` à `completed`

👉 Une fois ce dernier test vert, il ne reste plus que la mécanique à valider.

## N1 — ESP32 seul (le plus rentable)

Un **ESP32 DevKit** (ou un DLC32 de rechange) flashé avec FluidNC standard et
`hardware/board/config.yaml`. FluidNC fonctionne sans moteurs : il génère simplement
les impulsions. Pas de risque pour la vraie carte. Les gestes sont ceux de l'étape E du guide.

- [ ] le Pi voit la carte (`ls -l /dev/serial/by-id/`)
- [ ] FluidNC démarre sans `[MSG:ERR:` avec notre `config.yaml` ; `$I` répond ; `?` répond `<Idle|…>`
- [ ] un déplacement à vide (`G91`, `G1 X10 F600`) fait changer la position rapportée par `?`
- [ ] 🚫 l'agent ouvre le port série et lit la version (`$I`)
- [ ] 🚫 téléphone → API → broker → agent → carte : un dessin démarre
- [ ] 🚫 la position rapportée par `?` progresse et remonte jusqu'à l'app
- [ ] 🚫 pause / reprise / stop depuis le mobile
- [ ] 🚫 débrancher l'USB pendant un dessin → erreur propre dans l'app ; rebrancher → reprise du contrôle
- [ ] 🚫 couper le Wi-Fi du Pi → table « hors ligne » dans l'app (Last Will), puis retour en ligne
- [ ] 🚫 redémarrer l'agent pendant un dessin → l'état se resynchronise

👉 Environ 90 % des bugs sortent ici, sans risque pour la mécanique.

## N2 — Pi + DLC32, moteurs non alimentés

DLC32 branché au Pi en USB, **alimentation des moteurs débranchée** :

- [ ] le CH340 du DLC32 est visible (`ls -l /dev/serial/by-id/`)
- [ ] FluidNC flashé sur le DLC32 + `config.yaml` envoyé, sans erreur au démarrage (guide, E2 à E4)
- [ ] la table est « en ligne » côté API (guide, D3, avec un `online` publié à la main)
- [ ] 🚫 `athar-agent selftest` est entièrement vert (commande à prévoir, voir plus bas)
- [ ] 🚫 la table apparaît en ligne dans l'app mobile, publiée par l'agent
- [ ] 🚫 un dessin « à vide » s'exécute de bout en bout (seule la position logicielle bouge)

## N3 — Moteurs, sans sable

Sans agent, envoyez les ordres directement dans FluidTerm (guide, E4), toujours **lentement** :
`G91` puis `G1 X10 F300` (X en degrés) ou `G1 Y10 F300` (Y en mm). À vitesse lente (`F` réduit),
dans l'ordre :

| #   | Test            | Ce que fait l'équipe                | Résultat attendu                                                                                                                                            |
| --- | --------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Sens θ          | regarde le bras                     | `θ +10°` → le bras tourne dans le sens horaire (convention à fixer)                                                                                         |
| 3.2 | Sens ρ          | regarde le chariot                  | `ρ +10 mm` → le chariot s'éloigne du centre                                                                                                                 |
| 3.3 | Fin de course ρ | appuie à la main sur le capteur     | `?` affiche `Pn:Y`                                                                                                                                          |
| 3.4 | Homing          | regarde                             | `$H` → ρ retourne au centre, puis θ trouve son 0                                                                                                            |
| 3.5 | Calibration θ   | colle un repère adhésif sur le bras | commande `+3600°` (10 tours) → le repère revient pile au même endroit ; sinon on corrige `steps_per_mm` de X                                                |
| 3.6 | Calibration ρ   | mesure à la règle                   | commande `+200 mm` → mesure réelle ; corriger `steps_per_mm` de Y                                                                                           |
| 3.7 | Couplage        | moteur ρ coupé                      | `θ +360°` → mesurer le déplacement du chariot → `coupling_mm_per_deg` = mesure / 360                                                                        |
| 3.8 | Rayon max       | regarde l'aimant                    | `ρ = 1.0` → l'aimant s'arrête avant le bord ; ajuster `radius_mm` et `rho_margin`                                                                           |
| 3.9 | Répétabilité    | rien                                | 20 allers-retours rapides puis `$H` → l'écart de position doit être ≈ 0 (sinon : pas perdus → baisser vitesse ou accélération, monter le courant du driver) |

Où reporter chaque valeur corrigée :

- `steps_per_mm`, `max_travel_mm` (tests 3.5, 3.6) → `hardware/board/config.yaml`, puis renvoyer le fichier à la carte (guide, E3) ;
- `coupling_mm_per_deg`, `radius_mm`, `rho_margin` (tests 3.7, 3.8) → `agent.yaml` sur le Pi (modèle : `hardware/table-agent/agent.example.yaml`).

Recopiez ensuite la valeur dans le repo (`hardware/`) pour garder une trace.

## N4 — Sable

Une webcam USB sur le Pi, au-dessus de la table, permet de suivre à distance.

- [ ] cercle, puis spirale, puis un design simple (`star`), puis un design dense (`sadu`, `khoos`)
- [ ] comparer la photo du résultat avec l'aperçu de l'app (même orientation ? même échelle ?)
- [ ] réglage de `ball_speed_mm_s` : la plus haute vitesse qui garde un trait net
- [ ] **endurance** : une playlist de 12 à 24 h, puis `$H` → mesurer la dérive ; vérifier la RAM du Pi et la température des drivers

## N5 — Pannes provoquées (avant toute démo client)

| Panne                            | Comment                           | Attendu                                                                                           |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Wi-Fi coupé 2 min                | débrancher la box                 | l'app affiche hors ligne ; à la reconnexion, état cohérent, pas de commande en double             |
| Courant coupé                    | débrancher la prise               | le Pi redémarre seul, l'agent repart, la table revient en ligne, homing avant tout nouveau dessin |
| USB débranché                    | tirer le câble                    | erreur claire dans l'app, aucun crash de l'agent                                                  |
| Broker redémarré                 | `athar restart mosquitto`         | l'API et l'agent se reconnectent seuls                                                            |
| API redéployée pendant un dessin | `git pull && athar up -d --build` | la table continue de dessiner ; l'app retrouve le job                                             |
| Commande invalide                | publier un JSON faux sur `cmd`    | rejet + `ack` d'erreur, aucun mouvement                                                           |

`athar` est le raccourci Docker Compose du guide (section 10).

---

## `athar-agent selftest` — à implémenter

Une commande qui produit un rapport lisible qu'on peut demander à n'importe quel
moment à l'équipe sur place (« lance ça et envoie-moi la capture ») :

```
[OK] config agent.yaml valide
[OK] port série /dev/serial/by-id/... ouvert
[OK] FluidNC v3.x — config "Athar Table"
[OK] état carte : Idle, pas d'alarme
[OK] capteurs : X=libre Y=libre
[OK] broker joignable (mqtt://127.0.0.1:1883 en local, wss://mqtt.<domaine> sur le cloud), login OK
[OK] ACL : publication sur athar/v1/t/<id>/status autorisée
[OK] horloge système synchronisée (NTP)
[--] moteurs : non testés (utiliser --motors en présence de quelqu'un)
```
