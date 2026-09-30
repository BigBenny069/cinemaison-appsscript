/**
 * ============================================================
 * CinéMaison V4
 * Script  : 18_RAPPORT_ECARTS_PLATEFORMES.gs
 * Rôle    : Rapport quotidien des écarts entre CinéMaison et
 *           Prime/Netflix/Disney+ -- deux parties :
 *           - Partie 1 (À RETIRER) : fiche marquée sur une plateforme
 *             dans Films, absente du dernier scan complet de cette
 *             plateforme (CONTROLE_<PLATEFORME>) -- recalculée en
 *             direct à chaque envoi, jamais périmée.
 *           - Partie 2 (À AJOUTER) : titre vu lors du dernier scan
 *             mais absent de CinéMaison -- relue depuis l'onglet
 *             DERNIERES_SUGGESTIONS_PLATEFORMES (voir 09_WEBHOOK.gs),
 *             donc toujours la donnée du dernier scan de chaque
 *             plateforme, même si le scan remonte à plusieurs jours.
 * Version : 1.6
 *
 * Correctif V1.6 (30/09/2026) : affiné sur suggestion de Ben --
 * "à retirer" utilise maintenant en priorité la date théorique de
 * retrait déjà connue dans le Sheet (DateDisponibiliteAuto) : une
 * fiche manquante du scan n'est confirmée que si cette date est
 * STRICTEMENT dépassée (le jour même du retrait, encore accessible
 * jusqu'à 23h59, ne compte pas). Quand aucune date théorique n'est
 * connue (retrait surprise, sans préavis), repli sur la confirmation
 * à 2 scans du V1.5 comme filet de sécurité. Voir dateStrictementPasseeV1_
 * et filtrerManquantsConfirmesV1_.
 *
 * Correctif V1.5 (30/09/2026) : "à retirer" exige maintenant une
 * absence confirmée sur 2 scans (jours différents) avant de signaler
 * une fiche, plutôt que de se fier à une seule absence du jour --
 * signalé par Ben sur des films encore accessibles jusqu'à 23h59 le
 * jour de leur retrait, remontés "à retirer" prématurément le jour
 * même (Netflix semble parfois retirer un titre de "Ma Liste" un peu
 * avant l'heure réelle de fin de disponibilité). Nouvel onglet
 * ECARTS_RETRAIT_EN_ATTENTE mémorisant la première date où chaque
 * fiche a été vue manquante ; remise à zéro dès qu'elle réapparaît
 * dans un scan (fausse alerte résolue). Voir filtrerManquantsConfirmesV1_.
 *
 * Correctif V1.4 (30/09/2026) : "Validé, c'est normal"/"Ignorer" a
 * maintenant une vraie mémoire persistante -- le rapport consulte
 * désormais PRIME_IGNORES/STREAMING_IGNORES (la même liste que les
 * collecteurs) avant d'inclure une suggestion/ambiguïté, plutôt que de
 * se fier uniquement à ce que le dernier scan a resauvegardé. Un titre
 * déjà validé ne revient plus, même si le collecteur régénère la même
 * ambiguïté avant que son propre filtre n'ait eu le temps de la voir
 * passer. Signalé par Ben sur "La Malédiction".
 *
 * Correctif V1.3 (24/09/2026) : Partie 1 (À RETIRER) traite maintenant
 * un scan présent mais SANS AUCUNE ligne de données (juste l'entête)
 * comme "pas de scan" plutôt que "tout a disparu" -- ce cas précis
 * (écriture Vercel interrompue entre le vidage et la réécriture de
 * CONTROLE_<PLATEFORME>) faisait ressortir le catalogue entier d'une
 * plateforme comme à retirer. Voir calculerEcartsRetraitV1_.
 *
 * Correctif V1.2 (11/09/2026) : vignettes (affiche 50x75) ajoutées sur
 * les 3 sections du mail -- Partie 1 depuis Films.Affiche, Partie 2 et
 * ambiguïtés depuis le champ "affiche" déjà sauvegardé par les
 * collecteurs dans DERNIERES_SUGGESTIONS_PLATEFORMES. Même habillage
 * que le mail de suggestions Prime existant.
 *
 * Correctif V1.1 (10/09/2026) : calculerEcartsRetraitV1_ ne fait plus
 * planter tout le rapport si UNE plateforme a des données mal formées
 * (résidu d'un ancien format sur CONTROLE_NETFLIX, constaté en usage
 * réel) -- cette plateforme est maintenant simplement ignorée (avec
 * une trace dans le journal), les autres continuent normalement.
 *
 * Correctif V1.0 (10/09/2026) : création initiale. Décidé avec Ben :
 * garder les deux parties dès le départ (plutôt que de débrancher la
 * Partie 2 pour redondance avec les mails de suggestions existants) --
 * à débrancher plus tard si elle s'avère effectivement inutile en
 * usage réel.
 * ============================================================
 *
 * Dépend de 17_CONTROLE_STREAMING_GENERIQUE.gs (configPlateformeStreamingV1_,
 * estPlateformeStreamingV1_, lireResultatsStreamingV1_, indexEntetesStreamingV1_)
 * et 11_CONTROLE_PRIME_OFFICIEL.gs (estPrimeVideoV110_, lireResultatsPrimeV110_)
 * -- réutilise leur logique existante plutôt que de la dupliquer.
 *
 * MISE EN PLACE (à faire une seule fois, manuellement) :
 * 1. Dans le Sheet CONFIG, ajoute une ligne "AddFilmPassword" avec
 *    EXACTEMENT la même valeur que ADD_FILM_PASSWORD sur Vercel (et que
 *    "motDePasse" dans secrets-local.json) -- nécessaire pour que les
 *    liens "Retirer de CinéMaison" du mail fonctionnent (Apps Script
 *    ne connaît pas ce mot de passe autrement).
 * 2. Lance installerDeclencheurRapportEcartsV1() une fois depuis
 *    l'éditeur -- crée le déclencheur quotidien.
 */

