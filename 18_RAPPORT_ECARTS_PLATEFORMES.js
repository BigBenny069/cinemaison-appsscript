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
 * Version : 2.0
 *
 * Correctif V2.0 (29/10/2026) : fausse alerte « 11 à retirer » (Prime, 29/10). Deux
 * causes corrigées : (1) la confirmation « absente de 2 scans » comptait deux
 * JOURS de rapport, pas deux contrôles : sans nouveau contrôle entre-temps, le
 * même contrôle était relu deux fois et pris pour une confirmation. Désormais
 * une fiche sans date de départ connue n'est signalée que si elle manque dans
 * DEUX CONTRÔLES DIFFÉRENTS (horodatage ControleLe), premier constat un autre
 * jour. (2) un contrôle incomplet (ex. 261 fiches vues au lieu de 274, 0 erreur)
 * faisait tout signaler : un contrôle qui voit au moins 5 fiches (et 2 %) de
 * moins que le dernier contrôle de référence est jugé « suspect » : aucun
 * retrait sans date n'est alors proposé ni confirmé, et le mail prévient
 * (une seule fois par contrôle suspect) de relancer le contrôle. Si le contrôle
 * suivant revient au même niveau (±2), c'est une vraie baisse : il devient la
 * référence. Nouvel onglet ECARTS_SCANS_REFERENCE ; ECARTS_RETRAIT_EN_ATTENTE
 * gagne une 4e colonne (ScanDuPremierConstat). Les anciennes lignes sans cette
 * colonne repartent d'un premier constat au prochain rapport.
 *
 * Correctif V1.9 (18/10/2026) : plateforme PARAMOUNT ajoutée au rapport
 * (RAPPORT_ECARTS_PLATEFORMES_V1).
 *
 * Correctif V1.8 (14/10/2026) : plateforme SHADOWZ ajoutée au rapport
 * (RAPPORT_ECARTS_PLATEFORMES_V1).
 *
 * Correctif V1.7 (12/10/2026) : la partie "À RETIRER" distingue les fiches
 * "jamais rattachées" (jamais vues dans un scan : doublon probable ou
 * titre/année qui ne colle pas) des fiches "parties de la plateforme",
 * chacune avec son message et sa suggestion.
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

const RAPPORT_ECARTS_PLATEFORMES_V1 = ["PRIME", "NETFLIX", "DISNEY", "SHADOWZ", "PARAMOUNT"];
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

/**
 * NOUVEAU (29/10/2026) -- logique PURE (sans Sheet) du contrôle « scan suspect »
 * et de la confirmation sur deux contrôles différents. Séparées pour être
 * testables hors Apps Script.
 */
const RAPPORT_SCAN_BAISSE_MIN_V1 = 5;      // au moins 5 fiches de moins que la référence...
const RAPPORT_SCAN_BAISSE_POURCENT_V1 = 0.02; // ...et au moins 2 %
const RAPPORT_SCAN_TOLERANCE_STABLE_V1 = 2;  // baisse « stable » = même niveau à ±2

/**
 * ref = { scanLe, nb, suspectLe, nbSuspect, alerteLe } (ou null si jamais vu).
 * Retourne { suspect, ref, nbRef } : ref est la ligne à mémoriser.
 */
