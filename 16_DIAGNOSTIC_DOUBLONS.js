/**
 * ============================================================
 * CinéMaison V4
 * Script  : 16_DIAGNOSTIC_DOUBLONS.gs
 * Rôle    : Détecter les fiches Films en double (même Titre+Année),
 *           en distinguant deux cas :
 *             - MÊME PLATEFORME : très probablement une vraie erreur
 *               (ex: Blown away en double, découvert le 06/09/2026 via
 *               les ambiguïtés du mail Prime) -- à nettoyer.
 *             - PLATEFORMES DIFFÉRENTES : normal et voulu (le même film
 *               peut légitimement être suivi sur CANAL+ ET Prime en même
 *               temps) -- pour information seulement, rien à corriger.
 * Version : 1.9 (30/09/2026)
 * ============================================================
 *
 * Correctif V1.9 (30/09/2026) : genererEtEnvoyerRapportDoublonsV1
 * envoie maintenant un mail RAS quand aucun doublon même plateforme
 * n'est trouvé, plutôt que de sortir silencieusement -- demandé par
 * Ben pour avoir une confirmation par mail après un lancement manuel
 * depuis Réglages, comme pour le rapport "Écarts plateformes".
 *
 * Correctif V1.8 : le regroupement par plateforme comparait le texte
 * BRUT de la colonne Plateforme -- "CANAL+"/"Canal+",
 * "NETFLIX"/"Netflix", "PRIME VIDEO"/"Prime Video" et surtout
 * "DISNEY+"/"Disney+"/"DISNEY" (3 variantes constatées dans Films)
 * n'étaient donc jamais reconnus comme la même plateforme, ratant des
 * doublons du même genre que V1.7. Nouvelle fonction
 * canoniserPlateformeDoublonsV1_ (même principe que
 * normaliserStreamingV1_ de 17_CONTROLE_STREAMING_GENERIQUE.gs)
 * utilisée pour le regroupement -- le texte affiché dans le
 * rapport/mail reste toujours celui écrit dans Films, inchangé.
 * Signalé par Ben en remarquant "Disney+" et "DISNEY" dans sa colonne
 * Plateforme.
 *
 * Correctif V1.7 : un groupe Titre+Année avec 3+ plateformes dont
 * DEUX identiques (ex. "Planète interdite" 1956 : 2 fiches PRIME VIDEO
 * + 1 fiche CANAL+) n'était jamais signalé -- l'ancienne logique
 * exigeait que TOUT le groupe soit sur une seule plateforme pour le
 * classer "même plateforme", ratant le vrai doublon Prime caché dans
 * ce groupe mixte. Détection maintenant faite PAR PLATEFORME à
 * l'intérieur de chaque groupe, plutôt que sur le groupe entier.
 * Signalé par Ben : "Planète interdite" toujours en double après un
 * rapport annonçant 0 doublon.
 *
 * Correctif V1.6 : ajout d'un mail hebdomadaire (lundi 7h) reprenant
 * la même détection "même plateforme" que l'onglet DIAGNOSTIC_DOUBLONS,
 * avec un lien "Supprimer celle-ci" par fiche -- demandé par Ben après
 * avoir découvert "Planète interdite" en double sur Prime (même durée),
 * resté invisible des mois faute de lancer detecterDoublonsFilmsV1()
 * manuellement. Logique de regroupement extraite dans
 * calculerDoublonsFilmsV1_ (partagée entre l'ancien onglet et le
 * nouveau mail plutôt que dupliquée) -- detecterDoublonsFilmsV1() et
 * l'onglet DIAGNOSTIC_DOUBLONS n'ont pas changé de comportement.
 * Mise en place du mail (une seule fois) : installerDeclencheurDoublonsHebdoV1().
 *
 * Correctif V1.5 : le timeout persistait même sur un rapport minuscule
 * (113 lignes, V1.4) -- écarte l'hypothèse "trop de données". Nouvelle
 * piste : deleteSheet()+insertSheet() modifient la STRUCTURE du
 * classeur, une opération a priori plus lourde qu'un simple
 * setValues(). L'onglet est maintenant créé une seule fois puis
 * seulement vidé (clear()) et réécrit aux exécutions suivantes.
 *
 * Correctif V1.4 : le timeout persistait malgré les délais allongés
 * (V1.3) -- écriture découpée en blocs de 300 lignes + taille du
 * rapport loguée avant l'écriture, pour comprendre si c'est une
 * question de volume ou un vrai aléa Google.
 *
 * Correctif V1.3 : délais de nouvelle tentative allongés (5s/15s/30s,
 * 3 tentatives au lieu de 2) -- le 2s/4s du V1.2 s'est révélé
 * insuffisant (2 échecs identiques malgré tout). Si ça continue à
 * échouer même avec ces délais plus longs, c'est probablement une vraie
 * surcharge ponctuelle côté Google sur ce Sheet (devenu volumineux),
 * pas quelque chose qu'une nouvelle tentative peut garantir de
 * résoudre -- relance simplement la fonction un peu plus tard.
 *
 * Correctif V1.2 : jusqu'à 2 nouvelles tentatives (pause 2s puis 4s)
 * sur la lecture de Films et l'écriture du rapport -- un "Service
 * Spreadsheets timed out" est resté possible même après le passage à
 * un seul appel d'écriture (charge ponctuelle côté Google, ou Sheet
 * sollicité en même temps par un autre script comme prime.js).
 *
 * Correctif V1.1 : écriture du rapport en un seul appel réseau au lieu
 * d'un appel par ligne (plus rapide, moins sujet au "Service
 * Spreadsheets timed out" que sur un gros Sheet).
 *
 * Usage : lance detecterDoublonsFilmsV1() depuis l'éditeur Apps Script.
 * Résultat écrit dans l'onglet DIAGNOSTIC_DOUBLONS (créé une seule
 * fois, puis vidé et réécrit à chaque lancement suivant), PAS dans
 * Films -- purement un rapport de lecture, ne modifie jamais Films.
 * Mail hebdomadaire (même détection, "même plateforme" seulement) :
 * lance installerDeclencheurDoublonsHebdoV1() une seule fois pour
 * l'activer -- voir genererEtEnvoyerRapportDoublonsV1 plus bas.
 */