const RAPPORT_ECARTS_PLATEFORMES_V1 = ["PRIME", "NETFLIX", "DISNEY"];
const RAPPORT_ECARTS_SUGGESTIONS_FEUILLE_V1 = "DERNIERES_SUGGESTIONS_PLATEFORMES";

/**
 * À lancer UNE SEULE FOIS depuis l'éditeur -- crée le déclencheur
 * quotidien (autour de 8h, heure du fuseau du script).
 */
function installerDeclencheurRapportEcartsV1() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "genererEtEnvoyerRapportEcartsV1"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("genererEtEnvoyerRapportEcartsV1")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  // Logger.log fonctionne dans tous les contextes (menu, exécution
  // manuelle depuis l'éditeur, etc.) -- contrairement à getUi().alert(),
  // qui ne marche que si lancé depuis un clic dans un menu du Sheet
  // lui-même (erreur "Cannot call SpreadsheetApp.getUi() from this
  // context" sinon, observé le 10/09/2026 en lançant depuis l'éditeur).
  Logger.log("Déclencheur quotidien installé (rapport d'écarts, ~8h).");
  try {
    SpreadsheetApp.getUi().alert("Déclencheur quotidien installé (rapport d'écarts, ~8h).");
  } catch (e) {
    // Pas grave -- le message est déjà dans le journal d'exécution ci-dessus.
  }
}

/**
 * Fonction déclenchée quotidiennement (et peut être lancée à la main
 * depuis l'éditeur pour tester). Calcule les écarts des 3 plateformes
 * et envoie un mail unique s'il y a quelque chose à signaler.
 */
/**
 * NOUVEAU (30/09/2026) -- persistance réelle de "Validé, c'est normal"
 * / "Ignorer" : ce rapport relisait jusqu'ici DERNIERES_SUGGESTIONS_PLATEFORMES
 * tel quel, sans jamais consulter la liste des titres déjà ignorés
 * (PRIME_IGNORES / STREAMING_IGNORES -- alimentée par le clic
 * "Ignorer"/"Validé, c'est normal", lue par les collecteurs eux-mêmes
 * pour NE PAS re-proposer un titre déjà tranché). Résultat, signalé
 * par Ben : une ambiguïté validée pouvait revenir le jour suivant si
 * le collecteur, lui, la reproduisait avant que le clic n'ait eu
 * le temps de "prendre" -- le rapport écrasait alors le silence.
 * Ce filtre applique la MÊME liste que les collecteurs, directement
 * en lecture Sheet (PRIME_IGNORES/STREAMING_IGNORES vivent dans le
 * même classeur, pas besoin de repasser par Vercel).
 *
 * Même normalisation que lib/prime-ignores.js et lib/streaming-ignores.js
 * (DOIT rester identique des deux côtés, sinon plus aucune correspondance).
 */
