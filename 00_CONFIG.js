/**
 * ============================================================
 * CinéMaison V4
 * Script : 00_CONFIG.gs
 * Rôle   : Configuration centrale
 * Version: 4.0.2
 *
 * Correctif 2026-09-05 :
 *   - ajout de la matrice DESTINATAIRES_EMAIL (destinatairesPourService_,
 *     initialiserDestinatairesEmailV1) : chaque adresse peut être
 *     cochée OUI/NON indépendamment sur les 5 types de mail
 *     (ModifsCanal, AlerteTechnique, ErreursActives, SyntheseJournal,
 *     Digest). Remplace EmailRapport (une seule adresse pour les 4
 *     mails techniques) -- reste utilisée comme repli tant que
 *     l'onglet n'a pas été créé, ou si aucune adresse n'est cochée
 *     pour un service donné.
 *
 * Correctif 2026-07-24 :
 *   - restauration de la configuration centrale CinéMaison ;
 *   - restauration de getSpreadsheet_() et getSheet_() ;
 *   - ajout de l'alias getRegleBool_() pour les scripts récents.
 * ============================================================
 */


const APP = Object.freeze({
  NOM: "CinéMaison",
  VERSION: "V4.0",
  MOTEUR: "V4",
  BUILD: "2026.07",
  ENVIRONNEMENT: "PRODUCTION"
});


const VERSION_APPLICATION = APP.VERSION;
const VERSION_MOTEUR = "V4.0.0";
const VERSION_CONNECTEURS = "V4.0.0";


// V2 : nettoyé des onglets AppSheet supprimés (FilmsAVerifier, FILTRES_EXPLORER,
// Explorer, ExplorerValeurs, Plateformes, AjoutTypes, Paramètres) — aucun
// d'entre eux n'était référencé ailleurs dans le code (audit confirmé).
const SHEETS = Object.freeze({
  FILMS: "Films",
  CONFIG: "CONFIG",
  REGLES: "REGLES",
  CONNECTEURS: "CONNECTEURS",
  COLONNES: "COLONNES",
  ARCHITECTURE: "ARCHITECTURE",
  JOURNAL: "JOURNAL",
  ERREURS: "ERREURS",
  DESTINATAIRES_EMAIL: "DESTINATAIRES_EMAIL"
});


const SHEET_FILMS = SHEETS.FILMS;
const SHEET_CONFIG = SHEETS.CONFIG;
const SHEET_REGLES = SHEETS.REGLES;
const SHEET_CONNECTEURS = SHEETS.CONNECTEURS;
const SHEET_COLONNES = SHEETS.COLONNES;
const SHEET_ARCHITECTURE = SHEETS.ARCHITECTURE;
const SHEET_JOURNAL = SHEETS.JOURNAL;
const SHEET_ERREURS = SHEETS.ERREURS;
const SHEET_DESTINATAIRES_EMAIL = SHEETS.DESTINATAIRES_EMAIL;


/**
 * Les 5 types de mails distincts envoyés par CinéMaison V2 — chacun
 * est une colonne OUI/NON dans l'onglet DESTINATAIRES_EMAIL (V1,
 * 05/09/2026). "ModifsCanal" et "Digest" sont les deux mails "utiles"
 * au quotidien ; les 3 autres sont des mails techniques/diagnostic.
 */
const SERVICES_EMAIL_V1 = Object.freeze([
  "ModifsCanal",
  "AlerteTechnique",
  "ErreursActives",
  "SyntheseJournal",
  "Digest"
]);


const CONFIG_CACHE_V4 = {
  regles: null,
  connecteurs: null,
  colonnes: null,
  config: null
};


function getSpreadsheet_() {
  return SpreadsheetApp.getActive();
}


function getSheet_(nom) {
  return getSpreadsheet_().getSheetByName(nom);
}


function resetConfigCacheV4_() {
  CONFIG_CACHE_V4.regles = null;
  CONFIG_CACHE_V4.connecteurs = null;
  CONFIG_CACHE_V4.colonnes = null;
  CONFIG_CACHE_V4.config = null;
}


/**
 * =========================
 * REGLES
 * =========================
 */


