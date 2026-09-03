/**
 * ============================================================
 * CinéMaison V4
 * Script : 00_CONFIG.gs
 * Rôle   : Configuration centrale
 * Version: 4.0.1
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
  ERREURS: "ERREURS"
});


const SHEET_FILMS = SHEETS.FILMS;
const SHEET_CONFIG = SHEETS.CONFIG;
const SHEET_REGLES = SHEETS.REGLES;
const SHEET_CONNECTEURS = SHEETS.CONNECTEURS;
const SHEET_COLONNES = SHEETS.COLONNES;
const SHEET_ARCHITECTURE = SHEETS.ARCHITECTURE;
const SHEET_JOURNAL = SHEETS.JOURNAL;
const SHEET_ERREURS = SHEETS.ERREURS;


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