function normaliserTitreIgnoresV1_(titre) {
  return String(titre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chargerTitresIgnoresV1_(plateforme) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const ignores = new Set();

  // PRIME_IGNORES -- historique, sans colonne Plateforme (Prime
  // uniquement, voir lib/prime-ignores.js "laissé tel quel").
  if (plateforme === "PRIME") {
    const feuillePrime = classeur.getSheetByName("PRIME_IGNORES");
    if (feuillePrime && feuillePrime.getLastRow() >= 2) {
      feuillePrime.getRange(2, 1, feuillePrime.getLastRow() - 1, 2).getValues().forEach(function (ligne) {
        const titreNorm = String(ligne[0] || "").trim();
        const type = String(ligne[1] || "").trim();
        if (titreNorm) ignores.add(titreNorm + "|" + type);
      });
    }
  }

  // STREAMING_IGNORES -- Netflix/Disney+/Canal+, colonne Plateforme.
  const feuilleStreaming = classeur.getSheetByName("STREAMING_IGNORES");
  if (feuilleStreaming && feuilleStreaming.getLastRow() >= 2) {
    feuilleStreaming.getRange(2, 1, feuilleStreaming.getLastRow() - 1, 3).getValues().forEach(function (ligne) {
      const titreNorm = String(ligne[0] || "").trim();
      const p = String(ligne[1] || "").trim();
      const type = String(ligne[2] || "").trim();
      if (titreNorm && p === plateforme) ignores.add(titreNorm + "|" + type);
    });
  }

  return ignores;
}

function genererEtEnvoyerRapportEcartsV1() {
  const parPlateforme = RAPPORT_ECARTS_PLATEFORMES_V1.map(function (plateforme) {
    const ignores = chargerTitresIgnoresV1_(plateforme);
    const filtrerIgnores = function (liste, type) {
      return liste.filter(function (f) {
        return !ignores.has(normaliserTitreIgnoresV1_(f.titre) + "|" + type);
      });
    };
    return {
      plateforme: plateforme,
      manquants: calculerEcartsRetraitV1_(plateforme),
      suggestions: filtrerIgnores(lireDernieresSuggestionsV1_(plateforme, "SUGGESTION"), "SUGGESTION"),
      ambiguites: filtrerIgnores(lireDernieresSuggestionsV1_(plateforme, "AMBIGUITE"), "AMBIGUITE"),
    };
  });

  const totalManquants = parPlateforme.reduce(function (s, p) { return s + p.manquants.length; }, 0);
  const totalSuggestions = parPlateforme.reduce(function (s, p) { return s + p.suggestions.length; }, 0);
  const totalAmbiguites = parPlateforme.reduce(function (s, p) { return s + p.ambiguites.length; }, 0);

  if (totalManquants + totalSuggestions + totalAmbiguites === 0) {
    journal_("RAPPORT_ECARTS", "QUOTIDIEN", "OK", "Rien à signaler sur les 3 plateformes.");
    return;
  }

  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (destinataires) {
    const html = construireHtmlRapportEcartsV1_(parPlateforme);
    MailApp.sendEmail({
      to: destinataires,
      subject: "CinéMaison - V2 - Écarts plateformes (" + totalManquants + " à retirer, " +
        totalSuggestions + " à ajouter, " + totalAmbiguites + " ambiguïté(s))",
      htmlBody: html,
    });
  }

  journal_(
    "RAPPORT_ECARTS", "QUOTIDIEN", destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    "Manquants=" + totalManquants + " | Suggestions=" + totalSuggestions + " | Ambiguïtés=" + totalAmbiguites
  );
}

/**
 * Partie 1 -- fiches Films marquées sur cette plateforme, absentes du
 * dernier scan complet (CONTROLE_<PLATEFORME>). Si la feuille de
 * contrôle est absente ou vide, retourne [] plutôt que de tout
 * signaler à tort (mieux vaut ne rien dire que 280 faux positifs si le
 * collecteur n'a jamais tourné).
 */
function calculerEcartsRetraitV1_(plateforme) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) return [];

  const donneesFilms = films.getDataRange().getValues();
  const hFilms = indexEntetesStreamingV1_(donneesFilms[0]);
  if (hFilms.ID === undefined || hFilms.Titre === undefined || hFilms.Plateforme === undefined) return [];

  let feuilleControle, estDeCettePlateforme;
  if (plateforme === "PRIME") {
    feuilleControle = "CONTROLE_PRIME";
    estDeCettePlateforme = function (valeur) { return estPrimeVideoV110_(valeur); };
  } else {
    const config = configPlateformeStreamingV1_(plateforme);
    feuilleControle = config.feuilleControle;
    estDeCettePlateforme = function (valeur) { return estPlateformeStreamingV1_(config, valeur); };
  }

  const controle = classeur.getSheetByName(feuilleControle);
  if (!controle) return [];

  // Ne doit JAMAIS faire planter tout le rapport pour les autres
  // plateformes -- lireResultatsStreamingV1_/lireResultatsPrimeV110_
  // sont volontairement stricts (ils refusent de lire des données mal
  // formées plutôt que de deviner), ce qui est correct pour leur usage
  // d'origine mais pas acceptable ici : un résidu d'ancien format sur
  // UNE plateforme (constaté le 10/09/2026 sur CONTROLE_NETFLIX) ne
  // doit ignorer que CETTE plateforme, jamais interrompre les autres.
  let resultats;
  try {
    resultats = plateforme === "PRIME" ? lireResultatsPrimeV110_(controle) : lireResultatsStreamingV1_(controle);
  } catch (e) {
    Logger.log(
      "RAPPORT_ECARTS : " + feuilleControle + " ignorée (données mal formées, probablement un résidu d'un " +
      "ancien format) -- " + e.message
    );
    return [];
  }
  if (!resultats) return []; // pas de scan complet enregistré -- rien à comparer

  // CORRECTIF (24/09/2026) -- un scan RÉUSSI mais dont l'écriture vers
  // le Sheet a échoué EN COURS DE ROUTE (le Vercel de controle-prime.js
  // vide la plage CONTROLE_<PLATEFORME> puis la réécrit -- deux appels
  // séparés, pas une seule opération atomique) laisse la feuille avec
  // juste l'entête, aucune ligne de données. lireResultatsPrimeV110_/
  // lireResultatsStreamingV1_ renvoient alors un objet NON NULL
  // (l'entête existe bien), donc le test juste au-dessus ne l'attrape
  // pas -- idsScannes restait vide, et TOUT le catalogue de cette
  // plateforme ressortait comme "disparu" (constaté le 24/09/2026 sur
  // Ben : 290 fiches Prime signalées "à retirer" alors que le contrôle
  // de la veille s'était bien passé). Un scan sans AUCUNE ligne de
  // données n'est pas différent d'une absence de scan -- rien à
  // comparer non plus, mêmes causes mêmes conséquences.
  if (resultats.lignes.length <= 1) {
    Logger.log(
      "RAPPORT_ECARTS : " + feuilleControle + " a un entête mais aucune ligne de données -- " +
      "traité comme \"pas de scan\" plutôt que \"tout a disparu\"."
    );
    return [];
  }

  const idsScannes = {};
  const hR = resultats.index;
  for (let i = 1; i < resultats.lignes.length; i++) {
    const id = String(resultats.lignes[i][hR.IDFilm] || "").trim();
    if (id) idsScannes[id] = true;
  }

  const manquants = [];
  for (let i = 1; i < donneesFilms.length; i++) {
    const ligne = donneesFilms[i];
    const titre = String(ligne[hFilms.Titre] || "").trim();
    if (!titre) continue;
    if (!estDeCettePlateforme(ligne[hFilms.Plateforme])) continue;
    const id = String(ligne[hFilms.ID] || "").trim();
    if (!id || idsScannes[id]) continue;
    manquants.push({
      id: id,
      titre: titre,
      affiche: hFilms.Affiche !== undefined ? String(ligne[hFilms.Affiche] || "") : "",
      // NOUVEAU (30/09/2026) -- voir filtrerManquantsConfirmesV1_ : sert
      // à départager "vraiment parti" de "encore accessible jusqu'à ce
      // soir, la plateforme a juste retiré l'affichage un peu tôt".
      dateTheorique: hFilms.DateDisponibiliteAuto !== undefined ? ligne[hFilms.DateDisponibiliteAuto] : null,
    });
  }

  // NOUVEAU (30/09/2026) -- une absence du scan du jour peut être un
  // faux positif ponctuel (limite de minuit sur la date de retrait,
  // Netflix qui retire un titre de "Ma Liste" un peu avant l'heure
  // réelle de fin de disponibilité, aléa de défilement...) -- signalé
  // par Ben sur "Inside Llewyn Davis" : remonté "à retirer" le jour
  // même de son dernier jour, alors qu'il était encore accessible
  // jusqu'à 23h59. Une fiche n'est désormais signalée "à retirer" que
  // si elle est absente du scan pour la SECONDE fois (jour différent
  // du premier constat) -- une simple absence du jour est mémorisée
  // sans être encore signalée. Dès qu'une fiche réapparaît dans un
  // scan, son compteur est remis à zéro (fausse alerte résolue).
  return filtrerManquantsConfirmesV1_(plateforme, manquants);
}

