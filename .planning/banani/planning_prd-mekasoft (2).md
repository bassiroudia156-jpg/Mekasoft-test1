# PRD — MekaSoft

---

## 1. Vision produit

**Pitch en une phrase**
MekaSoft est le premier SaaS de gestion d'atelier mécanique conçu pour les garages indépendants d'Afrique francophone — simple, abordable, accessible depuis un smartphone.

**Problème résolu**
Les ateliers mécaniques en Afrique de l'Ouest fonctionnent aujourd'hui avec des cahiers, la mémoire du chef d'atelier, des fichiers Excel éparpillés et des conversations WhatsApp. Cette organisation dispersée provoque des pertes de revenus concrètes : travaux réalisés mais jamais facturés, historiques véhicules introuvables, relances clients impossibles, et aucune visibilité sur la santé financière du garage. Une étude terrain au Maroc estime ces pertes à 8-12 % du chiffre d'affaires mensuel — soit 80 000 à 300 000 FCFA/mois pour un garage moyen au Sénégal.

**Pourquoi maintenant**
- La pénétration du smartphone en Afrique de l'Ouest dépasse 60 % et continue de croître. Les gérants de garage ont un téléphone, mais pas d'outil métier.
- Le mobile money (Wave, Orange Money) rend le paiement d'un abonnement SaaS possible sans carte bancaire, ce qui était un bloqueur il y a 3 ans.
- Aucun acteur local n'occupe ce créneau sur la zone UEMOA. Les solutions existantes (EBP MéCa, GarageFlow, MASTERCAR4) sont françaises ou marocaines, facturées 30 000 à 130 000 FCFA/mois, et conçues pour des ateliers industrialisés.
- Le marché est vaste et non adressé : ~1 600 garages rien qu'à Dakar, des milliers en Côte d'Ivoire, au Mali, au Burkina, en Guinée.

**Ce que le produit règle concrètement pour l'utilisateur**

| Douleur actuelle | Solution MekaSoft |
|---|---|
| Le gérant oublie de facturer des travaux déjà réalisés → perte sèche de revenus | Chaque intervention ouverte génère un devis puis une facture ; rien ne passe entre les mailles |
| L'historique d'un véhicule est dans la tête du mécanicien ; quand il part, tout est perdu | Fiche véhicule centralisée avec historique complet des interventions, accessible à tous les utilisateurs du garage |
| Impossible de relancer un client qui n'a pas réglé son solde | Registre des paiements avec statut clair (payé / partiel / impayé) par intervention |
| Aucune visibilité sur le chiffre d'affaires mensuel réel du garage | Tableau de bord avec indicateurs clés : CA du mois, interventions en cours, impayés |
| Les devis sont faits "de tête" et le client n'a aucun document écrit → litiges fréquents | Génération de devis et factures PDF en quelques clics, partageables par WhatsApp |

---

## 2. Personas cibles

### Persona 1 — Moussa, 42 ans, gérant-propriétaire de garage, Dakar

- **Profil** : Possède un atelier de mécanique générale dans le quartier de Médina, emploie 3 mécaniciens. A appris le métier sur le tas, gère son garage depuis 12 ans.
- **Pain points** :
  - Note les réparations dans un cahier qu'il perd ou qui se dégrade.
  - Ne sait pas combien il a réellement gagné ce mois-ci.
  - Oublie régulièrement de facturer des petits travaux (vidanges, diagnostics).
  - Quand un client revient 6 mois après, impossible de retrouver ce qui avait été fait.
  - Des clients contestent le prix parce qu'il n'y a pas de devis écrit.
- **Ce qu'il utilise aujourd'hui** : Un cahier, sa mémoire, WhatsApp pour contacter les clients, parfois un fichier Excel sur le téléphone d'un neveu.
- **Pouvoir d'achat** : CA mensuel estimé 500 000 – 1 500 000 FCFA. Prêt à payer un outil si le coût reste sous 10 000 FCFA/mois et que le retour est visible rapidement.
- **Appareil** : Smartphone Android d'entrée de gamme (Tecno, Itel), connexion 3G/4G variable.

### Persona 2 — Fatou, 35 ans, gérante-comptable d'un garage structuré, Abidjan