function getReglesV4_() {
  if (CONFIG_CACHE_V4.regles) return CONFIG_CACHE_V4.regles;


  const sheet = getSheet_(SHEETS.REGLES);
  const map = {};


  if (!sheet) {
    CONFIG_CACHE_V4.regles = map;
    return map;
  }


  const values = sheet.getDataRange().getValues();


  for (let i = 1; i < values.length; i++) {
    const cle = String(values[i][0] || "").trim();
    if (!cle) continue;
    map[cle] = values[i][1];
  }


  CONFIG_CACHE_V4.regles = map;
  return map;
}


function getRegle(cle, valeurDefaut) {
  const regles = getReglesV4_();
  const valeur = regles[cle];


  if (valeur === "" || valeur === null || valeur === undefined) {
    return valeurDefaut;
  }


  return valeur;
}


function getRegleNumber(cle, valeurDefaut) {
  const v = getRegle(cle, valeurDefaut);
  const n = Number(v);
  return isNaN(n) ? valeurDefaut : n;
}


function getRegleBool(cle, valeurDefaut) {
  const v = String(getRegle(cle, valeurDefaut ? "OUI" : "NON")).trim().toUpperCase();
  return ["OUI", "YES", "TRUE", "1", "AUTO"].includes(v);
}


/**
 * Compatibilité avec les scripts récents qui utilisent la convention
 * de nom interne terminée par un underscore.
 */
function getRegleBool_(cle, valeurDefaut) {
  return getRegleBool(cle, valeurDefaut);
}


/**
 * Compatibilité anciens scripts
 */


function maxFilmsParCycle_() {
  return getRegleNumber("MaxFilmsParCycle", 100);
}


function maxRevisionParCycle_() {
  return getRegleNumber("MaxRevisionParCycle", 20);
}


function maxDisponibilitesParCycle_() {
  return getRegleNumber("MaxConnecteursParCycle", 100);
}


function maxConnecteursParCycle_() {
  return getRegleNumber("MaxConnecteursParCycle", 100);
}


function maxTentatives_() {
  return getRegleNumber("MaxTentatives", 5);
}


function paysWatchProvider_() {
  return String(getRegle("PaysWatchProvider", "FR"));
}


/**
 * =========================
 * CONFIG historique
 * =========================
 */


function getConfigV4_() {
  if (CONFIG_CACHE_V4.config) return CONFIG_CACHE_V4.config;


  const sheet = getSheet_(SHEETS.CONFIG);
  const map = {};


  if (!sheet) {
    CONFIG_CACHE_V4.config = map;
    return map;
  }


  const values = sheet.getDataRange().getValues();


  for (let i = 1; i < values.length; i++) {
    const cle = String(values[i][0] || "").trim();
    if (!cle) continue;
    map[cle] = values[i][1];
  }


  CONFIG_CACHE_V4.config = map;
  return map;
}


function lireConfig_(cle, valeurDefaut) {
  const config = getConfigV4_();
  const valeur = config[cle];


  if (valeur === "" || valeur === null || valeur === undefined) {
    return valeurDefaut;
  }


  return valeur;
}


function ecrireConfig_(cle, valeur) {
  const sheet = getSheet_(SHEETS.CONFIG);
  if (!sheet) return;


  const values = sheet.getDataRange().getValues();


  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === cle) {
      sheet.getRange(i + 1, 2).setValue(valeur);
      CONFIG_CACHE_V4.config = null;
      return;
    }
  }


  sheet.appendRow([cle, valeur, "Ajouté automatiquement"]);
  CONFIG_CACHE_V4.config = null;
}


function emailRapport_() {
  return String(
    getRegle(
      "EmailRapport",
      lireConfig_("EmailRapport", Session.getActiveUser().getEmail())
    )
  );
}


/**
 * ============================================================
 * DESTINATAIRES EMAIL PAR SERVICE (V1, 05/09/2026)
 * ============================================================
 * Onglet DESTINATAIRES_EMAIL : une ligne par adresse, une colonne par
 * service (voir SERVICES_EMAIL_V1) avec "OUI"/"NON". Remplace le
 * système précédent où EmailRapport (une seule adresse, pour les 4
 * mails techniques) et DigestEmailDestinataires (une liste, pour le
 * digest uniquement) étaient gérés séparément et sans granularité.
 *
 * Tant que l'onglet n'a pas été créé (via initialiserDestinatairesEmailV1,
 * à lancer une seule fois manuellement), on retombe sur l'ancien
 * comportement -- rien ne casse si la migration n'a pas encore été
 * faite. Pareil si l'onglet existe mais qu'aucune adresse n'est cochée
 * OUI pour un service donné : on retombe sur emailRapport_() plutôt que
 * de renvoyer une liste vide (un mail technique qui part dans le vide
 * silencieusement est pire qu'un mail envoyé au mauvais endroit).
 *
 * Retourne une chaîne d'adresses séparées par des virgules, prête pour
 * MailApp.sendEmail({ to: ... }).
 */