/**
 * true si "date" (valeur de cellule Sheet -- Date ou chaîne) tombe un
 * jour strictement avant "aujourdHui" (comparaison au jour près,
 * l'heure n'entre pas en jeu -- un film dont le dernier jour est le
 * 30 reste valide jusqu'à 23h59 le 30, donc "dépassé" seulement à
 * partir du 1er).
 */
function dateStrictementPasseeV1_(date, aujourdHui) {
  if (!date) return false;
  let d;
  if (Object.prototype.toString.call(date) === "[object Date]") {
    if (isNaN(date.getTime())) return false;
    d = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } else {
    const m = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return false;
    d = m[0];
  }
  return d < aujourdHui;
}

function filtrerManquantsConfirmesV1_(plateforme, manquants) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const NOM_FEUILLE = "ECARTS_RETRAIT_EN_ATTENTE";
  let feuille = classeur.getSheetByName(NOM_FEUILLE);
  if (!feuille) {
    feuille = classeur.insertSheet(NOM_FEUILLE);
    feuille.getRange(1, 1, 1, 3).setValues([["Plateforme", "IDFilm", "PremiereFoisVuManquantLe"]]).setFontWeight("bold");
  }

  const aujourdHui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  // Charge l'état actuel (toutes plateformes -- on ne réécrit que la
  // ligne concernée, jamais les autres).
  const derniereLigne = feuille.getLastRow();
  const lignesExistantes = derniereLigne >= 2 ? feuille.getRange(2, 1, derniereLigne - 1, 3).getValues() : [];
  const enAttente = {};
  const autresPlateformes = [];
  lignesExistantes.forEach(function (ligne) {
    const p = String(ligne[0] || "").trim();
    const id = String(ligne[1] || "").trim();
    if (!id) return;
    if (p === plateforme) {
      enAttente[id] = String(ligne[2] || "").trim();
    } else {
      autresPlateformes.push(ligne);
    }
  });

  const confirmes = [];
  const nouvelEtatPlateforme = [];
  manquants.forEach(function (m) {
    // MODIFIÉ (30/09/2026) -- priorité à la date théorique de retrait
    // (déjà connue dans le Sheet) sur Ben : un film sans date théorique
    // dépassée ne devrait normalement pas encore être manquant, mais
    // au cas où (retrait anticipé réel, glitch plateforme...), la
    // confirmation sur 2 scans reste le filet de sécurité en second
    // recours -- jamais les deux logiques en même temps pour une même
    // fiche, la date théorique tranche dès qu'elle est disponible.
    if (m.dateTheorique) {
      if (dateStrictementPasseeV1_(m.dateTheorique, aujourdHui)) {
        confirmes.push(m);
      }
      // Date théorique connue mais pas encore dépassée (ex. dernier
      // jour = aujourd'hui) -- pas confirmé, et pas la peine de suivre
      // dans ECARTS_RETRAIT_EN_ATTENTE non plus : le prochain scan
      // retranchera la même comparaison de date, sans mémoire requise.
      return;
    }

    const datePremiereVue = enAttente[m.id];
    if (datePremiereVue && datePremiereVue !== aujourdHui) {
      confirmes.push(m);
      nouvelEtatPlateforme.push([plateforme, m.id, datePremiereVue]);
    } else {
      nouvelEtatPlateforme.push([plateforme, m.id, datePremiereVue || aujourdHui]);
    }
  });
  // Les fiches de cette plateforme qui N'APPARAISSENT PLUS dans
  // manquants (réapparues dans le dernier scan), ou qui ont désormais
  // une date théorique (gérée sans passer par cet onglet), sont
  // simplement omises de nouvelEtatPlateforme -- compteur remis à
  // zéro naturellement.

  const toutesLesLignes = autresPlateformes.concat(nouvelEtatPlateforme);
  feuille.getRange(2, 1, Math.max(feuille.getMaxRows() - 1, toutesLesLignes.length), 3).clearContent();
  if (toutesLesLignes.length > 0) {
    feuille.getRange(2, 1, toutesLesLignes.length, 3).setValues(toutesLesLignes);
  }

  return confirmes;
}