- **Profil** : Gère l'administratif et la comptabilité d'un garage de 8 employés. Le garage a une clientèle fidèle (particuliers + petites flottes de 3-5 véhicules). Fatou est à l'aise avec le numérique.
- **Pain points** :
  - Passe des heures chaque fin de mois à reconstituer les factures à partir de bouts de papier.
  - Veut un suivi des paiements partiels (les clients paient souvent en 2 ou 3 fois).
  - Le patron veut un "rapport mensuel" mais elle doit tout refaire à la main dans Excel.
  - A besoin que les mécaniciens puissent renseigner eux-mêmes les interventions sans toucher à la comptabilité.
- **Ce qu'elle utilise aujourd'hui** : Excel + cahier de caisse + calculatrice. A cherché des logiciels en ligne, mais tous sont en euros, trop chers, ou trop complexes.
- **Pouvoir d'achat** : Le garage peut investir 15 000 – 25 000 FCFA/mois pour un outil qui lui fait gagner 2 jours de travail administratif par mois.
- **Appareil** : Smartphone Android milieu de gamme + parfois un ordinateur au bureau.

### Persona 3 — Ibrahima, 28 ans, chef d'atelier / mécanicien principal, Bamako

- **Profil** : Bras droit du propriétaire. Gère le planning des réparations et supervise 2 apprentis. N'a pas de rôle administratif officiel mais c'est lui qui sait ce qui est en cours sur chaque véhicule.
- **Pain points** :
  - Il est le "système de mémoire vivant" du garage : si il est absent, personne ne sait où en est tel véhicule.
  - Veut un moyen rapide de noter ce qu'il fait sur chaque voiture sans rédiger un rapport.
  - Les clients l'appellent directement pour savoir si leur voiture est prête — il perd du temps.
- **Ce qu'il utilise aujourd'hui** : Sa mémoire + des photos sur WhatsApp.
- **Pouvoir d'achat** : Ne paie pas lui-même — c'est l'abonnement du garage.
- **Appareil** : Smartphone Android basique, connexion 3G.

---

## 3. Pages & écrans

### Parcours public (non authentifié)

| # | Nom de la page | À quoi elle sert | Qui y accède | Actions clés |
|---|---|---|---|---|
| 1 | **Page d'accueil / Landing** | Présenter MekaSoft, convaincre le gérant de créer son garage | Tout visiteur (Moussa découvre MekaSoft via un lien WhatsApp) | Comprendre la proposition de valeur · Voir les tarifs · Cliquer sur "Créer mon garage" |
| 2 | **Page Tarifs** | Comparer les plans (Gratuit / Pro / Business) et choisir | Visiteur qui envisage de s'inscrire | Comparer les 3 plans · Choisir un plan · Lancer l'inscription |
| 3 | **Page Inscription** | Créer un compte et son garage en autonomie | Nouveau gérant (Moussa) | Renseigner nom, téléphone, mot de passe · Nommer son garage · Valider l'inscription |
| 4 | **Page Connexion** | Se connecter à son espace garage | Utilisateur existant | Saisir téléphone + mot de passe · Se connecter · Réinitialiser son mot de passe |

### Parcours principal (authentifié — espace garage)

