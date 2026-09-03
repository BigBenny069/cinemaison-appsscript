/**
 * ============================================================
 * CinéMaison V4
 * Script : 07_MAILS.gs
 * Rôle   : Notifications email
 * Version: 4.1.4
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs
 * ============================================================
 *
 * Correctif V4.1.4 :
 * - tous les sujets de mail indiquent désormais "CinéMaison - V2 - ..."
 *   au lieu de "CinéMaison - ..." ;
 * - objectif : distinguer sans ambiguïté les mails de la V2 de ceux
 *   de l'ancienne V1 (AppSheet), qui utilise un canal séparé ;
 * - aucun changement de logique, uniquement les lignes de sujet.
 */


function envoyerMailErreurScript_(err, fonction) {
  try {
    const sujet = "CinéMaison - V2 - Erreur script : " + (fonction || "fonction inconnue");


    const corps =
      "Erreur dans : " + (fonction || "fonction inconnue") + "\n\n" +
      String(err) + "\n\n" +
      (err && err.stack ? err.stack : "");


    erreur_("MAILS", fonction || "", String(err), err && err.stack ? err.stack : "");


    MailApp.sendEmail({
      to: emailRapport_(),
      subject: sujet,
      body: corps
    });


  } catch (e) {
    Logger.log("Erreur lors de l'envoi du mail d'erreur : " + e);
  }
}


function envoyerMailRapport_(sujet, corps) {
  try {
    MailApp.sendEmail({
      to: emailRapport_(),
      subject: sujet,
      body: corps
    });


    journal_("MAILS", "RAPPORT", "OK", sujet);
    resoudreErreur_("MAILS", "RAPPORT");


    return true;


  } catch (e) {
    erreur_("MAILS", "RAPPORT", String(e), e && e.stack ? e.stack : "");
    return false;
  }
}


function envoyerMailModificationsDisponibilite_(modifications, source) {
  if (!modifications || modifications.length === 0) return;


  let corps = "CinéMaison - Modifications de disponibilités\n\n";
  corps += "Source : " + (source || "inconnue") + "\n";
  corps += "Nombre de modifications : " + modifications.length + "\n\n";


  modifications.forEach(function(m) {
    corps += "• " + (m.titre || "Titre inconnu") + "\n";
    corps += "  Ancienne date : " + normaliserDate_(m.ancienneDate || "") + "\n";
    corps += "  Nouvelle date : " + (m.nouvelleDate || "vide") + "\n";
    corps += "  Ancien statut : " + (m.ancienStatut || "vide") + "\n";
    corps += "  Nouveau statut : " + (m.nouveauStatut || "vide") + "\n\n";
  });


  envoyerMailRapport_(
    "CinéMaison - V2 - Dates modifiées (" + (source || "source inconnue") + ")",
    corps
  );
}


/**
 * Envoie uniquement les lignes explicitement marquees ACTIVE.
 *
 * Important :
 * - aucune resolution n'est deduite de l'anciennete ;
 * - aucune ecriture n'est effectuee dans ERREURS ;
 * - une seule ligne, la plus recente, est gardee par CleErreur ;
 * - les statuts HISTORIQUE / RESOLUE / RESOLUE_AUTO sont exclus.
 */
function envoyerMailSyntheseErreurs_() {
  const sheet = getSheet_(SHEETS.ERREURS);
  if (!sheet) return;


  const suivi = initialiserSuiviErreursV41_(sheet);
  const data = sheet.getDataRange().getValues();


  if (data.length <= 1) {
    journal_(
      "MAILS",
      "SYNTHESE_ERREURS",
      "AUCUNE_ERREUR_ACTIVE",
      "Feuille ERREURS sans donnee"
    );
    return;
  }


  const selection = selectionnerErreursActivesV412_(data, suivi.h);
  const actives = selection.actives;
  const limite = Math.max(1, getRegleNumber("ErreursMaxSynthese", 20));


  if (selection.sansCle > 0) {
    Logger.log(
      "AVERTISSEMENT MAILS V4.1.2 | " +
      selection.sansCle +
      " ligne(s) ACTIVE sans CleErreur, conservee(s) individuellement."
    );
  }


  if (selection.doublonsExclus > 0) {
    Logger.log(
      "MAILS V4.1.2 | " +
      selection.doublonsExclus +
      " doublon(s) ACTIVE exclu(s) de la synthese."
    );
  }


  if (actives.length === 0) {
    journal_(
      "MAILS",
      "SYNTHESE_ERREURS",
      "AUCUNE_ERREUR_ACTIVE",
      "Aucun mail envoye"
    );
    return;
  }


  const lignes = actives.slice(0, limite);
  let corps = "CinéMaison - Erreurs encore actives\n\n";
  corps +=
    "Cette synthese contient uniquement les erreurs marquees ACTIVE " +
    "au moment de l'envoi.\n";
  corps += "Erreurs actives uniques : " + actives.length + "\n\n";


  lignes.forEach(function(item) {
    const r = item.row;
    corps += "• " + formatDateErreurV412_(
      r[suivi.h.DerniereOccurrence] || r[suivi.h.Date]
    ) + " | " + r[suivi.h.Module] + " | " + r[suivi.h.Action] + "\n";
    corps += "  " + r[suivi.h.Message] + "\n";
    corps += "  Occurrences : " + Number(r[suivi.h.Occurrences] || 1) + "\n";
    if (r[suivi.h.Details]) corps += "  " + r[suivi.h.Details] + "\n";
    corps += "\n";
  });


  if (actives.length > lignes.length) {
    corps +=
      (actives.length - lignes.length) +
      " autre(s) erreur(s) active(s) non affichee(s).\n";
  }


  envoyerMailRapport_(
    "CinéMaison - V2 - " + actives.length + " erreur(s) active(s)",
    corps
  );
}