function destinatairesPourService_(service) {
  if (SERVICES_EMAIL_V1.indexOf(service) === -1) {
    Logger.log(
      "AVERTISSEMENT destinatairesPourService_ : service inconnu \"" +
      service + "\" -- utilise EmailRapport par défaut."
    );
    return emailRapport_();
  }

  const sheet = getSheet_(SHEETS.DESTINATAIRES_EMAIL);

  if (!sheet) {
    // Onglet pas encore créé : ancien comportement.
    if (service === "Digest") {
      return String(lireConfig_("DigestEmailDestinataires", ""))
        .trim()
        .split(/[,;]/)
        .map(function(e) { return e.trim(); })
        .filter(Boolean)
        .join(",");
    }
    return emailRapport_();
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return emailRapport_();

  const entetes = data[0].map(function(e) { return String(e || "").trim(); });
  const colService = entetes.indexOf(service);
  const colAdresse = entetes.indexOf("Adresse");

  if (colService === -1 || colAdresse === -1) {
    Logger.log(
      "AVERTISSEMENT destinatairesPourService_ : colonne \"" + service +
      "\" ou \"Adresse\" introuvable dans DESTINATAIRES_EMAIL -- " +
      "utilise EmailRapport par défaut."
    );
    return emailRapport_();
  }

  const adresses = [];
  for (let i = 1; i < data.length; i++) {
    const adresse = String(data[i][colAdresse] || "").trim();
    const coche = String(data[i][colService] || "").trim().toUpperCase();
    if (adresse && coche === "OUI") adresses.push(adresse);
  }

  if (adresses.length === 0) return emailRapport_();

  return adresses.join(",");
}


/**
 * Mise en place à lancer UNE SEULE FOIS depuis l'éditeur Apps Script.
 * Crée l'onglet DESTINATAIRES_EMAIL et le pré-remplit à partir de la
 * config actuelle, pour ne rien perdre au moment de basculer :
 *   - l'adresse d'EmailRapport est cochée OUI sur les 4 services
 *     techniques (ModifsCanal, AlerteTechnique, ErreursActives,
 *     SyntheseJournal) -- exactement ce qu'elle recevait déjà ;
 *   - chaque adresse de DigestEmailDestinataires est cochée OUI sur
 *     Digest (fusionnée sur la même ligne si c'est la même adresse
 *     qu'EmailRapport).
 * Ne fait rien si l'onglet existe déjà (pour ne jamais écraser une
 * matrice que Ben aurait déjà modifiée à la main) -- relance
 * supprimerDestinatairesEmailV1() d'abord si tu veux vraiment repartir
 * de zéro.
 */
function initialiserDestinatairesEmailV1() {
  if (getSheet_(SHEETS.DESTINATAIRES_EMAIL)) {
    Logger.log(
      "DESTINATAIRES_EMAIL existe déjà -- rien fait. Supprime l'onglet " +
      "à la main (ou lance supprimerDestinatairesEmailV1()) si tu veux " +
      "relancer la migration depuis zéro."
    );
    return;
  }

  const sheet = getSpreadsheet_().insertSheet(SHEETS.DESTINATAIRES_EMAIL);
  const entetes = ["Adresse"].concat(SERVICES_EMAIL_V1);
  sheet.appendRow(entetes);
  sheet.getRange(1, 1, 1, entetes.length).setFontWeight("bold");
  sheet.setFrozenRows(1);

  const lignes = {}; // adresse (minuscule) -> { Adresse, ...services }

  const ligne_ = function(adresse) {
    const cle = adresse.trim().toLowerCase();
    if (!lignes[cle]) {
      const nouvelle = { Adresse: adresse.trim() };
      SERVICES_EMAIL_V1.forEach(function(s) { nouvelle[s] = "NON"; });
      lignes[cle] = nouvelle;
    }
    return lignes[cle];
  };

  const emailRapportActuel = emailRapport_();
  if (emailRapportActuel) {
    const l = ligne_(emailRapportActuel);
    l.ModifsCanal = "OUI";
    l.AlerteTechnique = "OUI";
    l.ErreursActives = "OUI";
    l.SyntheseJournal = "OUI";
  }

  String(lireConfig_("DigestEmailDestinataires", ""))
    .split(/[,;]/)
    .map(function(e) { return e.trim(); })
    .filter(Boolean)
    .forEach(function(adresse) {
      ligne_(adresse).Digest = "OUI";
    });

  Object.keys(lignes).forEach(function(cle) {
    const l = lignes[cle];
    sheet.appendRow([l.Adresse].concat(SERVICES_EMAIL_V1.map(function(s) {
      return l[s];
    })));
  });

  journal_(
    "CONFIG",
    "DESTINATAIRES_EMAIL",
    "MIGRATION_OK",
    "Onglet créé avec " + Object.keys(lignes).length + " adresse(s)"
  );
  Logger.log(
    "DESTINATAIRES_EMAIL créé avec " + Object.keys(lignes).length +
    " adresse(s). Vérifie l'onglet, ajoute Romy si besoin, puis coche " +
    "les services voulus."
  );
}


function supprimerDestinatairesEmailV1() {
  const sheet = getSheet_(SHEETS.DESTINATAIRES_EMAIL);
  if (!sheet) {
    Logger.log("DESTINATAIRES_EMAIL n'existe pas -- rien à supprimer.");
    return;
  }
  getSpreadsheet_().deleteSheet(sheet);
  Logger.log("DESTINATAIRES_EMAIL supprimé.");
}


/**
 * =========================
 * CONNECTEURS
 * =========================
 */


function getConnecteursV4_() {
  if (CONFIG_CACHE_V4.connecteurs) return CONFIG_CACHE_V4.connecteurs;


  const sheet = getSheet_(SHEETS.CONNECTEURS);
  const map = {};


  if (!sheet) {
    CONFIG_CACHE_V4.connecteurs = map;
    return map;
  }


  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    CONFIG_CACHE_V4.connecteurs = map;
    return map;
  }


  const h = headersMapSimpleV4_(data[0]);


  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(getByHeaderV4_(row, h, "Code") || getByHeaderV4_(row, h, "Connecteur") || "").trim();
    if (!code) continue;


    map[code.toUpperCase()] = {
      connecteur: getByHeaderV4_(row, h, "Connecteur"),
      code: code.toUpperCase(),
      actif: ouiNonV4_(getByHeaderV4_(row, h, "Actif")),
      statut: getByHeaderV4_(row, h, "Statut"),
      version: getByHeaderV4_(row, h, "Version"),
      prioriteRecherche: Number(getByHeaderV4_(row, h, "PrioritéRecherche") || 999),
      api: getByHeaderV4_(row, h, "API"),
      worker: ouiNonV4_(getByHeaderV4_(row, h, "Worker")),
      cacheHeures: Number(getByHeaderV4_(row, h, "Cache(h)") || 24),
      reessaiHeures: Number(getByHeaderV4_(row, h, "Réessai(h)") || 6),
      nbFilmsTestes: Number(getByHeaderV4_(row, h, "NbFilmsTestés") || 0),
      derniereVersion: getByHeaderV4_(row, h, "DernièreVersion"),
      mode: String(getByHeaderV4_(row, h, "Mode") || "OFF").toUpperCase(),
      prioriteAffichage: Number(getByHeaderV4_(row, h, "PrioritéAffichage") || 999),
      frequence: getByHeaderV4_(row, h, "Fréquence"),
      commentaire: getByHeaderV4_(row, h, "Commentaire")
    };
  }


  CONFIG_CACHE_V4.connecteurs = map;
  return map;
}