| # | Nom de la page | À quoi elle sert | Qui y accède | Actions clés |
|---|---|---|---|---|
| 5 | **Tableau de bord** | Voir en un coup d'œil la situation du garage : interventions en cours, CA du mois, impayés | Moussa, Fatou, Ibrahima à chaque connexion | Consulter les indicateurs clés · Voir les interventions en cours · Accéder aux alertes (impayés, interventions en attente) |
| 6 | **Liste des clients** | Retrouver un client existant ou en créer un nouveau | Moussa, Fatou | Chercher un client par nom ou téléphone · Créer un nouveau client · Accéder à la fiche d'un client |
| 7 | **Fiche client** | Voir toutes les informations d'un client et ses véhicules | Moussa, Fatou | Modifier les informations du client · Voir la liste de ses véhicules · Voir l'historique de ses interventions et le solde dû |
| 8 | **Liste des véhicules** | Voir tous les véhicules enregistrés dans le garage | Moussa, Fatou, Ibrahima | Chercher un véhicule par immatriculation ou marque · Créer un nouveau véhicule · Accéder à la fiche véhicule |
| 9 | **Fiche véhicule** | Consulter l'historique complet d'un véhicule : toutes les interventions passées et en cours | Moussa, Fatou, Ibrahima | Voir l'historique des interventions · Ouvrir une nouvelle intervention · Modifier les informations du véhicule |
| 10 | **Liste des interventions** | Voir toutes les interventions (en cours, terminées, en attente de paiement) | Moussa, Fatou, Ibrahima | Filtrer par statut (en cours / terminée / impayée) · Ouvrir une nouvelle intervention · Accéder à une fiche intervention |
| 11 | **Fiche intervention** | Décrire le travail à faire ou réalisé sur un véhicule, avec les pièces et la main-d'œuvre | Moussa, Ibrahima (création/modification), Fatou (consultation/facturation) | Décrire les travaux (lignes : désignation, quantité, prix unitaire) · Changer le statut de l'intervention (en cours → terminée) · Générer un devis ou une facture à partir de cette intervention |
| 12 | **Page Devis** | Visualiser un devis généré depuis une intervention, le modifier si nécessaire, le partager au client | Moussa, Fatou | Consulter le devis · Modifier les lignes avant envoi · Partager le devis (télécharger PDF / envoyer par WhatsApp) · Convertir le devis en facture |
| 13 | **Page Facture** | Visualiser une facture, enregistrer un paiement, partager au client | Moussa, Fatou | Consulter la facture · Enregistrer un paiement (total ou partiel) · Partager la facture (télécharger PDF / envoyer par WhatsApp) |
| 14 | **Liste des paiements** | Voir tous les paiements enregistrés, repérer les impayés | Fatou, Moussa | Voir l'historique des paiements · Filtrer par statut (payé / partiel / impayé) · Accéder à la facture liée |
| 15 | **Paramètres du garage** | Configurer les informations du garage (nom, adresse, logo, devise, numéro fiscal) | Moussa (propriétaire) | Modifier les informations du garage · Ajouter le logo pour les factures · Configurer la devise et les mentions légales |
| 16 | **Gestion des utilisateurs** | Ajouter des employés au garage (mécaniciens, comptable) et gérer leurs droits | Moussa (propriétaire — Plan Business uniquement) | Inviter un utilisateur par téléphone · Attribuer un rôle (propriétaire / gestionnaire / mécanicien) · Supprimer un accès |
| 17 | **Page Mon abonnement** | Voir son plan actuel, passer au plan supérieur, gérer le paiement | Moussa, Fatou | Voir le plan en cours et ses limites · Passer de Gratuit à Pro ou de Pro à Business · Payer via Wave ou Orange Money |

---

## 4. Fonctionnalités MVP (V1)

### 4.1 Inscription & Authentification

| Feature | Description | Priorité |
|---|---|---|
| Inscription par téléphone | Le gérant crée un compte avec son numéro de téléphone et un mot de passe. Pas d'email requis — le téléphone est l'identifiant principal en Afrique de l'Ouest. | P0 |
| Création de garage à l'inscription | Dès l'inscription, le gérant nomme son garage et celui-ci est créé automatiquement. Zéro configuration supplémentaire requise pour commencer. | P0 |
| Connexion par téléphone + mot de passe | Connexion simple. Le numéro de téléphone sert d'identifiant. | P0 |
| Réinitialisation du mot de passe par SMS | Le gérant reçoit un code par SMS pour réinitialiser son mot de passe. | P1 |
| Isolation multi-tenant | Les données d'un garage sont strictement invisibles aux autres garages. Chaque utilisateur n'accède qu'à l'espace de son garage. | P0 |

### 4.2 Tableau de bord

| Feature | Description | Priorité |
|---|---|---|
| Indicateurs clés | Affichage du nombre d'interventions en cours, du chiffre d'affaires du mois, du montant total des impayés, et du nombre de clients actifs. | P0 |
| Interventions en cours (résumé) | Liste des 5 dernières interventions ouvertes, avec le véhicule et le statut. Permet d'aller directement à la fiche intervention. | P0 |
| Alertes impayés | Notification visuelle quand des factures sont en retard de paiement (> 7 jours). | P1 |

### 4.3 Gestion des clients

| Feature | Description | Priorité |
|---|---|---|
| Création de client rapide | Créer un client en saisissant uniquement nom + numéro de téléphone. Champs optionnels : adresse, email. Objectif : moins d'1 minute. | P0 |
| Liste et recherche de clients | Voir tous les clients du garage. Recherche par nom ou numéro de téléphone. | P0 |
| Fiche client avec historique | Page dédiée à un client : ses informations, ses véhicules rattachés, son historique d'interventions, son solde (montants facturés vs payés). | P0 |
| Modification / suppression de client | Le gérant peut corriger les informations d'un client ou le supprimer (avec avertissement si des véhicules/interventions sont liés). | P1 |

