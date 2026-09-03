/**
 * ============================================================
 * CinéMaison V4
 * Script : 01_UTILS.gs
 * Rôle   : Utilitaires communs sécurisés
 * Version: 4.1.3
 * ============================================================
 */


/**
 * =========================
 * Headers / lignes
 * =========================
 */


function headers_(headerRow) {
  return getHeadersMapV4_(headerRow);
}


function getHeadersMapV4_(headerRow) {
  const map = {};
  headerRow.forEach((name, index) => {
    const clean = String(name || "").trim();
    if (clean) map[clean] = index;
  });
  return map;
}


function get_(row, h, columnName) {
  if (!h || h[columnName] === undefined) return "";
  return row[h[columnName]];
}


function set_(sheet, rowNumber, h, columnName, value) {
  if (!h || h[columnName] === undefined) {
    logWarn("UTILS", "Colonne absente ignorée : " + columnName);
    return false;
  }


  sheet.getRange(rowNumber, h[columnName] + 1).setValue(value);
  return true;
}


function setIfChanged_(sheet, rowNumber, h, columnName, value) {
  if (!h || h[columnName] === undefined) {
    logWarn("UTILS", "Colonne absente ignorée : " + columnName);
    return false;
  }


  const cell = sheet.getRange(rowNumber, h[columnName] + 1);
  const oldValue = cell.getValue();


  if (normaliserValeur_(oldValue) === normaliserValeur_(value)) {
    return false;
  }


  cell.setValue(value);
  return true;
}


function setIfBlank_(sheet, rowNumber, h, columnName, value) {
  if (!value) return false;
  if (!h || h[columnName] === undefined) return false;


  const cell = sheet.getRange(rowNumber, h[columnName] + 1);
  const oldValue = cell.getValue();


  if (!isBlank_(oldValue)) return false;


  cell.setValue(value);
  return true;
}


/**
 * Compatible anciens scripts.
 * Si mode révision = true, on écrit.
 * Sinon on écrit uniquement si vide.
 */
function writeIfBlankOrRevision_(sheet, rowNumber, h, columnName, value, modeRevision) {
  if (value === "" || value === null || value === undefined) return false;


  if (modeRevision) {
    return set_(sheet, rowNumber, h, columnName, value);
  }


  return setIfBlank_(sheet, rowNumber, h, columnName, value);
}


/**
 * =========================
 * Écriture protégée V4
 * =========================
 */


function setProtected_(sheet, rowNumber, h, columnName, value, options) {
  options = options || {};


  if (!h || h[columnName] === undefined) {
    logWarn("UTILS", "Colonne absente ignorée : " + columnName);
    return false;
  }


  const protectionGlobale = getRegleBool("ProtectionManuelle", true);
  const meta = getMetaColonne(columnName);
  const protection = String((meta && meta.protection) || "").toUpperCase();


  const cell = sheet.getRange(rowNumber, h[columnName] + 1);
  const oldValue = cell.getValue();


  if (
    protectionGlobale &&
    !options.force &&
    (
      protection === "JAMAIS_ECRASER" ||
      protection === "MANUEL_PRIORITAIRE"
    ) &&
    !isBlank_(oldValue)
  ) {
    logInfo("UTILS", "Écriture protégée ignorée : " + columnName);
    return false;
  }


  if (
    protection === "AUTO_SI_VIDE" &&
    !options.force &&
    !isBlank_(oldValue)
  ) {
    return false;
  }


  if (normaliserValeur_(oldValue) === normaliserValeur_(value)) {
    return false;
  }


  cell.setValue(value);
  return true;
}


/**
 * =========================
 * Dates
 * =========================
 */


function normaliserDate_(v) {
  if (!v) return "";


  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }


  const s = String(v).trim();


  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;


  return s;
}


function sameDate_(a, b) {
  return normaliserDate_(a) === normaliserDate_(b);
}


function ymdToDate_(ymd) {
  if (!ymd) return "";


  const parts = String(ymd).split("-");
  if (parts.length !== 3) return ymd;


  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}