function getConnecteur(code) {
  const connecteurs = getConnecteursV4_();
  return connecteurs[String(code || "").toUpperCase()] || null;
}


function connecteurActif_(code) {
  const c = getConnecteur(code);
  return !!(c && c.actif && c.mode !== "OFF");
}


/**
 * =========================
 * COLONNES
 * =========================
 */


function getColonnesV4_() {
  if (CONFIG_CACHE_V4.colonnes) return CONFIG_CACHE_V4.colonnes;


  const sheet = getSheet_(SHEETS.COLONNES);
  const map = {};


  if (!sheet) {
    CONFIG_CACHE_V4.colonnes = map;
    return map;
  }


  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    CONFIG_CACHE_V4.colonnes = map;
    return map;
  }


  const h = headersMapSimpleV4_(data[0]);


  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const colonne = String(getByHeaderV4_(row, h, "Colonne") || "").trim();
    if (!colonne) continue;


    map[colonne] = {
      colonne,
      onglet: getByHeaderV4_(row, h, "Onglet"),
      type: getByHeaderV4_(row, h, "Type"),
      source: getByHeaderV4_(row, h, "Source"),
      scriptResponsable: getByHeaderV4_(row, h, "Script responsable"),
      manuel: ouiNonV4_(getByHeaderV4_(row, h, "Manuel")),
      calcule: ouiNonV4_(getByHeaderV4_(row, h, "Calculé")),
      peutEtreEcrase: ouiNonV4_(getByHeaderV4_(row, h, "Peut être écrasé")),
      priorite: Number(getByHeaderV4_(row, h, "Priorité") || 999),
      utiliseePar: getByHeaderV4_(row, h, "Utilisée par"),
      commentaires: getByHeaderV4_(row, h, "Commentaires"),
      module: getByHeaderV4_(row, h, "Module"),
      sourcePrioritaire: getByHeaderV4_(row, h, "SourcePrioritaire"),
      sourceSecondaire: getByHeaderV4_(row, h, "SourceSecondaire"),
      validation: getByHeaderV4_(row, h, "Validation"),
      criticite: getByHeaderV4_(row, h, "Criticité"),
      protection: getByHeaderV4_(row, h, "PROTECTION")
    };
  }


  CONFIG_CACHE_V4.colonnes = map;
  return map;
}