### 4.4 Gestion des véhicules

| Feature | Description | Priorité |
|---|---|---|
| Création de véhicule rattaché à un client | Créer un véhicule avec : immatriculation, marque, modèle, année (optionnel), kilométrage (optionnel). Le véhicule est obligatoirement rattaché à un client. | P0 |
| Liste et recherche de véhicules | Voir tous les véhicules du garage. Recherche par immatriculation ou marque. | P0 |
| Fiche véhicule avec historique | Page dédiée : infos du véhicule + liste chronologique de toutes les interventions passées et en cours. C'est le "carnet de santé" du véhicule. | P0 |
| Modification des infos véhicule | Corriger l'immatriculation, la marque, le modèle, le kilométrage. | P1 |

### 4.5 Gestion des interventions

| Feature | Description | Priorité |
|---|---|---|
| Création d'intervention | Ouvrir une intervention liée à un véhicule. Champs : description du problème signalé par le client, date d'entrée. | P0 |
| Lignes d'intervention | Ajouter des lignes de travaux : désignation (ex: "Vidange huile moteur"), quantité, prix unitaire. Le total se calcule automatiquement. | P0 |
| Statuts d'intervention | Cycle de vie : En attente → En cours → Terminée. Le mécanicien ou le gérant change le statut. | P0 |
| Suivi depuis le tableau de bord | Les interventions ouvertes apparaissent dans le tableau de bord. | P0 |
| Notes internes sur intervention | Champ texte libre pour que le mécanicien note des observations (ex: "Plaquettes de frein usées à 80%, à signaler au client"). Visible uniquement par l'équipe du garage. | P1 |

### 4.6 Devis

| Feature | Description | Priorité |
|---|---|---|
| Génération de devis depuis une intervention | Un devis est créé à partir des lignes de l'intervention. Le gérant peut le modifier avant envoi (ajouter/retirer des lignes, ajuster les prix). | P0 |
| Aperçu et téléchargement PDF | Le devis est affiché dans un format professionnel avec les infos du garage (nom, adresse, logo si renseigné) et peut être téléchargé en PDF. | P0 |
| Partage WhatsApp | Bouton pour partager le PDF du devis directement via WhatsApp (ouverture du partage natif du navigateur). | P1 |
| Conversion devis → facture | Un devis accepté peut être converti en facture en un clic, sans ressaisir les lignes. | P0 |

### 4.7 Factures

| Feature | Description | Priorité |
|---|---|---|
| Génération de facture | Facture créée depuis un devis converti ou directement depuis une intervention terminée. Numérotation automatique et séquentielle. | P0 |
| Aperçu et téléchargement PDF | Même format professionnel que le devis : infos garage, client, véhicule, détail des lignes, total. | P0 |
| Partage WhatsApp | Partage du PDF de la facture via WhatsApp. | P1 |
| Statut de la facture | Trois statuts : Non payée / Partiellement payée / Payée. Le statut se met à jour automatiquement quand un paiement est enregistré. | P0 |

### 4.8 Paiements

| Feature | Description | Priorité |
|---|---|---|
| Enregistrement d'un paiement | Le gérant enregistre un paiement sur une facture : montant, date, mode de paiement (espèces, Wave, Orange Money, virement). Paiements partiels autorisés. | P0 |
| Historique des paiements | Liste de tous les paiements du garage, filtrable par date, statut et client. | P0 |
| Solde client | Sur la fiche client, affichage du total facturé vs total payé. Le gérant voit immédiatement si un client a un solde impayé. | P1 |

### 4.9 Paramètres & Abonnement

| Feature | Description | Priorité |
|---|---|---|
| Paramètres du garage | Modifier le nom, l'adresse, le numéro fiscal, le logo du garage. Ces informations apparaissent sur les devis et factures. | P1 |
| Gestion de l'abonnement | Voir son plan actuel, les limites restantes (plan gratuit), et passer au plan supérieur. | P0 |
| Paiement de l'abonnement | Payer son abonnement Pro ou Business via Wave ou Orange Money. | P0 |
| Limites du plan gratuit | Quand le gérant atteint une limite (3 clients, 3 véhicules, 5 interventions/mois), un message clair l'invite à passer au plan Pro. Pas de blocage brutal — message explicatif + bouton upgrade. | P0 |

### 4.10 Multi-utilisateurs (Plan Business)