function evaluerScanReferenceV1_(ref, scanLe, nb, nbAttendu) {
  if (!scanLe) return { suspect: false, ref: ref, nbRef: ref ? ref.nb : nb };
  if (!ref) {
    // Première évaluation de cette plateforme : pas de contrôle de référence.
    // On se base sur le nombre de fiches DÉJÀ VUES au moins une fois dans un
    // contrôle (nbAttendu, optionnel) : si ce contrôle en voit nettement moins,
    // il est suspect dès le départ (cas du 29/10/2026 : 261 vues, 272 attendues).
    const seuilInitial = nbAttendu ? Math.max(RAPPORT_SCAN_BAISSE_MIN_V1, Math.ceil(nbAttendu * RAPPORT_SCAN_BAISSE_POURCENT_V1)) : 0;
    if (nbAttendu && nbAttendu - nb >= seuilInitial) {
      return {
        suspect: true,
        ref: { scanLe: "", nb: nbAttendu, suspectLe: scanLe, nbSuspect: nb, alerteLe: "" },
        nbRef: nbAttendu,
      };
    }
    return { suspect: false, ref: { scanLe: scanLe, nb: nb, suspectLe: "", nbSuspect: "", alerteLe: "" }, nbRef: nb };
  }
  // Même contrôle que celui déjà évalué : même verdict qu'avant.
  if (ref.scanLe === scanLe) return { suspect: false, ref: ref, nbRef: ref.nb };
  if (ref.suspectLe === scanLe) return { suspect: true, ref: ref, nbRef: ref.nb };

  const baisse = ref.nb - nb;
  const seuil = Math.max(RAPPORT_SCAN_BAISSE_MIN_V1, Math.ceil(ref.nb * RAPPORT_SCAN_BAISSE_POURCENT_V1));
  if (baisse < seuil) {
    return { suspect: false, ref: { scanLe: scanLe, nb: nb, suspectLe: "", nbSuspect: "", alerteLe: "" }, nbRef: ref.nb };
  }
  // Grosse baisse. Si un contrôle suspect précédent (autre horodatage) était au
  // même niveau, la baisse est probablement réelle : on l'accepte comme référence.
  if (ref.nbSuspect !== "" && ref.nbSuspect !== null && ref.suspectLe && ref.suspectLe !== scanLe &&
      Math.abs(Number(ref.nbSuspect) - nb) <= RAPPORT_SCAN_TOLERANCE_STABLE_V1) {
    return { suspect: false, ref: { scanLe: scanLe, nb: nb, suspectLe: "", nbSuspect: "", alerteLe: "" }, nbRef: ref.nb };
  }
  return {
    suspect: true,
    ref: { scanLe: ref.scanLe, nb: ref.nb, suspectLe: scanLe, nbSuspect: nb, alerteLe: ref.alerteLe || "" },
    nbRef: ref.nb,
  };
}

/**
 * entree = { date, scan } du premier constat (ou null). Retourne
 * { confirme, entree } ; entree = ligne à mémoriser (null = ne rien mémoriser).
 * Une fiche n'est confirmée que si : premier constat un AUTRE jour ET dans un
 * AUTRE contrôle. Contrôle suspect : rien de nouveau n'est mémorisé ni confirmé.
 */
function decisionRetraitSansDateV1_(entree, scanLe, aujourdHui, scanSuspect) {
  if (scanSuspect) return { confirme: false, entree: entree || null };
  if (!entree || !entree.date) return { confirme: false, entree: { date: aujourdHui, scan: scanLe || "" } };
  // Ancienne ligne (sans contrôle mémorisé) : repart d'un premier constat.
  if (scanLe && !entree.scan) return { confirme: false, entree: { date: aujourdHui, scan: scanLe } };
  const autreJour = entree.date !== aujourdHui;
  const autreControle = scanLe ? entree.scan !== scanLe : true; // horodatage illisible : repli sur le jour seul
  if (autreJour && autreControle) return { confirme: true, entree: entree };
  return { confirme: false, entree: entree };
}

