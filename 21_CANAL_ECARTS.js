/**
 * ============================================================
 * CinéMaison V4
 * Script  : 21_CANAL_ECARTS.js
 * Rôle    : Rapport "CANAL+ écarts" -- repère les fiches CinéMaison
 *           marquées CANAL+ qui ne figurent PAS dans "Ma Liste" Canal+
 *           au dernier scan (canal.js). Écrit le détail dans l'onglet
 *           CANAL_ECARTS et envoie un mail de synthèse avec, pour
 *           chaque fiche : n° FILMxxxx, titre, affiche, date de fin de
 *           disponibilité, plateforme, raison probable, et un lien
 *           "Retirer de CinéMaison" (même page de confirmation que le
 *           rapport "Écarts plateformes", api/confirm.js?page=remove).
 * Version : 1.0 (07/10/2026)
 *
 * D'où viennent les fiches "vues" : canal.js envoie, avec son appel
 * habituel "alerteSuggestionsStreaming", la liste des ID CinéMaison
 * reconnus dans Ma Liste (champ idsVus). 09_WEBHOOK.js la confie à
 * enregistrerDernierScanCanalV1_ (ci-dessous), qui la mémorise dans
 * l'onglet CANAL_DERNIER_SCAN. Tant qu'aucun scan n'a été enregistré
 * (ancien canal.js), le rapport fonctionne quand même sur le seul
 * critère "date de fin dépassée", et le dit dans le mail.
 *
 * Lancement :
 *  - depuis l'application : Réglages > RAPPORTS À LA DEMANDE >
 *    "CANAL+ ÉCARTS" (action webhook "rapportCanalEcarts") ;
 *  - ou à la main depuis l'éditeur Apps Script :
 *    genererEtEnvoyerRapportCanalEcartsV1().
 *
 * Ne supprime JAMAIS rien tout seul : la suppression ne se fait que
 * sur un vrai clic humain dans la page de confirmation.
 * ============================================================
 */

const CANAL_ECARTS_FEUILLE_V1 = "CANAL_ECARTS";
const CANAL_DERNIER_SCAN_FEUILLE_V1 = "CANAL_DERNIER_SCAN";
// Si le dernier scan reconnaît moins de fiches que cette part du
// total CANAL+ de CinéMaison, on le juge suspect (scan interrompu,
// défilement incomplet...) et on NE signale PAS "absentes de la
// liste" -- seulement les dates dépassées.
const CANAL_ECARTS_SEUIL_SCAN_COMPLET_V1 = 0.6;

/**
 * Appelée par 09_WEBHOOK.js (traiterAlerteSuggestionsStreamingV1_)
 * quand plateforme === "CANAL+" et que le corps contient idsVus.
 * Remplace entièrement le contenu de CANAL_DERNIER_SCAN.
 */
function enregistrerDernierScanCanalV1_(idsVus) {
  const ids = (idsVus || [])
    .map(function (id) { return String(id || "").trim(); })
    .filter(Boolean);
  if (ids.length === 0) return;

  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(CANAL_DERNIER_SCAN_FEUILLE_V1);
  if (!feuille) {
    feuille = classeur.insertSheet(CANAL_DERNIER_SCAN_FEUILLE_V1);
  }
  feuille.clearContents();
  const maintenant = new Date();
  const lignes = [["IDFilm", "DateScan"]].concat(ids.map(function (id) { return [id, maintenant]; }));
  feuille.getRange(1, 1, lignes.length, 2).setValues(lignes);
  feuille.getRange(1, 1, 1, 2).setFontWeight("bold");
}

function lireDernierScanCanalV1_() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CANAL_DERNIER_SCAN_FEUILLE_V1);
  if (!feuille || feuille.getLastRow() < 2) return null;
  const donnees = feuille.getRange(2, 1, feuille.getLastRow() - 1, 2).getValues();
  const ids = {};
  let dateScan = null;
  donnees.forEach(function (ligne) {
    const id = String(ligne[0] || "").trim();
    if (id) ids[id] = true;
    if (!dateScan && ligne[1] instanceof Date) dateScan = ligne[1];
  });
  return { ids: ids, nombre: Object.keys(ids).length, dateScan: dateScan };
}