/**
 * Fonction pure : filtre, deduplique et trie les erreurs ACTIVE.
 * Elle ne lit ni n'ecrit dans le classeur et n'envoie aucun mail.
 */
function selectionnerErreursActivesV412_(data, h) {
  const parCle = {};
  const sansCle = [];
  let lignesActives = 0;


  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const statut = String(row[h.Statut] || "").trim().toUpperCase();
    if (statut !== "ACTIVE") continue;


    lignesActives++;


    const item = {
      row: row,
      ligne: i + 1,
      date: dateErreurV412_(
        row[h.DerniereOccurrence] || row[h.Date]
      )
    };
    const cle = String(row[h.CleErreur] || "").trim();


    if (!cle) {
      sansCle.push(item);
      continue;
    }


    const precedente = parCle[cle];
    if (
      !precedente ||
      dateTriErreurV412_(item.date) >= dateTriErreurV412_(precedente.date)
    ) {
      parCle[cle] = item;
    }
  }


  const actives = Object.keys(parCle).map(function(cle) {
    return parCle[cle];
  }).concat(sansCle);


  actives.sort(function(a, b) {
    return dateTriErreurV412_(b.date) - dateTriErreurV412_(a.date);
  });


  return {
    actives: actives,
    lignesActives: lignesActives,
    sansCle: sansCle.length,
    doublonsExclus: Math.max(0, lignesActives - actives.length)
  };
}


function dateTriErreurV412_(date) {
  return date ? date.getTime() : 0;
}


function dateErreurV412_(valeur) {
  if (valeur instanceof Date && !isNaN(valeur.getTime())) return valeur;
  if (!valeur) return null;


  const date = new Date(valeur);
  return isNaN(date.getTime()) ? null : date;
}


function formatDateErreurV412_(valeur) {
  const date = dateErreurV412_(valeur);
  if (!date) return "Date invalide";


  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm"
  );
}


/**
 * Test sans service Apps Script :
 * aucun mail, aucune ecriture, aucun appel API.
 */
function testerFiltrageMailErreursV412() {
  const h = {
    Date: 0,
    Module: 1,
    Action: 2,
    Message: 3,
    Details: 4,
    CleErreur: 5,
    Statut: 6,
    PremiereOccurrence: 7,
    DerniereOccurrence: 8,
    Occurrences: 9,
    DateResolution: 10
  };


  const ancienne = new Date(2026, 0, 1, 8, 0, 0);
  const recente = new Date(2026, 0, 2, 8, 0, 0);
  const data = [
    Object.keys(h),
    [ancienne, "TMDB", "TEST", "Erreur A", "", "cle-a", "ACTIVE", ancienne, ancienne, 1, ""],
    [recente, "TMDB", "TEST", "Erreur A", "", "cle-a", "ACTIVE", ancienne, recente, 2, ""],
    [recente, "CANAL", "TEST", "Erreur B", "", "cle-b", "RESOLUE", recente, recente, 1, recente],
    [recente, "PRIME", "TEST", "Erreur C", "", "cle-c", "HISTORIQUE", recente, recente, 1, ""],
    [ancienne, "DISNEY", "TEST", "Erreur D", "", "cle-d", "ACTIVE", ancienne, ancienne, 1, ""]
  ];


  const resultat = selectionnerErreursActivesV412_(data, h);
  const modules = resultat.actives.map(function(item) {
    return String(item.row[h.Module] || "");
  });
  const ok =
    resultat.lignesActives === 3 &&
    resultat.actives.length === 2 &&
    resultat.doublonsExclus === 1 &&
    modules.indexOf("TMDB") !== -1 &&
    modules.indexOf("DISNEY") !== -1 &&
    modules.indexOf("CANAL") === -1 &&
    modules.indexOf("PRIME") === -1;


  Logger.log("===== TEST FILTRAGE MAIL ERREURS V4.1.2 =====");
  Logger.log(JSON.stringify({
    ok: ok,
    lignesActiveSimulees: resultat.lignesActives,
    erreursActivesUniquesRetenues: resultat.actives.length,
    doublonsActifsExclus: resultat.doublonsExclus,
    statutsNonActifsExclus: 2,
    ancienneErreurToujoursActiveConservee: modules.indexOf("DISNEY") !== -1,
    resolutionAutomatiqueParAnciennete: false,
    aucuneEcritureErreurs: true,
    aucunMailEnvoye: true,
    aucunAppelApi: true
  }, null, 2));
  Logger.log("===== FIN TEST FILTRAGE MAIL ERREURS =====");


  if (!ok) {
    throw new Error("Echec du test de filtrage V4.1.2.");
  }
}


function envoyerMailSyntheseJournal_() {
  const sheet = getSheet_(SHEETS.JOURNAL);
  if (!sheet) return;


  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;


  const lignes = data.slice(Math.max(1, data.length - 30));


  let corps = "CinéMaison - Synthèse du journal\n\n";


  lignes.forEach(function(r) {
    corps +=
      "• " + formatDateFr_(r[0]) + " | " + r[1] + " | " +
      r[2] + " | " + r[3] + "\n";
    if (r[4]) corps += "  " + r[4] + "\n";
    corps += "\n";
  });


  envoyerMailRapport_("CinéMaison - V2 - Synthèse journal", corps);
}


function testMailV4() {
  envoyerMailRapport_(
    "CinéMaison - V2 - Test mail V4",
    "Test réussi : 07_MAILS.gs V4 est opérationnel."
  );
}
function envoyerMailSyntheseErreurs() {
  return envoyerMailSyntheseErreurs_();
}