function horodatageControleV1_(resultats) {
  const hR = resultats.index;
  let max = null;
  for (let i = 1; i < resultats.lignes.length; i++) {
    const brut = resultats.lignes[i][hR.ControleLe];
    const d = convertirDateControleStreamingV1_(brut);
    if (d && !isNaN(d.getTime()) && (!max || d.getTime() > max.getTime())) max = d;
  }
  return max ? Utilities.formatDate(max, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : "";
}

/**
 * Jour (yyyy-MM-dd) d'une cellule du Sheet, qu'elle soit une vraie date, un
 * texte « yyyy-MM-dd » ou un ancien texte « Wed Oct 28 2026 00:00:00 GMT+0100 ».
 * L'ancien code comparait ce texte brut à « yyyy-MM-dd » : jamais égal, donc
 * toujours « un autre jour » (deuxième cause de la fausse alerte du 29/10/2026).
 */
function jourDeCelluleV1_(valeur) {
  if (!valeur) return "";
  const fuseau = Session.getScriptTimeZone();
  if (Object.prototype.toString.call(valeur) === "[object Date]") {
    return isNaN(valeur.getTime()) ? "" : Utilities.formatDate(valeur, fuseau, "yyyy-MM-dd");
  }
  const texte = String(valeur).trim();
  const iso = texte.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(texte);
  return isNaN(d.getTime()) ? "" : Utilities.formatDate(d, fuseau, "yyyy-MM-dd");
}

const RAPPORT_ECARTS_REFERENCE_FEUILLE_V1 = "ECARTS_SCANS_REFERENCE";
const RAPPORT_ECARTS_REFERENCE_ENTETE_V1 = ["Plateforme", "ScanLe", "NbFiches", "ScanSuspectLe", "NbSuspect", "AlerteEnvoyeeLe"];

function lireReferenceScanV1_(plateforme) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RAPPORT_ECARTS_REFERENCE_FEUILLE_V1);
  if (!feuille || feuille.getLastRow() < 2) return null;
  const lignes = feuille.getRange(2, 1, feuille.getLastRow() - 1, 6).getValues();
  for (let i = 0; i < lignes.length; i++) {
    if (String(lignes[i][0] || "").trim() === plateforme) {
      return {
        scanLe: String(lignes[i][1] || ""), nb: Number(lignes[i][2]) || 0,
        suspectLe: String(lignes[i][3] || ""), nbSuspect: lignes[i][4] === "" ? "" : Number(lignes[i][4]),
        alerteLe: String(lignes[i][5] || ""),
      };
    }
  }
  return null;
}

function ecrireReferenceScanV1_(plateforme, ref) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(RAPPORT_ECARTS_REFERENCE_FEUILLE_V1);
  if (!feuille) {
    feuille = classeur.insertSheet(RAPPORT_ECARTS_REFERENCE_FEUILLE_V1);
  }
  if (!String(feuille.getRange(1, 1).getValue() || "").trim()) {
    feuille.getRange(1, 1, 1, RAPPORT_ECARTS_REFERENCE_ENTETE_V1.length).setValues([RAPPORT_ECARTS_REFERENCE_ENTETE_V1]).setFontWeight("bold");
  }
  // Les horodatages sont mémorisés en TEXTE (format « @ » posé AVANT l'écriture) :
  // sinon Google Sheets les convertit en dates et la comparaison ne colle plus.
  feuille.getRange(1, 1, Math.max(feuille.getMaxRows(), 2), 6).setNumberFormat("@");
  const ligne = [plateforme, ref.scanLe, ref.nb, ref.suspectLe || "", ref.nbSuspect, ref.alerteLe || ""];
  const derniere = feuille.getLastRow();
  if (derniere >= 2) {
    const noms = feuille.getRange(2, 1, derniere - 1, 1).getValues();
    for (let i = 0; i < noms.length; i++) {
      if (String(noms[i][0] || "").trim() === plateforme) {
        feuille.getRange(i + 2, 1, 1, 6).setValues([ligne]);
        return;
      }
    }
  }
  feuille.getRange(derniere + 1, 1, 1, 6).setValues([ligne]);
}

