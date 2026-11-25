/**
 * 37_CANAL_FAVORIS.js -- V1.0 (25/11/2026)
 *
 * Mail "CANAL+ · FAVORIS" : synthèse envoyée par canal.js (option --favoris,
 * lancée aussi à la fin du contrôle normal). canal.js ouvre la page Canal+ de
 * chaque fiche non vue dans Ma Liste, avec le compte de Ben, et lit l'étoile
 * "Playlist". Les fiches dont l'étoile est vide ne sont plus dans ses favoris
 * Canal+ (souvent : film vu, donc retiré des favoris).
 *
 * Le mail propose, pour chacune, deux boutons existants (aucune nouvelle
 * route côté Vercel) :
 *   - "Retirer de CinéMaison"  -> api/confirm?page=remove (avec avis sur le film)
 *   - "Conserver"              -> api/confirm?page=horsListeCanal : écrit "oui"
 *     dans HorsListeCanal ; la fiche reste suivie (dates) et n'est plus
 *     proposée par ce mail ni signalée "absente de Ma Liste".
 *
 * PUREMENT INFORMATIF : rien n'est écrit dans le Sheet ici. Les écritures
 * n'ont lieu que sur clic humain dans le mail.
 *
 * Appelé par doPost (09_WEBHOOK.js) :
 *   { secret, action: "alerteFavorisCanal",
 *     fiches: [{id, titre}, ...],        // étoile vide (PAS_DANS_FAVORIS)
 *     introuvables: [{id, titre}, ...],  // page Canal+ en 404
 *     indetermines: [{id, titre}, ...],  // étoile illisible
 *     testees: 28 }
 */

const CANAL_FAVORIS_MAX_FICHES_V1 = 500;

function echapperHtmlCanalFavorisV1_(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listeIdTitreCanalFavorisV1_(brut) {
  return (Array.isArray(brut) ? brut : []).slice(0, CANAL_FAVORIS_MAX_FICHES_V1).map(function (f) {
    return { id: String((f && f.id) || "").trim(), titre: String((f && f.titre) || "").trim() };
  }).filter(function (f) { return f.id; });
}

/**
 * Relit les fiches dans le Sheet (affiche, date de fin, HorsListeCanal) --
 * les données du mail viennent du Sheet, pas du collecteur, sauf l'ID.
 * Retourne { id -> { titre, affiche, dateFinFr, horsListe } }.
 */
function lireFichesCanalFavorisV1_(ids) {
  const films = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Films");
  if (!films) throw new Error("Onglet Films introuvable");
  const donnees = films.getDataRange().getValues();
  const h = indexEntetesStreamingV1_(donnees[0]);
  if (h.ID === undefined || h.Titre === undefined) throw new Error("Colonnes ID/Titre manquantes dans Films");
  const voulus = {};
  ids.forEach(function (id) { voulus[id] = true; });

  const resultat = {};
  for (let i = 1; i < donnees.length; i++) {
    const ligne = donnees[i];
    const id = String(ligne[h.ID] || "").trim();
    if (!id || !voulus[id]) continue;
    const date = h.DateDisponibiliteAuto !== undefined ? lireDateCanalEcartsV1_(ligne[h.DateDisponibiliteAuto]) : null;
    const valeurHors = h.HorsListeCanal !== undefined ? String(ligne[h.HorsListeCanal] || "").trim().toLowerCase() : "";
    resultat[id] = {
      titre: String(ligne[h.Titre] || "").trim(),
      affiche: h.Affiche !== undefined ? String(ligne[h.Affiche] || "") : "",
      dateFinFr: date ? date.fr : "",
      horsListe: ["oui", "o", "x", "1", "true", "vrai", "yes"].indexOf(valeurHors) !== -1,
    };
  }
  return resultat;
}

function construireHtmlCanalFavorisV1_(aProposer, introuvables, indetermines, testees, dejaGardees) {
  const motDePasse = String(lireConfig_("AddFilmPassword", ""));
  const baseUrl = "https://cinemaison-v2.vercel.app";
  const esc = echapperHtmlCanalFavorisV1_;

  function ligneFiche(f) {
    const vignette = f.affiche
      ? '<img src="' + esc(f.affiche) + '" width="50" height="75" style="border-radius:4px;display:block" alt="">'
      : '<div style="width:50px;height:75px;border-radius:4px;background:#E3D9C4"></div>';
    const liens = motDePasse
      ? '<a href="' + baseUrl + "/api/confirm?page=remove&id=" + encodeURIComponent(f.id) +
        "&titre=" + encodeURIComponent(f.titre) + "&pw=" + encodeURIComponent(motDePasse) +
        '" style="color:#B5622B;font-weight:bold">Retirer de CinéMaison</a>' +
        ' &nbsp;|&nbsp; <a href="' + baseUrl + "/api/confirm?page=horsListeCanal&id=" + encodeURIComponent(f.id) +
        "&titre=" + encodeURIComponent(f.titre) + "&pw=" + encodeURIComponent(motDePasse) +
        '" style="color:#2B4256;font-weight:bold">Conserver dans CinéMaison</a>'
      : '<span style="color:#9A9182">(AddFilmPassword absent de CONFIG : liens indisponibles)</span>';
    return '<tr>' +
      '<td width="62" valign="top" style="padding:8px 12px 8px 0;border-bottom:1px solid #EFE7D6">' + vignette + '</td>' +
      '<td valign="top" style="padding:8px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.5">' +
      '<strong>' + esc(f.id) + '</strong> &middot; ' + esc(f.titre) + '<br>' +
      'Fin de disponibilité : ' + (f.dateFinFr ? esc(f.dateFinFr) : '<em>inconnue</em>') + '<br>' +
      '<span style="color:#9A9182;font-size:12px">Plus dans tes favoris Canal+ (étoile « Playlist » vide).</span><br>' +
      liens +
      '</td></tr>';
  }

  function listeSimple(titreSection, aide, liste) {
    if (liste.length === 0) return "";
    return '<div style="margin-top:22px">' +
      '<div style="font-size:12px;letter-spacing:1px;color:#B5622B;font-family:Arial,sans-serif;font-weight:bold">' + titreSection + ' (' + liste.length + ')</div>' +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin:3px 0 4px">' + aide + '</div>' +
      '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6">' +
      liste.map(function (f) { return '<strong>' + esc(f.id) + '</strong> &middot; ' + esc(f.titre); }).join('<br>') +
      '</div></div>';
  }

  const blocPrincipal = aProposer.length === 0 ? "" :
    '<div style="margin-top:22px">' +
    '<div style="font-size:12px;letter-spacing:1px;color:#B5622B;font-family:Arial,sans-serif;font-weight:bold">PLUS DANS TES FAVORIS CANAL+ (' + aProposer.length + ')</div>' +
    '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin:3px 0 4px">Souvent des films vus. « Retirer » les supprime de CinéMaison ; « Conserver » les garde (dates toujours suivies) et ce mail ne les reproposera plus.</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">' +
    aProposer.map(ligneFiche).join("") + '</table></div>';

  const resume = '<div style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6">' +
    '<strong>' + testees + '</strong> fiche(s) contrôlée(s) sur Canal+ : ' +
    (aProposer.length === 0
      ? 'toutes sont encore dans tes favoris. <strong>RAS.</strong>'
      : '<strong>' + aProposer.length + '</strong> ne sont plus dans tes favoris.') +
    (dejaGardees > 0 ? ' (' + dejaGardees + ' déjà gardée(s) volontairement hors liste, non reproposées.)' : '') +
    '</div>';

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;max-width:560px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;margin-top:4px;font-family:Arial,sans-serif">CANAL+ &middot; FAVORIS</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    resume + blocPrincipal +
    listeSimple("PAGE INTROUVABLE SUR CANAL+ (HTTP 404)", "Le film n'existe plus à cette adresse : à vérifier.", introuvables) +
    listeSimple("ÉTOILE ILLISIBLE (À VOIR À LA MAIN)", "Le script n'a pas su lire l'état de l'étoile sur ces pages.", indetermines) +
    '</div></div></body></html>'
  );
}

