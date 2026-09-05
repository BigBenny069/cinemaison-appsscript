/**
 * ============================================================
 * CinéMaison V4
 * Script : 06_CONNECTEURS_PLATEFORMES.gs
 * Rôle   : Connecteurs plateformes — CANAL+ uniquement
 * Version: 4.7.6
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs,
 *               Worker Cloudflare CANAL+ V3.5
 * ============================================================
 *
 * Correctif V4.7.6 (05/09/2026) :
 * - Groupe "STATUT MODIFIÉ" : affichait uniquement le changement de
 *   statut (ex. "vide → DATE_CONNUE") sans jamais montrer la date
 *   elle-même. Ajout d'une seconde ligne (ancienneDate → nouvelleDate)
 *   quand une date a effectivement changé en même temps que le statut
 *   — voir construireFicheModificationCanalV1_.
 * - Affiche trop collée au texte : le "gap" du conteneur flex n'est pas
 *   fiable dans tous les clients mail (Gmail le supprime souvent au
 *   sanitizing). Remplacé par une marge explicite (margin-right) sur
 *   l'affiche elle-même, qui survit au nettoyage des styles.
 * - Fond éclairci (crème plus clair et chaud, variante validée sur
 *   mockup) : extérieur #EDE7DC -> #F5EFE0, carte #F7F3EA -> #FFFBF2.
 * - Document HTML complet avec balises color-scheme "light only" pour
 *   empêcher Gmail d'appliquer son mode sombre automatique (qui
 *   inversait le fond clair en noir sans toucher aux couleurs de
 *   texte, cf. capture de Ben).
 *
 * Correctif V4.7.5 (04/09/2026) :
 * - Email "Dates CANAL+ modifiées" refondu en HTML, même habillage que
 *   le résumé quotidien (15_DIGEST_EMAIL.gs) : affiche, regroupement
 *   par urgence (dates avancées / statut modifié / dates reculées),
 *   10 fiches visibles par groupe puis repli CSS pour le reste. Voir
 *   construireHtmlModificationsCanalV1_ et fonctions associées.
 * - L'objet "modification" transporte désormais aussi année et affiche
 *   (auparavant seulement titre/dates/statuts), nécessaires à ce nouvel
 *   affichage.
 *
 * Correctif V4.7.4 :
 * - Un film introuvable dans le catalogue Canal+ (error="NO_MATCH" côté
 *   Worker, typiquement un film retiré que Ben garde volontairement dans
 *   sa bibliothèque) déclenchait le même statut ERREUR_CANAL qu'une vraie
 *   panne technique -- indiscernables l'un de l'autre. Nouveau statut
 *   dédié NON_TROUVE_CANAL (voir appliquerNonTrouveCanalV4_), jamais
 *   compté comme une erreur ni ne déclenche d'alerte.
 * - Nouvelle alerte mail (envoyerMailAlerteErreursCanalV4_) envoyée dès
 *   qu'un lot rencontre une vraie erreur technique, sans attendre la fin
 *   du parcours complet (qui peut prendre plusieurs jours) -- c'est
 *   justement ce délai qui avait permis à la panne Cloudflare de passer
 *   inaperçue pendant ~10 jours. Un seul mail par épisode de panne (pas
 *   un par cycle de 5 minutes), via le drapeau CONFIG
 *   CanalAlerteErreurEnvoyee, remis à zéro dès qu'un lot repasse propre.
 *
 * Nouveautés V4.1 :
 * - contrôle quotidien des fiches CANAL+ les moins récemment contrôlées ;
 * - aucune reprise systématique des mêmes premières lignes ;
 * - contrôle complet de toute la bibliothèque par lots ;
 * - reprise automatique du contrôle complet toutes les 5 minutes ;
 * - mail uniquement lorsqu'une date ou un statut utile change ;
 * - journalisation du lot, des lignes et de l'avancement.
 *
 * Nettoyage V4.6.2 :
 * - suppression des anciens tests expérimentaux Netflix, Prime et Disney ;
 * - ces plateformes sont désormais gérées par les scripts 11, 12 et 13 ;
 * - aucun changement fonctionnel sur le connecteur CANAL+.
 *
 * Correctif V4.7.1 :
 * - le déclencheur quotidien lance désormais un parcours complet de CANAL+ ;
 * - le parcours reste découpé en lots courts, espacés de 5 minutes ;
 * - un parcours interrompu est repris au lieu d'être ignoré ;
 * - aucune date existante n'est effacée par ce changement d'orchestration.
 *
 * Correctif V4.7.2 :
 * - le mail CANAL+ contient uniquement les changements réels de
 *   DateDisponibiliteAuto (Films, colonne AO) ;
 * - un simple changement de statut, notamment PLUS_DE_6_MOIS,
 *   ne déclenche plus ce mail ;
 * - aucun mail "Dates CANAL+ modifiées" n'est envoyé si AO
 *   n'a changé sur aucune fiche pendant le parcours complet.
 *
 * Correctif V4.7.3 :
 * - le sujet du mail "Dates CANAL+ modifiées" indique désormais
 *   "CinéMaison - V2 - ..." pour le distinguer sans ambiguïté des
 *   mails de l'ancienne V1 (AppSheet) ;
 * - aucun changement de logique de contrôle ou de filtrage.
 */


const CANAL_WORKER_BASE_V4 =
  "https://cinemaison-canal-proxy.benny-2e7.workers.dev";


const CANAL_CONTROLE_COMPLET_PROP_V4 =
  "CINEMAISON_CANAL_CONTROLE_COMPLET_V4";


const CANAL_CONTROLE_COMPLET_HANDLER_V4 =
  "continuerControleCompletCanalV4";




/**
 * Point d'entrée générique des connecteurs.
 */
function controleConnecteursPlateformes() {
  controleCanalDisponibilitesCloudflare();
}




/**
 * ============================================================
 * CONTRÔLE QUOTIDIEN COMPLET CANAL+
 * ============================================================
 *
 * Le déclencheur officiel quotidien appelle cette fonction.
 * Elle démarre un parcours complet, traité en plusieurs lots courts.
 * Si un parcours précédent est encore actif, il est repris et son
 * déclencheur temporaire est réinstallé par sécurité.
 */
