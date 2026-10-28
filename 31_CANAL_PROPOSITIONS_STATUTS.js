/**
 * ============================================================
 * 31_CANAL_PROPOSITIONS_STATUTS.js
 * Version: 1.2 (28/10/2026) -- envoi du mail avec réessais (délais Google transitoires),
 * erreur active fermée dès que ça passe. 1.1 (28/10/2026) : l'en-tête est reposé si la cellule A1 est vide
 * (1.0 : 27/10/2026)
 *
 * But : pour CANAL+, les changements de STATUT d'accès (colonne
 * StatutAcces : Inclus / VOD / Indispo ...) ne s'écrivent plus tout seuls.
 * Le contrôle Canal+ les PROPOSE ; Ben reçoit un mail récapitulatif avec un
 * bouton, coche les lignes qu'il veut, et tout s'applique d'un coup.
 * (Les DATES, elles, continuent d'être écrites tout de suite, avec le mail
 * "Modifications CANAL+" existant.)
 *
 * Règles qui produisent une proposition :
 *   1. L'identifiant Canal se termine par _40099 (Canal VOD) et la fiche
 *      n'est pas en "VOD"                         -> propose "VOD".
 *   2. Une vraie date de fin (aujourd'hui ou plus tard) apparaît sur une
 *      fiche en "Indispo"                          -> propose "Inclus".
 *   3. La fiche est en "Inclus" mais Canal+ ne la trouve plus du tout dans
 *      son catalogue                               -> propose "Indispo".
 *
 * Onglet CANAL_PROPOSITIONS (créé automatiquement), une ligne par proposition :
 *   Etat = EN_ATTENTE | APPLIQUEE | REFUSEE | OBSOLETE
 *   - une ligne décochée à l'application = REFUSEE : elle n'est pas
 *     re-proposée pendant 30 jours ;
 *   - une ligne dont le statut a changé entre-temps (à la main) = OBSOLETE.
 *
 * Mail : envoyé à la fin d'un parcours Canal+ s'il y a du nouveau (ou en
 * rappel au bout de 7 jours). Page de choix : api/confirm.js?page=canalApply
 * (Vercel), qui appelle les actions webhook "canalPropositionsLister" et
 * "canalPropositionsAppliquer" (09_WEBHOOK.js).
 * ============================================================
 */

const CANAL_PROP_FEUILLE_V1 = "CANAL_PROPOSITIONS";
const CANAL_PROP_ENTETE_V1 = [
  "Cle", "FilmID", "Titre", "Annee", "StatutActuel", "StatutPropose",
  "Raison", "DateCreation", "Etat", "DateEtat", "DernierMail"
];
const CANAL_PROP_JOURS_REFUS_V1 = 30;
const CANAL_PROP_JOURS_RAPPEL_V1 = 7;
const CANAL_PROP_STATUTS_VALIDES_V1 = [
  "Inclus", "VOD", "Indispo", "Bientôt disponible", "Abonnement complémentaire"
];

function canalPropFeuilleV1_() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(CANAL_PROP_FEUILLE_V1);
  if (!feuille) {
    feuille = classeur.insertSheet(CANAL_PROP_FEUILLE_V1);
  }
  // Correctif V1.1 (28/10/2026) : l'onglet existait mais SANS en-tête (constaté
  // sur le Sheet réel) -- la 1re proposition aurait alors été écrite en ligne 1
  // et ignorée à la lecture (qui saute la ligne 1). On (re)pose l'en-tête dès que
  // la cellule A1 est vide, que l'onglet soit neuf ou déjà là.
  if (String(feuille.getRange(1, 1).getValue() || "").trim() === "") {
    feuille.getRange(1, 1, 1, CANAL_PROP_ENTETE_V1.length)
      .setValues([CANAL_PROP_ENTETE_V1]).setFontWeight("bold");
    feuille.setFrozenRows(1);
  }
  return feuille;
}

