/**
 * ============================================================
 * CinéMaison V4
 * Script  : 33_CANAL_BLOCAGE_ET_RECONTROLE.js
 * Rôle    : Deux protections pour le contrôle CANAL+ quand Canal+
 *           refuse les requêtes du Worker (erreur HTTP 403) :
 *
 *   1. ALERTE « BLOCAGE MASSIF » : à la fin de chaque contrôle complet,
 *      si plus de la moitié des fiches contrôlées sont bloquées (403),
 *      et que c'est le cas sur 2 JOURS DIFFÉRENTS d'affilée, un mail
 *      clair est envoyé (une seule fois par épisode) ; un second mail
 *      annonce le retour à la normale.
 *      Contexte (31/10/2026) : du 29 au 31/10, 337 à 339 fiches sur ~340
 *      étaient en 403 chaque matin et personne n'avait été prévenu
 *      autrement que par une ligne dans le bilan.
 *
 *   2. RECONTRÔLE PAR PETITS LOTS des fiches bloquées : remplace la
 *      boucle unique (toutes les fiches d'un coup, qui dépassait la
 *      limite de 6 minutes d'Apps Script et ne laissait aucune trace).
 *      Lots de 25 fiches toutes les 5 minutes, avec une « sonde » : si
 *      les 5 premières fiches d'un lot sont encore toutes en 403, on
 *      s'arrête (inutile d'insister, cela prolongerait le blocage) et
 *      on réessaie 3 h plus tard, 3 fois au maximum. Mail de résultat à
 *      la fin, journal à chaque étape.
 *
 * Version : 1.0 (31/10/2026)
 * Dépend de : 06_CONNECTEURS_PLATEFORMES.js (controleCanalLigneV4_,
 *             supprimerDeclencheurCanalV4_, CANAL_MARQUEUR_403_V1,
 *             BUDGET_LOT_CANAL_MS_V41), 22_ACTIONS_CANAL_APP.js
 *             (CANAL_APP_DEST_SERVICE_V1), 00_CONFIG.js, 01_UTILS.js.
 * Aucun nouveau déploiement de la web app n'est nécessaire (déclencheurs
 * horaires uniquement).
 * ============================================================
 */

// ---------------------------------------------------------------
// 1. ALERTE BLOCAGE MASSIF
// ---------------------------------------------------------------

const CANAL_BLOCAGE_CLE_ETAT_V1 = "CanalBlocageEtat";
const CANAL_BLOCAGE_SEUIL_POURCENT_V1 = 50;   // « plus de la moitié »
const CANAL_BLOCAGE_JOURS_ALERTE_V1 = 2;      // jours différents d'affilée
const CANAL_BLOCAGE_MIN_FICHES_V1 = 20;       // en dessous : contrôle ignoré

/**
 * Décision pure (sans accès au Sheet ni aux mails), testable seule.
 * @param {{jours:number, dernierJour:string, depuis:string, alerte:string}} etat  état précédent
 * @param {{jour:string, traites:number, bloques:number}} mesure  contrôle qui vient de finir
 * @returns {{etat:Object, alerter:boolean, retourNormal:boolean}}
 */
function decisionBlocageMassifCanalV1_(etat, mesure, seuilPourcent, joursAlerte, minFiches) {
  const e = {
    jours: Number((etat && etat.jours) || 0),
    dernierJour: String((etat && etat.dernierJour) || ""),
    depuis: String((etat && etat.depuis) || ""),
    alerte: String((etat && etat.alerte) || "")
  };
  const traites = Number(mesure.traites || 0);
  const bloques = Number(mesure.bloques || 0);

  // Contrôle trop petit pour conclure : on ne touche à rien.
  if (traites < minFiches) return { etat: e, alerter: false, retourNormal: false };

  const massif = bloques * 100 > seuilPourcent * traites;
  if (massif) {
    if (e.dernierJour !== mesure.jour) {
      e.jours += 1;           // un nouveau jour de blocage (plusieurs contrôles le même jour = 1 seul jour)
      e.dernierJour = mesure.jour;
    }
    if (!e.depuis) e.depuis = mesure.jour;
    const alerter = e.jours >= joursAlerte && !e.alerte;
    if (alerter) e.alerte = mesure.jour;
    return { etat: e, alerter: alerter, retourNormal: false };
  }

  const retourNormal = !!e.alerte;
  return {
    etat: { jours: 0, dernierJour: "", depuis: "", alerte: "" },
    alerter: false,
    retourNormal: retourNormal
  };
}