function controleCanalDisponibilitesCloudflare() {
  try {
    const etatComplet = lireEtatControleCompletCanalV4_();
    let succes = false;


    if (etatComplet && etatComplet.actif) {
      journal_(
        "CONNECTEURS",
        "CANAL_QUOTIDIEN",
        "REPRISE",
        "Reprise du contrôle complet au prochain index " +
          Number(etatComplet.prochainIndex || 1)
      );
      installerDeclencheurControleCompletCanalV4_();
      succes =
        continuerControleCompletCanalV4() === true;
    } else {
      journal_(
        "CONNECTEURS",
        "CANAL_QUOTIDIEN",
        "DEMARRAGE",
        "Démarrage du contrôle quotidien complet"
      );
      succes =
        demarrerControleCompletCanalV4() === true;
    }


    if (succes) {
      resoudreErreur_(
        "CONNECTEURS",
        "CANAL_QUOTIDIEN"
      );


      resoudreErreur_(
        "MAILS",
        "controleCanalDisponibilitesCloudflare"
      );
    }


    return succes;


  } catch (e) {
    erreur_(
      "CONNECTEURS",
      "CANAL_QUOTIDIEN",
      String(e),
      e && e.stack ? e.stack : ""
    );


    envoyerMailErreurScript_(
      e,
      "controleCanalDisponibilitesCloudflare"
    );


    return false;
  }
}




/**
 * ============================================================
 * CONTRÔLE COMPLET CANAL+
 * ============================================================
 *
 * À lancer manuellement une seule fois :
 *   demarrerControleCompletCanalV4()
 *
 * Le contrôle se poursuit ensuite automatiquement par lots
 * toutes les 5 minutes jusqu'à la fin de la feuille Films.
 */
function demarrerControleCompletCanalV4() {
  const contexte = initialiserContexteCanalV41_();
  if (!contexte) return false;


  const etat = {
    actif: true,
    demarreLe: new Date().toISOString(),
    prochainIndex: 1,
    lots: 0,
    traites: 0,
    datesConnues: 0,
    plusDe6Mois: 0,
    aVerifier: 0,
    nonTrouves: 0,
    erreurs: 0,
    changements: 0,
    modifications: []
  };


  sauvegarderEtatControleCompletCanalV4_(etat);
  installerDeclencheurControleCompletCanalV4_();


  journal_(
    "CONNECTEURS",
    "CANAL_COMPLET",
    "DEMARRAGE",
    "Contrôle complet démarré | lignes=" + contexte.data.length
  );


  return continuerControleCompletCanalV4();
}




/**
 * Traite le lot suivant du contrôle complet.
 * Cette fonction est également appelée par le déclencheur temporaire.
 */
function continuerControleCompletCanalV4() {
  const lock = LockService.getScriptLock();


  if (!lock.tryLock(30000)) {
    journal_(
      "CONNECTEURS",
      "CANAL_COMPLET",
      "IGNORE",
      "Un autre contrôle CANAL+ est déjà en cours"
    );
    return false;
  }


  try {
    const etat = lireEtatControleCompletCanalV4_();


    if (!etat || !etat.actif) {
      supprimerDeclencheurControleCompletCanalV4_();
      return false;
    }


    const contexte = initialiserContexteCanalV41_();
    if (!contexte) return false;


    const max = getMaxCanalParCycleV41_(contexte.connecteur);
    const selection = selectionnerProchainLotCompletCanalV41_(
      contexte.data,
      contexte.h,
      Number(etat.prochainIndex || 1),
      max
    );


    if (selection.indices.length === 0) {
      return terminerControleCompletCanalV4_(etat);
    }


    const resultat = traiterIndicesCanalV41_(
      contexte.sheet,
      contexte.data,
      contexte.h,
      selection.indices,
      "COMPLET"
    );


    ecrireConfig_("CanalDernierLotNbFilms", resultat.stats.traites);


    etat.lots = Number(etat.lots || 0) + 1;
    etat.prochainIndex = selection.prochainIndex;
    etat.traites = Number(etat.traites || 0) + resultat.stats.traites;
    etat.datesConnues =
      Number(etat.datesConnues || 0) + resultat.stats.datesConnues;
    etat.plusDe6Mois =
      Number(etat.plusDe6Mois || 0) + resultat.stats.plusDe6Mois;
    etat.aVerifier =
      Number(etat.aVerifier || 0) + resultat.stats.aVerifier;
    etat.nonTrouves =
      Number(etat.nonTrouves || 0) + (resultat.stats.nonTrouves || 0);
    etat.erreurs =
      Number(etat.erreurs || 0) + resultat.stats.erreurs;
    etat.changements =
      Number(etat.changements || 0) + resultat.stats.changements;


    etat.modifications = fusionnerModificationsCanalV41_(
      etat.modifications || [],
      resultat.modifications
    );


    sauvegarderEtatControleCompletCanalV4_(etat);


    journal_(
      "CONNECTEURS",
      "CANAL_COMPLET_LOT",
      "TERMINE",
      "Lot=" + etat.lots +
      " | Traités lot=" + resultat.stats.traites +
      " | Traités total=" + etat.traites +
      " | Prochain index=" + etat.prochainIndex +
      " | Changements total=" + etat.changements
    );


    // Correctif V4.7.4 : alerte mail immédiate en cas de vraie panne
    // technique (Cloudflare/Worker), sans attendre la fin du parcours
    // complet qui peut prendre plusieurs jours -- c'est justement ce
    // délai qui avait permis à la panne de passer inaperçue longtemps.
    // Un seul mail est envoyé par "épisode" de panne (pas un par lot de
    // 5 minutes) : le drapeau CanalAlerteErreurEnvoyee, mémorisé dans
    // CONFIG, n'est reposé que lorsqu'un lot repasse à zéro erreur.
    if (resultat.stats.erreurs > 0) {
      const alerteDejaEnvoyee = String(
        lireConfig_("CanalAlerteErreurEnvoyee", "")
      );
      if (!alerteDejaEnvoyee) {
        envoyerMailAlerteErreursCanalV4_(resultat.stats.erreurs);
        ecrireConfig_(
          "CanalAlerteErreurEnvoyee",
          new Date().toISOString()
        );
      }
    } else if (String(lireConfig_("CanalAlerteErreurEnvoyee", ""))) {
      // Le lot est de nouveau propre : on repose le drapeau pour qu'une
      // future panne redéclenche bien une alerte fraîche.
      ecrireConfig_("CanalAlerteErreurEnvoyee", "");
    }


    if (selection.finAtteinte) {
      return terminerControleCompletCanalV4_(etat);
    }


    if (resultat.stats.erreurs === 0) {
      resoudreErreur_(
        "MAILS",
        "continuerControleCompletCanalV4"
      );
      return true;
    }


    return false;


  } catch (e) {
    erreur_(
      "CONNECTEURS",
      "CANAL_COMPLET",
      String(e),
      e && e.stack ? e.stack : ""
    );


    envoyerMailErreurScript_(
      e,
      "continuerControleCompletCanalV4"
    );


    return false;


  } finally {
    lock.releaseLock();
  }
}