function canalPropLireV1_() {
  const feuille = canalPropFeuilleV1_();
  const valeurs = feuille.getDataRange().getValues();
  const lignes = [];
  for (let i = 1; i < valeurs.length; i++) {
    const r = valeurs[i];
    if (!r[0]) continue;
    lignes.push({
      numero: i + 1,
      cle: String(r[0]),
      filmId: String(r[1]),
      titre: String(r[2]),
      annee: String(r[3]),
      statutActuel: String(r[4]),
      statutPropose: String(r[5]),
      raison: String(r[6]),
      dateCreation: r[7],
      etat: String(r[8]),
      dateEtat: r[9],
      dernierMail: r[10]
    });
  }
  return { feuille: feuille, lignes: lignes };
}

function canalPropJoursDepuisV1_(date) {
  if (!(date instanceof Date)) return 99999;
  return (Date.now() - date.getTime()) / 86400000;
}

/**
 * Enregistre une proposition (sans jamais toucher à la fiche).
 * Retourne "AJOUTEE" | "MAJ" | "IGNOREE_REFUSEE" | "IGNOREE".
 */
function enregistrerPropositionCanalV1_(filmId, titre, annee, statutActuel, statutPropose, raison) {
  filmId = String(filmId || "").trim();
  statutActuel = String(statutActuel || "").trim();
  if (!filmId || CANAL_PROP_STATUTS_VALIDES_V1.indexOf(statutPropose) === -1) return "IGNOREE";
  if (statutActuel === statutPropose) return "IGNOREE";

  const lecture = canalPropLireV1_();
  const feuille = lecture.feuille;
  const memes = lecture.lignes.filter(function (l) { return l.filmId === filmId; });

  // Refusée récemment pour ce même statut : on ne redemande pas.
  const refusee = memes.some(function (l) {
    return l.statutPropose === statutPropose && l.etat === "REFUSEE" &&
      canalPropJoursDepuisV1_(l.dateEtat) < CANAL_PROP_JOURS_REFUS_V1;
  });
  if (refusee) return "IGNOREE_REFUSEE";

  // Une proposition en attente avec un AUTRE statut devient obsolète.
  memes.forEach(function (l) {
    if (l.etat === "EN_ATTENTE" && l.statutPropose !== statutPropose) {
      feuille.getRange(l.numero, 9, 1, 2).setValues([["OBSOLETE", new Date()]]);
    }
  });

  const existante = memes.filter(function (l) {
    return l.etat === "EN_ATTENTE" && l.statutPropose === statutPropose;
  })[0];
  if (existante) {
    feuille.getRange(existante.numero, 3, 1, 5).setValues([[
      titre, annee, statutActuel, statutPropose, raison
    ]]);
    return "MAJ";
  }

  feuille.appendRow([
    Utilities.getUuid().slice(0, 8), filmId, titre, annee, statutActuel,
    statutPropose, raison, new Date(), "EN_ATTENTE", "", ""
  ]);
  return "AJOUTEE";
}

/** Lit les statuts actuels des fiches : { ID -> StatutAcces }. */
function canalPropStatutsFichesV1_() {
  const sheet = getSheet_(SHEETS.FILMS);
  const data = sheet.getDataRange().getValues();
  const h = headers_(data[0]);
  const parId = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(get_(data[i], h, "ID") || "").trim();
    if (id) parId[id] = { ligne: i + 1, statut: String(get_(data[i], h, "StatutAcces") || "").trim() };
  }
  return { sheet: sheet, h: h, parId: parId };
}

/**
 * Met l'onglet à jour : une proposition dont la fiche a déjà le statut
 * proposé est considérée appliquée (à la main) ; si le statut a changé
 * autrement, elle devient obsolète. Retourne les lignes encore EN_ATTENTE.
 */