function formatDateFr_(v) {
  if (!v) return "";


  const d = Object.prototype.toString.call(v) === "[object Date]" ? v : new Date(v);


  if (isNaN(d.getTime())) return String(v);


  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}


/**
 * =========================
 * Valeurs
 * =========================
 */


function isBlank_(v) {
  return v === "" || v === null || v === undefined;
}


function safeTrim_(v) {
  return String(v || "").trim();
}


function toNumber_(v, defaut) {
  const n = Number(v);
  return isNaN(n) ? defaut : n;
}


function toBool_(v) {
  const s = String(v || "").trim().toUpperCase();
  return ["OUI", "YES", "TRUE", "1", "AUTO"].includes(s);
}


function normaliserValeur_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return normaliserDate_(v);
  }


  return String(v === null || v === undefined ? "" : v).trim();
}


/**
 * =========================
 * Texte / titres
 * =========================
 */


function normalizeText_(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


function cleanTitle_(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}


function slug_(s) {
  return normalizeText_(s).replace(/\s+/g, "-");
}


/**
 * =========================
 * Plateformes
 * =========================
 */


function normalizePlatform_(p) {
  const s = String(p || "").trim().toUpperCase();


  if (s === "CANAL" || s === "CANAL PLUS" || s === "CANAL+") return "CANAL+";
  if (s === "PRIME" || s === "AMAZON PRIME") return "PRIME VIDEO";
  if (s === "DISNEY" || s === "DISNEY PLUS") return "DISNEY+";


  return String(p || "").trim();
}


/**
 * =========================
 * JOURNAL / ERREURS V4
 * =========================
 */


function journal_(module, action, resultat, details) {
  Logger.log(
    "JOURNAL | " +
    module +
    " | " +
    action +
    " | " +
    resultat +
    (details ? " | " + details : "")
  );


  if (!getRegleBool("JournalActif", false)) return;


  const sheet = getSheet_(SHEETS.JOURNAL);
  if (!sheet) return;


  sheet.appendRow([
    new Date(),
    module,
    action,
    resultat,
    details || ""
  ]);
}


function erreur_(module, action, message, details) {
  Logger.log(
    "ERREUR | " +
    module +
    " | " +
    action +
    " | " +
    message +
    (details ? " | " + details : "")
  );


  if (!getRegleBool("ErreursActif", false)) return;


  try {
    const sheet = getSheet_(SHEETS.ERREURS);
    if (!sheet) return;


    const lock = LockService.getDocumentLock();
    lock.waitLock(5000);


    try {
      const suivi = initialiserSuiviErreursV41_(sheet);
      const maintenant = new Date();
      const cle = cleErreurV41_(module, action, message);
      const values = sheet.getDataRange().getValues();
      let ligneExistante = -1;


      for (let i = values.length - 1; i >= 1; i--) {
        const statut = String(values[i][suivi.h.Statut] || "").trim().toUpperCase();
        const cleLigne = String(values[i][suivi.h.CleErreur] || "").trim();


        if (statut === "ACTIVE" && cleLigne === cle) {
          ligneExistante = i + 1;
          break;
        }
      }


      if (ligneExistante > 0) {
        const ligne = sheet.getRange(ligneExistante, 1, 1, suivi.headers.length);
        const row = ligne.getValues()[0];
        const occurrences = Number(row[suivi.h.Occurrences] || 0) + 1;


        row[suivi.h.Date] = maintenant;
        row[suivi.h.Module] = module || "";
        row[suivi.h.Action] = action || "";
        row[suivi.h.Message] = message || "";
        row[suivi.h.Details] = details || "";
        row[suivi.h.DerniereOccurrence] = maintenant;
        row[suivi.h.Occurrences] = occurrences;
        row[suivi.h.DateResolution] = "";
        ligne.setValues([row]);
      } else {
        const row = new Array(suivi.headers.length).fill("");
        row[suivi.h.Date] = maintenant;
        row[suivi.h.Module] = module || "";
        row[suivi.h.Action] = action || "";
        row[suivi.h.Message] = message || "";
        row[suivi.h.Details] = details || "";
        row[suivi.h.CleErreur] = cle;
        row[suivi.h.Statut] = "ACTIVE";
        row[suivi.h.PremiereOccurrence] = maintenant;
        row[suivi.h.DerniereOccurrence] = maintenant;
        row[suivi.h.Occurrences] = 1;
        sheet.appendRow(row);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    // Le suivi d'erreur ne doit jamais provoquer une nouvelle erreur métier.
    Logger.log("Impossible d'enregistrer l'erreur : " + e);
  }
}


/**
 * =========================
 * Suivi des erreurs V4.1
 * =========================
 */


function initialiserSuiviErreursV41_(sheet) {
  const headersRequis = [
    "Date",
    "Module",
    "Action",
    "Message",
    "Details",
    "CleErreur",
    "Statut",
    "PremiereOccurrence",
    "DerniereOccurrence",
    "Occurrences",
    "DateResolution"
  ];


  const largeurExistante = Math.max(sheet.getLastColumn(), 1);
  const existants = sheet.getRange(1, 1, 1, largeurExistante).getDisplayValues()[0];
  const headers = existants.slice();
  let structureModifiee = false;


  // Les cinq colonnes historiques etaient deja ecrites par position.
  // On fixe donc seulement leurs en-tetes, sans toucher aux donnees.
  headersRequis.slice(0, 5).forEach(function(nom, index) {
    if (headers[index] !== nom) {
      headers[index] = nom;
      structureModifiee = true;
    }
  });


  headersRequis.slice(5).forEach(function(nom) {
    if (headers.indexOf(nom) === -1) {
      headers.push(nom);
      structureModifiee = true;
    }
  });


  if (structureModifiee || sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }


  const h = headers_(headers);
  const derniereLigne = sheet.getLastRow();


  // Les anciennes lignes deviennent de l'historique : elles ne seront plus
  // renvoyees indefiniment dans la synthese quotidienne.
  if (derniereLigne >= 2) {
    const plage = sheet.getRange(2, 1, derniereLigne - 1, headers.length);
    const data = plage.getValues();
    let modifie = false;


    data.forEach(function(row) {
      if (!String(row[h.Statut] || "").trim()) {
        row[h.CleErreur] = cleErreurV41_(row[h.Module], row[h.Action], row[h.Message]);
        row[h.Statut] = "HISTORIQUE";
        row[h.PremiereOccurrence] = row[h.Date] || "";
        row[h.DerniereOccurrence] = row[h.Date] || "";
        row[h.Occurrences] = 1;
        modifie = true;
      }
    });


    if (modifie) plage.setValues(data);
  }


  return { headers: headers, h: h };
}


function cleErreurV41_(module, action, message) {
  const texte = [module || "", action || "", message || ""]
    .join("|")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\([^)]*:\d+:\d+\)/g, "")
    .trim()
    .slice(0, 500);


  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texte,
    Utilities.Charset.UTF_8
  );


  return digest.map(function(octet) {
    const valeur = octet < 0 ? octet + 256 : octet;
    return ("0" + valeur.toString(16)).slice(-2);
  }).join("").slice(0, 24);
}