/**
 * Arrêt manuel du contrôle complet.
 */
function arreterControleCompletCanalV4() {
  const etat = lireEtatControleCompletCanalV4_() || {};
  etat.actif = false;
  etat.arreteLe = new Date().toISOString();


  sauvegarderEtatControleCompletCanalV4_(etat);
  supprimerDeclencheurControleCompletCanalV4_();


  journal_(
    "CONNECTEURS",
    "CANAL_COMPLET",
    "ARRETE",
    "Contrôle complet arrêté manuellement"
  );
}




/**
 * Affiche l'état du contrôle complet dans les journaux.
 */
function afficherEtatControleCompletCanalV4() {
  const etat = lireEtatControleCompletCanalV4_();
  Logger.log(JSON.stringify(etat || {}, null, 2));
  return etat;
}




/**
 * Finalise le contrôle complet et envoie une synthèse unique
 * des modifications détectées pendant tous les lots.
 */
function terminerControleCompletCanalV4_(etat) {
  etat.actif = false;
  etat.termineLe = new Date().toISOString();


  const modifications = filtrerModificationsDatesCanalV472_(
    etat.modifications
  );


  // Nettoie aussi un éventuel état persistant créé par une version
  // antérieure pendant un parcours interrompu.
  etat.modifications = modifications;
  etat.changements = modifications.length;


  sauvegarderEtatControleCompletCanalV4_(etat);
  supprimerDeclencheurControleCompletCanalV4_();


  ecrireConfig_("CanalDernierControleComplet", new Date());
  ecrireConfig_("CanalDernierControleCompletNbFilms", etat.traites || 0);
  ecrireConfig_("CanalDernierControleQuotidien", new Date());


  journal_(
    "CONNECTEURS",
    "CANAL_COMPLET",
    "TERMINE",
    "Lots=" + (etat.lots || 0) +
    " | Traités=" + (etat.traites || 0) +
    " | Dates=" + (etat.datesConnues || 0) +
    " | Plus6Mois=" + (etat.plusDe6Mois || 0) +
    " | AVerifier=" + (etat.aVerifier || 0) +
    " | NonTrouves=" + (etat.nonTrouves || 0) +
    " | Erreurs=" + (etat.erreurs || 0) +
    " | Changements=" + (etat.changements || 0)
  );


  if (modifications.length > 0) {
    envoyerMailModificationsCanalV4_(modifications);
  } else {
    journal_(
      "MAILS",
      "CANAL_MODIFICATIONS",
      "IGNORE",
      "Aucune modification réelle de DateDisponibiliteAuto (AO)"
    );
  }


  // Une action globale CANAL_COMPLET n'est close qu'après le
  // parcours intégral et seulement si aucune fiche n'a échoué.
  if (Number(etat.erreurs || 0) === 0) {
    resoudreErreur_(
      "CONNECTEURS",
      "CANAL_COMPLET"
    );


    resoudreErreur_(
      "MAILS",
      "continuerControleCompletCanalV4"
    );


    return true;
  }


  return false;
}




/**
 * ============================================================
 * INITIALISATION / SÉLECTION DES LOTS
 * ============================================================
 */
function initialiserContexteCanalV41_() {
  const connecteur = getConnecteur("CANAL");


  if (!connecteurActif_("CANAL")) {
    journal_(
      "CONNECTEURS",
      "CANAL",
      "IGNORE",
      "Connecteur CANAL désactivé ou mode OFF"
    );
    return null;
  }


  const sheet = getSheet_(SHEETS.FILMS);


  if (!sheet) {
    erreur_(
      "CONNECTEURS",
      "CANAL",
      "Feuille Films introuvable",
      ""
    );
    return null;
  }


  resoudreErreur_(
    "CONNECTEURS",
    "CANAL",
    "Feuille Films introuvable"
  );


  const data = sheet.getDataRange().getValues();


  if (data.length < 2) {
    journal_(
      "CONNECTEURS",
      "CANAL",
      "IGNORE",
      "Aucune fiche à contrôler"
    );
    return null;
  }


  return {
    connecteur: connecteur,
    sheet: sheet,
    data: data,
    h: headers_(data[0])
  };
}




function getMaxCanalParCycleV41_(connecteur) {
  const valeurConnecteur = Number(
    connecteur && connecteur.nbFilmsTestes
      ? connecteur.nbFilmsTestes
      : 0
  );


  const valeurRegle = getRegleNumber(
    "MaxConnecteursParCycle",
    100
  );


  const max = valeurConnecteur > 0
    ? valeurConnecteur
    : valeurRegle;


  return Math.max(1, Math.floor(max || 100));
}




/**
 * Sélection quotidienne : fiches jamais contrôlées puis plus anciennes.
 */
function selectionnerLignesCanalQuotidiennesV41_(data, h, max) {
  const candidats = [];


  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const plateforme = normalizePlatform_(get_(row, h, "Plateforme"));
    const titre = cleanTitle_(get_(row, h, "Titre"));


    if (plateforme !== "CANAL+" || !titre) continue;


    const dernierControle = get_(row, h, "DernierControleDisponibilite");


    candidats.push({
      index: i,
      anciennete: dateVersTimestampCanalV41_(dernierControle)
    });
  }


  candidats.sort(function(a, b) {
    if (a.anciennete !== b.anciennete) {
      return a.anciennete - b.anciennete;
    }
    return a.index - b.index;
  });


  return candidats
    .slice(0, max)
    .map(function(c) { return c.index; });
}




/**
 * Sélection séquentielle du prochain lot d'un contrôle complet.
 */
function selectionnerProchainLotCompletCanalV41_(
  data,
  h,
  indexDepart,
  max
) {
  const indices = [];
  let i = Math.max(1, Number(indexDepart || 1));


  for (; i < data.length; i++) {
    const row = data[i];
    const plateforme = normalizePlatform_(get_(row, h, "Plateforme"));
    const titre = cleanTitle_(get_(row, h, "Titre"));


    if (plateforme !== "CANAL+" || !titre) continue;


    indices.push(i);


    if (indices.length >= max) {
      i++;
      break;
    }
  }


  return {
    indices: indices,
    prochainIndex: i,
    finAtteinte: i >= data.length
  };
}