function canalPropActualiserV1_() {
  const lecture = canalPropLireV1_();
  const attente = lecture.lignes.filter(function (l) { return l.etat === "EN_ATTENTE"; });
  if (attente.length === 0) return [];

  const films = canalPropStatutsFichesV1_();
  const restantes = [];
  attente.forEach(function (l) {
    const f = films.parId[l.filmId];
    if (!f) {
      lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["OBSOLETE", new Date()]]);
    } else if (f.statut === l.statutPropose) {
      lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["APPLIQUEE", new Date()]]);
    } else if (f.statut !== l.statutActuel) {
      lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["OBSOLETE", new Date()]]);
    } else {
      l.statutActuel = f.statut;
      restantes.push(l);
    }
  });
  return restantes;
}

function canalPropEchapperV1_(t) {
  return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function construireHtmlPropositionsCanalV1_(propositions) {
  const esc = canalPropEchapperV1_;
  const motDePasse = String(lireConfig_("AddFilmPassword", ""));
  const lien = motDePasse
    ? "https://cinemaison-v2.vercel.app/api/confirm?page=canalApply&pw=" + encodeURIComponent(motDePasse)
    : "";

  const lignes = propositions.map(function (p) {
    return '<tr>' +
      '<td valign="top" style="padding:9px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.5">' +
      '<strong>' + esc(p.filmId) + '</strong> &middot; ' + esc(p.titre) + (p.annee ? ' (' + esc(p.annee) + ')' : '') + '<br>' +
      '<span style="display:inline-block;margin:3px 0;padding:2px 8px;border-radius:10px;background:#F6E7D3;color:#7A4A1E;font-weight:bold">' +
      esc(p.statutActuel || "vide") + ' &rarr; ' + esc(p.statutPropose) + '</span><br>' +
      '<span style="color:#9A9182;font-size:12px">' + esc(p.raison) + '</span>' +
      '</td></tr>';
  }).join("");

  const bouton = lien
    ? '<div style="margin:18px 0 6px"><a href="' + lien + '" style="display:block;text-align:center;background:#B5622B;color:#FFFBF2;text-decoration:none;border-radius:6px;padding:13px 20px;font-size:15px;font-weight:bold;font-family:Arial,sans-serif">CHOISIR LES LIGNES ET APPLIQUER</a></div>' +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif">Toutes les lignes sont cochées par défaut : décoche celles que tu refuses (elles ne seront pas reproposées avant 30 jours).</div>'
    : '<div style="padding:10px 12px;background:#F6E7D3;border-radius:6px;font-size:12px;color:#7A4A1E;font-family:Arial,sans-serif">AddFilmPassword absent de CONFIG : lien indisponible.</div>';

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;max-width:560px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;margin-top:4px;font-family:Arial,sans-serif">CANAL+ &middot; CHANGEMENTS DE STATUT PROPOSÉS</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6"><strong>' + propositions.length +
    '</strong> changement(s) de statut détecté(s) par le contrôle Canal+. Rien n\'est modifié tant que tu n\'as pas validé.</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px">' + lignes + '</table>' +
    bouton +
    '</div></div></body></html>'
  );
}

/**
 * Envoie le mail s'il y a du nouveau (ligne jamais mailée) ou un rappel
 * (dernier mail il y a plus de 7 jours). Appelée à la fin d'un parcours Canal+.
 * Peut aussi être lancée à la main (force = true).
 */
function envoyerMailPropositionsCanalV1_(force) {
  const propositions = canalPropActualiserV1_();
  if (propositions.length === 0) return { envoye: false, nombre: 0 };

  const aEnvoyer = force || propositions.some(function (p) {
    return !(p.dernierMail instanceof Date) ||
      canalPropJoursDepuisV1_(p.dernierMail) >= CANAL_PROP_JOURS_RAPPEL_V1;
  });
  if (!aEnvoyer) return { envoye: false, nombre: propositions.length };

  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (!destinataires) {
    journal_("CANAL_PROPOSITIONS", "MAIL", "IGNORE_SANS_DESTINATAIRE", "Propositions=" + propositions.length);
    return { envoye: false, nombre: propositions.length };
  }

  MailApp.sendEmail({
    to: destinataires,
    subject: "CinéMaison - V2 - CANAL+ changements de statut à valider (" + propositions.length + ")",
    htmlBody: construireHtmlPropositionsCanalV1_(propositions)
  });

  const feuille = canalPropFeuilleV1_();
  const maintenant = new Date();
  propositions.forEach(function (p) { feuille.getRange(p.numero, 11).setValue(maintenant); });

  journal_("CANAL_PROPOSITIONS", "MAIL", "OK", "Propositions=" + propositions.length);
  return { envoye: true, nombre: propositions.length };
}