function traiterAlerteFavorisCanalV1_(corps) {
  const fiches = listeIdTitreCanalFavorisV1_(corps.fiches);
  const introuvables = listeIdTitreCanalFavorisV1_(corps.introuvables);
  const indetermines = listeIdTitreCanalFavorisV1_(corps.indetermines);
  const testees = Math.max(0, Number(corps.testees) || 0);

  const signature = "alerteFavorisCanal_" + testees + "_" +
    fiches.concat(introuvables, indetermines).map(function (f) { return f.id; }).join("|");
  if (dejaTraiteRecemment_(signature, DUREE_ANTI_DOUBLON_CANAL_SEC_)) {
    journal_("CANAL_FAVORIS", "MAIL", "IGNORE_DOUBLON_RECENT", "Requête identique déjà traitée récemment");
    return reponseJsonWebhook_({ ok: true, mailEnvoye: false, doublonIgnore: true });
  }

  const dansSheet = lireFichesCanalFavorisV1_(fiches.map(function (f) { return f.id; }));
  const aProposer = [];
  let dejaGardees = 0;
  fiches.forEach(function (f) {
    const s = dansSheet[f.id];
    if (!s) return; // fiche supprimée entre-temps : rien à proposer
    if (s.horsListe) { dejaGardees++; return; }
    aProposer.push({ id: f.id, titre: s.titre || f.titre, affiche: s.affiche, dateFinFr: s.dateFinFr });
  });

  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (destinataires) {
    MailApp.sendEmail({
      to: destinataires,
      subject: aProposer.length === 0
        ? "CinéMaison - V2 - CANAL+ favoris : RAS"
        : "CinéMaison - V2 - CANAL+ favoris (" + aProposer.length + " fiche(s) plus dans tes favoris)",
      htmlBody: construireHtmlCanalFavorisV1_(aProposer, introuvables, indetermines, testees, dejaGardees),
    });
  }

  journal_(
    "CANAL_FAVORIS", "MAIL", destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    "Testées=" + testees + " | A proposer=" + aProposer.length + " | Déjà gardées=" + dejaGardees +
    " | 404=" + introuvables.length + " | Illisibles=" + indetermines.length +
    (aProposer.length > 0 ? " | " + aProposer.map(function (f) { return f.id; }).join(",") : "")
  );

  return reponseJsonWebhook_({ ok: true, mailEnvoye: !!destinataires, aProposer: aProposer.length });
}