function dateVersTimestampCanalV41_(valeur) {
  if (!valeur) return 0;


  if (Object.prototype.toString.call(valeur) === "[object Date]") {
    return valeur.getTime();
  }


  const date = new Date(valeur);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}




/**
 * ============================================================
 * TRAITEMENT D'UN LOT
 * ============================================================
 */
function traiterIndicesCanalV41_(sheet, data, h, indices, mode) {
  const stats = creerStatsCanalV41_();
  const modifications = [];


  indices.forEach(function(index) {
    const rowNumber = index + 1;
    const row = data[index];
    const titre = cleanTitle_(get_(row, h, "Titre"));


    try {
      const result = controleCanalLigneV4_(
        sheet,
        rowNumber,
        row,
        h
      );


      stats.traites++;


      if (result.statut === "DATE_CONNUE") {
        stats.datesConnues++;
      } else if (result.statut === "PLUS_DE_6_MOIS") {
        stats.plusDe6Mois++;
      } else if (result.statut === "A_VERIFIER_CANAL") {
        stats.aVerifier++;
      } else if (result.statut === "NON_TROUVE_CANAL") {
        // Correctif V4.7.4 : compté séparément, jamais dans stats.erreurs
        // -- voir appliquerNonTrouveCanalV4_.
        stats.nonTrouves++;
      } else if (result.statut === "ERREUR_CANAL") {
        stats.erreurs++;
      }


      if (result.changement && result.modification) {
        stats.changements++;
        modifications.push(result.modification);
      }


      if (result.statut !== "ERREUR_CANAL") {
        resoudreErreur_(
          "CONNECTEURS",
          "CANAL_" + mode,
          "Erreur ligne " + rowNumber + " | " + titre
        );
      }


      Utilities.sleep(500);


    } catch (e) {
      stats.traites++;
      stats.erreurs++;


      appliquerErreurCanalV4_(
        sheet,
        rowNumber,
        h,
        String(e)
      );


      erreur_(
        "CONNECTEURS",
        "CANAL_" + mode,
        "Erreur ligne " + rowNumber + " | " + titre,
        String(e)
      );
    }
  });


  return {
    stats: stats,
    modifications: modifications
  };
}




function creerStatsCanalV41_() {
  return {
    traites: 0,
    datesConnues: 0,
    plusDe6Mois: 0,
    aVerifier: 0,
    nonTrouves: 0,
    erreurs: 0,
    changements: 0
  };
}




function journaliserResumeCanalV41_(action, stats, indices) {
  const premiereLigne = indices.length > 0 ? indices[0] + 1 : "-";
  const derniereLigne = indices.length > 0
    ? indices[indices.length - 1] + 1
    : "-";


  const details =
    "Traités=" + stats.traites +
    " | Dates=" + stats.datesConnues +
    " | Plus6Mois=" + stats.plusDe6Mois +
    " | AVerifier=" + stats.aVerifier +
    " | NonTrouves=" + (stats.nonTrouves || 0) +
    " | Erreurs=" + stats.erreurs +
    " | Changements=" + stats.changements +
    " | Première ligne=" + premiereLigne +
    " | Dernière ligne=" + derniereLigne;


  journal_("CONNECTEURS", action, "TERMINE", details);


  Logger.log("===== " + action + " V4.1 =====");
  Logger.log(details);
}




/**
 * ============================================================
 * CONTRÔLE D'UNE FICHE CANAL+
 * ============================================================
 */