| Feature | Description | Priorité |
|---|---|---|
| Invitation d'utilisateurs | Le propriétaire invite un employé par numéro de téléphone. L'employé reçoit un SMS avec un lien pour créer son mot de passe. | P1 |
| Rôles et permissions | 3 rôles : **Propriétaire** (tout accès) · **Gestionnaire** (tout sauf paramètres garage et abonnement) · **Mécanicien** (voir/créer/modifier interventions uniquement, pas de devis/factures/paiements). | P1 |
| Suppression d'accès | Le propriétaire peut retirer l'accès d'un utilisateur à tout moment. | P1 |

---

## 5. User Stories principales

### US-01 — Inscription et création de garage
**En tant que** Moussa (gérant), **je veux** créer mon garage en quelques minutes avec juste mon numéro de téléphone **afin de** commencer à enregistrer mes clients sans procédure compliquée.

**Critères d'acceptation :**
- L'inscription nécessite uniquement : numéro de téléphone, mot de passe, nom du garage.
- Après validation, Moussa arrive directement sur son tableau de bord vide avec un message d'accueil qui le guide vers sa première action ("Ajoutez votre premier client").
- Le garage est créé en plan Gratuit par défaut.
- Aucun autre garage ne peut voir les données de Moussa.

### US-02 — Création de client en moins d'une minute
**En tant que** Moussa, **je veux** créer un client en saisissant seulement son nom et son téléphone **afin de** ne pas perdre de temps quand un client se présente au garage.

**Critères d'acceptation :**
- Seuls le nom et le numéro de téléphone sont obligatoires.
- Le client est créé et visible dans la liste immédiatement.
- Le temps entre l'ouverture du formulaire et la confirmation de création ne dépasse pas 4 champs à remplir.

### US-03 — Rattachement d'un véhicule à un client
**En tant que** Moussa, **je veux** ajouter un véhicule à un client existant **afin de** pouvoir suivre les interventions par véhicule.

**Critères d'acceptation :**
- Le véhicule nécessite au minimum : immatriculation + marque.
- Le véhicule est automatiquement rattaché au client depuis lequel il est créé.
- Le véhicule apparaît dans la liste des véhicules du client et dans la liste générale des véhicules.