/** Réessaie jusqu'à 3 fois (pause 5s, 15s, 30s) si fonction() lève une exception. */
function avecNouvellesTentativesDoublonsV1_(fonction, description) {
  const pauses = [5000, 15000, 30000];
  let derniereErreur;
  for (let tentative = 0; tentative <= pauses.length; tentative++) {
    try {
      return fonction();
    } catch (e) {
      derniereErreur = e;
      if (tentative < pauses.length) {
        Logger.log(
          "[" + description + "] tentative " + (tentative + 1) +
          " échouée (" + e.message + "), nouvel essai dans " +
          (pauses[tentative] / 1000) + "s..."
        );
        Utilities.sleep(pauses[tentative]);
      }
    }
  }
  throw derniereErreur;
}

// REFACTORISÉ (26/09/2026) -- logique de regroupement extraite dans
// calculerDoublonsFilmsV1_ (partagée avec le nouveau mail hebdomadaire,
// voir genererEtEnvoyerRapportDoublonsV1) plutôt que dupliquée.
function calculerDoublonsFilmsV1_() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("La feuille Films est introuvable.");

  const donnees = avecNouvellesTentativesDoublonsV1_(
    function() { return films.getDataRange().getValues(); },
    "lecture Films"
  );
  if (donnees.length < 2) throw new Error("La feuille Films est vide.");

  const entetes = donnees[0].map(function(e) { return String(e || "").trim(); });
  const colID = entetes.indexOf("ID");
  const colTitre = entetes.indexOf("Titre");
  const colAnnee = entetes.indexOf("Annee");
  const colPlateforme = entetes.indexOf("Plateforme");
  const colAffiche = entetes.indexOf("Affiche");
  if (colID === -1 || colTitre === -1 || colAnnee === -1 || colPlateforme === -1) {
    throw new Error("Colonne ID, Titre, Annee ou Plateforme introuvable dans Films.");
  }

  // Regroupe par Titre+Année normalisés (accents/casse ignorés).
  const groupes = {};
  for (let i = 1; i < donnees.length; i++) {
    const titre = String(donnees[i][colTitre] || "").trim();
    if (!titre) continue;
    const annee = String(donnees[i][colAnnee] || "").trim();
    const cle = normaliserTitreDoublonsV1_(titre) + "|" + annee;

    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push({
      ligne: i + 1,
      id: String(donnees[i][colID] || "").trim(),
      titre: titre,
      annee: annee,
      plateforme: String(donnees[i][colPlateforme] || "").trim(),
      affiche: colAffiche !== -1 ? String(donnees[i][colAffiche] || "") : "",
    });
  }

  const memePlateforme = [];
  const plateformesDifferentes = [];

  Object.keys(groupes).forEach(function(cle) {
    const membres = groupes[cle];
    if (membres.length < 2) return;

    // CORRECTIF (27/09/2026) -- exigeait que TOUT le groupe soit sur
    // une seule plateforme pour le signaler "même plateforme" -- rate
    // un vrai doublon caché dans un groupe MIXTE (ex. "Planète
    // interdite" 1956 : 2 fiches PRIME VIDEO + 1 fiche CANAL+, un vrai
    // doublon sur Prime, mais classé "normal" à tort puisque le groupe
    // entier compte 2 plateformes différentes). Repère maintenant les
    // doublons PAR PLATEFORME à l'intérieur du groupe, plutôt que sur
    // le groupe entier -- signalé par Ben (27/09/2026), qui n'avait
    // pourtant encore rien supprimé quand le rapport a annoncé 0
    // doublon même plateforme.
    const parPlateforme = {};
    membres.forEach(function(m) {
      // CORRECTIF (27/09/2026) -- regroupait par texte brut de
      // Plateforme, donc "CANAL+"/"Canal+", "NETFLIX"/"Netflix",
      // "PRIME VIDEO"/"Prime Video" et surtout "DISNEY+"/"Disney+"/
      // "DISNEY" (3 variantes constatées dans Films) n'étaient JAMAIS
      // regroupés comme la même plateforme, ratant des doublons du
      // même genre que le correctif ci-dessus vient de corriger.
      // Signalé par Ben en repérant ces variantes. Normalise pour le
      // regroupement (canoniserPlateformeDoublonsV1_), mais le texte
      // affiché dans le rapport/mail reste celui écrit dans Films
      // (m.plateforme, jamais modifié).
      const cle2 = canoniserPlateformeDoublonsV1_(m.plateforme);
      if (!parPlateforme[cle2]) parPlateforme[cle2] = [];
      parPlateforme[cle2].push(m);
    });

    Object.keys(parPlateforme).forEach(function(plateforme) {
      if (parPlateforme[plateforme].length >= 2) {
        memePlateforme.push(parPlateforme[plateforme]);
      }
    });

    const plateformesUniques = Object.keys(parPlateforme);
    if (plateformesUniques.length > 1) {
      plateformesDifferentes.push(membres);
    }
  });

  return { memePlateforme: memePlateforme, plateformesDifferentes: plateformesDifferentes };
}