function controleCanalLigneV4_(sheet, rowNumber, row, h) {
  const titre = cleanTitle_(get_(row, h, "Titre"));
  const annee = get_(row, h, "Annee");
  const ancienCanalId = get_(row, h, "CanalContentId");


  const ancienneDate = get_(row, h, "DateDisponibiliteAuto");
  const ancienStatutAuto = get_(row, h, "StatutDisponibiliteAuto");


  const api = canalEnrichCloudflareV4_(
    titre,
    annee,
    ancienCanalId
  );


  if (!api || !api.ok || !api.result) {
    // Correctif V4.7.4 : un film qui n'existe plus du tout dans le
    // catalogue Canal+ (retiré) fait échouer la recherche côté Worker
    // avec error="NO_MATCH" -- ce n'est PAS une panne technique, c'est un
    // résultat normal et attendu pour une fiche qu'on garde volontairement
    // dans sa bibliothèque après son retrait de Canal+. Avant ce correctif,
    // ce cas était indiscernable d'une vraie panne Cloudflare (401, JSON
    // invalide, etc.), ce qui aurait déclenché une fausse alerte.
    if (api && api.error === "NO_MATCH") {
      appliquerNonTrouveCanalV4_(sheet, rowNumber, h);

      Logger.log(
        "NON_TROUVE_CANAL | ligne " + rowNumber + " | " + titre +
        " | probablement retiré du catalogue Canal+"
      );

      return {
        statut: "NON_TROUVE_CANAL",
        changement: false
      };
    }

    appliquerErreurCanalV4_(
      sheet,
      rowNumber,
      h,
      "Réponse Cloudflare invalide" +
      (api && api.error ? " (" + api.error + ")" : "")
    );


    return {
      statut: "ERREUR_CANAL",
      changement: false
    };
  }


  const match = api.match || {};
  const res = api.result || {};


  const canalId =
    res.contentId ||
    match.contentId ||
    ancienCanalId ||
    "";


  const nouvelleDate = res.dateDisponibilite || "";
  const statutRetour = res.statutDisponibilite || "INCONNUE";
  const texteOriginal = res.texteDisponibiliteOriginal || "";
  const commentaireApi = res.commentaireDisponibilite || "";


  setProtected_(
    sheet,
    rowNumber,
    h,
    "SourceDisponibiliteAuto",
    "CANAL+ PUBLIC",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "DernierControleDisponibilite",
    new Date(),
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "PlateformesDetectees",
    "CANAL+",
    { force: true }
  );


  if (canalId) {
    setProtected_(
      sheet,
      rowNumber,
      h,
      "CanalContentId",
      canalId,
      { force: false }
    );
  }


  if (statutRetour === "DATE_CONNUE" && nouvelleDate) {
    const dateObjet = ymdToDate_(nouvelleDate);


    setProtected_(
      sheet,
      rowNumber,
      h,
      "DateDisponibiliteAuto",
      dateObjet,
      { force: true }
    );


    setProtected_(
      sheet,
      rowNumber,
      h,
      "StatutDisponibiliteAuto",
      "DATE_CONNUE",
      { force: true }
    );


    setProtected_(
      sheet,
      rowNumber,
      h,
      "StatutDisponibilite",
      "DATE_CONNUE",
      { force: true }
    );


    const commentaire =
      "CANAL+ OK : " +
      nouvelleDate +
      (texteOriginal ? " / " + texteOriginal : "") +
      (commentaireApi ? " / " + commentaireApi : "");


    setProtected_(
      sheet,
      rowNumber,
      h,
      "CommentaireDisponibilite",
      commentaire,
      { force: true }
    );


    const changementDate = !sameDate_(ancienneDate, nouvelleDate);


    if (changementDate) {
      setProtected_(
        sheet,
        rowNumber,
        h,
        "DernierChangementDisponibilite",
        new Date(),
        { force: true }
      );
    }


    Logger.log(
      "OK_DATE | ligne " +
      rowNumber +
      " | " +
      titre +
      " | " +
      nouvelleDate +
      " | " +
      (texteOriginal || commentaireApi)
    );


    return {
      statut: "DATE_CONNUE",
      changement: changementDate,
      modification: {
        typeModification: "DATE_AO",
        dateModifiee: changementDate,
        ligne: rowNumber,
        filmId: get_(row, h, "FilmID") || "",
        titre: titre,
        annee: annee || "",
        affiche: get_(row, h, "Affiche") || "",
        ancienneDate: normaliserDate_(ancienneDate || ""),
        nouvelleDate: nouvelleDate,
        ancienStatut: ancienStatutAuto || "",
        nouveauStatut: "DATE_CONNUE"
      }
    };
  }


  if (statutRetour === "PLUS_DE_6_MOIS") {
    setProtected_(
      sheet,
      rowNumber,
      h,
      "StatutDisponibiliteAuto",
      "PLUS_DE_6_MOIS",
      { force: true }
    );


    setProtected_(
      sheet,
      rowNumber,
      h,
      "StatutDisponibilite",
      "PLUS_DE_6_MOIS",
      { force: true }
    );


    setProtected_(
      sheet,
      rowNumber,
      h,
      "CommentaireDisponibilite",
      "CANAL+ OK : disponible plus de 6 mois" +
      (texteOriginal ? " / " + texteOriginal : ""),
      { force: true }
    );


    const changementStatut = ancienStatutAuto !== "PLUS_DE_6_MOIS";


    if (changementStatut) {
      setProtected_(
        sheet,
        rowNumber,
        h,
        "DernierChangementDisponibilite",
        new Date(),
        { force: true }
      );
    }


    Logger.log(
      "OK_PLUS_6_MOIS | ligne " +
      rowNumber +
      " | " +
      titre +
      " | " +
      texteOriginal
    );


    return {
      statut: "PLUS_DE_6_MOIS",
      // Le statut est bien actualisé, mais DateDisponibiliteAuto (AO)
      // reste intacte : ce cas ne doit donc pas alimenter le mail.
      changement: false,
      changementStatut: changementStatut
    };
  }


  setProtected_(
    sheet,
    rowNumber,
    h,
    "StatutDisponibiliteAuto",
    "A_VERIFIER_CANAL",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "CommentaireDisponibilite",
    "CANAL+ A VERIFIER : aucune date extraite" +
    (texteOriginal ? " / Texte : " + texteOriginal : "") +
    (commentaireApi ? " / " + commentaireApi : ""),
    { force: true }
  );


  Logger.log(
    "A_VERIFIER_CANAL | ligne " +
    rowNumber +
    " | " +
    titre +
    " | année=" +
    annee +
    " | canalId=" +
    canalId +
    " | statutRetour=" +
    statutRetour +
    " | texte=" +
    texteOriginal
  );


  return {
    statut: "A_VERIFIER_CANAL",
    changement: false
  };
}




/**
 * ============================================================
 * APPEL WORKER CANAL+
 * ============================================================
 */
function canalEnrichCloudflareV4_(titre, annee, canalContentId) {
  const params = [];


  if (titre) {
    params.push("title=" + encodeURIComponent(titre));
  }


  if (annee) {
    params.push("year=" + encodeURIComponent(annee));
  }


  if (canalContentId) {
    params.push(
      "contentId=" + encodeURIComponent(canalContentId)
    );
  }


  const workerBase = String(
    lireConfig_("CanalWorkerUrl", CANAL_WORKER_BASE_V4)
  ).replace(/\/+$/, "");


  const url = workerBase + "/canal/enrich?" + params.join("&");


  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true
  });


  const code = response.getResponseCode();
  const body = response.getContentText();


  if (code !== 200) {
    return {
      ok: false,
      error: "HTTP_" + code,
      body: body
    };
  }


  try {
    return JSON.parse(body);
  } catch (e) {
    return {
      ok: false,
      error: "JSON_INVALIDE",
      body: body
    };
  }
}




/**
 * Correctif V4.7.4 : cas distinct de appliquerErreurCanalV4_ -- un film
 * introuvable dans le catalogue Canal+ (probablement retiré) n'est pas
 * une erreur technique, donc pas de mail d'alerte, pas de comptage dans
 * les statistiques d'erreurs.
 */
function appliquerNonTrouveCanalV4_(sheet, rowNumber, h) {
  setProtected_(
    sheet,
    rowNumber,
    h,
    "SourceDisponibiliteAuto",
    "CANAL+ PUBLIC",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "DernierControleDisponibilite",
    new Date(),
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "StatutDisponibiliteAuto",
    "NON_TROUVE_CANAL",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "CommentaireDisponibilite",
    "CANAL+ : film introuvable dans le catalogue (probablement retiré de Canal+)",
    { force: true }
  );
}




function appliquerErreurCanalV4_(sheet, rowNumber, h, message) {
  setProtected_(
    sheet,
    rowNumber,
    h,
    "SourceDisponibiliteAuto",
    "CANAL+ PUBLIC",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "DernierControleDisponibilite",
    new Date(),
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "StatutDisponibiliteAuto",
    "ERREUR_CANAL",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "PlateformesDetectees",
    "CANAL+",
    { force: true }
  );


  setProtected_(
    sheet,
    rowNumber,
    h,
    "CommentaireDisponibilite",
    "CANAL+ ERREUR : " + message,
    { force: true }
  );
}