function lireEtatBlocageCanalV1_() {
  try {
    const brut = String(lireConfig_(CANAL_BLOCAGE_CLE_ETAT_V1, "") || "");
    return brut ? JSON.parse(brut) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Appelée à la fin de chaque contrôle complet (terminerControleCompletCanalV4_).
 * @param {Object} etat  état du parcours (traites, bloques403, ...)
 */
function evaluerBlocageMassifCanalV1_(etat) {
  const seuil = getRegleNumber("CanalBlocageSeuilPourcent", CANAL_BLOCAGE_SEUIL_POURCENT_V1);
  const jour = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const mesure = {
    jour: jour,
    traites: Number(etat.traites || 0),
    bloques: Number(etat.bloques403 || 0)
  };
  const decision = decisionBlocageMassifCanalV1_(
    lireEtatBlocageCanalV1_(),
    mesure,
    seuil,
    CANAL_BLOCAGE_JOURS_ALERTE_V1,
    CANAL_BLOCAGE_MIN_FICHES_V1
  );
  ecrireConfig_(CANAL_BLOCAGE_CLE_ETAT_V1, JSON.stringify(decision.etat));

  journal_(
    "CONNECTEURS",
    "CANAL_BLOCAGE_MASSIF",
    decision.alerter ? "ALERTE" : (decision.retourNormal ? "RETOUR_NORMAL" : "OK"),
    "Bloquées=" + mesure.bloques + "/" + mesure.traites +
    " | jours d'affilée=" + decision.etat.jours
  );

  if (decision.alerter) envoyerMailBlocageMassifCanalV1_(mesure, decision.etat);
  if (decision.retourNormal) envoyerMailRetourNormalCanalV1_(mesure);
}

function envoyerMailBlocageMassifCanalV1_(mesure, etat) {
  const email = destinatairesPourService_("AlerteTechnique");
  const pourcent = mesure.traites > 0 ? Math.round(mesure.bloques * 100 / mesure.traites) : 0;
  const corps =
    "CinéMaison - ALERTE CANAL+ : accès bloqué\n\n" +
    "Canal+ refuse presque toutes les requêtes du contrôle depuis " +
    etat.jours + " jours de suite (depuis le " + etat.depuis + ").\n" +
    "Dernier contrôle : " + mesure.bloques + " fiches bloquées sur " +
    mesure.traites + " (" + pourcent + " %).\n\n" +
    "Ce que ça veut dire :\n" +
    "- Les dates de départ Canal+ ne sont plus mises à jour : les anciennes " +
    "dates sont conservées, mais elles vieillissent. Un film qui part plus " +
    "tôt que prévu ne sera pas signalé.\n" +
    "- Rien n'est effacé ni modifié par erreur.\n\n" +
    "Que faire :\n" +
    "1. Dans l'éditeur Apps Script, ouvre le fichier 06_CONNECTEURS_PLATEFORMES " +
    "et lance la fonction testCanalEnrichCloudflare (une seule requête). " +
    "Regarde le code « httpStatus » dans le journal : 403 = Canal+ refuse, " +
    "401 = clé de session expirée.\n" +
    "2. Si c'est 403 ou 401 : recopie les valeurs d'une vraie session Canal+ " +
    "(F12 > Réseau > une requête /actionLayout/) dans les secrets du Worker " +
    "Cloudflare : CANAL_ACTION_PASS, CANAL_TOKENPASS, CANAL_HODOR_COOKIE.\n" +
    "3. Ne lance pas de contrôle complet tant que l'accès est bloqué : " +
    "cela ne servirait à rien et peut prolonger le blocage.\n\n" +
    "Ce mail n'est envoyé qu'une fois par épisode. Un autre mail t'avertira " +
    "quand Canal+ répondra de nouveau normalement.";
  MailApp.sendEmail({
    to: email,
    subject: "CinéMaison - V2 - ALERTE CANAL+ : accès bloqué depuis " + etat.jours + " jours",
    body: corps
  });
  journal_("MAILS", "CANAL_ALERTE_BLOCAGE_MASSIF", "OK",
    "Alerte envoyée | bloquées=" + mesure.bloques + "/" + mesure.traites);
}

function envoyerMailRetourNormalCanalV1_(mesure) {
  const email = destinatairesPourService_("AlerteTechnique");
  MailApp.sendEmail({
    to: email,
    subject: "CinéMaison - V2 - CANAL+ : l'accès fonctionne de nouveau",
    body:
      "CinéMaison - CANAL+\n\n" +
      "Bonne nouvelle : le dernier contrôle complet n'a plus que " +
      mesure.bloques + " fiche(s) bloquée(s) sur " + mesure.traites +
      ". Les dates de départ Canal+ sont de nouveau mises à jour."
  });
  journal_("MAILS", "CANAL_RETOUR_NORMAL", "OK",
    "Mail envoyé | bloquées=" + mesure.bloques + "/" + mesure.traites);
}

/** À lancer à la main si besoin : repart de zéro pour le suivi du blocage. */
function reinitialiserSuiviBlocageCanalV1() {
  ecrireConfig_(CANAL_BLOCAGE_CLE_ETAT_V1, "");
  Logger.log("Suivi du blocage Canal+ remis à zéro.");
}

// ---------------------------------------------------------------
// 2. RECONTRÔLE DES FICHES BLOQUÉES PAR PETITS LOTS
// ---------------------------------------------------------------

const CANAL_RECONTROLE_CLE_ETAT_V1 = "CanalRecontrole403Etat";
const CANAL_RECONTROLE_HANDLER_V1 = "continuerRecontrole403LotsV1";
const CANAL_RECONTROLE_LOT_V1 = 25;            // fiches par lot
const CANAL_RECONTROLE_PAUSE_LOTS_MIN_V1 = 5;  // minutes entre deux lots
const CANAL_RECONTROLE_SONDE_V1 = 5;           // fiches d'essai au début d'un lot
const CANAL_RECONTROLE_ATTENTE_MIN_V1 = 180;   // attente si Canal+ bloque encore
const CANAL_RECONTROLE_TENTATIVES_MAX_V1 = 3;  // essais « Canal+ bloque encore »
const CANAL_RECONTROLE_LISTE_MAX_V1 = 60;      // fiches mémorisées pour le mail

function lireEtatRecontrole403V1_() {
  try {
    const brut = String(lireConfig_(CANAL_RECONTROLE_CLE_ETAT_V1, "") || "");
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    return null;
  }
}

function sauverEtatRecontrole403V1_(etat) {
  ecrireConfig_(CANAL_RECONTROLE_CLE_ETAT_V1, etat ? JSON.stringify(etat) : "");
}

function programmerRecontrole403V1_(minutes) {
  supprimerDeclencheurCanalV4_(CANAL_RECONTROLE_HANDLER_V1);
  try {
    ScriptApp.newTrigger(CANAL_RECONTROLE_HANDLER_V1)
      .timeBased()
      .after(minutes * 60 * 1000)
      .create();
  } catch (err) {
    erreur_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "Programmation du prochain lot", String(err));
  }
}

/** IDs des fiches CANAL+ bloquées (403) ou « à vérifier » : les mêmes critères que recontrolerFichesCanalAVerifierV1. */
function listerFichesCanalARecontrolerV1_() {
  const sheet = getSheet_(SHEETS.FILMS);
  const data = sheet.getDataRange().getValues();
  const h = headers_(data[0]);
  const liste = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (normalizePlatform_(get_(row, h, "Plateforme")) !== "CANAL+") continue;
    const statut = String(get_(row, h, "StatutDisponibiliteAuto") || "").trim();
    const bloquee = String(get_(row, h, "CommentaireDisponibilite") || "").indexOf(CANAL_MARQUEUR_403_V1) === 0;
    if (statut !== "A_VERIFIER_CANAL" && !bloquee) continue;
    liste.push(String(get_(row, h, "ID") || ""));
  }
  return liste.filter(function (id) { return id; });
}