function detecterDoublonsFilmsV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const { memePlateforme, plateformesDifferentes } = calculerDoublonsFilmsV1_();

  avecNouvellesTentativesDoublonsV1_(
    function() { ecrireRapportDoublonsV1_(classeur, memePlateforme, plateformesDifferentes); },
    "écriture DIAGNOSTIC_DOUBLONS"
  );

  Logger.log(
    "Doublons même plateforme (à vérifier) : " + memePlateforme.length +
    " groupe(s) | Doublons plateformes différentes (normal) : " +
    plateformesDifferentes.length + " groupe(s)."
  );
  Logger.log("Détail écrit dans l'onglet DIAGNOSTIC_DOUBLONS.");
}

/**
 * NOUVEAU (26/09/2026) -- version mail du diagnostic ci-dessus, sur
 * demande de Ben (le film "Planète interdite" en double sur Prime,
 * même durée, a fait choisir la mauvaise fiche en silence des mois
 * durant avant d'être repéré). Hebdomadaire plutôt que quotidien : un
 * doublon nouveau est rare, pas la peine d'un mail chaque jour.
 * Ne touche PAS à detecterDoublonsFilmsV1 ni à l'onglet
 * DIAGNOSTIC_DOUBLONS -- les deux mécanismes coexistent, chacun peut
 * être lancé indépendamment.
 * Installer le déclencheur une seule fois : installerDeclencheurDoublonsHebdoV1().
 */