/**
 * Partie 2 -- relit DERNIERES_SUGGESTIONS_PLATEFORMES (sauvegardé par
 * 09_WEBHOOK.gs à chaque mail de suggestions envoyé par un collecteur).
 */
function lireDernieresSuggestionsV1_(plateforme, categorie) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = classeur.getSheetByName(RAPPORT_ECARTS_SUGGESTIONS_FEUILLE_V1);
  if (!feuille || feuille.getLastRow() < 2) return [];

  const donnees = feuille.getRange(2, 1, feuille.getLastRow() - 1, 4).getValues();
  const resultats = [];
  donnees.forEach(function (ligne) {
    const p = String(ligne[0] || "").trim();
    const cat = String(ligne[1] || "").trim();
    if (p !== plateforme || cat !== categorie) return;
    try {
      resultats.push(JSON.parse(ligne[3]));
    } catch (e) {
      // ligne corrompue -- ignorée silencieusement, pas bloquant
    }
  });
  return resultats;
}

/**
 * Sauvegarde (remplace) les suggestions/ambiguïtés d'une plateforme
 * dans DERNIERES_SUGGESTIONS_PLATEFORMES -- appelée par 09_WEBHOOK.gs
 * juste après l'envoi du mail de suggestions habituel. Ne touche
 * jamais aux lignes des AUTRES plateformes.
 */