/**
 * ============================================================
 * ALERTE ERREURS TECHNIQUES (V4.7.4)
 * ============================================================
 * Distinct de envoyerMailModificationsCanalV4_ (qui annonce de vraies
 * dates trouvées) : celle-ci prévient d'une panne technique probable
 * côté Worker Cloudflare (mauvaise clé, endpoint changé, etc.) --
 * exactement le genre de panne silencieuse qui avait cassé le suivi
 * Canal+ sans que personne ne le sache. Ne concerne jamais les films
 * simplement retirés du catalogue Canal+ (voir NON_TROUVE_CANAL,
 * appliquerNonTrouveCanalV4_), qui ne sont pas une erreur.
 */
function envoyerMailAlerteErreursCanalV4_(nombreErreurs) {
  const email = emailRapport_();

  const corps =
    "CinéMaison - Alerte technique CANAL+\n\n" +
    "Le contrôle des disponibilités Canal+ rencontre des erreurs " +
    "techniques (" + nombreErreurs + " sur le dernier lot traité).\n\n" +
    "Cause probable : le Worker Cloudflare (cinemaison-canal-proxy) " +
    "renvoie une réponse invalide -- par exemple une clé de session " +
    "expirée, comme cela s'est déjà produit. Vérifie le Worker " +
    "(F12 > Réseau sur une fiche Canal+ en cours de lecture, comparer " +
    "avec la clé configurée dans worker.js) avant que ça ne dure.\n\n" +
    "Ce mail ne sera renvoyé qu'une fois la panne résolue puis " +
    "reproduite -- pas à chaque cycle de 5 minutes tant qu'elle dure.";

  MailApp.sendEmail({
    to: email,
    subject: "CinéMaison - V2 - ALERTE Cloudflare CANAL+",
    body: corps
  });

  journal_(
    "MAILS",
    "CANAL_ALERTE_ERREUR",
    "OK",
    "Alerte technique envoyée | erreurs=" + nombreErreurs
  );
}




/**
 * ============================================================
 * MAILS DE MODIFICATIONS
 * ============================================================
 */
/**
 * ============================================================
 * MAILS DE MODIFICATIONS
 * ============================================================
 *
 * Refonte V4.7.4 (04/09/2026) : email HTML repensé pour reprendre le
 * même habillage que le résumé quotidien (15_DIGEST_EMAIL.gs) —
 * jusque-là un simple texte brut. Trois groupes, dans l'ordre
 * d'urgence décroissante :
 *   1. Dates AVANCÉES  — le film part plus tôt que prévu (le plus
 *      urgent, à regarder en premier).
 *   2. Statut modifié  — un film bascule vers/depuis DATE_CONNUE
 *      (ex. sortait d'A_VERIFIER_CANAL ou de PLUS_DE_6_MOIS).
 *   3. Dates RECULÉES  — le film reste plus longtemps que prévu
 *      (bonne nouvelle, moins urgent).
 * Chaque groupe affiche ses 10 premières fiches directement ; le
 * reste est replié derrière une astuce CSS pur (case à cocher
 * invisible + label cliquable), sans JavaScript — les emails ne
 * l'exécutent jamais. Ce mécanisme fonctionne dans Gmail (web et
 * appli) mais son support n'est pas garanti à 100% dans tous les
 * clients mail ; en cas de souci d'affichage, un simple lien "voir
 * dans l'app" en repli serait la prochaine étape.
 */
function envoyerMailModificationsCanalV4_(modifications) {
  const changementsDates = filtrerModificationsDatesCanalV472_(
    modifications
  );


  if (changementsDates.length === 0) {
    journal_(
      "MAILS",
      "CANAL_MODIFICATIONS",
      "IGNORE",
      "Aucune modification réelle de DateDisponibiliteAuto (AO)"
    );
    return;
  }


  const email = emailRapport_();

  const avancees = [];
  const reculees = [];
  const statutModifie = [];

  changementsDates.forEach(function(m) {
    if ((m.ancienStatut || "") !== (m.nouveauStatut || "")) {
      statutModifie.push(m);
      return;
    }
    const ancienne = String(m.ancienneDate || "");
    const nouvelle = String(m.nouvelleDate || "");
    if (!ancienne || !nouvelle || ancienne === nouvelle) {
      return;
    }
    if (nouvelle < ancienne) {
      avancees.push(m);
    } else {
      reculees.push(m);
    }
  });

  const html = construireHtmlModificationsCanalV1_(
    avancees,
    statutModifie,
    reculees,
    changementsDates.length
  );

  MailApp.sendEmail({
    to: email,
    subject:
      "CinéMaison - V2 - " +
      changementsDates.length +
      " date(s) CANAL+ modifiée(s)",
    htmlBody: html
  });


  journal_(
    "MAILS",
    "CANAL_MODIFICATIONS",
    "OK",
    "Dates AO modifiées envoyées : " + changementsDates.length
  );
}


/**
 * Construit le corps HTML de l'email, même habillage que le résumé
 * quotidien (fond crème, logo CINÉMAISON, séries de fiches avec
 * affiche). Couleurs en valeurs hexadécimales littérales (les emails
 * ne supportent pas les variables CSS).
 *
 * V4.7.6 : fond éclairci (variante B validée par Ben sur mockup) et
 * document HTML complet avec balises color-scheme / supported-color-
 * schemes en "light only" -- sans ça, Gmail applique son mode sombre
 * automatique et réinverse le fond clair en fond quasi noir tout en
 * gardant les couleurs de texte d'origine (résultat illisible).
 */
function construireHtmlModificationsCanalV1_(
  avancees,
  statutModifie,
  reculees,
  total
) {
  let html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;' +
    'max-width:480px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">' +
    'CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;' +
    'margin-top:4px;font-family:Arial,sans-serif">' +
    'MODIFICATIONS CANAL+ &middot; ' +
    total +
    ' CHANGEMENT(S)</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>';

  html += construireGroupeModificationsCanalV1_(
    "DATES AVANCÉES (partent plus tôt)",
    avancees,
    "date",
    "#B5622B"
  );
  html += construireGroupeModificationsCanalV1_(
    "STATUT MODIFIÉ",
    statutModifie,
    "statut",
    "#B5622B"
  );
  html += construireGroupeModificationsCanalV1_(
    "DATES RECULÉES (partent plus tard)",
    reculees,
    "date",
    "#6E8B4F"
  );

  html += "</div></div></body></html>";
  return html;
}


/**
 * Un groupe (avancées / statut / reculées) : 10 fiches visibles
 * directement, le reste replié derrière une case à cocher invisible +
 * label cliquable (astuce CSS pur, aucun JavaScript).
 */