### US-04 — Ouverture et suivi d'une intervention
**En tant que** Ibrahima (chef d'atelier), **je veux** ouvrir une intervention sur un véhicule et y ajouter les travaux réalisés **afin que** l'historique soit conservé et que le gérant puisse facturer.

**Critères d'acceptation :**
- L'intervention est créée depuis la fiche véhicule.
- Ibrahima peut ajouter des lignes (désignation + quantité + prix unitaire).
- Le total se calcule automatiquement.
- Le statut peut être changé : En attente → En cours → Terminée.
- L'intervention apparaît dans le tableau de bord tant qu'elle n'est pas terminée.

### US-05 — Génération et partage d'un devis
**En tant que** Moussa, **je veux** générer un devis à partir d'une intervention et l'envoyer au client par WhatsApp **afin de** formaliser le travail à faire et éviter les litiges sur le prix.

**Critères d'acceptation :**
- Le devis reprend automatiquement les lignes de l'intervention.
- Moussa peut modifier les lignes avant de valider le devis.
- Le devis affiche : infos du garage, infos du client, détail des lignes, total.
- Le devis peut être téléchargé en PDF.
- Un bouton "Partager" ouvre le menu de partage du navigateur (WhatsApp, etc.).

### US-06 — Facturation et enregistrement de paiement
**En tant que** Fatou (gestionnaire), **je veux** convertir un devis en facture et enregistrer les paiements du client **afin de** suivre précisément ce qui est dû et ce qui est encaissé.

**Critères d'acceptation :**
- La facture est créée en un clic depuis un devis accepté, ou directement depuis une intervention terminée.
- La facture a un numéro unique et séquentiel.
- Fatou peut enregistrer un paiement partiel (ex: le client paie 50 000 FCFA sur une facture de 120 000 FCFA).
- Le statut de la facture se met à jour automatiquement (Non payée → Partiellement payée → Payée).
- Le solde restant est visible sur la facture et sur la fiche client.

### US-07 — Vision d'ensemble sur le tableau de bord
**En tant que** Moussa, **je veux** voir en un coup d'œil combien j'ai gagné ce mois-ci, combien d'interventions sont en cours et combien on me doit **afin de** piloter mon garage sans devoir compter à la main.

**Critères d'acceptation :**
- Le tableau de bord affiche : CA du mois en cours, nombre d'interventions en cours, montant total des impayés, nombre de clients.
- Les 5 dernières interventions en cours sont listées avec un lien direct vers la fiche.
- Si des factures sont impayées depuis plus de 7 jours, une alerte visuelle est affichée.

### US-08 — Passage au plan supérieur
**En tant que** Moussa, **je veux** passer au plan Pro quand j'atteins les limites du plan gratuit **afin de** continuer à utiliser MekaSoft sans interruption.

**Critères d'acceptation :**
- Quand Moussa atteint une limite (3 clients par exemple), un message clair lui explique la limite et l'invite à passer au Pro.
- La page d'abonnement montre clairement ce que chaque plan inclut.
- Moussa peut payer via Wave ou Orange Money.
- Après paiement, les limites sont levées immédiatement.
- Un reçu de paiement est généré.

### US-09 — Ajout d'un mécanicien (Plan Business)
**En tant que** Moussa, **je veux** inviter Ibrahima pour qu'il puisse saisir les interventions depuis son téléphone **afin de** ne plus être le seul à enregistrer les travaux.

**Critères d'acceptation :**
- Moussa invite Ibrahima en saisissant son numéro de téléphone.
- Ibrahima reçoit un SMS avec un lien pour créer son mot de passe.
- Ibrahima accède au garage en tant que "Mécanicien" : il voit et modifie les interventions, mais ne voit pas les devis, factures ni paiements.
- Moussa peut retirer l'accès d'Ibrahima à tout moment.

### US-10 — Historique véhicule (le "carnet de santé")
**En tant que** Moussa, **je veux** consulter toutes les interventions passées sur un véhicule **afin de** savoir exactement ce qui a été fait quand un client revient 6 mois plus tard.

**Critères d'acceptation :**
- La fiche véhicule affiche la liste chronologique de toutes les interventions (date, description, statut, montant).
- L'historique est consultable quel que soit le temps écoulé.
- Si le mécanicien qui a fait le travail est parti, l'historique reste intact.

---

## 6. Business Model & Monétisation

### Modèle : Freemium + Abonnement mensuel

| | **Gratuit** | **Pro — ~~12 000~~ 9 900 FCFA/mois** | **Business — ~~25 000~~ 19 900 FCFA/mois** |
|---|---|---|---|
| Création de garage | ✅ | ✅ | ✅ |
| Clients | 3 max | Illimités | Illimités |
| Véhicules | 3 max | Illimités | Illimités |
| Interventions | 5/mois | Illimitées | Illimitées |
| Devis & Factures | ✅ (dans les limites) | ✅ | ✅ |
| Paiements | ✅ (dans les limites) | ✅ | ✅ |
| Téléchargement PDF | ✅ | ✅ | ✅ |
| Partage WhatsApp | ❌ | ✅ | ✅ |
| Multi-utilisateurs | ❌ (1 seul) | ❌ (1 seul) | ✅ (jusqu'à 5) |
| Rôles & permissions | ❌ | ❌ | ✅ |
| Rapport mensuel | ❌ | ❌ | ✅ |
| Export données (PDF/Excel) | ❌ | ❌ | ✅ |
| Logo du garage sur devis/factures | ❌ | ✅ | ✅ |

**Logique du plan gratuit** : Le palier gratuit permet à Moussa de résoudre son problème de base (créer 3 clients, 3 véhicules, gérer 5 interventions/mois, générer des devis et factures). C'est suffisant pour tester sérieusement pendant 2-3 semaines avec un flux réel. Dès que le garage est actif (>3 clients/mois), la limite est atteinte naturellement et l'upgrade devient une évidence.

**Pourquoi pas d'abonnement annuel en V1** : En Afrique de l'Ouest, les artisans et gérants de garage raisonnent en trésorerie mensuelle. Proposer un engagement annuel est un frein à l'adoption. L'abonnement annuel (avec 2 mois offerts) sera introduit en V2 une fois la confiance établie.

### Moyens de paiement acceptés

| Moyen | Zone | Statut |
|---|---|---|
| **Wave** | Sénégal, Côte d'Ivoire, Mali, Burkina | Obligatoire — moyen #1 |
| **Orange Money** | Sénégal, Côte d'Ivoire, Mali, Guinée, Cameroun | Obligatoire — moyen #2 |
| **Free Money** | Sénégal | Souhaitable en V1 |
| **Carte bancaire (Visa/MC)** | Toute zone | Complément — pour la diaspora et les garages structurés |

**Agrégateur recommandé** : Moneroo (agrège Wave + Orange Money + Free Money + cartes en une seule intégration).

---

## 7. Métriques de succès

### Métriques de lancement (90 premiers jours)

| Métrique | Objectif | Pourquoi |
|---|---|---|
| **Garages créés** | 100 garages inscrits en 90 jours | Valide que le message et le canal d'acquisition fonctionnent. Cible réaliste via terrain Dakar + bouche-à-oreille WhatsApp. |
| **Taux d'activation J+1** | > 40 % | Un garage qui crée au moins 1 client + 1 véhicule + 1 intervention dans les 24h suivant l'inscription est "activé". Sous 30 %, l'onboarding est à revoir. |
| **Taux d'activation J+7** | > 25 % | Un garage qui revient au moins 3 fois dans la première semaine. Signe que l'outil est entré dans le workflow quotidien. |
| **Conversion gratuit → payant** | 3-5 % à 90 jours | Benchmark SaaS freemium B2B : 2-5 %. On vise le haut de la fourchette grâce à des limites bien calibrées. |
| **Nombre d'interventions créées** | 500+ interventions totales à 90 jours | Indicateur d'usage réel — pas juste des comptes dormants. |
| **Revenu mensuel récurrent (MRR)** | 30 000 – 50 000 FCFA à M3 | 3 à 5 garages payants = signal de validation. L'objectif n'est pas la rentabilité mais la preuve de willingness to pay. |
| **NPS (enquête terrain)** | > 40 | Enquête rapide (1 question WhatsApp) auprès des garages actifs. Un NPS > 40 = forte probabilité de bouche-à-oreille. |

### Métriques de rétention (après 90 jours)

| Métrique | Objectif |
|---|---|
| Rétention M2 (garages actifs au mois 2) | > 50 % |
| Rétention M3 | > 35 % |
| Churn mensuel payant | < 10 % |

---

## 8. Ce qui est HORS SCOPE V1

| Feature / Capacité | Pourquoi c'est exclu |
|---|---|
| **Gestion de stock / pièces détachées** | Complexité trop élevée pour la V1. Les garages gèrent leur stock "de tête" ou avec un carnet séparé. Sera évalué en V2 si la demande terrain est forte. |
| **Planning / calendrier des rendez-vous** | Les garages informels ne fonctionnent pas sur rendez-vous. Les clients viennent quand ils veulent. Feature prématurée. |
| **Notifications SMS aux clients** | Coût opérationnel des SMS (fournisseur + volume). En V1, le partage WhatsApp couvre 90 % du besoin de communication client. |
| **App mobile native (iOS / Android)** | MekaSoft est une application web responsive, accessible depuis le navigateur du smartphone. Pas besoin d'app native — le navigateur suffit et évite la barrière du téléchargement. |
| **Gestion de flotte / multi-garages** | Le persona V1 est le garage unique indépendant. La gestion multi-sites sera envisagée quand le segment "flottes" sera qualifié. |
| **Comptabilité avancée (bilan, TVA, export comptable)** | Les garages cibles ne tiennent pas de comptabilité formelle. Le suivi CA + paiements de MekaSoft couvre le besoin réel. |
| **Gestion des fournisseurs** | Hors périmètre V1. Le garage enregistre les travaux, pas ses achats de pièces. |
| **Mode hors-ligne complet** | Complexité significative. En V1, les pages doivent être légères et charger sur connexion 3G faible, mais le mode hors-ligne complet (avec synchro) est reporté. |
| **Abonnement annuel** | Frein à l'adoption dans le contexte cible. Sera introduit en V2 avec 2 mois offerts pour récompenser la fidélité. |
| **API publique / intégrations tierces** | Aucun besoin exprimé par la cible V1. Sera pertinent quand des partenaires (assurance, fournisseurs pièces) voudront se connecter. |
| **Support multi-langue (anglais, wolof)** | V1 en français uniquement. L'interface est déjà en langue de travail de la cible (français). L'anglais sera ajouté pour l'expansion Ghana/Nigeria. |
| **Extension motos, poids lourds, équipements non-véhicules** | Fait partie de la vision long terme, mais la V1 se concentre sur les véhicules automobiles pour garder le produit simple et le positionnement clair. |

---

## 9. Risques et mitigation

### Risque 1 — Faible adoption terrain : les gérants ne s'inscrivent pas
**Probabilité** : Élevée
**Impact** : Critique

Les gérants de garage ne cherchent pas activement un logiciel de gestion. Ils ne savent pas qu'ils perdent de l'argent. Le produit doit aller à eux, pas l'inverse.

**Mitigation :**
- Démarchage terrain direct à Dakar : visiter 30 garages en personne les 2 premières semaines. Montrer le produit sur leur propre téléphone, avec leurs propres données (créer le premier client et véhicule ensemble).
- Identifier 3-5 garages "ambassadeurs" qui utilisent le produit visiblement et en parlent à leur réseau.
- Créer une vidéo démo de 2 minutes en français (voix off + écran) diffusable par WhatsApp.
- Pas de pub Facebook en V1 — le canal principal est le terrain + WhatsApp.

### Risque 2 — Rétention faible : les garages s'inscrivent mais arrêtent après 1 semaine
**Probabilité** : Moyenne-Élevée
**Impact** : Critique

Si l'outil est trop lent sur un téléphone basique, trop compliqué, ou ne s'intègre pas dans le workflow quotidien, le gérant revient à son cahier.

**Mitigation :**
- L'onboarding guide Moussa pas à pas : créer son premier client → son premier véhicule → sa première intervention. L'outil n'est "vide" à aucun moment.
- Chaque page doit charger en moins de 3 secondes sur un Tecno Spark en 3G. Le design est ultra-léger : pas d'images lourdes, pas d'animations.
- Suivi WhatsApp personnel des 30 premiers garages inscrits (message J+1, J+3, J+7 : "Comment ça se passe ? Besoin d'aide ?").
- Mesurer le "Time to First Invoice" (temps entre inscription et première facture générée). Si > 48h, l'onboarding est à retravailler.

### Risque 3 — Le plan gratuit est trop généreux : pas de conversion vers le payant
**Probabilité** : Moyenne
**Impact** : Élevé (pas de revenus)

Si les limites du gratuit (3 clients, 3 véhicules, 5 interventions/mois) couvrent le besoin réel d'un petit garage, il n'y a aucune raison de payer.

**Mitigation :**
- Suivre de près le nombre de garages qui atteignent les limites du gratuit. Si < 30 % atteignent une limite en 30 jours, les limites sont trop hautes.
- Ajuster les limites après les 60 premiers jours si nécessaire (ex: passer à 2 clients max ou 3 interventions/mois).
- Verrouiller le partage WhatsApp (devis/factures) au plan Pro — c'est une feature à forte valeur perçue qui motive l'upgrade.

### Risque 4 — Confiance et sécurité des données : le gérant a peur de "perdre ses clients"
**Probabilité** : Moyenne
**Impact** : Élevé

Un gérant qui a toujours eu ses clients "dans la tête" ou sur papier peut craindre de confier ses données à un outil qu'il ne contrôle pas. La question "et si votre site ferme, je perds tout ?" sera posée.

**Mitigation :**
- Message clair dès l'onboarding : "Vos données vous appartiennent."
- En plan Business, permettre l'export des données (clients, véhicules, interventions) en fichier Excel/PDF.
- Ne jamais supprimer les données d'un garage qui arrête de payer — repasser en plan gratuit (lecture seule sur les anciennes données).
- Afficher une page "À propos" crédible sur le site : qui est derrière MekaSoft, pourquoi on fait ça, un numéro WhatsApp de support visible.

### Risque 5 — Problème de paiement mobile money : le gérant veut payer mais n'y arrive pas
**Probabilité** : Moyenne
**Impact** : Élevé (conversion bloquée)

Les intégrations Wave/Orange Money peuvent échouer (timeout, session expirée, solde insuffisant non détecté). Si le premier paiement échoue, le gérant ne réessaie souvent pas.

**Mitigation :**
- Tester le tunnel de paiement avec 10 utilisateurs réels avant le lancement public.
- Proposer un fallback : si le paiement en ligne échoue, permettre une activation manuelle après virement Wave direct (le gérant envoie le montant au numéro MekaSoft + capture d'écran → activation sous 2h).
- Afficher un message d'erreur humain et actionnable en cas d'échec : "Le paiement n'a pas abouti. Réessayez ou envoyez [montant] à ce numéro Wave : [numéro]. On active votre compte sous 2h."
- Prévoir un numéro WhatsApp de support dédié aux problèmes de paiement.