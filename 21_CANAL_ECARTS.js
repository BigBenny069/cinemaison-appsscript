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
 * Version : 1.4 (10/10/2026)
 *
 * V1.4 : le mail propose, sur les fiches "absentes de Ma Liste", un lien
 * "Garder hors de Ma Liste" (api/confirm?page=horsListeCanal) qui écrit "oui"
 * dans HorsListeCanal (via api/update-film) sur clic humain.
 *
 * V1.3 : colonne optionnelle HorsListeCanal dans l'onglet Films. Écrire
 * "oui" sur une fiche CANAL+ que Ben garde VOLONTAIREMENT hors de Ma
 * Liste Canal+ (liste pleine) : elle passe dans une section grisée en
 * bas du mail, sans lien de retrait, et n'est plus comptée dans "à
 * examiner". Elle remonte quand même normalement en haut du mail si sa
 * date de fin est dépassée ou si sa page Canal+ renvoie HTTP 404.
 * Sans la colonne, rien ne change.
 *
 * V1.2 : le mail signale aussi les codes de chaîne présents dans
 * CanalContentId mais absents de CANAL_CHAINES_V1 (src/App.jsx) -- à
 * ajouter côté application avec leur logo. Liste ci-dessous à garder
 * identique à CANAL_CHAINES_V1.
 *
 * V1.1 : deux critères ajoutés à la demande de Ben -- (1) fiches dont le
 * contrôle des dates a reçu "HTTP 404" (page du film disparue de Canal+,
 * lu dans CommentaireDisponibilite) ; (2) fiches dont la plateforme
 * contient "canal" mais n'est pas reconnue par le contrôle quotidien
 * (normalizePlatform_ n'accepte que CANAL, CANAL PLUS, CANAL+) --
 * explique l'écart 371 fiches (canal.js) / 370 traitées (contrôle).
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
// Codes de chaîne déjà référencés dans l'application (CANAL_CHAINES_V1).
const CANAL_CHAINES_CONNUES_V1 = {
  "50001": "CANAL+", "50002": "CINÉ+OCS", "50007": "ACTION", "50008": "ARTE",
  "50016": "COMÉDIE+", "50026": "FRANCE.TV", "50035": "M6/M6+", "50049": "PARIS PREMIÈRE",
  "50052": "RTL9", "50055": "SÉRIE CLUB", "50060": "TÉVA", "50061": "MYTF1",
  "50071": "W9", "50076": "POLAR+", "50254": "CANAL+ SÉRIES", "50662": "PARAMOUNT+",
  "50696": "APPLE TV", "50780": "INSOMNIA", "50889": "HBO MAX", "50943": "NOVO19",
  "40099": "CANAL VOD"
};
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
 * categorie : "HORS_CONTROLE" | "EXPIRE" | "HTTP_404" | "ABSENT_DATE_FUTURE" | "ABSENT_SANS_DATE"
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

  // Codes de chaîne inconnus de l'application
  const codesInconnus = {};
  if (h.CanalContentId !== undefined) {
    fichesCanal.forEach(function (ligne) {
      const cid = String(ligne[h.CanalContentId] || "").trim();
      if (cid.indexOf("_") === -1) return;
      const code = cid.split("_").pop();
      if (!code || CANAL_CHAINES_CONNUES_V1[code]) return;
      if (!codesInconnus[code]) codesInconnus[code] = [];
      codesInconnus[code].push(String(ligne[h.ID]).trim() + " " + String(ligne[h.Titre]).trim());
    });
  }

  const fiches = [];
  fichesCanal.forEach(function (ligne) {
    const id = String(ligne[h.ID]).trim();
    const date = h.DateDisponibiliteAuto !== undefined ? lireDateCanalEcartsV1_(ligne[h.DateDisponibiliteAuto]) : null;
    const dansLaListe = scanUtilisable && scan.ids[id] === true;
    const aContentId = h.CanalContentId !== undefined && String(ligne[h.CanalContentId] || "").trim() !== "";
    const commentaire = h.CommentaireDisponibilite !== undefined ? String(ligne[h.CommentaireDisponibilite] || "") : "";
    const statutAuto = h.StatutDisponibiliteAuto !== undefined ? String(ligne[h.StatutDisponibiliteAuto] || "").trim() : "";
    const http404 = statutAuto === "A_VERIFIER_CANAL" && /HTTP[^0-9]{0,15}404/i.test(commentaire);
    const horsControle = normalizePlatform_(ligne[h.Plateforme]) !== "CANAL+";
    const expire = !!date && date.iso < aujourdHui && !dansLaListe;
    const absent = scanUtilisable && !dansLaListe;
    const valeurHors = h.HorsListeCanal !== undefined ? String(ligne[h.HorsListeCanal] || "").trim().toLowerCase() : "";
    const horsListeVolontaire = ["oui", "o", "x", "1", "true", "vrai", "yes"].indexOf(valeurHors) !== -1;

    let categorie = null;
    const notes = [];
    if (horsControle) {
      categorie = "HORS_CONTROLE";
      notes.push("Plateforme \"" + String(ligne[h.Plateforme] || "").trim() + "\" non reconnue par le contrôle quotidien des dates : cette fiche n'est jamais contrôlée.");
    }
    if (expire) {
      // Date de fin strictement dépassée : même règle que le rapport
      // "Écarts plateformes" (le jour même reste valable jusqu'à 23h59).
      // Si la fiche est pourtant encore dans Ma Liste, on ne la signale
      // pas pour ce motif.
      if (!categorie) categorie = "EXPIRE";
      notes.push("Date de fin dépassée -- probablement retiré automatiquement de Canal+.");
    }
    if (http404) {
      if (!categorie) categorie = "HTTP_404";
      notes.push("Le contrôle des dates reçoit une erreur 404 : la page du film n'existe plus sur Canal+." +
        (scanUtilisable && dansLaListe ? " Mais il figure encore dans Ma Liste : à vérifier à la main." : ""));
    }
    if (absent) {
      if (expire) {
        notes.push("Absent de Ma Liste.");
      } else if (date) {
        if (!categorie) categorie = "ABSENT_DATE_FUTURE";
        notes.push("Absent de Ma Liste alors que la date de fin n'est pas atteinte (retiré à la main ? changement de chaîne ?).");
      } else {
        if (!categorie) categorie = "ABSENT_SANS_DATE";
        notes.push(aContentId
          ? "Absent de Ma Liste et aucune date de fin connue."
          : "Jamais rattaché à Canal+ (pas de CanalContentId), absent de Ma Liste.");
      }
    }
    if (horsListeVolontaire) {
      if (categorie === "ABSENT_DATE_FUTURE" || categorie === "ABSENT_SANS_DATE") {
        categorie = "HORS_LISTE_VOLONTAIRE";
        notes.length = 0;
        notes.push("Gardée volontairement hors de Ma Liste Canal+ (colonne HorsListeCanal) ; date de fin pas atteinte, aucune erreur détectée.");
      } else if (categorie) {
        notes.push("(Marquée hors liste volontaire, mais signalée pour le motif ci-dessus.)");
      }
    }
    const raison = notes.join(" ");
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

  const ordre = { HORS_CONTROLE: 0, EXPIRE: 1, HTTP_404: 2, ABSENT_DATE_FUTURE: 3, ABSENT_SANS_DATE: 4, HORS_LISTE_VOLONTAIRE: 5 };
  fiches.sort(function (a, b) {
    if (ordre[a.categorie] !== ordre[b.categorie]) return ordre[a.categorie] - ordre[b.categorie];
    return a.titre.localeCompare(b.titre, "fr");
  });

  return {
    fiches: fiches,
    nombreAExaminer: fiches.filter(function (f) { return f.categorie !== "HORS_LISTE_VOLONTAIRE"; }).length,
    totalCanal: totalCanal,
    scan: scan,
    scanUtilisable: scanUtilisable,
    avertissement: avertissement,
    codesInconnus: codesInconnus,
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
    { cle: "HORS_CONTROLE", titre: "PLATEFORME NON RECONNUE PAR LE CONTRÔLE", aide: "Jamais contrôlées : corrige la colonne Plateforme (CANAL+) dans le Sheet." },
    { cle: "EXPIRE", titre: "DATE DE FIN DÉPASSÉE", aide: "Très probablement retirés par Canal+ : à retirer de CinéMaison." },
    { cle: "HTTP_404", titre: "PAGE INTROUVABLE SUR CANAL+ (HTTP 404)", aide: "Le film n'existe plus à cette adresse : très probablement retiré de Canal+." },
    { cle: "ABSENT_DATE_FUTURE", titre: "ABSENTS DE MA LISTE (DATE PAS ENCORE ATTEINTE)", aide: "À vérifier : retirés à la main, ou passés sur une autre chaîne ?" },
    { cle: "ABSENT_SANS_DATE", titre: "ABSENTS DE MA LISTE (SANS DATE)", aide: "À vérifier : jamais ajoutés dans Ma Liste, ou titre non reconnu ?" },
    { cle: "HORS_LISTE_VOLONTAIRE", titre: "HORS LISTE VOLONTAIREMENT (RIEN À FAIRE)", aide: "Marquées « oui » dans la colonne HorsListeCanal. Elles restent suivies par le contrôle des dates.", discret: true },
  ];

  function ligneFiche(f, discret) {
    const vignette = f.affiche
      ? '<img src="' + esc(f.affiche) + '" width="50" height="75" style="border-radius:4px;display:block" alt="">'
      : '<div style="width:50px;height:75px;border-radius:4px;background:#E3D9C4"></div>';
    const lien = discret ? "" : motDePasse
      ? '<a href="' + baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(f.id) +
        "&titre=" + encodeURIComponent(f.titre) + "&pw=" + encodeURIComponent(motDePasse) +
        '" style="color:#B5622B;font-weight:bold">Retirer de CinéMaison</a>'
      : '<span style="color:#9A9182">(AddFilmPassword absent de CONFIG : lien indisponible)</span>';
    const garder = (!discret && motDePasse && (f.categorie === "ABSENT_DATE_FUTURE" || f.categorie === "ABSENT_SANS_DATE"))
      ? ' &nbsp;|&nbsp; <a href="' + baseUrl + "/api/confirm?page=horsListeCanal&id=" + encodeURIComponent(f.id) +
        "&titre=" + encodeURIComponent(f.titre) + "&pw=" + encodeURIComponent(motDePasse) +
        '" style="color:#2B4256;font-weight:bold">Garder hors de Ma Liste</a>'
      : "";
    return '<tr>' +
      '<td width="62" valign="top" style="padding:8px 12px 8px 0;border-bottom:1px solid #EFE7D6">' + vignette + '</td>' +
      '<td valign="top" style="padding:8px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.5">' +
      '<strong>' + esc(f.id) + '</strong> &middot; ' + esc(f.titre) + '<br>' +
      'Plateforme : ' + esc(f.plateforme) + '<br>' +
      'Fin de disponibilité : ' + (f.dateFinFr ? esc(f.dateFinFr) : '<em>inconnue</em>') + '<br>' +
      '<span style="color:#9A9182;font-size:12px">' + esc(f.raison) + '</span><br>' +
      lien + garder +
      '</td></tr>';
  }

  const blocs = sections.map(function (s) {
    const liste = resultat.fiches.filter(function (f) { return f.categorie === s.cle; });
    if (liste.length === 0) return "";
    return '<div style="margin-top:22px' + (s.discret ? ';opacity:0.6' : '') + '">' +
      '<div style="font-size:12px;letter-spacing:1px;color:#B5622B;font-family:Arial,sans-serif;font-weight:bold">' +
      s.titre + ' (' + liste.length + ')</div>' +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin:3px 0 4px">' + s.aide + '</div>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">' +
      liste.map(function (f) { return ligneFiche(f, s.discret); }).join("") +
      '</table></div>';
  }).join("");

  const codes = Object.keys(resultat.codesInconnus || {});
  const blocCodes = codes.length === 0 ? "" :
    '<div style="margin-top:22px;padding:10px 12px;background:#EEF3F8;border-radius:6px;font-size:12px;color:#2B4256;font-family:Arial,sans-serif;line-height:1.6">' +
    '<strong>Nouveau(x) code(s) de chaîne à ajouter dans l\'application (logo) :</strong><br>' +
    codes.map(function (c) {
      const l = resultat.codesInconnus[c];
      return 'Code <strong>' + esc(c) + '</strong> (' + l.length + ' fiche' + (l.length > 1 ? 's' : '') + ') : ' +
        esc(l.slice(0, 4).join(" ; ")) + (l.length > 4 ? " ..." : "");
    }).join('<br>') + '</div>';

  const scanTexte = resultat.scan
    ? resultat.scan.nombre + ' fiche(s) vues dans Ma Liste' +
      (resultat.scan.dateScan ? ' (scan du ' + Utilities.formatDate(resultat.scan.dateScan, Session.getScriptTimeZone(), "dd/MM/yyyy") + ')' : '')
    : 'aucun scan enregistré';

  const resume = '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6">' +
    '<strong>' + resultat.nombreAExaminer + '</strong> fiche(s) à examiner sur ' + resultat.totalCanal +
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
    resume + blocs + blocCodes +
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

  const nombre = resultat.nombreAExaminer;
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
    "Codes chaîne inconnus=" + Object.keys(resultat.codesInconnus || {}).join(",") + " | A examiner=" + nombre + " | Hors liste volontaire=" + (resultat.fiches.length - nombre) + " | Total CANAL+=" + resultat.totalCanal +
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