function getMetaColonne(colonne) {
  const colonnes = getColonnesV4_();
  return colonnes[colonne] || null;
}


function getProtectionColonne(colonne) {
  const meta = getMetaColonne(colonne);
  return meta ? String(meta.protection || "") : "";
}


/**
 * =========================
 * Architecture / validation
 * =========================
 */


function verifierArchitecture() {
  const ss = getSpreadsheet_();


  const feuillesObligatoires = [
    SHEETS.FILMS,
    SHEETS.CONFIG,
    SHEETS.REGLES,
    SHEETS.CONNECTEURS,
    SHEETS.COLONNES,
    SHEETS.ARCHITECTURE,
    SHEETS.JOURNAL,
    SHEETS.ERREURS
  ];


  const rapport = [];


  feuillesObligatoires.forEach(nom => {
    rapport.push((ss.getSheetByName(nom) ? "OK" : "MANQUANT") + " | Feuille | " + nom);
  });


  ["MaxFilmsParCycle", "MaxRevisionParCycle", "MaxConnecteursParCycle", "ProtectionManuelle"].forEach(cle => {
    rapport.push((getRegle(cle, "") !== "" ? "OK" : "MANQUANT") + " | REGLES | " + cle);
  });


  ["CANAL", "NETFLIX", "PRIME", "DISNEY"].forEach(code => {
    rapport.push((getConnecteur(code) ? "OK" : "MANQUANT") + " | CONNECTEURS | " + code);
  });


  ["Titre", "TMDbID", "DateDisponibiliteAuto", "CanalContentId"].forEach(col => {
    rapport.push((getMetaColonne(col) ? "OK" : "MANQUANT") + " | COLONNES | " + col);
  });


  Logger.log(rapport.join("\n"));
  return rapport.join("\n");
}


/**
 * =========================
 * Journalisation
 * =========================
 */


function logInfo(module, message) {
  Logger.log("INFO | " + module + " | " + message);
}


function logWarn(module, message) {
  Logger.log("WARN | " + module + " | " + message);
}


function logError(module, message) {
  Logger.log("ERROR | " + module + " | " + message);
}


/**
 * =========================
 * Helpers internes
 * =========================
 */


function headersMapSimpleV4_(headerRow) {
  const map = {};
  headerRow.forEach((name, index) => {
    const clean = String(name || "").trim();
    if (clean) map[clean] = index;
  });
  return map;
}


function getByHeaderV4_(row, h, name) {
  if (h[name] === undefined) return "";
  return row[h[name]];
}


function ouiNonV4_(v) {
  const s = String(v || "").trim().toUpperCase();
  return ["OUI", "YES", "TRUE", "1", "AUTO"].includes(s);
}