/** Action webhook : liste les propositions en attente (pour la page de choix). */
function traiterCanalPropositionsListerV1_() {
  const propositions = canalPropActualiserV1_();
  return reponseJsonWebhook_({
    ok: true,
    propositions: propositions.map(function (p) {
      return {
        cle: p.cle, filmId: p.filmId, titre: p.titre, annee: p.annee,
        statutActuel: p.statutActuel, statutPropose: p.statutPropose, raison: p.raison
      };
    })
  });
}

/**
 * Action webhook : applique les lignes cochées ("appliquer" = liste de clés),
 * marque les autres lignes de la page comme refusées ("refuser").
 */
function traiterCanalPropositionsAppliquerV1_(corps) {
  const cles = Array.isArray(corps.appliquer) ? corps.appliquer.map(String) : [];
  const refus = Array.isArray(corps.refuser) ? corps.refuser.map(String) : [];

  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) {
    return reponseJsonWebhook_({ ok: false, error: "Un autre traitement est en cours, réessaie dans une minute." });
  }

  try {
    const lecture = canalPropLireV1_();
    const films = canalPropStatutsFichesV1_();
    const resume = { appliquees: 0, refusees: 0, dejaModifiees: 0, introuvables: 0 };
    const maintenant = new Date();

    lecture.lignes.forEach(function (l) {
      if (l.etat !== "EN_ATTENTE") return;

      if (cles.indexOf(l.cle) !== -1) {
        const f = films.parId[l.filmId];
        if (!f) {
          resume.introuvables++;
          lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["OBSOLETE", maintenant]]);
        } else if (f.statut !== l.statutActuel && f.statut !== l.statutPropose) {
          // Le statut a été changé à la main depuis la proposition : on ne l'écrase pas.
          resume.dejaModifiees++;
          lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["OBSOLETE", maintenant]]);
        } else {
          if (f.statut !== l.statutPropose) {
            setProtected_(films.sheet, f.ligne, films.h, "StatutAcces", l.statutPropose, { force: true });
          }
          resume.appliquees++;
          lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["APPLIQUEE", maintenant]]);
          journal_("CANAL_PROPOSITIONS", "APPLIQUER", "OK",
            l.filmId + " | " + l.titre + " | " + l.statutActuel + " -> " + l.statutPropose);
        }
      } else if (refus.indexOf(l.cle) !== -1) {
        resume.refusees++;
        lecture.feuille.getRange(l.numero, 9, 1, 2).setValues([["REFUSEE", maintenant]]);
      }
    });

    return reponseJsonWebhook_({ ok: true, resume: resume });
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Envoie le mail avec jusqu'à 3 essais si Google répond par un délai dépassé
 * (cas réel du 27/10/2026 : "Expiration du délai de connexion au service
 * Feuilles de calcul"). Si ça passe, l'erreur active éventuelle est fermée.
 */
function envoyerMailPropositionsCanalAvecReessaiV1_(force) {
  const r = avecReessaiSheets_(function () { return envoyerMailPropositionsCanalV1_(force); }, 3);
  resoudreErreur_("CONNECTEURS", "CANAL_PROPOSITIONS");
  return r;
}

/** À lancer à la main pour renvoyer le mail tout de suite. */
function renvoyerMailPropositionsCanalV1() {
  const r = envoyerMailPropositionsCanalAvecReessaiV1_(true);
  Logger.log("Propositions Canal+ : " + JSON.stringify(r));
}