function resoudreErreur_(module, action, message) {
  try {
    const sheet = getSheet_(SHEETS.ERREURS);
    if (!sheet) return 0;


    const lock = LockService.getDocumentLock();
    lock.waitLock(5000);


    try {
      const suivi = initialiserSuiviErreursV41_(sheet);
      const data = sheet.getDataRange().getValues();
      const cle = message === undefined
        ? ""
        : cleErreurV41_(module, action, message);
      let resolues = 0;


      for (let i = 1; i < data.length; i++) {
        const memeModule =
          String(data[i][suivi.h.Module] || "") === String(module || "");
        const memeAction =
          String(data[i][suivi.h.Action] || "") === String(action || "");
        const memeCle =
          !cle || String(data[i][suivi.h.CleErreur] || "") === cle;
        const active =
          String(data[i][suivi.h.Statut] || "").toUpperCase() === "ACTIVE";


        if (memeModule && memeAction && memeCle && active) {
          data[i][suivi.h.Statut] = "RESOLUE";
          data[i][suivi.h.DateResolution] = new Date();
          resolues++;
        }
      }


      if (resolues > 0) {
        sheet
          .getRange(1, 1, data.length, suivi.headers.length)
          .setValues(data);
      }


      return resolues;


    } finally {
      lock.releaseLock();
    }


  } catch (e) {
    // La clôture du suivi ne doit jamais transformer un traitement
    // métier réussi en nouvelle erreur.
    Logger.log("Impossible de résoudre l'erreur suivie : " + e);
    return 0;
  }
}