/**
 * Point d'entrée : lance une séance de recontrôle (appelé par le déclencheur
 * « 1 h après le contrôle complet », ou à la main depuis l'éditeur).
 * Le premier lot part tout de suite.
 */
function demarrerRecontrole403LotsV1() {
  const ids = listerFichesCanalARecontrolerV1_();
  if (ids.length === 0) {
    journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "RIEN_A_FAIRE", "Aucune fiche bloquée ou à vérifier");
    return false;
  }
  sauverEtatRecontrole403V1_({
    actif: true,
    demarreLe: new Date().toISOString(),
    ids: ids,
    total: ids.length,
    examinees: 0,
    debloquees: 0,
    tentativesBlocage: 0,
    encore: []
  });
  journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "DEMARRAGE", "Fiches à recontrôler=" + ids.length);
  return continuerRecontrole403LotsV1();
}

/** Traite UN lot, puis programme le suivant (ou termine). Appelée par le déclencheur. */
function continuerRecontrole403LotsV1() {
  supprimerDeclencheurCanalV4_(CANAL_RECONTROLE_HANDLER_V1);
  const etat = lireEtatRecontrole403V1_();
  if (!etat || !etat.actif) return false;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    // Un contrôle complet tourne : on repasse après lui.
    journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "ATTENTE", "Un autre contrôle CANAL+ est en cours, nouvel essai dans " + CANAL_RECONTROLE_PAUSE_LOTS_MIN_V1 + " min");
    programmerRecontrole403V1_(CANAL_RECONTROLE_PAUSE_LOTS_MIN_V1);
    return false;
  }

  try {
    const sheet = getSheet_(SHEETS.FILMS);
    const data = sheet.getDataRange().getValues();
    const h = headers_(data[0]);
    const indexParId = {};
    for (let i = 1; i < data.length; i++) {
      indexParId[String(get_(data[i], h, "ID") || "")] = i;
    }

    const debut = Date.now();
    const lot = etat.ids.slice(0, CANAL_RECONTROLE_LOT_V1);
    let consommees = 0;
    let okDansLeLot = 0;
    let bloqueesDansLeLot = 0;
    let sondeBloquee = false;
    const nouvellesEncore = [];

    for (let k = 0; k < lot.length; k++) {
      if (Date.now() - debut > BUDGET_LOT_CANAL_MS_V41) break;

      const id = lot[k];
      const index = indexParId[id];
      if (index === undefined) { consommees++; continue; }   // fiche supprimée entre-temps

      const row = data[index];
      let statut = "";
      try {
        statut = controleCanalLigneV4_(sheet, index + 1, row, h).statut;
      } catch (err) {
        statut = "ERREUR_CANAL";
        erreur_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "Erreur fiche " + id, String(err));
      }

      const encoreBloquee = statut === "BLOQUE_403" || statut === "A_VERIFIER_CANAL" || statut === "ERREUR_CANAL";
      if (encoreBloquee) {
        bloqueesDansLeLot++;
        nouvellesEncore.push({ id: id, titre: String(cleanTitle_(get_(row, h, "Titre")) || ""), statut: statut });
      } else {
        okDansLeLot++;
      }
      consommees++;
      Utilities.sleep(1500);

      // Sonde : tant que rien n'a été débloqué, si les premières fiches du
      // lot sont toutes encore refusées, on arrête là sans insister.
      if (etat.debloquees === 0 && okDansLeLot === 0 && consommees >= CANAL_RECONTROLE_SONDE_V1 && bloqueesDansLeLot >= CANAL_RECONTROLE_SONDE_V1) {
        sondeBloquee = true;
        break;
      }
    }

    if (sondeBloquee) {
      // On ne « consomme » rien : ces fiches seront revues au prochain essai.
      etat.tentativesBlocage = Number(etat.tentativesBlocage || 0) + 1;
      journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "SONDE_BLOQUEE",
        "Les " + CANAL_RECONTROLE_SONDE_V1 + " premières fiches sont encore en 403 | essai " +
        etat.tentativesBlocage + "/" + CANAL_RECONTROLE_TENTATIVES_MAX_V1);
      if (etat.tentativesBlocage >= CANAL_RECONTROLE_TENTATIVES_MAX_V1) {
        etat.encore = nouvellesEncore.slice(0, CANAL_RECONTROLE_LISTE_MAX_V1);
        return terminerRecontrole403LotsV1_(etat, "Canal+ refuse toujours les requêtes après " + etat.tentativesBlocage + " essais espacés de " + Math.round(CANAL_RECONTROLE_ATTENTE_MIN_V1 / 60) + " h.");
      }
      sauverEtatRecontrole403V1_(etat);
      programmerRecontrole403V1_(CANAL_RECONTROLE_ATTENTE_MIN_V1);
      return false;
    }

    etat.ids = etat.ids.slice(consommees);
    etat.examinees = Number(etat.examinees || 0) + consommees;
    etat.debloquees = Number(etat.debloquees || 0) + okDansLeLot;
    etat.encore = (etat.encore || []).concat(nouvellesEncore).slice(0, CANAL_RECONTROLE_LISTE_MAX_V1);

    journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "LOT",
      "Lot de " + consommees + " | débloquées=" + okDansLeLot + " | encore bloquées=" + bloqueesDansLeLot +
      " | restantes=" + etat.ids.length);

    if (etat.ids.length === 0) {
      return terminerRecontrole403LotsV1_(etat, "");
    }
    sauverEtatRecontrole403V1_(etat);
    programmerRecontrole403V1_(CANAL_RECONTROLE_PAUSE_LOTS_MIN_V1);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function terminerRecontrole403LotsV1_(etat, raisonArret) {
  etat.actif = false;
  etat.termineLe = new Date().toISOString();
  sauverEtatRecontrole403V1_(etat);
  supprimerDeclencheurCanalV4_(CANAL_RECONTROLE_HANDLER_V1);

  const encoreTotal = (etat.encore || []).length;
  journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "TERMINE",
    "Examinées=" + (etat.examinees || 0) + "/" + (etat.total || 0) +
    " | débloquées=" + (etat.debloquees || 0) + " | encore bloquées=" + encoreTotal +
    (raisonArret ? " | arrêt : " + raisonArret : ""));

  try {
    envoyerMailRecontrole403LotsV1_(etat, raisonArret);
  } catch (err) {
    erreur_("MAILS", "CANAL_RECONTROLE_LOTS", "Mail de résultat", String(err));
  }
  return true;
}