function sauvegarderDernieresSuggestionsV1_(plateforme, fiches, ambiguites) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(RAPPORT_ECARTS_SUGGESTIONS_FEUILLE_V1);
  const entete = ["Plateforme", "Categorie", "Titre", "DonneesJSON", "DateEnregistrement"];

  if (!feuille) {
    feuille = classeur.insertSheet(RAPPORT_ECARTS_SUGGESTIONS_FEUILLE_V1);
    feuille.getRange(1, 1, 1, entete.length).setValues([entete]).setFontWeight("bold");
  }

  const maintenant = new Date();
  const lignesConservees = [];
  if (feuille.getLastRow() >= 2) {
    const donnees = feuille.getRange(2, 1, feuille.getLastRow() - 1, entete.length).getValues();
    donnees.forEach(function (ligne) {
      if (String(ligne[0] || "").trim() !== plateforme) lignesConservees.push(ligne);
    });
  }

  const nouvellesLignes = []
    .concat((fiches || []).map(function (f) {
      return [plateforme, "SUGGESTION", f.titre || "", JSON.stringify(f), maintenant];
    }))
    .concat((ambiguites || []).map(function (a) {
      return [plateforme, "AMBIGUITE", a.titre || "", JSON.stringify(a), maintenant];
    }));

  const toutesLesLignes = lignesConservees.concat(nouvellesLignes);

  feuille.getRange(2, 1, Math.max(feuille.getMaxRows() - 1, 1), entete.length).clearContent();
  if (toutesLesLignes.length > 0) {
    feuille.getRange(2, 1, toutesLesLignes.length, entete.length).setValues(toutesLesLignes);
  }
}