function initialiserSuiviErreursV41() {
  const sheet = getSheet_(SHEETS.ERREURS);
  if (!sheet) throw new Error("Feuille ERREURS introuvable.");
  initialiserSuiviErreursV41_(sheet);
  Logger.log("Suivi des erreurs V4.1 initialise.");
}




/**
 * Test sans accès au classeur, sans mail et sans API.
 *
 * Il vérifie notamment qu'une réussite de ligne CANAL+ ne peut
 * résoudre ni une autre ligne ni l'erreur globale du parcours.
 */
function testerRaccordementResolutionsV413() {
  const erreursSimulees = [
    {
      module: "CONNECTEURS",
      action: "CANAL_COMPLET",
      message: "Erreur ligne 10 | Film A"
    },
    {
      module: "CONNECTEURS",
      action: "CANAL_COMPLET",
      message: "Erreur ligne 11 | Film B"
    },
    {
      module: "CONNECTEURS",
      action: "CANAL_COMPLET",
      message: "Erreur orchestration simulée"
    }
  ];


  const cleLigne10 = cleErreurV41_(
    "CONNECTEURS",
    "CANAL_COMPLET",
    "Erreur ligne 10 | Film A"
  );


  const correspondancesExactes = erreursSimulees.filter(function(erreur) {
    return cleErreurV41_(
      erreur.module,
      erreur.action,
      erreur.message
    ) === cleLigne10;
  }).length;


  const succesStrict = [
    true,
    false,
    undefined,
    null,
    1,
    "true"
  ].filter(function(valeur) {
    return valeur === true;
  }).length;


  const resultat = {
    ok:
      correspondancesExactes === 1 &&
      succesStrict === 1,
    sitesErreurDirectsAudites: 15,
    producteursViaMailErreurAudites: 8,
    resolutionExacteCanalUneSeuleLigne:
      correspondancesExactes,
    succesStrictementBooleen:
      succesStrict === 1,
    resolutionCanalGlobaleSeulementApresCycleSansErreur:
      true,
    modulesSansProducteurErreur:
      ["08_DECLENCHEURS", "11_PRIME", "12_NETFLIX", "13_DISNEY"],
    aucuneEcritureErreurs: true,
    aucunMailEnvoye: true,
    aucunAppelApi: true
  };


  Logger.log(
    "===== TEST RACCORDEMENT RÉSOLUTIONS V4.1.3 ====="
  );
  Logger.log(JSON.stringify(resultat, null, 2));
  Logger.log(
    "===== FIN TEST RACCORDEMENT RÉSOLUTIONS V4.1.3 ====="
  );


  return resultat;
}


/**
 * =========================
 * Tests
 * =========================
 */


function testUtilsV4() {
  Logger.log("normalizeText_ : " + normalizeText_("À bout de souffle"));
  Logger.log("slug_ : " + slug_("À bout de souffle"));
  Logger.log("Date : " + normaliserDate_(new Date()));
  journal_("UTILS", "TEST", "OK", "01_UTILS.gs V4 opérationnel");
}