function envoyerMailRecontrole403LotsV1_(etat, raisonArret) {
  const email = destinatairesPourService_(CANAL_APP_DEST_SERVICE_V1);
  if (!email) return;
  const liste = (etat.encore || []).slice(0, 40).map(function (f) {
    return "  - " + f.id + " " + f.titre;
  }).join("\n");
  const restantes = (etat.ids || []).length;
  const corps =
    "CinéMaison - Recontrôle CANAL+ des fiches bloquées\n\n" +
    (raisonArret
      ? "⚠ Recontrôle ARRÊTÉ : " + raisonArret + "\n" +
        "Il reste " + restantes + " fiche(s) non recontrôlée(s). Rien n'a été modifié : les anciennes dates sont conservées.\n" +
        "Voir l'alerte « accès bloqué » pour la marche à suivre.\n\n"
      : "✓ Recontrôle terminé.\n\n") +
    "Fiches examinées : " + (etat.examinees || 0) + " sur " + (etat.total || 0) + "\n" +
    "Débloquées (date relue) : " + (etat.debloquees || 0) + "\n" +
    "Encore bloquées ou à vérifier : " + (etat.encore || []).length +
    (liste ? "\n" + liste : "") + "\n";
  MailApp.sendEmail({
    to: email,
    subject: "CinéMaison - V2 - CANAL+ : recontrôle des fiches bloquées" +
      (raisonArret ? " (arrêté, Canal+ bloque encore)" : " (" + (etat.debloquees || 0) + " débloquées)"),
    body: corps
  });
  journal_("MAILS", "CANAL_RECONTROLE_LOTS", "OK", "Mail envoyé | débloquées=" + (etat.debloquees || 0));
}

/** Abandonne une séance en cours (appelée quand un nouveau contrôle complet démarre, ou à la main). */
function annulerRecontrole403LotsV1_(motif) {
  const etat = lireEtatRecontrole403V1_();
  if (!etat || !etat.actif) return false;
  etat.actif = false;
  etat.arreteLe = new Date().toISOString();
  sauverEtatRecontrole403V1_(etat);
  supprimerDeclencheurCanalV4_(CANAL_RECONTROLE_HANDLER_V1);
  journal_("CONNECTEURS", "CANAL_RECONTROLE_LOTS", "ANNULE", String(motif || "") + " | restantes=" + (etat.ids || []).length);
  return true;
}

/** À lancer à la main si besoin : arrête le recontrôle en cours. */
function arreterRecontrole403LotsV1() {
  return annulerRecontrole403LotsV1_("Arrêt manuel");
}