function construireGroupeModificationsCanalV1_(
  titreGroupe,
  liste,
  type,
  couleurAccent
) {
  if (!liste || liste.length === 0) {
    return "";
  }

  let html =
    '<div style="font-size:10px;letter-spacing:1px;color:#9A9182;' +
    'font-family:Arial,sans-serif;margin:16px 0 10px">' +
    titreGroupe +
    "</div>";

  const visibles = liste.slice(0, 10);
  const masquees = liste.slice(10);

  visibles.forEach(function(m) {
    html += construireFicheModificationCanalV1_(m, type, couleurAccent);
  });

  if (masquees.length > 0) {
    const idCase =
      "cm_" +
      titreGroupe.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    html +=
      '<input type="checkbox" id="' +
      idCase +
      '" style="display:none">' +
      '<div style="display:none">' +
      '<style>#' +
      idCase +
      ":checked ~ ." +
      idCase +
      "_reste{display:block !important}#" +
      idCase +
      ":checked ~ ." +
      idCase +
      "_lien{display:none !important}</style></div>" +
      '<label for="' +
      idCase +
      '" class="' +
      idCase +
      '_lien" style="display:block;text-align:center;font-size:12px;' +
      "color:#B5622B;font-family:Arial,sans-serif;margin-top:8px;" +
      'cursor:pointer">+ ' +
      masquees.length +
      " autre(s) &darr;</label>" +
      '<div class="' +
      idCase +
      '_reste" style="display:none">';

    masquees.forEach(function(m) {
      html += construireFicheModificationCanalV1_(m, type, couleurAccent);
    });

    html += "</div>";
  }

  return html;
}


/**
 * Une fiche individuelle (affiche + titre + année + le changement en
 * lui-même). type "date" affiche l'ancienne et la nouvelle date ;
 * type "statut" affiche l'ancien et le nouveau statut, PLUS la date
 * (ancienne → nouvelle) si elle a changé en même temps — c'est
 * typiquement le cas quand un film bascule vers DATE_CONNUE : le
 * statut seul ("vide → DATE_CONNUE") ne dit pas quelle est cette date.
 */
function construireFicheModificationCanalV1_(m, type, couleurAccent) {
  const titre = escaperHtmlDigestV1_(m.titre || "Titre inconnu");
  const annee = m.annee ? " (" + m.annee + ")" : "";
  const affiche = m.affiche || "";

  const ancienneDate = escaperHtmlDigestV1_(m.ancienneDate || "");
  const nouvelleDate = escaperHtmlDigestV1_(m.nouvelleDate || "");

  const ligneStatut =
    escaperHtmlDigestV1_(m.ancienStatut || "vide") +
    ' &rarr; <span style="color:' +
    couleurAccent +
    ';font-weight:bold">' +
    escaperHtmlDigestV1_(m.nouveauStatut || "vide") +
    "</span>";

  const ligneDate =
    (ancienneDate || "vide") +
    ' &rarr; <span style="color:' +
    couleurAccent +
    ';font-weight:bold">' +
    (nouvelleDate || "vide") +
    "</span>";

  let ligneDetail;
  if (type === "statut") {
    ligneDetail = ligneStatut;
    if (nouvelleDate && nouvelleDate !== ancienneDate) {
      ligneDetail +=
        '<div style="margin-top:3px">' + ligneDate + "</div>";
    }
  } else {
    ligneDetail = ligneDate;
  }

  const imageHtml = affiche
    ? '<img src="' +
      affiche +
      '" width="40" height="60" style="border-radius:3px;' +
      'object-fit:cover;flex-shrink:0;margin-right:12px" alt="">'
    : '<div style="width:40px;height:60px;border-radius:3px;' +
      'background:#E3D9C4;flex-shrink:0;margin-right:12px"></div>';

  return (
    '<div style="display:flex;align-items:center;padding:8px 0;' +
    'border-bottom:1px solid #EFE7D6">' +
    imageHtml +
    '<div style="min-width:0">' +
    '<div style="font-size:14px;color:#3A2E22;font-weight:bold">' +
    titre +
    '<span style="font-weight:normal;color:#9A9182">' +
    annee +
    "</span></div>" +
    '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;' +
    'margin-top:2px">' +
    ligneDetail +
    "</div></div></div>"
  );
}




/**
 * ============================================================
 * ÉTAT PERSISTANT DU CONTRÔLE COMPLET
 * ============================================================
 */
function lireEtatControleCompletCanalV4_() {
  const texte = PropertiesService
    .getScriptProperties()
    .getProperty(CANAL_CONTROLE_COMPLET_PROP_V4);


  if (!texte) return null;


  try {
    return JSON.parse(texte);
  } catch (e) {
    return null;
  }
}




function sauvegarderEtatControleCompletCanalV4_(etat) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      CANAL_CONTROLE_COMPLET_PROP_V4,
      JSON.stringify(etat || {})
    );
}




function fusionnerModificationsCanalV41_(existantes, nouvelles) {
  const resultat = filtrerModificationsDatesCanalV472_(existantes);


  filtrerModificationsDatesCanalV472_(nouvelles).forEach(function(modification) {
    const cle =
      String(modification.ligne || "") + "|" +
      String(modification.filmId || "") + "|" +
      String(modification.titre || "") + "|" +
      String(modification.nouvelleDate || "") + "|" +
      String(modification.nouveauStatut || "");


    const dejaPresente = resultat.some(function(m) {
      return (
        String(m.ligne || "") + "|" +
        String(m.filmId || "") + "|" +
        String(m.titre || "") + "|" +
        String(m.nouvelleDate || "") + "|" +
        String(m.nouveauStatut || "")
      ) === cle;
    });


    if (!dejaPresente) {
      resultat.push(modification);
    }
  });


  return resultat;
}




/**
 * ============================================================
 * DÉCLENCHEURS
 * ============================================================
 */
function installerDeclencheurCanalQuotidien() {
  supprimerDeclencheurCanalV4_(
    "controleCanalDisponibilitesCloudflare"
  );


  ScriptApp
    .newTrigger("controleCanalDisponibilitesCloudflare")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();


  journal_(
    "DECLENCHEURS",
    "CANAL",
    "OK",
    "Déclencheur quotidien CANAL+ installé vers 6 h"
  );
}




function installerDeclencheurControleCompletCanalV4_() {
  supprimerDeclencheurControleCompletCanalV4_();


  ScriptApp
    .newTrigger(CANAL_CONTROLE_COMPLET_HANDLER_V4)
    .timeBased()
    .everyMinutes(5)
    .create();
}