function genererEtEnvoyerRapportDoublonsV1() {
  const { memePlateforme } = calculerDoublonsFilmsV1_();

  // MODIFIÉ (30/09/2026) -- envoie maintenant un mail RAS même sans
  // doublon trouvé, plutôt que de sortir silencieusement -- demandé
  // par Ben pour avoir une confirmation par mail après un lancement
  // manuel depuis Réglages (le bouton lui-même montre déjà "✓ FAIT"
  // dans l'app, mais rien ne l'indiquait par mail, contrairement au
  // rapport "Écarts plateformes"). Même destinataires (AjoutAutoPrime).
  const destinataires = destinatairesPourService_("AjoutAutoPrime");

  if (memePlateforme.length === 0) {
    if (destinataires) {
      MailApp.sendEmail({
        to: destinataires,
        subject: "CinéMaison - V2 - RAS (doublons)",
        htmlBody:
          '<div style="font-family:Arial,sans-serif;background:#F5EFE0;padding:24px"><div style="background:#FFFBF2;border-radius:8px;padding:20px;max-width:480px;margin:0 auto">' +
          '<p style="font-size:18px;font-weight:bold;color:#3A2E22;margin:0 0 4px">CINÉMAISON</p>' +
          '<p style="font-size:11px;color:#9A9182;letter-spacing:1px;margin:0 0 16px">DOUBLONS &middot; CONTRÔLE</p>' +
          '<p style="font-size:13px;color:#3A2E22">Contrôle doublons exécuté avec succès -- aucun doublon même plateforme trouvé cette fois.</p>' +
          "</div></div>",
      });
    }
    journal_("DIAGNOSTIC_DOUBLONS", "HEBDOMADAIRE", "OK_RAS", "Aucun doublon même plateforme.");
    return;
  }

  if (destinataires) {
    const html = construireHtmlRapportDoublonsV1_(memePlateforme);
    MailApp.sendEmail({
      to: destinataires,
      subject: "CinéMaison - V2 - " + memePlateforme.length + " doublon(s) même plateforme",
      htmlBody: html,
    });
  }

  journal_(
    "DIAGNOSTIC_DOUBLONS", "HEBDOMADAIRE", destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    memePlateforme.length + " groupe(s) trouvé(s)."
  );
}

function construireHtmlRapportDoublonsV1_(memePlateforme) {
  const motDePasse = String(lireConfig_("AddFilmPassword", ""));
  const baseUrl = "https://cinemaison-v2.vercel.app";

  function vignetteHtml(urlAffiche) {
    return urlAffiche
      ? '<img src="' + urlAffiche + '" width="50" height="75" style="border-radius:4px;object-fit:cover;flex-shrink:0;margin-right:12px" alt="">'
      : '<div style="width:50px;height:75px;border-radius:4px;background:#E3D9C4;flex-shrink:0;margin-right:12px"></div>';
  }

  const groupesHtml = memePlateforme.map(function(membres) {
    const lignesMembres = membres.map(function(m) {
      const supprimerUrl = baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(m.id) +
        "&titre=" + encodeURIComponent(m.titre) + "&pw=" + encodeURIComponent(motDePasse);
      return '<div style="display:flex;align-items:flex-start;padding:8px 0;border-bottom:1px solid #EFE7D6">' +
        vignetteHtml(m.affiche) +
        '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
        m.titre + ' (' + m.annee + ') &middot; ' + m.plateforme + ' &middot; ' + m.id +
        '<br><a href="' + supprimerUrl + '" style="color:#B5622B">Supprimer celle-ci</a>' +
        '</div></div>';
    }).join("");
    return '<div style="margin-top:16px">' + lignesMembres + '</div>';
  }).join("");

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;' +
    'max-width:520px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">' +
    'CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;' +
    'margin-top:4px;font-family:Arial,sans-serif">DOUBLONS &middot; RAPPORT HEBDOMADAIRE</div>' +
    '<div style="font-size:13px;color:#9A9182;margin-top:10px;font-family:Arial,sans-serif">' +
    memePlateforme.length + ' fiche(s) partageant Titre+Année ET Plateforme -- probablement des doublons. ' +
    'Choisis laquelle garder, supprime l\'autre.</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    groupesHtml +
    '</div></div></body></html>'
  );
}

/** Lance une seule fois depuis l'éditeur pour activer le mail hebdomadaire. */
function installerDeclencheurDoublonsHebdoV1() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "genererEtEnvoyerRapportDoublonsV1"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  // Lundi 7h -- avant le rapport d'écarts quotidien (8h), sans raison
  // particulière : dis-moi si tu préfères un autre jour/heure.
  ScriptApp.newTrigger("genererEtEnvoyerRapportDoublonsV1")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();

  Logger.log("Déclencheur hebdomadaire (lundi 7h) installé pour genererEtEnvoyerRapportDoublonsV1.");
}

/**
 * NOUVEAU (27/09/2026) -- même principe que normaliserStreamingV1_
 * (17_CONTROLE_STREAMING_GENERIQUE.gs) et PLATEFORMES_STREAMING_V1
 * (motifs: ["DISNEY"] y reconnaît déjà "DISNEY"/"DISNEY+"/"Disney+"
 * comme une seule plateforme) -- reproduit ici en local pour ne pas
 * dépendre de l'ordre de chargement des fichiers, et couvre en plus
 * CANAL+/PRIME VIDEO (absents de PLATEFORMES_STREAMING_V1, gérés par
 * d'autres fonctions ailleurs dans le projet). Uniquement pour le
 * REGROUPEMENT -- le texte affiché dans le rapport reste toujours
 * m.plateforme tel qu'écrit dans Films.
 */