/**
 * Construit le mail HTML (même habillage crème/logo que les autres
 * mails CinéMaison). Une section par plateforme, seulement si elle a
 * quelque chose à signaler.
 */
function construireHtmlRapportEcartsV1_(parPlateforme) {
  const motDePasse = String(lireConfig_("AddFilmPassword", ""));
  const baseUrl = "https://cinemaison-v2.vercel.app";

  // Même vignette (50x75, coins arrondis, placeholder gris si pas
  // d'affiche) que le mail de suggestions Prime -- même habillage
  // partout.
  function vignetteHtml(urlAffiche) {
    return urlAffiche
      ? '<img src="' + urlAffiche + '" width="50" height="75" style="border-radius:4px;object-fit:cover;flex-shrink:0;margin-right:12px" alt="">'
      : '<div style="width:50px;height:75px;border-radius:4px;background:#E3D9C4;flex-shrink:0;margin-right:12px"></div>';
  }

  const sections = parPlateforme.map(function (p) {
    if (p.manquants.length === 0 && p.suggestions.length === 0 && p.ambiguites.length === 0) return "";

    let html = '<div style="margin-top:20px"><div style="font-size:14px;font-weight:bold;color:#3A2E22">' + p.plateforme + '</div>';

    if (p.manquants.length > 0) {
      html += '<div style="font-size:12px;color:#9A9182;margin-top:6px">À RETIRER (' + p.manquants.length + ')</div>';
      html += p.manquants.map(function (m) {
        const retirerUrl = baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(m.id) +
          "&titre=" + encodeURIComponent(m.titre) + "&pw=" + encodeURIComponent(motDePasse);
        return '<div style="display:flex;align-items:flex-start;padding:8px 0;border-bottom:1px solid #EFE7D6">' +
          vignetteHtml(m.affiche) +
          '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          m.titre + ' (' + m.id + ')<br><a href="' + retirerUrl + '" style="color:#B5622B">Retirer de CinéMaison</a>' +
          '</div></div>';
      }).join("");
    }

    if (p.suggestions.length > 0) {
      html += '<div style="font-size:12px;color:#9A9182;margin-top:10px">À AJOUTER (' + p.suggestions.length + ')</div>';
      html += p.suggestions.map(function (f) {
        const liens = []
          .concat(f.confirmUrl ? ['<a href="' + f.confirmUrl + '" style="color:#B5622B">Ajouter</a>'] : [])
          .concat(f.ignorerUrl ? ['<a href="' + f.ignorerUrl + '" style="color:#9A9182">Ignorer</a>'] : [])
          .concat(f.fusionnerUrl ? ['<a href="' + f.fusionnerUrl + '" style="color:#9A9182">Fusionner</a>'] : []);
        return '<div style="display:flex;align-items:flex-start;padding:8px 0;border-bottom:1px solid #EFE7D6">' +
          vignetteHtml(f.affiche) +
          '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          f.titre + (f.annee ? ' (' + f.annee + ')' : '') + '<br>' + liens.join(' &middot; ') +
          '</div></div>';
      }).join("");
    }

    if (p.ambiguites.length > 0) {
      html += '<div style="font-size:12px;color:#9A9182;margin-top:10px">AMBIGUÏTÉS (' + p.ambiguites.length + ')</div>';
      html += p.ambiguites.map(function (a) {
        return '<div style="display:flex;align-items:flex-start;padding:8px 0;border-bottom:1px solid #EFE7D6">' +
          vignetteHtml(a.affiche) +
          '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          a.titre + ' -- ' + (a.raison || '') +
          (a.ignorerUrl ? '<br><a href="' + a.ignorerUrl + '" style="color:#9A9182">Validé, c\'est normal</a>' : '') +
          '</div></div>';
      }).join("");
    }

    html += '</div>';
    return html;
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
    'margin-top:4px;font-family:Arial,sans-serif">ÉCARTS PLATEFORMES &middot; RAPPORT QUOTIDIEN</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    sections +
    '</div></div></body></html>'
  );
}