function genererEtEnvoyerRapportEcartsV1() {
  const parPlateforme = RAPPORT_ECARTS_PLATEFORMES_V1.map(function (plateforme) {
    const ignores = chargerTitresIgnoresV1_(plateforme);
    const filtrerIgnores = function (liste, type) {
      return liste.filter(function (f) {
        return !ignores.has(normaliserTitreIgnoresV1_(f.titre) + "|" + type);
      });
    };
    const ecarts = calculerEcartsRetraitDetailV1_(plateforme);
    return {
      plateforme: plateforme,
      scanSuspect: ecarts.scanSuspect,
      manquants: ecarts.manquants,
      suggestions: filtrerIgnores(lireDernieresSuggestionsV1_(plateforme, "SUGGESTION"), "SUGGESTION"),
      ambiguites: filtrerIgnores(lireDernieresSuggestionsV1_(plateforme, "AMBIGUITE"), "AMBIGUITE"),
    };
  });

  const totalManquants = parPlateforme.reduce(function (s, p) { return s + p.manquants.length; }, 0);
  const totalSuggestions = parPlateforme.reduce(function (s, p) { return s + p.suggestions.length; }, 0);
  const totalAmbiguites = parPlateforme.reduce(function (s, p) { return s + p.ambiguites.length; }, 0);

  // NOUVEAU (29/10/2026) -- contrôle suspect (nettement moins de fiches vues
  // que la référence) : à signaler UNE fois par contrôle suspect, même s'il n'y
  // a rien d'autre dans le rapport ; ensuite le bandeau n'apparaît que si le
  // mail part de toute façon.
  const suspects = parPlateforme.filter(function (p) { return p.scanSuspect; });
  const suspectsNouveaux = suspects.filter(function (p) { return p.scanSuspect.aAlerter; });
  const resumeSuspects = suspects.map(function (p) {
    return p.plateforme + " " + p.scanSuspect.nb + " fiches vues au lieu de " + p.scanSuspect.nbRef;
  }).join("; ");

  if (totalManquants + totalSuggestions + totalAmbiguites === 0 && suspectsNouveaux.length === 0) {
    journal_("RAPPORT_ECARTS", "QUOTIDIEN", "OK",
      "Rien à signaler sur les 3 plateformes." + (suspects.length ? " Contrôle suspect déjà signalé : " + resumeSuspects : ""));
    return;
  }

  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (destinataires) {
    const html = construireHtmlRapportEcartsV1_(parPlateforme);
    MailApp.sendEmail({
      to: destinataires,
      subject: "CinéMaison - V2 - Écarts plateformes (" + totalManquants + " à retirer, " +
        totalSuggestions + " à ajouter, " + totalAmbiguites + " ambiguïté(s))" +
        (suspects.length ? " - contrôle " + suspects.map(function (p) { return p.plateforme; }).join("/") + " incomplet ?" : ""),
      htmlBody: html,
    });
    // Alerte « contrôle suspect » mémorisée : pas de nouveau mail pour ce seul motif.
    suspectsNouveaux.forEach(function (p) {
      const ref = lireReferenceScanV1_(p.plateforme);
      if (ref) {
        ref.alerteLe = p.scanSuspect.scanLe;
        ecrireReferenceScanV1_(p.plateforme, ref);
      }
    });
  }

  journal_(
    "RAPPORT_ECARTS", "QUOTIDIEN", destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    "Manquants=" + totalManquants + " | Suggestions=" + totalSuggestions + " | Ambiguïtés=" + totalAmbiguites +
    (suspects.length ? " | Contrôle suspect : " + resumeSuspects : "")
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
  return calculerEcartsRetraitDetailV1_(plateforme).manquants;
}

/**
 * Comme calculerEcartsRetraitV1_ mais renvoie aussi { scanSuspect } :
 * null si le dernier contrôle est normal, sinon
 * { nb, nbRef, scanLe, aAlerter } (voir evaluerScanReferenceV1_).
 */
function calculerEcartsRetraitDetailV1_(plateforme) {
  const VIDE = { manquants: [], scanSuspect: null };
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) return VIDE;

  const donneesFilms = films.getDataRange().getValues();
  const hFilms = indexEntetesStreamingV1_(donneesFilms[0]);
  if (hFilms.ID === undefined || hFilms.Titre === undefined || hFilms.Plateforme === undefined) return VIDE;

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
  if (!controle) return VIDE;

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
    return VIDE;
  }
  if (!resultats) return VIDE; // pas de scan complet enregistré -- rien à comparer

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
    return VIDE;
  }

  const idsScannes = {};
  const hR = resultats.index;
  for (let i = 1; i < resultats.lignes.length; i++) {
    const id = String(resultats.lignes[i][hR.IDFilm] || "").trim();
    if (id) idsScannes[id] = true;
  }

  // NOUVEAU (29/10/2026) -- horodatage du contrôle et verdict « suspect ? »
  // (voir evaluerScanReferenceV1_). Le verdict est mémorisé dans
  // ECARTS_SCANS_REFERENCE ; une erreur ici ne doit jamais bloquer le rapport.
  const scanLe = horodatageControleV1_(resultats);
  let scanSuspect = null;
  try {
    const nbScanne = Object.keys(idsScannes).length;
    let nbAttendu = 0;
    if (hFilms.DernierControleDisponibilite !== undefined) {
      for (let i = 1; i < donneesFilms.length; i++) {
        const l = donneesFilms[i];
        if (!String(l[hFilms.Titre] || "").trim() || !estDeCettePlateforme(l[hFilms.Plateforme])) continue;
        if (String(l[hFilms.DernierControleDisponibilite] || "").trim()) nbAttendu++;
      }
    }
    const evaluation = evaluerScanReferenceV1_(lireReferenceScanV1_(plateforme), scanLe, nbScanne, nbAttendu);
    if (scanLe) ecrireReferenceScanV1_(plateforme, evaluation.ref);
    if (evaluation.suspect) {
      scanSuspect = {
        nb: nbScanne, nbRef: evaluation.nbRef, scanLe: scanLe,
        aAlerter: evaluation.ref.alerteLe !== scanLe,
      };
    }
  } catch (e) {
    Logger.log("RAPPORT_ECARTS : référence de contrôle illisible pour " + plateforme + " -- " + e.message);
  }

  // NOUVEAU (v1.7, 12/10/2026) -- on distingue deux cas d'absence :
  //  - "jamais rattachée" : aucun scan n'a JAMAIS vu cette fiche
  //    (DernierControleDisponibilite vide) -> en général un doublon
  //    ou un titre/année qui ne colle pas avec ce que la plateforme
  //    affiche (cas FILM1284 "Dans ses yeux" doublon de FILM0604) ;
  //  - "partie de la plateforme" : déjà vue avant, absente maintenant.
  // Pour le premier cas on cherche un doublon probable : une AUTRE
  // fiche de la même plateforme, même titre normalisé, PRÉSENTE dans
  // le scan.
  const fichesScannees = {}; // titre normalisé -> {id, titre, annee}
  for (let i = 1; i < donneesFilms.length; i++) {
    const l = donneesFilms[i];
    const idL = String(l[hFilms.ID] || "").trim();
    if (!idL || !idsScannes[idL]) continue;
    const cle = normaliserTitreIgnoresV1_(String(l[hFilms.Titre] || ""));
    if (!cle || fichesScannees[cle]) continue;
    fichesScannees[cle] = {
      id: idL,
      titre: String(l[hFilms.Titre] || "").trim(),
      annee: hFilms.Annee !== undefined ? String(l[hFilms.Annee] || "").trim() : "",
    };
  }

  const manquants = [];
  for (let i = 1; i < donneesFilms.length; i++) {
    const ligne = donneesFilms[i];
    const titre = String(ligne[hFilms.Titre] || "").trim();
    if (!titre) continue;
    if (!estDeCettePlateforme(ligne[hFilms.Plateforme])) continue;
    const id = String(ligne[hFilms.ID] || "").trim();
    if (!id || idsScannes[id]) continue;
    const jamaisVu = hFilms.DernierControleDisponibilite !== undefined &&
      !String(ligne[hFilms.DernierControleDisponibilite] || "").trim();
    const doublon = jamaisVu ? (fichesScannees[normaliserTitreIgnoresV1_(titre)] || null) : null;
    manquants.push({
      id: id,
      titre: titre,
      annee: hFilms.Annee !== undefined ? String(ligne[hFilms.Annee] || "").trim() : "",
      jamaisVu: jamaisVu,
      doublon: doublon,
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
  return { manquants: filtrerManquantsConfirmesV1_(plateforme, manquants, scanLe, !!scanSuspect), scanSuspect: scanSuspect };
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

function filtrerManquantsConfirmesV1_(plateforme, manquants, scanLe, scanSuspect) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const NOM_FEUILLE = "ECARTS_RETRAIT_EN_ATTENTE";
  const ENTETE = ["Plateforme", "IDFilm", "PremiereFoisVuManquantLe", "ScanDuPremierConstat"];
  let feuille = classeur.getSheetByName(NOM_FEUILLE);
  if (!feuille) {
    feuille = classeur.insertSheet(NOM_FEUILLE);
  }
  // En-tête posé (ou complété : 4e colonne ajoutée le 29/10/2026) si besoin.
  if (String(feuille.getRange(1, 4).getValue() || "").trim() !== ENTETE[3] ||
      String(feuille.getRange(1, 1).getValue() || "").trim() !== ENTETE[0]) {
    feuille.getRange(1, 1, 1, 4).setValues([ENTETE]).setFontWeight("bold");
  }

  const aujourdHui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  // Charge l'état actuel (toutes plateformes -- on ne réécrit que la
  // ligne concernée, jamais les autres).
  const derniereLigne = feuille.getLastRow();
  const lignesExistantes = derniereLigne >= 2 ? feuille.getRange(2, 1, derniereLigne - 1, 4).getValues() : [];
  const enAttente = {};
  const autresPlateformes = [];
  lignesExistantes.forEach(function (ligne) {
    const p = String(ligne[0] || "").trim();
    const id = String(ligne[1] || "").trim();
    if (!id) return;
    if (p === plateforme) {
      enAttente[id] = { date: jourDeCelluleV1_(ligne[2]), scan: String(ligne[3] || "").trim() };
    } else {
      autresPlateformes.push([ligne[0], ligne[1], jourDeCelluleV1_(ligne[2]) || ligne[2], String(ligne[3] || "")]);
    }
  });

  const confirmes = [];
  const nouvelEtatPlateforme = [];
  manquants.forEach(function (m) {
    // MODIFIÉ (30/09/2026) -- priorité à la date théorique de retrait
    // (déjà connue dans le Sheet sur Ben) sur la confirmation par contrôles.
    if (m.dateTheorique) {
      if (dateStrictementPasseeV1_(m.dateTheorique, aujourdHui)) {
        confirmes.push(m);
      }
      // Date théorique connue mais pas encore dépassée -- pas confirmé, et
      // pas la peine de suivre dans ECARTS_RETRAIT_EN_ATTENTE non plus.
      return;
    }

    // MODIFIÉ (29/10/2026) -- sans date théorique : confirmation sur DEUX
    // CONTRÔLES DIFFÉRENTS (et un autre jour), jamais deux lectures du même
    // contrôle. Voir decisionRetraitSansDateV1_ et evaluerScanReferenceV1_.
    const decision = decisionRetraitSansDateV1_(enAttente[m.id] || null, scanLe, aujourdHui, scanSuspect);
    if (decision.confirme) confirmes.push(m);
    if (decision.entree) nouvelEtatPlateforme.push([plateforme, m.id, decision.entree.date, decision.entree.scan || ""]);
  });
  // Les fiches de cette plateforme qui N'APPARAISSENT PLUS dans
  // manquants (réapparues dans le dernier scan), ou qui ont désormais
  // une date théorique (gérée sans passer par cet onglet), sont
  // simplement omises de nouvelEtatPlateforme -- compteur remis à
  // zéro naturellement.

  const toutesLesLignes = autresPlateformes.concat(nouvelEtatPlateforme);
  // Colonnes en TEXTE (« @ ») pour que les dates/horodatages ne soient pas
  // reconvertis par Google Sheets (cause de la comparaison faussée avant 29/10/2026).
  feuille.getRange(2, 1, Math.max(feuille.getMaxRows() - 1, toutesLesLignes.length, 1), 4).setNumberFormat("@");
  feuille.getRange(2, 1, Math.max(feuille.getMaxRows() - 1, toutesLesLignes.length, 1), 4).clearContent();
  if (toutesLesLignes.length > 0) {
    feuille.getRange(2, 1, toutesLesLignes.length, 4).setValues(toutesLesLignes);
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
    if (p.manquants.length === 0 && p.suggestions.length === 0 && p.ambiguites.length === 0 && !p.scanSuspect) return "";

    let html = '<div style="margin-top:20px"><div style="font-size:14px;font-weight:bold;color:#3A2E22">' + p.plateforme + '</div>';
    if (p.scanSuspect) {
      html += '<div style="margin-top:8px;padding:10px 12px;background:#FBEBD3;border:1px solid #E5B877;border-radius:6px;font-size:13px;color:#6B4A12;font-family:Arial,sans-serif">' +
        '<b>Le dernier contrôle ' + p.plateforme + ' semble incomplet</b> : ' + p.scanSuspect.nb + ' fiches vues au lieu de ' + p.scanSuspect.nbRef +
        ' au contrôle de référence. Aucun retrait sans date de départ n\'est proposé tant qu\'un nouveau contrôle ne l\'a pas confirmé. ' +
        'Relance le contrôle ' + p.plateforme + '.</div>';
    }

    if (p.manquants.length > 0) {
      const ligneManquant = function (m, message) {
        const retirerUrl = baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(m.id) +
          "&titre=" + encodeURIComponent(m.titre) + "&pw=" + encodeURIComponent(motDePasse);
        return '<div style="display:flex;align-items:flex-start;padding:8px 0;border-bottom:1px solid #EFE7D6">' +
          vignetteHtml(m.affiche) +
          '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          m.titre + (m.annee ? ' (' + m.annee + ')' : '') + ' — ' + m.id + '<br>' +
          '<span style="color:#7A6F5E">' + message + '</span><br>' +
          '<a href="' + retirerUrl + '" style="color:#B5622B">Retirer de CinéMaison</a>' +
          '</div></div>';
      };
      const jamais = p.manquants.filter(function (m) { return m.jamaisVu; });
      const parties = p.manquants.filter(function (m) { return !m.jamaisVu; });

      if (jamais.length > 0) {
        html += '<div style="font-size:12px;color:#9A9182;margin-top:6px">JAMAIS RATTACHÉES À LA PLATEFORME (' + jamais.length + ')</div>';
        html += jamais.map(function (m) {
          const msg = m.doublon
            ? 'Probable doublon de ' + m.doublon.id + ' — ' + m.doublon.titre + (m.doublon.annee ? ' (' + m.doublon.annee + ')' : '') +
              ', qui est bien vu sur la plateforme. Suggestion : retire cette fiche-ci.'
            : 'Cette fiche n\'a jamais été vue lors d\'un contrôle. Suggestion : vérifie le titre et l\'année (ils doivent coller à ce qu\'affiche la plateforme), ou retire-la si elle n\'y est pas.';
          return ligneManquant(m, msg);
        }).join("");
      }

      if (parties.length > 0) {
        html += '<div style="font-size:12px;color:#9A9182;margin-top:10px">PARTIES DE LA PLATEFORME (' + parties.length + ')</div>';
        html += parties.map(function (m) {
          return ligneManquant(m, 'Vue avant, absente du dernier contrôle : le film semble avoir quitté la plateforme. Suggestion : retire-la de CinéMaison.');
        }).join("");
      }
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
