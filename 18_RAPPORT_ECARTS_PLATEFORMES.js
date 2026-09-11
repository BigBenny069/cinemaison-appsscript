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
 * Version : 1.0
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

  SpreadsheetApp.getUi().alert("Déclencheur quotidien installé (rapport d'écarts, ~8h).");
}

/**
 * Fonction déclenchée quotidiennement (et peut être lancée à la main
 * depuis l'éditeur pour tester). Calcule les écarts des 3 plateformes
 * et envoie un mail unique s'il y a quelque chose à signaler.
 */
function genererEtEnvoyerRapportEcartsV1() {
  const parPlateforme = RAPPORT_ECARTS_PLATEFORMES_V1.map(function (plateforme) {
    return {
      plateforme: plateforme,
      manquants: calculerEcartsRetraitV1_(plateforme),
      suggestions: lireDernieresSuggestionsV1_(plateforme, "SUGGESTION"),
      ambiguites: lireDernieresSuggestionsV1_(plateforme, "AMBIGUITE"),
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

  const resultats = plateforme === "PRIME" ? lireResultatsPrimeV110_(controle) : lireResultatsStreamingV1_(controle);
  if (!resultats) return []; // pas de scan complet enregistré -- rien à comparer

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
    manquants.push({ id: id, titre: titre });
  }
  return manquants;
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

  const sections = parPlateforme.map(function (p) {
    if (p.manquants.length === 0 && p.suggestions.length === 0 && p.ambiguites.length === 0) return "";

    let html = '<div style="margin-top:20px"><div style="font-size:14px;font-weight:bold;color:#3A2E22">' + p.plateforme + '</div>';

    if (p.manquants.length > 0) {
      html += '<div style="font-size:12px;color:#9A9182;margin-top:6px">À RETIRER (' + p.manquants.length + ')</div>';
      html += p.manquants.map(function (m) {
        const retirerUrl = baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(m.id) +
          "&titre=" + encodeURIComponent(m.titre) + "&pw=" + encodeURIComponent(motDePasse);
        return '<div style="padding:6px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          m.titre + ' (' + m.id + ') -- <a href="' + retirerUrl + '" style="color:#B5622B">Retirer de CinéMaison</a></div>';
      }).join("");
    }

    if (p.suggestions.length > 0) {
      html += '<div style="font-size:12px;color:#9A9182;margin-top:10px">À AJOUTER (' + p.suggestions.length + ')</div>';
      html += p.suggestions.map(function (f) {
        const liens = []
          .concat(f.confirmUrl ? ['<a href="' + f.confirmUrl + '" style="color:#B5622B">Ajouter</a>'] : [])
          .concat(f.ignorerUrl ? ['<a href="' + f.ignorerUrl + '" style="color:#9A9182">Ignorer</a>'] : [])
          .concat(f.fusionnerUrl ? ['<a href="' + f.fusionnerUrl + '" style="color:#9A9182">Fusionner</a>'] : []);
        return '<div style="padding:6px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          f.titre + (f.annee ? ' (' + f.annee + ')' : '') + ' -- ' + liens.join(' &middot; ') + '</div>';
      }).join("");
    }

    if (p.ambiguites.length > 0) {
      html += '<div style="font-size:12px;color:#9A9182;margin-top:10px">AMBIGUÏTÉS (' + p.ambiguites.length + ')</div>';
      html += p.ambiguites.map(function (a) {
        return '<div style="padding:6px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">' +
          a.titre + ' -- ' + (a.raison || '') +
          (a.ignorerUrl ? ' -- <a href="' + a.ignorerUrl + '" style="color:#9A9182">Validé, c\'est normal</a>' : '') + '</div>';
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