function canoniserPlateformeDoublonsV1_(valeur) {
  const normalise = String(valeur || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalise.indexOf("DISNEY") >= 0) return "DISNEY+";
  if (normalise.indexOf("NETFLIX") >= 0) return "NETFLIX";
  if (normalise.indexOf("CANAL") >= 0) return "CANAL+";
  if (normalise.indexOf("PRIME") >= 0) return "PRIME VIDEO";
  return normalise;
}

function normaliserTitreDoublonsV1_(titre) {
  return String(titre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * V1.4 (08/09/2026) : le timeout persistait même avec des délais de
 * nouvelle tentative allongés (5s/15s/30s, V1.3) -- signe possible d'un
 * rapport bien plus volumineux que prévu plutôt que d'un simple aléa.
 * Deux ajouts :
 * - taille du rapport loguée AVANT l'écriture (pour savoir, même si ça
 *   échoue encore après) ;
 * - écriture découpée en blocs de 300 lignes au lieu d'un seul (gros)
 *   bloc -- une requête plus petite a plus de chances d'aboutir avant
 *   le timeout de Google, même si le rapport complet est volumineux.
 *
 * V1.1 (08/09/2026) : réécriture pour tout écrire en UN SEUL appel
 * setValues() (plus quelques appels de mise en forme groupés), au lieu
 * d'un appel réseau par ligne comme avant -- beaucoup plus rapide, et
 * surtout beaucoup moins sujet au "Service Spreadsheets timed out"
 * rencontré le 08/09/2026 (plus d'appels réseau = plus de chances
 * qu'un seul d'entre eux traîne et fasse échouer tout le lot).
 */
function ecrireRapportDoublonsV1_(classeur, memePlateforme, plateformesDifferentes) {
  const nomOnglet = "DIAGNOSTIC_DOUBLONS";
  let feuille = classeur.getSheetByName(nomOnglet);
  if (feuille) {
    feuille.clear();
  } else {
    feuille = classeur.insertSheet(nomOnglet);
  }

  const lignes = [];
  const lignesGrasEnTete = []; // numéros de ligne (1-indexé) à mettre en gras

  function ajouterTitre(texte) {
    lignes.push([texte, "", "", "", ""]);
    lignesGrasEnTete.push(lignes.length);
  }

  function ajouterEntetesColonnes() {
    lignes.push(["Titre", "Année", "Plateforme", "ID", "Ligne Films"]);
    lignesGrasEnTete.push(lignes.length);
  }

  function ajouterGroupes(groupes) {
    groupes.forEach(function(membres) {
      membres.forEach(function(m) {
        lignes.push([m.titre, m.annee, m.plateforme, m.id, m.ligne]);
      });
      lignes.push(["", "", "", "", ""]); // ligne vide entre chaque groupe
    });
  }

  ajouterTitre("MÊME PLATEFORME -- À VÉRIFIER (probable erreur)");
  ajouterEntetesColonnes();
  ajouterGroupes(memePlateforme);

  lignes.push(["", "", "", "", ""]);
  lignes.push(["", "", "", "", ""]);
  ajouterTitre("PLATEFORMES DIFFÉRENTES -- NORMAL, POUR INFO");
  ajouterEntetesColonnes();
  ajouterGroupes(plateformesDifferentes);

  Logger.log(
    "Rapport à écrire : " + memePlateforme.length + " groupe(s) même plateforme, " +
    plateformesDifferentes.length + " groupe(s) plateformes différentes, " +
    lignes.length + " ligne(s) au total."
  );

  // Écriture par blocs de 300 lignes plutôt qu'un seul (gros) bloc --
  // une requête plus petite a plus de chances d'aboutir avant que
  // Google ne déclenche son propre timeout.
  const TAILLE_BLOC = 300;
  for (let debut = 0; debut < lignes.length; debut += TAILLE_BLOC) {
    const bloc = lignes.slice(debut, debut + TAILLE_BLOC);
    feuille.getRange(debut + 1, 1, bloc.length, 5).setValues(bloc);
  }

  // Un seul appel réseau pour tout le gras (RangeList regroupe les
  // adresses non contiguës en une seule requête).
  const adressesGras = lignesGrasEnTete.map(function(l) { return "A" + l + ":E" + l; });
  if (adressesGras.length > 0) {
    feuille.getRangeList(adressesGras).setFontWeight("bold");
  }

  feuille.autoResizeColumns(1, 5);
  feuille.setFrozenRows(0);
}