function supprimerDeclencheurControleCompletCanalV4_() {
  supprimerDeclencheurCanalV4_(
    CANAL_CONTROLE_COMPLET_HANDLER_V4
  );
}




function supprimerDeclencheurCanalV4_(nomFonction) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === nomFonction) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}




/**
 * ============================================================
 * TESTS
 * ============================================================
 */
function testCanalEnrichCloudflare() {
  const result = canalEnrichCloudflareV4_(
    "Fury",
    "2014",
    "4778458_50035"
  );


  Logger.log(JSON.stringify(result, null, 2));
}




/**
 * Simulation sans écriture et sans appel API.
 * Vérifie le nombre de fiches et de lots du parcours quotidien complet.
 */
function testerPlanControleQuotidienCanalV471() {
  const contexte = initialiserContexteCanalV41_();
  if (!contexte) return null;


  const max = getMaxCanalParCycleV41_(contexte.connecteur);
  const indices = selectionnerLignesCanalQuotidiennesV41_(
    contexte.data,
    contexte.h,
    Number.MAX_SAFE_INTEGER
  );


  const resultat = {
    ok: true,
    test: "PLAN_CONTROLE_QUOTIDIEN_CANAL_V4_7_1",
    fichesCanal: indices.length,
    tailleLot: max,
    lotsNecessaires: Math.ceil(indices.length / max),
    dureeEstimeeMinutes: Math.max(
      0,
      (Math.ceil(indices.length / max) - 1) * 5
    ),
    aucuneEcriture: true,
    aucunAppelApi: true
  };


  Logger.log("===== PLAN CONTROLE QUOTIDIEN CANAL+ V4.7.1 =====");
  Logger.log(JSON.stringify(resultat, null, 2));
  Logger.log("AUCUNE ECRITURE EFFECTUEE");
  Logger.log("AUCUN APPEL API EFFECTUE");


  return resultat;
}




/**
 * Ne conserve que les changements explicitement produits après une
 * écriture réelle d'une nouvelle DateDisponibiliteAuto dans Films!AO.
 *
 * Le contrôle strict des deux marqueurs exclut volontairement les
 * anciens objets de statut mémorisés par V4.7.1.
 */
function filtrerModificationsDatesCanalV472_(modifications) {
  if (!Array.isArray(modifications)) return [];


  return modifications.filter(function(modification) {
    return !!(
      modification &&
      modification.typeModification === "DATE_AO" &&
      modification.dateModifiee === true
    );
  });
}




/**
 * Test V4.7.2 sans feuille, sans API, sans écriture et sans mail.
 * Vérifie qu'un changement de date AO est retenu et que les simples
 * changements de statut sont exclus.
 */
function testerFiltrageMailCanalV472() {
  const cas = [
    {
      typeModification: "DATE_AO",
      dateModifiee: true,
      titre: "Film date changée",
      ancienneDate: "2026-08-01",
      nouvelleDate: "2026-08-15",
      ancienStatut: "DATE_CONNUE",
      nouveauStatut: "DATE_CONNUE"
    },
    {
      titre: "Film passé à plus de 6 mois",
      ancienneDate: "2026-09-01",
      nouvelleDate: "",
      ancienStatut: "DATE_CONNUE",
      nouveauStatut: "PLUS_DE_6_MOIS"
    },
    {
      typeModification: "STATUT",
      dateModifiee: false,
      titre: "Film à vérifier",
      ancienneDate: "2026-10-01",
      nouvelleDate: "2026-10-01",
      ancienStatut: "DATE_CONNUE",
      nouveauStatut: "A_VERIFIER_CANAL"
    }
  ];


  const retenues = filtrerModificationsDatesCanalV472_(cas);
  const retenuesSansDate = filtrerModificationsDatesCanalV472_(
    cas.slice(1)
  );
  const resultat = {
    ok: retenues.length === 1 &&
      retenues[0].titre === "Film date changée" &&
      retenuesSansDate.length === 0,
    casSimules: cas.length,
    changementsDateAoRetenus: retenues.length,
    changementsStatutExclus: cas.length - retenues.length,
    mailSeraitEnvoye: retenues.length > 0,
    mailSeraitEnvoyeSansChangementDate:
      retenuesSansDate.length > 0,
    aucunAppelApi: true,
    aucuneEcritureFilms: true,
    aucunMailEnvoye: true
  };


  Logger.log("===== TEST FILTRAGE MAIL CANAL+ V4.7.2 =====");
  Logger.log(JSON.stringify(resultat, null, 2));
  Logger.log("AUCUN APPEL API EFFECTUE");
  Logger.log("AUCUNE ECRITURE FILMS EFFECTUEE");
  Logger.log("AUCUN MAIL ENVOYE");
  Logger.log("===== FIN TEST FILTRAGE MAIL CANAL+ =====");


  if (!resultat.ok) {
    throw new Error("Échec du filtrage mail CANAL+ V4.7.2");
  }


  return resultat;
}




function testControleCanalUneFicheV4() {
  const sheet = getSheet_(SHEETS.FILMS);
  const data = sheet.getDataRange().getValues();
  const h = headers_(data[0]);


  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const titre = cleanTitle_(get_(row, h, "Titre"));


    if (titre === "Fury") {
      const result = controleCanalLigneV4_(
        sheet,
        i + 1,
        row,
        h
      );
     
      Logger.log(JSON.stringify(result, null, 2));
      return;
    }
  }


  Logger.log("Fury non trouvé dans Films");
}




/**
 * Test sans écrire dans Films : montre les lignes qui seraient
 * sélectionnées lors du prochain contrôle quotidien.
 */
function testSelectionCanalQuotidienneV41() {
  const contexte = initialiserContexteCanalV41_();
  if (!contexte) return;


  const max = getMaxCanalParCycleV41_(contexte.connecteur);
  const indices = selectionnerLignesCanalQuotidiennesV41_(
    contexte.data,
    contexte.h,
    Math.min(max, 20)
  );


  const resultat = indices.map(function(index) {
    return {
      ligne: index + 1,
      titre: get_(contexte.data[index], contexte.h, "Titre"),
      dernierControle: normaliserValeur_(
        get_(
          contexte.data[index],
          contexte.h,
          "DernierControleDisponibilite"
        )
      )
    };
  });


  Logger.log(JSON.stringify(resultat, null, 2));
}