/**
 * Convertit une cellule date (Date, "dd/mm/yyyy" ou "yyyy-mm-dd") en
 * objet { iso: "yyyy-mm-dd", fr: "dd/mm/yyyy" }, ou null si illisible.
 */
function lireDateCanalEcartsV1_(valeur) {
  if (!valeur) return null;
  const fuseau = Session.getScriptTimeZone();
  if (Object.prototype.toString.call(valeur) === "[object Date]") {
    if (isNaN(valeur.getTime())) return null;
    return {
      iso: Utilities.formatDate(valeur, fuseau, "yyyy-MM-dd"),
      fr: Utilities.formatDate(valeur, fuseau, "dd/MM/yyyy"),
    };
  }
  const texte = String(valeur).trim();
  let m = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { iso: m[1] + "-" + m[2] + "-" + m[3], fr: m[3] + "/" + m[2] + "/" + m[1] };
  m = texte.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const jj = ("0" + m[1]).slice(-2);
    const mm = ("0" + m[2]).slice(-2);
    return { iso: m[3] + "-" + mm + "-" + jj, fr: jj + "/" + mm + "/" + m[3] };
  }
  return null;
}

/**
 * Calcule les écarts. Retourne :
 * { fiches: [...], totalCanal, scan: {nombre, dateScan}|null,
 *   scanUtilisable: bool, avertissement: string }
 * Chaque fiche : { id, titre, affiche, plateforme, dateFinFr, categorie,
 *   raison, aContentId }
 * categorie : "EXPIRE" | "ABSENT_DATE_FUTURE" | "ABSENT_SANS_DATE"
 */
function calculerEcartsCanalV1_() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("Onglet Films introuvable");

  const donnees = films.getDataRange().getValues();
  const h = indexEntetesStreamingV1_(donnees[0]);
  ["ID", "Titre", "Plateforme"].forEach(function (nom) {
    if (h[nom] === undefined) throw new Error("Colonne manquante dans Films : " + nom);
  });

  const aujourdHui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const scan = lireDernierScanCanalV1_();

  // Fiches CANAL+ du Sheet
  const fichesCanal = [];
  for (let i = 1; i < donnees.length; i++) {
    const ligne = donnees[i];
    const id = String(ligne[h.ID] || "").trim();
    const titre = String(ligne[h.Titre] || "").trim();
    if (!id || !titre) continue;
    if (!/canal/i.test(String(ligne[h.Plateforme] || ""))) continue;
    fichesCanal.push(ligne);
  }
  const totalCanal = fichesCanal.length;

  const scanUtilisable = !!scan && totalCanal > 0 &&
    scan.nombre >= totalCanal * CANAL_ECARTS_SEUIL_SCAN_COMPLET_V1;

  let avertissement = "";
  if (!scan) {
    avertissement = "Aucun scan de \"Ma Liste\" enregistré pour l'instant (relance canal.js avec la version à jour) : " +
      "seules les fiches dont la date de fin est dépassée sont détectées.";
  } else if (!scanUtilisable) {
    avertissement = "Le dernier scan ne reconnaît que " + scan.nombre + " fiche(s) sur " + totalCanal +
      " : jugé incomplet, donc les fiches \"absentes de Ma Liste\" ne sont pas signalées (seules les dates dépassées le sont).";
  }

  const fiches = [];
  fichesCanal.forEach(function (ligne) {
    const id = String(ligne[h.ID]).trim();
    const date = h.DateDisponibiliteAuto !== undefined ? lireDateCanalEcartsV1_(ligne[h.DateDisponibiliteAuto]) : null;
    const dansLaListe = scanUtilisable && scan.ids[id] === true;
    const aContentId = h.CanalContentId !== undefined && String(ligne[h.CanalContentId] || "").trim() !== "";

    let categorie = null;
    let raison = "";
    if (date && date.iso < aujourdHui) {
      // Date de fin strictement dépassée : même règle que le rapport
      // "Écarts plateformes" (le jour même reste valable jusqu'à 23h59).
      // Si la fiche est pourtant encore dans Ma Liste (date de fin
      // périmée côté Sheet, Canal+ la propose toujours), on ne la
      // signale pas.
      if (!dansLaListe) {
        categorie = "EXPIRE";
        raison = "Date de fin dépassée -- probablement retiré automatiquement de Canal+.";
      }
    } else if (scanUtilisable && !dansLaListe) {
      if (date) {
        categorie = "ABSENT_DATE_FUTURE";
        raison = "Absent de Ma Liste alors que la date de fin n'est pas atteinte (retiré à la main ? changement de chaîne ?).";
      } else {
        categorie = "ABSENT_SANS_DATE";
        raison = aContentId
          ? "Absent de Ma Liste et aucune date de fin connue."
          : "Jamais rattaché à Canal+ (pas de CanalContentId), absent de Ma Liste.";
      }
    }
    if (!categorie) return;

    fiches.push({
      id: id,
      titre: String(ligne[h.Titre]).trim(),
      affiche: h.Affiche !== undefined ? String(ligne[h.Affiche] || "") : "",
      plateforme: String(ligne[h.Plateforme] || "").trim(),
      dateFinFr: date ? date.fr : "",
      dateFinIso: date ? date.iso : "",
      categorie: categorie,
      raison: raison,
      aContentId: aContentId,
    });
  });

  const ordre = { EXPIRE: 0, ABSENT_DATE_FUTURE: 1, ABSENT_SANS_DATE: 2 };
  fiches.sort(function (a, b) {
    if (ordre[a.categorie] !== ordre[b.categorie]) return ordre[a.categorie] - ordre[b.categorie];
    return a.titre.localeCompare(b.titre, "fr");
  });

  return {
    fiches: fiches,
    totalCanal: totalCanal,
    scan: scan,
    scanUtilisable: scanUtilisable,
    avertissement: avertissement,
  };
}

function ecrireOngletCanalEcartsV1_(resultat) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(CANAL_ECARTS_FEUILLE_V1);
  if (!feuille) feuille = classeur.insertSheet(CANAL_ECARTS_FEUILLE_V1);
  feuille.clearContents();

  const entete = ["ID", "Titre", "Plateforme", "DateFinDisponibilite", "Categorie", "Raison", "CanalContentId renseigné", "GénéréLe"];
  const maintenant = new Date();
  const lignes = resultat.fiches.map(function (f) {
    return [f.id, f.titre, f.plateforme, f.dateFinFr, f.categorie, f.raison, f.aContentId ? "OUI" : "NON", maintenant];
  });
  feuille.getRange(1, 1, 1, entete.length).setValues([entete]).setFontWeight("bold");
  if (lignes.length > 0) feuille.getRange(2, 1, lignes.length, entete.length).setValues(lignes);
}

function echapperHtmlCanalEcartsV1_(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function construireHtmlCanalEcartsV1_(resultat) {
  const motDePasse = String(lireConfig_("AddFilmPassword", ""));
  const baseUrl = "https://cinemaison-v2.vercel.app";
  const esc = echapperHtmlCanalEcartsV1_;

  const sections = [
    { cle: "EXPIRE", titre: "DATE DE FIN DÉPASSÉE", aide: "Très probablement retirés par Canal+ : à retirer de CinéMaison." },
    { cle: "ABSENT_DATE_FUTURE", titre: "ABSENTS DE MA LISTE (DATE PAS ENCORE ATTEINTE)", aide: "À vérifier : retirés à la main, ou passés sur une autre chaîne ?" },
    { cle: "ABSENT_SANS_DATE", titre: "ABSENTS DE MA LISTE (SANS DATE)", aide: "À vérifier : jamais ajoutés dans Ma Liste, ou titre non reconnu ?" },
  ];

  function ligneFiche(f) {
    const vignette = f.affiche
      ? '<img src="' + esc(f.affiche) + '" width="50" height="75" style="border-radius:4px;display:block" alt="">'
      : '<div style="width:50px;height:75px;border-radius:4px;background:#E3D9C4"></div>';
    const lien = motDePasse
      ? '<a href="' + baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(f.id) +
        "&titre=" + encodeURIComponent(f.titre) + "&pw=" + encodeURIComponent(motDePasse) +
        '" style="color:#B5622B;font-weight:bold">Retirer de CinéMaison</a>'
      : '<span style="color:#9A9182">(AddFilmPassword absent de CONFIG : lien indisponible)</span>';
    return '<tr>' +
      '<td width="62" valign="top" style="padding:8px 12px 8px 0;border-bottom:1px solid #EFE7D6">' + vignette + '</td>' +
      '<td valign="top" style="padding:8px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.5">' +
      '<strong>' + esc(f.id) + '</strong> &middot; ' + esc(f.titre) + '<br>' +
      'Plateforme : ' + esc(f.plateforme) + '<br>' +
      'Fin de disponibilité : ' + (f.dateFinFr ? esc(f.dateFinFr) : '<em>inconnue</em>') + '<br>' +
      '<span style="color:#9A9182;font-size:12px">' + esc(f.raison) + '</span><br>' +
      lien +
      '</td></tr>';
  }

  const blocs = sections.map(function (s) {
    const liste = resultat.fiches.filter(function (f) { return f.categorie === s.cle; });
    if (liste.length === 0) return "";
    return '<div style="margin-top:22px">' +
      '<div style="font-size:12px;letter-spacing:1px;color:#B5622B;font-family:Arial,sans-serif;font-weight:bold">' +
      s.titre + ' (' + liste.length + ')</div>' +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin:3px 0 4px">' + s.aide + '</div>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">' +
      liste.map(ligneFiche).join("") +
      '</table></div>';
  }).join("");

  const scanTexte = resultat.scan
    ? resultat.scan.nombre + ' fiche(s) vues dans Ma Liste' +
      (resultat.scan.dateScan ? ' (scan du ' + Utilities.formatDate(resultat.scan.dateScan, Session.getScriptTimeZone(), "dd/MM/yyyy") + ')' : '')
    : 'aucun scan enregistré';

  const resume = '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6">' +
    '<strong>' + resultat.fiches.length + '</strong> fiche(s) à examiner sur ' + resultat.totalCanal +
    ' fiche(s) CANAL+ dans CinéMaison &middot; ' + scanTexte + '.</div>' +
    (resultat.avertissement
      ? '<div style="margin-top:10px;padding:10px 12px;background:#F6E7D3;border-radius:6px;font-size:12px;color:#7A4A1E;font-family:Arial,sans-serif">⚠ ' +
        esc(resultat.avertissement) + '</div>'
      : '');

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;max-width:560px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;margin-top:4px;font-family:Arial,sans-serif">CANAL+ &middot; ÉCARTS AVEC MA LISTE</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    resume + blocs +
    '</div></div></body></html>'
  );
}

/**
 * Point d'entrée : calcule, écrit l'onglet CANAL_ECARTS, envoie le mail
 * (même s'il n'y a rien à signaler -- demandé par Ben : toujours un mail
 * de confirmation). Peut être lancée à la main depuis l'éditeur.
 * Retourne un petit résumé (renvoyé aussi à l'application).
 */
function genererEtEnvoyerRapportCanalEcartsV1() {
  const resultat = calculerEcartsCanalV1_();
  ecrireOngletCanalEcartsV1_(resultat);

  const nombre = resultat.fiches.length;
  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (destinataires) {
    MailApp.sendEmail({
      to: destinataires,
      subject: "CinéMaison - V2 - CANAL+ écarts avec Ma Liste (" + nombre + " fiche(s) à examiner)",
      htmlBody: construireHtmlCanalEcartsV1_(resultat),
    });
  }

  journal_(
    "CANAL_ECARTS", "RAPPORT", destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    "A examiner=" + nombre + " | Total CANAL+=" + resultat.totalCanal +
    " | Scan=" + (resultat.scan ? resultat.scan.nombre : "aucun") +
    (resultat.avertissement ? " | " + resultat.avertissement : "")
  );

  return {
    nombre: nombre,
    totalCanal: resultat.totalCanal,
    scanUtilisable: resultat.scanUtilisable,
    mailEnvoye: !!destinataires,
  };
}
